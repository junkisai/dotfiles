# dotfiles

Mac の設定・アプリ一覧・Claude Code のスキルを1つに置いてある。

| 場所 | 中身 |
| --- | --- |
| `Brewfile` | Homebrew で入るツールとアプリ |
| `docs/setup.md` | brew では入らないもののセットアップ手順 |
| `.agents/skills/` | Claude Code のスキル。`~/.claude/skills` と `~/.agents/skills` からリンクを張る |
| `.zshrc` `.gitconfig` `.config/` | シェルと各種ツールの設定 |

## 新しい Mac を開いたら

ここだけは手で打つ。**SSH 鍵はまだ無いので clone は HTTPS で行う。**

```sh
# 1. コマンドラインツールと Homebrew
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"

# 2. このリポジトリを取得
git clone https://github.com/junkisai/dotfiles.git ~/Github/junkisai/dotfiles
cd ~/Github/junkisai/dotfiles

# 3. brew で入るものを一括インストール
brew bundle --file=Brewfile
```

ここまでで Homebrew 管理下のツールとアプリが揃う。

続きは **[docs/setup.md](docs/setup.md)** にある。App Store・配布サイトからのインストール、
brew の外から入る CLI、設定ファイルの配置が残っている。

Claude Code を入れたあとなら、`/machine-setup install` で残りの手順に伴走させられる。

## アプリの出入りを反映する

Brewfile は書いた日のスナップショットなので、放っておくと実態からズレる。

```sh
/machine-setup audit
```

現行マシンと Brewfile の差分を出し、要否を確認して Brewfile と `docs/setup.md` に反映する。
移行の直前ではなく、普段から回しておく。
