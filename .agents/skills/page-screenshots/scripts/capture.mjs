#!/usr/bin/env node
/**
 * page-screenshots の撮影スクリプト。npm の依存はなく、Node 標準の fetch / WebSocket で Chrome を操作する。
 *
 *   node capture.mjs <URL> [--name lp] [--out DIR] [--viewports 390x844@3,1440x900@2]
 *                    [--sections "#a,#b"] [--keep-fixed] [--wait MS] [--max-seconds N] [--dry-run]
 *
 * ページをセクションの切れ目で区切り、撮れる高さの上限までつなげて PNG に保存する。
 * 標準出力には結果の JSON だけを出す。途中経過は標準エラーに出す。
 *
 * Chrome は大きすぎる撮影でエラーを返さず止まる。止まる大きさは決まっておらず、中身にも左右される
 * （スマホ 3 倍の 1170×7026 は、写真の多いページの先頭では止まり、文字の多いところでは撮れる）。
 * 起動オプションや撮り方を変えても解消しないので、高さの上限を決め打ちせず、
 * 前のセクションから順につなげて撮り、止まったらその手前までを 1 枚にする。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const CHROME_PATH = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_VIEWPORTS = "390x844@3,1440x900@2";
const DEFAULT_SCALE = 2;
const DEFAULT_WAIT_MS = 4000;
const DEFAULT_MAX_SECONDS = 600;
// 撮れるときは大きな画像でも数秒で返る
const CAPTURE_TIMEOUT_MS = 20_000;
// Chrome が扱えるテクスチャの上限。これを超える高さは試すまでもなく止まる
const MAX_DEVICE_HEIGHT = 16384;
const COMMAND_TIMEOUT_MS = 15_000;
const LOAD_TIMEOUT_MS = 30_000;
const PREPARE_TIMEOUT_MS = 90_000;

const USAGE = `usage: node capture.mjs <URL> [--name NAME] [--out DIR] [--viewports WxH[@倍率],...]
                        [--sections "CSS セレクタ"] [--keep-fixed] [--wait MS] [--max-seconds N] [--dry-run]

  --name         保存先のフォルダ名に使う（既定: URL から作る）
  --out          保存先のフォルダを作る場所（既定: ~/Downloads/page-screenshots）
  --viewports    画面サイズと倍率。@ を省略すると ${DEFAULT_SCALE} 倍（既定: ${DEFAULT_VIEWPORTS}）
  --sections     自動検出の代わりに、切れ目にする要素を CSS セレクタで指定する
  --keep-fixed   画面に固定された要素を隠さない
  --wait         読み込みのあとに待つミリ秒。時間で消えるオープニングのため（既定: ${DEFAULT_WAIT_MS}）
  --max-seconds  全体の時間の上限（既定: ${DEFAULT_MAX_SECONDS}）
  --dry-run      Chrome を起動せず、解決した設定だけを出す`;

/** Chrome が応答を返さなくなった。起動し直して上限を下げれば続けられる */
class HangError extends Error {}
/** やり直しても変わらない失敗 */
class FatalError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message) => process.stderr.write(`${message}\n`);

// ---------------------------------------------------------------------------
// 結果の JSON は 1 回だけ出す。シグナルや全体の時間切れでも、ここまでの結果を残す
// ---------------------------------------------------------------------------

const report = { ok: false, url: null, outDir: null, viewports: [], warnings: [], error: null, elapsedSeconds: 0 };
const startedAt = Date.now();
let reported = false;

