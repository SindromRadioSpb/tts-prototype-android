#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
process.env.LESSON_BUILDER_LB0_ENABLED = "1";

const personal = require(path.join(REPO, "db", "agentSentenceRepo"));
const corpus = require(path.join(REPO, "db", "corpusSentenceRepo"));
const keying = require(path.join(REPO, "db", "keyingService"));
const graph = require(path.join(REPO, "db", "learnerGraphRepo"));
const llmGate = require(path.join(REPO, "agent", "llmGate"));
const agentRepo = require(path.join(REPO, "db", "agentRepo"));
const learnerLog = require(path.join(REPO, "db", "learnerLogRepo"));
const LB = require(path.join(REPO, "agent", "lessonBuilder"));
const Artifact = require(path.join(REPO, "public", "js", "lesson-artifact"));
const realCorpusLessonWindow = corpus.getCorpusLessonWindow;

let checks = 0; const failures = [];
function ok(v, m) { checks++; if (!v) failures.push(m); }
const heb = "שלום עולם זה טקסט ארוך ללימוד עברית עם מילים רבות ומשפטים שימושיים לתרגול קריאה והבנה ";
const rows = Array.from({ length: 12 }, (_, i) => ({ order_index: i, he: heb, ru: "translation " + i }));

personal.getLessonWindow = async () => ({ ok: true, anchor: { start_order_index: 0, row_count: 12 }, title: "My text", rows_total: 12, rows, artifact_updated_at: "2026-07-15T00:00:00.000Z" });
corpus.getCorpusLessonWindow = async () => ({ ok: true, anchor: { start_order_index: 0, row_count: 12 }, title: "Corpus text", rows_total: 12, rows,
  work: { title: "Corpus text", author: "Author", license: "public-domain" } });
keying.resolveWords = async (words) => ({ resolver: "fixture-resolver", model_version: "fixture-model", keyer_version: "fixture-keyer",
  results: words.map((w, i) => ({ surface: w.surface, item_key: "item:" + i, keyable: true, confidence: .9, ambiguous: false })) });
keying.glossForItemKey = async (k) => ({ meaning: "meaning " + k });
// Production learnerGraphRepo returns an item-keyed object, not an array. Keep
// this fixture contract-realistic so the production .map regression cannot recur.
graph.getKnownWords = async () => ({ "item:0": { status: "known" } });
graph.getDue = async () => [{ item_key: "item:1" }];
graph.getWeakWords = async () => [{ item_key: "item:2" }];
agentRepo.usageToday = async () => ({ user_llm_calls: 1 });
llmGate.gatedGenerate = async () => ({ phase: "ok", key_source: "agent", out: { provider: "mock", model: "fixture", text: JSON.stringify({
  objective: "Grounded objective", sections: [{ title: "Read", body: "Read closely", source_ids: ["source-1"] }],
  exercises: [{ type: "source_reading", instruction: "Read and mark", source_ids: ["source-1", "source-2"] },
    { type: "vocabulary", instruction: "Use the key words", source_ids: ["source-1", "source-2"] }],
}) } });

function request() { return { sources: [
  { kind: "personal", text_key: "personal-key", start_order_index: 0, row_count: 12 },
  { kind: "corpus", work_id: "42", text_key: "0123456789abcdef", start_order_index: 0, row_count: 12 },
], goalId: "active_vocabulary", explanationLanguage: "en", approximateLevel: "A2", durationMinutes: 20, focuses: ["reading", "vocabulary"] }; }

