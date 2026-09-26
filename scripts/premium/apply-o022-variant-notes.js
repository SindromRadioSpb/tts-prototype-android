#!/usr/bin/env node
// O-022 (owner go 2026-09-26): remove the editorial variant note «[נוסח …]» from the first row
// of 35 published Ben-Yehuda works. The note stays in the work title (the Room shows it as a
// separate line via corpusTitleParts). Bracketed first-line titles («[לא היתה לי אם]») stay.
//
//   node scripts/premium/apply-o022-variant-notes.js --from-prod --out .tmp/benyehuda/o022-works
//   node scripts/premium/apply-o022-variant-notes.js --shards .tmp/benyehuda/shards [--dry-run]
//
// Guarded: every row must still equal the measured «before» values from
// docs/research/corpus-o022/proposed-row0-corrections.json, otherwise it is skipped and reported.
// Provenance: row.edit_meta records the change (corrected_by 'o022-variant-note', previous values).
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PROPOSAL = path.join(ROOT, "docs", "research", "corpus-o022", "proposed-row0-corrections.json");
const FIELDS = ["hebrew_plain", "hebrew_niqqud", "translit", "translit_ru", "russian"];
const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const has = (name) => process.argv.includes(name);

function patchText(text, fix, at) {
  const row = (text.rows || []).find((r) => r.row_id === fix.row_id);
  if (!row) return { ok: false, why: "row missing" };
  for (const f of FIELDS) if ((row[f] || "") !== (fix.before[f] || "")) {
    const already = FIELDS.every((g) => (row[g] || "") === (fix.after[g] || ""));
    return already ? { ok: true, already: true } : { ok: false, why: "drift in " + f };
  }
  const prev = {};
  for (const f of FIELDS) { prev[f] = row[f]; row[f] = fix.after[f]; }
  row.edit_meta = { ...(row.edit_meta || {}), corrected_by: "o022-variant-note", kind: "editorial-note-removed",
    reason: "editorial variant note belongs to the work title, not the first text row", prev, at };
  return { ok: true };
}

(async () => {
  const fixes = JSON.parse(fs.readFileSync(PROPOSAL, "utf8"));
  const at = new Date().toISOString();
  const report = { patched: 0, already: 0, skipped: [] };
  if (has("--from-prod")) {
    const base = arg("--base", "https://linguistpro.kolosei.com");
    const out = path.resolve(arg("--out", path.join(ROOT, ".tmp", "benyehuda", "o022-works")));
    fs.mkdirSync(out, { recursive: true });
    const ids = [];
    for (const fix of fixes) {
      const res = await fetch(base + "/data/benyehuda/" + fix.file);
      if (!res.ok) { report.skipped.push({ id: fix.work_id, why: "HTTP " + res.status }); continue; }
      const body = await res.json();
      const text = body.library.texts.find((t) => t.text_id === fix.text_id);
      const r = text ? patchText(text, fix, at) : { ok: false, why: "text missing" };
      if (!r.ok) { report.skipped.push({ id: fix.work_id, why: r.why }); continue; }
      if (r.already) { report.already++; continue; }
      fs.writeFileSync(path.join(out, String(fix.work_id) + ".json"), JSON.stringify(body));
      ids.push(String(fix.work_id));
      report.patched++;
    }
    fs.writeFileSync(path.join(out, "_ids.json"), JSON.stringify(ids));
    console.log(JSON.stringify({ mode: "from-prod", out, ...report }, null, 1));
    return;
  }
  const shardsDir = arg("--shards", "");
  if (shardsDir) {
    const JSZip = require("jszip");
    const byText = new Map(fixes.map((f) => [f.text_id, f]));
    const dry = has("--dry-run");
    for (const name of fs.readdirSync(shardsDir).filter((n) => n.endsWith(".zip"))) {
      const file = path.join(shardsDir, name);
      const zip = await JSZip.loadAsync(fs.readFileSync(file));
      const entry = zip.file("library/library.json") || zip.file("library.json");
      if (!entry) continue;
      const lib = JSON.parse(await entry.async("string"));
      let changed = false;
      for (const text of lib.texts || []) {
        const fix = byText.get(text.text_id);
        if (!fix) continue;
        const r = patchText(text, fix, at);
        if (!r.ok) { report.skipped.push({ shard: name, text: text.text_id, why: r.why }); continue; }
        if (r.already) { report.already++; continue; }
        report.patched++; changed = true;
      }
      if (changed && !dry) {
        fs.copyFileSync(file, file + ".pre-o022.bak");
        zip.file(entry.name, JSON.stringify(lib));
        fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
      }
    }
    console.log(JSON.stringify({ mode: "shards", dry, ...report }, null, 1));
    return;
  }
  console.error("usage: --from-prod [--out dir] | --shards <dir> [--dry-run]");
  process.exit(2);
})().catch((e) => { console.error(e); process.exit(1); });
