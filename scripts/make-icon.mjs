#!/usr/bin/env node

// Generates build/icon.icns — the Dock/Finder icon for the packaged app.
//
// Written as a raw pixel buffer plus a hand-rolled PNG encoder so the repo
// needs no image dependency: zlib and the system `sips`/`iconutil` are enough.
// The mark is panea's own subject matter — a sidebar rail and two split panes
// on the terminal background.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUILD = path.join(ROOT, "build");
const ICONSET = path.join(BUILD, "panea.iconset");

// Same values as public/css/tokens.css, so the icon matches the running UI.
const BG = [0x28, 0x2c, 0x34];
const RAIL = [0x2f, 0x34, 0x3d];
const ACCENT = [0x2f, 0x6f, 0xeb];
const PANE = [0x3a, 0x3f, 0x4a];
const TEXT = [0xed, 0xed, 0xed];

const S = 1024;

function blend(dst, i, rgb, alpha) {
  for (let c = 0; c < 3; c++) {
    dst[i + c] = Math.round(dst[i + c] * (1 - alpha) + rgb[c] * alpha);
  }
  dst[i + 3] = Math.max(dst[i + 3], Math.round(255 * alpha));
}

// Coverage of a pixel by a rounded rect, sampled on a 3x3 grid so edges are
// antialiased rather than jagged at small icon sizes.
function roundedCoverage(px, py, x, y, w, h, r) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const fx = px + (sx + 0.5) / 3;
      const fy = py + (sy + 0.5) / 3;
      if (fx < x || fx > x + w || fy < y || fy > y + h) continue;
      const cx = Math.min(Math.max(fx, x + r), x + w - r);
      const cy = Math.min(Math.max(fy, y + r), y + h - r);
      const dx = fx - cx;
      const dy = fy - cy;
      if (dx * dx + dy * dy <= r * r) hits++;
    }
  }
  return hits / 9;
}

function fillRounded(buf, x, y, w, h, r, rgb, alpha = 1) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(S, Math.ceil(x + w));
  const y1 = Math.min(S, Math.ceil(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const cov = roundedCoverage(px, py, x, y, w, h, r);
      if (cov > 0) blend(buf, (py * S + px) * 4, rgb, cov * alpha);
    }
  }
}

function draw() {
  const buf = Buffer.alloc(S * S * 4, 0);

  // macOS squircle proportions: the art sits in the middle ~80% of the canvas.
  const M = S * 0.09;
  const D = S - M * 2;
  const R = D * 0.225;
  fillRounded(buf, M, M, D, D, R, BG);

  const pad = D * 0.085;
  const innerX = M + pad;
  const innerY = M + pad;
  const innerW = D - pad * 2;
  const innerH = D - pad * 2;
  const gap = D * 0.045;
  const radius = D * 0.05;

  // Sidebar rail with the active-tab pill, mirroring the real layout.
  const railW = innerW * 0.28;
  fillRounded(buf, innerX, innerY, railW, innerH, radius, RAIL);

  const rowH = innerH * 0.15;
  const rowX = innerX + railW * 0.16;
  const rowW = railW * 0.68;
  fillRounded(buf, rowX, innerY + innerH * 0.1, rowW, rowH, radius * 0.6, ACCENT);
  for (let i = 1; i < 3; i++) {
    const y = innerY + innerH * 0.1 + i * (rowH + innerH * 0.06);
    fillRounded(buf, rowX, y, rowW, rowH, radius * 0.6, TEXT, 0.22);
  }

  // Two stacked panes to the right of the rail — the "panes" in panea.
  const paneX = innerX + railW + gap;
  const paneW = innerW - railW - gap;
  const paneH = (innerH - gap) / 2;
  fillRounded(buf, paneX, innerY, paneW, paneH, radius, PANE);
  fillRounded(buf, paneX, innerY + paneH + gap, paneW, paneH, radius, PANE);

  // A prompt caret in the top pane so it reads as a terminal, not a wireframe.
  const cw = paneW * 0.055;
  const cx = paneX + paneW * 0.12;
  const cy = innerY + paneH * 0.42;
  fillRounded(buf, cx, cy, cw * 2.6, cw * 0.62, cw * 0.31, ACCENT);
  fillRounded(buf, cx + cw * 3.2, cy, cw * 4.2, cw * 0.62, cw * 0.31, TEXT, 0.5);

  return buf;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // Filter byte 0 per scanline: the image is tiny and only built once.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.rmSync(ICONSET, { recursive: true, force: true });
fs.mkdirSync(ICONSET, { recursive: true });

const master = path.join(BUILD, "icon.png");
fs.writeFileSync(master, encodePng(draw(), S));

// iconutil requires exactly these names; sips downsamples from the 1024 master.
for (const [size, name] of [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"],
]) {
  execFileSync("sips", ["-z", String(size), String(size), master, "--out", path.join(ICONSET, name)], {
    stdio: "ignore",
  });
}

execFileSync("iconutil", ["-c", "icns", ICONSET, "-o", path.join(BUILD, "icon.icns")]);
fs.rmSync(ICONSET, { recursive: true, force: true });

console.log("icon written to build/icon.icns");
