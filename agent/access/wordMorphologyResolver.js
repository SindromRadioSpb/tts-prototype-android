"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");
const NotesAutoGen = require("../../public/js/notes-autogen");
const ProcliticSegment = require("../../public/js/proclitic-segment");
const { MODEL_VERSION } = require("../../db/premium/providers/pealim");

const gunzip = promisify(zlib.gunzip);
const DATASET_PATH = path.resolve(__dirname, "../../public/data/inflection/pealim-infl-v12.json.gz");
const RESOLVER_VERSION = "word-morphology-resolver-v1";
const PROVENANCE = "PEALIM_OFFLINE_V12";
const CONFIDENCE_RANK = Object.freeze({ EXACT: 3, PROBABLE: 2, POSSIBLE: 1 });
const PASSIVE_BINYAN = Object.freeze({ piel: "pual", hifil: "hufal" });

let loadPromise = null;

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function hasNiqqud(value) { return /[֑-ׇ]/.test(String(value || "")); }
function byteSlice(value, maxBytes) {
  let out = String(value == null ? "" : value);
  while (Buffer.byteLength(out, "utf8") > maxBytes) out = out.slice(0, -1);
  return out;
}

function parsePersonCode(code) {
  const match = /^(1|2|3)(ms|fs|mp|fp|s|p)$/.exec(String(code || ""));
  if (!match) return {};
  const suffix = match[2];
  const out = { person: match[1] };
  if (suffix.endsWith("s")) out.number = "SINGULAR";
  if (suffix.endsWith("p")) out.number = "PLURAL";
  if (suffix.startsWith("m")) out.gender = "MASCULINE";
  if (suffix.startsWith("f")) out.gender = "FEMININE";
  return out;
}

function slotFeatures(slot, paradigm) {
  const raw = String(slot || "");
  const passive = raw.startsWith("passive-");
  const key = passive ? raw.slice(8) : raw;
  const out = {};
  if (paradigm && paradigm.binyan) out.binyan = passive ? (PASSIVE_BINYAN[paradigm.binyan] || paradigm.binyan) : paradigm.binyan;

  let code = "";
  if (key.startsWith("PERF-")) { out.tense = "PAST"; code = key.slice(5); }
  else if (key.startsWith("IMPF-")) { out.tense = "FUTURE"; code = key.slice(5); }
  else if (key.startsWith("IMP-")) { out.tense = "IMPERATIVE"; code = key.slice(4); }
  else if (key.startsWith("AP-")) { out.tense = "PRESENT"; code = key.slice(3); }
  else if (key === "INF-L") out.tense = "INFINITIVE";
  else if (/^(ms|fs|mp|fp)-a$/.test(key)) {
    code = key.slice(0, 2);
  } else if (/^(s|p)(c)?$/.test(key)) {
    out.number = key.startsWith("s") ? "SINGULAR" : "PLURAL";
  } else {
    const possessed = /^(s|p)-P-(.+)$/.exec(key);
    if (possessed) { out.number = possessed[1] === "s" ? "SINGULAR" : "PLURAL"; code = possessed[2]; }
    else if (key.startsWith("P-")) code = key.slice(2);
    else if (/^(1|2|3)/.test(key)) code = key;
  }
  return { ...out, ...parsePersonCode(code) };
}

function addIndex(map, key, candidate) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  const rows = map.get(key);
  if (!rows.some((row) => row.identity === candidate.identity)) rows.push(candidate);
}

