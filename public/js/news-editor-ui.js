// News editor page (plan Task 8): sign in with an editor key (or the owner session), upload a
// .lpnews.zip, read the receipt, withdraw articles or packs; the owner also manages editor keys.
// A created key is shown once and kept nowhere: not in storage, not in the address.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.NewsEditorUi = api; if (root.document && root.document.getElementById("ne-root")) api.boot(root); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var TOTALS = ["published", "archived", "revised", "duplicate", "flagged", "withdrawn", "rejected"];
  var REASONS = ["SCHEMA_INVALID", "OUTLET_UNKNOWN", "URL_DOMAIN_MISMATCH", "DATE_MISSING", "DATE_IN_FUTURE", "HEBREW_MISSING", "TRANSLATION_MISSING",
    "ROWS_OUT_OF_RANGE", "VERBATIM_OVERLAP", "CHECK_MISSING", "TITLE_COPIES_ORIGINAL", "IMAGE_INVALID", "IMAGE_LICENSE_MISSING", "REVISION_STALE",
    "SHA_MISMATCH", "TOO_LARGE", "NOT_FOUND", "INTERNAL_ERROR", "PACK_INVALID"];

  function h(doc, tag, attrs, children) {
    var e = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === "text") e.textContent = v; else if (k === "class") e.className = v; else e.setAttribute(k, v === true ? "" : String(v));
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? doc.createTextNode(c) : c); });
    return e;
  }
  function reasonText(code, t) { return t("newsEditor.reason." + code, code); }

  // ---- editions (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.10) -------------------
  var SLOTS = ["morning", "midday", "evening", "late", "extra"];
  var SLOT_SHORT = { morning: "Утро", midday: "Обед", evening: "Вечер", late: "Поздний", extra: "Внеочередной" };
  function ilTime(iso) { try { return iso ? new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" }) : "—"; } catch (_) { return "—"; } }
  // Average minutes from cut-off to publication per slot, over the last 7 days of published editions.
  function slotAverages(editions, nowMs) {
    var since = (nowMs || Date.now()) - 7 * 86400000, sums = {}, out = {};
    (editions || []).forEach(function (e) {
      if (!e.published_at || !e.cutoff_at || Date.parse(e.cutoff_at) < since) return;
      var m = (Date.parse(e.published_at) - Date.parse(e.cutoff_at)) / 60000;
      if (!(m >= 0)) return;
      (sums[e.slot] = sums[e.slot] || []).push(m);
    });
    Object.keys(sums).forEach(function (s) { out[s] = Math.round(sums[s].reduce(function (a, b) { return a + b; }, 0) / sums[s].length); });
    return out;
  }
  function renderEditionsTable(doc, editions, opts) {
    opts = opts || {};
    var t = opts.t || function (k, f) { return f; };
    var box = h(doc, "div", { class: "ne-editions" });
    if (!editions.length) { box.appendChild(h(doc, "p", { class: "ne-muted", text: t("newsEditor.editions.empty", "Выпусков ещё не было") })); return box; }
    var STATUS = { archived: "ждёт dot", downloaded: "у dot", published: "опубликован", partial: "опубликован частично", superseded: "заменён следующим", skipped: "пропущен", failed: "ошибка", building: "собирается" };
    editions.forEach(function (e) {
      var done = e.status === "published" || e.status === "partial";
      var verdict = ["skipped", "superseded", "failed", "building"].indexOf(e.status) >= 0 ? "" : e.late ? t("newsEditor.editions.late", "опоздал") : done ? t("newsEditor.editions.onTime", "вовремя") : "";
      var line = h(doc, "div", { class: "ne-pack ne-edition", "data-edition": e.edition_id, "data-status": e.status, "data-late": e.late ? "true" : "false" }, [
        h(doc, "strong", { text: e.day + " · " + t("news.slotShort." + e.slot, SLOT_SHORT[e.slot] || e.slot) }),
        h(doc, "span", { text: t("newsEditor.editions.status." + e.status, STATUS[e.status] || e.status) + (verdict ? " · " + verdict : "") }),
        h(doc, "span", { class: "ne-muted", text: [t("newsEditor.editions.cut", "срез") + " " + ilTime(e.cut_at || e.cutoff_at), t("newsEditor.editions.downloaded", "скачан") + " " + ilTime(e.downloaded_at),
          t("newsEditor.editions.published", "опубликован") + " " + ilTime(e.published_at)].join(" · ") }),
        h(doc, "span", { class: "ne-muted", text: t("newsEditor.editions.counts", "статей {m} · в обзоре {o} · на переделке {r}").replace("{m}", String(e.main_count || 0))
          .replace("{o}", String(e.overview_count || 0)).replace("{r}", String(e.rework_count || 0)) + (e.refused_count ? " · " + t("newsEditor.editions.refused", "отказано или пропущено: {n}").replace("{n}", String(e.refused_count)) : "") })]);
      // The owner's «Посмотреть» reserves nothing; «Скачать для dot» reserves the articles for dot, as dot's own download does.
      if (e.has_file) {
        line.appendChild(h(doc, "a", { class: "ne-button ne-quiet", href: "/api/news/editor/editions/" + encodeURIComponent(e.edition_id) + "/download", text: t("newsEditor.editions.look", "Посмотреть архив") }));
        if (e.status === "archived") line.appendChild(h(doc, "a", { class: "ne-button", href: "/api/news/editor/editions/" + encodeURIComponent(e.edition_id) + "/download?take=1",
          title: t("newsEditor.editions.takeHint", "Закрепит статьи выпуска за dot на 4 часа — если передаёте архив dot вручную"), text: t("newsEditor.editions.take", "Скачать для dot") }));
      }
      box.appendChild(line);
    });
    return box;
  }

  // The owner's orders for dot (findability W5): what was ordered, what dot did, why not.
  var ORDER_STATUS = { open: "ждёт dot", taken: "dot взял", done: "опубликован", failed: "отказ", expired: "текст удалён" };
  function renderOrdersTable(doc, orders, opts) {
    opts = opts || {};
    var t = opts.t || function (k, f) { return f; };
    var box = h(doc, "div", { class: "ne-orders" });
    if (!orders.length) { box.appendChild(h(doc, "p", { class: "ne-muted", text: t("newsEditor.orders.empty", "Заказов нет. Заказать можно в ленте: «Сделать учебной» у статьи или «Отдать dot» для тега.") })); return box; }
    orders.forEach(function (o) {
      box.appendChild(h(doc, "div", { class: "ne-pack ne-order", "data-status": o.status }, [
        h(doc, "strong", { text: t("newsEditor.orders.status." + o.status, ORDER_STATUS[o.status] || o.status) }),
        h(doc, "span", { text: (o.tag ? "#" + o.tag + " · " : "") + o.note_ru }),
        o.reason ? h(doc, "span", { class: "ne-order-reason", text: t("newsEditor.orders.reason", "Причина: {r}").replace("{r}", t("news.list.skip." + o.reason, o.reason)) }) : null,
        h(doc, "span", { class: "ne-muted", text: o.item_key + " · " + ilTime(o.created_at) }),
        o.work_id ? h(doc, "a", { href: "/library.html?news=" + encodeURIComponent(o.work_id) + "&from=news", text: t("newsEditor.orders.open", "Открыть материал") }) : null]));
    });
    return box;
  }

  // receipt: { pack_id, totals, items:[{path, article_id?, status, code?, overlap?, flagged?, warnings?}], warnings }
  function renderReceipt(doc, receipt, opts) {
    opts = opts || {};
    var t = opts.t || function (k, f) { return f; };
    var box = h(doc, "section", { class: "ne-receipt", "aria-labelledby": "ne-receipt-title" }, [h(doc, "h2", { id: "ne-receipt-title", text: t("newsEditor.receiptTitle", "Квитанция пакета") })]);
    box.appendChild(h(doc, "p", { class: "ne-pack-id", text: "pack_id: " + receipt.pack_id }));
    var totals = h(doc, "ul", { class: "ne-totals" });
    TOTALS.forEach(function (k) {
      totals.appendChild(h(doc, "li", { class: "ne-total ne-total-" + k, "data-total": k }, [h(doc, "strong", { text: String((receipt.totals || {})[k] || 0) }), " " + t("newsEditor.total." + k, k)]));
    });
    box.appendChild(totals);
    var problems = (receipt.items || []).filter(function (i) { return i.status === "rejected" || i.flagged; });
    if (problems.length) {
      var table = h(doc, "table", { class: "ne-problems" }, [h(doc, "thead", {}, [h(doc, "tr", {}, [
        h(doc, "th", { scope: "col", text: t("newsEditor.col.article", "Статья") }), h(doc, "th", { scope: "col", text: t("newsEditor.col.result", "Итог") }),
        h(doc, "th", { scope: "col", text: t("newsEditor.col.reason", "Причина") })])])]);
      var body = h(doc, "tbody");
      problems.forEach(function (i) {
        var reason = i.status === "rejected" ? reasonText(i.code || "SCHEMA_INVALID", t)
          : t("newsEditor.flaggedReason", "Совпадение с оригиналом {n}% — опубликовано, проверьте выборочно").replace("{n}", String(Math.round((i.overlap || 0) * 100)));
        body.appendChild(h(doc, "tr", { "data-status": i.status, "data-code": i.code || "" }, [h(doc, "td", { text: i.path }),
          h(doc, "td", { text: i.status === "rejected" ? t("newsEditor.total.rejected", "отклонено") : t("newsEditor.total.flagged", "на проверку") }), h(doc, "td", { text: reason })]));
      });
      table.appendChild(body); box.appendChild(table);
    }
    var warnings = (receipt.warnings || []).concat((receipt.items || []).reduce(function (a, i) { return a.concat((i.warnings || []).map(function (w) { return i.path + ": " + w; })); }, []));
    if (warnings.length) {
      var ul = h(doc, "ul", { class: "ne-warnings", "aria-label": t("newsEditor.warnings", "Предупреждения") });
      warnings.forEach(function (w) { ul.appendChild(h(doc, "li", { text: w })); });
      box.appendChild(ul);
    }
    return box;
  }
  // Two-step button: the first press arms it, a second within 6 s performs the action.
  function confirmButton(doc, label, armedLabel, action) {
    var b = h(doc, "button", { type: "button", class: "ne-button ne-danger", text: label }), timer = null;
    b.addEventListener("click", function () {
      if (b.getAttribute("data-armed") !== "true") {
        b.setAttribute("data-armed", "true"); b.textContent = armedLabel;
        timer = setTimeout(function () { b.removeAttribute("data-armed"); b.textContent = label; }, 6000);
        return;
      }
      clearTimeout(timer); b.disabled = true; Promise.resolve(action()).finally(function () { b.disabled = false; b.removeAttribute("data-armed"); b.textContent = label; });
    });
    return b;
  }

  // One row of the «Статьи» list. view: 'feed' | 'archive' | 'deleted'.
  function renderArticleRow(doc, card, opts) {
    var t = opts.t || function (k, f) { return f; };
    var O = (typeof self !== "undefined" && self.NewsOutlets) || (typeof require === "function" ? require("./news-outlets") : null);
    var o = (O && O.byId(card.outlet_id)) || { name_latin: card.outlet_id, color: "#3d4a5c" };
    var tag = h(doc, "span", { class: "nw-outlet-tag", text: o.name_latin }); tag.style.setProperty("--nw-outlet", o.color);
    var when = "";
    try { when = new Date(card.published_at).toLocaleString(); } catch (_) {}
    var row = h(doc, "div", { class: "ne-article-row", "data-article": card.article_id }, [
      h(doc, "div", { class: "ne-article-text" }, [h(doc, "p", { class: "ne-muted" }, [tag, " · " + when]),
        h(doc, "p", { class: "ne-article-he", lang: "he", dir: "rtl", text: card.title_he }),
        h(doc, "p", { class: "ne-article-ru", dir: "auto", text: card.title_ru })])]);
    var actions = h(doc, "div", { class: "ne-row-actions" });
    function add(action, label, danger) {
      var run = function () { return opts.onAction(action, card, row); };
      actions.appendChild(danger ? confirmButton(doc, label, t("newsEditor.confirmDelete", "Удалить? Нажмите ещё раз"), run)
        : (function () { var b = h(doc, "button", { type: "button", class: "ne-button ne-quiet", text: label }); b.addEventListener("click", run); return b; })());
    }
    if (opts.view === "deleted") {
      var date = ""; try { date = new Date(card.purge_at).toLocaleDateString(); } catch (_) {}
      row.firstChild.appendChild(h(doc, "p", { class: "ne-muted", text: t("newsEditor.purgeAt", "Удалится навсегда {date}").replace("{date}", date) }));
      add("restore", t("newsEditor.action.restore", "Восстановить"));
    } else {
      if (opts.view === "feed") add("archive", t("newsEditor.action.archive", "В архив"));
      else if (card.can_return_to_feed) add("unarchive", t("newsEditor.action.unarchive", "Вернуть в ленту"));
      add("delete", t("newsEditor.action.delete", "Удалить"), true);
    }
    row.appendChild(actions);
    return row;
  }

  function boot(win) {
    var doc = win.document, root = doc.getElementById("ne-root"), live = doc.getElementById("ne-status");
    var t = function (k, f) { try { var v = typeof win.t === "function" ? win.t(k) : ""; return v && v !== k ? v : f; } catch (_) { return f; } };
    var session = null; // { kind, label, csrf } — memory only
    function say(text) { if (live) live.textContent = text; }
    async function api(method, url, body, type) {
      var headers = {};
      if (session && session.csrf && method !== "GET") headers["x-lp-csrf"] = session.csrf;
      if (body !== undefined && type) headers["content-type"] = type;
      var r = await win.fetch(url, { method: method, headers: headers, body: body, credentials: "same-origin" });
      var data = null; try { data = await r.json(); } catch (_) {}
      if (!r.ok || !data || data.ok === false) { var e = new Error((data && data.error) || ("HTTP_" + r.status)); e.status = r.status; e.detail = data && data.detail; throw e; }
      return data;
    }
    var json = function (v) { return JSON.stringify(v || {}); };
    function errorText(e) { return e && e.message === "PACK_INVALID" ? reasonText("PACK_INVALID", t) + (e.detail ? " (" + e.detail + ")" : "") : t("newsEditor.error", "Ошибка") + ": " + (e && e.message || e); }

    function renderLogin() {
      var input = h(doc, "input", { type: "password", id: "ne-key", autocomplete: "off", spellcheck: "false", required: true });
      var form = h(doc, "form", { class: "ne-card ne-login" }, [h(doc, "h2", { text: t("newsEditor.loginTitle", "Вход редактора новостей") }),
        h(doc, "p", { class: "ne-muted", text: t("newsEditor.loginHint", "Введите ключ редактора, который выдал владелец. Ключ не сохраняется в браузере.") }),
        h(doc, "label", { for: "ne-key", text: t("newsEditor.key", "Ключ редактора") }), input,
        h(doc, "button", { type: "submit", class: "ne-button", text: t("newsEditor.login", "Войти") })]);
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        try { var r = await api("POST", "/api/news/editor/login", json({ key: input.value.trim() }), "application/json"); input.value = ""; session = { kind: "editor", label: r.label, csrf: r.csrf }; render(); }
        catch (err) { say(err.status === 401 ? t("newsEditor.badKey", "Ключ не подошёл или отозван") : errorText(err)); }
      });
      root.replaceChildren(form);
      input.focus();
    }

    function uploadCard(onReceipt) {
      var file = h(doc, "input", { type: "file", id: "ne-file", accept: ".zip,.lpnews.zip,application/zip" });
      var progress = h(doc, "progress", { max: "100", value: "0", hidden: true, "aria-label": t("newsEditor.progress", "Загрузка пакета") });
      var drop = h(doc, "label", { class: "ne-drop", for: "ne-file" }, [h(doc, "strong", { text: t("newsEditor.drop", "Перетащите .lpnews.zip сюда") }),
        h(doc, "span", { text: t("newsEditor.or", "или нажмите, чтобы выбрать файл") })]);
      function send(f) {
        if (!f) return;
        progress.hidden = false; progress.value = 0; say(t("newsEditor.uploading", "Загрузка…"));
        var xhr = new win.XMLHttpRequest();
        xhr.open("POST", "/api/news/editor/packs");
        xhr.setRequestHeader("content-type", "application/zip");
        if (session && session.csrf) xhr.setRequestHeader("x-lp-csrf", session.csrf);
        xhr.upload.onprogress = function (e) { if (e.lengthComputable) progress.value = Math.round(e.loaded / e.total * 100); };
        xhr.onload = function () {
          progress.hidden = true; file.value = "";
          var data = null; try { data = JSON.parse(xhr.responseText); } catch (_) {}
          if (xhr.status === 200 && data && data.receipt) { say(t("newsEditor.done", "Пакет принят")); onReceipt(data.receipt); }
          else if (xhr.status === 429) say(t("newsEditor.rateLimit", "Слишком много пакетов за час — попробуйте позже"));
          else { var e = new Error(data && data.error || ("HTTP_" + xhr.status)); e.detail = data && data.detail; say(errorText(e)); }
        };
        xhr.onerror = function () { progress.hidden = true; say(t("newsEditor.network", "Нет связи с сервером")); };
        xhr.send(f);
      }
      file.addEventListener("change", function () { send(file.files && file.files[0]); });
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.setAttribute("data-over", "true"); });
      drop.addEventListener("dragleave", function () { drop.removeAttribute("data-over"); });
      drop.addEventListener("drop", function (e) { e.preventDefault(); drop.removeAttribute("data-over"); send(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
      return h(doc, "section", { class: "ne-card" }, [h(doc, "h2", { text: t("newsEditor.uploadTitle", "Загрузить пакет") }), drop, file, progress]);
    }

    async function journalCard() {
      var box = h(doc, "section", { class: "ne-card", "aria-labelledby": "ne-journal-title" }, [h(doc, "h2", { id: "ne-journal-title", text: t("newsEditor.journal", "Журнал пакетов") })]);
      try {
        var j = await api("GET", "/api/news/editor/journal?limit=20");
        if (!j.packs.length) box.appendChild(h(doc, "p", { class: "ne-muted", text: t("newsEditor.journalEmpty", "Пакетов ещё не было") }));
        j.packs.forEach(function (p) {
          var line = h(doc, "div", { class: "ne-pack" }, [h(doc, "span", { text: new Date(p.uploaded_at).toLocaleString() + " · " + (p.producer && p.producer.name || "") }),
            h(doc, "span", { class: "ne-muted", text: TOTALS.map(function (k) { return t("newsEditor.total." + k, k) + " " + ((p.totals || {})[k] || 0); }).join(" · ") })]);
          var show = h(doc, "button", { type: "button", class: "ne-button ne-quiet", text: t("newsEditor.showReceipt", "Квитанция") });
          show.addEventListener("click", function () { showReceipt(p.receipt); });
          line.appendChild(show);
          line.appendChild(confirmButton(doc, t("newsEditor.withdrawPack", "Удалить пакет"), t("newsEditor.confirm", "Точно? Нажмите ещё раз"), async function () {
            try { var r = await api("POST", "/api/news/editor/packs/" + encodeURIComponent(p.pack_id) + "/withdraw", json({ reason: "editor" }), "application/json");
              say(t("newsEditor.withdrawnCount", "Удалено статей: {n}").replace("{n}", String(r.count))); } catch (e) { say(errorText(e)); }
          }));
          box.appendChild(line);
        });
      } catch (e) { box.appendChild(h(doc, "p", { text: errorText(e) })); }
      return box;
    }
    var receiptHost = null;
    function showReceipt(receipt) {
      var el = renderReceipt(doc, receipt, { t: t });
      receiptHost.replaceChildren(el);
      el.setAttribute("tabindex", "-1"); el.focus();
    }
    // «Статьи»: what is in the feed, in the archive and in the 30-day trash — by title, not by file.
    function articlesCard() {
      var state = { view: "feed", outlet: "", q: "", cursor: null };
      var box = h(doc, "section", { class: "ne-card", "aria-labelledby": "ne-articles-title" }, [h(doc, "h2", { id: "ne-articles-title", text: t("newsEditor.articles", "Статьи") })]);
      var tabs = h(doc, "div", { class: "nw-tabs", role: "group", "aria-label": t("newsEditor.articles", "Статьи") });
      [["feed", t("newsEditor.view.feed", "В ленте")], ["archive", t("newsEditor.view.archive", "В архиве")], ["deleted", t("newsEditor.view.deleted", "Удалённые")]].forEach(function (v) {
        var b = h(doc, "button", { type: "button", class: "nw-tab", "data-view": v[0], "aria-pressed": v[0] === state.view ? "true" : "false", text: v[1] });
        b.addEventListener("click", function () { state.view = v[0]; tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); reload(); });
        tabs.appendChild(b);
      });
      var outlet = h(doc, "select", { "aria-label": t("newsEditor.outlet", "Издание") }, [h(doc, "option", { value: "", text: t("newsEditor.allOutlets", "Все издания") })]);
      (win.NewsOutlets ? win.NewsOutlets.OUTLETS : []).forEach(function (o) { outlet.appendChild(h(doc, "option", { value: o.id, text: o.name_latin })); });
      outlet.addEventListener("change", function () { state.outlet = outlet.value; reload(); });
      var search = h(doc, "input", { type: "search", placeholder: t("newsEditor.search", "Поиск по заголовку"), "aria-label": t("newsEditor.search", "Поиск по заголовку") });
      var timer = null;
      search.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { state.q = search.value.trim(); reload(); }, 300); });
      var list = h(doc, "div", { class: "ne-articles", "aria-live": "polite" });
      var more = h(doc, "button", { type: "button", class: "ne-button ne-quiet", text: t("newsEditor.more", "Показать ещё"), hidden: true });
      more.addEventListener("click", function () { page(); });
      box.append(tabs, h(doc, "div", { class: "ne-inline ne-filters" }, [outlet, search]), list, more);
      var MESSAGES = { archive: t("newsEditor.doneAction.archive", "Статья перенесена в архив"), unarchive: t("newsEditor.doneAction.unarchive", "Статья возвращена в ленту"),
        delete: t("newsEditor.doneAction.delete", "Статья удалена — она в «Удалённых» 30 дней"), restore: t("newsEditor.doneAction.restore", "Статья восстановлена") };
      async function onAction(action, card, row) {
        try { await api("POST", "/api/news/editor/articles/" + encodeURIComponent(card.article_id) + "/" + action, json({}), "application/json"); row.remove(); say(MESSAGES[action]); }
        catch (e) { say(e.message === "NEWS_TOO_OLD_FOR_FEED" ? t("newsEditor.tooOld", "Статье больше трёх дней — в ленту её вернуть нельзя") : errorText(e)); }
      }
      async function page() {
        var q = new URLSearchParams({ view: state.view, limit: "30" });
        if (state.outlet) q.set("outlet", state.outlet);
        if (state.q) q.set("q", state.q);
        if (state.cursor) q.set("cursor", state.cursor);
        try {
          var data = await api("GET", "/api/news/editor/articles?" + q.toString());
          data.items.forEach(function (card) { list.appendChild(renderArticleRow(doc, card, { t: t, view: state.view, onAction: onAction })); });
          if (!list.children.length) list.appendChild(h(doc, "p", { class: "ne-muted", text: t("newsEditor.empty", "Здесь пока пусто") }));
          state.cursor = data.next_cursor; more.hidden = !state.cursor;
        } catch (e) { list.appendChild(h(doc, "p", { text: errorText(e) })); }
      }
      function reload() { state.cursor = null; list.replaceChildren(); page(); }
      reload();
      return box;
    }
    async function editorsCard() {
      var box = h(doc, "section", { class: "ne-card", "aria-labelledby": "ne-editors-title" }, [h(doc, "h2", { id: "ne-editors-title", text: t("newsEditor.editors", "Редакторы") }),
        h(doc, "p", { class: "ne-muted", text: t("newsEditor.editorsHint", "Ключ редактора даёт доступ только к загрузке и снятию новостей. Он показывается один раз.") })]);
      var label = h(doc, "input", { type: "text", id: "ne-label", value: "dot", maxlength: "80" });
      var created = h(doc, "div", { class: "ne-created", "aria-live": "polite" });
      var form = h(doc, "form", { class: "ne-inline" }, [h(doc, "label", { for: "ne-label", text: t("newsEditor.label", "Имя") }), label,
        h(doc, "button", { type: "submit", class: "ne-button", text: t("newsEditor.createKey", "Создать ключ") })]);
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        try {
          var r = await api("POST", "/api/news/editor/editors", json({ label: label.value }), "application/json");
          var code = h(doc, "code", { class: "ne-key", text: r.key });
          var copy = h(doc, "button", { type: "button", class: "ne-button ne-quiet", text: t("newsEditor.copy", "Скопировать") });
          copy.addEventListener("click", function () { try { win.navigator.clipboard.writeText(r.key).then(function () { say(t("newsEditor.copied", "Ключ скопирован")); }); } catch (_) {} });
          created.replaceChildren(h(doc, "p", { text: t("newsEditor.keyOnce", "Сохраните ключ сейчас — больше он не покажется:") }), code, copy);
          r = null; await refreshList();
        } catch (err) { say(errorText(err)); }
      });
      var list = h(doc, "ul", { class: "ne-editors" });
      async function refreshList() {
        var data = await api("GET", "/api/news/editor/editors");
        list.replaceChildren();
        data.editors.forEach(function (ed) {
          var li = h(doc, "li", {}, [h(doc, "span", { text: ed.label + " · " + (ed.status === "ACTIVE" ? t("newsEditor.active", "действует") : t("newsEditor.revoked", "отозван")) })]);
          if (ed.status === "ACTIVE") li.appendChild(confirmButton(doc, t("newsEditor.revoke", "Отозвать"), t("newsEditor.confirm", "Точно? Нажмите ещё раз"), async function () {
            try { await api("POST", "/api/news/editor/editors/" + encodeURIComponent(ed.editor_id) + "/revoke", json({}), "application/json"); await refreshList(); say(t("newsEditor.revokedDone", "Ключ отозван")); }
            catch (e) { say(errorText(e)); }
          }));
          list.appendChild(li);
        });
      }
      box.append(form, created, list);
      try { await refreshList(); } catch (e) { box.appendChild(h(doc, "p", { text: errorText(e) })); }
      return box;
    }

    // «Статьи для dot»: the server's daily harvest archives (§16) — download and pass to dot.
    function harvestCard() {
      var box = h(doc, "section", { class: "ne-card", "aria-labelledby": "ne-harvest-title" }, [h(doc, "h2", { id: "ne-harvest-title", text: t("newsEditor.harvest.title", "Статьи для dot") }),
        h(doc, "p", { class: "ne-muted", text: t("newsEditor.harvest.hint2", "Сервер каждый час собирает все новые статьи изданий. В 6:00 по Израилю он делает архив: главные события дня с полным текстом и фото и «Обзор дня» со всеми статьями. Скачайте архив и передайте dot: он переведёт и соберёт пакет.") })]);
      var run = h(doc, "button", { type: "button", class: "ne-button", text: t("newsEditor.harvest.run", "Собрать сейчас") });
      var list = h(doc, "div", { class: "ne-harvests", "aria-live": "polite" });
      var pendingLine = h(doc, "p", { class: "ne-muted ne-harvest-pending" });
      var timer = null;
      run.addEventListener("click", async function () {
        run.disabled = true;
        try { await api("POST", "/api/news/editor/harvests/run", json({}), "application/json"); say(t("newsEditor.harvest.started", "Сбор начат — это займёт несколько минут")); }
        catch (e) { say(e.message === "HARVEST_RUNNING" ? t("newsEditor.harvest.running", "Сбор уже идёт") : errorText(e)); }
        refresh();
      });
      function outletsLine(outlets) {
        return Object.keys(outlets || {}).map(function (id) {
          var o = outlets[id] || {}, bad = (o.errors || []).some(function (e) { return /BOT_CHALLENGE|BLOCKED/.test(e); });
          return id + " " + (bad ? t("newsEditor.harvest.closed", "закрыт для сервера") : String(o.taken || 0));
        }).join(" · ");
      }
      function sizeText(bytes) { return bytes > 1048576 ? (Math.round(bytes / 104857.6) / 10) + " МБ" : Math.max(1, Math.round(bytes / 1024)) + " КБ"; }
      async function refresh() {
        clearTimeout(timer);
        try {
          var data = await api("GET", "/api/news/editor/harvests?limit=10");
          run.disabled = !!data.running;
          list.replaceChildren();
          if (data.pending) pendingLine.textContent = t("newsEditor.harvest.pending", "К следующему архиву накоплено статей: {n}").replace("{n}", String(data.pending.items))
            + (Object.keys(data.pending.outlets || {}).length ? " (" + Object.keys(data.pending.outlets).map(function (k) { return k + " " + data.pending.outlets[k]; }).join(", ") + ")" : "");
          if (!data.runs.length) list.appendChild(h(doc, "p", { class: "ne-muted", text: t("newsEditor.harvest.empty", "Архивов ещё не было — первый появится завтра в 6:00, или нажмите «Собрать сейчас»") }));
          data.runs.forEach(function (r) {
            var when = ""; try { when = new Date(r.started_at).toLocaleString(); } catch (_) {}
            var status = r.status === "running" ? t("newsEditor.harvest.statusRunning", "собирается…") : r.status === "failed" ? t("newsEditor.harvest.statusFailed", "ошибка") + (r.error ? " (" + r.error + ")" : "")
              : t("newsEditor.harvest.counts", "статей {a}, фото {i}").replace("{a}", String(r.articles)).replace("{i}", String(r.images))
                + (r.overview_items ? " · " + t("newsEditor.harvest.overview", "в обзоре {n} ({s} сюжетов)").replace("{n}", String(r.overview_items)).replace("{s}", String(r.stories)) : "");
            var line = h(doc, "div", { class: "ne-pack ne-harvest", "data-status": r.status }, [h(doc, "span", { text: when + " · " + status }),
              h(doc, "span", { class: "ne-muted", text: outletsLine(r.outlets) })]);
            if (r.has_file) line.appendChild(h(doc, "a", { class: "ne-button", href: "/api/news/editor/harvests/" + encodeURIComponent(r.run_id) + "/download", download: r.file_name,
              text: t("newsEditor.harvest.download", "Скачать архив") + " · " + sizeText(r.bytes) }));
            list.appendChild(line);
          });
          if (data.running) timer = setTimeout(refresh, 10000);
        } catch (e) { list.replaceChildren(h(doc, "p", { text: errorText(e) })); }
      }
      box.append(h(doc, "div", { class: "ne-inline" }, [run]), pendingLine, list);
      refresh();
      return box;
    }

    function ordersCard() {
      var box = h(doc, "section", { class: "ne-card", "aria-labelledby": "ne-orders-title" }, [h(doc, "h2", { id: "ne-orders-title", text: t("newsEditor.orders.title", "Заказы для dot") })]);
      var host = h(doc, "div", { "aria-live": "polite" });
      box.appendChild(host);
      api("GET", "/api/news/orders").then(function (data) { host.replaceChildren(renderOrdersTable(doc, data.orders || [], { t: t })); }).catch(function (e) { host.replaceChildren(h(doc, "p", { text: errorText(e) })); });
      return box;
    }
    // «Выпуски»: the day's four editions — cut-off, archive, dot, publication — and the schedule.
    function editionsCard() {
      var box = h(doc, "section", { class: "ne-card", "aria-labelledby": "ne-editions-title" }, [h(doc, "h2", { id: "ne-editions-title", text: t("newsEditor.editions.title", "Выпуски") }),
        h(doc, "p", { class: "ne-muted", text: t("newsEditor.editions.hint", "Четыре выпуска в день: срез — архив для dot — публикация. Время — по Израилю.") })]);
      var avgLine = h(doc, "p", { class: "ne-muted ne-editions-avg" }), host = h(doc, "div", { "aria-live": "polite" }), formHost = h(doc, "div");
      box.append(avgLine, host, formHost);
      (async function () {
        try {
          var data = await api("GET", "/api/news/editor/editions?limit=28");
          host.replaceChildren(renderEditionsTable(doc, data.editions, { t: t }));
          var avg = slotAverages(data.editions), keys = SLOTS.filter(function (s) { return avg[s] != null; });
          avgLine.textContent = keys.length ? t("newsEditor.editions.average", "От среза до публикации за 7 дней: {list}").replace("{list}", keys.map(function (s) {
            return t("news.slotShort." + s, SLOT_SHORT[s]) + " " + t("newsEditor.editions.minutes", "{n} мин").replace("{n}", String(avg[s])); }).join(", ")) : "";
        } catch (e) { host.replaceChildren(h(doc, "p", { text: errorText(e) })); }
        try {
          var sch = (await api("GET", "/api/news/editor/schedule")).schedule, owner = session && session.kind === "owner";
          var form = h(doc, "form", { class: "ne-schedule" }, [h(doc, "h3", { text: t("newsEditor.editions.schedule", "Расписание") })]);
          var inputs = {};
          ["morning", "midday", "evening", "late"].forEach(function (slot) {
            var s = sch.slots[slot], row = h(doc, "div", { class: "ne-inline" }, [h(doc, "span", { text: t("news.slotShort." + slot, SLOT_SHORT[slot]) })]);
            inputs[slot] = {};
            [["cutoff", "time", t("newsEditor.editions.cutoff", "Срез")], ["ready", "time", t("newsEditor.editions.ready", "Готов к")], ["main", "number", t("newsEditor.editions.main", "Статей")]].forEach(function (f) {
              var id = "ne-s-" + slot + "-" + f[0], input = h(doc, "input", { id: id, type: f[1], value: String(s[f[0]]), disabled: !owner, min: f[1] === "number" ? "1" : null, max: f[1] === "number" ? "40" : null });
              inputs[slot][f[0]] = input;
              row.append(h(doc, "label", { for: id, text: f[2] }), input);
            });
            form.appendChild(row);
          });
          // dot's own articles per edition (owner 2026-11-16: up to 50).
          var exId = "ne-s-extras", exIn = h(doc, "input", { id: exId, type: "number", min: "0", max: "50", value: String(sch.extras), disabled: !owner });
          form.appendChild(h(doc, "div", { class: "ne-inline" }, [h(doc, "label", { for: exId, text: t("newsEditor.editions.extras", "Своих статей dot за выпуск (до 50)") }), exIn]));
          if (owner) {
            form.appendChild(h(doc, "button", { type: "submit", class: "ne-button", text: t("newsEditor.editions.save", "Сохранить") }));
            form.addEventListener("submit", async function (ev) {
              ev.preventDefault();
              var slots = {};
              Object.keys(inputs).forEach(function (slot) { slots[slot] = { cutoff: inputs[slot].cutoff.value, ready: inputs[slot].ready.value, main: Number(inputs[slot].main.value) }; });
              try { await api("PUT", "/api/news/editor/schedule", json({ schedule: Object.assign({}, sch, { slots: slots, extras: Number(exIn.value) }) }), "application/json"); say(t("newsEditor.editions.saved", "Расписание сохранено")); }
              catch (e) { say(e.message === "SCHEDULE_INVALID" ? t("newsEditor.editions.invalid", "Проверьте время: срезы по порядку, «готов к» позже среза") : errorText(e)); }
            });
          } else form.appendChild(h(doc, "p", { class: "ne-muted", text: t("newsEditor.editions.ownerOnly", "Менять расписание может только владелец") }));
          formHost.replaceChildren(form);
        } catch (_) { /* the schedule is optional on this card */ }
      })();
      return box;
    }

    async function render() {
      root.setAttribute("aria-busy", "true");
      if (!session) {
        try { var me = await api("GET", "/api/news/editor/me"); session = { kind: me.kind, label: me.label, csrf: me.csrf }; }
        catch (e) { root.removeAttribute("aria-busy"); if (e.status === 401) return renderLogin(); root.replaceChildren(h(doc, "p", { text: errorText(e) })); return; }
      }
      var who = h(doc, "p", { class: "ne-who" }, [session.kind === "owner" ? t("newsEditor.asOwner", "Вы вошли как владелец") : t("newsEditor.asEditor", "Редактор: {label}").replace("{label}", session.label || "")]);
      if (session.kind === "editor") {
        var out = h(doc, "button", { type: "button", class: "ne-button ne-quiet", text: t("newsEditor.logout", "Выйти") });
        out.addEventListener("click", async function () { try { await api("POST", "/api/news/editor/logout", json({}), "application/json"); } catch (_) {} session = null; renderLogin(); });
        who.appendChild(out);
      }
      receiptHost = h(doc, "div", { class: "ne-receipt-host" });
      var interestsHost = h(doc, "div"), storageHost = h(doc, "div");
      // «Место» (spec §5.11): owner only; the reminder on the News page links here (#storage).
      if (session.kind === "owner" && win.NewsOffloadUi) {
        var paintStorage = function () { api("GET", "/api/news/editor/storage").then(function (st) {
          var card = win.NewsOffloadUi.renderStorageCard(doc, st, { t: t, win: win, csrf: session.csrf, onDone: paintStorage });
          if (st.low) card.insertBefore(h(doc, "p", { class: "ne-storage-low", text: t("news.offload.banner", "Место на сервере заканчивается. Можно выгрузить на этот компьютер {days} дн. архива (≈{size}).")
            .replace("{days}", String(st.suggest.days.length)).replace("{size}", win.NewsOffloadUi.sizeText(st.suggest.bytes)) }), card.children[1] || null);
          storageHost.replaceChildren(card);
          if ((win.location || {}).hash === "#storage" && card.scrollIntoView) card.scrollIntoView();
        }).catch(function () {}); };
        paintStorage();
      }
      renderInterestsCard(doc, { t: t, api: api, say: say, json: json, canSave: session.kind === "owner" }).then(function (b) { interestsHost.replaceChildren(b); }).catch(function () {});
      var parts = [who, ordersCard(), editionsCard(), storageHost, interestsHost, harvestCard(), articlesCard(), uploadCard(function (receipt) { showReceipt(receipt); refreshJournal(); }), receiptHost];
      var journalHost = h(doc, "div");
      parts.push(journalHost);
      async function refreshJournal() { journalHost.replaceChildren(await journalCard()); }
      if (session.kind === "owner") parts.push(await editorsCard());
      root.replaceChildren.apply(root, parts);
      await refreshJournal();
      root.removeAttribute("aria-busy");
    }
    doc.addEventListener("i18n:changed", function () { render(); });
    render();
  }
  // «Мои интересы в новостях» (spec §5.7): the owner writes, dot reads it before choosing its own articles.
  async function renderInterestsCard(doc, opts) {
    var t = opts.t || function (k, f) { return f; };
    var box = h(doc, "section", { class: "ne-card", "aria-labelledby": "ne-interests-title" }, [h(doc, "h2", { id: "ne-interests-title", text: t("newsEditor.interests.title", "Мои интересы в новостях") }),
      h(doc, "p", { class: "ne-muted", text: t("newsEditor.interests.hint", "dot читает этот текст перед каждым выпуском и по нему выбирает свои статьи (до 50 за выпуск). Например: больше экономики и технологий, меньше криминала, спорт только крупное.") })]);
    var ta = h(doc, "textarea", { id: "ne-interests", rows: "5", maxlength: "4000", disabled: !opts.canSave, "aria-labelledby": "ne-interests-title" });
    var count = h(doc, "p", { class: "ne-muted ne-interests-count" });
    function sync() { count.textContent = t("newsEditor.interests.count", "{n} из 4000").replace("{n}", String(ta.value.length)); }
    ta.addEventListener && ta.addEventListener("input", sync);
    box.append(ta, count);
    try { var cur = await opts.api("GET", "/api/news/editor/interests"); ta.value = cur.text || ""; } catch (_) {}
    sync();
    box.__save = async function () {
      if (ta.value.length > 4000) { opts.say(t("newsEditor.interests.tooLong", "Не больше 4000 знаков")); return; }
      try { await opts.api("PUT", "/api/news/editor/interests", opts.json({ text: ta.value }), "application/json"); opts.say(t("newsEditor.interests.saved", "Интересы сохранены")); }
      catch (e) { opts.say(e && e.message === "INTERESTS_TOO_LONG" ? t("newsEditor.interests.tooLong", "Не больше 4000 знаков") : String(e && e.message || e)); }
    };
    if (opts.canSave) {
      var save = h(doc, "button", { type: "button", class: "ne-button", text: t("newsEditor.interests.save", "Сохранить") });
      save.addEventListener("click", function () { box.__save(); });
      box.appendChild(save);
    } else box.appendChild(h(doc, "p", { class: "ne-muted", text: t("newsEditor.interests.ownerOnly", "Менять интересы может только владелец") }));
    return box;
  }
  return { renderOrdersTable: renderOrdersTable, renderInterestsCard: renderInterestsCard, slotAverages: slotAverages, renderEditionsTable: renderEditionsTable, renderArticleRow: renderArticleRow, renderReceipt: renderReceipt, TOTALS: TOTALS, REASONS: REASONS, boot: boot };
});
