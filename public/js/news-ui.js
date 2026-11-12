// News tab (plan Task 7): outlets → an outlet's sections → feed cards → the Reading Room.
// Builders take a document and are tested in Node; boot() runs only in the page.
(function (root, factory) {
  var api = factory(root.NewsOutlets || (typeof require === "function" ? require("./news-outlets") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.NewsUi = api; if (root.document && root.document.getElementById("nw-root")) api.boot(root); }
})(typeof self !== "undefined" ? self : this, function (Outlets) {
  "use strict";
  var SECTIONS = ["news", "politics", "security", "world", "economy", "consumer", "sport", "culture", "tech", "health", "science", "local", "opinion", "lifestyle", "other"];
  var PIN_KEY = "lp_news_pinned_v1", HEAVY_KEY = "lp_news_no_heavy_v1";

  function fill(s, v) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return v[k] == null ? "" : String(v[k]); }); }
  function h(doc, tag, attrs, children) {
    var e = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === "text") e.textContent = v; else if (k === "class") e.className = v; else e.setAttribute(k, v === true ? "" : String(v));
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? doc.createTextNode(c) : c); });
    return e;
  }
  function safeHttps(url) { try { var u = new URL(String(url)); return u.protocol === "https:" ? u.href : null; } catch (_) { return null; } }
  function outletOf(id) { return (Outlets && Outlets.byId(id)) || { id: id, name_he: id, name_latin: id, color: "#3d4a5c" }; }
  function timeAgo(iso, now, t, locale) {
    var ms = Date.parse(iso); if (!isFinite(ms)) return "";
    var diff = Math.max(0, now - ms), min = Math.floor(diff / 60000);
    if (min < 1) return t("news.justNow", "только что");
    if (min < 60) return fill(t("news.minutesAgo", "{n} мин назад"), { n: min });
    if (min < 24 * 60) return fill(t("news.hoursAgo", "{n} ч назад"), { n: Math.floor(min / 60) });
    try { return new Intl.DateTimeFormat(locale || undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms)); } catch (_) { return new Date(ms).toISOString().slice(0, 10); }
  }
  function sectionLabel(id, t) { return t("news.section." + id, id); }
  function readerHref(card, returnTo) {
    return "/library.html?news=" + encodeURIComponent(card.work_id) + "&from=news&return_to=" + encodeURIComponent(returnTo || "/news.html");
  }

  // Fallback cover: outlet colour + section, the same size as a photo (no layout shift).
  function fallbackCover(doc, card, t) {
    var o = outletOf(card.outlet_id);
    var cover = h(doc, "div", { class: "nw-cover nw-cover-fallback", "aria-hidden": "true" }, [
      h(doc, "span", { class: "nw-cover-outlet", text: o.name_he, dir: "auto" }),
      h(doc, "span", { class: "nw-cover-section", text: sectionLabel(card.section, t) }),
    ]);
    cover.style.setProperty("--nw-outlet", o.color);
    return cover;
  }
  function coverFor(doc, card, t) {
    var img = card.image || {}, src = img.mode === "source_link" ? safeHttps(img.url) : null;
    if (!src) return fallbackCover(doc, card, t);
    var cover = fallbackCover(doc, card, t);
    cover.className = "nw-cover nw-cover-photo";
    var el = h(doc, "img", { src: src, alt: img.alt_ru || img.alt_he || "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
    el.addEventListener && el.addEventListener("error", function () { el.remove(); cover.className = "nw-cover nw-cover-fallback nw-cover-failed"; });
    el.addEventListener && el.addEventListener("load", function () { cover.setAttribute("data-loaded", "true"); });
    cover.appendChild(el);
    return cover;
  }
  function renderCard(doc, card, opts) {
    opts = opts || {};
    var t = opts.t || function (k, f) { return f; }, o = outletOf(card.outlet_id), now = opts.now || Date.now();
    var tag = h(doc, "span", { class: "nw-outlet-tag", text: o.name_latin });
    tag.style.setProperty("--nw-outlet", o.color);
    var meta = h(doc, "p", { class: "nw-card-meta" }, [tag, " · " + timeAgo(card.published_at, now, t, opts.locale), " · " + sectionLabel(card.section, t)]);
    (card.levels || []).forEach(function (lv) { meta.appendChild(h(doc, "span", { class: "nw-level", text: lv })); });
    if (card.heavy) meta.appendChild(h(doc, "span", { class: "nw-heavy", text: t("news.heavy", "Тяжёлая тема") }));
    var title = h(doc, "h3", { class: "nw-card-title", lang: "he", dir: "rtl", text: card.title_he });
    var body = h(doc, "div", { class: "nw-card-body" }, [meta, title,
      h(doc, "p", { class: "nw-card-translation", text: card.title_ru, dir: "auto" }),
      h(doc, "p", { class: "nw-card-summary", text: card.summary_ru, dir: "auto" })]);
    var main;
    if (card.readable && card.work_id) main = h(doc, "a", { class: "nw-card-main", href: readerHref(card, opts.returnTo) }, [coverFor(doc, card, t), body]);
    else { main = h(doc, "div", { class: "nw-card-main nw-card-static" }, [coverFor(doc, card, t), body]); body.appendChild(h(doc, "p", { class: "nw-card-only", text: t("news.cardOnly", "Только карточка — статья в глубоком архиве") })); }
    var credit = (card.image && card.image.mode === "source_link" && card.image.credit_he) ? " · " + card.image.credit_he : "";
    var hasPhoto = !!(card.image && card.image.mode === "source_link" && safeHttps(card.image.url));
    var foot = h(doc, "p", { class: "nw-card-foot" }, [h(doc, "span", { text: hasPhoto ? fill(t("news.photo", "Фото: {outlet}"), { outlet: o.name_latin }) + credit : "", dir: "auto" })]);
    var orig = safeHttps(card.original_url);
    if (orig) foot.appendChild(h(doc, "a", { href: orig, target: "_blank", rel: "noopener noreferrer", text: t("news.original", "Оригинал ↗") }));
    return h(doc, "article", { class: "nw-card", "data-tier": card.tier }, [main, foot]);
  }
  function renderOutletTile(doc, outlet, opts) {
    opts = opts || {};
    var t = opts.t || function (k, f) { return f; }, o = outletOf(outlet.outlet_id);
    var count = outlet.fresh_count ? fill(t("news.freshCount", "Свежих: {n}"), { n: outlet.fresh_count }) : t("news.noFresh", "Свежих пока нет");
    var link = h(doc, "a", { class: "nw-tile", href: "/news.html?outlet=" + encodeURIComponent(o.id) }, [
      h(doc, "span", { class: "nw-tile-name", text: o.name_he, lang: "he", dir: "rtl" }),
      h(doc, "span", { class: "nw-tile-latin", text: o.name_latin }),
      h(doc, "span", { class: "nw-tile-count", text: count + (outlet.latest_at ? " · " + timeAgo(outlet.latest_at, opts.now || Date.now(), t, opts.locale) : "") }),
    ]);
    link.style.setProperty("--nw-outlet", o.color);
    var pinned = !!opts.pinned;
    var pin = h(doc, "button", { type: "button", class: "nw-pin", "data-pin": o.id, "aria-pressed": pinned ? "true" : "false",
      "aria-label": fill(pinned ? t("news.unpinNamed", "Открепить {outlet}") : t("news.pinNamed", "Закрепить {outlet}"), { outlet: o.name_latin }), text: pinned ? "★" : "☆" });
    return h(doc, "div", { class: "nw-tile-wrap" }, [link, pin]);
  }
  function parseState(search) {
    var q = new URLSearchParams(String(search || ""));
    var outlet = q.get("outlet"); if (!(Outlets && Outlets.byId(outlet))) outlet = null;
    var section = q.get("section"); if (SECTIONS.indexOf(section) < 0) section = null;
    var day = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null; };
    return { outlet: outlet, section: section, tier: q.get("tier") === "archive" ? "archive" : "fresh", q: (q.get("q") || "").slice(0, 200), from: day(q.get("from")), to: day(q.get("to")) };
  }
  function stateHref(s) {
    var q = new URLSearchParams();
    if (s.outlet) q.set("outlet", s.outlet);
    if (s.section) q.set("section", s.section);
    if (s.tier === "archive") q.set("tier", "archive");
    if (s.tier === "archive" && s.q) q.set("q", s.q);
    if (s.tier === "archive" && s.from) q.set("from", s.from);
    if (s.tier === "archive" && s.to) q.set("to", s.to);
    var str = q.toString();
    return "/news.html" + (str ? "?" + str : "");
  }
  function feedUrl(s, cursor, noHeavy) {
    var q = new URLSearchParams({ outlet: s.outlet, tier: s.tier, limit: "20" });
    if (s.section) q.set("section", s.section);
    if (s.tier === "archive") { if (s.q) q.set("q", s.q); if (s.from) q.set("from", s.from); if (s.to) q.set("to", s.to); }
    if (noHeavy) q.set("no_heavy", "1");
    if (cursor) q.set("cursor", cursor);
    return "/api/news/feed?" + q.toString();
  }

  // A returning visitor's old service worker still serves the old Reading Room, which does not know
  // ?news= and would open its home instead of the article. When an update is waiting, show a banner
  // and hold article taps; the new worker is activated only by the explicit Update press (the
  // project's update policy). The News page itself writes nothing local, so it is a safe point.
  function installUpdateGate(win, t) {
    var doc = win.document, host = doc.getElementById("nw-update"), reg = null, reloading = false;
    function show() {
      if (!host) return;
      var button = h(doc, "button", { type: "button", class: "nw-button", text: t("news.updateButton", "Обновить") });
      button.addEventListener("click", function () {
        if (!reg || !reg.waiting) { if (!reloading) { reloading = true; win.location.reload(); } return; }
        button.disabled = true;
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        win.setTimeout(function () { if (!reloading) { reloading = true; win.location.reload(); } }, 4000);
      });
      host.replaceChildren(h(doc, "p", { text: t("news.updateText", "Вышла новая версия приложения. Обновите, чтобы статьи открывались правильно.") }), button);
      host.hidden = false;
    }
    doc.addEventListener("click", function (e) {
      if (!reg || !reg.waiting) return;
      var a = e.target && e.target.closest && e.target.closest("a.nw-card-main");
      if (!a) return;
      e.preventDefault();
      if (host) { host.setAttribute("data-attention", "true"); var b = host.querySelector("button"); if (b && b.focus) b.focus(); }
    }, true);
    var sw = win.navigator && win.navigator.serviceWorker;
    if (sw && sw.addEventListener) sw.addEventListener("controllerchange", function () { if (!reloading) { reloading = true; win.location.reload(); } });
    var ready = Promise.resolve(sw && sw.getRegistration ? sw.getRegistration("/") : null).then(function (r) {
      reg = r || null;
      if (reg && reg.waiting) show();
      if (reg && reg.addEventListener) reg.addEventListener("updatefound", function () {
        var w = reg.installing; if (w && w.addEventListener) w.addEventListener("statechange", function () { if (w.state === "installed" && reg.waiting) show(); });
      });
    }).catch(function () {});
    return { ready: ready };
  }

  // ---- page ----
  function boot(win) {
    var doc = win.document, root = doc.getElementById("nw-root");
    var t = function (k, f) { try { var v = typeof win.t === "function" ? win.t(k) : ""; return v && v !== k ? v : f; } catch (_) { return f; } };
    var store = { get: function (k) { try { return win.localStorage.getItem(k); } catch (_) { return null; } }, set: function (k, v) { try { win.localStorage.setItem(k, v); } catch (_) {} } };
    var pinned = function () { try { var v = JSON.parse(store.get(PIN_KEY) || "[]"); return Array.isArray(v) ? v.filter(function (id) { return Outlets.byId(id); }) : []; } catch (_) { return []; } };
    var noHeavy = function () { return store.get(HEAVY_KEY) === "1"; };
    var outletsCache = null, token = 0;
    var locale = function () { return (typeof win.appGetLocale === "function" && win.appGetLocale()) || "ru"; };

    function status(key, fallback, retry) {
      var box = h(doc, "div", { class: "nw-state", role: "status" }, [h(doc, "p", { text: t(key, fallback) })]);
      if (retry) { var b = h(doc, "button", { type: "button", class: "nw-button", text: t("news.retry", "Повторить") }); b.addEventListener("click", retry); box.appendChild(b); }
      return box;
    }
    async function getJson(url) { var r = await win.fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error("HTTP_" + r.status); return r.json(); }
    async function loadOutlets() { if (!outletsCache) outletsCache = (await getJson("/api/news/outlets")).outlets; return outletsCache; }
    function heavyToggle(onChange) {
      var id = "nw-no-heavy", input = h(doc, "input", { type: "checkbox", id: id });
      input.checked = noHeavy();
      input.addEventListener("change", function () { store.set(HEAVY_KEY, input.checked ? "1" : "0"); onChange(); });
      return h(doc, "label", { class: "nw-toggle", for: id }, [input, " " + t("news.noHeavy", "Без тяжёлых тем")]);
    }
    function go(state, replace) {
      try { win.history[replace ? "replaceState" : "pushState"]({}, "", stateHref(state)); } catch (_) {}
      render();
    }

    async function renderHome(my) {
      var head = h(doc, "header", { class: "nw-heading" }, [h(doc, "h1", { text: t("news.heading", "Новости") }),
        h(doc, "p", { class: "nw-lead", text: t("news.lead", "Учебные пересказы новостей израильских изданий — с таблицей, огласовкой, переводом и карточками слов. Это не тексты изданий: у каждой статьи есть ссылка на оригинал.") })]);
      root.replaceChildren(head, status("news.loading", "Загрузка новостей…"));
      var outlets;
      try { outlets = await loadOutlets(); } catch (_) { if (my === token) root.replaceChildren(head, status("news.error", "Не удалось загрузить новости", render)); return; }
      if (my !== token) return;
      var pins = pinned(), byId = {};
      outlets.forEach(function (o) { byId[o.outlet_id] = o; });
      var tile = function (o) { return renderOutletTile(doc, o, { t: t, pinned: pins.indexOf(o.outlet_id) >= 0, locale: locale() }); };
      var parts = [head];
      if (pins.length) parts.push(h(doc, "section", { class: "nw-group", "aria-labelledby": "nw-my" }, [h(doc, "h2", { id: "nw-my", text: t("news.myOutlets", "Мои издания") }),
        h(doc, "div", { class: "nw-tiles" }, pins.map(function (id) { return byId[id]; }).filter(Boolean).map(tile))]));
      parts.push(h(doc, "section", { class: "nw-group", "aria-labelledby": "nw-all" }, [h(doc, "h2", { id: "nw-all", text: t("news.allOutlets", "Все издания") }),
        h(doc, "div", { class: "nw-tiles" }, outlets.map(tile))]));
      root.replaceChildren.apply(root, parts);
      root.querySelectorAll(".nw-pin").forEach(function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-pin"), list = pinned(), i = list.indexOf(id);
          if (i >= 0) list.splice(i, 1); else list.push(id);
          store.set(PIN_KEY, JSON.stringify(list)); render();
          var again = root.querySelector('.nw-pin[data-pin="' + id + '"]'); if (again) again.focus();
        });
      });
    }

    async function renderOutlet(state, my) {
      var o = outletOf(state.outlet);
      var back = h(doc, "a", { class: "nw-back", href: "/news.html", text: t("news.backToOutlets", "← Все издания") });
      back.addEventListener("click", function (e) { e.preventDefault(); go({ tier: "fresh" }); });
      var titleTag = h(doc, "span", { class: "nw-outlet-tag nw-outlet-tag-big", text: o.name_latin }); titleTag.style.setProperty("--nw-outlet", o.color);
      var head = h(doc, "header", { class: "nw-heading" }, [back, h(doc, "h1", {}, [titleTag, " ", h(doc, "span", { lang: "he", dir: "rtl", text: o.name_he })]),
        h(doc, "p", { class: "nw-lead nw-lead-small", text: t("news.retellingNote", "Пересказы для изучения языка по материалам издания, не тексты издания.") })]);
      var tabs = h(doc, "div", { class: "nw-tabs", role: "group", "aria-label": t("news.tierLabel", "Свежие или архив") }, ["fresh", "archive"].map(function (tier) {
        var b = h(doc, "button", { type: "button", class: "nw-tab", "aria-pressed": state.tier === tier ? "true" : "false", text: tier === "fresh" ? t("news.fresh", "Свежие") : t("news.archive", "Архив") });
        b.addEventListener("click", function () { if (state.tier !== tier) go({ outlet: state.outlet, section: state.section, tier: tier }); });
        return b;
      }));
      var outlets = [];
      try { outlets = await loadOutlets(); } catch (_) { outlets = []; }
      if (my !== token) return;
      var info = outlets.filter(function (x) { return x.outlet_id === state.outlet; })[0] || { sections: [] };
      var sectionIds = info.sections.map(function (s) { return s.section; });
      if (state.section && sectionIds.indexOf(state.section) < 0) sectionIds.push(state.section);
      var chips = h(doc, "div", { class: "nw-chips", role: "group", "aria-label": t("news.sectionsLabel", "Рубрики") }, [null].concat(sectionIds).map(function (id) {
        var b = h(doc, "button", { type: "button", class: "nw-chip", "aria-pressed": (state.section || null) === id ? "true" : "false", text: id ? sectionLabel(id, t) : t("news.allSections", "Все рубрики") });
        b.addEventListener("click", function () { go({ outlet: state.outlet, section: id, tier: state.tier, q: state.q, from: state.from, to: state.to }); });
        return b;
      }));
      var controls = h(doc, "div", { class: "nw-controls" }, [tabs, heavyToggle(render)]);
      var parts = [head, controls, chips];
      if (state.tier === "archive") {
        var form = h(doc, "form", { class: "nw-search", role: "search" });
        var qIn = h(doc, "input", { type: "search", name: "q", id: "nw-q", value: state.q || "", placeholder: t("news.search", "Поиск по заголовку"), "aria-label": t("news.search", "Поиск по заголовку") });
        var fromIn = h(doc, "input", { type: "date", name: "from", id: "nw-from", value: state.from || "" });
        var toIn = h(doc, "input", { type: "date", name: "to", id: "nw-to", value: state.to || "" });
        form.append(qIn, h(doc, "label", { for: "nw-from", text: t("news.from", "С") }), fromIn, h(doc, "label", { for: "nw-to", text: t("news.to", "По") }), toIn,
          h(doc, "button", { type: "submit", class: "nw-button", text: t("news.find", "Найти") }));
        form.addEventListener("submit", function (e) { e.preventDefault(); go({ outlet: state.outlet, section: state.section, tier: "archive", q: qIn.value.trim(), from: fromIn.value || null, to: toIn.value || null }); });
        parts.push(form);
      }
      var list = h(doc, "div", { class: "nw-feed", "aria-live": "polite" });
      var more = h(doc, "button", { type: "button", class: "nw-button nw-more", text: t("news.more", "Показать ещё"), hidden: true });
      parts.push(list, more);
      root.replaceChildren.apply(root, parts);
      var returnTo = stateHref(state), cursor = null;
      async function page() {
        more.hidden = true;
        var loading = status("news.loading", "Загрузка новостей…"); list.appendChild(loading);
        try {
          var data = await getJson(feedUrl(state, cursor, noHeavy()));
          if (my !== token) return;
          loading.remove();
          data.items.forEach(function (card) { list.appendChild(renderCard(doc, card, { t: t, returnTo: returnTo, locale: locale() })); });
          if (!list.children.length) list.appendChild(status(state.tier === "archive" ? "news.emptyArchive" : "news.empty", state.tier === "archive" ? "Ничего не найдено" : "Здесь пока нет свежих статей"));
          cursor = data.next_cursor; more.hidden = !cursor;
        } catch (_) { if (my !== token) return; loading.remove(); list.appendChild(status("news.error", "Не удалось загрузить новости", function () { list.lastChild && list.lastChild.remove(); page(); })); }
      }
      more.addEventListener("click", page);
      await page();
    }

    function render() {
      var my = ++token, state = parseState(win.location.search);
      doc.title = (state.outlet ? outletOf(state.outlet).name_latin + " · " : "") + t("news.title", "Новости") + " · LinguistPro";
      root.setAttribute("aria-busy", "true");
      var job = state.outlet ? renderOutlet(state, my) : renderHome(my);
      Promise.resolve(job).finally(function () { if (my === token) root.removeAttribute("aria-busy"); });
    }
    function applyTheme() {
      var theme = store.get("appTheme_v1");
      doc.body.classList.toggle("nw-dark", theme === "dark" || (theme !== "light" && win.matchMedia && win.matchMedia("(prefers-color-scheme:dark)").matches));
    }
    var themeBtn = doc.getElementById("nw-theme");
    if (themeBtn) themeBtn.addEventListener("click", function () { store.set("appTheme_v1", doc.body.classList.contains("nw-dark") ? "light" : "dark"); applyTheme(); });
    var lang = doc.getElementById("nw-language");
    if (lang && typeof win.appGetLocale === "function") { lang.value = win.appGetLocale(); lang.addEventListener("change", function () { win.appSetLocale(lang.value); }); }
    doc.addEventListener("i18n:changed", function () { if (lang && win.appGetLocale) lang.value = win.appGetLocale(); render(); });
    win.addEventListener("popstate", render);
    applyTheme();
    installUpdateGate(win, t);
    render();
  }
  return { installUpdateGate: installUpdateGate, renderCard: renderCard, renderOutletTile: renderOutletTile, parseState: parseState, stateHref: stateHref, feedUrl: feedUrl, timeAgo: timeAgo, readerHref: readerHref, SECTIONS: SECTIONS, boot: boot };
});
