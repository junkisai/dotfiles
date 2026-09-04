---
name: cleanup-worktrees
description: |
  過去のセッションで溜まった git worktree を一括で掃除するスキル。カレントリポジトリに
  登録されている worktree を、パスを問わずすべて対象にする。Claude Code が作る
  `.claude/worktrees/` 配下も、Orca が `~/orca/workspaces/` に作って codex や claude を
  動かすものも含む。マージ済みと確認できた worktree とそのブランチだけを削除し、
  未マージ・未コミット変更あり・使用中のものはスキップして報告する。

  以下の文脈で積極的に使うこと：
  - 「worktree をそうじして」「worktree を片付けて」「worktree 掃除して」
  - 「マージ済みの worktree を消して」「溜まった worktree を整理して」
  - 「codex の worktree も片付けて」「Orca の worktree を整理して」
  - PR マージ後の「そうじして」「後片付けして」
  ※ いま自分が入っている worktree から抜けて消す場合はこのスキルではなく
  ExitWorktree ツール（action: "remove"）を使う。
context: fork
agent: worktree-cleaner
---

# cleanup-worktrees スキル

カレントリポジトリに登録されている worktree のうち、マージ済みと確認できたものだけを
worktree・ブランチともに削除する。**迷ったら消さずにスキップして報告する。**

対象をパスで限定しない。`git worktree list` に出るものはすべて候補になる。以前は
`.claude/worktrees/` 配下だけを見ていたが、Orca が `~/orca/workspaces/<repo>/<name>` に作る
worktree（codex や claude をそこで起動する）が掃除できなかったため、パスによる絞り込みを
やめた。**その分、Step 2 のロック判定と Step 3 の安全判定だけが誤削除に対する唯一の歯止めに
なる。どちらも省略しない。**

---

## Step 1: 前提確認と情報収集

対象リポジトリ（指定がなければカレントディレクトリ）で以下を実行する。
git リポジトリでなければ、その旨を報告して終了する。

```bash
git rev-parse --show-toplevel
git remote get-url origin        # origin の有無を確認
git fetch --prune origin         # origin がある場合のみ。最初から require_escalated
git worktree list --porcelain
pwd
```

`orca` コマンドがある場合は、Orca 管理下の worktree も把握する：

```bash
command -v orca && orca worktree list --json
```

**デフォルトブランチの特定**（上から順に試す）：

1. `git symbolic-ref --short refs/remotes/origin/HEAD`（`origin/main` → `main`）
2. `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'`（require_escalated）
3. どちらも取れなければ `main`

origin が無いローカルリポジトリでは、fetch と Step 3 の PR 判定を省略し、
ローカルのデフォルトブランチ基準で判定する。

---

## Step 2: 掃除対象を選定する

`git worktree list --porcelain` の全エントリを見て、**次のいずれかに当てはまるものを候補から
除外する**。除外したものは理由とともに報告する。

| 除外条件 | 判定方法 | 理由 |
| --- | --- | --- |
| メインの working tree | リスト先頭のエントリ | 掃除対象ではない |
| 使用中 | `pwd` がそのパス配下にある | 自分が入っている |
| detached HEAD | `detached` 行がある（`branch` 行が無い） | ブランチが無くマージ判定ができない |
| 生きているセッションがロック中 | 下記「ロックの扱い」を参照 | 別セッションが作業中 |
| 理由の読めないロック | 同上 | 誰が使っているか判断できない |

ユーザーが worktree 名やパスを指定した場合はそれだけを候補にする。
候補が 1 つもなければ「掃除対象の worktree はない」と報告して終了する。

### ロックの扱い

`git worktree list --porcelain` は、ロックされた worktree に `locked <理由>` の行を出す。
Claude Code は自分が使用中の worktree に次の形式でロックをかける。

```
locked claude session add-skills (pid 46451 start Fri Sep  4 10:08:51 2026)
```

