# Skill: developing a feature in panea

How to add a feature to panea and keep the codebase clean. Read this before
touching the code; follow the steps in order.

## 0. Search the graph first

This repo has a persistent **code-review-graph** (`.code-review-graph/`).
Before any `grep`/`find`/`ls`/`Glob`/`Grep`, run the search through the graph
(`semantic_search_nodes_tool`, `query_graph_tool` with `file_summary` /
`callers_of` / `callees_of`, `get_impact_radius_tool`). Fall back to raw tools
only when the graph can't answer. See `CLAUDE.md` for the full rule. After
edits that add/rename/move symbols, run `build_or_update_graph_tool`.

## 1. Architecture

panea is a **local web app in a native shell**. No bundler, no framework.

- **Backend** — Node ESM. `server.js` is a thin entry; the real code lives in
  `server/`. One `Pane` = one `python3` PTY bridge child (`pty_bridge.py`).
  Uses only Apple-signed runtimes (no node-pty) so it runs on a managed Mac.
- **Frontend** — native **ES modules** in the browser (`public/js/`), loaded via
  `<script type="module" src="/js/main.js">`. Vendor libs (xterm) are classic
  scripts that set `window.Terminal` / `window.FitAddon` first.
- **Desktop shell** — `electron/main.cjs` spawns `server.js`, opens a
  `BrowserWindow` on `127.0.0.1`, and has a screenshot/demo harness (below).
- **Transport** — one WebSocket. JSON messages; terminal bytes are base64.

### One responsibility per module

Frontend (`public/js/`):

| module | owns |
|--------|------|
| `theme.js` | colors, font stack, SVG icons |
| `state.js` | `state` (tab/pane model), `runtime` (mutable flags), `focusedPane()` |
| `dom.js` | long-lived top-level element refs |
| `util.js` | pure helpers: base64, ids, path, tree traversal, title cleanup |
| `ws.js` | socket lifecycle + inbound message dispatch (`wsSend`, `connect`) |
| `session.js` | serialize / persist / restore layout |
| `tabs.js` | tab lifecycle, sidebar list, metadata rows, ctx menu, titles, rename |
| `panes.js` | xterm panes, split tree, focus, resize, restart, tree→DOM |
| `attention.js` | background-pane attention state + desktop notification |
| `attention-signals.js` | pure heuristics: OSC/prompt/long-task classification |
| `notifications.js` | bell indicator + notification panel |
| `layouts.js` | reopen-closed-tab history + named saved layouts + name prompt |
| `keyboard.js` | global ⌘ shortcuts |
| `palette.js` | ⌘K command palette + custom commands |
| `main.js` | entry: DOM wiring, global listeners, `window.panea` debug bridge, `connect()` |

Backend (`server/`):

| module | owns |
|--------|------|
| `paths.js` | all filesystem locations + runtime constants |
| `static-server.js` | asset serving (vendor whitelist + `public/`) |
| `session-store.js` | `~/.panea/session.json` |
| `commands-store.js` | `~/.panea/commands.json` |
| `layouts-store.js` | `~/.panea/layouts.json` (named saved layouts) |
| `meta.js` | sidebar context (cwd / git branch / listening ports) via lsof/git |
| `pane.js` | the `Pane` class (one PTY) |
| `connection.js` | per-socket wiring: panes map, I/O relay, meta poll |

Styles (`public/css/`) — `style.css` is an entry that only `@import`s these
partials in cascade order; each owns one UI area and mirrors its JS module:

| partial | owns |
|---------|------|
| `tokens.css` | `:root` design tokens (color, radius, metrics) |
| `base.css` | reset, document shell, shared `kbd`, the breathing keyframe |
| `sidebar.css` | sidebar rail: header, brand, new-tab, bell, ⌘K button, footer |
| `tabs.css` | tab list rows, badges, port pills, rename, context menu |
| `panes.css` | workspace, split tree, terminal leaf, empty state |
| `palette.css` | ⌘K palette overlay, input, grouped list + section headers |
| `notifications.css` | notification panel + reason-tinted rows |
| `modals.css` | name prompt, confirm modal, layout picker (shared `.np-*`) |

### Module rules

- **One feature, one module.** A new feature gets its own file, not another
  section appended to an existing one. Extend an existing module only when the
  feature genuinely belongs to that responsibility.
- **Mutable scalars live in `runtime`** (`state.js`), never as `export let`.
  ES module bindings can't be reassigned by an importing module, so a shared
  mutable flag must be a property on an object everyone imports.
- **Circular imports are fine** as long as cross-module calls happen at
  runtime (inside functions), never during a module's top-level evaluation.
  Only `main.js` runs cross-module code at load (`connect()`), and it loads last.
- Keep `util.js` pure (no DOM, no app state) so anything can import it.
- **One CSS partial per UI area.** Styles go in the matching `public/css/`
  partial; `style.css` stays a pure `@import` barrel. Reference colors/metrics
  through `tokens.css` variables — never hard-code a palette value twice.
- **Chrome text uses the `--fs-*` rem type scale** (in `tokens.css`), not raw
  px, so a large-display `@media` bump of the root `font-size` (in `base.css`)
  scales every label from one knob. Numeric chips (badges, port pills, `kbd`)
  intentionally stay fixed px. Terminal font is separate (`runtime.fontSize`).

## 2. Where a new feature goes

