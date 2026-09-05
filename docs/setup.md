# 新しい Mac のセットアップ

上から順に実行する。`Brewfile` が自動化できる範囲を持ち、この文書は
それ以外（App Store・手動ダウンロード・brew の外で入るツール）を持つ。

## 1. 前提

```sh
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

## 2. brew でまとめて入れる

```sh
git clone git@github.com:junkisai/dotfiles.git ~/Github/junkisai/dotfiles
cd ~/Github/junkisai/dotfiles
brew bundle --file=Brewfile
```

中身は `Brewfile` を参照。formula・cask ともにここに集約している。

## 3. App Store から入れる

Apple ID でサインインしてから、購入済み一覧を開いて入れる。

- [ ] Xcode
- [ ] Portal
- [ ] LINE
- [ ] LINE WORKS
- [ ] 1Password for Safari — Safari 機能拡張。1Password 本体は cask 側
- [ ] Keynote
- [ ] Numbers
- [ ] Pages

## 4. 配布サイトから手動で入れる

cask が無いもの。

- [ ] **Dia** — The Browser Company のブラウザ / diabrowser.com
- [ ] **eTax** — 国税庁 e-Tax ソフト / e-tax.nta.go.jp
- [ ] **HHKB キーマップ変更ツール** — PFU。`HHKB` フォルダと `hhkb-keymap-tool.app` の2つ
- [ ] **Homedale** — Wi-Fi スキャナ / the-sz.com
- [ ] **UCAM-CX80FB** — エレコム製 Web カメラのユーティリティ
- [ ] **VTracer** — 画像を SVG に変換 / github.com/visioncortex/vtracer

## 5. brew の外から入る CLI

```sh
# oh-my-zsh と zsh-autosuggestions（.zshrc の plugins が参照）
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
git clone https://github.com/zsh-users/zsh-autosuggestions \
  ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions

# Claude Code（~/.local/bin/claude に入る）
curl -fsSL https://claude.ai/install.sh | bash

# pnpm グローバル
pnpm add -g @openai/codex gitmoji-cli wrangler

# pipx（transcribe-audio スキルが使う）
pipx install mlx-whisper
```

`~/.local/bin` には `awake` / `nap` も置いている。`.zshrc` の alias が
sudo つきで参照するので、移行時に現行マシンからコピーする。

## 6. 設定ファイルを配置する

スキルはリポジトリを実体にして、`~/.claude/skills` と `~/.agents/skills` から
1つずつシンボリックリンクを張る。

```sh
cd ~/Github/junkisai/dotfiles
cp .zshrc ~/.zshrc
cp .gitconfig ~/.gitconfig
mkdir -p ~/.config/ghostty && cp .config/ghostty/config ~/.config/ghostty/config

mkdir -p ~/.claude/skills ~/.agents/skills
for s in .agents/skills/*/; do
  name=$(basename "$s")
  ln -sfn "$PWD/.agents/skills/$name" ~/.claude/skills/"$name"
  ln -sfn "$PWD/.agents/skills/$name" ~/.agents/skills/"$name"
done
```

`.config/ghostty/config` は配色とフォント設定の控えとして置いてある。
Ghostty 本体は入れないので Brewfile に cask は無い。
