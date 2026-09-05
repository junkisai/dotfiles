# oh-my-zsh
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="robbyrussell"
plugins=(git zoxide zsh-autosuggestions)
source $ZSH/oh-my-zsh.sh

export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"
export PATH="$PNPM_HOME:$PATH"
export PATH="$HOME/.local/bin:$PATH"

# fnm (Node.js version manager)
# ~/.local/bin（hermes-agent 同梱の node）より後に置き、fnm を PATH で優先させる
eval "$(fnm env --use-on-cd)"

# alias
alias awake='sudo ~/.local/bin/awake'
alias nap='sudo ~/.local/bin/nap'

# pnpm
export PNPM_HOME="/Users/junkisai/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME/bin:"*) ;;
  *) export PATH="$PNPM_HOME/bin:$PATH" ;;
esac
# pnpm end
