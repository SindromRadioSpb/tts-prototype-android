// public/js/knowledge-map-quiz.js — Knowledge Map v3.8 Phase 4.
//
// GENERATIVE GRAPH-QUIZ — reconstructing a root cluster IS retrieval practice
// (the strongest learning-science finding). This module turns the read-only
// Knowledge Map into an active trainer fed by the learner's OWN ②-notes.
//
// HYBRID Anki model (owner decision, upholds docs/SRS_STRATEGY_v3_2.md + role R2):
//   • the quiz is PRACTICE + card CREATION — NOT a second scheduler.
//   • it computes NO SM2 intervals and pushes NO grades into Anki.
//   • on an answer it (a) seeds a missing frontier card via the sanctioned
//     ldb.srs.createCardFromNote, (b) writes a LOCAL engagement event
//     (source:'quiz', invisible to the Anki-grade lifecycle badge), and
//     leaves spaced review to Anki. Mastery still comes ONLY from the Anki
//     PULL sync (getLearningStateOverlay). At session end an honest CTA
//     routes to the existing word-export.
//
// READ surface (all read-only, reused): window.KnowledgeMapData (build /
// rootCluster / rankRoots), ldb.getTextLearningCoverage, the offline paradigm
// resolver window.v3AnkiResolveParadigm, the dormant bridge
// window.NotesGraphSrsCandidates.fromConfirmed.
// WRITE surface (the ONLY two): ldb.srs.createCardFromNote + ldb.recordEvent.
// This module issues no raw SQL of its own.
//
// R1 honesty is the spine: every distractor a generator emits MUST be real
// (real sibling roots, real binyanim of the root/corpus, real paradigm cells,
// real confirmed connections). A generator returns null rather than pad with
// invented forms. Enforced by scripts/premium/km-quiz-items-smoke.js.

