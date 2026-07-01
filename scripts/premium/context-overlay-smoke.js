#!/usr/bin/env node
"use strict";
// smoke:reader-ctx-overlay — hermetic gate for the OFFLINE context-disambiguation overlay.
// Design: docs/planning/BRR_CONTEXT_OVERLAY_RECON_2026_07_02.md §6 + §10 (critique resolutions).
// (Distinct from smoke:reader-context — the BROWSER gate for the LIVE Tier-3 provider; this one
// certifies the BAKED path: pure Node, no browser, no network.)
//
// HERMETIC: frozen human gold (reader-morph-gold-worksheet.tsv, owner-annotated) + frozen ctx
// fixture (ctx-fixture.json — Dicta context FACTS in the sidecar entry shape) + the shipped
// dict. No live Dicta, no regeneration inside the gate (oracle-independence: the gold is human;
// the fixture is a committed snapshot the gate only READS).
//
// What it certifies: the SEAM the runtime replays — resolveCore → pickContextReading →
// contextPromotionGuard — fed with baked facts, scored vs human gold PER STRATUM (the sampling
// is homograph-weighted; blended numbers are meaningless).
//
// Hard assertions (structural + floors from the FIRST measurement, D5 discipline):
//   A1 בקר-tripwire: path-A NEVER replaces a decisive offline reading (label exact, !ambiguous).
//   A2 בעלות-tripwire: contextPromotionGuard rejects a whole-word↔stripped-segmentation marriage
//      (unit case), passes a consistent one, and fails CLOSED on an unverifiable paradigm.
//   A3 pos-only seam: a niqqud-less fact (legacy cache row) still drives paths B/C — the exact
//      contract P4 must implement (ctx.niqqud || ctx.posDicta).
//   A4 freeze discipline: fixture carries _meta.sources + made; the gate writes NOTHING.
//   A5 key lock-step: normSent/fnv1a/RESOLVER_REV shared exports behave (whitespace/niqqud/precision).
//   A6 measured floors: per-stratum merged accuracy vs human gold must not drop below the
//      frozen first-measurement floors; wrongful B/C demotions of exact readings bounded.
//
// Run: npm run smoke:reader-ctx-overlay   (pure Node, ~5s)

const path = require("path");
const fs = require("fs");

const REPO = path.resolve(__dirname, "..", "..");
const RM = require(path.join(REPO, "public", "js", "reader-morph.js"));
const CO = require(path.join(REPO, "scripts", "premium", "build-context-overlay.js"));

const strip = RM.stripNiqqud;
let failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); };

// ── A6 floors — frozen from the FIRST measurement (2026-07-02, fixture 180/180). Bump only
// with an owner-reviewed re-measurement (the D2/D5 pattern: floors follow data, never precede it).
const FLOORS = {
  control_merged_acc: 0.94,     // measured baseline parity on the control stratum − slack for gold growth
  tail_merged_min_lift: 0,      // merged tail accuracy must never drop below offline-only tail accuracy
  bc_on_exact_wrong_max: 0.08,  // B-demotions on offline-exact rows CONTRADICTING gold, per exact row
};

