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
  // Stored article photos are served by us at /api/news/images/... (same-origin: the Room runs under COEP).
  function safeImage(url) { var s = String(url || ""); return /^\/api\/news\/images\/na_[0-9a-f]{24}\/img-\d{1,2}\.(jpg|jpeg|png|webp)\?v=[0-9a-f]{12}$/.test(s) ? s : null; }
  // «צילום: X» → «X»: the plate already says «Фото:».
  function creditText(c) { return String(c || "").replace(/^\s*(צילום|צלם|photo)\s*[:：]\s*/i, "").trim() || String(c || ""); }
  function levelLabel(level, t) { return level === "OR" ? t("news.level.original", "Оригинал") : String(level || ""); }
  function el(doc, tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  // One photo with its caption and credit: «Фото: {credit} · {outlet} · источник ↗». Hidden if it fails to load.
  function figure(doc, im, meta, t, cls) {
    var src = safeImage(im && im.url);
    if (!src) return null;
    var fig = el(doc, "figure", cls);
    var img = doc.createElement("img");
    img.src = src; img.alt = im.alt_ru || im.alt_he || im.caption_ru || ""; img.loading = "lazy"; img.decoding = "async";
    img.addEventListener && img.addEventListener("error", function () { fig.hidden = true; });
    fig.appendChild(img);
    var cap = el(doc, "figcaption", "reader-news-figcaption");
    if (im.caption_he) { var he = el(doc, "span", "reader-news-caption-he", im.caption_he); he.setAttribute("lang", "he"); he.setAttribute("dir", "rtl"); cap.appendChild(he); }
    if (im.caption_ru) cap.appendChild(el(doc, "span", "reader-news-caption-ru", im.caption_ru));
    var credit = el(doc, "span", "reader-news-credit");
    credit.setAttribute("dir", "auto");
    credit.textContent = fill(t("news.figure.credit", "Фото: {credit}{outlet}"), { credit: im.credit_he ? creditText(im.credit_he) + " · " : "", outlet: outletName(meta.outlet_id) });
    var href = safeHttps(im.source_url);
    if (href) {
      credit.appendChild(doc.createTextNode(" · "));
      var a = doc.createElement("a"); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = t("news.figure.source", "источник фото ↗"); credit.appendChild(a);
    }
    cap.appendChild(credit);
    fig.appendChild(cap);
    return fig;
  }
  function placed(im) { return !!im && im.role === "inline" && typeof im.after_row === "number" && im.after_row >= -1 && Math.floor(im.after_row) === im.after_row; }
  // Inline photos inside the Room table, each in its own full-width row after the last row of its paragraph.
  // Idempotent: called again after every table re-render; inserts only figures that are missing.
  // → the number of figures now in the table.
  function placeInlineFigures(doc, mount, meta, opts) {
    var t = (opts && opts.t) || function (k, f) { return f; };
    var tbody = mount && mount.querySelector("#proTable tbody");
    if (!tbody || !meta) return 0;
    var count = 0;
    (Array.isArray(meta.images) ? meta.images : []).forEach(function (im, i) {
      if (!placed(im) || !safeImage(im.url)) return;
      if (tbody.querySelector('tr.reader-news-figrow[data-figure="' + i + '"]')) { count++; return; }
      var first = tbody.querySelector("tr[data-row-idx]");
      var anchor = im.after_row === -1 ? null : tbody.querySelector('tr[data-row-idx="' + im.after_row + '"]');
      if (!first || (im.after_row !== -1 && !anchor)) return;   // that row is not painted yet: the next render places it
      var fig = figure(doc, im, meta, t, "reader-news-figure reader-news-figure-inline");
      if (!fig) return;
      var tr = doc.createElement("tr"); tr.className = "reader-news-figrow"; tr.setAttribute("data-figure", String(i));
      var td = doc.createElement("td"); td.setAttribute("colspan", String(Math.max(1, (anchor || first).children.length))); td.appendChild(fig); tr.appendChild(td);
      if (anchor) {
        var ref = anchor;
        while (ref.nextElementSibling && ref.nextElementSibling.classList.contains("reader-news-figrow")) ref = ref.nextElementSibling;
        tbody.insertBefore(tr, ref.nextElementSibling);
      } else tbody.insertBefore(tr, first);
      count++;
    });
    return count;
  }
  // «Версии: Оригинал · B1» — the same article's other versions, opened on the same ?news= entry.
  function versionSwitch(doc, meta, opts, t) {
    var levels = meta.levels || [], m = String(opts.workId || "").match(/^(na_[0-9a-f]{24})\.[a-z0-9]{2}$/);
    if (!m || levels.length < 2) return null;
    var box = el(doc, "p", "reader-news-versions", t("news.versions", "Версии:") + " ");
    levels.forEach(function (lv, i) {
      if (i) box.appendChild(doc.createTextNode(" · "));
      if (lv === meta.level) { var cur = el(doc, "strong", "reader-news-version-current", levelLabel(lv, t)); cur.setAttribute("aria-current", "true"); box.appendChild(cur); return; }
      var q = new URLSearchParams(String(opts.search || ""));
      q.set("news", m[1] + "." + String(lv).toLowerCase());
      var a = doc.createElement("a"); a.href = "/library.html?" + q.toString(); a.textContent = levelLabel(lv, t); box.appendChild(a);
    });
    return box;
  }

  // The head plate can be folded to its source line (owner 2026-11-15): one choice for every article, kept
  // on this device across sessions. Storage may be blocked (private mode) — then the plate simply opens.
  var COLLAPSE_KEY = "lp.news.plateCollapsed";
  function store() { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (_) { return null; } }
  function plateCollapsed() { try { var s = store(); return !!s && s.getItem(COLLAPSE_KEY) === "1"; } catch (_) { return false; } }
  function setPlateCollapsed(on) { try { var s = store(); if (!s) return; if (on) s.setItem(COLLAPSE_KEY, "1"); else s.removeItem(COLLAPSE_KEY); } catch (_) {} }
  function collapseButton(doc, box, t) {
    var b = doc.createElement("button"); b.type = "button"; b.className = "reader-news-collapse";
    function sync() {
      var on = box.classList.contains("is-collapsed");
      b.textContent = on ? t("news.plate.expand", "Фото и подзаголовок ▾") : t("news.plate.collapse", "Свернуть ▴");
      b.setAttribute("aria-expanded", String(!on));
    }
    b.addEventListener("click", function () { var on = !box.classList.contains("is-collapsed"); box.classList.toggle("is-collapsed", on); setPlateCollapsed(on); sync(); });
    sync();
    return b;
  }

  // The outlet updated the article after we took it (docs/superpowers/specs/2026-11-15-news-editions-design.md §4.4):
  // our copy is not changed; a note says what changed there and links the original.
  var PLURAL_FALLBACK = { one: "+{n} абзац", few: "+{n} абзаца", many: "+{n} абзацев", other: "+{n} абзаца" };
  function changeNote(doc, ch, meta, t, locale, now) {
    if (!ch) return null;
    var cat = "other"; try { cat = new Intl.PluralRules(locale || "ru").select(ch.added); } catch (_) {}
    var parts = [];
    if (ch.added) parts.push(fill(t("news.reader.added." + cat, t("news.reader.added.other", PLURAL_FALLBACK[cat] || PLURAL_FALLBACK.other)), { n: ch.added }));
    if (ch.changed) parts.push(fill(t("news.reader.changedN", "изменено {n}"), { n: ch.changed }));
    if (ch.removed) parts.push(fill(t("news.reader.removedN", "убрано {n}"), { n: ch.removed }));
    if (ch.title_changed) parts.push(t("news.reader.newTitle", "новый заголовок"));
    var at = ch.source_updated_at || ch.at, loc = locale === "he" ? "he-IL" : locale === "en" ? "en-GB" : "ru-RU", time = "", date = "", today = false;
    try {
      time = new Date(at).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" });
      date = new Date(at).toLocaleDateString(loc, { day: "numeric", month: "long", timeZone: "Asia/Jerusalem" });
      var d = function (ms) { return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }); };
      today = d(Date.parse(at)) === d(now || Date.now());
    } catch (_) {}
    var when = today ? fill(t("news.reader.whenToday", "в {time}"), { time: time }) : fill(t("news.reader.whenDay", "{date} в {time}"), { date: date, time: time });
    // The outlet's own time when it is later than our copy; otherwise the time we noticed the change.
    var p = el(doc, "p", "reader-news-changed", fill(ch.source_updated_at ? t("news.reader.sourceChanged", "Издание обновило статью {when}: {parts}") : t("news.reader.sourceNoticed", "Издание обновило статью (замечено {when}): {parts}"),
      { when: when, parts: parts.join(", ") }));
    var href = safeHttps(meta.canonical_url);
    if (href) { p.appendChild(doc.createTextNode(" · ")); var a = doc.createElement("a"); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = t("news.plate.original", "Оригинал ↗"); p.appendChild(a); }
    return p;
  }
  // The reading signal (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.7): «open» at once,
  // «finish» when the table's last row is seen. The server keeps it only for the owner.
  function watchReading(win, mount, workId, send, opts) {
    opts = opts || {};
    var clock = opts.now || function () { return Date.now(); }, minMs = opts.minMs != null ? opts.minMs : 15000, openedAt = clock(), timer = null;
    var done = false, io = null, mo = null, watched = null;
    try { send("open"); } catch (_) {}
    // «Read» needs the last row seen AND at least minMs on the article: a short text is not «read» on opening.
    function finish() { if (done) return; done = true; if (io) io.disconnect(); if (mo) mo.disconnect(); try { send("finish"); } catch (_) {} }
    if (!win || !win.IntersectionObserver || !mount) return function () {};
    function lastRow() { var rows = mount.querySelectorAll("tr"); return rows.length ? rows[rows.length - 1] : null; }
    function arm() {
      if (done) return;
      var row = lastRow();
      if (!row || row === watched) return;
      if (io) io.disconnect();
      watched = row;
      io = new win.IntersectionObserver(function (entries) {
        if (done) return;
        if (!entries.some(function (e) { return e.isIntersecting; }) || timer) return;
        var left = minMs - (clock() - openedAt);
        if (left <= 0 || !win.setTimeout) finish(); else timer = win.setTimeout(finish, left);
      });
      io.observe(row);
    }
    arm();
    // The table is repainted on many paths: follow the new last row.
    if (win.MutationObserver) { mo = new win.MutationObserver(arm); mo.observe(mount, { childList: true, subtree: true }); }
    return function () { done = true; if (timer && win.clearTimeout) win.clearTimeout(timer); if (io) io.disconnect(); if (mo) mo.disconnect(); };
  }
  // meta: text.source_meta.news; t(key, fallback); place: 'head' | 'foot'; sourceChange: the card's source_change.
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
    line.appendChild(doc.createTextNode(meta.original
      ? fill(t("news.plate.headOriginal", "Текст оригинала: статья {outlet}"), { outlet: "" })
      : fill(t("news.plate.head", "Учебный пересказ LinguistPro по материалам {outlet}"), { outlet: "" })));
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
    if (place === "head") { var note = changeNote(doc, opts.sourceChange, meta, t, opts.locale, opts.now); if (note) box.appendChild(note); }
    if (place === "head" && opts.selected && opts.selected.selected_by === "dot")
      box.appendChild(el(doc, "p", "reader-news-selected", fill(t("news.reader.selected", "Выбрано dot: {note}"), { note: opts.selected.selection_note_ru || "" })));
    var images = Array.isArray(meta.images) ? meta.images : [];
    if (place === "head") {
      var sw = versionSwitch(doc, meta, opts, t); if (sw) box.appendChild(sw);
      var hero = images.filter(function (im) { return im && im.role === "hero"; })[0];
      var heroFig = hero && figure(doc, hero, meta, t, "reader-news-hero"); if (heroFig) box.appendChild(heroFig);
      if (meta.subtitle_he) { var sub = el(doc, "p", "reader-news-subtitle", meta.subtitle_he); sub.setAttribute("lang", "he"); sub.setAttribute("dir", "rtl"); box.appendChild(sub); }
      if (meta.subtitle_ru) box.appendChild(el(doc, "p", "reader-news-subtitle-ru", meta.subtitle_ru));
      if (heroFig || meta.subtitle_he || meta.subtitle_ru) {
        if (plateCollapsed()) box.classList.add("is-collapsed");
        line.appendChild(doc.createTextNode(" "));
        line.appendChild(collapseButton(doc, box, t));
      }
    } else {
      // Photos with a place in the table (after_row) are shown there by placeInlineFigures; the rest here.
      var inline = images.filter(function (im) { return im && im.role === "inline" && !placed(im); });
      if (inline.length) {
        var gallery = el(doc, "div", "reader-news-gallery");
        gallery.appendChild(el(doc, "p", "reader-news-gallery-title", t("news.figure.gallery", "Фото из статьи")));
        inline.forEach(function (im) { var f = figure(doc, im, meta, t, "reader-news-figure"); if (f) gallery.appendChild(f); });
        if (gallery.children.length > 1) box.appendChild(gallery);
      }
    }
    var extra = [];
    if (place === "foot") {
      if (meta.author) extra.push(fill(t("news.plate.author", "Автор оригинала: {author}"), { author: meta.author }));
      if (meta.section_original_he) extra.push(fill(t("news.plate.section", "Рубрика: {section}"), { section: meta.section_original_he }));
      var prepared = meta.prepared || {};
      if (prepared.by) extra.push(fill(t("news.plate.prepared", "Подготовлено: {by} · {date}"), { by: prepared.by, date: dateLabel(prepared.prepared_at, opts.locale) }));
    }
    if (meta.content_type === "opinion") extra.push(meta.original
      ? t("news.plate.opinionOriginal", "Колонка мнений: позиция автора, не редакции LinguistPro")
      : t("news.plate.opinion", "Колонка мнений: пересказана позиция автора, не редакции LinguistPro"));
    if (opts.withdrawn) extra.push(t("news.plate.withdrawn", "Статья снята из раздела «Новости»; эта копия осталась у вас"));
    extra.forEach(function (text) { var p = doc.createElement("p"); p.className = "reader-news-source-note"; p.textContent = text; box.appendChild(p); });
    return box;
  }
  return { watchReading: watchReading, parseEntry: parseEntry, returnHref: returnHref, renderPlate: renderPlate, dateLabel: dateLabel, levelLabel: levelLabel, safeImage: safeImage, creditText: creditText, placeInlineFigures: placeInlineFigures, COLLAPSE_KEY: COLLAPSE_KEY, WORK: WORK };
});
