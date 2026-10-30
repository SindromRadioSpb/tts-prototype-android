"""Pilot preview of the engineering atlas: screen page and print page (variant B) from the atlas graph.

    python scripts/atlas/render_preview.py --source <source-pack> --content <content.jsonl> --out <dir> [--title ...]

This is a review preview for the owner and the content supplier, not the Reading Room product:
it shows exactly what the graph holds (statuses, core findings, errata next to the original).
Formulas render with KaTeX from a CDN, so the pages need internet to show typeset maths.
"""
import argparse
import html
import os
import pathlib
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atlas_import as I  # noqa: E402
import atlas_validate as V  # noqa: E402

KATEX = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/'
CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
STATUS_RU = {'producer_checked': 'проверено поставщиком', 'unreviewed': 'не проверено', 'owner_reviewed': 'вычитано владельцем',
             'core_verified': 'арифметика сошлась', 'core_mismatch': 'арифметика НЕ сошлась', 'unchecked': 'не пересчитано',
             'ocr_high': 'распознано уверенно', 'ocr_low': 'распознано неуверенно'}


def e(text):
    return html.escape(str(text if text is not None else ''))


def _dir(text):
    text = str(text or '')
    for ch in text:
        if '\u05d0' <= ch <= '\u05ea':
            return 'rtl'
        if ch.isalpha():
            return 'ltr'
    # numbers and signs only ('+0.2 20-0.1'): left to right, or RTL would reorder them
    return 'ltr' if any(ch.isdigit() for ch in text) else 'rtl'


def he(text, tag='div', cls='he'):
    return f'<{tag} class="{cls}" lang="he" dir="{_dir(text)}">{e(text)}</{tag}>'


def tex_inline(latex):
    return f'<span data-texi="{e(latex)}">{e(latex)}</span>'


class Page:
    def __init__(self, graph, number):
        self.n = number
        ids = graph['pages'].get(str(number), [])
        objs = graph['objects']
        self.all = [objs[i] for i in ids]
        self.page = next((o for o in self.all if o['type'] == 'page'), None)
        by = lambda t: [o for o in self.all if o['type'] == t]
        self.blocks = sorted(by('block'), key=lambda o: o.get('order', 0))
        self.formulas, self.figures, self.examples = by('formula'), by('figure'), by('example')
        self.regions, self.tables, self.errata = by('region'), by('table'), merge_core_errata(by('erratum'))
        self.symbols = by('symbol')
        self.objects = objs
        self.translated = any(b.get('ru') for b in self.blocks)

    def errata_for(self, oid):
        return [x for x in self.errata if x.get('target') == oid]

    def formula_vars(self, formula):
        rows = []
        for sym in self.symbols:
            if sym.get('formula_id') == formula['id'] or sym['id'] in formula.get('symbols', []):
                rows.append({'latex': sym.get('symbol_latex') or sym.get('symbol_raw'), 'he': sym.get('description_he') or sym.get('description_he_raw'),
                             'ru': sym.get('description_ru', ''), 'unit': sym.get('unit', sym.get('unit_raw', '')), 'ref': sym['id']})
        for var in formula.get('local_vars', []):
            rows.append({'latex': var['symbol_latex'], 'he': var.get('description_he', ''), 'ru': var['description_ru'],
                         'unit': var['unit'], 'ref': formula['id'] + '#' + var['var']})
        return rows

    def page_terms(self, terms):
        refs = []
        for obj in self.all:
            refs += obj.get('terms', []) + ([obj['term']] if obj.get('term') else []) + [r for r in obj.get('links', []) if '#' in r]
        out, seen = [], set()
        for ref in refs:
            tid, _, sense = ref.partition('#')
            term = terms.get(tid)
            if term and ref not in seen:
                seen.add(ref)
                s = next((x for x in term['senses'] if x['sense'] == sense), None)
                if s:
                    out.append((term, s))
        return out


def _asset(source_dir, out_dir, rel):
    path = os.path.abspath(os.path.join(source_dir, rel))
    try:
        return os.path.relpath(path, out_dir).replace(os.sep, '/')
    except ValueError:  # different Windows drives
        return pathlib.Path(path).as_uri()


def _badge(value):
    if not value:
        return ''
    return f'<span class="badge b-{e(value)}" title="{e(value)}">{e(STATUS_RU.get(value, value))}</span>'


