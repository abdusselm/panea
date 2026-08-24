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

- `server.js` — browser-mode entry: sets the process title and calls
  `server/start.js`. The desktop build imports that same module **in-process**
  instead of spawning a child; a spawned server registered a second app with
  LaunchServices and put a stray icon in the Dock.
- `server/` — backend modules: `start` (HTTP + WebSocket bootstrap on
  127.0.0.1:4820, `PANEA_PORT`), `paths` (config), `static-server`, `origin`
  (loopback-only Origin/Host guards), `session-store`, `commands-store`, `meta`
  (sidebar cwd/branch/ports via lsof/git), `pane` (one PTY), `connection`
  (per-socket wiring).
- `pty_bridge.py` — PTY via `pty.fork()` execing `zsh -l`; relays fd0/fd1 and
  fd3 (control JSON resize).
- `electron/main.cjs` — desktop shell; starts `server.js` as a child, opens the
  BrowserWindow, has one-shot screenshot/demo mode gated by `PANEA_*` env.
- `scripts/` — build-time helpers, never imported by the app: `make-icon`
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
in `.claude/skill/scafoldding-and-template/SKILL.md` §4b): never spawn child
processes per-pane
(snapshot once — see `server/meta.js`); coalesce ResizeObserver/hot DOM work to
one rAF (`scheduleRefit`); patch DOM nodes in place for frequent updates rather
than rebuilding (`refreshTabName`/`refreshTabMeta`); debounce saves; cancel every
timer/rAF and bound every cache on teardown; only render the active tab.

## Constraints (standing)

- Use only pre-signed/notarized runtimes; never a self-built native binary, so
  panea stays runnable where unsigned binaries are refused. No node-pty (its
  unsigned `spawn-helper` is exactly that case).
- Do not delete or disable the user's software (Oh My Zsh, etc.).
- Colors follow cmux/ghostty: background `#282c34`, text `#ededed`,
  Tomorrow-Night ANSI. Palette lives in `public/style.css` `:root`.

## Run

```bash
npm install
npm run app     # desktop window (Electron)
npm start       # browser -> http://127.0.0.1:4820
```
