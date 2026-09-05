# oh-my-zsh
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="robbyrussell"
plugins=(git zoxide zsh-autosuggestions)
source $ZSH/oh-my-zsh.sh

export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"

# rbenv。本体は brew で入るので PATH 追加は要らず、shims の登録だけを行う
eval "$(rbenv init - zsh)"

# pipx が入れる CLI（mlx-whisper など）と、awake / nap
export PATH="$HOME/.local/bin:$PATH"

# fnm (Node.js version manager)
# ~/.local/bin より後に置き、そこに node が入っていても fnm を優先させる
eval "$(fnm env --use-on-cd)"

# 以下は pnpm 公式インストーラが管理する節。`# pnpm` から `# pnpm end` までを
# 丸ごと書き換えるので、この2行の間に他の設定を挟まないこと。
# 挟むと再インストール時に黙って消える。
# pnpm
export PNPM_HOME="$HOME/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME/bin:"*) ;;
  *) export PATH="$PNPM_HOME/bin:$PATH" ;;
esac
# pnpm end

# zsh-syntax-highlighting は ZLE のフックを登録順に走らせるので、
# 他のウィジェットを作る節より後、つまりこのファイルの最後に置く必要がある。
# pnpm 節の後ろに来るのはそのため。pnpm インストーラはマーカー間しか
# 書き換えないので、ここに置いても消えない。
source /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
