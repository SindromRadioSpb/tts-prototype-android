// One footer for Studio, Reading Room and Mediatheque (UI release program R12, owner 2026-09-26).
// Typed items in one order: Данные на этом устройстве · Сообщить о проблеме · О приложении ·
// Приватность · [О разделе] · Документация — and the version the open page actually runs.
// Loaded right after <footer data-lp-footer="room|studio|mediatheque">; renders at once.
(function () {
  "use strict";
  var ISSUES = "https://github.com/SindromRadioSpb/tts-prototype-android/issues/new";
  var REPO = "https://github.com/SindromRadioSpb/tts-prototype-android";
  var PRODUCT = "https://kolosei.com/products/linguistpro/";
  // Optional per-section «О разделе» item; only sections with their own About window have one.
  var SECTION_ABOUT = { room: { id: "roomAboutLink", key: "room.footer.about", fallback: "О Зале" } };
  var state = { running: null, latest: null };

  function tr(key, fallback) {
    try {
      var v = typeof window.t === "function" ? window.t(key) : "";
      return v && v !== key ? v : fallback;
    } catch (_) { return fallback; }
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function versionLabel(running, latest) {
    var v = running || latest || "";
    if (!v) return "";
    var out = "v" + v;
    if (running && latest && running !== latest) out += " · " + tr("appFooter.updateAvailable", "есть новая версия");
    return out;
  }

  function item(id, href, key, fallback, extra) {
    return '<a class="lp-footer-link" data-lp-footer-item="' + id + '" href="' + esc(href) + '"' + (extra || "") +
      ' data-lp-key="' + key + '" data-lp-fallback="' + esc(fallback) + '">' + esc(tr(key, fallback)) + "</a>";
  }

  function render(footer) {
    var section = footer.getAttribute("data-lp-footer") || "";
    var sec = SECTION_ABOUT[section];
    footer.classList.add("lp-footer");
    footer.setAttribute("aria-label", tr("appFooter.label", "Служебные ссылки"));
    footer.innerHTML =
      '<div class="lp-footer-row">' +
        '<a class="lp-footer-link lp-footer-device" data-lp-footer-item="device" href="/docs/OPFS_USER_GUIDE.md" target="_blank" rel="noopener">' +
          '<span class="lp-footer-chip" data-lp-key="footer.privacyBadge" data-lp-fallback="Данные на этом устройстве">' + esc(tr("footer.privacyBadge", "Данные на этом устройстве")) + "</span></a>" +
        '<div class="lp-footer-links">' +
          item("feedback", ISSUES, "footer.feedbackLink", "Сообщить о проблеме", ' target="_blank" rel="noopener" data-lp-footer-action="feedback"') +
          item("about", "#", "footer.aboutLink", "О приложении", ' data-lp-footer-action="about"') +
          item("privacy", "/docs/PRIVACY.md", "footer.privacyLink", "Приватность", ' target="_blank" rel="noopener"') +
          (sec ? item("section", "#", sec.key, sec.fallback, ' id="' + sec.id + '"') : "") +
          item("docs", "/docs/OPFS_USER_GUIDE.md", "footer.docsLink", "Документация", ' target="_blank" rel="noopener"') +
          '<button type="button" class="lp-footer-version" data-lp-footer-action="about">' + esc(versionLabel(state.running, state.latest)) + "</button>" +
        "</div>" +
      "</div>";
    footer.addEventListener("click", onClick);
  }

  function relabel() {
    var nodes = document.querySelectorAll("footer[data-lp-footer] [data-lp-key]");
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = tr(nodes[i].getAttribute("data-lp-key"), nodes[i].getAttribute("data-lp-fallback"));
    var f = document.querySelector("footer[data-lp-footer]");
    if (f) f.setAttribute("aria-label", tr("appFooter.label", "Служебные ссылки"));
    paintVersion();
  }

  function paintVersion() {
    var el = document.querySelector("footer[data-lp-footer] .lp-footer-version");
    if (el) el.textContent = versionLabel(state.running, state.latest);
    var dlg = document.getElementById("lpAppAbout");
    if (dlg) fillAbout(dlg);
  }

  function onClick(ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("[data-lp-footer-action]") : null;
    if (!a) return;
    var action = a.getAttribute("data-lp-footer-action");
    if (action === "about") {
      ev.preventDefault();
      if (typeof window.v3AboutOpen === "function") window.v3AboutOpen();
      else openSharedAbout();
    } else if (action === "feedback" && typeof window.v3FeedbackOpen === "function") {
      ev.preventDefault();
      window.v3FeedbackOpen("bug");
    }
  }

  // Shared «О приложении» for sections without their own (Room, Mediatheque).
  function fillAbout(dlg) {
    var running = state.running || state.latest || "—";
    var status = state.running && state.latest
      ? (state.running === state.latest ? tr("appFooter.upToDate", "актуальная") : tr("appFooter.updateAvailable", "есть новая версия") + " (" + state.latest + ")")
      : "";
    dlg.querySelector(".lp-about-version").textContent = running + (status ? " · " + status : "");
  }
  function openSharedAbout() {
    var dlg = document.getElementById("lpAppAbout");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "lpAppAbout";
      dlg.className = "lp-app-about";
      dlg.setAttribute("aria-labelledby", "lpAppAboutTitle");
      dlg.innerHTML =
        '<h2 id="lpAppAboutTitle">' + esc(tr("about.title", "О LinguistPro")) + "</h2>" +
        '<p class="lp-about-tagline">' + esc(tr("about.tagline", "Иврит по своим текстам: таблица, озвучка и слова. Данные хранятся на этом устройстве.")) + "</p>" +
        "<dl>" +
          "<dt>" + esc(tr("about.versionLabel", "Версия")) + '</dt><dd class="lp-about-version">—</dd>' +
          "<dt>" + esc(tr("about.authorLabel", "Автор")) + "</dt><dd>" + esc(tr("footer.madeBy", "Made with ❤️ by")) + " " + esc(tr("footer.devName", "Kolosei Peter")) + "</dd>" +
        "</dl>" +
        '<p class="lp-about-links">' +
          '<a href="' + PRODUCT + '" target="_blank" rel="noopener">' + esc(tr("room.footer.product", "О продукте")) + "</a>" +
          '<a href="' + REPO + '" target="_blank" rel="noopener">' + esc(tr("footer.githubLink", "GitHub")) + "</a>" +
          '<a href="/db-diagnostics.html" target="_blank" rel="noopener">' + esc(tr("dashboard.secDiag", "Диагностика системы")) + "</a>" +
        "</p>" +
        '<form method="dialog"><button type="submit" class="lp-about-close">' + esc(tr("about.close", "Закрыть")) + "</button></form>";
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
      document.body.appendChild(dlg);
    }
    fillAbout(dlg);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }

  // The version the page runs = the CACHE_VERSION of the service worker that serves it; the
  // latest deployed one comes from /api/client-config. Either may be missing (no SW, offline).
  function askWorker() {
    return new Promise(function (resolve) {
      try {
        var c = navigator.serviceWorker && navigator.serviceWorker.controller;
        if (!c || typeof MessageChannel !== "function") return resolve(null);
        var ch = new MessageChannel();
        var timer = setTimeout(function () { resolve(null); }, 1500);
        ch.port1.onmessage = function (e) { clearTimeout(timer); resolve(e.data && e.data.version || null); };
        c.postMessage({ type: "GET_VERSION" }, [ch.port2]);
      } catch (_) { resolve(null); }
    });
  }
  function askServer() {
    try {
      return fetch("/api/client-config", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return j && j.version ? String(j.version).replace(/^v/, "") : null; })
        .catch(function () { return null; });
    } catch (_) { return Promise.resolve(null); }
  }
  function refreshVersion() {
    var shell = typeof window.APP_VERSION === "string" ? window.APP_VERSION : null;
    return Promise.all([askWorker(), askServer()]).then(function (v) {
      state.running = v[0] || shell;
      state.latest = v[1];
      paintVersion();
    });
  }

  function mount() {
    var footer = document.querySelector("footer[data-lp-footer]");
    if (!footer || footer.getAttribute("data-lp-footer-ready") === "1") return;
    footer.setAttribute("data-lp-footer-ready", "1");
    render(footer);
    document.addEventListener("i18n:changed", relabel);
    document.addEventListener("DOMContentLoaded", relabel);
    refreshVersion();
  }

  window.LpAppFooter = { mount: mount, versionLabel: versionLabel, refreshVersion: refreshVersion };
  mount();
})();
