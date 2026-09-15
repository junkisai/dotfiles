# レビューの取得・返信

このスキルのディレクトリを `<skill-dir>` として使う。台帳の既定は `~/.claude/reviews/<repo>-<branch>/applied.txt`（名前中の `/` は `-` にする）。再開時も同じパスを使う。

```bash
python3 <skill-dir>/scripts/fetch_review.py --repo <owner/repo> --pr <N> --state <applied.txt>
```

取得時は `--mark` を付けない。取得しただけで反映済みにすると、中断後に未対応の指摘を取りこぼす。対応・検証・返信まで終えた項目の `key` だけを台帳に追記する。`reply.py` は API 失敗でも成功風の行を出すことがあるため、終了コードや表示だけで判断せず、GitHub 上で投稿本文と必要な解決状態を確認する。失敗時は台帳を進めず、再送前に既存の返信を調べて重複を避ける。

各指摘を修正・質問・方針変更に分ける。根拠がある修正を実施し、同じ原因が変更範囲に残っていないか確認する。必要な検証をまとめて行う。見送りには理由を残す。

```bash
python3 <skill-dir>/scripts/reply.py --repo <owner/repo> --pr <N> --resolve <<'EOF'
[{"key":"rc:123456","status":"applied","body":"修正内容と検証結果"}]
EOF
```

質問には `answered`、見送りには `declined`。`--resolve` は解決したスレッドだけに使い、議論中や declined のものは閉じない。

継続監視まで依頼され、実行環境に監視手段がある場合は `scripts/watch_review.sh <owner/repo> <N> <seen.txt> 30` を利用できる。待機範囲・終了条件を決め、監視しない場合は未処理事項と PR URL を返す。