理由から pid を取り出し、そのプロセスが生きているかを確認する：

```bash
ps -p <pid> -o pid=
```

- **プロセスが生きている** → 別セッションが作業中。**スキップする。**
- **プロセスが死んでいる** → セッションが異常終了した残骸。候補にしてよい。削除の直前に
  `git worktree unlock <path>` でロックを外す。
- **pid が読み取れないロック** → 誰が握っているか判断できないので**スキップし、ロック理由を
  そのまま報告する**。ユーザーが自分で判断できるようにする。

---

## Step 3: 候補ごとに安全判定する

各候補について順に確認する：

1. **未コミット変更の確認**

   ```bash
   git -C <worktree-path> status --porcelain
   ```

   出力が 1 行でもあれば**スキップ**（理由：未コミット変更あり）。

2. **マージ済み判定** — 以下のいずれか 1 つでも満たせば削除可：

   ```bash
   git merge-base --is-ancestor <branch> origin/<default>   # exit 0 なら取り込み済み
   git log origin/<default>..<branch> --oneline             # 空なら固有コミットなし
   gh pr view <branch> --json state --jq '.state'           # MERGED なら squash マージ済み（require_escalated）
   ```

   （origin が無い場合は `origin/<default>` の代わりにローカルの `<default>` を使い、
   `gh pr view` は省略する）

3. どれも満たさなければ**スキップ**（理由：未マージ）。

---

## Step 4: 削除する

削除可と判定した worktree だけを処理する。**Orca 管理下かどうかで手段が変わる。**

### Orca 管理下の worktree

Step 1 の `orca worktree list --json` にそのパスが含まれていれば Orca 管理下。
生の `git worktree remove` で消すと Orca 側のメタデータだけが残り、`orca worktree list` に
存在しない worktree が並び続けるため、必ず Orca 経由で消す。

```bash
orca worktree rm --worktree path:<worktree-path>
```

- ブランチの削除も Orca が行う。マージ済みと証明できないブランチは Orca 側が残す。
- `--force` は使わない。失敗したらスキップして理由を報告する。

### それ以外の worktree

```bash
git worktree unlock <worktree-path>   # Step 2 で「死んだ pid のロック」と判定した場合のみ
git worktree remove <worktree-path>   # --force は使わない
git branch -d <branch>
```

- `git branch -d` が「not fully merged」で失敗し、かつ Step 3 で **PR の state が MERGED と
  確認できている場合のみ**、`git branch -D <branch>` を使ってよい（squash マージでは
  ローカル履歴上マージ済みに見えないため）。それ以外での `-D` は禁止。
- `git worktree remove` が失敗した場合は `--force` に切り替えず、スキップして理由を報告する。
- `rm -rf` での直接削除は絶対にしない。

---

## Step 5: 仕上げと報告

```bash
git worktree prune
git worktree list
```

以下を報告する：

- 削除した worktree とブランチの一覧（Orca 経由で消したものはその旨も）
- スキップした worktree の一覧と理由（未コミット変更あり / 未マージ / 使用中 /
  detached HEAD / ロック中）
- 掃除後に残っている worktree

---

## 注意事項

- **メインの working tree と、使用中・ロック中の worktree には触らない。** パスによる
  絞り込みが無いぶん、この判定を飛ばすと他人が作業中の worktree を消しうる。
- **迷ったら消さない**。スキップして理由を報告する方が、誤削除より常に良い。
- **カレントリポジトリに登録されている worktree だけが対象。** 別リポジトリの worktree を
  掃除したい場合は、そのリポジトリでこのスキルを実行し直す。
- ネットワークを伴うコマンド（`git fetch`、`gh repo view`、`gh pr view`）は
  **最初から `sandbox_permissions: require_escalated` を付けて実行する**。
- ブランチだけ残って worktree が無いもの（削除済み worktree の残骸ブランチ）は
  このスキルの対象外。ユーザーに存在だけ伝える。