def _figure_html(page, fig, source_dir, out_dir, numbered=False, tablefig=False):
    x0, y0, x1, y1 = fig['bbox']
    w, h = x1 - x0, y1 - y0
    regions = [r for r in page.regions if r.get('parent') == fig['id']]
    labels, items = [], []
    for k, r in enumerate(regions):
        rx0, ry0, rx1, ry1 = r['bbox']
        mark = CIRCLED[k] if k < len(CIRCLED) else str(k + 1)
        style = f'left:{(rx0 - x0) / w * 100:.2f}%;top:{(ry0 - y0) / h * 100:.2f}%;width:{(rx1 - rx0) / w * 100:.2f}%;height:{(ry1 - ry0) / h * 100:.2f}%'
        links = ' '.join(r.get('links', []))
        text = f'<i class="n">{mark}</i>' if numbered else f'<i class="t">{e(r.get("label_ru", ""))}</i><i class="n">{mark}</i>'
        labels.append(f'<span class="rg" style="{style}" data-region="{e(r["id"])}" data-links="{e(links)}">{text}</span>')
        items.append(f'<li data-region="{e(r["id"])}" data-links="{e(links)}"><b>{mark}</b> {he(r.get("label_he", ""), "span", "he inl")} — {e(r.get("label_ru", ""))}</li>')
    cap = f'<figcaption>{he(fig.get("caption_he", ""), "span", "he inl")} — {e(fig.get("caption_ru", ""))} <small>{e(fig["id"])}</small></figcaption>'
    return (f'<figure class="fig{" tablefig" if tablefig else ""}"><div class="figbox"><img src="{e(_asset(source_dir, out_dir, fig["crop"]))}" alt="{e(fig["id"])}">'
            f'{"".join(labels)}</div>{cap}<ol class="regions">{"".join(items)}</ol></figure>')


def _cell_html(c):
    unit = c.get('unit') or ''
    text = c['ru']
    show_unit = unit and unit not in ('—', '-') and not text.rstrip().endswith(unit)
    return (f'<td colspan="{c["colspan"]}" rowspan="{c["rowspan"]}" dir="{_dir(text)}">{e(text)}'
            f'{"<small> " + e(unit) + "</small>" if show_unit else ""}</td>')


def _is_header_row(cells):
    return not any(re.fullmatch(r'[\d.,\s▪•+\-−]+', c['ru'] or '') and re.search(r'\d', c['ru'] or '') for c in cells)


def _table_html(table):
    """Cells are placed on a grid by row/col/colspan/rowspan, so sparse rows keep their columns."""
    cells = table['cells']
    width = max(c['col'] + c['colspan'] for c in cells)
    covered = set()
    for c in cells:
        for r in range(c['row'], c['row'] + c['rowspan']):
            for k in range(c['col'], c['col'] + c['colspan']):
                if (r, k) != (c['row'], c['col']):
                    covered.add((r, k))
    by_pos = {(c['row'], c['col']): c for c in cells}
    rows_html, header_rows = [], 0
    for r in sorted({c['row'] for c in cells}):
        tds = []
        for k in range(width):
            if (r, k) in by_pos:
                tds.append(_cell_html(by_pos[(r, k)]))
            elif (r, k) not in covered:
                tds.append('<td></td>')
        rows_html.append('<tr>' + ''.join(tds) + '</tr>')
        if len(rows_html) == header_rows + 1 and _is_header_row([c for c in cells if c['row'] == r]):
            header_rows += 1
    title = f'<caption>{e(table.get("title_ru", ""))} {he(table.get("title_he", ""), "span", "he inl")}</caption>'
    head = f'<thead>{"".join(rows_html[:header_rows])}</thead>' if header_rows else ''
    wide = ' wide' if width > 8 else ''
    return f'<div class="tw"><table class="data{wide}">{title}{head}<tbody>{"".join(rows_html[header_rows:])}</tbody></table></div>'


def merge_core_errata(errata):
    """A core arithmetic finding on the same page as a supplier erratum that quotes the same printed value
    becomes part of that erratum instead of a second card."""
    supplier = [x for x in errata if x.get('origin') != 'core']
    out = [dict(x) for x in supplier]
    for core in (x for x in errata if x.get('origin') == 'core'):
        host = next((s for s in out if s.get('page') == core.get('page') and core['as_printed'] and core['as_printed'] in s['as_printed']), None)
        if host is not None:
            host['core_note'] = core.get('explanation_ru', '')
        else:
            out.append(dict(core))
    return out


