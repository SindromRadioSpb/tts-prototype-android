#!/usr/bin/env node
// scripts/premium/bake-voice-sample.js
// BRR-P0-007 · Slice 0 — synthesize ONE representative vocalised canon passage
// in each he-IL WaveNet voice so the owner picks THE narrator by ear before the
// full 6,646-row bake (R7: listen before committing).
//
//   GCP_TTS_API_KEY=AIza... node scripts/premium/bake-voice-sample.js
//
// Reads public/data/benyehuda/canon-v2.zip, takes the opening vocalised lines of
// the first literary text, and writes .tmp/benyehuda-audio/samples/<voice>.mp3.
// Key from env only — never written to disk/code.

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { VOICE_CANDIDATES, defaultProfile, rowText, synthesizeMp3, keyForText, utf8Len } = require("./lib/ttsBake");

const ROOT = path.resolve(__dirname, "..", "..");
const CANON_ZIP = path.join(ROOT, "public", "data", "benyehuda", "canon-v2.zip");
const OUT_DIR = path.join(ROOT, ".tmp", "benyehuda-audio", "samples");

async function loadLibrary() {
  const zip = await JSZip.loadAsync(fs.readFileSync(CANON_ZIP));
  const f = zip.file("library/library.json");
  if (!f) throw new Error("library/library.json not found in " + CANON_ZIP);
  return JSON.parse(await f.async("string"));
}

// Pick a representative passage: first text's opening vocalised lines, capped to
// a comfortable listening length (~220 chars) so each voice clip is a few seconds.
function pickSample(lib) {
  const texts = Array.isArray(lib.texts) ? lib.texts : [];
  for (const t of texts) {
    const rows = t.rows || t.sentences || [];
    const lines = [];
    let chars = 0;
    for (const r of rows) {
      const txt = rowText(r);
      if (!txt || !/[֑-״]/.test(txt)) continue; // require vocalised Hebrew
      lines.push(txt);
      chars += txt.length;
      if (chars >= 160 || lines.length >= 4) break;
    }
    if (lines.length >= 2) {
      return { title: t.title || t.text_key, era: t.corpus && t.corpus.era, text: lines.join("\n") };
    }
  }
  throw new Error("no vocalised sample passage found in canon");
}

async function main() {
  const apiKey = String(process.env.GCP_TTS_API_KEY || process.env.GCP_TTS_KEY || "").trim();
  if (!apiKey) { console.error("ERROR: set GCP_TTS_API_KEY in env."); process.exit(2); }
  if (!apiKey.startsWith("AIza")) { console.error("ERROR: key must start with 'AIza'."); process.exit(2); }

  const lib = await loadLibrary();
  const sample = pickSample(lib);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("Sample passage (era=" + (sample.era || "?") + ", text=\"" + sample.title + "\"):");
  console.log("  " + sample.text.replace(/\n/g, " / "));
  console.log("  chars=" + sample.text.length + "  bytes=" + utf8Len(sample.text));
  console.log("Baking " + VOICE_CANDIDATES.length + " voice samples → " + OUT_DIR + "\n");

  const results = [];
  for (const voice of VOICE_CANDIDATES) {
    const profile = defaultProfile(voice);
    const key = keyForText(sample.text, profile);
    try {
      const mp3 = await synthesizeMp3(apiKey, sample.text, profile);
      const out = path.join(OUT_DIR, voice + ".mp3");
      fs.writeFileSync(out, mp3);
      results.push({ voice, ok: true, bytes: mp3.length, key });
      console.log("  ✓ " + voice + "  " + (mp3.length / 1024).toFixed(1) + " KB  key=" + key.slice(0, 12) + "…");
    } catch (e) {
      results.push({ voice, ok: false, error: (e && e.message) || String(e), status: e && e.status });
      console.log("  ✗ " + voice + "  " + ((e && e.message) || e) + (e && e.status ? " (HTTP " + e.status + ")" : ""));
    }
  }

  const ok = results.filter((r) => r.ok).length;
  console.log("\nDone: " + ok + "/" + VOICE_CANDIDATES.length + " voices synthesized.");
  if (ok === 0) process.exit(1);
}

main().catch((e) => { console.error("FATAL:", (e && e.stack) || e); process.exit(1); });
