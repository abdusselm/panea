# Changelog

Notable changes per release. Versions follow [semver](https://semver.org);
installed copies update themselves on their next launch, so anything listed here
reaches users without them asking for it.

## [Unreleased]

### Added

- `panea` command line entry: `panea` serves the browser build, `panea --app`
  opens the desktop window, plus `--port`, `--version`, `--help`.
- Self-update on launch. Installed copies check GitHub releases at most every
  six hours and run `brew upgrade`, then restart. Never fires from a git
  checkout, never moves anyone onto a prerelease, switched off with
  `PANEA_NO_UPDATE=1`.
- A preflight check that refuses to start with a usable message when `python3`
  cannot run the PTY bridge, instead of opening a window of dead panes.
- Python is a formula dependency, so installing panea installs it. Nobody is
  asked to run `xcode-select --install` first, and the interpreter is a real
  `python@3.14` rather than the Xcode stub.
- Loopback-only guards on the WebSocket handshake and HTTP `Host`, so no other
  origin can reach the shell bridge.
- The desktop build presents itself as Panea — its own name, icon, and bundle
  identifier — rather than Electron.

### Changed

- The desktop build runs the server in-process instead of spawning it, which
  removes a second Dock icon and the startup port race.
- Distribution is a Homebrew tap. The formula installs only the JavaScript;
  the Electron runtime lands in `~/.panea/electron` on the first `panea --app`,
  because Homebrew rewrites Mach-O files in its Cellar and that breaks the
  signature Electron ships with.

### Fixed

- A busy port now prints one line instead of an unhandled `'error'` event.
- Panes no longer inherit the environment npm injects into `npm start` and
  `npm run app`. `npm_config_prefix` made nvm refuse to activate, so `node`,
  `npx` and anything installed through nvm were missing from every pane, and
  npm's `node_modules/.bin` entries leaked panea's own dependencies onto the
  user's `PATH`.
