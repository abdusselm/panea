# panea terminal theme — cmux-style (Tomorrow Night palette), applied on top of
# the user's own zsh config without editing it.
#
# 256-color approximations of the cmux palette:
#   blue #81a2be -> 110    yellow #f0c674 -> 179    green #b5bd68 -> 143
#   red  #cc6666 -> 167    grey   #969896 -> 245    aqua #8abeb7 -> 109

# 1) Neutralize any prompt hooks the user's theme installed (e.g. powerlevel10k),
#    so our prompt is the one that renders. Other precmd/preexec hooks are kept.
autoload -Uz add-zsh-hook 2>/dev/null
precmd_functions=(${precmd_functions:#*_p9k*})
precmd_functions=(${precmd_functions:#*p10k*})
precmd_functions=(${precmd_functions:#*powerlevel*})
preexec_functions=(${preexec_functions:#*_p9k*})
preexec_functions=(${preexec_functions:#*p10k*})
(( ${+functions[_p9k_precmd]} )) && unfunction _p9k_precmd 2>/dev/null
unset RPROMPT RPS1 2>/dev/null

# 2) Git branch in the prompt via vcs_info.
autoload -Uz vcs_info
zstyle ':vcs_info:*' enable git
zstyle ':vcs_info:git:*' formats ' %F{179}%b%f'
zstyle ':vcs_info:git:*' actionformats ' %F{179}%b%f%F{167}(%a)%f'

# 3) Prompt. We assign PROMPT inside a precmd hook registered LAST, so it runs
#    after any prompt tool the user's config installed (starship, etc.) and wins
#    the final assignment. Blank line, cwd in blue + git branch, status caret.
setopt prompt_subst
_panea_set_prompt() {
  local st=$?
  vcs_info
  PROMPT=$'\n''%F{110}%~%f${vcs_info_msg_0_}'$'\n''%(?.%F{143}.%F{167})❯%f '
  RPROMPT='%F{245}%*%f'
}
add-zsh-hook precmd _panea_set_prompt

# 4) Colorize ls / completion listings to match (BSD ls on macOS).
export CLICOLOR=1
export LSCOLORS="gxfxbEaEBxxEhEhBaDaCaD"
zstyle ':completion:*' list-colors ''

# 5) Small quality-of-life defaults that do not fight the user's config.
setopt no_beep

typeset -g PANEA_THEME_LOADED=1
