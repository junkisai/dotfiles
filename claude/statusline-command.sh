#!/bin/sh
# Claude Code statusLine command - based on robbyrussell oh-my-zsh theme

input=$(cat)
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd')
dir=$(basename "$cwd")

# ANSI color codes
bold_green="\033[1;32m"
bold_red="\033[1;31m"
cyan="\033[0;36m"
bold_blue="\033[1;34m"
red="\033[0;31m"
blue="\033[0;34m"
yellow="\033[0;33m"
reset="\033[0m"

# Arrow: green (success indicator approximation - always show green in status line)
arrow="${bold_green}➜${reset}"

# Current directory
dir_part="${cyan}${dir}${reset}"

# Git info
git_part=""
if git_branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null); then
  if git -C "$cwd" --no-optional-locks status --porcelain 2>/dev/null | grep -q .; then
    git_part=" ${bold_blue}git:(${red}${git_branch}${blue})${reset} ${yellow}✗${reset}"
  else
    git_part=" ${bold_blue}git:(${red}${git_branch}${blue})${reset}"
  fi
fi

printf "${arrow} ${dir_part}${git_part}\n"
