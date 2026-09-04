---
name: pr
description: |
  現在の変更をもとに、コミットして GitHub Pull Request までまとめて実行するスキル。
  main ブランチ上では新しい作業ブランチを作成してから進め、
  EnterWorktree で作成した worktree（.claude/worktrees/ 配下）上では
  既存の worktree ブランチをそのまま使って進める。
  それ以外（通常チェックアウトの main 以外のブランチ）では必ず処理を断る。

  以下の文脈で積極的に使うこと：
  - 「今の変更をブランチ切ってコミットしてPRまで出して」
  - 「main からブランチ作ってそのまま PR を作りたい」
  - 「現在の差分を見て branch / commit / PR を一気にやって」
  - 「worktree で作業した変更をそのまま PR にして」

  すでにコミットが済んでいて PR を作るところだけが残っている場合は `pr-only` スキルを使う。
context: fork
agent: pr-creator
---

# pr スキル

現在の変更を見て、コミットし、PR 作成まで進める。main 上では新しいブランチを切り、
worktree 上では既存の worktree ブランチをそのまま使う。

`commit` と `pr-only` の既存ルールに従いながら、以下の順で処理する。

## Step 0: skill-guard フラグを作成する

このスキル経由の操作であることを skill-guard Hook に伝えるため、**最初に**フラグファイルを作成する。これを行わないと Step 4 の `git commit` と Step 6 の `gh pr create` が Hook にブロックされる。

**2つのコマンドに分けて実行する。** コマンド置換を含む1行（`touch "$(bash …)"`）は Bash の事前チェックに弾かれる。

```bash
bash "$HOME/.claude/hooks/skill-flag-path.sh"
```

出力されたパスを、そのまま次のコマンドに渡す。

```bash
touch "<出力されたパス>"
```

フラグはセッション単位で分かれている。**サブエージェント側で作っても、親セッションの
`git commit` には効かない。** このスキルはフォークして動くので、親セッションが続きを
実行する場合は親側でも作り直す。

## Step 1: 実行モードを判定する

```bash
git branch --show-current
git status --short
git rev-parse --show-toplevel
```

| 状況 | モード |
| --- | --- |
| リポジトリのトップレベルが `.claude/worktrees/` 配下 | **worktree モード**：現在のブランチをそのまま使う（Step 3 はスキップ） |
| worktree ではなく、現在のブランチが `main` | **main モード**：Step 3 で新しいブランチを作成する |
| worktree ではなく、ブランチも `main` 以外 | 処理を断る（下記の文言） |

worktree 上なのにブランチが `main` の場合も、異常な状態なので処理を断る。

処理を断るときは必ず次の形式で伝える：

```text
このコマンドは main ブランチ、または worktree 上でのみ実行できます。
現在のブランチ: <branch-name>
main に切り替えて再実行するか、すでにコミット済みの変更を PR にしたい場合は
/pr-only を使ってください。
```

- 変更がない場合も終了し、「コミット対象の変更がない」と伝える
- ただし worktree モードでは、未コミットの変更がなくても、ベースブランチとの差分コミット
  （`git log origin/main..HEAD` など）が残っていれば続行する。この場合 Step 2〜4 を飛ばして
  Step 5（push）へ進む

## Step 2: 差分を読む

```bash
git diff --staged
git diff
```

- ステージ済み変更がある場合は、そのスコープを優先する
- 未ステージ変更のみなら、関連ファイルを個別指定でステージする
- `git add .` と `git add -A` は使わない
- `.env` などの機密情報は含めない

## Step 3: ブランチ名を作成する（main モードのみ）

**worktree モードではこの Step をスキップする。** worktree のブランチは ExitWorktree の
後片付けがブランチ名で追跡しているため、rename（`git branch -m`）もしない。

差分から短い英語の kebab-case ブランチ名を作る。

- 機能追加: `feature/<topic>`
- バグ修正: `fix/<topic>`
- リファクタリング: `refactor/<topic>`
- ドキュメント: `docs/<topic>`
- その他: `chore/<topic>`

```bash
git switch -c <branch-name>
```

## Step 4: コミットする

`commit` スキルのルールに従う。

- 絵文字プレフィックス付きの日本語メッセージ
- 要約は簡潔に 1 行
- 必要なら本文を付ける
- amend しない
- フックはスキップしない

## Step 5: push する

```bash
git push -u origin <branch-name>   # worktree モードでは現在のブランチ名をそのまま使う
```

## Step 6: PR を作る

`pr-only` スキルのルールに従う。

- **`--draft` を付けて作る**（レビュー不要と明示された場合を除く）
- **`--assignee "@me"` で担当者を自分にする**（別の人を指定されたらその人）
- ベースブランチは `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'` で確認
- 取得できなければ `main`
- PR タイトルは変更全体を表す日本語で簡潔にまとめる
- PR 本文には必ず次を含める

```md
## 変更概要

## スクリーンショット
```

## Step 7: 結果を報告する

以下を伝える。

- 作成したブランチ名
- コミットメッセージ
- PR URL

失敗した場合は、どの段階で止まったかと原因を簡潔に伝える。

## Step 8: 実装意図を PR に添える

draft で作ったら、**依頼を待たずに `/pr-review` スキルへ進む。** 判断のあった行に
実装意図を添え、レビューを待ち受ける。ここで終わりにしない。
