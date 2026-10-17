// public/js/morph-host.js — ОБЩИЙ хост памяти слова для карточки ReaderMorph.
//
// Одна реализация канона на обе поверхности (Зал = library-ui.js, Студия = studio-morph.js),
// по прецеденту media-host.js: форк семантики метки/оценки/заметки ЗАПРЕЩЁН. Тела функций
// перенесены из library-ui.js (v3.11.310) БЕЗ семантических правок — только механические
// подстановки поверхностных зависимостей через env:
//
//   env = {
//     ldb: async () => localDbNamespace,   // OPFS local-db (Зал: module-import; Студия: ensureLocalDB)
//     getTextKey: async () => string|null, // texts.text_key открытого текста (или null — несохранённый)
//     verifyOccurrence: async (occ) => source|null, // exact external derivative; invalid => no fallback
//     toast: (msg) => void,
//     onProfileChanged: () => void,        // инвалидации + перекраска поверхности (host уже сбросил свой кэш)
//     getTtsKey: () => string,             // localStorage v3.gcpTtsApiKey (общий слот)
//     dayStr: () => 'YYYY-MM-DD',
//     getDueNowCount: () => number,        // для recordRecall (Зал: _dueCounts.dueNow; Студия: 0)
//     getContextOverlay: () => object|null,// baked context-sidecar (только Зал/корпус)
//     applyI18n: () => void,
//   }
//
// Канон-инварианты (см. RETENTION_PROGRAM_RECON / ROOM_DUE_CONTINUITY):
//   • markWordStatus: ручная метка l1–l4 сеет FSRS-расписание oracle-clean (seed-row →
//     replay(log)==stored); know/ignore/new не сеют; source-at-mark только verified.
//   • gradeReadingTap: оценка чтения НЕ двигает ручной уровень (D8a); review_log
//     channel='reading:tap'; srs-carrier без статуса персистится srs-only (P4.1).
//   • Заметки: одна каноническая note на лемму (dedupKey), re-save = occurrence.
(function () {
  "use strict";

  function _tt(key, fallback) {
    try { if (typeof window !== "undefined" && typeof window.t === "function") { var v = window.t(key); if (v && v !== key) return v; } } catch (_) {}
    return fallback;
  }
  // минимальная копия el() из library-ui.js:223 (для consent-диалога)
  function _el(tag, opts) {
    var e = document.createElement(tag);
    if (opts) {
      if (opts.class) e.className = opts.class;
      if (opts.text != null) e.textContent = opts.text;
      if (opts.i18n) e.setAttribute("data-i18n", opts.i18n);
      if (opts.attrs) for (var k in opts.attrs) e.setAttribute(k, opts.attrs[k]);
    }
    return e;
  }

  var _identityMigrationScheduled = false;
  // Ф4 · Д8-К — the device's Dicta lexicon: one load per page, shared by every host on it. resolveCore reads it, so the
  // Room's paint, a tap, the trainers and «Мой словарь» key a word Pealim does not read in the same way.
  var _dictaLexPromise = null, _dictaLexCalled = [], _autoParseScheduled = false;
  function _loadDictaLexicon(ldbOf, onLoaded) {
    // every caller's onLoaded runs, whoever started the load (O-083: a card scan may come before the host's own kick)
    if (_dictaLexPromise) {
      if (typeof onLoaded === "function" && _dictaLexCalled.indexOf(onLoaded) < 0) {
        _dictaLexCalled.push(onLoaded);
        _dictaLexPromise.then(function (lex) { if (lex && lex.size) { try { onLoaded(lex); } catch (_) {} } });
      }
      return _dictaLexPromise;
    }
    if (typeof onLoaded === "function") _dictaLexCalled.push(onLoaded);
    _dictaLexPromise = (async function () {
      var RM = typeof window !== "undefined" ? window.ReaderMorph : null, DLX = typeof window !== "undefined" ? window.DictaLexicon : null;
      var ldb = await ldbOf();
      if (!RM || typeof RM.setDictaLexicon !== "function" || !DLX || !ldb || typeof ldb.getDictaLexiconRows !== "function") return null;
      var lex = await DLX.refresh(ldb);
      RM.setDictaLexicon(lex);
      try { window.dispatchEvent(new CustomEvent("lp:dicta-lexicon", { detail: { size: lex.size } })); } catch (_) {}
      if (lex.size && typeof onLoaded === "function") { try { onLoaded(lex); } catch (_) {} }
      return lex;
    })().catch(function (e) { _dictaLexPromise = null; _dictaLexCalled = []; try { console.warn("[dicta-lexicon]", e); } catch (_) {} return null; });
    return _dictaLexPromise;
  }
  // Ф4 · Д10 the places' data for ReaderMorph (one loader per page): per sentence id — its units, the stored Dicta parse
  // aligned to them (sentence_morph), the learner's verified decisions for its places (lexical_resolution_events:
  // «Проверить морфологию» — a Pealim entry, or «это имя»). Only stored data: the same on every surface.
  var _placeLoaderSet = false;
  // Ф4 · Д8-К4 v2 (К4.3/К4.4): a corpus work met by the place loader gets its baked Dicta facts in the background
  // (CorpusPlaceParse — one work at a time, once a session); after new facts land, the marks follow the word again
  // (Д10.2, the 80 % rule) and the run's summary is kept (lp.identityMigrationD10_runs, last 20).
  var _cppSeen = new Set(), _cppQueue = [], _cppBusy = false, _d10Timer = null, _cppWait = new Map(), _cppStartTimer = null;
  // O-092: the works applied under the current alignment (CorpusPlaceParse.ALIGN); an older one is applied once more
  function _cppDoneStore(CPP) {
    var key = "lp.corpusParse.aligned.v" + (CPP && CPP.ALIGN || 1);
    function read() { return JSON.parse(localStorage.getItem(key) || "[]"); }
    return {
      has: function (id) { try { return read().indexOf(String(id)) >= 0; } catch (_) { return true; } },   // no storage: as before
      add: function (id) { try { var a = read(); if (a.indexOf(String(id)) < 0) { a.push(String(id)); localStorage.setItem(key, JSON.stringify(a.slice(-3000))); } } catch (_) {} },
    };
  }
  function _sha256Hex(s) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) {
      return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    });
  }
  function _rerunPlaceMarks(ldbOf) {
    if (_d10Timer) clearTimeout(_d10Timer);
    _d10Timer = setTimeout(function () {
      _d10Timer = null;
      var run = async function () {
        var RM = window.ReaderMorph; if (!RM || typeof RM.migrateIdentityD9 !== "function") return;
        var r = null; try { r = await RM.migrateIdentityD9(await ldbOf(), { places: true, force: true }); } catch (e) { try { console.warn("[corpus-parse] Д10.2", e); } catch (_) {} }
        if (!r) return;
        try {
          var runs = JSON.parse(localStorage.getItem("lp.identityMigrationD10_runs") || "[]");
          runs.push({ at: r.at || new Date().toISOString(), why: "corpus-parse", marked: r.marked, keysMoving: r.keysMoving, copied: r.copied, cleared: r.cleared, belowShare: r.belowShare });
          localStorage.setItem("lp.identityMigrationD10_runs", JSON.stringify(runs.slice(-20)));
        } catch (_) {}
        try { window.dispatchEvent(new CustomEvent("lp:place-marks-migrated", { detail: r })); } catch (_) {}
      };
      try {
        if (navigator.locks && navigator.locks.request) navigator.locks.request("lp-identity-migration", function () { return run(); });
        else run();
      } catch (_) { run(); }
    }, 10000);
  }
  // → a promise of the work's apply result (null: not a corpus work / already done this session). O-091: `now` — a tap or
  // an opened work waits for it: the work goes to the front of the queue and the queue starts at once.
  function _corpusParseLater(ldbOf, text, now) {
    var CPP = window.CorpusPlaceParse, id = text ? String(text.id) : "";
    if (!CPP || !id) return null;
    if (_cppSeen.has(id)) {
      var waiting = _cppWait.get(id) || null;
      if (waiting && now) {
        var qi = _cppQueue.findIndex(function (j) { return String(j.text.id) === id; });
        if (qi > 0) _cppQueue.unshift(_cppQueue.splice(qi, 1)[0]);
        _cppStartNow(ldbOf);
      }
      return waiting;
    }
    _cppSeen.add(id);            // a personal text is looked at once a session too
    if (!CPP.sourceOf(text)) return null;
    var done = null, p = new Promise(function (res) { done = res; });
    _cppWait.set(id, p);
    var job = { text: text, done: done };
    if (now) _cppQueue.unshift(job); else _cppQueue.push(job);
    if (!_cppBusy) { _cppBusy = true; _cppStartTimer = setTimeout(function () { _cppStartTimer = null; _cppNext(ldbOf); }, now ? 0 : 2000); }
    else if (now) _cppStartNow(ldbOf);
    return p;
  }
  // a waiter does not sit out the queue's quiet start (the 2 s left to the page's boot)
  function _cppStartNow(ldbOf) {
    if (!_cppStartTimer) return;
    clearTimeout(_cppStartTimer); _cppStartTimer = null;
    _cppNext(ldbOf);
  }
  async function _cppNext(ldbOf) {
    var job = _cppQueue.shift();
    if (!job) { _cppBusy = false; return; }
    var CPP = window.CorpusPlaceParse, t = job.text, r = null;
    try {
      var ldb = await ldbOf();
      r = ldb ? await CPP.apply(t, { db: ldb, RM: window.ReaderMorph, fetch: fetch.bind(window), sha256Hex: _sha256Hex, done: _cppDoneStore(CPP) }) : null;
      if (r && r.applied) {
        try { window.dispatchEvent(new CustomEvent("lp:corpus-parse-applied", { detail: { textId: String(t.id), applied: r.applied } })); } catch (_) {}
        _rerunPlaceMarks(ldbOf);
      }
    } catch (e) { try { console.warn("[corpus-parse]", e); } catch (_) {} }
    _cppWait.delete(String(t.id));
    try { job.done(r); } catch (_) {}
    setTimeout(function () { _cppNext(ldbOf); }, 500);
  }
  // O-091: an opened text starts its corpus parse now (the first tap need not wait for it)
  async function _corpusParseSoon(ldbOf, textId) {
    var id = String(textId || ""); if (!id || _cppSeen.has(id) || !window.CorpusPlaceParse) return null;
    var ldb = await ldbOf(); if (!ldb || typeof ldb.dbQuery !== "function") return null;
    var t = ((await ldb.dbQuery("SELECT id, text_key, source_meta_json FROM texts WHERE id = ?", [id])) || [])[0];
    return t ? _corpusParseLater(ldbOf, t, true) : null;
  }
  function _installPlaceLoader(ldbOf) {
    var RM = typeof window !== "undefined" ? window.ReaderMorph : null;
    if (_placeLoaderSet || !RM || typeof RM.setPlaceLoader !== "function") return;
    _placeLoaderSet = true;
    RM.setPlaceLoader(async function (sids, lopts) {
      var out = new Map(), ldb = await ldbOf(), waitMs = lopts && Number(lopts.wait) > 0 ? Number(lopts.wait) : 0;
      if (!ldb || typeof ldb.dbQuery !== "function") return out;
      var Core = window.LexicalResolutionCore, Svc = window.LexicalResolutionService;
      for (var i = 0; i < sids.length; i += 400) {
        var part = sids.slice(i, i + 400), qm = part.map(function () { return "?"; }).join(",");
        var rows = (await ldb.dbQuery("SELECT s.id, s.text_id, s.order_index, s.he_plain, s.he_niqqud, t.text_key FROM sentences s LEFT JOIN texts t ON t.id = s.text_id WHERE s.id IN (" + qm + ")", part)) || [];
        var morph = new Map();
        ((await ldb.dbQuery("SELECT sentence_id, tokens_json FROM sentence_morph WHERE sentence_id IN (" + qm + ")", part)) || []).forEach(function (m) {
          try { morph.set(String(m.sentence_id), JSON.parse(m.tokens_json || "[]")); } catch (_) {}
        });
        // a corpus work whose rows here carry no stored parse: fetch its baked facts in the background (once a session)
        // (the text's metadata is read once per text, never joined per row — the 3.11.760 iPhone lesson)
        var bare = Array.from(new Set(rows.filter(function (r) { return !morph.has(String(r.id)) && !_cppSeen.has(String(r.text_id)); }).map(function (r) { return String(r.text_id); })));
        if (bare.length) {
          try {
            ((await ldb.dbQuery("SELECT id, text_key, source_meta_json FROM texts WHERE id IN (" + bare.map(function () { return "?"; }).join(",") + ")", bare)) || [])
              .forEach(function (t) { _corpusParseLater(ldbOf, t, !!waitMs); });
          } catch (_) {}
        }
        // O-091: a tap waits (bounded) for its work's parse, then reads the stored parse again
        if (waitMs) {
          var pend = [];
          rows.forEach(function (r) {
            var tid = String(r.text_id);
            if (morph.has(String(r.id)) || !_cppSeen.has(tid)) return;
            var pw = _corpusParseLater(ldbOf, { id: tid }, true);   // seen: its promise (and the front of the queue)
            if (pw && pend.indexOf(pw) < 0) pend.push(pw);
          });
          if (pend.length) {
            var timer = null;
            await Promise.race([Promise.all(pend), new Promise(function (res) { timer = setTimeout(res, waitMs); })]);
            if (timer) clearTimeout(timer);
            try {
              ((await ldb.dbQuery("SELECT sentence_id, tokens_json FROM sentence_morph WHERE sentence_id IN (" + qm + ")", part)) || []).forEach(function (m) {
                try { morph.set(String(m.sentence_id), JSON.parse(m.tokens_json || "[]")); } catch (_) {}
              });
            } catch (_) {}
          }
        }
        var events = [];
        if (Core && Svc && typeof ldb.listLexicalResolutionEventsForTexts === "function") {
          var tids = Array.from(new Set(rows.map(function (r) { return String(r.text_id); })));
          try { events = ((await ldb.listLexicalResolutionEventsForTexts(tids)) || []).filter(function (e) { return part.indexOf(String(e.sentence_id)) >= 0; }); } catch (_) { events = []; }
        }
        for (var ri = 0; ri < rows.length; ri++) {
          var r = rows[ri], sid = String(r.id), pu = RM.placeUnits(r, morph.get(sid) || null), dec = new Map();
          var mine = events.filter(function (e) { return String(e.sentence_id) === sid; });
          var occIds = Array.from(new Set(mine.map(function (e) { return e.occurrence_id; })));
          for (var oi = 0; oi < occIds.length; oi++) {
            var latest = Core.latest(mine, occIds[oi]);
            if (!latest || latest.action !== "manual_correction") continue;
            var off = Number(latest.word_offset), sk = pu.sk[off];
            if (!sk) continue;
            // the decision holds only where its anchor is still this word in this sentence
            var occ = { text_id: String(r.text_id), sentence_id: sid, word_offset: off, text_key: r.text_key || String(r.text_id), order_index: r.order_index,
              surface: sk, niqqud: "", sentence_he_niqqud: r.he_niqqud || "", sentence_he: r.he_plain || "" };
            // the scan's own unit at this offset (TextKeyScan.unitAt) — the same anchor the decision was saved with
            var un = window.TextKeyScan && typeof window.TextKeyScan.unitAt === "function" ? window.TextKeyScan.unitAt(r, off) : null;
            if (un) { occ.surface = un.surface; occ.niqqud = un.niqqud; }
            var proj = null; try { proj = await Svc.projectExactOccurrence(occ, mine, Core); } catch (_) { proj = null; }
            if (!proj || proj.state !== "resolved") continue;
            var a = (latest.chosen_analysis || {});
            if (a.lp_pos === "propernoun") dec.set(off, { name: true });
            else if (a.pealim_id) dec.set(off, { pid: String(a.pealim_id) });
          }
          out.set(sid, { sk: pu.sk, at: pu.at, dec: dec });
        }
      }
      return out;
    });
  }
  function createHost(env) {
    env = env || {};
    var ldbOf = typeof env.ldb === "function" ? env.ldb : async function () { return null; };
    _installPlaceLoader(ldbOf);
    var toast = typeof env.toast === "function" ? env.toast : function () {};
    var onProfileChanged = typeof env.onProfileChanged === "function" ? env.onProfileChanged : function () {};
    var applyI18n = typeof env.applyI18n === "function" ? env.applyI18n : function () {};
    var getTextKey = typeof env.getTextKey === "function" ? env.getTextKey : async function () { return null; };
    var verifyOccurrence = typeof env.verifyOccurrence === "function" ? env.verifyOccurrence : null;
    var getDueNowCount = typeof env.getDueNowCount === "function" ? env.getDueNowCount : function () { return 0; };
    var getContextOverlay = typeof env.getContextOverlay === "function" ? env.getContextOverlay : function () { return null; };

    // ── Кэш статусов (BRR-P1-009; single-flight; ошибка НЕ кэшируется) ─────────
    // Референс-стабильный объект: потребители (refreshCovChip Зала) сравнивают по ссылке.
    var _states = null, _statesLoading = null;
    async function ensureWordStates() {
      if (_states) return _states;
      if (_statesLoading) return _statesLoading;
      _statesLoading = (async function () {
        try { var ldb = await ldbOf(); _states = await ldb.getKnownWordStates(); return _states; }
        catch (_) { _states = null; return {}; }
      })();
      try { return await _statesLoading; } finally { _statesLoading = null; }
    }
    function invalidateWordStates() { _states = null; }
    // peek/prime — для потребителей Зала: тренировка подглядывает кэш без форс-загрузки (1186),
    // а bulk-импорт праймит его готовым снапшотом (7366) — сохраняем оба контракта.
    function peekWordStates() { return _states; }
    function primeWordStates(states) { if (states && typeof states === "object") _states = states; }

    // ── Аудио-синглтон (Epic-3a speakWord; один <audio> на поверхность) ────────
    var _audio = null, _utterance = null;
    function _browserSpeakWord(he) {
      try {
        if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return;
        var u = new SpeechSynthesisUtterance(he);
        u.lang = "he-IL"; u.rate = 0.9;
        try { var v = (window.speechSynthesis.getVoices() || []).find(function (x) { return /^(he|iw)/i.test(x.lang || ""); }); if (v) u.voice = v; } catch (_) {}
        if (_utterance && window.LPWorldActivity) window.LPWorldActivity.setAudio(_utterance, false);
        _utterance = u;
        u.onstart = function () { if (window.LPWorldActivity) window.LPWorldActivity.setAudio(u, true); };
        u.onend = u.onerror = function () { if (window.LPWorldActivity) window.LPWorldActivity.setAudio(u, false); };
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
      } catch (_) {}
    }
    async function speakWord(text) {
      var he = String(text || "").trim();
      if (!he) return;
      try {
        var publicAsset = env.resolvePublicWordAudio ? await env.resolvePublicWordAudio(he) : null;
        if (publicAsset && publicAsset.audio_url) { await playUrl(publicAsset.audio_url); return; }
      } catch (_) {}
      var key = "";
      try { key = env.getTtsKey ? env.getTtsKey() : ""; } catch (_) { key = ""; }
      if (!key) { _browserSpeakWord(he); return; }
      try {
        var r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: he, language: "he-IL", voiceId: "", speakingRate: 0.95, pitch: 0.0, gcpTtsApiKey: key, withTimepoints: false }) });
        if (!r.ok) throw new Error("tts " + r.status);
        var res = await r.json();
        var src = "";
        if (res && res.assetKey) src = "/api/audio/" + encodeURIComponent(String(res.assetKey).trim());
        else if (res && res.audioContent) { var bytes = Uint8Array.from(atob(res.audioContent), function (c) { return c.charCodeAt(0); }); src = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" })); }
        if (!src) throw new Error("no audio");
        await playUrl(src);
      } catch (_) { _browserSpeakWord(he); }
    }
    async function playUrl(src) {
      if (!_audio) { _audio = new Audio(); if (window.LPWorldActivity) window.LPWorldActivity.trackMedia(_audio); }
      try { _audio.pause(); } catch (_) {}
      _audio.src = src; await _audio.play();
    }
    function stopAudio() {
      if (_utterance && window.LPWorldActivity) window.LPWorldActivity.setAudio(_utterance, false);
      _utterance = null;
      try { if (_audio) _audio.pause(); } catch (_) {}
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
    }

    // ── Consent точного режима (Dicta, R5) — ОБЩИЕ localStorage-ключи ──────────
    function contextConsent() {
      try {
        var c = localStorage.getItem("room.contextConsent");
        if (c === "granted" || c === "declined") return c;
        if (localStorage.getItem("room.contextMode") === "1") return "granted";   // legacy opt-in
        return "";
      } catch (_) { return ""; }
    }
    function contextConsentSet(v) {
      try { localStorage.setItem("room.contextConsent", v); localStorage.setItem("room.contextMode", v === "granted" ? "1" : "0"); } catch (_) {}
    }
    function grantContextConsent() {
      contextConsentSet("granted");
      toast(_tt("room.morph.consentOn", "Точный режим включён"));
    }
    var _ctxCache = new Map();
    var _ctxConsentAsked = false;   // session debounce
    function clearCtxCache() { _ctxCache = new Map(); }
    function promptContextConsent() {
      if (_ctxConsentAsked || contextConsent()) return;
      _ctxConsentAsked = true;
      var overlay = _el("div", { class: "room-consent-overlay" });
      var box = _el("div", { class: "room-consent", attrs: { role: "dialog", "aria-modal": "true" } });
      box.appendChild(_el("div", { class: "room-consent-title", i18n: "room.morph.consentTitle", text: _tt("room.morph.consentTitle", "Уточнять значения по контексту?") }));
      box.appendChild(_el("div", { class: "room-consent-body", i18n: "room.morph.consentBody", text: _tt("room.morph.consentBody", "Точный режим отправляет предложение в облако Dicta при каждом тапе по слову, чтобы выбрать значение по контексту (гомографы). Машинный разбор, не носитель. Можно отключить в «Подсказках чтения».") }));
      var actions = _el("div", { class: "room-consent-actions" });
      var no = _el("button", { class: "room-consent-no", i18n: "room.morph.consentNo", text: _tt("room.morph.consentNo", "Не сейчас") });
      var yes = _el("button", { class: "room-consent-yes", i18n: "room.morph.consentYes", text: _tt("room.morph.consentYes", "Включить") });
      var finish = function (v) { contextConsentSet(v); try { overlay.remove(); } catch (_) {} };
      no.addEventListener("click", function () { finish("declined"); });
      yes.addEventListener("click", function () { finish("granted"); toast(_tt("room.morph.consentOn", "Точный режим включён")); });
      overlay.addEventListener("click", function (e) { if (e.target === overlay) { try { overlay.remove(); } catch (_) {} } });   // dismiss = undecided
      actions.appendChild(no); actions.appendChild(yes); box.appendChild(actions); overlay.appendChild(box);
      document.body.appendChild(overlay);
      applyI18n();
    }
    // Tier-3 auto-провайдер: baked overlay (Зал) → live Dicta по consent (library-ui.js:697-724)
    function makeContextProvider() {
      return async function (sentence, surface) {
        var consent = contextConsent();
        if (consent === "declined") return null;
        var ov = getContextOverlay();
        if (ov && window.ReaderMorph && window.ReaderMorph.overlayContext) {
          var r0 = window.ReaderMorph.overlayContext(ov, String(sentence || ""), surface);
          if (r0 && r0.ctx) return r0.ctx;
          if (r0 && r0.authoritative) return null;
        }
        // R4 (P0-10): no modal over the first word card. Undecided → the offline reading; the card
        // offers «Уточнить в контексте» (one-off or for all words) and Аа holds the switch.
        if (consent !== "granted") return null;
        var key = String(sentence || "");
        if (!key || !window.ReaderDicta) return null;
        var p = _ctxCache.get(key);
        if (!p) { p = window.ReaderDicta.analyzeSentence(key).catch(function () { return null; }); _ctxCache.set(key, p); }
        var res = await p;
        if (!res || !res.ok || res.degraded || !Array.isArray(res.tokens)) return null;
        var tok = window.ReaderDicta.tokenForSurface(res.tokens, surface);
        return (tok && tok.niqqud) ? { niqqud: tok.niqqud, posDicta: tok.posDicta, lemma: tok.lemma, st: tok.stem || "", source: "live" } : null;
      };
    }
    // per-card разовый refine (Epic-2 #2; подтверждение в карточке = consent)
    function canRefine() { try { return !!navigator.onLine && contextConsent() !== "granted"; } catch (_) { return false; } }
    function makeRefineProvider() {
      return async function (sentence, surface) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
        var key = String(sentence || "");
        if (!key || !window.ReaderDicta) return null;
        var p = _ctxCache.get(key);
        if (!p) { p = window.ReaderDicta.analyzeSentence(key).catch(function () { return null; }); _ctxCache.set(key, p); }
        var res = await p;
        if (!res || !res.ok || res.degraded || !Array.isArray(res.tokens)) return null;
        var tok = window.ReaderDicta.tokenForSurface(res.tokens, surface);
        return (tok && tok.niqqud) ? { niqqud: tok.niqqud, posDicta: tok.posDicta, lemma: tok.lemma, st: tok.stem || "", source: "live" } : null;
      };
    }

    // ── Заметки (note-formation; library-ui.js:2551-2699) ──────────────────────
    function noteBody(card) {
      var body = {
        word: card.word || "", niqqud_variant: card.niqqud || "",
        root: card.root || "", lemma: card.lemma || "",
        pos: card.pos || "", part_of_speech: card.pos || "",
        binyan: card.binyan || "", meaning: card.meaning || "",
      };
      if (card.pealim_id) body.pealim_id = String(card.pealim_id);
      return body;
    }
    function dedupKey(card) {
      try { return window.NotesAutoGen ? window.NotesAutoGen.dedupKey(noteBody(card)) : ""; } catch (_) { return ""; }
    }
    async function lookupNote(card) {
      var dk = dedupKey(card);
      if (!dk) return null;
      var ldb = await ldbOf();
      var note; try { note = await ldb.findNoteByDedupKey(dk); } catch (_) { note = null; }
      if (!note) return null;
      var life = {}; try { life = await ldb.getWordNoteLifecycle([note.id]); } catch (_) {}
      return { noteId: note.id, status: (life && life[note.id] && life[note.id].status) || "created" };
    }
    async function loadWordNote(card) {
      var dk = dedupKey(card);
      if (!dk) return null;
      var ldb = await ldbOf();
      var note; try { note = await ldb.findNoteByDedupKey(dk); } catch (_) { note = null; }
      if (!note) return null;
      var body = {}; try { body = JSON.parse(note.body_json || "{}"); } catch (_) { body = {}; }
      var meaningIsUser = body.meaning_source === "user";
      return {
        noteId: note.id,
        meaning: meaningIsUser ? String(body.meaning || "") : "",
        referenceMeaning: String(body.reference_meaning || (!meaningIsUser ? body.meaning : "") || ""),
        mnemonic: String(body.mnemonic || ""),
        example: String(body.example_sentence || ""),
        userTouched: Number(note.user_touched) === 1,
      };
    }
    async function saveWord(card, occ) {
      var body = noteBody(card);
      var dk = dedupKey(card);
      if (!dk) return null;
      var ldb = await ldbOf();
      var note; try { note = await ldb.findNoteByDedupKey(dk); } catch (_) { note = null; }
      if (!note) {
        try {
          note = await ldb.createCanonicalNote({
            gen_dedup_key: dk, body: body, title: body.word || "", source: "curated",
            confidence: typeof card.confidence === "number" ? card.confidence : null,
            model_version: (window.InflectionDict && window.InflectionDict.MODEL) || null,
            user_touched: 0,
          });
        } catch (e) { try { console.warn("[morph-host] save note failed", e); } catch (_) {} return null; }
      }
      if (note && occ && (occ.text_id || occ.sentence_id)) {
        try { await ldb.addNoteOccurrence(note.id, { text_id: occ.text_id, sentence_id: occ.sentence_id, word_offset: occ.word_offset, surface: occ.surface }); } catch (_) {}
      }
      invalidateWordStates();
      onProfileChanged();
      toast(_tt("room.morph.savedToast", "Добавлено в мои слова"));
      if (!note) return { status: "created" };
      var life = {}; try { life = await ldb.getWordNoteLifecycle([note.id]); } catch (_) {}
      return { noteId: note.id, status: (life && life[note.id] && life[note.id].status) || "created" };
    }
    async function lookupUserMeaning(card) {
      var dk = dedupKey(card);
      if (!dk) return "";
      var ldb = await ldbOf();
      var note; try { note = await ldb.findNoteByDedupKey(dk); } catch (_) { note = null; }
      if (!note) return "";
      var body = {}; try { body = JSON.parse(note.body_json || "{}"); } catch (_) { body = {}; }
      return (body && body.meaning_source === "user" && body.meaning) ? String(body.meaning) : "";
    }
    async function saveUserMeaning(card, occ, meaning) {
      var m = String(meaning || "").trim();
      var dk = dedupKey(card);
      if (!dk || !m) return null;
      var body = noteBody(card);
      body.meaning = m;
      body.meaning_source = "user";   // R9 provenance — user-asserted, never machine
      var ldb = await ldbOf();
      var note; try { note = await ldb.findNoteByDedupKey(dk); } catch (_) { note = null; }
      if (note) {
        try { await ldb.updateNote(note.id, { body: body, user_touched: 1 }); } catch (e) { try { console.warn("[morph-host] update meaning failed", e); } catch (_) {} return null; }
      } else {
        try {
          note = await ldb.createCanonicalNote({
            gen_dedup_key: dk, body: body, title: body.word || "", source: "curated",
            confidence: typeof card.confidence === "number" ? card.confidence : null,
            model_version: (window.InflectionDict && window.InflectionDict.MODEL) || null,
            user_touched: 1,
          });
        } catch (e) { try { console.warn("[morph-host] save meaning failed", e); } catch (_) {} return null; }
      }
      if (note && occ && (occ.text_id || occ.sentence_id)) {
        try { await ldb.addNoteOccurrence(note.id, { text_id: occ.text_id, sentence_id: occ.sentence_id, word_offset: occ.word_offset, surface: occ.surface }); } catch (_) {}
      }
      invalidateWordStates();
      onProfileChanged();
      toast(_tt("room.morph.meaningSavedToast", "Перевод сохранён"));
      return { ok: true };
    }
    async function saveWordPersonal(card, occ, fields) {
      var dk = dedupKey(card);
      if (!dk) return null;
      var ldb = await ldbOf();
      var note; try { note = await ldb.findNoteByDedupKey(dk); } catch (_) { note = null; }
      var body = noteBody(card);
      if (note) {
        try { body = Object.assign(body, JSON.parse(note.body_json || "{}")); } catch (_) {}
      }
      var f = fields || {};
      var previousMeaning = String(body.meaning || "").trim();
      if (previousMeaning && body.meaning_source !== "user" && !body.reference_meaning) {
        body.reference_meaning = previousMeaning;
      }
      body.meaning = String(f.meaning || "").trim();
      body.mnemonic = String(f.mnemonic || "").trim();
      body.example_sentence = String(f.example || "").trim();
      if (body.meaning) body.meaning_source = "user";
      else {
        delete body.meaning_source;
        if (body.reference_meaning) body.meaning = String(body.reference_meaning);
      }
      if (note) {
        try { await ldb.updateNote(note.id, { body: body, user_touched: 1 }); }
        catch (e) { try { console.warn("[morph-host] update personal note failed", e); } catch (_) {} return null; }
      } else {
        try {
          note = await ldb.createCanonicalNote({
            gen_dedup_key: dk, body: body, title: body.word || "", source: "user",
            confidence: typeof card.confidence === "number" ? card.confidence : null,
            model_version: (window.InflectionDict && window.InflectionDict.MODEL) || null,
            user_touched: 1,
          });
        } catch (e) { try { console.warn("[morph-host] create personal note failed", e); } catch (_) {} return null; }
      }
      if (note && occ && (occ.text_id || occ.sentence_id)) {
        try { await ldb.addNoteOccurrence(note.id, { text_id: occ.text_id, sentence_id: occ.sentence_id, word_offset: occ.word_offset, surface: occ.surface }); } catch (_) {}
      }
      invalidateWordStates();
      onProfileChanged();
      toast(_tt("room.morph.note.savedToast", "Личная заметка обновлена"));
      var life = {}; try { life = await ldb.getWordNoteLifecycle([note.id]); } catch (_) {}
      return { noteId: note.id, status: (life && life[note.id] && life[note.id].status) || "created" };
    }

    // ── source-at-mark (R1, ROOM_DUE_CONTINUITY §3) — verified-only ────────────
    async function occToVerifiedSource(occ) {
      if (!occ || !occ.surface) return null;
      if (occ.source_kind) {
        if (!verifyOccurrence) return null;
        try { return (await verifyOccurrence(occ)) || null; } catch (_) { return null; }
      }
      var sid = occ.sentence_id != null ? String(occ.sentence_id) : null;
      var oix = occ.order_index != null ? Number(occ.order_index) : null;
      var tk = null;
      try { tk = (await getTextKey(occ)) || null; } catch (_) { tk = null; }
      if (!sid && !(tk && oix != null)) return null;
      try { var ldb = await ldbOf(); if (!(await ldb.getSentenceForReview(sid, tk, oix))) return null; } catch (_) { return null; }
      return { textKey: tk, sentenceId: sid, orderIndex: oix, surface: String(occ.surface) };
    }

    // ── Ручная метка (P5.6 R-2a) — сеет FSRS oracle-clean (library-ui.js:5242) ─
    async function markWordStatus(lemmaKey, status, source) {
      var ldb = await ldbOf();
      try { await ldb.setWordStatus(lemmaKey, status); } catch (_) {}
      var isLevel = /^l[1-4]$/.test(String(status || ""));
      try {
        var R = window.ReaderMorph, FC = window.FsrsCore, LC = window.LemmaCanon;
        if (isLevel && lemmaKey && R && R.manualMarkSeed && FC && LC) {
          var sched = (await ldb.getSrsSchedule()) || {};
          if (!sched[lemmaKey]) {   // never move a stored due
            if (await ldb.hasSeedRow(lemmaKey)) {
              // исторический seed без расписания → restore из replay, второй seed не минтим
              try { await ldb.recomputeSrsFromLog([lemmaKey]); } catch (_) {}
            } else {
              var now = Date.now();
              var seed = R.manualMarkSeed(FC, status, now);
              if (seed) {
                var seedMeta = Object.assign({}, seed.seedMeta, { keyer_version: LC.KEYER_VERSION });
                var res = await ldb.appendReviewLog({
                  id: LC.seedId ? LC.seedId(lemmaKey, seedMeta) : ("seed:" + lemmaKey),
                  item_key: lemmaKey, kind: "seed",
                  reviewed_at: new Date(now).toISOString(), grade: null, source: "seed-manual",
                  meta: seedMeta,
                });
                if (res && res.accepted === 1) await ldb.setWordStatus(lemmaKey, status, seed.sched, source || null);   // R1 — seed несёт source метки
              }
            }
          }
        }
      } catch (_) {}
      // R1 — backfill source на уже-запланированном слове (fillOnly: do-no-harm)
      if (isLevel && source) { try { await ldb.updateSrsSource(lemmaKey, Object.assign({}, source, { fillOnly: true })); } catch (_) {} }
      if (!isLevel) return null;
      try { var s = (await ldb.getSrsSchedule()) || {}; return s[lemmaKey] ? { dueMs: s[lemmaKey].due } : null; }
      catch (_) { return null; }
    }

    // ── Статистика тапов (P6; ОБЩИЙ ключ обеих поверхностей) ───────────────────
    function bumpTapStat(kind) {
      try {
        var s = JSON.parse(localStorage.getItem("room.readingTap.stats") || "{}");
        s[kind] = (Number(s[kind]) || 0) + 1;
        localStorage.setItem("room.readingTap.stats", JSON.stringify(s));
      } catch (_) {}
    }

    // ── Оценка reading-tap (Retention P5; library-ui.js:5399) ──────────────────
    // D8(a): ручной уровень НЕ двигается; P4.1: srs-carrier персистится srs-only.
    async function gradeReadingTap(card, occ, correct, prev) {
      if (!card || !card.lemmaKey) return null;
      var ldb = await ldbOf();
      var now = Date.now();
      var fs = window.ReaderMorph.fsrsStep ? window.ReaderMorph.fsrsStep(window.FsrsCore, prev || null, correct, now) : null;
      var sched = fs ? fs.sched : window.ReaderMorph.nextSrs(prev || null, correct, now);
      var src = null;
      try { src = await occToVerifiedSource(occ); } catch (_) {}
      var cur = card.manualStatus || "";
      if (!cur) { try { cur = (await ldb.getWordStatus(card.lemmaKey)) || ""; } catch (_) {} }
      if (cur && cur !== "ignore") { try { await ldb.setWordStatus(card.lemmaKey, cur, sched, src); } catch (_) {} }
      else if (!cur) {
        try { await ldb.updateSrsState(card.lemmaKey, sched); } catch (_) {}
        if (src) { try { await ldb.updateSrsSource(card.lemmaKey, src); } catch (_) {} }
      }
      try {
        var LC = window.LemmaCanon;
        if (LC) {
          if (fs && fs.seeded && !(await ldb.hasSeedRow(card.lemmaKey))) {
            var seedMeta = Object.assign({}, fs.seedMeta, { keyer_version: LC.KEYER_VERSION });
            await ldb.appendReviewLog({
              id: LC.seedId ? LC.seedId(card.lemmaKey, seedMeta) : ("seed:" + card.lemmaKey),
              item_key: card.lemmaKey, kind: "seed",
              reviewed_at: new Date(now - 1).toISOString(), grade: null, source: "seed-sm2",
              meta: seedMeta,
            });
          }
          var tk = src && src.textKey ? src.textKey : null;
          // An explicit external source is all-or-nothing. If its immutable anchor did
          // not verify, never relabel the encounter as the currently open condition.
          if (!tk && !(occ && occ.source_kind)) { try { tk = (await getTextKey(occ)) || null; } catch (_) {} }
          var row = {
            item_key: card.lemmaKey, kind: "review",
            reviewed_at: new Date(now).toISOString(), grade: correct ? 3 : 1,
            source: "reading-tap", channel: "reading:tap",
            meta: {
              surface: card.word || undefined,
              pos: card.pos || undefined,
              text_key: tk || undefined,
              confidence: card.label || undefined,
              keyer_version: LC.KEYER_VERSION,
              scheduler: fs
                ? { scheme: "fsrs", engine_version: window.FsrsCore.ENGINE_VERSION, request_retention: window.FsrsCore.REQUEST_RETENTION }
                : { scheme: "sm2-lite" },
            },
          };
          row.id = LC.reviewId(row);
          await ldb.appendReviewLog(row);
        }
      } catch (_) {}
      bumpTapStat("graded");
      try { await ldb.recordRecall(env.dayStr ? env.dayStr() : "", getDueNowCount() || 0); } catch (_) {}
      // оригинал (library-ui 5452-5454) НЕ инвалидировал кэш статусов — оценка не меняет статус;
      // перекраска/бейджи — забота поверхности
      onProfileChanged();
      return sched;
    }

    // Ф4 · Д7.2 once per device: marks on spelling keys move to the lemma (ReaderMorph.migrateSpellingMarks), in the
    // background after the page settles; one tab at a time (Web Lock). A moved mark repaints the word states.
    // the lexicon first (a paint before it keys an unread word by its spelling; the repaint after it agrees with the list)
    var _onDictaLexicon = function () { invalidateWordStates(); try { onProfileChanged(); } catch (_) {} };
    function ensureDictaLexicon() { return _loadDictaLexicon(ldbOf, _onDictaLexicon); }
    // after new Dicta parses were saved (Studio «Обогатить», the dictionary's «Разобрать через Dicta», an import)
    function refreshDictaLexicon() {
      _dictaLexPromise = null; _dictaLexCalled = [];
      // Д10: new Dicta parses change the places too
      try { if (window.ReaderMorph && window.ReaderMorph.invalidatePlaces) window.ReaderMorph.invalidatePlaces(); } catch (_) {}
      return ensureDictaLexicon();
    }
    // in the page's idle time, not during its own start-up reads and writes (the dictionary awaits it explicitly; the
    // Room repaints when it lands)
    try {
      if (typeof window !== "undefined") {
        var kick = function () { ensureDictaLexicon(); };
        if (typeof window.requestIdleCallback === "function") setTimeout(function () { window.requestIdleCallback(kick, { timeout: 4000 }); }, 1500);
        else setTimeout(kick, 2500);
      }
    } catch (_) {}
    // К-4: new personal texts get Dicta's parse in the background — only with the learner's automatic-parse consent
    // (DictaEnrich); Д8-К4 v2 · К4.5 a slow trickle (DictaEnrich.TRICKLE: a session budget, a pause between requests,
    // only while the page is visible); the lexicon is refolded after it
    function scheduleAutoParse(delayMs) {
      if (_autoParseScheduled || typeof window === "undefined" || !window.DictaEnrich || !window.DictaEnrich.hasAuto()) return;
      _autoParseScheduled = true;
      setTimeout(function () {
        var run = async function () {
          try {
            var r = await window.DictaEnrich.autoEnrich(await ldbOf(), { shouldContinue: function () { return typeof document === "undefined" || document.visibilityState === "visible"; } });
            if (r && r.enriched) await refreshDictaLexicon();
          } catch (e) { try { console.warn("[dicta-autoparse]", e); } catch (_) {} }
        };
        try {
          if (navigator.locks && navigator.locks.request) navigator.locks.request("lp-dicta-autoparse", { ifAvailable: true }, function (lock) { return lock ? run() : null; });
          else run();
        } catch (_) { run(); }
      }, delayMs == null ? 8000 : delayMs);
    }
    scheduleAutoParse();
    // the learner just said yes (DictaAutoParseOffer): start now, not at the next start-up
    try { if (typeof window !== "undefined") window.addEventListener("lp:dicta-autoparse-granted", function () { scheduleAutoParse(1500); }); } catch (_) {}
    if (!_identityMigrationScheduled && typeof window !== "undefined" && window.ReaderMorph && typeof window.ReaderMorph.migrateSpellingMarks === "function") {
      _identityMigrationScheduled = true;
      setTimeout(function () {
        var run = async function () {
          try {
            var r = await window.ReaderMorph.migrateSpellingMarks(await ldbOf());
            if (r && r.moved) { invalidateWordStates(); try { onProfileChanged(); } catch (_) {} }
            // Ф4 · Д9.2: marks follow the word the learner saw — after the Dicta lexicon (rules A2/B read it)
            if (typeof window.ReaderMorph.migrateIdentityD9 === "function") {
              await ensureDictaLexicon();
              var r9 = await window.ReaderMorph.migrateIdentityD9(await ldbOf());
              if (r9 && (r9.copied || r9.cleared)) { invalidateWordStates(); try { onProfileChanged(); } catch (_) {} }
              // Ф4 · Д10.2: the same for the place keys (a homograph read by its sentence)
              var r10 = await window.ReaderMorph.migrateIdentityD9(await ldbOf(), { places: true });
              if (r10 && (r10.copied || r10.cleared)) { invalidateWordStates(); try { onProfileChanged(); } catch (_) {} }
            }
          } catch (e) { try { console.warn("[identity] migration", e); } catch (_) {} }
        };
        try {
          if (navigator.locks && navigator.locks.request) navigator.locks.request("lp-identity-migration", { ifAvailable: true }, function (lock) { return lock ? run() : null; });
          else run();
        } catch (_) { run(); }
      }, 6000);
    }
    return {
      ensureWordStates: ensureWordStates,
      invalidateWordStates: invalidateWordStates,
      peekWordStates: peekWordStates,
      primeWordStates: primeWordStates,
      speakWord: speakWord,
      playUrl: playUrl,
      stopAudio: stopAudio,
      contextConsent: contextConsent,
      contextConsentSet: contextConsentSet,
      grantContextConsent: grantContextConsent,
      promptContextConsent: promptContextConsent,
      clearCtxCache: clearCtxCache,
      makeContextProvider: makeContextProvider,
      makeRefineProvider: makeRefineProvider,
      canRefine: canRefine,
      noteBody: noteBody,
      dedupKey: dedupKey,
      lookupNote: lookupNote,
      loadWordNote: loadWordNote,
      saveWord: saveWord,
      saveWordPersonal: saveWordPersonal,
      lookupUserMeaning: lookupUserMeaning,
      saveUserMeaning: saveUserMeaning,
      occToVerifiedSource: occToVerifiedSource,
      markWordStatus: markWordStatus, ensureDictaLexicon: ensureDictaLexicon, refreshDictaLexicon: refreshDictaLexicon,
      corpusParseSoon: function (textId) { return _corpusParseSoon(ldbOf, textId).catch(function () { return null; }); },
      bumpTapStat: bumpTapStat,
      gradeReadingTap: gradeReadingTap,
    };
  }

  // O-083: TextKeyScan waits for the SAME lexicon promise before a card scan (a scan before it keys words wrongly)
  var api = { createHost: createHost, loadDictaLexicon: function (ldbOf) { return _loadDictaLexicon(ldbOf); } };
  if (typeof window !== "undefined") window.MorphHost = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
