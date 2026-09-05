---
name: machine-setup
description: |
  Mac のセットアップ内容をリポジトリと一致させ続けるスキル。Brewfile と docs/setup.md を
  実態の写しとして扱い、ズレを見つけて埋める。audit / install の2モードを持つ。
  audit は現行マシンを棚卸しして Brewfile を最新化し、install は新しいマシンで
  残りの手順に伴走する。

  以下の文脈で積極的に使うこと：
  - 「アプリ一覧を最新にして」「Brewfile を棚卸しして」「入れたアプリを反映して」
  - 「PC を買い替えるので準備して」「移行前に棚卸しして」
  - 「新しい Mac のセットアップを進めて」「セットアップの続きをやって」
  - 「/machine-setup」「/machine-setup audit」「/machine-setup install」
---

# machine-setup スキル

Brewfile と `docs/setup.md` を、現行マシンの実態の写しとして保つ。

## なぜやるか

Brewfile は書いた日のスナップショットでしかない。アプリの出入りは日々あるので、
半年も経てば実態とズレる。**そのズレに気づくのは、たいてい新しい Mac を開けた後**で、
そのときにはもう古いマシンが手元にない。

だから移行の直前ではなく、**普段から audit を回してズレを潰しておく**。移行当日にやるのは
`brew bundle` と、機械にできない残りだけになる。

## モード

引数で指定する。省略時はどちらかを確認してから進める。

| モード | 走る場所 | やること |
| --- | --- | --- |
| audit | 現行マシン | 実態と Brewfile の差分を出し、1件ずつ要否を聞いて反映し、PR にする |
| install | 新しいマシン | `docs/setup.md` の手順に伴走し、詰まりを解消しながら最後まで進める |

- `/machine-setup audit` … 棚卸し
- `/machine-setup install` … 新マシンのセットアップ
- 引数なし … どちらか確認してから進める

**このスキルはブートストラップを担当しない。** Homebrew の導入・clone・`brew bundle`・
Claude Code の導入・`scripts/link-skills.sh` によるスキルのリンクは、スキルが動く前提そのもの
なので、README の手順として置いてある。clone しただけではリンクが無く、このスキル自体が
呼べない。install モードが引き継ぐのはその後からになる。

---

# audit モード

## Step 1: 差分を出す

```bash
bash .agents/skills/machine-setup/scripts/audit.sh
```

読み取りのみで、7つの節を出す。

| 節 | 中身 | 典型的な扱い |
| --- | --- | --- |
| 1 | Brewfile にあるが未インストール | 移行先で入る想定なら放置してよい |
| 2 | 明示的に入れたが Brewfile に無い formula | **追加候補** |
| 3 | インストール済みだが Brewfile に無い cask | **追加候補** |
| 4 | 孤児候補 formula | **削除候補** |
| 5 | `/Applications` にあって記載が無いアプリ | cask を調べて追加、または見送り |
| 6 | App Store 経由のアプリ | `docs/setup.md` の App Store 一覧と突き合わせる |
| 7 | brew の外から入っている CLI | 同じく「brew の外から入る CLI」と突き合わせる |

節1は移行前だと大量に出る（まだ brew 管理下に無いアプリはすべてここに出る）。
**そこを消し込もうとしない。** 見るのは節2〜7。

## Step 2: cask があるか調べる

節5に出たアプリについて、Homebrew に受け皿があるかを確認する。

```bash
brew info --cask <name> >/dev/null 2>&1 && echo あり || echo なし
```

名前は当たりを付ける必要がある。`Google Chrome` → `google-chrome`、
`Logi Options+` → `logi-options-plus` のように、小文字化してハイフンでつなぐのが基本形。
外れたら `brew search <keyword>` で探す。

アプリの正体が分からなければ bundle identifier を見る。節5の出力に併記されている。

## Step 3: 1件ずつ要否を聞く

**ここを飛ばさない。** 差分をそのまま反映すると、使わなくなったアプリまで移行先に運ぶことになる。

- 件数が多いときは種類ごとにまとめて聞く（「この5つはすべて cask に寄せてよいか」）
- 判断に必要な材料を添える。何のアプリか、cask があるか、いつから入っているか
- **勝手に消さない。** 孤児 formula も、削除候補として見せてから決める

## Step 4: 反映して PR にする

決まったものだけを `Brewfile` と `docs/setup.md` に反映する。

- brew で入るものは Brewfile。cask があるなら cask に寄せる
- App Store 経由と手動ダウンロードは `docs/setup.md` のチェックリスト
- 配布元が分からないアプリは、**推測の URL を書かない**。分からないと書くか、項目ごと落とす

反映したら `brew bundle check --file=Brewfile` でパースを確かめ、`pr` スキルで PR にする。

---

# install モード

新しいマシンで走らせる。README のブートストラップが終わっている前提。

## Step 1: どこまで終わったかを確認する

`docs/setup.md` を読み、各手順が済んでいるかを実際に確かめる。**聞くのではなく見る。**

```bash
brew bundle check --file=Brewfile     # 節2までが済んでいるか
ls /Applications                      # App Store と手動ぶんがどこまで入ったか
ls ~/.claude/skills ~/.agents/skills  # 設定ファイルの配置が済んでいるか
```

## Step 2: 残りをチェックリストにする

未了の項目を TODO にする。**1項目 = 1つの確認できる結果**にする。

順序を1つだけ守る。**Xcode のダウンロードを最初に始める。** 数十 GB あり、
他の作業と並行できる唯一の重い工程になる。

## Step 3: 上から進める

- brew で入るものは `brew bundle --file=Brewfile` に任せる
- App Store と手動ダウンロードは、ユーザーの操作が要る。**代わりに押さない。**
  何を開いて何を押すかを伝えて、終わったら次へ進む
- 設定ファイルの配置とシンボリックリンクはスキルが実行してよい

## Step 4: 動くことを確かめる

入れただけで終わりにしない。実際に叩いて確かめる。

```bash
exec zsh -l                  # .zshrc がエラーなく読めるか
command -v gh node python3   # PATH が通っているか
ls -l ~/.claude/skills       # リンクが切れていないか
```

## Step 5: ズレを持ち帰る

セットアップ中に「Brewfile に無いが要る」「あるが要らなかった」が必ず出る。
その場で audit モードの Step 3〜4 に合流し、PR にして残す。**次の移行のために直す。**

---

## 注意事項

- **audit は読み取りから始める。** `audit.sh` は一切書き換えない。反映は Step 4 だけ
- **節5の突き合わせは名前の正規化に頼っている。** 取りこぼしと誤検出はありうるので、
  最後は `ls /Applications` を目で見て確かめる
- **孤児 formula を自動で消さない。** `brew autoremove` は使わず、候補として見せる
- **配布元 URL を推測で書かない。** 移行当日に迷う原因になる
- App Store 経由かどうかは `Contents/_MASReceipt` の有無で判別できる。
  cask がある場合はどちらでも入るので、**cask を優先する**（更新が brew に一元化されるため）
