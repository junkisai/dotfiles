#!/usr/bin/env bash
#
# 新しく作られた git worktree に、本体（メイン作業ツリー）の gitignore 対象 env ファイルを
# シンボリックリンクする。EnterWorktree ツールと `git worktree add` の両方で発火する。
#
# 対象: リポジトリのメイン作業ツリー直下、および apps/*/ 直下の .env / .env.*（.env.local 含む）
#       のうち gitignore されているもの（＝秘密の env）。.env.example のような追跡済みファイルは除く。
# 方針: worktree 側の同じ相対パスへ symlink（既にあれば触らない）。symlink 不可ならコピー。
#       worktree 作成でないツール呼び出しは即 no-op。失敗しても他のツールをブロックしない。
#
# 標準入力: Claude Code のフック JSON（.tool_name / .tool_input.command / .tool_response）
#
# 依存: jq, git

input="$(cat 2>/dev/null || true)"
command -v jq >/dev/null 2>&1 || exit 0
command -v git >/dev/null 2>&1 || exit 0

tool="$(printf '%s' "$input" | jq -r '.tool_name // ""' 2>/dev/null || true)"

wt=""
case "$tool" in
  EnterWorktree)
    # tool_response は文字列またはオブジェクト。テキスト化して "worktree at <PATH>" を拾う。
    resp="$(printf '%s' "$input" \
      | jq -r '(.tool_response // "") | if type=="string" then . else tostring end' 2>/dev/null || true)"
    wt="$(printf '%s' "$resp" \
      | grep -oE '(Created|Entered|Switched into) worktree (at )?/[^"[:space:]]+' \
      | grep -oE '/[^"[:space:]]+' | head -1 || true)"
    ;;
  Bash)
    cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || true)"
    printf '%s' "$cmd" | grep -qE 'worktree[[:space:]]+add' || exit 0
    # "worktree add" 以降を語に分解し、フラグ（と値を取る -b/-B）を飛ばして最初の位置引数＝パス。
    rest="${cmd#*worktree add}"
    # shellcheck disable=SC2086
    set -- $rest
    while [ "$#" -gt 0 ]; do
      case "$1" in
        -b|-B) shift 2 2>/dev/null || shift; continue ;;
        --) shift; continue ;;
        -*) shift; continue ;;
        *) wt="$1"; break ;;
      esac
    done
    ;;
  *)
    exit 0
    ;;
esac

[ -n "$wt" ] || exit 0
[ -d "$wt" ] || exit 0

# worktree が属するリポジトリのメイン作業ツリー（porcelain の先頭 worktree 行）。
main="$(git -C "$wt" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2; exit}')"
[ -n "${main:-}" ] || exit 0
[ -d "$main" ] || exit 0
[ "$main" = "$wt" ] && exit 0

# 候補: メイン直下と apps/*/ 直下の .env / .env.*（.env は .env.* に含まれないので別途）。
candidates="$(
  {
    ls -1 "$main"/.env "$main"/.env.* 2>/dev/null || true
    ls -1 "$main"/apps/*/.env "$main"/apps/*/.env.* 2>/dev/null || true
  }
)"

printf '%s\n' "$candidates" | while IFS= read -r src; do
  [ -n "$src" ] || continue
  [ -f "$src" ] || continue
  # 追跡済み（.env.example 等）は対象外。gitignore された秘密 env だけをリンクする。
  git -C "$main" check-ignore -q "$src" 2>/dev/null || continue
  rel="${src#"$main"/}"
  dest="$wt/$rel"
  if [ -e "$dest" ] || [ -L "$dest" ]; then continue; fi  # 既にあれば触らない（壊れた symlink も含む）
  mkdir -p "$(dirname "$dest")" 2>/dev/null || continue
  ln -s "$src" "$dest" 2>/dev/null || cp "$src" "$dest" 2>/dev/null || true
done

exit 0
