"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SUPPORT_ROOT = path.join(__dirname, "year1-support");
const MANIFEST_PATH = path.join(SUPPORT_ROOT, "manifest.json");
const MAX_AGENT_MARKDOWN_BYTES = 20 * 1024;
const SLUG = "physics-year1-problems";
const HASH = /^[a-f0-9]{64}$/;
let manifestCache = null;

function fail() {
  const error = new Error("PHYSICS_LEARNING_SUPPORT_NOT_FOUND");
  error.code = "PHYSICS_LEARNING_SUPPORT_NOT_FOUND";
  throw error;
}
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function loadManifest() {
  if (!manifestCache) {
    const value = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    if (value?.schema_version !== "physics_learning_support_manifest.1.0.0"
      || value.corpus_slug !== SLUG || !Array.isArray(value.tasks) || value.tasks.length !== 74
      || value.owner_approval?.public_read_allowed !== true || value.owner_approval?.agent_derivative_text_allowed !== true) fail();
    manifestCache = Object.freeze(value);
  }
  return manifestCache;
}
function snapshotObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try { return JSON.parse(String(value || "")); } catch (_) { fail(); }
}
function physicsTaskMeta(snapshotValue) {
  const snapshot = snapshotObject(snapshotValue);
  const text = snapshot?.library?.texts?.[0];
  const meta = text?.source_meta?.physics_task || text?.table_model_meta?.physics_task;
  if (!meta || meta.schema !== "linguistpro.physics.task-card.1") fail();
  return meta;
}
function resolveLearningSupport(anchor = {}) {
  const manifest = loadManifest();
  if (anchor.slug !== SLUG || anchor.editionId !== manifest.edition.edition_id
    || Number(anchor.editionNumber) !== Number(manifest.edition.edition_number)
    || anchor.editionManifestSha256 !== manifest.edition.manifest_sha256) fail();
  const entry = manifest.tasks.find(row => row.public_work_id === anchor.publicWorkId);
  if (!entry || (anchor.editionItemId && anchor.editionItemId !== entry.edition_item_id)
    || anchor.snapshotSha256 !== entry.snapshot_sha256 || !HASH.test(entry.sha256)) fail();
  const meta = physicsTaskMeta(anchor.snapshot);
  if (String(meta.task_number) !== entry.task_number || meta.source_image_sha256 !== entry.source_image_sha256) fail();
  const absolute = path.resolve(SUPPORT_ROOT, entry.file);
  if (!absolute.startsWith(path.resolve(SUPPORT_ROOT) + path.sep)) fail();
  let bytes;
  try { bytes = fs.readFileSync(absolute); } catch (_) { fail(); }
  if (bytes.length !== Number(entry.bytes) || sha256(bytes) !== entry.sha256) fail();
  let body; try { body = JSON.parse(bytes.toString("utf8")); } catch (_) { fail(); }
  if (body?.schema_version !== "physics_learning_support.1.0.0" || body.corpus_slug !== SLUG
    || body.task_number !== entry.task_number || body.edition_id !== manifest.edition.edition_id
    || body.edition_item_id !== entry.edition_item_id || body.public_work_id !== entry.public_work_id
    || body.snapshot_sha256 !== entry.snapshot_sha256 || body.source?.image_sha256 !== entry.source_image_sha256
    || body.rights?.public_read_allowed !== true || body.rights?.agent_derivative_text_allowed !== true
    || body.review?.open_mismatch !== false) fail();
  return Object.freeze({ ...body, derivative_sha256: entry.sha256 });
}
function bullets(values) { return (values || []).map(value => `- ${value}`).join("\n"); }
function numbered(values) { return (values || []).map((value, index) => `${index + 1}. ${value}`).join("\n"); }
function toAgentMarkdown(support) {
  const construction = support.exam_solution.construction?.length
    ? `\n### Обязательное построение\n\n${bullets(support.exam_solution.construction)}\n` : "";
  const comparison = support.review.comparison_note
    ? `\n- Пояснение сверки: ${support.review.comparison_note}` : "";
  const markdown = `# Физика — задача ${support.task_number}

## Каноническое условие на русском

${bullets(support.source.condition_ru)}

## Оригинал на иврите

${bullets(support.source.condition_he)}

## Сначала поймём задачу

### Что здесь происходит

${support.beginner.physical_picture}

### Что нужно вспомнить

${bullets(support.beginner.prerequisites)}

### Почему подходит этот принцип

**${support.beginner.profile_title}.** ${support.beginner.deep_principle}

Условия применимости:

${bullets(support.beginner.application_conditions)}

### Маршрут решения

${numbered(support.beginner.roadmap)}

### Главная ловушка

> ${support.beginner.task_trap}

### Что часто путают

${bullets(support.beginner.common_mistakes)}

### Проверьте себя до вычислений

${bullets(support.beginner.self_check)}

## Подсказка: модель

${support.beginner.hint_model}

## Экзаменационное решение

### Дано

${bullets(support.exam_solution.given)}

### Найти

${bullets(support.exam_solution.find)}

### Перевод в СИ и обозначения

${bullets(support.exam_solution.si)}

### Физическая модель

${support.exam_solution.physical_model}

### Базовые законы

${bullets(support.exam_solution.laws)}

### Вывод расчётных формул

${numbered(support.exam_solution.symbolic)}
${construction}
### Последовательный расчёт

${numbered(support.exam_solution.calculation)}

### Проверка результата

${bullets(support.exam_solution.check)}

## Ответ

**${support.answer.result}**

## Сверка и происхождение

- Статус: ${support.review.state}
- Сверка с ключом: ${support.review.comparison}
- Решение закреплено за edition ${support.edition_number}, work ${support.public_work_id}, snapshot ${support.snapshot_sha256}.${comparison}
- SHA-256 производной: ${support.derivative_sha256}

## Инструкция агенту

${bullets(support.agent_guidance.rules)}
`;
  if (Buffer.byteLength(markdown, "utf8") > MAX_AGENT_MARKDOWN_BYTES) fail();
  return markdown;
}

module.exports = { SUPPORT_ROOT, MAX_AGENT_MARKDOWN_BYTES, loadManifest, resolveLearningSupport, toAgentMarkdown };
