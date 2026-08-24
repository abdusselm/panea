

import { Pane } from "./pane.js";
import { onShutdown } from "./shutdown.js";

const DETACHED_BUFFER_MAX = 512 * 1024;

const entries = new Map();
let shutdownHooked = false;

function hookShutdown() {
  if (shutdownHooked) return;
  shutdownHooked = true;
  onShutdown(killAll);
}

function buffer(entry, chunk) {
  entry.chunks.push(chunk);
  entry.buffered += chunk.length;
  while (entry.buffered > DETACHED_BUFFER_MAX && entry.chunks.length > 1) {
    entry.buffered -= entry.chunks.shift().length;
  }
}

function drop(id) {
  const entry = entries.get(id);
  if (!entry) return;
  entries.delete(id);
  entry.sink = null;
  entry.chunks = [];
  entry.buffered = 0;
  entry.pane.kill();
}

export function openPane(id, opts) {
  const existing = entries.get(id);
  if (existing && existing.exitCode === null) return existing;
  if (existing) drop(id);
  hookShutdown();

  const entry = { id, pane: null, sink: null, chunks: [], buffered: 0, exitCode: null };
  entry.pane = new Pane(
    id,
    opts,
    (data) => {
      if (entry.sink) entry.sink.output(data);
      else buffer(entry, data);
    },
    (code) => {
      entry.exitCode = code;
      if (entry.sink) entry.sink.exit(code);
    }
  );
  entries.set(id, entry);
  return entry;
}

export function attachPane(id, sink) {
  const entry = entries.get(id);
  if (!entry) return null;
  entry.sink = sink;
  if (entry.chunks.length) {
    const pending = entry.chunks;
    entry.chunks = [];
    entry.buffered = 0;
    for (const chunk of pending) sink.output(chunk);
  }
  if (entry.exitCode !== null) sink.exit(entry.exitCode);
  return entry;
}

export function detachPane(id, sink) {
  const entry = entries.get(id);
  if (entry && entry.sink === sink) entry.sink = null;
}

export function livePane(id) {
  const entry = entries.get(id);
  return entry && entry.exitCode === null ? entry.pane : null;
}

export function closePane(id) {
  drop(id);
}

export function killAll() {
  for (const id of [...entries.keys()]) drop(id);
}
