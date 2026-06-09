#!/usr/bin/env node
// scripts/premium/build-canon-v3.js
// BRR-P0-007 · Slice 3 — stamp the pre-baked audio onto a NEW canon-v3.zip.
//
// Self-contained zip-restamp: reads the SAME public/data/benyehuda/canon-v2.zip
// the bake read (so per-row asset keys are byte-identical — zero drift), plus the
// bake's stamp-manifest, and writes canon-v3.zip with, additively:
//   • row.audio_asset_key      = the baked 'row' key (vocalised text, voice A)
//   • library.audio_assets[]   = one metadata entry per unique key
//   • corpus.audio_status      = 'tts'  (R1: machine TTS, NEVER 'human')
//   • shelf.origin / canon_version + library.canon_version = 3   (P0-008)
// No MP3 bytes are embedded (D1 server-cache streaming) — canon-v3 stays ~tiny;
// the MP3s live in prod's audio cache (Slice 4 push) and tier-1 streams them.
//
//   node scripts/premium/build-canon-v3.js [--manifest <stamp-manifest.json>] [--out <zip>]
//
// Honest gate: a non-empty row whose key is NOT in the bake manifest aborts the
// build (don't ship a half-baked canon).

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { stampCanonAudio, DEFAULT_CANON_VERSION: CANON_VERSION } = require("./lib/stampCanon");

const ROOT = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const a = {
    inZip: path.join(ROOT, "public", "data", "benyehuda", "canon-v2.zip"),
    manifest: path.join(ROOT, ".tmp", "benyehuda-audio", "stamp-manifest.json"),
    out: path.join(ROOT, "public", "data", "benyehuda", "canon-v3.zip"),
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--manifest") a.manifest = path.resolve(String(argv[++i] || a.manifest));
    else if (k === "--out") a.out = path.resolve(String(argv[++i] || a.out));
    else if (k === "--in") a.inZip = path.resolve(String(argv[++i] || a.inZip));
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.manifest)) { console.error("ERROR: stamp-manifest not found: " + args.manifest + "\nRun bake-canon-audio.js first."); process.exit(2); }
  const manifest = JSON.parse(fs.readFileSync(args.manifest, "utf8"));
  const voiceName = manifest.voiceName;
  if (!manifest.profile || !voiceName) { console.error("ERROR: manifest missing profile/voiceName."); process.exit(2); }

  const zip = await JSZip.loadAsync(fs.readFileSync(args.inZip));
  const lib = JSON.parse(await zip.file("library/library.json").async("string"));
  const topManifest = JSON.parse(await zip.file("manifest.json").async("string"));

  const res = stampCanonAudio(lib, manifest, { topManifest, canonVersion: CANON_VERSION });

  if (res.missing.length) {
    console.error("ABORT: " + res.missing.length + " non-empty row(s) have NO baked audio (bake incomplete). First few:");
    for (const m of res.missing.slice(0, 8)) console.error("   " + m.key.slice(0, 12) + "…  text_key=" + String(m.text_key).slice(0, 10) + "  " + m.preview);
    console.error("Re-run bake-canon-audio.js to completion, then retry.");
    process.exit(1);
  }
  const stampedRows = res.stats.stampedRows, emptyRows = res.stats.emptyRows;

  const out = new JSZip();
  out.file("manifest.json", JSON.stringify(topManifest, null, 2));
  out.folder("library").file("library.json", JSON.stringify(lib));
  const buf = await out.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, buf);

  const erasTouched = new Set();
  for (const t of (lib.texts || [])) { if (t.corpus && t.corpus.audio_status === "tts" && t.corpus.era) erasTouched.add(t.corpus.era); }

  console.log("=== canon-v3 stamped ===");
  console.log("voice=" + voiceName + "  canon_version=" + CANON_VERSION);
  console.log("texts=" + res.stats.texts + "  rows stamped=" + stampedRows + "  empty rows=" + emptyRows);
  console.log("unique audio_assets=" + lib.audio_assets.length + "  eras voiced: " + Array.from(erasTouched).join(", "));
  console.log("shelves stamped (origin+canon_version)=" + res.stats.shelvesStamped);
  console.log("out → " + path.relative(ROOT, args.out) + "  (" + (buf.length / 1024).toFixed(0) + " KB)");
  console.log("\n✓ canon-v3 ready. Next: push MP3s (push-canon-audio.js) + ship (Slice 4).");
}

main().catch((e) => { console.error("FATAL:", (e && e.stack) || e); process.exit(1); });
