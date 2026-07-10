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
    scheduled: { ru: "В расписании", en: "Scheduled" },
    last_review: { ru: "Последнее повторение", en: "Last review" },
    never: { ru: "ещё не было", en: "none yet" },
    coming_soon: {
      ru: "Тренировки в мини-приложении появятся в следующем обновлении. Пока повторяйте в Зале или через /review в боте.",
      en: "In-app training arrives in the next update. For now, review in the Reading Room or via /review in the bot.",
    },
    open_room: { ru: "Открыть Зал", en: "Open the Reading Room" },
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
    stats.appendChild(stat(t("scheduled"), counts.scheduled != null ? counts.scheduled : "—"));
    box.appendChild(stats);

    const last = el("p", "ma-last");
    const when = home && home.last_review_at ? new Date(home.last_review_at).toLocaleString() : t("never");
    last.textContent = t("last_review") + ": " + when;
    box.appendChild(last);

    box.appendChild(el("p", "ma-note", t("coming_soon")));

    const openRoom = el("button", "ma-btn ma-btn-primary", t("open_room"));
    openRoom.addEventListener("click", () => HOST.openExternal(PWA_URL));
    box.appendChild(openRoom);

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
