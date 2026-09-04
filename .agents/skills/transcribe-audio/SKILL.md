---
name: transcribe-audio
description: |
  ボイスレコーダー・スマホ等の音声ファイルをローカルで文字起こしし、要約とメタ情報を付けて定型 Markdown（docs/transcripts/ もしくは音声と同じ／指定フォルダ）として保存するスキル。mlx-whisper（large-v3-turbo / Apple Silicon）を使い、長尺音声を分割しながら確実に処理する。Markdown 保存後は、生文字起こし全文を除いた「要約版 PDF」も自動で出力する。

  以下の文脈で積極的に使うこと：
  - 「文字起こしして」「録音を文字に起こして」「議事録にして」「書き起こして」
  - 「ボイスメモ／録音データを処理して」「この m4a/mp3/wav を文字にして」「transcribe して」
  - 「打ち合わせ／インタビュー／発想メモの音声を docs に追加して」
  - 音声ファイルのパスや共有ファイルを渡され、テキスト化を求められたとき
  ユーザーが明示的に「transcribe-audio スキル」と言わなくても、音声→テキスト化や文字起こしの追加を求める文脈なら使うこと。
---

# 音声文字起こし → Markdown ＋ 要約 PDF

音声ファイルを文字起こしし、**frontmatter ＋ 要約 ＋ 生文字起こし** の定型 Markdown を作り、続けて生文字起こしを除いた**要約版 PDF** を出す。保存先はリポジトリの `docs/transcripts/`、または単発なら音声と同じ／指定フォルダ（Step 6 で決める）。録音は数十分〜2時間に及ぶことがあり、素朴に回すと遅さ・タイムアウト・ジョブ kill で何度もやり直すことになる。このスキルは、その失敗を避けるために学んだ段取りを固定したもの。

## 前提（なぜこの構成か）

- **mlx-whisper を使う**。Apple Silicon ネイティブで、large-v3-turbo が ~12倍速・日本語も実用品質。
  - openai-whisper の **CPU は遅すぎる**（90分音声が46分でも終わらない）。
  - openai-whisper の **MPS は NaN/inf で壊れる**（既知のバグ）。どちらも採用しない。
- **長尺は分割して処理する**。チャンクごとに結果を即保存し、再実行で未処理分だけやり直す。
  途中で死んでも進捗が残り、フォアグラウンドでも安全に流せる。
- **音声本体は Git に入れない**。容量が大きいので docs には文字起こしテキストだけ置き、リポジトリを軽く保つ。
- **PDF は「要約版」を出す**。生文字起こしは数千発話・数十ページに及び、印刷・共有・ざっと見返す用途には重すぎる。そこで PDF では `## 生文字起こし` 以降を落とし、frontmatter＋要約＋ネクストアクションだけの数ページに畳む。全文は Markdown 側に残るので情報は失われない。変換は pandoc/LaTeX 不要の **python-markdown ＋ ヘッドレス Chrome** で行い、日本語フォント（ヒラギノ等）をそのまま使う。`scripts/md_to_pdf.py` にまとめてあるので毎回書き直さない。

## 全体の流れ

チェックリストとして 1 項目ずつ消化する。

1. 環境確認（mlx_whisper / ffmpeg、PDF 用に python-markdown / Chrome）
2. 音声を安定した場所にコピー（共有一時ファイル対策）
3. （任意）90秒プローブで品質確認
4. 分割文字起こし（`scripts/transcribe.sh`）
5. 全文を読んで要約・メタ情報を作成
6. Markdown を作成（保存先は下記 Step 6 で決める）
7. 要約版 PDF を自動出力（`scripts/md_to_pdf.py`）
8. （docs/transcripts 運用のときのみ）README 一覧に追記 → 必要なら commit / PR

---

## Step 1: 環境確認

```bash
command -v ffmpeg mlx_whisper
python3 -c "import markdown" 2>/dev/null && echo "markdown OK" || echo "need: pip install markdown"
ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" 2>/dev/null && echo "chrome OK"
```

`mlx_whisper` が無ければインストール（既存の torch 等を再利用するので追加は数パッケージ）:

```bash
pip install mlx-whisper
```

PDF 出力（Step 7）には **python-markdown** と **Chrome 系ブラウザ**（Google Chrome / Chromium / Edge のいずれか）が要る。`markdown` が無ければ `pip install markdown`。Chrome が無い環境では Step 7 だけスキップし、Markdown は必ず残す。

