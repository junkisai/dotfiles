# 新しい Mac のセットアップ

Homebrew の導入・clone・`brew bundle`・Claude Code とスキルのリンクは
[README](../README.md) にある。それが済んでいる前提で、
ここは brew では入らないもの（App Store・手動ダウンロード・brew の外で入るツール）を
上から順に扱う。

`/machine-setup install` で、この手順に伴走させられる。

## 1. App Store から入れる

Apple ID でサインインしてから、購入済み一覧を開いて入れる。

- [ ] Xcode
- [ ] LINE

## 2. 配布サイトから手動で入れる

cask が無いもの。

- [ ] **eTax** — 国税庁 e-Tax ソフト / e-tax.nta.go.jp
- [ ] **HHKB キーマップ変更ツール** — PFU。`HHKB` フォルダと `hhkb-keymap-tool.app` の2つ
- [ ] **UCAM-CX80FB** — エレコム製 Web カメラのユーティリティ

## 3. brew の外から入る CLI

上から順に叩く。**`.zshrc` の配置（手順4）は必ずこの後に行う。**
oh-my-zsh と pnpm のインストーラはどちらも `~/.zshrc` を書き換えるので、
先に配置すると上書きされる。

```sh
# oh-my-zsh と zsh-autosuggestions（.zshrc の plugins が参照）
# KEEP_ZSHRC=yes を付けないと既存の .zshrc を退避して雛形で置き換える
RUNZSH=no CHSH=no KEEP_ZSHRC=yes \
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
git clone https://github.com/zsh-users/zsh-autosuggestions \
  ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions

# pnpm 本体（公式インストーラ。~/Library/pnpm に入り、.zshrc の PNPM_HOME と揃う）
curl -fsSL https://get.pnpm.io/install.sh | SHELL=/bin/zsh sh -

# pnpm グローバル
pnpm add -g @openai/codex gitmoji-cli wrangler

# pipx（transcribe-audio スキルが使う）
pipx install mlx-whisper
```


## 4. 設定ファイルを配置する

```sh
cd ~/Github/junkisai/dotfiles
cp .zshrc ~/.zshrc
cp .gitconfig ~/.gitconfig
mkdir -p ~/.config/ghostty && cp .config/ghostty/config ~/.config/ghostty/config

# pmset ラッパー。.zshrc の alias が sudo つきで ~/.local/bin/ を参照する
mkdir -p ~/.local/bin && cp bin/awake bin/nap ~/.local/bin/
```

`bin/awake` は蓋を閉じてもスリープさせない設定に、`bin/nap` は10分でスリープする
既定に戻す。実行ビットごとリポジトリで管理しているので、`cp` するだけで使える。

スキルのリンクは README のブートストラップ（`scripts/link-skills.sh`）で張り終えている。
スキルを足したあとに張り直すときも、同じスクリプトを叩けばよい。

`.config/ghostty/config` は配色とフォント設定の控えとして置いてある。
Ghostty 本体は入れないので Brewfile に cask は無い。
