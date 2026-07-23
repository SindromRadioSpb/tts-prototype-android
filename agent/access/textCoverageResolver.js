"use strict";

// H2.2 — deterministic text coverage over BOTH supported source classes:
//   work_id -> baked public-domain Ben-Yehuda corpus body
//   text_key -> owner's synced personal text (scope + live text grant upstream)
// No LLM, network, Dicta request or learner-state write is reachable here.

const fs = require("fs");
const path = require("path");
const ReaderMorph = require("../../public/js/reader-morph");
const LemmaCanon = require("../../public/js/lemma-canon");
const morphology = require("./wordMorphologyResolver");

const TOKENIZER_VERSION = "reader-morph-tokenizer-v1";
const RESOLVER_VERSION = `text-coverage-resolver-v1+${morphology.RESOLVER_VERSION}`;
const MAX_TOKENS = 250000;
const MAX_TOKEN_TYPES = 50000;
const CONTENT_POS = new Set(["noun", "verb", "adjective"]);
const LEARNING_STATES = new Set(["l1", "l2", "l3", "l4", "learning", "weak", "stale"]);

let functionLinks = null;
function links() {
  if (functionLinks) return functionLinks;
  const p = path.resolve(__dirname, "../../public/data/inflection/pealim-function-links.v1.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  functionLinks = (raw && raw.links) || {};
  return functionLinks;
}

function pct(n, d) { return d > 0 ? Math.max(0, Math.min(100, Math.round(100 * n / d))) : 100; }
function band(value) {
  if (value > 98) return "TRIVIAL_ABOVE_98";
  if (value >= 95) return "COMFORT_95_98";
  if (value >= 90) return "STRETCH_90_95";
  return "FRUSTRATION_BELOW_90";
}
function tokenTypeKey(surface, vocalized) {
  const v = String(vocalized || "").normalize("NFC").trim();
  return v || String(surface || "").normalize("NFC").trim();
}

function collectTokenTypes(rows) {
  const types = new Map();
  let tokenTotal = 0;
  for (const row of rows || []) {
    const plain = String((row && row.he) || "");
    const niqqud = String((row && row.he_niqqud) || "");
    const aligned = ReaderMorph.alignSurfaceNiqqud(plain || niqqud, niqqud || plain);
    for (const token of aligned) {
      const surface = ReaderMorph.stripNiqqud(token.surface);
      if (!surface) continue;
      tokenTotal += 1;
      if (tokenTotal > MAX_TOKENS) return { ok: false, reason: "TEXT_TOKEN_LIMIT_EXCEEDED" };
      const key = tokenTypeKey(surface, token.niqqud);
      const prev = types.get(key);
      if (prev) prev.freq += 1;
      else {
        if (types.size >= MAX_TOKEN_TYPES) return { ok: false, reason: "TEXT_TYPE_LIMIT_EXCEEDED" };
        types.set(key, { surface, vocalized: token.niqqud || "", freq: 1 });
      }
    }
  }
  if (!tokenTotal) return { ok: false, reason: "NO_HEBREW_TOKENS" };
  return { ok: true, tokenTotal, types };
}

function learnerState(itemKey, projection, scheduled) {
  const manual = String((projection.manual && projection.manual[itemKey]) || "");
  const sched = scheduled.get(itemKey);
  if (sched && sched.due_ms != null && sched.due_ms <= projection.generated_at_ms) return "due_now";
  if (manual === "known") return "known";
  if (LEARNING_STATES.has(manual) || sched) return "learning";
  return "unknown"; // includes explicit new/ignore: neither is evidence of knowledge
}

function functionItem(surface, gate) {
  const hit = links()[surface];
  const itemKey = hit && hit.id
    ? LemmaCanon.noteKey({ pealim_id: String(hit.id) })
    : LemmaCanon.noteKey({ word: surface, pos: gate.pos || "other" });
  return {
    item_key: itemKey,
    lemma: surface,
    pos: gate.pos || "other",
    gloss_ru: gate.gloss || null,
    content: false,
  };
}

async function calculate(rows, projection, { topUnknownLimit = 10 } = {}) {
  const collected = collectTokenTypes(rows);
  if (!collected.ok) return Object.freeze({ status: "COVERAGE_UNAVAILABLE", unavailable_reason: collected.reason });
  if (!projection || typeof projection !== "object" || !projection.version || !Array.isArray(projection.scheduled)) {
    return Object.freeze({ status: "COVERAGE_UNAVAILABLE", unavailable_reason: "LEARNER_PROJECTION_UNAVAILABLE" });
  }

  const scheduled = new Map(projection.scheduled.map((row) => [String(row.item_key), row]));
  const resolved = new Map();
  const unresolved = new Map();
  const properNames = new Map();
  let properNameTokens = 0, unresolvedTokens = 0;

  for (const token of collected.types.values()) {
    const gate = ReaderMorph.functionGate(token.surface);
    if (gate.isFunc && gate.pos === "propernoun") {
      properNames.set(token.surface, (properNames.get(token.surface) || 0) + token.freq);
      properNameTokens += token.freq;
      continue;
    }
    let item;
    if (gate.isFunc) item = functionItem(token.surface, gate);
    else {
      const morph = await morphology.resolveCoverageToken({ word: token.vocalized || token.surface });
      if (!morph || morph.resolution !== "EXACT" || !morph.item_key) {
        const ukey = tokenTypeKey(token.surface, token.vocalized);
        unresolved.set(ukey, (unresolved.get(ukey) || 0) + token.freq);
        unresolvedTokens += token.freq;
        continue;
      }
      item = { item_key: morph.item_key, lemma: morph.lemma || token.surface, pos: morph.pos,
        gloss_ru: morph.gloss_ru || null, content: CONTENT_POS.has(morph.pos) };
    }
    const prev = resolved.get(item.item_key);
    if (prev) prev.freq += token.freq;
    else resolved.set(item.item_key, { ...item, freq: token.freq });
  }

  const buckets = { known: 0, learning: 0, due_now: 0, unknown: 0,
    unresolved: unresolved.size, proper_names: properNames.size };
  let familiarTokens = 0, familiarLemmas = 0, contentFamiliar = 0, contentTotal = unresolvedTokens;
  const topUnknown = [];
  for (const item of resolved.values()) {
    const state = learnerState(item.item_key, projection, scheduled);
    buckets[state] += 1;
    if (state !== "unknown") { familiarTokens += item.freq; familiarLemmas += 1; }
    if (item.content) {
      contentTotal += item.freq;
      if (state !== "unknown") contentFamiliar += item.freq;
    }
    if (state === "unknown") topUnknown.push({ lemma: item.lemma, freq_in_text: item.freq,
      ...(item.gloss_ru ? { gloss_ru: String(item.gloss_ru).slice(0, 400) } : {}) });
  }
  topUnknown.sort((a, b) => b.freq_in_text - a.freq_in_text || a.lemma.localeCompare(b.lemma, "he"));

  const lemmaTotal = resolved.size + unresolved.size + properNames.size;
  const assessableLemmaTotal = Math.max(0, lemmaTotal - properNames.size);
  const tokenDenominator = Math.max(0, collected.tokenTotal - properNameTokens);
  const contentPct = pct(contentFamiliar, contentTotal);
  return Object.freeze({
    status: "OK",
    token_total: collected.tokenTotal,
    token_known_pct: pct(familiarTokens, tokenDenominator),
    lemma_total: lemmaTotal,
    lemma_known_pct: pct(familiarLemmas, assessableLemmaTotal),
    content_word_known_pct: contentPct,
    buckets: Object.freeze(buckets),
    top_unknown: Object.freeze(topUnknown.slice(0, topUnknownLimit).map((x) => Object.freeze(x))),
    recommendation_band: band(contentPct),
  });
}

module.exports = { TOKENIZER_VERSION, RESOLVER_VERSION, MAX_TOKENS, MAX_TOKEN_TYPES,
  calculate, collectTokenTypes, band };
