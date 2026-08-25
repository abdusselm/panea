#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DATA = path.join(ROOT, "data", "traffic.json");

const REPOS = (process.env.PANEA_TRAFFIC_REPOS || "abdusselm/panea,abdusselm/homebrew-tap")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

const TOKEN = process.env.TRAFFIC_TOKEN || process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("collect-traffic: needs TRAFFIC_TOKEN with push access to every repo listed");
  process.exit(1);
}

async function traffic(repo, metric) {
  const res = await fetch(`https://api.github.com/repos/${repo}/traffic/${metric}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${TOKEN}`,
      "user-agent": "panea-traffic",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${repo}/traffic/${metric}`);
  return res.json();
}

function merge(existing, buckets) {
  const merged = { ...existing };
  for (const bucket of buckets) {
    merged[bucket.timestamp.slice(0, 10)] = { count: bucket.count, uniques: bucket.uniques };
  }
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
}

function read() {
  try {
    return JSON.parse(fs.readFileSync(DATA, "utf8"));
  } catch {
    return {};
  }
}

const store = read();

for (const repo of REPOS) {
  const [clones, views] = await Promise.all([traffic(repo, "clones"), traffic(repo, "views")]);
  const before = store[repo] ?? {};
  store[repo] = {
    clones: merge(before.clones, clones.clones ?? []),
    views: merge(before.views, views.views ?? []),
  };
  const days = Object.keys(store[repo].clones).length;
  console.log(`${repo}: ${days} days kept, latest window ${clones.uniques} unique cloners`);
}

fs.mkdirSync(path.dirname(DATA), { recursive: true });
fs.writeFileSync(DATA, `${JSON.stringify(store, null, 2)}\n`);

console.log(`wrote ${DATA}`);
