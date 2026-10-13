// public/js/xlsx-core.js — минимальный писатель XLSX (Office Open XML) без зависимостей: части книги как строки.
// Упаковку в zip делает вызывающий (JSZip из /db/jszip.min.js). Первый пользователь — выгрузка «Моего словаря»
// (docs/planning/word-layer/F4_D2_LEARNING_SPEC_2026_10_12.md, раздел XLSX).
//
// sheet = { name, columns: [{ header, width, rtl, num }], rows: [[value…]] }
// Строки — inline strings (без sharedStrings), числа — числа; шапка жирная и закреплена, на шапке автофильтр;
// колонки с rtl выравниваются справа-налево (иврит). Пустые/undefined ячейки не пишутся.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.XlsxCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function colName(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  // Excel forbids []:*?/\ in sheet names and caps them at 31 characters
  function sheetName(n, i) { var s = String(n || "").replace(/[\[\]:*?\/\\]/g, " ").trim().slice(0, 31); return s || "Sheet" + (i + 1); }

  // styles: 0 default · 1 header · 2 RTL text · 3 wrapped text
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF8"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" readingOrder="2"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function cell(ref, v, col) {
    if (v == null || v === "") return "";
    if (typeof v === "number" && Number.isFinite(v)) return '<c r="' + ref + '"><v>' + v + "</v></c>";
    var s = String(v); if (s.length > 32767) s = s.slice(0, 32767);
    var st = col && col.rtl ? ' s="2"' : col && col.wrap ? ' s="3"' : "";
    return '<c r="' + ref + '" t="inlineStr"' + st + '><is><t xml:space="preserve">' + esc(s) + "</t></is></c>";
  }
  function sheetXml(sh) {
    var cols = sh.columns || [], rows = sh.rows || [];
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
    out.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
    out.push('<sheetFormatPr defaultRowHeight="15"/>');
    if (cols.length) out.push("<cols>" + cols.map(function (c, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (Number(c.width) || 14) + '" customWidth="1"/>'; }).join("") + "</cols>");
    out.push("<sheetData>");
    out.push('<row r="1">' + cols.map(function (c, i) { return cell(colName(i) + "1", c.header, null).replace("<c ", '<c s="1" '); }).join("") + "</row>");
    rows.forEach(function (r, ri) {
      var n = ri + 2;
      out.push('<row r="' + n + '">' + (r || []).map(function (v, ci) { return cell(colName(ci) + n, v, cols[ci]); }).join("") + "</row>");
    });
    out.push("</sheetData>");
    if (cols.length && rows.length) out.push('<autoFilter ref="A1:' + colName(cols.length - 1) + (rows.length + 1) + '"/>');
    out.push("</worksheet>");
    return out.join("");
  }

  // → { path: xml } — every part of a valid workbook
  function buildParts(sheets) {
    sheets = (sheets || []).length ? sheets : [{ name: "Sheet1", columns: [], rows: [] }];
    var names = [], parts = {};
    sheets.forEach(function (sh, i) {
      var n = sheetName(sh.name, i), k = 2; while (names.indexOf(n) >= 0) n = sheetName(sh.name, i).slice(0, 28) + " " + k++;
      names.push(n);
      parts["xl/worksheets/sheet" + (i + 1) + ".xml"] = sheetXml(sh);
    });
    parts["[Content_Types].xml"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      names.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") +
      "</Types>";
    parts["_rels/.rels"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    parts["xl/workbook.xml"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map(function (n, i) { return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + "</sheets>" +
      (function () {   // the autofilter of each sheet needs its hidden defined name for Excel
        var dn = sheets.map(function (sh, i) {
          var c = (sh.columns || []).length, r = (sh.rows || []).length;
          return c && r ? '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + esc(names[i]).replace(/'/g, "''") + "'!$A$1:$" + colName(c - 1) + "$" + (r + 1) + "</definedName>" : "";
        }).join("");
        return dn ? "<definedNames>" + dn + "</definedNames>" : "";
      })() + "</workbook>";
    parts["xl/_rels/workbook.xml.rels"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
      '<Relationship Id="rId' + (names.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    parts["xl/styles.xml"] = STYLES;
    return parts;
  }

  return { buildParts: buildParts, colName: colName, esc: esc };
});