function emitReport(ok, error = null) {
  if (reported) return;
  reported = true;
  report.ok = ok;
  report.error = error;
  report.elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Chrome の起動と後片付け
// ---------------------------------------------------------------------------

const liveBrowsers = new Set();

// このスクリプト自身が強制終了されても残らないよう、親が消えたら片付ける見張りを別プロセスで置く
const WATCHDOG = `
while kill -0 "$1" 2>/dev/null; do sleep 1; done
kill -9 -"$2" 2>/dev/null
sleep 1
rm -rf "$3"
`;

class Browser {
  static async launch() {
    const profile = mkdtempSync(join(tmpdir(), "page-screenshots-"));
    const chrome = spawn(
      CHROME_PATH,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "about:blank",
      ],
      // 別のプロセスグループにして、ヘルパーごとまとめて止められるようにする
      { detached: true, stdio: "ignore" },
    );
    const browser = new Browser(chrome, profile);
    liveBrowsers.add(browser);
    const watchdog = spawn("/bin/sh", ["-c", WATCHDOG, "page-screenshots-watchdog", String(process.pid), String(chrome.pid), profile], {
      detached: true,
      stdio: "ignore",
    });
    watchdog.unref();
    browser.watchdog = watchdog;
    try {
      browser.page = await browser.#connect();
    } catch (error) {
      await browser.close();
      throw error;
    }
    return browser;
  }

  constructor(chrome, profile) {
    this.chrome = chrome;
    this.profile = profile;
    this.exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.once("error", () => {});
  }

  async #connect() {
    const portFile = join(this.profile, "DevToolsActivePort");
    const deadline = Date.now() + 20_000;
    while (!existsSync(portFile) || readFileSync(portFile, "utf8").split("\n").length < 2) {
      if (Date.now() > deadline) throw new FatalError("Chrome のデバッグポートが開かなかった");
      if (this.chrome.exitCode !== null) throw new FatalError(`Chrome が起動直後に終了した（終了コード ${this.chrome.exitCode}）`);
      await sleep(100);
    }
    const [port] = readFileSync(portFile, "utf8").split("\n");
    const targets = await (await fetch(`http://127.0.0.1:${port.trim()}/json/list`)).json();
    const target = targets.find((item) => item.type === "page");
    if (!target) throw new FatalError("Chrome のページが見つからなかった");
    return Cdp.connect(target.webSocketDebuggerUrl);
  }

  #signal(signal) {
    try {
      process.kill(-this.chrome.pid, signal);
    } catch {
      // すでに終了している
    }
  }

  /** 通常の後片付け */
  async close() {
    liveBrowsers.delete(this);
    this.page?.close();
    this.#signal("SIGTERM");
    await Promise.race([this.exited, sleep(2000)]);
    this.#signal("SIGKILL");
    await Promise.race([this.exited, sleep(1000)]);
    rmSync(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    try {
      process.kill(this.watchdog.pid, "SIGKILL");
    } catch {
      // すでに終了している
    }
  }

  /** シグナルの中など、待てないときの後片付け。残っても見張りが消す */
  killNow() {
    liveBrowsers.delete(this);
    this.#signal("SIGKILL");
    try {
      rmSync(this.profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
    } catch {
      // 見張りに任せる
    }
  }
}

class Cdp {
  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.onopen = () => resolve(new Cdp(socket));
      socket.onerror = () => reject(new FatalError("Chrome に接続できなかった"));
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Set();
    socket.onmessage = (event) => this.#onMessage(event.data);
    socket.onclose = () => {
      for (const { reject } of this.pending.values()) reject(new HangError("Chrome との接続が切れた"));
      this.pending.clear();
    };
    socket.onerror = () => {};
  }

  #onMessage(data) {
    const message = JSON.parse(data);
    if (message.id === undefined) {
      for (const listener of this.listeners) listener(message);
      return;
    }
    const entry = this.pending.get(message.id);
    if (!entry) return;
    this.pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new FatalError(`${entry.method}: ${message.error.message}`));
    else entry.resolve(message.result);
  }

  send(method, params = {}, timeoutMs = COMMAND_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HangError(`${method} が ${timeoutMs / 1000} 秒で返らなかった`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** イベントを 1 回待つ。来なくても失敗にはしない */
  waitFor(method, timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        resolve(false);
      }, timeoutMs);
      const listener = (message) => {
        if (message.method !== method) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve(true);
      };
      this.listeners.add(listener);
    });
  }

  async evaluate(fn, arg, timeoutMs) {
    const result = await this.send(
      "Runtime.evaluate",
      { expression: `(${fn})(${JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true },
      timeoutMs,
    );
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new FatalError(`ページの中の処理に失敗した: ${detail}`);
    }
    return result.result.value;
  }

  close() {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    try {
      this.socket.close();
    } catch {
      // すでに閉じている
    }
  }
}

// ---------------------------------------------------------------------------
// ページの中で動かす処理。Function.prototype.toString で渡すので、外の変数を参照しない
// ---------------------------------------------------------------------------

/** 遅延読み込みを済ませ、固定された要素を隠して、ページの先頭に戻す */
async function preparePage({ keepFixed }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const hidden = [];
  const hideFixed = () => {
    if (keepFixed) return;
    for (const el of document.querySelectorAll("body *")) {
      if (getComputedStyle(el).position !== "fixed") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      hidden.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      el.style.setProperty("display", "none", "important");
    }
  };

  hideFixed();
  for (const el of document.querySelectorAll('img[loading="lazy"], iframe[loading="lazy"]')) el.loading = "eager";

  // 無限スクロールのページで終わらなくならないよう、回数に上限を持つ
  let steps = 0;
  for (let y = 0; y < document.documentElement.scrollHeight && steps < 300; y += innerHeight, steps++) {
    window.scrollTo({ top: y, behavior: "instant" });
    await sleep(100);
  }
  window.scrollTo({ top: 0, behavior: "instant" });

  await Promise.all(
    [...document.images].map((image) => Promise.race([image.decode().catch(() => null), sleep(4000)])),
  );
  await Promise.race([document.fonts.ready, sleep(5000)]);
  // スクロールで現れた固定要素も隠す
  hideFixed();
  await sleep(600);

  return {
    hidden,
    scrollCapped: steps >= 300,
    brokenImages: [...document.images].filter((image) => image.currentSrc && image.complete && image.naturalWidth === 0).length,
    overflowX: document.documentElement.scrollWidth - innerWidth,
    finalUrl: location.href,
  };
}

/** セクションの切れ目を求める。ページ全体を隙間なく覆う区間の並びを返す */
function detectSections({ selectors }) {
  const SEMANTIC = new Set(["SECTION", "HEADER", "FOOTER", "ARTICLE", "ASIDE", "NAV"]);
  const SEMANTIC_SELECTOR = "section, header, footer, article, aside, nav";
  // これより低い要素は、飾りや小さな部品として切れ目にしない
  const MIN_BLOCK = innerHeight * 0.25;
  const total = document.documentElement.scrollHeight;
  const warnings = [];

  const box = (el) => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top + scrollY, bottom: rect.bottom + scrollY, height: rect.height, width: rect.width };
  };
  const inFlowChildren = (el) =>
    [...el.children].flatMap((child) => {
      const style = getComputedStyle(child);
      if (style.display === "contents") return inFlowChildren(child);
      if (style.display === "none" || style.position === "absolute" || style.position === "fixed") return [];
      const { height, width } = box(child);
      return height > 0 && width > 0 ? [child] : [];
    });
  const isSemantic = (el) => SEMANTIC.has(el.tagName);
  const containsSemantic = (el) => {
    for (const inner of el.querySelectorAll(SEMANTIC_SELECTOR)) if (box(inner).height > 0) return true;
    return false;
  };
  // 横に並ぶ段組みは縦の切れ目にならない。少しの重なりは負のマージンとして許す
  const isStacked = (list) => {
    const sorted = [...list].sort((a, b) => box(a).top - box(b).top);
    return sorted.every((el, index) => {
      if (index === 0) return true;
      const previous = box(sorted[index - 1]);
      const current = box(el);
      return current.top >= previous.bottom - Math.min(previous.height, current.height) * 0.25;
    });
  };

  const expand = (el, depth = 0) => {
    if (depth > 16) return [el];
    const children = inFlowChildren(el);
    const big = children.filter((child) => box(child).height >= MIN_BLOCK);
    if (isSemantic(el)) {
      // セクションの中にセクションが積まれたラッパーだけ、中を見る
      const innerSemantic = big.filter(isSemantic);
      if (innerSemantic.length < 2 || !isStacked(big)) return [el];
    }
    const relevant = children.filter((child) => isSemantic(child) || big.includes(child) || containsSemantic(child));
    if (relevant.length === 0) return [el];
    if (relevant.length === 1) return expand(relevant[0], depth + 1);
    if (!isStacked(big)) return [el];
    return relevant.flatMap((child) => (isSemantic(child) || containsSemantic(child) || big.includes(child) ? expand(child, depth + 1) : []));
  };

  let blocks;
  if (selectors) {
    blocks = [...document.querySelectorAll(selectors)].filter((el) => box(el).height > 0);
    if (blocks.length === 0) warnings.push(`--sections に一致する要素がなかった: ${selectors}`);
  } else {
    blocks = expand(document.body);
    // body だけが返った、または意味のある区切りが 1 つもない
    if (blocks.length <= 1 && !blocks.some(isSemantic)) blocks = [];
  }
  blocks = [...new Set(blocks)].sort((a, b) => box(a).top - box(b).top);
  const found = blocks.length > 0;

  const slug = (text) =>
    (text ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+/, "")
      .slice(0, 24)
      .replace(/-+$/, "");
  const used = new Set();
  const nameOf = (el, index) => {
    const tag = el.tagName === "HEADER" || el.tagName === "FOOTER" ? el.tagName.toLowerCase() : "";
    const base = slug(el.id) || slug(el.querySelector("h1, h2, h3")?.textContent) || tag || `section-${index + 1}`;
    let name = base;
    for (let suffix = 2; used.has(name); suffix++) name = `${base}-${suffix}`;
    used.add(name);
    return name;
  };

  if (!found) return { found, total, warnings, sections: [{ name: "page", start: 0, end: total }] };

  const starts = blocks.map((el, index) => (index === 0 ? 0 : box(el).top));

  // 切れ目にまたがる要素があれば、その下端まで切れ目をずらす。overflow で切り取られて見えない部分は数えない
  const visibleRect = (el) => {
    let { top, bottom } = box(el);
    for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowY;
      if (overflow === "visible") continue;
      const clip = box(parent);
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
    return { top, bottom };
  };
  const everyone = [...document.querySelectorAll("body *")].map((el) => ({ el, ...box(el) }));
  for (let index = 1; index < starts.length; index++) {
    const upper = blocks[index - 1];
    const lower = blocks[index];
    for (let round = 0; round < 3; round++) {
      const y = starts[index];
      let lowest = y;
      for (const item of everyone) {
        if (item.top >= y - 1 || item.bottom <= y + 1 || item.height > innerHeight) continue;
        if (item.el.contains(upper) || item.el.contains(lower)) continue;
        const style = getComputedStyle(item.el);
        if (style.visibility === "hidden" || style.opacity === "0" || style.display === "none") continue;
        const visible = visibleRect(item.el);
        if (visible.top >= y - 1 || visible.bottom <= y + 1) continue;
        lowest = Math.max(lowest, visible.bottom);
      }
      if (lowest === y) break;
      const limit = index + 1 < starts.length ? starts[index + 1] : total;
      if (lowest >= limit - 1) {
        warnings.push(`y=${Math.round(y)} の切れ目にまたがる要素を避けられなかった`);
        break;
      }
      starts[index] = Math.ceil(lowest);
    }
  }

  const sections = starts.map((start, index) => ({
    name: nameOf(blocks[index], index),
    start: Math.round(start),
    end: Math.round(index + 1 < starts.length ? starts[index + 1] : total),
  }));
  return { found, total, warnings, sections };
}

// ---------------------------------------------------------------------------
// 撮影。前のセクションから順に、止まるまでつなげる
// ---------------------------------------------------------------------------

/**
 * 1 つの画面サイズの撮影。撮影で止まったら Chrome を起動し直して続ける。
 * 区間を伸ばしながら撮るので、1 枚につき止まるのは多くても 1 回で済む。
 */
class ViewportCapture {
  constructor(viewport, options, softDeadline, saveImage) {
    this.viewport = viewport;
    this.options = options;
    this.softDeadline = softDeadline;
    this.saveImage = saveImage;
    this.browser = null;
    this.attempts = [];
    this.warnings = [];
    this.hidden = [];
    this.hungRanges = [];
    this.incomplete = false;
    this.pageHeight = null;
  }

  async open() {
    this.browser = await Browser.launch();
    const page = this.browser.page;
    const { width, height, scale } = this.viewport;
    await page.send("Page.enable");
    await page.send("Network.enable");
    // スクロールで進む動きを、動かないときの最後の形で撮る
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });

    let status = null;
    const onResponse = (message) => {
      if (message.method === "Network.responseReceived" && message.params.type === "Document" && status === null) {
        status = message.params.response.status;
      }
    };
    page.listeners.add(onResponse);
    const loaded = page.waitFor("Page.loadEventFired", LOAD_TIMEOUT_MS);
    const navigation = await page.send("Page.navigate", { url: this.options.url }, LOAD_TIMEOUT_MS);
    if (navigation.errorText) throw new FatalError(`${this.options.url} を開けなかった: ${navigation.errorText}`);
    const didLoad = await loaded;
    page.listeners.delete(onResponse);
    if (!didLoad) this.#warn(`読み込みの完了を ${LOAD_TIMEOUT_MS / 1000} 秒待っても確認できなかった`);
    if (status !== null && status >= 400) this.#warn(`HTTP ${status} のページを撮った`);

    await sleep(this.options.wait);
    let prepared;
    try {
      prepared = await page.evaluate(preparePage, { keepFixed: this.options.keepFixed }, PREPARE_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof HangError) throw new FatalError(`ページの準備が終わらなかった: ${error.message}`);
      throw error;
    }
    if (this.hidden.length === 0) this.hidden = prepared.hidden;
    if (prepared.scrollCapped) this.#warn("ページが長すぎて最後までスクロールしなかった。遅延読み込みが残っている可能性がある");
    if (prepared.brokenImages > 0) this.#warn(`読み込めなかった画像が ${prepared.brokenImages} 枚ある`);
    if (prepared.overflowX > 0) this.#warn(`横に ${prepared.overflowX}px はみ出している。はみ出した部分は写らない`);
    const requested = new URL(this.options.url);
    const final = new URL(prepared.finalUrl);
    if (requested.origin !== final.origin || requested.pathname !== final.pathname) {
      this.#warn(`別の URL に移動した: ${prepared.finalUrl}。ログイン画面の可能性がある`);
    }
  }

  async close() {
    await this.browser?.close();
    this.browser = null;
  }

  #warn(message) {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  #deviceSize(range) {
    const { width, scale } = this.viewport;
    return { width: Math.round(width * scale), height: Math.round((range.end - range.start) * scale) };
  }

  #record(range, sections, result) {
    const { width, height } = this.#deviceSize(range);
    this.attempts.push({ devicePx: `${width}x${height}`, cssY: [range.start, range.end], sections, result });
  }

  /** 止まった区間を丸ごと含む区間は、撮らなくても止まるとみなす */
  #isKnownHang(range) {
    return this.hungRanges.some((hung) => range.start <= hung.start && range.end >= hung.end);
  }

  /** 区間を撮る。止まったら Chrome を起動し直してから HangError を投げる */
  async #shoot(range, sections) {
    if (this.#deviceSize(range).height > MAX_DEVICE_HEIGHT) {
      this.#record(range, sections, "skipped-too-tall");
      throw new HangError("高さの上限を超える");
    }
    if (this.#isKnownHang(range)) {
      this.#record(range, sections, "skipped-known-hang");
      throw new HangError("同じ部分を含む区間が止まった");
    }
    const { width, height } = this.#deviceSize(range);
    log(`  ${this.viewport.label}: ${width}x${height} を撮影 (${sections.join(" + ")})`);
    try {
      const shot = await this.browser.page.send(
        "Page.captureScreenshot",
        {
          format: "png",
          captureBeyondViewport: true,
          clip: { x: 0, y: range.start, width: this.viewport.width, height: range.end - range.start, scale: 1 },
        },
        CAPTURE_TIMEOUT_MS,
      );
      this.#record(range, sections, "ok");
      return Buffer.from(shot.data, "base64");
    } catch (error) {
      if (!(error instanceof HangError)) throw error;
      this.hungRanges.push(range);
      this.#record(range, sections, "hang");
      await this.close();
      await this.open();
      throw error;
    }
  }

  async run() {
    await this.open();
    const detected = await this.browser.page.evaluate(detectSections, { selectors: this.options.sections }, COMMAND_TIMEOUT_MS);
    for (const warning of detected.warnings) this.#warn(warning);
    if (!detected.found) this.#warn("セクションが見つからなかった");
    this.pageHeight = detected.total;
    const sections = [...detected.sections];
    log(`  ${this.viewport.label}: 全高 ${detected.total}px、区間 ${sections.map((section) => section.name).join(" / ")}`);

    let index = 0;
    while (index < sections.length) {
      const first = sections[index];
      let buffer;
      try {
        buffer = await this.#shoot({ start: first.start, end: first.end }, [first.name]);
      } catch (error) {
        if (!(error instanceof HangError)) throw error;
        // 1 区間でも撮れないときだけ、セクションの途中で切る
        const step = this.viewport.height;
        if (first.end - first.start <= step) {
          this.incomplete = true;
          this.#warn(`「${first.name}」を撮れなかった`);
          index++;
          continue;
        }
        const parts = [];
        for (let start = first.start, part = 1; start < first.end; start += step, part++) {
          parts.push({ name: `${first.name}-p${part}`, start, end: Math.min(start + step, first.end) });
        }
        this.#warn(`「${first.name}」は 1 枚に収まらないので、セクションの途中で切った`);
        sections.splice(index, 1, ...parts);
        continue;
      }

      // 次のセクションをつなげて撮れる限り、伸ばす
      let last = index;
      while (last + 1 < sections.length) {
        if (Date.now() > this.softDeadline) {
          this.#warn("時間の上限に近づいたので、つなげるのをやめた。枚数が多くなっている可能性がある");
          break;
        }
        const names = sections.slice(index, last + 2).map((section) => section.name);
        try {
          buffer = await this.#shoot({ start: first.start, end: sections[last + 1].end }, names);
          last++;
        } catch (error) {
          if (!(error instanceof HangError)) throw error;
          break;
        }
      }

      const covered = sections.slice(index, last + 1);
      this.saveImage(buffer, { start: first.start, end: covered.at(-1).end, sections: covered.map((section) => section.name) });
      index = last + 1;
    }
  }
}

// ---------------------------------------------------------------------------
// 保存
// ---------------------------------------------------------------------------

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function nameFromUrl(url) {
  const parsed = new URL(url);
  const raw = parsed.protocol === "file:" ? parsed.pathname.split("/").pop().replace(/\.[^.]+$/, "") : `${parsed.host}${parsed.pathname}`;
  return slugify(raw) || "page";
}

function slugify(text) {
  return text
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** 実行ごとに新しいフォルダを作る。同じ名前があれば番号を足し、既存のものには触らない */
function createRunDir(root, name) {
  mkdirSync(root, { recursive: true });
  const base = join(root, `${name}-${timestamp()}`);
  for (let suffix = 1; ; suffix++) {
    const dir = suffix === 1 ? base : `${base}-${suffix}`;
    try {
      mkdirSync(dir);
      return dir;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
}

function parseViewports(value) {
  const list = value.split(",").map((item) => {
    const match = item.trim().match(/^(\d+)x(\d+)(?:@(\d+(?:\.\d+)?))?$/);
    if (!match) throw new FatalError(`--viewports の形式が違う: ${item}（例: 390x844@3）`);
    const [width, height, scale] = [Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : DEFAULT_SCALE];
    if (width === 0 || height === 0 || scale <= 0) throw new FatalError(`--viewports の値が正しくない: ${item}`);
    return { width, height, scale };
  });
  const labelOf = ({ width }) => (width < 768 ? "mobile" : width < 1024 ? "tablet" : "pc");
  const count = new Map();
  for (const viewport of list) count.set(labelOf(viewport), (count.get(labelOf(viewport)) ?? 0) + 1);
  return list.map((viewport) => ({
    ...viewport,
    label: count.get(labelOf(viewport)) > 1 ? `${labelOf(viewport)}-${viewport.width}` : labelOf(viewport),
  }));
}

function parseOptions() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: "string" },
      out: { type: "string" },
      viewports: { type: "string", default: DEFAULT_VIEWPORTS },
      sections: { type: "string" },
      "keep-fixed": { type: "boolean", default: false },
      wait: { type: "string", default: String(DEFAULT_WAIT_MS) },
      "max-seconds": { type: "string", default: String(DEFAULT_MAX_SECONDS) },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help || positionals.length !== 1) return { help: true };

  let url;
  try {
    url = new URL(positionals[0]);
  } catch {
    throw new FatalError(`URL の形式が違う: ${positionals[0]}`);
  }
  if (!["http:", "https:", "file:"].includes(url.protocol)) throw new FatalError(`開けるのは http / https / file だけ: ${url.protocol}`);

  return {
    url: url.href,
    name: slugify(values.name ?? "") || nameFromUrl(url.href),
    outRoot: values.out ?? join(homedir(), "Downloads", "page-screenshots"),
    viewports: parseViewports(values.viewports),
    sections: values.sections ?? null,
    keepFixed: values["keep-fixed"],
    wait: Number(values.wait),
    maxSeconds: Number(values["max-seconds"]),
    dryRun: values["dry-run"],
  };
}

// ---------------------------------------------------------------------------

async function main() {
  const options = parseOptions();
  if (options.help) {
    log(USAGE);
    process.exitCode = 2;
    return;
  }
  report.url = options.url;

  if (options.dryRun) {
    const { name, outRoot, viewports, sections, keepFixed, wait, maxSeconds } = options;
    process.stdout.write(
      `${JSON.stringify({ url: options.url, outDir: join(outRoot, `${name}-${timestamp()}`), viewports, sections, keepFixed, wait, maxSeconds }, null, 2)}\n`,
    );
    reported = true;
    return;
  }

  if (typeof WebSocket === "undefined") throw new FatalError(`Node の WebSocket が使えない（Node 22 以上が必要、今は ${process.version}）`);
  if (!existsSync(CHROME_PATH)) throw new FatalError(`Chrome が見つからない: ${CHROME_PATH}`);

  const deadline = startedAt + options.maxSeconds * 1000;
  // 個々の処理はタイムアウトを持つので、これは最後の砦
  const hardStop = setTimeout(() => {
    for (const browser of [...liveBrowsers]) browser.killNow();
    emitReport(false, "全体の時間の上限を超えたので打ち切った");
    process.exit(1);
  }, options.maxSeconds * 1000 + 60_000);

  let runDir = null;
  let incomplete = false;
  try {
    for (const [position, viewport] of options.viewports.entries()) {
      log(`${viewport.label} ${viewport.width}x${viewport.height} @${viewport.scale}`);
      const entry = { ...viewport, pageHeight: null, files: [], attempts: [], hiddenFixed: [], warnings: [] };
      report.viewports.push(entry);
      const saveImage = (buffer, { start, end, sections }) => {
        runDir ??= createRunDir(options.outRoot, options.name);
        report.outDir = runDir;
        const from = sections[0];
        const to = sections.at(-1);
        const range = from === to ? from : `${from}-to-${to}`;
        const path = join(runDir, `${viewport.label}-${entry.files.length + 1}_${range}.png`);
        writeFileSync(path, buffer, { flag: "wx" });
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        entry.files.push({ path, width, height, bytes: buffer.length, sections, cssY: [start, end] });
        const expected = [Math.round(viewport.width * viewport.scale), Math.round((end - start) * viewport.scale)];
        if (width !== expected[0] || height !== expected[1]) {
          entry.warnings.push(`${range} の画像サイズが想定と違う: ${width}x${height}（想定 ${expected[0]}x${expected[1]}）`);
        }
        log(`  保存: ${path} (${width}x${height})`);
      };
      // 残りの時間を、残りの画面サイズで分ける
      const softDeadline = Date.now() + (deadline - Date.now()) / (options.viewports.length - position);
      const capture = new ViewportCapture(viewport, options, softDeadline, saveImage);
      entry.attempts = capture.attempts;
      try {
        await capture.run();
      } finally {
        entry.pageHeight = capture.pageHeight;
        entry.hiddenFixed = capture.hidden;
        entry.warnings.push(...capture.warnings);
        incomplete ||= capture.incomplete;
        await capture.close();
      }
    }
    emitReport(!incomplete, incomplete ? "撮れなかったセクションがある" : null);
    if (incomplete) process.exitCode = 1;
  } finally {
    clearTimeout(hardStop);
  }
}

for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) {
  process.on(signal, () => {
    for (const browser of [...liveBrowsers]) browser.killNow();
    emitReport(false, `${signal} で中断した`);
    process.exit(code);
  });
}
process.on("exit", () => {
  for (const browser of [...liveBrowsers]) browser.killNow();
});

try {
  await main();
} catch (error) {
  for (const browser of [...liveBrowsers]) await browser.close();
  emitReport(false, error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
