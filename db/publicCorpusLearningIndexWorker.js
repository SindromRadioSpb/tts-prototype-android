"use strict";

// Builds a discardable lexical sidecar for one immutable public edition outside
// the server event loop. Only aggregate pid frequencies leave this worker; the
// public snapshots themselves remain in the canonical publication repository.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { parentPort, workerData } = require("worker_threads");
const IngredientCore = require("../public/js/learning-compass-ingredients.js");

const REPO = path.resolve(__dirname, "..");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function rowsFromSnapshot(snapshot) {
  const texts = snapshot && snapshot.library && Array.isArray(snapshot.library.texts)
    ? snapshot.library.texts : null;
  if (!texts || !texts.length || texts.some(text => !text || !Array.isArray(text.rows)))
    throw new Error("PUBLICATION_ASSET_INVALID");
  return texts.flatMap(text => text.rows).map(row => ({
    ...row,
    he_plain: row && (row.he_plain || row.hebrew_plain || row.he) || "",
    he_niqqud: row && (row.he_niqqud || row.hebrew_niqqud) || "",
  }));
}

function build() {
  const dataset = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz"))));
  const functionData = JSON.parse(fs.readFileSync(path.join(REPO, "public", "data", "inflection", "pealim-function-links.v1.json"), "utf8"));
  const resolver = IngredientCore.buildResolver(dataset, functionData);
  const builtAt = new Date().toISOString();
  const items = [];
  for (const input of workerData.items || []) {
    const snapshotJson = String(input.snapshot_json || "");
    if (sha256(Buffer.from(snapshotJson, "utf8")) !== String(input.snapshot_sha256))
      throw new Error("EDITION_HASH_MISMATCH");
    let snapshot;
    try { snapshot = JSON.parse(snapshotJson); } catch (_) { throw new Error("PUBLICATION_ASSET_INVALID"); }
    const rows = rowsFromSnapshot(snapshot);
    try {
      const ingredients = IngredientCore.analyzeRows(rows, resolver, {
        source_class: "public",
        source_key: `public:${String(workerData.slug)}:${String(input.public_work_id)}`,
        content_revision: String(input.snapshot_sha256),
        content_sha256: sha256(IngredientCore.normalizedContent(rows)),
        entitlement_revision: String(workerData.manifest_sha256),
        built_at: builtAt,
      });
      if (Buffer.byteLength(JSON.stringify(ingredients), "utf8") > 240 * 1024)
        throw new Error("PACKET_LIMIT_EXCEEDED");
      items.push({
        public_work_id: String(input.public_work_id), snapshot_sha256: String(input.snapshot_sha256),
        status: "PREPARED", reason_code: "PUBLIC_EDITION_INDEX_PREPARED", ingredients,
      });
    } catch (error) {
      const code = String(error && error.message || error);
      if (!/^(?:TOKEN_LIMIT_EXCEEDED|TYPE_LIMIT_EXCEEDED|PACKET_LIMIT_EXCEEDED|NO_HEBREW_TOKENS)$/.test(code)) throw error;
      items.push({
        public_work_id: String(input.public_work_id), snapshot_sha256: String(input.snapshot_sha256),
        status: "UNSUPPORTED", reason_code: code, ingredients: null,
      });
    }
  }
  const result = {
    schema_version: "public_learning_index.1.0.0", index_signature: String(workerData.signature),
    corpus_id: String(workerData.corpus_id), slug: String(workerData.slug),
    edition_id: String(workerData.edition_id), manifest_sha256: String(workerData.manifest_sha256),
    resolver_version: IngredientCore.RESOLVER_VERSION, generated_at: builtAt,
    matched_total: items.length,
    prepared_total: items.filter(item => item.status === "PREPARED").length,
    unsupported_total: items.filter(item => item.status === "UNSUPPORTED").length,
    items,
  };
  fs.mkdirSync(path.dirname(workerData.output_path), { recursive: true });
  const temporary = workerData.output_path + ".tmp-" + process.pid + "-" + Math.random().toString(36).slice(2);
  fs.writeFileSync(temporary, JSON.stringify(result), { flag: "wx" });
  try { fs.renameSync(temporary, workerData.output_path); }
  catch (error) {
    try { fs.unlinkSync(temporary); } catch (_) {}
    if (!fs.existsSync(workerData.output_path)) throw error;
  }
  return result;
}

try { parentPort.postMessage({ ok: true, index: build() }); }
catch (error) { parentPort.postMessage({ ok: false, error: String(error && error.message || error) }); }
