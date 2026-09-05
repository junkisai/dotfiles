#!/usr/bin/env bash
# .agents/skills/ を実体として ~/.claude/skills と ~/.agents/skills からリンクを張る。
# Claude Code はスキルを起動時に読むので、リンクが無いと /machine-setup すら呼べない。
# セットアップを伴走させる前提そのものなので、README のブートストラップから叩く。
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

linked=0
skipped=0

for target in "$HOME/.claude/skills" "$HOME/.agents/skills"; do
  mkdir -p "$target"

  for src in "$REPO"/.agents/skills/*/; do
    name="$(basename "$src")"
    dest="$target/$name"

    # 実ディレクトリが居座っていると ln はその中にリンクを作ってしまうので手を出さない
    if [ -d "$dest" ] && [ ! -L "$dest" ]; then
      echo "skip: $dest は実ディレクトリ。手で退けてから張り直す"
      skipped=$((skipped + 1))
      continue
    fi

    ln -sfn "${src%/}" "$dest"
    linked=$((linked + 1))
  done
done

echo "リンク: ${linked}件 / スキップ: ${skipped}件"
echo "Claude Code を再起動するとスキル一覧に反映される"
