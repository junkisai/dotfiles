#!/usr/bin/env bash
# skill-flag-path.sh — skill-guard 用フラグファイルのパスを出力する。
#
# フックとスキルの両方から呼ばれ、同じセッションでは必ず同じパスを返すことが肝心。
#   - フック側（skill-guard.sh）：stdin の session_id を第1引数で渡す
#   - スキル側（/commit, /pr-only, /pr）：引数なしで呼び、環境変数
#     CLAUDE_CODE_SESSION_ID を使う
# CLAUDE_CODE_SESSION_ID とフック stdin の session_id は同一のセッション UUID なので、
# 両文脈でパスが一致する。worktree を並行利用しても別セッション＝別 UUID なので衝突しない。
#
# 出力するだけでフラグの作成・削除はしない（親ディレクトリだけ用意する）。
set -uo pipefail

session_id="${1:-${CLAUDE_CODE_SESSION_ID:-}}"
# ファイル名に使えない文字を除去（UUID は元々安全だが念のため）。
session_id="$(printf '%s' "$session_id" | tr -c 'A-Za-z0-9._-' '_')"
[[ -z "$session_id" ]] && session_id="no-session"

dir="${TMPDIR:-/tmp}/claude-skill-guard"
mkdir -p "$dir" 2>/dev/null || true

printf '%s/%s.flag\n' "$dir" "$session_id"