(function () {
  "use strict";

  var OVERLAY_ID = "kmQuizOverlay";
  var MOBILE_MAX = 640;
  var DEFAULT_SIZE = 8, MIN_SIZE = 4, MAX_SIZE = 14;
  var ALL_TYPES = ["recall_meaning", "guess_binyan", "word_to_root", "which_form", "connection_recall"];

  // grade scale parity with V3_GRADE_STYLE (index.html) — again/hard/good/easy.
  var GRADE = { 1: "again", 2: "hard", 3: "good", 4: "easy" };

  var STATUS_COLOR = {
    known:    "var(--kmap-known, #2e7d32)",
    learning: "var(--kmap-learning, #f0a500)",
    new:      "var(--kmap-new, #4f7bd6)",
  };

  // ── tiny DOM/i18n helpers (mirror knowledge-map-view.js idioms) ───────────
  function T(key, fb) { try { if (typeof window.t === "function") { var v = window.t(key); if (v && v !== key) return v; } } catch (_) {} return fb; }
  function isRTL() { try { return document.documentElement.getAttribute("dir") === "rtl"; } catch (_) { return false; } }
  function isMobile() { try { return window.matchMedia("(max-width: " + MOBILE_MAX + "px)").matches; } catch (_) { return false; } }
  function el(tag, attrs, text) { var n = document.createElement(tag); if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; }
  function uniq(arr) { var s = new Set(); (arr || []).forEach(function (x) { if (x) s.add(x); }); return Array.from(s); }
  function _norm(w) { return String(w == null ? "" : w).replace(/[֑-ׇ]/g, "").trim(); }

  // Deterministic shuffle: order by a stable djb2 hash of (text + seed) so the
  // correct-answer position is non-trivial yet identical across re-gens (the
  // honesty smoke asserts gen-twice determinism).
  function _djb2(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }
  function _stableShuffle(arr, seed) {
    return arr.slice().sort(function (a, b) {
      var ha = _djb2((a && a.key != null ? a.key : a) + "|" + seed);
      var hb = _djb2((b && b.key != null ? b.key : b) + "|" + seed);
      return ha - hb || String(a && a.key != null ? a.key : a).localeCompare(String(b && b.key != null ? b.key : b));
    });
  }

  // Pick up to n REAL, deduped distractors from pool, excluding `correct`
  // (and anything in `also`). Deterministic order via seed. Honest: never
  // fabricates — returns however many reals exist (caller skips if too few).
  function _realDistractors(correct, pool, n, seed, also) {
    var ban = new Set([correct].concat(also || []));
    var cand = uniq(pool).filter(function (x) { return x && !ban.has(x); });
    cand.sort(function (a, b) { return _djb2(a + "|" + seed) - _djb2(b + "|" + seed) || a.localeCompare(b); });
    return cand.slice(0, n);
  }

  // ── ldb access ───────────────────────────────────────────────────────────
  async function _ldb() {
    if (typeof window === "undefined") return null;
    try {
      if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
      if (typeof window.ensureLocalDB === "function") return await window.ensureLocalDB();
      return window.__localDB || null;
    } catch (_) { return window.__localDB || null; }
  }

  // ── read the graph ─────────────────────────────────────────────────────────
  async function _ensureIndex(opts) {
    if (opts && opts._index) return opts._index;
    if (typeof window === "undefined" || !window.KnowledgeMapData) throw new Error("km-quiz: KnowledgeMapData not loaded");
    return await window.KnowledgeMapData.build((opts && opts.build) || {});
  }
  async function _cluster(rootKey, idx) {
    return await window.KnowledgeMapData.rootCluster(rootKey, { _index: idx });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ITEM GENERATORS — all 5 types. Pure given (lemma, ctx). R1: real-or-null.
  // ════════════════════════════════════════════════════════════════════════
  //  ctx = { cluster, idx, corpusBinyans:Set, allRoots:[rawId] }
  //  Item = { kind, lemmaId, noteId, prompt, promptSub, answerMode:'mc'|'recall',
  //           options:[{key,label}], correctKey, reveal:{...}, root, lemmaKey }
  //  options/correctKey present for answerMode==='mc'; reveal present for 'recall'.

  function _lemmaKeyOf(lemma) {
    // mirror NotesAutoGen.lemmaKey / _noteLemmaKey: pid:<id> else lemma#pos.
    // The kmap node id already encodes this (word:pid:<id> | word:<lemma>#<pos>),
    // so derive from the node id to stay byte-identical downstream.
    var id = String(lemma.id || "");
    if (id.indexOf("word:pid:") === 0) return "pid:" + id.slice("word:pid:".length);
    if (id.indexOf("word:") === 0) return id.slice("word:".length); // already <lemma>#<pos>
    return id;
  }

  // (1) place word → root
  function _genWordToRoot(lemma, ctx) {
    var correct = (lemma.roots && lemma.roots[0]) || "";
    if (!correct) return null;
    var seed = lemma.id + "|word_to_root";
    var distractors = _realDistractors(correct, ctx.allRoots, 3, seed);
    if (distractors.length < 2) return null; // need ≥3 options total
    var opts = _stableShuffle([{ key: correct }].concat(distractors.map(function (d) { return { key: d }; })), seed)
      .map(function (o) { return { key: o.key, label: o.key }; });
    return {
      kind: "word_to_root", lemmaId: lemma.id, noteId: (lemma.noteIds || [])[0] || null,
      prompt: lemma.label, promptSub: T("kmquiz.q.wordToRoot", "Какой корень у этого слова?"),
      answerMode: "mc", options: opts, correctKey: correct,
      root: correct, lemmaKey: _lemmaKeyOf(lemma),
    };
  }

  // (2) recall meaning → reveal + self-grade (no distractors — R1: never invent glosses)
  function _genRecallMeaning(lemma, ctx) {
    var meaning = (lemma.meaning || "").trim();
    if (!meaning) return null;
    return {
      kind: "recall_meaning", lemmaId: lemma.id, noteId: (lemma.noteIds || [])[0] || null,
      prompt: lemma.label, promptSub: T("kmquiz.q.recallMeaning", "Вспомните перевод, затем проверьте"),
      answerMode: "recall",
      reveal: { meaning: meaning, binyan: (lemma.binyans || [])[0] || "", pos: (lemma.pos || [])[0] || "" },
      root: (lemma.roots || [])[0] || "", lemmaKey: _lemmaKeyOf(lemma),
    };
  }

  // (3) guess binyan — distractors are REAL binyanim of the root, topped from
  // corpus-occurring binyanim only (never the theoretical 7).
  function _genGuessBinyan(lemma, ctx) {
    var correct = (lemma.binyans && lemma.binyans[0]) || "";
    if (!correct) return null;
    // sibling binyanim of this root family + corpus binyanim — all real.
    var sib = [];
    (ctx.cluster.lemmas || []).forEach(function (l) { (l.binyans || []).forEach(function (b) { sib.push(b); }); });
    var pool = uniq(sib.concat(Array.from(ctx.corpusBinyans)));
    var seed = lemma.id + "|guess_binyan";
    var distractors = _realDistractors(correct, pool, 3, seed);
    if (distractors.length < 2) return null; // need ≥3 distinct real binyanim
    var opts = _stableShuffle([{ key: correct }].concat(distractors.map(function (d) { return { key: d }; })), seed)
      .map(function (o) { return { key: o.key, label: o.key }; });
    return {
      kind: "guess_binyan", lemmaId: lemma.id, noteId: (lemma.noteIds || [])[0] || null,
      prompt: lemma.label, promptSub: T("kmquiz.q.guessBinyan", "В каком биньяне это слово?"),
      answerMode: "mc", options: opts, correctKey: correct,
      root: (lemma.roots || [])[0] || "", lemmaKey: _lemmaKeyOf(lemma),
    };
  }

  // (4) which-form — per-form / paradigm-gated. Resolves the offline Pealim
  // paradigm via window.v3AnkiResolveParadigm; distractors are OTHER real cells
  // of the SAME paradigm. Returns null (honest "no table" skip) when no/empty
  // paradigm or < 3 distinct cell surfaces. So default per-lemma sessions carry
  // ZERO which-form items — byte-identical to before.
  async function _genWhichForm(lemma, ctx) {
    if (typeof window === "undefined" || typeof window.v3AnkiResolveParadigm !== "function") return null;
    var body = await _fetchLemmaBody(lemma.noteIds && lemma.noteIds[0]);
    if (!body) return null;
    var para;
    try { para = window.v3AnkiResolveParadigm(body); } catch (_) { para = null; }
    if (!para || !para.cells) return null;
    var cellKeys = Object.keys(para.cells).filter(function (k) {
      var c = para.cells[k]; return c && c.he && _norm(c.he);
    });
    // distinct surfaces only — homograph cells collapse
    var bySurface = {};
    cellKeys.forEach(function (k) { var he = para.cells[k].he; if (!bySurface[he]) bySurface[he] = k; });
    var surfaces = Object.keys(bySurface);
    if (surfaces.length < 3) return null;
    var seed = lemma.id + "|which_form";
    // pick a deterministic target cell
    var targetKey = bySurface[surfaces.slice().sort(function (a, b) { return _djb2(a + "|" + seed) - _djb2(b + "|" + seed); })[0]];
    var targetCell = para.cells[targetKey];
    var correct = targetCell.he;
    var distractors = _realDistractors(correct, surfaces, 3, seed);
    if (distractors.length < 2) return null;
    var opts = _stableShuffle([{ key: correct }].concat(distractors.map(function (d) { return { key: d }; })), seed)
      .map(function (o) { return { key: o.key, label: o.key }; });
    return {
      kind: "which_form", lemmaId: lemma.id, noteId: (lemma.noteIds || [])[0] || null,
      prompt: _cellCue(targetKey, para), promptSub: T("kmquiz.q.whichForm", "Выберите правильную форму"),
      answerMode: "mc", options: opts, correctKey: correct,
      root: (lemma.roots || [])[0] || "", lemmaKey: _lemmaKeyOf(lemma),
    };
  }
  // human-readable cue for a paradigm cell key via the canonical slot decoder
  // (window.v3ConjSlotLabel) — never invents a grammatical cue (R1). Honest
  // fallback to the raw key when the decoder is absent (pure smoke).
  function _cellCue(key, para) {
    try {
      if (typeof window !== "undefined" && typeof window.v3ConjSlotLabel === "function") {
        var lab = window.v3ConjSlotLabel(key);
        if (lab && lab !== key) return (para && para.lemma ? para.lemma + " — " : "") + lab;
      }
    } catch (_) {}
    return (para && para.lemma ? para.lemma + " · " : "") + key;
  }
  // whitelisted scalar read of a note body for paradigm resolution (no raw body).
  async function _fetchLemmaBody(noteId) {
    if (!noteId) return null;
    var ldb = await _ldb();
    if (!ldb || typeof ldb.dbQuery !== "function") return null;
    try {
      var rows = await ldb.dbQuery(
        "SELECT json_extract(body_json,'$.root') AS root," +
        " json_extract(body_json,'$.lemma') AS lemma," +
        " json_extract(body_json,'$.word') AS word," +
        " json_extract(body_json,'$.pos') AS pos," +
        " json_extract(body_json,'$.binyan') AS binyan," +
        " json_extract(body_json,'$.pealim_id') AS pealim_id" +
        " FROM notes_v2 WHERE id = ? LIMIT 1", [String(noteId)]);
      return (rows && rows[0]) || null;
    } catch (_) { return null; }
  }

  // (5) connection-recall — consumes the dormant bridge. Real confirmed
  // connections only; empty → no items (never fabricate a connection).
  async function _genConnectionItems(ctx, max) {
    if (typeof window === "undefined" || !window.NotesGraphSrsCandidates ||
        typeof window.NotesGraphSrsCandidates.fromConfirmed !== "function") return [];
    var cands;
    try { cands = await window.NotesGraphSrsCandidates.fromConfirmed({ max: max || 8 }); }
    catch (_) { cands = []; }
    if (!Array.isArray(cands) || !cands.length) return [];
    // prefer connections whose evidence touches this session's roots
    var rootSet = new Set((ctx.allRoots || []));
    cands.sort(function (a, b) {
      var ax = rootSet.has(_norm(a.evidence)) ? 0 : 1, bx = rootSet.has(_norm(b.evidence)) ? 0 : 1;
      return ax - bx;
    });
    return cands.slice(0, max || 2).map(function (c) {
      return {
        kind: "connection_recall", lemmaId: null, noteId: c.from || null,
        prompt: c.prompt || (T("kmquiz.q.connection", "Почему связаны эти слова?")),
        promptSub: [c.from_label, c.to_label].filter(Boolean).join("  ↔  "),
        answerMode: "recall",
        reveal: { meaning: c.answer || "", evidence: c.evidence || "", reason: c.reason_code || "" },
        root: _norm(c.evidence) || "", lemmaKey: null,
      };
    });
  }

  // run the synchronous generators for one lemma in priority order
  function _genForLemma(lemma, ctx) {
    return [
      _genRecallMeaning(lemma, ctx),
      _genGuessBinyan(lemma, ctx),
      _genWordToRoot(lemma, ctx),
    ].filter(Boolean);
  }

  // Exposed for the honesty smoke: synchronous types only, deterministic.
  function _genItems(cluster, ctx) {
    ctx = ctx || {};
    var fullCtx = _ctxFrom(cluster, ctx.idx || { roots: [], lemmas: [] });
    var out = [];
    (cluster.lemmas || []).forEach(function (l) { out = out.concat(_genForLemma(l, fullCtx)); });
    return out;
  }

  function _ctxFrom(cluster, idx) {
    var corpusBinyans = new Set();
    (idx.lemmas || []).forEach(function (l) { (l.binyans || []).forEach(function (b) { corpusBinyans.add(b); }); });
    var allRoots = (idx.roots || []).map(function (r) { return r.rawId; });
    return { cluster: cluster, idx: idx, corpusBinyans: corpusBinyans, allRoots: allRoots };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  SESSION ASSEMBLY
  // ════════════════════════════════════════════════════════════════════════
  function _clamp(n, lo, hi) { n = Number(n); if (!Number.isFinite(n)) return DEFAULT_SIZE; return Math.max(lo, Math.min(hi, n)); }

  // Build a quiz session. mode:'root' (train one root family) or 'frontier'
  // (i+1 learn-next from a text's frontier, root-ordered by corpus frequency).
  async function _buildSession(opts) {
    opts = opts || {};
    var size = _clamp(opts.size != null ? opts.size : DEFAULT_SIZE, MIN_SIZE, MAX_SIZE);
    var allow = Array.isArray(opts.types) && opts.types.length ? opts.types : ALL_TYPES.slice();
    var idx = await _ensureIndex(opts);
    var items = [], lemmasInPlay = [];

    if (opts.mode === "frontier") {
      lemmasInPlay = await _frontierLemmas(opts.textId, idx);
    } else {
      var rootKey = opts.rootKey || ((idx.roots[0] && idx.roots[0].id) || null);
      var cl = rootKey ? await _cluster(rootKey, idx) : { root: null, lemmas: [] };
      lemmasInPlay = (cl.lemmas || []).slice();
    }

    // generate per lemma (cap ~2/lemma), interleaved, then connection items
    var perLemmaCap = 2;
    for (var i = 0; i < lemmasInPlay.length; i++) {
      var lemma = lemmasInPlay[i];
      var cluster = await _clusterForLemma(lemma, idx);
      var ctx = _ctxFrom(cluster, idx);
      var gen = _genForLemma(lemma, ctx);
      // which-form is async + paradigm-gated → append when available
      try { var wf = await _genWhichForm(lemma, ctx); if (wf) gen.push(wf); } catch (_) {}
      gen = gen.filter(function (g) { return allow.indexOf(g.kind) !== -1; });
      gen.slice(0, perLemmaCap).forEach(function (g) { items.push(g); });
      if (items.length >= size + 2) break;
    }
    // connection-recall (≤2) if allowed
    if (allow.indexOf("connection_recall") !== -1) {
      var rootsCtx = { allRoots: (idx.roots || []).map(function (r) { return r.rawId; }) };
      var conn = await _genConnectionItems(rootsCtx, 2);
      conn.forEach(function (c) { items.push(c); });
    }
    // easy→hard ordering, then clamp to size
    var order = { recall_meaning: 0, word_to_root: 1, connection_recall: 2, guess_binyan: 3, which_form: 4 };
    items.sort(function (a, b) { return (order[a.kind] || 9) - (order[b.kind] || 9); });
    items = items.slice(0, size);

    return {
      sessionId: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : ("s_" + _djb2(JSON.stringify(opts) + items.length)),
      mode: opts.mode === "frontier" ? "frontier" : "root",
      textId: opts.textId || null,
      rootKey: opts.rootKey || null,
      items: items, cursor: 0,
      results: [], seededNoteIds: [],
      counts: { total: items.length, correct: 0, seeded: 0 },
    };
  }

  // frontier lemmas: getTextLearningCoverage().frontier (note ids, per-lemma
  // deduped, root-engaged = i+1), mapped to lemma nodes, ordered by the root's
  // corpus frequency (rankRoots). Honest: only roots already started (R2).
  async function _frontierLemmas(textId, idx) {
    var ldb = await _ldb();
    if (!ldb || typeof ldb.getTextLearningCoverage !== "function" || !textId) return [];
    var cov;
    try { cov = await ldb.getTextLearningCoverage(textId); } catch (_) { cov = null; }
    var frontierNotes = new Set((cov && cov.ok && Array.isArray(cov.frontier)) ? cov.frontier.map(String) : []);
    if (!frontierNotes.size) return [];
    // map note ids → lemma nodes
    var byNote = [];
    (idx.lemmas || []).forEach(function (l) {
      if ((l.noteIds || []).some(function (nid) { return frontierNotes.has(String(nid)); })) byNote.push(l);
    });
    // rank by root frequency
    var freqOf = {};
    (idx.roots || []).forEach(function (r) { freqOf[r.rawId] = r.freq; });
    byNote.sort(function (a, b) {
      var fa = freqOf[(a.roots || [])[0]] || 0, fb = freqOf[(b.roots || [])[0]] || 0;
      return fb - fa || a.id.localeCompare(b.id);
    });
    return byNote;
  }

  // the single-root cluster a lemma belongs to (for sibling-binyan distractors)
  async function _clusterForLemma(lemma, idx) {
    var rootRaw = (lemma.roots || [])[0];
    if (!rootRaw) return { root: null, lemmas: [lemma] };
    try { return await _cluster("root:" + rootRaw, idx); }
    catch (_) { return { root: null, lemmas: [lemma] }; }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  OUTCOME WRITER — the only side-effecting region. NO SM2, NO grade push.
  // ════════════════════════════════════════════════════════════════════════
  async function _recordOutcome(session, item, correct, selfGrade) {
    var ldb = await _ldb();
    if (!ldb) return;
    // (a) local engagement event — source:'quiz' (NEVER 'anki'; the lifecycle
    //     grade badge reads source='anki' AND event_type='srs_review' only).
    try {
      if (typeof ldb.recordEvent === "function") {
        await ldb.recordEvent({
          event_type: "quiz_answer", source: "quiz",
          entity_type: item.noteId ? "note" : "connection", entity_id: item.noteId || null,
          note_id: item.noteId || null, session_id: session.sessionId, text_id: session.textId || null,
          payload_json: {
            item_kind: item.kind, correct: !!correct,
            self_grade: (selfGrade != null ? Number(selfGrade) : null),
            root: item.root || null, lemma_key: item.lemmaKey || null, mode: session.mode,
          },
        });
      }
    } catch (_) {}
    // (b) idempotent frontier card CREATION (creation only — never scheduling).
    //     One card per LEMMA (dedup by lemmaKey via seededNoteIds + the node
    //     being already per-lemma). createCardFromNote is idempotent + throws
    //     on free notes (caught/skip).
    if (item.noteId && item.lemmaKey && session.seededNoteIds.indexOf(item.lemmaKey) === -1) {
      session.seededNoteIds.push(item.lemmaKey);
      try {
        var before = (typeof ldb.getNoteById === "function") ? await ldb.getNoteById(item.noteId) : null;
        var hadCard = !!(before && before.srs_card_id);
        if (ldb.srs && typeof ldb.srs.createCardFromNote === "function") {
          await ldb.srs.createCardFromNote(item.noteId);
          if (!hadCard) session.counts.seeded++;
        }
      } catch (_) { /* free note or no template — honest skip */ }
    }
  }

  // refresh lifecycle badges on visible word surfaces after a session
  async function _refreshBadges(session) {
    try {
      if (typeof window === "undefined") return;
      var cards = document.querySelectorAll("[data-note-id]");
      if (cards.length && typeof window.v3ApplyWordLifecycleBadges === "function") {
        await window.v3ApplyWordLifecycleBadges(Array.from(cards));
      }
    } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════════════════
  //  RENDER — one card per screen, RTL-aware, @380px mobile-first.
  // ════════════════════════════════════════════════════════════════════════
  var _live = { overlay: null, session: null };

  function _buildShell() {
    var prev = document.getElementById(OVERLAY_ID);
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    var overlay = el("div", { id: OVERLAY_ID, "data-kmquiz-overlay": "1", role: "dialog",
      "aria-modal": "true", "aria-label": T("kmquiz.title", "Тренировка корней"), tabindex: "-1" });
    overlay.style.cssText = "position:fixed;inset:0;z-index:10080;display:flex;flex-direction:column;" +
      "background:var(--theme-bg-page,var(--theme-bg,#f4f6f9));color:var(--theme-text-primary,var(--theme-text,#0f172a));font-family:inherit;";
    var header = el("div");
    header.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 14px;flex-shrink:0;border-bottom:1px solid var(--theme-border-soft,var(--theme-border,#e2e8f0));";
    var title = el("strong", null, "🎯 " + T("kmquiz.title", "Тренировка корней")); title.style.cssText = "font-size:16px;";
    var spacer = el("div"); spacer.style.cssText = "flex:1;";
    var prog = el("div", { "data-kmquiz-progress": "1", dir: "ltr" }); prog.style.cssText = "font-size:12px;opacity:.7;direction:ltr;";
    var closeBtn = el("button", { "data-kmquiz-close": "1", "aria-label": T("kmquiz.close", "Закрыть") }, "✕");
    closeBtn.style.cssText = "width:auto;min-width:34px;height:34px;border-radius:8px;cursor:pointer;border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;font-size:15px;";
    closeBtn.addEventListener("click", close);
    header.appendChild(title); header.appendChild(spacer); header.appendChild(prog); header.appendChild(closeBtn);
    var body = el("div", { "data-kmquiz-body": "1" });
    body.style.cssText = "flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow-y:auto;padding:18px 14px 90px;";
    overlay.appendChild(header); overlay.appendChild(body);
    document.body.appendChild(overlay);
    overlay.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    _live.overlay = overlay;
    return { overlay: overlay, body: body, prog: prog };
  }

  function _setProgress() {
    if (!_live.overlay || !_live.session) return;
    var p = _live.overlay.querySelector("[data-kmquiz-progress]");
    if (p) p.textContent = Math.min(_live.session.cursor + 1, _live.session.items.length) + " / " + _live.session.items.length;
  }

  function _bodyHost() { return _live.overlay && _live.overlay.querySelector("[data-kmquiz-body]"); }

  function _card() {
    var c = el("div", { "data-kmquiz-card": "1" });
    c.style.cssText = "width:100%;max-width:440px;background:var(--theme-bg-card,#fff);border:1px solid var(--theme-border-soft,#e2e8f0);border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.10);padding:20px 18px;display:flex;flex-direction:column;gap:14px;";
    return c;
  }
  function _primaryBtn(label) {
    var b = el("button", { type: "button" }, label);
    b.style.cssText = "width:100%;min-height:46px;cursor:pointer;font-size:15px;font-weight:600;padding:10px 16px;border-radius:10px;border:1px solid var(--theme-accent,#2563eb);background:var(--theme-accent,#2563eb);color:#fff;";
    return b;
  }
  function _optionBtn(label) {
    var b = el("button", { type: "button", "data-kmquiz-opt": "1" }, label);
    b.style.cssText = "width:100%;min-height:46px;text-align:center;cursor:pointer;font-size:17px;padding:10px 14px;border-radius:10px;border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;direction:rtl;letter-spacing:1px;";
    return b;
  }

  function _renderItem() {
    var s = _live.session, host = _bodyHost();
    if (!host) return;
    host.innerHTML = "";
    if (s.cursor >= s.items.length) return _renderSummary();
    _setProgress();
    var item = s.items[s.cursor];
    var card = _card();

    var prompt = el("div"); prompt.style.cssText = "font-size:30px;font-weight:700;text-align:center;direction:rtl;letter-spacing:1px;line-height:1.3;";
    prompt.textContent = item.prompt;
    var sub = el("div"); sub.style.cssText = "font-size:13px;opacity:.7;text-align:center;";
    sub.textContent = item.promptSub || "";
    if (item.promptSub2) sub.textContent = item.promptSub;
    card.appendChild(prompt); card.appendChild(sub);

    if (item.answerMode === "mc") {
      var optWrap = el("div"); optWrap.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:4px;";
      item.options.forEach(function (o) {
        var b = _optionBtn(o.label);
        b.addEventListener("click", function () { _answerMC(item, o.key, b, optWrap); });
        optWrap.appendChild(b);
      });
      card.appendChild(optWrap);
    } else {
      var reveal = el("div", { "data-kmquiz-reveal": "1" });
      reveal.style.cssText = "display:none;flex-direction:column;gap:8px;border-top:1px dashed var(--theme-border-soft,#e2e8f0);padding-top:12px;";
      var rMean = el("div", null, item.reveal.meaning || T("kmquiz.noGloss", "(нет перевода)"));
      rMean.style.cssText = "font-size:18px;text-align:center;";
      reveal.appendChild(rMean);
      if (item.reveal.evidence) reveal.appendChild(el("div", { style: "text-align:center;opacity:.7;font-size:13px;direction:rtl;" }, item.reveal.evidence));
      card.appendChild(reveal);
      var showBtn = _primaryBtn(T("kmquiz.show", "Показать"));
      showBtn.addEventListener("click", function () {
        reveal.style.display = "flex"; showBtn.style.display = "none";
        card.appendChild(_gradeRow(item));
      });
      card.appendChild(showBtn);
    }
    host.appendChild(card);
  }

  function _answerMC(item, chosenKey, btnEl, optWrap) {
    var correct = chosenKey === item.correctKey;
    // lock options + colorize
    optWrap.querySelectorAll("[data-kmquiz-opt]").forEach(function (b) {
      b.disabled = true; b.style.cursor = "default";
      var k = b.textContent;
      if (b === btnEl && !correct) { b.style.borderColor = "var(--theme-danger,#c0392b)"; b.style.background = "rgba(192,57,43,.10)"; }
    });
    // always mark the correct one green
    optWrap.querySelectorAll("[data-kmquiz-opt]").forEach(function (b) {
      if (b.textContent === item.correctKey) { b.style.borderColor = "var(--kmap-known,#2e7d32)"; b.style.background = "rgba(46,125,50,.12)"; }
    });
    var grade = correct ? 4 : 1;
    _commitAnswer(item, correct, grade);
    _advanceAfter(700);
  }

  function _gradeRow(item) {
    var row = el("div"); row.style.cssText = "display:flex;gap:6px;margin-top:6px;";
    [[1, T("notes.grade.again", "Снова"), "#D55E00"], [2, T("notes.grade.hard", "Трудно"), "#E69F00"],
     [3, T("notes.grade.good", "Хорошо"), "#009E73"], [4, T("notes.grade.easy", "Легко"), "#56B4E9"]].forEach(function (g) {
      var b = el("button", { type: "button" }, g[1]);
      b.style.cssText = "flex:1;min-height:42px;cursor:pointer;font-size:13px;font-weight:600;padding:8px 4px;border-radius:9px;border:1px solid " + g[2] + ";background:var(--theme-bg-card,#fff);color:inherit;";
      b.addEventListener("click", function () {
        var correct = g[0] >= 3; // good/easy = recalled
        _commitAnswer(item, correct, g[0]);
        _advanceAfter(120);
      });
      row.appendChild(b);
    });
    return row;
  }

  function _commitAnswer(item, correct, grade) {
    var s = _live.session;
    s.results.push({ kind: item.kind, correct: !!correct, grade: grade });
    if (correct) s.counts.correct++;
    // fire-and-forget outcome write (no UI blocking; idempotent)
    _recordOutcome(s, item, correct, grade);
  }

  var _advTimer = null;
  function _advanceAfter(ms) {
    if (_advTimer) clearTimeout(_advTimer);
    _advTimer = setTimeout(function () { _live.session.cursor++; _renderItem(); }, ms);
  }

  function _renderSummary() {
    var s = _live.session, host = _bodyHost();
    if (!host) return;
    host.innerHTML = "";
    _refreshBadges(s);
    var card = _card();
    card.appendChild(el("div", { style: "font-size:22px;font-weight:700;text-align:center;" }, "✅ " + T("kmquiz.done", "Готово!")));
    var pct = s.counts.total ? Math.round((100 * s.counts.correct) / s.counts.total) : 0;
    card.appendChild(el("div", { style: "text-align:center;font-size:15px;opacity:.85;" },
      T("kmquiz.score", "Верно") + ": " + s.counts.correct + "/" + s.counts.total + " (" + pct + "%)"));
    if (s.counts.seeded > 0) {
      card.appendChild(el("div", { style: "text-align:center;font-size:13px;opacity:.7;" },
        "🆕 " + T("kmquiz.seeded", "новых карточек создано") + ": " + s.counts.seeded));
    }
    // honest CTA: spaced review lives in Anki (creation export, no interval here)
    var ctaTextId = s.textId;
    var cta = _primaryBtn("📥 " + T("kmquiz.reviewInAnki", "Повторять в Anki"));
    cta.addEventListener("click", function () { _routeToAnkiExport(ctaTextId); });
    card.appendChild(cta);
    card.appendChild(el("div", { style: "text-align:center;font-size:11px;opacity:.6;" },
      T("kmquiz.ankiHint", "Тренировка — это разминка. Распределённое повторение живёт в Anki.")));
    var closeB = el("button", { type: "button" }, T("kmquiz.close", "Закрыть"));
    closeB.style.cssText = "width:100%;min-height:42px;cursor:pointer;font-size:14px;padding:8px 16px;border-radius:10px;border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;";
    closeB.addEventListener("click", close);
    card.appendChild(closeB);
    host.appendChild(card);
    if (_live.overlay) { var p = _live.overlay.querySelector("[data-kmquiz-progress]"); if (p) p.textContent = ""; }
  }

  function _routeToAnkiExport(textId) {
    // Reuse the canonical "review in Anki" route (the SRS-trainer stub uses the
    // same one): it triggers the existing #btnAnki word-export with an honest
    // fallback toast when no text is loaded / AnkiConnect is absent — no
    // dead-end, no second scheduler (R2/R4).
    try {
      if (typeof window.v3SrsTrainerOpenAnkiExport === "function") { close(); window.v3SrsTrainerOpenAnkiExport(); return; }
      var btn = document.getElementById("btnAnki");
      if (btn && !btn.disabled && !btn.classList.contains("disabled")) { close(); btn.click(); return; }
    } catch (_) {}
    try { if (typeof window.showToast === "function") window.showToast(T("kmquiz.ankiUnavailable", "Откройте текст в Classic режиме, чтобы экспортировать карточки в Anki.")); } catch (_) {}
    close();
  }

  function _renderEmpty(msg) {
    var host = _bodyHost(); if (!host) return;
    host.innerHTML = "";
    var card = _card();
    card.appendChild(el("div", { style: "text-align:center;opacity:.8;font-size:14px;line-height:1.5;" }, msg));
    var closeB = el("button", { type: "button" }, T("kmquiz.close", "Закрыть"));
    closeB.style.cssText = "width:100%;min-height:42px;cursor:pointer;font-size:14px;padding:8px 16px;border-radius:10px;border:1px solid var(--theme-border-soft,#e2e8f0);background:var(--theme-bg-card,#fff);color:inherit;margin-top:8px;";
    closeB.addEventListener("click", close);
    card.appendChild(closeB);
    host.appendChild(card);
  }

  // ── public API ─────────────────────────────────────────────────────────
  async function open(opts) {
    opts = opts || {};
    var shell = _buildShell();
    try { shell.overlay.focus(); } catch (_) {}
    shell.body.appendChild(el("div", { style: "margin:auto;opacity:.7;" }, T("kmquiz.building", "Собираем тренировку…")));
    var session;
    try { session = await _buildSession(opts); }
    catch (e) { _renderEmpty(T("kmquiz.error", "Не удалось собрать тренировку") + " — " + (e && e.message ? e.message : e)); return; }
    if (!session.items.length) {
      _renderEmpty(opts.mode === "frontier"
        ? T("kmquiz.emptyFrontier", "Нет слов i+1 для этого текста. Начните учить корни, и они появятся здесь.")
        : T("kmquiz.emptyRoot", "В этой семье корня недостаточно данных для тренировки."));
      return;
    }
    _live.session = session;
    _renderItem();
  }
  function close() {
    if (_advTimer) { clearTimeout(_advTimer); _advTimer = null; }
    var o = document.getElementById(OVERLAY_ID); if (o && o.parentNode) o.parentNode.removeChild(o);
    _live.overlay = null; _live.session = null;
  }
  function isOpen() { return !!document.getElementById(OVERLAY_ID); }

  var API = {
    open: open, close: close, isOpen: isOpen,
    _buildSession: _buildSession, _genItems: _genItems,
    // exposed pure generators for the honesty smoke
    _gen: { wordToRoot: _genWordToRoot, recallMeaning: _genRecallMeaning, guessBinyan: _genGuessBinyan },
    _genWhichForm: _genWhichForm, _genConnectionItems: _genConnectionItems,
    _recordOutcome: _recordOutcome, _routeToAnkiExport: _routeToAnkiExport,
    _ctxFrom: _ctxFrom, _lemmaKeyOf: _lemmaKeyOf,
  };
  if (typeof window !== "undefined") window.KnowledgeMapQuiz = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
