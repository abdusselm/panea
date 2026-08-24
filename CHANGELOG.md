# Changelog

Notable changes per release. Versions follow [semver](https://semver.org);
installed copies update themselves on their next launch, so anything listed here
reaches users without them asking for it.

## [Unreleased]

### Added

- `panea` command line entry: `panea` serves the browser build, `panea --app`
  opens the desktop window, plus `--port`, `--version`, `--help`.
- Self-update on launch. Installed copies check npm at most every six hours and
  install a newer release, then restart. Never fires from a git checkout, never
  moves anyone onto a prerelease, and is switched off with `PANEA_NO_UPDATE=1`.
- Loopback-only guards on the WebSocket handshake and HTTP `Host`, so no other
  origin can reach the shell bridge.
- The desktop build presents itself as Panea — its own name, icon, and bundle
  identifier — rather than Electron.

### Changed

- The desktop build runs the server in-process instead of spawning it, which
  removes a second Dock icon and the startup port race.
- Electron moved to `dependencies`, so `npm install -g panea` gives a working
  desktop build in one step.

### Fixed

- A busy port now prints one line instead of an unhandled `'error'` event.
