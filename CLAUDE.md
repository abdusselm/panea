# panea — project instructions

Local multi-pane terminal workspace (vertical tabs, split panes, cmux-style
theme). Desktop app (Electron) or browser. No self-built native binary — uses
the Node runtime and the Apple-signed system `python3` for the PTY, so it runs
on a managed/EDR-locked macOS without a signing wall.

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

## Layout

One responsibility per module — see `skills/developing-a-feature.md` for the
full table and the rules. **When adding a feature, give it its own module; do
not append it to an existing file.**

- `server.js` — thin entry: HTTP static server + WebSocket bridge
  (127.0.0.1:4820, `PANEA_PORT`).
- `server/` — backend modules: `paths` (config), `static-server`,
  `session-store`, `commands-store`, `meta` (sidebar cwd/branch/ports via
  lsof/git), `pane` (one PTY), `connection` (per-socket wiring).
- `pty_bridge.py` — PTY via `pty.fork()` execing `zsh -l`; relays fd0/fd1 and
  fd3 (control JSON resize).
- `electron/main.cjs` — desktop shell; starts `server.js` as a child, opens the
  BrowserWindow, has one-shot screenshot/demo mode gated by `PANEA_*` env.
- `public/js/` — frontend ES modules: `theme`, `state`, `dom`, `util`, `ws`,
  `session`, `tabs`, `panes`, `attention`, `attention-signals`, `notifications`,
  `layouts`, `keyboard`, `palette`, `main`.
  Loaded via `<script type="module" src="/js/main.js">`. `main.js` exposes a
  `window.panea` debug bridge (ES modules don't leak globals).
- `public/index.html` — markup (single `<link>` to `style.css`).
- `public/style.css` — entry stylesheet: **only `@import`s** the partials under
  `public/css/` in cascade order. Add rules to a partial, not here.
- `public/css/` — one partial per UI area, each mirroring its JS module:
  `tokens` (`:root` design tokens), `base` (reset + shared motion), `sidebar`,
  `tabs`, `panes`, `palette`, `notifications`, `modals`. **When adding a
  feature's styles, put them in the matching partial (or a new one); never let
  `style.css` grow rules of its own.**
- `shell/zsh/` — `ZDOTDIR` shim sourcing the user's dotfiles then applying the
  panea prompt (guarded by `PANEA_NO_THEME`). **Do not edit the user's real
  dotfiles.**

## Performance (standing)

panea hosts many terminals at once — be a resource miser. Key rules (full detail
in `skills/developing-a-feature.md` §4b): never spawn child processes per-pane
(snapshot once — see `server/meta.js`); coalesce ResizeObserver/hot DOM work to
one rAF (`scheduleRefit`); patch DOM nodes in place for frequent updates rather
than rebuilding (`refreshTabName`/`refreshTabMeta`); debounce saves; cancel every
timer/rAF and bound every cache on teardown; only render the active tab.

## Constraints (standing)

- Managed corporate Mac: use only pre-signed/notarized runtimes; never a
  self-built native binary. No node-pty (unsigned `spawn-helper` is blocked).
- Do not delete or disable the user's software (Oh My Zsh, etc.).
- Colors follow cmux/ghostty: background `#282c34`, text `#ededed`,
  Tomorrow-Night ANSI. Palette lives in `public/style.css` `:root`.

## Run

```bash
npm install
npm run app     # desktop window (Electron)
npm start       # browser -> http://127.0.0.1:4820
```
