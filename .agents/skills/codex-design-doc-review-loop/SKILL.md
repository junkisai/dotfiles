---
name: codex-design-doc-review-loop
description: "Codex CLI による設計文書のレビューと修正・再レビューを依頼されたときに使う。"
argument-hint: "<design doc ファイル> <要件ファイル>"
disable-model-invocation: true
---

# 設計文書のレビューループ

要件に照らして設計文書をレビューし、依頼された修正まで進める。

- 実行するときは [CLI 手順と状態遷移](references/review-loop.md) を読む。指摘生成・waiver・停滞検出・エビデンス検証は `scripts/design_doc_review.py` に任せる。
- 作業ディレクトリは最初に worktree 規約に合わせ、ループ中は変えない。`${CLAUDE_SKILL_DIR}` がなければ、この SKILL.md のディレクトリをスクリプトの基準にする。
- 明示された修正依頼の範囲は逐次再承認を求めず進める。要件を変える判断や未承認の除外だけを確認する。
- `done` は完了、`stagnated` / `max_rounds` は未解決を伴う停止として報告する。上限を新規 run で繰り返し回避しない。

成果物は更新した設計文書と、指摘・対応・未解決事項の記録。文書修正後の再レビューまで確認して結果を伝える。