## Step 2: 音声を安定した場所にコピー

**重要**: macOS の「共有」「ドラッグ」で渡されるパス（例: `.../Containers/com.apple.VoiceMemos/.../​.com.apple.uikit.itemprovider.temporary.XXXX/録音.m4a`）は **一時フォルダで数分後に自動削除される**。最初に `ls -lh` で実在を確認できても、文字起こし開始時には消えていることがある。

- まず `ls -lh "<path>"` で存在を確認する。
- 一時フォルダ配下なら、ユーザーに「`~/Desktop` や `~/Downloads` など消えない場所に保存し直してパスを教えて」と依頼する。
- いずれにせよ `scripts/transcribe.sh` は処理開始時に作業ディレクトリへコピーを取るので、コピー後の消失には強い。

## Step 3: （任意）品質プローブ

不安なときは先頭90秒だけ試す。モデルのダウンロード（初回のみ）と品質・速度を確認できる。

```bash
ffmpeg -v error -y -ss 0 -t 90 -ac 1 -ar 16000 -i "<audio>" /tmp/probe.wav
mlx_whisper /tmp/probe.wav --model mlx-community/whisper-large-v3-turbo --language ja \
  --output-dir /tmp --output-format txt --verbose False && cat /tmp/probe.txt
```

## Step 4: 分割文字起こし

```bash
bash ~/.claude/skills/transcribe-audio/scripts/transcribe.sh "<audio>" "<work_dir>" [chunk_min] [model]
```

- 既定は 30分チャンク・large-v3-turbo。出力は `<work_dir>/clean.txt`（整形後）と `full.txt`（生結合）。
- **実行方法**: 30分チャンクなら 1 チャンク数分なので、フォアグラウンドで `timeout` を長め（例 `420000`ms）に取って流すのが確実。
  バックグラウンドで回すと環境によっては kill されることがあるが、**再実行すれば済んだチャンクは飛ばして続きから再開**するので、その場合は同じコマンドをもう一度呼べばよい。
- 2時間級など極端に長い場合は `chunk_min` を小さく（例 15）して、1 回あたりのフォアグラウンド時間を短くする。

`clean.txt` は `scripts/clean_transcript.py` により、無音区間で whisper が繰り返す相槌・感嘆のハルシネーション（「うんうん…」「！！」等）を `（…相槌・無音…）` に畳んだもの。本文にはこちらを使う。

## Step 5: 全文を読んで要約・メタ情報を作成

`clean.txt` を通読し、以下を組み立てる。長い場合は分割 Read か Grep で要点を拾う。

- **title / topic**: ファイル名用の短い英 kebab（例 `elink-website-meeting`）と日本語タイトル。
- **type**: `meeting` / `memo` / `interview` / `other`。
- **participants**: 話者・参加者。**固有名詞・人名は ASR で誤変換されやすい**ので、自信が無い名前は「（要確認）」を付け、ユーザーに確認する。
- **要約**: 後で全文を読まずに要点がつかめる箇条書き。打ち合わせなら 背景／課題／方向性／ネクストアクション の見出しが効く。
- **録音日**: ファイルの作成日 ≠ 録音日のことがある。**録音日はユーザーに確認**してから frontmatter とファイル名に使う。

## Step 6: Markdown を作成

**保存先を先に決める**。使い方が2通りある:

- **docs/transcripts 運用**（リポジトリ内に文字起こしを蓄積する場合）:
  `docs/transcripts/<録音日 YYYY-MM-DD>-<topic>.md`。ファイル変更前に CLAUDE.md のルールに従い worktree を作る（既に worktree 内ならそのまま）。Step 8 の README 追記・commit まで進む。
- **単発／同じフォルダ運用**（Downloads 等に置かれた 1 ファイルを処理し、リポジトリ管理しない場合）:
  ユーザー指定の場所、指定が無ければ **音声と同じフォルダ** に `<音声名>_文字起こし.md` で保存する。worktree も README も commit も不要。

構成は **frontmatter ＋ 注記 ＋ 要約 ＋ ネクストアクション（任意）＋ 生文字起こし** の順。

