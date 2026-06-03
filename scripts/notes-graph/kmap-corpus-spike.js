#!/usr/bin/env node
// Knowledge Map redesign — Phase 0 data spike.
// Measures the root distribution of the REAL ~9K corpus produced by block ②
// so the root-centric design is calibrated on real data, not guesses:
//   - root family sizes  -> focus-view node counts + cluster-collapse need
//   - lemma frequency     -> node-size encoding + root ranking (AnkiMorphs)
//   - %-with-root         -> graceful-degradation budget (function words)
//   - binyan distribution -> edge-label load + ubiquity (anti-hairball)
//   - notes-per-text      -> source-text hub risk
//
// Read-only. Pure Node (no browser, no DB). Self-skips (exit 0) when the
// gitignored corpus artifact is absent so an accidental CI run is green-neutral.
//
// Usage: node scripts/notes-graph/kmap-corpus-spike.js [--zip <path>]
//        (default --zip .tmp/test-enriched.zip)

const fs = require("fs");
const path = require("path");
const JSZip = require("../../public/db/jszip.min.js");

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}

const ROOT = path.resolve(__dirname, "..", "..");
const ZIP_IN = path.resolve(ROOT, String(arg("zip", ".tmp/test-enriched.zip")));
const NOTES_PATH = "library/notes_advanced.json";

// Mirror the app's Hebrew normalization intent (strip niqqud/cantillation,
// trim) so root/lemma grouping matches what knowledge-map-data.js will do.
const NIQQUD_RE = /[֑-ׇ]/g;
function norm(s) {
  return String(s == null ? "" : s).replace(NIQQUD_RE, "").trim();
}

function pct(n, d) {
  return d ? ((100 * n) / d).toFixed(1) + "%" : "—";
}

function describe(counts) {
  // counts: array of group sizes (numbers), unsorted.
  const a = counts.slice().sort((x, y) => x - y);
  const n = a.length;
  if (!n) return { n: 0 };
  const sum = a.reduce((s, x) => s + x, 0);
  const q = (p) => a[Math.min(n - 1, Math.floor(p * (n - 1)))];
  return {
    n,
    min: a[0],
    median: q(0.5),
    p90: q(0.9),
    p99: q(0.99),
    max: a[n - 1],
    mean: (sum / n).toFixed(2),
  };
}

function histo(counts, edges) {
  // edges e.g. [1,2,3,5,9,17,25,49,Infinity] → buckets [1],[2],[3-4],...
  const labels = [];
  const buckets = new Array(edges.length).fill(0);
  for (let i = 0; i < edges.length; i++) {
    const lo = i === 0 ? edges[0] : edges[i - 1] + 1;
    const hi = edges[i];
    labels.push(hi === Infinity ? `${lo}+` : lo === hi ? `${lo}` : `${lo}-${hi}`);
  }
  for (const c of counts) {
    for (let i = 0; i < edges.length; i++) {
      if (c <= edges[i]) { buckets[i]++; break; }
    }
  }
  return labels.map((l, i) => `${l}:${buckets[i]}`).join("  ");
}

