# Changelog

Notable changes per release. Versions follow [semver](https://semver.org);
installed copies update themselves on their next launch, so anything listed here
reaches users without them asking for it.

## [0.4.12] - 2026-09-04

### Added

- `Cmd-Left`/`Cmd-Right` now jump the cursor to the start/end of the current
  shell line, matching the macOS text-editing convention. Previously the
  arrow keys only moved the cursor one character at a time, so getting back
  to the front of a long command meant holding the key down or reaching for
  the mouse.

## [0.4.11] - 2026-09-04

### Added

- Cmd+click a `.md` filename mentioned in a pane's output (for example, a line
  an AI agent prints after writing a report) to open it in a rendered Markdown
  preview, in the same panel style as the git diff view (`Cmd-G`). Previously
  the filename was just text with no way to see the file's contents without
  leaving the terminal.

## [0.4.10] - 2026-09-02

### Changed

- Launching panea no longer sits on a blank terminal while it silently checks
  for and installs an update — there was no progress shown, so a slow check
  looked like panea had failed to start. The app now opens immediately; the
  update check and download run in the background afterward, with a small
  progress indicator in the sidebar while a new version downloads.
- An update no longer restarts panea out from under you. Previously, once the
  download finished, panea relaunched itself immediately — killing every open
  pane's shell mid-session. It now downloads and installs in the background,
  then shows "ready — restart to use it" so you can restart on your own
  schedule instead of losing work to a surprise relaunch.

## [0.4.9] - 2026-09-02

### Added

- The git diff panel (`Cmd-G`) can be resized. Reviewing what an agent changed
  meant reading a real diff through a fixed 900px window: long lines ran off the
  side and the file list on the left cut every path down to its last few
  characters, so two files in the same directory were told apart by scrolling.
  The panel now takes a drag on any side or bottom corner, and the divider
  between the file list and the diff moves independently — widen the list to
  read full paths without giving up diff width. Double-click a grip to go back
  to the default size, or the divider to reset just the file list. Both sizes
  are remembered with the rest of the session and are pulled back inside the
  window if it is smaller next time.

### Changed

- The git diff panel opens much larger — near the full window instead of a fixed
  900px box, so a first look at a diff usually needs no resizing at all.

## [0.4.8] - 2026-09-01

### Fixed

- Commands in a pane could run but print nothing at all. You typed `ls`, saw it
  echo, the prompt came back — and not a line of output, over and over, while
  the same shell in iTerm behaved perfectly. The command really did run; only
  its output was missing. If your zsh setup uses powerlevel10k's instant prompt,
  p10k captures the shell's stdin and stdout while your startup files load and
  hands them back from a `precmd` hook. panea's theme was deleting p10k's hooks
  to make its own prompt render, and that deletion took the hand-back with it,
  so the shell kept running with its output redirected into a buffer nobody
  read. panea now switches instant prompt off in its own panes, where it has
  nothing to do anyway — panea already shows a "starting shell…" badge while a
  shell boots. The bug came and went because it only bit once p10k had written
  its instant-prompt cache, which a session in another terminal would recreate.

## [0.4.7] - 2026-09-01

### Added

- A new pane used to look ready before it was. The cursor blinked, the pane took
  focus, and typing echoed characters back — but a shell still working through
  its startup files had not reached its prompt yet, so nothing ran. `ls` moved
  the cursor down a line and printed nothing, which reads exactly like a frozen
  pane. A pane whose shell takes more than a second to start now says
  "starting shell…" with a running count, and past six seconds it points at the
  likely cause, your shell config. The badge ignores the terminal echoing your
  own keystrokes back and clears only when the shell really answers, so it stays
  up precisely when you are typing into a shell that cannot hear you yet.

## [0.4.6] - 2026-09-01

### Fixed

- A pane could stop responding to the keyboard for good: you came back to a
  terminal you had left alone, typed, and nothing happened, as though the pane
  had died. It had. panea writes your keystrokes into a non-blocking pty, and
  whenever the program in the pane was not draining its input fast enough —
  a full-screen TUI mid-render, anything busy for a moment — the write came
  back "not now" and panea treated that as fatal, hung up on the shell, and
  killed the pane. Keystrokes that only partly made it through were dropped on
  the floor. Input is now held and delivered when the terminal is ready, so a
  busy pane simply waits instead of dying, and nothing you type is lost.
- When a pane's process did exit, the notice saying so was drawn underneath the
  terminal's own output, where a full-screen program hid it completely — so a
  dead pane looked alive but deaf, silently swallowing everything except Enter.
  The notice is now a badge pinned over the pane, and the pane's border turns
  red, so a pane that needs Enter to restart says so.

## [0.4.5] - 2026-08-31

### Added

- Getting a split out of the way used to mean closing it, which kills the shell
  and everything it was in the middle of. ⌘⇧H — or the new eye button in a
  pane's header, or *Hide pane* in its right-click menu — now folds a pane down
  to a rail instead: a dashed, striped strip that stays where the pane was and
  keeps its name, its color, and its notification dot. The shell keeps running,
  the scrollback stays, and the strip is deliberately nothing like a closed
  pane, so a hidden pane cannot be quietly forgotten. The sidebar tab also
  reports how many of its panes are hidden while you are looking at another
  terminal. Click the rail to bring the pane back at its old size; ⌘K has *Hide
  pane* and *Reveal hidden panes*. The last visible pane refuses to hide,
  closing a hidden pane's only visible sibling brings it back, and hidden panes
  come back hidden after a restart.

## [0.4.4] - 2026-08-31

### Added

- A long session with an AI CLI is one unbroken wall of output, and finding
  the exchange you half-remember means scrolling through everything after it.
  ⌘E now opens a transcript of the pane: the scrollback split into collapsible
  sections, each headed by what you asked and how many lines the answer ran to.
  Open one section, or all of them, or press ↧ to send the pane itself back to
  that point. Questions typed after this release are used as the section
  boundaries; scrollback panea never watched — a restored session, or an agent
  already running — is split on the agent's own turn markers instead, so a
  conversation that predates the feature still folds. The transcript is a
  read-only snapshot: it never touches the running pane, and closing it leaves
  the keyboard back in the terminal.

## [0.4.3] - 2026-08-31

### Changed

- Splitting a pane dropped you in your home directory, so every split began
  with retyping the `cd` you had already done. A split now opens in the
  directory the pane it came from is in at that moment — read live from the
  running shell, so it is right even when you split seconds after a `cd`. If
  the shell cannot be reached, the split falls back to the directory panea last
  saw rather than to your home directory, and anything typed while the new
  shell is starting is delivered instead of dropped.

## [0.4.2] - 2026-08-31

### Added

- Scrolling back through a long conversation used to strand you: the only way
  back to the newest output was to drag the scrollbar all the way down again,
  guessing when you had arrived. A pane that is not at the bottom now shows a
  small pill in its corner saying how many lines sit below you — click it, or
  press ⌘J, to jump to the latest output. The pill then offers the way back,
  returning you to the exact line you were reading, and forgets that position
  after twelve seconds so it can never send you somewhere stale. The shortcut
  is rebindable in Settings.

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
