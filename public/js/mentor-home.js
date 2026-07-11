/* mentor-home.js — CLG-P9 «Дом наставника» (MENTOR_HOME_P9_DECISION_2026_07_06).
 *
 * АРХИТЕКТУРНЫЙ ИНВАРИАНТ ПЕРЕНОСИМОСТИ (решение 2): данные — ТОЛЬКО из cloud API
 * (/api/agent/*, /api/auth/me) — НИКАКОГО прямого OPFS/localDb. Действия — через
 * host-adapter, который отдаёт монтирующая поверхность:
 *   host = {
 *     t(key, fallback),                  // i18n хоста
 *     language(),                        // 'ru' | 'en' | 'he'
 *     csrf(),                            // CSRF-токен для POST
 *     runTrainer(itemKeys, channel),     // Зал: startPlanSectionTraining; Mini App: deep-link
 *     openReading(),                     // «▶ В Зал» — вернуть пользователя в чтение
 *     openTextAt(textKey, orderIndex),   // якорь объяснения → текст на предложении
 *   }
 * Модуль по построению = скелет Telegram Mini App (P8, другой origin, OPFS недоступен):
 * второй монтаж — другой host, та же логика.
 *
 * MVP (решение 3, все 4 блока): статус/лимиты + consent agent_read_texts (переезд из ☁) ·
 * план+действия (переезд из ☁, кнопки P6.5) · история объяснений (purge-aware) ·
 * зачаток misconception-блока (constructs/summary).
 *
 * R11: Tier 1 (нет сессии) — честная заглушка «нужен облачный аккаунт», не пустые блоки.
 * R17 §2.3: модуль НИКОГДА не открывает сам себя и не дергает LLM без явного тапа
 * (план — только по кнопке; mount ничего не пишет и не тратит).
 * Динамический текст (LLM/сервер) — СТРОГО textContent, никакого innerHTML.
 * MNAR: просмотр дома не учебное событие — модуль не пишет ничего, кроме consent по тапу.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.MentorHome = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var S = { mount: null, host: null, session: null, statusCache: null };

  function t(key, fb) { return S.host && S.host.t ? S.host.t(key, fb) : fb; }
  function lang() { try { return String(S.host.language() || "ru"); } catch (_) { return "ru"; } }
  function useRu() { return lang().indexOf("ru") === 0; }   // he-UI → английские серверные титулы (у сервера ru/en)

  async function jget(path) {
    var res = await fetch(path, { credentials: "same-origin" });
    var json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, json: json };
  }
  async function jpost(path, body) {
    var h = { "Content-Type": "application/json" };
    try { var c = S.host.csrf(); if (c) h["X-LP-CSRF"] = c; } catch (_) {}
    var res = await fetch(path, { method: "POST", credentials: "same-origin", headers: h, body: JSON.stringify(body || {}) });
    var json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, json: json };
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ── блок A: статус/лимиты + consent-переезд ────────────────────────────────
  function degradeLabel(code) {
    code = String(code || "");
    if (code === "USER_LIMIT" || code === "GLOBAL_LIMIT") return t("room.cloud.planLimit", "дневной лимит LLM исчерпан");
    if (code === "KILL_SWITCH") return t("room.cloud.agentKill", "LLM выключен (kill-switch)");
    if (code === "NO_API_KEY") return t("room.cloud.agentKeyNone", "без LLM-ключа — план детерминированный");
    if (code === "LLM_OUTPUT_INVALID") return t("room.cloud.planQualityReject", "ответ модели не прошёл проверку качества");
    if (code === "429" || code === "403") return t("room.cloud.planKeyQuota", "у ключа нет квоты к модели — проверьте проект ключа в Google Console") + " (" + code + ")";
    return code;
  }

  async function renderStatus(box) {
    box.textContent = "";
    var line = el("div", "mentor-status-line");
    box.appendChild(line);
    var a = null;
    try { var r = await jget("/api/agent/status"); if (r.status === 200 && r.json && r.json.ok) a = r.json; } catch (_) {}
    S.statusCache = a;
    if (!a) { line.textContent = "✗ " + t("room.cloud.err", "Ошибка синхронизации"); return; }
    var val;
    if (a.kill_switch) val = t("room.cloud.agentKill", "LLM выключен (kill-switch)");
    else if (a.key_source !== "agent") val = t("room.cloud.agentKeyNone", "без LLM-ключа — план детерминированный");
    else val = "✓ " + t("room.cloud.agentKeyOk", "ключ подключён")
      + " · " + t("room.cloud.agentToday", "LLM сегодня") + ": "
      + ((a.usage && a.usage.user_llm_calls) || 0) + "/" + ((a.limits && a.limits.llm_daily_per_user) || "—")
      + " · " + t("room.cloud.hintAgentGlobal", "Всего за сегодня") + ": "
      + ((a.usage && a.usage.global_llm_calls) || 0) + "/" + ((a.limits && a.limits.llm_daily_global) || "—");
    line.textContent = "🤖 " + t("room.cloud.agentLine", "Наставник") + ": " + val;
    // tap-ⓘ: как работает ключ/лимит (title-тултипы @380px не работают — паттерн ☁-модала)
    var infoI = el("span", "mentor-status-i", " ⓘ");
    line.appendChild(infoI);
    var keyHint = el("div", "mentor-hint", t("room.cloud.hintAgent", "Ключ агента задан на сервере и платит только за наставника. «План на сегодня» с LLM списывает 1 вызов из суточного лимита ТОЛЬКО при удачном ответе; сбой провайдера не списывается — план всё равно строится детерминированно и остаётся полезным."));
    keyHint.hidden = true;
    line.style.cursor = "pointer";
    line.addEventListener("click", function () { keyHint.hidden = !keyHint.hidden; });
    box.appendChild(keyHint);

    // consent «наставник читает мои тексты» — серверная истина (consent_records);
    // отзыв каскадно чистит контент сохранённых объяснений (tombstone) — сервер сообщает.
    var consents = (S.session && S.session.consents) || {};
    var ca = consents.agent_read_texts;
    var label = el("label", "mentor-consent");
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!(ca && ca.granted === true);
    label.appendChild(cb);
    label.appendChild(el("span", null, t("room.cloud.agentTextsToggle", "🤖 Разрешить наставнику читать мои тексты")));
    box.appendChild(label);
    var hint = el("div", "mentor-hint", t("room.cloud.agentTextsHint", "Наставник сможет отправлять выбранное предложение внешнему AI-провайдеру, чтобы объяснить его с учётом вашего прогресса. Уходит только одно предложение — не весь текст; отзыв согласия очищает сохранённые объяснения."));
    box.appendChild(hint);
    var msg = el("div", "mentor-hint mentor-consent-msg");
    msg.hidden = true;
    box.appendChild(msg);
    cb.addEventListener("change", async function () {
      var granted = !!cb.checked;
      cb.disabled = true;
      try {
        var r2 = await jpost("/api/auth/consent", { key: "agent_read_texts", granted: granted, version: "v1" });
        if (r2.status !== 200 || !r2.json || !r2.json.ok) { cb.checked = !granted; msg.textContent = "✗ " + t("room.cloud.err", "Ошибка синхронизации"); msg.hidden = false; return; }
        if (S.session && S.session.consents) S.session.consents.agent_read_texts = { granted: granted };
        if (!granted && r2.json.explanations && r2.json.explanations.purged >= 1) {
          msg.textContent = "✓ " + t("room.explain.purged", "Сохранённые объяснения очищены");
          msg.hidden = false;
          renderHistory(S.els.history);   // лента честно перерисовывается tombstone-ами
          renderConstructs(S.els.constructs);
        } else { msg.hidden = true; }
      } catch (_) { cb.checked = !granted; }
      finally { cb.disabled = false; }
    });
  }

  // ── блок Telegram: pairing (web-initiated + двусторонний confirm, P7.1a) ─────
  // API-only (данные из /api/agent/telegram/*). Состояния: не связан → consent-копия +
  // «Подключить» (pair выдаёт deep-link, подтверждение — в боте); ожидает → подсказка про
  // /confirm; связан → маска + «Отключить». R11 honest states, textContent-only.
  async function renderTelegramBlock(box) {
    box.textContent = "";
    var st = null;
    try { var r = await jget("/api/agent/telegram/status"); if (r.status === 200 && r.json && r.json.ok) st = r.json; } catch (_) {}
    if (!st) { box.appendChild(el("div", "mentor-hint", "✗ " + t("room.cloud.err", "Ошибка синхронизации"))); return; }

    var line = el("div", "mentor-status-line");
    if (st.linked) line.textContent = "🔗 " + t("room.tg.linked", "Telegram связан") + (st.telegram_user_masked ? " (" + st.telegram_user_masked + ")" : "");
    else if (st.pending) line.textContent = "🔗 " + t("room.tg.pending", "Ожидает подтверждения в боте — отправьте /confirm");
    else line.textContent = "🔗 " + t("room.tg.none", "Telegram не подключён");
    box.appendChild(line);

    var msg = el("div", "mentor-hint mentor-tg-msg"); msg.hidden = true;

    if (st.linked || st.pending) {
      var unbtn = el("button", "mentor-plan-btn", t("room.tg.unlink", "Отключить Telegram"));
      unbtn.type = "button";
      unbtn.addEventListener("click", async function () {
        unbtn.disabled = true;
        try {
          var r2 = await jpost("/api/agent/telegram/unlink", {});
          if (r2.status === 200 && r2.json && r2.json.ok) { renderTelegramBlock(box); return; }
          msg.textContent = "✗ " + t("room.cloud.err", "Ошибка синхронизации"); msg.hidden = false;
        } catch (_) { msg.textContent = "✗"; msg.hidden = false; }
        finally { unbtn.disabled = false; }
      });
      box.appendChild(unbtn);
    } else {
      // consent-копия (утверждённая формулировка) показана ДО подключения (situated)
      box.appendChild(el("div", "mentor-hint", t("room.tg.consent",
        "Telegram-доставка может включать учебные слова, фразы, объяснения, задания и напоминания. Эти сообщения будут передаваться через инфраструктуру Telegram. Канал можно отключить в любой момент.")));
      var btn = el("button", "mentor-plan-btn", t("room.tg.connect", "🔗 Подключить Telegram"));
      btn.type = "button";
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        try {
          // нажатие = согласие с показанной копией (consent:true пишется на сервере)
          var r3 = await jpost("/api/agent/telegram/pair", { consent: true });
          if (r3.status !== 200 || !r3.json || !r3.json.ok) {
            msg.textContent = "✗ " + ((r3.json && r3.json.error) || t("room.cloud.err", "Ошибка синхронизации")); msg.hidden = false; return;
          }
          msg.textContent = "";
          var note = el("div", "mentor-hint", t("room.tg.open", "Откройте ссылку и подтвердите в боте (/confirm):"));
          var a = el("a", "mentor-tg-link", r3.json.deep_link);
          a.setAttribute("href", r3.json.deep_link); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener");
          msg.appendChild(note); msg.appendChild(a); msg.hidden = false;
        } catch (_) { msg.textContent = "✗"; msg.hidden = false; }
        finally { btn.disabled = false; }
      });
      box.appendChild(btn);
    }
    box.appendChild(msg);
  }

  // ── блок B: план + действия (переезд _cloudPlanRun из ☁-модала, P6.5-кнопки) ─
  async function runPlan(btn, boxWrap) {
    btn.disabled = true;
    boxWrap.hidden = false;
    boxWrap.textContent = t("room.cloud.planRun", "Составляю план…");
    try {
      var r = await jpost("/api/agent/plan", {});
      var j = r.json;
      if (!j || !j.ok) { boxWrap.textContent = "✗ " + ((j && j.error) || t("room.cloud.err", "Ошибка синхронизации")); return; }
      boxWrap.textContent = "";
      // dir=auto: план/LLM-текст ru/en внутри he-UI (RTL) обязан рендериться своим направлением
      var addLine = function (text, cls) { if (!text) return; var n = el("div", cls || "mentor-plan-line", text); n.setAttribute("dir", "auto"); boxWrap.appendChild(n); };
      // LLM-текст показываем только когда он ЕСТЬ от LLM: fallback-текст сервера
      // дублирует секции, которые рендерятся пунктами ниже (урок P6.5).
      if (j.llm_used && j.text) addLine(j.text);
      var plan = j.plan || {};
      if (plan.est_minutes) addLine("≈ " + plan.est_minutes + " " + t("room.cloud.planMin", "мин"));
      (plan.sections || []).forEach(function (s) {
        var title = useRu() ? (s.title_ru || s.title_en) : (s.title_en || s.title_ru);
        var lemmas = (s.items || []).map(function (x) { return x && x.lemma; }).filter(Boolean);
        var row = el("div", "mentor-plan-line mentor-plan-section");
        row.setAttribute("dir", "auto");
        row.appendChild(el("span", null, "• " + title + (lemmas.length ? ": " + lemmas.join(" · ") : "")));
        var keys = (s.items || []).map(function (x) { return x && x.item_key; }).filter(Boolean);
        if (s.category === "тренировать" && keys.length) {
          var go = el("button", "mentor-plan-go", t("room.cloud.planStart", "▶ Начать"));
          go.type = "button";
          go.addEventListener("click", function () { try { S.host.runTrainer(keys, s.recommended_channel || null); } catch (_) {} });
          row.appendChild(go);
        } else if (s.category === "вернуть к чтению") {
          var rd = el("button", "mentor-plan-go", t("room.cloud.planRead", "▶ В Зал"));
          rd.type = "button";
          rd.addEventListener("click", function () { try { S.host.openReading(); } catch (_) {} });
          row.appendChild(rd);
        }
        boxWrap.appendChild(row);
        // P6.4 — конструкции секции: серверные титулы (клиент реестр не дублирует)
        (s.constructs || []).forEach(function (c) {
          var ct = useRu() ? (c.title_ru || c.title_en) : (c.title_en || c.title_ru);
          if (ct) addLine("⚙ " + ct, "mentor-plan-line mentor-plan-construct");
        });
      });
      if (j.degraded_reason) {
        addLine("ⓘ " + t("room.cloud.planNoLlm", "план собран без LLM (детерминированно)") + " · " + degradeLabel(j.degraded_reason));
      }
    } catch (e) {
      boxWrap.textContent = "✗ " + String((e && e.message) || e);
    } finally {
      btn.disabled = false;
      try { renderStatus(S.els.status); } catch (_) {}   // счётчик LLM сразу отражает списание
    }
  }

  function renderPlanBlock(box) {
    box.textContent = "";
    var btn = el("button", "mentor-plan-btn", t("room.cloud.planBtn", "🧭 План на сегодня"));
    btn.type = "button";
    var planBox = el("div", "mentor-plan-box");
    planBox.hidden = true;
    btn.addEventListener("click", function () { runPlan(btn, planBox); });
    box.appendChild(btn);
    box.appendChild(planBox);
  }

  // ── блок C: история объяснений (purge-aware, R11) ──────────────────────────
  function historyItemNode(x) {
    var item = el("div", "mentor-hist-item");
    var head = el("div", "mentor-hist-head");
    var when = "";
    try { when = x.created_at ? new Date(x.created_at).toLocaleString() : ""; } catch (_) {}
    head.appendChild(el("span", "mentor-hist-date", when));
    if (x.purged) {
      head.appendChild(el("span", "mentor-hist-badge", t("room.mentor.histPurged", "очищено по отзыву согласия")));
      item.appendChild(head);
      return item;   // tombstone: дата + честная причина, контента нет
    }
    head.appendChild(el("span", "mentor-hist-badge",
      x.llm_used ? "🤖 " + (x.provider || "") + (x.model ? " · " + x.model : "")
                 : t("room.explain.noLlm", "без AI: перевод и морфология офлайн")));
    if (x.anchor && x.anchor.text_key) {
      var openBtn = el("button", "mentor-hist-open", t("room.mentor.histOpen", "↗ к предложению"));
      openBtn.type = "button";
      openBtn.addEventListener("click", function () {
        // PAS-A1: source='corpus' → корпус-осознанный тост при отсутствии работы на устройстве
        try { S.host.openTextAt(x.anchor.text_key, x.anchor.order_index, x.source); } catch (_) {}
      });
      head.appendChild(openBtn);
    }
    item.appendChild(head);
    if (x.sentence_he) {
      var sent = el("div", "mentor-hist-sentence", x.sentence_he);
      sent.setAttribute("dir", "rtl");
      sent.setAttribute("lang", "he");
      item.appendChild(sent);
    }
    if (x.text) {
      var txt = el("div", "mentor-hist-text", x.text);
      txt.setAttribute("dir", "auto");   // ru/en объяснение внутри he-UI (RTL) — своё направление
      item.appendChild(txt);
    }
    return item;
  }

  async function renderHistory(box, beforeRid, append) {
    if (!append) box.textContent = "";
    var url = "/api/agent/explanations?limit=10" + (beforeRid ? "&before_rid=" + encodeURIComponent(beforeRid) : "");
    var r = await jget(url);
    var j = r.json;
    var more = box.parentNode ? box.parentNode.querySelector(".mentor-hist-more") : null;
    if (!j || !j.ok) { box.appendChild(el("div", "mentor-hint", "✗ " + t("room.cloud.err", "Ошибка синхронизации"))); if (more) more.hidden = true; return; }
    var items = j.explanations || [];
    if (!items.length && !append) {
      box.appendChild(el("div", "mentor-hint", t("room.mentor.histEmpty", "Объяснений пока нет — тапните 🤖 на предложении в читалке (свой текст или корпус).")));
    }
    items.forEach(function (x) { box.appendChild(historyItemNode(x)); });
    if (more) {
      more.hidden = !j.has_more;
      more.setAttribute("data-before-rid", j.next_before_rid != null ? String(j.next_before_rid) : "");
    }
  }

  function renderHistoryBlock(wrap, box) {
    var more = el("button", "mentor-hist-more", t("room.mentor.histMore", "Показать ещё"));
    more.type = "button";
    more.hidden = true;
    more.addEventListener("click", function () {
      var rid = more.getAttribute("data-before-rid");
      renderHistory(box, rid || null, true);
    });
    wrap.appendChild(box);
    wrap.appendChild(more);
    renderHistory(box);
  }

  // ── блок D: зачаток misconception-блока («ваши конструкции») ───────────────
  async function renderConstructs(box) {
    box.textContent = "";
    var r = await jget("/api/agent/constructs/summary");
    var j = r.json;
    if (!j || !j.ok) { box.appendChild(el("div", "mentor-hint", "✗ " + t("room.cloud.err", "Ошибка синхронизации"))); return; }
    var rows = j.constructs || [];
    if (!rows.length) {
      box.appendChild(el("div", "mentor-hint", t("room.mentor.consEmpty", "Пока не накоплено — конструкции появятся из планов и объяснений.")));
      return;
    }
    rows.forEach(function (c) {
      var title = useRu() ? (c.title_ru || c.title_en) : (c.title_en || c.title_ru);
      box.appendChild(el("div", "mentor-cons-row", "⚙ " + title + " · ×" + c.count));
    });
  }

  // ── mount / refresh ─────────────────────────────────────────────────────────
  function blockNode(titleKey, titleFb) {
    var b = el("section", "mentor-block");
    if (titleKey) b.appendChild(el("h3", "mentor-block-title", t(titleKey, titleFb)));
    return b;
  }

  async function render() {
    var m = S.mount;
    m.textContent = "";
    var session = null;
    try { var r = await jget("/api/auth/me"); if (r.status === 200 && r.json && r.json.ok) session = r.json; } catch (_) {}
    S.session = session;
    if (!session) {
      // Tier 1 — честная заглушка (R11/R4: не прячемся и не притворяемся; сказано, что сделать)
      var stub = el("section", "mentor-block mentor-tier1");
      stub.appendChild(el("div", "mentor-tier1-icon", "🤖"));
      stub.appendChild(el("div", null, t("room.mentor.needCloud", "Наставнику нужен облачный аккаунт.")));
      stub.appendChild(el("div", "mentor-hint", t("room.mentor.needCloudHint", "Откройте ☁ в шапке, войдите и синхронизируйтесь — здесь появятся план на сегодня, история объяснений и ваши слабые места.")));
      m.appendChild(stub);
      S.els = {};
      return;
    }
    var status = blockNode(null, null);
    var planB = blockNode(null, null);   // кнопка «🧭 План на сегодня» самоописательна — без дубля-заголовка
    var tgB = blockNode("room.tg.title", "🔗 Telegram");
    var histWrap = blockNode("room.mentor.histTitle", "История объяснений");
    var consB = blockNode("room.mentor.consTitle", "Ваши конструкции");
    var histBox = el("div", "mentor-hist-list");
    var tgBox = el("div", "mentor-tg-wrap");
    tgB.appendChild(tgBox);
    S.els = { status: status, plan: planB, telegram: tgBox, history: histBox, constructs: null };
    m.appendChild(status);
    m.appendChild(planB);
    m.appendChild(tgB);
    m.appendChild(histWrap);
    m.appendChild(consB);
    var consBox = el("div", "mentor-cons-list");
    consB.appendChild(consBox);
    S.els.constructs = consBox;
    renderStatus(status);
    renderPlanBlock(planB.appendChild(el("div", "mentor-plan-wrap")));
    renderTelegramBlock(tgBox);
    renderHistoryBlock(histWrap, histBox);
    renderConstructs(consBox);
  }

  function mountFn(container, host) {
    S.mount = container;
    S.host = host || {};
    return render();
  }
  function refresh() {
    if (!S.mount || !S.host) return Promise.resolve();
    return render();
  }

  return { mount: mountFn, refresh: refresh };
});
