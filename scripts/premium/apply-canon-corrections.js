#!/usr/bin/env node
// apply-canon-corrections.js — apply QA-audit corrections to a canon bundle (BRR canon quality).
//
// Consumes the `confirmed[]` array emitted by the canon79-quality-audit workflow
// (objects: {text_id,row_id,severity,he,ru,note,correction,reason}) and writes a
// corrected copy of the input zip:
//   • severity 'major'  → row.russian = correction        (guarded: current ru must equal the audited `ru`)
//   • severity 'niqqud' → row.hebrew_niqqud = correction  (guarded: current niqqud must equal the audited `he`)
//                         NOTE: changes the Hebrew text → its audio_asset_key changes → that row needs an
//                         audio re-bake (reported), so niqqud fixes are OFF unless --include-niqqud is passed.
// Each corrected row gets honest provenance in edit_meta (corrected_by='qa-jury-v1', reason, prev value, at).
// review_status stays 'machine' (LLM-checked, NOT human review) — no false provenance.
//
//   node scripts/premium/apply-canon-corrections.js --in <zip> --corrections <json> --out <zip> [--include-niqqud] [--dry-run]
//
// Guarded: if the current row value does not match the audited value, the correction is SKIPPED and reported
// (the bundle drifted since the audit) — never silently patch the wrong row.
//
// ⛔ STATUS: INACTIVE durable tool — DO NOT RUN yet. The 2026-06-09 canon-79 jury run was invalidated
// (session-limit degradation + power outage) → NO trusted confirmed[] exists. Run ONLY after a trusted
// confirmed[] is produced (targeted R7 sampling / user-reported corrections) AND explicit owner sign-off.
// Context: docs/SESSION_START_BRR_2026_06_10.md.

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const IN = path.resolve(arg("--in", "public/data/benyehuda/canon-v2.zip"));
const CORR = path.resolve(arg("--corrections", ".tmp/benyehuda/canon79-corrections.json"));
const OUT = path.resolve(arg("--out", "public/data/benyehuda/canon-v2.corrected.zip"));
const INCLUDE_NIQQUD = process.argv.includes("--include-niqqud");
const DRY = process.argv.includes("--dry-run");

(async () => {
  const corrections = JSON.parse(fs.readFileSync(CORR, "utf8"));
  const zip = await JSZip.loadAsync(fs.readFileSync(IN));
  const lib = JSON.parse(await zip.files["library/library.json"].async("string"));
  const byText = new Map(lib.texts.map((t) => [t.text_id, t]));
  const at = new Date().toISOString();

  const applied = [], skipped = [], niqqudDeferred = [], rekeyNeeded = [];
  for (const c of corrections) {
    const t = byText.get(c.text_id);
    if (!t) { skipped.push({ ...c, why: "text_id not found" }); continue; }
    const row = (t.rows || []).find((r) => r.row_id === c.row_id);
    if (!row) { skipped.push({ ...c, why: "row_id not found" }); continue; }

    if (c.severity === "niqqud") {
      if (!INCLUDE_NIQQUD) { niqqudDeferred.push(c); continue; }
      if ((row.hebrew_niqqud || "") !== (c.he || "")) { skipped.push({ ...c, why: "niqqud drift (current != audited he)" }); continue; }
      if (!DRY) {
        row.edit_meta = { ...(row.edit_meta || {}), corrected_by: "qa-jury-v1", kind: "niqqud", reason: c.reason || c.note, prev_hebrew_niqqud: row.hebrew_niqqud, at };
        row.hebrew_niqqud = c.correction;
      }
      rekeyNeeded.push(c); applied.push({ ...c, applied: "niqqud" });
      continue;
    }
    // major (translation)
    if ((row.russian || "") !== (c.ru || "")) { skipped.push({ ...c, why: "ru drift (current != audited ru)" }); continue; }
    if (!DRY) {
      row.edit_meta = { ...(row.edit_meta || {}), corrected_by: "qa-jury-v1", kind: "translation", reason: c.reason || c.note, prev_russian: row.russian, at };
      row.russian = c.correction;
    }
    applied.push({ ...c, applied: "translation" });
  }

  console.log(`corrections: ${corrections.length} | applied: ${applied.length} | skipped: ${skipped.length} | niqqud-deferred: ${niqqudDeferred.length}`);
  for (const s of skipped) console.log(`  ⚠ SKIP ${s.text_id}/${s.row_id}: ${s.why}`);
  if (rekeyNeeded.length) console.log(`  🔊 ${rekeyNeeded.length} niqqud fix(es) change Hebrew → audio re-bake needed for those rows`);
  if (niqqudDeferred.length) console.log(`  ⏭ ${niqqudDeferred.length} niqqud issue(s) deferred (pass --include-niqqud to apply)`);

  if (DRY) { console.log("[dry-run] no file written"); return; }
  if (!applied.length) { console.log("nothing applied — no output written"); return; }
  zip.file("library/library.json", JSON.stringify(lib));
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.writeFileSync(OUT, buf);
  console.log(`out → ${path.relative(process.cwd(), OUT)} (${(buf.length / 1024).toFixed(0)} KB)`);
})().catch((e) => { console.error("FATAL", e.stack); process.exit(1); });
