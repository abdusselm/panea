# Changelog

Notable changes per release. Versions follow [semver](https://semver.org);
installed copies update themselves on their next launch, so anything listed here
reaches users without them asking for it.

## [0.1.4] - 2026-08-24

### Fixed

- A pane no longer dies when its control pipe closes. 0.1.3 taught the bridge
  to exit when either pipe to its parent closed, which was too broad: the
  control pipe carries nothing but resize messages, and losing it is not a
  reason to kill the user's shell. Only the input pipe closing means the parent
  is gone. The leak fix that motivated 0.1.3 is unaffected and still covered by
  its test.
- Interrupted reads (`EINTR`, `EAGAIN`) are retried instead of being treated as
  the parent going away.

## [0.1.3] - 2026-08-24

### Fixed

- Panes no longer outlive the server that spawned them. `pty_bridge.py` treated
  the parent's pipe closing as "stop watching that pipe" and kept relaying
  forever, so every panea that exited without a clean WebSocket close left its
  whole set of shells behind. One machine had 174 bridges alive, 169 of them
  reparented to `launchd`, the oldest two days old, holding ~490 MB between the
  bridges and their shells.
- The server now tears its panes down on `SIGINT`, `SIGTERM`, `SIGHUP` and
  process exit, not only when a WebSocket closes.

## [0.1.2] - 2026-08-24

### Fixed

- Panes no longer inherit the environment npm injects into `npm start` and
  `npm run app`. `npm_config_prefix` made nvm refuse to activate, so `node`,
  `npx` and anything installed through nvm were missing from every pane, and
  npm's `node_modules/.bin` entries leaked panea's own dependencies onto the
  user's `PATH`.

## [0.1.1] - 2026-08-24

### Added

- Python is a formula dependency, so installing panea installs it. Nobody is
  asked to run `xcode-select --install` first, and the interpreter is a real
  `python@3.14` rather than the Xcode stub.

## [0.1.0] - 2026-08-24

### Added

- `panea` command line entry: `panea` serves the browser build, `panea --app`
  opens the desktop window, plus `--port`, `--version`, `--help`.
- Self-update on launch. Installed copies check GitHub releases at most every
  six hours and run `brew upgrade`, then restart. Never fires from a git
  checkout, never moves anyone onto a prerelease, switched off with
  `PANEA_NO_UPDATE=1`.
- A preflight check that refuses to start with a usable message when `python3`
  cannot run the PTY bridge, instead of opening a window of dead panes.
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

[0.1.4]: https://github.com/abdusselm/panea/releases/tag/v0.1.4
[0.1.3]: https://github.com/abdusselm/panea/releases/tag/v0.1.3
[0.1.2]: https://github.com/abdusselm/panea/releases/tag/v0.1.2
[0.1.1]: https://github.com/abdusselm/panea/releases/tag/v0.1.1
[0.1.0]: https://github.com/abdusselm/panea/releases/tag/v0.1.0
