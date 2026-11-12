// News section in the Reading Room (plan Task 6): the ?news=<work_id> entry, the way back to
// the News tab, and the source plate shown above and below a news text. No Room state here —
// library-ui.js calls these and keeps its own reader lifecycle.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.NewsOutlets || (typeof require === "function" ? require("./news-outlets") : null));
  else root.NewsReader = factory(root.NewsOutlets);
})(typeof self !== "undefined" ? self : this, function (Outlets) {
  "use strict";
  var WORK = /^na_[0-9a-f]{24}\.[a-z0-9]{2}$/;

  function parseEntry(search) {
    var q = new URLSearchParams(String(search || ""));
    var work = q.get("news");
    if (!work || !WORK.test(work)) return null;
    return { workId: work, fromNews: q.get("from") === "news" };
  }
  function returnHref(search, origin) {
    var q = new URLSearchParams(String(search || ""));
    if (q.get("from") !== "news") return null;
    var fallback = "/news.html";
    try {
      var raw = q.get("return_to"); if (!raw || raw.length > 4000) return fallback;
      var url = new URL(raw, origin);
      return url.origin === origin && url.pathname === "/news.html" ? url.pathname + url.search : fallback;
    } catch (_) { return fallback; }
  }
  function fill(s, vars) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? "" : String(vars[k]); }); }
  function dateLabel(iso, locale) {
    var d = new Date(iso); if (isNaN(d)) return "";
    try { return new Intl.DateTimeFormat(locale || undefined, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d); }
    catch (_) { return d.toISOString().slice(0, 16).replace("T", " "); }
  }
  function outletName(id) { var o = Outlets && Outlets.byId(id); return o ? o.name_latin : String(id || ""); }
  function safeHttps(url) { try { var u = new URL(String(url)); return u.protocol === "https:" ? u.href : null; } catch (_) { return null; } }

  // meta: text.source_meta.news; t(key, fallback); place: 'head' | 'foot'.
  function renderPlate(doc, meta, opts) {
    opts = opts || {};
    var t = opts.t || function (k, f) { return f; }, place = opts.place || "head";
    var box = doc.createElement("div");
    box.className = "reader-news-source reader-news-source-" + place;
    box.setAttribute("dir", "auto");
    var outlet = outletName(meta.outlet_id), o = Outlets && Outlets.byId(meta.outlet_id);
    var line = doc.createElement("p"); line.className = "reader-news-source-line";
    var tag = doc.createElement("span"); tag.className = "reader-news-outlet"; tag.textContent = outlet;
    if (o) tag.style.setProperty("--news-outlet-color", o.color);
    line.appendChild(doc.createTextNode(fill(t("news.plate.head", "Учебный пересказ LinguistPro по материалам {outlet}"), { outlet: "" })));
    line.appendChild(tag);
    var date = dateLabel(meta.published_at, opts.locale);
    if (date) line.appendChild(doc.createTextNode(" · " + date));
    var href = safeHttps(meta.canonical_url);
    if (href) {
      line.appendChild(doc.createTextNode(" · "));
      var a = doc.createElement("a"); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = t("news.plate.original", "Оригинал ↗"); line.appendChild(a);
    }
    box.appendChild(line);
    var extra = [];
    if (place === "foot") {
      if (meta.author) extra.push(fill(t("news.plate.author", "Автор оригинала: {author}"), { author: meta.author }));
      if (meta.section_original_he) extra.push(fill(t("news.plate.section", "Рубрика: {section}"), { section: meta.section_original_he }));
      var prepared = meta.prepared || {};
      if (prepared.by) extra.push(fill(t("news.plate.prepared", "Подготовлено: {by} · {date}"), { by: prepared.by, date: dateLabel(prepared.prepared_at, opts.locale) }));
    }
    if (meta.content_type === "opinion") extra.push(t("news.plate.opinion", "Колонка мнений: пересказана позиция автора, не редакции LinguistPro"));
    if (opts.withdrawn) extra.push(t("news.plate.withdrawn", "Статья снята из раздела «Новости»; эта копия осталась у вас"));
    extra.forEach(function (text) { var p = doc.createElement("p"); p.className = "reader-news-source-note"; p.textContent = text; box.appendChild(p); });
    return box;
  }
  return { parseEntry: parseEntry, returnHref: returnHref, renderPlate: renderPlate, dateLabel: dateLabel, WORK: WORK };
});
