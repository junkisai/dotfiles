# oh-my-zsh
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="robbyrussell"
plugins=(git zoxide zsh-autosuggestions)
source $ZSH/oh-my-zsh.sh

export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"

# pipx が入れる CLI（mlx-whisper など）と、手で置いた awake / nap
export PATH="$HOME/.local/bin:$PATH"

# fnm (Node.js version manager)
# ~/.local/bin より後に置き、そこに node が入っていても fnm を優先させる
eval "$(fnm env --use-on-cd)"

# alias
alias awake='sudo ~/.local/bin/awake'
alias nap='sudo ~/.local/bin/nap'

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
