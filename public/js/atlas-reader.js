/* atlas-reader.js — Engineering atlas (נוסחאון 97002) in the Reading Room.
 * Data: /data/atlas/<id>/index.json and sections/<sid>.json, built by scripts/atlas/build_reader_data.py.
 * Spec: docs/planning/ENGINEERING_FORMULARY_ATLAS_DESIGN_2026_10_30.md §8; plan: ENGINEERING_ATLAS_P2_READER_PLAN_2026_10_31.md.
 * Formulas arrive as MathML generated at build time (KaTeX output, escaped), so no maths library runs here.
 * Supplier content stays visibly unconfirmed until the owner reviews it (statuses come from the data). */
(function (root) {
  'use strict';

  var HEB = /[א-ת]/;
  var CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

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
    function heText(text, cls) {
      return h('div', { cls: cls || 'atlas-he', lang: 'he', dir: dirOf(text), text: text });
    }
    function badge(T, status) {
      if (!status) return null;
      if (status.owner_status === 'owner_confirmed') return h('span', { cls: 'atlas-badge ok', text: T('atlas.status.ownerConfirmed', 'подтверждено владельцем') });
      if (status.language_review === 'owner_reviewed') return h('span', { cls: 'atlas-badge ok', text: T('atlas.status.ownerReviewed', 'вычитано владельцем') });
      if (status.language_review === 'producer_checked') return h('span', { cls: 'atlas-badge', title: T('atlas.status.pendingHint', 'Подготовлено и проверено поставщиком; вычитка владельцем впереди'), text: T('atlas.status.producerChecked', 'ждёт вычитки') });
      return null;
    }

    function renderBlock(T, item, opts) {
      var row = h('div', { cls: 'atlas-row', 'data-ref': item.id });
      if (!item.ru) {
        row.appendChild(h('div', { cls: 'atlas-src' }, [heText(item.he_raw || '', 'atlas-he atlas-raw')]));
        row.appendChild(h('div', { cls: 'atlas-tr' }, [h('span', { cls: 'atlas-muted', text: T('atlas.noTranslation', 'нет перевода — исходный текст') })]));
        return row;
      }
      var src = h('div', { cls: 'atlas-src' }, [heText(item.he)]);
      if (item.he_niqqud) src.appendChild(heText(item.he_niqqud, 'atlas-he atlas-niqqud'));
      if (item.translit) src.appendChild(h('div', { cls: 'atlas-translit', text: item.translit }));
      if (item.translit_ru) src.appendChild(h('div', { cls: 'atlas-translit atlas-translit-ru', text: item.translit_ru }));
      var tr = h('div', { cls: 'atlas-tr' }, [h('div', { cls: 'atlas-ru', lang: 'ru', text: item.ru }), badge(T, item.status)]);
      if (item.ambiguity_note) tr.appendChild(h('div', { cls: 'atlas-note', text: item.ambiguity_note }));
      row.appendChild(src); row.appendChild(tr);
      if (item.kind) row.setAttribute('data-kind', item.kind);
      return row;
    }

    function renderFormula(T, item) {
      var card = h('div', { cls: 'atlas-formula', 'data-ref': item.id });
      if (item.mathml) card.appendChild(h('div', { cls: 'atlas-math', html: item.mathml }));
      else if (item.latex) card.appendChild(h('code', { cls: 'atlas-latex', text: item.latex }));
      else if (item.source_text) card.appendChild(h('code', { cls: 'atlas-latex', text: item.source_text }));
      if (item.vars && item.vars.length) {
        var table = h('table', { cls: 'atlas-vars' });
        item.vars.forEach(function (v) {
          table.appendChild(h('tr', { 'data-ref': v.ref }, [
            h('td', { cls: 'atlas-var', html: v.mathml || null, text: v.mathml ? null : v.latex }),
            h('td', {}, [heText(v.he || '', 'atlas-he atlas-inline')]),
            h('td', { text: v.ru || '' }), h('td', { cls: 'atlas-unit', text: v.unit || '' })]));
        });
        card.appendChild(table);
      }
      if (item.note) card.appendChild(h('div', { cls: 'atlas-note', text: item.note }));
      if (item.crop) {
        var orig = h('details', { cls: 'atlas-orig' }, [h('summary', { text: T('atlas.original', 'как в книге') }),
          h('img', { src: item.crop, alt: T('atlas.original', 'как в книге'), loading: 'lazy' })]);
        card.appendChild(orig);
      }
      return card;
    }

    function renderFigure(T, fig, numbered) {
      var box = h('div', { cls: 'atlas-figbox' }, [h('img', { src: fig.crop, alt: fig.caption_ru || fig.id, loading: 'lazy' })]);
      var list = h('ol', { cls: 'atlas-regions' });
      var w = fig.bbox[2] - fig.bbox[0], ht = fig.bbox[3] - fig.bbox[1];
      fig.regions.forEach(function (r, k) {
        var mark = CIRCLED[k] || String(k + 1);
        var style = 'left:' + ((r.bbox[0] - fig.bbox[0]) / w * 100).toFixed(2) + '%;top:' + ((r.bbox[1] - fig.bbox[1]) / ht * 100).toFixed(2) +
          '%;width:' + ((r.bbox[2] - r.bbox[0]) / w * 100).toFixed(2) + '%;height:' + ((r.bbox[3] - r.bbox[1]) / ht * 100).toFixed(2) + '%';
        var links = (r.links || []).join(' ');
        // a label beside a region in the right half would run past the page edge: open it to the left instead
        var flip = (r.bbox[0] + r.bbox[2]) / 2 > (fig.bbox[0] + fig.bbox[2]) / 2 ? ' flip' : '';
        box.appendChild(h('button', { cls: 'atlas-rg', type: 'button', style: style, 'data-region': r.id, 'data-links': links,
          'aria-label': r.label_ru || r.label_he }, [h('i', { cls: (numbered ? 'n' : 't') + flip, text: numbered ? mark : (r.label_ru || r.label_he) })]));
        list.appendChild(h('li', { 'data-region': r.id, 'data-links': links }, [h('b', { text: mark + ' ' }),
          h('bdi', { lang: 'he', dir: dirOf(r.label_he), text: r.label_he || '' }), ' — ' + (r.label_ru || '')]));
      });
      var cap = h('figcaption', {}, [h('bdi', { lang: 'he', dir: 'rtl', text: fig.caption_he || '' }),
        (fig.caption_he && fig.caption_ru ? ' — ' : ''), fig.caption_ru || '']);
      return h('figure', { cls: 'atlas-fig' + (fig.is_table ? ' atlas-tablefig' : '') }, [box, cap, fig.regions.length ? list : null]);
    }

    function renderTable(table) {
      var cells = table.cells || [];
      var width = 0, covered = {}, pos = {}, rows = {};
      cells.forEach(function (c) {
        width = Math.max(width, c.col + c.colspan);
        pos[c.row + ':' + c.col] = c; rows[c.row] = true;
        for (var r = c.row; r < c.row + c.rowspan; r++) for (var k = c.col; k < c.col + c.colspan; k++) if (r !== c.row || k !== c.col) covered[r + ':' + k] = true;
      });
      var body = h('tbody'), head = h('thead'), inHead = true;
      Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
        var tr = h('tr'), numeric = false;
        for (var k = 0; k < width; k++) {
          var c = pos[r + ':' + k];
          if (c) {
            var text = c.ru || '';
            if (/^[\d.,\s▪•+\-−]+$/.test(text) && /\d/.test(text)) numeric = true;
            var unit = c.unit && c.unit !== '—' && text.slice(-c.unit.length) !== c.unit ? c.unit : '';
            tr.appendChild(h('td', { colspan: c.colspan > 1 ? c.colspan : null, rowspan: c.rowspan > 1 ? c.rowspan : null, dir: dirOf(text) },
              [text, unit ? h('small', { text: ' ' + unit }) : null]));
          } else if (!covered[r + ':' + k]) tr.appendChild(h('td'));
        }
        if (numeric) inHead = false;
        (inHead ? head : body).appendChild(tr);
      });
      var t = h('table', { cls: 'atlas-table' + (width > 8 ? ' wide' : '') }, [
        h('caption', {}, [table.title_ru || '', table.title_he ? h('bdi', { lang: 'he', dir: 'rtl', text: ' ' + table.title_he }) : null]),
        head.childNodes.length ? head : null, body]);
      return h('div', { cls: 'atlas-tablewrap' }, [t]);
    }

    function renderErratum(T, x) {
      var el = h('div', { cls: 'atlas-erratum', 'data-target': x.target }, [
        h('b', { text: '⚠ ' + T('atlas.erratum.printed', 'в книге:') + ' ' }), h('code', { text: x.as_printed || '' })]);
      if (x.proposed) { el.appendChild(h('b', { text: ' → ' + T('atlas.erratum.proposed', 'предлагаемое исправление:') + ' ' })); el.appendChild(h('code', { text: x.proposed })); }
      el.appendChild(h('div', { cls: 'atlas-why', text: x.explanation_ru || '' }));
      if (x.core_note) el.appendChild(h('div', { cls: 'atlas-why', text: T('atlas.erratum.core', 'Пересчёт ядра:') + ' ' + x.core_note }));
      el.appendChild(h('small', { cls: 'atlas-muted', text: T('atlas.erratum.pending', 'ждёт подтверждения владельца') }));
      return el;
    }

    function renderExample(T, ex) {
      var list = h('ol', { cls: 'atlas-steps' });
      (ex.steps || []).forEach(function (s) {
        var verdict = s.math_review === 'core_verified' ? T('atlas.core.verified', 'арифметика сошлась')
          : s.math_review === 'core_mismatch' ? T('atlas.core.mismatch', 'арифметика не сошлась') : T('atlas.core.unchecked', 'не пересчитано');
        var bind = Object.keys(s.bindings || {}).map(function (k) { return k + ' = ' + s.bindings[k]; }).join(', ');
        list.appendChild(h('li', {}, [h('code', { text: s.compute }), ' · ' + bind + ' → ', h('b', { text: s.printed }), ' ',
          h('span', { cls: 'atlas-badge ' + (s.math_review || ''), text: verdict })]));
      });
      return h('div', { cls: 'atlas-example' }, [h('h4', { text: ex.title_ru || T('atlas.example', 'Пример') }), list]);
    }

    function renderPage(T, page, opts) {
      var sec = h('section', { cls: 'atlas-page', id: 'atlas-p' + page.page, 'data-page': page.page });
      var thumb = page.image ? h('button', { cls: 'atlas-thumb', type: 'button', 'aria-label': T('atlas.openOriginal', 'Открыть страницу оригинала'),
        'data-image': page.image }, [h('img', { src: page.image, alt: T('atlas.page', 'стр.') + ' ' + page.page, loading: 'lazy' })]) : null;
      sec.appendChild(h('header', { cls: 'atlas-page-head' }, [h('span', { cls: 'atlas-pageno', text: T('atlas.page', 'стр.') + ' ' + page.page }),
        page.translated ? null : h('span', { cls: 'atlas-badge', text: T('atlas.noTranslationShort', 'без перевода') })]));
      var body = h('div', { cls: 'atlas-page-body' });
      var aside = h('aside', { cls: 'atlas-aside' }, [thumb]);
      var main = h('div', { cls: 'atlas-main' });
      var errataByTarget = {};
      (page.errata || []).forEach(function (x) { (errataByTarget[x.target] = errataByTarget[x.target] || []).push(x); });
      var shown = {};
      page.items.forEach(function (item) {
        main.appendChild(item.type === 'formula' ? renderFormula(T, item) : renderBlock(T, item, opts));
        (errataByTarget[item.id] || []).forEach(function (x) { shown[x.id] = true; main.appendChild(renderErratum(T, x)); });
      });
      (page.figures || []).forEach(function (f) { main.appendChild(renderFigure(T, f, false)); });
      (page.tables || []).forEach(function (t) { main.appendChild(renderTable(t)); });
      (page.examples || []).forEach(function (ex) {
        main.appendChild(renderExample(T, ex));
        (errataByTarget[ex.id] || []).forEach(function (x) { shown[x.id] = true; main.appendChild(renderErratum(T, x)); });
      });
      (page.errata || []).forEach(function (x) { if (!shown[x.id]) main.appendChild(renderErratum(T, x)); });
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
        list.appendChild(h('dd', { text: (term.senses || []).map(function (s) { return s.ru; }).join('; ') }));
      });
      return h('details', { cls: 'atlas-terms-wrap' }, [h('summary', { text: T('atlas.terms', 'Словарь раздела') + ' (' + ids.length + ')' }), list]);
    }

    function renderSection(T, data, opts) {
      var wrap = h('div', { cls: 'atlas-section', 'data-section': data.id });
      wrap.appendChild(h('h2', { cls: 'atlas-title' }, [h('bdi', { lang: 'he', dir: 'rtl', text: data.title_he }), ' · ' + data.title_ru]));
      wrap.appendChild(h('p', { cls: 'atlas-sub', text: T('atlas.pages', 'страницы') + ' ' + data.first + '–' + data.last +
        (data.translated ? '' : ' · ' + T('atlas.noTranslationShort', 'без перевода')) }));
      var terms = renderTerms(T, data.terms);
      if (terms) wrap.appendChild(terms);
      data.pages.forEach(function (p) { wrap.appendChild(renderPage(T, p, opts)); });
      return wrap;
    }

    function renderHome(T, index, onOpen) {
      var wrap = h('div', { cls: 'atlas-home' });
      wrap.appendChild(h('h2', { cls: 'atlas-title' }, [h('bdi', { lang: 'he', dir: 'rtl', text: index.title_he }), h('br'), index.title_ru]));
      var done = index.sections.filter(function (s) { return s.translated; }).length;
      wrap.appendChild(h('p', { cls: 'atlas-sub', text: T('atlas.progress', 'Переведено разделов') + ': ' + done + ' / ' + index.sections.length +
        ' · ' + T('atlas.pendingAll', 'перевод подготовлен поставщиком и ждёт вычитки владельца') }));
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
            h('span', { cls: 'atlas-badge' + (s.translated ? ' ok' : ''), text: s.translated ? T('atlas.translated', 'переведено') : T('atlas.noTranslationShort', 'без перевода') })])]));
        });
        wrap.appendChild(h('section', { cls: 'atlas-part' }, [h('h3', {}, [part.ru + ' · ', h('bdi', { lang: 'he', dir: 'rtl', text: part.he })]), list]));
      });
      return wrap;
    }

    function renderPrint(T, data) {
      var rootEl = h('div', { cls: 'atlas-print-root' });
      data.pages.forEach(function (page) {
        var rows = h('tbody');
        page.items.forEach(function (item) {
          if (item.type === 'formula') {
            var vs = (item.vars || []).map(function (v) { return (v.latex || '') + ' — ' + (v.ru || '') + (v.unit ? ', ' + v.unit : ''); }).join(' · ');
            rows.appendChild(h('tr', {}, [h('td', { colspan: 2 }, [h('div', { cls: 'atlas-pmath', html: item.mathml || null, text: item.mathml ? null : (item.latex || item.source_text || '') }),
              h('div', { cls: 'atlas-pvars', text: vs }), item.note ? h('div', { cls: 'atlas-note', text: item.note }) : null])]));
          } else {
            rows.appendChild(h('tr', {}, [h('td', { cls: 'atlas-pru', text: item.ru || T('atlas.noTranslationShort', 'без перевода') }),
              h('td', { cls: 'atlas-phe', lang: 'he', dir: dirOf(item.he || item.he_raw), text: item.he || item.he_raw || '' })]));
          }
          (page.errata || []).filter(function (x) { return x.target === item.id; }).forEach(function (x) {
            rows.appendChild(h('tr', {}, [h('td', { colspan: 2 }, [renderErratum(T, x)])]));
          });
        });
        var extra = h('div');
        (page.figures || []).forEach(function (f) { extra.appendChild(renderFigure(T, f, true)); });
        (page.tables || []).forEach(function (t) { extra.appendChild(renderTable(t)); });
        var sheet = h('table', { cls: 'atlas-sheet' }, [
          h('thead', {}, [h('tr', {}, [h('td', { colspan: 2 }, [h('div', { cls: 'atlas-shead' }, [h('b', { text: T('atlas.page', 'стр.') + ' ' + page.page }),
            h('span', {}, [h('bdi', { lang: 'he', dir: 'rtl', text: data.title_he }), ' · ' + data.title_ru])])])])]),
          rows, h('tfoot', {}, [h('tr', {}, [h('td', { colspan: 2 }, [extra])])])]);
        rootEl.appendChild(h('section', { cls: 'atlas-psheet' }, [sheet]));
      });
      return rootEl;
    }

    return { h: h, renderHome: renderHome, renderSection: renderSection, renderPage: renderPage, renderTable: renderTable, renderPrint: renderPrint, dirOf: dirOf };
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

    function state(text) { view.replaceChildren(R.h('p', { cls: 'atlas-state', text: text })); }

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

    function openSection(id, page) {
      state(T('atlas.loading', 'Загрузка…'));
      return fetchJson(base + 'sections/' + id + '.json').then(function (data) {
        var bar = R.h('div', { cls: 'atlas-toolbar' }, [
          R.h('button', { type: 'button', cls: 'atlas-back', text: '← ' + T('atlas.contents', 'Оглавление атласа'), on: { click: showHome } }),
          R.h('label', { cls: 'atlas-toggle' }, [R.h('input', { type: 'checkbox', 'data-toggle': 'hebrew-only' }), ' ' + T('atlas.hebrewOnly', 'только иврит')]),
          R.h('input', { type: 'search', cls: 'atlas-search', placeholder: T('atlas.search', 'Поиск в разделе: иврит или русский'), 'aria-label': T('atlas.search', 'Поиск в разделе: иврит или русский') }),
          R.h('button', { type: 'button', cls: 'atlas-print-btn', text: T('atlas.print', 'Печать раздела'), on: { click: function () { printSection(data); } } })]);
        var section = R.renderSection(T, data, {});
        view.replaceChildren(bar, section);
        wireInteractions(section);
        bar.querySelector('[data-toggle="hebrew-only"]').addEventListener('change', function (ev) { section.classList.toggle('atlas-hebrew-only', ev.target.checked); });
        bar.querySelector('.atlas-search').addEventListener('input', function (ev) {
          var q = String(ev.target.value || '').trim().toLowerCase();
          var first = null;
          section.querySelectorAll('.atlas-row').forEach(function (row) {
            var hit = q && row.textContent.toLowerCase().indexOf(q) >= 0;
            row.classList.toggle('atlas-hit', !!hit);
            if (hit && !first) first = row;
          });
          if (first && first.scrollIntoView) first.scrollIntoView({ block: 'center' });
        });
        if (page) { var target = doc.getElementById('atlas-p' + page); if (target && target.scrollIntoView) target.scrollIntoView(); }
        return data;
      }).catch(function () { state(T('atlas.loadError', 'Раздел атласа сейчас недоступен')); });
    }

    function showHome() {
      if (index) { view.replaceChildren(R.renderHome(T, index, openSection)); return Promise.resolve(index); }
      state(T('atlas.loading', 'Загрузка…'));
      return fetchJson(base + 'index.json').then(function (data) {
        index = data;
        view.replaceChildren(R.renderHome(T, index, openSection));
        return index;
      }).catch(function () { state(T('atlas.loadError', 'Атлас сейчас недоступен')); });
    }

    return { home: showHome, openSection: openSection };
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

  var api = { mount: mount, factory: factory, dirOf: dirOf, preparePrint: preparePrint };
  root.AtlasReader = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
