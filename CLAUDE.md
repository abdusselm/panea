# panea — project instructions

Local multi-pane terminal workspace (vertical tabs, split panes, cmux-style
theme). Desktop app (Electron) or browser. No self-built native binary — uses
the Node runtime and the Apple-signed system `python3` for the PTY, so there is
no code-signing step between cloning and running it.

## Search policy: code-review-graph FIRST

This repo has a persistent knowledge graph (`.code-review-graph/`) built by the
**code-review-graph** MCP server. It is the primary code-navigation tool.

**Before every search in this project — before reaching for `grep`, `find`,
`ls`, `rg`, `Glob`, `Grep`, or any equivalent file scan — run the search
through code-review-graph first.** The graph answers most "where / what / who
calls / what does this touch" questions with far fewer tokens than a raw file
scan.

Use the graph tool that fits the question:

- **Find a symbol** (function, class, type, name, keyword) →
  `semantic_search_nodes_tool`.
- **Relationships** → `query_graph_tool` with a pattern:
  `callers_of`, `callees_of`, `imports_of`, `importers_of`, `children_of`,
  `tests_for`, `inheritors_of`, `file_summary`.
- **Blast radius of a change** → `get_impact_radius_tool`.
- **Token-lean review context** → `get_review_context_tool`.
- **Architecture / flows** → `get_architecture_overview_tool`, `list_flows_tool`,
  `get_flow_tool`.

**Fallback rule:** only if the graph does not cover what you need — no match,
stale result, or a question the graph cannot express (raw text/regex over
file contents, config files, non-parsed assets) — then fall back to `Grep`,
`Glob`, `find`, `ls`, or `Read`. Prefer the graph; use raw tools as backup, not
first resort. Rationale: graph queries cost far fewer tokens than full scans.

**Keep the graph fresh:** after edits that add/rename/move symbols or files,
run `build_or_update_graph_tool` (incremental by default) so lookups stay
accurate.

## Code style: no comments

**Never add comment lines to this codebase.** Not to the user's code, not to
code you write yourself, in any language (`//`, `#`, `/* */`, JSDoc, docstrings,
HTML/CSS comments). Write code that explains itself through naming and
structure instead. Do not "restore" comments a previous edit removed.

The only exceptions: the `#!` shebang, and a license/attribution header where a
third party's license requires one.

Rationale belongs in the commit message, `README.md`, or this file — not inline.

## Layout

One responsibility per module — see
`.claude/skill/scafoldding-and-template/SKILL.md` for the full table and the
rules. **When adding a feature, give it its own module; do
not append it to an existing file.**

- `bin/panea.js` — the installed CLI (`brew install abdusselm/tap/panea`):
  the python3 preflight, flag parsing,
  the self-update call, then either `server/start.js` or the Electron binary.
  **Do not import anything that reads `PANEA_PORT` at module scope before the
  flags are parsed** — `server/paths.js` freezes the port on import, so
  `--port` is silently ignored if the chain is pulled in early. That is why
  `server/update.js` is imported dynamically.
- `server.js` — browser-mode entry: sets the process title and calls
  `server/start.js`. The desktop build imports that same module **in-process**
  instead of spawning a child; a spawned server registered a second app with
  LaunchServices and put a stray icon in the Dock.
- `server/` — backend modules: `start` (HTTP + WebSocket bootstrap on
  127.0.0.1:4820, `PANEA_PORT`), `paths` (config), `static-server`, `origin`
  (loopback-only Origin/Host guards), `session-store`, `commands-store`, `meta`
  (sidebar cwd/branch/ports via lsof/git), `pane` (one PTY), `pane-registry`
  (pane lifetime across sockets), `keepalive` (per-socket ping/pong),
  `connection` (per-socket wiring), `update` (self-update against GitHub
  releases), `electron` (where the Electron bundle lives).

  **A pane must outlive its WebSocket.** PTYs live in `server/pane-registry.js`,
  not in the connection — a socket that drops (laptop sleep, an idle hour) only
  *detaches*, buffering output, and the client re-`attach`es on reconnect.
  Killing panes from `ws.on("close")` is what made every pane silently swallow
  keystrokes after a lunch break.

  **Never let the Electron runtime land inside a Homebrew Cellar.** Homebrew
  rewrites dylib IDs for every Mach-O file it finds there, which breaks the
  signature Electron ships with — `brew install` printed `Failed to fix install
  linkage` and left a bundle that a managed Mac would refuse. `server/electron.js`
  resolves the bundle from `PANEA_ELECTRON_DIR`, then the package's own
  `node_modules`, then `~/.panea/electron`, and `targetDirFor` sends Homebrew
  installs to the last of those.
