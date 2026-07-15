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
    if (code === "BYOK_FAILED") return t("room.cloud.byokFailed", "Вызов на вашем ключе не прошёл — проверьте ключ в «⚙ Наставник».");   // PAS-F1
    if (code === "BYOK_INVALID") return t("room.cloud.byokInvalid", "Ваш ключ не подходит выбранному провайдеру — проверьте его в «⚙ Наставник».");
    if (code === "429" || code === "403") return t("room.cloud.planKeyQuota", "у ключа нет квоты к модели — проверьте проект ключа в Google Console") + " (" + code + ")";
    return code;
  }
  // PAS-F1: byok из host-capability вплетается в LLM-тратящие body (host отсутствует/без
  // ключа → серверный путь как раньше)
  function _mhByok(body) {
    try { const b = S.host && S.host.agentByok ? S.host.agentByok() : null; return b ? Object.assign({}, body, { byok: b }) : body; } catch (_) { return body; }
  }
  function _byokProv(r) {
    return r && r.key_source === "byok" ? t("room.cloud.byokProvenance", "ваш ключ") + " · " : "";
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
    // PAS-F1 (критика UX-7): при живом byok-ключе статус честен — «без LLM-ключа» с рабочим
    // своим ключом было бы ложью; + счётчик доставленных ответов на своём ключе.
    try {
      var bk = S.host && S.host.agentByok ? S.host.agentByok() : null;
      if (bk) {
        var bline = "🔑 " + t("room.cloud.byokActive", "Свой ключ активен") + " (" + bk.provider + ") — " + t("room.cloud.byokNoServerSpend", "серверный лимит не тратится");
        if (a.usage && a.usage.byok_calls_today > 0) bline += " · " + t("room.cloud.byokToday", "на своём ключе сегодня") + ": " + a.usage.byok_calls_today;
        box.appendChild(el("div", "mentor-hint", bline));
      }
    } catch (_) {}
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
    var hint = el("div", "mentor-hint", t("room.cloud.agentTextsHint", "Наставник сможет отправлять внешнему AI-провайдеру выбранное предложение (объяснение) или короткий фрагмент до 5 предложений (проверка понимания, пересказ, обсуждение прочитанного) — не весь текст; отзыв согласия очищает сохранённые объяснения."));
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

    // PAS-B2 — отдельный durable-ключ «целые тексты» (agent_read_texts_digest):
    // выдаётся situated-панелью Студии («что стоит выучить»), отзыв — ЗДЕСЬ (копия
    // обещает «отзыв — в ☁ Зала»); отзыв чистит сохранённые study_summary (сервер).
    var cd = consents.agent_read_texts_digest;
    var label2 = el("label", "mentor-consent");
    var cb2 = document.createElement("input");
    cb2.type = "checkbox";
    cb2.checked = !!(cd && cd.granted === true);
    label2.appendChild(cb2);
    label2.appendChild(el("span", null, t("room.cloud.agentDigestToggle", "📄 Разрешить наставнику читать текст целиком (по запросу)")));
    box.appendChild(label2);
    box.appendChild(el("div", "mentor-hint", t("room.cloud.agentDigestHint", "Для совета «что стоит выучить» в Студии наставник отправляет AI-провайдеру весь текст (до 40 предложений с переводами и название). Отзыв очищает сохранённые советы.")));
    var msg2 = el("div", "mentor-hint mentor-consent-msg");
    msg2.hidden = true;
    box.appendChild(msg2);
    cb2.addEventListener("change", async function () {
      var granted = !!cb2.checked;
      cb2.disabled = true;
      try {
        var r3 = await jpost("/api/auth/consent", { key: "agent_read_texts_digest", granted: granted, version: "v1" });
        if (r3.status !== 200 || !r3.json || !r3.json.ok) { cb2.checked = !granted; msg2.textContent = "✗ " + t("room.cloud.err", "Ошибка синхронизации"); msg2.hidden = false; return; }
        if (S.session && S.session.consents) S.session.consents.agent_read_texts_digest = { granted: granted };
        if (!granted && r3.json.explanations && r3.json.explanations.purged >= 1) {
          msg2.textContent = "✓ " + t("room.explain.purged", "Сохранённые объяснения очищены");
          msg2.hidden = false;
        } else { msg2.hidden = true; }
      } catch (_) { cb2.checked = !granted; }
      finally { cb2.disabled = false; }
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
      var r = await jpost("/api/agent/plan", _mhByok({}));
      var j = r.json;
      if (!j || !j.ok) { boxWrap.textContent = "✗ " + ((j && j.error) || t("room.cloud.err", "Ошибка синхронизации")); return; }
      boxWrap.textContent = "";
      // dir=auto: план/LLM-текст ru/en внутри he-UI (RTL) обязан рендериться своим направлением
      var addLine = function (text, cls) { if (!text) return; var n = el("div", cls || "mentor-plan-line", text); n.setAttribute("dir", "auto"); boxWrap.appendChild(n); };
      // LLM-текст показываем только когда он ЕСТЬ от LLM: fallback-текст сервера
      // дублирует секции, которые рендерятся пунктами ниже (урок P6.5).
      if (j.llm_used && j.text) {
        addLine(j.text);
        // PAS-F1 (критика UX-4): у плана не было provider-строки вовсе — добавляем провенанс
        if (j.provider) addLine("🤖 " + _byokProv(j) + j.provider + (j.model ? " · " + j.model : ""), "mentor-plan-line mentor-plan-construct");
      }
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
          // PAS-D1: пример «что читать» — детерминированно и бесплатно (тот же движок,
          // что рельса; fire-and-forget: план не ждёт 919КБ-сайдкара). Только kind=next
          // (challenge/coldstart в плановой строке без фрейминга были бы нечестны).
          if (S.host && typeof S.host.nextTextPicks === "function") {
            (async function (sectionRow) {
              var picks = null;
              try { picks = await S.host.nextTextPicks(); } catch (_) {}
              if (!picks || picks.error || picks.kind !== "next" || !picks.picks || !picks.picks.length) return;
              if (!sectionRow.isConnected) return;   // план перерисован/закрыт, пока грузился сайдкар
              var p = picks.picks[0];
              var eg = el("div", "mentor-plan-line mentor-plan-example");
              eg.setAttribute("dir", "auto");
              eg.appendChild(document.createTextNode(t("room.nexttext.planEg", "например:") + " "));
              var bdi = el("bdi", null, p.title || p.work_id);
              bdi.setAttribute("lang", "he");
              eg.appendChild(bdi);
              if (typeof p.cov === "number") eg.appendChild(document.createTextNode(" (≈" + Math.round(p.cov * 100) + "% " + t("room.corpus.cov.familiar", "знакомо") + ")"));
              eg.style.cursor = "pointer";
              eg.addEventListener("click", function () {
                _ux("next_text", "accepted");
                try { S.host.openCorpusPick(p); } catch (_) {}
              });
              sectionRow.appendChild(eg);
            })(row);
          }
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
    if (x.kind === "word") head.appendChild(el("span", "mentor-hist-badge", t("room.mentor.histWord", "слово")));   // PAS-A4
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

  // ── PAS-D1: «📖 Что читать дальше» — next-text по корпусу. Скоринг ДЕТЕРМИНИРОВАН
  // и живёт у хоста (host.nextTextPicks → движок corpus-vocab.js — тот же, что рельса
  // Зала: R11 согласованность по построению). LLM — ТОЛЬКО по тапу «Почему?» (1 вызов;
  // повтор закрыт client-memo). Kind-фрейминг = контракт движка: challenge никогда
  // не «для тебя», coldstart без %-бейджа. Всё textContent. ──
  var _ntMemo = {};        // work_id → готовый ответ «Почему?» (сессия; квота не жжётся повторно)
  var _ntOfferedAt = 0;    // для latency_ms в agent_ux
  function _ux(feature, action, latencyMs) {
    try { if (S.host && S.host.agentUx) S.host.agentUx(feature, action, latencyMs); } catch (_) {}
  }
  function renderNextText(box) {
    box.textContent = "";
    if (!S.host || typeof S.host.nextTextPicks !== "function") return;   // нет capability (MA) — блока нет
    var btn = el("button", "mentor-plan-btn", "📖 " + t("room.nexttext.btn", "Что читать дальше"));
    btn.type = "button";
    btn.addEventListener("click", function () { nextTextLoad(box); });
    box.appendChild(btn);
    box.appendChild(el("div", "mentor-hint", t("room.nexttext.hint", "Подбор текста из корпуса по вашему словарю — тем же движком, что рельса «Следующий для тебя».")));
  }
  var _ntBusy = false;
  async function nextTextLoad(box) {
    if (_ntBusy) return;
    _ntBusy = true;
    box.textContent = "";
    box.appendChild(el("div", "mentor-hint", t("room.nexttext.loading", "Подбираю тексты…")));
    var r = null;
    try { r = await S.host.nextTextPicks(); } catch (_) { r = { error: "data" }; }
    _ntBusy = false;
    box.textContent = "";
    // терминальные состояния РАЗЛИЧЕНЫ (критика: ошибка данных ≠ пустой профиль)
    if (r && r.error) {
      box.appendChild(el("div", "mentor-hint", "✗ " + t("room.nexttext.err", "Не удалось загрузить каталог корпуса.")));
      var rb = el("button", "mentor-plan-btn", t("room.nexttext.retry", "Повторить"));
      rb.type = "button";
      rb.addEventListener("click", function () { nextTextLoad(box); });
      box.appendChild(rb);
      return;
    }
    if (!r || !r.picks || !r.picks.length) {
      box.appendChild(el("div", "mentor-hint", t("room.nexttext.empty", "Пока нечего предложить — отметьте несколько слов в текстах, и подбор появится.")));
      return;
    }
    var kind = r.kind;
    // kind-фрейминг: паритет с рельсой 🎯/🔥/🌱 (те же ключи локалей Зала)
    var head = el("div", "mentor-nt-head");
    var meta = kind === "challenge"
      ? { emoji: "🔥", key: "room.corpus.challengeTitle", fb: "Следующий вызов", introKey: "room.corpus.challengeIntro", introFb: "Ты перерос лёгкое — вот посильный вызов чуть выше твоего уровня." }
      : kind === "coldstart"
        ? { emoji: "🌱", key: "room.corpus.coldStartTitle", fb: "С чего начать", introKey: "room.nexttext.coldIntro", introFb: "Профиль ещё мал — вот лёгкие тексты канона для старта." }
        : { emoji: "🎯", key: "room.corpus.nextTitle", fb: "Следующий для тебя", introKey: "room.corpus.nextIntro", introFb: "Тексты, где ты уже знаешь ~80–95% слов — идеальны для роста." };
    head.textContent = meta.emoji + " " + t(meta.key, meta.fb);
    box.appendChild(head);
    box.appendChild(el("div", "mentor-hint", t(meta.introKey, meta.introFb)));
    _ntOfferedAt = Date.now();
    _ux("next_text", "offered");
    r.picks.forEach(function (pick) {
      var row = el("div", "mentor-nt-pick");
      var line = el("div", "mentor-nt-title");
      line.setAttribute("dir", "auto");   // bidi: ивритский титул в ru/en-строке
      var bdi = el("bdi", null, pick.title || pick.work_id);
      bdi.setAttribute("lang", "he");
      line.appendChild(bdi);
      if (pick.author) {
        var au = el("span", "mentor-nt-author");
        au.appendChild(document.createTextNode(" · "));
        var abdi = el("bdi", null, pick.author);
        abdi.setAttribute("lang", "he");
        au.appendChild(abdi);
        line.appendChild(au);
      }
      // %-бейдж только у live-cov пиков (coldstart без cov — сфабрикованный «0%» запрещён)
      if (kind !== "coldstart" && typeof pick.cov === "number") {
        line.appendChild(el("span", "mentor-nt-badge coverage-" + (kind === "challenge" ? "hard" : "in"),
          " ≈" + Math.round(pick.cov * 100) + "% " + t("room.corpus.cov.familiar", "знакомо")));
      }
      row.appendChild(line);
      var actions = el("div", "mentor-nt-actions");
      var read = el("button", "mentor-plan-go", t("room.nexttext.read", "▶ Читать"));
      read.type = "button";
      read.addEventListener("click", function () {
        _ux("next_text", "accepted", Date.now() - _ntOfferedAt);
        try { S.host.openCorpusPick(pick); } catch (_) {}
      });
      actions.appendChild(read);
      if (kind !== "coldstart") {
        var why = el("button", "mentor-plan-go", t("room.nexttext.why", "🤖 Почему?"));
        why.type = "button";
        var out = el("div", "mentor-nt-why");
        why.addEventListener("click", function () { nextTextWhy(pick, kind, why, out); });
        actions.appendChild(why);
        row.appendChild(actions);
        row.appendChild(out);
      } else {
        row.appendChild(actions);
      }
      box.appendChild(row);
    });
    var again = el("button", "mentor-wr-ghost", t("room.nexttext.again", "Обновить подбор"));
    again.type = "button";
    again.addEventListener("click", function () { nextTextLoad(box); });
    box.appendChild(again);
  }
  function _ntRenderWhy(out, j) {
    out.textContent = "";
    var txt = el("div", "mentor-nt-why-text", j.text || "");
    txt.setAttribute("dir", "auto");
    out.appendChild(txt);
    var metaBits = [];
    if (j.provider) metaBits.push("🤖 " + _byokProv(j) + j.provider + (j.model ? " · " + j.model : ""));
    if (j.usage && j.usage.limit) metaBits.push(t("room.explain.usage", "AI сегодня") + ": " + j.usage.user_llm_calls + "/" + j.usage.limit);
    if (metaBits.length) out.appendChild(el("div", "mentor-hint", metaBits.join(" · ")));
  }
  async function nextTextWhy(pick, kind, btn, out) {
    if (_ntMemo[pick.work_id]) { _ntRenderWhy(out, _ntMemo[pick.work_id]); return; }
    _ux("next_text", "accepted", Date.now() - _ntOfferedAt);
    btn.disabled = true;
    out.textContent = "";
    out.appendChild(el("div", "mentor-hint", t("room.explain.loading", "Наставник думает…")));
    var r = null;
    try {
      r = await jpost("/api/agent/next-text/explain", _mhByok({ pick: {
        work_id: pick.work_id, cov: pick.cov, load_flag: !!pick.load_flag,
        kind: kind, frontier_pids: pick.frontier_pids || [],
      } }));
    } catch (_) {}
    btn.disabled = false;
    out.textContent = "";
    if (!r || r.status !== 200 || !r.json || !r.json.ok) {
      var code = (r && r.json && r.json.error) || "";
      var msg = code === "USER_LIMIT" || code === "GLOBAL_LIMIT" ? t("room.cloud.planLimit", "дневной лимит LLM исчерпан")
        : code === "KILL_SWITCH" ? t("room.cloud.agentKill", "LLM выключен (kill-switch)")
        : code === "BYOK_FAILED" || code === "BYOK_INVALID" ? degradeLabel(code)   // PAS-F1
        : "✗ " + t("room.explain.err", "Не удалось получить объяснение") + (code ? " (" + code + ")" : "");
      out.appendChild(el("div", "mentor-hint", msg));
      return;
    }
    _ntMemo[pick.work_id] = r.json;
    _ntRenderWhy(out, r.json);
    try { renderStatus(S.els.status); } catch (_) {}   // счётчик LLM сразу отражает списание
  }

  // ── PAS-C2: «✍️ Практика письма» — constrained writing (advisory, класс D:
  // текст не сохраняется, review_log не пишется; факт «слово использовано»
  // утверждает детерминированный сервер-матч, LLM — совет поверх). Всё textContent. ──
  var _wrTargets = null;
  var _wrBusy = false;
  function renderWriting(box) {
    box.textContent = "";
    var btn = el("button", "mentor-plan-btn", "✍️ " + t("room.writing.btn", "Практика письма"));
    btn.type = "button";
    btn.addEventListener("click", function () { writingLoad(box); });
    box.appendChild(btn);
    box.appendChild(el("div", "mentor-hint", t("room.writing.hint", "3 ваших слова — напишите с ними 1–2 предложения на иврите; разбор наставника, не оценка.")));
  }
  async function writingLoad(box) {
    if (_wrBusy) return;
    _wrBusy = true;
    box.textContent = "";
    box.appendChild(el("div", "mentor-hint", t("room.explain.loading", "Наставник думает…")));
    var r = null;
    try { r = await jget("/api/agent/writing/targets"); } catch (_) {}
    _wrBusy = false;
    box.textContent = "";
    var targets = r && r.status === 200 && r.json && r.json.ok ? (r.json.targets || []) : null;
    if (!targets) { box.appendChild(el("div", "mentor-hint", "✗ " + t("room.explain.err", "Не удалось получить объяснение"))); return; }
    if (!targets.length) {
      box.appendChild(el("div", "mentor-hint", t("room.writing.empty", "Пока нет слов для практики — читайте и отмечайте слова, цели появятся из ваших слабых/просроченных.")));
      return;
    }
    _wrTargets = targets;
    var chips = el("div", "mentor-wr-chips");
    targets.forEach(function (tg) {
      var chip = el("span", "mentor-wr-chip");
      var he = el("bdi", null, tg.lemma); he.setAttribute("lang", "he");
      chip.appendChild(he);
      if (tg.meaning) chip.appendChild(el("span", "mentor-wr-gloss", " · " + tg.meaning));
      chips.appendChild(chip);
    });
    box.appendChild(chips);
    var ta = document.createElement("textarea");
    ta.className = "mentor-wr-input";
    ta.maxLength = 300;
    ta.setAttribute("dir", "rtl"); ta.setAttribute("lang", "he");
    ta.placeholder = t("room.writing.ph", "Напишите 1–2 предложения с этими словами…");
    box.appendChild(ta);
    var row = el("div", "mentor-plan-actions");
    var go = el("button", "mentor-plan-btn", t("room.writing.check", "Проверить"));
    go.type = "button";
    go.addEventListener("click", function () { writingSubmit(box, ta, go); });
    row.appendChild(go);
    box.appendChild(row);
    box.appendChild(el("div", "mentor-wr-out"));
  }
  async function writingSubmit(box, ta, go) {
    var text = (ta.value || "").trim();
    if (!text || _wrBusy || !_wrTargets) return;
    var out = box.querySelector(".mentor-wr-out");
    if (!out) return;
    // First-use раскрытие ДО первой отправки (критика wf_5ea38001 MAJOR: сочинённый
    // учеником текст — самый личный контент слайса; паттерн ownCompAck)
    var acked = false;
    try { acked = localStorage.getItem("room.writingAck") === "1"; } catch (_) {}
    if (!acked) {
      out.textContent = "";
      out.appendChild(el("div", "mentor-hint", t("room.writing.ack", "Ваш текст будет отправлен внешнему LLM и потратит 1 вызов из дневного лимита; текст не сохраняется. Продолжить?")));
      var arow = el("div", "mentor-plan-actions");
      var ok = el("button", "mentor-plan-btn", t("room.explain.corpusAckBtn", "Понятно, объяснить"));
      ok.type = "button";
      ok.addEventListener("click", function () { try { localStorage.setItem("room.writingAck", "1"); } catch (_) {} out.textContent = ""; writingSubmit(box, ta, go); });
      var no = el("button", "mentor-wr-ghost", t("room.explain.cancel", "Отмена"));
      no.type = "button";
      no.addEventListener("click", function () { out.textContent = ""; });
      arow.appendChild(ok); arow.appendChild(no);
      out.appendChild(arow);
      return;
    }
    _wrBusy = true; go.disabled = true;
    out.textContent = "";
    out.appendChild(el("div", "mentor-hint", t("room.explain.loading", "Наставник думает…")));
    var r = null;
    try { r = await jpost("/api/agent/writing/review", _mhByok({ targets: _wrTargets.map(function (x) { return x.item_key; }), text: text })); } catch (_) {}
    _wrBusy = false; go.disabled = false;
    out.textContent = "";
    if (!r || r.status !== 200 || !r.json || !r.json.ok) {
      var code = (r && r.json && r.json.error) || "";
      var msg = code === "NOT_HEBREW_ENOUGH" ? t("room.writing.notHebrew", "Нужно писать на иврите — хотя бы наполовину.")
        : code === "TEXT_TOO_LONG" ? t("room.writing.tooLong", "Слишком длинно — до 300 символов.")
        : code === "USER_LIMIT" || code === "GLOBAL_LIMIT" ? t("room.cloud.planLimit", "дневной лимит LLM исчерпан")
        : "✗ " + t("room.explain.err", "Не удалось получить объяснение") + (code ? " (" + code + ")" : "");
      out.appendChild(el("div", "mentor-hint", msg));
      return;
    }
    out.appendChild(el("div", "mentor-wr-plate", "✍️ " + t("room.writing.plate", "Практика · не оценка, в память не записывается; текст не сохраняется.")));
    var list = el("div", "mentor-wr-used");
    (r.json.used || []).forEach(function (u) {
      var mark = u.matched === "exact" ? "✓" : u.matched === "probable" ? "≈" : "✗";
      var line = el("div", "mentor-wr-used-line", mark + " ");
      var he = el("bdi", null, u.lemma); he.setAttribute("lang", "he");
      line.appendChild(he);
      if (u.matched === "probable") line.appendChild(el("span", "mentor-wr-gloss", " " + t("room.writing.probable", "(вероятно использовано)")));
      list.appendChild(line);
    });
    out.appendChild(list);
    var advisory = el("div", "mentor-wr-text");
    advisory.textContent = r.json.text || "";
    out.appendChild(advisory);
    var metaBits = [];
    if (r.json.llm_used) metaBits.push("🤖 " + _byokProv(r.json) + (r.json.provider || "") + (r.json.model ? " · " + r.json.model : ""));
    else if (r.json.degraded_reason) metaBits.push(degradeLabel(r.json.degraded_reason));
    if (r.json.usage && r.json.usage.limit) metaBits.push(t("room.explain.usage", "AI сегодня") + ": " + r.json.usage.user_llm_calls + "/" + r.json.usage.limit);
    if (metaBits.length) out.appendChild(el("div", "mentor-hint", metaBits.join(" · ")));
  }

  // ── Wave 2 LB0: selected-source lesson draft. Source discovery is a host
  // capability; typed artifact persistence is session-only through the shared
  // store boundary. No build/activate action writes learner truth. ──
  var _lbSelected = [];
  var _lbBusy = false;
  function _lbApi() { try { return typeof globalThis !== "undefined" ? globalThis.LessonArtifact : null; } catch (_) { return null; } }
  function _lbStore() {
    try { var api = _lbApi(); return api && api.createSessionStore(); } catch (_) { return null; }
  }
  function renderLessonLauncher(box) {
    box.textContent = "";
    var store = _lbStore(), saved = store && store.load();
    var open = el("button", "mentor-plan-btn", "🧩 " + t("room.lesson.openStudio", "Открыть Студию урока"));
    open.type = "button"; open.addEventListener("click", function () {
      if (S.host && typeof S.host.openLessonStudio === "function") S.host.openLessonStudio();
    });
    box.appendChild(open);
    box.appendChild(el("div", "mentor-hint", saved
      ? t("room.lesson.resumeHint", "Черновик ждёт в Студии урока. Он хранится в этом браузере не более 24 часов.")
      : t("room.lesson.hint", "Выберите 1–3 существующих текста. Черновик редактируется и хранится в этом браузере не более 24 часов.")));
  }
  function renderLessonBuilder(box) {
    box.textContent = "";
    var store = _lbStore(), saved = store && store.load();
    if (saved) { renderLessonDraft(box, saved, store); return; }
    lessonForm(box);
  }
  function lessonForm(box) {
    box.textContent = "";
    box.appendChild(el("h3", "mentor-block-title", t("room.lesson.title", "🧩 Конструктор урока")));
    box.appendChild(el("div", "mentor-lb-steps", t("room.lesson.steps", "1 · Источники   →   2 · Настройка   →   3 · Черновик")));
    var mobileNav=el("div","mentor-lb-mobile-nav"),sourceStep=el("button","mentor-lb-mobile-step",t("room.lesson.mobileSources","Источники")),lessonStep=el("button","mentor-lb-mobile-step",t("room.lesson.mobileLesson","Урок"));
    sourceStep.type="button";lessonStep.type="button";mobileNav.appendChild(sourceStep);mobileNav.appendChild(lessonStep);box.appendChild(mobileNav);
    var workspace=el("div","mentor-lb-workspace"),sourcePane=el("section","mentor-lb-pane mentor-lb-source-pane"),lessonPane=el("section","mentor-lb-pane mentor-lb-lesson-pane");
    workspace.appendChild(sourcePane);workspace.appendChild(lessonPane);box.appendChild(workspace);
    function mobileStep(step){box.dataset.lbMobileStep=step;sourceStep.setAttribute("aria-pressed",String(step==="source"));lessonStep.setAttribute("aria-pressed",String(step==="lesson"));}
    sourceStep.addEventListener("click",function(){mobileStep("source");});lessonStep.addEventListener("click",function(){mobileStep("lesson");});mobileStep("source");
    var sourceKind = "all", latestSources = [], sourceTotal = 0, sourcePage = 0, pageSize = 20;
    var sourceHead = el("div", "mentor-lb-section-head");
    sourceHead.appendChild(el("strong", null, t("room.lesson.sourceTitle", "Выберите материалы")));
    var sourceCount = el("span", "mentor-lb-count"); sourceHead.appendChild(sourceCount); sourcePane.appendChild(sourceHead);
    sourcePane.appendChild(el("div", "mentor-hint", t("room.lesson.sourceHint", "До 3 текстов. Для каждого будет использован только указанный диапазон.")));
    var selected = el("div", "mentor-lb-selected"); sourcePane.appendChild(selected);
    var build = null;
    function totalOf(s) { return Math.max(0, Number(s.sentence_count) || 0); }
    function applyPreset(s, mode) {
      var total = totalOf(s), count = Math.min(total || 20, 20);
      if (mode === "whole") { s.start_order_index = 0; s.row_count = total || 20; }
      else if (mode === "middle") { s.row_count = count; s.start_order_index = Math.max(0, Math.floor(((total || count) - count) / 2)); }
      else if (mode === "end") { s.row_count = count; s.start_order_index = Math.max(0, (total || count) - count); }
      else { s.start_order_index = 0; s.row_count = count; }
    }
    function updateReady() {
      sourceCount.textContent = _lbSelected.length + "/3";
      if (build) build.disabled = _lbBusy || _lbSelected.length < 1 || _lbSelected.length > 3;
    }
    function paintSelected() {
      selected.textContent = "";
      if (!_lbSelected.length) selected.appendChild(el("div", "mentor-lb-empty", t("room.lesson.sourceEmpty", "Выбранные тексты появятся здесь.")));
      _lbSelected.forEach(function (s, idx) {
        var card = el("div", "mentor-lb-source");
        var head = el("div", "mentor-lb-source-head");
        var titleWrap = el("div", "mentor-lb-source-copy");
        var title = el("strong", null, (s.kind === "corpus" ? "📚 " : "📝 ") + s.title); title.setAttribute("dir", "auto"); titleWrap.appendChild(title);
        var meta = [(s.kind === "corpus" ? t("room.lesson.corpus", "Корпус") : t("room.lesson.personal", "Мои тексты"))];
        if (s.author) meta.push(s.author); if (totalOf(s)) meta.push(totalOf(s) + " " + t("room.lesson.sentences", "предл."));
        titleWrap.appendChild(el("div", "mentor-lb-source-meta", meta.join(" · ")));
        var rm = el("button", "mentor-wr-ghost", "×"); rm.type = "button"; rm.setAttribute("aria-label", t("room.lesson.remove", "Удалить источник"));
        rm.addEventListener("click", function () { _lbSelected.splice(idx, 1); paintSelected(); find(); });
        head.appendChild(titleWrap); head.appendChild(rm); card.appendChild(head);
        var preset = document.createElement("select"); preset.className = "mentor-lb-preset"; preset.setAttribute("aria-label", t("room.lesson.rangePreset", "Фрагмент текста"));
        [["start",t("room.lesson.rangeStart","Начало")],["middle",t("room.lesson.rangeMiddle","Середина")],["end",t("room.lesson.rangeEnd","Конец")],["custom",t("room.lesson.rangeCustom","Свой диапазон")]].forEach(function(x){var o=document.createElement("option");o.value=x[0];o.textContent=x[1];preset.appendChild(o);});
        if (totalOf(s)) { var whole=document.createElement("option");whole.value="whole";whole.textContent=t("room.lesson.rangeWhole","Весь текст");preset.insertBefore(whole,preset.firstChild); }
        preset.value=s.range_preset||"start"; card.appendChild(preset);
        var range = el("div", "mentor-lb-range");
        var a = el("label", "mentor-lb-field", t("room.lesson.fromSentence", "От предложения"));
        var ai = document.createElement("input"); ai.type = "number"; ai.min = "1"; ai.max = String(totalOf(s) || 99999); ai.value = String((s.start_order_index || 0) + 1); a.appendChild(ai);
        var c = el("label", "mentor-lb-field", t("room.lesson.toSentence", "До предложения"));
        var ci = document.createElement("input"); ci.type = "number"; ci.min = "1"; ci.max = String(totalOf(s) || 99999); ci.value = String((s.start_order_index || 0) + (s.row_count || 20)); c.appendChild(ci);
        var summary = el("div", "mentor-lb-range-summary");
        function syncRange(custom) { var total=totalOf(s), from=Math.max(1,Number(ai.value)||1), to=Math.max(from,Number(ci.value)||from); if(total){from=Math.min(from,total);to=Math.min(to,total);} s.start_order_index=from-1;s.row_count=to-from+1;ai.value=String(from);ci.value=String(to);if(custom){preset.value="custom";s.range_preset="custom";}summary.textContent=from+"–"+to+(total?" "+t("room.lesson.of","из")+" "+total:"")+" · "+s.row_count+" "+t("room.lesson.sentences","предл."); }
        ai.addEventListener("change",function(){syncRange(true);});ci.addEventListener("change",function(){syncRange(true);});
        preset.addEventListener("change",function(){s.range_preset=preset.value;if(preset.value!=="custom")applyPreset(s,preset.value);paintSelected();});
        range.appendChild(a); range.appendChild(c); card.appendChild(range); card.appendChild(summary); syncRange(false); selected.appendChild(card);
      });
      updateReady();
    }
    paintSelected();
    var filters = el("div", "mentor-lb-filters");
    [["all",t("room.lesson.allSources","Все")],["personal",t("room.lesson.personal","Мои тексты")],["corpus",t("room.lesson.corpus","Корпус")]].forEach(function(x){var b=el("button","mentor-lb-filter",x[1]);b.type="button";b.dataset.kind=x[0];b.setAttribute("aria-pressed",String(sourceKind===x[0]));b.addEventListener("click",function(){sourceKind=x[0];Array.from(filters.children).forEach(function(n){n.setAttribute("aria-pressed",String(n.dataset.kind===sourceKind));});find(true);});filters.appendChild(b);}); sourcePane.appendChild(filters);
    var search = document.createElement("input"); search.className = "mentor-wr-input"; search.style.minHeight = "auto";
    search.placeholder = t("room.lesson.search", "Найти мой текст или работу корпуса…"); search.setAttribute("aria-label", search.placeholder);
    sourcePane.appendChild(search);
    var results = el("div", "mentor-lb-results"); sourcePane.appendChild(results);
    var pager = el("div", "mentor-lb-pager"); sourcePane.appendChild(pager);
    function paintResults() {
      results.textContent = "";
      pager.textContent = "";
      if(!latestSources.length){results.appendChild(el("div","mentor-lb-empty",t("room.lesson.noSources","Ничего не найдено.")));return;}
      latestSources.forEach(function (s) {
        if (_lbSelected.some(function (x) { return x.kind === s.kind && x.text_key === s.text_key && String(x.work_id || "") === String(s.work_id || ""); })) return;
        var b = el("button", "mentor-lb-result"); b.type = "button"; b.setAttribute("dir", "auto");
        b.appendChild(el("strong",null,(s.kind === "corpus" ? "📚 " : "📝 ") + s.title));
        var bits=[];if(s.author)bits.push(s.author);bits.push(totalOf(s)?totalOf(s)+" "+t("room.lesson.sentences","предл."):t("room.lesson.countUnknown","объём уточняется"));b.appendChild(el("span","mentor-lb-result-meta",bits.join(" · ")));
        b.addEventListener("click", function () { if (_lbSelected.length >= 3) return; var picked=Object.assign({},s,{range_preset:"start"});applyPreset(picked,"start");_lbSelected.push(picked);paintSelected();paintResults(); }); results.appendChild(b);
      });
      var from=sourceTotal?sourcePage*pageSize+1:0,to=Math.min(sourceTotal,(sourcePage+1)*pageSize);
      var prev=el("button","mentor-wr-ghost","←");prev.type="button";prev.disabled=sourcePage===0;prev.setAttribute("aria-label",t("room.lesson.prevPage","Предыдущая страница"));prev.addEventListener("click",function(){if(sourcePage>0){sourcePage--;find(false);}});
      var next=el("button","mentor-wr-ghost","→");next.type="button";next.disabled=to>=sourceTotal;next.setAttribute("aria-label",t("room.lesson.nextPage","Следующая страница"));next.addEventListener("click",function(){if(to<sourceTotal){sourcePage++;find(false);}});
      pager.appendChild(prev);pager.appendChild(el("span","mentor-lb-page-status",from+"–"+to+" "+t("room.lesson.of","из")+" "+sourceTotal));pager.appendChild(next);
    }
    async function find(reset) {
      if(reset)sourcePage=0;
      results.textContent = "";
      if (!(S.host && typeof S.host.lessonSources === "function")) return;
      try {
        var found=await S.host.lessonSources({query:search.value,kind:sourceKind,offset:sourcePage*pageSize,limit:pageSize});
        if(Array.isArray(found)){latestSources=found;sourceTotal=found.length;}
        else {latestSources=Array.isArray(found&&found.items)?found.items:[];sourceTotal=Math.max(0,Number(found&&found.total)||0);}
      } catch (_) { latestSources=[];sourceTotal=0; }
      paintResults();
    }
    var timer = null; search.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function(){find(true);}, 180); }); find(true);
    var grid = el("div", "mentor-lb-grid");
    function field(label, node, wide) { var f = el("label", "mentor-lb-field" + (wide ? " wide" : ""), label); f.appendChild(node); grid.appendChild(f); return node; }
    var setupHead=el("div","mentor-lb-section-head");setupHead.appendChild(el("strong",null,t("room.lesson.setupTitle","Настройте урок")));lessonPane.appendChild(setupHead);
    var goal = document.createElement("select"); [["active_vocabulary",t("room.lesson.goals.activeVocabulary","Понять текст и применить ключевые слова")],["understand",t("room.lesson.goals.understand","Понять основную мысль и детали")],["grammar_in_context",t("room.lesson.goals.grammar","Разобрать грамматику в контексте")],["retell",t("room.lesson.goals.retell","Пересказать своими словами")],["discuss",t("room.lesson.goals.discuss","Обсудить идеи и выразить мнение")],["write_response",t("room.lesson.goals.write","Написать связный отклик")],["custom",t("room.lesson.goals.custom","Своя цель…")]].forEach(function(x){var o=document.createElement("option");o.value=x[0];o.textContent=x[1];goal.appendChild(o);}); field(t("room.lesson.goal", "Цель"), goal, true);
    var customGoal=document.createElement("input");customGoal.maxLength=240;customGoal.placeholder=t("room.lesson.customGoal","Сформулируйте результат урока…");var customField=field(t("room.lesson.customGoalLabel","Своя цель"),customGoal,true).parentNode;customField.hidden=true;goal.addEventListener("change",function(){customField.hidden=goal.value!=="custom";});
    var lng = document.createElement("select"); [["ru","Русский"],["en","English"],["he","עברית"]].forEach(function (x) { var o=document.createElement("option");o.value=x[0];o.textContent=x[1];lng.appendChild(o); }); lng.value = lang().slice(0,2); field(t("room.lesson.language", "Язык объяснений"), lng);
    var level = document.createElement("select"); ["unknown","A1","A2","B1","B2"].forEach(function (x) { var o=document.createElement("option");o.value=x;o.textContent=x==="unknown"?t("room.lesson.levelAuto","Определить автоматически"):x;level.appendChild(o); }); field(t("room.lesson.level", "Примерный уровень"), level);
    var duration = document.createElement("select"); [10,20,30].forEach(function (x) { var o=document.createElement("option");o.value=String(x);o.textContent=x+" "+t("room.lesson.minutes","мин");duration.appendChild(o); }); duration.value="20"; field(t("room.lesson.duration", "Длительность"), duration);
    var lessonMode=document.createElement("select");[["auto",t("room.lesson.modeAuto","По объёму текста")],["overview",t("room.lesson.modeOverview","Один обзорный урок")],["series",t("room.lesson.modeSeries","Серия уроков")]].forEach(function(x){var o=document.createElement("option");o.value=x[0];o.textContent=x[1];lessonMode.appendChild(o);});field(t("room.lesson.mode","Формат"),lessonMode);
    var focusSet=new Set(["reading","vocabulary"]), focusBox=el("div","mentor-lb-focuses");
    [["reading","Чтение"],["vocabulary","Лексика"],["grammar","Грамматика"],["writing","Письмо"],["dialogue","Диалог"]].forEach(function(x){var b=el("button","mentor-lb-focus",t("room.lesson.focus."+x[0],x[1]));b.type="button";b.dataset.focus=x[0];b.setAttribute("aria-pressed",String(focusSet.has(x[0])));b.addEventListener("click",function(){var max=Number(duration.value)===10?2:3;if(focusSet.has(x[0])){if(focusSet.size>1)focusSet.delete(x[0]);}else if(focusSet.size<max)focusSet.add(x[0]);Array.from(focusBox.children).forEach(function(n){n.setAttribute("aria-pressed",String(focusSet.has(n.dataset.focus)));});syncGrammarField();});focusBox.appendChild(b);});
    var ff=el("div","mentor-lb-field wide");ff.appendChild(el("span",null,t("room.lesson.focusLabel","Фокусы")));ff.appendChild(focusBox);ff.appendChild(el("span","mentor-hint",t("room.lesson.focusHint","Выберите до 3 направлений; для 10 минут — до 2.")));grid.appendChild(ff);
    var grammarSelect=document.createElement("select"),grammarField=el("label","mentor-lb-field wide",t("room.lesson.grammarTarget","Грамматическая цель"));var grammarEmpty=document.createElement("option");grammarEmpty.value="";grammarEmpty.textContent=t("room.lesson.grammarAnalyze","Сначала найти подтверждённые конструкции в выбранном тексте");grammarSelect.appendChild(grammarEmpty);grammarField.appendChild(grammarSelect);grammarField.appendChild(el("span","mentor-hint",t("room.lesson.grammarHint","Анализ выполняется без LLM. Урок не будет создан, пока вы не выберете найденную конструкцию.")));grid.appendChild(grammarField);
    function syncGrammarField(){grammarField.hidden=!focusSet.has("grammar");if(grammarField.hidden)grammarSelect.value="";}
    function paintGrammarTargets(items){while(grammarSelect.options.length>1)grammarSelect.remove(1);(items||[]).forEach(function(c){var o=document.createElement("option");o.value=c.id;o.textContent=c.title+(c.evidence_surfaces&&c.evidence_surfaces.length?" · "+c.evidence_surfaces.join(", "):"");grammarSelect.appendChild(o);});grammarSelect.value="";syncGrammarField();}
    syncGrammarField();
    duration.addEventListener("change",function(){var max=Number(duration.value)===10?2:3;while(focusSet.size>max){var last=Array.from(focusSet).pop();focusSet.delete(last);}Array.from(focusBox.children).forEach(function(n){n.setAttribute("aria-pressed",String(focusSet.has(n.dataset.focus)));});syncGrammarField();});
    lessonPane.appendChild(grid);
    var out = el("div", "mentor-hint"); lessonPane.appendChild(out);
    var actions = el("div", "mentor-plan-actions");
    build = el("button", "mentor-plan-btn", t("room.lesson.build", "Создать черновик")); build.type="button"; updateReady();
    build.addEventListener("click", async function () {
      if (_lbBusy || _lbSelected.length < 1 || _lbSelected.length > 3) { out.textContent=t("room.lesson.needSources","Выберите от одного до трёх источников."); return; }
      if(goal.value==="custom"&&!customGoal.value.trim()){out.textContent=t("room.lesson.needGoal","Сформулируйте свою цель.");return;}
      _lbBusy=true; build.disabled=true; out.textContent=t("room.explain.loading","Наставник думает…");
      var body={ sources:_lbSelected.map(function(s){return {kind:s.kind,text_key:s.text_key,work_id:s.work_id,start_order_index:Number(s.start_order_index)||0,row_count:Number(s.row_count)||20};}), goalId:goal.value, customGoal:customGoal.value,
        explanationLanguage:lng.value, approximateLevel:level.value, durationMinutes:Number(duration.value), focuses:Array.from(focusSet), lessonMode:lessonMode.value, grammarTarget:grammarSelect.value||null };
      var r=null; try { r=await jpost("/api/agent/lesson-builder/build",_mhByok(body)); } catch(_){}
      _lbBusy=false; build.disabled=false;
      if(!r||r.status!==200||!r.json||!r.json.ok){var code=r&&r.json&&r.json.error||"";if(code==="GRAMMAR_TARGET_REQUIRED"){paintGrammarTargets(r.json.candidate_constructs);out.textContent=t("room.lesson.chooseGrammar","Выберите одну найденную конструкцию и снова создайте черновик.");return;}if(code==="GRAMMAR_TARGET_UNAVAILABLE"){out.textContent=t("room.lesson.noGrammar","В выбранном диапазоне резолвер не подтвердил грамматическую конструкцию. Измените диапазон или снимите фокус «Грамматика».");return;}out.textContent=lessonError(code,r&&r.json);return;}
      var store=_lbStore(); if(!store||!store.save(r.json.draft).ok){out.textContent=t("room.lesson.storageError","Не удалось сохранить черновик в этой сессии.");return;}
      _ux("lesson_builder","offered"); renderLessonDraft(box,r.json.draft,store,r.json);
    });
    var cancel=el("button","mentor-wr-ghost",t("room.explain.cancel","Отмена"));cancel.type="button";cancel.addEventListener("click",function(){renderLessonBuilder(box);});
    actions.appendChild(build);actions.appendChild(cancel);lessonPane.appendChild(actions);
  }
  function lessonError(code, body) {
    if(code==="SOURCE_SELECTION_TOO_SHORT")return t("room.lesson.tooShort","Выбранный фрагмент короче 500 символов — увеличьте число предложений.");
    if(code==="SOURCE_SELECTION_TOO_LARGE"||code==="SOURCE_TOTAL_TOO_LARGE"||code==="SOURCE_ANCHOR_TOO_LARGE")return t("room.lesson.tooLarge","Фрагмент слишком большой — уменьшите диапазон; обрезание не выполняется.");
    if(code&&code.indexOf("CONSENT_REQUIRED")>=0)return t("room.lesson.consent","Для личного текста включите синхронизацию и разрешение наставнику читать целые тексты в настройках выше.");
    if(code==="TEXT_NOT_IN_CLOUD")return t("room.lesson.sync","Личный текст ещё не синхронизирован с облаком.");
    return "✗ "+t("room.lesson.error","Не удалось создать урок")+(code?" ("+code+")":"");
  }
  function renderLessonDraft(box,draft,store,meta){
    box.textContent="";var active=draft.status==="active";
    var anchorIndex={};(draft.sourceMap||[]).forEach(function(sm){(sm.anchor_windows||[]).forEach(function(a){anchorIndex[a.id]={source_id:sm.source_id,anchor:a};});});
    function appendAnchors(card,ids){var row=el("div","mentor-lb-anchor-row");(ids||[]).forEach(function(id){var hit=anchorIndex[id],ref=hit&&(draft.sourceRefs||[]).find(function(r){return r.id===hit.source_id;});if(!hit||!ref)return;var b=el("button","mentor-lb-anchor","↩ "+t("room.lesson.anchorSentences","Предложения")+" "+(hit.anchor.start_order_index+1)+"–"+(hit.anchor.end_order_index+1));b.type="button";b.addEventListener("click",function(){try{S.host.openLessonSource(ref,hit.anchor.start_order_index);}catch(_){}});row.appendChild(b);});if(row.children.length)card.appendChild(row);}
    var title=el("h3","mentor-block-title"+(active?" mentor-lb-active":""),active?t("room.lesson.active","✓ Урок начат"):t("room.lesson.draft","Черновик урока"));box.appendChild(title);
    box.appendChild(el("div","mentor-hint",t("room.lesson.ephemeral","Хранится только в этой браузерной сессии и удалится не позднее чем через 24 часа.")));
    if(draft.quality&&draft.quality.tier==="basic_plan")box.appendChild(el("div","mentor-lb-quality-basic",t("room.lesson.basicPlan","Базовый план без AI · проверьте и отредактируйте перед началом.")));
    else if(draft.quality&&draft.quality.premium_ready)box.appendChild(el("div","mentor-lb-quality-draft",t("room.lesson.qualityPassed","AI-черновик прошёл автоматические проверки опор, ответов и критериев · вы остаётесь редактором.")));
    if(Array.isArray(draft.seriesPlan)&&draft.seriesPlan.length){var sp=el("div","mentor-lb-series");sp.appendChild(el("strong",null,t("room.lesson.seriesPlan","План серии")+": "+draft.seriesPlan.length));draft.seriesPlan.forEach(function(x,i){sp.appendChild(el("div","mentor-hint",(i+1)+". "+t("room.lesson.sentences","предл.")+" "+(x.start_order_index+1)+"–"+(x.end_order_index+1)+" · "+x.estimated_minutes+" "+t("room.lesson.minutes","мин")));});box.appendChild(sp);}
    if(typeof draft.coverage==="number")box.appendChild(el("div","mentor-hint",t("room.lesson.coverage","Оценка покрытия")+": ≈"+Math.round(draft.coverage*100)+"% · "+t("room.lesson.reviewTargets","доступных целей повторения")+": "+((draft.availableReviewTargets||[]).length)));
    var obj=el("label","mentor-lb-field wide",t("room.lesson.objective","Цель урока"));var oi=document.createElement("textarea");oi.className="mentor-lb-edit";oi.value=draft.objective;oi.disabled=active;obj.appendChild(oi);box.appendChild(obj);
    var secInputs=[];draft.sections.forEach(function(s,i){var card=el("div","mentor-lb-source");var ti=document.createElement("input");ti.className="mentor-lb-result";ti.value=s.title;ti.disabled=active;var bi=document.createElement("textarea");bi.className="mentor-lb-edit";bi.value=s.body;bi.disabled=active;card.appendChild(ti);card.appendChild(bi);appendAnchors(card,s.anchor_ids);box.appendChild(card);secInputs.push({t:ti,b:bi});});
    var exInputs=[];draft.exercises.forEach(function(e){var card=el("div","mentor-lb-source");var type=e.type==="source_reading"?"reading":e.type;card.appendChild(el("strong",null,t("room.lesson.focus."+type,e.type)));if(e.purpose)card.appendChild(el("div","mentor-lb-purpose",e.purpose));var bi=document.createElement("textarea");bi.className="mentor-lb-edit";bi.value=e.instruction;bi.disabled=active;card.appendChild(bi);appendAnchors(card,e.anchor_ids);if(e.expected_answer)card.appendChild(el("div","mentor-lb-answer",t("room.lesson.expectedAnswer","Ожидаемый ответ")+": "+e.expected_answer));if(e.hints&&e.hints.length)card.appendChild(el("div","mentor-hint",t("room.lesson.hints","Подсказки")+": "+e.hints.join(" · ")));if(e.success_criteria&&e.success_criteria.length)card.appendChild(el("div","mentor-lb-criteria",t("room.lesson.successCriteria","Критерии")+": "+e.success_criteria.join(" · ")));box.appendChild(card);exInputs.push(bi);});
    if(draft.candidateVocabulary&&draft.candidateVocabulary.length){var vocab=el("div","mentor-lb-source");vocab.appendChild(el("strong",null,t("room.lesson.candidates","Кандидаты для изучения · не добавлены в повторение")));draft.candidateVocabulary.forEach(function(v){var row=el("div","mentor-hint");var he=el("bdi",null,v.surface);he.setAttribute("lang","he");row.appendChild(he);if(v.meaning)row.appendChild(document.createTextNode(" · "+v.meaning));vocab.appendChild(row);});box.appendChild(vocab);}
    var refs=el("div","mentor-plan-actions");draft.sourceRefs.forEach(function(ref){var b=el("button","mentor-wr-ghost","↩ "+(ref.title||ref.id));b.type="button";b.addEventListener("click",function(){try{S.host.openLessonSource(ref,ref.start_order_index);}catch(_){}});refs.appendChild(b);});box.appendChild(refs);
    if(meta&&meta.degraded_reason)box.appendChild(el("div","mentor-hint",degradeLabel(meta.degraded_reason)));
    var notice=el("div","mentor-hint");box.appendChild(notice);
    var actions=el("div","mentor-plan-actions");
    if(!active){var start=el("button","mentor-plan-btn",t("room.lesson.startLesson","Начать урок"));start.type="button";start.addEventListener("click",function(){var edited=Object.assign({},draft,{objective:oi.value,sections:draft.sections.map(function(s,i){return Object.assign({},s,{title:secInputs[i].t.value,body:secInputs[i].b.value});}),exercises:draft.exercises.map(function(e,i){return Object.assign({},e,{instruction:exInputs[i].value});})});var r=store.activate(edited);if(r.ok){_ux("lesson_builder","accepted");renderLessonDraft(box,r.draft,store);}else notice.textContent=t("room.lesson.invalidEdit","Заполните цель, названия, разделы и упражнения перед началом урока.");});actions.appendChild(start);}
    var discard=el("button","mentor-wr-ghost",t("room.lesson.discard","Удалить черновик"));discard.type="button";discard.addEventListener("click",function(){store.discard();_lbSelected=[];renderLessonBuilder(box);});actions.appendChild(discard);box.appendChild(actions);
  }

  // ── PAS-D4: «⚙ Наставник» — настройки v1 (ТОЛЬКО потребляемые: язык объяснений ru/en +
  // глубина brief/detailed; mode не шипится — не потребляется живым кодом [пустышка=обман]).
  // Сохранение по паттерну consent-тогглов: optimistic + откат + «✗ Ошибка синхронизации». ──
  async function renderSettings(box) {
    box.textContent = "";
    var a = null;
    try { var r = await jget("/api/agent/status"); if (r.status === 200 && r.json && r.json.ok) a = r.json; } catch (_) {}
    if (!a || !a.profile) { box.appendChild(el("div", "mentor-hint", "✗ " + t("room.cloud.err", "Ошибка синхронизации"))); return; }
    var msg = el("div", "mentor-hint mentor-consent-msg");
    msg.hidden = true;
    function segRow(labelText, options, current, patchFor) {
      var row = el("div", "mentor-set-row");
      row.appendChild(el("span", "mentor-set-label", labelText));
      var group = el("div", "mentor-set-seg");
      var btns = [];
      options.forEach(function (opt) {
        var b = el("button", "mentor-set-btn" + (opt.value === current ? " on" : ""), opt.label);
        b.type = "button";
        b.addEventListener("click", async function () {
          if (b.classList.contains("on")) return;
          var prevOn = btns.find(function (x) { return x.classList.contains("on"); });
          btns.forEach(function (x) { x.classList.remove("on"); x.disabled = true; });
          b.classList.add("on");   // optimistic
          try {
            var r2 = await jpost("/api/agent/profile", patchFor(opt.value));
            if (r2.status !== 200 || !r2.json || !r2.json.ok) throw new Error("save");
            msg.hidden = true;
            _ux("mentor_settings", "accepted");
          } catch (_) {
            b.classList.remove("on");   // откат
            if (prevOn) prevOn.classList.add("on");
            msg.textContent = "✗ " + t("room.cloud.err", "Ошибка синхронизации");
            msg.hidden = false;
          } finally { btns.forEach(function (x) { x.disabled = false; }); }
        });
        btns.push(b);
        group.appendChild(b);
      });
      row.appendChild(group);
      return row;
    }
    box.appendChild(segRow(t("room.mentor.settings.lang", "Язык объяснений"),
      [{ value: "ru", label: "Рус" }, { value: "en", label: "Eng" }],
      String(a.profile.language || "ru"),
      function (v) { return { language: v }; }));
    box.appendChild(segRow(t("room.mentor.settings.depth", "Глубина объяснений"),
      [{ value: "brief", label: t("room.mentor.settings.brief", "Кратко") },
       { value: "detailed", label: t("room.mentor.settings.detailed", "Подробно") }],
      String(a.profile.depth || "brief"),
      function (v) { return { goals: { depth: v } }; }));
    box.appendChild(el("div", "mentor-hint", t("room.mentor.settings.hint", "Действует на объяснения, план и ответы наставника; сохраняется в облачном профиле.")));
    box.appendChild(msg);
    renderByokSection(box);
  }

  // ── PAS-F1: «Свой LLM-ключ» — BYOK-расширение гибрида (серверная базовая квота +
  // свой ключ снимает лимит). Ключ живёт ТОЛЬКО в localStorage браузера (host-capability
  // agentByok/agentByokSet — модуль data-portable, localStorage сам не трогает); сервер
  // его не хранит и не логирует. UX-паритет с BYOK-прецедентом Студии (критика UX-5):
  // masked saved-строка, ✓/✗-фидбэк, get-key ссылки, cross-check формата (UX-2). ──
  function renderByokSection(box) {
    if (!S.host || typeof S.host.agentByok !== "function" || typeof S.host.agentByokSet !== "function") return;
    box.appendChild(el("h4", "mentor-byok-title", "🔑 " + t("room.mentor.byok.title", "Свой LLM-ключ")));
    box.appendChild(el("div", "mentor-hint", t("room.mentor.byok.hint",
      "Вызовы наставника пойдут на вашем ключе — серверный дневной лимит не тратится. Ключ хранится только в этом браузере в открытом виде и передаётся с каждым запросом; на общем устройстве удаляйте ключ после занятия.")));
    var wrap = el("div", "mentor-byok-wrap");
    box.appendChild(wrap);
    var msg = el("div", "mentor-hint mentor-consent-msg");
    msg.hidden = true;

    function paint() {
      wrap.textContent = "";
      var cur = null;
      try { cur = S.host.agentByok(); } catch (_) {}
      if (cur) {
        // masked saved-строка: провайдер + последние 4 символа — ключ целиком НЕ показывается
        var tail = cur.key.length > 4 ? cur.key.slice(-4) : "";
        wrap.appendChild(el("div", "mentor-status-line", "✓ " + t("room.mentor.byok.saved", "Ключ сохранён") + " · " + cur.provider + (tail ? " · …" + tail : "")));
        // owner-фидбэк 2026-07-13: мгновенная проверка ключа — микро-вызов НА ключе
        // пользователя (серверный лимит не тратится), вердикт с честным сплитом ошибок
        var chk = el("button", "mentor-plan-btn", t("room.mentor.byok.check", "Проверить ключ"));
        chk.type = "button";
        var verdict = el("div", "mentor-hint");
        verdict.hidden = true;
        chk.addEventListener("click", async function () {
          chk.disabled = true;
          verdict.hidden = false;
          verdict.textContent = "⏳ " + t("room.mentor.byok.checking", "Проверяю ключ (микро-вызов на вашем ключе)…");
          try {
            var r = await jpost("/api/agent/byok/check", { byok: cur });
            if (r.status === 200 && r.json && r.json.ok) {
              verdict.textContent = "✓ " + t("room.mentor.byok.ok", "Ключ работает") + " · " + (r.json.provider || cur.provider) + (r.json.model ? " · " + r.json.model : "");
              _ux("mentor_settings", "accepted");
            } else {
              var pe = String((r.json && r.json.provider_error) || "");
              // 503/TIMEOUT/EMPTY_RESPONSE = перегрузка провайдера, НЕ проблема ключа (live 2026-07-13)
              var busy = pe === "503" || pe === "TIMEOUT" || pe === "EMPTY_RESPONSE";
              verdict.textContent = "✗ " + (busy ? t("room.mentor.byok.busy", "Провайдер сейчас перегружен или не ответил — это не проблема ключа, попробуйте ещё раз чуть позже.") + " (" + pe + ")"
                : pe === "429" ? t("room.cloud.byokQuota", "У вашего ключа закончилась квота провайдера на сегодня.")
                : (pe === "401" || pe === "403") ? t("room.cloud.byokRejected", "Ключ не принят провайдером — проверьте его в «⚙ Наставник».")
                : t("room.cloud.byokFailed", "Вызов на вашем ключе не прошёл — проверьте ключ в «⚙ Наставник».") + (pe ? " (" + pe + ")" : ""));
            }
          } catch (_) { verdict.textContent = "✗ " + t("room.cloud.err", "Ошибка синхронизации"); }
          finally { chk.disabled = false; }
        });
        var rm = el("button", "mentor-wr-ghost", t("room.mentor.byok.remove", "Убрать ключ"));
        rm.type = "button";
        rm.addEventListener("click", function () {
          S.host.agentByokSet(null, null);
          _ux("mentor_settings", "dismissed");
          paint();
          try { renderStatus(S.els.status); } catch (_) {}
        });
        var row0 = el("div", "mentor-plan-actions");
        row0.appendChild(chk);
        row0.appendChild(rm);
        wrap.appendChild(row0);
        wrap.appendChild(verdict);
        return;
      }
      var provSel = document.createElement("select");
      provSel.className = "mentor-byok-select";
      [{ v: "openrouter", l: "OpenRouter" }, { v: "gemini", l: "Google Gemini" }].forEach(function (o) {
        var op = document.createElement("option"); op.value = o.v; op.textContent = o.l; provSel.appendChild(op);
      });
      var input = document.createElement("input");
      input.type = "password";
      input.className = "mentor-byok-input";
      input.placeholder = t("room.mentor.byok.ph", "Вставьте API-ключ…");
      input.setAttribute("autocomplete", "off");
      var save = el("button", "mentor-plan-btn", t("room.mentor.byok.save", "Сохранить"));
      save.type = "button";
      save.addEventListener("click", function () {
        var key = String(input.value || "").trim();
        var provider = provSel.value;
        if (key.length < 20) { msg.textContent = "✗ " + t("room.mentor.byok.tooShort", "Ключ слишком короткий."); msg.hidden = false; return; }
        // cross-check формата = серверному правилу буквально (критика UX-2, config-string-match);
        // Gemini = AIza (классика) ИЛИ AQ. (новый формат Google, live-verified 2026-07-13)
        var looksGoogle = key.indexOf("AIza") === 0 || key.indexOf("AQ.") === 0;
        if (provider === "gemini" && !looksGoogle) {
          msg.textContent = "✗ " + t("room.mentor.byok.mismatchGemini", "Ключ Gemini начинается с «AIza» или «AQ.» — проверьте провайдера."); msg.hidden = false; return;
        }
        if (provider === "openrouter" && looksGoogle) {
          msg.textContent = "✗ " + t("room.mentor.byok.mismatchOr", "Это ключ Google — выберите провайдера Gemini."); msg.hidden = false; return;
        }
        if (!S.host.agentByokSet(provider, key)) { msg.textContent = "✗ " + t("room.cloud.err", "Ошибка синхронизации"); msg.hidden = false; return; }
        msg.hidden = true;
        _ux("mentor_settings", "accepted");
        paint();
        try { renderStatus(S.els.status); } catch (_) {}
      });
      var row = el("div", "mentor-plan-actions");
      row.appendChild(provSel); row.appendChild(save);
      wrap.appendChild(input);
      wrap.appendChild(row);
      // get-key ссылки (паритет с BYOK-прецедентом Студии)
      var links = el("div", "mentor-hint");
      var a1 = el("a", "mentor-tg-link", "openrouter.ai/settings/keys");
      a1.setAttribute("href", "https://openrouter.ai/settings/keys"); a1.setAttribute("target", "_blank"); a1.setAttribute("rel", "noopener");
      var a2 = el("a", "mentor-tg-link", "aistudio.google.com/app/apikey");
      a2.setAttribute("href", "https://aistudio.google.com/app/apikey"); a2.setAttribute("target", "_blank"); a2.setAttribute("rel", "noopener");
      links.appendChild(document.createTextNode(t("room.mentor.byok.get", "Где взять ключ:") + " "));
      links.appendChild(a1); links.appendChild(document.createTextNode(" · ")); links.appendChild(a2);
      wrap.appendChild(links);
    }
    paint();
    box.appendChild(msg);
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
    var ntB = blockNode(null, null);     // PAS-D1 — «📖 Что читать дальше» (кнопка самоописательна)
    var wrB = blockNode(null, null);     // PAS-C2 — «✍️ Практика письма» (кнопка самоописательна)
    var lbB = blockNode(null, null);     // Wave 2 LB0 — typed ephemeral lesson draft
    var tgB = blockNode("room.tg.title", "🔗 Telegram");
    var setB = blockNode("room.mentor.settings.title", "⚙ Наставник");   // PAS-D4
    var histWrap = blockNode("room.mentor.histTitle", "История объяснений");
    var consB = blockNode("room.mentor.consTitle", "Ваши конструкции");
    var histBox = el("div", "mentor-hist-list");
    var tgBox = el("div", "mentor-tg-wrap");
    tgB.appendChild(tgBox);
    S.els = { status: status, plan: planB, telegram: tgBox, history: histBox, constructs: null };
    m.appendChild(status);
    m.appendChild(planB);
    m.appendChild(ntB);
    m.appendChild(wrB);
    m.appendChild(lbB);
    m.appendChild(tgB);
    m.appendChild(setB);
    m.appendChild(histWrap);
    m.appendChild(consB);
    var consBox = el("div", "mentor-cons-list");
    consB.appendChild(consBox);
    S.els.constructs = consBox;
    renderStatus(status);
    renderPlanBlock(planB.appendChild(el("div", "mentor-plan-wrap")));
    renderNextText(ntB.appendChild(el("div", "mentor-nt-wrap")));
    renderWriting(wrB.appendChild(el("div", "mentor-wr-wrap")));
    renderLessonLauncher(lbB.appendChild(el("div", "mentor-lb-wrap")));
    renderTelegramBlock(tgBox);
    renderSettings(setB.appendChild(el("div", "mentor-set-wrap")));
    renderHistoryBlock(histWrap, histBox);
    renderConstructs(consBox);
    // PAS-D1: блок без capability хоста схлопывается (MA-хост её не отдаёт)
    if (!(S.host && typeof S.host.nextTextPicks === "function")) ntB.hidden = true;
    if (!(S.host && typeof S.host.lessonSources === "function") || !_lbApi()) lbB.hidden = true;
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

  function mountLessonStudio(container, host) {
    if (!container) return;
    if (host) S.host = host;
    renderLessonBuilder(container);
  }

  return { mount: mountFn, refresh: refresh, mountLessonStudio: mountLessonStudio };
});
