# Orca browser での確認

コマンドは `orca-cli` スキルの Built-In Browser に従う（`orca skills get orca-cli --reference references/browser.md`）。ここには確認で外さない使い方だけを書く。

## タブと範囲

- 確認用のタブを自分で作り（`tab create`）、以後のコマンドすべてに `--page <browserPageId>` を付ける。ユーザーが開いているタブを流用・遷移させない。`--worktree all` で他のワークスペースのタブに触らない。
- 閉じてよいのは自分で作ったタブだけ。
- 操作 → `snapshot` → 次の操作の順に進める。遷移・タブ切り替え・ページが変わるクリックの後は ref が無効になるので `snapshot` を取り直す。非同期の完了は `wait --text / --url / --selector` で待ち、固定時間の待ちで済ませない。
- 観測の根拠は、`snapshot` の文言、`get` / `is`、`screenshot` に置く。

## console / network は操作の前に始める

`console` と `network` は、`capture start` より後の出来事しか返さない。始める前に起きたエラーは空で返るため、「空だった」を「エラーなし」と読まない。エラー状態を裏取りするときは、操作の前に `capture start` を実行する。画面で見えた事実の代わりにはせず、裏取りに使う。

## local

`package.json` / README から起動方法を確認し、プロジェクトが提供するテスト認証またはモックを使う。認証回避を新しく作る前提にはしない。状態を作り込むときは `set offline`、`storage`、`viewport`、`set device` が使える。専用タブの中だけで使う。

## staging

Orca browser の Default プロファイルに残っているログイン状態を使う。未ログインなら、ユーザーに Orca のブラウザで一度ログインしてもらう。認証情報を代わりに入力しない。別アカウントで確認したいときは `tab profile` でプロファイルを分ける。

書き込み操作は、依頼で許可されたテストデータ・操作に限る。ログアウトはしない。実データが映るときは、録画でマスクする（[録画手順](recording.md)）。

## PR への投稿

PR への結果投稿まで依頼されているときは、実際に観測した結果を一時ファイルに書き、`gh pr comment <PR> --body-file <file>` を使う。未実施を成功扱いしない。
