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

  return { panel: panel };
});