- **生文字起こしの見出しは必ず `## 生文字起こし`** にする。PDF（Step 7）はこの見出しを目印に全文を落とすので、表記を変えると全文が PDF に載ってしまう。
- 生文字起こしには `clean.txt` の中身を貼る。
- frontmatter には PDF のメタ表にそのまま出る次のキーを入れておくと綺麗: `title`（日本語タイトル） / `type` / `recorded`（録音日 YYYY-MM-DD） / `duration` / `audio`（音声ファイル名。本体は Git 管理外） / `source`（`mlx-whisper (large-v3-turbo)`） / `participants`（リスト）。
- 冒頭に「自動文字起こしのため固有名詞は誤変換あり／無音の相槌は圧縮済み」の注記（blockquote）を入れておくと、後で読む人が誤読しない。
- **固有名詞の統一**: ASR は同じ人名を複数の綴りに揺らす。ユーザーに正しい表記を確認したら、要約だけでなく生文字起こし側の揺れも置換して揃える。日本語のバイト列置換は `perl -pe 's/旧/新/g'`（`-C`/`-Mutf8` を付けると script リテラルと入力のエンコーディングが食い違って**置換が効かない**ことがあるので、素の byte 置換が確実）。

## Step 7: 要約版 PDF を自動出力

Markdown を保存したら、続けて PDF も出す（毎回自動。ユーザーからの追加依頼を待たない）。

```bash
python3 ~/.claude/skills/transcribe-audio/scripts/md_to_pdf.py "<作成した.md>"
# 出力先を変えたいとき: 第2引数に .pdf パスを渡す
```

- 既定の出力先は入力 Markdown と同じ場所・同じ名前の `.pdf`。
- スクリプトが `## 生文字起こし` 以降を自動で落とし、**要約までの数ページ**に畳む（全文は Markdown 側に残す）。
- 見出しが規定どおりなら、実行後に「（生文字起こしセクションを除外した要約版）」と表示される。もし「除外対象セクションなし」と出たら、Markdown の見出しが `## 生文字起こし` になっているか確認する。
- ページ数を確かめたいときは `mdls` の値は Spotlight キャッシュで古いことがある。実数は `python3 -c "import re,sys;print(len(re.findall(rb'/Type\s*/Page[^s]',open(sys.argv[1],'rb').read())))" out.pdf` で数える。

## Step 8: 一覧に追記 → commit / PR（docs/transcripts 運用のときのみ）

- `docs/transcripts/README.md` の「一覧」に 1 行追記（新しいものを上に）。
- ユーザーが望めば commit / PR まで進める（commit / pr-only / pr スキル）。
- 単発／同じフォルダ運用ではこの Step は不要。生成した `.md` と `.pdf` の場所を伝えて完了。

---

## トラブルシュート

| 症状 | 原因 / 対処 |
| --- | --- |
| ffmpeg `No such file or directory` なのに最初は存在した | 共有一時フォルダが自動削除された。安定した場所に保存し直す（Step 2）。 |
| 文字起こしが NaN/`Categorical` エラーで失敗 | openai-whisper を MPS で動かしている。mlx-whisper を使う。 |
| 90分が何十分経っても終わらない | openai-whisper の CPU 実行。mlx-whisper に切り替える。 |
| バックグラウンドジョブが kill される | `transcribe.sh` を**フォアグラウンドで再実行**。済んだチャンクは飛ばして再開する。 |
| 生文字起こしが「うん」「！」だらけ | 会議後も録音継続した無音区間の幻聴。`clean.txt`（clean_transcript.py 適用済み）を使う。 |
| 人名・固有名詞が変 | ASR の誤変換。ユーザーに正しい表記を確認し、frontmatter・注記・生文字起こしの揺れを揃える（byte 置換：`perl -pe`）。 |
| PDF に全文が載ってしまう | Markdown の見出しが `## 生文字起こし` になっていない。スクリプトはこの見出しで全文を落とすので表記を合わせる。 |
| `md_to_pdf.py` が Chrome を見つけられない | Google Chrome / Chromium / Edge のいずれかを入れる。無ければ PDF はスキップし Markdown だけ残す。 |
| `import markdown` で失敗 | `pip install markdown`（python-markdown）。 |
| `mdls` のページ数が実際と違う | Spotlight の古いキャッシュ。`/Type /Page` を数えて実数を確認する（Step 7 参照）。 |