def _erratum_html(x):
    origin = ' (найдено ядром)' if x.get('origin') == 'core' else ''
    proposed = f' → <b>предлагаемое исправление:</b> <code>{e(x["proposed"])}</code>' if x.get('proposed') else ''
    core = f'<div class="why">Пересчёт ядра: {e(x["core_note"])}</div>' if x.get('core_note') else ''
    return (f'<div class="erratum">⚠ <b>в книге:</b> <code>{e(x["as_printed"])}</code>{proposed}{origin}'
            f'<div class="why">{e(x.get("explanation_ru", ""))} <small>ждёт подтверждения владельца</small></div>{core}</div>')


HEAD = """<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><link rel="stylesheet" href="{katex}katex.min.css"><style>{css}</style></head><body>"""
TAIL = """<script src="{katex}katex.min.js"></script><script>
document.querySelectorAll('[data-tex]').forEach(function(el){{try{{katex.render(el.dataset.tex,el,{{throwOnError:false,displayMode:true}});}}catch(err){{el.textContent=el.dataset.tex;}}}});
document.querySelectorAll('[data-texi]').forEach(function(el){{try{{katex.render(el.dataset.texi,el,{{throwOnError:false,displayMode:false}});}}catch(err){{}}}});
document.addEventListener('click',function(ev){{var t=ev.target.closest('[data-region]');if(!t)return;
document.querySelectorAll('.hl').forEach(function(x){{x.classList.remove('hl');}});
document.querySelectorAll('[data-region="'+t.dataset.region+'"]').forEach(function(x){{x.classList.add('hl');}});
(t.dataset.links||'').split(' ').forEach(function(ref){{if(ref)document.querySelectorAll('[data-ref="'+ref+'"]').forEach(function(x){{x.classList.add('hl');}});}});}});
window.__atlasReady=true;</script></body></html>"""

BASE_CSS = """:root{--ink:#172033;--teal:#0F6F74;--amber:#C07C21;--mist:#E7EEF0;--paper:#FBFCFD;--oxide:#A53A32}
body{margin:0;font-family:system-ui,Arial,sans-serif;color:var(--ink);background:var(--paper)}
.he{font-family:Arial,'Noto Sans Hebrew',sans-serif;direction:rtl;text-align:right}.he.inl{display:inline}
code{font-family:Consolas,monospace;font-size:.92em;background:#f3f5f6;padding:0 3px;border-radius:3px}
.badge{display:inline-block;font-size:11px;padding:1px 6px;border-radius:9px;background:var(--mist);margin-left:4px;white-space:nowrap}
.b-core_mismatch{background:#f8e1de;color:var(--oxide)}.b-core_verified{background:#dff0ee;color:var(--teal)}
.erratum{border-left:3px solid var(--amber);background:#fff6e8;padding:6px 10px;margin:6px 0;font-size:13.5px}.erratum .why{color:#5b6577;margin-top:3px}
.fig{margin:10px 0}.figbox{position:relative;display:inline-block;max-width:100%}.figbox img{display:block;max-width:100%}
.rg{position:absolute;border:1.5px solid var(--teal);border-radius:3px;cursor:pointer}
.rg i{position:absolute;left:100%;top:-2px;margin-left:3px;font-style:normal;font-size:11px;background:#fffffff0;color:var(--teal);border:1px solid var(--teal);border-radius:3px;padding:0 4px;white-space:nowrap}
.rg i.n{display:none}.katex-display{overflow-x:auto;overflow-y:hidden;max-width:100%}.tw{max-width:100%;overflow-x:auto}code{overflow-wrap:anywhere}img{max-width:100%}
.hl{background:#d8efef!important;outline:2px solid var(--teal)}
figcaption{font-size:13px;color:#5b6577}figcaption small,.muted{color:#8a93a3}
.regions{font-size:13px;margin:4px 0 0;padding-left:20px}.regions li{cursor:pointer}
table.data{border-collapse:collapse;font-size:12.5px;margin:8px 0}table.data td{border:1px solid #cfd8dc;padding:2px 6px;text-align:center}table.data caption{text-align:left;font-size:13px}"""

