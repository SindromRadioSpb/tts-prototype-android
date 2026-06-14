#!/usr/bin/env node
// scripts/premium/bump-canon-version.js
// BRR-P1-008b canon refresh — produce canon-v<N>.zip as a SURGICAL copy of the prior
// edition with ONLY library.canon_version + every shelf canon_version bumped. ALL texts,
// sentences, audio_assets and (critically) every audio_asset_key stay byte-identical so
// the prod mp3+timing cache (keyed by those keys) still resolves. Bumping the version makes
// already-imported (stale) devices re-run autoImportCanon → reconcileAudioLinks, which
// re-points each sentence's DEFAULT audio link to the current key → /timing resolves.
//
//   node scripts/premium/bump-canon-version.js --from 3 --to 4
//
// Does NOT re-bake or re-stamp anything (no GCP, no key recompute).

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }

(async () => {
  const FROM = Number(arg("--from", 3));
  const TO = Number(arg("--to", 4));
  const DIR = path.resolve(__dirname, "..", "..", "public", "data", "benyehuda");
  const SRC = path.join(DIR, `canon-v${FROM}.zip`);
  const OUT = path.join(DIR, `canon-v${TO}.zip`);
  if (!fs.existsSync(SRC)) { console.error("ERROR: source not found:", SRC); process.exit(2); }

  const zip = await JSZip.loadAsync(fs.readFileSync(SRC));
  const libPath = zip.file("library/library.json") ? "library/library.json" : "library.json";
  const lib = JSON.parse(await zip.file(libPath).async("string"));

  const before = { library: lib.canon_version, shelves: (lib.shelves || []).map((s) => s && s.canon_version) };
  // capture a fingerprint of the FIRST text's first row key to prove keys are untouched
  const t0 = (lib.texts || [])[0];
  const r0 = t0 && ((t0.rows || t0.sentences || [])[0]);
  const sampleKeyBefore = r0 ? String(r0.audio_asset_key || r0.audioAssetKey || "") : "";

  lib.canon_version = TO;
  for (const s of (lib.shelves || [])) { if (s && s.canon_version != null) s.canon_version = TO; }

  zip.file(libPath, JSON.stringify(lib));
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.writeFileSync(OUT, buf);

  // ── verify the output ──
  const z2 = await JSZip.loadAsync(fs.readFileSync(OUT));
  const l2 = JSON.parse(await z2.file(libPath).async("string"));
  const t2 = (l2.texts || [])[0];
  const r2 = t2 && ((t2.rows || t2.sentences || [])[0]);
  const sampleKeyAfter = r2 ? String(r2.audio_asset_key || r2.audioAssetKey || "") : "";

  console.log("=== bump-canon-version " + FROM + "→" + TO + " ===");
  console.log("wrote:", path.relative(path.resolve(__dirname, "..", ".."), OUT), buf.length, "bytes");
  console.log("before:", JSON.stringify(before));
  console.log("after : library.canon_version=" + l2.canon_version + " | shelves=" + (l2.shelves || []).map((s) => s && s.canon_version).join(","));
  console.log("texts=" + (l2.texts || []).length + " | audio_assets=" + (l2.audio_assets || []).length);
  console.log("sample row key UNCHANGED:", sampleKeyBefore === sampleKeyAfter, "(" + sampleKeyBefore.slice(0, 16) + ")");

  const allShelvesBumped = (l2.shelves || []).every((s) => !s || s.canon_version == null || s.canon_version === TO);
  if (l2.canon_version !== TO || !allShelvesBumped) { console.error("FAIL: version not fully bumped"); process.exit(1); }
  if (sampleKeyBefore !== sampleKeyAfter) { console.error("FAIL: audio_asset_key changed — keys must be preserved!"); process.exit(1); }
  console.log("✓ OK");
})().catch((e) => { console.error("FATAL:", (e && e.stack) || e); process.exit(1); });
