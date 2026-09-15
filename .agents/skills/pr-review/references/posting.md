# 実装意図の投稿

保存先は `~/.claude/reviews/<repo>-<branch>/notes.json`（名前中の `/` は `-` にする）。

```json
{"summary":"変更の目的と確認結果", "comments":[{"file":"src/example.ts","code":"対象の行全体","kind":"intent","comment":"判断理由"}]}
```

`file` は差分にある相対パス、`code` は行全体を1〜3行。重複行は前後を足して一意にする。`kind` は `intent` / `applied` / `answered` / `declined`。件数は判断を説明する必要に応じて決める。

このスキルのディレクトリを基準に次を実行する。

```bash
python3 <skill-dir>/scripts/post_notes.py --notes <notes.json> --pr <N> --dry-run
```

行の不一致・重複を直し、投稿が依頼されていれば `--dry-run` を外す。未解決の行が本文へ回った場合も確認する。
