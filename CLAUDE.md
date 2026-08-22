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

- `server.js` — HTTP static server + WebSocket bridge (127.0.0.1:4820,
  `PANEA_PORT`). Spawns the PTY, injects `ZDOTDIR` prompt theme.
- `pty_bridge.py` — PTY via `pty.fork()` execing `zsh -l`; relays
  fd0/fd1 and fd3 (control JSON resize).
- `electron/main.cjs` — desktop shell; starts `server.js` as a child, opens the
  BrowserWindow, has one-shot screenshot/demo mode gated by `PANEA_*` env.
- `public/` — frontend: `index.html`, `app.js` (tabs, panes, titles, rename,
  attention/notify), `style.css` (cmux palette).
- `shell/zsh/` — `ZDOTDIR` shim sourcing the user's dotfiles then applying the
  panea prompt (guarded by `PANEA_NO_THEME`). **Do not edit the user's real
  dotfiles.**

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
