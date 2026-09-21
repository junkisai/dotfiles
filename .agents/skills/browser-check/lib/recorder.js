#!/usr/bin/env node
/**
 * browser-check の収録ヘルパ（Orca 版）。
 *
 * 観測そのものは `orca` CLI で行い、このスクリプトは「録る」「印を付ける」「止める」だけを受け持つ。
 *
 *   node recorder.js start --target browser|ios|android --out DIR [--page ID] [--device ID] [--mask CSS]...
 *   node recorder.js mark  NAME --out DIR [--label TEXT] [--focus CSS | --focus-rect x,y,w,h]
 *   node recorder.js stop  --out DIR
 *   node recorder.js merge --before DIR --after DIR --out DIR
 *
 * beats.json が収録と編集をつなぐ唯一の契約。編集側（Remotion）はこれだけを読む。
 * 状態は DIR/.recorder.json に持つ。start と stop が別のコマンド呼び出しになるため。
 */
"use strict";
const { spawn, spawnSync, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseArgs } = require("util");
const { pathToFileURL } = require("url");

const FPS = 30;

// screencapture はコマンド起動から実際の録画開始まで一定の遅れがある。
// 実測 571ms / 574ms と安定していて累積しないので、固定値で差し引く。
const SCREENCAPTURE_START_LAG_MS = 570;

// スマホの縦長映像は、template が前提にしている横長キャンバスの中央に載せる。
// template の注釈カードは幅 790px 等の固定値で、縦長のまま渡すと収まらない。
const CANVAS = { width: 1440, height: 810 };
const GROUND = "0x12150f"; // template/parts.tsx の GROUND と同じ
const MASK_COLOR = "0x111111";

const CALIBRATE_PAGE = pathToFileURL(path.join(__dirname, "calibrate.html")).href;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const waitExit = async (pid, timeoutMs) => {
  const until = Date.now() + timeoutMs;
  while (alive(pid) && Date.now() < until) await sleep(100);
  return !alive(pid);
};

// ---------------------------------------------------------------- 外部コマンド

/** orca-cli スキルの規則どおりに実行ファイルを決める */
const orcaBin = () =>
  process.env.ORCA_CLI_COMMAND ||
  (process.env.ORCA_DEV_REPO_ROOT ? "orca-dev" : process.platform === "linux" ? "orca-ide" : "orca");

const orca = (args) => {
  const [cmd, ...pre] = orcaBin().split(/\s+/);
  const r = spawnSync(cmd, [...pre, ...args, "--json"], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`${cmd} を実行できません: ${r.error.message}`);
  let j;
  try {
    j = JSON.parse(r.stdout);
  } catch {
    throw new Error(`orca ${args.slice(0, 2).join(" ")} の出力を読めません: ${(r.stderr || r.stdout).slice(0, 300)}`);
  }
  if (!j.ok) throw new Error(`orca ${args.slice(0, 2).join(" ")}: ${j.error?.code} ${j.error?.message}`);
  return j.result;
};

const ffmpeg = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
const probe = (file, entries, section = "stream") =>
  execFileSync(
    "ffprobe",
    ["-v", "error", ...(section === "stream" ? ["-select_streams", "v:0"] : []), "-show_entries", `${section}=${entries}`, "-of", "csv=p=0", file],
    { encoding: "utf8" }
  )
    .trim()
    .split(",");

// ---------------------------------------------------------------- 状態

const stateFile = (out) => path.join(out, ".recorder.json");
const loadState = (out) => {
  try {
    return JSON.parse(fs.readFileSync(stateFile(out), "utf8"));
  } catch {
    throw new Error(`${out} に進行中の収録がありません。先に start を実行してください`);
  }
};
const saveState = (out, st) => fs.writeFileSync(stateFile(out), JSON.stringify(st, null, 2));

// ---------------------------------------------------------------- browser: ペインの位置

/**
 * 画像の中からマゼンタ一色の矩形を探す。見つからなければ null。
 * ffmpeg で生の RGB に落として走査する（画像ライブラリに依存しない）。
 */
const findMarker = (png) => {
  const [w, h] = probe(png, "width,height").map(Number);
  const buf = execFileSync("ffmpeg", ["-v", "error", "-i", png, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], {
    maxBuffer: w * h * 3 + 1024,
  });
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) {
    let i = y * w * 3;
    for (let x = 0; x < w; x += 1, i += 3) {
      if (buf[i] >= 235 && buf[i + 1] <= 25 && buf[i + 2] >= 235) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, imageWidth: w, imageHeight: h };
};

