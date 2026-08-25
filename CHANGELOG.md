# Changelog

Notable changes per release. Versions follow [semver](https://semver.org);
installed copies update themselves on their next launch, so anything listed here
reaches users without them asking for it.

## [0.4.1] - 2026-08-25

### Fixed

- The self-update could announce a version it had not installed. When the
  Homebrew tap had not caught up with the GitHub release yet, `brew upgrade`
  found nothing to do and exited successfully, so panea printed
  `0.4.0 installed, restarting…` and relaunched the same old version — and
  because the check is throttled to once every six hours, it would not look
  again until that window passed. panea now reads back what is actually
  installed, says so plainly when the formula is still behind, and retries on
  the next launch instead of waiting out the six hours. A failed upgrade behaves
  the same way.
- A Homebrew refresh that fails no longer does so in silence. `brew update` ran
  with its output discarded, so a dropped network or a conflicted tap left no
  trace and simply looked like "no update available"; the reason is now printed.

## [0.4.0] - 2026-08-25

### Added

- Panes can be named and colored. A pane was labelled by whatever its shell last
  set as the terminal title, so four splits in one repo all read the same thing
  and any name you gave one was overwritten by the next prompt. Double-click a
  pane's title to rename it — the name is now yours and survives both the shell
  and a restart — and right-click the header for a menu with rename, a row of
  color swatches, and close. A color tints that pane's border, header, and icon,
  which is what makes a four-way split readable at a glance. Emptying the name
  hands the title back to the shell; clicking the active swatch clears the color.
  Both are also in the command palette as *Rename pane* and *Pane color…*.

## [0.3.0] - 2026-08-25

### Added

- Panes can be rearranged inside a terminal. Until now a split was frozen where
  it was created: a pane that belonged at the bottom of the window had to be
  closed and re-opened somewhere else, losing whatever was running in it. Drag a
  pane by its header bar and drop it on another pane — the outer quarter of an
  edge moves it to that side and collapses the split it came from, the middle
  swaps the two panes in place. The shells keep running throughout, and the new
  arrangement is saved with the session.

## [0.2.1] - 2026-08-25

### Fixed

- Updating no longer ends in a crash. The self-update installed the new version
  and then relaunched the path it had been started from, which points inside the
  Homebrew keg that `brew upgrade` had just deleted — so the last thing an
  update printed was `Cannot find module .../Cellar/panea/<old>/libexec/bin/panea`.
  The new version was in fact installed and the next launch was fine, but the
  one that did the updating died. panea now relaunches through the linked
  `panea` binary, which already points at whatever version is current, and falls
  back to telling you to run it again rather than starting something that is no
  longer there.

## [0.2.0] - 2026-08-25

### Fixed

- Panes no longer go deaf after the machine has been idle. A pane's shell was
  owned by the WebSocket that opened it, so a connection dropped by sleep or an
  idle hour killed every shell on that socket. The browser reconnected a second
  later, but nothing re-opened the panes: the reconnected socket had an empty
  pane map, so every keystroke was looked up against a pane the server no longer
  had and silently discarded. Coming back from lunch meant a screen full of
  terminals that swallowed input without printing an error or an exit notice.
  Shells now live in a registry that outlives any one connection — a dropped
  socket only detaches, and the client re-attaches on reconnect.
- Output a pane produces while nothing is attached is buffered (bounded at
  512 KB per pane, oldest first) and replayed on re-attach, so a build that
  finishes while the laptop is closed is still there afterwards.
- Reattaching to a pane the server genuinely no longer has now reports the exit
  instead of failing silently, which puts the pane back in the familiar
  "press ⏎ to restart" state.
- Dead connections are detected rather than waited on: the server pings every
  25 seconds and drops a socket that stops answering, and the client probes the
  socket when the window regains focus or the machine comes back online, so a
  reconnect after sleep takes about three seconds instead of a TCP timeout.

### Added

- A reconnect indicator in the sidebar, and dimmed panes while the connection
  is down. Both wait 800 ms before appearing, so the sub-second reconnects that
  happen in normal use stay invisible and only a real disconnect is announced.
  Keystrokes typed while disconnected are still dropped rather than replayed —
  feeding a half-typed command to a shell that has since come back is worse
  than losing it — so the dimming is there to say so before you type.

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

[0.2.0]: https://github.com/abdusselm/panea/releases/tag/v0.2.0
[0.1.4]: https://github.com/abdusselm/panea/releases/tag/v0.1.4
[0.1.3]: https://github.com/abdusselm/panea/releases/tag/v0.1.3
[0.1.2]: https://github.com/abdusselm/panea/releases/tag/v0.1.2
[0.1.1]: https://github.com/abdusselm/panea/releases/tag/v0.1.1
[0.1.0]: https://github.com/abdusselm/panea/releases/tag/v0.1.0
