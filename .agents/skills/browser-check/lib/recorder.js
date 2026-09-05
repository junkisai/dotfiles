/**
 * browser-check の収録ヘルパ。
 *
 * 観測スクリプトから使う。やることは3つだけ。
 *   1. ブラウザを用意する（local は新規起動、attach は起動済み Chrome に繋ぐ）
 *   2. mark() で「ここが見せどころ」に印を付ける
 *   3. finish() で録画を止め、beats.json を書く
 *
 * beats.json が収録と編集をつなぐ唯一の契約。編集側（Remotion）はこれだけを読む。
 */
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// このファイルはスキル側に置かれ、playwright は観測スクリプト側にある。
// 自分の位置ではなく呼び出し元から解決する。
const loadChromium = () => {
  try {
    return require(require.resolve("playwright", { paths: [process.cwd(), __dirname] })).chromium;
  } catch {
    throw new Error(
      "playwright が見つかりません。観測スクリプトを置くディレクトリで `npm i playwright` してください"
    );
  }
};

const FPS = 30;

// screencapture はコマンド起動から実際の録画開始まで一定の遅れがある。
// 実測 571ms / 574ms と安定していて累積しないので、固定値で差し引く。
const SCREENCAPTURE_START_LAG_MS = 570;

const nowMs = () => Date.now();

/**
 * @param {object} opts
 * @param {"local"|"attach"} opts.mode
 * @param {string} opts.outDir            出力先ディレクトリ
 * @param {object} [opts.viewport]        local のみ。既定 1440x810
 * @param {string} [opts.cdpUrl]          attach のみ。既定 http://localhost:9222
 * @param {string[]} [opts.mask]          実データを隠すセレクタ。静止画は確実に、動画は矩形で
 * @param {function} [opts.setup]         context に対する前処理（認証の差し替えなど）
 */
