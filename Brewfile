# 新しい Mac では `brew bundle --file=Brewfile` で一括インストールする。
# brew で入らないアプリは docs/setup.md のチェックリストを参照。
#
# Homebrew 6.0 から公式以外の tap は明示的に信頼しないとロードされない。
# tap 行の `trusted:` で宣言しておけば `brew trust` を手で叩く必要はない。
# 下の tap のうち trusted: が付いていないものは、この Brewfile からは何も入れて
# いない（手動 install 用）。そこから入れるときは `brew trust <tap>` が要る。

tap "dotenvx/brew"
tap "hashicorp/tap"
tap "libsql/sqld"
tap "stablyai/orca", trusted: { cask: "orca" }
tap "tursodatabase/tap"

# --- シェル / ターミナル ---
brew "zoxide"
brew "zsh-syntax-highlighting"
brew "tree"

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
brew "supabase"

# --- データベース ---
brew "mysql"
brew "postgresql@14"

# --- AI CLI ---
brew "gemini-cli"

# --- メディア ---
# transcribe-audio が ffmpeg/ffprobe で音声を分割する。vhs の依存でもある。
brew "ffmpeg"

# --- アプリ ---
cask "1password"
cask "chatgpt"
cask "claude"
cask "discord"
cask "docker-desktop"
cask "expo-orbit"
cask "figma"
cask "gcloud-cli"
cask "google-chrome"
cask "logi-options+"
# 素の "orca" は homebrew/cask の plotly orca（別物）に当たるので完全修飾名で書く。
cask "stablyai/orca/orca"
cask "palmier-pro"
cask "raycast"
cask "slack"
cask "superwhisper"
cask "zoom"
cask "ankerwork"