(async () => {
  const corpusDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-lb0-corpus-"));
  fs.mkdirSync(path.join(corpusDir, "benyehuda", "works"), { recursive: true });
  fs.writeFileSync(path.join(corpusDir, "benyehuda", "works", "42.json"), JSON.stringify({ library: { texts: [{
    text_key: "0123456789abcdef", title: "Fixture work", source_meta: { corpus: { author: "Fixture", license: "public-domain" } }, rows,
  }] } }));
  process.env.DATA_DIR = corpusDir;
  const realWindow = await realCorpusLessonWindow({ work_id: "42", text_key: "0123456789abcdef", start_order_index: 2, row_count: 4 });
  ok(realWindow.ok && realWindow.rows.length === 4 && realWindow.anchor.start_order_index === 2, "real corpus repository resolves explicit bounded window");
  ok((await realCorpusLessonWindow({ work_id: "../42", text_key: "0123456789abcdef", start_order_index: 0, row_count: 4 })).error === "BAD_WORK_ID", "corpus window rejects traversal work id");

  ok(!LB.normalizeRequest({}).ok, "zero sources rejected");
  ok(!LB.normalizeRequest({ ...request(), sources: request().sources.concat(request().sources) }).ok, "more than three sources rejected");
  ok(!LB.normalizeRequest({ ...request(), durationMinutes: 60 }).ok, "unsupported duration rejected");
  ok(!LB.normalizeRequest({ ...request(), durationMinutes: 10, focuses: ["reading", "vocabulary", "grammar"] }).ok, "10-minute lesson rejects more than two focuses");
  ok(!LB.normalizeRequest({ ...request(), focuses: ["reading", "vocabulary", "grammar", "writing"] }).ok, "multi-focus remains bounded");
  ok(!LB.normalizeRequest({ ...request(), sources: [request().sources[0], request().sources[0]] }).ok, "duplicate source rejected");
  ok(LB.normalizeRequest(request()).ok, "approved request accepted");
  ok(LB.normalizeRequest({ ...request(), goalId: undefined, goal: "Legacy goal", focuses: undefined, focus: "reading" }).ok, "cached LB0 request remains backward compatible");

  const built = await LB.build({ userId: "u1" }, request());
  ok(built.ok && built.draft.status === "draft", "typed draft built");
  ok(built.draft.schemaVersion === 1 && built.draft.policyVersion === "lesson-builder-lb0-v1", "artifact versions frozen");
  ok(built.draft.sourceRefs.length === 2 && built.draft.sourceRefs[1].license === "public-domain", "mixed approved sources preserve provenance");
  ok(!JSON.stringify(built.draft.sourceRefs).includes(heb.trim()), "source bodies are not copied into artifact refs");
  ok(!JSON.stringify(built.draft).includes(heb.trim()), "full selected source body is absent from ephemeral artifact");
  ok(built.draft.candidateVocabulary.length <= 5, "20-minute candidate cap enforced");
  ok(typeof built.draft.coverage === "number" && Array.isArray(built.draft.availableReviewTargets), "coverage and review targets remain typed deterministic facts");
  ok(built.draft.sections[0].source_ids[0] === "source-1", "LLM sections remain source-linked");
  ok(built.draft.exercises.some((e) => e.type === "source_reading"), "reading action required");
  ok(built.draft.exercises.some((e) => e.type === "vocabulary") && built.draft.request.focuses.length === 2, "each selected focus is represented and preserved");
  ok(!("review_log" in built.draft) && !("mastery" in built.draft), "no learner-truth fields");
  ok(Date.parse(built.draft.expiresAt) - Date.parse(built.draft.createdAt) === 86400000, "24-hour TTL exact");
  ok(!!Artifact.validate(built.draft), "shared client artifact schema accepts server output");

  const mem = new Map(); const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = Artifact.createSessionStore(storage, () => Date.parse(built.draft.createdAt) + 1000);
  ok(store.kind === "session-ttl" && store.save(built.draft).ok, "ephemeral adapter stores valid draft");
  ok(store.load().status === "draft", "stored draft reloads");
  ok(store.activate(built.draft).draft.status === "active", "explicit activation changes only artifact status");
  store.discard(); ok(store.load() === null, "explicit discard clears session artifact");
  const expiredStore = Artifact.createSessionStore(storage, () => Date.parse(built.draft.expiresAt) + 1);
  storage.setItem(Artifact.KEY, JSON.stringify(built.draft)); ok(expiredStore.load() === null, "expired draft purged on read");

  llmGate.gatedGenerate = async () => ({ phase: "ok", out: { provider: "mock", model: "bad", text: JSON.stringify({ objective: "x",
    sections: [{ title: "Injected", body: "bad", source_ids: ["foreign-source"] }], exercises: [] }) } });
  const fallback = await LB.build({ userId: "u1" }, { ...request(), sources: [request().sources[0]] });
  ok(fallback.ok && fallback.degraded_reason === "LLM_OUTPUT_INVALID", "invalid/injected LLM source falls back honestly");
  ok(fallback.draft.exercises[0].type === "source_reading", "fallback remains useful and reading-first");

  const oldPersonal = personal.getLessonWindow;
  personal.getLessonWindow = async () => ({ ok: true, anchor: { start_order_index: 0, row_count: 1 }, title: "short", rows: [{ order_index: 0, he: "קצר", ru: null }] });
  const short = await LB.build({ userId: "u1" }, { ...request(), sources: [request().sources[0]] });
  ok(short.error === "SOURCE_SELECTION_TOO_SHORT", "short source fails without padding");
  personal.getLessonWindow = oldPersonal;

  process.env.LESSON_BUILDER_LB0_ENABLED = "0";
  ok((await LB.build({ userId: "u1" }, request())).error === "LESSON_BUILDER_DISABLED", "runtime rollback flag works");
  process.env.LESSON_BUILDER_LB0_ENABLED = "1";

  const src = fs.readFileSync(path.join(REPO, "agent", "lessonBuilder.js"), "utf8");
  ok(!/reviewer|review_log|srsAttempt|learnerProjection|createCard/.test(src), "builder imports no learner-truth writer");
  ok(!/console\./.test(src), "builder emits no source content logs");
  const server = fs.readFileSync(path.join(REPO, "server.js"), "utf8");
  ok(server.includes("/api/agent/lesson-builder/build"), "authenticated build API wired");
  const ui = fs.readFileSync(path.join(REPO, "public", "js", "mentor-home.js"), "utf8");
  ok(ui.includes("startLesson") && ui.includes("lessonSources"), "editable explicit-start UI wired");
  ok(ui.includes("sentence_count") && ui.includes("range_preset") && ui.includes("aria-pressed"), "transparent source size, range presets and accessible multi-focus UI wired");
  const room = fs.readFileSync(path.join(REPO, "public", "js", "library-ui.js"), "utf8");
  ok(room.includes("COUNT(s.id) AS sentence_count") && room.includes("await loadCorpusIndex()") && room.includes("c.segments"), "personal and lazy corpus source catalogs expose sentence counts");
  ok(ui.includes('e.type==="source_reading"?"reading":e.type'), "draft exercise types render as localized user labels");
  ok(learnerLog.validateLearnerEvent({ id: "lb-ux", type: "agent_ux", created_at_client: new Date().toISOString(),
    payload: { feature: "lesson_builder", action: "offered" } }, Date.now()).ok, "content-free lesson UX telemetry allowlisted");
  const html = fs.readFileSync(path.join(REPO, "public", "library.html"), "utf8");
  ok(html.includes("@media (max-width: 480px)") && html.includes("mentor-lb-grid") && html.includes("mentor-lb-focus"), "mobile 380px single-column and multi-focus controls present");
  const sw = fs.readFileSync(path.join(REPO, "public", "sw.js"), "utf8");
  ok(sw.includes("deployment version not converged") && sw.includes("sw_install="), "service worker refuses mixed-version rolling-deploy precache");

  if (failures.length) { console.error(`[lesson-builder] FAIL ${checks - failures.length}/${checks}`); failures.forEach((x) => console.error(" - " + x)); process.exit(1); }
  console.log(`[lesson-builder] PASS ${checks}/${checks}`);
})().catch((e) => { console.error(e && e.message || e); process.exit(1); });
