---
name: cleanup-worktrees
description: "指定リポジトリのマージ済み・未使用の Git worktree とブランチを整理する。"
context: fork
agent: worktree-cleaner
---

# Worktree の整理

指定リポジトリの `git worktree list --porcelain` を基準に、パスを問わず候補を調べる。指定された名前やパスがあればその範囲に限る。

## 削除できる条件

- メインの作業ディレクトリ、現在使用中の場所、detached HEAD、使用中のセッション、未コミット・未追跡の変更がある場所を除外する。
- `locked` の理由を読む。PID を確認できて生存していれば除外する。所有者や生死が不明なロックも除外する。明らかに終了したセッションのロックだけ、削除直前に解除できる。
- リモートがあれば最新のベースを取得し、`git merge-base --is-ancestor <branch> <base>` で取り込み済みを確認する。取得失敗やベース不明をマージ済みと扱わない。
- squash merge の場合は PR の MERGED 状態に加えて、その PR の head と現在の branch tip が一致することを確認する。マージ後の追加コミットがあれば残す。対応 PR や取り込み済みの証拠が曖昧なら削除しない。
- リモートがない場合は、確認できたローカルのベースブランチを基準にする。

## 削除と完了

Orca 管理下なら `orca-cli` の現在のガイドから管理情報と削除方法を確認し、Orca 経由で処理する。通常の worktree は `git worktree remove <path>`、成功後に `git branch -d <branch>` を使う。

`--force` や `rm -rf` は使わない。`-d` が squash merge のため失敗した場合だけ、上の PR と head の一致を再確認して `-D` を使える。失敗や曖昧さがあればその候補をスキップして他を進める。

最後に残存 worktree を確認し、削除・スキップとその理由を報告する。worktree のないブランチの一括削除は対象に含めない。
