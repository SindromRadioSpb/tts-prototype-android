// B7 Learning Compass 2.0 — dedicated local lexical analyzer.
// Receives materialized rows, returns only content-free aggregate ingredients.
"use strict";

const DICT_URL = "/data/inflection/pealim-infl-v12.json.gz";
const FUNCTION_URL = "/data/inflection/pealim-function-links.v1.json";
const RESOLVER_VERSION = "recorded-familiarity-v2";
const LEXICAL_RESOLVER_VERSION = "room-lexical-worker-v2+pealim-infl-v12+function-links-v1";
const MAX_TOKENS = 250000;
const MAX_TYPES = 50000;
const HEBREW_TOKEN = /[א-ת][א-ת\u0591-\u05C7\u05F3\u05F4'’-]*/gu;
const PROCLITIC = /^[ובכלמשה]/;

let resolverPromise = null;

function stripMarks(value) {
  return String(value || "").normalize("NFC").replace(/[\u0591-\u05C7]/g, "").replace(/[\u05F3\u05F4'’-]/g, "");
}

function exactForm(value) {
  return String(value || "").normalize("NFC").replace(/[\u0591-\u05AF]/g, "").replace(/[\u05F3\u05F4'’-]/g, "");
}

function addCandidate(map, form, pid) {
  if (!form || !pid) return;
  let values = map.get(form);
  if (!values) { values = new Set(); map.set(form, values); }
  values.add(pid);
}

function addParadigmForms(paradigm, exact, skeleton) {
  const pid = paradigm && paradigm.pealim_id != null ? String(paradigm.pealim_id) : "";
  if (!pid) return;
  const forms = [paradigm.lemma, paradigm.lemma_niqqud, paradigm.form];
  for (const cell of Object.values(paradigm.cells || {})) forms.push(cell && cell.he);
  for (const form of forms) {
    const precise = exactForm(form), bare = stripMarks(form);
    if (precise) addCandidate(exact, precise, pid);
    if (bare) addCandidate(skeleton, bare, pid);
  }
}

function uniqueCandidate(map, form) {
  const values = map.get(form);
  return values && values.size === 1 ? values.values().next().value : null;
}

async function readGzipJson(url) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error("LEXICAL_DATASET_HTTP_" + response.status);
  if (typeof DecompressionStream !== "function" || !response.body) throw new Error("DECOMPRESSION_UNAVAILABLE");
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

async function loadResolver() {
  if (resolverPromise) return resolverPromise;
  resolverPromise = Promise.all([
    readGzipJson(DICT_URL),
    fetch(FUNCTION_URL, { cache: "force-cache" }).then((response) => {
      if (!response.ok) throw new Error("FUNCTION_LINKS_HTTP_" + response.status);
      return response.json();
    }),
  ]).then(([dataset, functionData]) => {
    const exact = new Map(), skeleton = new Map(), functions = new Map();
    for (const paradigm of (dataset.paradigms || [])) addParadigmForms(paradigm, exact, skeleton);
    for (const [form, row] of Object.entries(functionData.links || {})) {
      if (row && row.id != null) functions.set(stripMarks(form), String(row.id));
    }
    return { exact, skeleton, functions, dataset_version: dataset.model_version || "pealim-infl-v12" };
  }).catch((error) => { resolverPromise = null; throw error; });
  return resolverPromise;
}

function rowHebrew(row) {
  return String(row && (row.he_niqqud || row.hebrew_niqqud || row.he_plain || row.hebrew_plain) || "");
}

function resolveToken(token, resolver) {
  const precise = exactForm(token), bare = stripMarks(token);
  if (!bare) return null;
  const functionPid = resolver.functions.get(bare);
  if (functionPid) return functionPid;
  if (precise !== bare) {
    const exactPid = uniqueCandidate(resolver.exact, precise);
    if (exactPid) return exactPid;
  }
  const plainPid = uniqueCandidate(resolver.skeleton, bare);
  if (plainPid) return plainPid;
  if (bare.length >= 3 && PROCLITIC.test(bare)) {
    const base = bare.slice(1);
    const baseFunction = resolver.functions.get(base);
    if (baseFunction) return baseFunction;
    const basePid = uniqueCandidate(resolver.skeleton, base);
    if (basePid) return basePid;
  }
  return null;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function analyze(message) {
  const rows = Array.isArray(message.rows) ? message.rows : [];
  const resolver = await loadResolver();
  const frequencies = new Map();
  let total = 0, unresolved = 0;
  const normalizedRows = [];
  for (const row of rows) {
    const hebrew = rowHebrew(row).normalize("NFC");
    normalizedRows.push(hebrew);
    const tokens = hebrew.match(HEBREW_TOKEN) || [];
    for (const token of tokens) {
      total += 1;
      if (total > MAX_TOKENS) throw new Error("TOKEN_LIMIT_EXCEEDED");
      const pid = resolveToken(token, resolver);
      if (!pid) { unresolved += 1; continue; }
      const key = "pid:" + pid;
      frequencies.set(key, (frequencies.get(key) || 0) + 1);
      if (frequencies.size > MAX_TYPES) throw new Error("TYPE_LIMIT_EXCEEDED");
    }
  }
  const contentSha = await sha256(normalizedRows.join("\n"));
  const result = {
    schema_version: "room.learning_ingredients.2.0.1",
    source_class: String(message.source_class || ""),
    source_key: String(message.source_key || ""),
    content_revision: String(message.content_revision || ""),
    content_sha256: contentSha,
    entitlement_revision: message.entitlement_revision == null ? null : String(message.entitlement_revision),
    resolver_version: RESOLVER_VERSION,
    lexical_resolver_version: LEXICAL_RESOLVER_VERSION,
    dataset_version: resolver.dataset_version,
    key_frequencies: Array.from(frequencies, ([key, token_count]) => [key, token_count])
      .sort((a, b) => a[0].localeCompare(b[0])),
    unresolved_token_count: unresolved,
    proper_name_token_count: 0,
    total_token_count: total,
    built_at: new Date().toISOString(),
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 256 * 1024) throw new Error("PACKET_LIMIT_EXCEEDED");
  return result;
}

self.onmessage = async ({ data }) => {
  const id = data && data.id;
  if (!id || data.type !== "analyze") return;
  try {
    const ingredients = await analyze(data);
    self.postMessage({ id, ok: true, ingredients });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error && error.message || error) });
  }
};
