// Offloading archived news days to the owner's PC and bringing them back
// (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.11). Runs in the owner's browser:
// a folder chosen with showDirectoryPicker (Chrome/Edge on a computer), one file per day; each file is
// written, read back from disk and checked by sha256 before the server is told to forget the day.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NewsOffloadUi = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var INDEX = "offload-index.json", README = "ПРОЧТИ.txt";
  var README_TEXT = "Архив новостей LinguistPro, выгруженный с сервера, чтобы освободить место.\n" +
    "Здесь по одному файлу на день (news-<день>.lpnews-archive.zip) и список offload-index.json.\n" +
    "Не переименовывайте и не распаковывайте файлы.\n\n" +
    "Как вернуть на сервер: откройте «Редактор новостей» → карточка «Место» → «Вернуть выгруженное на сервер» → выберите эту папку.\n" +
    "Запасной путь (для больших объёмов): node scripts/news/offload.js --restore <эта папка> — из репозитория LinguistPro, ключ владельца в переменной окружения.\n";

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  async function readJson(dir, name) { try { var f = await (await dir.getFileHandle(name)).getFile(); return JSON.parse(await f.text()); } catch (_) { return null; } }
  async function writeFile(dir, name, data) { var h = await dir.getFileHandle(name, { create: true }); var w = await h.createWritable(); await w.write(data); await w.close(); }
  function sizeText(bytes) { return bytes >= 1e9 ? (Math.round(bytes / 1e8) / 10).toString().replace(".", ",") + " ГБ" : Math.max(1, Math.round(bytes / 1e6)) + " МБ"; }

  // → { done: [day], failed: [{ day, code }] }. A failed day is left on the server and can be tried again.
  async function run(o) {
    var dir = await o.pickDir(), cr = o.crypto || (typeof crypto !== "undefined" ? crypto : null), progress = o.onProgress || function () {};
    var nowIso = o.now || function () { return new Date().toISOString(); };
    var index = (await readJson(dir, INDEX)) || { schema: "linguistpro-news-offload-index", schema_version: 1, days: [] };
    await writeFile(dir, README, README_TEXT);
    var done = [], failed = [];
    for (var i = 0; i < o.days.length; i++) {
      var day = o.days[i], name = null;
      try {
        progress({ day: day, step: "download", i: i, n: o.days.length });
        var r = await o.fetchImpl("/api/news/editor/offload/" + day, { credentials: "same-origin", cache: "no-store" });
        if (!r.ok) { var j = null; try { j = await r.json(); } catch (_) {} failed.push({ day: day, code: (j && j.error) || "HTTP_" + r.status }); continue; }
        var want = r.headers.get("x-pack-sha256"), buf = await r.arrayBuffer();
        // Never replace a file: the name carries the archive's own hash.
        name = "news-" + day + "-" + String(want || "nohash").slice(0, 12) + ".lpnews-archive.zip";
        await writeFile(dir, name, buf);
        progress({ day: day, step: "verify", i: i, n: o.days.length });
        var back = await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer();
        var got = hex(await cr.subtle.digest("SHA-256", back));
        if (!want || got !== want) { failed.push({ day: day, code: "LOCAL_SHA_MISMATCH" }); continue; }
        // In the index BEFORE the server forgets the day: a closed tab cannot lose a released day.
        index.days = index.days.filter(function (d) { return d.file !== name; }).concat([{ day: day, file: name, sha256: got, bytes: back.byteLength, state: "pending", offloaded_at: nowIso() }]);
        index.days.sort(function (a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : 0; });
        await writeFile(dir, INDEX, JSON.stringify(index, null, 1));
        var rel = await o.fetchImpl("/api/news/editor/offload/" + day + "/release", { method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json", "x-lp-csrf": o.csrf || "" }, body: JSON.stringify({ sha256: got }) });
        if (!rel.ok) { var k = null; try { k = await rel.json(); } catch (_) {} failed.push({ day: day, code: (k && k.error) || "HTTP_" + rel.status }); continue; }
        index.days.forEach(function (d) { if (d.file === name) d.state = "released"; });
        await writeFile(dir, INDEX, JSON.stringify(index, null, 1));
        done.push(day);
        progress({ day: day, step: "released", i: i, n: o.days.length });
      } catch (e) { failed.push({ day: day, code: (e && e.name) || "ERROR" }); }
    }
    return { done: done, failed: failed };
  }

  async function restore(o) {
    var dir = await o.pickDir(), index = await readJson(dir, INDEX), done = [], already = [], failed = [];
    if (!index || !Array.isArray(index.days)) return { done: done, already: already, failed: [{ day: null, code: "INDEX_MISSING" }] };
    for (var i = 0; i < index.days.length; i++) {
      var d = index.days[i];
      try {
        var buf = await (await (await dir.getFileHandle(d.file)).getFile()).arrayBuffer();
        var r = await o.fetchImpl("/api/news/editor/offload/restore", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/zip", "x-lp-csrf": o.csrf || "" }, body: buf });
        var j = null; try { j = await r.json(); } catch (_) {}
        if (!r.ok) { failed.push({ day: d.day, code: (j && j.error) || "HTTP_" + r.status }); continue; }
        // What came back, not just that the request went through.
        if (j && j.restored > 0) done.push(d.day); else if (j && (j.duplicate > 0 || j.expired > 0)) already.push(d.day); else failed.push({ day: d.day, code: "NOTHING_RESTORED" });
      } catch (e) { failed.push({ day: d.day, code: (e && e.name) || "ERROR" }); }
    }
    return { done: done, already: already, failed: failed };
  }

  function h(doc, tag, attrs, children) {
    var e = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { var v = attrs[k]; if (v == null || v === false) return; if (k === "text") e.textContent = v; else if (k === "class") e.className = v; else e.setAttribute(k, v === true ? "" : String(v)); });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? doc.createTextNode(c) : c); });
    return e;
  }
  // «Место»: free space, what news take by month, offloaded days, the two buttons.
  function renderStorageCard(doc, st, opts) {
    opts = opts || {};
    var t = opts.t || function (k, f) { return f; }, win = opts.win || {};
    var box = h(doc, "section", { class: "ne-card", id: "storage", "aria-labelledby": "ne-storage-title" }, [h(doc, "h2", { id: "ne-storage-title", text: t("newsEditor.storage.title", "Место") })]);
    box.appendChild(h(doc, "p", { class: st.low ? "ne-storage-low" : "ne-muted", text: st.disk ? t("newsEditor.storage.freeDisk", "Свободно на диске: {disk} (ещё {db} пустого места внутри базы — его займут новые новости)")
      .replace("{disk}", sizeText(st.disk.free)).replace("{db}", sizeText(st.db_free)) : t("newsEditor.storage.noDisk", "Свободное место на диске узнать не удалось") }));
    box.appendChild(h(doc, "p", { class: "ne-muted", text: t("newsEditor.storage.note", "Файл базы на сервере от выгрузки не уменьшается, но перестаёт расти: новые новости занимают освободившееся место внутри него.") }));
    if (st.by_month.length) box.appendChild(h(doc, "ul", { class: "ne-storage-months" }, st.by_month.map(function (m) {
      return h(doc, "li", { text: m.month + ": " + t("newsEditor.storage.month", "фото {p}, тексты {b}").replace("{p}", sizeText(m.photos)).replace("{b}", sizeText(m.bodies)) }); })));
    box.appendChild(h(doc, "p", { class: "ne-muted", text: st.suggest.days.length ? t("newsEditor.storage.suggest", "Можно выгрузить {n} дн. архива (≈{size}): {from} — {to}")
      .replace("{n}", String(st.suggest.days.length)).replace("{size}", sizeText(st.suggest.bytes)).replace("{from}", st.suggest.days[0]).replace("{to}", st.suggest.days[st.suggest.days.length - 1])
      : t("newsEditor.storage.nothing", "Выгружать пока нечего: в архиве нет дней старше трёх суток") }));
    if (st.offloaded.length) box.appendChild(h(doc, "ul", { class: "ne-storage-offloaded", "aria-label": t("newsEditor.storage.offloaded", "Выгруженные дни") }, st.offloaded.map(function (o) {
      return h(doc, "li", { text: o.day + " · " + t("newsEditor.storage.state." + o.state, o.state) + " · " + o.articles + " ст., " + sizeText(o.bytes) + " · sha256 " + String(o.sha256).slice(0, 12) + "…" }); })));
    var progress = h(doc, "p", { class: "ne-muted", "aria-live": "polite" });
    if (typeof win.showDirectoryPicker !== "function") {
      box.appendChild(h(doc, "p", { class: "ne-muted", text: t("newsEditor.storage.needDesktop", "Выгрузка работает в Chrome или Edge на компьютере") }));
      return box;
    }
    var go = h(doc, "button", { type: "button", class: "ne-button", disabled: !st.suggest.days.length, text: t("newsEditor.storage.offload", "Выгрузить предложенные на этот компьютер") });
    var back = h(doc, "button", { type: "button", class: "ne-button ne-quiet", text: t("newsEditor.storage.restore", "Вернуть выгруженное на сервер") });
    var pick = function () { return win.showDirectoryPicker({ mode: "readwrite", id: "linguistpro-news-archive" }); };
    var report = function (r) { progress.textContent = t("newsEditor.storage.result", "Готово: {done}. Не получилось: {failed}").replace("{done}", String(r.done.length) + (r.already && r.already.length ? " (" + t("newsEditor.storage.already", "уже на сервере или истёк срок: {n}").replace("{n}", String(r.already.length)) + ")" : ""))
      .replace("{failed}", r.failed.length ? r.failed.map(function (f) { return (f.day || "") + " " + f.code; }).join(", ") : "0"); if (opts.onDone) opts.onDone(r); };
    go.addEventListener && go.addEventListener("click", function () {
      go.disabled = back.disabled = true;
      run({ fetchImpl: win.fetch.bind(win), csrf: opts.csrf, pickDir: pick, days: st.suggest.days, onProgress: function (p) { progress.textContent = p.day + " · " + t("newsEditor.storage.step." + p.step, p.step) + " (" + (p.i + 1) + "/" + p.n + ")"; } })
        .then(report).catch(function (e) { progress.textContent = String(e && e.message || e); }).finally(function () { go.disabled = back.disabled = false; });
    });
    back.addEventListener && back.addEventListener("click", function () {
      go.disabled = back.disabled = true;
      restore({ fetchImpl: win.fetch.bind(win), csrf: opts.csrf, pickDir: pick }).then(report).catch(function (e) { progress.textContent = String(e && e.message || e); })
        .finally(function () { go.disabled = back.disabled = false; });
    });
    box.append(h(doc, "div", { class: "ne-inline" }, [go, back]), progress);
    return box;
  }
  return { run: run, restore: restore, renderStorageCard: renderStorageCard, sizeText: sizeText, README_TEXT: README_TEXT };
});
