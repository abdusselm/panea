# panea zsh shim (loaded via ZDOTDIR). Pull in the user's real environment
# first so PATH, tools and exports are untouched, then panea's .zshrc adds the
# theme on top. The user's own dotfiles are never modified.
[[ -f "${HOME}/.zshenv" ]] && source "${HOME}/.zshenv"

if [[ -z "${PANEA_NO_THEME}" ]]; then
  export POWERLEVEL9K_INSTANT_PROMPT=off
fi
