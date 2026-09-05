# 証跡を動画で残す

`--record` が指定されたときに読む。観測そのもののやり方は SKILL.md 本体にある。

静止画で足りるなら静止画でよい。動画が要るのは、**時間で変わるもの**を示すときだけ。
「保存を押してから15分なにも起きない」「20秒経つと案内が変わる」は静止画では伝わらない。

## 目次

- [全体の流れ](#全体の流れ)
- [収録の2方式](#収録の2方式)
- [beats.json](#beatsjson)
- [編集](#編集)
- [compare](#compare)
- [実測で分かった落とし穴](#実測で分かった落とし穴)

## 全体の流れ

```
1. 観測スクリプトを書く（lib/recorder.js を使う）
2. 実行 → run.mp4 + beats.json + 静止画
3. 作業ディレクトリに template/ をコピーして npm install
4. story.ts に見出しを書く
5. npx remotion render Check out.mp4
```

書くのは **観測スクリプト**と **story.ts** の2つだけ。フレーム番号や座標は触らない。

出力先は `~/Downloads/browser-check/<日付-対象>/`。リポジトリを汚さず、PR に添付しやすい。

## 収録の2方式

| モード | 方式 | 使う場面 |
|---|---|---|
| local | Playwright の `recordVideo` | ローカルで状態を作り込める |
| attach | `screencapture` でウィンドウ領域を録画 | staging / 本番のログイン済みセッション |

`lib/recorder.js` の `createRecorder({ mode })` が両方を吸収する。呼ぶ側のコードは同じ。

```js
const { createRecorder } = require("<skill>/lib/recorder");

const rec = await createRecorder({
  mode: "local",
  outDir: process.env.OUT_DIR,
  mask: [".customer-name", ".amount"],   // staging で実データを隠す
});

const page = rec.page;
await page.goto("http://localhost:3000/items");
await page.click('button:has-text("編集")');
await rec.mark("edit-open", { focus: 'button:has-text("保存")', label: "保存ボタンが出る" });
await rec.finish();
```

### なぜ staging は別方式なのか

CDP で起動済み Chrome に繋ぐと、**ログイン状態を持つのは既存 context だけ**で、そこでは
`page.video()` が `null` になる。録画できる `newContext` は Cookie を共有しない（実測で確認）。
両立しないので、画面側を外から録るしかない。

`screencapture` は macOS の画面収録許可が要る。許可がないとダイアログが出て止まる。
**黙って静止画に落とさず、そこで一度止めて利用者に判断を仰ぐ。** 動画を頼まれたのに
静止画が出てくるのは、意図しない結果になる。

## beats.json

収録と編集をつなぐ唯一の契約。編集側はこれだけを読む。

```json
{
  "clip": "run.mp4",
  "fps": 30,
  "size": { "width": 1440, "height": 810 },
  "mode": "local",
  "beats": [
    {
      "name": "edit-open",
      "frame": 287,
      "still": "edit-open.png",
      "focus": { "x": 240, "y": 48, "w": 460, "h": 44 },
      "label": "保存ボタンが出る",
      "masks": []
    }
  ]
}
```

`focus` はセレクタから `boundingBox()` で解決した実座標。目測で座標を書かない。
ここを手で入れると必ずずれる。

**停止表示には動画のフレームではなく静止画（`still`）を使う。** 2倍以上に拡大すると
動画のフレームは甘くなるが、`page.screenshot()` の静止画なら劣化しない。

## 編集

`story.ts` に場面ごとの見出しを書く。フレーム位置は `beats.json` から自動で拾い、
早送り区間は「前の beat から今の beat まで」が切り出される。

```ts
export const STORY: Story = {
  title: { eyebrow: "browser-check", heading: "保存できない原因が画面に出る" },
  scenes: [
    { beat: "edit-open", heading: "編集モードに入れる", tone: "ok" },
    { beat: "save-failed", heading: "理由がそのまま出る", tone: "bad",
      code: "マスタ変更中です。完了までお待ち下さい。" },
  ],
  closing: { eyebrow: "確認結果", heading: "期待どおり", rows: [["保存", "失敗理由が出る"]] },
};
```

既定は **早送り 2.2倍 / 停止 6秒 / 拡大 2.2倍**。場面ごとに上書きできる。
15分の待機と3秒の操作を同じ速度で扱うと破綻するので、長い区間だけ上げる。

### 拡大の実装で外してはいけない3点

`parts.tsx` に実装済みだが、触るときは理由を知っておくこと。

- **再センタリングとクランプの両方が要る。** 倍率だけ上げると注目点が画面外へ流れる。
  注目領域を画面中央下寄り `(W/2, H*0.64)` へ寄せ、平行移動を `[W - scale*W, 0]` に丸める。
  丸めないと素材の外縁（黒い余白）が映り込む
- **注目領域が画面上端にあるときは `cardBottom: true`。** 注釈カードと重なって読めなくなる
- **枠線の太さは倍率で割る。** そのままだと拡大に比例して太くなり、対象を覆い隠す

## compare

修正前後を1本に並べる。**コードの切り替えはスキルがやらない。**
「修正前にするコマンド」「修正後にするコマンド」を利用者から受け取って実行する。

```
before: cd ../worktrees/main && npm start
after:  cd ../worktrees/fix-123 && npm start
```

中身が git でも docker でもデプロイ待ちでも構わない。切り替え方法はプロジェクトごとに
違うので、スキルが握ると壊れる。同じ観測スクリプトを2回走らせ、2つの `beats.json` を
前半 before・後半 after として並べる。

## 実測で分かった落とし穴

### CDP 接続

- **`browser.close()` を呼ばない。** 接続を切るだけでなく Chrome ごと終了する。
  利用者のブラウザを閉じてしまう
- **最後のタブを閉じない。** タブが 0 になると以後 `connectOverCDP` が
  `Browser context management is not supported` で失敗する。復旧には手でタブを開く必要がある
- `recordVideo` は既存 context では効かない（前述）

### screencapture

- 起動から実際の録画開始まで **約570ms の遅れ**がある。実測 571ms / 574ms と安定していて、
  時間が経っても累積しない。`recorder.js` が固定値で差し引いている
- 出力は **Retina で指定領域の2倍解像度**になる。1200x800 を指定すると 2400x1600 で出る。
  `recorder.js` が mp4 変換時に論理サイズへ戻している
- 領域指定は `-R<x,y,w,h>`。画面全体ではなくウィンドウ領域だけを録るのは、
  デスクトップの他アプリや通知を写さないため

### 撮れないもの

- **ネイティブダイアログ**（`beforeunload` の「このサイトを離れますか？」など）は
  ブラウザ自身が出すもので、Playwright の録画には写らない。`screencapture` でのみ撮れる。
  必要なら `lib/capture-window.sh` で手動収録し、静止画として編集に差し込む
- 偽のダイアログ画像を作らない。撮れないものは撮れないと書き、実測値を代わりに出す

### マスクの限界

停止表示の静止画は Playwright の `mask` で確実に隠れる。
早送り区間は矩形を被せるだけなので、**要素がスクロールや遷移で動くとずれる**。
実データが動く場面を早送りで流すときは、その区間を使わないか、静止画だけで構成する。
