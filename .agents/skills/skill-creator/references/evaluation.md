# Skill 評価

変更前の Skill を保存し、実際の利用を代表する課題と紛らわしい非対象の課題を選ぶ。単に文言や見出しが一致したかではなく、成果物・操作範囲・参照選択を評価する。

独立評価が有用で利用可能なら、評価者に課題・Skill・最小限の入力を渡す。期待する結論や修正理由を教えず、外部への書き込みを行わない隔離環境で比較する。評価のための本番操作・大量の有料実行は行わない。

既存の評価資産を使うとき:

- `evals/evals.json` の形式や採点データは [schemas.md](schemas.md) を参照する。
- 採点を委任する場合は `agents/grader.md`、盲検比較なら `agents/comparator.md` と `agents/analyzer.md` を読む。
- 複数実行の集計は `scripts/aggregate_benchmark.py`、人が比較する画面は `eval-viewer/generate_review.py` を利用できる。使う機能だけの引数を確認する。
- `scripts/run_eval.py` / `run_loop.py` は Claude CLI に依存する。Codex の発動精度を測った結果とは扱わない。実際に使うモデルと環境に合う評価方法を選ぶ。

成果物と実際の操作を採点し、失敗した境界だけを修正して再確認する。時間や token は取得できた値だけを記録し、静的な文面点検とモデル実行の結果を分けて報告する。
