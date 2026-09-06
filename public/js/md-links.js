

const MD_RE = /(?:[\w.~-]+\/)*[\w.-]+\.md\b/g;

export function findMdLinks(text) {
  const links = [];
  MD_RE.lastIndex = 0;
  let m;
  while ((m = MD_RE.exec(text))) {
    links.push({ text: m[0], startCol: m.index + 1, endCol: m.index + m[0].length });
  }
  return links;
}

export function findMdLinksAcrossRows(rowTexts, currentRowIndex) {
  if (rowTexts.length === 1) return findMdLinks(rowTexts[0]);

  let joined = "";
  const offsets = [];
  for (const t of rowTexts) { offsets.push(joined.length); joined += t; }
  const found = findMdLinks(joined);
  if (!found.length) return [];

  const curOffset = offsets[currentRowIndex];
  const curLen = rowTexts[currentRowIndex].length;
  const links = [];
  for (const f of found) {
    const s = f.startCol - 1, e = f.endCol - 1;
    if (e <= curOffset || s >= curOffset + curLen) continue;
    links.push({
      text: f.text,
      startCol: Math.max(s, curOffset) - curOffset + 1,
      endCol: Math.min(e, curOffset + curLen) - curOffset,
    });
  }
  return links;
}
