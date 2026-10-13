// public/js/dictionary-workbook.js — учебная книга XLSX «Мой словарь» (чистая сборка листов; Node-тестируемая).
// Спека: docs/planning/word-layer/F4_XLSX_PREMIUM_SPEC_2026_10_13.md (требования X1–X12).
//
// Вход — уже собранные браузерным слоем данные (слова с таблицами Pealim, примерами, памятью; прогресс);
// выход — { sheets, styles } для XlsxCore.buildParts. Листы: Начать · Словарь · Таблицы · Формы · Проверь себя ·
// Прогресс. Переходы — внутренние ссылки; проверка — формулы (без макросов), ответы скрыты до попытки.
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DictionaryWorkbook = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  var FD = (root && root.FormDrillCore) || (typeof require === "function" ? require("./form-drill-core.js") : null);
  var X = (root && root.XlsxCore) || (typeof require === "function" ? require("./xlsx-core.js") : null);

  // status colours = the app's word-status fills (--ws-*-fill blended on white)
  var STATUS_FILL = { "new": "FFDDCCFA", l1: "FFF1C9C7", l2: "FFF2D9BC", l3: "FFC7E2C8", l4: "FFCAD8F6", known: "FFBBE1DE", ignore: "FFDDE0E5" };
  var GRAY = "FF6B7280", ACCENT = "FF1B4FB8", MET = "FFFFF1B8", GOOD = "FF1E7B4F", BAD = "FFB3261E";
  var STYLES = {
    title: { font: { b: true, sz: 20, color: ACCENT } },
    subtitle: { font: { sz: 11, color: GRAY }, align: { wrap: true, v: "top" } },
    h2: { font: { b: true, sz: 14 }, border: null },
    note: { font: { sz: 10, color: GRAY }, align: { wrap: true, v: "top" } },
    bold: { font: { b: true } },
    big: { font: { b: true, sz: 14 }, align: { h: "right", v: "center", rtl: true } },
    toc: { font: { b: true, u: true, sz: 12, color: ACCENT } },
    step: { font: { b: true, color: ACCENT }, align: { v: "top" } },
    textTop: { align: { wrap: true, v: "top" } },
    date: { numFmt: "yyyy-mm-dd", align: { h: "center" } },
    num: { align: { h: "center" } },
    pct: { numFmt: "0%", align: { h: "center" } },
    gray: { font: { sz: 9, color: GRAY } },
    blockHead: { font: { b: true, sz: 12 }, fill: "FFE8EEF8", align: { v: "center", wrap: true } },
    blockWord: { font: { b: true, sz: 16 }, fill: "FFE8EEF8", align: { h: "right", v: "center", rtl: true } },
    blockLink: { font: { u: true, color: ACCENT }, fill: "FFE8EEF8", align: { v: "center" } },
    groupLabel: { font: { b: true, sz: 10, color: "FF374151" }, fill: "FFF3F5F9", align: { v: "center", wrap: true } },
    cell: { align: { h: "center", v: "center", wrap: true }, border: { color: "FFD5DCE8" } },
    cellMet: { fill: MET, align: { h: "center", v: "center", wrap: true }, border: { color: "FFE0B000" } },
    cellDone: { align: { h: "center", v: "center", wrap: true }, border: { color: GOOD, style: "medium" } },
    cellMetDone: { fill: MET, align: { h: "center", v: "center", wrap: true }, border: { color: GOOD, style: "medium" } },
    input: { fill: "FFFFFBEA", border: { color: "FFE0B000" }, font: { sz: 14 }, align: { h: "right", rtl: true } },
    check: { font: { b: true }, align: { wrap: true, v: "center" } },
    ok: { font: { b: true, color: GOOD }, fill: "FFE3F4EA" },
    bad: { font: { b: true, color: BAD }, fill: "FFFBE4E2" },
    overdue: { font: { b: true, color: BAD }, fill: "FFFBE4E2" },
    met: { fill: MET },
    weak: { font: { b: true, color: BAD } },
  };
  Object.keys(STATUS_FILL).forEach(function (s) { STYLES["st_" + s] = { fill: STATUS_FILL[s], align: { h: "center" } }; STYLES["sw_" + s] = { fill: STATUS_FILL[s] }; });
  // «не размечено» (the text lens): no fill, an amber frame and amber bold text — a word nobody has assessed yet
  var UNMARKED = "FFB45309";
  STYLES.st_none = { font: { b: true, color: UNMARKED }, align: { h: "center" }, border: { color: UNMARKED } };
  STYLES.sw_none = { font: { b: true, color: UNMARKED }, border: { color: UNMARKED } };
  STYLES.textRow = { font: { sz: 13 }, align: { h: "right", v: "top", wrap: true, rtl: true } };
  STYLES.wordLink = { font: { u: true, sz: 12, color: ACCENT }, align: { h: "center", v: "top", rtl: true } };
  // word colours inside a text line (rich runs carry a font colour, not a fill)
  var RUN_COLOR = { none: UNMARKED, "new": "FF7C3AED", l1: "FFB3261E", l2: "FFB45F06", l3: "FF2E7D32", l4: "FF1B4FB8" };

  var SHEET = { start: "start", words: "words", tables: "tables", forms: "forms", test: "test", progress: "progress" };
  function lab(L, k, fb) { return (L && L(k, fb)) || fb; }
  function fill(s, v) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v[k] == null ? m : String(v[k]); }); }
  // estimated row height for wrapped text in a column of `width` characters
  function linesFor(text, width) { var n = 0; String(text || "").split("\n").forEach(function (p) { n += Math.max(1, Math.ceil(p.length / Math.max(8, width * 1.05))); }); return n; }

  // Excel: strip niqqud / maqaf / spaces and fold final letters of the answer cell (UNICHAR = Excel 2013+, LibreOffice, Google)
  var STRIP = [1456, 1457, 1458, 1459, 1460, 1461, 1462, 1463, 1464, 1465, 1466, 1467, 1468, 1469, 1471, 1473, 1474, 1476, 1477, 1479, 1470];
  var FINALS = [[1498, 1499], [1501, 1502], [1503, 1504], [1507, 1508], [1509, 1510]];   // ך→כ ם→מ ן→נ ף→פ ץ→צ
  function normFormula(ref) {
    var e = "TRIM(" + ref + ")";
    STRIP.forEach(function (c) { e = "SUBSTITUTE(" + e + ",_xlfn.UNICHAR(" + c + "),\"\")"; });
    FINALS.forEach(function (p) { e = "SUBSTITUTE(" + e + ",_xlfn.UNICHAR(" + p[0] + "),_xlfn.UNICHAR(" + p[1] + "))"; });
    return "SUBSTITUTE(SUBSTITUTE(" + e + ",\" \",\"\"),\"-\",\"\")";
  }

  // pick up to n forms of a table for the self-test: met & not mastered → not mastered → the rest, distinct tenses first
  function pickForms(table, n) {
    var all = [];
    (table.groups || []).forEach(function (g) { (g.forms || []).forEach(function (f) { all.push({ g: g, f: f }); }); });
    var rank = function (x) { return x.f.met && !x.f.mastered ? 0 : !x.f.mastered ? 1 : 2; };
    all.sort(function (a, b) { return rank(a) - rank(b); });
    var out = [], usedG = {};
    all.forEach(function (x) { if (out.length < n && !usedG[x.g.key]) { usedG[x.g.key] = 1; out.push(x); } });
    all.forEach(function (x) { if (out.length < n && out.indexOf(x) < 0) out.push(x); });
    return out;
  }

  function build(data, L) {
    data = data || {};
    var words = data.words || [], now = data.now || Date.now();
    var T = function (k, fb) { return lab(L, "dictionary.book." + k, fb); };
    var TX = data.text || null;   // the text lens: { title, famText, rows: [{ n, tokens: [{ t, key, status }], ru }] }
    var names = { text: T("sheetText", "Текст"), start: T("sheetStart", "Начать"), words: T("sheetWords", "Словарь"), tables: T("sheetTables", "Таблицы"), forms: T("sheetForms", "Формы"),
      test: T("sheetTest", "Проверь себя"), progress: T("sheetProgress", "Прогресс") };
    var toStart = function () { return { v: "‹ " + names.start, link: { sheet: names.start, ref: "A1" } }; };

    // row numbers are known up front so every sheet can link to every other
    var D0 = 3;   // data starts on row 3: row 1 = «‹ Начать» + what the sheet is, row 2 = the column header
    var topRow = function (text) { return [{ cells: [toStart(), { v: text, s: "note" }], height: 30 }]; };
    var wordRow = {}; words.forEach(function (w, i) { wordRow[w.key] = i + D0; });
    var tableRow = {}, r = 3;
    words.forEach(function (w) { if (w.table && w.table.groups && w.table.groups.length) { tableRow[w.key] = r; r += 1 + w.table.groups.length + 1; } });

    // ── Словарь ──
    var wc = [
      { header: T("cWord", "Слово"), width: 16, style: "big" }, { header: T("cTranslit", "Транслит"), width: 13 },
      { header: T("cMeaning", "Значение"), width: 26, wrap: true }, { header: T("cMine", "Мой перевод"), width: 18, wrap: true },
      { header: T("cPos", "Часть речи"), width: 10 }, { header: T("cBinyan", "Биньян"), width: 9 }, { header: T("cRoot", "Корень"), width: 8, rtl: true },
      { header: T("cStatus", "Статус"), width: 11 }, { header: T("cStrength", "Память, %"), width: 9, style: "num" },
      { header: T("cDue", "Повторить"), width: 11, style: "date" }, { header: T("cReps", "Повторений"), width: 11, style: "num" },
      { header: T("cLapses", "Срывов"), width: 8, style: "num" }, { header: TX ? T("cInText", "В этом тексте") : T("cOcc", "Встреч"), width: 8, style: "num" },
      { header: T("cExample", "Пример из моих текстов"), width: 38, rtl: true, wrap: true }, { header: T("cExampleRu", "Перевод примера"), width: 30, wrap: true },
      { header: T("cSource", "Текст"), width: 16, wrap: true }, { header: T("cTable", "Формы"), width: 14 },
      { header: "Pealim", width: 9 }, { header: T("cApp", "В приложении"), width: 12 },
      { header: T("cAdded", "Добавлено"), width: 11, style: "date" }, { header: T("cSeen", "Последний раз"), width: 11, style: "date" },
      { header: T("cMyNote", "Моя заметка"), width: 24, wrap: true }, { header: T("cKey", "Ключ"), width: 12, style: "gray" },
    ];
    var wordRows = words.map(function (w) {
      var ex = w.example, exRich = null;
      if (ex && ex.he) {
        var i = ex.at != null ? ex.at : -1, len = ex.len || 0;
        exRich = i >= 0 && len ? [{ t: ex.he.slice(0, i) }, { t: ex.he.slice(i, i + len), b: true, color: ACCENT }, { t: ex.he.slice(i + len) }] : [{ t: ex.he }];
      }
      var h = Math.min(90, 16 * Math.max(1, linesFor(ex && ex.he, 38), linesFor(ex && ex.ru, 30), linesFor(w.meaning, 26)) + 4);
      return { height: h, cells: [
        { v: w.he }, w.translit || "", w.meaning || "", w.mine || "", w.posText || "", w.binyan || "", w.root || "",
        { v: w.statusText || "", s: w.status ? "st_" + w.status : null },
        w.strength == null ? "" : w.strength, w.due ? X.dateSerial(w.due) : "", w.reps || "", w.lapses || "", w.occ || "",
        exRich ? { rich: exRich } : "", (ex && ex.ru) || "", (ex && ex.title) || "",
        tableRow[w.key] ? { v: (w.formsTotal ? w.formsMastered + "/" + w.formsTotal + " " : "") + T("toTable", "таблица ›"), link: { sheet: names.tables, ref: "A" + tableRow[w.key] }, tip: T("toTableTip", "Спряжение / склонение этого слова") } : "",
        w.pealimUrl ? { v: "Pealim ↗", link: { url: w.pealimUrl } } : "",
        w.appUrl ? { v: T("openApp", "открыть ↗"), link: { url: w.appUrl }, tip: T("openAppTip", "Статья слова в LinguistPro") } : "",
        w.added ? X.dateSerial(w.added) : "", w.lastSeen ? X.dateSerial(w.lastSeen) : "", "", w.key,
      ] };
    });
    var nW = words.length + D0 - 1;
    var wordsSheet = { name: names.words, tabColor: "FF1B4FB8", freeze: { rows: 2, cols: 1 }, top: topRow(T("wordsAbout", "Все слова выгрузки. «таблица ›» — спряжение/склонение слова, «открыть ↗» — статья слова в программе. Фильтры и сортировка — в строке заголовков.")), columns: wc, rows: wordRows, merges: ["B1:P1"],
      condFormats: words.length ? [
        { ref: "I" + D0 + ":I" + nW, rules: [{ type: "dataBar", color: "FF7BA3E0" }] },
        { ref: "J" + D0 + ":J" + nW, rules: [{ type: "expression", formula: "AND(J" + D0 + "<>\"\",J" + D0 + "<=TODAY())", style: "overdue" }] },
      ] : [],
      print: { landscape: true, fitWidth: true, titleRows: true, area: "A1:P" + nW } };

    // ── Таблицы ──
    var maxCells = 1;
    words.forEach(function (w) { ((w.table && w.table.groups) || []).forEach(function (g) { maxCells = Math.max(maxCells, (g.forms || []).length); }); });
    maxCells = Math.min(maxCells, 12);
    var tCols = [{ width: 20 }]; for (var c = 0; c < Math.max(9, maxCells); c++) tCols.push({ width: 15 });
    var tRows = [
      { cells: [{ v: T("tablesTitle", "Спряжение и склонение моих слов"), s: "title" }], height: 30 },
      { cells: [toStart(), { v: T("tablesLegend", "Жёлтым — формы, встреченные в ваших текстах. Зелёная рамка и ✓ — форма уверенно освоена в тренировке. «‹ к слову» возвращает в «Словарь»."), s: "note" }], height: 30 },
    ];
    var merges = ["B2:" + X.colName(Math.max(9, maxCells)) + "2"];
    words.forEach(function (w) {
      if (!tableRow[w.key]) return;
      // A ‹ к слову · B слово · C–D значение и транслит · E–G часть речи, биньян, корень, «уверенно m из t» · H Pealim · I LinguistPro
      var info = [w.posText, w.binyan, w.root ? T("root", "корень") + " " + w.root : "", w.formsTotal ? fill(T("formsSure", "уверенно {m} из {t}"), { m: w.formsMastered, t: w.formsTotal }) : ""].filter(Boolean).join(" · ");
      var head = [
        { v: "‹ " + T("toWord", "к слову"), link: { sheet: names.words, ref: "A" + wordRow[w.key] }, s: "blockLink" },
        { v: w.he, s: "blockWord" }, { v: [w.meaning, w.translit].filter(Boolean).join(" · "), s: "blockHead" }, { v: "", s: "blockHead" },
        { v: info, s: "blockHead" }, { v: "", s: "blockHead" }, { v: "", s: "blockHead" },
        w.pealimUrl ? { v: "Pealim ↗", link: { url: w.pealimUrl }, s: "blockLink" } : { v: "", s: "blockHead" },
        w.appUrl ? { v: "LinguistPro ↗", link: { url: w.appUrl }, s: "blockLink" } : { v: "", s: "blockHead" },
      ];
      for (var k = head.length; k < tCols.length; k++) head.push({ v: "", s: "blockHead" });
      tRows.push({ cells: head, height: 30 });
      merges.push("C" + tRows.length + ":D" + tRows.length, "E" + tRows.length + ":G" + tRows.length);
      w.table.groups.forEach(function (g) {
        var cells = [{ v: g.label, s: "groupLabel" }];
        (g.forms || []).slice(0, maxCells).forEach(function (f) {
          cells.push({ s: f.met && f.mastered ? "cellMetDone" : f.met ? "cellMet" : f.mastered ? "cellDone" : "cell",
            rich: [{ t: (f.mastered ? "✓ " : "") + f.label + "\n", sz: 8, color: GRAY }, { t: f.he, b: true, sz: 14 }, { t: f.translit ? "\n" + f.translit : "", i: true, sz: 9, color: GRAY }, { t: f.ru ? "\n" + f.ru : "", sz: 9 }] });
        });
        tRows.push({ cells: cells, height: 64 });
      });
      tRows.push([]);
    });
    if (!Object.keys(tableRow).length) tRows.push([{ v: T("noTables", "Среди выгруженных слов нет слов с таблицей форм."), s: "note" }]);
    var tablesSheet = { name: names.tables, tabColor: "FFE0B000", header: false, columns: tCols, rows: tRows, merges: merges, gridLines: false, print: { landscape: true, fitWidth: true } };

    // ── Формы (плоский список с фильтрами) ──
    var fRows = [];
    words.forEach(function (w) {
      ((w.table && w.table.groups) || []).forEach(function (g) {
        (g.forms || []).forEach(function (f) {
          fRows.push([{ v: w.he, link: { sheet: names.words, ref: "A" + wordRow[w.key] } }, g.label, f.label, { v: f.he }, f.translit || "", f.ru || "",
            f.met ? "✓" : "", f.seen ? (f.right || 0) + " / " + f.seen : "", f.mastered ? "✓" : "",
            { v: T("toTable", "таблица ›"), link: { sheet: names.tables, ref: "A" + tableRow[w.key] } }]);
        });
      });
    });
    var formsSheet = { name: names.forms, tabColor: "FFB08900", freeze: { rows: 2, cols: 1 }, top: topRow(T("formsAbout", "Все формы списком. Фильтр по колонкам «Время / группа», «Лицо», «Встречена у меня», «Уверенно»; слово ведёт в «Словарь», «таблица ›» — в «Таблицы».")), columns: [
      { header: T("cWord", "Слово"), width: 15, rtl: true }, { header: T("cGroup", "Время / группа"), width: 22 }, { header: T("cPerson", "Лицо"), width: 11 },
      { header: T("cForm", "Форма"), width: 15, style: "big" }, { header: T("cTranslit", "Транслит"), width: 13 }, { header: T("cFormRu", "Перевод формы"), width: 22 },
      { header: T("cMet", "Встречена у меня"), width: 10, style: "num" }, { header: T("cDrill", "Тренировка: верно / всего"), width: 12, style: "num" },
      { header: T("cMastered", "Уверенно"), width: 9, style: "num" }, { header: T("cTable", "Формы"), width: 11 },
    ], rows: fRows, merges: ["B1:J1"], condFormats: fRows.length ? [{ ref: "G" + D0 + ":G" + (fRows.length + D0 - 1), rules: [{ type: "beginsWith", text: "✓", style: "met" }] }] : [],
      print: { landscape: true, fitWidth: true, titleRows: true } };

    // ── Проверь себя ──
    var tests = [];
    words.forEach(function (w) {
      if (w.status === "ignore") return;
      if (w.meaning && w.he) tests.push({ kind: T("kindWord", "слово"), word: "", prompt: w.meaning + (w.posText ? " (" + w.posText + ")" : ""), answer: w.he, key: w.key });
    });
    words.forEach(function (w) {
      if (w.status === "ignore" || !w.table) return;
      pickForms(w.table, 3).forEach(function (x) {
        tests.push({ kind: T("kindForm", "форма"), word: w.he, prompt: x.g.label + " · " + x.f.label + (x.f.ru ? " — " + x.f.ru : ""), answer: x.f.he, key: w.key, form: true });
      });
    });
    tests = tests.slice(0, 400);
    var okText = "✓ " + T("right", "верно") + ": ", badText = "✗ " + T("answer", "ответ") + ": ";
    var testRows = tests.map(function (t, i) {
      var n = i + D0, defective = FD.skeleton(t.answer), plene = FD.skeleton(FD.pleneOf(t.answer));
      return { height: 24, cells: [
        t.kind, t.word ? { v: t.word, s: "big" } : "", t.prompt, { v: "", s: "input" },
        { f: "IF(D" + n + "=\"\",\"\",IF(OR(" + normFormula("D" + n) + "=H" + n + "," + normFormula("D" + n) + "=I" + n + "),\"" + okText + "\"&G" + n + ",\"" + badText + "\"&G" + n + "))", s: "check" },
        tableRow[t.key] ? { v: T("hint", "подсказка ›"), link: { sheet: names.tables, ref: "A" + tableRow[t.key] } } : { v: T("toWord", "к слову"), link: { sheet: names.words, ref: "A" + wordRow[t.key] } },
        t.answer, defective, plene,
      ] };
    });
    var nT = tests.length + D0 - 1;
    var testSheet = { name: names.test, tabColor: "FF1E7B4F", freeze: { rows: 2, cols: 0 }, autoFilter: false, top: topRow(T("testAbout", "Пишите ответ на иврите в жёлтой клетке и нажмите Enter: справа появится ✓ или правильный ответ. Огласовка не нужна; краткое и полное написание принимаются. «подсказка ›» — таблица слова.")), columns: [
      { header: T("cKind", "Что"), width: 8 }, { header: T("cWord", "Слово"), width: 14 }, { header: T("cTask", "Задание"), width: 40, wrap: true },
      { header: T("cYourAnswer", "Ваш ответ (иврит)"), width: 22 }, { header: T("cCheck", "Проверка"), width: 30 },
      { header: T("cHint", "Подсказка"), width: 12 },
      { header: "answer", hidden: true }, { header: "defective", hidden: true }, { header: "plene", hidden: true },
    ], rows: testRows, merges: ["B1:F1"], condFormats: tests.length ? [{ ref: "E" + D0 + ":E" + nT, rules: [{ type: "beginsWith", text: "✓", style: "ok" }, { type: "beginsWith", text: "✗", style: "bad" }] }] : [],
      print: { landscape: false, fitWidth: true, titleRows: true } };

    // ── Прогресс ──
    var P = data.progress || {}, pRows = [], pMerge = [];
    pRows.push({ cells: [{ v: T("progressTitle", "Прогресс словаря"), s: "title" }], height: 30 });
    pRows.push([toStart()]);
    pRows.push([]);
    pRows.push([{ v: T("pStatus", "Статус"), s: "header" }, { v: T("pNow", "Сейчас"), s: "header" }, { v: T("pWeek", "За неделю, Δ"), s: "header" }, { v: T("pMonth", "За месяц, Δ"), s: "header" }]);
    var stStart = pRows.length + 1;
    (P.statuses || []).forEach(function (s) { pRows.push([{ v: s.label, s: "sw_" + s.key }, { v: s.now, s: "num" }, { v: s.dWeek, s: "num" }, { v: s.dMonth, s: "num" }]); });
    var stEnd = pRows.length;
    pRows.push([]);
    (P.lines || []).forEach(function (l) { pRows.push([{ v: l[0], s: "bold" }, { v: l[1] }]); pMerge.push("B" + pRows.length + ":F" + pRows.length); });
    if (P.noHistory) { pRows.push([{ v: P.noHistory, s: "note" }]); pMerge.push("A" + pRows.length + ":F" + pRows.length); }
    pRows.push([]);
    pRows.push([{ v: T("pWeeks", "Повторения по неделям"), s: "h2" }]);
    pRows.push([{ v: T("pFrom", "Неделя"), s: "header" }, { v: T("pReviews", "Повторений"), s: "header" }, { v: T("pFails", "Срывов"), s: "header" }, { v: T("pAccuracy", "Точность"), s: "header" }]);
    var wkStart = pRows.length + 1;
    (P.weekly || []).forEach(function (w) { pRows.push([w.label, { v: w.n, s: "num" }, { v: w.fails, s: "num" }, w.n ? { v: Math.round((1 - w.fails / w.n) * 100) / 100, s: "pct" } : ""]); });
    var wkEnd = pRows.length;
    pRows.push([]);
    pRows.push([{ v: T("pWeak", "Слабые места"), s: "h2" }]);
    pRows.push([{ v: T("pWhat", "Что"), s: "header" }, { v: T("pGroup", "Группа"), s: "header" }, { v: T("pErrors", "Ошибок / срывов"), s: "header" }, { v: T("pOf", "Из"), s: "header" }, { v: T("pRate", "Доля"), s: "header" }, { v: T("pWords", "Слов"), s: "header" }]);
    var wkS = pRows.length + 1;
    (P.weak || []).forEach(function (g) { pRows.push([g.dim, { v: g.label + (g.weak ? "  ⚠" : ""), s: g.weak ? "weak" : null }, { v: g.fails, s: "num" }, { v: g.of, s: "num" }, { v: Math.round(g.rate * 100) / 100, s: "pct" }, { v: g.words, s: "num" }]); });
    var wkE = pRows.length;
    if (!(P.weak || []).length) { pRows.push([{ v: T("pWeakFew", "Пока мало данных для слабых мест: нужно хотя бы 3 слова и 8 повторений в группе (формы — 6 ответов)."), s: "note" }]); pMerge.push("A" + pRows.length + ":F" + pRows.length); }
    var progressSheet = { name: names.progress, tabColor: "FF7C3AED", header: false, gridLines: false, columns: [{ width: 22 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 10 }],
      rows: pRows, merges: pMerge, condFormats: [].concat(
        stEnd >= stStart ? [{ ref: "B" + stStart + ":B" + stEnd, rules: [{ type: "dataBar", min: 0, max: Math.max(1, P.maxStatus || 1), color: "FF7BA3E0" }] }] : [],
        wkEnd >= wkStart ? [{ ref: "B" + wkStart + ":B" + wkEnd, rules: [{ type: "dataBar", min: 0, max: Math.max(1, P.maxWeek || 1), color: "FF7BA3E0" }] }] : [],
        wkE >= wkS ? [{ ref: "E" + wkS + ":E" + wkE, rules: [{ type: "dataBar", min: 0, max: 1, color: "FFE59A93" }] }] : []),
      print: { landscape: false, fitWidth: true } };

    // ── Начать ──
    var sRows = [], sMerge = [];
    var add = function (cells, h, merge) { sRows.push(h ? { cells: cells, height: h } : cells); if (merge) sMerge.push(merge.replace(/#/g, sRows.length)); };
    add([{ v: TX ? fill(T("titleText", "Слова текста «{t}»"), { t: TX.title }) : T("title", "Мой словарь · LinguistPro"), s: "title" }], 34, TX ? "A#:C#" : null);
    if (TX && TX.famText) add([{ v: TX.famText, s: "bold" }], 20, "A#:C#");
    add([{ v: fill(T("meta", "Выгружено {date} · слов: {n} · с таблицами форм: {t}{filter}"), { date: data.dateText || "", n: words.length, t: Object.keys(tableRow).length, filter: data.filterText ? " · " + T("filter", "фильтр") + ": " + data.filterText : "" }), s: "subtitle" }], 20, "A#:C#");
    add([{ v: T("snapshot", "Это снимок словаря для работы вне программы. Правки в файле не меняют программу; чтобы отметить слово или повторить его в тренировке, откройте его по ссылке «В приложении ↗»."), s: "note" }], 32, "A#:C#");
    add([]);
    add([{ v: T("today", "Повторить сегодня"), s: "h2" }], 22);
    var due = words.filter(function (w) { return w.due && w.due <= now + 86400000 && w.status !== "ignore"; }).sort(function (a, b) { return a.due - b.due; });
    if (due.length) due.slice(0, 15).forEach(function (w) {
      add([{ v: w.he, link: { sheet: names.words, ref: "A" + wordRow[w.key] }, s: "toc" }, w.meaning || "", { v: X.dateSerial(w.due), s: "date" }]);
    });
    else add([{ v: T("todayNone", "Сегодня по расписанию повторять нечего — начните с листа «Проверь себя»."), s: "note" }], 18, "A#:C#");
    if (due.length > 15) add([{ v: fill(T("todayMore", "и ещё {n} — отсортируйте «Словарь» по колонке «Повторить»"), { n: due.length - 15 }), s: "note" }], 18, "A#:C#");
    add([]);
    add([{ v: T("selfTest", "Проверь себя: результат"), s: "h2" }], 22);
    var rng = "'" + names.test.replace(/'/g, "''") + "'!E" + D0 + ":E" + Math.max(D0, nT);
    add([{ v: T("scoreRight", "Верно") }, { f: "COUNTIF(" + rng + ",\"✓*\")", s: "ok" }]);
    add([{ v: T("scoreWrong", "Ошибок") }, { f: "COUNTIF(" + rng + ",\"✗*\")", s: "bad" }]);
    add([{ v: T("scoreLeft", "Осталось") }, { f: tests.length + "-COUNTIF(" + rng + ",\"✓*\")-COUNTIF(" + rng + ",\"✗*\")", s: "bold" }]);
    add([]);
    add([{ v: T("contents", "Содержание"), s: "h2" }], 22);
    (TX ? [[names.text, "A1", T("tocText", "Текст строка за строкой с переводом: неразмеченные слова — оранжевым, изучаемые — цветом статуса; справа от строки — её незнакомые слова, каждое ведёт к своей строке «Словаря».")]] : []).concat([[names.words, "A1", T("tocWords", "Все слова: значение, статус и память, пример из ваших текстов со словом жирным, ссылки на таблицу форм, Pealim и программу.")],
     [names.tables, "A1", T("tocTables", "Спряжение / склонение каждого слова, как у Pealim: время в строке, в клетке лицо, форма, транслит и перевод. Жёлтым — формы из ваших текстов.")],
     [names.forms, "A1", T("tocForms", "Все формы всех слов одним списком. Фильтр по времени, лицу, «встречена у меня», «уверенно» — для работы по шаблону сразу на многих словах.")],
     [names.test, "D" + D0, T("tocTest", "Напишите слово или форму на иврите в жёлтой клетке — справа сразу появится ✓ или правильный ответ. Огласовка не нужна; краткое и полное написание принимаются.")],
     [names.progress, "A1", T("tocProgress", "Статусы и их изменение за неделю и месяц, повторения по неделям, слабые места по части речи, биньяну и времени.")]]).forEach(function (x) {
      add([{ v: x[0] + " ›", link: { sheet: x[0], ref: x[1] }, s: "toc" }, { v: x[2], s: "textTop" }], Math.max(34, 16 * linesFor(x[2], 76) + 4), "B#:C#");
    });
    add([]);
    add([{ v: T("how", "Как заниматься"), s: "h2" }], 22);
    [T("how1", "Начните с «Повторить сегодня»: перейдите к слову, прочитайте пример из своего текста вслух."),
     T("how2", "Откройте «таблица ›» у слова: сначала жёлтые формы — те, что вы уже встречали, потом соседние лица того же времени."),
     T("how3", "Закройте таблицу и пройдите «Проверь себя»: пишите ответ сами, а не выбирайте. Ошибка — сразу смотрите подсказку."),
     T("how4", "Формы с ошибками отфильтруйте на листе «Формы» по времени и повторите их на нескольких словах подряд."),
     T("how5", "Раз в неделю — «Прогресс»: что поднялось по шкале и где слабые места. Слабое место тренируйте в программе («Тренировать это»).")]
      .forEach(function (s, i) { add([{ v: String(i + 1), s: "step" }, { v: s, s: "textTop" }], 32, "B#:C#"); });
    add([]);
    add([{ v: T("legend", "Цвета"), s: "h2" }], 22);
    (data.statusLegend || []).forEach(function (s) { add([{ v: s.label, s: "sw_" + s.key }, { v: s.hint || "", s: "note" }]); });
    add([{ v: T("legendMet", "форма из ваших текстов"), s: "met" }, { v: T("legendMetHint", "лист «Таблицы»"), s: "note" }]);
    add([{ v: "✓", s: "cellDone" }, { v: T("legendDone", "форма уверенно освоена (2 верных ответа подряд в тренировке)"), s: "note" }]);
    add([{ v: T("legendOverdue", "дата повторения"), s: "overdue" }, { v: T("legendOverdueHint", "срок наступил — красным, пересчитывается каждый день"), s: "note" }]);
    var startSheet = { name: names.start, tabColor: "FF0F172A", header: false, selected: true, gridLines: false, columns: [{ width: 30 }, { width: 62 }, { width: 18 }], rows: sRows, merges: sMerge, print: { fitWidth: true } };

    // ── Текст (the text lens) ──
    var textSheet = null;
    if (TX) {
      var MAXW = 8, xRows = [{ cells: ["", toStart(), { v: T("textAbout", "Оранжевым — слова без отметки, цветом — изучаемые; справа — незнакомые слова строки, каждое ведёт в «Словарь»."), s: "note" }], height: 30 }];
      var xCols = [{ header: "№", width: 5, style: "num" }, { header: T("cHebrew", "Иврит"), width: 58 }, { header: T("cRu", "Перевод"), width: 44, wrap: true }];
      for (var wi = 0; wi < MAXW; wi++) xCols.push({ header: wi === 0 ? T("cLineWords", "Незнакомые слова строки") : "", width: wi === 0 ? 16 : 13 });
      (TX.rows || []).forEach(function (row) {
        var runs = (row.tokens || []).map(function (tk) {
          var c = tk.key && RUN_COLOR[tk.status];
          return c ? { t: tk.t, b: true, color: c } : { t: tk.t };
        });
        var seen = {}, wcells = [];
        (row.tokens || []).forEach(function (tk) {
          if (!tk.key || seen[tk.key] || !RUN_COLOR[tk.status] || wcells.length >= MAXW) return;
          seen[tk.key] = 1;
          wcells.push(wordRow[tk.key] ? { v: tk.lemma || tk.t, link: { sheet: names.words, ref: "A" + wordRow[tk.key] }, s: "wordLink" } : { v: tk.lemma || tk.t, s: "wordLink" });
        });
        var h = 18 * Math.max(1, linesFor((row.tokens || []).map(function (x) { return x.t; }).join(""), 52), linesFor(row.ru, 44)) + 6;
        xRows.push({ height: Math.min(120, h), cells: [row.n, { rich: runs.length ? runs : [{ t: "" }], s: "textRow" }, row.ru || ""].concat(wcells) });
      });
      textSheet = { name: names.text, tabColor: "FFB45309", top: xRows.slice(0, 1), freeze: { rows: 2, cols: 0 }, autoFilter: false, columns: xCols, rows: xRows.slice(1),
        merges: ["C1:G1"], print: { landscape: true, fitWidth: true, titleRows: true } };
    }
    return { sheets: [startSheet, wordsSheet].concat(textSheet ? [textSheet] : []).concat([tablesSheet, formsSheet, testSheet, progressSheet]), styles: STYLES,
      meta: { tableRow: tableRow, wordRow: wordRow, tests: tests.length, forms: fRows.length } };
  }

  return { build: build, normFormula: normFormula, pickForms: pickForms, STATUS_FILL: STATUS_FILL, SHEET: SHEET };
});
