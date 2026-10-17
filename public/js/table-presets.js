// Column presets of the study table (owner decision 2026-09-25, UI release program R2).
// Pure module: display only. It feeds the parity-locked table builder through its legal
// input (visibleColumns); the builder itself is not touched.
(function () {
  "use strict";
  var MAP = {
    niqqud:   { he: false, niqqud: true,  translit: false, ru: true },
    translit: { he: false, niqqud: false, translit: true,  ru: true },
    plain:    { he: true,  niqqud: false, translit: false, ru: true },
    three:    { he: false, niqqud: true,  translit: true,  ru: true },
    hebrew:   { he: false, niqqud: true,  translit: false, ru: false },
    all:      { he: true,  niqqud: true,  translit: true,  ru: true },
  };
  var PRESETS = Object.keys(MAP);
  var KEYS = ["he", "niqqud", "translit", "ru"];
  function toColumns(id) {
    var m = MAP[id] || MAP.all;
    return { he: m.he, niqqud: m.niqqud, translit: m.translit, ru: m.ru };
  }
  function fromColumns(cols) {
    for (var i = 0; i < PRESETS.length; i++) {
      var m = MAP[PRESETS[i]];
      if (KEYS.every(function (k) { return !!cols[k] === m[k]; })) return PRESETS[i];
    }
    return "custom";
  }
  function defaultFor(width) { return Number(width) < 600 ? "niqqud" : "all"; }
  // A phone is a phone in either orientation: decide by the shorter side, so a profile first
  // opened in landscape (844 px wide) still gets the phone preset (owner, O-066, 2026-10-17).
  function screenDefault(win) {
    win = win || window;
    return defaultFor(Math.min(Number(win.innerWidth) || 0, Number(win.innerHeight) || Infinity));
  }
  // Owner D4: row numbers make long tables traceable. Post-render attribute on the «Действие»
  // cell (drawn by CSS ::before), numbered from the row index so filtering never renumbers rows.
  function markRowNumbers(root) {
    if (!root || !root.querySelectorAll) return;
    var rows = root.querySelectorAll("tr[data-row-idx]");
    for (var i = 0; i < rows.length; i++) {
      var cell = rows[i].querySelector("td.col-action-cell");
      var idx = Number(rows[i].getAttribute("data-row-idx"));
      if (!cell || !Number.isInteger(idx) || idx < 0) continue;
      var n = idx + 1;
      cell.setAttribute("data-row-n", n < 10 ? "0" + n : String(n));
    }
  }
  var API = { PRESETS: PRESETS, toColumns: toColumns, fromColumns: fromColumns, defaultFor: defaultFor, screenDefault: screenDefault, markRowNumbers: markRowNumbers };
  if (typeof window !== "undefined") window.TablePresets = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
