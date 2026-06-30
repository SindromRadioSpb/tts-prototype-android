"use strict";

// authorNodes.js — BRR Epic-6 · QID-keyed AUTHOR AUTHORITY nodes (R6/R9).
//
// The «Корпус» author index ships per-era and keyed by DISPLAY NAME
// (build-corpus-catalog.js authorsByEra), so one human under spelling/co-author
// variants splits into several "authors" (measured: 14 QIDs fragment across >1
// row), and the producer DISCARDS the rich author authority it already computed
// (author-era-map-v1.json carries era+birth+death+floruit+confidence+source per
// QID; the build reads only `.era`). This module is the SINGLE SOURCE OF TRUTH
// for collapsing the name-keyed rows into one stable AUTHOR NODE per Wikidata QID
// — the durable identity every bio / date / reading-order attaches to as DATA,
// so content grows additively without re-touching the UI (the build-once lever).
//
// Honesty invariants (R9 derived≠asserted, R1 no fabrication):
//   • A node exists ONLY for a real Wikidata QID. The `Q0` sentinel (and any
//     malformed id) is the "no identity" bucket — those rows stay NAME-keyed and
//     get NO node (measured: Q0 wrongly merged 7 distinct humans). QID_RE excludes it.
//   • Life-dates are PROMOTED from the era-map, never invented; absent → null.
//   • Each field carries an honest provenance tag (derived from the era-map,
//     asserted from the catalogue) so a future curated override (Increment 2) is
//     distinguishable and the re-bake precedence guard can protect it.
//   • Co-authored works ("ביאליק; רבניצקי" → first author's QID + a composite
//     name) fold into the primary author's node; the composite is recorded as a
//     name_variant and the node is flagged `coauthored` so the byline can render
//     "primary + et al." rather than splitting the human.

// A real Wikidata item id: Q followed by a non-zero digit. Excludes the `Q0`
// sentinel (= no resolved identity) and malformed strings.
const QID_RE = /^Q[1-9]\d*$/;

// Co-author separator. In the Ben-Yehuda catalogue a multi-author work joins
// names with a semicolon ("ביאליק; רבניצקי"); that is the ONLY reliable signal.
// A comma is "name, place" (an org), and a leading-vav «ו» is almost always a
// SURNAME ("נפתלי הרץ וייזל"=Wessely, "וגנר"=Wagner) — measured 44 false positives —
// so we do NOT treat either as a co-author marker (R1: never fabricate a relation).
const COMPOSITE_RE = /;/;

function isCompositeName(name) {
  return typeof name === "string" && COMPOSITE_RE.test(name);
}

// Deterministic, locale-INDEPENDENT codepoint comparator. The display/sort
// tie-breaks must not depend on the host ICU/Node locale, or the lockstep gate
// (deep-equal of the shipped sidecar vs a fresh build) could false-fail across
// environments. (localeCompare collates Hebrew differently across ICU versions.)
function _cmp(a, b) { a = String(a); b = String(b); return a < b ? -1 : a > b ? 1 : 0; }

// Pick the canonical display name from a Map of `name → summed works`. Prefer the
// author's OWN (non-composite) name filed under the MOST works — the spelling the
// catalogue actually files them under (the R6/R9 authority display) — tie-broken by
// length then codepoint, NOT merely "shortest" (which could pick an abbreviation
// over the full name). When a QID is ONLY ever co-authored, derive the primary from
// the most-frequent composite's first segment (matches the firstQid the node is
// keyed on) rather than surfacing "A; B" as one human's canonical name.
function pickDisplay(nameCounts) {
  const entries = [...nameCounts.entries()]; // [name, works]
  if (!entries.length) return null;
  const byWeight = (a, b) => (b[1] - a[1]) || (a[0].length - b[0].length) || _cmp(a[0], b[0]);
  const solo = entries.filter(([n]) => !isCompositeName(n)).sort(byWeight);
  if (solo.length) return solo[0][0];
  entries.sort(byWeight);
  const primary = String(entries[0][0]).split(";")[0].trim();
  return primary || entries[0][0];
}

function _dedupeRefs(refs) {
  const seen = new Set();
  const out = [];
  for (const r of refs) {
    const k = (r.era || "") + "::" + (r.block == null ? "" : r.block);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ era: r.era || null, block: r.block == null ? null : r.block });
  }
  return out;
}