SCREEN_CSS = BASE_CSS + """
header.top{padding:14px 18px;border-bottom:1px solid var(--mist);background:#fff}header.top h1{font-size:19px;margin:0 0 4px}
.summary{font-size:13.5px}.summary li{margin:2px 0}
.pg{display:grid;grid-template-columns:minmax(260px,34%) 1fr;gap:18px;padding:16px 18px;border-bottom:6px solid var(--mist)}
.pg>aside img{width:100%;border:1px solid #cfd8dc;box-shadow:0 1px 4px #0002;position:sticky;top:8px}
.pgno{font-weight:800;color:var(--teal);font-size:18px;margin-bottom:6px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:7px 0;border-bottom:1px solid #eef2f4}
.nq{color:var(--teal);font-size:14px}.tr{font-style:italic;color:#5b6577;font-size:12.5px}.ru{font-size:14.5px}.raw{color:#8a93a3}
.card{border:1px solid #cfe3e3;background:#f4fafa;border-radius:8px;padding:10px 12px;margin:10px 0}
.card img.crop{max-height:60px;border:1px dashed #cfd8dc;background:#fff}
.vars{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}.vars td,.vars th{border-top:1px solid #dbe8e8;padding:3px 6px;text-align:left}
.note{background:#fff6e8;border-left:3px solid var(--amber);padding:4px 8px;font-size:13px;margin-top:6px}
.steps{font-size:13.5px}h3{font-size:15px;margin:14px 0 4px;color:var(--teal)}
@media (max-width:760px){.rg i.t{display:none}.rg i.n{display:inline;left:auto;right:0;top:0;margin-left:0}.card,.steps,table.vars{overflow-x:auto;display:block}.pg>div{min-width:0}.pg{grid-template-columns:1fr}.row{grid-template-columns:1fr}.pg>aside img{position:static;max-height:50vh;object-fit:contain}}"""

PRINT_CSS = BASE_CSS + """
@page{size:A4;margin:11mm 11mm 12mm}body{background:#fff;font-size:11.5px}
.sheet{page-break-after:always;break-after:page}.sheet:last-child{page-break-after:auto}
.shead{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #111;padding-bottom:3px;margin-bottom:6px}
.shead .no{font-size:26px;font-weight:800}.shead .ttl{font-size:13px;text-align:right}
table.pb{width:100%;border-collapse:collapse;table-layout:fixed}table.pb td{border-bottom:1px solid #ddd;padding:3px 4px;vertical-align:top}
td.pr{width:50%}td.ph{font-size:12.5px}.fx{text-align:center;break-inside:avoid;margin:4px 0}.fx .katex-display{margin:2px 0}
.fxv{font-size:10.5px;text-align:center;color:#333}.fig{break-inside:avoid}.figbox img{max-height:52mm}
.terms{border-top:1px solid #999;margin-top:6px;padding-top:3px;font-size:12px;columns:2}.fxn{font-size:10px;color:#7a4f12;text-align:center}.terms div{break-inside:avoid}
.rg i.n{display:inline;left:auto;right:100%;top:-2px;margin:0 2px 0 0}
table.sheetwrap{width:100%;border-collapse:collapse}table.sheetwrap>thead>tr>td,table.sheetwrap>tbody>tr>td{padding:0;border:0}
table.data thead td{font-weight:600;background:#f2f4f5}table.data tr{break-inside:avoid}
table.data.wide{font-size:8.5px;width:100%}table.data.wide td{padding:1px 2px}
.fig.tablefig .figbox img{max-height:none;width:100%}
.running{position:fixed;bottom:0;left:0;right:0;font-size:9px;color:#888;text-align:center}"""


