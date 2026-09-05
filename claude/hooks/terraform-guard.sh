#!/usr/bin/env bash
# terraform-guard.sh — インフラ変更にブレーキをかける PreToolUse(Bash) Hook。
#
# `terraform apply` と `terraform destroy` をブロックする。
# `terraform init` / `terraform plan` / `terraform fmt` などその他のコマンドは許可する。
# インフラ変更は PR レビューを経てから適用する運用にするため、Claude が勝手に
# apply / destroy しないようにするだけのシンプルな Hook。
#
# stdin に渡されるツール呼び出し JSON から .tool_input.command を取り出し、
# ブロック対象が見つかったら permissionDecision: "deny" を返す。

set -uo pipefail

input="$(cat)"

# bash コマンド本体を取り出す（jq 失敗やキー不在なら空文字）。
command="$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || true)"

if [[ -z "$command" ]]; then
  exit 0
fi

# terraform の apply / destroy 呼び出しを検出する。
# 行頭・空白・シェル区切り（; & |）・パス区切り（/）のいずれかの直後に terraform が来て、
# 任意のグローバルオプション（例: -chdir=infra）を挟んだうえで apply / destroy が続く形をマッチ。
# 例にマッチ: `terraform apply` / `cd infra && terraform apply -auto-approve`
#            `/usr/local/bin/terraform destroy` / `terraform -chdir=infra apply`
# マッチしない: `terraform plan` / `terraform plan -out=apply.tfplan` / `terraform init`
blocked_re='(^|[[:space:];&|/])terraform([[:space:]]+-[^[:space:]]+)*[[:space:]]+(apply|destroy)([[:space:]]|$)'

if [[ "$command" =~ $blocked_re ]]; then
  sub="${BASH_REMATCH[3]}"
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "terraform ${sub} はこの Hook でブロックされています。インフラ変更は PR レビューを経てから適用してください（init / plan / fmt は許可されています）。"
  }
}
EOF
  exit 0
fi

exit 0
