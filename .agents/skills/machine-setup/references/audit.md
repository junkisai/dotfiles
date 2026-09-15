# 棚卸し


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

## Step 3: 移行対象を決める

既に移行対象として指定されたものは反映する。不要かどうか判断できない候補だけをまとめて確認する。

- 件数が多いときは種類ごとにまとめて聞く（「この5つはすべて cask に寄せてよいか」）
- 判断に必要な材料を添える。何のアプリか、cask があるか、いつから入っているか
- **勝手に消さない。** 孤児 formula も、削除候補として見せてから決める

## Step 4: 反映して PR にする

決まったものだけを `Brewfile` と `docs/setup.md` に反映する。

- brew で入るものは Brewfile。cask があるなら cask に寄せる
- App Store 経由と手動ダウンロードは `docs/setup.md` のチェックリスト
- 配布元が分からないアプリは、**推測の URL を書かない**。分からないと書くか、項目ごと落とす

反映したら `brew bundle check --file=Brewfile` でパースを確かめ、PR 作成まで依頼されている場合は `pr` スキルで PR にする。

---
