# 新しい Mac では `brew bundle --file=Brewfile` で一括インストールする。
# brew で入らないアプリは docs/setup.md のチェックリストを参照。

tap "dotenvx/brew"
tap "hashicorp/tap"
tap "libsql/sqld"
tap "stablyai/orca"
tap "steipete/tap"
tap "supabase/tap"
tap "tursodatabase/tap"

# --- シェル / ターミナル ---
brew "tmux"
brew "zoxide"
brew "zsh-syntax-highlighting"
brew "neovim"
brew "tree"
brew "herdr"

# --- 言語ランタイム管理 ---
brew "fnm"
brew "rbenv"
brew "pyenv"
brew "python@3.13"
brew "pipx"
brew "tfenv"

# --- 開発ツール ---
brew "gh"
brew "git-secrets"
brew "biome"
brew "watchman"
brew "cocoapods"
brew "vhs"

# --- クラウド / インフラ ---
brew "awscli"
brew "cloudflared"
brew "supabase/tap/supabase"

# --- データベース ---
brew "mysql"
brew "postgresql@14"

# --- AI CLI ---
brew "gemini-cli"

# --- メディア / OCR（.agents/skills が利用）---
# transcribe-audio が ffmpeg/ffprobe で音声を分割する。vhs の依存でもある。
brew "ffmpeg"
brew "tesseract"
brew "pngquant"

cask "font-maple-mono"

# --- アプリ ---
cask "1password"
cask "arc"
cask "chatgpt"
cask "claude"
cask "cmux"
cask "codexbar"
cask "discord"
cask "docker-desktop"
cask "expo-orbit"
cask "figma"
cask "framer"
cask "gcloud-cli"
cask "google-chrome"
cask "hermes-desktop"
cask "karabiner-elements"
cask "logi-options-plus"
cask "obsidian"
cask "openclaw"
cask "orca"
cask "palmier-pro"
cask "raycast"
cask "screaming-frog-seo-spider"
cask "sequel-ace"
cask "slack"
cask "superwhisper"
cask "tailscale-app"
cask "zoom"
cask "ankerwork"

# --- 現行マシンに残っている ffmpeg の旧依存 ---
# いまの ffmpeg はこれらを必要とせず、他のどの formula からも参照されていない。
# 移行先で必要になったら個別に外す。
# brew "aribb24"
# brew "frei0r"
# brew "jpeg-xl"
# brew "libass"
# brew "libavif"
# brew "libbluray"
# brew "librist"
# brew "libsoxr"
# brew "libssh"
# brew "libvidstab"
# brew "opencore-amr"
# brew "rav1e"
# brew "rubberband"
# brew "speex"
# brew "srt"
# brew "theora"
# brew "xvid"
# brew "zeromq"
# brew "zimg"