// Build the QID-keyed author nodes from the shipped per-era author index
// (index.authors: era -> [{ name, qid, works, ready, blocks }]) and the era-map
// (eraMap.authors: QID -> { era, birth, death, floruit, confidence, source }).
// Returns an array of nodes sorted by works desc (stable by qid). Rows with no
// valid QID are intentionally OMITTED (they remain name-keyed in the index).
function buildAuthorNodes(indexAuthors, eraMap) {
  const EM = (eraMap && eraMap.authors) || {};
  const byQid = new Map(); // qid -> accumulator
  for (const era of Object.keys(indexAuthors || {})) {
    for (const row of indexAuthors[era] || []) {
      const qid = row && row.qid;
      if (!qid || !QID_RE.test(qid)) continue; // Q0 / malformed → no node (honest)
      let n = byQid.get(qid);
      if (!n) { n = { qid, names: new Map(), eras: new Map(), works: 0, ready: 0, refs: [] }; byQid.set(qid, n); }
      const w = Number(row.works) || 0, rd = Number(row.ready) || 0;
      n.names.set(row.name, (n.names.get(row.name) || 0) + w);
      n.eras.set(era, (n.eras.get(era) || 0) + w);
      n.works += w; n.ready += rd;
      const blocks = Array.isArray(row.blocks) && row.blocks.length ? row.blocks : [null];
      for (const b of blocks) n.refs.push({ era, block: b });
    }
  }

  const nodes = [];
  for (const n of byQid.values()) {
    const variants = [...n.names.keys()];
    const em = EM[n.qid] || {};
    // era: the era-map value is authoritative (derived from floruit); else the
    // era under which most of the author's works fall.
    const rowEra = [...n.eras.entries()].sort((a, b) => (b[1] - a[1]) || _cmp(a[0], b[0]))[0];
    const era = em.era || (rowEra && rowEra[0]) || null;
    const hasDates = em.birth != null && em.death != null;
    const hasAnyDate = em.birth != null || em.death != null;
    nodes.push({
      qid: n.qid,
      display: pickDisplay(n.names),
      name_variants: variants,
      coauthored: variants.some(isCompositeName),
      era,
      eras: [...n.eras.keys()],
      birth: em.birth != null ? em.birth : null,
      death: em.death != null ? em.death : null,
      floruit: em.floruit != null ? em.floruit : null,
      // a half-dated author surfaces one real year → it still needs a source tag (R9);
      // only the prov flag distinguishes a complete (derived) span from a partial one.
      date_source: hasAnyDate ? (em.source || "wikidata") : null,
      date_confidence: hasAnyDate ? (em.confidence || null) : null,
      works: n.works,
      ready: n.ready,
      refs: _dedupeRefs(n.refs),
      // per-field honest provenance (R9). era/dates = derived from the era-map;
      // identity (the name/QID link) = asserted from the catalogue. Increment 2
      // adds `curated` overrides + a precedence guard on top of these.
      prov: {
        era: em.era ? "derived" : (era ? "asserted" : null),
        dates: hasDates ? "derived" : (hasAnyDate ? "partial" : null),
        identity: "asserted",
      },
    });
  }
  nodes.sort((a, b) => b.works - a.works || _cmp(a.qid, b.qid));
  return nodes;
}