const createRecorder = async (opts) => {
  const mode = opts.mode ?? "local";
  const outDir = opts.outDir;
  const maskSelectors = opts.mask ?? [];
  fs.mkdirSync(outDir, { recursive: true });

  const chromium = loadChromium();
  const state = { beats: [], t0: null, rec: null, browser: null, context: null, page: null, size: null };

  if (mode === "local") {
    const viewport = opts.viewport ?? { width: 1440, height: 810 };
    state.size = viewport;
    state.browser = await chromium.launch({ headless: false, slowMo: opts.slowMo ?? 80 });
    state.context = await state.browser.newContext({
      viewport,
      locale: opts.locale ?? "ja-JP",
      ignoreHTTPSErrors: true,
      recordVideo: { dir: path.join(outDir, "raw"), size: viewport },
    });
    if (opts.setup) await opts.setup(state.context);
    state.page = await state.context.newPage();
    // 録画は context 生成時から始まっている。ページを開いた時点を基準にする
    state.t0 = nowMs();
  } else {
    // attach: 起動済み Chrome のログイン済みセッションをそのまま使う。
    // この context では recordVideo が効かないので、画面側を screencapture で録る。
    state.browser = await chromium.connectOverCDP(opts.cdpUrl ?? "http://localhost:9222");
    state.context = state.browser.contexts()[0];
    if (!state.context) throw new Error("既存 context が見つかりません。Chrome にタブが1つ以上開いているか確認してください");
    if (opts.setup) await opts.setup(state.context);
    state.page = await state.context.newPage();

    const rect = await windowRect(state.page);
    state.size = { width: rect.w, height: rect.h };
    const out = path.join(outDir, "raw.mov");
    state.rec = spawn("screencapture", ["-v", "-x", `-R${rect.x},${rect.y},${rect.w},${rect.h}`, out]);
    state.recPath = out;
    state.recSpawnedAt = nowMs();
    state.t0 = state.recSpawnedAt + SCREENCAPTURE_START_LAG_MS;
    await state.page.waitForTimeout(1200); // 録画が始まるまで少し待つ
  }

  /** 対象ウィンドウの位置とサイズを CDP から取る */
  async function windowRect(page) {
    const session = await page.context().newCDPSession(page);
    const { windowId } = await session.send("Browser.getWindowForTarget");
    const { bounds } = await session.send("Browser.getWindowBounds", { windowId });
    await session.detach();
    return { x: bounds.left, y: bounds.top, w: bounds.width, h: bounds.height };
  }

  /** マスク対象の矩形を解決する。見つからないセレクタは黙って飛ばす */
  const resolveMasks = async () => {
    const rects = [];
    for (const sel of maskSelectors) {
      const loc = state.page.locator(sel);
      const n = await loc.count();
      for (let i = 0; i < n; i += 1) {
        const box = await loc.nth(i).boundingBox().catch(() => null);
        if (box) rects.push({ x: box.x, y: box.y, w: box.width, h: box.height });
      }
    }
    return rects;
  };

  /**
   * 見せどころに印を付ける。ここで静止画も撮る。
   * 停止表示にはこの静止画を使うので、拡大しても劣化しない。
   *
   * @param {string} name
   * @param {object} [o]
   * @param {string} [o.focus] 拡大したい要素のセレクタ。座標は自動で解決する
   * @param {string} [o.label] 動画に出す見出し。省略時は name
   */
  const mark = async (name, o = {}) => {
    const at = nowMs();
    const still = `${name}.png`;
    await state.page.screenshot({
      path: path.join(outDir, still),
      mask: maskSelectors.map((s) => state.page.locator(s)),
      maskColor: "#111111",
    });

    let focus = null;
    if (o.focus) {
      const box = await state.page.locator(o.focus).first().boundingBox().catch(() => null);
      if (box) focus = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
      else console.warn(`  mark(${name}): focus のセレクタが見つかりません: ${o.focus}`);
    }

    const beat = {
      name,
      frame: Math.max(0, Math.round(((at - state.t0) / 1000) * FPS)),
      still,
      focus,
      label: o.label ?? name,
      masks: await resolveMasks(),
    };
    state.beats.push(beat);
    console.log(`  mark ${name}: frame ${beat.frame}${focus ? "" : "（focus なし）"}`);
    return beat;
  };

  /** 録画を止め、mp4 に変換して beats.json を書く */
  const finish = async () => {
    let clip = null;

    if (mode === "local") {
      const video = state.page.video();
      await state.page.close();
      const src = video ? await video.path() : null;
      await state.context.close();
      await state.browser.close();
      if (src) clip = toMp4(src, path.join(outDir, "run.mp4"), state.size);
    } else {
      state.rec.kill("SIGINT");
      await new Promise((r) => state.rec.on("close", r));
      await new Promise((r) => setTimeout(r, 1500));
      // attach では page を閉じない。最後のタブが消えると以後 connectOverCDP が失敗する。
      // browser.close() も呼ばない。実ブラウザごと終了してしまう。
      if (fs.existsSync(state.recPath)) clip = toMp4(state.recPath, path.join(outDir, "run.mp4"), state.size);
    }

    const manifest = {
      clip: clip ? path.basename(clip) : null,
      fps: FPS,
      size: state.size,
      mode,
      beats: state.beats,
    };
    fs.writeFileSync(path.join(outDir, "beats.json"), JSON.stringify(manifest, null, 2));
    console.log(`\nbeats.json: ${path.join(outDir, "beats.json")}`);
    console.log(`clip: ${clip ?? "(録画なし)"}`);
    return manifest;
  };

  return { page: state.page, context: state.context, mark, finish, outDir };
};

/**
 * 素材を 30fps の mp4 に揃える。
 * screencapture は Retina で指定領域の2倍解像度になるので、ここで論理サイズへ戻す。
 */
const toMp4 = (src, dst, size) => {
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-i", src,
    "-r", String(FPS),
    "-vf", `scale=${size.width}:${size.height}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
    dst,
  ]);
  return dst;
};

module.exports = { createRecorder, FPS, SCREENCAPTURE_START_LAG_MS };
