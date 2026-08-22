// Visual constants: terminal colors, coding font stack, inline icons.
// Keep TERM_THEME.background in sync with --term-bg in style.css.

// cmux / ghostty Tomorrow-Night ANSI set on the dark neutral-grey background.
export const TERM_THEME = {
  background: "#282c34",
  foreground: "#c5c8c6",
  cursor: "#87afd7",
  selectionBackground: "#3a3a3a",
  black: "#1d1f21", brightBlack: "#666666",
  red: "#cc6666", brightRed: "#d54e53",
  green: "#b5bd68", brightGreen: "#b9ca4a",
  yellow: "#f0c674", brightYellow: "#e7c547",
  blue: "#81a2be", brightBlue: "#7aa6da",
  magenta: "#b294bb", brightMagenta: "#c397d8",
  cyan: "#8abeb7", brightCyan: "#70c0b1",
  white: "#c5c8c6", brightWhite: "#eaeaea",
};

// SF Mono (preinstalled on macOS) first; JetBrains Mono / Fira Code if present;
// Menlo as the safe fallback. Roomier line height eases long coding sessions.
export const FONT_FAMILY = '"SF Mono", "JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace';
export const FONT_LINE_HEIGHT = 1.3;
export const DEFAULT_FONT_SIZE = 14;
export const MIN_FONT_SIZE = 9;
export const MAX_FONT_SIZE = 24;

// Inline SVG icons (crisp, cmux-like, no external assets).
export const ICON = {
  folder: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h5.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/></svg>',
  splitH: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><line x1="8" y1="2.5" x2="8" y2="13.5"/></svg>',
  splitV: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><line x1="1.5" y1="8" x2="14.5" y2="8"/></svg>',
  close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>',
};