/** Orca のメインウィンドウ（一番大きいもの）。位置は画面座標（pt） */
const orcaWindow = () => {
  const { windows } = orca(["computer", "list-windows", "--app", "Orca"]);
  const shown = windows.filter((w) => !w.isMinimized && !w.isOffscreen && w.width > 0);
  if (!shown.length) throw new Error("Orca のウィンドウが見つかりません。Orca を前面に表示してください");
  return shown.sort((a, b) => b.width * b.height - a.width * a.height)[0];
};

/**
 * browser ペインが画面のどこにあるかを割り出す。
 *
 * ペイン全面をマゼンタにして Orca ウィンドウを撮り、その矩形を探す。同時に
 * 「そのタブが実際に画面に見えているか」の確認にもなる。見えていなければ録れない。
 * 撮った画像には他のワークスペースやサイドバーが映るので、解析したらすぐ消す。
 */
const locatePane = async (page) => {
  orca(["goto", "--page", page, "--url", CALIBRATE_PAGE]);
  orca(["wait", "--page", page, "--selector", "body"]);
  await sleep(600);
  const view = JSON.parse(orca(["eval", "--page", page, "--expression", "JSON.stringify({w:innerWidth,h:innerHeight})"]).result);

  const win = orcaWindow();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "browser-check-"));
  const cal = path.join(dir, "calibrate.png");
  try {
    execFileSync("screencapture", ["-x", `-R${win.x},${win.y},${win.width},${win.height}`, cal]);
    const m = findMarker(cal);
    const notVisible = new Error(
      "Orca の画面に、このタブのブラウザが表示されていません。Orca でこのワークスペースを前面に出し、" +
        "ブラウザのペインが他のウィンドウや UI に隠れていない状態にしてから再実行してください"
    );
    if (!m) throw notVisible;

    const scale = m.imageWidth / win.width; // Retina で 2
    const wPx = m.x1 - m.x0 + 1;
    const hPx = m.y1 - m.y0 + 1;
    const tol = 3 * scale;
    if (Math.abs(wPx - view.w * scale) > tol || Math.abs(hPx - view.h * scale) > tol) {
      throw new Error(
        `マゼンタの矩形が表示サイズと合いません（画面 ${Math.round(wPx / scale)}x${Math.round(hPx / scale)} / ` +
          `ページ ${view.w}x${view.h}）。ペインの一部が隠れているか、ブラウザのズームが 100% ではありません`
      );
    }
    const rect = {
      x: Math.round(win.x + m.x0 / scale),
      y: Math.round(win.y + m.y0 / scale),
      w: even(wPx / scale),
      h: even(hPx / scale),
    };
    return rect;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

// ---------------------------------------------------------------- browser: 要素の矩形

const pageRects = (page, selector) =>
  JSON.parse(
    orca([
      "eval",
      "--page",
      page,
      "--expression",
      `JSON.stringify([...document.querySelectorAll(${JSON.stringify(selector)})].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}).filter(r=>r.w>0&&r.h>0))`,
    ]).result
  ).map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }));

/** 静止画の矩形を塗りつぶす。rects は動画の論理座標、scale は静止画の倍率 */
const paintBoxes = (png, rects, scale) => {
  const chain = rects
    .map((r) => `drawbox=x=${r.x * scale}:y=${r.y * scale}:w=${r.w * scale}:h=${r.h * scale}:color=${MASK_COLOR}:t=fill`)
    .join(",");
  const tmp = `${png}.tmp.png`;
  ffmpeg(["-i", png, "-vf", chain, tmp]);
  fs.renameSync(tmp, png);
};

// ---------------------------------------------------------------- スマホ: 端末と映像の載せ方

const adbBin = () => {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const candidates = [sdk && path.join(sdk, "platform-tools", "adb"), path.join(os.homedir(), "Library/Android/sdk/platform-tools/adb")];
  return candidates.find((p) => p && fs.existsSync(p)) || "adb";
};

const pickIosDevice = (want) => {
  const { devices } = JSON.parse(execFileSync("xcrun", ["simctl", "list", "devices", "booted", "-j"], { encoding: "utf8" }));
  const booted = Object.values(devices).flat();
  if (want) {
    const hit = booted.find((d) => d.udid === want || d.name === want);
    if (!hit) throw new Error(`起動中のシミュレータに ${want} がありません`);
    return hit.udid;
  }
  if (booted.length !== 1) {
    throw new Error(`起動中のシミュレータが ${booted.length} 台あります。--device に UDID を指定してください: ${booted.map((d) => `${d.name}(${d.udid})`).join(", ")}`);
  }
  return booted[0].udid;
};

