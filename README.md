# panea

Local multi-pane terminal workspace — vertical tabs, split panes, cmux-style
theme. Desktop app (Electron) or browser. No native binary to sign; uses Node
and the system `python3` for the PTY.

## Requirements

- macOS
- Node.js 18+
- `python3` (ships with macOS / Xcode Command Line Tools)

## Run

```bash
npm install
npm run app     # desktop window (Electron)
npm start       # browser version -> http://127.0.0.1:4820
```

Change the port: `PANEA_PORT=5000 npm run app`

## Shortcuts

| Key | Action |
|-----|--------|
| `Cmd-K` | command palette |
| `Cmd-F` | find in terminal |
| `Cmd-G` | git diff panel |
| `Shift-Cmd-N` | notification panel |
| `Cmd-T` | new tab |
| `Shift-Cmd-T` | reopen last closed tab |
| `Cmd-W` | close focused pane |
| `Cmd-D` | split right |
| `Cmd-Shift-D` | split down |
| `Cmd-1 … 9` | switch tab |
| `Cmd +` / `Cmd −` / `Cmd 0` | font size up / down / reset |
| double-click / right-click tab | rename |

The ⌘-based shortcuts above (except `⌘1–9` and font size, which are fixed) are
**editable** — see [Settings](#settings).

## Splitting panes

`Cmd-D` splits the focused pane right, `Cmd-Shift-D` splits it down (also on each
pane's header buttons). A new split starts 50/50; **drag the divider** between
two panes with the mouse to resize them — the cursor turns into a resize handle
and the divider highlights. The size ratio is per-split and **persists across
restarts**. Neither pane can be dragged to nothing (min ~8%).

The **sidebar** itself is resizable the same way: drag its right edge to set the
rail width (160–520px), which also persists across restarts.

## Command palette

`Cmd-K` opens a fuzzy command palette. Commands are grouped by function under
section headers — **Tabs**, **Panes**, **Layouts**, **Git**, **View**,
**Notifications**, **Switch tab**, and your own **Custom** commands — so a long
list stays scannable. Typing filters across every group; empty groups drop out.

Define custom commands in `~/.panea/commands.json` (see
[`commands.example.json`](commands.example.json)):

```json
[
  { "name": "Dev server", "run": "npm run dev", "where": "new-tab" },
  { "name": "Claude", "run": "claude", "where": "split" }
]
```

- `run` — the shell line, sent to the target pane (Enter appended).
- `where` — `focused` (default), `new-tab`, `split`, or `split-down`.

Edits are picked up the next time you open the palette; no restart needed.

## Notifications

Notifications are deliberately selective — plain output that merely stops does
**not** ring. A background pane earns attention only when:

- **it emits an explicit notification escape** — `OSC 9` (`ESC ] 9 ; msg BEL`)
  or `OSC 777` (`ESC ] 777 ; notify ; title ; body BEL`). Agents/CLIs that
  support desktop notifications (e.g. a Claude Code notify hook) light this up
  with their own message.
- **it rings the terminal bell** (BEL).
- **it goes quiet showing a prompt that waits for you** — permission/confirm
  patterns like `(y/n)`, `Do you want to…`, `Allow…?`, `❯ 1. Yes` →
  "needs your permission".
- **a long task finishes** — the pane streamed output for a while, then fell
  quiet → "finished". A quick command stays silent.

The panel (bell, or `Shift-Cmd-N`) lists every pending pane with its reason;
click one to jump to it, or **Clear all** to dismiss. Want an agent to notify
you on completion? Have it emit `printf '\e]9;task done\a'` (or ring the bell).

The heuristics live in `public/js/attention-signals.js` — tune the prompt
patterns or the long-task threshold there.

## Tabs & layouts

- **Reorder** — drag a tab up or down the sidebar to reorder it; an accent line
  shows where it will land. The number badges and `Cmd-1…9` follow the new
  order, and it persists across restarts.
- **Reopen closed tab** — `Shift-Cmd-T` (or the palette) brings back the most
  recently closed tab with its name, working directory, and split layout. Keeps
  a short history of closes.
- **Saved layouts** — from the palette, "Save this tab as layout…" names a
  snapshot of the **active tab** and its split arrangement (other open tabs are
  not pulled in). "Open layout…" and "Delete layout…" each open a list of your
  saved layouts to pick from (delete asks to confirm). Opening a layout adds it
  as a new tab, leaving your current tabs untouched. Saved to
  `~/.panea/layouts.json`.

## Settings

The gear in the sidebar header (or **Keyboard shortcuts…** in the palette) opens
a settings panel for **rebinding keyboard shortcuts**. Click a shortcut's chip,
press the new combo (⌘ + a letter, optionally with ⇧/⌥/⌃), and it's saved. A
combo already in use is rejected with which action holds it; **reset** returns
one binding to its default, **Reset all** clears every override. `⌘1–9`
(tab switch) and `⌘ +/−/0` (font size) are fixed and not listed.

Overrides persist to `~/.panea/settings.json` as a sparse diff (only the ones
you changed); defaults live in `public/js/shortcuts.js`, the single registry
both the key handler and the palette read, so a rebind updates every surface.

## Find in terminal

`Cmd-F` opens a find box over the focused pane's terminal. Type to highlight
every match in the scrollback; the active match is brighter and the box shows
`current/total`. `Enter` jumps to the next match, `Shift-Enter` the previous,
`Esc` (or ✕) closes and clears the highlights. The box rides with its pane
through splits and tears down if that pane closes. Backed by xterm's search
addon — no extra process, nothing runs until you open it.

## Git diff

`Cmd-G` (or the palette's **Git** group) opens a diff panel scoped to the
**active tab's repo** — the working directory of its focused pane. The left
column lists every changed file from `git status` with a state-tinted dot
(green new, yellow modified, red deleted, blue renamed, purple staged) and its
`+adds −dels` count; click a file (or ↑/↓) to show its unified diff on the
right, with added/removed lines color-coded. Untracked files render whole as
additions. **Refresh** re-reads the tree; `Esc` or **Close** dismisses it.

Read-only by design — panea never stages, commits, or edits the tree; it's a
fast glance at what changed without leaving the terminal. Git runs only when you
open or refresh the panel or click a file, never on a timer.

## Session restore

Close panea and reopen it: your tabs and split layout come back, and each pane
reopens **in the directory it was in** (following `cd`, not just where the tab
started) with its recent **scrollback replayed** as read-only history above a
`──── restored session ────` divider. Nothing is re-run automatically and no
process is revived — a killed process is gone; the replayed text is just there
so you can see where you left off.

**Resuming an AI agent.** If a pane was running an agent CLI (claude, codex, or
a company tool) when you quit, the restored pane shows a **Resume _agent_
session** bar. Click **Resume** and panea types that agent's own resume command
(e.g. `claude --continue`) into the fresh shell — the conversation genuinely
continues because the CLI persists it on disk, not because panea restored a
process. The offer sticks across restarts until you resume or dismiss it (✕).

Which programs count as agents, and the exact resume command for each, live in
`~/.panea/agents.json` (seeded on first run — edit it to fix a flag or add a
tool):

```json
[
  { "name": "claude", "match": ["claude"], "resume": "claude --continue" },
  { "name": "codex",  "match": ["codex"],  "resume": "codex resume" }
]
```

- `name` — display name + what's stored in the session.
- `match` — program basenames that count as this agent (an interpreter like
  `node`/`python` is unwrapped to the script it runs). Defaults to `[name]`.
- `resume` — the shell line the Resume button runs. Detection is whitelist-only:
  a pane running anything not listed here is never flagged or auto-run.

Saved per pane in `~/.panea/session.json`; scrollback is bounded (≈800 lines)
so the file stays small. Detection is on-demand off the existing sidebar poll —
no extra process churn.

## Sidebar context

Each tab row shows live context for its terminal, cmux-style:

- **last agent prompt** (`› …`) — when a pane is running an agent CLI (claude,
  codex, or a company tool), the row shows the most recent prompt you sent it,
  as a description line under the name. Captured from your own keystrokes only
  while an agent is active; ordinary shell typing never appears here.
- **git branch** (green `⑂ branch`) — the repo the shell is currently in.
- **working directory** — follows `cd`, not just where the tab started.
- **listening ports** — pills like `:3000` for any dev server the pane (or its
  children) is serving, aggregated across the tab's splits.

Derived from the pane's process tree with `lsof`/`git`, polled every few
seconds; no shell configuration required. The rail width is draggable (see
[Splitting panes](#splitting-panes)); it defaults to a comfortable 280px.

## Notes

- Open tabs/layout (plus per-pane cwd, agent, and scrollback) persist in
  `~/.panea/session.json`.
- Custom palette commands live in `~/.panea/commands.json`.
- AI-agent detect + resume-command registry lives in `~/.panea/agents.json`.
- Resource-thrifty by design: sidebar metadata for all panes comes from one
  process snapshot per poll (not per-pane spawns), resize work is coalesced to
  one frame, and terminal scrollback defaults to 5000 lines (`SCROLLBACK` in
  `public/js/panes.js`).
- Terminal/UI color: `--term-bg` in `public/style.css` and
  `TERM_THEME.background` in `public/app.js` (currently `#282c34`).
- Shell prompt theme is injected via `ZDOTDIR` without touching your dotfiles.
  Disable with `PANEA_NO_THEME=1`.
- Scales across displays: the layout is fluid (flex + viewport-relative
  overlays), and chrome text uses a rem type scale that steps up on large
  screens (root font-size 16 → 17 ≥2000px → 18 ≥2560px); the palette widens on
  wide viewports too. Terminal font size is independent (`Cmd +/−/0`).
