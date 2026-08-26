"use strict";

const { CAPABILITIES, CAPABILITY_VERSION } = require("./capabilities");

const REVIEW_ACTIONS = new Set(["fresh_struggles", "production_gap", "due"]);
const KNOWN_SCOPES = new Set(Object.values(CAPABILITIES).map((entry) => entry.scope));
// get_agent_connection has a cached, closed 15-scope output schema. Never add
// H2+ scopes to that old payload; doing so breaks clients with the cached enum.
const CONNECTION_REPORTABLE_SCOPES = new Set([
  "learning.brief.read", "review.summary.read", "reading.public.search",
  "explanations.metadata.read", "agent.connection.read", "review.items.read",
  "profile.read", "explanations.body.read", "reading.corpus.read",
  "reading.handoff.create", "intent.propose", "review.activity.read",
  "review.handoff.create", "personal.texts.metadata.read", "personal.texts.content.read",
]);

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function fixedNow(now) {
  const value = Number(now());
  if (!Number.isFinite(value)) fail("AA_PRODUCTION_HANDLER_CLOCK_INVALID");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail("AA_PRODUCTION_HANDLER_CLOCK_INVALID");
  return Object.freeze({ ms: value, iso: date.toISOString() });
}
function plusMs(value, delta) { return new Date(value + delta).toISOString(); }
function validateAggregate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("AA_REVIEW_AGGREGATE_INVALID");
  const keys = ["scheduled_total", "due_total", "urgent_total"];
  if (Object.keys(value).sort().join(",") !== keys.sort().join(",")) fail("AA_REVIEW_AGGREGATE_INVALID");
  for (const key of keys) if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 100000) fail("AA_REVIEW_AGGREGATE_OVERFLOW");
  if (value.urgent_total > value.due_total || value.due_total > value.scheduled_total) fail("AA_REVIEW_AGGREGATE_INVALID");
  return value;
}
function estimatedMinutes(due) { return Math.min(120, Math.ceil(due * 45 / 60)); }
function unfinishedAction(plan) {
  if (plan == null) return "NONE";
  if (!plan || typeof plan !== "object" || Array.isArray(plan) || Object.keys(plan).length !== 1 || typeof plan.section_id !== "string") fail("AA_PLAN_METADATA_INVALID");
  if (REVIEW_ACTIONS.has(plan.section_id)) return "REVIEW_AVAILABLE";
  if (plan.section_id === "read") return "READING_AVAILABLE";
  fail("AA_PLAN_METADATA_ACTION_UNKNOWN");
}

