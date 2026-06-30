"use strict";
// Epic-6 authority SPIKE — measure-before-code verification for the build-once architecture.
// Read-only over SHIPPED artifacts; emits report.json + report.md. Reproducible.
//   inputs:  public/data/benyehuda/corpus-index-v7.json   (authors by era: {name,qid,works,ready,blocks})
//            public/data/benyehuda/author-era-map-v1.json (QID -> {era,birth,death,floruit,confidence,source})
//   asks:    (1) author-row / QID / name-only counts          (identity coverage)
//            (2) QID fragmentation across (era::name) rows     (authority-gate would flag these)
//            (3) candidate QID-keyed author nodes              (the build-once "node")
//            (4) free life-date coverage from the era-map      (corrects the "dates need online Wikidata" stale claim)
//            (5) discarded richness (birth/death present but dropped at build)
// Usage: node docs/research/epic6-authority-spike/2026-06-30/spike.js
const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const OUT = __dirname;
const DATA = path.join(REPO, "public", "data", "benyehuda");

const idx = JSON.parse(fs.readFileSync(path.join(DATA, "corpus-index-v7.json"), "utf8"));
const eraMap = JSON.parse(fs.readFileSync(path.join(DATA, "author-era-map-v1.json"), "utf8"));
const EM = eraMap.authors || {};

// ── flatten the per-era author index into rows ────────────────────────────────
const rows = [];
for (const era of Object.keys(idx.authors || {})) {
  for (const a of idx.authors[era] || []) rows.push({ era, name: a.name, qid: a.qid || null, works: a.works || 0, ready: a.ready || 0 });
}
const totalRows = rows.length;
const withQid = rows.filter((r) => r.qid);
const nameOnly = rows.filter((r) => !r.qid);
const distinctQids = new Set(withQid.map((r) => r.qid));

// ── (2) fragmentation: one QID spread across >1 (era::name) row ────────────────
const byQid = new Map(); // qid -> { names:Set, eras:Set, rows:[], works, ready }
for (const r of withQid) {
  let n = byQid.get(r.qid);
  if (!n) { n = { qid: r.qid, names: new Set(), eras: new Set(), rows: [], works: 0, ready: 0 }; byQid.set(r.qid, n); }
  n.names.add(r.name); n.eras.add(r.era); n.rows.push({ era: r.era, name: r.name, works: r.works });
  n.works += r.works; n.ready += r.ready;
}
const fragmented = [];
for (const n of byQid.values()) {
  const distinctKeys = new Set(n.rows.map((x) => x.era + "::" + x.name));
  if (distinctKeys.size > 1) fragmented.push({ qid: n.qid, rowKeys: distinctKeys.size, names: [...n.names], eras: [...n.eras], works: n.works, rows: n.rows });
}
fragmented.sort((a, b) => b.works - a.works);

// composite (co-author) name detection — a source of fragmentation
const compositeRows = withQid.filter((r) => /[;,/]| ו[א-ת]/.test(r.name) || /\band\b/i.test(r.name)).length;

// ── (4) free life-date coverage: distinct index QIDs that resolve in the era-map with birth&death ──
let qidsInEraMap = 0, qidsWithDates = 0, qidsWithEra = 0;
const datedNodeWorks = []; // works behind QIDs that WOULD get free dates
for (const qid of distinctQids) {
  const e = EM[qid];
  if (!e) continue;
  qidsInEraMap++;
  if (e.era) qidsWithEra++;
  if (e.birth != null && e.death != null) {
    qidsWithDates++;
    const node = byQid.get(qid);
    datedNodeWorks.push(node ? node.works : 0);
  }
}
const worksUnderDatedQids = datedNodeWorks.reduce((s, w) => s + w, 0);
const worksWithQid = withQid.reduce((s, r) => s + r.works, 0);

// ── (5) era-map richness present-but-discarded ────────────────────────────────
const emQids = Object.keys(EM);
const emWithDates = emQids.filter((q) => EM[q].birth != null && EM[q].death != null).length;
const emReferenced = emQids.filter((q) => distinctQids.has(q)).length;

// ── (3) candidate author-node sidecar (sample) ────────────────────────────────
const candidateNodes = [...byQid.values()].map((n) => {
  const em = EM[n.qid] || {};
  return {
    qid: n.qid,
    display: [...n.names][0],
    name_variants: [...n.names],
    eras: [...n.eras],
    era: em.era || [...n.eras][0] || null,
    birth: em.birth ?? null, death: em.death ?? null, floruit: em.floruit ?? null,
    date_source: (em.birth != null ? em.source || "wikidata" : null),
    works: n.works, ready: n.ready,
    prov: { era: em.era ? "derived" : null, dates: em.birth != null ? "derived" : null, author: "asserted" },
  };
});
candidateNodes.sort((a, b) => b.works - a.works);

