"use strict";

// H2.2 — deterministic text coverage over BOTH supported source classes:
//   work_id -> baked public-domain Ben-Yehuda corpus body
//   text_key -> owner's synced personal text (scope + live text grant upstream)
// No LLM, network, Dicta request or learner-state write is reachable here.

const fs = require("fs");
const path = require("path");
const ReaderMorph = require("../../public/js/reader-morph");
const LemmaCanon = require("../../public/js/lemma-canon");
const LearningCompass = require("../../public/js/learning-compass-core");
const morphology = require("./wordMorphologyResolver");

const TOKENIZER_VERSION = "reader-morph-tokenizer-v1";
const RESOLVER_VERSION = `${LearningCompass.RESOLVER_VERSION}+${morphology.RESOLVER_VERSION}`;
const MAX_TOKENS = LearningCompass.MAX_TOKENS;
const MAX_TOKEN_TYPES = LearningCompass.MAX_TYPES;
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
  if (!collected.ok) return Object.freeze({
    status: collected.reason === "NO_HEBREW_TOKENS" ? "UNSUPPORTED" : "UNAVAILABLE",
    reason_code: collected.reason, counts: null, recorded_familiar_pct_lower_bound: null,
    unresolved_uncertainty_pp: null, rank_eligible: false, top_unknown: Object.freeze([]),
  });
  if (!projection || typeof projection !== "object" || !projection.version || !Array.isArray(projection.scheduled)) {
    return Object.freeze({ status: "UNAVAILABLE", reason_code: "LEARNER_PROJECTION_UNAVAILABLE", counts: null,
      recorded_familiar_pct_lower_bound: null, unresolved_uncertainty_pp: null, rank_eligible: false, top_unknown: Object.freeze([]) });
  }

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

  const metadata = new Map();
  for (const item of resolved.values()) metadata.set(item.item_key, item);
  const learnerProjection = {
    schema_version: LearningCompass.PROJECTION_SCHEMA,
    version: String(projection.version), generated_at: new Date(Number(projection.generated_at_ms) || Date.now()).toISOString(),
    state_by_key: projection.manual && typeof projection.manual === "object" ? projection.manual : {},
    scheduled_keys: projection.scheduled.map((row) => String(row.item_key)),
    tracked_lexeme_count: new Set(Object.keys(projection.manual || {}).concat(projection.scheduled.map((row) => String(row.item_key)))).size,
  };
  const ingredients = {
    schema_version: LearningCompass.INGREDIENTS_SCHEMA,
    source_class: "agent-access", source_key: "bounded-complete-text", content_revision: "request",
    content_sha256: null, entitlement_revision: null, resolver_version: LearningCompass.RESOLVER_VERSION,
    key_frequencies: Array.from(resolved.values()).map((item) => ({ key: item.item_key, token_count: item.freq })),
    unresolved_token_count: unresolvedTokens, proper_name_token_count: properNameTokens,
    total_token_count: collected.tokenTotal,
  };
  const fit = LearningCompass.evaluateRecordedFamiliarityV2({ ingredients, learner_projection: learnerProjection,
    now: learnerProjection.generated_at });
  const topUnknown = (fit.top_unknown || []).map((row) => {
    const item = metadata.get(row.key);
    return item ? { lemma: item.lemma, freq_in_text: row.token_count,
      ...(item.gloss_ru ? { gloss_ru: String(item.gloss_ru).slice(0, 400) } : {}) } : null;
  }).filter(Boolean).slice(0, topUnknownLimit);
  return Object.freeze({
    status: fit.status, reason_code: fit.reason_code, counts: fit.counts && Object.freeze({ ...fit.counts }),
    recorded_familiar_pct_lower_bound: fit.recorded_familiar_pct_lower_bound,
    unresolved_uncertainty_pp: fit.unresolved_uncertainty_pp, rank_eligible: !!fit.rank_eligible,
    top_unknown: Object.freeze(topUnknown.map((row) => Object.freeze(row))),
  });
}

module.exports = { TOKENIZER_VERSION, RESOLVER_VERSION, MAX_TOKENS, MAX_TOKEN_TYPES,
  calculate, collectTokenTypes };