async function main() {
  if (!fs.existsSync(ZIP_IN)) {
    console.log(`SKIPPED: corpus artifact not found at ${ZIP_IN}`);
    console.log("(regenerate via scripts/premium/build-notes-from-bundle.js --zip <bundle> --out .tmp/test-enriched.zip)");
    process.exit(0);
  }

  const zip = await JSZip.loadAsync(fs.readFileSync(ZIP_IN));
  const entry = zip.file(NOTES_PATH);
  if (!entry) {
    console.log(`SKIPPED: ${NOTES_PATH} not inside ${path.basename(ZIP_IN)}`);
    process.exit(0);
  }
  const advanced = JSON.parse(await entry.async("string"));
  const notes = Array.isArray(advanced.notes) ? advanced.notes : [];

  // ── parse body_json into structural fields ──
  let withRoot = 0, withBinyan = 0, withMeaning = 0, parseFail = 0;
  const rootToLemmas = new Map();   // root -> Set(lemma)
  const rootNoteCount = new Map();  // root -> note count
  const lemmaNoteCount = new Map(); // lemma -> note count (corpus frequency)
  const binyanCount = new Map();    // binyan -> note count
  const textNoteCount = new Map();  // text_id -> note count
  const posCount = new Map();

  for (const note of notes) {
    let body;
    try { body = JSON.parse(note.body_json || "{}"); }
    catch (_) { parseFail++; continue; }
    const root = norm(body.root);
    const lemma = norm(body.word);
    const binyan = norm(body.binyan);
    const pos = norm(body.pos) || "(none)";
    const textId = String(note.text_id == null ? "" : note.text_id);

    if (root) withRoot++;
    if (binyan) withBinyan++;
    if (body.meaning && String(body.meaning).trim()) withMeaning++;

    posCount.set(pos, (posCount.get(pos) || 0) + 1);
    if (textId) textNoteCount.set(textId, (textNoteCount.get(textId) || 0) + 1);
    if (binyan) binyanCount.set(binyan, (binyanCount.get(binyan) || 0) + 1);
    if (lemma) lemmaNoteCount.set(lemma, (lemmaNoteCount.get(lemma) || 0) + 1);
    if (root) {
      rootNoteCount.set(root, (rootNoteCount.get(root) || 0) + 1);
      let set = rootToLemmas.get(root);
      if (!set) { set = new Set(); rootToLemmas.set(root, set); }
      if (lemma) set.add(lemma);
    }
  }

  // ── derive distributions ──
  const familySizes = Array.from(rootToLemmas.values()).map((s) => s.size); // distinct lemmas/root
  const rootNoteSizes = Array.from(rootNoteCount.values());
  const lemmaFreqs = Array.from(lemmaNoteCount.values());
  const textSizes = Array.from(textNoteCount.values());

  const SHARED_SKIP_OVER = 24; // v3.6 graph constant — does it drop teaching roots?
  const FOCUS_BUDGET = 100;    // focus-view on-screen target
  const familyDesc = describe(familySizes);
  const rootsOverSkip = familySizes.filter((s) => s > SHARED_SKIP_OVER).length;
  const familiesOverFocus = familySizes.filter((s) => s > FOCUS_BUDGET).length;
  const singletonRoots = familySizes.filter((s) => s <= 1).length;
  const teachableRoots = familySizes.filter((s) => s >= 2).length;

  // ── report ──
  const top = (map, k) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, k);
  console.log("=== Knowledge Map — corpus data spike ===");
  console.log(`artifact: ${path.relative(ROOT, ZIP_IN)}`);
  console.log(`notes: ${notes.length}  (body parse-fail: ${parseFail})`);
  console.log("");
  console.log("-- coverage --");
  console.log(`  with root   : ${withRoot} (${pct(withRoot, notes.length)})  | root-less: ${notes.length - withRoot} (${pct(notes.length - withRoot, notes.length)}) → degrade-not-error budget`);
  console.log(`  with binyan : ${withBinyan} (${pct(withBinyan, notes.length)})`);
  console.log(`  with meaning: ${withMeaning} (${pct(withMeaning, notes.length)})`);
  console.log("");
  console.log("-- roots (the spine) --");
  console.log(`  distinct roots        : ${rootToLemmas.size}`);
  console.log(`  teachable (≥2 lemmas) : ${teachableRoots}   | singleton (≤1): ${singletonRoots}`);
  console.log(`  family size (distinct lemmas/root): min=${familyDesc.min} median=${familyDesc.median} p90=${familyDesc.p90} p99=${familyDesc.p99} max=${familyDesc.max} mean=${familyDesc.mean}`);
  console.log(`  family-size histogram : ${histo(familySizes, [1, 2, 3, 5, 9, 17, 25, 49, Infinity])}`);
  console.log(`  roots > SHARED_SKIP_OVER(${SHARED_SKIP_OVER}): ${rootsOverSkip}  ← v3.6 graph would DROP these (the highest-frequency teaching roots)`);
  console.log(`  families > focus budget(${FOCUS_BUDGET}): ${familiesOverFocus}  ← need cluster-collapse / pagination in focus view`);
  console.log(`  top roots by note-count: ${top(rootNoteCount, 12).map(([r, c]) => `${r}:${c}`).join("  ")}`);
  console.log("");
  console.log("-- frequency (node size + ranking) --");
  const lf = describe(lemmaFreqs);
  console.log(`  distinct lemmas: ${lemmaNoteCount.size}  | per-lemma notes: median=${lf.median} p90=${lf.p90} p99=${lf.p99} max=${lf.max}`);
  console.log(`  top lemmas     : ${top(lemmaNoteCount, 10).map(([l, c]) => `${l}:${c}`).join("  ")}`);
  console.log("");
  console.log("-- binyan distribution (edge-label load / ubiquity) --");
  console.log(`  ${top(binyanCount, 12).map(([b, c]) => `${b}:${c}`).join("  ")}`);
  console.log("");
  console.log("-- POS --");
  console.log(`  ${top(posCount, 12).map(([p, c]) => `${p}:${c}`).join("  ")}`);
  console.log("");
  console.log("-- source texts (hub risk) --");
  const td = describe(textSizes);
  console.log(`  distinct texts: ${textNoteCount.size}  | notes/text: median=${td.median} p90=${td.p90} max=${td.max}`);
  console.log("");
  console.log("-- design implications --");
  console.log(`  • focus-view max nodes ≈ largest family (${familyDesc.max}); ${familiesOverFocus} families exceed the ${FOCUS_BUDGET}-node budget → collapse needed.`);
  console.log(`  • ${rootsOverSkip} teaching roots are silently dropped by the OLD graph's SHARED_SKIP_OVER=24 → root-centric model must NOT inherit that cap.`);
  console.log(`  • status overlay (known/learning/new) needs LIVE SRS data — not in this artifact; measured against srs_cards at runtime.`);
  console.log(`  • i+1 ranking is feasible: ${rootToLemmas.size} roots with corpus frequency; rank by note-count, gate expansion by known-set (SRS) at runtime.`);
}

main().catch((e) => { console.error("spike error:", e); process.exit(1); });
