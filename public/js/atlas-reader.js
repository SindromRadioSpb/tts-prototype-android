/* atlas-reader.js — Engineering atlas (נוסחאון 97002) in the Reading Room.
 * Data: /data/atlas/<id>/index.json and sections/<sid>.json, built by scripts/atlas/build_reader_data.py.
 * Spec: docs/planning/ENGINEERING_FORMULARY_ATLAS_DESIGN_2026_10_30.md §8; plan: ENGINEERING_ATLAS_P2_READER_PLAN_2026_10_31.md.
 * Formulas arrive as MathML generated at build time (KaTeX output, escaped), so no maths library runs here.
 * Supplier content stays visibly unconfirmed until the owner reviews it (statuses come from the data). */
(function (root) {
  'use strict';

  var HEB = /[א-ת]/;

  function makeT(t) {
    return function (key, fb) {
      try { if (typeof t === 'function') { var v = t(key, fb); if (v && v !== key) return v; } } catch (_) {}
      try { if (root.t) { var w = root.t(key); if (w && w !== key) return w; } } catch (_) {}
      return fb;
    };
  }

  function dirOf(text) {
    text = String(text || '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (HEB.test(ch)) return 'rtl';
      if (/[A-Za-zͰ-ϿЀ-ӿ]/.test(ch)) return 'ltr';
    }
    return /\d/.test(text) ? 'ltr' : 'rtl';
  }

  function factory(doc) {
    function h(tag, attrs, kids) {
      var node = doc.createElement(tag);
      attrs = attrs || {};
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'text') node.textContent = String(v);
        else if (k === 'html') node.innerHTML = v;   // only for build-time MathML
        else if (k === 'on') Object.keys(v).forEach(function (ev) { node.addEventListener(ev, v[ev]); });
        else node.setAttribute(k === 'cls' ? 'class' : k, v === true ? '' : String(v));
      });
      (kids || []).forEach(function (kid) { if (kid != null) node.appendChild(typeof kid === 'string' ? doc.createTextNode(kid) : kid); });
      return node;
    }
    // col: the word card's column of this cell («he» plain line, «niqqud» pointed line); none — not wrapped
    function heText(text, cls, col) {
      var attrs = { cls: cls || 'atlas-he', lang: 'he', dir: dirOf(text), text: text };
      if (col) attrs['data-col'] = col;
      return h('div', attrs);
    }
    // A row is a 2×2 grid (owner's layout, 2026-10-31): Hebrew | transliteration, then pointed Hebrew | translation.
    // The cells are direct children with a fixed column each; the grid packs the visible ones (atlas-reader.css),
    // so any column set from «Колонки» closes up without holes. Proofreading status lives in the page header.
    function renderBlock(T, item) {
      var row = h('div', { cls: 'atlas-row', 'data-ref': item.id });
      if (!item.ru) {
        row.appendChild(heText(item.he_raw || '', 'atlas-he atlas-raw'));
        row.appendChild(h('div', { cls: 'atlas-tr atlas-muted', text: T('atlas.noTranslation', 'нет перевода — исходный текст') }));
        return row;
      }
      // a row without a pointed line keeps its plain Hebrew even when the plain column is off
      row.appendChild(heText(item.he, item.he_niqqud ? 'atlas-he' : 'atlas-he atlas-he-sole', 'he'));
      if (item.translit) row.appendChild(h('div', { cls: 'atlas-translit', lang: 'he-Latn', text: item.translit }));
      if (item.translit_ru) row.appendChild(h('div', { cls: 'atlas-translit atlas-translit-ru', lang: 'he-Cyrl', text: item.translit_ru }));
      if (item.he_niqqud) row.appendChild(heText(item.he_niqqud, 'atlas-he atlas-niqqud', 'niqqud'));
      row.appendChild(h('div', { cls: 'atlas-ru', lang: 'ru', text: cleanMeta(item.ru) }));
      var note = readerNote(item.ambiguity_note);
      if (note) row.appendChild(h('div', { cls: 'atlas-note', text: note }));
      if (item.kind) row.setAttribute('data-kind', item.kind);
      return row;
    }

    // ---- margin marks of the book: 👍 advantages, 👎 drawbacks, ❗ attention ----
    // The supplier delivers them as tiny unnumbered «figures» in the page margin, a few points above the text
    // they mark. Shown as pictures at the end of the page they lost that link (owner, 2026-10-31); here each
    // mark becomes a labelled group around its own paragraph or run of list items.
    var MARKS = {
      pro: { emoji: '👍', key: 'atlas.mark.pro', ru: 'Преимущества', he: 'יתרונות' },
      con: { emoji: '👎', key: 'atlas.mark.con', ru: 'Недостатки', he: 'חסרונות' },
      attn: { emoji: '❗', key: 'atlas.mark.attn', ru: 'Обратите внимание', he: 'שימו לב' },
      goal: { emoji: '🎯', key: 'atlas.mark.goal', ru: 'Цель расчёта', he: 'מטרה' } };
    // Pictograms the supplier left without any label, identified by eye against the scan (audit 2026-10-31,
    // contact sheet of all 154 small pictures of the book): a target with an arrow, a thumb up.
    var MARK_BY_FIGURE = { 'a97002:p348:img01': 'goal', 'a97002:p349:img01': 'goal', 'a97002:p350:img01': 'goal',
      'a97002:p351:img01': 'goal', 'a97002:p450:img01': 'pro' };
    // Geometric-tolerance signs (ISO 1101) printed in the margin beside their subsection: shown as the sign itself.
    var GDT = /^[—⏤▱○⌭⌒⌓∥⊥∠↗◎⌖⌯⌰ⓂⓁ]$/;
    function markOf(f) {
      if (!f || !f.bbox) return null;
      var w = f.bbox[2] - f.bbox[0], ht = f.bbox[3] - f.bbox[1];
      if (w < 5 || ht < 5) return { kind: 'junk' };                 // 1×1 leftovers of the extraction
      if (MARK_BY_FIGURE[f.id]) return { kind: MARK_BY_FIGURE[f.id] };
      if (f.number != null || f.caption_he || f.caption_ru || !f.regions || f.regions.length !== 1) return null;
      if (w > 48 || ht > 48) return null;
      var he = String(f.regions[0].label_he || '').trim(), ru = String(f.regions[0].label_ru || '');
      if (he === '👍' || /преимущ|палец вверх/i.test(ru)) return { kind: 'pro' };
      if (he === '👎' || /недостат|палец вниз/i.test(ru)) return { kind: 'con' };
      if (he === '!' || he === '❗' || /вниман|восклиц/i.test(ru)) return { kind: 'attn' };
      if (he === '🎯' || /мишен/i.test(ru)) return { kind: 'goal' };
      if (GDT.test(he)) return { kind: 'sym', emoji: he === '—' ? '⏤' : he, ru: ru.replace(/[:;(].*$/, '').trim(), he: '' };
      return null;
    }
    function markKind(f) { var m = markOf(f); return m ? m.kind : null; }
    function markDesc(m) { return m.kind === 'sym' ? m : MARKS[m.kind]; }
    function itemY(item) { return typeof item.y === 'number' ? item.y : null; }

    // The supplier sometimes extracted a printed table a second time as «formulas»: a column of «=» signs, a
    // column of symbols (d, p, d₁, d₂), a column of numbers, a column header «A_t [mm²]». The table itself is
    // on the page, so these pieces only repeat it (audit 2026-10-31: 13 pages of «= = = =», p53 columns).
    // «M2 M2.5 M3 … 1.509 1.948 …»: a printed table read out as one line (p53). With the table on the page the
    // line only repeats it; a reader cannot use 200 numbers in a row.
    function flattenedTable(item, page) {
      if (!(page.tables || []).length) return false;
      // a line made only of the table's own cells, «;»-separated (p11: «סמך נייח; 2», «ΣMO = 0 — אין תנועה…»)
      var cellTexts = [];
      page.tables.forEach(function (t) { (t.cells || []).forEach(function (c) { var x = plain(c.he); if (x) cellTexts.push(x); }); });
      cellTexts.sort(function (a, b) { return b.length - a.length; });
      var line = plain(item.he || item.he_raw);
      if (line && line.indexOf(';') > 0) {
        var rest = line;
        cellTexts.forEach(function (c) { if (c.length >= 1) rest = rest.split(c).join(' '); });
        if (!/[^\s;:,.—–\-]/.test(rest)) return true;
      }
      // «;»-separated parts that are mostly the table's own cells (p251: the whole fatigue table in one line)
      var parts = line.split(/;\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (parts.length >= 6) {
        var cellSet = {};
        cellTexts.forEach(function (c) { cellSet[c] = true; });
        var inCells = parts.filter(function (x) { return cellSet[x] || cellTexts.some(function (c) { return c.length > 3 && (c.indexOf(x) >= 0 || x.indexOf(c) >= 0); }); }).length;
        if (inCells / parts.length >= 0.6) return true;
      }
      var words = line.split(' ').filter(Boolean);
      if (words.length < (item.kind === 'table_note' ? 5 : 12)) return false;
      var num = words.filter(function (w) { return /^[MМ]?\d+([.,]\d+)?[;,]?$|^[×x]\d/.test(w); }).length;
      return num / words.length >= 0.7;
    }

    function squash(x) { return String(x || '').toLowerCase().replace(/[^a-z0-9α-ω²³]/g, '').replace(/²/g, '2').replace(/³/g, '3'); }
    function tableKeys(page) {
      if (page._tk) return page._tk;
      var keys = [];
      (page.tables || []).forEach(function (t) { (t.cells || []).forEach(function (c) { var k = squash(c.he || c.ru); if (k) keys.push(k); }); });
      Object.defineProperty(page, '_tk', { value: keys, enumerable: false });
      return keys;
    }

    function loneSymbol(item) {
      var t = String(item.latex || item.source_text || '').replace(/\s|\\[,;!]|\\quad/g, '')
        .replace(/^\\mathrm\{([^{}]*)\}$/, '$1').replace(/^\\mathrm([A-Za-z])$/, '$1');   // «\mathrm N», p386
      if (!t || t.length > 14) return false;
      if (/[=<>+\-*/·×−≅≈≤≥]|\\(frac|sqrt|le|ge|leq|geq|cdot|times|pm|cong|approx|lt|gt)(?![a-z])|\d/.test(t)) return false;
      return /^\\?[A-Za-z]+(_\{?[A-Za-z0-9,]+\}?)?(\^\{?[A-Za-z0-9]+\}?)?$/.test(t);
    }

    function tableFragment(item, page) {
      var t = String(item.latex || item.source_text || '');
      var core = t.replace(/\\begin\{[a-z*]+\}(\{[^}]*\})?|\\end\{[a-z*]+\}|\\\\|&|\s|\\[,;!]|\\quad/g, '');
      if (/^=+$/.test(core)) return true;
      var op = /[=<>+\-*/·×−≅≈]|\\(frac|sqrt|le|ge|leq|geq|cdot|times|pm|sum|int|lt|gt|neq|approx|cong)(?![a-z])/.test(core);
      // a piece cut out of another formula on the page (p348: the numerator «[σe]πd₁²» of Q_max)
      if (!op && core.length >= 4 && (page.items || []).some(function (o) {
        return o !== item && o.type === 'formula' && String(o.latex || '').replace(/\s/g, '').indexOf(t.replace(/\s/g, '')) >= 0;
      })) return true;
      if (!(page.tables || []).length) return false;
      // a short formula that is the content of a table cell on the page (weld forms, p105: x_c = 0, bh, 2(b+h))
      var key = squash(core.replace(/\\[a-zA-Z]+/g, ''));
      if (key && key.length <= 8 && t.indexOf(String.fromCharCode(92)) < 0 && tableKeys(page).some(function (k) { return k === key || (key.length >= 3 && k.indexOf(key) >= 0); })) return true;
      if (!op && /\\begin\{[a-z*]+\}|\[\s*\\?(mathrm\{)?(mm|MPa|N|kN|kW)/.test(t)) return true;
      // a column of the table's numbers set as an array (p252: «HB [daN/mm²] 701 671 …»)
      if (/\\begin\{(array|matrix|gathered)\}/.test(t)) {
        var nums = (t.match(/(^|\\\\)\s*(\d+(?:\.\d+)?)\s*(?=\\\\|\\end)/g) || []).map(function (x) { return x.replace(/\\\\|\s/g, ''); });
        if (nums.length >= 4) {
          var keys = tableKeys(page);
          if (nums.filter(function (n) { return keys.indexOf(squash(n)) >= 0; }).length / nums.length >= 0.8) return true;
        }
      }
      return false;
    }

    // Page order as in the book: marks wrap their text, figures stand where they are printed (just above their
    // own caption line when there is one), tables follow the text (they carry no position).
    function layoutPage(page) {
      var items = (page.items || []).slice();   // a copy: layout may join split lines without touching the data
      var marks = [], figures = [];
      (page.figures || []).forEach(function (f) {
        var m = markOf(f);
        if (!m) figures.push(f);
        else if (m.kind !== 'junk') marks.push({ kind: m.kind, mark: m, y: f.bbox[1] });
      });
      var starts = {};
      marks.sort(function (a, b) { return a.y - b.y; }).forEach(function (m) {
        var at = -1;
        for (var i = 0; i < items.length; i++) { var y = itemY(items[i]); if (y != null && y >= m.y - 6) { at = i; break; } }
        if (at < 0) at = items.length - 1;
        if (at < 0) return;
        // two marks over one block (the supplier merged pros and cons into one line): keep both labels
        if (!starts[at]) starts[at] = { kind: m.kind, kinds: [m.kind], marks: [m.mark], end: at };
        else if (starts[at].kinds.indexOf(m.kind) < 0) { starts[at].kinds.push(m.kind); starts[at].marks.push(m.mark); starts[at].kind = 'mixed'; }
      });
      Object.keys(starts).forEach(function (k) {
        var g = starts[k], i = Number(k);
        if (items[i].kind !== 'list_item') return;
        while (i + 1 < items.length && items[i + 1].kind === 'list_item' && !starts[i + 1]) i++;
        g.end = i;
      });
      var before = {}, captionOf = {};
      figures.forEach(function (f) {
        var at = -1;
        if (f.number != null) {
          var re = new RegExp('איור\\s*' + f.number + '(?!\\d)');
          for (var i = 0; i < items.length; i++) if (items[i].kind === 'caption' && re.test(items[i].he || items[i].he_raw || '')) { at = i; break; }
          if (at >= 0 && !captionOf[at]) captionOf[at] = f; else at = -1;
        }
        if (at < 0) for (var j = 0; j < items.length; j++) { var y = itemY(items[j]); if (y != null && y > f.bbox[1]) { at = j; break; } }
        (before[at < 0 ? items.length : at] = before[at < 0 ? items.length : at] || []).push(f);
      });
      var dup = {};
      items.forEach(function (it, i) {
        if (it.type === 'formula' && tableFragment(it, page)) { dup[i] = true; return; }
        if (it.type !== 'formula' && flattenedTable(it, page)) { dup[i] = true; return; }
        // a bullet or punctuation mark alone on a line («•», p179)
        if (it.type !== 'formula' && !/[0-9A-Za-zא-תА-Яа-яα-ω]/.test((it.he || it.he_raw || '') + (it.ru || ''))) {
          dup[i] = true;
          // a closing «)» split off its heading («Плоскостность (Flatness» + «)», p493–497) goes back to it
          var pv = items[i - 1];
          if (/^\s*\)\s*$/.test(it.he || '') && pv && pv.type !== 'formula' && /\([^)]*$/.test(pv.ru || '')) {
            items[i - 1] = Object.assign({}, pv, { he: (pv.he || '') + ')', ru: pv.ru + ')',
              he_niqqud: pv.he_niqqud ? pv.he_niqqud + ')' : pv.he_niqqud, translit: pv.translit ? pv.translit + ')' : pv.translit,
              translit_ru: pv.translit_ru ? pv.translit_ru + ')' : pv.translit_ru });
          }
          return;
        }
        // a stray letter left by the extraction («t», p28): one or two Latin/Greek letters, translation the same
        if (it.type !== 'formula' && /^[(\[]?[A-Za-zα-ωΑ-Ω]{1,2}[)\]]?$/.test(plain(it.he || it.he_raw)) && plain(it.ru) === plain(it.he || it.he_raw)) { dup[i] = true; return; }   // also «(G», p450
        // a lone symbol as a «formula» («r_i», «F_i», «\mu»): no operator, no value — nothing to learn from it
        if (it.type === 'formula' && loneSymbol(it)) { dup[i] = true; return; }
        // a lone footnote mark «²⁶» (superscript digits only: a plain «1» is an example number)
        if (it.type !== 'formula' && /^[⁰¹²³⁴⁵⁶⁷⁸⁹\s]{1,4}$/.test(plain(it.he || it.he_raw)) && /^\[?\d{1,3}\]?$/.test(String(it.ru || '').trim())) { dup[i] = true; return; }
        var prev = items[i - 1];
        if (prev && it.type !== 'formula' && it.ru && it.ru === prev.ru && (it.he || '') === (prev.he || '') && (it.he || '').length > 3) dup[i] = true;
      });
      // text a margin mark (👍 👎 ❗ 🎯) belongs to always stays, even when a table repeats it
      Object.keys(starts).forEach(function (k) { for (var j = Number(k); j <= starts[k].end; j++) delete dup[j]; });
      var tl = placeTables(page, items);
      return { items: items, groups: starts, figuresBefore: before, captionOf: captionOf, duplicate: dup,
        tablesAfter: tl.after, tableFor: tl.replace, tablesAfterFigure: tl.figure, tablesEnd: tl.end, mirror: tl.mirror };
    }

    // Tables carry no position on the page. Their place is read from the text around them (checked on all
    // 371 tables of the book, 2026-10-31): a table whose cells the supplier also flattened into one text line
    // («M2 M2.5 M3…») takes that line's place; a table under its own title, or a symbol table under «טבלת
    // סמלים», follows that line; a table drawn from a scanned figure follows the figure; a table most of whose
    // words one paragraph names follows that paragraph. The rest stays at the end of the page, as before.
    function plain(s) { return String(s || '').replace(/[\u0591-\u05C7]/g, '').replace(/\s+/g, ' ').trim(); }
    // Column order. The supplier numbers columns sometimes in reading order (right to left, p21) and sometimes
    // left to right as on paper (p17, p30). A reader of the translation needs the reading order. A symbol table
    // starts with «סמל»; otherwise the table's own text flattened into one line is in reading order and tells.
    function mirrorTable(t, flat) {
      var head = (t.cells || []).filter(function (c) { return c.row === 0; }).sort(function (a, b) { return a.col - b.col; });
      if (head.length < 2) return false;
      var first = plain(head[0].he), last = plain(head[head.length - 1].he);
      if (last === 'סמל' && first !== 'סמל') return true;
      if (first === 'סמל') return false;
      if (!flat || !first || !last || first === last) return false;
      var a = flat.indexOf(first), b = flat.indexOf(last);
      return a >= 0 && b >= 0 && b < a;
    }

    function placeTables(page, items) {
      var out = { after: {}, replace: {}, figure: {}, end: [], mirror: {} };
      var figIds = {};
      (page.figures || []).forEach(function (f) { if (!markKind(f)) figIds[f.id] = true; });
      var texts = items.map(function (it) { return it.type === 'formula' ? '' : plain(it.he || it.he_raw); });
      (page.tables || []).forEach(function (t) {
        if (t.parent && figIds[t.parent]) { (out.figure[t.parent] = out.figure[t.parent] || []).push(t); return; }
        var cells = [], seen = {};
        (t.cells || []).forEach(function (c) {
          var x = plain(c.he);
          if (x.length > 1 && !/^[\d.,\s]+$/.test(x) && !seen[x]) { seen[x] = true; cells.push(x); }
        });
        var best = -1, bestHit = 0, second = 0;
        texts.forEach(function (txt, i) {
          if (!txt) return;
          var hit = cells.filter(function (c) { return txt.indexOf(c) >= 0; }).length;
          if (hit > bestHit) { second = bestHit; bestHit = hit; best = i; } else if (hit > second) second = hit;
        });
        var share = cells.length ? bestHit / cells.length : 0;
        if (mirrorTable(t, best >= 0 ? texts[best] : '')) out.mirror[t.id] = true;
        if (best >= 0 && share >= 0.8 && /^(other|table_note|symbol_row)$/.test(items[best].kind || '') && !out.replace[best]) { out.replace[best] = t; return; }
        var title = plain(t.title_he), at = -1;
        if (!title && seen['סמל'] && seen['תיאור']) title = 'טבלת סמלים';
        if (title) at = texts.findIndex(function (x) { return x && (x === title || x.indexOf(title) >= 0 || (x.length > 4 && title.indexOf(x) >= 0)); });
        if (at < 0 && best >= 0 && (share >= 0.3 || bestHit >= 3 || (share >= 0.15 && bestHit > second))) at = best;
        if (at < 0) { out.end.push(t); return; }
        (out.after[at] = out.after[at] || []).push(t);
      });
      return out;
    }

    function markHead(T, marks) {
      var head = h('div', { cls: 'atlas-mark-head' });
      [].concat(marks).forEach(function (mk) {
        if (typeof mk === 'string') mk = { kind: mk };
        var m = markDesc(mk);
        head.appendChild(h('span', { cls: 'atlas-mark-one', 'data-mark': mk.kind }, [
          h('span', { cls: 'atlas-mark-emoji', 'aria-hidden': mk.kind === 'sym' ? null : 'true', text: m.emoji }),
          h('span', { cls: 'atlas-l-ru', text: m.key ? T(m.key, m.ru) : m.ru }), m.he ? ' ' : null, m.he ? h('bdi', { lang: 'he', dir: 'rtl', text: m.he }) : null]));
      });
      return head;
    }

    function renderFormula(T, item) {
      // a calculation the extraction cut after «=»: the piece that starts with «=» continues the card above it
      var cont = /^\s*(=|\\approx|\\cong)/.test(String(item.latex || item.source_text || ''));
      var card = h('div', { cls: 'atlas-formula' + (cont ? ' atlas-cont' : ''), 'data-ref': item.id });
      if (item.mathml) card.appendChild(h('div', { cls: 'atlas-math', html: item.mathml }));
      // no MathML (the build could not typeset it, p332/p357): readable symbols line by line, never raw LaTeX
      else if (item.latex) {
        var box = h('div', { cls: 'atlas-math atlas-math-plain' });
        String(item.latex).replace(/\\(begin|end)\{[a-z*]+\}(\{[^}]*\})?/g, '').split(/\\\\/).forEach(function (line) {
          line = line.replace(/&/g, ' ').trim();
          if (line) box.appendChild(h('div', {}, texNodes(line)));
        });
        card.appendChild(box);
      }
      else if (item.source_text) card.appendChild(h('code', { cls: 'atlas-latex', text: item.source_text }));
      if (item.vars && item.vars.length) {
        var table = h('table', { cls: 'atlas-vars' });
        item.vars.forEach(function (v) {
          table.appendChild(h('tr', { 'data-ref': v.ref }, [
            h('td', { cls: 'atlas-var', html: v.mathml || null, text: v.mathml ? null : v.latex }),
            h('td', {}, [heText(v.he || '', 'atlas-he atlas-inline')]),
            h('td', { cls: 'atlas-l-ru', text: cleanMeta(v.ru) }), h('td', { cls: 'atlas-unit', text: v.unit || '' })]));
        });
        card.appendChild(table);
      }
      var fnote = readerNote(item.note);
      if (fnote) card.appendChild(h('div', { cls: 'atlas-note', text: fnote }));
      if (item.crop) {
        var orig = h('details', { cls: 'atlas-orig' }, [h('summary', { text: T('atlas.original', 'как в книге') }),
          h('img', { src: item.crop, alt: T('atlas.original', 'как в книге'), loading: 'lazy' }),
          item.lhs_restored ? h('div', { cls: 'atlas-muted atlas-l-ru', text: T('atlas.lhsRestored', 'Вырезка из книги показывает только правую часть; обозначение слева взято из текста страницы.') }) : null]);
        card.appendChild(orig);
      }
      return card;
    }

    // Regions are numbered pins with the labels in the legend below: text labels drawn over the scan covered the
    // book's own Hebrew labels and each other (acceptance R01; owner screenshot 2026-10-31, figure 10).
    // captionRow: the page's own caption line (with its study layers) replaces the short figcaption.
    // Supplier remarks about how a label was made («редакционное описание», «печатной подписи нет») are
    // for the editor, not the reader (audit 2026-10-31: 75 places in labels and table cells).
    function cleanMeta(text) {
      var t = String(text == null ? '' : text).replace(/⃗/g, '');   // combining vector arrow: no font draws it (p8 «F□»)
      if (/читаемого текста нет|обрезанн\S* (?:\S+ )?(?:штрих|след|фрагмент)/i.test(t)) return '';   // a scan artefact (p425–426)
      // «…; смысл и единицы источника обсуждаются в ambiguity_note» (p461–470): a pointer to the supplier's field
      t = t.replace(/[;,]?\s*[^;,]*\b(?:ambiguity_note|example\.steps|he_fix_note)\b[^;,]*/gi, '').trim();
      // variable labels of the dimension chains (p517–530): what the variable is, not how the supplier solved it
      t = t.replace(/,\s*относительно которого разрешено печатное уравнение\.?/gi, '')
        .replace(/^Результат данной печатной строки/i, 'Результат строки')
        .replace(/[;,]\s*числовые единицы явно не указаны\.?/gi, '');
      if (!/редакц|редактор|напечат|печатн|подпис|метк|пиктограмм|графический знач|отдельно от|display|неясн|буквально/i.test(t)) return t;
      // «Редакционное описание: два косозубых колеса; текстовых меток нет.» — the description stays, the prefix goes
      t = t.replace(/^\s*(?:редакционн|редакторск)\S*\s+\S+\s*:\s*/i, '');
      t = t.replace(/\s*\(\?\)/g, '');   // «(?)» — the supplier's doubt mark
      // bracketed remarks: «(редакционное описание)», «(так напечатано)», «[печатная подпись среднего рисунка]»
      t = t.replace(/\s*[(\[][^()\[\]]*(?:редакц|редактор|подпис|напечат|печатн|пиктограмм|графический знач|неясн|буквально)[^()\[\]]*[)\]]/gi, '');
      // a trailing remark after a comma or dash: «Прямой угол — редакционное описание…», «D — ведомый шкив, верхняя подпись»
      // a label about a scan artefact (p425–426: «обрезанный штрих… уверенно читаемого текста нет»)
      if (/читаемого текста нет|обрезанн\S* (?:\S+ )?(?:штрих|след|фрагмент)/i.test(t)) return '';
      t = t.replace(/\s*;\s*индекс показан в display\s*/gi, '');   // a variable label of the supplier's pipeline
      t = t.replace(/\s*[,—–]\s*(?:нечётк|неясн|редакц|редактор|повторн\S* внутренн|верхн\S* подпис|текстов\S* мет|несмотря на печатн|печатн)[^;.]*/gi, '');
      // remark clauses and sentences
      // (separators are kept, so sentence splitting of notes downstream still works)
      var REMARK = /редакционн|редакторск|текстов\S* мет\S*|подпис\S* внутри схемы|печатн\S* (?:текстов\S* )?подпис|ошибочно называ|подпись ошибочна|не печатн|печатный индекс|не заменён|как напечатано|так напечатано|подписи нет|единица отклонений не напечатана|повторная внутренняя подпись|верхняя подпись/i;
      var pieces = t.split(/((?<=[.;])\s+|;\s*)/);
      var kept = [];
      for (var q = 0; q < pieces.length; q += 2) if (!REMARK.test(pieces[q])) kept.push(pieces[q], pieces[q + 1] || '');
      t = kept.join('');
      t = t.replace(/;\s*;/g, ';').replace(/[\s—–;,:]+$/, '').replace(/^\s*[—–;,:]+\s*/, '').trim();
      return /^редакц/i.test(t) ? '' : t;
    }
    // A translator's note written in the supplier's pipeline words (extraction, bbox, numerator…) belongs to the
    // editor notes panel, not to the reading text (audit 2026-10-31, pages 60 and 348).
    var PIPE_NOTE = /extraction|example.steps|sourceID|bbox|\bPNG\b|numerator|formula-ID|\bcompute\b|localresult|page-parent|\bJSON\b/i;
    // Supplier notes mix help for the learner («Shift tan — обратный тангенс», units) with a report on the
    // supplier's own work («восстановлено по изображению», «напечатанное сохранено», «предлагаемое исправление»).
    // Sentence by sentence: the help stays under the formula, the report goes to «Заметки редактора»
    // (audit 2026-10-31: 689 formula notes).
    var PROC = /арифметическ\S* (?:шаг|действи|получени)|example|display|steps|Та же операция|не дублиру|напечатанн\S* (?:уравнени|равенств)|использовано напечатанн|Иллюстративн|сохран|восстановл|по изображени|извлеч|extraction|sourceID|bbox|PNG|исправлени|кандидат|заметк|вход вычислени|не подмен|буквальн|подстановк|пересчит|пересчёт|ядр|compute|редакц|фрагмент|обрез|(?:формул[аеы]|текст[аеу]?|строк[аеи]) выше|\b\d{3}f\d{2}\b|numerator|числового примера здесь нет|печатн\S* равенств|печатн\S* строк|печатн\S* итог|отдельно напечатанн|арифметически верн|равенство номиналов|ambiguity_note|не обоснован|не является исправленным|единицы по легенде|печатная зависимость|отождеств|не тождеств|тождествен|исходн|ячейк|\b[Bb]\d{3}\b|convention|столбец обозначений/i;
    function noteParts(text) {
      var t = cleanMeta(text);
      if (!t) return { reader: '', editor: '' };
      if (PIPE_NOTE.test(t)) return { reader: '', editor: t };
      var keep = [], move = [];
      t.split(/(?<=[.!?…])\s+(?=[A-ZА-ЯЁ0-9«(])/).forEach(function (sent) { (PROC.test(sent) ? move : keep).push(sent); });
      // spaces the supplier lost between Cyrillic and Latin («вkW», «вrpm», «анапечатано 12» stays as printed)
      var reader = keep.join(' ').trim().replace(/([а-яё])([A-Za-zα-ω])/g, '$1 $2').replace(/([A-Za-z]{2,})([а-яё])/g, '$1 $2');
      return { reader: reader, editor: move.join(' ').trim() };
    }
    function readerNote(text) { return noteParts(text).reader; }

    // A tiny picture with at most one label (bolt-head marking 8.8, a tolerance ±0.05, a support sign) is shown
    // small beside its label: a numbered pin would cover the picture itself (audit 2026-10-31).
    function isChipFigure(fig) {
      if (fig.number != null || fig.caption_he || fig.caption_ru || (fig.regions || []).length > 1) return false;
      var w = fig.bbox[2] - fig.bbox[0], ht = fig.bbox[3] - fig.bbox[1];
      if (w <= 60 && ht <= 60) return true;
      var r = (fig.regions || [])[0];
      if (!r || w > 140 || ht > 140) return false;
      return (r.bbox[2] - r.bbox[0]) * (r.bbox[3] - r.bbox[1]) >= 0.5 * w * ht;
    }
    function renderChip(fig) {
      var r = (fig.regions || [])[0] || {};
      var he = r.label_he || '', ru = cleanMeta(r.label_ru);
      return h('figure', { cls: 'atlas-fig atlas-chipfig', 'data-ref': fig.id }, [
        h('img', { src: fig.crop, alt: ru || he || '', loading: 'lazy' }),
        h('figcaption', {}, [he ? h('bdi', { lang: 'he', dir: dirOf(he), text: he }) : null,
          ru && ru !== he ? h('span', { cls: 'atlas-l-ru', text: (he ? ' — ' : '') + ru }) : null])]);
    }

    // Regions are numbered pins with the labels in the legend below: text labels drawn over the scan covered the
    // book's own Hebrew labels and each other (acceptance R01; owner screenshot 2026-10-31, figure 10).
    // Regions with the same label share one number and one legend line («1 F — Сила F», not F, F, F… — audit 6.2).
    // captionRow: the page's own caption line (with its study layers) replaces the short figcaption.
    // A diagram whose labels the page also gives as a table (the SI prefix scale, p4): pins and a legend would
    // repeat the table a third time and pile up on a phone. The clean scan stays; the table carries the words.
    function labelsInTables(fig, page) {
      var regions = (fig.regions || []).filter(function (r) { return (r.label_he || '').trim(); });
      if (regions.length < 4 || !page || !(page.tables || []).length) return false;
      var cells = {};
      page.tables.forEach(function (t) { (t.cells || []).forEach(function (c) { [c.he, c.ru].forEach(function (x) { x = plain(x).replace(/\s+/g, ''); if (x) cells[x] = true; }); }); });
      var keys = Object.keys(cells);
      var hit = regions.filter(function (r) {
        var x = plain(r.label_he).replace(/\s+/g, '');
        return cells[x] || keys.some(function (k) { return k.length > 1 && (x.indexOf(k) >= 0 || k.indexOf(x) >= 0); });
      }).length;
      return hit / regions.length >= 0.6;
    }

    // Labels that are only the drawing's own letters (C, a, α, F) with no translation: pins and a legend
    // «1 C, 2 a…» repeat what the drawing already shows (p6). A legend earns its place by translating.
    function translatesAnything(fig) {
      return (fig.regions || []).some(function (r) { return /[А-Яа-яЁё]/.test(cleanMeta(r.label_ru)) || /[א-ת]/.test(r.label_he || ''); });
    }

    function renderFigure(T, fig, captionRow, page, forPrint) {
      if (isChipFigure(fig)) return renderChip(fig);
      if (labelsInTables(fig, page) || !translatesAnything(fig)) fig = Object.assign({}, fig, { regions: [] });
      var box = h('div', { cls: 'atlas-figbox' }, [h('img', { src: fig.crop, alt: cleanMeta(fig.caption_ru) || fig.id, loading: 'lazy' })]);
      var list = h('ol', { cls: 'atlas-regions' });
      var w = fig.bbox[2] - fig.bbox[0], ht = fig.bbox[3] - fig.bbox[1];
      var groups = [], byKey = {};
      fig.regions.forEach(function (r) {
        var ru = cleanMeta(r.label_ru);
        if (!ru && !(r.label_he || '').trim()) return;                 // an unlabelled area: no pin, no empty legend line
        // a bare symbol («4», «V₁», «III») with no Hebrew and no translation repeats the drawing (p375)
        if (!/[א-ת]/.test(r.label_he || '') && (!ru || ru === String(r.label_he || '').trim())) return;
        var key = (r.label_he || '') + '\u0001' + ru;
        var g = byKey[key];
        if (!g) { g = byKey[key] = { id: r.id, he: String(r.label_he || '').replace(/\u20D7/g, ''), ru: ru, links: [], regions: [] }; groups.push(g); }
        g.regions.push(r);
        (r.links || []).forEach(function (l) { if (g.links.indexOf(l) < 0) g.links.push(l); });
      });
      groups.forEach(function (g, k) {
        var mark = String(k + 1), links = g.links.join(' ');
        g.regions.forEach(function (r) {
          var style = 'left:' + ((r.bbox[0] - fig.bbox[0]) / w * 100).toFixed(2) + '%;top:' + ((r.bbox[1] - fig.bbox[1]) / ht * 100).toFixed(2) +
            '%;width:' + ((r.bbox[2] - r.bbox[0]) / w * 100).toFixed(2) + '%;height:' + ((r.bbox[3] - r.bbox[1]) / ht * 100).toFixed(2) + '%';
          box.appendChild(h('button', { cls: 'atlas-rg', type: 'button', style: style, 'data-region': g.id, 'data-links': links,
            'aria-label': mark + ': ' + (g.ru || g.he) }, [h('i', { cls: 'n', text: mark })]));
        });
        var ru = g.ru && g.ru !== g.he ? g.ru : '';
        list.appendChild(h('li', { 'data-region': g.id, 'data-links': links }, [h('b', { cls: 'atlas-mark', text: mark }), ' ',
          h('bdi', { lang: 'he', dir: dirOf(g.he), text: g.he }), ru ? h('span', { cls: 'atlas-l-ru', text: (g.he ? ' — ' : '') + ru }) : null]));
      });
      var capRu = cleanMeta(fig.caption_ru);
      var cap = captionRow ? h('figcaption', { cls: 'atlas-figcap-row' }, [captionRow])
        : (fig.caption_he || capRu) ? h('figcaption', {}, [h('bdi', { lang: 'he', dir: 'rtl', text: fig.caption_he || '' }),
          h('span', { cls: 'atlas-l-ru', text: (fig.caption_he && capRu ? ' — ' : '') + capRu })]) : null;
      if (fig.is_table && !captionRow && !forPrint) {
        return h('details', { cls: 'atlas-fig atlas-tablefig atlas-orig', 'data-ref': fig.id }, [
          h('summary', { text: T('atlas.tableScan', 'как в книге (скан таблицы)') }), box, cap, groups.length ? list : null]);
      }
      return h('figure', { cls: 'atlas-fig' + (fig.is_table ? ' atlas-tablefig' : ''), 'data-ref': fig.id }, [box, cap, groups.length ? list : null]);
    }

    // Table cells sometimes carry raw LaTeX (\tau_S, \sigma_{Lc}): shown as plain symbols with real
    // sub/superscripts, built as DOM nodes (no HTML from data).
    var TEX = { alpha: 'α', beta: 'β', gamma: 'γ', Gamma: 'Γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
      theta: 'θ', vartheta: 'ϑ', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ',
      phi: 'φ', varphi: 'φ', Phi: 'Φ', chi: 'χ', psi: 'ψ', omega: 'ω', Omega: 'Ω', cdot: '·', times: '×', le: '≤', leq: '≤', ge: '≥',
      geq: '≥', pm: '±', infty: '∞', approx: '≈', neq: '≠', circ: '°', prime: '′', degree: '°', ell: 'ℓ', partial: '∂' };
    function looksTex(s) { return /\\[A-Za-z]+|[_^]\{|[A-Za-zα-ωΑ-Ω\]][_^][A-Za-z0-9]/.test(s); }
    function texNodes(src) {
      src = String(src == null ? '' : src);
      if (!looksTex(src)) return [src];
      var i = 0, out = [], buf = '';
      function flat(text) { return texNodes(text).map(function (n) { return typeof n === 'string' ? n : n.textContent; }).join(''); }
      function group() {                       // {…} or one token, as plain text
        while (src[i] === ' ') i++;
        if (src[i] === '\\') return command();
        if (src[i] !== '{') return src[i++] || '';
        var depth = 0, start = ++i;
        for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { if (!depth) break; depth--; } }
        var inner = src.slice(start, i); i++;
        return flat(inner);
      }
      function command() {
        i++;
        var m = /^[A-Za-z]+/.exec(src.slice(i));
        if (!m) { var c = src[i++] || ''; return c === ',' || c === ';' || c === ' ' ? ' ' : c; }
        i += m[0].length;
        var name = m[0];
        if (TEX[name]) return TEX[name];
        if (name === 'frac') { var a = group(), b = group(); return (a.length > 1 ? '(' + a + ')' : a) + '/' + (b.length > 1 ? '(' + b + ')' : b); }
        if (name === 'sqrt') return '√' + group();
        if (/^(text|mathrm|mathit|mathbf|operatorname|textrm)$/.test(name)) return group();
        if (name === 'left' || name === 'right') return '';
        return name;
      }
      function flush() { if (buf) { out.push(buf); buf = ''; } }
      while (i < src.length) {
        var ch = src[i];
        if (ch === '\\') buf += command();
        else if (ch === '_' || ch === '^') { flush(); i++; out.push(h(ch === '_' ? 'sub' : 'sup', { text: group() })); }
        else if (ch === '{' || ch === '}') i++;
        else { buf += ch; i++; }
      }
      flush();
      return out;
    }

    // Titles the supplier gave untitled tables are about the extraction, not the book («Печатные данные таблицы
    // под заголовком k2», «Печатные альтернативные выражения; не утверждение их корректности», p296/p312).
    function tableTitle(table) {
      var t = cleanMeta(table.title_ru);
      if (/^печатные данные таблицы|не утверждени|^печатная таблица обозначений$/i.test(t)) return '';
      t = t.replace(/\s*[—–-]\s*печатная компоновка\s*$/i, '').replace(/\s*\(как напечатано\)\s*$/i, '')
        .replace(/:\s*все\s+\d+\s+строк\w*\s*$/i, '').replace(/\s*[—–-]\s*трёхколоночная композиция\s*$/i, '')
        .replace(/^печатн(?:ые|ая|ое|ый)\s+/i, '').replace(/^компоновка\s+формул\s+/i, 'Формулы ').replace(/^компоновка\s+/i, '')
        .replace(/\s(?:напечатанн|печатн)\S*/gi, '').trim();
      return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
    }

    function renderTable(table, ref, mirror) {
      var cells = table.cells || [];
      if (mirror) {
        var wd = 0;
        cells.forEach(function (c) { wd = Math.max(wd, c.col + c.colspan); });
        cells = cells.map(function (c) { return Object.assign({}, c, { col: wd - c.col - c.colspan }); });
      }
      var width = 0, covered = {}, pos = {}, rows = {};
      cells.forEach(function (c) {
        width = Math.max(width, c.col + c.colspan);
        pos[c.row + ':' + c.col] = c; rows[c.row] = true;
        for (var r = c.row; r < c.row + c.rowspan; r++) for (var k = c.col; k < c.col + c.colspan; k++) if (r !== c.row || k !== c.col) covered[r + ':' + k] = true;
      });
      var body = h('tbody'), head = h('thead'), built = [];
      // a unit the table already names in a label cell («d [mm]») is not repeated after every number (p22)
      var labelled = {};
      cells.forEach(function (c) {
        [c.he, c.ru].forEach(function (x) {
          x = String(x || '').trim();
          var m = /\[\s*([^\]\s]+)\s*\]/.exec(x);
          if (m) labelled[m[1].toLowerCase()] = true;
          if (/^(mm|мм|mm²|мм²|mm2|MPa|МПа|N|Н|kN|кН|kW|кВт|rpm|°)$/i.test(x)) labelled[x.toLowerCase()] = true;   // a row of units under the header (p53)
          if (c.unit && x.toLowerCase() === String(c.unit).toLowerCase()) labelled[x.toLowerCase()] = true;
          x.split(/\s+/).forEach(function (w) { if (/^[^\d\s]{1,7}$/.test(w)) labelled['?' + w.toLowerCase()] = true; });
        });
      });
      if (labelled['мм']) labelled.mm = true;
      Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
        var tr = h('tr'), numeric = false, digits = false;
        for (var k = 0; k < width; k++) {
          var c = pos[r + ':' + k];
          if (c) {
            var text = cleanMeta(c.ru);
            if (/^[\d.,\s▪•+\-−]+$/.test(text) && /\d/.test(text)) numeric = true;
            if (/\d/.test(text)) digits = true;
            var unit = text.trim() && c.unit && c.unit !== '—' && text.slice(-c.unit.length) !== c.unit && !labelled[String(c.unit).toLowerCase()] && !labelled['?' + String(c.unit).toLowerCase()] ? c.unit : '';
            var he = c.he && c.he !== text ? c.he : '';
            tr.appendChild(h('td', { colspan: c.colspan > 1 ? c.colspan : null, rowspan: c.rowspan > 1 ? c.rowspan : null, dir: dirOf(text), 'data-cell': c.row+':'+c.col },
              he ? [h('span', { cls: 'atlas-l-he', lang: 'he', dir: dirOf(he) }, texNodes(he)), h('span', { cls: 'atlas-l-ru' }, texNodes(text).concat([unit ? h('small', { text: ' ' + unit }) : null]))]
                : texNodes(text).concat([unit ? h('small', { text: ' ' + unit }) : null])));
          } else if (!covered[r + ':' + k]) tr.appendChild(h('td'));
        }
        built.push({ tr: tr, numeric: numeric, digits: digits });
      });
      // Header rows: those above the first row of numbers. A table without number rows has a header only when
      // its first row is a row of labels (no digits) over at least two more rows (it used to make every row bold).
      var firstNum = -1;
      for (var q = 0; q < built.length; q++) if (built[q].numeric) { firstNum = q; break; }
      var heads = firstNum >= 0 ? firstNum : (built.length >= 3 && !built[0].digits ? 1 : 0);
      built.forEach(function (b, n) { (n < heads ? head : body).appendChild(b.tr); });
      // an untitled table gets no caption: an empty one painted a blank band above the grid
      var t = h('table', { cls: 'atlas-table' + (width > 8 ? ' wide' : '') }, [
        !(tableTitle(table) || table.title_he) ? null : h('caption', {}, [h('span', { cls: 'atlas-l-ru', text: tableTitle(table) }), table.title_he ? h('bdi', { lang: 'he', dir: 'rtl', text: ' ' + table.title_he }) : null]),
        head.childNodes.length ? head : null, body]);
      return h('div', { cls: 'atlas-tablewrap', 'data-ref': ref || table.id || null }, [t]);
    }

    // A possible misprint is one short line; the reasoning opens on demand (audit 2026-10-31, p223: ten long
    // recount paragraphs buried a worked example). Print shows it in full.
    function short(t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
    function renderErratum(T, x, full) {
      var head = [h('b', { text: '⚠ ' + T('atlas.erratum.printed', 'в книге:') + ' ' }), h('code', { text: full ? (x.as_printed || '') : short(x.as_printed, 48) })];
      if (x.proposed) head.push(h('b', { text: ' → ' + T('atlas.erratum.proposed', 'предлагаемое исправление:') + ' ' }), h('code', { text: full ? x.proposed : short(x.proposed, 48) }));
      // a recount that did not match and has no proposed fix yet: say so, a bare number told the reader nothing (p77, p88)
      else head.push(h('span', { cls: 'atlas-muted', text: ' — ' + T('atlas.erratum.recheck', 'пересчёт не сошёлся, нужна проверка') }));
      var body = [h('div', { cls: 'atlas-why', text: x.explanation_ru || '' }),
        x.core_note ? h('div', { cls: 'atlas-why', text: T('atlas.erratum.core', 'Пересчёт ядра:') + ' ' + x.core_note }) : null,
        h('small', { cls: 'atlas-muted', text: T('atlas.erratum.pending', 'ждёт подтверждения владельца') })];
      if (full) return h('div', { cls: 'atlas-erratum', 'data-target': x.target }, head.concat(body));
      return h('details', { cls: 'atlas-erratum', 'data-target': x.target }, [h('summary', {}, head)].concat(body));
    }

    function num(v) { return String(Number(Number(v).toPrecision(9))); }

    function renderExample(T, ex) {
      var list = h('ol', { cls: 'atlas-steps' });
      (ex.steps || []).forEach(function (s) {
        var verdict = s.math_review === 'core_verified' ? T('atlas.core.verified', 'арифметика сошлась')
          : s.math_review === 'core_rounded' ? T('atlas.core.rounded', 'сошлось с округлением')
          : s.math_review === 'core_mismatch' ? T('atlas.core.mismatch', 'арифметика не сошлась') : T('atlas.core.unchecked', 'не пересчитано');
        var bind = Object.keys(s.bindings || {}).map(function (k) { return k + ' = ' + s.bindings[k]; }).join(', ');
        var detail = null;
        if ((s.math_review === 'core_mismatch' || s.math_review === 'core_rounded') && typeof s.value === 'number') {
          var printed = Number(String(s.printed).replace(',', '.').replace('\u2212', '-'));
          var gap = s.value - printed;
          var rel = printed ? ' (' + num((Math.abs(gap) / Math.abs(printed) * 100).toPrecision(2)) + ' %)' : '';
          detail = h('details', { cls: 'atlas-why atlas-step-why' }, [h('summary', { text: T('atlas.core.more', 'подробнее') }), T('atlas.core.value', 'пересчёт даёт') + ' ' + num(s.value) + ' · ' +
            T('atlas.core.gap', 'разница с напечатанным') + ' ' + num(gap) + rel + ' — ' +
            (s.math_review === 'core_rounded' ? T('atlas.core.roundedHint', 'книга округлила результат до значащих цифр')
              : T('atlas.core.mismatchHint', 'кандидат в опечатку, не доказанная ошибка книги; решение за владельцем'))]);
        }
        list.appendChild(h('li', {}, [h('code', { text: s.compute }), ' · ' + bind + ' → ', h('b', { text: s.printed }), ' ',
          h('span', { cls: 'atlas-badge ' + (s.math_review || ''), text: verdict }), detail]));
      });
      return h('div', { cls: 'atlas-example' }, [h('h4', { cls: 'atlas-l-ru', text: cleanMeta(ex.title_ru) || T('atlas.example', 'Пример') }), list]);
    }

    var EDITOR_ABOUT = { page: ['atlas.editor.page', 'к странице'], formula: ['atlas.editor.formula', 'к формуле'],
      block: ['atlas.editor.block', 'к тексту'], erratum: ['atlas.editor.erratum', 'к исправлению'] };

    // Supplier notes about the pipeline (fields, extraction, validation) stay out of the reading text (acceptance R03/R06)
    function renderEditor(T, notes) {
      if (!notes || !notes.length) return null;
      var list = h('ul', {});
      notes.forEach(function (n) {
        var about = EDITOR_ABOUT[n.about] || EDITOR_ABOUT.page;
        list.appendChild(h('li', { 'data-target': n.ref || '' }, [h('b', { text: T(about[0], about[1]) + ': ' }), n.text]));
      });
      return h('details', { cls: 'atlas-editor atlas-l-ru' }, [h('summary', { text: T('atlas.editor.title', 'Заметки редактора') + ' (' + notes.length + ')' }),
        h('p', { cls: 'atlas-muted', text: T('atlas.editor.hint', 'Технические сведения о подготовке страницы: как извлечены формулы и что сверено. Для чтения не нужны.') }), list]);
    }

    // ---- proofreading: one mark per book page (owner, 2026-10-31) ----
    // Readers see the status; the owner gets a checkbox (wired by mount, saved on the server).
    function pageReviewedInData(page) {
      var items = (page.items || []).filter(function (x) { return x.status; });
      return items.length > 0 && items.every(function (x) {
        return x.status.owner_status === 'owner_confirmed' || x.status.language_review === 'owner_reviewed';
      });
    }
    function paintReview(T, el, reviewed, canEdit) {
      el.replaceChildren();
      el.setAttribute('data-done', reviewed ? '1' : '0');
      var text = reviewed ? T('atlas.review.done', 'вычитано') : T('atlas.review.pending', 'ждёт вычитки');
      if (canEdit) {
        el.classList.add('atlas-review-edit');
        el.appendChild(h('label', { title: T('atlas.review.ownerHint', 'Отметка редактора: страница вычитана') }, [
          h('input', { type: 'checkbox', checked: reviewed ? true : null, 'data-review-page': el.getAttribute('data-page') }),
          h('span', { text: text })]));
      } else {
        el.classList.remove('atlas-review-edit');
        el.setAttribute('title', reviewed ? T('atlas.review.doneHint', 'Страницу вычитал редактор')
          : T('atlas.review.pendingHint', 'Перевод подготовлен и проверен поставщиком; вычитка редактором впереди'));
        el.appendChild(h('span', { text: (reviewed ? '✓ ' : '') + text }));
      }
      return el;
    }

    function renderPage(T, page, opts) {
      var sec = h('section', { cls: 'atlas-page', id: 'atlas-p' + page.page, 'data-page': page.page });
      var thumb = page.image ? h('button', { cls: 'atlas-thumb', type: 'button', 'aria-label': T('atlas.openOriginal', 'Открыть страницу оригинала'),
        'data-image': page.image }, [h('img', { src: page.image, alt: T('atlas.page', 'стр.') + ' ' + page.page, loading: 'lazy' })]) : null;
      var state = page.state || (page.translated ? 'translated' : 'none');
      var stateText = state === 'none' ? T('atlas.noTranslationShort', 'без перевода') : state === 'partial' ? T('atlas.partial', 'переведено частично')
        : state === 'empty' ? T('atlas.emptyPage', 'на странице нет текста') : null;
      var head = h('header', { cls: 'atlas-page-head' }, [h('span', { cls: 'atlas-pageno', text: T('atlas.page', 'стр.') + ' ' + page.page }),
        stateText ? h('span', { cls: 'atlas-badge', 'data-state': state, text: stateText }) : null]);
      // every page of a translated section is proofread, text-less ones too (figure labels), so the contents can reach «✓»
      if (state !== 'none') head.appendChild(paintReview(T, h('span', { cls: 'atlas-review', 'data-page': page.page }), pageReviewedInData(page), false));
      sec.appendChild(head);
      var body = h('div', { cls: 'atlas-page-body' });
      var aside = h('aside', { cls: 'atlas-aside' }, [thumb]);
      var main = h('div', { cls: 'atlas-main' });
      var errataByTarget = {};
      (page.errata || []).forEach(function (x) { (errataByTarget[x.target] = errataByTarget[x.target] || []).push(x); });
      var shown = {};
      var lay = layoutPage(page), into = main, groupEnd = -1;
      function itemNode(item) { return item.type === 'formula' ? renderFormula(T, item) : renderBlock(T, item); }
      lay.items.forEach(function (item, i) {
        (lay.figuresBefore[i] || []).forEach(function (f) {
          var own = lay.captionOf[i] === f;
          main.appendChild(renderFigure(T, f, own ? itemNode(item) : null, page));
          (lay.tablesAfterFigure[f.id] || []).forEach(function (t) { main.appendChild(renderTable(t, null, lay.mirror[t.id])); });
        });
        var g = lay.groups[i];
        if (g) {
          into = h('div', { cls: 'atlas-mark-group', 'data-mark': g.kind }, [markHead(T, g.marks)]);
          main.appendChild(into); groupEnd = g.end;
        }
        var own = lay.captionOf[i] && (lay.figuresBefore[i] || []).indexOf(lay.captionOf[i]) >= 0;
        // a text line that only repeats a table flattened into one string gives its place to the table
        if (lay.tableFor[i]) into.appendChild(renderTable(lay.tableFor[i], item.id, lay.mirror[lay.tableFor[i].id]));
        else if (!own && !lay.duplicate[i]) into.appendChild(itemNode(item));
        (lay.tablesAfter[i] || []).forEach(function (t) { into.appendChild(renderTable(t, null, lay.mirror[t.id])); });
        (errataByTarget[item.id] || []).forEach(function (x) { shown[x.id] = true; into.appendChild(renderErratum(T, x)); });
        if (i >= groupEnd) { into = main; groupEnd = -1; }
      });
      (lay.figuresBefore[lay.items.length] || []).forEach(function (f) {
        main.appendChild(renderFigure(T, f, null, page));
        (lay.tablesAfterFigure[f.id] || []).forEach(function (t) { main.appendChild(renderTable(t, null, lay.mirror[t.id])); });
      });
      lay.tablesEnd.forEach(function (t) { main.appendChild(renderTable(t, null, lay.mirror[t.id])); });
      (page.examples || []).forEach(function (ex) {
        main.appendChild(renderExample(T, ex));
        (errataByTarget[ex.id] || []).forEach(function (x) { shown[x.id] = true; main.appendChild(renderErratum(T, x)); });
      });
      (page.errata || []).forEach(function (x) { if (!shown[x.id]) main.appendChild(renderErratum(T, x)); });
      // the same note under every formula of a page («H:kW, моменты: N·mm…», p305–307) is shown once
      var seenNote = {};
      main.querySelectorAll('.atlas-formula > .atlas-note').forEach(function (n) {
        var k = n.textContent.trim();
        if (seenNote[k]) n.remove(); else seenNote[k] = true;
      });
      // narrow tables printed side by side in the book (p137: six «e | k» pairs) stand side by side here too
      var kids = Array.prototype.slice.call(main.children), run = [];
      function narrow(n) {
        if (!n.classList || !n.classList.contains('atlas-tablewrap')) return false;
        var row = n.querySelector('tr');
        return !!row && row.children.length <= 3;
      }
      function flush() {
        if (run.length >= 2) {
          var box = h('div', { cls: 'atlas-tablerun' });
          run[0].parentNode.insertBefore(box, run[0]);
          run.forEach(function (n) { box.appendChild(n); });
        }
        run = [];
      }
      kids.forEach(function (n) { if (narrow(n)) run.push(n); else flush(); });
      flush();
      var moved = [];
      (page.items || []).forEach(function (it) {
        var part = noteParts(it.type === 'formula' ? it.note : it.ambiguity_note).editor;
        if (part) moved.push({ about: it.type === 'formula' ? 'formula' : 'block', ref: it.id, text: part });
      });
      var editor = renderEditor(T, (page.editor || []).concat(moved));
      if (editor) main.appendChild(editor);
      body.appendChild(aside); body.appendChild(main);
      sec.appendChild(body);
      return sec;
    }

    function renderTerms(T, terms) {
      var ids = Object.keys(terms || {});
      if (!ids.length) return null;
      var list = h('dl', { cls: 'atlas-terms' });
      ids.forEach(function (id) {
        var term = terms[id];
        list.appendChild(h('dt', {}, [h('bdi', { lang: 'he', dir: 'rtl', text: term.niqqud || term.lemma_he }), ' · ', h('i', { text: term.translit || '' })]));
        list.appendChild(h('dd', { cls: 'atlas-l-ru', text: (term.senses || []).map(function (s) { return s.ru; }).join('; ') }));
      });
      return h('details', { cls: 'atlas-terms-wrap' }, [h('summary', { text: T('atlas.terms', 'Словарь раздела') + ' (' + ids.length + ')' }), list]);
    }

    function renderSection(T, data, opts) {
      var wrap = h('div', { cls: 'atlas-section', 'data-section': data.id });
      wrap.appendChild(h('h2', { cls: 'atlas-title' }, [h('bdi', { lang: 'he', dir: 'rtl', text: data.title_he }), ' · ' + data.title_ru]));
      wrap.appendChild(h('p', { cls: 'atlas-sub' }, [T('atlas.pages', 'страницы') + ' ' + data.first + '–' + data.last +
        (data.translated ? '' : ' · ' + T('atlas.noTranslationShort', 'без перевода')),
        data.translated ? h('span', { cls: 'atlas-review-count' }) : null]));
      var terms = renderTerms(T, data.terms);
      if (terms) wrap.appendChild(terms);
      data.pages.forEach(function (p) { wrap.appendChild(renderPage(T, p, opts)); });
      return wrap;
    }

    function renderHome(T, index, onOpen) {
      var wrap = h('div', { cls: 'atlas-home' });
      wrap.appendChild(h('h2', { cls: 'atlas-title' }, [h('bdi', { lang: 'he', dir: 'rtl', text: index.title_he }), h('br'), index.title_ru]));
      var done = index.sections.filter(function (s) { return s.translated; }).length;
      wrap.appendChild(h('p', { cls: 'atlas-sub' }, [T('atlas.progress', 'Переведено разделов') + ': ' + done + ' / ' + index.sections.length,
        h('span', { cls: 'atlas-home-review' })]));
      var jump = h('form', { cls: 'atlas-jump' }, [
        h('label', { for: 'atlasJumpPage', text: T('atlas.jump', 'Страница книги') }),
        h('input', { id: 'atlasJumpPage', type: 'number', min: 1, max: 564, inputmode: 'numeric' }),
        h('button', { type: 'submit', text: T('atlas.open', 'Открыть') })]);
      jump.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var n = Number(jump.querySelector('input').value);
        var s = index.sections.filter(function (x) { return x.first <= n && n <= x.last; })[0];
        if (s) onOpen(s.id, n);
      });
      wrap.appendChild(jump);
      (index.parts || []).forEach(function (part) {
        var items = index.sections.filter(function (s) { return s.part === part.id; });
        if (!items.length) return;
        var list = h('ul', { cls: 'atlas-sections' });
        items.forEach(function (s) {
          list.appendChild(h('li', {}, [h('button', { cls: 'atlas-section-btn', type: 'button', 'data-section': s.id, on: { click: function () { onOpen(s.id); } } }, [
            h('span', { cls: 'atlas-sec-ru', text: s.ru }), h('bdi', { cls: 'atlas-sec-he', lang: 'he', dir: 'rtl', text: s.he }),
            h('span', { cls: 'atlas-sec-pages', text: s.first === s.last ? String(s.first) : s.first + '–' + s.last }),
            h('span', { cls: 'atlas-badge' + (s.translated ? ' ok' : ''), text: s.translated ? T('atlas.translated', 'переведено') : T('atlas.noTranslationShort', 'без перевода') }),
            s.translated ? h('span', { cls: 'atlas-sec-review', 'data-first': s.first, 'data-last': s.last }) : null])]));
        });
        wrap.appendChild(h('section', { cls: 'atlas-part' }, [h('h3', {}, [part.ru + ' · ', h('bdi', { lang: 'he', dir: 'rtl', text: part.he })]), list]));
      });
      return wrap;
    }

    function renderPrint(T, data) {
      var rootEl = h('div', { cls: 'atlas-print-root' });
      data.pages.forEach(function (page) {
        var rows = h('tbody');
        var lay = layoutPage(page);
        page.items.forEach(function (item, i) {
          var g = lay.groups[i];
          if (g) rows.appendChild(h('tr', { cls: 'atlas-pmark', 'data-mark': g.kind }, [h('td', { colspan: 2 }, [markHead(T, g.marks)])]));
          if (item.type === 'formula') {
            var vs = (item.vars || []).map(function (v) { return (v.latex || '') + ' — ' + cleanMeta(v.ru) + (v.unit ? ', ' + v.unit : ''); }).join(' · ');
            rows.appendChild(h('tr', {}, [h('td', { colspan: 2 }, [h('div', { cls: 'atlas-pmath', html: item.mathml || null, text: item.mathml ? null : (item.latex || item.source_text || '') }),
              h('div', { cls: 'atlas-pvars', text: vs }), item.note ? h('div', { cls: 'atlas-note', text: item.note }) : null])]));
          } else {
            rows.appendChild(h('tr', {}, [h('td', { cls: 'atlas-pru', text: cleanMeta(item.ru) || T('atlas.noTranslationShort', 'без перевода') }),
              h('td', { cls: 'atlas-phe', lang: 'he', dir: dirOf(item.he || item.he_raw), text: item.he || item.he_raw || '' })]));
          }
          (page.errata || []).filter(function (x) { return x.target === item.id; }).forEach(function (x) {
            rows.appendChild(h('tr', {}, [h('td', { colspan: 2 }, [renderErratum(T, x, true)])]));
          });
        });
        var extra = h('div');
        (page.figures || []).forEach(function (f) { if (!markKind(f)) extra.appendChild(renderFigure(T, f, null, page, true)); });
        (page.tables || []).forEach(function (t) { extra.appendChild(renderTable(t)); });
        var sheet = h('table', { cls: 'atlas-sheet' }, [
          h('thead', {}, [h('tr', {}, [h('td', { colspan: 2 }, [h('div', { cls: 'atlas-shead' }, [h('b', { text: T('atlas.page', 'стр.') + ' ' + page.page }),
            h('span', {}, [h('bdi', { lang: 'he', dir: 'rtl', text: data.title_he }), ' · ' + data.title_ru])])])])]),
          rows, h('tfoot', {}, [h('tr', {}, [h('td', { colspan: 2 }, [extra])])])]);
        rootEl.appendChild(h('section', { cls: 'atlas-psheet' }, [sheet]));
      });
      return rootEl;
    }

    return { h: h, renderHome: renderHome, renderSection: renderSection, renderPage: renderPage, renderTable: renderTable, renderPrint: renderPrint, dirOf: dirOf,
      layoutPage: layoutPage, paintReview: paintReview, pageReviewedInData: pageReviewedInData, markKindOf: markKind,
      cleanMeta: cleanMeta, isChipFigure: isChipFigure, noteParts: noteParts };
  }

  // Column sets are the Room's (public/js/table-presets.js): the same six presets and four columns as every
  // other corpus, so a reader's habit carries over. Translation off hides every Russian layer (former Hebrew-only).
  var LAYER_KEYS = ['he', 'niqqud', 'translit', 'ru'];
  var FALLBACK_PRESETS = {
    niqqud: { he: false, niqqud: true, translit: false, ru: true }, translit: { he: false, niqqud: false, translit: true, ru: true },
    plain: { he: true, niqqud: false, translit: false, ru: true }, three: { he: false, niqqud: true, translit: true, ru: true },
    hebrew: { he: false, niqqud: true, translit: false, ru: false }, all: { he: true, niqqud: true, translit: true, ru: true } };
  var PRESET_LABELS = { niqqud: 'Огласовка и перевод', translit: 'Транслит и перевод', plain: 'Иврит и перевод',
    three: 'Огласовка, транслит, перевод', hebrew: 'Одна колонка', all: 'Все колонки' };
  function presets() {
    var tp = root.TablePresets;
    if (!tp && typeof require === 'function') { try { tp = require('./table-presets.js'); } catch (_) { tp = null; } }
    if (tp && tp.PRESETS) return { ids: tp.PRESETS, cols: tp.toColumns, of: tp.fromColumns, screen: tp.screenDefault };
    var ids = Object.keys(FALLBACK_PRESETS);
    return { ids: ids, cols: function (id) { return FALLBACK_PRESETS[id] || FALLBACK_PRESETS.all; },
      of: function (c) {
        for (var i = 0; i < ids.length; i++) {
          var m = FALLBACK_PRESETS[ids[i]];
          if (LAYER_KEYS.every(function (k) { return !!c[k] === m[k]; })) return ids[i];
        }
        return 'custom';
      }, screen: null };
  }
  function normLayers(l, win) {
    if (!l) {
      var P = presets(), d = P.cols(P.screen && win ? P.screen(win) : 'all');
      l = { he: d.he, niqqud: d.niqqud, translit: d.translit, ru: d.ru };
    }
    var out = { he: !!l.he, niqqud: !!l.niqqud, translit: !!l.translit, ru: !!l.ru, script: l.script === 'cyr' ? 'cyr' : 'lat' };
    if (!out.he && !out.niqqud && !out.translit) out.niqqud = true;   // a row always keeps its source
    return out;
  }
  function applyLayers(el, l) {
    if (!el || !el.classList) return;
    el.classList.toggle('atlas-hide-he', !l.he);
    el.classList.toggle('atlas-hide-niqqud', !l.niqqud);
    el.classList.toggle('atlas-hide-translit', !l.translit);
    el.classList.toggle('atlas-hebrew-only', !l.ru);
    el.classList.toggle('atlas-tl-lat', l.script !== 'cyr');
    el.classList.toggle('atlas-tl-cyr', l.script === 'cyr');
  }

  function mount(container, opts) {
    opts = opts || {};
    var doc = container.ownerDocument;
    var T = makeT(opts.t);
    var R = factory(doc);
    var base = opts.base || ('/data/atlas/' + (opts.atlasId || 'a97002') + '/');
    var fetchJson = opts.fetchJson || function (url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); };
    var view = doc.createElement('div');
    view.className = 'atlas-root';
    container.appendChild(view);
    var index = null;
    var layers = normLayers(opts.layers, doc.defaultView);
    var onLayers = typeof opts.onLayers === 'function' ? opts.onLayers : function () {};
    // P5 G1: a translation stage of the section decides the columns shown; the saved columns stay as they are
    var stage = opts.stage && typeof opts.stage.of === 'function' && typeof opts.stage.layersFor === 'function' ? opts.stage : null;

    function state(text) { view.replaceChildren(R.h('p', { cls: 'atlas-state', text: text })); }

    // Proofreading marks: opts.review = { load() → {pages:{n:{…}}}, canEdit() → bool, save(page, on) → {pages} }.
    // Without it (tests, offline) the page headers keep what the data says.
    var review = opts.review || null;
    var reviewMarks = null, reviewOwner = false;
    function reviewed(n, fallback) { return reviewMarks ? !!reviewMarks[String(n)] || fallback : fallback; }
    function paintReviews(section) {
      var pages = section.querySelectorAll('.atlas-review'), done = 0;
      pages.forEach(function (el) {
        var n = el.getAttribute('data-page');
        var on = reviewed(n, el.getAttribute('data-data-done') === '1');
        if (on) done++;
        R.paintReview(T, el, on, reviewOwner);
      });
      var count = section.querySelector('.atlas-review-count');
      if (count) count.textContent = pages.length ? ' · ' + T('atlas.review.count', 'вычитано страниц') + ': ' + done + ' / ' + pages.length : '';
    }
    function wireReview(section) {
      section.querySelectorAll('.atlas-review').forEach(function (el) { el.setAttribute('data-data-done', el.getAttribute('data-done')); });
      paintReviews(section);
      if (!review) return;
      Promise.all([Promise.resolve().then(review.load).catch(function () { return null; }),
        Promise.resolve().then(review.canEdit).catch(function () { return false; })]).then(function (r) {
        if (r[0] && r[0].pages) reviewMarks = r[0].pages;
        reviewOwner = !!r[1];
        paintReviews(section);
      });
      section.addEventListener('change', function (ev) {
        var box = ev.target;
        if (!box || !box.matches || !box.matches('input[data-review-page]') || !reviewOwner) return;
        var n = box.getAttribute('data-review-page'), on = !!box.checked, el = box.closest('.atlas-review');
        box.disabled = true;
        Promise.resolve().then(function () { return review.save(Number(n), on); }).then(function (res) {
          reviewMarks = (res && res.pages) || reviewMarks || {};
          paintReviews(section);
        }).catch(function () {
          box.checked = !on; box.disabled = false;
          if (el) { el.setAttribute('title', T('atlas.review.saveError', 'Не удалось сохранить отметку — проверьте вход и сеть')); el.classList.add('atlas-review-error'); }
        });
      });
    }

    function wireInteractions(section) {
      section.addEventListener('click', function (ev) {
        var thumb = ev.target.closest && ev.target.closest('.atlas-thumb');
        if (thumb) { openImage(thumb.getAttribute('data-image')); return; }
        var region = ev.target.closest && ev.target.closest('[data-region]');
        if (!region) return;
        section.querySelectorAll('.atlas-hl').forEach(function (x) { x.classList.remove('atlas-hl'); });
        section.querySelectorAll('[data-region="' + region.getAttribute('data-region') + '"]').forEach(function (x) { x.classList.add('atlas-hl'); });
        (region.getAttribute('data-links') || '').split(' ').forEach(function (ref) {
          if (!ref) return;
          section.querySelectorAll('[data-ref="' + ref + '"]').forEach(function (x) { x.classList.add('atlas-hl'); });
        });
      });
    }

    function openImage(src) {
      var overlay = R.h('div', { cls: 'atlas-overlay', role: 'dialog', 'aria-modal': 'true' }, [
        R.h('button', { cls: 'atlas-close', type: 'button', 'aria-label': T('atlas.close', 'Закрыть'), text: '×' }), R.h('img', { src: src, alt: '' })]);
      function close() { overlay.remove(); doc.removeEventListener('keydown', onKey); }
      function onKey(ev) { if (ev.key === 'Escape') close(); }
      overlay.addEventListener('click', close);
      doc.addEventListener('keydown', onKey);
      doc.body.appendChild(overlay);
    }

    function printSection(data) {
      var cleanup = preparePrint(doc, data, T);
      var done = function () { cleanup(); root.removeEventListener('afterprint', done); };
      root.addEventListener('afterprint', done);
      root.print();
    }

    var onState = typeof opts.onState === 'function' ? opts.onState : function () {};

    // The page in view is kept in the address so a reload or a shared link returns to it (acceptance UI01).
    // A jump puts the page right under the sticky bars and that page is what the address keeps; scrolling
    // after it reports the page under the bars (dots retest P2-02: the address drifted one page back).
    var track = { last: 0, quietUntil: 0, input: null };
    function barBottom() {
      var bar = view.querySelector('.atlas-toolbar'), win = doc.defaultView;
      if (!bar || !win || !win.getComputedStyle) return 0;
      return (parseFloat(win.getComputedStyle(bar).top) || 0) + bar.offsetHeight;
    }
    function goToPage(n, objectRef, cellRef) {
      var el = doc.getElementById('atlas-p' + n), win = doc.defaultView;
      if (!el) return false;
      if(objectRef){var object=Array.from(el.querySelectorAll('[data-ref]')).find(function(node){return node.getAttribute('data-ref')===objectRef;});if(object){el=object;if(cellRef){var cell=object.querySelector('[data-cell="'+cellRef.row+':'+cellRef.col+'"]');if(cell)el=cell;}}}
      track.last = n; track.quietUntil = Date.now() + 1500;
      if (track.input) track.input.value = String(n);
      function place() {
        if (win && win.scrollTo && el.getBoundingClientRect) win.scrollTo(0, Math.max(0, win.pageYOffset + el.getBoundingClientRect().top - barBottom() - 6));
        else if (el.scrollIntoView) el.scrollIntoView();
      }
      place();
      // formulas and fonts settle after the first paint: place the page again unless the reader has moved on
      setTimeout(function () { if (el.isConnected && Date.now() < track.quietUntil && track.last === n) place(); }, 500);
      return true;
    }
    function trackPages(id, section) {
      stopTracking();
      var win = doc.defaultView, timer = null;
      if (!win || !win.addEventListener) return;
      function current() {
        var line = barBottom() + 24, pages = section.querySelectorAll('.atlas-page'), hit = 0;
        for (var i = 0; i < pages.length; i++) {
          if (pages[i].getBoundingClientRect().top <= line) hit = Number(pages[i].getAttribute('data-page')); else break;
        }
        return hit;
      }
      function onScroll() {
        if (!section.isConnected) { stopTracking(); return; }  // the Room replaced this view (Back, another corpus)
        if (Date.now() < track.quietUntil) return;             // our own jump is still settling
        clearTimeout(timer);
        timer = setTimeout(function () {
          if (!section.isConnected || Date.now() < track.quietUntil) return;
          var n = current();
          if (n && n !== track.last) {
            track.last = n;
            if (track.input) track.input.value = String(n);
            onState(id, n, 'replace');
          }
        }, 400);
      }
      win.addEventListener('scroll', onScroll, { passive: true });
      stopTracking = function () { clearTimeout(timer); win.removeEventListener('scroll', onScroll); stopTracking = function () {}; };
    }
    var stopTracking = function () {};

    // «Колонки»: the Room's presets first, then the four columns, then the transliteration script.
    function viewPanel(section, sid) {
      function stageNow() { try { return stage ? Number(stage.of(sid)) || 0 : 0; } catch (_) { return 0; } }
      function shown() { var n = stageNow(); return n ? normLayers(stage.layersFor(n, layers)) : layers; }
      var P = presets();
      var btn = R.h('button', { type: 'button', cls: 'atlas-view-btn', 'aria-expanded': 'false',
        text: T('atlas.columns', 'Колонки') });
      var panel = R.h('div', { cls: 'atlas-view-panel', hidden: true, role: 'group', 'aria-label': T('room.aids.presetsTitle', 'Колонки таблицы') });
      var group = R.h('div', { cls: 'atlas-preset-group', role: 'radiogroup', 'aria-label': T('room.aids.presetsTitle', 'Колонки таблицы') });
      P.ids.forEach(function (pid) {
        var b = R.h('button', { type: 'button', role: 'radio', cls: 'atlas-chip', 'data-preset': pid,
          text: T('room.aids.preset_' + pid, PRESET_LABELS[pid] || pid) });
        b.addEventListener('click', function () {
          var c = P.cols(pid);
          set({ he: c.he, niqqud: c.niqqud, translit: c.translit, ru: c.ru, script: layers.script });
        });
        group.appendChild(b);
      });
      var COL_LABELS = { he: T('atlas.col.he', 'Иврит'), niqqud: T('atlas.col.niqqud', 'Огласовка'),
        translit: T('atlas.col.translit', 'Транслитерация'), ru: T('atlas.col.ru', 'Перевод') };
      var cols = R.h('div', { cls: 'atlas-col-group' });
      LAYER_KEYS.forEach(function (k) {
        var cb = R.h('input', { type: 'checkbox', 'data-col': k });
        cb.addEventListener('change', function () { var next = Object.assign({}, layers); next[k] = cb.checked; set(next); });
        cols.appendChild(R.h('label', { cls: 'atlas-col' }, [cb, R.h('span', { text: COL_LABELS[k] })]));
      });
      var script = R.h('div', { cls: 'atlas-seg', role: 'radiogroup', 'aria-label': T('atlas.col.script', 'Транслитерация') }, [
        R.h('button', { type: 'button', role: 'radio', cls: 'atlas-chip', 'data-script': 'lat', text: T('atlas.col.lat', 'Латиница') }),
        R.h('button', { type: 'button', role: 'radio', cls: 'atlas-chip', 'data-script': 'cyr', text: T('atlas.col.cyr', 'Кириллица') })]);
      script.querySelectorAll('[data-script]').forEach(function (b) {
        b.addEventListener('click', function () { set(Object.assign({}, layers, { script: b.getAttribute('data-script') })); });
      });
      panel.appendChild(R.h('div', { cls: 'atlas-view-head', text: T('room.aids.presetsTitle', 'Колонки таблицы') }));
      panel.appendChild(group);
      panel.appendChild(R.h('div', { cls: 'atlas-view-head', text: T('atlas.col.custom', 'Свой набор') }));
      panel.appendChild(cols);
      panel.appendChild(R.h('div', { cls: 'atlas-view-head', text: T('atlas.col.script', 'Транслитерация') }));
      panel.appendChild(script);
      var stageNote = R.h('p', { cls: 'atlas-stage-note', hidden: true });
      panel.insertBefore(stageNote, panel.firstChild);
      function paint() {
        var locked = stageNow() > 0;
        stageNote.hidden = !locked;
        if (locked) stageNote.textContent = T('atlas.train.stageLocks', 'Колонки сейчас задаёт ступень перевода — она меняется в «Тренировать».');
        group.querySelectorAll('[data-preset]').forEach(function (b) { b.disabled = locked; });
        script.querySelectorAll('[data-script]').forEach(function (b) { b.disabled = locked; });
        var current = P.of(layers);
        group.querySelectorAll('[data-preset]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-preset') === current)); });
        var sources = ['he', 'niqqud', 'translit'].filter(function (k) { return layers[k]; }).length;
        cols.querySelectorAll('input[data-col]').forEach(function (cb) {
          var k = cb.getAttribute('data-col');
          cb.checked = !!layers[k];
          cb.disabled = locked || (k !== 'ru' && !!layers[k] && sources === 1);
        });
        script.querySelectorAll('[data-script]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-script') === layers.script)); });
        script.classList.toggle('atlas-off', !layers.translit);
      }
      function set(next) {
        layers = normLayers(next);
        applyLayers(section, shown());
        paint();
        onLayers(Object.assign({}, layers));
      }
      function open(on) {
        if (on) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', String(on));
      }
      btn.addEventListener('click', function () { open(panel.hasAttribute('hidden')); });
      panel.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { open(false); if (btn.focus) btn.focus(); } });
      doc.addEventListener('click', function onOutside(ev) {
        if (!panel.isConnected) { doc.removeEventListener('click', onOutside); return; }
        if (panel.hasAttribute('hidden') || !ev.target || !ev.target.closest) return;
        if (!ev.target.closest('.atlas-view-panel') && !ev.target.closest('.atlas-view-btn')) open(false);
      });
      applyLayers(section, shown());
      paint();
      return { btn: btn, panel: panel, refresh: function () { applyLayers(section, shown()); paint(); } };
    }

    // Search owns a navigation epoch, so a slow index/section cannot replace a newer view.
    var navigationEpoch = 0, searchBundle = null, lastSearch = null;
    var Engine = opts.searchEngine || root.AtlasSearch;
    function digest(value) {
      var cryptoApi = root.crypto;
      if (!cryptoApi || !cryptoApi.subtle) return Promise.reject(new Error('SHA256_UNAVAILABLE'));
      return cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))).then(function (bytes) {
        return Array.from(new Uint8Array(bytes)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
      });
    }
    function checkedShard(ix, name) {
      return fetchJson(base + name).then(function (data) {
        if (!ix.shards || !ix.shards[name]) return data; // in-memory fixtures have no published manifest
        return digest(data).then(function (hash) { if (hash !== ix.shards[name]) throw new Error('SEARCH_SHARD_MISMATCH'); return data; });
      });
    }
    function loadSearch() {
      if (!Engine) return Promise.reject(new Error('SEARCH_ENGINE_UNAVAILABLE'));
      if (searchBundle) return searchBundle;
      searchBundle = Promise.all([loadIndex(), fetchJson(base + 'search.json')]).then(function (values) {
        var ix = values[1], book = values[0];
        if (!ix || ix.schema !== 'linguistpro.atlas-search.1') throw new Error('SEARCH_SCHEMA');
        if (book.sections_sha256 && JSON.stringify(book.sections_sha256) !== JSON.stringify(ix.sections_sha256)) throw new Error('SEARCH_SECTIONS_MISMATCH');
        return (book.search_sha256 ? digest(ix).then(function (hash) { if (hash !== book.search_sha256) throw new Error('SEARCH_INDEX_MISMATCH'); }) : Promise.resolve()).then(function () {
          return ix.details ? ix : Promise.all([checkedShard(ix, 'search-details.json'), ix.shards && ix.shards['search-previews.json'] ? checkedShard(ix, 'search-previews.json') : null]).then(function (parts) { var details = parts[0]; ix.details = details.details||details; ix.previews = (parts[1] && parts[1].previews) || details.previews; return ix; });
        }).then(function (ix) { return Engine.unpack(ix); });
      }).catch(function (error) { searchBundle = null; throw error; });
      return searchBundle;
    }
    function searchForm(sid, query, scope) {
      var input = R.h('input', { type: 'search', cls: 'atlas-search', dir: 'auto', value: query || '', maxlength: 2000,
        placeholder: T('atlas.bookSearch.placeholder', 'Термин, обозначение или фрагмент условия'), 'aria-label': T('atlas.bookSearch.label', 'Поиск по книге') });
      var select = R.h('select', { cls: 'atlas-search-scope', 'aria-label': T('atlas.bookSearch.scope', 'Область поиска') }, [
        R.h('option', { value: 'book', text: T('atlas.bookSearch.book', 'Во всей книге') })]);
      if (sid) select.appendChild(R.h('option', { value: 'section', text: T('atlas.bookSearch.section', 'В этом разделе') }));
      select.querySelectorAll('option').forEach(function(option){if(option.getAttribute('value')===(scope||'book'))option.setAttribute('selected','');});
      var form = R.h('form', { cls: 'atlas-book-search', role: 'search' }, [input, select,
        R.h('button', { type: 'submit', text: T('atlas.bookSearch.submit', 'Найти') })]);
      form.addEventListener('submit', function (ev) { ev.preventDefault(); if (select.value !== 'section') showSearch(input.value, { sid: sid, scope: select.value }); });
      select.addEventListener('change',function(){input.dispatchEvent(new doc.defaultView.Event('input'));});
      input.addEventListener('focus', function () { loadSearch().catch(function () {}); });
      input.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { input.value = ''; if (input.dispatchEvent) input.dispatchEvent(new doc.defaultView.Event('input')); if(view.querySelector('.atlas-search-results'))showHome(); } });
      return form;
    }
    function highlightText(text, q) {
      var span = R.h('span', { dir: 'auto' }), words = Engine ? Engine.tokens(q) : [];
      String(text || '').split(/(\s+)/).forEach(function (word) {
        var normalized = Engine ? Engine.tokens(word) : [];
        var hit = normalized.some(function (x) { return words.some(function (w) { return x === w || (/[а-я]/.test(x) && Engine.stemRu(x) === Engine.stemRu(w)); }); });
        span.appendChild(hit ? R.h('mark', { text: word }) : doc.createTextNode(word));
      });
      return span;
    }
    // «[\sigma_{lc}]» → σ with a real subscript «lc» (the search key «σlc» is not for reading).
    function symbolNode(latex) {
      var greek = (Engine && Engine.greek) || {};
      var s = String(latex || '').replace(/\\(?:left|right)/g, '').replace(/\\(?:text|mathrm|operatorname)\{([^}]*)\}/g, '$1')
        .replace(/\\prime/g, '′').replace(/\\([A-Za-z]+)/g, function (a, name) { return greek[name] || name; });
      var node = R.h('bdi', { dir: 'ltr' }), re = /([_^])(?:\{([^}]*)\}|(.))/g, last = 0, m;
      while ((m = re.exec(s))) {
        node.appendChild(doc.createTextNode(s.slice(last, m.index).replace(/[{}]/g, '')));
        node.appendChild(R.h(m[1] === '_' ? 'sub' : 'sup', { text: (m[2] != null ? m[2] : m[3]).replace(/[{}]/g, '') }));
        last = re.lastIndex;
      }
      node.appendChild(doc.createTextNode(s.slice(last).replace(/[{}]/g, '')));
      return node;
    }
    function showSearch(query, how) {
      how = how || {}; query = String(query || '').trim().slice(0, 2000);
      var heUi = /^he/i.test(doc.documentElement.getAttribute('lang') || '') || doc.documentElement.getAttribute('dir') === 'rtl';
      if (!query) return showHome(how);
      stopListening();
      stopTracking(); var epoch = ++navigationEpoch;
      var scope = how.scope || 'book', sid = how.sid || '';
      var form = searchForm(sid, query, scope), results = R.h('div', { cls: 'atlas-search-results', 'aria-busy': 'true' });
      view.replaceChildren(form, results);
      results.appendChild(R.h('p', { cls: 'atlas-state', text: T('atlas.loading', 'Загрузка…') }));
      lastSearch = { query: query, scope: scope, sid: sid, scroll: how.scroll || 0, limit: Math.max(50,Math.min(10000,how.limit||50)) };
      if (!how.restore) onState('', 0, how.mode || 'push', lastSearch);
      return loadSearch().then(function (ix) {
        if (/^".*"$/.test(query) && !ix.full) return checkedShard(ix, 'search-phrases.json').then(function (full) { ix.full = Engine.unpackPhrases(full); return ix; });
        return ix;
      }).then(function (ix) {
        if (epoch !== navigationEpoch || !view.isConnected) return;
        var isFragment = !/^"/.test(query) && (query.match(/[א-ת]+/g) || []).length >= 6;
        var hits = isFragment ? Engine.fragment(ix, query) : Engine.query(ix, query, { scope: scope, sid: sid });
        if (scope === 'section') hits = hits.filter(function (r) { return r.sid === sid; });
        results.replaceChildren(); results.setAttribute('aria-busy', 'false');
        var status = R.h('p', { cls: 'atlas-search-status', role: 'status', 'aria-live': 'polite', text: T('atlas.bookSearch.found', 'Найдено') + ': ' + hits.length });
        results.appendChild(status);
        if (isFragment) results.appendChild(R.h('p', { cls: 'atlas-muted atlas-search-fragment', text: T('atlas.bookSearch.fragment', 'Страницы по терминам фрагмента') }));
        if (!hits.length) results.appendChild(R.h('p', { cls: 'atlas-state', text: T('atlas.bookSearch.empty', 'Ничего не найдено. Попробуйте термин без огласовок или обозначение σ_Lc.') }));
        var groups = { term: 'Термины', symbol: 'Обозначения', formula: 'Формулы', block: 'Текст', table: 'Таблицы', figure: 'Рисунки', example: 'Примеры', erratum: 'Опечатки' };
        var limit = lastSearch.limit, more = null;
        function openResult(r, place) {
          lastSearch.scroll = doc.defaultView && doc.defaultView.scrollY || 0;
          onState('', 0, 'replace', lastSearch);
          var target = place ? { sid: place[0], page: place[1], ref: place[2] } : r;
          return openSection(target.sid, target.page, { ref: target.ref, cell:r.cell, query: query, fromSearch: true });
        }
        function paint() {
          if (more) more.remove();
          results.querySelectorAll('.atlas-result-group').forEach(function (n) { n.remove(); });
          Object.keys(groups).forEach(function (kind) {
            var all = hits.filter(function (r) { return r.kind === kind; }), shown = hits.slice(0, limit).filter(function (r) { return r.kind === kind; });
            if (!shown.length) return;
            var group = R.h('section', { cls: 'atlas-result-group' }, [R.h('h3', { text: T('atlas.bookSearch.' + kind, groups[kind]) + ' (' + all.length + ')' })]);
            shown.forEach(function (r) {
              var bookSection = index && index.sections.find(function (s) { return s.id === r.sid; });
              var button = R.h('button', { type: 'button', cls: 'atlas-search-result', 'data-search-result': r.ref, on: { click: function () { openResult(r); } } }, [
                R.h('span', { cls: 'atlas-result-page', text: T('atlas.page', 'стр.') + ' ' + r.page + ' · ' + (bookSection ? (heUi ? bookSection.he + ' / ' + bookSection.ru : bookSection.ru + ' / ' + bookSection.he) : r.sid) }),
                highlightText(r.detail && r.detail.niqqud || r.he, query), highlightText(r.detail && r.detail.translation || r.ru, query)]);
              if (r.detail && r.detail.symbol) { var sym = R.h('span', { cls: 'atlas-result-symbol' }, [symbolNode(r.detail.symbol)]); if (r.detail.unit) sym.appendChild(R.h('span', { cls: 'atlas-result-unit', dir: 'ltr', text: r.detail.unit })); button.appendChild(sym); }
              else if (r.detail && r.detail.symbols) button.appendChild(R.h('bdi',{dir:'ltr',cls:'atlas-result-symbol',text:r.detail.symbols}));
              if (r.detail && r.detail.translit) button.appendChild(R.h('span', { cls: 'atlas-translit', text: r.detail.translit }));
              if (r.match && r.match !== 'exact') button.appendChild(R.h('small', { cls: 'atlas-muted', text: T('atlas.bookSearch.' + r.match, r.match === 'related' ? 'Связанная единица' : r.match === 'case' ? 'Другой регистр' : r.match === 'partial' ? 'Частичное совпадение' : 'По форме слова') }));
              if(r.cell)button.appendChild(R.h('small',{cls:'atlas-muted',text:T('atlas.bookSearch.cell','Ячейка')+' '+(r.cell.row+1)+':'+(r.cell.col+1)}));
              var row = R.h('div', { cls: 'atlas-result-row' }, [button]);
              if (r.places) {
                var pages = R.h('div', { cls: 'atlas-result-pages' }), seen = {};
                r.places.forEach(function (p) { if (seen[p[1]]) return; seen[p[1]] = true; pages.appendChild(R.h('button', { type: 'button', text: T('atlas.page', 'стр.') + ' ' + p[1], on: { click: function () { openResult(r, p); } } })); });
                // A frequent term lives on 30+ pages: twelve chips, the rest one tap away (a phone screen is not a page index).
                var chips = Array.from(pages.children);
                if (chips.length > 14) {
                  chips.slice(12).forEach(function (b) { b.setAttribute('hidden', ''); });
                  pages.appendChild(R.h('button', { type: 'button', cls: 'atlas-result-pages-more', text: '+' + (chips.length - 12), 'aria-label': T('atlas.bookSearch.more', 'Показать ещё') + ' (' + (chips.length - 12) + ')', 'aria-expanded': 'false',
                    on: { click: function (ev) { chips.forEach(function (b) { b.removeAttribute('hidden'); }); ev.currentTarget.remove(); if (chips[12] && chips[12].focus) chips[12].focus(); } } }));
                }
                row.appendChild(pages);
              }
              if(r.formulas&&r.formulas.length){var formulas=R.h('div',{cls:'atlas-result-pages'});r.formulas.forEach(function(f){formulas.appendChild(R.h('button',{type:'button',text:T('atlas.bookSearch.formula','Формулы')+' '+(f.symbols||''),on:{click:function(){openResult(f);}}}));});row.appendChild(formulas);}
              group.appendChild(row);
            }); results.appendChild(group);
          });
          if (hits.length > limit) { more = R.h('button', { type: 'button', cls: 'atlas-search-more', text: T('atlas.bookSearch.more', 'Показать ещё'), on: { click: function () { limit += 50; lastSearch.limit=limit; paint(); } } }); results.appendChild(more); }
        }
        paint();
        results.addEventListener('keydown', function (ev) { if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return; var buttons = Array.from(results.querySelectorAll('button')), at = buttons.indexOf(ev.target), next = buttons[(at + (ev.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]; if (next) { ev.preventDefault(); next.focus(); } });
        if (how.scroll && doc.defaultView && doc.defaultView.scrollTo) doc.defaultView.scrollTo(0, how.scroll);
        // The Room header fills a phone screen: a new search brings its own results into view.
        else if (form.getBoundingClientRect && form.scrollIntoView && doc.defaultView && form.getBoundingClientRect().top > doc.defaultView.innerHeight * 0.35) form.scrollIntoView({ block: 'start' });
      }).catch(function () {
        if (epoch !== navigationEpoch || !view.isConnected) return;
        results.replaceChildren(R.h('p', { cls: 'atlas-state', 'data-search-unavailable': '', role: 'status', text: T('atlas.bookSearch.unavailable', 'Поиск по книге сейчас недоступен. Доступен поиск в открытом разделе.') }));
        results.setAttribute('aria-busy', 'false');
        results.appendChild(R.h('button', { type: 'button', text: T('atlas.contents', 'Оглавление атласа'), on: { click: function () { showHome(); } } }));
      });
    }

    // ---- Listening (plan P3 §4.4–4.5): Hebrew recordings made in advance. Nothing is synthesised while reading, no
    // key, no browser voice. A recording plays only when the fingerprint of the text on screen (AtlasSpeech.sourceOf)
    // matches the section manifest, so a text corrected after the bake stays silent instead of reading old words.
    // A section without recordings has no buttons and makes no request (index.json lists the sections that have them).
    var Speech = opts.speech || root.AtlasSpeech;
    var audioOpts = opts.audio || {};
    var LISTEN_KEY = 'room.atlas.listen';
    var listen = null;
    function listenPrefs() {
      var p = { rate: 1, formulas: true, mode: 'queue' };
      try { var s = JSON.parse(root.localStorage.getItem(LISTEN_KEY) || 'null'); if (s) { if ([0.75, 1, 1.25, 1.5].indexOf(Number(s.rate)) >= 0) p.rate = Number(s.rate); p.formulas = s.formulas !== false; if (s.mode === 'line') p.mode = 'line'; } } catch (_) {}
      return p;
    }
    function saveListenPrefs(p) { try { root.localStorage.setItem(LISTEN_KEY, JSON.stringify(p)); } catch (_) {} }
    function sha256Text(text) {
      var c = root.crypto;
      if (!c || !c.subtle || typeof TextEncoder === 'undefined') return Promise.reject(new Error('SHA256_UNAVAILABLE'));
      return c.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (bytes) {
        return Array.from(new Uint8Array(bytes)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
      });
    }
    // id → { key, kind } for every item whose recording matches the text on screen
    function verifiedRecordings(data, manifest) {
      var items = [];
      data.pages.forEach(function (p) { (p.items || []).forEach(function (it) { if (manifest.items[it.id]) items.push(it); }); });
      return Promise.all(items.map(function (it) {
        return sha256Text(Speech.sourceOf(it)).then(function (hash) {
          var entry = manifest.items[it.id];
          return hash === entry.src && /^[a-f0-9]{64}$/.test(entry.key) ? [it.id, { key: entry.key, kind: it.type === 'formula' ? 'formula' : 'block' }] : null;
        });
      })).then(function (pairs) {
        var out = {};
        pairs.forEach(function (x) { if (x) out[x[0]] = x[1]; });
        return out;
      });
    }
    function stopListening() {
      if (!listen) return;
      var l = listen; listen = null;
      l.closed = true;
      try { l.audio.pause(); } catch (_) {}
      try { l.audio.removeAttribute('src'); } catch (_) {}
      l.cleanup.forEach(function (fn) { try { fn(); } catch (_) {} });
      view.classList.remove('atlas-listening');
      view.querySelectorAll('.atlas-speaking').forEach(function (n) { n.classList.remove('atlas-speaking'); n.removeAttribute('aria-current'); });
      view.querySelectorAll('.atlas-say[aria-pressed="true"]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      if (l.player) l.player.remove();
      var ms = root.navigator && root.navigator.mediaSession;
      if (ms) { try { ms.metadata = null; ['play', 'pause', 'previoustrack', 'nexttrack'].forEach(function (a) { ms.setActionHandler(a, null); }); } catch (_) {} }
    }
    function setupListening(id, data, bar, section, how) {
      if (!Speech || !Speech.sourceOf) return Promise.resolve(null);
      return loadIndex().then(function (ix) {
        if (!ix || !ix.audio || !ix.audio[id]) return null;
        return fetchJson(base + 'audio/' + id + '.json').then(function (manifest) {
          if (!manifest || manifest.schema !== 'linguistpro.atlas-audio.1' || !manifest.items) return null;
          return verifiedRecordings(data, manifest).then(function (rec) {
            if (!section.isConnected || !Object.keys(rec).length) return null;
            return wireListening(id, data, bar, section, manifest, rec, ix, how);
          });
        });
      }).catch(function () { return null; });   // listening is an extra: the section reads the same without it
    }
    function wireListening(id, data, bar, section, manifest, rec, ix, how) {
      var cov = manifest.coverage || {}, total = ((cov.blocks || [])[1] || 0) + ((cov.formulas || [])[1] || 0);
      var voiced = Object.keys(rec).length;
      var title = R.h('span', {}, [T('atlas.listen.button', 'Слушать')]);
      var btn = R.h('button', { type: 'button', cls: 'atlas-listen-btn', 'aria-label': T('atlas.listen.start', 'Слушать раздел на иврите') }, [
        R.h('span', { 'aria-hidden': 'true', text: '▶ ' }), title]);
      bar.insertBefore(btn, bar.querySelector('.atlas-view-btn') || bar.querySelector('.atlas-print-btn'));
      section.querySelectorAll('.atlas-formula[data-ref]').forEach(function (card) {
        var r = rec[card.getAttribute('data-ref')];
        if (!r) return;
        card.insertBefore(R.h('button', { type: 'button', cls: 'atlas-say', 'aria-pressed': 'false', lang: 'he',
          'aria-label': T('atlas.listen.formula', 'Прочитать формулу на иврите'), title: T('atlas.listen.formula', 'Прочитать формулу на иврите') }, [
          R.h('span', { 'aria-hidden': 'true', text: '▶ ' }), 'עב']), card.firstChild);
      });
      // ▶ on each voiced line: the reading starts right there — the rest of the section or this line alone,
      // as the player's «Подряд / По строке» says (owner, 2026-11-02)
      section.querySelectorAll('.atlas-row[data-ref]').forEach(function (row) {
        if (!rec[row.getAttribute('data-ref')]) return;
        row.classList.add('atlas-has-say');
        row.appendChild(R.h('button', { type: 'button', cls: 'atlas-say atlas-say-line', 'aria-pressed': 'false',
          'aria-label': T('atlas.listen.line', 'Слушать эту строку'), title: T('atlas.listen.line', 'Слушать эту строку'), text: '▶' }));
      });
      var prefs = listenPrefs();
      function queue() {
        return Array.from(section.querySelectorAll('.atlas-row[data-ref], .atlas-formula[data-ref]')).filter(function (n) {
          var r = rec[n.getAttribute('data-ref')];
          return r && (prefs.formulas || r.kind !== 'formula');
        });
      }
      function nextSection() {
        var list = (ix.sections || []).filter(function (s) { return s.translated; });
        for (var i = 0; i < list.length - 1; i++) if (list[i].id === id) {
          for (var j = i + 1; j < list.length; j++) if (ix.audio && ix.audio[list[j].id]) return list[j];
          return null;
        }
        return null;
      }
      var api = {};
      function ensure() {
        if (listen && listen.section === section) return listen;
        stopListening();
        var audio = audioOpts.createElement ? audioOpts.createElement() : doc.createElement('audio');
        audio.preload = 'auto';
        var l = { section: section, audio: audio, at: -1, items: [], mode: 'queue', playing: false, errors: 0, followPause: 0, cleanup: [], player: null, closed: false };
        listen = l;
        audio.addEventListener('ended', function () { if (listen === l) { l.errors = 0; if (l.mode === 'single') finishSingle(); else playAt(l.at + 1); } });
        audio.addEventListener('error', function () {
          if (listen !== l) return;
          l.errors++;
          if (l.errors >= 3) { setStatus(T('atlas.listen.unavailable', 'Запись сейчас недоступна')); pause(); return; }
          if (l.mode === 'single') finishSingle(); else playAt(l.at + 1);
        });
        audio.addEventListener('pause', function () { if (listen === l) { l.playing = false; paintToggle(); } });
        audio.addEventListener('play', function () { if (listen === l) { l.playing = true; paintToggle(); } });
        // the reader scrolled on purpose: stop following for five seconds and offer the way back
        var win = doc.defaultView;
        function manual() { if (listen !== l || !l.player) return; l.followPause = Date.now() + 5000; var f = l.player.querySelector('.atlas-player-follow'); if (f) f.removeAttribute('hidden'); }
        function onKey(ev) { if (/^(PageUp|PageDown|ArrowUp|ArrowDown|Home|End| )$/.test(ev.key) && !(ev.target && ev.target.closest && ev.target.closest('input,select,textarea,button'))) manual(); }
        if (win && win.addEventListener) {
          win.addEventListener('wheel', manual, { passive: true }); win.addEventListener('touchmove', manual, { passive: true }); win.addEventListener('keydown', onKey);
          l.cleanup.push(function () { win.removeEventListener('wheel', manual); win.removeEventListener('touchmove', manual); win.removeEventListener('keydown', onKey); });
        }
        return l;
      }
      function setStatus(text) { if (listen && listen.player) listen.player.querySelector('.atlas-player-status').textContent = text; }
      function paintToggle() {
        if (!listen || !listen.player) return;
        var t = listen.player.querySelector('[data-act="toggle"]');
        t.textContent = listen.playing ? '⏸' : '▶';
        t.setAttribute('aria-label', listen.playing ? T('atlas.listen.pause', 'Пауза') : T('atlas.listen.play', 'Слушать'));
        paintSay();
      }
      function sayOf(el) { return el && Array.from(el.children || []).find(function (n) { return n.classList.contains('atlas-say'); }); }
      // the ▶ of the line being heard is pressed; a second tap on it pauses
      function paintSay() {
        section.querySelectorAll('.atlas-say[aria-pressed="true"]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        var b = listen && listen.playing && sayOf(listen.items[listen.at]);
        if (b) b.setAttribute('aria-pressed', 'true');
      }
      function mark(el) {
        section.querySelectorAll('.atlas-speaking').forEach(function (n) { n.classList.remove('atlas-speaking'); n.removeAttribute('aria-current'); });
        if (!el) return;
        el.classList.add('atlas-speaking'); el.setAttribute('aria-current', 'true');
      }
      function pageOf(el) { var p = el && el.closest && el.closest('.atlas-page'); return p ? Number(p.getAttribute('data-page')) : 0; }
      function follow(el) {
        if (!listen || Date.now() < listen.followPause || !el.scrollIntoView) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      function media(el) {
        var ms = root.navigator && root.navigator.mediaSession;
        if (!ms) return;
        try {
          if (root.MediaMetadata) ms.metadata = new root.MediaMetadata({ title: T('atlas.page', 'стр.') + ' ' + pageOf(el) + ' · ' + (data.title_he || ''),
            artist: 'LinguistPro', album: T('atlas.listen.album', 'Инженерный атлас 97002') });
          ms.setActionHandler('play', function () { resume(); });
          ms.setActionHandler('pause', function () { pause(); });
          ms.setActionHandler('previoustrack', function () { if (listen) playAt(Math.max(0, listen.at - 1)); });
          ms.setActionHandler('nexttrack', function () { if (listen) playAt(listen.at + 1); });
        } catch (_) {}
      }
      function start(el) {
        var l = ensure();
        if (typeof audioOpts.onStart === 'function') { try { audioOpts.onStart(); } catch (_) {} }
        return l;
      }
      function play(l, el) {
        var r = rec[el.getAttribute('data-ref')];
        l.audio.src = '/api/audio/' + r.key;
        l.audio.playbackRate = prefs.rate;
        mark(el);
        var p = l.audio.play();
        if (p && p.catch) p.catch(function () { if (listen === l) { l.playing = false; paintToggle(); } });
      }
      function playAt(i) {
        var l = listen;
        if (!l || l.closed) return;
        if (!section.isConnected) { stopListening(); return; }
        l.mode = prefs.mode === 'line' ? 'single' : 'queue';
        l.done = false;
        l.items = queue();
        if (i >= l.items.length) { finishSection(); return; }
        l.at = Math.max(0, i);
        l.lineDone = false;
        var el = l.items[l.at];
        play(l, el);
        follow(el);
        media(el);
        setStatus(T('atlas.page', 'стр.') + ' ' + pageOf(el) + ' · ' + (l.at + 1) + ' / ' + l.items.length + ' · ' +
          T('atlas.listen.coverage', 'озвучено') + ' ' + voiced + ' ' + T('atlas.listen.of', 'из') + ' ' + total);
        var end = l.player && l.player.querySelector('.atlas-player-end');
        if (end) end.setAttribute('hidden', '');
      }
      function finishSection() {
        var l = listen;
        l.playing = false; l.done = true; paintToggle(); mark(null);
        setStatus(T('atlas.listen.done', 'Раздел прослушан'));
        var end = l.player.querySelector('.atlas-player-end'), nx = nextSection();
        end.replaceChildren();
        if (nx) end.appendChild(R.h('button', { type: 'button', text: T('atlas.listen.nextSection', 'Следующий раздел') + ' →', on: { click: function () {
          stopListening(); openSection(nx.id, nx.first, { listen: true });
        } } }));
        end.removeAttribute('hidden');
      }
      // one line read: the player stays and the line stays marked; ▶ repeats it, ⏭ reads the next one alone
      function finishSingle() {
        var l = listen;
        if (!l) return;
        if (!l.player) { stopListening(); return; }
        l.playing = false; l.lineDone = true; paintToggle();
      }
      function pause() { if (listen) { try { listen.audio.pause(); } catch (_) {} listen.playing = false; paintToggle(); } }
      function resume() {
        if (!listen) return;
        if (listen.at < 0 || listen.done) { playAt(firstVisible()); return; }
        // after a line read alone: «По строке» repeats it, «Подряд» goes on from the next one
        if (listen.lineDone) { playAt(prefs.mode === 'line' ? listen.at : listen.at + 1); return; }
        var p = listen.audio.play(); if (p && p.catch) p.catch(function () {});
      }
      function firstVisible() {
        var items = queue(), line = barBottom();
        for (var i = 0; i < items.length; i++) if (!items[i].getBoundingClientRect || items[i].getBoundingClientRect().bottom > line) return i;
        return 0;
      }
      function openPlayer() {
        var l = start();
        if (l.player) return l;
        var rate = R.h('select', { 'data-act': 'rate', 'aria-label': T('atlas.listen.speed', 'Скорость') });
        [0.75, 1, 1.25, 1.5].forEach(function (x) {
          var o = R.h('option', { value: String(x), text: String(x).replace('.', ',') + '×' });
          if (x === prefs.rate) o.setAttribute('selected', '');
          rate.appendChild(o);
        });
        var mode = R.h('select', { 'data-act': 'mode', 'aria-label': T('atlas.listen.mode', 'Как читать') });
        [['queue', T('atlas.listen.modeQueue', 'Подряд')], ['line', T('atlas.listen.modeLine', 'По строке')]].forEach(function (x) {
          var o = R.h('option', { value: x[0], text: x[1] });
          if (x[0] === prefs.mode) o.setAttribute('selected', '');
          mode.appendChild(o);
        });
        var formulas = R.h('input', { type: 'checkbox', 'data-act': 'formulas' });
        formulas.checked = prefs.formulas;
        var player = R.h('div', { cls: 'atlas-player', role: 'region', 'aria-label': T('atlas.listen.player', 'Озвучка раздела') }, [
          R.h('div', { cls: 'atlas-player-row' }, [
            R.h('button', { type: 'button', 'data-act': 'prev', 'aria-label': T('atlas.listen.prev', 'Предыдущий фрагмент'), text: '⏮' }),
            R.h('button', { type: 'button', 'data-act': 'toggle', cls: 'atlas-player-main', 'aria-label': T('atlas.listen.pause', 'Пауза'), text: '⏸' }),
            R.h('button', { type: 'button', 'data-act': 'next', 'aria-label': T('atlas.listen.next', 'Следующий фрагмент'), text: '⏭' }),
            mode,
            rate,
            R.h('label', { cls: 'atlas-player-check' }, [formulas, R.h('span', { text: T('atlas.listen.formulas', 'Формулы') })]),
            R.h('span', { cls: 'atlas-player-lang', lang: 'he', text: T('atlas.listen.hebrew', 'иврит') }),
            R.h('button', { type: 'button', 'data-act': 'close', cls: 'atlas-player-close', 'aria-label': T('atlas.listen.close', 'Закрыть озвучку'), text: '✕' })]),
          R.h('div', { cls: 'atlas-player-status', role: 'status', 'aria-live': 'polite' }),
          R.h('button', { type: 'button', cls: 'atlas-player-follow', hidden: true, text: T('atlas.listen.follow', 'К читаемому месту') }),
          R.h('div', { cls: 'atlas-player-end', hidden: true })]);
        player.addEventListener('click', function (ev) {
          var b = ev.target.closest && ev.target.closest('[data-act], .atlas-player-follow');
          if (!b) return;
          if (b.classList.contains('atlas-player-follow')) {
            l.followPause = 0; b.setAttribute('hidden', '');
            var cur = l.items[l.at]; if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
            return;
          }
          var act = b.getAttribute('data-act');
          if (act === 'toggle') { if (l.playing) pause(); else resume(); }
          else if (act === 'prev') playAt(Math.max(0, l.at - 1));
          else if (act === 'next') playAt(l.at + 1);
          else if (act === 'close') stopListening();
        });
        // the line being heard finishes, then the new way applies
        mode.addEventListener('change', function () {
          prefs.mode = mode.value === 'line' ? 'line' : 'queue'; saveListenPrefs(prefs);
          l.mode = prefs.mode === 'line' ? 'single' : 'queue';
        });
        rate.addEventListener('change', function () { prefs.rate = Number(rate.value) || 1; l.audio.playbackRate = prefs.rate; saveListenPrefs(prefs); });
        formulas.addEventListener('change', function () {
          var cur = l.items[l.at];
          prefs.formulas = !!formulas.checked; saveListenPrefs(prefs);
          l.items = queue();
          var at = cur ? l.items.indexOf(cur) : -1;
          if (at >= 0) l.at = at;
          else if (cur) { var all = queue(); l.at = Math.max(-1, all.findIndex(function (n) { return cur.compareDocumentPosition && (cur.compareDocumentPosition(n) & 4); }) - 1); }
        });
        l.player = player;
        view.appendChild(player);
        view.classList.add('atlas-listening');
        return l;
      }
      // «Слушать» on the bar means the whole section: it sets a «По строке» player back to «Подряд»
      function queueMode() {
        if (prefs.mode !== 'line') return;
        prefs.mode = 'queue'; saveListenPrefs(prefs);
        if (listen) listen.mode = 'queue';
        var m = listen && listen.player && listen.player.querySelector('[data-act="mode"]');
        if (m) Array.from(m.options || m.querySelectorAll('option')).forEach(function (o) { o.selected = o.value === 'queue'; if (o.selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
      }
      btn.addEventListener('click', function () {
        if (listen && listen.player && listen.section === section) { if (listen.playing) pause(); else { queueMode(); resume(); } return; }
        queueMode(); openPlayer(); playAt(firstVisible());
      });
      // ▶ עב on a formula card: that formula alone; with the player open, the reading goes on from there
      section.addEventListener('click', function (ev) {
        var say = ev.target.closest && ev.target.closest('.atlas-say');
        if (say) {
          if (say.getAttribute('aria-pressed') === 'true' && listen && listen.section === section) { pause(); return; }
          var line = say.parentNode;
          var l = openPlayer();
          // a formula asked for by its own ▶ is read even when the player leaves formulas out
          if (queue().indexOf(line) < 0 && !prefs.formulas) {
            prefs.formulas = true; saveListenPrefs(prefs);
            var cb = l.player.querySelector('[data-act="formulas"]'); if (cb) cb.checked = true;
          }
          var at = queue().indexOf(line);
          if (at >= 0) playAt(at);
          return;
        }
        // A tap on a paragraph no longer reads from it (owner decision E3, 2026-11-02): a word opens its card,
        // «read from here» is the ▶ of the line.
      });
      api.start = function () { openPlayer(); playAt(firstVisible()); };
      if (how && how.listen) api.start();
      return api;
    }

    function openSection(id, page, how) {
      how = how || {};
      stopListening();
      stopTracking(); var sectionEpoch = ++navigationEpoch;
      state(T('atlas.loading', 'Загрузка…'));
      return fetchJson(base + 'sections/' + id + '.json').then(function (data) {
        if (sectionEpoch !== navigationEpoch || !view.isConnected) return;
        var bar = R.h('div', { cls: 'atlas-toolbar' }, [
          R.h('button', { type: 'button', cls: 'atlas-back', text: '← ' + T('atlas.contents', 'Оглавление атласа'), on: { click: function () { showHome(); } } }),
          R.h('form', { cls: 'atlas-pagejump' }, [R.h('input', { type: 'number', min: 1, max: 564, inputmode: 'numeric', placeholder: T('atlas.page', 'стр.'),
            'aria-label': T('atlas.jump', 'Страница книги') }), R.h('button', { type: 'submit', text: '→', 'aria-label': T('atlas.open', 'Открыть') })]),
          searchForm(id, '', 'book'),
          R.h('span', { cls: 'atlas-search-count', 'aria-live': 'polite' }),
          R.h('button', { type: 'button', cls: 'atlas-print-btn', title: T('atlas.print', 'Печать раздела'), 'aria-label': T('atlas.print', 'Печать раздела'), on: { click: function () { printSection(data); } } },
            [R.h('span', { cls: 'atlas-print-label', text: T('atlas.print', 'Печать раздела') }), R.h('span', { cls: 'atlas-print-short', 'aria-hidden': 'true', text: T('atlas.printShort', 'Печать') })])]);
        var section = R.renderSection(T, data, {});
        var columns = viewPanel(section, id);
        bar.insertBefore(columns.btn, bar.querySelector('.atlas-print-btn'));
        bar.appendChild(columns.panel);
        view.replaceChildren(bar, section);
        if (how.fromSearch && lastSearch) {
          var backResults=R.h('button',{type:'button',cls:'atlas-return-results',text:'← '+T('atlas.bookSearch.back','К результатам'),on:{click:function(){showSearch(lastSearch.query,lastSearch);}}});
          bar.insertBefore(backResults,bar.firstChild);
        }
        wireInteractions(section);
        wireReview(section);
        // P4 word layer: the host wraps the Hebrew words for the Room's word card (plan P4, owner decision E2)
        if (opts.words && typeof opts.words.attach === 'function') {
          try { opts.words.attach(section, data, { layers: function () { return layers; }, panel: columns.panel, bar: bar, refreshLayers: columns.refresh }); } catch (_) {}
        }
        track.input = bar.querySelector('.atlas-pagejump input');
        // any page of the book without going back to the contents
        bar.querySelector('.atlas-pagejump').addEventListener('submit', function (ev) {
          ev.preventDefault();
          var n = Number(bar.querySelector('.atlas-pagejump input').value);
          if (!n) return;
          if (data.first <= n && n <= data.last) {
            if (goToPage(n)) onState(id, n, 'replace');
            return;
          }
          loadIndex().then(function (ix) {
            var s = ix && ix.sections.filter(function (x) { return x.first <= n && n <= x.last; })[0];
            if (s) openSection(s.id, n);
          });
        });
        var search = bar.querySelector('.atlas-search'), count = bar.querySelector('.atlas-search-count');
        var hits = [], at = 0;
        function showHit() {
          count.textContent = hits.length ? (at + 1) + ' / ' + hits.length : '';
          if (hits[at] && hits[at].scrollIntoView) hits[at].scrollIntoView({ block: 'center' });
        }
        search.addEventListener('input', function (ev) {
          if (bar.querySelector('.atlas-search-scope').value !== 'section') {section.querySelectorAll('.atlas-hit').forEach(function(n){n.classList.remove('atlas-hit');});hits=[];count.textContent='';return;}
          var q = String(ev.target.value || '').trim().toLowerCase();
          hits = []; at = 0;
          section.querySelectorAll('.atlas-row, .atlas-table td, .atlas-formula, .atlas-regions li, .atlas-steps li, .atlas-erratum').forEach(function (row) {
            var hit = !!q && row.textContent.toLowerCase().indexOf(q) >= 0;
            row.classList.toggle('atlas-hit', hit);
            if (hit) hits.push(row);
          });
          showHit();
          if (q && !hits.length) count.textContent = T('atlas.searchNone', 'ничего не найдено');
        });
        // Enter moves to the next match, Shift+Enter to the previous one
        search.addEventListener('keydown', function (ev) {
          if (ev.key !== 'Enter' || !hits.length) return;
          ev.preventDefault();
          at = (at + (ev.shiftKey ? hits.length - 1 : 1)) % hits.length;
          showHit();
        });
        track.last = page || data.first;
        if (track.input) track.input.value = String(track.last);
        if (page) goToPage(page, how.ref, how.cell);
        if(how.ref){var target=Array.from(section.querySelectorAll('[data-ref]')).find(function(n){return n.getAttribute('data-ref')===how.ref;});if(target){if(how.cell){var cell=target.querySelector('[data-cell="'+how.cell.row+':'+how.cell.col+'"]');if(cell)target=cell;}target.classList.add('atlas-hit');if(target.scrollIntoView)target.scrollIntoView({block:'center'});}else if(how.query){section.querySelectorAll('.atlas-row').forEach(function(n){if(n.textContent.toLowerCase().includes(how.query.toLowerCase()))n.classList.add('atlas-hit');});}}
        if (!how.restore) onState(id, page || data.first, 'push');
        trackPages(id, section);
        setupListening(id, data, bar, section, how);
        return data;
      }).catch(function () { if(sectionEpoch===navigationEpoch)state(T('atlas.loadError', 'Раздел атласа сейчас недоступен')); });
    }

    function loadIndex() {
      if (index) return Promise.resolve(index);
      return fetchJson(base + 'index.json').then(function (data) { index = data; return index; });
    }

    // Contents: «вычитано N / M стр.» per translated section, a thin bar, and the book total.
    function paintHomeReview(home) {
      var marks = reviewMarks || {}, total = 0, done = 0;
      home.querySelectorAll('.atlas-sec-review').forEach(function (el) {
        var a = Number(el.getAttribute('data-first')), b = Number(el.getAttribute('data-last')), n = b - a + 1, k = 0;
        for (var p = a; p <= b; p++) if (marks[String(p)]) k++;
        total += n; done += k;
        el.setAttribute('data-done', k === n ? 'all' : k ? 'some' : 'none');
        el.style.setProperty('--atlas-review-share', (k / n * 100).toFixed(1) + '%');
        el.textContent = (k === n ? '✓ ' : '') + T('atlas.review.short', 'вычитано') + ' ' + k + ' / ' + n;
      });
      var line = home.querySelector('.atlas-home-review');
      if (line) line.textContent = total ? ' · ' + T('atlas.review.count', 'вычитано страниц') + ': ' + done + ' / ' + total : '';
    }
    function homeView() {
      var open = function (id, page) { return openSection(id, page); };
      var home = R.renderHome(T, index, open);
      home.insertBefore(searchForm('', '', 'book'),home.querySelector('.atlas-jump'));
      var win=doc.defaultView;if(win&&win.requestIdleCallback)win.requestIdleCallback(function(){if(home.isConnected)loadSearch().catch(function(){});},{timeout:1500});
      paintHomeReview(home);
      if (review && !reviewMarks) Promise.resolve().then(review.load).then(function (r) {
        if (r && r.pages) { reviewMarks = r.pages; paintHomeReview(home); }
      }).catch(function () {});
      return home;
    }

    function showHome(how) {
      how = how || {};
      stopListening();
      stopTracking(); var homeEpoch=++navigationEpoch; lastSearch=null;
      if (!how.restore) onState('', 0, 'push');
      if (index) { view.replaceChildren(homeView()); return Promise.resolve(index); }
      state(T('atlas.loading', 'Загрузка…'));
      return fetchJson(base + 'index.json').then(function (data) {
        if(homeEpoch!==navigationEpoch || !view.isConnected)return;
        index = data;
        view.replaceChildren(homeView());
        return index;
      }).catch(function () { state(T('atlas.loadError', 'Атлас сейчас недоступен')); });
    }

    return { home: showHome, openSection: openSection, search: showSearch, stopAudio: stopListening };
  }

  // Print preparation: the print view, plus a page style appended last in the document so the atlas footer wins over
  // the Room's default @page (Physics). Returns a cleanup function.
  function preparePrint(doc, data, t) {
    var T = makeT(t);
    var printRoot = factory(doc).renderPrint(T, data);
    var style = doc.createElement('style');
    style.setAttribute('data-atlas-print', '');
    style.textContent = '@page { size: A4 portrait; margin: 11mm 11mm 14mm; ' +
      '@bottom-left { content: "LinguistPro · ' + T('atlas.printFooter', 'Инженерный атлас 97002 · ждёт вычитки владельца') + '"; color: #64748b; font: 8pt/1.2 system-ui, sans-serif; } ' +
      '@bottom-right { content: counter(page) " / " counter(pages); color: #64748b; font: 8pt/1.2 system-ui, sans-serif; } }';
    doc.body.appendChild(printRoot);
    doc.body.appendChild(style);
    doc.body.classList.add('atlas-printing');
    return function () { doc.body.classList.remove('atlas-printing'); printRoot.remove(); style.remove(); };
  }

  var api = { mount: mount, factory: factory, dirOf: dirOf, preparePrint: preparePrint, applyLayers: applyLayers, normLayers: normLayers };
  root.AtlasReader = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
