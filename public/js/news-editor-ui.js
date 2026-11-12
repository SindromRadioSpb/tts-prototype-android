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
      var parts = [who, articlesCard(), uploadCard(function (receipt) { showReceipt(receipt); refreshJournal(); }), receiptHost];
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
  return { renderArticleRow: renderArticleRow, renderReceipt: renderReceipt, TOTALS: TOTALS, REASONS: REASONS, boot: boot };
});
