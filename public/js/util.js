// Pure helpers: encoding, ids, path formatting, and pane-tree traversal.
// No DOM, no app state — safe to import anywhere.

export const enc = new TextEncoder();

// Binary-safe base64 over JSON (terminal bytes travel as base64 strings).
export function u8ToB64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
export function b64ToU8(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

export function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2);
}

// "~/parent/dir" for the sidebar sub-line; "zsh" when there is no cwd.
export function shortPath(cwd) {
  if (!cwd) return "zsh";
  const parts = cwd.split("/").filter(Boolean);
  return "~/" + parts.slice(-2).join("/");
}

// ---- pane-tree traversal --------------------------------------------------
// A tree node is either a leaf { kind:"leaf", id } or a split
// { kind:"split", dir:"h"|"v", children:[node, node] }.

export function countLeaves(node) {
  return node.kind === "leaf" ? 1 : countLeaves(node.children[0]) + countLeaves(node.children[1]);
}
export function firstLeaf(node) {
  return node.kind === "leaf" ? node : firstLeaf(node.children[0]);
}
export function eachLeaf(node, fn) {
  if (!node) return;
  if (node.kind === "leaf") fn(node);
  else { eachLeaf(node.children[0], fn); eachLeaf(node.children[1], fn); }
}
export function findLeaf(node, id, parent) {
  if (node.kind === "leaf") return node.id === id ? { node, parent } : null;
  return findLeaf(node.children[0], id, node) || findLeaf(node.children[1], id, node);
}
export function findParentOf(node, target, parent) {
  if (node.kind === "leaf") return null;
  if (node === target) return parent;
  return findParentOf(node.children[0], target, node) || findParentOf(node.children[1], target, node);
}

// Turn a raw OSC terminal title into a concise label: strip a "user@host:"
// prefix, collapse a bare path to its last segment, and cap the length.
export function cleanTitle(t) {
  t = (t || "").trim();
  t = t.replace(/^\S+@\S+:\s*/, "");
  t = t.replace(/\s+/g, " ");
  if (/^[~/]/.test(t) && !/\s/.test(t)) {
    const seg = t.replace(/\/+$/, "").split("/").filter(Boolean).pop();
    if (seg) t = seg;
  }
  if (t.length > 40) t = t.slice(0, 39) + "…";
  return t || "shell";
}