(async () => {
  // ── load frozen inputs ──
  const fx = JSON.parse(fs.readFileSync(CO.CTX_FIXTURE, "utf8"));
  ok(fx._meta && fx._meta.sources && fx._meta.made, "A4: fixture lacks freeze provenance (_meta.sources/made)");
  const rows = CO.parseWorksheet().filter((r) => r.gold_pos && r.verdict !== "skip");
  ok(rows.length >= 150, "gold worksheet unexpectedly small: " + rows.length);
  const eng = CO.buildEng();

  // ── replay the seam per gold row ──
  const strat = {}; // stratum → {n, off, merged, context, gloss, soften}
  let ctxOnExact = 0, guardRejected = 0, bcOnExact = 0, bcOnExactWrong = 0, exactRows = 0, promotions = 0;
  for (const r of rows) {
    const s = strip(r.surface);
    const off = await RM.resolveCore(eng, s, r.niqqud || "");
    const f = fx.fixture[r.id] || null;
    let cx = null, dec = { use: "offline" };
    if (f) {
      if (f.nq) { try { cx = await RM.resolveCore(eng, s, f.nq); } catch (_) { cx = null; } }
      dec = RM.pickContextReading(off, cx, { posDicta: f.pos || null }, s);
      if (dec.use === "context" && !RM.contextPromotionGuard(eng, s, f.st, cx)) { guardRejected++; dec = { use: "offline" }; }
    }
    const offlineExact = off.label === "exact" && !off.ambiguous;
    if (offlineExact) exactRows++;
    if (dec.use === "context") { promotions++; if (offlineExact) ctxOnExact++; }
    const mergedPos =
      dec.use === "context" ? ((cx && cx.pos) || "") :
      dec.use === "gloss" ? (dec.pos || "") :
      (off.pos || "");
    const gp = (r.gold_pos || "").trim().toLowerCase();
    const offCorrect = (off.pos || "").toLowerCase() === gp;
    const mergedCorrect = (mergedPos || "").toLowerCase() === gp;
    if ((dec.use === "gloss" || dec.use === "soften") && offlineExact) {
      bcOnExact++;
      if (dec.use === "gloss" && !mergedCorrect && offCorrect) bcOnExactWrong++;   // demoted a reading gold agrees with
    }
    const st = strat[r.stratum] || (strat[r.stratum] = { n: 0, off: 0, merged: 0, context: 0, gloss: 0, soften: 0 });
    st.n++; if (offCorrect) st.off++; if (mergedCorrect) st.merged++;
    if (dec.use !== "offline") st[dec.use]++;
  }

  // ── report ──
  console.log("reader-ctx-overlay gate — " + rows.length + " gold rows · fixture " + Object.keys(fx.fixture).length + " (frozen " + fx._meta.made.slice(0, 10) + ") · resolver " + RM.RESOLVER_REV);
  for (const k of Object.keys(strat).sort()) {
    const s2 = strat[k];
    console.log("  " + k.padEnd(10) + " n=" + String(s2.n).padEnd(4) + " offlineAcc=" + (s2.off / s2.n).toFixed(3) + " mergedAcc=" + (s2.merged / s2.n).toFixed(3) + "  (A:" + s2.context + " B:" + s2.gloss + " C:" + s2.soften + ")");
  }
  console.log("  promotions=" + promotions + " guardRejected=" + guardRejected + " B/C-on-exact=" + bcOnExact + " (wrongful " + bcOnExactWrong + "/" + exactRows + " exact rows)");

  // ── A1: path-A never replaces a decisive offline reading ──
  ok(ctxOnExact === 0, "A1 (בקר): " + ctxOnExact + " path-A promotion(s) landed on a decisive offline-exact reading");

  // ── A2: segmentation guard unit tripwires (real engine, synthetic facts) ──
  {
    let anyPid = null, anySkel = null;
    for (const [pid, par] of eng.pidMap) { if (par && par.lemma && strip(par.lemma)) { anyPid = pid; anySkel = strip(par.lemma); break; } }
    ok(RM.contextPromotionGuard(eng, anySkel, "", { pealim_id: anyPid }) === true,
      "A2: guard rejected a consistent whole-word promotion (paradigm's own lemma skeleton)");
    ok(RM.contextPromotionGuard(eng, "ב" + anySkel, "", { pealim_id: anyPid }) === false,
      "A2 (בעלות): guard allowed a whole-word promotion onto a paradigm matching only the stripped segment");
    ok(RM.contextPromotionGuard(eng, "ב" + anySkel, anySkel, { pealim_id: anyPid }) === true,
      "A2: guard rejected a Dicta-consistent segmented promotion");
    ok(RM.contextPromotionGuard(eng, anySkel, "", { pealim_id: "no-such-pid-000" }) === false,
      "A2: guard failed OPEN on an unverifiable pealim_id (must fail closed)");
  }

  // ── A3: pos-only fact (legacy cache row) drives paths B and C — the P4 seam contract ──
  {
    const decB = RM.pickContextReading({ label: "exact", pos: "noun", meaning: "свидетель", pealim_id: "x1" }, null, { posDicta: "preposition" }, "עד");
    ok(decB.use === "gloss" && decB.gloss && decB.gloss.length > 0, "A3: pos-only fact failed path B on curated עד (got " + decB.use + ")");
    const decC = RM.pickContextReading({ label: "exact", pos: "verb", meaning: "идёт" }, null, { posDicta: "noun" }, "הולך");
    ok(decC.use === "soften", "A3: pos-only fact failed path C soften (got " + decC.use + ")");
  }

  // ── A7: runtime lookup semantics (overlayContext — the provider-chain contract, §3.3/§10 B2/B4) ──
  {
    const sent = "בבית ישב איש";
    const h = RM.fnv1a(RM.normSent(sent));
    const ov = { _meta: { resolver: RM.RESOLVER_REV, made: "2026-07-02T00:00:00Z" }, sents: [h], ctx: {} };
    ov.ctx[h] = { "איש": { nq: "אִישׁ", pos: "noun" } };
    const hit = RM.overlayContext(ov, sent, "איש");
    ok(hit && hit.ctx && hit.ctx.niqqud === "אִישׁ" && hit.ctx.source === "baked", "A7: key hit did not return a baked provider fact");
    const miss = RM.overlayContext(ov, sent, "בבית");
    ok(miss && miss.authoritative === true, "A7: fully-evaluated sentence without an entry must be an AUTHORITATIVE miss");
    ok(RM.overlayContext(ov, "משפט שלא נאפה מעולם", "איש") === null, "A7: unknown sentence must fall to the live path (null)");
    const stale = { _meta: { resolver: "ctx-r0-obsolete" }, sents: [h], ctx: ov.ctx };
    ok(RM.overlayContext(stale, sent, "בבית") === null, "A7 (B4): stale-resolver sidecar must lose miss authority (soft miss)");
    // whitespace/niqqud drift between the baked sentence and the tapped row must not break the key
    ok(RM.overlayContext(ov, "  בבית   ישב איש ", "איש") !== null, "A7: normSent failed to absorb whitespace drift");
  }

  // ── A5: shared key primitives (producer ↔ runtime lock-step) ──
  ok(RM.normSent("  שָׁלוֹם   עוֹלָם ") === "שלום עולם", "A5: normSent niqqud/whitespace normalization broken");
  ok(RM.fnv1a("") === "811c9dc5", "A5: fnv1a empty-string constant drifted");
  ok(RM.fnv1a("שלום עולם") === RM.fnv1a(RM.normSent(" שָׁלוֹם  עוֹלָם ")), "A5: hash of normalized forms diverges");
  ok(typeof RM.RESOLVER_REV === "string" && RM.RESOLVER_REV.length > 0, "A5: RESOLVER_REV export missing");

  // ── A6: measured floors per stratum ──
  const ctl = strat["control"], tail = strat["tail"];
  ok(ctl && ctl.n > 0 && tail && tail.n > 0, "A6: control/tail strata missing from the gold worksheet");
  if (ctl && ctl.n) ok(ctl.merged / ctl.n >= FLOORS.control_merged_acc, "A6: control merged accuracy " + (ctl.merged / ctl.n).toFixed(3) + " < floor " + FLOORS.control_merged_acc);
  if (tail && tail.n) ok(tail.merged >= tail.off + FLOORS.tail_merged_min_lift, "A6: overlay REGRESSED the tail (merged " + tail.merged + " < offline " + tail.off + ")");
  ok(exactRows === 0 || bcOnExactWrong / exactRows <= FLOORS.bc_on_exact_wrong_max, "A6: wrongful B/C demotions of exact readings " + bcOnExactWrong + "/" + exactRows + " exceed " + FLOORS.bc_on_exact_wrong_max);

  if (failures.length) {
    console.error("\nFAIL — " + failures.length + " assertion(s):");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("PASS — reader-ctx-overlay gate green (hermetic; human-gold oracle; frozen fixture)");
})().catch((e) => { console.error("fatal:", e && e.stack || e); process.exit(1); });
