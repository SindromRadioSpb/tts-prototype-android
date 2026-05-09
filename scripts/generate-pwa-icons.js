#!/usr/bin/env node
/*
 * Pure-Node PNG icon generator for PWA.
 *
 * Generates 192/512/180/favicon PNGs without any external dependencies
 * (uses only built-in zlib + Buffer). Hand-draws the "LP" monogram with
 * geometric primitives so it stays crisp at every size.
 *
 * Run: `node scripts/generate-pwa-icons.js`
 *
 * Outputs into public/icons/:
 *   - icon-192.png  (manifest)
 *   - icon-512.png  (manifest, splash on Android)
 *   - icon-512-maskable.png  (manifest purpose:maskable, safe-zone variant)
 *   - apple-touch-icon-180.png  (iOS home screen)
 *   - favicon-32.png  (browser tab)
 *   - favicon.ico is shipped as the favicon-32 PNG (browsers accept).
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT_DIR = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Colors ──────────────────────────────────────────────────────────────
const BG = [0x0f, 0x17, 0x2a, 0xff];        // slate-900
const FG = [0xf8, 0xfa, 0xfc, 0xff];        // slate-50
const ACCENT = [0x25, 0x63, 0xeb, 0xff];    // blue-600

// ── Pixel buffer helpers ────────────────────────────────────────────────
function makeBuffer(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = BG[0]; buf[i + 1] = BG[1]; buf[i + 2] = BG[2]; buf[i + 3] = BG[3];
  }
  return buf;
}
function setPixel(buf, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2]; buf[i + 3] = color[3];
}
function fillRect(buf, size, x0, y0, x1, y1, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      setPixel(buf, size, x, y, color);
    }
  }
}
// Filled disk (anti-alias-free, but at icon scale it's fine).
function fillDisk(buf, size, cx, cy, r, color) {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(size, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(size, Math.ceil(cy + r));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(buf, size, x, y, color);
    }
  }
}
// Rounded-rect background (for non-maskable icons; iOS rounds anyway, but
// Android desktop / favicons benefit from a soft corner).
function fillRoundedBg(buf, size, radius, color) {
  fillRect(buf, size, 0, 0, size, size, color);
  // Knock out corners to transparent... we keep solid (system masks handle
  // rounding); this function exists for future maskable variants.
}

// ── LP monogram ─────────────────────────────────────────────────────────
// Draws into a normalized 512×512 layout, scaled to actual size.
// Letters sit in central 80% of canvas (maskable safe-zone).
function drawLP(buf, size, opts = {}) {
  const safeZone = opts.maskable ? 0.8 : 0.92;
  const scale = (size * safeZone) / 512;
  const offX = (size - 512 * scale) / 2;
  const offY = (size - 512 * scale) / 2;

  function R(x0, y0, x1, y1, color) {
    fillRect(
      buf, size,
      Math.round(offX + x0 * scale),
      Math.round(offY + y0 * scale),
      Math.round(offX + x1 * scale),
      Math.round(offY + y1 * scale),
      color
    );
  }
  function D(cx, cy, r, color) {
    fillDisk(
      buf, size,
      offX + cx * scale,
      offY + cy * scale,
      r * scale,
      color
    );
  }

  // Accent bar at bottom (full bleed, 40px tall in 512 grid).
  if (!opts.maskable) {
    fillRect(buf, size, 0, Math.round(size * 0.92), size, size, ACCENT);
  } else {
    // For maskable, accent inside safe zone instead of edge.
    R(0, 472, 512, 488, ACCENT);
  }

  // L: vertical bar (128..184, y=128..328) + foot (128..248, y=272..328).
  R(128, 128, 184, 328, FG);
  R(128, 272, 248, 328, FG);

  // P: vertical bar (288..344, y=128..328).
  R(288, 128, 344, 328, FG);
  // P bowl: filled half-disk on right side, then knock out interior.
  D(344, 184, 56, FG);   // outer bowl (radius 56)
  D(344, 184, 24, BG);   // inner cut-out (radius 24)
  // Top + bottom caps that connect bowl to bar (in case disk approximation
  // leaves a gap at exact y=128/y=240).
  R(344, 128, 400, 144, FG);
  R(344, 224, 400, 240, FG);
}

// ── PNG encoder ─────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Add filter byte (0 = None) per scanline.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Generate ────────────────────────────────────────────────────────────
function generate(filename, size, opts = {}) {
  const buf = makeBuffer(size);
  drawLP(buf, size, opts);
  const png = encodePng(buf, size);
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, png);
  console.log(`  ${filename}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log("Generating PWA icons →", OUT_DIR);
generate("icon-192.png", 192);
generate("icon-512.png", 512);
generate("icon-512-maskable.png", 512, { maskable: true });
generate("apple-touch-icon-180.png", 180);
generate("favicon-32.png", 32);
console.log("Done.");
