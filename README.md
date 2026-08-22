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
| `Shift-Cmd-N` | notification panel |
| `Cmd-T` | new tab |
| `Cmd-W` | close focused pane |
| `Cmd-D` | split right |
| `Cmd-Shift-D` | split down |
| `Cmd-1 … 9` | switch tab |
| `Cmd +` / `Cmd −` / `Cmd 0` | font size up / down / reset |
| double-click / right-click tab | rename |

## Command palette

`Cmd-K` opens a fuzzy command palette: built-in actions (new tab, split,
close, font size, jump to next notification, switch tab …) plus your own
custom commands.

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

## Sidebar context

Each tab row shows live context for its terminal, cmux-style:

- **git branch** (green `⑂ branch`) — the repo the shell is currently in.
- **working directory** — follows `cd`, not just where the tab started.
- **listening ports** — pills like `:3000` for any dev server the pane (or its
  children) is serving, aggregated across the tab's splits.

Derived from the pane's process tree with `lsof`/`git`, polled every few
seconds; no shell configuration required.

## Notes

- Open tabs/layout persist in `~/.panea/session.json`.
- Custom palette commands live in `~/.panea/commands.json`.
- Terminal/UI color: `--term-bg` in `public/style.css` and
  `TERM_THEME.background` in `public/app.js` (currently `#282c34`).
- Shell prompt theme is injected via `ZDOTDIR` without touching your dotfiles.
  Disable with `PANEA_NO_THEME=1`.