- **Pure UI / interaction** (frontend only): add a module under `public/js/`,
  import what it needs, wire its entry from `main.js`. Put styles in the
  matching `public/css/` partial (see below), not in `style.css`. Expose
  anything the harness/CLI should reach on the `window.panea` bridge in
  `main.js`.
- **Needs host data** (filesystem, process info, git, …): add a backend module
  under `server/`, surface it through a new WebSocket message in
  `connection.js`, and handle that message type in the frontend `ws.js`
  dispatch. Follow the existing `meta` / `commands` messages as the template.
- **New shortcut**: add it to `keyboard.js` (and, if palette-worthy, to
  `buildPaletteCommands` in `palette.js`).

## 3. The WebSocket protocol

Client → server: `open`, `input`, `resize`, `close`, `session`, `getCommands`,
`getLayouts`, `saveLayout`, `deleteLayout`.
Server → client: `output`, `exit`, `session`, `commands`, `meta`, `layouts`.

Add a feature that needs the host by defining a new message type on both ends;
keep the payload JSON-serializable (base64 any binary).

## 4. Verify with the capture harness

`electron/main.cjs` supports a one-shot screenshot mode via env vars — use it to
prove a change renders and behaves, without manual clicking:

```bash
PANEA_PORT=4821 PANEA_NO_OPEN=1 \
PANEA_CAPTURE=/path/out.png \
PANEA_CAPTURE_DELAY=4000 \
PANEA_DEMO_JS='panea.newTab("/some/repo"); panea.openPalette();' \
npx electron .
```

- `PANEA_CAPTURE` — write a PNG of the window, then quit.
- `PANEA_CAPTURE_DELAY` — ms to wait before capture (raise it if you drive the
  UI, so async work settles).
- `PANEA_DEMO_JS` — JS run in the page just before capture. Reach app functions
  through the **`panea.` debug bridge** (`panea.newTab`, `panea.openPalette`,
  `panea.state`, …) — ES modules don't expose globals.
- `PANEA_DEMO_TITLE` / `PANEA_DEMO_TEXT` — emit an OSC title / write text to the
  focused pane.
- `PANEA_NO_META_POLL=1` — freeze the sidebar meta poll so an injected
  `state` stays put for a deterministic screenshot.

Reset `~/.panea/session.json` before a clean run (it persists tabs across runs).
Always kill a stale port first: `lsof -ti tcp:4821 | xargs kill -9`.

## 4b. Performance / resource discipline

panea can host many terminals at once (splits × tabs). Every feature must be a
resource miser — fast, but frugal with CPU, memory, and process spawns.

**Rules of thumb**

- **Never spawn child processes per-pane in a loop.** Take one snapshot and
  derive everything from it. `server/meta.js` is the reference: one `ps` + one
  `lsof` (cwd) + one `lsof` (ports) per poll cycle for *all* panes, with git
  cached per-cwd — ~3 spawns total regardless of pane count, not O(panes ×
  descendants). Diff against `lastMeta` and send only what changed.
- **Coalesce high-frequency DOM work to an animation frame.** A
  `ResizeObserver`/scroll/drag can fire many times per frame; each `fit()` forces
  a reflow. Use the `scheduleRefit` pattern in `panes.js` (one rAF per pane) —
  never call `fit()` directly from an observer.
- **Patch the DOM in place for hot updates; don't rebuild.** A full
  `renderTabList()` re-parses every row's SVG. For frequent changes (titles fire
  on every shell prompt) update just the changed node — see `refreshTabName` /
  `refreshTabMeta`. Reserve full rebuilds for structural changes (add/remove tab).
- **Debounce persistence and network writes.** `persist()` is debounced (200ms)
  and the server file write again (150ms). Keep any new "save on change" behind a
  debounce; don't write on every keystroke/event.
- **Only work on what's visible.** `refit` early-returns for panes whose tab
  isn't active; background tabs are `display:none` so xterm doesn't render them.
  Don't add always-on timers/animations that tick for hidden panes.
- **Bound every cache and cancel every timer/rAF on teardown.** `destroyPane`
  clears the idle timer and cancels the pending rAF; the branch cache is pruned.
  A new long-lived Map/interval/observer must have a matching cleanup.
- **Memory knobs:** xterm `scrollback` (`SCROLLBACK` in `panes.js`, default 5000)
  is a per-pane typed-array cost — don't raise it without reason. Prefer the DOM
  renderer we ship; don't add a WebGL context per pane (GPU contexts are limited
  and costly across many splits).

If a change touches a hot path (per-output, per-resize, per-poll, per-keystroke),
say so in the handoff and note what keeps it cheap.

## 5. Checklist before calling it done

- [ ] New feature is its own module (or clearly belongs to the one it extends).
- [ ] Frontend syntax: `node --check public/js/*.js`; backend: `node --check server.js server/*.js`.
- [ ] Boots clean in the capture harness (no console errors) and the feature is
      visible/working in the screenshot.
- [ ] Styles in the matching `public/css/` partial (never in `style.css`
      itself), using `tokens.css` variables, theme-consistent (cmux palette).
- [ ] README updated if it adds a shortcut, config file, or user-facing surface.
- [ ] Resource check (section 4b): no per-pane process storm, hot DOM work
      coalesced, timers/rAF/caches cleaned up on teardown.
- [ ] Graph refreshed: `build_or_update_graph_tool`.

## 6. Run it

```bash
npm install
npm run app     # desktop window (Electron)
npm start       # browser -> http://127.0.0.1:4820
```
