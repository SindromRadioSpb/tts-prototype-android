// One navigation for Studio, Reading Room and Mediatheque (UI release program R6).
// Phone: a bottom bar (hidden in an open text — the screen belongs to video and table).
// Desktop: a top strip. Icons come from the shared sprite; labels from the locale files.
(function () {
  "use strict";
  var SPRITE = "/icons/linguistpro-ui.svg";
  var ITEMS = [
    { id: "room", href: "/library.html", icon: "lp-mark-room", key: "appNav.room", fallback: "Зал" },
    { id: "mediatheque", href: "/mediatheque.html", icon: "lp-icon-play", key: "appNav.mediatheque", fallback: "Медиатека" },
    { id: "studio", href: "/", icon: "lp-mark-studio", key: "appNav.studio", fallback: "Студия" },
    { id: "review", href: "/library.html#review", icon: "lp-icon-train", key: "appNav.review", fallback: "Повторение" },
  ];

  function label(key, fallback) {
    try {
      var v = typeof window.t === "function" ? window.t(key) : "";
      return v && v !== key ? v : fallback;
    } catch (_) { return fallback; }
  }

  function currentId() {
    var loc = window.location || {};
    var p = String(loc.pathname || "/");
    if (p === "/mediatheque.html") return "mediatheque";
    if (p === "/library.html") return loc.hash === "#review" ? "review" : "room";
    if (p === "/" || p === "/index.html") return "studio";
    return "";
  }

  function render(nav) {
    var cur = currentId();
    nav.setAttribute("aria-label", label("appNav.label", "Разделы"));
    nav.innerHTML = ITEMS.map(function (it) {
      return '<a class="lp-app-nav-item" data-nav-id="' + it.id + '" href="' + it.href + '"' +
        (it.id === cur ? ' aria-current="page"' : "") + ">" +
        '<svg class="lp-app-nav-icon" aria-hidden="true" focusable="false"><use href="' + SPRITE + "#" + it.icon + '"></use></svg>' +
        '<span class="lp-app-nav-label">' + label(it.key, it.fallback).replace(/[<>&]/g, "") + "</span></a>";
    }).join("");
  }

  function mount() {
    if (!document.body || document.querySelector("nav.lp-app-nav")) return;
    var nav = document.createElement("nav");
    nav.className = "lp-app-nav";
    render(nav);
    document.body.insertBefore(nav, document.body.firstChild);   // top strip on a desktop; fixed bottom bar on a phone
    document.body.classList.add("lp-has-app-nav");
    document.addEventListener("i18n:changed", function () { render(nav); });
    // The Room switches #review without a reload; keep the current section honest.
    if (typeof window.addEventListener === "function") window.addEventListener("hashchange", function () { render(nav); });
  }

  window.LpAppNav = { mount: mount, currentId: currentId };
  // Loaded right after <body>: mount at once (no late jump on a heavy page), then re-render when
  // the locale scripts further down have defined window.t.
  if (document.body) mount();
  document.addEventListener("DOMContentLoaded", function () {
    mount();
    var nav = document.querySelector("nav.lp-app-nav");
    if (nav) render(nav);
  });
})();
