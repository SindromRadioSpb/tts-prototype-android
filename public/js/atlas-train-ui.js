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
    var card = h(doc, "div", { cls: "atlas-term-card atlas-ts" });
    var el = h(doc, "div", { cls: "atlas-root atlas-term-dialog", role: "dialog", "aria-modal": "true", "aria-label": T("atlas.train.termsHead", "Термины раздела") }, [card]);
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
        card.appendChild(h(doc, "p", { cls: "atlas-view-head", text: T("atlas.train.termsHead", "Термины раздела") }));
        card.appendChild(h(doc, "p", { cls: "atlas-ts-done", text: T("atlas.train.sessionDone", "Помню с первого раза: {ok} из {n}.").replace("{ok}", String(firstOk)).replace("{n}", String(total)) }));
        var done = button("data-ts-close", "1", T("atlas.train.close", "Закрыть"), "atlas-term-save");
        done.addEventListener("click", close);
        card.appendChild(done);
        return;
      }
      cur = queue[0];
      card.appendChild(h(doc, "p", { cls: "atlas-view-head", text: T("atlas.train.termsHead", "Термины раздела") + " · " + Math.max(1, Math.min(total, total - queue.length + 1)) + " / " + total }));
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

  return { panel: panel, termForm: termForm, termSession: termSession };
});