// Validate the node set against the index it was built from. Returns
// { ok, errors, warnings, stats }. ERRORS = an authority lie / structural break
// (the build gate fails); WARNINGS = honest-but-incomplete curation.
function validateAuthorNodes(nodes, indexAuthors) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(nodes)) return { ok: false, errors: ["nodes is not an array"], warnings: [], stats: {} };

  // expected: the set of valid QIDs in the index (Q0/malformed excluded) + an
  // INDEPENDENT per-QID aggregation oracle. This is the gate's teeth: a future
  // works/ready/refs regression in buildAuthorNodes would otherwise pass both
  // validate AND the lockstep deep-equal (both run the same builder), shipping
  // silently. Recomputing straight from the index here is the only check with an
  // oracle the builder doesn't share.
  const expected = new Set();
  const agg = new Map(); // qid -> { works, ready, refs:Set('era::block') }
  let q0Rows = 0, nameOnlyRows = 0, totalRows = 0;
  for (const era of Object.keys(indexAuthors || {})) {
    for (const row of indexAuthors[era] || []) {
      totalRows++;
      const qid = row && row.qid;
      if (!qid) { nameOnlyRows++; continue; }
      if (!QID_RE.test(qid)) { q0Rows++; continue; } // includes Q0
      expected.add(qid);
      let a = agg.get(qid);
      if (!a) { a = { works: 0, ready: 0, refs: new Set() }; agg.set(qid, a); }
      a.works += Number(row.works) || 0;
      a.ready += Number(row.ready) || 0;
      const blocks = Array.isArray(row.blocks) && row.blocks.length ? row.blocks : [null];
      for (const b of blocks) a.refs.add(era + "::" + (b == null ? "" : b));
    }
  }

  const seen = new Set();
  let dated = 0, halfDated = 0, coauthored = 0;
  for (const n of nodes) {
    if (!n || typeof n !== "object") { errors.push("a node is not an object"); continue; }
    if (!QID_RE.test(String(n.qid || ""))) errors.push("node qid '" + n.qid + "' is not a real Wikidata QID (Q0/malformed must NOT become a node)");
    if (seen.has(n.qid)) errors.push("duplicate node for qid " + n.qid + " — fragmentation NOT collapsed");
    seen.add(n.qid);
    if (!expected.has(n.qid)) errors.push("node qid " + n.qid + " has no matching index row (orphan node)");
    if (!n.display) errors.push("node " + n.qid + " has no display name");
    if (!Array.isArray(n.name_variants) || !n.name_variants.length) errors.push("node " + n.qid + " has no name_variants");
    if (!(Number(n.works) > 0)) errors.push("node " + n.qid + " has works=" + n.works + " (must be > 0)");
    if (!Array.isArray(n.refs) || !n.refs.length) errors.push("node " + n.qid + " has no refs (works unfetchable)");
    // independent aggregation cross-check (the gate's teeth — a works/ready/refs
    // regression must fail HERE, not pass because the lockstep rebuild shares the builder)
    const ag = agg.get(n.qid);
    if (ag) {
      if (Number(n.works) !== ag.works) errors.push("node " + n.qid + " works " + n.works + " ≠ index sum " + ag.works);
      if (Number(n.ready) !== ag.ready) errors.push("node " + n.qid + " ready " + n.ready + " ≠ index sum " + ag.ready);
      const nodeRefs = new Set((Array.isArray(n.refs) ? n.refs : []).map((r) => ((r && r.era) || "") + "::" + (r && r.block == null ? "" : r.block)));
      if (nodeRefs.size !== ag.refs.size || [...ag.refs].some((k) => !nodeRefs.has(k))) errors.push("node " + n.qid + " refs ≠ index (era::block) set");
    }
    // dates honesty: both or neither (a lone birth/death is suspect, not a lie → warn);
    // a half-dated node must still carry its source tag (prov.dates='partial', not null).
    if ((n.birth == null) !== (n.death == null)) {
      halfDated++;
      warnings.push("node " + n.qid + " has only one of birth/death (" + n.birth + "/" + n.death + ")");
      if (!n.date_source || n.prov.dates !== "partial") errors.push("node " + n.qid + " half-dated but missing date_source / prov.dates='partial'");
    }
    if (n.birth != null && n.death != null) {
      dated++;
      if (Number(n.death) < Number(n.birth)) errors.push("node " + n.qid + " death < birth (" + n.birth + "/" + n.death + ")");
    }
    if (n.coauthored) coauthored++;
  }

  // every valid-QID index row must be represented by exactly one node (no drop)
  for (const qid of expected) if (!seen.has(qid)) errors.push("index qid " + qid + " has NO node (dropped)");
  if (nodes.length !== expected.size) errors.push("node count " + nodes.length + " ≠ distinct valid index QIDs " + expected.size);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      nodes: nodes.length, expected_qids: expected.size,
      index_rows: totalRows, name_only_rows: nameOnlyRows, q0_or_invalid_rows: q0Rows,
      dated_nodes: dated, dated_pct: nodes.length ? +(100 * dated / nodes.length).toFixed(1) : 0,
      half_dated_nodes: halfDated, coauthored_nodes: coauthored,
    },
  };
}

module.exports = {
  QID_RE,
  isCompositeName,
  pickDisplay,
  buildAuthorNodes,
  validateAuthorNodes,
};
