// public/js/studio-retell.js
// W2-S11 «Упростить до моего уровня» — graded-пересказ (дизайн
// STUDIO_INGEST_W2_S11_GRADED_RETELL_DESIGN_2026_07_28.md; замеры
// docs/research/studio-ingest-graded-retell/2026-07-28/README.md).
// Pure-ядро — dual-export (Node-тесты); браузерная часть добавляется ниже по задачам.
(function () {
  "use strict";

  // Зеркало ingest/retell.js LEVELS — совпадение сторожит tests/studioRetell.test.js
  var LEVELS = ["A1", "A2", "B1", "B2"];
  var RETELL_LEVEL_LS_KEY = "studio.retell.level";

  // Смета (R16). Константы из замера long-probe (48 514 ток. входа ← 99 950 символов ⇒
  // ~2.06 символа/токен; выход+thinking ≈ 5К ток.; $0.30/M in, $2.50/M out; wall 26 с).
  var COST = { CHARS_PER_TOKEN: 2.06, OUT_TOKENS: 5000, USD_IN: 0.30, USD_OUT: 2.5,
               SEC_BASE: 12, SEC_PER_10K_TOKENS: 6 };

  function estimateRetellCost(chars) {
    var inTok = Math.ceil((Number(chars) || 0) / COST.CHARS_PER_TOKEN);
    var usd = (inTok * COST.USD_IN + COST.OUT_TOKENS * COST.USD_OUT) / 1e6;
    var seconds = Math.round(COST.SEC_BASE + (inTok / 10000) * COST.SEC_PER_10K_TOKENS);
    return { usd: Math.max(0.01, Math.round(usd * 100) / 100), seconds: seconds };
  }

  // Паспорт для window.v3LastImportMeta. Снимок = ТЕКСТ ПЕРЕСКАЗА (флаг edited в
  // v3AttachImportSource сравнивает поле с ним). audio/captions НЕ копируются: у пересказа
  // нет соответствия исходной записи (R11), а shared-паспорт оригинала нельзя разделять
  // (односторонняя защёлка timingDropReason — дизайн §5.3).
  function buildRetellPassport(o) {
    return {
      kind: "retell",
      source: o.originLabel || o.importSource || o.savedTitle || "",
      method: "gemini-retell",
      model: o.model,
      warnings: [],
      at: new Date().toISOString(),
      textSnapshot: o.retellText,
      retell: {
        v: 1,
        level: o.level,
        derivedFrom: {
          textId: o.savedTextId || null,
          title: o.savedTitle || null,
          importKind: o.importKind || null,
          importSource: o.importSource || null,
        },
        coverage: o.coverage || null,
      },
    };
  }

  // Токен-взвешенная агрегация знакомости. items: [{key, freq}] по КОНТЕНТ-типам текста;
  // knownMap: localDb.getKnownWordStates(); cfg: {KNOWN_STATES, classifyZone} из CorpusVocab
  // (КАНОН-определение уровня — четвёртого не вводим, дизайн §1.1). Пустой профиль/пустой
  // текст → null (честно нет цифры, а не «0%» — урок silent-empty).
  function aggregateCoverage(items, knownMap, cfg) {
    if (!Array.isArray(items) || !items.length || !knownMap || !cfg) return null;
    var anyKnown = false;
    for (var k in knownMap) { if (cfg.KNOWN_STATES[knownMap[k]]) { anyKnown = true; break; } }
    if (!anyKnown) return null;
    var tokens = 0, knownTok = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], c = Number(it.freq) || 0;
      tokens += c;
      var st = knownMap[it.key];
      if (st && cfg.KNOWN_STATES[st]) knownTok += c;
    }
    if (!tokens) return null;
    var pct = knownTok / tokens;
    return { pct: pct, zone: cfg.classifyZone(pct), tokens: tokens, knownTok: knownTok };
  }

  // Частоты контент-типов текста (без DOM). functionGate возвращает {isFunc:false} для
  // контент-слов — проверять .isFunc, НЕ truthy (ловушка найдена на замерах S11).
  var MAX_COV_TOKENS = 60000, MAX_COV_TYPES = 4000;
  function collectTypeFreq(text, RM) {
    var out = new Map(), tokens = 0;
    var parts = String(text || "").split(/[^֐-׿'"׳״-]+/);
    for (var i = 0; i < parts.length; i++) {
      var t = RM.stripNiqqud(parts[i]).replace(/^["'׳״-]+|["'׳״-]+$/g, "");
      if (t.length < 2 || !/[א-ת]/.test(t)) continue;
      if (++tokens > MAX_COV_TOKENS) break;
      var g = RM.functionGate(t);
      if (g && g.isFunc) continue;               // служебные/числительные/имена — вне меры
      if (!out.has(t) && out.size >= MAX_COV_TYPES) continue;
      out.set(t, (out.get(t) || 0) + 1);
    }
    return Array.from(out, function (e) { return { surface: e[0], freq: e[1] }; });
  }

  // Браузер-аксессор к OPFS-инстансу Студии. Студия (index.html) НЕ выставляет window.localDb —
  // ensureLocalDB() определена инлайн в index.html и (как top-level function declaration
  // classic-скрипта) становится window.ensureLocalDB; сиблинг-модули (morph-provider.js,
  // knowledge-map-quiz.js) уже читают БД именно так — mirror того же пути (verify Task 4 §1:
  // grep "getKnownWordStates" НЕ нашёл window.localDb нигде в живом коде).
  async function _ldb() {
    if (typeof window === "undefined") return null;
    try {
      if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
      if (typeof window.ensureLocalDB === "function") return await window.ensureLocalDB();
      return window.__localDB || null;
    } catch (_) { return window.__localDB || null; }
  }

  // Браузер: «знакомо ~N%» для произвольного текста КАНОН-определением CorpusVocab.CFG
  // (дизайн §1.1: единственный движок уровня). null = честно нет цифры (пустой профиль,
  // нет словаря, <30% типов зарезолвилось) — цифра тогда скрывается, не фабрикуется.
  async function estimateTextCoverage(text) {
    try {
      var RM = window.ReaderMorph, CV = window.CorpusVocab;
      if (!RM || !CV) return null;
      var db = await _ldb();
      if (!db || typeof db.getKnownWordStates !== "function") return null;
      var items = collectTypeFreq(text, RM);
      if (!items.length) return null;
      var eng = await RM.ensureEngine();
      var keyed = [], resolved = 0;
      for (var i = 0; i < items.length; i++) {
        var card = null;
        try { card = await RM.resolveCore(eng, items[i].surface, ""); } catch (_) {}
        if (!card) continue;
        resolved++;
        var key = RM.statusKeyForCard(eng.NA, card, "", items[i].surface);
        if (key) keyed.push({ key: key, freq: items[i].freq });
      }
      if (resolved / items.length < 0.3) return null;  // резолв слаб → цифре нельзя верить
      var knownMap = await db.getKnownWordStates();
      return aggregateCoverage(keyed, knownMap, { KNOWN_STATES: CV.CFG.KNOWN_STATES, classifyZone: CV.classifyZone });
    } catch (_) { return null; }
  }

  // ------- браузерная часть (UI) -------
  function $(id) { return document.getElementById(id); }
  function tr(k, f) { try { var v = window.t && window.t(k); return v && v !== k ? v : f; } catch (_) { return f; } }
  function toast(msg, kind) { if (typeof window.showToast === "function") window.showToast(msg, kind || "info"); }
  var pendingSource = null; // {text} на время открытого модала

  function fillLevelSelect() {
    var sel = $("v3RetellLevel");
    if (!sel || sel.options.length) return;
    for (var i = 0; i < LEVELS.length; i++) {
      var o = document.createElement("option");
      o.value = LEVELS[i];
      o.textContent = LEVELS[i] + " — " + tr("studio.retell.level" + LEVELS[i], LEVELS[i]);
      sel.appendChild(o);
    }
    var last = null; try { last = localStorage.getItem(RETELL_LEVEL_LS_KEY); } catch (_) {}
    sel.value = LEVELS.includes(last) ? last : "B1";
  }

  function openFromComposer() {
    var text = (($("inputText") || {}).value || "").trim();
    if (!text) { toast(tr("studio.retell.errEmptyField", "Поле ввода пусто"), "warning"); return; }
    pendingSource = { text: text };
    var mySrc = pendingSource; // race-guard token: estimateTextCoverage() is slow (OPFS +
                                // resolver loop) — capture THIS call's identity now, not just
                                // pendingSource's later truthiness, so a stale resolve from a
                                // closed/reopened-with-different-text modal can never paint its
                                // number onto a DIFFERENT text's coverage line (R11-class bug,
                                // fix1 code review 2026-07-29).
    fillLevelSelect();
    // T6 addition: run() disables Go while working; a stale/guarded run() (race-abort — see
    // run()'s doc-comment) never re-enables a button it no longer owns, so a fresh open must
    // reset it itself, or a prior aborted run could leave Go permanently disabled.
    var goBtn = $("v3RetellGo"); if (goBtn) goBtn.disabled = false;
    var est = estimateRetellCost(text.length);
    $("v3RetellCost").textContent = tr("studio.retell.costLine", "Смета") + ": ≈$" + est.usd.toFixed(2) + " · ~" + est.seconds + tr("studio.retell.secShort", " сек");
    $("v3RetellStatus").textContent = "";
    var cov = $("v3RetellCovNow"); cov.hidden = true;
    estimateTextCoverage(text).then(function (c) {
      if (c && pendingSource === mySrc) {
        cov.textContent = tr("studio.retell.covNow", "Знакомо сейчас") + ": ~" + Math.round(c.pct * 100) + "% · " + tr("studio.retell.zone_" + c.zone, c.zone);
        cov.hidden = false;
      }
    });
    var m = $("v3RetellModal");
    if (m) m.classList.remove("hidden"); // модал — .v3-modal hidden-CLASS toggle (matches every
                                          // other modal in index.html: v3ImportModal/v3TextMetaModal/
                                          // v3SaveMetaModal/v3AudioPrefetchModal all show/hide via
                                          // classList, NOT the `hidden` attribute/property).
  }
  function close() {
    var m = $("v3RetellModal");
    if (m) m.classList.add("hidden");
    pendingSource = null;
  }

  // Ошибка сервера (Task 2 error_code) → ключ статус-строки. Коды без записи здесь
  // (BAD_LEVEL, RETELL_EMPTY, GEMINI_FAILED) намеренно падают в общий "errFailed" —
  // не пользовательские сценарии (BAD_LEVEL/RETELL_EMPTY — программная ошибка вызова,
  // не то, что реальный пользователь может спровоцировать из этого UI).
  var ERROR_KEY = {
    GEMINI_KEY_REQUIRED: "studio.retell.errNoKey",
    GEMINI_KEY_INVALID: "studio.retell.errNoKey",
    GEMINI_KEY_REJECTED: "studio.retell.errKeyRejected",
    GEMINI_QUOTA: "studio.retell.errQuota",
    GEMINI_OVERLOADED: "studio.retell.errOverloaded",
    RETELL_TOO_LONG: "studio.retell.errTooLong",
    RETELL_EMPTY_OUTPUT: "studio.retell.errFailed",
  };

  // run() — вызов эндпоинта, coverage до/после, подтверждение замены поля, приземление
  // ОТДЕЛЬНЫМ (несохранённым) текстом, паспорт, закрытие модала.
  //
  // Race-safety (review T5 carried into T6): estimateTextCoverage() (до И после) и fetch()
  // САМИ по себе медленные (сеть/OPFS+резолвер-цикл) — модал может закрыться (Cancel/backdrop
  // → close()) или переоткрыться с ДРУГИМ текстом (новый openFromComposer() → новый
  // pendingSource) прежде, чем один из этих await-ов долетит. Тот же токен-приём, что и в
  // openFromComposer() fix1: `mySrc` захватывается ОДИН раз в начале, и `pendingSource ===
  // mySrc` проверяется ПОСЛЕ каждого await, ПЕРЕД любой записью в DOM/использованием
  // pendingSource — иначе устаревший результат красится поверх состояния ДРУГОГО текста
  // (R11-класс: «чужому тексту — чужая цифра/чужой пересказ»). window.confirm() — блокирующий
  // синхронный диалог (никакой другой JS, включая клик Cancel, не может выполниться, пока он
  // открыт), поэтому доп. проверка сразу после него избыточна и не добавлена.
  async function run() {
    if (!pendingSource) return;
    var mySrc = pendingSource; // race-guard token — идентичность ЭТОГО вызова, не truthiness
    var text = mySrc.text;
    var level = $("v3RetellLevel").value;
    try { localStorage.setItem(RETELL_LEVEL_LS_KEY, level); } catch (_) {}
    var key = typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "";
    var st = $("v3RetellStatus");
    if (!key) { st.textContent = tr("studio.retell.errNoKey", "Нужен Gemini API-ключ (BYOK)"); return; }
    $("v3RetellGo").disabled = true;
    st.textContent = tr("studio.retell.working", "Готовлю пересказ…");
    var covBeforeP = estimateTextCoverage(text); // запущен параллельно с fetch, await — после ответа

    var resp, data;
    try {
      resp = await fetch("/api/ingest/retell", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, level: level, geminiApiKey: key }),
      });
      data = await resp.json();
    } catch (e) {
      if (pendingSource === mySrc) {
        st.textContent = tr("studio.retell.errNetwork", "Сеть недоступна");
        $("v3RetellGo").disabled = false;
      }
      return;
    }
    if (pendingSource !== mySrc) return; // модал закрыт/переоткрыт, пока ждали сеть — тихий выход

    if (!resp.ok || !data || !data.ok) {
      var ek = data && data.error_code && ERROR_KEY[data.error_code];
      st.textContent = tr(ek || "studio.retell.errFailed", "Не удалось построить пересказ");
      $("v3RetellGo").disabled = false;
      return;
    }

    var covBefore = null; try { covBefore = await covBeforeP; } catch (_) {}
    var covAfter = null; try { covAfter = await estimateTextCoverage(data.retell); } catch (_) {}
    if (pendingSource !== mySrc) return; // тот же гард — coverage-after тоже медленный (OPFS)

    // подтверждение замены поля; несохранённый оригинал — отдельная формулировка
    var sess = null; try { sess = window.v3SessionGet ? window.v3SessionGet() : null; } catch (_) {}
    var savedId = (sess && (sess.baseTextId || sess.textId)) || null;
    var msg = savedId
      ? tr("studio.retell.confirmReplace", "Заменить текст в поле пересказом? Оригинал сохранён в Библиотеке.")
      : tr("studio.retell.confirmReplaceUnsaved", "Заменить текст в поле пересказом? Оригинал НЕ сохранён — он останется только в паспорте пересказа.");
    if (!window.confirm(msg)) {
      $("v3RetellGo").disabled = false;
      st.textContent = "";
      return;
    }

    var prevIm = window.v3LastImportMeta || null;
    var fromImport = prevIm && prevIm.textSnapshot && prevIm.textSnapshot.trim() === text.trim();
    var input = $("inputText");
    input.value = data.retell;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    window.v3LastImportMeta = buildRetellPassport({
      originLabel: fromImport ? prevIm.source : (sess && sess.title) || "",
      importKind: fromImport ? prevIm.kind : null,
      importSource: fromImport ? prevIm.source : null,
      savedTextId: savedId, savedTitle: (sess && sess.title) || null,
      level: level, model: data.model, retellText: data.retell,
      coverage: covBefore || covAfter ? {
        before: covBefore ? Math.round(covBefore.pct * 100) / 100 : null,
        after: covAfter ? Math.round(covAfter.pct * 100) / 100 : null,
        zone: covAfter ? covAfter.zone : null,
      } : null,
    });
    // R11-мина обезврежена: «Сохранить» после пересказа обязан создавать НОВУЮ карточку
    try { window.v3SessionSet && window.v3SessionSet({ textId: null, baseTextId: null, mode: "draft", title: null }); } catch (_) {}
    close();
    // W2-S11 T6 verify §1: window.toast (сигнатура текст+тип) в кодовой базе НЕ существует
    // (grep public/index.html + studio-import.js — только studio-import.js::toast(key,kind), с
    // i18n-КЛЮЧОМ, несовместимая сигнатура; сам index.html выставляет только window.showToast).
    // Использован уже определённый в ЭТОМ файле toast(msg, kind) (строка выше, тот же приём,
    // что и Task 5 code review round1) — он сам не срабатывает, если window.showToast когда-либо
    // пропадёт, так что деградация всё равно тихая-безопасная, а не сломанный вызов.
    var covLine = covBefore && covAfter
      ? " " + Math.round(covBefore.pct * 100) + "% → " + Math.round(covAfter.pct * 100) + "%"
      : "";
    toast(tr("studio.retell.done", "Пересказ в поле ввода. Соберите таблицу.") + covLine, "success");
    $("v3RetellGo").disabled = false;
  }

  var API = {
    LEVELS: LEVELS, RETELL_LEVEL_LS_KEY: RETELL_LEVEL_LS_KEY,
    estimateRetellCost: estimateRetellCost,
    buildRetellPassport: buildRetellPassport,
    aggregateCoverage: aggregateCoverage,
    collectTypeFreq: collectTypeFreq,
    estimateTextCoverage: estimateTextCoverage,
    openFromComposer: openFromComposer,
    close: close,
    run: run,
  };
  if (typeof window !== "undefined") window.StudioRetell = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
