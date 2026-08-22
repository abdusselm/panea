# Load the user's real interactive config (aliases, functions, completions,
# their prompt theme). We override only the prompt afterwards.
[[ -f "${HOME}/.zshrc" ]] && source "${HOME}/.zshrc"

# Apply panea's cmux-style theme last so it wins over whatever prompt the user's
# config installed. Guarded so panea can disable it via PANEA_NO_THEME=1.
if [[ -z "${PANEA_NO_THEME}" && -f "${PANEA_THEME_DIR}/panea-theme.zsh" ]]; then
  source "${PANEA_THEME_DIR}/panea-theme.zsh"
fi
