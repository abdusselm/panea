

const CUBE = [0, 95, 135, 175, 215, 255];

function paletteColor(index, ansi) {
  if (index < 16) return ansi[index] || "";
  if (index < 232) {
    const n = index - 16;
    const r = CUBE[Math.floor(n / 36) % 6];
    const g = CUBE[Math.floor(n / 6) % 6];
    const b = CUBE[n % 6];
    return `rgb(${r},${g},${b})`;
  }
  const v = 8 + (index - 232) * 10;
  return `rgb(${v},${v},${v})`;
}

function rgbColor(value) {
  return "#" + (value & 0xffffff).toString(16).padStart(6, "0");
}

function colorOf(cell, which, ansi) {
  if (which === "fg") {
    if (cell.isFgDefault()) return "";
    if (cell.isFgRGB()) return rgbColor(cell.getFgColor());
    if (cell.isFgPalette()) return paletteColor(cell.getFgColor(), ansi);
    return "";
  }
  if (cell.isBgDefault()) return "";
  if (cell.isBgRGB()) return rgbColor(cell.getBgColor());
  if (cell.isBgPalette()) return paletteColor(cell.getBgColor(), ansi);
  return "";
}

function styleOf(cell, ansi) {
  let fg = colorOf(cell, "fg", ansi);
  let bg = colorOf(cell, "bg", ansi);
  if (cell.isInverse()) {
    const swap = fg;
    fg = bg || ansi.background || "";
    bg = swap || ansi.foreground || "";
  }
  let css = "";
  if (fg) css += "color:" + fg + ";";
  if (bg) css += "background:" + bg + ";";
  if (cell.isBold()) css += "font-weight:600;";
  if (cell.isItalic()) css += "font-style:italic;";
  if (cell.isDim()) css += "opacity:.65;";
  if (cell.isUnderline()) css += "text-decoration:underline;";
  if (cell.isStrikethrough()) css += "text-decoration:line-through;";
  return css;
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function lineToHtml(line, ansi = {}) {
  if (!line || typeof line.getCell !== "function") return "";
  let width = line.length || 0;
  while (width > 0) {
    const tail = line.getCell(width - 1);
    const chars = tail && tail.getChars();
    if (chars && chars.trim()) break;
    width--;
  }
  let html = "";
  let runStyle = null;
  let runText = "";
  const flush = () => {
    if (!runText) return;
    const body = escapeHtml(runText);
    html += runStyle ? `<span style="${runStyle}">${body}</span>` : body;
    runText = "";
  };
  for (let x = 0; x < width; x++) {
    const cell = line.getCell(x);
    if (!cell) continue;
    if (cell.getWidth() === 0) continue;
    const chars = cell.isInvisible && cell.isInvisible() ? " " : cell.getChars() || " ";
    const css = styleOf(cell, ansi);
    if (css !== runStyle) { flush(); runStyle = css; }
    runText += chars;
  }
  flush();
  return html;
}

export function linesToHtml(getLine, start, end, ansi = {}) {
  if (typeof getLine !== "function") return "";
  const rows = [];
  let carried = "";
  for (let i = start; i <= end; i++) {
    carried += lineToHtml(getLine(i), ansi);
    const next = i < end ? getLine(i + 1) : null;
    if (next && next.isWrapped) continue;
    rows.push(carried);
    carried = "";
  }
  if (carried) rows.push(carried);
  while (rows.length && !rows[rows.length - 1]) rows.pop();
  return rows.join("\n");
}
