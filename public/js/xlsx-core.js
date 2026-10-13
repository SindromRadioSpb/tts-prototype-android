// public/js/xlsx-core.js — писатель XLSX (Office Open XML) без зависимостей: части книги как строки.
// Упаковку в zip делает вызывающий (JSZip из /db/jszip.min.js). Пользователь — учебная книга «Мой словарь»
// (docs/planning/word-layer/F4_XLSX_PREMIUM_SPEC_2026_10_13.md).
//
// buildParts({ sheets, styles }) или buildParts([sheet…]) (простая форма: колонки с header + строки-массивы).
// sheet = { name, tabColor, rtl, freeze: { rows, cols }, columns: [{ header, width, hidden, rtl, wrap, style }],
//           rows: [ [cell…] | { cells: [cell…], height } ], header: bool (default: есть ли header у колонок),
//           merges: ['A1:D1'], autoFilter: true | 'A1:D9', condFormats: [{ ref, rules: [...] }],
//           print: { landscape, fitWidth, titleRows: 1 } }
// cell  = значение | { v, s: имя стиля, f: формула, link: { sheet, ref } | { url }, rich: [{ t, b, i, sz, color }] }
// style = { font: { b, i, u, sz, color }, fill: 'FFRRGGBB', align: { h, v, wrap, rtl, indent }, numFmt: 'yyyy-mm-dd',
//           border: { color, style } }   — правила условного форматирования берут стиль по имени (dxf).
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.XlsxCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  var HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  function esc(s) {
    return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function colName(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  // Excel forbids []:*?/\ in sheet names and caps them at 31 characters
  function sheetName(n, i) { var s = String(n || "").replace(/[\[\]:*?\/\\]/g, " ").trim().slice(0, 31); return s || "Sheet" + (i + 1); }
  function quoteSheet(n) { return "'" + String(n).replace(/'/g, "''") + "'"; }
  // JS time → Excel date serial (local day; 1900 date system)
  function dateSerial(t) { var d = new Date(t); if (!Number.isFinite(d.getTime())) return null; return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000) + 25569); }

  // ── styles registry: fonts / fills / borders / numFmts / xfs, deduplicated; dxfs for conditional formats ──
  var BUILTIN = {
    header: { font: { b: true }, fill: "FFE8EEF8", align: { v: "center", wrap: true } },
    rtl: { align: { h: "right", rtl: true } },
    wrap: { align: { v: "top", wrap: true } },
    link: { font: { u: true, color: "FF1B4FB8" } },
  };
  function fontXml(f) {
    f = f || {};
    return "<font>" + (f.b ? "<b/>" : "") + (f.i ? "<i/>" : "") + (f.u ? '<u/>' : "") + (f.color ? '<color rgb="' + f.color + '"/>' : "") +
      '<sz val="' + (f.sz || 11) + '"/><name val="' + esc(f.name || "Calibri") + '"/></font>';
  }
  function fillXml(c) { return c ? '<fill><patternFill patternType="solid"><fgColor rgb="' + c + '"/><bgColor indexed="64"/></patternFill></fill>' : ""; }
  function borderXml(b) {
    if (!b) return "<border><left/><right/><top/><bottom/><diagonal/></border>";
    var side = function (n) { return "<" + n + ' style="' + (b.style || "thin") + '"><color rgb="' + (b.color || "FFB8C4D6") + '"/></' + n + ">"; };
    return "<border>" + side("left") + side("right") + side("top") + side("bottom") + "<diagonal/></border>";
  }
  function alignXml(a) {
    if (!a) return "";
    var at = [];
    if (a.h) at.push('horizontal="' + a.h + '"');
    if (a.v) at.push('vertical="' + a.v + '"');
    if (a.wrap) at.push('wrapText="1"');
    if (a.indent) at.push('indent="' + a.indent + '"');
    if (a.rtl) at.push('readingOrder="2"');
    return at.length ? "<alignment " + at.join(" ") + "/>" : "";
  }
  function Styles(defs) {
    var fonts = [fontXml({})], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'],
      borders = [borderXml(null)], numFmts = [], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], dxfs = [];
    var byName = {}, dxfByName = {};
    function idx(arr, x) { var i = arr.indexOf(x); if (i < 0) { arr.push(x); i = arr.length - 1; } return i; }
    function fmtId(code) { if (!code) return 0; var i = numFmts.indexOf(code); if (i < 0) { numFmts.push(code); i = numFmts.length - 1; } return 164 + i; }
    function xfFor(d) {
      var f = d.font ? idx(fonts, fontXml(d.font)) : 0, fl = d.fill ? idx(fills, fillXml(d.fill)) : 0, b = d.border ? idx(borders, borderXml(d.border)) : 0, n = fmtId(d.numFmt);
      var al = alignXml(d.align);
      return idx(xfs, '<xf numFmtId="' + n + '" fontId="' + f + '" fillId="' + fl + '" borderId="' + b + '" xfId="0"' + (f ? ' applyFont="1"' : "") +
        (fl ? ' applyFill="1"' : "") + (b ? ' applyBorder="1"' : "") + (n ? ' applyNumberFormat="1"' : "") + (al ? ' applyAlignment="1">' + al + "</xf>" : "/>"));
    }
    var all = Object.assign({}, BUILTIN, defs || {});
    return {
      id: function (name) {
        if (!name) return 0;
        if (byName[name] == null) { var d = all[name]; byName[name] = d ? xfFor(d) : 0; }
        return byName[name];
      },
      // a combination: base style + extra (e.g. column rtl + a cell style)
      combo: function (names) {
        var key = names.filter(Boolean).join("+"); if (!key) return 0;
        if (byName[key] == null) {
          var d = {}; names.filter(Boolean).forEach(function (n) { var x = all[n] || {}; d = { font: Object.assign({}, d.font, x.font), fill: x.fill || d.fill, border: x.border || d.border, numFmt: x.numFmt || d.numFmt, align: Object.assign({}, d.align, x.align) }; });
          if (!Object.keys(d.font).length) delete d.font; if (!Object.keys(d.align).length) delete d.align;
          byName[key] = xfFor(d);
        }
        return byName[key];
      },
      dxf: function (name) {
        if (dxfByName[name] == null) {
          var d = all[name] || {}, f = d.font || {};
          dxfs.push("<dxf>" + (d.font ? "<font>" + (f.b ? "<b/>" : "") + (f.color ? '<color rgb="' + f.color + '"/>' : "") + "</font>" : "") +
            (d.fill ? '<fill><patternFill patternType="solid"><fgColor rgb="' + d.fill + '"/><bgColor rgb="' + d.fill + '"/></patternFill></fill>' : "") + "</dxf>");
          dxfByName[name] = dxfs.length - 1;
        }
        return dxfByName[name];
      },
      xml: function () {
        return HEAD + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          (numFmts.length ? '<numFmts count="' + numFmts.length + '">' + numFmts.map(function (c, i) { return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + esc(c) + '"/>'; }).join("") + "</numFmts>" : "") +
          '<fonts count="' + fonts.length + '">' + fonts.join("") + "</fonts>" + '<fills count="' + fills.length + '">' + fills.join("") + "</fills>" +
          '<borders count="' + borders.length + '">' + borders.join("") + "</borders>" +
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
          '<cellXfs count="' + xfs.length + '">' + xfs.join("") + "</cellXfs>" + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
          '<dxfs count="' + dxfs.length + '">' + dxfs.join("") + "</dxfs></styleSheet>";
      },
    };
  }

  function richXml(runs) {
    return "<is>" + runs.filter(function (r) { return r && r.t != null && r.t !== ""; }).map(function (r) {
      var pr = (r.b ? "<b/>" : "") + (r.i ? "<i/>" : "") + (r.color ? '<color rgb="' + r.color + '"/>' : "") + (r.sz ? '<sz val="' + r.sz + '"/>' : "");
      return "<r>" + (pr ? "<rPr>" + pr + "</rPr>" : "") + '<t xml:space="preserve">' + esc(String(r.t).slice(0, 32767)) + "</t></r>";
    }).join("") + "</is>";
  }

  function sheetXml(sh, names, st, rels) {
    var cols = sh.columns || [], rows = sh.rows || [], links = [];
    var hasHeader = sh.header != null ? sh.header : cols.some(function (c) { return c && c.header != null; });
    var top = sh.top || [], H = top.length + (hasHeader ? 1 : 0);   // rows above the header (a title / a link back), then the header
    var allRows = top.concat(hasHeader ? [{ cells: cols.map(function (c) { return { v: c.header, s: "header" }; }), header: true }] : []).concat(rows);
    var out = [HEAD + "<worksheet " + NS + ">"];
    out.push("<sheetPr>" + (sh.tabColor ? '<tabColor rgb="' + sh.tabColor + '"/>' : "") + (sh.print && sh.print.fitWidth ? '<pageSetUpPr fitToPage="1"/>' : "") + "</sheetPr>");
    var fr = sh.freeze || (hasHeader ? { rows: H } : null), pane = "";
    if (fr && (fr.rows || fr.cols)) {
      var tl = colName(fr.cols || 0) + ((fr.rows || 0) + 1), ap = fr.rows && fr.cols ? "bottomRight" : fr.rows ? "bottomLeft" : "topRight";
      pane = "<pane" + (fr.cols ? ' xSplit="' + fr.cols + '"' : "") + (fr.rows ? ' ySplit="' + fr.rows + '"' : "") + ' topLeftCell="' + tl + '" activePane="' + ap + '" state="frozen"/>';
    }
    out.push('<sheetViews><sheetView workbookViewId="0"' + (sh.rtl ? ' rightToLeft="1"' : "") + (sh.selected ? ' tabSelected="1"' : "") + (sh.gridLines === false ? ' showGridLines="0"' : "") + ">" + pane + "</sheetView></sheetViews>");
    out.push('<sheetFormatPr defaultRowHeight="15"/>');
    if (cols.length) out.push("<cols>" + cols.map(function (c, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + ((c && Number(c.width)) || 14) + '" customWidth="1"' + (c && c.hidden ? ' hidden="1"' : "") + "/>"; }).join("") + "</cols>");
    out.push("<sheetData>");
    allRows.forEach(function (row, ri) {
      var n = ri + 1, cells = Array.isArray(row) ? row : (row && row.cells) || [];
      var attrs = row && !Array.isArray(row) && row.height ? ' ht="' + row.height + '" customHeight="1"' : "";
      var xs = cells.map(function (raw, ci) {
        var c = raw != null && typeof raw === "object" && !(raw instanceof Date) ? raw : { v: raw }, col = cols[ci] || {}, ref = colName(ci) + n;
        var hdr = row && row.header, isTop = ri < top.length;   // title rows above the header take no column style
        if (c.link) links.push({ ref: ref, link: c.link, tip: c.tip });
        var names = hdr ? ["header"] : isTop ? [c.link && !c.s ? "link" : null, c.s] : [col.rtl ? "rtl" : col.wrap ? "wrap" : null, col.style, c.link && !c.s ? "link" : null, c.s];
        var s = st.combo(names), sa = s ? ' s="' + s + '"' : "";
        if (c.f) return '<c r="' + ref + '"' + sa + ' t="str"><f>' + esc(String(c.f).replace(/^=/, "")) + "</f></c>";
        if (c.rich) return '<c r="' + ref + '"' + sa + ' t="inlineStr">' + richXml(c.rich) + "</c>";
        var v = c.v;
        if (v == null || v === "") return s ? '<c r="' + ref + '"' + sa + "/>" : "";
        if (typeof v === "number" && Number.isFinite(v)) return '<c r="' + ref + '"' + sa + "><v>" + v + "</v></c>";
        if (typeof v === "boolean") return '<c r="' + ref + '"' + sa + ' t="b"><v>' + (v ? 1 : 0) + "</v></c>";
        return '<c r="' + ref + '"' + sa + ' t="inlineStr">' + richXml([{ t: v }]) + "</c>";
      }).join("");
      out.push('<row r="' + n + '"' + attrs + ">" + xs + "</row>");
    });
    out.push("</sheetData>");
    var af = autoFilterRef(sh, cols, rows, hasHeader, H);
    if (af) out.push('<autoFilter ref="' + af + '"/>');
    if (sh.merges && sh.merges.length) out.push('<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join("") + "</mergeCells>");
    var prio = 1;
    (sh.condFormats || []).forEach(function (cf) {
      out.push('<conditionalFormatting sqref="' + cf.ref + '">' + cf.rules.map(function (r) {
        if (r.type === "dataBar") return '<cfRule type="dataBar" priority="' + (prio++) + '"><dataBar><cfvo type="num" val="' + (r.min || 0) + '"/><cfvo type="num" val="' + (r.max == null ? 100 : r.max) + '"/><color rgb="' + (r.color || "FF7BA3E0") + '"/></dataBar></cfRule>';
        if (r.type === "beginsWith") return '<cfRule type="beginsWith" dxfId="' + st.dxf(r.style) + '" priority="' + (prio++) + '" operator="beginsWith" text="' + esc(r.text) + '"><formula>LEFT(' + cf.ref.split(":")[0] + "," + r.text.length + ')="' + esc(r.text) + '"</formula></cfRule>';
        return '<cfRule type="expression" dxfId="' + st.dxf(r.style) + '" priority="' + (prio++) + '"><formula>' + esc(r.formula) + "</formula></cfRule>";
      }).join("") + "</conditionalFormatting>");
    });
    if (links.length) {
      out.push("<hyperlinks>" + links.map(function (l) {
        var tip = l.tip ? ' tooltip="' + esc(l.tip) + '"' : "";
        if (l.link.url) { rels.push(l.link.url); return '<hyperlink ref="' + l.ref + '" r:id="rId' + rels.length + '"' + tip + "/>"; }
        var target = l.link.sheet != null ? quoteSheet(names[l.link.sheet] != null ? names[l.link.sheet] : l.link.sheet) + "!" + (l.link.ref || "A1") : l.link.ref;
        return '<hyperlink ref="' + l.ref + '" location="' + esc(target) + '" display="' + esc(l.ref) + '"' + tip + "/>";
      }).join("") + "</hyperlinks>");
    }
    out.push('<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>');
    if (sh.print) out.push('<pageSetup paperSize="9"' + (sh.print.landscape ? ' orientation="landscape"' : "") + (sh.print.fitWidth ? ' fitToWidth="1" fitToHeight="0"' : "") + "/>");
    out.push("</worksheet>");
    return out.join("");
  }

  function autoFilterRef(sh, cols, rows, hasHeader, H) {
    if (typeof sh.autoFilter === "string") return sh.autoFilter;
    if (sh.autoFilter === false || !hasHeader || !rows.length || !cols.length) return "";
    return "A" + H + ":" + colName(cols.length - 1) + (H + rows.length);
  }
  // → { path: xml } — every part of a valid workbook
  function buildParts(input) {
    var book = Array.isArray(input) ? { sheets: input } : (input || {});
    var sheets = (book.sheets || []).length ? book.sheets : [{ name: "Sheet1", columns: [], rows: [] }];
    var names = [], parts = {}, st = Styles(book.styles);
    sheets.forEach(function (sh, i) { var n = sheetName(sh.name, i), k = 2; while (names.indexOf(n) >= 0) n = sheetName(sh.name, i).slice(0, 28) + " " + k++; names.push(n); });
    // links may name a sheet by its given name; map given → final
    var byGiven = {}; sheets.forEach(function (sh, i) { byGiven[sh.name] = names[i]; byGiven[i] = names[i]; });
    sheets.forEach(function (sh, i) {
      var rels = [];
      parts["xl/worksheets/sheet" + (i + 1) + ".xml"] = sheetXml(sh, byGiven, st, rels);
      if (rels.length) parts["xl/worksheets/_rels/sheet" + (i + 1) + ".xml.rels"] = HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        rels.map(function (u, k) { return '<Relationship Id="rId' + (k + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="' + esc(u) + '" TargetMode="External"/>'; }).join("") + "</Relationships>";
    });
    parts["[Content_Types].xml"] = HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      names.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") +
      "</Types>";
    parts["_rels/.rels"] = HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    var dn = [];
    sheets.forEach(function (sh, i) {
      var cols = (sh.columns || []).length, hasHeader = sh.header != null ? sh.header : (sh.columns || []).some(function (c) { return c && c.header != null; });
      var H = (sh.top || []).length + (hasHeader ? 1 : 0);
      var af = autoFilterRef(sh, sh.columns || [], sh.rows || [], hasHeader, H).replace(/([A-Z]+)(\d+)/g, "$$$1$$$2");
      if (af && cols) dn.push('<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">' + esc(quoteSheet(names[i])) + "!" + af + "</definedName>");
      if (sh.print && sh.print.area) dn.push('<definedName name="_xlnm.Print_Area" localSheetId="' + i + '">' + esc(quoteSheet(names[i])) + "!" + sh.print.area.replace(/([A-Z]+)(\d+)/g, function (_, c, r) { return "$" + c + "$" + r; }) + "</definedName>");
      if (sh.print && sh.print.titleRows) dn.push('<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">' + esc(quoteSheet(names[i])) + "!$1:$" + (sh.print.titleRows === true ? H : sh.print.titleRows) + "</definedName>");
    });
    parts["xl/workbook.xml"] = HEAD + "<workbook " + NS + "><bookViews><workbookView activeTab=\"" + Math.max(0, sheets.findIndex(function (s) { return s.selected; })) + "\"/></bookViews><sheets>" +
      names.map(function (n, i) { return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + "</sheets>" +
      (dn.length ? "<definedNames>" + dn.join("") + "</definedNames>" : "") + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
    parts["xl/_rels/workbook.xml.rels"] = HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
      '<Relationship Id="rId' + (names.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    parts["xl/styles.xml"] = st.xml();   // last: every sheet has registered its styles
    return parts;
  }

  return { buildParts: buildParts, colName: colName, esc: esc, dateSerial: dateSerial, quoteSheet: quoteSheet };
});