const pickAndroidDevice = (want) => {
  if (want) return want;
  const lines = execFileSync(adbBin(), ["devices"], { encoding: "utf8" }).split("\n").slice(1);
  const ready = lines.filter((l) => /\tdevice$/.test(l)).map((l) => l.split("\t")[0]);
  if (ready.length !== 1) throw new Error(`adb の端末が ${ready.length} 台あります。--device に serial を指定してください: ${ready.join(", ")}`);
  return ready[0];
};

const deviceShot = (st) =>
  st.target === "ios"
    ? (() => {
        const tmp = path.join(os.tmpdir(), `browser-check-${process.pid}.png`);
        execFileSync("xcrun", ["simctl", "io", st.device, "screenshot", tmp], { stdio: "ignore" });
        const buf = fs.readFileSync(tmp);
        fs.rmSync(tmp, { force: true });
        return buf;
      })()
    : execFileSync(adbBin(), ["-s", st.device, "exec-out", "screencap", "-p"], { maxBuffer: 1 << 28 });

/** 端末の画素サイズから、横長キャンバスへの載せ方を決める */
const layoutFor = (pxW, pxH) => {
  const width = even((pxW * CANVAS.height) / pxH);
  return { width, height: CANVAS.height, offsetX: Math.round((CANVAS.width - width) / 2) };
};
const fitFilter = (l) => `scale=${l.width}:${l.height},pad=${CANVAS.width}:${CANVAS.height}:${l.offsetX}:0:color=${GROUND}`;

// ---------------------------------------------------------------- start

const start = async (o) => {
  const target = o.target;
  if (!["browser", "ios", "android"].includes(target)) throw new Error("--target は browser / ios / android のいずれか");
  if (!o.out) throw new Error("--out が必要です");
  const out = path.resolve(o.out);
  fs.mkdirSync(out, { recursive: true });
  if (fs.existsSync(stateFile(out))) throw new Error(`${out} には進行中の収録があります。stop してから始めてください`);

  const st = { target, beats: [], masks: o.mask ?? [] };
  let child;

  if (target === "browser") {
    st.page = o.page || orca(["tab", "current"]).tab.browserPageId;
    const rect = await locatePane(st.page);
    st.size = { width: rect.w, height: rect.h };
    st.raw = path.join(out, "raw.mov");
    child = spawn("screencapture", ["-v", "-x", `-R${rect.x},${rect.y},${rect.w},${rect.h}`, st.raw], { detached: true, stdio: "ignore" });
    child.unref();
    const spawnedAt = Date.now();
    await sleep(1200); // 録画が始まるまで少し待つ
    if (!alive(child.pid)) throw new Error("screencapture がすぐ終了しました。macOS の画面収録の許可を確認してください");
    st.pid = child.pid;
    st.t0 = spawnedAt + SCREENCAPTURE_START_LAG_MS;
  } else if (target === "ios") {
    st.device = pickIosDevice(o.device);
    const shot = deviceShot(st);
    const tmp = path.join(os.tmpdir(), `browser-check-size-${process.pid}.png`);
    fs.writeFileSync(tmp, shot);
    const [pxW, pxH] = probe(tmp, "width,height").map(Number);
    fs.rmSync(tmp, { force: true });
    st.layout = layoutFor(pxW, pxH);
    st.size = { ...CANVAS };
    st.raw = path.join(out, "raw.mov");
    const log = path.join(out, ".simctl.log");
    // simctl は開始したことを stderr に書く。その時刻を t0 にする
    child = spawn("xcrun", ["simctl", "io", st.device, "recordVideo", "--codec=h264", "--force", st.raw], {
      detached: true,
      stdio: ["ignore", "ignore", fs.openSync(log, "w")],
    });
    child.unref();
    const until = Date.now() + 8000;
    while (!/Recording started/.test(fs.readFileSync(log, "utf8")) && Date.now() < until) await sleep(50);
    if (!/Recording started/.test(fs.readFileSync(log, "utf8"))) {
      process.kill(child.pid, "SIGINT");
      throw new Error("simctl の録画が始まりませんでした: " + fs.readFileSync(log, "utf8").slice(0, 300));
    }
    st.pid = child.pid;
    st.t0 = Date.now();
  } else {
    st.device = pickAndroidDevice(o.device);
    const [pxW, pxH] = probe(writeTemp(deviceShot(st)), "width,height").map(Number);
    st.layout = layoutFor(pxW, pxH);
    st.size = { ...CANVAS };
    st.remote = "/sdcard/browser-check.mp4";
    // screenrecord は 1 本 180 秒まで。長い確認は区切って収録する
    child = spawn(adbBin(), ["-s", st.device, "shell", "screenrecord", "--time-limit", "180", st.remote], { detached: true, stdio: "ignore" });
    child.unref();
    await sleep(800);
    if (!alive(child.pid)) throw new Error("adb screenrecord がすぐ終了しました。端末の接続を確認してください");
    st.pid = child.pid;
    st.t0 = Date.now();
  }

  saveState(out, st);
  console.log(`収録を開始しました (${target}${st.page ? ` / page ${st.page}` : ""}${st.device ? ` / ${st.device}` : ""})  size ${st.size.width}x${st.size.height}`);
};

