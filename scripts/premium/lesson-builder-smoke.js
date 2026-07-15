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
  results: words.map((w, i) => ({ surface: w.surface, item_key: "item:" + i, keyable: true, confidence: .9, ambiguous: false,
    body: { binyan: i === 3 ? "paal" : null } })) });
keying.glossForItemKey = async (k) => ({ meaning: "meaning " + k });
// Production learnerGraphRepo returns an item-keyed object, not an array. Keep
// this fixture contract-realistic so the production .map regression cannot recur.
graph.getKnownWords = async () => ({ "item:0": { status: "known" } });
graph.getDue = async () => [{ item_key: "item:1" }];
graph.getWeakWords = async () => [{ item_key: "item:2" }];
agentRepo.usageToday = async () => ({ user_llm_calls: 1 });
let llmCalls = 0;
llmGate.gatedGenerate = async () => { llmCalls++; return ({ phase: "ok", key_source: "agent", out: { provider: "mock", model: "fixture", text: JSON.stringify({
  objective: "Grounded objective", sections: [{ title: "Read", body: "Read closely", source_ids: ["source-1"], anchor_ids: ["source-1-anchor-1"] }],
  exercises: [{ type: "source_reading", purpose: "Identify the claim and evidence", instruction: "Read the cited sentences and separate the main claim from two supporting details.", source_ids: ["source-1", "source-2"], anchor_ids: ["source-1-anchor-1", "source-2-anchor-1"], expected_answer: null, hints: ["Look for repeated ideas"], success_criteria: ["One claim", "Two cited details"] },
    { type: "vocabulary", purpose: "Use verified vocabulary in context", instruction: "Use two supplied target words in new sentences that preserve their contextual meanings.", source_ids: ["source-1", "source-2"], anchor_ids: ["source-1-anchor-1", "source-2-anchor-1"], expected_answer: "Two original sentences", hints: [], success_criteria: ["Meaning preserved", "One target per sentence"] }],
}) } }); };

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
  ok(!LB.vocabularyEligible({ surface: "כָּל", keyable: true, confidence: .99, ambiguous: false }, { meaning: "all" }) &&
    !LB.vocabularyEligible({ surface: "מילה", keyable: true, confidence: .5, ambiguous: false }, { meaning: "word" }) &&
    LB.vocabularyEligible({ surface: "לִלְמֹד", keyable: true, confidence: .9, ambiguous: false }, { meaning: "учиться" }),
    "vocabulary eligibility excludes function words and low-confidence facts");
  ok(JSON.stringify(LB.validateShadow({ score: 87.6, failure_codes: ["GENERIC_TASK", "INVENTED_CODE", "GENERIC_TASK"] })) ===
    JSON.stringify({ score: 88, failure_codes: ["GENERIC_TASK"] }), "shadow critic output is content-free and allowlist constrained");
  const gold = JSON.parse(fs.readFileSync(path.join(REPO, "scripts", "premium", "fixtures", "lesson-builder-lb1", "golden-cases.json"), "utf8"));
  for (const c of gold.cases) {
    const got = LB.validateComposition(c.composition, gold.source_ids, 7, c.focuses, gold.anchor_ids);
    ok(!!got === c.expect_valid, "independent quality fixture: " + c.id);
  }
  const longRows = Array.from({ length: 146 }, (_, i) => ({ order_index: i, he: heb, ru: "translation " + i }));
  const longReq = { ...request(), sources: [{ ...request().sources[0], row_count: 146 }], lessonMode: "overview" };
  ok(LB.normalizeRequest(longReq).ok && LB.normalizeRequest(longReq).request.sources[0].row_count === 146,
    "full 146-row learner scope is accepted without the LB0 40-row clamp");
  const mapped = LB.prepareSourceMap({ id: "source-1", rows: longRows }, 4000);
  ok(mapped.chunks.length === 8 && mapped.anchorWindows.length === 3 && mapped.promptRows.length < 146 && mapped.promptChars <= 4000,
    "long scope maps completely while provider context stays bounded");
  ok(LB.prepareSourceMap({ id: "source-1", rows: [{ order_index: 0, he: heb.repeat(100), ru: null }] }, 50).anchorWindows.length === 0,
    "an individual source row that cannot fit the provider budget fails closed");
  const seriesRows = Array.from({ length: 201 }, (_, i) => ({ order_index: i, he: heb, ru: null }));
  const seriesMapped = LB.prepareSourceMap({ id: "source-1", rows: seriesRows }, 4000);
  ok(LB.resolvedLessonMode("auto", [{ rows: seriesRows, sourceMap: seriesMapped }]) === "series" &&
    LB.resolvedLessonMode("auto", [{ rows: longRows, sourceMap: mapped }]) === "overview",
    "auto mode selects a series above 200 rows and an overview for a long bounded text");
  const mappedFallback = LB.fallbackComposition({ goal: "Read the whole selection", explanationLanguage: "en", focuses: ["reading"] },
    [{ id: "source-1", ref: { title: "Long" }, sourceMap: mapped }], { candidate_vocabulary: [] });
  ok(mappedFallback.sections[0].anchor_ids.length === 3 && /sentences 1.?12/i.test(mappedFallback.exercises[0].instruction) &&
    /sentences 135.?146/i.test(mappedFallback.exercises[0].instruction),
    "deterministic overview remains grounded in start, middle and end anchor windows");
  ok(LB.normalizeRequest({ ...request(), goalId: undefined, goal: "Legacy goal", focuses: undefined, focus: "reading" }).ok, "cached LB0 request remains backward compatible");

  const built = await LB.build({ userId: "u1" }, request());
  ok(built.ok && built.draft.status === "draft", "typed draft built");
  ok(built.draft.schemaVersion === 2 && built.draft.policyVersion === "lesson-builder-lb1-v2", "LB1 typed artifact versions frozen");
  ok(built.draft.sourceRefs.length === 2 && built.draft.sourceRefs[1].license === "public-domain", "mixed approved sources preserve provenance");
  ok(!JSON.stringify(built.draft.sourceRefs).includes(heb.trim()), "source bodies are not copied into artifact refs");
  ok(!JSON.stringify(built.draft).includes(heb.trim()), "full selected source body is absent from ephemeral artifact");
  ok(built.draft.candidateVocabulary.length <= 5, "20-minute candidate cap enforced");
  ok(typeof built.draft.coverage === "number" && Array.isArray(built.draft.availableReviewTargets), "coverage and review targets remain typed deterministic facts");
  ok(built.draft.sections[0].source_ids[0] === "source-1", "LLM sections remain source-linked");
  ok(built.draft.exercises.some((e) => e.type === "source_reading"), "reading action required");
  ok(built.draft.exercises.some((e) => e.type === "vocabulary") && built.draft.request.focuses.length === 2, "each selected focus is represented and preserved");
  ok(built.draft.quality.premium_ready === true && built.draft.exercises.every((e) => e.anchor_ids.length && e.success_criteria.length),
    "premium draft requires exact anchors and success criteria on every exercise");
  ok(!("review_log" in built.draft) && !("mastery" in built.draft), "no learner-truth fields");
  ok(Date.parse(built.draft.expiresAt) - Date.parse(built.draft.createdAt) === 86400000, "24-hour TTL exact");
  ok(!!Artifact.validate(built.draft), "shared client artifact schema accepts server output");
  ok(!!Artifact.validate({ ...built.draft, schemaVersion: 1, policyVersion: "lesson-builder-lb0-v1" }),
    "session adapter keeps previously saved LB0 drafts readable during the LB1 transition");

  const beforeGrammar = llmCalls;
  const grammarReq = { ...request(), sources: [request().sources[0]], focuses: ["reading", "grammar"] };
  const grammarNeedsTarget = await LB.build({ userId: "u1" }, grammarReq);
  ok(grammarNeedsTarget.error === "GRAMMAR_TARGET_REQUIRED" && grammarNeedsTarget.candidate_constructs[0].id === "construct:hebrew.binyan.paal.recognition",
    "grammar focus returns only resolver-supported user-selectable constructions");
  ok(llmCalls === beforeGrammar, "grammar discovery spends no LLM call before learner target selection");

  const personalBeforeLong = personal.getLessonWindow;
  personal.getLessonWindow = async () => ({ ok: true, anchor: { start_order_index: 0, row_count: 146 }, title: "Long text",
    rows_total: 146, rows: longRows, artifact_updated_at: "2026-07-15T00:00:00.000Z" });
  const longBuilt = await LB.build({ userId: "u1" }, longReq);
  ok(longBuilt.ok && longBuilt.draft.sourceRefs[0].row_count === 146 && longBuilt.draft.mode === "overview",
    "146-row scope builds as an overview without lying about selected row count");
  ok(longBuilt.draft.sourceMap[0].scope_row_count === 146 && longBuilt.draft.sourceMap[0].anchor_windows.length === 3,
    "draft retains a content-free complete scope map and exact bounded anchor locators");
  ok(LB.seriesPlan([{ id: "source-1", sourceMap: mapped }], 20).length === 8,
    "series plan covers every deterministic chunk for lazy lesson building");
  personal.getLessonWindow = personalBeforeLong;

  const mem = new Map(); const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = Artifact.createSessionStore(storage, () => Date.parse(built.draft.createdAt) + 1000);
  ok(store.kind === "session-ttl" && store.save(built.draft).ok, "ephemeral adapter stores valid draft");
  ok(store.load().status === "draft", "stored draft reloads");
  ok(store.activate(built.draft).draft.status === "active", "explicit activation changes only artifact status");
  store.discard(); ok(store.load() === null, "explicit discard clears session artifact");
  const expiredStore = Artifact.createSessionStore(storage, () => Date.parse(built.draft.expiresAt) + 1);
  storage.setItem(Artifact.KEY, JSON.stringify(built.draft)); ok(expiredStore.load() === null, "expired draft purged on read");

  let repairStep = 0;
  llmGate.gatedGenerate = async () => { repairStep++; return repairStep === 1
    ? { phase: "ok", out: { provider: "mock", model: "bad", text: JSON.stringify({ objective: "Incomplete", sections: [], exercises: [] }) } }
    : { phase: "ok", key_source: "agent", out: { provider: "mock", model: "repaired", text: JSON.stringify({ objective: "Repaired objective",
      sections: [{ title: "Anchored reading", body: "Work from the cited source window.", source_ids: ["source-1"], anchor_ids: ["source-1-anchor-1"] }],
      exercises: [{ type: "source_reading", purpose: "Identify the central claim", instruction: "Read the cited sentences and identify one claim with two supporting details.", source_ids: ["source-1"], anchor_ids: ["source-1-anchor-1"], expected_answer: null, hints: [], success_criteria: ["One claim", "Two details"] },
        { type: "vocabulary", purpose: "Use verified words", instruction: "Use the supplied verified vocabulary in two new contextually accurate sentences.", source_ids: ["source-1"], anchor_ids: ["source-1-anchor-1"], expected_answer: "Two sentences", hints: [], success_criteria: ["Meanings preserved"] }] }) } }; };
  const repairedDraft = await LB.build({ userId: "u1" }, { ...request(), sources: [request().sources[0]] });
  ok(repairedDraft.ok && repairedDraft.repair_used === true && repairedDraft.draft.quality.premium_ready === true,
    "one bounded same-route repair can recover an invalid first candidate through the same quality gate");

  llmGate.gatedGenerate = async () => ({ phase: "ok", out: { provider: "mock", model: "bad", text: JSON.stringify({ objective: "x",
    sections: [{ title: "Injected", body: "bad", source_ids: ["foreign-source"] }], exercises: [] }) } });
  const fallback = await LB.build({ userId: "u1" }, { ...request(), sources: [request().sources[0]] });
  ok(fallback.ok && fallback.degraded_reason === "LLM_OUTPUT_INVALID", "invalid/injected LLM source falls back honestly");
  ok(fallback.draft.exercises[0].type === "source_reading", "fallback remains useful and reading-first");
  ok(fallback.draft.quality.tier === "basic_plan" && fallback.draft.quality.premium_ready === false,
    "deterministic degradation cannot masquerade as a premium lesson");
  ok(/sentences 1.?12/i.test(fallback.draft.exercises[0].instruction), "basic plan is tied to an exact source range instead of a generic reading instruction");

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
  ok(server.includes("shellIntegrity: shellIntegrity()") && server.includes("/i18n/locales/ru.js"),
    "client config publishes critical shell hashes for rolling-deploy coherence");
  const ui = fs.readFileSync(path.join(REPO, "public", "js", "mentor-home.js"), "utf8");
  ok(ui.includes("startLesson") && ui.includes("lessonSources"), "editable explicit-start UI wired");
  ok(ui.includes("sentence_count") && ui.includes("range_preset") && ui.includes("aria-pressed"), "transparent source size, range presets and accessible multi-focus UI wired");
  ok(!ui.includes("if(to-from+1>40)") && ui.includes('lessonMode:lessonMode.value'), "UI preserves whole ranges and offers overview/series mode");
  ok(ui.includes('new Set(["reading","vocabulary"])'), "default focuses match the default active-vocabulary goal");
  const room = fs.readFileSync(path.join(REPO, "public", "js", "library-ui.js"), "utf8");
  ok(room.includes("COUNT(s.id) AS sentence_count") && room.includes("await loadCorpusIndex()") && room.includes("c.segments"), "personal and lazy corpus source catalogs expose sentence counts");
  ok(room.includes("items: all.slice(offset, offset + limit)") && room.includes("total: all.length") && !room.includes("out.length >= 30"),
    "catalog filters before paging and exposes the full eligible result count");
  ok(room.includes("returnToLesson: true") && room.includes("if (returnRoute === 'lesson-builder') openLessonStudio()"),
    "lesson anchor drill-down closes the loop back from reader to the active lesson");
  ok(ui.includes('e.type==="source_reading"?"reading":e.type'), "draft exercise types render as localized user labels");
  ok(ui.includes("basicPlanRejected") && ui.includes('qualityReason==="LLM_OUTPUT_INVALID"'),
    "degraded UI distinguishes a rejected AI draft from AI not being connected");
  ok(learnerLog.validateLearnerEvent({ id: "lb-ux", type: "agent_ux", created_at_client: new Date().toISOString(),
    payload: { feature: "lesson_builder", action: "offered" } }, Date.now()).ok, "content-free lesson UX telemetry allowlisted");
  const html = fs.readFileSync(path.join(REPO, "public", "library.html"), "utf8");
  ok(html.includes("@media (max-width: 480px)") && html.includes("mentor-lb-grid") && html.includes("mentor-lb-focus"), "mobile 380px single-column and multi-focus controls present");
  ok(html.includes('id="roomLessonView"') && html.includes("mentor-lb-workspace") && html.includes("#roomLessonView[hidden]"),
    "same-document Lesson Studio route and two-pane workspace are wired with a hidden guard");
  const sw = fs.readFileSync(path.join(REPO, "public", "sw.js"), "utf8");
  ok(sw.includes("deployment version not converged") && sw.includes("sw_install="), "service worker refuses mixed-version rolling-deploy precache");
  ok(sw.includes("shell integrity mismatch") && sw.includes('crypto.subtle.digest("SHA-256"'),
    "service worker rejects a byte-mixed critical shell cohort");

  if (failures.length) { console.error(`[lesson-builder] FAIL ${checks - failures.length}/${checks}`); failures.forEach((x) => console.error(" - " + x)); process.exit(1); }
  console.log(`[lesson-builder] PASS ${checks}/${checks}`);
})().catch((e) => { console.error(e && e.message || e); process.exit(1); });
