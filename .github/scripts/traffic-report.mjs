#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DATA = path.join(ROOT, "data", "traffic.json");

const WINDOW_DAYS = Number(process.argv[2] || 30);

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA, "utf8"));
  } catch {
    console.error(`no snapshots yet at ${DATA} — run: node .github/scripts/collect-traffic.mjs`);
    process.exit(1);
  }
}

function since(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function totals(series, from) {
  let count = 0;
  let uniques = 0;
  let active = 0;
  for (const [day, value] of Object.entries(series ?? {})) {
    if (day < from) continue;
    count += value.count;
    uniques += value.uniques;
    if (value.count > 0) active += 1;
  }
  return { count, uniques, active };
}

const store = load();
const from = since(WINDOW_DAYS);

console.log(`last ${WINDOW_DAYS} days, since ${from}\n`);

for (const [repo, series] of Object.entries(store)) {
  const clones = totals(series.clones, from);
  const views = totals(series.views, from);
  console.log(repo);
  console.log(`  clones  ${clones.count} total, ${clones.uniques} unique, ${clones.active} active days`);
  console.log(`  views   ${views.count} total, ${views.uniques} unique`);
  console.log("");
}

const tap = Object.keys(store).find((repo) => repo.includes("homebrew-tap"));

if (tap) {
  const { uniques } = totals(store[tap].clones, from);
  console.log(`brew reach: ${uniques} unique machines fetched the tap`);
  console.log("counts installs and updates together, deduplicated per day, not per person");
}