function struggleBand(lapses) {
  const n = Number(lapses) || 0;
  if (n >= 3) return "high";
  if (n >= 1) return "some";
  return "none";
}
function dueDay(due) {
  const s = String(due || "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
// Truncate to at most maxBytes UTF-8 bytes on a char boundary. The output
// validators cap by BYTES while Hebrew/Cyrillic are multi-byte, so char-based
// slicing can overshoot and trip OUTPUT_SCHEMA_INVALID.
function byteSlice(value, maxBytes) {
  let s = String(value == null ? "" : value);
  while (Buffer.byteLength(s, "utf8") > maxBytes) s = s.slice(0, -1);
  return s;
}
// Opaque offset cursor for due-item pagination. The cursor is DECODED and
// validated in the input validator (contracts.validateDueItemsInput), so the
// handler only encodes the next page and reads the pre-validated offset.
const DUE_SCAN_MAX = 500;
function encodeDueCursor(offset) { return Buffer.from(`o${offset}`, "utf8").toString("base64url"); }

function createProductionHandlers(options = {}) {
  const learnerRepo = options.learnerGraphRepo;
  const agentRepo = options.agentRepo;
  const oauthRepo = options.oauthRepo;
  const publicCatalog = options.publicCatalog;
  const keyingService = options.keyingService; // AA3: derives content from the shared public lexicon
  const connectionPersistence = options.connectionPersistence; // AA3: control-plane window state
  const corpusRepo = options.corpusSentenceRepo; // AA3 commit 3b: public-domain corpus reads
  const handoffRepo = options.handoffRepo; // AA3 commit 3b: first-party reading handoff mint
  const proposalsRepo = options.agentProposalsRepo; // AA3 commit 3c: PENDING proposals (owner confirms)
  const personalTextsRepo = options.personalTextsRepo; // S1: sidecar-мета личных текстов (list — БЕЗ payload)
  const personalTextsContentRepo = options.personalTextsContentRepo; // S2: aa-экстрактор окна (agentSentenceRepo)
  const textGrantsRepo = options.textGrantsRepo; // S2: standing-грант владельца (agent_text_grants)
  const morphologyResolver = options.wordMorphologyResolver || require("./wordMorphologyResolver");
  const coverageResolver = options.textCoverageResolver || require("./textCoverageResolver");
  const groupCorpusRepo = options.groupCorpusRepo; // restricted shared corpus; membership checked inside repo
  const weeklyGoalsRepo = options.weeklyGoalsRepo || require("../../db/weeklyGoalsRepo");
  const unavailablePublicationRead = async () => fail("AA_PUBLICATION_ACCESS_UNAVAILABLE");
  const publicationReadService = options.publicPublicationReadService || Object.freeze({
    listCorpora: unavailablePublicationRead, searchItems: unavailablePublicationRead, getItem: unavailablePublicationRead,
    listResources: unavailablePublicationRead, readTextWindow: unavailablePublicationRead,
  });
  const now = options.now || Date.now;
  const principalAccessExpiresAt = options.principalAccessExpiresAt;
  if (!learnerRepo || typeof learnerRepo.getAgentAccessReviewAggregates !== "function" || typeof learnerRepo.getDue !== "function" || typeof learnerRepo.getActivityDelta !== "function"
    || !agentRepo || typeof agentRepo.getLatestOpenPlanAction !== "function" || typeof agentRepo.listExplanationMetadata !== "function" || typeof agentRepo.getProfile !== "function" || typeof agentRepo.getExplanationById !== "function"
    || !oauthRepo || typeof oauthRepo.loadConnection !== "function" || typeof oauthRepo.listConnectionsForUser !== "function"
    || !publicCatalog || typeof publicCatalog.isReadable !== "function" || typeof publicCatalog.search !== "function"
    || !keyingService || typeof keyingService.displayForItemKey !== "function" || typeof keyingService.glossForItemKey !== "function"
    || !corpusRepo || typeof corpusRepo.listWorkTexts !== "function" || typeof corpusRepo.getCorpusLessonWindow !== "function"
    || !handoffRepo || typeof handoffRepo.mint !== "function" || typeof handoffRepo.countActive !== "function"
    || !proposalsRepo || typeof proposalsRepo.create !== "function"
    || !personalTextsRepo || typeof personalTextsRepo.hasConsentVersioned !== "function" || typeof personalTextsRepo.listWithMeta !== "function"
    || !personalTextsContentRepo || typeof personalTextsContentRepo.aaGetPersonalTextWindow !== "function"
    || !textGrantsRepo || typeof textGrantsRepo.activeGrant !== "function"
    || !morphologyResolver || typeof morphologyResolver.resolveWordMorphology !== "function"
    || !coverageResolver || typeof coverageResolver.calculate !== "function"
    || !weeklyGoalsRepo || typeof weeklyGoalsRepo.getCurrent !== "function"
    || !publicationReadService || typeof publicationReadService.listCorpora !== "function" || typeof publicationReadService.searchItems !== "function"
    || typeof publicationReadService.getItem !== "function" || typeof publicationReadService.listResources !== "function" || typeof publicationReadService.readTextWindow !== "function"
    || typeof connectionPersistence !== "function"
    || typeof now !== "function" || typeof principalAccessExpiresAt !== "function") fail("AA_PRODUCTION_HANDLER_DEPENDENCY_INVALID");

  async function get_learning_brief(context) {
    const clock = fixedNow(now);
    const aggregate = validateAggregate(await learnerRepo.getAgentAccessReviewAggregates(context.user_id, { nowMs: clock.ms }));
    const plan = await agentRepo.getLatestOpenPlanAction(context.user_id);
    let priority = "REVIEW_DUE";
    if (aggregate.due_total === 0) priority = publicCatalog.isReadable() ? "READING_AVAILABLE" : "NO_CURRENT_ACTION";
    return Object.freeze({
      schema_version: "aa.learning_brief.1.0.0",
      due_total: aggregate.due_total,
      urgent_total: aggregate.urgent_total,
      scheduled_total: aggregate.scheduled_total,
      estimated_minutes: estimatedMinutes(aggregate.due_total),
      priority_code: priority,
      unfinished_action_code: unfinishedAction(plan),
      generated_at: clock.iso,
      expires_at: plusMs(clock.ms, 5 * 60 * 1000),
    });
  }

  async function get_review_summary(context) {
    const clock = fixedNow(now);
    const aggregate = validateAggregate(await learnerRepo.getAgentAccessReviewAggregates(context.user_id, { nowMs: clock.ms }));
    return Object.freeze({
      schema_version: "aa.review_summary.1.0.0",
      due_total: aggregate.due_total,
      urgent_total: aggregate.urgent_total,
      estimated_minutes: estimatedMinutes(aggregate.due_total),
      handoff_eligible: false,
      handoff_scope_available: false,
      generated_at: clock.iso,
      expires_at: plusMs(clock.ms, 2 * 60 * 1000),
    });
  }

  async function search_public_reading_catalog(_context, args) {
    const clock = fixedNow(now);
    const page = publicCatalog.search(args);
    return Object.freeze({
      schema_version: "aa.public_reading_search.1.0.0",
      catalog_version: page.catalog_version,
      results: page.results,
      next_cursor: page.next_cursor,
      generated_at: clock.iso,
    });
  }

  async function get_recent_explanation_metadata(context, args) {
    const clock = fixedNow(now);
    const page = await agentRepo.listExplanationMetadata(context.user_id, args);
    if (!page || typeof page !== "object" || !Array.isArray(page.items) || !(page.next_before == null || typeof page.next_before === "string")) {
      fail("AA_EXPLANATION_METADATA_INVALID");
    }
    return Object.freeze({
      schema_version: "aa.explanation_metadata.1.0.0",
      items: page.items,
      next_before: page.next_before,
      generated_at: clock.iso,
    });
  }

  // AA3: due study words with meaning + a COARSE struggle band. Deliberately
  // omits the acceptance set (alts), the expected answer, and the raw FSRS
  // floats — grading stays deterministic and first-party in LinguistPro.
  async function get_due_review_items(context, args) {
    const clock = fixedNow(now);
    const limit = Math.max(1, Math.min(100, Number(args && args.limit) || 100));
    const offset = Number(args && args.cursor_offset) || 0;
    const [aggregate, due] = await Promise.all([
      learnerRepo.getAgentAccessReviewAggregates(context.user_id, { nowMs: clock.ms }).then(validateAggregate),
      learnerRepo.getDue(context.user_id, { nowMs: clock.ms, limit: DUE_SCAN_MAX }),
    ]);
    // Deterministic order (most overdue first, then item_key) so offset paging is stable within a snapshot.
    const all = (Array.isArray(due) ? due.slice(0, DUE_SCAN_MAX) : [])
      .slice().sort((a, b) => String(a.due).localeCompare(String(b.due)) || String(a.item_key).localeCompare(String(b.item_key)));
    const page = all.slice(offset, offset + limit);
    const items = [];
    for (const row of page) {
      let display = byteSlice(row.item_key, 64);
      let gloss = null;
      try { const d = await keyingService.displayForItemKey(row.item_key); if (d) display = byteSlice(d, 64); } catch (_) {}
      try { const g = await keyingService.glossForItemKey(row.item_key); gloss = g && g.gloss ? byteSlice(g.gloss, 120) : null; } catch (_) { gloss = null; }
      const day = dueDay(row.due) || clock.iso.slice(0, 10);
      items.push(Object.freeze({ display: display || "?", gloss, struggle: struggleBand(row.lapses), due_day: day, content_available: gloss !== null }));
    }
    const nextOffset = offset + page.length;
    return Object.freeze({
      schema_version: "aa.due_review_items.1.0.0",
      items: Object.freeze(items),
      due_total: aggregate.due_total,
      next_cursor: nextOffset < all.length ? encodeDueCursor(nextOffset) : null,
      generated_at: clock.iso,
    });
  }

  // AA3: read ONE past explanation's body by id. Purge-aware; never re-exposes
  // the quoted source sentence (facts_used) — only the mentor's own text/lines.
  async function get_explanation_body(context, args) {
    const clock = fixedNow(now);
    const row = await agentRepo.getExplanationById(context.user_id, args.explanation_id);
    if (!row || String(row.id) !== String(args.explanation_id)) fail("AA_EXPLANATION_NOT_FOUND");
    let body;
    try { body = JSON.parse(String(row.body_json || "")); } catch (_) { fail("AA_EXPLANATION_BODY_INVALID"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) fail("AA_EXPLANATION_BODY_INVALID");
    const createdAt = String(row.created_at || clock.iso);
    const base = { schema_version: "aa.explanation_body.1.0.0", explanation_id: String(args.explanation_id), created_at: createdAt, generated_at: clock.iso };
    if (body.purge_reason !== undefined && body.purge_reason !== null) {
      return Object.freeze({ ...base, kind: null, purge_state: "PURGED", language: null, text: null, lines: null });
    }
    const kind = ["sentence", "word", "study_summary", "draft_retell"].includes(body.kind) ? body.kind : "sentence";
    const language = typeof body.language === "string" ? body.language.slice(0, 8) : null;
    let text = null, lines = null;
    if (kind === "draft_retell") {
      if (Array.isArray(body.lines)) {
        lines = body.lines.slice(0, 8)
          .map((l) => ({ he: byteSlice((l && l.he) || "", 500), ru: (l && l.ru != null) ? byteSlice(l.ru, 500) : null }))
          .filter((l) => l.he);
      }
      if (!lines || !lines.length) lines = null;
    } else {
      text = typeof body.text === "string" ? byteSlice(body.text, 6000) : null;
    }
    return Object.freeze({ ...base, kind, purge_state: "AVAILABLE", language, text, lines: lines === null ? null : Object.freeze(lines.map((l) => Object.freeze(l))) });
  }

  // AA3 commit 3b: bounded public-domain corpus reading. Corpus-only by
  // construction (listWorkTexts validates the work_id against the works volume).
  async function get_reading_content(context, args) {
    const clock = fixedNow(now);
    const listed = corpusRepo.listWorkTexts(args.work_id);
    if (!listed || !listed.ok) fail("AA_CORPUS_WORK_NOT_FOUND");
    const availableTextKeys = listed.texts.map((t) => t.text_key).filter(Boolean).slice(0, 20);
    const text = args.text_key ? listed.texts.find((t) => t.text_key === args.text_key) : listed.texts[0];
    if (!text) fail("AA_CORPUS_TEXT_NOT_FOUND");
    const start = args.start != null ? args.start : Number(text.first_order_index) || 0;
    const rows = Math.max(1, Math.min(20, Number(args.rows) || 5));
    const win = await corpusRepo.getCorpusLessonWindow({ corpus: "benyehuda", work_id: args.work_id, text_key: text.text_key, start_order_index: start, row_count: rows });
    if (!win || !win.ok) fail("AA_CORPUS_WINDOW_UNAVAILABLE");
    const outRows = (Array.isArray(win.rows) ? win.rows : []).slice(0, 20)
      .map((r) => ({ order_index: Number(r.order_index), he: byteSlice(r.he, 400), ru: r.ru != null && r.ru !== "" ? byteSlice(r.ru, 400) : null }))
      .filter((r) => r.he && Number.isInteger(r.order_index));
    const eraRaw = String((win.work && win.work.era) || text.era || "").toUpperCase();
    const ERA_OK = new Set(["BIBLICAL", "RABBINIC", "MEDIEVAL", "REVIVAL", "MODERN", "CONTEMPORARY", "UNKNOWN"]);
    return Object.freeze({
      schema_version: "aa.reading_content.1.0.0",
      work: Object.freeze({
        title: ((win.work && win.work.title) || text.title) ? byteSlice((win.work && win.work.title) || text.title, 200) : null,
        author: ((win.work && win.work.author) || text.author) ? byteSlice((win.work && win.work.author) || text.author, 200) : null,
        era: ERA_OK.has(eraRaw) ? eraRaw : null,
        license: "public-domain",
      }),
      anchor: Object.freeze({ work_id: String(args.work_id), text_key: text.text_key, start_order_index: outRows.length ? outRows[0].order_index : start, row_count: outRows.length }),
      rows: Object.freeze(outRows.map((r) => Object.freeze(r))),
      available_text_keys: Object.freeze(availableTextKeys),
      generated_at: clock.iso,
    });
  }

  // AA3 commit 3b/3c: mint a first-party handoff link to open a CORPUS work in
  // the Reading Room. The agent proposes the link; the OWNER clicks it — the
  // agent never opens content. Corpus-only enforced via listWorkTexts (the
  // server derives text_key; the agent can never address a personal text).
  // Live-token cap bounds table churn beyond the per-tool rate limit (R14-m7).
  async function create_reading_handoff(context, args) {
    const clock = fixedNow(now);
    const listed = corpusRepo.listWorkTexts(args.work_id);
    if (!listed || !listed.ok) fail("AA_CORPUS_WORK_NOT_FOUND");
    const text = args.text_key ? listed.texts.find((t) => t.text_key === args.text_key) : listed.texts[0];
    if (!text) fail("AA_CORPUS_TEXT_NOT_FOUND");
    if ((await handoffRepo.countActive(context.user_id)) >= 20) fail("AA_HANDOFF_ACTIVE_LIMIT");
    const orderIndex = args.order_index != null ? args.order_index : Number(text.first_order_index) || 0;
    const minted = await handoffRepo.mint(context.user_id, { textKey: text.text_key, orderIndex, action: "open_corpus", workId: String(args.work_id) });
    if (!minted || typeof minted.raw !== "string" || !/^[A-Za-z0-9_-]{16,256}$/.test(minted.raw)) fail("AA_HANDOFF_MINT_FAILED");
    return Object.freeze({
      schema_version: "aa.reading_handoff.1.0.0",
      handoff_url: `https://linguistpro.kolosei.com/library.html?handoff=${minted.raw}`,
      expires_in_ms: Math.max(1, Math.min(3600000, Number(minted.expiresInMs) || 300000)),
      work_id: String(args.work_id), text_key: text.text_key, action: "open_corpus", generated_at: clock.iso,
    });
  }

  // AA3 commit 3c: create a PENDING proposal the OWNER decides in the panel.
  // The agent never executes and never learns confirmation state through this
  // channel (output status is PENDING or, on deny-cooldown, DENIED). For
  // open_reading the work is validated + display_title resolved ONCE here so
  // the owner GET never fans out into disk reads (R14).
  async function propose_action(context, args) {
    const clock = fixedNow(now);
    let displayTitle = null;
    if (args.kind === "open_reading") {
      const listed = corpusRepo.listWorkTexts(args.payload.work_id);
      if (!listed || !listed.ok) fail("AA_PROPOSAL_WORK_NOT_FOUND");
      const text = args.payload.text_key ? listed.texts.find((t) => t.text_key === args.payload.text_key) : listed.texts[0];
      if (!text) fail("AA_PROPOSAL_TEXT_NOT_FOUND");
      displayTitle = byteSlice([text.title, text.author].filter(Boolean).join(" — "), 200) || null;
    }
    const created = await proposalsRepo.create(context.user_id, {
      oauthClientId: context.oauth_client_id,
      connectionId: context.connection_id,
      kind: args.kind,
      payload: args.payload,
      displayTitle,
      nowIso: clock.iso,
    });
    if (!created || typeof created.proposal_id !== "string") fail("AA_PROPOSAL_CREATE_FAILED");
    return Object.freeze({
      schema_version: "aa.proposal.1.0.0",
      proposal_id: created.proposal_id,
      kind: args.kind,
      status: created.status === "DENIED" ? "DENIED" : "PENDING",
      expires_at: String(created.expires_at),
      generated_at: clock.iso,
    });
  }

  async function propose_import_text(context, args) {
    const clock = fixedNow(now);
    const duplicateKey = typeof personalTextsRepo.findTextKeyByNormalizedBody === "function"
      ? await personalTextsRepo.findTextKeyByNormalizedBody(context.user_id, args.body_preview) : null;
    const payload = { ...args, duplicate_of_text_key: duplicateKey || null };
    const created = await proposalsRepo.create(context.user_id, { oauthClientId: context.oauth_client_id, connectionId: context.connection_id, kind: "import_text", payload, displayTitle: byteSlice(args.source.title, 200), nowIso: clock.iso });
    return Object.freeze({ schema_version: "aa.propose_import_text.1.0.0", proposal_id: created.proposal_id,
      status: created.reused || duplicateKey ? "DUPLICATE" : "PENDING", ...(duplicateKey ? { duplicate_of_text_key: duplicateKey } : {}), generated_at: clock.iso });
  }
  async function propose_track_word(context, args) {
    const clock = fixedNow(now);
    const resolved = await keyingService.resolveWords(args.items.map((x) => ({ surface: x.surface, lemma_hint: x.lemma_hint })));
    const items = args.items.map((x, i) => ({ ...x, item_key: resolved.results[i] && resolved.results[i].keyable ? resolved.results[i].item_key : null }));
    const created = await proposalsRepo.create(context.user_id, { oauthClientId: context.oauth_client_id, connectionId: context.connection_id, kind: "track_word", payload: { items }, displayTitle: byteSlice(items.map((x) => x.surface).join(" · "), 200), nowIso: clock.iso });
    return Object.freeze({ schema_version: "aa.propose_track_word.1.0.0", proposal_id: created.proposal_id, status: created.reused ? "DUPLICATE" : "PENDING",
      per_item: Object.freeze(items.map((x) => Object.freeze({ surface: x.surface, resolution: x.item_key ? "RESOLVED" : "UNRESOLVED_IN_DICTIONARY" }))), generated_at: clock.iso });
  }
  async function propose_goal(context, args) {
    const clock = fixedNow(now);
    const created = await proposalsRepo.create(context.user_id, { oauthClientId: context.oauth_client_id, connectionId: context.connection_id, kind: "goal", payload: args, displayTitle: byteSlice(args.statement, 200), nowIso: clock.iso });
    return Object.freeze({ schema_version: "aa.propose_goal.1.0.0", proposal_id: created.proposal_id, status: created.reused ? "DUPLICATE" : "PENDING", generated_at: clock.iso });
  }
  async function get_current_goal(context) {
    const clock = fixedNow(now); const row = await weeklyGoalsRepo.getCurrent(context.user_id);
    const goal = row ? { statement: row.statement, goal_type: row.goal_type, ...(row.anchor ? { anchor: row.anchor } : {}), week_start: row.week_start, status: row.status, source: row.source } : null;
    return Object.freeze({ schema_version: "aa.current_goal.1.0.0", goal, generated_at: clock.iso });
  }

  // All-Corpora Agent Access R: the handlers deliberately only translate the
  // closed MCP shape. SQL, rights evaluation, edition pinning and URL creation
  // stay inside the publication read service.
  const publicationArgs = args => ({ corpusSlug: args.corpus_slug, editionId: args.edition_id,
    editionItemId: args.edition_item_id, query: args.query, cursor: args.cursor, limit: args.limit,
    start: args.start, rows: args.rows });
  async function list_published_public_corpora(_context, args) { return publicationReadService.listCorpora(args); }
  async function search_published_public_items(_context, args) { return publicationReadService.searchItems(publicationArgs(args)); }
  async function get_published_public_item(_context, args) { return publicationReadService.getItem(publicationArgs(args)); }
  async function list_published_item_resources(_context, args) { return publicationReadService.listResources(publicationArgs(args)); }
  async function read_published_text_window(_context, args) { return publicationReadService.readTextWindow(publicationArgs(args)); }

  // AA4 slice 4a: pure-activity delta since a timestamp. The 90-day window check
  // lives HERE (contracts are clock-free) and fails with a TYPED client code.
  // Top items are enriched with display/gloss only — no struggle band, no
  // grades, no item_key (the consent excludes claim must stay true).
  const DELTA_WINDOW_MS = 90 * 86400000;
  async function get_progress_delta(context, args) {
    const clock = fixedNow(now);
    const sinceMs = Date.parse(args.since);
    if (!Number.isFinite(sinceMs) || sinceMs > clock.ms || sinceMs < clock.ms - DELTA_WINDOW_MS) fail("AA_ACTIVITY_SINCE_OUT_OF_RANGE");
    const topLimit = Math.max(1, Math.min(20, Number(args.top_limit) || 10));
    const sinceIso = new Date(sinceMs).toISOString();
    const delta = await learnerRepo.getActivityDelta(context.user_id, { sinceIso, nowMs: clock.ms });
    if (!delta || typeof delta !== "object" || !Array.isArray(delta.by_channel) || !Array.isArray(delta.top)) fail("AA_ACTIVITY_DELTA_INVALID");
    const items = [];
    for (const row of delta.top.slice(0, topLimit)) {
      let display = byteSlice(row.item_key, 64);
      let gloss = null;
      try { const d = await keyingService.displayForItemKey(row.item_key); if (d) display = byteSlice(d, 64); } catch (_) {}
      try { const g = await keyingService.glossForItemKey(row.item_key); gloss = g && g.gloss ? byteSlice(g.gloss, 120) : null; } catch (_) { gloss = null; }
      items.push(Object.freeze({ display: display || "?", gloss, times: Math.max(1, Number(row.times) || 1) }));
    }
    return Object.freeze({
      schema_version: "aa.progress_delta.1.0.0",
      since: sinceIso,
      reviews_total: Number(delta.reviews_total) || 0,
      skips_total: Number(delta.skips_total) || 0,
      distinct_items: Number(delta.distinct_items) || 0,
      new_items_scheduled: Number(delta.new_items_scheduled) || 0,
      active_days: Math.min(100, Number(delta.active_days) || 0),
      by_channel: Object.freeze(delta.by_channel.slice(0, 8).map((c) => Object.freeze({ channel: String(c.channel), count: Number(c.count) || 1 }))),
      top_items: Object.freeze(items),
      generated_at: clock.iso,
    });
  }

  // AA4 slice 4b-final: anchor-less «открой мне повторение». Refuses only a
  // truly EMPTY schedule (scheduled==0 && due==0 → typed client fault): with
  // due==0 but scheduled>0 the Room honestly offers ahead-of-schedule training
  // (owner directive 2026-07-11), so the link still helps. Same aggregates fn
  // as get_review_summary — no second truth on the agent surface.
  async function create_review_handoff(context) {
    const clock = fixedNow(now);
    const aggregate = validateAggregate(await learnerRepo.getAgentAccessReviewAggregates(context.user_id, { nowMs: clock.ms }));
    if (aggregate.scheduled_total === 0 && aggregate.due_total === 0) fail("AA_REVIEW_NOTHING_SCHEDULED");
    if ((await handoffRepo.countActive(context.user_id)) >= 20) fail("AA_HANDOFF_ACTIVE_LIMIT");
    const minted = await handoffRepo.mint(context.user_id, { action: "open_review" });
    if (!minted || typeof minted.raw !== "string" || !/^[A-Za-z0-9_-]{16,256}$/.test(minted.raw)) fail("AA_HANDOFF_MINT_FAILED");
    return Object.freeze({
      schema_version: "aa.review_handoff.1.0.0",
      handoff_url: `https://linguistpro.kolosei.com/library.html?handoff=${minted.raw}`,
      expires_in_ms: Math.max(1, Math.min(3600000, Number(minted.expiresInMs) || 300000)),
      action: "open_review",
      generated_at: clock.iso,
    });
  }

  async function get_learner_profile(context) {
    const clock = fixedNow(now);
    const profile = (await agentRepo.getProfile(context.user_id)) || {};
    const mode = ["silent", "coach", "intensive"].includes(profile.mode) ? profile.mode : "silent";
    const language = (String(profile.language || "ru").slice(0, 8)) || "ru";
    let depth = "brief";
    try { const g = profile.goals_json ? JSON.parse(profile.goals_json) : null; if (g && g.depth === "detailed") depth = "detailed"; } catch (_) {}
    return Object.freeze({ schema_version: "aa.learner_profile.1.0.0", mode, language, depth, generated_at: clock.iso });
  }

  async function get_agent_connection(context) {
    const clock = fixedNow(now);
    const [connection, listed] = await Promise.all([
      oauthRepo.loadConnection(context.user_id, context.connection_id),
      oauthRepo.listConnectionsForUser(context.user_id),
    ]);
    if (!connection || connection.connection_id !== context.connection_id || connection.user_id !== context.user_id
      || connection.oauth_client_id !== context.oauth_client_id || !["ACTIVE", "SCOPE_REDUCED"].includes(connection.status)) {
      fail("AA_CONNECTION_BINDING_MISMATCH");
    }
    const matches = (listed || []).filter((row) => row && row.connection_id === context.connection_id);
    if (matches.length !== 1 || typeof matches[0].client_display_name !== "string" || !matches[0].client_display_name
      || matches[0].status !== connection.status) fail("AA_CONNECTION_BINDING_MISMATCH");
    const activeFromConnection = (connection.grants || []).filter((grant) => grant && grant.status === "ACTIVE").map((grant) => String(grant.scope)).sort();
    const activeFromList = (matches[0].grants || []).filter((grant) => grant && grant.status === "ACTIVE").map((grant) => String(grant.scope)).sort();
    if (activeFromConnection.some((scope) => !KNOWN_SCOPES.has(scope)) || activeFromList.some((scope) => !KNOWN_SCOPES.has(scope))
      || activeFromConnection.length !== new Set(activeFromConnection).size || activeFromConnection.join("\n") !== activeFromList.join("\n")) {
      fail("AA_CONNECTION_GRANTS_INVALID");
    }
    const accessExpiresAt = principalAccessExpiresAt(context);
    const expiry = new Date(String(accessExpiresAt));
    if (!Number.isFinite(expiry.getTime()) || expiry.toISOString() !== String(accessExpiresAt) || expiry.getTime() <= clock.ms) fail("AA_CONNECTION_EXPIRY_INVALID");
    if (connection.capability_version !== CAPABILITY_VERSION) fail("AA_CONNECTION_CAPABILITY_INVALID");
    return Object.freeze({
      schema_version: "aa.connection.1.0.0",
      connection_id: context.connection_id,
      oauth_client_id: context.oauth_client_id,
      client_display_name: matches[0].client_display_name,
      connection_status: connection.status,
      granted_scopes: Object.freeze(activeFromConnection.filter((scope) => CONNECTION_REPORTABLE_SCOPES.has(scope))),
      access_expires_at: String(accessExpiresAt),
      consent_version: connection.consent_version,
      capability_version: connection.capability_version,
      downstream_retention_notice: "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO",
      generated_at: clock.iso,
    });
  }

  // AA3: separate additive tool so get_agent_connection's schema stays stable.
  async function get_access_window(context) {
    const clock = fixedNow(now);
    const accessExpiresAt = principalAccessExpiresAt(context);
    const expiry = new Date(String(accessExpiresAt));
    if (!Number.isFinite(expiry.getTime()) || expiry.toISOString() !== String(accessExpiresAt) || expiry.getTime() <= clock.ms) fail("AA_ACCESS_WINDOW_EXPIRY_INVALID");
    const persistence = await connectionPersistence();
    const lifetime = persistence && ["PERSISTENT_WINDOW", "TIMED_WINDOW", "TOKEN_ONLY"].includes(persistence.access_lifetime) ? persistence.access_lifetime : "TOKEN_ONLY";
    let windowExpiresAt = null;
    if (lifetime === "TIMED_WINDOW") {
      const w = new Date(String(persistence.window_expires_at));
      if (!Number.isFinite(w.getTime()) || w.toISOString() !== String(persistence.window_expires_at)) fail("AA_ACCESS_WINDOW_INVALID");
      windowExpiresAt = w.toISOString();
    }
    return Object.freeze({
      schema_version: "aa.access_window.1.0.0",
      access_lifetime: lifetime,
      window_expires_at: windowExpiresAt,
      access_expires_at: String(accessExpiresAt),
      generated_at: clock.iso,
    });
  }

  // S1 — каталог личных текстов из sidecar-меты (PERSONAL_TEXTS_S1S2_DESIGN §1.2).
  // Двухслойный fail-closed гейт: (1) первопартийный cloud_texts v2 — ТА ЖЕ функция истины,
  // что у sync-поверхности; RECONSENT отделён от CONSENT (критика R15: «подтверди обновлённую
  // карту» ≠ «включи синк»); (2) AA-scope уже энфорсен service-слоем до входа сюда.
  // payload_json НЕ читается вовсе — только мета; NOT_SYNCED = честный typed-отказ (0 артефактов
  // при живом consent), НЕ пустой список (silent-empty урок).
  async function list_personal_texts(context, args) {
    const clock = fixedNow(now);
    const consent = await personalTextsRepo.hasConsentVersioned(context.user_id);
    if (!consent || consent.ok !== true) {
      fail(consent && consent.reconsent ? "AA_PERSONAL_TEXTS_RECONSENT_REQUIRED" : "AA_PERSONAL_TEXTS_CONSENT_REQUIRED");
    }
    const rows = await personalTextsRepo.listWithMeta(context.user_id);
    if (!Array.isArray(rows) || rows.length === 0) fail("AA_PERSONAL_TEXTS_NOT_SYNCED");
    const offset = args.cursor_offset || 0;
    const limit = args.limit || 50;
    const page = rows.slice(offset, offset + limit);
    const items = page.map((r) => Object.freeze({
      text_key: String(r.artifact_key),
      title: r.title != null ? byteSlice(String(r.title), 512) : null,
      rows_count: (r.rows_count != null && Number.isFinite(Number(r.rows_count))) ? Number(r.rows_count) : null,
      content_updated_at: new Date(String(r.updated_at)).toISOString(),
      replica_ingested_at: new Date(String(r.ingested_at)).toISOString(),
    }));
    const nextOffset = offset + page.length;
    return Object.freeze({
      schema_version: "aa.personal_texts_list.1.0.0",
      items: Object.freeze(items),
      total: Math.min(rows.length, 100000),
      next_cursor: nextOffset < rows.length ? encodeDueCursor(nextOffset) : null,
      authority: "OWNER_DEVICE_CANONICAL",
      generated_at: clock.iso,
    });
  }

  // S2 — окно ТЕЛА личного текста (DESIGN §2.2–§2.3). Трёхслойный fail-closed гейт:
  // (1) cloud_texts v2; (2) AA-scope (service-слой); (3) ЖИВОЙ agent_text_grants владельца —
  // per-connection (грант чужого подключения права этому не даёт, R14 belt) + JOIN на статус
  // подключения внутри activeGrant (status-флип revoke ловится на каждый вызов). Per-row
  // byteSlice + адаптивное сужение окна до капа (гигант-строка не делает окно нечитаемым).
  async function get_personal_text_content(context, args) {
    const clock = fixedNow(now);
    const consent = await personalTextsRepo.hasConsentVersioned(context.user_id);
    if (!consent || consent.ok !== true) {
      fail(consent && consent.reconsent ? "AA_PERSONAL_TEXTS_RECONSENT_REQUIRED" : "AA_PERSONAL_TEXTS_CONSENT_REQUIRED");
    }
    const g = await textGrantsRepo.activeGrant(context.user_id);
    if (g.state !== "ACTIVE") fail(g.state === "EXPIRED" ? "AA_TEXT_ACCESS_EXPIRED" : "AA_TEXT_ACCESS_NOT_GRANTED");
    if (String(g.grant.connection_id) !== String(context.connection_id)) fail("AA_TEXT_ACCESS_NOT_GRANTED");
    const from = args.from || 0;
    const win = await personalTextsContentRepo.aaGetPersonalTextWindow(context.user_id, {
      text_key: args.text_key, from_order_index: from, limit: args.rows || 20,
    });
    if (!win.ok) {
      if (win.error === "TEXT_NOT_IN_CLOUD") fail("AA_PERSONAL_TEXT_NOT_FOUND");
      if (win.error === "ARTIFACT_UNREADABLE") fail("AA_ARTIFACT_UNREADABLE");
      if (win.error === "RECONSENT_REQUIRED") fail("AA_PERSONAL_TEXTS_RECONSENT_REQUIRED");
      if (win.error === "CONSENT_REQUIRED") fail("AA_PERSONAL_TEXTS_CONSENT_REQUIRED");
      fail("AA_PERSONAL_TEXT_NOT_FOUND");
    }
    let rows = win.rows.map((r) => Object.freeze({
      order_index: r.order_index,
      he: byteSlice(r.he, 800),
      ru: r.ru != null ? byteSlice(r.ru, 800) : null,
    }));
    const base = {
      schema_version: "aa.personal_text_content.1.0.0",
      text_key: args.text_key,
      title: win.title != null ? byteSlice(win.title, 512) : null,
      rows_total: Math.min(Number(win.rows_total) || 0, 1000000),
      content_updated_at: new Date(String(win.content_updated_at)).toISOString(),
      replica_ingested_at: new Date(String(win.replica_ingested_at)).toISOString(),
      authority: "OWNER_DEVICE_CANONICAL",
      generated_at: clock.iso,
    };
    const fits = (rs) => Buffer.byteLength(JSON.stringify({ ...base, rows: rs, has_more: true }), "utf8") <= 15800;
    while (rows.length > 1 && !fits(rows)) rows = rows.slice(0, -1);
    return Object.freeze({ ...base, rows: Object.freeze(rows), has_more: from + rows.length < base.rows_total });
  }

  // H2.1 — shipped Pealim data + pure resolver cores only. No user state, DB,
  // network, Dicta request or LLM is reachable from this path.
  async function get_word_morphology(_context, args) {
    const clock = fixedNow(now);
    const resolved = await morphologyResolver.resolveWordMorphology(args);
    if (!resolved || typeof resolved !== "object") fail("AA_MORPHOLOGY_RESOLVER_INVALID");
    return Object.freeze({ ...resolved, generated_at: clock.iso });
  }

  // H2.2 — one tool, two explicit source namespaces. work_id is the complete
  // baked Ben-Yehuda work; text_key is a complete owner-synced personal text and
  // must pass the SAME cloud-consent + live per-connection grant as S2 content.
  // Only aggregates/top lemmas leave this handler; source rows stay internal.
  async function get_text_coverage(context, args) {
    const clock = fixedNow(now);
    const personal = args.target.text_key != null;
    let source;
    if (personal) {
      const consent = await personalTextsRepo.hasConsentVersioned(context.user_id);
      if (!consent || consent.ok !== true) {
        fail(consent && consent.reconsent ? "AA_PERSONAL_TEXTS_RECONSENT_REQUIRED" : "AA_PERSONAL_TEXTS_CONSENT_REQUIRED");
      }
      const g = await textGrantsRepo.activeGrant(context.user_id);
      if (g.state !== "ACTIVE") fail(g.state === "EXPIRED" ? "AA_TEXT_ACCESS_EXPIRED" : "AA_TEXT_ACCESS_NOT_GRANTED");
      if (String(g.grant.connection_id) !== String(context.connection_id)) fail("AA_TEXT_ACCESS_NOT_GRANTED");
      if (typeof personalTextsContentRepo.aaGetPersonalCoverageText !== "function") fail("AA_COVERAGE_SOURCE_UNAVAILABLE");
      source = await personalTextsContentRepo.aaGetPersonalCoverageText(context.user_id, { text_key: args.target.text_key });
      if (!source || !source.ok) {
        if (source && source.error === "TEXT_NOT_IN_CLOUD") fail("AA_PERSONAL_TEXT_NOT_FOUND");
        if (source && source.error === "ARTIFACT_UNREADABLE") fail("AA_ARTIFACT_UNREADABLE");
        if (source && source.error === "RECONSENT_REQUIRED") fail("AA_PERSONAL_TEXTS_RECONSENT_REQUIRED");
        if (source && source.error === "CONSENT_REQUIRED") fail("AA_PERSONAL_TEXTS_CONSENT_REQUIRED");
        fail("AA_PERSONAL_TEXT_NOT_FOUND");
      }
    } else {
      if (typeof corpusRepo.getCorpusCoverageText !== "function") fail("AA_COVERAGE_SOURCE_UNAVAILABLE");
      source = corpusRepo.getCorpusCoverageText(args.target.work_id);
      if (!source || !source.ok) fail("AA_NOT_FOUND");
    }

    let projection = null;
    try {
      if (typeof learnerRepo.getCoverageProjection !== "function") throw new Error("AA_COVERAGE_PROJECTION_UNAVAILABLE");
      projection = await learnerRepo.getCoverageProjection(context.user_id, { nowMs: clock.ms });
    } catch (_) { projection = null; }
    let calculated;
    try {
      calculated = await coverageResolver.calculate(source.rows, projection, { topUnknownLimit: args.top_unknown_limit || 10 });
    } catch (_) {
      calculated = { status: "UNAVAILABLE", reason_code: "TEXT_RESOLVER_UNAVAILABLE", counts: null,
        recorded_familiar_pct_lower_bound: null, unresolved_uncertainty_pp: null, rank_eligible: false, top_unknown: [] };
    }
    if (!calculated || !["AVAILABLE", "AVAILABLE_LIMITED", "NEEDS_PROFILE", "NOT_PREPARED", "PENDING", "STALE", "UNSUPPORTED", "UNAVAILABLE"].includes(calculated.status)) {
      calculated = { status: "UNAVAILABLE", reason_code: "TEXT_RESOLVER_UNAVAILABLE", counts: null,
        recorded_familiar_pct_lower_bound: null, unresolved_uncertainty_pp: null, rank_eligible: false, top_unknown: [] };
    }
    return Object.freeze({
      ...calculated,
      schema_version: "aa.text_coverage.2.0.0",
      learner_projection_version: projection && projection.version ? String(projection.version) : "learner-projection-unavailable-v1",
      tokenizer_version: coverageResolver.TOKENIZER_VERSION,
      resolver_version: coverageResolver.RESOLVER_VERSION,
      generated_at: clock.iso,
    });
  }

  function groupRepoRequired(method) {
    if (!groupCorpusRepo || typeof groupCorpusRepo[method] !== "function") fail("AA_GROUP_CORPUS_UNAVAILABLE");
    return groupCorpusRepo[method].bind(groupCorpusRepo);
  }
  async function groupRead(call) {
    try { return await call(); }
    catch (e) {
      const code = String((e && (e.code || e.message)) || "");
      // Do not reveal whether a restricted corpus/work exists when membership
      // is absent or revoked. Integrity failures remain INTERNAL_ERROR.
      if (code === "GROUP_CORPUS_NOT_FOUND" || code === "GROUP_CORPUS_WORK_NOT_FOUND") fail("AA_NOT_FOUND");
      throw e;
    }
  }
  function searchText(value) { return String(value == null ? "" : value).normalize("NFKC").toLocaleLowerCase(); }

  async function search_group_reading_catalog(context, args) {
    const clock = fixedNow(now);
    const listCorpora = groupRepoRequired("listCorpora"), listWorks = groupRepoRequired("listWorks");
    let corpora = await groupRead(() => listCorpora(context.user_id));
    if (args.corpus_id) {
      corpora = corpora.filter((row) => String(row.corpus_id) === args.corpus_id);
      if (!corpora.length) fail("AA_NOT_FOUND");
    }
    const query = searchText(args.query).trim(), level = searchText(args.level).trim(), tag = searchText(args.tag).trim();
    const found = [];
    for (const corpusRow of corpora) {
      const page = await groupRead(() => listWorks(context.user_id, corpusRow.corpus_id));
      for (const work of page.works || []) {
        const tags = Array.isArray(work.tags) ? [...new Set(work.tags.map((x) => byteSlice(x, 80)).filter(Boolean))].slice(0, 20) : [];
        const title = searchText(work.title), artist = searchText(work.artist), topic = searchText(work.topic), tagText = searchText(tags.join(" "));
        const positionText = work.position_no == null ? "" : `position ${work.position_no}`;
        if (query && ![title, artist, topic, tagText, positionText].some((text) => text.includes(query))) continue;
        if (level && searchText(work.level) !== level) continue;
        if (tag && !tags.some((value) => searchText(value) === tag)) continue;
        const audioAvailable = Number(work.audio_count) > 0;
        if (args.audio === "AVAILABLE" && !audioAvailable) continue;
        if (args.audio === "UNAVAILABLE" && audioAvailable) continue;
        let relevance = 0;
        if (query) relevance = title.startsWith(query) ? 0 : title.includes(query) ? 1 : artist.includes(query) ? 2 : 3;
        found.push({
          corpus_id: String(page.corpus.corpus_id), corpus_title: byteSlice(page.corpus.title, 240), corpus_version: Number(page.corpus.version),
          work_id: String(work.work_id), title: byteSlice(work.title, 500), artist: work.artist ? byteSlice(work.artist, 300) : null,
          position_no: work.position_no == null ? null : Number(work.position_no), rows_count: Math.max(0, Number(work.rows_count) || 0), audio_available: audioAvailable,
          level: work.level ? byteSlice(work.level, 40) : null, topic: work.topic ? byteSlice(work.topic, 200) : null, tags: Object.freeze(tags),
          access: "GROUP_RESTRICTED", first_party_path: "/library.html", _relevance: relevance,
        });
      }
    }
    const position = (row) => row.position_no == null ? 1000001 : row.position_no;
    found.sort((a, b) => {
      if (args.sort === "TITLE") return a.title.localeCompare(b.title, "he") || position(a) - position(b);
      if (args.sort === "ROWS_ASC") return a.rows_count - b.rows_count || position(a) - position(b);
      if (args.sort === "ROWS_DESC") return b.rows_count - a.rows_count || position(a) - position(b);
      if (args.sort === "RELEVANCE") return a._relevance - b._relevance || position(a) - position(b) || a.title.localeCompare(b.title, "he");
      return position(a) - position(b) || a.title.localeCompare(b.title, "he");
    });
    const offset = Number(args.cursor_offset) || 0;
    const results = found.slice(offset, offset + args.limit).map(({ _relevance, ...row }) => Object.freeze(row));
    return Object.freeze({ schema_version: "aa.group_reading_search.1.0.0", results: Object.freeze(results), next_cursor: offset + results.length < found.length ? String(offset + results.length) : null, generated_at: clock.iso });
  }

  async function get_group_reading_content(context, args) {
    const clock = fixedNow(now), getWindow = groupRepoRequired("getAgentReadingWindow");
    const source = await groupRead(() => getWindow(context.user_id, { ...args, start: args.start || 0, rows: args.rows || 5 }));
    let rows = (source.rows || []).map((row) => Object.freeze({ order_index: Number(row.order_index), he: byteSlice(row.he_niqqud || row.he, 800), ru: row.ru == null ? null : byteSlice(row.ru, 800) })).filter((row) => Number.isInteger(row.order_index) && row.he);
    const base = {
      schema_version: "aa.group_reading_content.1.0.0",
      corpus: Object.freeze({ corpus_id: String(source.corpus.corpus_id), title: byteSlice(source.corpus.title, 240), version: Number(source.corpus.version), access: "GROUP_RESTRICTED" }),
      work: Object.freeze({ work_id: String(source.work.work_id), title: byteSlice(source.work.title, 500), artist: source.work.artist ? byteSlice(source.work.artist, 300) : null, source_url: /^https:\/\//i.test(String(source.work.source_url || "")) ? byteSlice(source.work.source_url, 1000) : null, rights_status: source.work.rights_status === "CLEARED" ? "CLEARED" : "REVIEW_REQUIRED" }),
      rows_total: Math.max(0, Number(source.rows_total) || 0), has_more: Boolean(source.has_more), authority: "GROUP_CORPUS_SERVER_CANONICAL", generated_at: clock.iso,
    };
    const fits = (value) => Buffer.byteLength(JSON.stringify({ ...base, anchor: { corpus_id: base.corpus.corpus_id, work_id: base.work.work_id, start_order_index: value.length ? value[0].order_index : (args.start || 0), row_count: value.length }, rows: value }), "utf8") <= 16000;
    while (rows.length > 1 && !fits(rows)) rows = rows.slice(0, -1);
    return Object.freeze({ ...base, anchor: Object.freeze({ corpus_id: base.corpus.corpus_id, work_id: base.work.work_id, start_order_index: rows.length ? rows[0].order_index : (args.start || 0), row_count: rows.length }), rows: Object.freeze(rows), has_more: Boolean(source.has_more || rows.length < (source.rows || []).length) });
  }

  async function get_group_text_coverage(context, args) {
    const clock = fixedNow(now), getCoverageText = groupRepoRequired("getAgentCoverageText");
    const source = await groupRead(() => getCoverageText(context.user_id, args));
    let projection = null;
    try { projection = await learnerRepo.getCoverageProjection(context.user_id, { nowMs: clock.ms }); } catch (_) { projection = null; }
    let calculated;
    try { calculated = await coverageResolver.calculate(source.rows, projection, { topUnknownLimit: args.top_unknown_limit || 10 }); }
    catch (_) { calculated = { status: "UNAVAILABLE", reason_code: "TEXT_RESOLVER_UNAVAILABLE", counts: null,
      recorded_familiar_pct_lower_bound: null, unresolved_uncertainty_pp: null, rank_eligible: false, top_unknown: [] }; }
    if (!calculated || !["AVAILABLE", "AVAILABLE_LIMITED", "NEEDS_PROFILE", "NOT_PREPARED", "PENDING", "STALE", "UNSUPPORTED", "UNAVAILABLE"].includes(calculated.status)) calculated = { status: "UNAVAILABLE", reason_code: "TEXT_RESOLVER_UNAVAILABLE", counts: null,
      recorded_familiar_pct_lower_bound: null, unresolved_uncertainty_pp: null, rank_eligible: false, top_unknown: [] };
    return Object.freeze({
      target: Object.freeze({ corpus_id: String(source.corpus.corpus_id), work_id: String(source.work.work_id), title: byteSlice(source.work.title, 500) }),
      ...calculated,
      schema_version: "aa.group_text_coverage.2.0.0",
      learner_projection_version: projection && projection.version ? String(projection.version) : "learner-projection-unavailable-v1",
      tokenizer_version: coverageResolver.TOKENIZER_VERSION, resolver_version: coverageResolver.RESOLVER_VERSION, generated_at: clock.iso,
    });
  }

  return Object.freeze({
    get_learning_brief,
    get_review_summary,
    search_public_reading_catalog,
    get_recent_explanation_metadata,
    get_agent_connection,
    get_access_window,
    get_due_review_items,
    get_learner_profile,
    get_explanation_body,
    get_reading_content,
    create_reading_handoff,
    propose_action,
    get_progress_delta,
    create_review_handoff,
    list_personal_texts,
    get_personal_text_content,
    get_word_morphology,
    get_text_coverage,
    search_group_reading_catalog,
    get_group_reading_content,
    get_group_text_coverage,
    propose_import_text,
    propose_track_word,
    propose_goal,
    get_current_goal,
    list_published_public_corpora,
    search_published_public_items,
    get_published_public_item,
    list_published_item_resources,
    read_published_text_window,
  });
}

module.exports = { createProductionHandlers };
