"use strict";

// CLG-P8.1 — Telegram-native host adapter (TELEGRAM_MINI_APP_P8_1_SPEC §4).
// Thin wrapper over window.Telegram.WebApp: capability-gated via isVersionAtLeast
// (NEVER by platform string), handlers tracked for teardown, no capability is
// assumed present. Loaded by /miniapp.html AFTER telegram-web-app.js; degrades
// honestly when the SDK is absent (opened outside Telegram).

(function () {
  const S = { handlers: [], inited: false };

  function tg() {
    return (window.Telegram && window.Telegram.WebApp) || null;
  }

  function available() {
    const w = tg();
    // A real Telegram context always carries initData; the bare SDK loaded in a
    // normal browser tab reports version "6.0" with empty initData — treat the
    // SDK-without-context case as unavailable-for-auth but shell-renderable.
    return !!w;
  }

  function versionAtLeast(v) {
    const w = tg();
    try { return !!(w && typeof w.isVersionAtLeast === "function" && w.isVersionAtLeast(v)); }
    catch (_) { return false; }
  }

  function on(event, fn) {
    const w = tg();
    if (!w || typeof w.onEvent !== "function") return;
    w.onEvent(event, fn);
    S.handlers.push([event, fn]);
  }

  // ready() + expand + colorScheme class. Safe-area / theme values arrive as
  // Telegram-managed CSS vars (--tg-theme-*, --tg-safe-area-inset-*,
  // --tg-content-safe-area-inset-*) — the stylesheet consumes them with
  // fallbacks, so no JS mirroring is needed; we only track colorScheme.
  function init() {
    const w = tg();
    if (!w || S.inited) return;
    S.inited = true;
    try { w.ready(); } catch (_) {}
    try { if (!w.isExpanded && typeof w.expand === "function") w.expand(); } catch (_) {}
    applyColorScheme();
    on("themeChanged", applyColorScheme);
  }

  function applyColorScheme() {
    const w = tg();
    const scheme = (w && w.colorScheme) === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-scheme", scheme);
  }

  function rawInitData() {
    const w = tg();
    return (w && typeof w.initData === "string") ? w.initData : "";
  }

  // ru if the Telegram profile is ru, else en (shell copy only; Hebrew content
  // arrives in later slices with its own dir=rtl handling).
  function language() {
    const w = tg();
    let code = "";
    try { code = String((w && w.initDataUnsafe && w.initDataUnsafe.user && w.initDataUnsafe.user.language_code) || ""); } catch (_) {}
    if (!code) code = String(navigator.language || "");
    return code.toLowerCase().indexOf("ru") === 0 ? "ru" : "en";
  }

  // Gesture-bound external open (documented Telegram constraint): call ONLY from
  // a click handler. openLink keeps the Mini App alive; plain window.open is the
  // outside-Telegram fallback.
  function openExternal(url) {
    const w = tg();
    try {
      if (w && typeof w.openLink === "function") { w.openLink(url); return; }
    } catch (_) {}
    try { window.open(url, "_blank", "noopener"); } catch (_) {}
  }

  // P8.5: нативный BackButton — один живой хендлер (teardown-инвариант: без stale/double).
  let _backHandler = null;
  function backButton(onClick) {
    const w = tg();
    if (!w || !w.BackButton) return;
    try {
      if (_backHandler) { w.BackButton.offClick(_backHandler); _backHandler = null; }
      if (onClick) { _backHandler = onClick; w.BackButton.onClick(onClick); w.BackButton.show(); }
      else w.BackButton.hide();
    } catch (_) {}
  }

  function teardown() {
    const w = tg();
    if (w && typeof w.offEvent === "function") {
      for (const [ev, fn] of S.handlers) { try { w.offEvent(ev, fn); } catch (_) {} }
    }
    S.handlers = [];
  }

  window.MiniappHost = { available, init, versionAtLeast, rawInitData, language, openExternal, backButton, on, teardown };
})();
