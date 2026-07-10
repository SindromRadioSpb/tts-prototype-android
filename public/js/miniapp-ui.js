"use strict";

// CLG-P8.1 — Mini App shell UI: boot → auth exchange → read-only home
// (TELEGRAM_MINI_APP_P8_1_SPEC §4-5). Every terminal state has HONEST copy and
// a safe action — no generic "something went wrong" when the server returned a
// precise error code. Rendering is textContent-only (CSP forbids inline JS; we
// additionally never inject HTML). Opening the home writes NOTHING (MNAR).

(function () {
  const HOST = window.MiniappHost;
  const PWA_URL = location.origin + "/library.html";
  const S = { csrf: null, lang: "en" };

  // ── i18n (shell copy only: ru/en; Hebrew content arrives in later slices) ──
  const STR = {
    boot: { ru: "Загрузка…", en: "Loading…" },
    auth_loading: { ru: "Проверяем подпись Telegram…", en: "Verifying Telegram signature…" },
    home_loading: { ru: "Загружаем ваш профиль…", en: "Loading your profile…" },
    sdk_unavailable: {
      ru: "Это мини-приложение работает внутри Telegram. Откройте его через бота @LinguistProMentorBot.",
      en: "This mini app runs inside Telegram. Open it via the @LinguistProMentorBot bot.",
    },
    no_initdata: {
      ru: "Telegram не передал данные запуска. Закройте мини-приложение и откройте его заново из бота.",
      en: "Telegram did not pass launch data. Close the mini app and reopen it from the bot.",
    },
    auth_invalid: {
      ru: "Подпись данных Telegram не подтверждена сервером. Закройте мини-приложение и откройте его заново.",
      en: "The server could not verify the Telegram data signature. Close the mini app and reopen it.",
    },
    auth_stale: {
      ru: "Данные запуска устарели. Закройте мини-приложение и откройте его заново из Telegram.",
      en: "The launch data has expired. Close the mini app and reopen it from Telegram.",
    },
    not_paired: {
      ru: "Этот Telegram-аккаунт не связан с LinguistPro. Откройте LinguistPro и завершите привязку (🤖 → Telegram).",
      en: "This Telegram account is not linked to LinguistPro. Open LinguistPro and finish pairing (🤖 → Telegram).",
    },
    consent_revoked: {
      ru: "Доставка в Telegram отключена в настройках. Включите её в LinguistPro, чтобы пользоваться мини-приложением.",
      en: "Telegram delivery is disabled in your settings. Re-enable it in LinguistPro to use the mini app.",
    },
    disabled: {
      ru: "Мини-приложение сейчас выключено (закрытый пилот).",
      en: "The mini app is currently disabled (closed pilot).",
    },
    not_allowlisted: {
      ru: "Закрытый пилот: доступ к мини-приложению пока ограничен.",
      en: "Closed pilot: access to the mini app is limited for now.",
    },
    rate_limited: {
      ru: "Слишком много попыток входа. Подождите несколько минут и попробуйте снова.",
      en: "Too many sign-in attempts. Wait a few minutes and try again.",
    },
    offline: {
      ru: "Нет связи с сервером. Проверьте интернет и повторите.",
      en: "Cannot reach the server. Check your connection and retry.",
    },
    server_error: {
      ru: "Сервер ответил ошибкой. Попробуйте ещё раз чуть позже.",
      en: "The server returned an error. Please try again shortly.",
    },
    retry: { ru: "Повторить", en: "Retry" },
    open_pwa: { ru: "Открыть LinguistPro", en: "Open LinguistPro" },
    home_title: { ru: "Наставник", en: "Mentor" },
    due_now: { ru: "Слов к повторению", en: "Words due" },
    done_today: { ru: "Сделано сегодня", en: "Done today" },
    scheduled: { ru: "В расписании", en: "Scheduled" },
    last_review: { ru: "Последнее повторение", en: "Last review" },
    never: { ru: "ещё не было", en: "none yet" },
    coming_soon: {
      ru: "Тренировки в мини-приложении появятся в следующем обновлении. Пока повторяйте в Зале или через /review в боте.",
      en: "In-app training arrives in the next update. For now, review in the Reading Room or via /review in the bot.",
    },
    open_room: { ru: "Открыть Зал", en: "Open the Reading Room" },
    rec_title: { ru: "Рекомендация наставника", en: "Mentor recommendation" },
    kind_dictate: { ru: "диктант (запись на слух)", en: "dictation (write from listening)" },
    kind_cloze: { ru: "пропуск в своём тексте", en: "cloze in your own text" },
    kind_reverse: { ru: "перевод → иврит", en: "translation → Hebrew" },
    rec_next: { ru: "Следующее упражнение: ", en: "Next exercise: " },
    plan_btn: { ru: "🧭 План на сегодня", en: "🧭 Today's plan" },
    plan_loading: { ru: "Составляем план…", en: "Building the plan…" },
    plan_failed: { ru: "План сейчас недоступен. Попробуйте позже.", en: "The plan is unavailable right now. Try again later." },
    plan_minutes_a: { ru: "≈", en: "≈" },
    plan_minutes_b: { ru: " мин", en: " min" },
    expl_btn: { ru: "Последние объяснения", en: "Recent explanations" },
    expl_loading: { ru: "Загружаем объяснения…", en: "Loading explanations…" },
    expl_empty: { ru: "Объяснений пока нет — спросите /explain в боте или в Зале.", en: "No explanations yet — ask via /explain in the bot or the Room." },
    expl_failed: { ru: "Объяснения сейчас недоступны.", en: "Explanations are unavailable right now." },
    expl_purged: { ru: "очищено по отзыву согласия", en: "purged after consent revoke" },
    types_line: { ru: "Типы упражнений сегодня: ", en: "Exercise types today: " },
    train_btn: { ru: "Начать тренировку (превью)", en: "Start training (preview)" },
    train_loading: { ru: "Подбираем упражнение…", en: "Picking an exercise…" },
    train_failed: { ru: "Тренировка сейчас недоступна. Попробуйте позже.", en: "Training is unavailable right now. Try again later." },
    train_busy_bot: { ru: "У вас открыто задание в боте — завершите его там (или дождитесь истечения, ~10 мин).", en: "You have an open challenge in the bot — finish it there (or wait ~10 min for it to expire)." },
    train_none_rf: { ru: "В приоритетном пуле повторения сейчас пусто (свежие слова оставлены чтению).", en: "The priority review pool is empty right now (fresh words are reserved for reading)." },
    train_none_all: { ru: "Сейчас нет подходящих упражнений — загляните в Зал.", en: "No eligible exercises right now — visit the Reading Room." },
    train_all_btn: { ru: "Повторить всё сейчас", en: "Review everything now" },
    preview_note: { ru: "Превью: ответы появятся в следующем обновлении.", en: "Preview: answering arrives in the next update." },
    back_home: { ru: "← Назад", en: "← Back" },
    card_cloze: { ru: "Заполните пропуск (из вашего текста)", en: "Fill the blank (from your text)" },
    card_dictate: { ru: "Диктант: прослушайте и запишите", en: "Dictation: listen and write" },
    card_reverse: { ru: "Как это на иврите?", en: "How is this in Hebrew?" },
  };
  const t = (k) => (STR[k] && (STR[k][S.lang] || STR[k].en)) || k;

  // ── rendering (textContent only) ──────────────────────────────────────────
  const root = () => document.getElementById("app");
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function render(nodes) {
    const r = root();
    while (r.firstChild) r.removeChild(r.firstChild);
    for (const n of nodes) r.appendChild(n);
  }
  function message(kind, textKey, actions) {
    const box = el("div", "ma-state ma-" + kind);
    box.appendChild(el("p", "ma-msg", t(textKey)));
    for (const a of actions || []) {
      const b = el("button", "ma-btn", t(a.label));
      b.addEventListener("click", a.onClick);
      box.appendChild(b);
    }
    render([box]);
  }
  const spinner = (key) => message("busy", key, []);
  const retryAction = { label: "retry", get onClick() { return () => boot(); } };
  const openPwaAction = { label: "open_pwa", onClick: () => HOST.openExternal(PWA_URL + "#mentor") };

  // ── API ───────────────────────────────────────────────────────────────────
  async function api(path, opts) {
    const o = Object.assign({ credentials: "same-origin" }, opts || {});
    o.headers = Object.assign({}, o.headers || {});
    if (o.method && o.method !== "GET" && S.csrf) o.headers["X-LP-CSRF"] = S.csrf;
    const res = await fetch(path, o);
    let body = null;
    try { body = await res.json(); } catch (_) {}
    return { status: res.status, body };
  }

  // Map the server's precise error enum to an honest terminal state.
  function authErrorState(status, body) {
    const code = (body && (body.code || body.error)) || "";
    if (status === 429) return message("warn", "rate_limited", [retryAction]);
    if (code === "FEATURE_DISABLED") return message("info", "disabled", []);
    if (code === "NOT_ALLOWLISTED") return message("info", "not_allowlisted", []);
    if (code === "MINIAPP_NOT_PAIRED") return message("warn", "not_paired", [openPwaAction]);
    if (code === "MINIAPP_CONSENT_REVOKED") return message("warn", "consent_revoked", [openPwaAction]);
    if (code === "AUTH_STALE" || code === "AUTH_FUTURE") return message("warn", "auth_stale", []);
    if (code === "BAD_HASH" || code === "NO_HASH" || code === "NO_USER" || code === "TOO_LARGE" || code === "MINIAPP_AUTH_FAILED")
      return message("warn", "auth_invalid", []);
    return message("warn", "server_error", [retryAction]);
  }

  function renderHome(home) {
    const counts = (home && home.counts) || {};
    const today = (home && home.today) || {};
    const box = el("div", "ma-home");
    box.appendChild(el("h1", "ma-title", t("home_title")));

    const stats = el("div", "ma-stats");
    const stat = (label, value) => {
      const s = el("div", "ma-stat");
      s.appendChild(el("div", "ma-stat-num", String(value)));
      s.appendChild(el("div", "ma-stat-label", label));
      return s;
    };
    stats.appendChild(stat(t("due_now"), counts.due_now != null ? counts.due_now : "—"));
    stats.appendChild(stat(t("done_today"), today.completed != null ? today.completed : "—"));
    stats.appendChild(stat(t("scheduled"), counts.scheduled != null ? counts.scheduled : "—"));
    box.appendChild(stats);

    // exercise types today (only when something was done — no empty noise)
    const types = Object.keys(today.by_type || {});
    if (types.length) {
      box.appendChild(el("p", "ma-last", t("types_line") + types.map((k) => k + " ×" + today.by_type[k]).join(", ")));
    }

    const last = el("p", "ma-last");
    const when = home && home.last_review_at ? new Date(home.last_review_at).toLocaleString() : t("never");
    last.textContent = t("last_review") + ": " + when;
    box.appendChild(last);

    // deterministic mentor recommendation (server-picked kind + optional static why)
    const rec = home && home.recommendation;
    if (rec && rec.kind) {
      const card = el("div", "ma-rec");
      card.appendChild(el("div", "ma-rec-title", t("rec_title")));
      const kindKey = "kind_" + rec.kind;
      card.appendChild(el("p", "ma-rec-kind", t("rec_next") + (STR[kindKey] ? t(kindKey) : rec.kind)));
      if (rec.explain) card.appendChild(el("p", "ma-rec-why", rec.explain));
      box.appendChild(card);
    }

    // P8.3: primary CTA — превью-тренировка (сервер выбирает item/modality; write OFF)
    const trainBtn = el("button", "ma-btn ma-btn-primary", t("train_btn"));
    trainBtn.addEventListener("click", () => startSession("reading_first", home));
    box.appendChild(trainBtn);

    const openRoom = el("button", "ma-btn", t("open_room"));
    openRoom.addEventListener("click", () => HOST.openExternal(PWA_URL));
    box.appendChild(openRoom);

    // ── lazy blocks (loaded ONLY on tap — the plan spends LLM quota) ──
    const planBox = el("div", "ma-lazy");
    const planBtn = el("button", "ma-btn", t("plan_btn"));
    planBtn.addEventListener("click", () => loadPlan(planBtn, planBox));
    box.appendChild(planBtn); box.appendChild(planBox);

    const explBox = el("div", "ma-lazy");
    const explBtn = el("button", "ma-btn", t("expl_btn"));
    explBtn.addEventListener("click", () => loadExplanations(explBtn, explBox));
    box.appendChild(explBtn); box.appendChild(explBox);

    render([box]);
  }

  async function loadPlan(btn, box) {
    btn.disabled = true;
    box.textContent = t("plan_loading");
    let r;
    try { r = await api("/api/miniapp/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); }
    catch (_) { box.textContent = t("plan_failed"); btn.disabled = false; return; }
    if (r.status !== 200 || !r.body || r.body.ok !== true) { box.textContent = t("plan_failed"); btn.disabled = false; return; }
    const p = r.body;
    box.textContent = "";
    if (p.llm_used && p.text) { const n = el("p", "ma-plan-text", String(p.text)); n.setAttribute("dir", "auto"); box.appendChild(n); }
    const plan = p.plan || {};
    if (plan.est_minutes) box.appendChild(el("p", "ma-last", t("plan_minutes_a") + plan.est_minutes + t("plan_minutes_b")));
    for (const s of plan.sections || []) {
      const row = el("p", "ma-plan-row", "• " + String((S.lang === "ru" ? s.title_ru : s.title_en) || s.title_ru || "") +
        (s.items && s.items.length ? " (" + s.items.length + ")" : ""));
      row.setAttribute("dir", "auto");
      box.appendChild(row);
    }
  }

  async function loadExplanations(btn, box) {
    btn.disabled = true;
    box.textContent = t("expl_loading");
    let r;
    try { r = await api("/api/miniapp/explanations?limit=5"); }
    catch (_) { box.textContent = t("expl_failed"); btn.disabled = false; return; }
    if (r.status !== 200 || !r.body || r.body.ok !== true) { box.textContent = t("expl_failed"); btn.disabled = false; return; }
    const list = r.body.explanations || [];
    box.textContent = "";
    if (!list.length) { box.textContent = t("expl_empty"); return; }
    for (const x of list) {
      const item = el("div", "ma-expl");
      const date = x.created_at ? new Date(x.created_at).toLocaleDateString() : "";
      if (x.purged) {
        item.appendChild(el("p", "ma-last", date + " · " + t("expl_purged")));   // R11 tombstone: no content
      } else {
        if (x.sentence_he) {
          const he = el("p", "ma-expl-he", String(x.sentence_he));
          he.setAttribute("dir", "rtl"); he.setAttribute("lang", "he");
          item.appendChild(he);
        }
        if (x.text) { const tx = el("p", "ma-expl-text", String(x.text)); tx.setAttribute("dir", "auto"); item.appendChild(tx); }
        if (date) item.appendChild(el("p", "ma-last", date));
      }
      box.appendChild(item);
    }
  }

  // ── P8.3 preview session (render-only; сервер решает item/modality) ────────
  async function startSession(mode, home) {
    spinner("train_loading");
    let r;
    try {
      r = await api("/api/miniapp/review-sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, lang: S.lang }),
      });
    } catch (_) { return message("warn", "offline", [{ label: "retry", onClick: () => renderHome(home) }]); }
    if (r.status !== 200 || !r.body || r.body.ok !== true)
      return message("warn", "train_failed", [{ label: "back_home", onClick: () => renderHome(home) }]);
    const b = r.body;
    if (b.busy_surface) return message("info", "train_busy_bot", [{ label: "back_home", onClick: () => renderHome(home) }]);
    if (b.none) {
      const actions = [{ label: "back_home", onClick: () => renderHome(home) }];
      if (mode === "reading_first") actions.unshift({ label: "train_all_btn", onClick: () => startSession("all_due", home) });
      return message("info", mode === "reading_first" ? "train_none_rf" : "train_none_all", actions);
    }
    renderChallenge(b.descriptor || {}, home);
  }

  function renderChallenge(d, home) {
    const box = el("div", "ma-home");
    const kindKey = "card_" + d.kind;
    box.appendChild(el("h1", "ma-title", STR[kindKey] ? t(kindKey) : String(d.kind || "")));
    if (d.explain) box.appendChild(el("p", "ma-rec-why", d.explain));

    const st = d.stimulus || {};
    if (d.kind === "cloze") {
      const he = el("p", "ma-expl-he", String(st.blanked_he || ""));
      he.setAttribute("dir", "rtl"); he.setAttribute("lang", "he");
      box.appendChild(he);
      if (st.sentence_ru) box.appendChild(el("p", "ma-last", String(st.sentence_ru)));
    } else if (d.kind === "dictate") {
      if (st.audio_token) {
        const au = document.createElement("audio");
        au.controls = true; au.preload = "none";
        au.src = "/api/miniapp/review-audio?t=" + encodeURIComponent(st.audio_token);
        au.className = "ma-audio";
        box.appendChild(au);
      }
    } else if (d.kind === "reverse") {
      box.appendChild(el("p", "ma-rec-kind", String(st.gloss || "")));
    }

    if (d.preview) box.appendChild(el("p", "ma-note", t("preview_note")));
    const back = el("button", "ma-btn", t("back_home"));
    back.addEventListener("click", () => renderHome(home));
    box.appendChild(back);
    render([box]);
  }

  // ── boot state machine ────────────────────────────────────────────────────
  async function boot() {
    S.lang = HOST && HOST.available() ? HOST.language() : (String(navigator.language || "").toLowerCase().indexOf("ru") === 0 ? "ru" : "en");
    document.documentElement.lang = S.lang;
    spinner("boot");

    if (!HOST || !HOST.available()) return message("info", "sdk_unavailable", []);
    HOST.init();

    const initData = HOST.rawInitData();
    if (!initData) return message("warn", "no_initdata", []);

    spinner("auth_loading");
    let auth;
    try {
      auth = await api("/api/miniapp/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: initData }),
      });
    } catch (_) { return message("warn", "offline", [retryAction]); }
    if (auth.status !== 200 || !auth.body || auth.body.ok !== true) return authErrorState(auth.status, auth.body);
    S.csrf = auth.body.csrf || null;

    spinner("home_loading");
    let home;
    try { home = await api("/api/miniapp/home"); }
    catch (_) { return message("warn", "offline", [retryAction]); }
    if (home.status !== 200 || !home.body || home.body.ok !== true) return authErrorState(home.status, home.body);

    renderHome(home.body);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