function buildIndex(dataset) {
  if (!dataset || dataset.model_version !== MODEL_VERSION || !Array.isArray(dataset.paradigms)) fail("AA_MORPHOLOGY_DATASET_INVALID");
  const bySkeleton = new Map();
  const byVocalized = new Map();
  const lexicon = ProcliticSegment.buildLexicon(dataset.paradigms);
  for (const paradigm of dataset.paradigms) {
    if (!paradigm || !paradigm.pealim_id) continue;
    // Keep only fields that can reach the output. Retaining every full cells
    // object through every index candidate needlessly multiplies the 35 MB
    // uncompressed dataset in the long-lived server heap.
    const compact = Object.freeze({
      pealim_id: paradigm.pealim_id,
      lemma: paradigm.lemma,
      lemma_niqqud: paradigm.lemma_niqqud,
      root: paradigm.root,
      pos: paradigm.pos,
      binyan: paradigm.binyan,
      mishkal: paradigm.mishkal,
      meaning: paradigm.meaning,
    });
    const add = (surface, slot, origin) => {
      if (!surface) return;
      const vocalized = String(surface);
      const candidate = Object.freeze({
        paradigm: compact, slot, origin, vocalized,
        identity: `${compact.pealim_id}|${slot}|${vocalized}|${origin}`,
      });
      addIndex(bySkeleton, ProcliticSegment.skeleton(surface), candidate);
      if (hasNiqqud(surface)) addIndex(byVocalized, NotesAutoGen.normVowels(surface), candidate);
    };
    add(paradigm.lemma_niqqud || paradigm.lemma, "LEMMA", "LEMMA");
    if (paradigm.form && paradigm.form.he) add(paradigm.form.he, "FORM", "LEMMA");
    for (const [slot, cell] of Object.entries(paradigm.cells || {})) if (cell && cell.he) add(cell.he, slot, "CELL");
  }
  return Object.freeze({
    dataset_version: dataset.model_version,
    bySkeleton,
    byVocalized,
    lexicon,
  });
}

async function loadIndex() {
  if (!loadPromise) {
    loadPromise = fs.promises.readFile(DATASET_PATH)
      .then((compressed) => gunzip(compressed))
      .then((raw) => buildIndex(JSON.parse(raw.toString("utf8"))))
      .catch((error) => { loadPromise = null; if (error && error.code === "AA_MORPHOLOGY_DATASET_INVALID") throw error; fail("AA_MORPHOLOGY_DATASET_UNAVAILABLE"); });
  }
  return loadPromise;
}

function vocalizedContextForms(contextSentence, word) {
  if (!contextSentence) return [];
  const skeleton = ProcliticSegment.skeleton(word);
  const tokens = String(contextSentence).match(/[֑-ׇא-ת׳״]+/g) || [];
  return [...new Set(tokens.filter((token) => hasNiqqud(token) && ProcliticSegment.skeleton(token) === skeleton).map(NotesAutoGen.normVowels))];
}

function selectCandidates(index, word, contextSentence) {
  const directVocalized = hasNiqqud(word) ? [NotesAutoGen.normVowels(word)] : vocalizedContextForms(contextSentence, word);
  if (directVocalized.length) {
    const exact = directVocalized.flatMap((form) => index.byVocalized.get(form) || []);
    if (exact.length) return { candidates: exact, exactVocalized: true, proclitic: false };
  }

  const skeleton = ProcliticSegment.skeleton(word);
  const direct = index.bySkeleton.get(skeleton) || [];
  if (direct.length) return { candidates: direct, exactVocalized: false, proclitic: false };

  // Reuse the shipped, precision-first pure-core FSA. Its offline verdict is
  // intentionally hedged; it may recover a known base but can never earn EXACT confidence.
  const detected = ProcliticSegment.detect(word, word, { lex: index.lexicon });
  if (!detected.hasProclitic) return { candidates: [], exactVocalized: false, proclitic: false };
  const parsed = ProcliticSegment.chooseOffline(ProcliticSegment.enumerateParses(skeleton), index.lexicon);
  if (!parsed || ProcliticSegment.verdictOf(parsed.segments) !== detected.verdict) return { candidates: [], exactVocalized: false, proclitic: false };
  return { candidates: index.bySkeleton.get(parsed.residual) || [], exactVocalized: false, proclitic: true };
}

function commonValue(rows, getter) {
  const values = [...new Set(rows.map(getter).filter((value) => value != null && value !== ""))];
  return values.length === 1 ? values[0] : null;
}

function entryForGroup(rows, confidence) {
  const paradigm = rows[0].paradigm;
  const features = rows.map((row) => slotFeatures(row.slot, row.paradigm));
  const out = {
    lemma: byteSlice(paradigm.lemma || NotesAutoGen.stripNiqqud(paradigm.lemma_niqqud), 160),
    pos: String(paradigm.pos || "other"),
    confidence,
    provenance: PROVENANCE,
  };
  const optional = {
    root: NotesAutoGen.stripNiqqud(paradigm.root),
    binyan: commonValue(features, (f) => f.binyan),
    mishkal: paradigm.mishkal || null,
    gender: commonValue(features, (f) => f.gender),
    number: commonValue(features, (f) => f.number),
    person: commonValue(features, (f) => f.person),
    tense: commonValue(features, (f) => f.tense),
    niqqud_form: commonValue(rows, (row) => row.vocalized),
    gloss_ru: paradigm.meaning ? byteSlice(paradigm.meaning, 800) : null,
  };
  for (const [key, value] of Object.entries(optional)) if (value != null && value !== "") out[key] = value;
  return Object.freeze(out);
}

