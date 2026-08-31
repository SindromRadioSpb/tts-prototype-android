"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ROOT = process.env.MATERIALS_PB2_LEARNING_SUPPORT_ROOT
  ? path.resolve(process.env.MATERIALS_PB2_LEARNING_SUPPORT_ROOT)
  : path.join(__dirname, "pb2-support");
const SLUG = "materials-science-year1-problem-book-2";
const HASH = /^[a-f0-9]{64}$/;
const MAX_AGENT_MARKDOWN_BYTES = 20 * 1024;

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stableJson(value) { return JSON.stringify(value, null, 2) + "\n"; }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const out = {}; for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]); return out;
}
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function notFound() {
  const error = new Error("MATERIALS_PB2_LEARNING_SUPPORT_NOT_FOUND");
  error.code = "MATERIALS_PB2_LEARNING_SUPPORT_NOT_FOUND";
  throw error;
}
function snapshotObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try { return JSON.parse(String(value || "")); } catch (_) { notFound(); }
}
function bullets(values) {
  return (Array.isArray(values) ? values : []).filter(value => String(value || "").trim())
    .map(value => `- ${String(value).trim()}`).join("\n");
}
function numbered(values) {
  return (Array.isArray(values) ? values : []).filter(value => String(value || "").trim())
    .map((value, index) => `${index + 1}. ${String(value).trim()}`).join("\n");
}
function solutionRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const text = String(row?.text?.ru || "").trim();
    if (!text) notFound();
    const label = [row.section, row.kind].filter(Boolean).join(" / ");
    return `${Number(row.order)}. ${label ? `[${label}] ` : ""}${text}`;
  }).join("\n");
}
function toAgentMarkdown(support) {
  if (!support || support.corpus_slug !== SLUG || support.review?.publication_blocking !== false
    || support.rights?.agent_derivative_text_allowed !== true || !Array.isArray(support.solution_rows)) notFound();
  const grounding = support.agent_grounding || {};
  const conditionRu = (support.condition?.rows || []).map(row => row.russian).filter(Boolean);
  const conditionHe = (support.condition?.rows || []).map(row => row.hebrew_plain || row.hebrew_niqqud).filter(Boolean);
  const limitations = bullets(grounding.unresolved_limits);
  const explanationMap = `## Карта объяснения

- Инженерная картина: ${String(grounding.engineering_picture || "не выделена отдельно")}
- Главная ловушка: ${String(grounding.main_trap || "не выделена отдельно")}

### Дано

${bullets(grounding.givens)}

### Найти

${bullets(grounding.find)}

### Законы и определения

${bullets(grounding.laws)}

### Символьный вывод

${numbered(grounding.symbolic_derivation)}

### Проверки

${bullets(grounding.checks)}
${limitations ? `\n### Нерешённые ограничения\n\n${limitations}\n` : ""}`;
  const beforeMap = `# Материаловедение — задача ${support.display_alias}

## Каноническое условие на русском

${bullets(conditionRu)}

## Оригинал на иврите

${bullets(conditionHe)}

## Проверенное решение

Ниже все строки русской проекции проверенной студенческой таблицы в исходном порядке. Метки раздела и типа строки помогают не смешивать ответ, теорию, вывод и проверку.

${solutionRows(support.solution_rows)}
`;
  const afterMap = `## Происхождение и инструкция агенту

- Reviewed state: ${support.review.state}; legacy comparison: ${support.review.legacy_comparison}.
- Exact edition ${support.edition_number}; item ${support.edition_item_id}; work ${support.public_work_id}; snapshot ${support.snapshot_sha256}.
- SHA-256 производной: ${support.derivative_sha256}.
- Объясняй на выбранном пользователем уровне, но используй только условие, рисунки и проверенное решение выше. Не придумывай недостающие размеры, свойства материала, формулы, числа или выводы. Если запрос выходит за эти данные, прямо обозначь границу и предложи открыть карточку в Читальном зале.
`;
  const full = `${beforeMap}\n${explanationMap}\n${afterMap}`;
  const markdown = Buffer.byteLength(full, "utf8") <= MAX_AGENT_MARKDOWN_BYTES
    ? full
    : `${beforeMap}\n> Карта объяснения не дублируется в этом ограниченном MCP-ответе: все проверенные строки решения сохранены полностью.\n\n${afterMap}`;
  if (Buffer.byteLength(markdown, "utf8") > MAX_AGENT_MARKDOWN_BYTES) notFound();
  return markdown;
}
function createResolver(root = DEFAULT_ROOT) {
  const supportRoot = path.resolve(root);
  let manifestCache = null;
  const assetCache = new Map();
  function loadManifest() {
    if (manifestCache) return manifestCache;
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(path.join(supportRoot, "manifest.json"), "utf8")); }
    catch (_) { notFound(); }
    if (manifest?.schema_version !== "materials_pb2_learning_support_manifest.1.0.0"
      || manifest.corpus_slug !== SLUG || !Array.isArray(manifest.tasks) || manifest.tasks.length !== 60
      || manifest.rights?.public_read_allowed !== true || manifest.rights?.public_solution_display_and_print_allowed !== true) notFound();
    manifestCache = Object.freeze(manifest);
    return manifestCache;
  }
  function resolveLearningSupport(anchor = {}) {
    const manifest = loadManifest();
    if (anchor.slug !== SLUG || anchor.editionId !== manifest.edition.edition_id
      || Number(anchor.editionNumber) !== Number(manifest.edition.edition_number)
      || anchor.editionManifestSha256 !== manifest.edition.manifest_sha256) notFound();
    const entry = manifest.tasks.find(task => task.public_work_id === anchor.publicWorkId);
    if (!entry || (anchor.editionItemId && anchor.editionItemId !== entry.edition_item_id)
      || anchor.snapshotSha256 !== entry.snapshot_sha256 || !HASH.test(entry.sha256)) notFound();
    const snapshot = snapshotObject(anchor.snapshot);
    const canonical = snapshot?.library?.texts?.[0];
    const meta = canonical?.source_meta?.materials_science_task || canonical?.table_model_meta?.materials_science_task;
    if (!canonical || meta?.schema !== "linguistpro.materials-science.task-card.1" || meta.task_id !== entry.task_id
      || sha256(Buffer.from(canonicalJson(canonical), "utf8")) !== entry.canonical_task_sha256) notFound();
    const absolute = path.resolve(supportRoot, entry.file);
    if (!absolute.startsWith(supportRoot + path.sep)) notFound();
    let bytes;
    try { bytes = fs.readFileSync(absolute); } catch (_) { notFound(); }
    if (bytes.length !== Number(entry.bytes) || sha256(bytes) !== entry.sha256) notFound();
    let body;
    try { body = JSON.parse(bytes.toString("utf8")); } catch (_) { notFound(); }
    if (body?.schema_version !== "materials_pb2_learning_support.1.0.0" || body.corpus_slug !== SLUG
      || body.task_id !== entry.task_id || body.edition_id !== manifest.edition.edition_id
      || body.public_work_id !== entry.public_work_id || body.snapshot_sha256 !== entry.snapshot_sha256
      || body.publication_anchor?.canonical_task_sha256 !== entry.canonical_task_sha256
      || body.publication_anchor?.source_canonical_task_sha256 !== entry.source_canonical_task_sha256
      || body.review?.publication_blocking !== false || body.rights?.public_read_allowed !== true
      || body.rights?.public_solution_display_and_print_allowed !== true || !Array.isArray(body.solution_rows)) notFound();
    return Object.freeze({ ...body, derivative_sha256: entry.sha256 });
  }
  function resolveAsset(assetSha256) {
    const manifest = loadManifest();
    if (!HASH.test(String(assetSha256 || ""))) notFound();
    if (assetCache.has(assetSha256)) return assetCache.get(assetSha256);
    const entry = Array.isArray(manifest.assets) && manifest.assets.find(asset => asset.sha256 === assetSha256);
    if (!entry || !["image/jpeg", "image/png"].includes(entry.mime)) notFound();
    const absolutePath = path.resolve(supportRoot, entry.file);
    if (!absolutePath.startsWith(supportRoot + path.sep)) notFound();
    let bytes;
    try { bytes = fs.readFileSync(absolutePath); } catch (_) { notFound(); }
    if (bytes.length !== Number(entry.bytes) || sha256(bytes) !== entry.sha256) notFound();
    const result = Object.freeze({ absolute_path: absolutePath, bytes: bytes.length, sha256: entry.sha256, mime: entry.mime });
    assetCache.set(assetSha256, result);
    return result;
  }
  return Object.freeze({ loadManifest, resolveLearningSupport, resolveAsset });
}

const defaultResolver = createResolver();
module.exports = {
  DEFAULT_ROOT,
  SLUG,
  MAX_AGENT_MARKDOWN_BYTES,
  createResolver,
  loadManifest: defaultResolver.loadManifest,
  resolveLearningSupport: defaultResolver.resolveLearningSupport,
  resolveAsset: defaultResolver.resolveAsset,
  toAgentMarkdown
};