const writeTemp = (buf) => {
  const tmp = path.join(os.tmpdir(), `browser-check-tmp-${process.pid}.png`);
  fs.writeFileSync(tmp, buf);
  return tmp;
};

// ---------------------------------------------------------------- mark

/**
 * 見せどころに印を付ける。ここで静止画も撮る。
 * 停止表示にはこの静止画を使うので、拡大しても劣化しない。
 */
const mark = async (name, o) => {
  if (!name) throw new Error("mark には名前が必要です");
  const out = path.resolve(o.out);
  const st = loadState(out);
  const at = Date.now();
  const stillName = `${name}.png`;
  const stillPath = path.join(out, stillName);
  let focus = null;
  let masks = [];

  if (st.target === "browser") {
    const shot = orca(["screenshot", "--page", st.page, "--format", "png"]);
    fs.writeFileSync(stillPath, Buffer.from(shot.data, "base64"));
    masks = st.masks.flatMap((sel) => pageRects(st.page, sel));
    if (masks.length) {
      const scale = Number(probe(stillPath, "width")[0]) / st.size.width;
      paintBoxes(stillPath, masks, scale);
    }
    if (o.focus) {
      focus = pageRects(st.page, o.focus)[0] ?? null;
      if (!focus) console.warn(`  focus のセレクタが見つかりません: ${o.focus}`);
    }
  } else {
    const raw = writeTemp(deviceShot(st));
    ffmpeg(["-i", raw, "-vf", fitFilter(st.layout), stillPath]);
    fs.rmSync(raw, { force: true });
    if (o["focus-rect"]) {
      // orca emulator ax の frame（0..1 に正規化、左上原点）をそのまま渡す
      const [nx, ny, nw, nh] = o["focus-rect"].split(",").map(Number);
      if ([nx, ny, nw, nh].some((n) => Number.isNaN(n))) throw new Error("--focus-rect は x,y,w,h（0..1）で指定してください");
      const l = st.layout;
      focus = {
        x: Math.round(l.offsetX + nx * l.width),
        y: Math.round(ny * l.height),
        w: Math.round(nw * l.width),
        h: Math.round(nh * l.height),
      };
    }
  }

  const beat = {
    name,
    frame: Math.max(0, Math.round(((at - st.t0) / 1000) * FPS)),
    still: stillName,
    focus,
    label: o.label ?? name,
    masks,
  };
  st.beats.push(beat);
  saveState(out, st);
  console.log(`mark ${name}: frame ${beat.frame}${focus ? "" : "（focus なし）"}`);
};

// ---------------------------------------------------------------- stop

