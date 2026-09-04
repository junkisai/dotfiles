#!/usr/bin/env bash
# PR に届いたレビューを 1 行 1 イベントで流す。Monitor ツールから呼ぶ。
#
# 自分が投稿したコメントにも人間と同じアカウント名が付くため、送信者では区別できない。
# 本文に埋めた HTML コメントの印で自分の投稿を読み飛ばしている。
#
#   usage: watch_review.sh <owner/repo> <pr> <state-file> [interval-sec]
set -uo pipefail

repo="${1:?owner/repo}"; pr="${2:?pr number}"; state="${3:?state file}"; interval="${4:-30}"
mkdir -p "$(dirname "$state")"; touch "$state"

mine='((.body // "") | test("<!-- claude-(note|reply) -->") | not) and (.user.login | endswith("[bot]") | not)'

while :; do
  {
    gh api "repos/$repo/pulls/$pr/comments" --paginate --jq \
      ".[] | select($mine) | \"rc:\(.id)\t💬 \(.path):\(.line // .original_line // 0)  \(.user.login): \((.body // \"\") | gsub(\"\\\\s+\"; \" \") | .[0:140])\"" 2>/dev/null
    gh api "repos/$repo/issues/$pr/comments" --paginate --jq \
      ".[] | select($mine) | \"ic:\(.id)\t📣 PR全体  \(.user.login): \((.body // \"\") | gsub(\"\\\\s+\"; \" \") | .[0:140])\"" 2>/dev/null
    # 行コメントだけのレビュー送信は本文が空になる。中身が無いので通知しない。
    gh api "repos/$repo/pulls/$pr/reviews" --paginate --jq \
      ".[] | select(.state != \"PENDING\") | select(.state != \"COMMENTED\" or ((.body // \"\") | length > 0)) | select($mine) | \"rv:\(.id)\t📋 レビュー送信[\(.state)]  \(.user.login): \((.body // \"\") | gsub(\"\\\\s+\"; \" \") | .[0:140])\"" 2>/dev/null
  } | while IFS=$'\t' read -r id text; do
        [ -z "$id" ] && continue
        grep -qxF "$id" "$state" || { printf '%s\n' "$text"; printf '%s\n' "$id" >> "$state"; }
      done
  sleep "$interval"
done
