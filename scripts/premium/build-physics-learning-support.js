#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { normalizePhysicsNotation } = require("./build-physics-learning-derivatives");

const ROOT = path.resolve(__dirname, "..", "..");
const PACKET = path.join(ROOT, "docs", "research", "physics-learning-derivatives", "2026-08-27");
const CORPUS_PATH = path.join(ROOT, "docs", "research", "physics-corpus", "2026-08-24", "physics-year1-corpus-records.json");
const ANCHOR_PATH = path.join(PACKET, "production-publication-anchor.json");
const OUT = path.join(ROOT, "physics", "year1-support");
const TASKS_OUT = path.join(OUT, "tasks");
const PROD_ORIGIN = "https://linguistpro.kolosei.com";
const SLUG = "physics-year1-problems";
const APPROVAL = Object.freeze({
  public_read_allowed: true,
  agent_derivative_text_allowed: true,
  basis: "OWNER_APPROVAL_PHYSICS_YEAR1_R12_2026_08_28",
  asserted_at: "2026-08-28",
});

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
function invariant(ok, message) { if (!ok) throw new Error(message); }
function byTask(entries, label) {
  const map = new Map((entries || []).map(entry => [String(entry.task_number), entry]));
  invariant(map.size === 74, `${label}: expected 74 unique tasks`);
  return map;
}
function conditionRows(task, field) { return (task.rows || []).map(row => row[field]).filter(Boolean); }
function normalizeList(values) { return (values || []).map(value => normalizePhysicsNotation(value)); }

async function refreshProductionAnchor(origin = PROD_ORIGIN) {
  const catalogResponse = await fetch(`${origin}/api/public-corpora/${SLUG}`, { headers: { accept: "application/json" } });
  const sectionsResponse = await fetch(`${origin}/api/public-corpora/${SLUG}/sections`, { headers: { accept: "application/json" } });
  invariant(catalogResponse.ok && sectionsResponse.ok, "PHYSICS_PRODUCTION_ANCHOR_FETCH_FAILED");
  const catalog = await catalogResponse.json();
  const sections = await sectionsResponse.json();
  invariant(catalog.edition?.edition_number === 2 && catalog.items?.length === 74, "PHYSICS_PRODUCTION_EDITION_UNEXPECTED");
  const taskRows = sections.sections.flatMap(section => section.tasks);
  invariant(taskRows.length === 74, "PHYSICS_PRODUCTION_SECTIONS_UNEXPECTED");
  const catalogByWork = new Map(catalog.items.map(item => [item.public_work_id, item]));
  const items = [];
  for (const task of taskRows) {
    const catalogItem = catalogByWork.get(task.public_work_id);
    invariant(catalogItem && catalogItem.snapshot_sha256 === task.snapshot_sha256, `PHYSICS_PRODUCTION_ANCHOR_DRIFT:${task.task_number}`);
    const response = await fetch(`${origin}/api/public-corpora/${SLUG}/works/${encodeURIComponent(task.public_work_id)}`, { headers: { accept: "application/json" } });
    invariant(response.ok, `PHYSICS_PRODUCTION_WORK_FETCH_FAILED:${task.task_number}`);
    const work = await response.json();
    invariant(work.item?.edition_item_id && work.item.snapshot_sha256 === task.snapshot_sha256, `PHYSICS_PRODUCTION_WORK_DRIFT:${task.task_number}`);
    const meta = work.item.snapshot?.library?.texts?.[0]?.source_meta?.physics_task;
    invariant(meta?.task_number === task.task_number, `PHYSICS_PRODUCTION_TASK_META_DRIFT:${task.task_number}`);
    items.push({
      task_number: task.task_number,
      edition_item_id: work.item.edition_item_id,
      public_work_id: task.public_work_id,
      position_no: Number(task.position_no),
      snapshot_sha256: task.snapshot_sha256,
      source_image_sha256: meta.source_image_sha256,
    });
  }
  items.sort((a, b) => a.position_no - b.position_no);
  const anchor = {
    schema_version: "physics_production_publication_anchor.1.0.0",
    captured_at: new Date().toISOString(),
    origin,
    corpus_slug: SLUG,
    edition: {
      edition_id: catalog.edition.edition_id,
      edition_number: Number(catalog.edition.edition_number),
      manifest_sha256: catalog.edition.manifest_sha256,
    },
    items,
  };
  writeJson(ANCHOR_PATH, anchor);
  return anchor;
}

