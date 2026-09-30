#!/usr/bin/env node
"use strict";
// LinguistPro Worlds — build pixel-art atlases from hand-authored palette grids.
//
// Source of truth: art/worlds/<world>/*.px (text). Each file:
//   palette lines   `<char> #rrggbb` (or `<char> transparent`)
//   frame blocks    `@frame <id> <w>x<h> [anchor=x,y]` followed by exactly <h> rows of <w> chars
//   comments        lines starting with `#` (outside a frame block)
//   `@split`        (optional) emit every frame as its own PNG `<name>-<frame>.png` — required for
//                   tiles and strips that CSS repeats (a repeated background cannot address an atlas cell)
// Output (per .px file = one atlas): public/worlds/<world>/<name>.png (frames packed left-to-right,
// one row) + an `atlas` entry in public/worlds/<world>/atlas.json with frame rects, anchors and a
// sha256 of the PNG. `--preview` also writes an 8x nearest-neighbour preview for human review.
//
// Usage: node scripts/worlds/build-world-art.js <world> [--preview=<dir>] [--check]
//   --check  rebuild in memory and fail if committed PNG/atlas bytes differ (reproducibility gate).

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..", "..");

function parsePx(text, file) {
  const palette = new Map();
  const frames = [];
  let split = false;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith("#")) continue;
    if (line.trim() === "@split") { split = true; continue; }
    const head = /^@frame\s+([a-z0-9][a-z0-9._-]*)\s+(\d+)x(\d+)(?:\s+anchor=(\d+),(\d+))?\s*$/.exec(line);
    if (head) {
      const [, id, w, h, ax, ay] = head;
      const width = Number(w), height = Number(h);
      const rows = lines.slice(i + 1, i + 1 + height);
      if (rows.length !== height) throw new Error(`${file}:${i + 1} frame ${id}: expected ${height} rows`);
      rows.forEach((row, r) => {
        if (row.length !== width) throw new Error(`${file}:${i + 2 + r} frame ${id}: row ${r} has ${row.length} chars, expected ${width}`);
        for (const ch of row) if (!palette.has(ch)) throw new Error(`${file}:${i + 2 + r} frame ${id}: unknown palette char '${ch}'`);
      });
      if (frames.some((f) => f.id === id)) throw new Error(`${file}: duplicate frame ${id}`);
      frames.push({ id, width, height, rows, anchor: ax == null ? [Math.floor(width / 2), height - 1] : [Number(ax), Number(ay)] });
      i += height;
      continue;
    }
    const pal = /^(\S)\s+(transparent|#[0-9a-fA-F]{6})\s*(?:#.*)?$/.exec(line);
    if (pal) {
      if (palette.has(pal[1])) throw new Error(`${file}:${i + 1} duplicate palette char '${pal[1]}'`);
      palette.set(pal[1], pal[2] === "transparent" ? null : pal[2].toLowerCase());
      continue;
    }
    throw new Error(`${file}:${i + 1} cannot parse: ${line.slice(0, 60)}`);
  }
  if (!frames.length) throw new Error(`${file}: no frames`);
  return { palette, frames, split };
}

function rgba(hex) {
  if (!hex) return [0, 0, 0, 0];
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
}

// Packs frames left-to-right with a 1px transparent gutter so bilinear bleed is impossible even if
// a browser ignores image-rendering: pixelated.
function composeAtlas({ palette, frames }) {
  const GUTTER = 1;
  const width = frames.reduce((s, f) => s + f.width, 0) + GUTTER * (frames.length - 1);
  const height = Math.max(...frames.map((f) => f.height));
  const px = new Uint8Array(width * height * 4);
  const rects = {};
  let x0 = 0;
  for (const f of frames) {
    f.rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const [r, g, b, a] = rgba(palette.get(ch));
        const o = ((y) * width + (x0 + x)) * 4;
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
      });
    });
    rects[f.id] = { x: x0, y: 0, w: f.width, h: f.height, anchor: f.anchor };
    x0 += f.width + GUTTER;
  }
  return { width, height, px, rects };
}

function scalePx({ width, height, px }, k) {
  const W = width * k, H = height * k;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = ((Math.floor(y / k)) * width + Math.floor(x / k)) * 4, d = (y * W + x) * 4;
    out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3];
  }
  return { width: W, height: H, px: out };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// Deterministic RGBA PNG (no timestamps, fixed zlib level) so --check can compare bytes.
function encodePng({ width, height, px }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(px.buffer, px.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function build(world, { preview, check } = {}) {
  const srcDir = path.join(ROOT, "art", "worlds", world);
  const outDir = path.join(ROOT, "public", "worlds", world);
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".px")).sort();
  if (!files.length) throw new Error(`no .px sources in ${srcDir}`);
  const atlas = { schema: "lp-world-atlas/1", world, atlases: {} };
  const outputs = [];
  for (const file of files) {
    const base = file.replace(/\.px$/, "");
    const parsed = parsePx(fs.readFileSync(path.join(srcDir, file), "utf8"), file);
    const units = parsed.split
      ? parsed.frames.map((f) => ({ name: `${base}-${f.id}`, parsed: { palette: parsed.palette, frames: [f] } }))
      : [{ name: base, parsed }];
    for (const { name, parsed } of units) {
    const img = composeAtlas(parsed);
    const png = encodePng(img);
    const sha256 = crypto.createHash("sha256").update(png).digest("hex");
    atlas.atlases[name] = {
      file: name + ".png", width: img.width, height: img.height, bytes: png.length, sha256,
      colors: [...new Set([...parsed.palette.values()].filter(Boolean))].length,
      frames: img.rects,
    };
    outputs.push({ path: path.join(outDir, name + ".png"), bytes: png });
    if (preview) {
      fs.mkdirSync(preview, { recursive: true });
      fs.writeFileSync(path.join(preview, `${name}.x8.png`), encodePng(scalePx(img, 8)));
    }
    }
  }
  outputs.push({ path: path.join(outDir, "atlas.json"), bytes: Buffer.from(JSON.stringify(atlas, null, 2) + "\n") });
  if (check) {
    const stale = outputs.filter((o) => !fs.existsSync(o.path) || !fs.readFileSync(o.path).equals(o.bytes));
    if (stale.length) throw new Error("world art is stale; rebuild: " + stale.map((o) => path.relative(ROOT, o.path)).join(", "));
    return atlas;
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const o of outputs) fs.writeFileSync(o.path, o.bytes);
  return atlas;
}

module.exports = { parsePx, composeAtlas, encodePng, build };

if (require.main === module) {
  const [world, ...rest] = process.argv.slice(2);
  if (!world) { console.error("usage: build-world-art.js <world> [--preview=<dir>] [--check]"); process.exit(2); }
  const opt = {};
  for (const a of rest) {
    if (a === "--check") opt.check = true;
    else if (a.startsWith("--preview=")) opt.preview = path.resolve(a.slice(10));
  }
  const atlas = build(world, opt);
  for (const [name, a] of Object.entries(atlas.atlases)) {
    console.log(`${name}: ${a.width}x${a.height} ${a.bytes}B ${a.colors} colors, ${Object.keys(a.frames).length} frames, sha256 ${a.sha256.slice(0, 12)}`);
  }
  if (opt.check) console.log("world art up to date");
}
