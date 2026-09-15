---
name: codex-pr-review-loop
description: "指定した GitHub PR を Codex CLI でレビューし、指摘の修正・再レビューを行う。"
argument-hint: "<PRのURLまたは番号>"
disable-model-invocation: true
---

# PR のレビューループ

指定 PR の要件・差分を独立レビューし、依頼された修正と検証を完了する。

- 実行時に [CLI 手順・状態遷移・再開方法](references/review-loop.md) を読む。`scripts/pr_review.py` の waiver、上限、停滞検出、証跡検証を使う。
- start の前に worktree 規約に合う作業場所を用意し、途中でディレクトリを変えない。スクリプトの基準はこの SKILL.md のディレクトリ。
- リンクされた要件と必要な情報源を確認する。機械的なリンク言及の検出と、内容を確認した事実を区別する。
- 修正まで任されている指摘はその範囲で進め、仕様変更や waiver の判断だけを確認する。コミット・push は既存の依頼範囲を尊重する。

修正後の再レビューと必要な検証が終わり、未解決事項とリモートへの反映状況を報告して完了する。`stagnated` / `max_rounds` は成功と扱わず、run を作り直して上限を回避しない。
