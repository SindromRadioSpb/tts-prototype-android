// Atlas P5 — the «Тренировать» panel of a section (plan ENGINEERING_ATLAS_P5_TRAINER_PLAN_2026_11_03.md).
// DOM only: the host (library-ui.js) stores the stage, repaints the section and owns memory; later stages add their
// blocks to the same panel (panel.appendChild).
(function (root, factory) {
  var api = factory();
  root.AtlasTrainUI = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function h(doc, tag, attrs, kids) {
    var e = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "cls") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? doc.createTextNode(c) : c); });
    return e;
  }

  var STAGE = [
    { key: "atlas.train.stage0", fb: "Перевод", desc: "atlas.train.stage0Desc", descFb: "Весь перевод и транслитерация — как в «Колонках»." },
    { key: "atlas.train.stage1", fb: "Незнакомые", desc: "atlas.train.stage1Desc", descFb: "Без перевода абзаца; под незнакомыми словами — их значение здесь. Слова «знаю», «почти знаю» и «не учить» — без подсказки." },
    { key: "atlas.train.stage2", fb: "Термины", desc: "atlas.train.stage2Desc", descFb: "Без перевода абзаца; значение подписано только под терминами атласа." },
    { key: "atlas.train.stage3", fb: "Иврит", desc: "atlas.train.stage3Desc", descFb: "Как в книге на экзамене: иврит без огласовок. Нажмите на слово — карточка с переводом." },
  ];

  // → { btn, panel, set(n), note(text|null), hint({stage, share}|null), section }
  function panel(doc, opts) {
    opts = opts || {};
    var T = typeof opts.T === "function" ? opts.T : function (k, fb) { return fb; };
    var onStage = typeof opts.onStage === "function" ? opts.onStage : function () {};
    var current = Number(opts.stage) || 0;
    var btn = h(doc, "button", { type: "button", cls: "atlas-train-btn", "aria-expanded": "false", text: T("atlas.train.open", "Тренировать") });
    var box = h(doc, "div", { cls: "atlas-train-panel", hidden: true, role: "group", "aria-label": T("atlas.train.open", "Тренировать") });
    var head = h(doc, "div", { cls: "atlas-view-head", text: T("atlas.train.stageHead", "Ступень перевода") });
    var seg = h(doc, "div", { cls: "atlas-seg atlas-stage-seg", role: "radiogroup", "aria-label": T("atlas.train.stageHead", "Ступень перевода") });
    STAGE.forEach(function (s, n) {
      var b = h(doc, "button", { type: "button", role: "radio", cls: "atlas-chip", "data-stage": String(n), text: (n + 0) + " · " + T(s.key, s.fb) });
      b.addEventListener("click", function () { choose(n); });
      seg.appendChild(b);
    });
    var desc = h(doc, "p", { cls: "atlas-stage-desc" });
    var note = h(doc, "p", { cls: "atlas-train-note", hidden: true, role: "status" });
    var hintText = h(doc, "span", { cls: "atlas-stage-hint-text" });
    var hintBtn = h(doc, "button", { type: "button", cls: "atlas-chip", text: T("atlas.train.hintGo", "Перейти") });
    var hintBox = h(doc, "div", { cls: "atlas-stage-hint", hidden: true, role: "status" }, [hintText, hintBtn]);
    var hinted = null;
    hintBtn.addEventListener("click", function () { if (hinted) choose(hinted.stage); });
    var section = h(doc, "div", { cls: "atlas-train-stage" }, [head, seg, desc, note, hintBox]);
    box.appendChild(section);

    function paint() {
      seg.querySelectorAll("[data-stage]").forEach(function (b) { b.setAttribute("aria-checked", String(Number(b.getAttribute("data-stage")) === current)); });
      var s = STAGE[current] || STAGE[0];
      desc.textContent = T(s.desc, s.descFb);
    }
    function choose(n) {
      if (n === current) return;
      current = n; paint(); hint(null);
      onStage(n);
    }
    function open(on) {
      if (on) box.removeAttribute("hidden"); else box.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", String(on));
    }
    function hint(x) {
      hinted = x && x.stage > current ? x : null;
      hintBox.hidden = !hinted;
      if (hinted) {
        var s = STAGE[hinted.stage] || {};
        hintText.textContent = T("atlas.train.hint", "{p} % терминов раздела вы помните уверенно — перейти на ступень «{s}»?")
          .replace("{p}", String(Math.round(hinted.share * 100))).replace("{s}", T(s.key, s.fb)) + " ";
      }
    }
    btn.addEventListener("click", function () { open(box.hasAttribute("hidden")); });
    box.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { open(false); if (btn.focus) btn.focus(); } });
    paint();
    return {
      btn: btn, panel: box, section: section, hint: hint,
      set: function (n) { current = Number(n) || 0; paint(); },
      note: function (text) { note.hidden = !text; note.textContent = text || ""; },
    };
  }

  // P5 G2 — «Добавить в термины»: a word of a row grows into a phrase of its neighbours, the meaning comes from the
  // in-context gloss until the learner writes their own, the scope is this section or the whole atlas.
  // opts: { T, words: [{ he, niqqud }], at, glossOf(from, to), duplicateOf(lemmaHe) → text | null, initial?: { ru, scope },
  //         onSave({ from, to, lemmaHe, niqqud, ru, scope }), onDelete?(), onCancel?() } → { el }
  function termForm(doc, opts) {
    opts = opts || {};
    var T = typeof opts.T === "function" ? opts.T : function (k, fb) { return fb; };
    var words = Array.isArray(opts.words) ? opts.words : [];
    var from = Math.max(0, Math.min(Number(opts.at) || 0, words.length - 1)), to = from, own = !!(opts.initial && opts.initial.ru);
    if (opts.initial && Number.isInteger(opts.initial.from) && Number.isInteger(opts.initial.to)) { from = opts.initial.from; to = opts.initial.to; }
    var phrase = h(doc, "p", { cls: "atlas-term-phrase", dir: "rtl", lang: "he" });
    function btn(attr, val, text) { var b = h(doc, "button", { type: "button", cls: "atlas-chip" }); b.setAttribute(attr, val); b.textContent = text; return b; }
    var grow = h(doc, "div", { cls: "atlas-seg atlas-term-grow" }, [
      btn("data-extend", "prev", T("atlas.terms.addPrev", "+ слово перед")), btn("data-shrink", "prev", T("atlas.terms.dropPrev", "− первое")),
      btn("data-shrink", "next", T("atlas.terms.dropNext", "− последнее")), btn("data-extend", "next", T("atlas.terms.addNext", "+ слово после"))]);
    var ru = h(doc, "input", { type: "text", name: "ru", maxlength: "120", "aria-label": T("atlas.terms.meaning", "Значение") });
    var ruLabel = h(doc, "label", { cls: "atlas-term-field" }, [h(doc, "span", { text: T("atlas.terms.meaning", "Значение") }), ru]);
    var scope = (opts.initial && opts.initial.scope) === "atlas" ? "atlas" : "section";
    function radio(val, text) {
      var r = h(doc, "input", { type: "radio", name: "scope", value: val });
      r.checked = scope === val;
      r.addEventListener("change", function () { if (r.checked) scope = val; });
      return h(doc, "label", { cls: "atlas-col" }, [r, h(doc, "span", { text: text })]);
    }
    var scopes = h(doc, "div", { cls: "atlas-term-scope", role: "radiogroup", "aria-label": T("atlas.terms.scope", "Где это термин") },
      [radio("section", T("atlas.terms.scopeSection", "В этом разделе")), radio("atlas", T("atlas.terms.scopeAtlas", "Во всём атласе"))]);
    var dup = h(doc, "p", { cls: "atlas-term-dup", hidden: true, role: "status" });
    var save = h(doc, "button", { type: "button", cls: "atlas-chip atlas-term-save", "data-term-save": true, text: T("atlas.terms.save", "Сохранить термин") });
    var cancel = h(doc, "button", { type: "button", cls: "atlas-chip", "data-term-cancel": true, text: T("atlas.terms.cancel", "Отмена") });
    var foot = h(doc, "div", { cls: "atlas-seg atlas-term-foot" }, [save, cancel]);
    if (typeof opts.onDelete === "function") {
      var del = h(doc, "button", { type: "button", cls: "atlas-chip", "data-term-delete": true, text: T("atlas.terms.delete", "Удалить мой термин") });
      del.addEventListener("click", function () { opts.onDelete(); });
      foot.appendChild(del);
    }
    var el = h(doc, "div", { cls: "atlas-root atlas-term-dialog", role: "dialog", "aria-modal": "true", "aria-label": T("atlas.terms.addTitle", "Добавить в термины") }, [
      h(doc, "div", { cls: "atlas-term-card" }, [h(doc, "p", { cls: "atlas-view-head", text: T("atlas.terms.addTitle", "Добавить в термины") }),
        phrase, grow, ruLabel, scopes, dup, foot])]);
    function lemma() { return words.slice(from, to + 1).map(function (w) { return w.he; }).join(" "); }
    function pointed() { return words.slice(from, to + 1).map(function (w) { return w.niqqud || w.he; }).join(" "); }
    function paint() {
      phrase.textContent = pointed();
      if (!own) ru.value = typeof opts.glossOf === "function" ? String(opts.glossOf(from, to) || "") : "";
      grow.querySelector('[data-extend="prev"]').disabled = from <= 0;
      grow.querySelector('[data-extend="next"]').disabled = to >= words.length - 1;
      grow.querySelector('[data-shrink="prev"]').disabled = grow.querySelector('[data-shrink="next"]').disabled = from === to;
      var d = typeof opts.duplicateOf === "function" ? opts.duplicateOf(lemma()) : null;
      dup.hidden = !d;
      dup.textContent = d ? T("atlas.terms.duplicate", "Такой термин уже есть в атласе:") + " " + d : "";
      save.disabled = !!d || !ru.value.trim();
    }
    grow.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.disabled) return;
        if (b.getAttribute("data-extend") === "prev") from--; else if (b.getAttribute("data-extend") === "next") to++;
        else if (b.getAttribute("data-shrink") === "prev") from++; else if (b.getAttribute("data-shrink") === "next") to--;
        paint();
      });
    });
    ru.addEventListener("input", function () { own = !!ru.value.trim(); save.disabled = !dup.hidden || !ru.value.trim(); });
    save.addEventListener("click", function () {
      if (save.disabled || typeof opts.onSave !== "function") return;
      opts.onSave({ from: from, to: to, lemmaHe: lemma(), niqqud: pointed(), ru: ru.value.replace(/\s+/g, " ").trim(), scope: scope });
    });
    cancel.addEventListener("click", function () { if (typeof opts.onCancel === "function") opts.onCancel(); });
    el.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && typeof opts.onCancel === "function") opts.onCancel(); });
    if (opts.initial && opts.initial.ru) ru.value = opts.initial.ru;
    paint();
    return { el: el, focus: function () { try { ru.focus(); } catch (_) {} } };
  }

  // P5 G3 — a term session: the Hebrew term and its sentence from the book first, the meaning on request, then
  // «Не помню» / «Помню» (the one write: onGrade(key, ok) → Promise<boolean saved>). A miss comes back once at the end.
  // item: { key, title (pointed), plain, translit, ru, sentence (words joined by spaces), from, to, page }
  function termSession(doc, opts) {
    opts = opts || {};
    var T = typeof opts.T === "function" ? opts.T : function (k, fb) { return fb; };
    var queue = (opts.items || []).slice(), total = queue.length, firstOk = 0, missed = {}, cur = null, busy = false;
    var title = opts.title || T("atlas.train.termsHead", "Термины раздела");
    var card = h(doc, "div", { cls: "atlas-term-card atlas-ts" });
    var el = h(doc, "div", { cls: "atlas-root atlas-term-dialog", role: "dialog", "aria-modal": "true", "aria-label": title }, [card]);
    function close() { if (typeof opts.onClose === "function") opts.onClose(); }
    el.addEventListener("keydown", function (ev) { if (ev.key === "Escape") close(); });
    function sentenceHtml(it) {
      var words = String(it.sentence || "").split(/\s+/).filter(Boolean);
      return words.map(function (w, i) {
        var t = esc(w);
        return it.from != null && i >= it.from && i <= it.to ? "<mark>" + t + "</mark>" : t;
      }).join(" ");
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function button(attr, val, text, cls) { var b = h(doc, "button", { type: "button", cls: "atlas-chip" + (cls ? " " + cls : "") }); b.setAttribute(attr, val); b.textContent = text; return b; }
    function show() {
      card.replaceChildren();
      if (!queue.length) {
        card.appendChild(h(doc, "p", { cls: "atlas-view-head", text: title }));
        card.appendChild(h(doc, "p", { cls: "atlas-ts-done", text: T("atlas.train.sessionDone", "Помню с первого раза: {ok} из {n}.").replace("{ok}", String(firstOk)).replace("{n}", String(total)) }));
        var done = button("data-ts-close", "1", T("atlas.train.close", "Закрыть"), "atlas-term-save");
        done.addEventListener("click", close);
        card.appendChild(done);
        return;
      }
      cur = queue[0];
      card.appendChild(h(doc, "p", { cls: "atlas-view-head", text: title + " · " + Math.max(1, Math.min(total, total - queue.length + 1)) + " / " + total }));
      card.appendChild(h(doc, "p", { cls: "atlas-ts-term", dir: "rtl", lang: "he", text: opts.plainHebrew ? (cur.plain || cur.title) : (cur.title || cur.plain) }));
      if (cur.sentence) { var sn = h(doc, "p", { cls: "atlas-ts-sentence", dir: "rtl", lang: "he" }); sn.innerHTML = sentenceHtml(cur); card.appendChild(sn); }
      var answer = h(doc, "div", { cls: "atlas-ts-answer", hidden: true }, [
        h(doc, "p", { cls: "atlas-ts-ru", text: cur.ru }),
        cur.translit ? h(doc, "p", { cls: "atlas-ts-translit", dir: "ltr", text: (opts.plainHebrew ? cur.title + " · " : "") + cur.translit }) : null]);
      card.appendChild(answer);
      var err = h(doc, "p", { cls: "atlas-train-note atlas-ts-error", role: "alert", hidden: true, text: T("atlas.train.saveError", "Ответ не сохранился — попробуйте ещё раз.") });
      card.appendChild(err);
      var row = h(doc, "div", { cls: "atlas-seg atlas-ts-actions" });
      var reveal = button("data-ts-reveal", "1", T("atlas.train.reveal", "Показать значение"), "atlas-term-save");
      reveal.addEventListener("click", function () {
        answer.hidden = false; reveal.remove();
        var no = button("data-ts-grade", "0", T("atlas.train.forgot", "Не помню")), yes = button("data-ts-grade", "1", T("atlas.train.remember", "Помню"), "atlas-term-save");
        [no, yes].forEach(function (b) { b.addEventListener("click", function () { grade(b.getAttribute("data-ts-grade") === "1", err); }); });
        row.prepend(yes); row.prepend(no);
        try { yes.focus(); } catch (_) {}
      });
      row.appendChild(reveal);
      if (cur.page && typeof opts.onOpenPage === "function") {
        var open = button("data-ts-open", "1", T("atlas.train.openPage", "Стр. {p} в книге").replace("{p}", String(cur.page)));
        var it = cur;
        open.addEventListener("click", function () { opts.onOpenPage(it); });
        row.appendChild(open);
      }
      var stop = button("data-ts-close", "1", T("atlas.train.stop", "Закончить"));
      stop.addEventListener("click", close);
      row.appendChild(stop);
      card.appendChild(row);
      try { reveal.focus(); } catch (_) {}
    }
    function grade(ok, err) {
      if (busy || !cur) return;
      busy = true;
      var it = cur;
      Promise.resolve(typeof opts.onGrade === "function" ? opts.onGrade(it.key, ok) : true).then(function (saved) {
        busy = false;
        if (!saved) { err.hidden = false; return; }
        queue.shift();
        if (!missed[it.key]) { if (ok) firstOk++; else { missed[it.key] = true; queue.push(it); } }
        show();
      }, function () { busy = false; err.hidden = false; });
    }
    show();
    return { el: el };
  }

  // P5 G4 — «Найди в книге»: a fragment of the book as printed, the learner names the section and the page; the answer
  // (from the data) with the time, and the way to that page. opts: { T, sections: [{ id, he, ru, first, last }],
  // next() → item | null, check(item, { sid, page }) → { section, page }, onAnswer(item, result, ms), onOpen(item), onClose, now }
  function findSession(doc, opts) {
    opts = opts || {};
    var T = typeof opts.T === "function" ? opts.T : function (k, fb) { return fb; };
    var now = typeof opts.now === "function" ? opts.now : function () { return Date.now(); };
    var sections = opts.sections || [];
    var card = h(doc, "div", { cls: "atlas-term-card atlas-find" });
    var el = h(doc, "div", { cls: "atlas-root atlas-term-dialog", role: "dialog", "aria-modal": "true", "aria-label": T("atlas.find.title", "Найди в книге") }, [card]);
    var item = null, started = 0, timer = null;
    function close() { if (timer) clearInterval(timer); if (typeof opts.onClose === "function") opts.onClose(); }
    el.addEventListener("keydown", function (ev) { if (ev.key === "Escape") close(); });
    function clock(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
    function button(attr, text, cls) { var b = h(doc, "button", { type: "button", cls: "atlas-chip" + (cls ? " " + cls : "") }); b.setAttribute(attr, ""); b.textContent = text; return b; }
    function closeBtn() { var c = button("data-find-close", T("atlas.train.stop", "Закончить")); c.addEventListener("click", close); return c; }
    function ask() {
      if (timer) { clearInterval(timer); timer = null; }
      card.replaceChildren(h(doc, "p", { cls: "atlas-view-head", text: T("atlas.find.title", "Найди в книге") }));
      item = typeof opts.next === "function" ? opts.next() : null;
      if (!item) {
        card.appendChild(h(doc, "p", { cls: "atlas-find-empty", text: T("atlas.find.empty", "Вопросов больше нет.") }));
        card.appendChild(closeBtn());
        return;
      }
      started = now();
      var clockEl = h(doc, "p", { cls: "atlas-find-timer", "aria-live": "off", text: "0:00" });
      timer = setInterval(function () { clockEl.textContent = clock(now() - started); }, 1000);
      card.appendChild(h(doc, "p", { cls: "atlas-find-text", dir: "rtl", lang: "he", text: item.he }));
      card.appendChild(clockEl);
      var sel = h(doc, "select", { name: "sid", "aria-label": T("atlas.find.section", "Раздел") }, [h(doc, "option", { value: "", text: T("atlas.find.section", "Раздел") + "…" })]);
      sections.forEach(function (s) { sel.appendChild(h(doc, "option", { value: s.id, text: (s.ru || "") + " · " + (s.he || "") + " (" + s.first + "–" + s.last + ")" })); });
      var page = h(doc, "input", { type: "number", name: "page", inputmode: "numeric", placeholder: T("atlas.page", "стр."), "aria-label": T("atlas.jump", "Страница книги") });
      var check = button("data-find-check", T("atlas.find.check", "Проверить"), "atlas-term-save");
      var skip = button("data-find-skip", T("atlas.find.skip", "Пропустить"));
      function ready() { check.disabled = !sel.value; }
      sel.addEventListener("change", function () {
        var s = sections.filter(function (x) { return x.id === sel.value; })[0];
        if (s) { page.setAttribute("min", String(s.first)); page.setAttribute("max", String(s.last)); } else { page.removeAttribute("min"); page.removeAttribute("max"); }
        ready();
      });
      page.addEventListener("input", ready);
      check.addEventListener("click", function () { if (!check.disabled) answer({ sid: sel.value, page: page.value === "" ? null : Number(page.value) }); });
      skip.addEventListener("click", ask);
      card.appendChild(h(doc, "div", { cls: "atlas-find-form" }, [sel, page]));
      card.appendChild(h(doc, "div", { cls: "atlas-seg atlas-ts-actions" }, [check, skip, closeBtn()]));
      ready();
      try { sel.focus(); } catch (_) {}
    }
    function answer(a) {
      if (timer) { clearInterval(timer); timer = null; }
      var ms = now() - started, r = typeof opts.check === "function" ? opts.check(item, a) : { section: false, page: "wrong" };
      if (typeof opts.onAnswer === "function") opts.onAnswer(item, r, ms);
      var s = sections.filter(function (x) { return x.id === item.sid; })[0] || {};
      var verdict = !r.section ? T("atlas.find.wrongSection", "Другой раздел.")
        : r.page === "exact" ? T("atlas.find.exact", "Верно: раздел и страница.")
        : r.page === "near" ? T("atlas.find.near", "Раздел верный, страница соседняя.") : T("atlas.find.rightSection", "Раздел верный, страница другая.");
      var it = item;
      card.replaceChildren(h(doc, "p", { cls: "atlas-view-head", text: T("atlas.find.title", "Найди в книге") }),
        h(doc, "p", { cls: "atlas-find-text", dir: "rtl", lang: "he", text: item.he }),
        h(doc, "div", { cls: "atlas-find-result atlas-ts-answer", role: "status" }, [
          h(doc, "p", { cls: "atlas-ts-ru", text: verdict }),
          h(doc, "p", { text: T("atlas.find.where", "В книге: {s}, стр. {p}").replace("{s}", (s.ru || item.sid) + " · " + (s.he || "")).replace("{p}", String(item.page)) }),
          h(doc, "p", { cls: "atlas-ts-translit", text: T("atlas.find.time", "Время: {t}").replace("{t}", clock(ms)) })]));
      var open = button("data-find-open", T("atlas.find.open", "Открыть стр. {p}").replace("{p}", String(item.page)));
      open.addEventListener("click", function () { if (typeof opts.onOpen === "function") opts.onOpen(it); });
      var next = button("data-find-next", T("atlas.find.next", "Дальше"), "atlas-term-save");
      next.addEventListener("click", ask);
      card.appendChild(h(doc, "div", { cls: "atlas-seg atlas-ts-actions" }, [next, open, closeBtn()]));
      try { next.focus(); } catch (_) {}
    }
    ask();
    return { el: el, stop: function () { if (timer) clearInterval(timer); } };
  }

  // P5 G5 — «Что это за символ?»: the formula without its table; one symbol at a time — its meaning (and unit) among
  // four of the same section; after the last symbol the whole table and the way to the page. Nothing is stored as memory.
  // opts: { T, questions (AtlasTrain.symbolQuestions), check(sym, picks), onAnswer(q, sym, result), onOpen(q), onClose }
  function symbolSession(doc, opts) {
    opts = opts || {};
    var T = typeof opts.T === "function" ? opts.T : function (k, fb) { return fb; };
    var qs = opts.questions || [], qi = 0, si = 0, total = 0, fully = 0;
    var card = h(doc, "div", { cls: "atlas-term-card atlas-sym" });
    var el = h(doc, "div", { cls: "atlas-root atlas-term-dialog", role: "dialog", "aria-modal": "true", "aria-label": T("atlas.sym.title", "Что это за символ?") }, [card]);
    function close() { if (typeof opts.onClose === "function") opts.onClose(); }
    el.addEventListener("keydown", function (ev) { if (ev.key === "Escape") close(); });
    function button(attr, val, text, cls) { var b = h(doc, "button", { type: "button", cls: "atlas-chip" + (cls ? " " + cls : "") }); b.setAttribute(attr, val); b.textContent = text; return b; }
    function closeBtn() { var c = button("data-sym-close", "", T("atlas.train.stop", "Закончить")); c.addEventListener("click", close); return c; }
    function math(cls, html, fallback) { var d = h(doc, "div", { cls: cls, dir: "ltr" }); if (html) d.innerHTML = html; else d.textContent = fallback || ""; return d; }
    function head(q) {
      card.replaceChildren(h(doc, "p", { cls: "atlas-view-head", text: T("atlas.sym.title", "Что это за символ?") + " · " + (qi + 1) + " / " + qs.length }));
      if (opts.note) card.appendChild(h(doc, "p", { cls: "atlas-train-note", text: opts.note }));
      card.appendChild(math("atlas-sym-formula", q.mathml, q.latex));
    }
    function show() {
      if (qi >= qs.length) {
        card.replaceChildren(h(doc, "p", { cls: "atlas-view-head", text: T("atlas.sym.title", "Что это за символ?") }),
          h(doc, "p", { cls: "atlas-ts-done", text: T("atlas.sym.done", "Полностью верно: {ok} из {n} символов.").replace("{ok}", String(fully)).replace("{n}", String(total)) }), closeBtn());
        return;
      }
      var q = qs[qi];
      if (si >= q.symbols.length) return table(q);
      var sym = q.symbols[si], picks = { meaning: null, unit: null };
      head(q);
      card.appendChild(h(doc, "p", { cls: "atlas-sym-ask", text: T("atlas.sym.ask", "Что обозначает символ") }));
      card.appendChild(math("atlas-sym-symbol", sym.mathml, sym.latex));
      var check = button("data-sym-check", "", T("atlas.find.check", "Проверить"), "atlas-term-save");
      function ready() { check.disabled = !picks.meaning || (!!sym.options.unit && !picks.unit); }
      function group(kind, list) {
        var g = h(doc, "div", { cls: "atlas-sym-options", role: "radiogroup" });
        list.forEach(function (x) {
          var b = button("data-sym-" + kind, x, x);
          b.setAttribute("role", "radio"); b.setAttribute("aria-checked", "false");
          if (kind === "meaning" && /[א-ת]/.test(x)) { b.setAttribute("dir", "rtl"); b.setAttribute("lang", "he"); }
          b.addEventListener("click", function () {
            picks[kind] = x;
            g.querySelectorAll("button").forEach(function (o) { o.setAttribute("aria-checked", String(o === b)); });
            ready();
          });
          g.appendChild(b);
        });
        return g;
      }
      card.appendChild(group("meaning", sym.options.meaning));
      if (sym.options.unit) { card.appendChild(h(doc, "p", { cls: "atlas-sym-ask", text: T("atlas.sym.unit", "Единица") })); card.appendChild(group("unit", sym.options.unit)); }
      check.addEventListener("click", function () {
        if (check.disabled) return;
        var r = typeof opts.check === "function" ? opts.check(sym, picks) : { meaning: false, unit: null };
        total++; if (r.meaning && r.unit !== false) fully++;
        if (typeof opts.onAnswer === "function") opts.onAnswer(q, sym, r);
        card.querySelectorAll(".atlas-sym-options button").forEach(function (b) { b.disabled = true; });
        var good = r.meaning && r.unit !== false;
        var fb = h(doc, "div", { cls: "atlas-sym-feedback atlas-ts-answer", role: "status" }, [
          h(doc, "p", { cls: "atlas-ts-ru", text: good ? T("atlas.sym.right", "Верно.") : T("atlas.sym.wrong", "Правильно так:") }),
          h(doc, "p", { text: sym.answer.ru + (sym.answer.he ? " · " + sym.answer.he : "") + (sym.answer.unit ? " · " + sym.answer.unit : "") })]);
        var next = button("data-sym-next", "", T("atlas.find.next", "Дальше"), "atlas-term-save");
        next.addEventListener("click", function () { si++; show(); });
        check.replaceWith(fb);
        card.querySelector(".atlas-sym-actions").prepend(next);
        try { next.focus(); } catch (_) {}
      });
      card.appendChild(h(doc, "div", { cls: "atlas-seg atlas-ts-actions atlas-sym-actions" }, [check, closeBtn()]));
      ready();
    }
    function table(q) {
      head(q);
      var t = h(doc, "table", { cls: "atlas-sym-table" });
      q.symbols.forEach(function (sym) {
        var c = h(doc, "td", { dir: "ltr" }); if (sym.mathml) c.innerHTML = sym.mathml; else c.textContent = sym.latex;
        t.appendChild(h(doc, "tr", {}, [c, h(doc, "td", { text: sym.answer.ru }), h(doc, "td", { dir: "rtl", lang: "he", text: sym.answer.he }), h(doc, "td", { text: sym.answer.unit })]));
      });
      card.appendChild(t);
      var open = button("data-sym-open", "", T("atlas.find.open", "Открыть стр. {p}").replace("{p}", String(q.page)));
      open.addEventListener("click", function () { if (typeof opts.onOpen === "function") opts.onOpen(q); });
      var next = button("data-sym-next", "", T("atlas.sym.nextFormula", "Следующая формула"), "atlas-term-save");
      next.addEventListener("click", function () { qi++; si = 0; show(); });
      card.appendChild(h(doc, "div", { cls: "atlas-seg atlas-ts-actions" }, [next, open, closeBtn()]));
    }
    show();
    return { el: el };
  }

  return { panel: panel, termForm: termForm, termSession: termSession, findSession: findSession, symbolSession: symbolSession };
});
