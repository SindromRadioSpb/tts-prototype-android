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
  function storedImage(url) { var s = String(url || ""); return /^\/api\/news\/images\/na_[0-9a-f]{24}\/img-\d{1,2}\.(jpg|jpeg|png|webp)\?v=[0-9a-f]{12}$/.test(s) ? s : null; }
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
    // A photo stored with the article (same-origin) wins over the outlet's og:image link.
    var img = card.image || {}, stored = img.stored && storedImage(img.stored.url);
    var src = stored || (img.mode === "source_link" ? safeHttps(img.url) : null);
    if (!src) return fallbackCover(doc, card, t);
    var cover = fallbackCover(doc, card, t);
    cover.className = "nw-cover nw-cover-photo";
    var el = h(doc, "img", { src: src, alt: (stored && (img.stored.alt_ru || img.stored.caption_ru)) || img.alt_ru || img.alt_he || "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
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
    (card.levels || []).forEach(function (lv) { meta.appendChild(h(doc, "span", { class: "nw-level" + (lv === "OR" ? " nw-level-original" : ""), text: lv === "OR" ? t("news.level.original", "Оригинал") : lv })); });
    if (card.heavy) meta.appendChild(h(doc, "span", { class: "nw-heavy", text: t("news.heavy", "Тяжёлая тема") }));
    // dot's own choice (docs/superpowers/specs/2026-11-15-news-editions-design.md §4.5): marked, with the reason.
    var dot = card.selected_by === "dot";
    if (dot) meta.appendChild(h(doc, "span", { class: "nw-selected-dot", title: card.selection_note_ru || null, text: t("news.selectedByDot", "выбрано dot") }));
    var title = h(doc, "h3", { class: "nw-card-title", lang: "he", dir: "rtl", text: card.title_he });
    var body = h(doc, "div", { class: "nw-card-body" }, [meta, title,
      h(doc, "p", { class: "nw-card-translation", text: card.title_ru, dir: "auto" }),
      h(doc, "p", { class: "nw-card-summary", text: card.summary_ru, dir: "auto" }),
      dot && card.selection_note_ru ? h(doc, "p", { class: "nw-selected-note", dir: "auto", text: fill(t("news.selectedNote", "Почему dot выбрал: {note}"), { note: card.selection_note_ru }) }) : null]);
    var main;
    if (card.readable && card.work_id) main = h(doc, "a", { class: "nw-card-main", href: readerHref(card, opts.returnTo) }, [coverFor(doc, card, t), body]);
    else { main = h(doc, "div", { class: "nw-card-main nw-card-static" }, [coverFor(doc, card, t), body]); body.appendChild(h(doc, "p", { class: "nw-card-only", text: t("news.cardOnly", "Только карточка — статья в глубоком архиве") })); }
    var ci = card.image || {}, storedPhoto = !!(ci.stored && storedImage(ci.stored.url));
    var creditText = storedPhoto ? ci.stored.credit_he : ci.credit_he;
    var credit = creditText ? " · " + (String(creditText).replace(/^\s*(צילום|צלם|photo)\s*[:：]\s*/i, "").trim() || creditText) : "";
    var hasPhoto = storedPhoto || !!(ci.mode === "source_link" && safeHttps(ci.url));
    var foot = h(doc, "p", { class: "nw-card-foot" }, [h(doc, "span", { text: hasPhoto ? fill(t("news.photo", "Фото: {outlet}"), { outlet: o.name_latin }) + credit : "", dir: "auto" })]);
    var orig = safeHttps(card.original_url);
    if (orig) foot.appendChild(h(doc, "a", { href: orig, target: "_blank", rel: "noopener noreferrer", text: t("news.original", "Оригинал ↗") }));
    var article = h(doc, "article", { class: "nw-card", "data-tier": card.tier, "data-article": card.article_id }, [main, foot]);
    if (opts.manage) article.appendChild(renderManage(doc, card, opts, article));
    return article;
  }
  // Owner/editor controls on a card: «В архив» / «Вернуть в ленту» / «Удалить» (titled confirm, 30-day trash).
  var FRESH_MS = 72 * 3600 * 1000;
  function renderManage(doc, card, opts, article) {
    var t = opts.t || function (k, f) { return f; }, now = opts.now || Date.now();
    var box = h(doc, "div", { class: "nw-manage" });
    var menuId = "nw-menu-" + card.article_id;
    var toggle = h(doc, "button", { type: "button", class: "nw-manage-toggle", "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": menuId,
      "aria-label": t("news.manage.menu", "Действия со статьёй"), text: "⋯" });
    var menu = h(doc, "div", { class: "nw-manage-menu", id: menuId, role: "menu", hidden: true });
    var actions = [];
    if (card.tier === "fresh") actions.push(["archive", t("news.manage.archive", "В архив")]);
    else if (card.tier === "archive" && now - Date.parse(card.published_at) <= FRESH_MS) actions.push(["unarchive", t("news.manage.unarchive", "Вернуть в ленту")]);
    actions.push(["delete", t("news.manage.delete", "Удалить")]);
    function close() { menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); }
    async function run(action) {
      close();
      var ok = false;
      try { ok = await opts.manage.act(action, card); } catch (_) { ok = false; }
      if (ok && opts.manage.done) opts.manage.done(action, card, article);
    }
    actions.forEach(function (a) {
      var b = h(doc, "button", { type: "button", role: "menuitem", "data-action": a[0], text: a[1] });
      b.addEventListener("click", function () {
        if (a[0] !== "delete") return run(a[0]);
        close();
        var confirm = h(doc, "div", { class: "nw-confirm", role: "alertdialog", "aria-label": t("news.manage.delete", "Удалить") }, [
          h(doc, "p", {}, [t("news.manage.confirmText", "Удалить статью из раздела «Новости»? Её не увидит никто. Удалённое хранится 30 дней на странице редактора, там её можно восстановить."), " ",
            h(doc, "strong", { lang: "he", dir: "rtl", text: card.title_he })])]);
        var yes = h(doc, "button", { type: "button", class: "nw-button nw-danger", "data-confirm": "yes", text: t("news.manage.delete", "Удалить") });
        var no = h(doc, "button", { type: "button", class: "nw-button nw-quiet", "data-confirm": "no", text: t("news.manage.cancel", "Отмена") });
        yes.addEventListener("click", function () { confirm.remove(); run("delete"); });
        no.addEventListener("click", function () { confirm.remove(); toggle.focus && toggle.focus(); });
        confirm.appendChild(h(doc, "div", { class: "nw-confirm-actions" }, [yes, no]));
        box.appendChild(confirm);
        yes.focus && yes.focus();
      });
      menu.appendChild(b);
    });
    toggle.addEventListener("click", function () {
      var open = menu.hidden; menu.hidden = !open; toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) { var first = menu.querySelector("button"); if (first && first.focus) first.focus(); }
    });
    menu.addEventListener("keydown", function (e) { if (e.key === "Escape") { close(); toggle.focus && toggle.focus(); } });
    box.append(toggle, menu);
    return box;
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
  // «Обзор дня» (§17): rubric groups of the overview filter (the same groups as the server's quota).
  var GROUPS = { politics: "politics", security: "security", economy: "economy", consumer: "economy", world: "world", news: "society", local: "society",
    health: "society", science: "society", tech: "society", other: "society", culture: "culture", sport: "culture", lifestyle: "culture", opinion: "opinion" };
  var GROUP_ORDER = ["politics", "security", "society", "economy", "world", "culture", "opinion"];
  function storyGroup(story) {
    var votes = {};
    (story.items || []).forEach(function (it) { var g = GROUPS[it.section] || "society"; votes[g] = (votes[g] || 0) + 1; });
    return Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; })[0] || "society";
  }
  // Editions (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.10): times are Israel time.
  var EDITION_SLOTS = ["morning", "midday", "evening", "late", "extra"];
  function israelTime(iso, loc) {
    try { return new Date(iso).toLocaleTimeString(loc === "he" ? "he-IL" : loc === "en" ? "en-GB" : "ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" }); } catch (_) { return ""; }
  }
  function israelDate(ms) { try { return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }); } catch (_) { return ""; } }
  function israelDayLabel(iso, loc) {
    try { return new Date(iso).toLocaleDateString(loc === "he" ? "he-IL" : loc === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }); } catch (_) { return ""; }
  }
  var SLOT_FALLBACK = { morning: "утренний выпуск", midday: "обеденный выпуск", evening: "вечерний выпуск", late: "поздний выпуск", extra: "внеочередной выпуск" };
  function slotName(slot, t) { return t("news.slot." + slot, SLOT_FALLBACK[slot] || slot); }
  // «Обновлено в 18:04 · вечерний выпуск · следующий выпуск около 22:00» — the last READY edition, never «now».
  function renderStatusLine(doc, st, opts) {
    opts = opts || {};
    var t = opts.t || function (k, f) { return f; }, loc = opts.locale || "ru", now = opts.now || Date.now();
    if (!st || (!st.last_ready && !st.next)) return null;
    var parts = [];
    if (st.last_ready && st.last_ready.published_at) {
      var at = st.last_ready.published_at, same = israelDate(Date.parse(at)) === israelDate(now);
      parts.push((same ? fill(t("news.status.ready", "Обновлено в {time}"), { time: israelTime(at, loc) })
        : fill(t("news.status.readyOn", "Обновлено {date} в {time}"), { date: israelDayLabel(at, loc), time: israelTime(at, loc) })) + " · " + slotName(st.last_ready.slot, t));
    }
    if (st.next) {
      var n = st.next;
      parts.push(n.state === "preparing" ? fill(t("news.status.preparing", "готовится {slot}"), { slot: slotName(n.slot, t) })
        : n.state === "late" ? fill(t("news.status.late", "задерживается {slot}"), { slot: slotName(n.slot, t) })
        : fill(t("news.status.next", "следующий выпуск около {time}"), { time: israelTime(n.target_ready_at, loc) }));
    }
    return h(doc, "p", { class: "nw-status", role: "status", text: parts.join(" · ") });
  }
  // The owner's reminder (spec §5.11): the server's disk is getting full — the archive can go to this computer.
  function renderStorageBanner(doc, st, opts) {
    opts = opts || {};
    var t = opts.t || function (k, f) { return f; };
    if (!opts.owner || !st || !st.low) return null;
    var days = (st.suggest && st.suggest.days) || [], bytes = (st.suggest && st.suggest.bytes) || 0;
    if (!days.length) return h(doc, "div", { class: "nw-storage-banner", role: "status" }, [h(doc, "span", { text: t("news.offload.nothing", "Место на сервере заканчивается. Выгружать пока нечего: в архиве нет дней старше трёх суток.") })]);
    var size = bytes >= 1e9 ? (Math.round(bytes / 1e8) / 10).toString().replace(".", ",") + " ГБ" : Math.max(1, Math.round(bytes / 1e6)) + " МБ";
    return h(doc, "div", { class: "nw-storage-banner", role: "status" }, [
      h(doc, "span", { text: fill(t("news.offload.banner", "Место на сервере заканчивается. Можно выгрузить на этот компьютер {days} дн. архива (≈{size})."), { days: days.length, size: size }) + " " }),
      h(doc, "a", { class: "nw-button", href: "/news-editor.html#storage", text: t("news.offload.go", "Выгрузить") })]);
  }
  // Only the rows that appeared in one edition (stories keep the rest out).
  function filterByEdition(stories, slot) {
    if (!slot) return stories;
    return stories.map(function (s) { var items = s.items.filter(function (it) { return it.edition_slot === slot; }); return items.length ? Object.assign({}, s, { items: items, main: items.some(function (it) { return !!it.work_id; }) }) : null; }).filter(Boolean);
  }
  // Findability (docs/superpowers/specs/2026-11-21-news-findability-design.md §2): every study article on
  // its own row, freshest first; below, the stories with what is left only in the slice.
  function freshness(it) { var m = function (v) { return Date.parse(v || "") || 0; }; return Math.max(m(it.changed_at), m(it.edition_published_at), m(it.published_at)); }
  function splitLearn(stories) {
    var learn = [], slice = [];
    (stories || []).forEach(function (s) {
      var rest = [];
      (s.items || []).forEach(function (it) { (it.work_id ? learn : rest).push(it); });
      if (rest.length) slice.push(Object.assign({}, s, { items: rest, main: false }));
    });
    learn.sort(function (a, b) { return freshness(b) - freshness(a); });
    return { learn: learn, slice: slice };
  }
  function originalLink(doc, it, t) {
    var href = safeHttps(it.url);
    return href ? h(doc, "a", { class: "nw-ov-original", href: href, target: "_blank", rel: "noopener noreferrer", text: t("news.overview.original", "оригинал ↗") }) : null;
  }
  function ovItem(doc, it, t, big, opts) {
    opts = opts || {};
    var o = outletOf(it.outlet_id), tag = h(doc, "span", { class: "nw-outlet-tag", text: o.name_latin });
    tag.style.setProperty("--nw-outlet", o.color);
    var since = opts.lastVisit && it.edition_published_at && it.edition_published_at > opts.lastVisit;
    var box = h(doc, "div", { class: "nw-ov-item" + (big ? " nw-ov-item-lead" : "") + (since ? " nw-ov-item-since" : "") }, [
      h(doc, "p", { class: "nw-ov-meta" }, [tag, opts.showTime && it.published_at ? h(doc, "span", { class: "nw-ov-time", text: " · " + (opts.day && israelDate(Date.parse(it.published_at)) !== opts.day ? israelDayLabel(it.published_at, opts.locale) + ", " : "") + israelTime(it.published_at, opts.locale) }) : null, it.paywalled ? " · " + t("news.overview.paywalled", "платная") : "",
        it.work_id ? h(doc, "span", { class: "nw-ov-learn", text: t("news.overview.learnBadge", "учебная") }) : null,
        it.selected_by === "dot" ? h(doc, "span", { class: "nw-selected-dot", text: t("news.selectedByDot", "выбрано dot") }) : null,
        it.edition_slot && it.edition_slot !== "morning" && it.edition_published_at ? h(doc, "span", { class: "nw-ov-new-in", text: fill(t("news.overview.newIn", "новое в {time}"), { time: israelTime(it.edition_published_at, opts.locale) }) }) : null,
        since ? h(doc, "span", { class: "nw-ov-since", text: t("news.overview.sinceVisit", "с вашего прошлого визита") }) : null,
        it.changed_at ? h(doc, "span", { class: "nw-ov-changed", text: fill(t("news.overview.changed", "обновлено изданием в {time}"), { time: israelTime(it.changed_at, opts.locale) }) }) : null,
        " ", originalLink(doc, it, t)]),
      h(doc, big ? "h3" : "p", { class: "nw-ov-title", lang: "he", dir: "rtl", text: it.title_he }),
      it.title_ru ? h(doc, "p", { class: "nw-ov-ru", dir: "auto", text: it.title_ru }) : null]);
    if (big && it.lead_he) {
      box.appendChild(h(doc, "p", { class: "nw-ov-lead", lang: "he", dir: "rtl", text: it.lead_he }));
      if (it.lead_ru) box.appendChild(h(doc, "p", { class: "nw-ov-ru nw-ov-lead-ru", dir: "auto", text: it.lead_ru }));
    }
    return box;
  }
  // A study article of the day: big, with its own Read button.
  function renderOverviewItem(doc, it, opts) {
    opts = opts || {};
    var t = opts.t || function (k, f) { return f; };
    var box = ovItem(doc, it, t, true, opts);
    if (it.work_id) box.appendChild(h(doc, "a", { class: "nw-button nw-ov-read", href: readerHref({ work_id: it.work_id }, opts.returnTo), text: t("news.overview.read", "Читать с переводом и огласовкой") }));
    // «Читать оригинал» (findability W3): the outlet's text as is, while its body is kept on the server.
    else if (opts.rawLink && it.full_ok && !it.paywalled && it.body_until && Date.parse(it.body_until) > (opts.now || Date.now()))
      box.appendChild(h(doc, "a", { class: "nw-button nw-button-quiet nw-ov-raw", href: readerHref({ work_id: it.item_key + ".rw" }, opts.returnTo), text: t("news.list.readRaw", "Оригинал без перевода") }));
    return box;
  }
  // One story: its main article big (the one with a full study article first), the other outlets folded.
  function renderStory(doc, story, opts) {
    opts = opts || {};
    var t = opts.t || function (k, f) { return f; };
    var items = (story.items || []).slice().sort(function (a, b) { return (b.work_id ? 1 : 0) - (a.work_id ? 1 : 0); });
    var lead = items[0], rest = items.slice(1);
    var outlets = [], seen = {};
    items.forEach(function (it) { if (!seen[it.outlet_id]) { seen[it.outlet_id] = 1; outlets.push(outletOf(it.outlet_id).name_latin); } });
    var art = h(doc, "article", { class: "nw-ov-story" + (story.main ? " nw-ov-main" : ""), "data-story": story.story_key, "data-group": storyGroup(story) }, [
      h(doc, "p", { class: "nw-ov-head" }, [h(doc, "span", { class: "nw-ov-group", text: t("news.overview.group." + storyGroup(story), storyGroup(story)) }),
        outlets.length > 1 ? " · " + fill(t("news.overview.outlets", "изданий: {n}"), { n: outlets.length }) : "",
        story.continued ? " · " + t("news.overview.continued", "продолжение со вчера") : ""]),
      ovItem(doc, lead, t, true, opts)]);
    var work = items.filter(function (it) { return it.work_id; })[0];
    if (work) art.appendChild(h(doc, "a", { class: "nw-button nw-ov-read", href: readerHref({ work_id: work.work_id }, opts.returnTo), text: t("news.overview.read", "Читать с переводом и огласовкой") }));
    if (rest.length) {
      var more = h(doc, "details", { class: "nw-ov-more" }, [h(doc, "summary", { text: fill(t("news.overview.more", "Ещё {n}: {outlets}"), { n: rest.length, outlets: outlets.slice(1).join(", ") || outlets[0] }) })]);
      rest.forEach(function (it) { more.appendChild(ovItem(doc, it, t, false, opts)); });
      if (rest.some(function (it) { return opts.lastVisit && it.edition_published_at && it.edition_published_at > opts.lastVisit; })) more.open = true;
      art.appendChild(more);
    }
    return art;
  }

  // One state for the overview and every outlet (findability spec §7.3); old outlet addresses
  // (?tier=archive&q=&from=&to=) keep working: the archive tab became a date range.
  var KINDS = ["learn", "slice", "all"], SORTS = ["fresh", "time", "match"];
  function parseState(search) {
    var q = new URLSearchParams(String(search || ""));
    var outlet = q.get("outlet"); if (!(Outlets && Outlets.byId(outlet))) outlet = null;
    var section = q.get("section"); if (SECTIONS.indexOf(section) < 0) section = null;
    var day = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null; };
    var group = q.get("group"); if (GROUP_ORDER.indexOf(group) < 0) group = null;
    var story = (q.get("story") || "").slice(0, 120) || null;
    var tag = (q.get("tag") || "").trim().slice(0, 40); if (!tag || tag.charAt(0) === "#") tag = null;
    return { view: outlet ? "outlet" : q.get("view") === "overview" ? "overview" : null, outlet: outlet, section: section,
      q: (q.get("q") || "").slice(0, 200) || null, from: day(q.get("from")), to: day(q.get("to")), day: day(q.get("day")), group: group,
      ed: EDITION_SLOTS.indexOf(q.get("ed")) >= 0 ? q.get("ed") : null, kind: KINDS.indexOf(q.get("kind")) >= 0 ? q.get("kind") : "all",
      sort: SORTS.indexOf(q.get("sort")) >= 0 ? q.get("sort") : "fresh", story: story, star: q.get("star") === "1", tag: tag };
  }
  function stateHref(s) {
    var q = new URLSearchParams();
    if (s.view === "overview" && !s.outlet) q.set("view", "overview");
    else if (s.outlet) q.set("outlet", s.outlet);
    else return "/news.html";
    if (s.from || s.to) { if (s.from) q.set("from", s.from); if (s.to) q.set("to", s.to); }
    else if (s.day) q.set("day", s.day);
    if (s.section) q.set("section", s.section);
    if (s.group) q.set("group", s.group);
    if (s.ed) q.set("ed", s.ed);
    if (s.kind && s.kind !== "all") q.set("kind", s.kind);
    if (s.story) q.set("story", s.story);
    if (s.q) q.set("q", s.q);
    if (s.sort && s.sort !== "fresh") q.set("sort", s.sort);
    if (s.star) q.set("star", "1");
    if (s.tag) q.set("tag", s.tag);
    return "/news.html?" + q.toString();
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
    // «С вашего прошлого визита»: the time of the previous visit, read once; this visit is stored after 10 s or on leaving.
    var VISIT_KEY = "lp.news.lastVisit", lastVisit = store.get(VISIT_KEY), visitSaved = false;
    var saveVisit = function () { if (!visitSaved) { visitSaved = true; store.set(VISIT_KEY, new Date().toISOString()); } };
    try { win.setTimeout(saveVisit, 10000); win.addEventListener("pagehide", saveVisit); } catch (_) {}
    function statusHost(my) {
      var host = h(doc, "div", { class: "nw-status-host" });
      getJson("/api/news/status").then(function (st) { if (my !== token) return; var el = renderStatusLine(doc, st, { t: t, locale: locale() }); if (el) host.replaceChildren(el); }).catch(function () {});
      return host;
    }
    // Owner / news editor: card controls «В архив» / «Вернуть в ленту» / «Удалить» + «Отменить».
    var manage = null, toastTimer = null;
    var UNDO = { archive: "unarchive", unarchive: "archive", delete: "restore" };
    function toast(text, undo) {
      var host = doc.getElementById("nw-toast"); if (!host) return;
      clearTimeout(toastTimer);
      host.replaceChildren(h(doc, "span", { text: text }));
      if (undo) {
        var b = h(doc, "button", { type: "button", text: t("news.manage.undo", "Отменить") });
        b.addEventListener("click", function () { host.hidden = true; undo(); });
        host.appendChild(b);
      }
      host.hidden = false;
      toastTimer = setTimeout(function () { host.hidden = true; }, 8000);
    }
    async function act(action, card) {
      var headers = { "content-type": "application/json" };
      if (manage && manage.csrf) headers["x-lp-csrf"] = manage.csrf;
      var r = await win.fetch("/api/news/editor/articles/" + encodeURIComponent(card.article_id) + "/" + action, { method: "POST", credentials: "same-origin", headers: headers, body: "{}" });
      if (!r.ok) { toast(t("news.manage.failed", "Не получилось. Попробуйте ещё раз.")); return false; }
      outletsCache = null;
      return true;
    }
    function manageOpts() {
      if (!manage) return null;
      return { act: act, done: function (action, card, article) {
        article.remove();
        var text = action === "archive" ? t("news.manage.doneArchive", "Статья перенесена в архив")
          : action === "unarchive" ? t("news.manage.doneUnarchive", "Статья возвращена в ленту") : t("news.manage.doneDelete", "Статья удалена");
        toast(text, function () { act(UNDO[action], card).then(function (ok) { if (ok) render(); }); });
      } };
    }
    async function probeManage() {
      try {
        var r = await win.fetch("/api/news/editor/me?soft=1", { cache: "no-store", credentials: "same-origin" });
        var j = r.ok ? await r.json() : null;
        manage = j && j.kind ? { kind: j.kind, csrf: j.csrf || null } : null;
      } catch (_) { manage = null; }
    }
    // Tags, ★ and «прочитано» (findability W4): a signed-in reader's live in the account, a visitor's in this browser.
    var marksApi = null;
    function marksFor() {
      if (marksApi) return marksApi;
      marksApi = win.fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (me) {
        if (me && me.user) {
          var csrf = me.csrf || "";
          var send = function (method, url, body) { return win.fetch(url, { method: method, credentials: "same-origin", headers: { "content-type": "application/json", "x-lp-csrf": csrf }, body: JSON.stringify(body) }); };
          return { signedIn: true, ok: true, marksOf: function (r) { return r.marks || []; }, isRead: function (r) { return !!r.read; },
            toggle: function (r, tag) {
              var has = (r.marks || []).indexOf(tag) >= 0;
              return send(has ? "DELETE" : "PUT", "/api/news/marks", { item_key: r.item_key, tag: tag }).then(function (x) { if (!x.ok) throw new Error("HTTP_" + x.status); return x.json(); })
                .then(function (j) { r.marks = j.marks || []; return r.marks; }).catch(function () { toast(t("news.manage.failed", "Не получилось. Попробуйте ещё раз.")); return r.marks || []; });
            },
            tags: function () { return getJson("/api/news/tags").then(function (j) { return j.tags || []; }).catch(function () { return []; }); },
            read: function (r) { return send("POST", "/api/news/read", { item_key: r.item_key }).catch(function () {}); },
            keysWith: function () { return []; } };
        }
        var L = win.NewsMarksLocal;
        return (L ? L.open() : Promise.resolve(null)).then(function (local) {
          local = local || { ok: false, marks: function () { return []; }, isRead: function () { return false; }, toggle: function () { return Promise.resolve([]); }, read: function () { return Promise.resolve(); }, tags: function () { return []; }, keysWith: function () { return []; } };
          return { signedIn: false, ok: local.ok, marksOf: function (r) { return local.marks(r.item_key); }, isRead: function (r) { return local.isRead(r.item_key); },
            toggle: function (r, tag) { return local.toggle(r.item_key, tag); }, tags: function () { return Promise.resolve(local.tags()); },
            read: function (r) { return local.read(r.item_key); }, keysWith: function (tag) { return local.keysWith(tag); } };
        });
      });
      return marksApi;
    }
    var locale = function () { return (typeof win.appGetLocale === "function" && win.appGetLocale()) || "ru"; };

    function status(key, fallback, retry) {
      var box = h(doc, "div", { class: "nw-state", role: "status" }, [h(doc, "p", { text: t(key, fallback) })]);
      if (retry) { var b = h(doc, "button", { type: "button", class: "nw-button", text: t("news.retry", "Повторить") }); b.addEventListener("click", retry); box.appendChild(b); }
      return box;
    }
    async function getJson(url) { var r = await win.fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error("HTTP_" + r.status); return r.json(); }
    async function loadOutlets() { if (!outletsCache) outletsCache = (await getJson("/api/news/outlets")).outlets; return outletsCache; }

    function go(state, replace) {
      try { win.history[replace ? "replaceState" : "pushState"]({}, "", stateHref(state)); } catch (_) {}
      render();
    }

    async function renderHome(my) {
      var head = h(doc, "header", { class: "nw-heading" }, [h(doc, "h1", { text: t("news.heading", "Новости") }),
        h(doc, "p", { class: "nw-lead", text: t("news.lead", "Статьи израильских изданий — с таблицей, огласовкой, переводом и карточками слов. Текст оригинала или учебный пересказ; у каждой статьи ссылка на оригинал, у каждого фото — подпись источника.") })]);
      root.replaceChildren(head, status("news.loading", "Загрузка новостей…"));
      var outlets;
      try { outlets = await loadOutlets(); } catch (_) { if (my === token) root.replaceChildren(head, status("news.error", "Не удалось загрузить новости", render)); return; }
      if (my !== token) return;
      var pins = pinned(), byId = {};
      outlets.forEach(function (o) { byId[o.outlet_id] = o; });
      var tile = function (o) { return renderOutletTile(doc, o, { t: t, pinned: pins.indexOf(o.outlet_id) >= 0, locale: locale() }); };
      var parts = [head, statusHost(my)];
      if (manage && manage.kind === "owner") {
        var bannerHost = h(doc, "div", { class: "nw-storage-host" });
        parts.push(bannerHost);
        getJson("/api/news/editor/storage").then(function (st) { if (my !== token) return; var b = renderStorageBanner(doc, st, { t: t, owner: true }); if (b) bannerHost.replaceChildren(b); }).catch(function () {});
      }
      var teaser = h(doc, "div", { class: "nw-ov-teaser-host" });
      parts.push(teaser);
      getJson("/api/news/overview").then(function (data) {
        if (my !== token || !data || !data.overview) return;
        var ov = data.overview, items = ov.stories.reduce(function (a, s) { return a + s.items.length; }, 0);
        var link = h(doc, "a", { class: "nw-ov-teaser", href: stateHref({ view: "overview", day: ov.day }) }, [
          h(doc, "strong", { text: t("news.overview.title", "Обзор дня") }), " · " + dayLabel(ov.day, locale()),
          h(doc, "span", { class: "nw-ov-teaser-sub", text: fill(t("news.overview.count", "Сюжетов: {stories} · статей всех изданий: {items}"), { stories: ov.stories.length, items: items }) })]);
        link.addEventListener("click", function (e) { e.preventDefault(); go({ view: "overview", day: ov.day }); });
        teaser.replaceChildren(link);
      }).catch(function () {});
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

    // The overview and an outlet are one list screen (findability spec §7.3).
    var listApi = null;
    function renderList(state, my) {
      var back = h(doc, "a", { class: "nw-back", href: "/news.html", text: state.view === "outlet" ? t("news.backToOutlets", "← Все издания") : t("news.backToNews", "← Новости") });
      back.addEventListener("click", function (e) { e.preventDefault(); go({}); });
      var head;
      if (state.view === "outlet") {
        var o = outletOf(state.outlet), titleTag = h(doc, "span", { class: "nw-outlet-tag nw-outlet-tag-big", text: o.name_latin });
        titleTag.style.setProperty("--nw-outlet", o.color);
        head = h(doc, "header", { class: "nw-heading" }, [back, h(doc, "h1", {}, [titleTag, " ", h(doc, "span", { lang: "he", dir: "rtl", text: o.name_he })]),
          h(doc, "p", { class: "nw-lead nw-lead-small", text: t("news.list.outletLead", "Все статьи издания по дням: сначала учебные материалы, затем остальные из среза. Поиск — по заголовкам и тексту.") })]);
      } else {
        head = h(doc, "header", { class: "nw-heading" }, [back, h(doc, "h1", { text: t("news.overview.title", "Обзор дня") }),
          h(doc, "p", { class: "nw-lead nw-lead-small", text: t("news.list.overviewLead", "Все статьи изданий за день: сначала учебные материалы, затем остальные из среза. Поиск — по заголовкам и тексту.") })]);
      }
      var returnTo = stateHref(state);
      return marksFor().then(function (marks) {
      if (my !== token) return null;
      listApi = win.NewsListUi.render(root, state, {
        marks: marks,
        t: t, locale: locale(), heading: head, statusHost: statusHost(my),
        outlets: (Outlets ? Outlets.OUTLETS : []).map(function (x) { return { id: x.id, name: x.name_latin }; }),
        getJson: function (url, opts) { return win.fetch(url, { cache: "no-cache", signal: opts && opts.signal }).then(function (r) { if (!r.ok) throw new Error("HTTP_" + r.status); return r.json(); }); },
        go: function (next) { go(next); },
        replaceUrl: function (next) { try { win.history.replaceState({}, "", stateHref(next)); } catch (_) {} },
        isCurrent: function () { return my === token; },
        renderItem: function (row) { return renderOverviewItem(doc, row, { t: t, returnTo: returnTo, lastVisit: lastVisit, locale: locale(), showTime: true, day: row.day, rawLink: true }); },
        renderCard: function (card) { return renderCard(doc, card, { t: t, returnTo: returnTo, locale: locale(), manage: manageOpts() }); },
        noHeavy: noHeavy, setNoHeavy: function (v) { store.set(HEAVY_KEY, v ? "1" : "0"); },
      });
      return listApi.ready;
      });
    }

    function dayLabel(day, loc) {
      try { return new Date(day + "T12:00:00Z").toLocaleDateString(loc === "he" ? "he-IL" : loc === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long", weekday: "short" }); } catch (_) { return day; }
    }
    function render() {
      var my = ++token, state = parseState(win.location.search);
      doc.title = (state.view === "overview" ? t("news.overview.title", "Обзор дня") + " · " : state.outlet ? outletOf(state.outlet).name_latin + " · " : "") + t("news.title", "Новости") + " · LinguistPro";
      root.setAttribute("aria-busy", "true");
      var job = state.view ? renderList(state, my) : renderHome(my);
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
    probeManage().then(render, render);
  }
  return { splitLearn: splitLearn, renderOverviewItem: renderOverviewItem, renderStorageBanner: renderStorageBanner, renderStatusLine: renderStatusLine, filterByEdition: filterByEdition, installUpdateGate: installUpdateGate, renderStory: renderStory, storyGroup: storyGroup, renderCard: renderCard, renderOutletTile: renderOutletTile, parseState: parseState, stateHref: stateHref, timeAgo: timeAgo, readerHref: readerHref, SECTIONS: SECTIONS, boot: boot };
});