function groupCandidates(selection) {
  const groups = new Map();
  for (const candidate of selection.candidates) {
    const id = String(candidate.paradigm.pealim_id);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(candidate);
  }
  const rows = [...groups.entries()].map(([id, candidates]) => {
    const alias = candidates.some((candidate) => candidate.origin === "LEMMA");
    const score = (selection.exactVocalized ? 100 : 0) + (alias ? 20 : 0) + (selection.proclitic ? -10 : 0);
    return { id, candidates, alias, score };
  }).sort((a, b) => b.score - a.score || Number(a.id) - Number(b.id));
  const ambiguous = rows.length > 1;
  return rows.slice(0, 5).map((group) => {
    let confidence = "POSSIBLE";
    if (!ambiguous && !selection.proclitic) confidence = "EXACT";
    else if (!ambiguous || (selection.exactVocalized && group.alias)) confidence = "PROBABLE";
    return entryForGroup(group.candidates, confidence);
  }).sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] || a.lemma.localeCompare(b.lemma, "he"));
}

async function resolveWordMorphology({ word, context_sentence } = {}) {
  const index = await loadIndex();
  const selection = selectCandidates(index, word, context_sentence);
  const entries = groupCandidates(selection);
  if (!entries.length) {
    return Object.freeze({
      schema_version: "aa.word_morphology.1.0.0",
      resolution: "UNRESOLVED",
      entries: Object.freeze([]),
      unresolved_reason: "NOT_IN_DICTIONARY",
      resolver_version: RESOLVER_VERSION,
      dataset_version: index.dataset_version,
    });
  }
  const resolution = new Set(selection.candidates.map((candidate) => String(candidate.paradigm.pealim_id))).size > 1 ? "AMBIGUOUS" : "EXACT";
  const out = {
    schema_version: "aa.word_morphology.1.0.0",
    resolution,
    entries: Object.freeze(entries),
    resolver_version: RESOLVER_VERSION,
    dataset_version: index.dataset_version,
  };
  if (resolution === "AMBIGUOUS") out.unresolved_reason = "AMBIGUOUS_WITHOUT_CONTEXT";
  return Object.freeze(out);
}

// H2.2 internal bridge: expose the canonical pid key only to the deterministic
// coverage engine. The public get_word_morphology output remains byte-for-byte
// unchanged (its closed schema intentionally does not expose pealim_id).
async function resolveCoverageToken({ word } = {}) {
  const index = await loadIndex();
  const selection = selectCandidates(index, word, null);
  const byPid = new Map();
  for (const candidate of selection.candidates) {
    const pid = String(candidate.paradigm.pealim_id || "");
    if (pid && !byPid.has(pid)) byPid.set(pid, candidate.paradigm);
  }
  if (!byPid.size) return Object.freeze({ resolution: "UNRESOLVED", dataset_version: index.dataset_version });
  if (byPid.size !== 1) return Object.freeze({ resolution: "AMBIGUOUS", dataset_version: index.dataset_version });
  const [pid, paradigm] = byPid.entries().next().value;
  return Object.freeze({
    resolution: "EXACT",
    item_key: NotesAutoGen.lemmaKey({ pealim_id: pid }),
    lemma: String(paradigm.lemma || NotesAutoGen.stripNiqqud(paradigm.lemma_niqqud) || ""),
    pos: String(paradigm.pos || "other"),
    gloss_ru: paradigm.meaning ? byteSlice(paradigm.meaning, 800) : null,
    dataset_version: index.dataset_version,
  });
}

module.exports = { DATASET_PATH, RESOLVER_VERSION, PROVENANCE, buildIndex, resolveWordMorphology,
  resolveCoverageToken, _resetForTests: () => { loadPromise = null; } };
