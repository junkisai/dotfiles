---
name: browser-check
description: |
  フロントエンドの変更が、ユーザーから見える振る舞いを壊していないかをブラウザで確認するスキル。
  実装の詳細ではなく、「画面に出る・遷移する・操作できる」という観測可能な事実を確認する。
  公式 Playwright CLI でブラウザを駆動し、変更の影響範囲を観測可能な振る舞いに翻訳して
  チェックリストを作り、一つずつ観測する。local / staging の2モードを持つ。
  `--record` を付けると、観測の様子を収録して注釈付きの動画に仕上げ、証跡として残す。
  修正前後を並べた比較動画も作れる。

  以下の文脈で積極的に使うこと：
  - 「ブラウザで動作確認して」「画面で確認して」「browser-check して」
  - 「フロントの変更が壊れてないか見て」「この変更を実機で確認して」
  - 「デプロイした変更を staging で確認して PR にメモを残して」
  - 「動作確認して動画をとって」「確認の様子を録画して」「証跡を動画で残して」
  - 「修正前後を比べる動画を作って」「before / after の動画がほしい」
  - 「PR に貼る動画がほしい」「画面の動きを見せたい」
  - 「/browser-check」「/browser-check local」「/browser-check staging」「/browser-check compare」
---

# browser-check スキル

フロントエンドの変更が、ユーザーから見える振る舞いを壊していないかをブラウザで確認する。

## 考え方（最重要）

実装の詳細ではなく、ユーザーが画面を通じて観測できる事実を確認する。

- ❌ 「createNuxtLinkActiveClass が active クラス文字列を返す」
- ✅ 「メニューをクリックすると該当画面に移動し、その項目が強調表示される」

単体テスト（Vitest）が「ロジックの正しさ」を担保するのに対し、browser-check は
「画面に出る・遷移する・操作できる」という結合後の振る舞いを担保する。役割が分かれているので、
両方あると安心感が違う。観測の根拠は常に「画面に出ている事実」に置き、実装の内部状態は根拠にしない。

## モード

引数で指定する。省略時は local か staging かを確認してから進める。

| モード | 起動 | 認証 | 用途 |
|--------|------|------|------|
| local | `pnpm dev:mock` などで自分で起動 | バイパス | エラーや非同期完了など、状態を作り込んで確認したいとき |
| staging | 起動済みの Chrome に attach | 実認証（ログイン済み） | デプロイ済みの変更を実機で確認し、PR コメントに証跡を残したいとき |
| compare | 修正前後で2回観測する | モードに準じる | 直した内容を before / after で見せたいとき |

証跡を動画で残すときは `--record` を付ける。省略時は録画しない。録画は Remotion の
セットアップとレンダリングで数分かかるので、軽く確認したいだけのときに走らせない。

- `/browser-check local` … local モード
- `/browser-check staging` … staging モード
- `/browser-check local --record` … 観測に加えて動画を残す
- `/browser-check compare` … 修正前後を並べる。切り替えるコマンドを2つ聞いてから進める
- 引数なし … どちらのモードか確認してから進める

## 手順

### Step 1: 変更の影響範囲を把握する

`git diff`（必要なら `git diff main...`）を読み、変わったコンポーネント / ページ / ルート / 状態を特定する。
読み取りのみ。実装の中身ではなく「どの画面の・何が・どう変わりうるか」を見る。

### Step 2: 観測可能な振る舞いに翻訳する

変更を「ユーザーが画面で観測できる事実」に翻訳する。実装語彙を画面語彙に置き換える。

例：active クラス算出ロジックの変更
→ 「メニュー項目をクリックすると該当画面に遷移し、その項目が強調表示される」

### Step 3: チェックリストを作る

翻訳した振る舞いを「1 項目 = 1 観測」のチェックリストにし、各項目を TODO として作る。

- 各項目は「操作 → 画面で観測できる結果」の形にする
- 正常系だけでなく、エッジケース（エラー表示、空状態、非同期の完了/失敗、権限なし）も拾う

### Step 4: ブラウザを起動/接続する（モード別）

**local**
- アプリを自分で起動する。起動コマンドは固定せず `package.json` / `README` から確認する（例: `pnpm dev:mock`）
- 認証はバイパス前提
- Playwright で新しいブラウザを開いて対象 URL を観測する

**staging**
- すでにログイン済みの Chrome に attach する（実認証セッションを使う）
- Chrome をリモートデバッグ有効で起動しておく必要がある旨を確認・案内する
  ```bash
  # 例（macOS）。既存プロファイルのログイン状態を使う
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222
  ```
- 既存セッション（ログイン状態）を壊さない。ログアウトや破壊的操作はしない

### Step 5: 一つずつ観測する

チェックリストを上から一つずつ、ブラウザで実際に操作して観測する。

- 操作（クリック / 入力 / 遷移）→ 期待する観測結果が画面に出るか確認する
- 観測した事実（OK / NG / 想定と違う点）を記録する
- 実装の内部状態ではなく、画面に出ている事実だけを根拠にする
- 必要に応じてスクリーンショットを撮る（ローカル保存。PR 本文には貼らない）

### Step 5.5: 動画で残す（`--record` のときだけ）

