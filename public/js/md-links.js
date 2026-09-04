

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