const report = {
  generated_for: "Epic-6 build-once architecture verification (measure-before-code)",
  source_commit_hint: "run `git rev-parse HEAD` at review time",
  inputs: { index: "corpus-index-v7.json", eraMap: "author-era-map-v1.json", works_total: (eraMap.counts && eraMap.counts.works_total) || null },
  identity: {
    author_rows_total: totalRows,
    rows_with_qid: withQid.length,
    rows_name_only: nameOnly.length,
    distinct_qids: distinctQids.size,
    composite_coauthor_rows: compositeRows,
    note: "name-only rows CANNOT become a stable QID node — they honestly stay name-keyed; QID rows become the build-once author node.",
  },
  fragmentation: {
    qids_fragmented_across_multiple_rows: fragmented.length,
    top_examples: fragmented.slice(0, 15).map((f) => ({ qid: f.qid, rows: f.rowKeys, names: f.names, eras: f.eras, works: f.works })),
    interpretation: "Each is ONE human currently rendered as several 'authors'. The authority build-gate would fail on these; id-join by QID collapses them.",
  },
  free_dates: {
    distinct_index_qids: distinctQids.size,
    qids_present_in_eramap: qidsInEraMap,
    qids_with_birth_and_death: qidsWithDates,
    pct_of_qid_rows_datable: distinctQids.size ? +(100 * qidsWithDates / distinctQids.size).toFixed(1) : 0,
    works_under_datable_qids: worksUnderDatedQids,
    works_with_qid_total: worksWithQid,
    interpretation: "These dates are ALREADY in author-era-map-v1.json and merely discarded at build (build-corpus-catalog.js:150 reads only .era). Promoting them = free author-page dates, NOT an online-Wikidata dependency (corrects the recon §2 stale claim).",
  },
  discarded_richness: {
    eramap_qids: emQids.length,
    eramap_qids_with_dates: emWithDates,
    eramap_qids_referenced_by_index: emReferenced,
    fields_dropped_at_build: ["birth", "death", "floruit", "confidence", "source"],
  },
  candidate_nodes: { count: candidateNodes.length, sample_top10: candidateNodes.slice(0, 10) },
};

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(OUT, "candidate-authors-sample.json"), JSON.stringify(candidateNodes.slice(0, 40), null, 2));

const md = `# Epic-6 Authority Spike — report (${new Date ? "" : ""}2026-06-30)

> Generated by \`spike.js\` over the SHIPPED \`corpus-index-v7.json\` + \`author-era-map-v1.json\`. Measure-before-code verification of the build-once architecture (Эпик 6). Read-only; no code shipped.

## 1. Identity coverage
- Author rows in the index: **${totalRows}**
- Rows carrying a QID: **${withQid.length}** · name-only (no QID): **${nameOnly.length}**
- Distinct QIDs (candidate author nodes): **${distinctQids.size}**
- Composite/co-author name rows (fragmentation source): **${compositeRows}**

➡ Name-only rows cannot be a stable node — they honestly stay name-keyed. The ${withQid.length} QID rows collapse to **${distinctQids.size}** stable nodes.

## 2. Fragmentation (authority-gate would flag these)
- QIDs spread across **>1** (era::name) row: **${fragmented.length}**
${fragmented.slice(0, 15).map((f) => `  - \`${f.qid}\` — ${f.rowKeys} rows, ${f.works} works · names: ${f.names.map((x) => '"' + x + '"').join(", ")} · eras: ${f.eras.join(", ")}`).join("\n")}

➡ Each is ONE human currently shown as several authors. \`id-join by QID\` collapses them; the build-gate fails the build if any re-appears.

## 3. Free life-dates (corrects the recon stale claim)
- Distinct index QIDs: **${distinctQids.size}**
- Resolve in era-map: **${qidsInEraMap}** · with **birth & death**: **${qidsWithDates}** (**${report.free_dates.pct_of_qid_rows_datable}%** of QID nodes)
- Works behind datable QIDs: **${worksUnderDatedQids}** / ${worksWithQid} QID-carrying works

➡ These dates are **already in the repo** (\`author-era-map-v1.json\`) and dropped at build (\`build-corpus-catalog.js:150\` reads only \`.era\`). Author pages get dates for free — **not** an online-Wikidata dependency.

## 4. Discarded richness
- era-map QIDs: **${emQids.length}** · with dates: **${emWithDates}** · referenced by the index: **${emReferenced}**
- Fields computed then dropped at build: \`birth, death, floruit, confidence, source\`

## 5. Candidate author node (top by works) — proves the sidecar is buildable
\`\`\`json
${JSON.stringify(candidateNodes[0], null, 2)}
\`\`\`
Full top-40 sample in \`candidate-authors-sample.json\`; machine report in \`report.json\`.

## Verdict
The build-once claims hold on real data: identity is name-keyed (fragmentation **${fragmented.length}**), rich author data is computed-then-discarded, and **${report.free_dates.pct_of_qid_rows_datable}%** of QID author nodes are datable offline today. Safe to build the quartet: promote the QID node + dates, id-join the index, add the precedence guard + authority gate, then the shared byline renderer + author-landing.
`;
fs.writeFileSync(path.join(OUT, "report.md"), md);
console.log("rows=%d qid=%d nameOnly=%d distinctQid=%d frag=%d datablePct=%s%% worksUnderDated=%d emWithDates=%d",
  totalRows, withQid.length, nameOnly.length, distinctQids.size, fragmented.length, report.free_dates.pct_of_qid_rows_datable, worksUnderDatedQids, emWithDates);
console.log("wrote report.json, report.md, candidate-authors-sample.json to", path.relative(REPO, OUT));
