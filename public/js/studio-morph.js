// public/js/studio-morph.js — Студия: «Статус слов» + морф-карточка ReaderMorph на тапе.
//
// Спека: docs/superpowers/specs/2026-08-05-studio-word-status-morph-card-design.md.
// Тонкий адаптер над ОБЩИМ хостом памяти слова (morph-host.js — одна реализация с Залом,
// форк запрещён) и ReaderMorph. Табличный билдер renderTable БАЙТ-ЗАМОРОЖЕН гейтом
// smoke:reader-parity — поэтому здесь ТОЛЬКО post-render: обёртка window.renderTable
// (прецедент studio-agent.wrapRenderTable) + идемпотентный wrap/decorate.
//
// Несохранённые карточки текста: раскраска — чтение ГЛОБАЛЬНОГО профиля word_status
// (по лемме), ничего не пишет; ручная метка пишется глобально и «доживает» до
// сохранения автоматически. source-at-mark до сохранения честно пуст (нет verified-
// предложения в OPFS) — после сохранения лечится штатным R4 heal-drain Зала.
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;

  var LS_KEY = "studio.wordStatus";

  function tt(key, fallback) {
    try { if (typeof window.t === "function") { var v = window.t(key); if (v && v !== key) return v; } } catch (_) {}
    return fallback;
  }

  // Первое чтение наследует тумблер Зала (inherit-once), дальше поверхности независимы.
  function wordStatusEnabled() {
    try {
      var v = localStorage.getItem(LS_KEY);
      if (v === null) {
        v = localStorage.getItem("room.wordStatus") === "1" ? "1" : "0";
        localStorage.setItem(LS_KEY, v);
      }
      return v === "1";
    } catch (_) { return false; }
  }
  function wordStatusSet(v) { try { localStorage.setItem(LS_KEY, v ? "1" : "0"); } catch (_) {} }

  var reviewDialog = null, reviewWords = [], reviewLedger = [], reviewReturnFocus = null, reviewBusy = false;
  function _reviewEl(tag, cls, text) {
    var node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node;
  }
  function _reviewResult(text) { var out = reviewDialog && reviewDialog.querySelector("[data-result]"); if (out) out.textContent = text || ""; }
  function _renderReviewWords() {
    if (!reviewDialog) return;
    var list = reviewDialog.querySelector("[data-list]"); if (!list) return;
    list.innerHTML = "";
    reviewWords.forEach(function (word) {
      var row = _reviewEl("div", "studio-word-review-row"); row.setAttribute("data-studio-review-row", "1"); row.setAttribute("data-assessment", word.assessment || "unassessed");
      var he = _reviewEl("span", "studio-word-review-he", word.niqqud || word.surface || ""); he.lang = "he"; he.dir = "rtl"; row.appendChild(he);
      row.appendChild(_reviewEl("span", "studio-word-review-gloss", (word.gloss || "") + (word.freq > 1 ? " · ×" + word.freq : "")));
      var tag = _reviewEl("span", "studio-word-review-tag" + (word.assessment === "explicit_new" ? " is-new" : ""), word.assessment === "explicit_new" ? tt("room.morph.study.explicitNew", "явно новое") : tt("room.morph.study.unassessed", "не оценено"));
      tag.setAttribute("data-i18n", word.assessment === "explicit_new" ? "room.morph.study.explicitNew" : "room.morph.study.unassessed"); row.appendChild(tag);
      list.appendChild(row);
    });
    if (!reviewWords.length) list.appendChild(_reviewEl("p", "studio-word-review-note", tt("room.morph.study.empty", "Нет слов для разбора.")));
    var count = reviewDialog.querySelector("[data-count]"); if (count) count.textContent = tt("room.morph.study.total", "Слов для разбора") + ": " + reviewWords.length;
    var mark = reviewDialog.querySelector("#studioWordReviewMarkNew"); if (mark) mark.disabled = !reviewWords.some(function (w) { return w.assessment === "unassessed"; });
  }
  async function _loadReviewWords() {
    var mount = document.getElementById("tableContainer"), h = ensureHost();
    if (!mount || !h || !window.ReaderMorph || typeof window.ReaderMorph.collectNewWords !== "function") { reviewWords = []; _renderReviewWords(); return; }
    _reviewResult(tt("room.morph.study.loading", "Собираю слова…"));
    try { reviewWords = await window.ReaderMorph.collectNewWords(mount, (await h.ensureWordStates()) || {}); } catch (_) { reviewWords = []; }
    _reviewResult(""); _renderReviewWords();
  }
  async function _markReviewNew() {
    if (reviewBusy) return;
    var targets = reviewWords.filter(function (w) { return w.assessment === "unassessed"; });
    if (!targets.length) return;
    var prompt = tt("room.morph.study.bulkNewConfirm", "Отметить как явно новые: {count}?").replace("{count}", String(targets.length));
    if (!window.confirm(prompt)) return;
    reviewBusy = true;
    var markButton = reviewDialog && reviewDialog.querySelector("#studioWordReviewMarkNew"); if (markButton) markButton.disabled = true;
    var h = ensureHost(), db = await _ldb(), made = [], failed = [];
    for (var i = 0; i < targets.length; i++) {
      var w = targets[i], before = "";
      try { before = await db.getWordStatus(w.lemmaKey); } catch (_) {}
      if (before) { failed.push(w.lemmaKey); continue; }
      try { await h.markWordStatus(w.lemmaKey, "new", null); } catch (_) {}
      var after = ""; try { after = await db.getWordStatus(w.lemmaKey); } catch (_) {}
      if (after === "new") { made.push(w.lemmaKey); w.assessment = "explicit_new"; } else failed.push(w.lemmaKey);
    }
    reviewLedger = made.slice(); h.invalidateWordStates(); refreshDecorations(); reviewBusy = false; _renderReviewWords();
    _reviewResult(tt("room.morph.study.bulkNewResult", "Отмечено новыми: {ok}; не изменено: {failed}").replace("{ok}", String(made.length)).replace("{failed}", String(failed.length)));
    var undo = reviewDialog.querySelector("#studioWordReviewUndo"); if (undo) undo.hidden = !reviewLedger.length;
  }
  async function _undoReviewNew() {
    if (reviewBusy) return;
    reviewBusy = true;
    var db = await _ldb(), h = ensureHost(), cleared = 0, skipped = 0;
    for (var i = 0; i < reviewLedger.length; i++) {
      var key = reviewLedger[i], cur = ""; try { cur = await db.getWordStatus(key); } catch (_) {}
      if (cur !== "new") { skipped++; continue; }
      try { await h.markWordStatus(key, "", null); } catch (_) {}
      var after = ""; try { after = await db.getWordStatus(key); } catch (_) {}
      if (!after) { cleared++; var word = reviewWords.find(function (w) { return w.lemmaKey === key; }); if (word) word.assessment = "unassessed"; } else skipped++;
    }
    reviewLedger = []; h.invalidateWordStates(); refreshDecorations(); reviewBusy = false; _renderReviewWords();
    var undo = reviewDialog.querySelector("#studioWordReviewUndo"); if (undo) undo.hidden = true;
    _reviewResult(tt("room.morph.study.bulkUndoResult", "Отменено: {ok}; пропущено изменённых позже: {skipped}").replace("{ok}", String(cleared)).replace("{skipped}", String(skipped)));
  }
  function _closeReviewWords() { if (reviewDialog) reviewDialog.hidden = true; try { if (reviewReturnFocus && reviewReturnFocus.focus) reviewReturnFocus.focus(); } catch (_) {} reviewReturnFocus = null; }
  function _ensureReviewDialog() {
    if (reviewDialog) return reviewDialog;
    var shell = _reviewEl("div", "studio-word-review"); shell.id = "studioWordReviewDialog"; shell.hidden = true; shell.setAttribute("role", "dialog"); shell.setAttribute("aria-modal", "true"); shell.setAttribute("aria-label", tt("room.morph.study.title", "Разобрать слова"));
    var backdrop = _reviewEl("div", "studio-word-review-backdrop"); backdrop.addEventListener("click", _closeReviewWords); shell.appendChild(backdrop);
    var card = _reviewEl("section", "studio-word-review-card");
    var head = _reviewEl("div", "studio-word-review-head"); var heading = _reviewEl("h2", "", tt("room.morph.study.title", "📚 Разобрать слова")); heading.setAttribute("data-i18n", "room.morph.study.title"); head.appendChild(heading);
    var close = _reviewEl("button", "studio-word-review-close", "✕"); close.id = "studioWordReviewClose"; close.type = "button"; close.setAttribute("aria-label", tt("room.morph.close", "Закрыть")); close.setAttribute("data-i18n-aria-label", "room.morph.close"); close.addEventListener("click", _closeReviewWords); head.appendChild(close); card.appendChild(head);
    var note = _reviewEl("p", "studio-word-review-note", tt("room.morph.study.countHelp", "Распознанные, но не оценённые слова не считаются новыми, пока вы не подтвердите это.")); note.setAttribute("data-i18n", "room.morph.study.countHelp"); card.appendChild(note);
    var count = _reviewEl("p", "studio-word-review-note", ""); count.setAttribute("data-count", "1"); card.appendChild(count);
    var list = _reviewEl("div", "studio-word-review-list"); list.setAttribute("data-list", "1"); card.appendChild(list);
    var result = _reviewEl("p", "studio-word-review-result", ""); result.setAttribute("data-result", "1"); result.setAttribute("aria-live", "polite"); card.appendChild(result);
    var actions = _reviewEl("div", "studio-word-review-actions");
    var undo = _reviewEl("button", "", tt("room.morph.study.undo", "Отменить")); undo.id = "studioWordReviewUndo"; undo.type = "button"; undo.hidden = true; undo.setAttribute("data-i18n", "room.morph.study.undo"); undo.addEventListener("click", _undoReviewNew); actions.appendChild(undo);
    var mark = _reviewEl("button", "primary", tt("room.morph.study.bulkNew", "Отметить как новые")); mark.id = "studioWordReviewMarkNew"; mark.type = "button"; mark.setAttribute("data-i18n", "room.morph.study.bulkNew"); mark.addEventListener("click", _markReviewNew); actions.appendChild(mark); card.appendChild(actions);
    shell.appendChild(card); document.body.appendChild(shell); reviewDialog = shell; return shell;
  }
  document.addEventListener("keydown", function (event) {
    if (!reviewDialog || reviewDialog.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); _closeReviewWords(); return; }
    if (event.key !== "Tab") return;
    var focusable = Array.prototype.slice.call(reviewDialog.querySelectorAll("button:not([disabled]):not([hidden])"));
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  async function openReviewWords() { attachOnce(); var dialog = _ensureReviewDialog(); reviewReturnFocus = document.activeElement; reviewLedger = []; dialog.hidden = false; var undo = dialog.querySelector("#studioWordReviewUndo"); if (undo) undo.hidden = true; await _loadReviewWords(); try { dialog.querySelector("#studioWordReviewClose").focus(); } catch (_) {} }

  // OPFS local-db: паттерн studio-retell.js (index.html выставляет window.ensureLocalDB).
  async function _ldb() {
    try {
      if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
      if (typeof window.ensureLocalDB === "function") return await window.ensureLocalDB();
      return window.__localDB || null;
    } catch (_) { return window.__localDB || null; }
  }

  // text_key активного СОХРАНЁННОГО текста — живой резолв НА ОБРАЩЕНИИ (кэшированные
  // индексы протухают при реордере — критика wf_7f300c39; паттерн studio-agent.resolveAnchor).
  async function _textKey(explicitTextId) {
    try {
      var tid = explicitTextId || window.v3ActiveTextId || null;
      if (!tid) {
        var pt = document.getElementById("proTable");
        tid = (pt && pt.dataset && pt.dataset.textId) ? pt.dataset.textId : null;
      }
      if (!tid) return null;
      var ldb = await _ldb(); if (!ldb || typeof ldb.getTextById !== "function") return null;
      var text = await ldb.getTextById(String(tid));
      return (text && text.text_key) ? String(text.text_key) : null;
    } catch (_) { return null; }
  }

  // A saved decision from «Проверка морфологии» is occurrence-bound. Studio
  // reads the same append-only event as Reading Room instead of forcing a
  // second write into word_study. Missing/stale coordinates stay fail-closed:
  // no spelling-wide or lemma-wide propagation is permitted here.
  async function lookupLexicalResolution(_card, occurrence, row) {
    if (!occurrence || !window.LexicalResolutionService || !window.LexicalResolutionCore ||
        typeof window.LexicalResolutionService.lookupExactOccurrence !== "function") return null;
    var ldb = await _ldb();
    if (!ldb) return null;
    var exact = Object.assign({}, occurrence);
    exact.text_id = String(exact.text_id || (row && row._v3_textId) || "");
    exact.sentence_id = String(exact.sentence_id || (row && row._v3_sentenceId) || "");
    if (exact.order_index == null && row) {
      var rowOrder = row._v3_orderIndex != null ? row._v3_orderIndex : row.order_index;
      if (rowOrder != null && Number.isFinite(Number(rowOrder))) exact.order_index = Number(rowOrder);
    }
    // Older saved Studio rows could carry stable IDs but omit order_index.
    // Recover it from the canonical sentence table; never infer it from the
    // current visual row position, which can change after reordering.
    if (exact.order_index == null && exact.text_id && exact.sentence_id && typeof ldb.getSentences === "function") {
      try {
        var sentences = await ldb.getSentences(exact.text_id);
        var sentence = (sentences || []).find(function (item) {
          return String(item && (item.id || item.sentence_id) || "") === exact.sentence_id;
        });
        if (sentence && sentence.order_index != null && Number.isFinite(Number(sentence.order_index))) {
          exact.order_index = Number(sentence.order_index);
        }
      } catch (_) {}
    }
    exact.text_key = String(exact.text_key || await _textKey(exact.text_id) || "");
    if (!exact.text_id || !exact.sentence_id || !exact.text_key || exact.order_index == null ||
        !Number.isInteger(Number(exact.word_offset)) || Number(exact.word_offset) < 0) return null;
    return window.LexicalResolutionService.lookupExactOccurrence(exact, ldb, window.LexicalResolutionCore);
  }

  function _localDayStr(d) {
    var x = d || new Date();
    var m = String(x.getMonth() + 1).padStart(2, "0"), dd = String(x.getDate()).padStart(2, "0");
    return x.getFullYear() + "-" + m + "-" + dd;
  }

  var host = null;
  function ensureHost() {
    if (host || !window.MorphHost) return host;
    host = window.MorphHost.createHost({
      ldb: _ldb,
      getTextKey: _textKey,
      toast: function (m) { try { if (typeof window.showToast === "function") window.showToast(m); } catch (_) {} },
      onProfileChanged: function () { try { refreshDecorations(); } catch (_) {} },
      getTtsKey: function () {
        try { return (typeof window.gcpTtsKeyGet === "function") ? window.gcpTtsKeyGet() : (localStorage.getItem("v3.gcpTtsApiKey") || ""); }
        catch (_) { return ""; }
      },
      resolvePublicWordAudio: function (text) {
        return window.PublicWordAudio && window.PublicWordAudio.resolve(text);
      },
      dayStr: function () { return _localDayStr(); },
      getDueNowCount: function () { return 0; },      // студийного due-бейджа нет (v1)
      getContextOverlay: function () { return null; }, // baked-оверлеи — корпусная механика Зала
      applyI18n: function () { try { window.applyI18n && window.applyI18n(); } catch (_) {} },
    });
    return host;
  }

  function editModeOn() {
    var t = document.getElementById("proTable");
    return !!(t && t.classList.contains("tbl-edit-mode"));
  }

  // САМОЛЕЧЕНИЕ: ячейка с data-rm-wrapped, но без .rm-w внутри (правка ячейки перезаписала
  // innerHTML) → снять флаг, wrapMount перевернёт заново на следующем refresh.
  function healStaleWrapFlags(mount) {
    var tds = mount.querySelectorAll("td[data-rm-wrapped]");
    for (var i = 0; i < tds.length; i++) {
      if (!tds[i].querySelector(".rm-w")) tds[i].removeAttribute("data-rm-wrapped");
    }
  }

  // «🤖 Объяснить (наставник)» — тот же /api/agent/explain-word, что в Зале; требует
  // СОХРАНЁННЫЙ текст (text_key + консенты облака). Несохранённый → честный отказ.
  function makeExplainWord() {
    return async function (p) {
      if (!p || !p.surface || p.orderIndex == null) {
        return { ok: false, message: tt("room.explain.err", "Не удалось получить объяснение") };
      }
      var textKey = await _textKey();
      if (!textKey) {
        return { ok: false, message: tt("classic.saveToLibraryFirst", "Сначала сохраните текст в Library") };
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return { ok: false, message: tt("room.explain.offline", "🤖 Наставник доступен онлайн — объяснение появится при подключении.") };
      }
      var ac = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = ac ? setTimeout(function () { try { ac.abort(); } catch (_) {} }, 30000) : null;
      var r = null;
      try {
        var body = { surface: p.surface, text_key: textKey, order_index: p.orderIndex, displayed: p.displayed || null };
        // BYOK: те же литералы ключей, что studio-agent.js/library-ui.js (byte-identical by design)
        try {
          var prov = localStorage.getItem("agent.byok.provider") || "";
          var key = localStorage.getItem("agent.byok.key") || "";
          if (prov && key) body.byok = { provider: prov, key: key };
        } catch (_) {}
        var opts = { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-LP-CSRF": localStorage.getItem("cloud.csrf") || "" },
          body: JSON.stringify(body) };
        if (ac) opts.signal = ac.signal;
        r = await fetch("/api/agent/explain-word", opts).then(function (x) { return x.json(); });
      } catch (_) {}
      finally { if (timer) clearTimeout(timer); }
      if (!r || !r.ok) {
        var code = (r && r.error) || "";
        var message;
        if (code === "CLOUD_TEXTS_CONSENT_REQUIRED") message = tt("room.explain.needTexts", "Сначала включите «Синхронизировать Мои тексты» в ☁ и запустите синк.");
        else if (code === "AGENT_READ_TEXTS_CONSENT_REQUIRED") message = tt("room.explain.needConsent", "Разрешите наставнику читать тексты (галочка 🤖 в доме наставника).");
        else if (!r && typeof navigator !== "undefined" && navigator.onLine === false)
          message = tt("room.explain.offline", "🤖 Наставник доступен онлайн — объяснение появится при подключении.");
        else message = "✗ " + tt("room.explain.err", "Не удалось получить объяснение") + (code ? " (" + code + ")" : "");
        return { ok: false, message: message };
      }
      var metaParts = [];
      if (r.from_history) metaParts.push(tt("room.explain.fromHistory", "из истории — без нового вызова"));
      if (r.llm_used) metaParts.push("🤖 " + (r.key_source === "byok" ? tt("room.cloud.byokProvenance", "ваш ключ") + " · " : "") + (r.provider || "") + (r.model ? " · " + r.model : ""));
      else if (!r.from_history) metaParts.push(tt("room.explain.noLlm", "без AI: перевод и морфология офлайн") + (r.degraded_reason ? " (" + r.degraded_reason + ")" : ""));
      if (r.usage && r.usage.limit) metaParts.push(tt("room.explain.usage", "AI сегодня") + ": " + r.usage.user_llm_calls + "/" + r.usage.limit);
      return { ok: true, text: r.text || "", meta: metaParts.join(" · ") };
    };
  }

  var rmAttach = null;
  function attachOnce() {
    if (rmAttach) return;
    var mount = document.getElementById("tableContainer");
    if (!mount || !window.ReaderMorph || typeof window.ReaderMorph.attach !== "function") return;
    var h = ensureHost(); if (!h) return;

    // Подавление тапа в режиме правки: наш capture-слушатель зарегистрирован РАНЬШЕ
    // reader-morph'овского на том же узле → выполняется первым; stopImmediatePropagation
    // не даёт карточке открыться, тап уходит редактору ячейки.
    mount.addEventListener("click", function (e) {
      if (!editModeOn()) return;
      var s = e.target && e.target.closest ? e.target.closest(".rm-w") : null;
      if (s) e.stopImmediatePropagation();
    }, true);

    var opts = {
      getRow: function (i) {
        try { return (window.StudioAgentHost && window.StudioAgentHost.getRow) ? window.StudioAgentHost.getRow(i) : null; }
        catch (_) { return null; }
      },
      getWordStates: function () { return ensureHost().ensureWordStates(); },
      getWordStatus: async function (lk) { try { var ldb = await _ldb(); return ldb ? await ldb.getWordStatus(lk) : ""; } catch (_) { return ""; } },
      // Канон метки (P5.6): occ → verified source → markWordStatus (FSRS-посев) → перекраска.
      // Тот же контракт, что обёртка Зала (library-ui attachReaderMorph.setWordStatus).
      setWordStatus: async function (lk, st, occ) {
        var h2 = ensureHost();
        var source = null;
        try { source = await h2.occToVerifiedSource(occ); } catch (_) {}
        var res = null;
        try { res = await h2.markWordStatus(lk, st, source); } catch (_) {}
        h2.invalidateWordStates();
        try { refreshDecorations(); } catch (_) {}
        // закрытие поповер-пути (P5.7 Т1): карточка не открыта → тихий тост о повторении
        try {
          var cardOpen = !!document.querySelector(".rm-sheet.rm-open");
          if (!cardOpen && res && res.dueMs && typeof window.showToast === "function") {
            window.showToast("🔁 " + tt("room.morph.srs.due", "Повтор запланирован"));
          }
        } catch (_) {}
        return res;
      },
      speakWord: function (t2) { return ensureHost().speakWord(t2); },
      lookupNote: function (c) { return ensureHost().lookupNote(c); },
      loadWordNote: function (c) { return ensureHost().loadWordNote(c); },
      saveWord: function (c, o) { return ensureHost().saveWord(c, o); },
      saveWordPersonal: function (c, o, f) { return ensureHost().saveWordPersonal(c, o, f); },
      lookupUserMeaning: function (c) { return ensureHost().lookupUserMeaning(c); },
      lookupLexicalResolution: lookupLexicalResolution,
      saveUserMeaning: function (c, o, m) { return ensureHost().saveUserMeaning(c, o, m); },
      contextProvider: h.makeContextProvider(),
      refineContext: h.makeRefineProvider(),
      canRefine: function () { return ensureHost().canRefine(); },
      grantContextConsent: function () { ensureHost().grantContextConsent(); },
      // Retention P5 — due-кольца и «вспомни»-режим ездят на тумблере (как в Зале).
      getDueSchedule: async function () {
        if (!wordStatusEnabled()) return null;
        try { var ldb = await _ldb(); return (await ldb.getSrsSchedule()) || {}; } catch (_) { return null; }
      },
      noteRecallShown: function () { ensureHost().bumpTapStat("shown"); },
      gradeReadingTap: function (card, occ, correct, prev) { return ensureHost().gradeReadingTap(card, occ, correct, prev); },
      explainWord: makeExplainWord(),
    };
    try { rmAttach = window.ReaderMorph.attach(mount, opts); } catch (_) { rmAttach = null; }
  }

  var _decorBusy = false, _decorDirty = false;
  async function refreshDecorations() {
    var mount = document.getElementById("tableContainer");
    if (!mount || !window.ReaderMorph) return;
    if (editModeOn()) return;                       // в режиме правки не враппим и не красим
    if (_decorBusy) { _decorDirty = true; return; } // коалесценция чанк-прогрессии
    _decorBusy = true;
    try {
      healStaleWrapFlags(mount);
      if (rmAttach && typeof rmAttach.refresh === "function") rmAttach.refresh();  // wrapMount идемпотентен
      var color = wordStatusEnabled();
      var h = ensureHost();
      var states = color && h ? (await h.ensureWordStates()) || {} : {};
      var dueSet = null;
      if (color && typeof window.ReaderMorph.dueSetFromSchedule === "function") {
        try {
          var ldb = await _ldb();
          dueSet = window.ReaderMorph.dueSetFromSchedule((await ldb.getSrsSchedule()) || {}, states || {}, Date.now());
        } catch (_) { dueSet = null; }
      }
      try { await window.ReaderMorph.decorateWords(mount, states, { color: color, fadeMode: "full", dueSet: dueSet }); } catch (_) {}
    } finally {
      _decorBusy = false;
      if (_decorDirty) { _decorDirty = false; try { refreshDecorations(); } catch (_) {} }
    }
  }

  var _t = null;
  function refresh() {
    if (_t) clearTimeout(_t);
    _t = setTimeout(function () { _t = null; attachOnce(); refreshDecorations(); }, 30);
  }

  // Пост-рендер хук: обёртка renderTable (билдер заморожен — прецедент studio-agent.js:1226).
  function wrapRenderTable() {
    var orig = window.renderTable;
    if (typeof orig !== "function" || orig.__smWrapped) return false;
    var wrapped = function () {
      var out = orig.apply(this, arguments);
      try { refresh(); } catch (_) {}
      return out;
    };
    wrapped.__smWrapped = true;
    window.renderTable = wrapped;
    try { refresh(); } catch (_) {}
    return true;
  }
  if (!wrapRenderTable()) document.addEventListener("DOMContentLoaded", wrapRenderTable);

  window.StudioMorph = {
    refresh: refresh,
    wordStatusEnabled: wordStatusEnabled,
    wordStatusSet: wordStatusSet,
    attachOnce: attachOnce,
    openReviewWords: openReviewWords,
    refreshReviewWords: _renderReviewWords,
  };
})();
