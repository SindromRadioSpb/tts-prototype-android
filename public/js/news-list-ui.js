// One screen for «Обзор дня» and every outlet (docs/superpowers/specs/2026-11-21-news-findability-design.md §7.3):
// days ‹ ›, search, «Учебные · В срезе · Все», a filter sheet, study rows first, pages of 60 loaded as the
// reader scrolls. The page shell (news-ui.js) passes the row/card renderers and the URL helpers in ctx.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NewsListUi = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var GROUPS = ["politics", "security", "society", "economy", "world", "culture", "opinion"];
  var EDITIONS = ["morning", "midday", "evening", "late", "extra"];
  var SORTS = ["fresh", "time", "match"];

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
  function dayLabel(day, loc) {
    try { return new Date(day + "T12:00:00Z").toLocaleDateString(loc === "he" ? "he-IL" : loc === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long", weekday: "short" }); } catch (_) { return day; }
  }
  // keys: a visitor's marked articles from the browser (W4) — then no star/tag goes to the server.
  function listUrl(s, cursor, keys) {
    var q = new URLSearchParams();
    if (s.outlet) q.set("outlet", s.outlet);
    if (s.from || s.to) { if (s.from) q.set("from", s.from); if (s.to) q.set("to", s.to); }
    else if (s.day) q.set("day", s.day);
    if (s.section) q.set("section", s.section);
    if (s.group) q.set("group", s.group);
    if (s.ed) q.set("edition", s.ed);
    if (s.kind && s.kind !== "all") q.set("kind", s.kind);
    if (s.story) q.set("story", s.story);
    if (s.q) q.set("q", s.q);
    if (s.sort && s.sort !== "fresh") q.set("sort", s.sort);
    if (keys) q.set("keys", keys.slice(0, 150).join(","));
    else { if (s.star) q.set("star", "1"); if (s.tag) q.set("tag", s.tag); }
    if (cursor) q.set("cursor", cursor);
    var str = q.toString();
    return "/api/news/list" + (str ? "?" + str : "");
  }
  function activeFilters(s) {
    return (s.view === "overview" && s.outlet ? 1 : 0) + (s.group ? 1 : 0) + (s.section ? 1 : 0) + (s.ed ? 1 : 0) + (s.sort && s.sort !== "fresh" ? 1 : 0) + (s.from || s.to ? 1 : 0) + (s.story ? 1 : 0) + (s.star ? 1 : 0) + (s.tag ? 1 : 0);
  }

  // ctx: { t, locale, heading, getJson(url, {signal}), go(state, replace), replaceUrl(state), isCurrent(), renderItem(row), renderCard(card),
  //        outlets?: [{id,name}], noHeavy?: () => bool, setNoHeavy?: (bool) }. → { ready: Promise, search(q), more(), reload() }
  function render(root, state, ctx) {
    var doc = root.ownerDocument, t = ctx.t, loc = ctx.locale;
    var s = Object.assign({ kind: "all", sort: "fresh" }, state);
    var ctrl = null, cursor = null, lastData = null, api = {};

    // --- days ---
    var nav = h(doc, "nav", { class: "nw-ov-days", "aria-label": t("news.overview.days", "Дни") });
    // --- search ---
    var form = h(doc, "form", { class: "nw-search nw-list-search", role: "search" });
    var qIn = h(doc, "input", { type: "search", name: "q", value: s.q || "", placeholder: t("news.list.search", "Слово в заголовке или тексте"), "aria-label": t("news.list.search", "Слово в заголовке или тексте"), enterkeyhint: "search" });
    var note = h(doc, "p", { class: "nw-search-note", hidden: true });
    var M = ctx.marks || null;
    var marksNote = M && !M.signedIn ? h(doc, "p", { class: "nw-marks-note", text: M.ok
      ? t("news.list.marksLocal", "Ваши ★ и теги хранятся только в этом браузере. Войдите, чтобы они хранились в аккаунте.")
      : t("news.list.marksOff", "Отметки не сохраняются на этом устройстве: хранилище браузера недоступно. Войдите, чтобы ★ и теги хранились в аккаунте.") }) : null;
    form.appendChild(qIn);
    form.addEventListener("submit", function (e) { e.preventDefault(); api.search(qIn.value.trim()); });
    var timer = null;
    qIn.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { api.search(qIn.value.trim()); }, 300); });
    // --- kinds ---
    var kinds = h(doc, "div", { class: "nw-chips nw-kinds", role: "group", "aria-label": t("news.list.kinds", "Что показывать") });
    // --- filters ---
    var filterBtn = h(doc, "button", { type: "button", class: "nw-chip nw-filter-btn", "aria-expanded": "false" });
    var sheet = h(doc, "div", { class: "nw-sheet", hidden: true });
    filterBtn.addEventListener("click", function () { var open = sheet.hidden; sheet.hidden = !open; filterBtn.setAttribute("aria-expanded", open ? "true" : "false"); });
    var storyChip = h(doc, "div", { class: "nw-story-chip-host" });
    var counts = h(doc, "p", { class: "nw-ov-counts", role: "status" });
    var learnSec = h(doc, "section", { class: "nw-group nw-list-learn", "aria-labelledby": "nw-list-learn-h" }, [h(doc, "h2", { id: "nw-list-learn-h" })]);
    var sliceSec = h(doc, "section", { class: "nw-group nw-list-slice", "aria-labelledby": "nw-list-slice-h" }, [h(doc, "h2", { id: "nw-list-slice-h" })]);
    var empty = h(doc, "div", { class: "nw-state nw-list-empty", role: "status", hidden: true });
    var more = h(doc, "button", { type: "button", class: "nw-button nw-more nw-list-more", hidden: true, text: t("news.more", "Показать ещё") });
    more.addEventListener("click", function () { api.more(); });

    root.replaceChildren.apply(root, [ctx.heading, ctx.statusHost || null, nav, form, note, marksNote, h(doc, "div", { class: "nw-list-bar" }, [kinds, filterBtn]), sheet, storyChip, counts, learnSec, sliceSec, empty, more].filter(Boolean));

    function setState(next, replace) { s = next; ctx.replaceUrl(s, replace); }
    // The range on screen: the one chosen, or the 45 days a search looks through (the server says which).
    function rangeText() {
      var r = s.from || s.to ? { from: s.from, to: s.to } : lastData && lastData.range;
      return r && (r.from || r.to) ? (r.from ? dayLabel(r.from, loc) : "…") + " — " + (r.to ? dayLabel(r.to, loc) : "…") : null;
    }

    function paintNav(data) {
      var parts = [];
      var range = rangeText();
      if (range) {
        var searching = !s.from && !s.to;
        var clear = h(doc, "button", { type: "button", class: "nw-link-btn", text: searching ? t("news.list.clearSearch", "× к одному дню без поиска") : t("news.list.clearRange", "× к одному дню") });
        clear.addEventListener("click", function () { ctx.go(Object.assign({}, s, { from: null, to: null, q: searching ? null : s.q, sort: searching && s.sort === "match" ? "fresh" : s.sort })); });
        parts.push(h(doc, "strong", { text: range }), clear);
      } else {
        [["prev", data.prev, t("news.overview.prev", "← раньше")], ["day", null, data.day ? dayLabel(data.day, loc) : ""], ["next", data.next, t("news.overview.next", "позже →")]].forEach(function (x) {
          if (x[0] === "day") {
            var pick = h(doc, "input", { type: "date", class: "nw-day-pick", value: data.day || "", "aria-label": t("news.list.pickDay", "Выбрать день") });
            pick.addEventListener("change", function () { if (pick.value) ctx.go(Object.assign({}, s, { day: pick.value })); });
            parts.push(h(doc, "label", { class: "nw-day-label" }, [h(doc, "strong", { text: x[2] }), pick]));
            return;
          }
          if (!x[1]) { parts.push(h(doc, "span", { class: "nw-ov-day-off", "aria-hidden": "true", text: x[2] })); return; }
          var b = h(doc, "button", { type: "button", class: "nw-link-btn", text: x[2] });
          b.addEventListener("click", function () { ctx.go(Object.assign({}, s, { day: x[1] })); });
          parts.push(b);
        });
      }
      nav.replaceChildren.apply(nav, parts);
    }
    function paintKinds(c) {
      var all = c.learn + c.slice;
      kinds.replaceChildren.apply(kinds, [["learn", t("news.list.kindLearn", "Учебные"), c.learn], ["slice", t("news.list.kindSlice", "В срезе"), c.slice], ["all", t("news.list.kindAll", "Все"), all]].map(function (k) {
        var b = h(doc, "button", { type: "button", class: "nw-chip", "aria-pressed": s.kind === k[0] ? "true" : "false", text: k[1] + " · " + k[2] });
        b.addEventListener("click", function () { if (s.kind !== k[0]) { setState(Object.assign({}, s, { kind: k[0] }), true); load(true); } });
        return b;
      }));
      var n = activeFilters(s);
      filterBtn.textContent = t("news.list.filters", "Фильтры") + (n ? " · " + n : "");
    }
    function select(name, label, options, value) {
      var sel = h(doc, "select", { name: name, "aria-label": label });
      options.forEach(function (o) { var opt = h(doc, "option", { value: o[0], text: o[1] }); if ((value || "") === o[0]) opt.selected = true; sel.appendChild(opt); });
      return h(doc, "label", { class: "nw-sheet-field" }, [h(doc, "span", { text: label }), sel]);
    }
    function paintSheet() {
      var fields = [];
      if (s.view === "overview" && ctx.outlets) fields.push(select("outlet", t("news.list.outlet", "Издание"), [["", t("news.list.allOutlets", "Все издания")]].concat(ctx.outlets.map(function (o) { return [o.id, o.name]; })), s.outlet));
      fields.push(select("group", t("news.list.group", "Рубрика"), [["", t("news.allSections", "Все рубрики")]].concat(GROUPS.map(function (g) { return [g, t("news.overview.group." + g, g)]; })), s.group));
      fields.push(select("ed", t("news.list.edition", "Выпуск"), [["", t("news.overview.editionAll", "Все выпуски")]].concat(EDITIONS.map(function (e) { return [e, t("news.slotShort." + e, e)]; })), s.ed));
      fields.push(select("sort", t("news.list.sortLabel", "Порядок"), SORTS.map(function (o) { return [o, t("news.list.sortBy." + o, o === "fresh" ? "по актуальности" : o === "time" ? "по времени публикации" : "по совпадению")]; }), s.sort));
      var from = h(doc, "input", { type: "date", name: "from", value: s.from || "" }), to = h(doc, "input", { type: "date", name: "to", value: s.to || "" });
      fields.push(h(doc, "div", { class: "nw-sheet-range" }, [h(doc, "label", { class: "nw-sheet-field" }, [h(doc, "span", { text: t("news.from", "С") }), from]), h(doc, "label", { class: "nw-sheet-field" }, [h(doc, "span", { text: t("news.to", "По") }), to])]));
      var starBox = null, tagSel = null;
      if (M) {
        starBox = h(doc, "input", { type: "checkbox", name: "star" }); starBox.checked = !!s.star;
        fields.push(h(doc, "label", { class: "nw-toggle" }, [starBox, " " + t("news.list.starOnly", "★ Только избранное")]));
        tagSel = h(doc, "select", { name: "tag", "aria-label": t("news.list.tag", "Тег") }, [h(doc, "option", { value: "", text: t("news.list.allTags", "Все отметки") })]);
        fields.push(h(doc, "label", { class: "nw-sheet-field" }, [h(doc, "span", { text: t("news.list.tag", "Тег") }), tagSel]));
        Promise.resolve(M.tags()).then(function (list) {
          (list || []).filter(function (x) { return x.tag !== "★"; }).forEach(function (x) {
            var o = h(doc, "option", { value: x.tag, text: x.tag + " · " + x.n }); if (s.tag === x.tag) o.selected = true; tagSel.appendChild(o);
          });
        }).catch(function () {});
      }
      var heavy = null;
      if (ctx.noHeavy) {
        heavy = h(doc, "input", { type: "checkbox", name: "noHeavy" }); heavy.checked = ctx.noHeavy();
        fields.push(h(doc, "label", { class: "nw-toggle" }, [heavy, " " + t("news.noHeavy", "Без тяжёлых тем")]));
      }
      if (ctx.orders && s.tag) {
        var dayNow = s.day || (lastData && lastData.day) || null, ranged = !!(s.from || s.to);
        var from0 = ranged ? s.from || null : dayNow, to0 = ranged ? s.to || null : dayNow;
        var ot = h(doc, "button", { type: "button", class: "nw-button nw-order-tag", text: fill(t("news.list.orderTag", "Отдать dot: #{tag} за {when}"), { tag: s.tag, when: from0 === to0 ? (from0 ? dayLabel(from0, loc) : "") : (from0 ? dayLabel(from0, loc) : "…") + " — " + (to0 ? dayLabel(to0, loc) : "…") }) });
        var otRes = h(doc, "p", { class: "nw-order-tag-result", role: "status" });
        ot.addEventListener("click", function () {
          ot.disabled = true;
          Promise.resolve(ctx.orders.orderTag({ tag: s.tag, from: from0, to: to0 })).then(function (res) {
            res = res || {};
            var reasons = {}; (res.skipped || []).forEach(function (x) { var k = t("news.list.skip." + x.reason, x.reason); reasons[k] = (reasons[k] || 0) + 1; });
            otRes.textContent = fill(t("news.list.orderTagDone", "Заказано: {n}, пропущено: {m}"), { n: (res.created || []).length, m: (res.skipped || []).length })
              + (Object.keys(reasons).length ? " (" + Object.keys(reasons).map(function (k) { return k + " — " + reasons[k]; }).join(", ") + ")" : "");
          }).catch(function (e) { otRes.textContent = e && e.message === "ORDER_TOO_BIG" ? t("news.list.orderTooBig", "Больше 50 статей — сузьте даты") : t("news.manage.failed", "Не получилось. Попробуйте ещё раз."); })
            .then(function () { ot.disabled = false; });
        });
        fields.push(h(doc, "div", { class: "nw-sheet-order" }, [ot, otRes]));
      }
      var apply = h(doc, "button", { type: "button", class: "nw-button", text: t("news.list.apply", "Применить") });
      var reset = h(doc, "button", { type: "button", class: "nw-link-btn", text: t("news.list.reset", "Сбросить") });
      apply.addEventListener("click", function () {
        var v = function (n) { var el = sheet.querySelector('[name="' + n + '"]'); return el && el.value ? el.value : null; };
        if (heavy && ctx.setNoHeavy) ctx.setNoHeavy(heavy.checked);
        ctx.go(Object.assign({}, s, { outlet: s.view === "overview" ? v("outlet") : s.outlet, section: null, group: v("group"), ed: v("ed"), sort: v("sort") || "fresh", from: from.value || null, to: to.value || null, star: starBox ? starBox.checked : s.star, tag: tagSel ? (tagSel.value || null) : s.tag }));
      });
      reset.addEventListener("click", function () { ctx.go({ view: s.view, outlet: s.view === "outlet" ? s.outlet : null, day: s.day, kind: s.kind, sort: "fresh" }); });
      sheet.replaceChildren.apply(sheet, fields.concat([h(doc, "div", { class: "nw-sheet-actions" }, [apply, reset])]));
      if (s.story) {
        var x = h(doc, "button", { type: "button", class: "nw-chip", "aria-pressed": "true", text: t("news.list.storyOnly", "Один сюжет") + " ×" });
        x.addEventListener("click", function () { ctx.go(Object.assign({}, s, { story: null })); });
        storyChip.replaceChildren(x);
      } else storyChip.replaceChildren();
    }
    // The owner's order for dot (W5): «Сделать учебной», then the order's status and dot's reason.
    var ORDER_TEXT = { skipped: "не заказано", open: "заказано, ждёт dot", taken: "dot взял заказ", done: "опубликовано по заказу", failed: "отказ dot", expired: "заказ не выполнен: текст удалён" };
    function orderBox(r) {
      var box = h(doc, "div", { class: "nw-order" });
      function paint() {
        if (r.order) {
          var st = t("news.list.order." + r.order.status, ORDER_TEXT[r.order.status] || r.order.status) + (r.order.reason ? ": " + t("news.list.skip." + r.order.reason, r.order.reason) : "");
          box.replaceChildren(h(doc, "span", { class: "nw-order-status", "data-status": r.order.status, text: st }));
          return;
        }
        if (!(r.full_ok && !r.paywalled && r.body_until)) { box.replaceChildren(); return; }
        var b = h(doc, "button", { type: "button", class: "nw-button nw-button-quiet nw-order-btn", text: t("news.list.orderOne", "Сделать учебной (заказ dot)") });
        b.addEventListener("click", function () {
          b.disabled = true;
          Promise.resolve(ctx.orders.order(r)).then(function (res) {
            if (res && res.created && res.created.length) r.order = { status: "open" };
            else if (res && res.skipped && res.skipped[0]) r.order = { status: "skipped", reason: res.skipped[0].reason };
            paint();
          }).catch(function () { b.disabled = false; });
        });
        box.replaceChildren(b);
      }
      paint();
      return box.childNodes.length ? box : null;
    }
    // ★, tags and «прочитано» under a row (W4).
    function marksBar(r) {
      var bar = h(doc, "div", { class: "nw-row-marks" });
      function paint(tags, focus) {
        var starred = tags.indexOf("★") >= 0;
        var star = h(doc, "button", { type: "button", class: "nw-star", "aria-pressed": starred ? "true" : "false", "aria-label": starred ? t("news.list.unstar", "Убрать из избранного") : t("news.list.star", "В избранное"), text: starred ? "★" : "☆" });
        star.addEventListener("click", function () { M.toggle(r, "★").then(function (x) { paint(x, ".nw-star"); }).catch(function () {}); });
        var parts = [star];
        tags.filter(function (x) { return x !== "★"; }).forEach(function (tag) {
          var chip = h(doc, "button", { type: "button", class: "nw-tag-chip", "aria-label": fill(t("news.list.untag", "Снять тег {tag}"), { tag: tag }), text: "#" + tag + " ×" });
          chip.addEventListener("click", function () { M.toggle(r, tag).then(paint).catch(function () {}); });
          parts.push(chip);
        });
        var add = h(doc, "button", { type: "button", class: "nw-tag-add", "aria-expanded": "false", text: t("news.list.addTag", "# тег") });
        var form = h(doc, "form", { class: "nw-tag-form", hidden: true });
        var input = h(doc, "input", { type: "text", maxlength: "40", "aria-label": t("news.list.tag", "Тег"), placeholder: t("news.list.tagPlaceholder", "например, выборы") });
        form.append(input, h(doc, "button", { type: "submit", class: "nw-link-btn", text: t("news.list.addTagGo", "Добавить") }));
        add.addEventListener("click", function () { form.hidden = !form.hidden; add.setAttribute("aria-expanded", form.hidden ? "false" : "true"); if (!form.hidden) try { input.focus(); } catch (_) {} });
        form.addEventListener("submit", function (e) { e.preventDefault(); var v = String(input.value || "").trim().replace(/^#+/, ""); if (v && tags.indexOf(v) < 0) M.toggle(r, v).then(paint).catch(function () {}); });
        parts.push(add);
        if (M.isRead(r)) parts.push(h(doc, "span", { class: "nw-read-mark", text: t("news.list.read", "прочитано") }));
        parts.push(form);
        bar.replaceChildren.apply(bar, parts);
        if (focus) { var f = bar.querySelector(focus); if (f && f.focus) try { f.focus(); } catch (_) {} }
      }
      paint(M.marksOf(r));
      return bar;
    }
    function rowEl(r) {
      var el = r.card && !(ctx.noHeavy && ctx.noHeavy() && r.card.heavy) ? ctx.renderCard(r.card) : r.card ? null : ctx.renderItem(r);
      if (!el) return null;
      var extra = [];
      if (ctx.orders && r.kind === "slice") { var ob = orderBox(r); if (ob) extra.push(ob); }
      if (M) {
        extra.push(marksBar(r));
        el.addEventListener("click", function (e) { var a = e.target && e.target.closest && e.target.closest('a[href*="/library.html?news="]'); if (a) { r.read = true; Promise.resolve(M.read(r)).catch(function () {}); } });
      }
      if (r.snippet) extra.push(h(doc, "p", { class: "nw-snippet", dir: "auto", text: r.snippet }));
      if (r.story_key && !s.story) {
        var st = h(doc, "button", { type: "button", class: "nw-link-btn nw-story-link", text: t("news.list.story", "весь сюжет") });
        st.addEventListener("click", function () { ctx.go(Object.assign({}, s, { story: r.story_key })); });
        extra.push(st);
      }
      if (!extra.length) return el;
      var box = h(doc, "div", { class: "nw-list-row" }, [el]);
      extra.forEach(function (x) { box.appendChild(x); });
      return box;
    }
    function paintCounts(c) {
      learnSec.querySelector("h2").textContent = fill(t("news.overview.learnSection", "Учебные материалы · {n}"), { n: c.learn });
      sliceSec.querySelector("h2").textContent = fill(t("news.overview.sliceSection", "Только в срезе · {n}"), { n: c.slice });
      learnSec.hidden = !c.learn || s.kind === "slice";
      sliceSec.hidden = !c.slice || s.kind === "learn";
      counts.textContent = fill(t("news.overview.counts", "Учебных {learn} · в срезе {slice}"), c);
      var none = !c.learn && !c.slice;
      empty.hidden = !none; counts.hidden = none;
      if (none) {
        var when = rangeText() || (lastData && lastData.day ? dayLabel(lastData.day, loc) : "");
        empty.textContent = lastData && lastData.building ? t("news.list.building", "Список новостей собирается после обновления сервера — откройте страницу через пару минут.") : s.q ? fill(t("news.list.emptyQuery", "Ничего не найдено за {when} по запросу «{q}»"), { when: when, q: s.q })
          : fill(t("news.list.emptyDay", "За {when} статей нет"), { when: when });
      }
    }
    function load(reset) {
      if (ctrl) ctrl.abort();
      var mine = ctrl = (typeof AbortController === "function" ? new AbortController() : { signal: { aborted: false }, abort: function () { this.signal.aborted = true; } });
      if (reset) cursor = null;
      more.hidden = true;
      var keys = M && !M.signedIn && (s.star || s.tag) ? (function () { var a = s.star ? M.keysWith("★") : null, b = s.tag ? M.keysWith(s.tag) : null; return a && b ? a.filter(function (k) { return b.indexOf(k) >= 0; }) : (a || b); })() : null;
      var p = ctx.getJson(listUrl(s, reset ? null : cursor, keys), { signal: mine.signal }).then(function (data) {
        if (mine !== ctrl || mine.signal.aborted || !ctx.isCurrent()) return;
        if (reset) {
          lastData = data;
          Array.prototype.slice.call(learnSec.children, 1).forEach(function (n) { n.remove(); });
          Array.prototype.slice.call(sliceSec.children, 1).forEach(function (n) { n.remove(); });
          if (!s.from && !s.to && data.day && data.day !== s.day) s = Object.assign({}, s, { day: data.day });
          note.hidden = !data.body_search_from;
          if (data.body_search_from) note.textContent = fill(t("news.list.textFrom", "Поиск по полному тексту — со {day}: на сервере мало места, более старые тексты удалены; заголовки ищутся за 45 дней."), { day: dayLabel(data.body_search_from, loc) });
          paintNav(data); paintKinds(data.counts); paintSheet(); paintCounts(data.counts);
        }
        data.items.forEach(function (r) { var el = rowEl(r); if (el) (r.kind === "learn" ? learnSec : sliceSec).appendChild(el); });
        cursor = data.next_cursor; more.hidden = !cursor;
      }).catch(function (e) {
        if (mine.signal.aborted || (e && e.name === "AbortError") || !ctx.isCurrent()) return;
        empty.hidden = false; empty.textContent = t("news.error", "Не удалось загрузить новости");
      });
      api.ready = p;
      return p;
    }
    api.search = function (q) { if ((q || "") === (s.q || "")) return api.ready; setState(Object.assign({}, s, { q: q || null, sort: q ? s.sort : (s.sort === "match" ? "fresh" : s.sort) }), true); return load(true); };
    api.more = function () { return cursor ? load(false) : api.ready; };
    api.reload = function () { return load(true); };
    // Next page as the reader nears the end (the button stays for keyboards and old browsers).
    if (typeof IntersectionObserver === "function") {
      try { new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; }) && !more.hidden) api.more(); }, { rootMargin: "600px 0px" }).observe(more); } catch (_) {}
    }
    load(true);
    return api;
  }

  return { render: render, listUrl: listUrl, activeFilters: activeFilters };
});
