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

Xcode は入れただけでは使えない。`xcode-select` は Command Line Tools を向いたままなので、
そこを切り替えてライセンスに同意するまで `xcodebuild` が動かない。

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
sudo xcodebuild -runFirstLaunch

# シミュレータのランタイムは本体と別ダウンロード。要る分だけ入れる
xcodebuild -downloadPlatform iOS
```

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

# pmset ラッパー。~/.local/bin は .zshrc で PATH に入れてある
mkdir -p ~/.local/bin && cp bin/awake bin/nap ~/.local/bin/

# awake / nap が叩く pmset だけをパスワードなしで許可する
sudo install -m 0440 -o root -g wheel etc/sudoers.d/pmset /etc/sudoers.d/pmset
sudo visudo -cf /etc/sudoers.d/pmset

# Raycast から awake / nap を呼ぶスクリプト
mkdir -p ~/raycast-scripts && cp raycast/awake.sh raycast/nap.sh ~/raycast-scripts/

# Codex / Claude Code の共通設定
# -n で既存ファイルを保持する。既存マシンへの反映方法は下記を参照。
mkdir -p ~/.codex ~/.claude/hooks
cp -n codex/config.toml ~/.codex/config.toml
cp -n claude/settings.json ~/.claude/settings.json

# Claude Code のフックとステータス表示
cp claude/hooks/*.sh ~/.claude/hooks/ && chmod +x ~/.claude/hooks/*.sh
cp claude/statusline-command.sh ~/.claude/statusline-command.sh

# 配置できたかを確かめる
python3 .agents/skills/machine-setup/scripts/check-placement.py
```

最後の `check-placement.py` は、**このコードブロックの `cp` と `install` の宛先を読んで
存在を確かめる。** 特に `sudo install` は失敗しても後続の症状が「`awake` が動かない」
としてしか出ないので、置いたつもりで置けていない状態に気づけない。手順を足したときも、
このブロックに書けば確認の対象に入る。

### Codex / Claude Code の設定を更新する

共通設定の正本は `codex/config.toml` と `claude/settings.json`。
ローカルで好みを変えたときも、共有したい項目をこの2ファイルへ取り込んで Git で管理する。
配置はコピー方式なので、ローカルの変更が自動で dotfiles に反映されるわけではない。

| 管理するファイル | 共有する内容 | ローカルに保持する内容 |
| --- | --- | --- |
| `codex/config.toml` | モデル、推論強度、サンドボックス、自動承認レビュー | プロジェクトの信頼設定、フックの信頼ハッシュ、通知コマンド、アプリが登録した MCP・プラグイン・端末固有のパス |
| `claude/settings.json` | モデル、推論強度、`permissions.defaultMode`、表示設定、自作フック、プラグイン設定 | Orca などが登録するフック、端末で追加した許可や連携設定 |

既存マシンでは、まず対象ファイルのバックアップを取り、共有するキーだけを反映する。
`cp -n` は既存ファイルを更新しない。Codex の5項目は `~/.codex/config.toml` の
最初の `[セクション]` より前に置き、同じキーがある場合は値を変更する。
Claude は `~/.claude/settings.json` の対応するキーを更新し、ローカルのフックや
許可リストを残す。更新後は Codex / Claude Code を再起動する。

認証ファイル（Codex の `auth.json`、Claude の認証情報）、セッション履歴、キャッシュ、
端末で蓄積した `~/.codex/rules/default.rules` はこのリポジトリへコピーしない。
新しい Mac のログインや外部ツールの連携は、それぞれのアプリから行う。

Codex は `approvals_reviewer = "auto_review"`、Claude は
`permissions.defaultMode = "auto"` を共有設定に含めている。
Codex の設定形式は [公式ドキュメント](https://learn.chatgpt.com/docs/sandboxing#configure-defaults) を参照。

### 配置した設定の動作

`claude/settings.json` を置くと skill-guard フックが有効になり、`git commit` と
`gh pr create` の直接実行がブロックされる。`commit` / `pr` / `pr-only` スキルは
Step 0 でフラグを作るので素通しされる。**配置後は Claude Code を再起動する。**

`claude/hooks/` の4本は自作フック。Orca や herdr が入れるフックは各ツールが
自分で登録し直すので、`settings.json` からは外してある。

`claude/statusline-command.sh` は `settings.json` の `statusLine` から呼ばれ、
カレントディレクトリと git ブランチを robbyrussell 風に表示する。
フックと合わせて `jq` に依存するが、macOS 同梱の `/usr/bin/jq` があるので
Brewfile には入れていない。

`bin/awake` は蓋を閉じてもスリープさせない設定に、`bin/nap` は10分でスリープする
既定に戻す。実行ビットごとリポジトリで管理しているので、`cp` するだけで使える。

どちらも中で `sudo -n pmset` を叩く。`-n` はパスワードが要るなら聞かずに失敗する指定で、
TTY を持たない Raycast から呼んでも固まらないようにしてある。パスワードなしで通すのが
`etc/sudoers.d/pmset` で、`bin/awake` `bin/nap` が発行する5つの pmset 呼び出しだけを
引数まで固定して許可する。**`bin/` 側のコマンドを1文字でも変えたらこちらも直す。**
sudoers の引数マッチは完全一致なので、ずれると黙ってパスワードを要求して失敗する。

`/etc/sudoers.d/` へはコピーで入れる。**シンボリックリンクにしてはいけない。**
リンク先がこのリポジトリ（一般ユーザーで書き換えられる）にあると、そこへ 1 行足すだけで
root が取れてしまう。`visudo -cf` も飛ばさない。sudoers に構文エラーが入ると sudo 自体が
使えなくなる。

`raycast/*.sh` は Raycast の Script Commands。先頭のコメントが Raycast 用のメタデータで、
中身は `~/.local/bin/` のラッパーを呼ぶだけ。配置後に Raycast の
Extensions → Script Commands → Add Directories で `~/raycast-scripts` を登録すると
`Awake` / `Nap` として実行できるようになる。

スキルのリンクは README のブートストラップ（`scripts/link-skills.sh`）で張り終えている。
スキルを足したあとに張り直すときも、同じスクリプトを叩けばよい。

`.config/ghostty/config` は配色とフォント設定の控えとして置いてある。
Ghostty 本体は入れないので Brewfile に cask は無い。