/** 素材を 30fps の mp4 に揃える。実時間より短ければ最後のフレームを延ばす */
const toMp4 = (src, dst, st, wallSec) => {
  const rawDur = Number(probe(src, "duration", "format")[0]) || 0;
  const pad = `tpad=stop_mode=clone:stop_duration=${Math.max(0, wallSec - rawDur).toFixed(3)}`;
  // screencapture は Retina で 2 倍の解像度になるので、論理サイズへ戻す
  const vf =
    st.target === "browser"
      ? `fps=${FPS},scale=${st.size.width}:${st.size.height},${pad}`
      : `${fitFilter(st.layout)},fps=${FPS},${pad}`;
  ffmpeg(["-i", src, "-vf", vf, "-t", wallSec.toFixed(3), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", dst]);
};

const stop = async (o) => {
  const out = path.resolve(o.out);
  const st = loadState(out);
  const stoppedAt = Date.now();

  if (st.target === "android") {
    spawnSync(adbBin(), ["-s", st.device, "shell", "pkill", "-INT", "screenrecord"]);
  } else if (alive(st.pid)) {
    process.kill(st.pid, "SIGINT");
  }
  if (!(await waitExit(st.pid, 15000))) throw new Error(`録画プロセス ${st.pid} が止まりません`);
  await sleep(st.target === "browser" ? 1500 : 800); // ファイルの書き出し待ち

  if (st.target === "android") {
    st.raw = path.join(out, "raw.mp4");
    execFileSync(adbBin(), ["-s", st.device, "pull", st.remote, st.raw], { stdio: "ignore" });
    spawnSync(adbBin(), ["-s", st.device, "shell", "rm", st.remote]);
  }

  let clip = null;
  if (fs.existsSync(st.raw) && fs.statSync(st.raw).size > 0) {
    clip = path.join(out, "run.mp4");
    toMp4(st.raw, clip, st, (stoppedAt - st.t0) / 1000);
    fs.rmSync(st.raw, { force: true });
  }
  fs.rmSync(path.join(out, ".simctl.log"), { force: true });

  const manifest = { clip: clip && "run.mp4", fps: FPS, size: st.size, mode: st.target, beats: st.beats };
  fs.writeFileSync(path.join(out, "beats.json"), JSON.stringify(manifest, null, 2));
  fs.rmSync(stateFile(out), { force: true });
  console.log(`beats.json: ${path.join(out, "beats.json")}`);
  console.log(`clip: ${clip ?? "(録画なし)"}`);
};

// ---------------------------------------------------------------- merge

/** 修正前後の2つの収録を、前半 before・後半 after の1本にまとめる */
const merge = (o) => {
  if (!o.before || !o.after || !o.out) throw new Error("--before / --after / --out が必要です");
  const [b, a] = [o.before, o.after].map((d) => JSON.parse(fs.readFileSync(path.join(path.resolve(d), "beats.json"), "utf8")));
  if (b.size.width !== a.size.width || b.size.height !== a.size.height || b.mode !== a.mode) {
    throw new Error("before と after で対象・サイズが違います。同じ条件で撮り直してください");
  }
  if (!b.clip || !a.clip) throw new Error("動画のない収録は merge できません");
  const out = path.resolve(o.out);
  fs.mkdirSync(out, { recursive: true });

  const clipPath = (d, m) => path.join(path.resolve(d), m.clip);
  const beforeFrames = Math.round(Number(probe(clipPath(o.before, b), "duration", "format")[0]) * FPS);
  ffmpeg([
    "-i", clipPath(o.before, b), "-i", clipPath(o.after, a),
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]",
    "-r", String(FPS), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", path.join(out, "run.mp4"),
  ]);

  const beats = [];
  for (const [tag, dir, m, shift] of [["before", o.before, b, 0], ["after", o.after, a, beforeFrames]]) {
    for (const beat of m.beats) {
      const still = `${tag}-${beat.still}`;
      fs.copyFileSync(path.join(path.resolve(dir), beat.still), path.join(out, still));
      beats.push({ ...beat, name: `${tag}-${beat.name}`, frame: beat.frame + shift, still });
    }
  }
  fs.writeFileSync(path.join(out, "beats.json"), JSON.stringify({ clip: "run.mp4", fps: FPS, size: b.size, mode: `${b.mode}-compare`, beats }, null, 2));
  console.log(`merged: ${path.join(out, "beats.json")}（after の beat は +${beforeFrames} フレーム）`);
};

// ---------------------------------------------------------------- main

const main = async () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      target: { type: "string" },
      out: { type: "string" },
      page: { type: "string" },
      device: { type: "string" },
      mask: { type: "string", multiple: true },
      label: { type: "string" },
      focus: { type: "string" },
      "focus-rect": { type: "string" },
      before: { type: "string" },
      after: { type: "string" },
    },
  });
  const [cmd, name] = positionals;
  if (cmd === "start") return start(values);
  if (cmd === "mark") return mark(name, values);
  if (cmd === "stop") return stop(values);
  if (cmd === "merge") return merge(values);
  throw new Error("使い方: recorder.js start|mark|stop|merge（詳細は references/recording.md）");
};

if (require.main === module) {
  main().catch((e) => {
    console.error(`recorder: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { findMarker, layoutFor, FPS, SCREENCAPTURE_START_LAG_MS, CANVAS };