def _screen_page(page, terms, source_dir, out_dir, findings):
    p = page
    img = f'<img src="{e(_asset(source_dir, out_dir, p.page["image"]))}" alt="стр. {p.n}">' if p.page else ''
    parts = [f'<div class="pgno">стр. {p.n} {"" if p.translated else _badge("unreviewed") + " <span class=muted>нет перевода — исходный текст</span>"}</div>']
    for b in p.blocks:
        st = (b.get('status') or {}).get('language_review')
        if b.get('ru'):
            left = he(b['he']) + he(b.get('he_niqqud', ''), 'div', 'he nq') + f'<div class="tr">{e(b.get("translit", ""))}</div>'
            if b.get('translit_ru'):
                left += f'<div class="tr">{e(b["translit_ru"])}</div>'
            right = f'<div class="ru">{e(b["ru"])}</div>{_badge(st)}'
            if b.get('ambiguity_note'):
                right += f'<div class="note">{e(b["ambiguity_note"])}</div>'
        else:
            left, right = he(b.get('he_raw', ''), 'div', 'he raw'), '<span class="muted">нет перевода</span>'
        parts.append(f'<div class="row" data-ref="{e(b["id"])}"><div>{left}</div><div>{right}</div></div>')
        parts += [_erratum_html(x) for x in p.errata_for(b['id'])]
    if p.formulas:
        parts.append('<h3>Формулы</h3>')
    for f in p.formulas:
        tex = f.get('display_latex')
        rows = ''.join(f'<tr data-ref="{e(v["ref"])}"><td class="vt">{tex_inline(v["latex"])}</td><td>{he(v["he"], "span", "he inl")}</td>'
                       f'<td>{e(v["ru"])}</td><td>{e(v["unit"])}</td></tr>' for v in p.formula_vars(f))
        status = f.get('status') or {}
        parts.append(f'<div class="card" data-ref="{e(f["id"])}">' + (f'<div data-tex="{e(tex)}"></div>' if tex else '<span class="muted">нет записи формулы</span>')
                     + f'<div><img class="crop" src="{e(_asset(source_dir, out_dir, f["crop"]))}" alt="оригинал"> <small class="muted">оригинал {e(f["id"])}</small> '
                     + _badge(status.get('language_review')) + '</div>'
                     + (f'<div class="tr">расчёт: <code>{e(f["compute"])}</code>{" · углы: " + e(f["angle_unit"]) if f.get("angle_unit") else ""}</div>' if f.get('compute')
                        else (f'<div class="tr">без расчёта: {e(f.get("compute_absent_reason", ""))}</div>' if f.get('display_latex') else ''))
                     + (f'<table class="vars"><tr><th>символ</th><th>עברית</th><th>русский</th><th>ед.</th></tr>{rows}</table>' if rows else '')
                     + (f'<div class="note">{e(f["ambiguity_note"])}</div>' if f.get('ambiguity_note') else '') + '</div>')
        parts += [_erratum_html(x) for x in p.errata_for(f['id'])]
    if p.figures:
        parts.append('<h3>Рисунки</h3>')
    for fig in p.figures:
        parts.append(_figure_html(p, fig, source_dir, out_dir))
    for t in p.tables:
        parts.append('<h3>Таблица</h3>' + _table_html(t) + _badge((t.get('status') or {}).get('recognition')))
    for ex in p.examples:
        steps = ''
        for k, s in enumerate(ex['steps'], 1):
            code = next((f['code'] for f in findings if f['ref'] == f'{ex["id"]}#step{k}'), '')
            steps += (f'<li><code>{e(s["compute"])}</code> при {e(s["bindings"])} → напечатано <b>{e(s["printed"])}</b> '
                      f'{_badge(s.get("math_review"))} <small class="muted">{e(code)}</small><br><small>{e(s.get("note", ""))}</small></li>')
        parts.append(f'<h3>{e(ex.get("title_ru") or "Пример")}</h3><ol class="steps">{steps}</ol>')
        parts += [_erratum_html(x) for x in p.errata_for(ex['id'])]
    shown = {x['target'] for x in p.errata}
    for x in p.errata:
        if x['target'] not in {o['id'] for o in p.blocks + p.formulas + p.examples}:
            parts.append(_erratum_html(x))
    return f'<section class="pg" id="p{p.n}"><aside>{img}</aside><div>{"".join(parts)}</div></section>' if shown is not None else ''


