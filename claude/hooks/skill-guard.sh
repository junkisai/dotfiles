#!/usr/bin/env bash
# skill-guard.sh — コマンドの直接実行を防ぐ PreToolUse(Bash) Hook。
#
# `git commit` と `gh pr create` を Claude が直接実行するのをブロックする。
# これらには専用スキル（/commit, /pr-only, /pr）があり、lint・型チェック・テスト・
# 適切な粒度での分割・Conventional Commits 形式のメッセージ生成・PR 本文の自動生成
# などが組み込まれている。直接実行されるとそれらをすべてスキップしてしまう。
#
# 判定はフラグファイルの有無で行う。スキルは実行開始時に skill-flag-path.sh が示す
# パスにフラグを作成するため、スキル経由なら本 Hook は素通しする。
# フラグはセッション単位で分けてあるので、worktree を並行利用しても干渉しない。
#
# gh pr の view / list / diff など読み取り系は素通しし、邪魔にならないようにしている。
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

input="$(cat)"

# jq が無い環境では誤ブロックを避けて素通しする。
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

command="$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || true)"
[[ -z "$command" ]] && exit 0

session_id="$(printf '%s' "$input" | jq -r '.session_id // ""' 2>/dev/null || true)"
flag_file="$(bash "$SCRIPT_DIR/skill-flag-path.sh" "$session_id" 2>/dev/null || true)"

# スキル経由（フラグあり）なら全て素通し。
if [[ -n "$flag_file" && -f "$flag_file" ]]; then
  exit 0
fi

deny() {
  jq -n --arg reason "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}

# 行頭・空白・シェル区切り（; & |）・サブシェル開始 (・パス区切り / のいずれかの直後の
# git / gh をコマンド境界として検出する。git のグローバルオプション（例: -C path,
# -c key=val）を任意に挟んだうえで subcommand が続く形をマッチさせる。
git_commit_re='(^|[[:space:];&|(/])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]]+)?)*[[:space:]]+commit([[:space:]]|$)'
gh_pr_create_re='(^|[[:space:];&|(/])gh([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]]+)?)*[[:space:]]+pr[[:space:]]+create([[:space:]]|$)'

if [[ "$command" =~ $git_commit_re ]]; then
  deny "git commit を直接実行しないでください。代わりに /commit スキル（ブランチ作成から PR まで一気にやる場合は /pr スキル）を使用してください。lint・型チェック・テストの実行、適切な粒度への分割、絵文字プレフィックス付きメッセージの生成が組み込まれています。"
fi

if [[ "$command" =~ $gh_pr_create_re ]]; then
  deny "gh pr create を直接実行しないでください。代わりに /pr-only スキル（ブランチ作成から一気にやる場合は /pr スキル）を使用してください。コミット履歴からの日本語タイトル・本文の自動生成が組み込まれています。"
fi

exit 0
