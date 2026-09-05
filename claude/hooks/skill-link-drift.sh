#!/usr/bin/env bash
#
# スキルの実体（dotfiles/.agents/skills/）と、読み取り先のリンクがずれたら知らせる。
#
# 編集はリンク越しに実体へ届くので放っておいてよいが、追加と削除はそうではない。
#   - 追加: リポジトリに増えてもリンクが無いので Claude Code から見えない
#   - 削除: リポジトリから消してもリンクが残り、行き先の無いリンクとして居座る
# どちらも scripts/link-skills.sh の再実行で直る。忘れやすいので気づけるようにする。
#
# 別のマシンで追加されたスキルを git pull で受け取った場合も同じずれ方をする。
# Bash を使えば必ず発火するので、pull の直後に気づける。
#
# 毎回言われると煩いので、ずれの内容が変わったときだけ出す。
#
# 標準入力: Claude Code のフック JSON（使わないが読み捨てる）
# 終了コード: 常に 0。通知だけで、他のツールを止めない。

cat >/dev/null 2>&1 || true

REPO="$HOME/Github/junkisai/dotfiles"
SRC="$REPO/.agents/skills"
STAMP="$HOME/.claude/hooks/.skill-link-drift"

[ -d "$SRC" ] || exit 0

missing=()
stale=()

for target in "$HOME/.claude/skills" "$HOME/.agents/skills"; do
  [ -d "$target" ] || continue

  # 実体はあるのにリンクが無い＝追加された
  for src in "$SRC"/*/; do
    [ -d "$src" ] || continue
    name="$(basename "$src")"
    [ -e "$target/$name" ] || missing+=("$name")
  done

  # リンクはあるのに実体が無い＝削除された
  for link in "$target"/*; do
    [ -L "$link" ] && [ ! -e "$link" ] && stale+=("$(basename "$link")")
  done
done

[ ${#missing[@]} -eq 0 ] && [ ${#stale[@]} -eq 0 ] && exit 0

# 同じずれを何度も言わない。内容が変わったときだけ知らせる。
sig="$(printf '%s\n' "${missing[@]-}" "${stale[@]-}" | sort -u | tr '\n' ',')"
[ -f "$STAMP" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$sig" ] && exit 0
printf '%s' "$sig" > "$STAMP" 2>/dev/null || true

echo "スキルのリンクがずれています。"
uniq_list() { printf '%s\n' "$@" | sort -u | tr '\n' ' '; }
if [ ${#missing[@]} -gt 0 ]; then
  echo "  追加された（リンク未作成）: $(uniq_list "${missing[@]}")"
fi
if [ ${#stale[@]} -gt 0 ]; then
  echo "  削除された（リンクが残存）: $(uniq_list "${stale[@]}")"
fi
echo "  直すには: bash $REPO/scripts/link-skills.sh"
echo "  そのあと Claude Code を再起動すると一覧に反映される"

exit 0