def _print_page(page, terms, source_dir, out_dir):
    p = page
    heading = next((b for b in p.blocks if b.get('kind') == 'heading' and b.get('ru')), None)
    title = f'{he(heading["he"], "span", "he inl")} · {e(heading["ru"])}' if heading else ''
    rows = []
    # text and formulas in the order of the original page, so an instruction stays next to its expression (p289)
    items = sorted(p.blocks + [f for f in p.formulas if f.get('display_latex')], key=lambda o: (o.get('bbox') or [0, 0])[1])
    for o in items:
        if o['type'] == 'formula':
            vs = ' · '.join(f'{tex_inline(v["latex"])} — {e(v["ru"])}{", " + e(v["unit"]) if v["unit"] else ""}' for v in p.formula_vars(o))
            note = f'<div class="fxn">{e(o["ambiguity_note"])}</div>' if o.get('ambiguity_note') else ''
            rows.append(f'<tr><td colspan="2"><div class="fx"><div data-tex="{e(o["display_latex"])}"></div><div class="fxv">{vs}</div>{note}</div></td></tr>')
        else:
            ru = e(o['ru']) if o.get('ru') else '<span class="muted">нет перевода</span>'
            hb = o.get('he') or o.get('he_raw', '')
            rows.append(f'<tr class="pb-row"><td class="pr">{ru}</td><td class="ph" lang="he" dir="{_dir(hb)}">{e(hb)}</td></tr>')
        for x in p.errata_for(o['id']):
            rows.append(f'<tr><td colspan="2">{_erratum_html(x)}</td></tr>')
    body = f'<table class="pb">{"".join(rows)}</table>'
    table_parents = {t.get('parent') for t in p.tables}
    for fig in p.figures:
        body += _figure_html(p, fig, source_dir, out_dir, numbered=True, tablefig=fig['id'] in table_parents)
    for t in p.tables:
        body += _table_html(t)
    for ex in p.examples:
        body += ''.join(_erratum_html(x) for x in p.errata_for(ex['id']))
    extra = [x for x in p.errata if x['target'] not in {o['id'] for o in p.blocks + p.formulas + p.examples}]
    body += ''.join(_erratum_html(x) for x in extra)
    tl = p.page_terms(terms)
    if tl:
        body += '<div class="terms">' + ''.join(
            f'<div>{he(t["lemma_he"], "span", "he inl")} · {he(t["niqqud"], "span", "he inl")} · <i>{e(t["translit"])}</i> — {e(s["ru"])}</div>' for t, s in tl) + '</div>'
    # the header sits in a table head, so the browser repeats 'стр. N' on every sheet this page spills onto
    head = f'<div class="shead"><span class="no">стр. {p.n}</span><span class="ttl">{title}</span></div>'
    return (f'<section class="sheet"><table class="sheetwrap"><thead><tr><td>{head}</td></tr></thead>'
            f'<tbody><tr><td>{body}</td></tr></tbody></table></section>')


def build_preview(graph, source_dir, out_dir, title='Атлас 97002 — предпросмотр пилота', pages=None):
    os.makedirs(out_dir, exist_ok=True)
    numbers = pages or sorted(int(k) for k in graph['pages'])
    page_objs = [Page(graph, n) for n in numbers]
    findings = graph.get('findings', [])
    counts = {}
    for f in findings + graph.get('warnings', []):
        counts[f['code']] = counts.get(f['code'], 0) + 1
    errata = [o for o in graph['objects'].values() if o['type'] == 'erratum']
    summary = (f'<ul class="summary"><li>Источник: исходный пакет <code>{e(graph["source_pack_sha256"][:12])}</code>, '
               f'пакет содержимого <code>{e(graph["content_pack_sha256"][:12])}</code></li>'
               f'<li>Находки ядра и предупреждения: {e(", ".join(f"{k}: {v}" for k, v in sorted(counts.items())) or "нет")}</li>'
               f'<li>Опечатки-кандидаты: {len(errata)} — все ждут подтверждения владельца</li>'
               '<li>Нажмите на подпись рисунка — подсветятся связанные символы и строки.</li></ul>')
    screen = (HEAD.format(title=e(title), katex=KATEX, css=SCREEN_CSS)
              + f'<header class="top"><h1>{e(title)}</h1>{summary}</header>'
              + ''.join(_screen_page(p, graph['terms'], source_dir, out_dir, findings) for p in page_objs) + TAIL.format(katex=KATEX))
    printed = (HEAD.format(title=e(title) + ' — печать', katex=KATEX, css=PRINT_CSS)
               + ''.join(_print_page(p, graph['terms'], source_dir, out_dir) for p in page_objs)
               + '<div class="running">LinguistPro · атлас נוסחאון 97002 · предпросмотр пилота, не вычитан владельцем</div>'
               + TAIL.format(katex=KATEX))
    for name, text in (('screen.html', screen), ('print.html', printed)):
        with open(os.path.join(out_dir, name), 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(text)
    return [os.path.join(out_dir, 'screen.html'), os.path.join(out_dir, 'print.html')]


def main(argv=None):
    parser = argparse.ArgumentParser(description='Предпросмотр пилота атласа (экран и печать).')
    parser.add_argument('--source', required=True)
    parser.add_argument('--content', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--title', default='Атлас 97002 — предпросмотр пилота')
    parser.add_argument('--pages', default='', help='номера страниц через запятую (по умолчанию все из графа)')
    args = parser.parse_args(argv)
    graph, _ = I.build_graph(V.load_source_pack(args.source), args.content)
    pages = [int(x) for x in args.pages.split(',') if x.strip()] or None
    for path in build_preview(graph, args.source, args.out, args.title, pages):
        sys.stdout.write(path + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
