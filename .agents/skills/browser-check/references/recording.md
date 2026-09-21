# 証跡を動画で残す

`--record` が指定されたときに読む。観測そのもののやり方は SKILL.md と各 reference にある。

形式の指定がなければ、時間で変わるものには動画、静的な状態には静止画を選ぶ。動画を指定された場合はその成果物を優先する。
「保存を押してから15分なにも起きない」「20秒経つと案内が変わる」は静止画では伝わらない。

## 目次

- [全体の流れ](#全体の流れ)
- [収録の3方式](#収録の3方式)
- [mark](#mark)
- [beats.json](#beatsjson)
- [編集](#編集)
- [compare](#compare)
- [実測で分かった落とし穴](#実測で分かった落とし穴)

## 全体の流れ

```sh
OUT=~/Downloads/browser-check/<日付-対象>
REC="node <skill>/lib/recorder.js"

$REC start --target browser --page <確認用タブの browserPageId> --out $OUT   # 収録を始める
# ... Orca の CLI で観測する。見せどころで mark を打つ ...
$REC mark edit-open --out $OUT --label "保存ボタンが出る" --focus 'button:has-text("保存")'
$REC stop --out $OUT                        # run.mp4 + beats.json + 静止画
```

その後、`template/` を作業ディレクトリにコピーして編集する。

```sh
cp -R <skill>/template ./video && cd video && npm install
cp $OUT/beats.json src/ && cp $OUT/run.mp4 $OUT/*.png public/
# src/story.ts に見出しを書く
npx remotion render Check out.mp4
```

書くのは **観測（と mark）**と **story.ts** の2つだけ。フレーム番号や座標は触らない。

出力先は `~/Downloads/browser-check/<日付-対象>/`。リポジトリを汚さず、PR に添付しやすい。動画は `gh` から添付できないので、場所を伝えて手で貼ってもらう。

## 収録の3方式

| target | 撮り方 | 前提 |
|---|---|---|
| browser | `screencapture -R` で Orca の browser ペインの領域だけを録画 | Orca でそのタブが画面に見えている |
| ios | `xcrun simctl io recordVideo` | シミュレータが起動している。録画に Orca の attach は要らない |
| android | `adb shell screenrecord`（1本180秒まで） | adb から見える端末がある。**この Mac では実測していない** |

`recorder.js` が3方式の差を吸収する。観測は Orca の CLI で行い、`mark` を打つ呼び出しだけが共通。

### browser の前提と仕組み

Orca の browser には画面を録る手段がないので、画面側を外から録る。そのためペインが画面のどこにあるかが要る。

- `start` は、指定したタブをペイン全面が単色のページ（`lib/calibrate.html`）に切り替え、Orca ウィンドウを撮って矩形を探す。同時に「そのタブが実際に画面に見えているか」の確認になる。**見えていなければ `start` は失敗する。**
- 失敗したら、録画できないことと理由（このワークスペースを前面に出す必要がある）を伝える。ユーザーが表示してくれれば再実行する。静止画への切り替えは利用者に確認する。動画を頼まれたのに静止画が出てくるのは、意図しない結果になる。
- 録るのはペインの領域だけで、Orca のサイドバーや他のワークスペースは映らない。位置の割り出しに撮る Orca ウィンドウ全体の画像は、解析後すぐ消す。
- `start` はタブの中身をマゼンタのページに置き換える。**確認専用のタブで実行し、`start` の後に対象 URL へ `goto` する。**
- 収録中は、ペインを隠さない・ウィンドウを動かす/リサイズしない・ワークスペースを切り替えない。ユーザーにも伝える。
- `screencapture` は macOS の画面収録の許可が要る。許可がないとダイアログが出て止まる。**録画ができないことと権限の設定方法を伝え、録画以外に実施できる観測は進める。**

### ios / android

端末を `--device` で指定する（省略時は起動中が1台だけならそれを使う）。`orca emulator attach` が失敗する環境でも、`simctl` の録画は動く（[エミュレータ](orca-emulator.md)）。ただし、その状態では画面を操作できないので、録るのは表示の変化に限られる。

縦長の映像は、横長キャンバス（1440x810）の中央に載せて出力する。template の注釈カードは固定幅で、縦長のまま渡すと収まらないため。注釈カードがスマホ画面に重なるときは、`story.ts` の `cardBottom: true` などで避ける。

## mark

見せどころで打つ。ここで静止画も撮り、`beats.json` に記録する。`mark` を打った項目だけが、動画の停止点になる。

| 対象 | 拡大範囲の指定 |
|---|---|
| browser | `--focus '<CSS セレクタ>'`。`getBoundingClientRect()` で実座標に解決する |
| ios / android | `--focus-rect x,y,w,h`。`orca emulator ax` の `frame`（0..1 に正規化）をそのまま渡す |

どちらも**目測で座標を書かない**。ここを手で入れると必ずずれる。

実データを隠すときは、`start` に `--mask '<CSS セレクタ>'` を渡す（browser のみ）。静止画は確実に塗りつぶされ、早送り区間は `beats.json` の矩形を編集側で被せる。

## beats.json

収録と編集をつなぐ唯一の契約。編集側はこれだけを読む。

```json
{
  "clip": "run.mp4",
  "fps": 30,
  "size": { "width": 1295, "height": 939 },
  "mode": "browser",
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

`mode` は `browser` / `ios` / `android`、compare では `<mode>-compare`。`size` は browser がペインの論理サイズ、スマホは 1440x810。

**停止表示には動画のフレームではなく静止画（`still`）を使う。** 2倍以上に拡大すると動画のフレームは甘くなるが、`orca screenshot` などの静止画なら劣化しない。

## 編集

`story.ts` に場面ごとの見出しを書く。フレーム位置は `beats.json` から自動で拾い、早送り区間は「前の beat から今の beat まで」が切り出される。

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

中身が git でも docker でもデプロイ待ちでも構わない。切り替え方法はプロジェクトごとに違うので、スキルが握ると壊れる。
同じ観測を2回行い、それぞれ別の出力先に収録して、`merge` で前半 before・後半 after の1本にまとめる。

```sh
$REC start --target browser --out $OUT/before   # 修正前を観測して stop
$REC start --target browser --out $OUT/after    # 修正後を観測して stop
$REC merge --before $OUT/before --after $OUT/after --out $OUT
```

`story.ts` の beat 名は `before-<名前>` / `after-<名前>` になる。before と after は、対象・サイズが同じでなければ `merge` が拒否する（browser はペインの大きさが変わらないよう、ウィンドウをリサイズしない）。

## 実測で分かった落とし穴

### Orca browser の画面位置

- **ページ内の `window.screenX` / `outerWidth` は、ペインではなく Orca ウィンドウ全体を返す。** ペインの画面位置は取れない。`innerWidth` / `innerHeight` だけがペインのサイズを表す。だから `start` は単色ページで位置を割り出す
- **ペインが見えているのは、そのワークスペースがユーザーの画面に出ているときだけ。** 別のワークスペースを見ているときに Orca ウィンドウを撮ると、他プロジェクトのサイドバーやエージェントの会話が映る。位置の割り出しに使った画像は必ず消し、録るのはペイン領域に限る
- `orca screenshot` はペインを2倍解像度で返す。静止画はこれで足りる

### screencapture

- 起動から実際の録画開始まで **約570msの遅れ**がある。実測 571ms / 574ms と安定していて、時間が経っても累積しない。`recorder.js` が固定値で差し引いている
- 出力は **Retina で指定領域の2倍解像度、60fps** になる。`recorder.js` が mp4 変換時に論理サイズ・30fps へ戻している
- 領域指定は `-R<x,y,w,h>`。ウィンドウ指定（`-l`）は影の余白が付いて寸法がずれる（3840x2100 のウィンドウが 3976x2236 で出る）。画面全体ではなく領域だけを録るのは、デスクトップの他アプリや通知を写さないため

### simctl

- **`recordVideo` は画面が変化したときだけフレームを書く。** 静止した画面を3秒録っても、映像は 0.07 秒ぶんしか出ない。`recorder.js` は実時間との差を最後のフレームの延長で埋めている。フレーム数から尺を推測しない
- 録画の開始は stderr の `Recording started` で分かる。`recorder.js` はその時刻を t0 にしている

### 撮れないもの

- 画面に出ていないものは撮れない。偽のダイアログ画像を作らない。撮れないものは撮れないと書き、実測値を代わりに出す

### マスクの限界

停止表示の静止画は矩形の塗りつぶしで確実に隠れる。
早送り区間は矩形を被せるだけなので、**要素がスクロールや遷移で動くとずれる**。
実データが動く場面を早送りで流すときは、その区間を使わないか、静止画だけで構成する。