function buildSupport() {
  const corpus = readJson(CORPUS_PATH);
  const answers = byTask(readJson(path.join(PACKET, "answer-ledger.json")).entries, "answers");
  const sourceSolutions = byTask(readJson(path.join(PACKET, "solution-ledger.json")).entries, "source solutions");
  const ruSolutions = byTask(readJson(path.join(PACKET, "solution-ledger.ru.json")).entries, "Russian solutions");
  const exam = byTask(readJson(path.join(PACKET, "exam-solution-ledger.ru.json")).entries, "exam solutions");
  const pedagogyLedger = readJson(path.join(PACKET, "beginner-pedagogy-ledger.ru.json"));
  const pedagogy = byTask(pedagogyLedger.entries, "beginner pedagogy");
  const anchor = readJson(ANCHOR_PATH);
  invariant(anchor.corpus_slug === SLUG && anchor.items.length === 74, "PHYSICS_PRODUCTION_ANCHOR_INVALID");
  const anchorByTask = byTask(anchor.items, "production anchors");
  const corpusByTask = byTask(corpus.tasks, "corpus");
  fs.mkdirSync(TASKS_OUT, { recursive: true });
  const files = [];

  for (const task of corpus.tasks) {
    const taskNumber = task.task_number;
    const pinned = anchorByTask.get(taskNumber);
    const source = sourceSolutions.get(taskNumber);
    const localized = ruSolutions.get(taskNumber);
    const examEntry = exam.get(taskNumber);
    const pedagogical = pedagogy.get(taskNumber);
    const profile = pedagogyLedger.profiles[pedagogical.profile];
    invariant(pinned.source_image_sha256 === task.source_image_sha256, `PHYSICS_SOURCE_IMAGE_DRIFT:${taskNumber}`);
    const calculation = [...(examEntry.calculation || localized.derivation)];
    const numericTokens = String(localized.result).match(/\d+(?:[,.]\d+)?/g) || [];
    if (!numericTokens.every(token => calculation.join(" ").includes(token)))
      calculation.push(`Окончательно, после вычисления и округления: ${localized.result}.`);
    const support = {
      schema_version: "physics_learning_support.1.0.0",
      corpus_slug: SLUG,
      locale: "ru",
      edition_id: anchor.edition.edition_id,
      edition_number: anchor.edition.edition_number,
      edition_manifest_sha256: anchor.edition.manifest_sha256,
      edition_item_id: pinned.edition_item_id,
      public_work_id: pinned.public_work_id,
      snapshot_sha256: pinned.snapshot_sha256,
      task_number: taskNumber,
      source: {
        page: task.source_page,
        image_sha256: task.source_image_sha256,
        condition_ru: conditionRows(task, "ru"),
        condition_he: conditionRows(task, "he_plain"),
      },
      notation: {
        rule: "Индекс записывается через _, составной индекс — в фигурных скобках, степень — через ^, каждое умножение — через *.",
        example: "v^2 = v_0^2 + 2 * a * s",
      },
      beginner: {
        physical_picture: pedagogical.physical_picture,
        profile_title: profile.title,
        prerequisites: profile.prerequisites,
        deep_principle: profile.deep_principle,
        application_conditions: profile.application_conditions,
        roadmap: pedagogical.roadmap,
        task_trap: pedagogical.task_trap,
        common_mistakes: profile.common_mistakes,
        self_check: pedagogical.self_check,
        hint_model: normalizePhysicsNotation(localized.model),
      },
      exam_solution: {
        given: normalizeList(examEntry.given),
        find: normalizeList(examEntry.find),
        si: normalizeList(examEntry.si),
        physical_model: normalizePhysicsNotation(localized.model),
        laws: normalizeList(examEntry.laws),
        symbolic: normalizeList(examEntry.symbolic),
        construction: normalizeList(examEntry.construction || []),
        calculation: normalizeList(calculation),
        check: normalizeList(examEntry.check),
      },
      answer: {
        result: normalizePhysicsNotation(localized.result),
        key: answers.get(taskNumber).parts.map(part => ({ label: part.label || null, text: part.text })),
      },
      review: {
        state: "OWNER_APPROVED_FOR_PRODUCTION",
        comparison: source.comparison,
        disposition: source.review_disposition || "NOT_APPLICABLE",
        comparison_note: source.comparison_note ? normalizePhysicsNotation(source.comparison_note) : null,
        open_mismatch: source.comparison === "MISMATCH" && source.review_disposition !== "OWNER_CONFIRMED_KEY_ERROR",
      },
      agent_guidance: {
        assistance_modes: ["SCAFFOLD", "HINT", "FULL_EXPLANATION", "CHECK_LEARNER_WORK"],
        rules: [
          "Опирайся только на эту закреплённую карточку и каноническое условие выбранной задачи.",
          "Не выдумывай отсутствующие числа, обозначения, рисунки или шаги и явно называй недостающие данные.",
          "Веди объяснение от физической картины и базовых законов к выводу формул, затем к подстановке и проверке.",
          "Не записывай оценку, прогресс или учебную истину пользователя; проверка работы является только объяснением.",
        ],
      },
      rights: APPROVAL,
    };
    invariant(!support.review.open_mismatch, `PHYSICS_OPEN_MISMATCH:${taskNumber}`);
    const relative = `tasks/task-${taskNumber}.json`;
    const absolute = path.join(OUT, relative);
    writeJson(absolute, support);
    const body = fs.readFileSync(absolute);
    files.push({
      task_number: taskNumber,
      edition_item_id: pinned.edition_item_id,
      public_work_id: pinned.public_work_id,
      position_no: pinned.position_no,
      snapshot_sha256: pinned.snapshot_sha256,
      source_image_sha256: task.source_image_sha256,
      file: relative,
      bytes: body.length,
      sha256: sha256(body),
    });
  }
  invariant(corpusByTask.size === files.length && files.length === 74, "PHYSICS_SUPPORT_TASK_COUNT_INVALID");
  const manifest = {
    schema_version: "physics_learning_support_manifest.1.0.0",
    corpus_slug: SLUG,
    edition: anchor.edition,
    owner_approval: APPROVAL,
    review: { task_count: 74, open_mismatch_count: 0, confirmed_key_error_count: 7 },
    agent_contract: {
      scope: "reading.publication.derivative.read",
      use_class: "DERIVATIVE_TEXT",
      max_output_bytes: 24576,
      tutor_prompt_sha256: readJson(path.join(PACKET, "artifacts", "manifest.json")).tutor_prompt_sha256,
    },
    tasks: files,
  };
  writeJson(path.join(OUT, "manifest.json"), manifest);
  return manifest;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--refresh-production-anchor")) await refreshProductionAnchor();
  const manifest = buildSupport();
  process.stdout.write(JSON.stringify({ ok: true, task_count: manifest.tasks.length, edition: manifest.edition, output: path.relative(ROOT, OUT) }) + "\n");
}

if (require.main === module) main().catch(error => { process.stderr.write(`build-physics-learning-support: ${error.message}\n`); process.exitCode = 1; });
module.exports = { APPROVAL, ANCHOR_PATH, OUT, buildSupport, refreshProductionAnchor };