- `pty_bridge.py` — PTY via `pty.fork()` execing `zsh -l`; relays fd0/fd1 and
  fd3 (control JSON resize).
- `electron/main.cjs` — desktop shell; starts `server.js` as a child, opens the
  BrowserWindow, has one-shot screenshot/demo mode gated by `PANEA_*` env.
- `scripts/` — build-time helpers, never imported by the app: `ensure-electron`
  (downloads the Electron runtime — as of Electron 43 the package ships **no**
  install script, so `npm install` leaves `node_modules/electron/dist` empty and
  the desktop build dead until this runs), `update-tap` (rewrites the Homebrew
  formula for a release), `make-icon`
  (draws `build/icon.icns` with no image dependency), `brand-dev-electron`
  (rewrites the dev Electron bundle's name, icon, bundle ID, and executable
  name so the app presents as Panea, then refreshes the LaunchServices/Dock
  cache; runs on `postinstall`). Renaming the executable also means
  `node_modules/electron/path.txt` must be repointed.

  **Do not re-litigate the Dock tooltip.** It reads "Electron" from
  `NSFileManager.displayNameAtPath`, which comes from the *bundle directory
  name*. Already tried and confirmed useless: `CFBundleName`,
  `CFBundleDisplayName`, `CFBundleIdentifier`, `CFBundleExecutable`,
  `app.setName`, `process.title`, `LSHasLocalizedDisplayName` plus a localized
  `InfoPlist.strings`, and re-registering with `lsregister`. Every one of those
  reports "Panea" while the Dock still says "Electron". Only renaming the
  directory fixes it, which `PANEA_RENAME_BUNDLE=1` does — kept opt-in because
  a bundle at an unrecognised path is what makes endpoint security agents on a
  managed Mac demand admin credentials before it will launch. **Never package into a standalone `.app`** —
  renaming the Electron executable breaks its signature, and the ad-hoc re-sign
  trips managed-Mac security agents into demanding admin rights.
- `public/js/` — frontend ES modules: `theme`, `state`, `dom`, `util`, `ws`,
  `connection-status`, `session`, `tabs`, `panes`, `attention`,
  `attention-signals`, `notifications`, `layouts`, `keyboard`, `palette`,
  `main`.
  Loaded via `<script type="module" src="/js/main.js">`. `main.js` exposes a
  `window.panea` debug bridge (ES modules don't leak globals).
- `public/index.html` — markup (single `<link>` to `style.css`).
- `public/style.css` — entry stylesheet: **only `@import`s** the partials under
  `public/css/` in cascade order. Add rules to a partial, not here.
- `public/css/` — one partial per UI area, each mirroring its JS module:
  `tokens` (`:root` design tokens), `base` (reset + shared motion), `sidebar`,
  `connection-status`, `tabs`, `panes`, `palette`, `notifications`, `modals`.
  **When adding a
  feature's styles, put them in the matching partial (or a new one); never let
  `style.css` grow rules of its own.**
- `shell/zsh/` — `ZDOTDIR` shim sourcing the user's dotfiles then applying the
  panea prompt (guarded by `PANEA_NO_THEME`). **Do not edit the user's real
  dotfiles.**

## Performance (standing)

panea hosts many terminals at once — be a resource miser. Key rules (full detail
in `.claude/skill/scafoldding-and-template/SKILL.md` §4b): never spawn child
processes per-pane
(snapshot once — see `server/meta.js`); coalesce ResizeObserver/hot DOM work to
one rAF (`scheduleRefit`); patch DOM nodes in place for frequent updates rather
than rebuilding (`refreshTabName`/`refreshTabMeta`); debounce saves; cancel every
timer/rAF and bound every cache on teardown; only render the active tab.

## Constraints (standing)

- Never build a native binary. panea runs on runtimes a package manager already
  ships — Homebrew's node and `python@3.14` for an installed copy,
  `/usr/bin/python3` for a checkout — so it stays runnable where unsigned
  binaries are refused. No node-pty (its unsigned `spawn-helper` is exactly that
  case). The Python interpreter is never assumed: `server/paths.js` takes
  `PANEA_PYTHON` first, and the formula sets it.
- Do not delete or disable the user's software (Oh My Zsh, etc.).
- Colors follow cmux/ghostty: background `#282c34`, text `#ededed`,
  Tomorrow-Night ANSI. Palette lives in `public/style.css` `:root`.

## Run

```bash
npm install
npm run app     # desktop window (Electron)
npm start       # browser -> http://127.0.0.1:4820
```
