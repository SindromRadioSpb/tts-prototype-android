// B7 Learning Compass 2.0 — dedicated local lexical analyzer.
// Receives materialized rows, returns only content-free aggregate ingredients.
"use strict";

importScripts("/js/learning-compass-ingredients.js");

const DICT_URL = "/data/inflection/pealim-infl-v12.json.gz";
const FUNCTION_URL = "/data/inflection/pealim-function-links.v1.json";
const IngredientCore = self.LearningCompassIngredients;

let resolverPromise = null;

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
    return IngredientCore.buildResolver(dataset, functionData);
  }).catch((error) => { resolverPromise = null; throw error; });
  return resolverPromise;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function analyze(message) {
  const rows = Array.isArray(message.rows) ? message.rows : [];
  const resolver = await loadResolver();
  const contentSha = await sha256(IngredientCore.normalizedContent(rows));
  return IngredientCore.analyzeRows(rows, resolver, {
    source_class: message.source_class,
    source_key: message.source_key,
    content_revision: message.content_revision,
    content_sha256: contentSha,
    entitlement_revision: message.entitlement_revision,
  });
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
