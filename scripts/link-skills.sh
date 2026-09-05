#!/usr/bin/env bash
# .agents/skills/ を実体として ~/.claude/skills と ~/.agents/skills からリンクを張る。
# Claude Code はスキルを起動時に読むので、リンクが無いと /machine-setup すら呼べない。
# セットアップを伴走させる前提そのものなので、README のブートストラップから叩く。
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

linked=0
skipped=0
pruned=0
unsynced=()

for target in "$HOME/.claude/skills" "$HOME/.agents/skills"; do
  mkdir -p "$target"

  # 実体が消えたリンクを片付ける。リポジトリからスキルを消しても、
  # 張るだけでは古いリンクが残り続けて壊れたまま居座る。
  for link in "$target"/*; do
    if [ -L "$link" ] && [ ! -e "$link" ]; then
      rm "$link"
      echo "prune: $(basename "$link") は実体が無いのでリンクを外した"
      pruned=$((pruned + 1))
    fi
  done

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

  # リポジトリに無い実ディレクトリ＝このマシンにしか無いスキル。
  # 上の skip は「リポジトリにもあるのに実体が居座っている」場合しか出ないので、
  # 完全にローカルなものは黙って取り残される。最後にまとめて知らせる。
  for dir in "$target"/*/; do
    [ -d "$dir" ] || continue
    [ -L "${dir%/}" ] && continue
    name="$(basename "$dir")"
    [ -d "$REPO/.agents/skills/$name" ] && continue
    unsynced+=("${target/#$HOME/~}/$name")
  done
done

echo "リンク: ${linked}件 / スキップ: ${skipped}件 / 掃除: ${pruned}件"

if [ ${#unsynced[@]} -gt 0 ]; then
  echo
  echo "同期されていないスキル（このマシンにしか無い）:"
  printf '  %s\n' "${unsynced[@]}"
  echo "  別のマシンでも使うなら .agents/skills/ へ移して張り直す"
fi

echo "Claude Code を再起動するとスキル一覧に反映される"
