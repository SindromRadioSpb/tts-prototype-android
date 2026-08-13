"use strict";

// Builds a discardable, content-free lexical sidecar outside the server event
// loop. The parent has already resolved every path below the protected corpus
// root and verified active membership before starting this worker.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { parentPort, workerData } = require("worker_threads");
const IngredientCore = require("../public/js/learning-compass-ingredients.js");

const REPO = path.resolve(__dirname, "..");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function rowsFromBundle(bundle, textKey, expectedRows) {
  const texts = bundle && bundle.library && Array.isArray(bundle.library.texts) ? bundle.library.texts : null;
  const text = texts && (texts.find((item) => String(item && item.text_key) === String(textKey)) || (texts.length === 1 ? texts[0] : null));
  if (!text || !Array.isArray(text.rows)) throw new Error("GROUP_CORPUS_FILE_INVALID");
  if (Number.isInteger(expectedRows) && expectedRows >= 0 && text.rows.length !== expectedRows) throw new Error("GROUP_CORPUS_FILE_INVALID");
  return text.rows;
}

function build() {
  const dataset = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz"))));
  const functionData = JSON.parse(fs.readFileSync(path.join(REPO, "public", "data", "inflection", "pealim-function-links.v1.json"), "utf8"));
  const resolver = IngredientCore.buildResolver(dataset, functionData);
  const builtAt = new Date().toISOString();
  const items = [];
  for (const input of workerData.items || []) {
    const bytes = fs.readFileSync(input.absolute_path);
    if (sha256(bytes) !== String(input.bundle_sha256)) throw new Error("GROUP_CORPUS_FILE_INVALID");
    let bundle;
    try { bundle = JSON.parse(bytes.toString("utf8")); } catch (_) { throw new Error("GROUP_CORPUS_FILE_INVALID"); }
    const rows = rowsFromBundle(bundle, input.text_key, Number(input.rows_count));
    try {
      const contentSha = sha256(IngredientCore.normalizedContent(rows));
      const ingredients = IngredientCore.analyzeRows(rows, resolver, {
        source_class: "group",
        source_key: String(input.text_key || input.work_id),
        content_revision: String(input.bundle_sha256),
        content_sha256: contentSha,
        entitlement_revision: String(input.bundle_sha256),
        built_at: builtAt,
      });
      if (Buffer.byteLength(JSON.stringify(ingredients), "utf8") > 240 * 1024) throw new Error("PACKET_LIMIT_EXCEEDED");
      items.push({
        work_id: String(input.work_id),
        text_key: String(input.text_key || input.work_id),
        bundle_sha256: String(input.bundle_sha256),
        status: "PREPARED",
        reason_code: "CORPUS_INDEX_PREPARED",
        ingredients,
      });
    } catch (error) {
      const code = String(error && error.message || error);
      if (!/^(?:TOKEN_LIMIT_EXCEEDED|TYPE_LIMIT_EXCEEDED|PACKET_LIMIT_EXCEEDED|NO_HEBREW_TOKENS)$/.test(code)) throw error;
      items.push({
        work_id: String(input.work_id),
        text_key: String(input.text_key || input.work_id),
        bundle_sha256: String(input.bundle_sha256),
        status: "UNSUPPORTED",
        reason_code: code,
        ingredients: null,
      });
    }
  }
  const result = {
    schema_version: "group_learning_index.1.0.0",
    index_signature: String(workerData.signature),
    corpus_id: String(workerData.corpus_id),
    corpus_version: Number(workerData.corpus_version) || 0,
    resolver_version: IngredientCore.RESOLVER_VERSION,
    generated_at: builtAt,
    matched_total: items.length,
    prepared_total: items.filter((item) => item.status === "PREPARED").length,
    unsupported_total: items.filter((item) => item.status === "UNSUPPORTED").length,
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
