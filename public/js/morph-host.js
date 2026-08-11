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

  function createHost(env) {
    env = env || {};
    var ldbOf = typeof env.ldb === "function" ? env.ldb : async function () { return null; };
    var toast = typeof env.toast === "function" ? env.toast : function () {};
    var onProfileChanged = typeof env.onProfileChanged === "function" ? env.onProfileChanged : function () {};
    var applyI18n = typeof env.applyI18n === "function" ? env.applyI18n : function () {};
    var getTextKey = typeof env.getTextKey === "function" ? env.getTextKey : async function () { return null; };
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
    var _audio = null;
    function _browserSpeakWord(he) {
      try {
        if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return;
        var u = new SpeechSynthesisUtterance(he);
        u.lang = "he-IL"; u.rate = 0.9;
        try { var v = (window.speechSynthesis.getVoices() || []).find(function (x) { return /^(he|iw)/i.test(x.lang || ""); }); if (v) u.voice = v; } catch (_) {}
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
      } catch (_) {}
    }
    async function speakWord(text) {
      var he = String(text || "").trim();
      if (!he) return;
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
      if (!_audio) _audio = new Audio();
      try { _audio.pause(); } catch (_) {}
      _audio.src = src; await _audio.play();
    }
    function stopAudio() {
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
        if (consent !== "granted") { promptContextConsent(); return null; }
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
      toast(_tt("room.morph.savedToast", "Слово сохранено в заметки"));
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
      var sid = occ.sentence_id != null ? String(occ.sentence_id) : null;
      var oix = occ.order_index != null ? Number(occ.order_index) : null;
      var tk = null;
      try { tk = (await getTextKey()) || null; } catch (_) { tk = null; }
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
          var tk = null; try { tk = (await getTextKey()) || null; } catch (_) {}
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
      markWordStatus: markWordStatus,
      bumpTapStat: bumpTapStat,
      gradeReadingTap: gradeReadingTap,
    };
  }

  var api = { createHost: createHost };
  if (typeof window !== "undefined") window.MorphHost = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
