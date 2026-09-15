---
name: transcribe-audio
description: "音声ファイルをローカルで文字起こしし、要約付き Markdown と要約 PDF を保存する。"
---

# 音声から Markdown と要約 PDF

音声を文字起こしし、メタ情報・要約・生文字起こしを保存する。ユーザーがテキストのみ等を指定した場合はその形式を優先する。

- 入力を確認して [実行と再開](references/processing.md) に従う。一時共有ファイルは読めるうちにコピーする。
- `clean.txt` の全文を読み、要約・決定事項・次の行動をまとめる。長ければ分割して確認し、要約だけから全体を再構成しない。
- 人名や録音日が不明なら「要確認」や未確定として残す。既に指定された日付を聞き直さず、ファイル作成日を録音日と断定しない。重要な不明点の質問中も処理を進める。
- Markdown の構成は frontmatter、注記、要約、必要なら次の行動、`## 生文字起こし`。メタ情報は title / type / recorded / duration / audio / source / participants を使い、不明な値を創作しない。
- 保存先は指定優先。リポジトリでの蓄積なら worktree 内の `docs/transcripts/` と既存一覧を更新する。単発は音声と同じフォルダ。音声本体を Git に追加しない。
- Markdown 保存後に [要約 PDF](references/summary-pdf.md) を作る。既存の成果物を無断で上書きしない。

完了時は Markdown と PDF の場所、未確認の固有名詞等、作成できなかった成果物を伝える。commit / PR は依頼されている場合だけ行う。