**`references/recording.md` を読んでから進める。** 収録の書き方、beats.json の形、
拡大の実装で外してはいけない点がそこにある。

要点だけ先に。

- 観測は全項目行うが、**動画の停止点になるのは `mark()` を呼んだ項目だけ**。
  「ページが開く」のような自明な項目に6秒割いても読み手の時間を使うだけになる
- 拡大したい場所は**セレクタで指定する**。`mark("x", { focus: 'button:has-text("保存")' })` と
  書けば座標は自動で解決される。目測で座標を書くとまずずれる
- 静止画で足りるなら静止画でよい。動画が要るのは、待ち時間や段階的な変化など
  **時間で変わるもの**を示すとき

### Step 6: 結果をまとめる

チェックリストの結果（✅ / ❌ と観測した事実）をまとめて報告する。
staging モードでは、結果のテキストチェックリストを PR コメントとして残す（後述）。

`--record` のときは、成果物の場所も伝える。出力先は `~/Downloads/browser-check/<日付-対象>/`。
リポジトリを汚さず、PR へ添付しやすい場所に置く。動画は `gh` から添付できないので、
「ここに置いた」と伝えて手で貼ってもらう。

### compare のとき

修正前後を2回観測して並べる。**コードの切り替えはこちらでやらない。**

「修正前にするコマンド」「修正後にするコマンド」を利用者に聞き、それを実行する。
中身が git でも docker でもデプロイ待ちでも構わない。切り替え方法はプロジェクトごとに
違うので、こちらが手順を決め打ちすると動かなくなる。

同じ観測スクリプトを2回走らせ、前半 before・後半 after として1本にまとめる。

## Playwright CLI の使い方（公式 CLI）

単発の観測は公式 CLI を使う。

```bash
# 単発スクリーンショット
npx playwright screenshot --full-page http://localhost:3000/path shot.png

# 手で開いて確認（codegen で操作を記録することも可）
npx playwright open http://localhost:3000/path
npx playwright codegen http://localhost:3000/path
```

複数ステップの操作 → 観測は、短い使い捨て Playwright スクリプトを書いて実行する。

```js
// check.mjs（local: 新しいブラウザを開く）
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto('http://localhost:3000');
await page.getByRole('link', { name: 'ダッシュボード' }).click();
// 観測：遷移先で該当項目が強調表示されているか（aria-current など、画面に出る事実で確認）
await page.screenshot({ path: 'shot.png' });
await browser.close();
```

staging は起動済み Chrome に CDP で接続する。

```js
// connect.mjs（staging: 起動済み Chrome に attach）
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];
const page = context.pages()[0] ?? await context.newPage();
// 既存のログイン状態をそのまま使って観測する。context/page は閉じない
```

> 実際の playwright-cli の呼び出しが上記と異なる場合は、その呼び出しに合わせる。

## staging の証跡（PR コメント）

- 観測結果を**テキストのチェックリスト**として `gh pr comment` で投稿する
- 画像は gh CLI から直接埋め込めないため、スクショは撮っても本文には貼らない
  （必要なら撮影した旨だけ書き、画像添付は手動 or 別手段に委ねる）
- GitHub 通信は最初から `require_escalated` で実行する

```bash
BODY_FILE="$(mktemp -t browser-check.XXXXXX.md)"
cat > "$BODY_FILE" <<'EOF'
## browser-check（staging）

- [x] メニューをクリックすると該当画面に遷移し、その項目が強調表示される
- [x] 一覧が空のとき「データがありません」が表示される
- [ ] 保存失敗時にエラートーストが表示される（再現できず／要確認）
EOF

gh pr comment <PR番号 or URL> --body-file "$BODY_FILE"
```

## 注意事項

- 確認するのは観測可能な振る舞い。実装の詳細を根拠にしない
- local の起動コマンド・認証バイパス手順はプロジェクト固有。固定せず実行時に確認する
- staging の既存ログインセッションを壊さない（attach のみ。ログアウトしない）
- staging では破壊的操作（本番/共有データの削除・変更など）をしない。必要なら実行せず確認する

### staging で守ること

attach しているのは利用者が使っている本物のブラウザなので、扱いを誤ると作業を壊す。

- **`browser.close()` を呼ばない。** 接続を切るだけでなく Chrome ごと終了する
- **最後のタブを閉じない。** タブが 0 になると以後 `connectOverCDP` が
  `Browser context management is not supported` で失敗し、手でタブを開くまで繋がらない
- **変更を伴う操作は、実行する操作を列挙して承認を取ってから行う。** 既定は読み取りのみ。
  動画の題材は保存や更新になりがちだが、実データを黙って変えない
- **実データの映り込みを隠す。** 顧客名・金額・担当者名が画面に出る。
  停止表示の静止画は Playwright の `mask` で確実に隠れるが、早送り区間は矩形を被せるだけで、
  要素が動くとずれ得る。動く場面を早送りで流すなら、その区間を使わない判断もある
- **画面収録の許可がないときは止まる。** 黙って静止画に落とさない。
  動画を頼まれたのに静止画が出てくるのは意図しない結果になる。
  許可の取り方を案内したうえで、静止画のみで続けるかを聞く
