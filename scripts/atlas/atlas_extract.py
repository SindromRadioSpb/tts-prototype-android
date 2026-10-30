"""Engineering atlas extractor: formulary PDF -> source pack (linguistpro.atlas-source-pack.1.0.0).

The source pack is the deterministic reference the content supplier works from:
our IDs, page numbers, bbox (PDF points, origin top-left, y down), raw Hebrew text,
formula/figure crops and page images. Nothing here is translated or corrected.

    python scripts/atlas/atlas_extract.py --pdf <formulary.pdf> --pages 7,197,282 --out atlas/a97002/pilot/source-pack
"""
import argparse
import hashlib
import json
import os
import re
import statistics
import subprocess
import sys

ATLAS_ID = 'a97002'
EXTRACTOR_VERSION = '1.0.0'
PAGE_DPI = 150
CROP_DPI = 200

HEB = re.compile(r'[א-ת]')
STRONG_LTR = re.compile(r'[A-Za-z0-9Ͱ-Ͽ]|[\U0001d400-\U0001d7ff]')
MATH_ALNUM = re.compile(r'[\U0001d400-\U0001d7ff]')
BIDI = re.compile(r'[‎‏‪-‮⁦-⁩]')
LEADING_PUNCT = re.compile(r'^([.,:;]+)\s*')
CAPTION = re.compile(r'^\s*איור\s*(\d+)')


# ---------- pure text rules ----------

def normalize_rtl_line(text, move_leading=True):
    """Clean one RTL text fragment: drop bidi controls; a leading .,:; of a Hebrew fragment goes to its end.

    PDF text from Word stores sentence-final punctuation of an RTL run at the run's start. That is an
    artefact only when nothing left-to-right precedes the fragment; after an LTR run ('Mt, ...') the
    punctuation really is leading, so join_fragments passes move_leading=False there.
    """
    text = BIDI.sub('', text).strip()
    if move_leading and HEB.search(text):
        m = LEADING_PUNCT.match(text)
        if m:
            text = text[m.end():].rstrip() + m.group(1)
    return text


def _has_ltr_only(text):
    return bool(STRONG_LTR.search(text)) and not HEB.search(text)


def _has_rtl_only(text):
    return bool(HEB.search(text)) and not STRONG_LTR.search(text)


def line_is_rtl(frags, page_width):
    """A visual line is left-to-right when it starts at the left margin, stops short of the right
    margin and its leftmost fragment begins with a left-to-right character (formula lines with a
    Hebrew note on page 7). Everything else in this book reads right to left."""
    left = min(frags, key=lambda f: f[0])
    starts_ltr = bool(STRONG_LTR.match(BIDI.sub('', left[2]).strip()[:1] or ' '))
    ltr = min(f[0] for f in frags) < 0.15 * page_width and max(f[1] for f in frags) < 0.8 * page_width and starts_ltr
    return not ltr


def _clean_spans(spans, after_ltr, rtl):
    """Normalise a fragment span by span: an artefact leading '.' goes to the end of its own span."""
    parts = []
    for span in spans:
        clean = normalize_rtl_line(span, move_leading=rtl and not after_ltr)
        lead = ' ' if span[:1].isspace() else ''
        trail = ' ' if span[-1:].isspace() else ''
        parts.append(lead + clean + trail if clean else (' ' if span.isspace() else ''))
        if clean:
            after_ltr = _has_ltr_only(clean)
    return re.sub(r'\s+', ' ', ''.join(parts)).strip()


def join_fragments(frags, rtl=True):
    """Join the fragments of one visual line into logical order.

    A fragment is (x0, x1, text) or (x0, x1, text, spans). In a right-to-left line fragments read
    right to left and consecutive left-to-right-only fragments keep left-to-right order; a
    left-to-right line is the mirror image. A space is inserted only where fragments neither touch
    nor overlap and carry no space of their own, so a word split between fragments stays one word.
    """
    frags = [f if len(f) == 4 else (f[0], f[1], f[2], [f[2]]) for f in frags]
    inner = _has_ltr_only if rtl else _has_rtl_only
    ordered = sorted(frags, key=lambda f: -f[1]) if rtl else sorted(frags, key=lambda f: f[0])
    runs = []
    for frag in ordered:
        if runs and inner(frag[2]) and inner(runs[-1][-1][2]):
            runs[-1].append(frag)
        else:
            runs.append([frag])
    pieces = []
    for run in runs:
        pieces.extend(sorted(run, key=lambda f: f[0] if rtl else -f[1]) if len(run) > 1 else run)
    out = ''
    prev = None
    for x0, x1, text, spans in pieces:
        after_ltr = prev is not None and _has_ltr_only(prev[2])
        clean = _clean_spans(spans, after_ltr, rtl)
        if not clean:
            continue
        if prev is not None:
            gap = max(x0 - prev[1], prev[0] - x1)
            raw_space = prev[2][-1:].isspace() or text[:1].isspace()
            if gap > 1.0 or raw_space:
                out += ' '
        out += clean
        prev = (x0, x1, text)
    return re.sub(r'\s+', ' ', out).strip()


def classify_block(text, is_large=False):
    text = text.strip()
    if CAPTION.match(text):
        return 'caption'
    if text.startswith('דוגמה') or text.startswith('דוגמא'):
        return 'example_heading'
    if text.startswith('•') or re.match(r'^\d+\s*\)', text):
        return 'list_item'
    if is_large:
        return 'heading'
    if not HEB.search(text):
        return 'other'
    return 'prose'


def _hebrew_ratio(text):
    chars = [c for c in text if not c.isspace()]
    return sum(1 for c in chars if HEB.match(c)) / len(chars) if chars else 0.0


def is_formula_text(text):
    marks = '=' in text or '√' in text or '∙' in text or bool(MATH_ALNUM.search(text))
    return marks and _hebrew_ratio(text) < 0.3


def parse_symbol_rows(lines):
    """Rows of a 'סמל | תיאור | יחידות' table -> [{symbol_raw, description_he_raw, unit_raw}].

    A row is '<symbol> <description>' optionally followed by '\\t<unit>' (unit column found
    geometrically). Without a unit column, a trailing token without Hebrew is the unit.
    """
    rows = []
    for line in lines:
        main, _, unit = line.partition('\t')
        main, unit = main.strip(), unit.strip()
        m = re.match(r'^([^\sא-ת]+)\s*(.*)$', main)
        if not m:
            continue
        symbol, rest = m.group(1), m.group(2).strip()
        if not unit:
            tokens = rest.split()
            if len(tokens) > 1 and not HEB.search(tokens[-1]):
                unit, rest = tokens[-1], ' '.join(tokens[:-1])
        rows.append({'symbol_raw': symbol, 'description_he_raw': rest, 'unit_raw': unit})
    return rows


def figure_number(caption):
    m = CAPTION.match(caption or '')
    return int(m.group(1)) if m else None


def logo_xrefs(doc_image_counts, page_count):
    return {xref for xref, count in doc_image_counts.items() if count > page_count / 2}


# ---------- geometry helpers ----------

def _union(boxes):
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


def _inflate_overlap(a, b, pad):
    return a[0] - pad <= b[2] and b[0] - pad <= a[2] and a[1] - pad <= b[3] and b[1] - pad <= a[3]


def _yc(box):
    return (box[1] + box[3]) / 2


def _r(box):
    return [round(v, 2) for v in box]


def _fragments(page):
    """Text fragments of a page: dicts {bbox, text, size}. Footer (page number) dropped."""
    height = page.rect.height
    out = []
    for block in page.get_text('dict')['blocks']:
        if block.get('type') != 0:
            continue
        for line in block['lines']:
            text = ''.join(span['text'] for span in line['spans'])
            if not text.strip():
                continue
            box = list(line['bbox'])
            if _yc(box) > height * 0.92:
                continue
            size = max(span['size'] for span in line['spans'])
            spans = [span['text'] for span in line['spans'] if span['text']]
            out.append({'bbox': box, 'text': text, 'size': size, 'spans': spans})
    return out


def _tuples(frags):
    return [(f['bbox'][0], f['bbox'][2], f['text'], f.get('spans', [f['text']])) for f in frags]


def _bands(frags, tol=4.0, page_width=595.0):
    """Group fragments into visual lines by vertical centre; text joined in the line's direction."""
    bands = []
    for frag in sorted(frags, key=lambda f: _yc(f['bbox'])):
        if bands and abs(_yc(frag['bbox']) - bands[-1]['yc']) <= tol:
            band = bands[-1]
            band['frags'].append(frag)
            band['yc'] = statistics.mean(_yc(f['bbox']) for f in band['frags'])
        else:
            bands.append({'frags': [frag], 'yc': _yc(frag['bbox'])})
    for band in bands:
        band['bbox'] = _union([f['bbox'] for f in band['frags']])
        tuples = _tuples(band['frags'])
        band['rtl'] = line_is_rtl(tuples, page_width)
        band['text'] = join_fragments(tuples, rtl=band['rtl'])
    return bands


# ---------- page analysis ----------

def _symbol_tables(frags):
    """Find symbol tables. Returns (tables, used_fragment_ids); table = {header_bbox, rows:[{text, bbox}]}."""
    used = set()
    tables = []
    headers = [f for f in frags if 'סמל' in f['text'] and 'תיאור' in f['text']]
    for header in headers:
        hyc = _yc(header['bbox'])
        same_line = [f for f in frags if abs(_yc(f['bbox']) - hyc) <= 4]
        unit_head = [f for f in same_line if 'יחידות' in f['text']]
        unit_edge = (unit_head[0]['bbox'][2] + 15) if unit_head else None
        header_bbox = _union([f['bbox'] for f in same_line])
        used.update(id(f) for f in same_line)
        below = [f for f in frags if f['bbox'][1] > header_bbox[3] - 1 and id(f) not in used]
        rows, last_bottom = [], header_bbox[3]
        for band in _bands(below):
            if band['bbox'][1] - last_bottom > 12:
                break
            ordered = sorted(band['frags'], key=lambda f: -f['bbox'][2])
            unit_frags = [f for f in ordered if unit_edge is not None and f['bbox'][2] <= unit_edge]
            main_frags = [f for f in ordered if f not in unit_frags]
            main = join_fragments(_tuples(main_frags))
            unit = join_fragments(_tuples(unit_frags))
            starts_symbol = bool(main) and not HEB.match(main[0]) and main[0] not in '()•'
            if starts_symbol:
                rows.append({'main': main, 'unit': unit, 'bbox': band['bbox']})
            elif rows:
                rows[-1]['main'] += ' ' + main
                rows[-1]['unit'] = (rows[-1]['unit'] + ' ' + unit).strip()
                rows[-1]['bbox'] = _union([rows[-1]['bbox'], band['bbox']])
            else:
                break
            used.update(id(f) for f in band['frags'])
            last_bottom = band['bbox'][3]
        tables.append({'header_bbox': header_bbox, 'rows': rows})
    return tables, used


def _analyse(page, logos):
    frags = _fragments(page)
    tables, used = _symbol_tables(frags)
    rest = [f for f in frags if id(f) not in used]
    hebrew = [f for f in rest if HEB.search(f['text'])]
    others = [f for f in rest if not HEB.search(f['text'])]
    # non-Hebrew fragments sitting on a Hebrew line belong to that line
    attached, loose = [], []
    for frag in others:
        near = any(abs(_yc(frag['bbox']) - _yc(h['bbox'])) <= 4 and frag['bbox'][0] < h['bbox'][2] + 40
                   and frag['bbox'][2] > h['bbox'][0] - 40 for h in hebrew)
        (attached if near else loose).append(frag)
    text_bands = _bands(hebrew + attached, page_width=page.rect.width)
    # formula clusters from loose fragments
    clusters = []
    for frag in sorted(loose, key=lambda f: (f['bbox'][1], -f['bbox'][2])):
        hit = [c for c in clusters if any(_inflate_overlap(frag['bbox'], g['bbox'], 6) for g in c)]
        merged = [frag]
        for c in hit:
            merged.extend(c)
            clusters.remove(c)
        clusters.append(merged)
    formulas, stray = [], []
    for cluster in clusters:
        text = ' '.join(f['text'] for f in cluster)
        (formulas if is_formula_text(text) else stray).append(cluster)
    # stray non-formula fragments (e.g. '!!!', lone numbers) become text bands of their own
    text_bands += _bands([f for c in stray for f in c], page_width=page.rect.width)
    text_bands.sort(key=lambda b: (round(b['bbox'][1]), -b['bbox'][2]))
    images = [i for i in page.get_image_info(xrefs=True) if i.get('xref') not in logos]
    return text_bands, formulas, tables, images, frags


def _blocks_from_bands(bands, body_size):
    blocks = []
    for band in bands:
        text = band['text']
        size = max(f['size'] for f in band['frags'])
        large = size >= body_size + 1.5 and len(text) < 80
        kind = classify_block(text, is_large=large)
        prev = blocks[-1] if blocks else None
        continues = (prev is not None and kind in ('prose', 'other') and prev['kind'] in ('prose', 'list_item', 'other')
                     and not prev['ends_sentence']
                     and band['bbox'][1] - prev['bbox'][3] < 1.8 * (band['bbox'][3] - band['bbox'][1]))
        # a leading '.' moved to the end by normalize_rtl_line is a PDF artefact, not proof of a sentence end
        last_raw = min(band['frags'], key=lambda f: f['bbox'][2])['text'].strip()
        ends_sentence = bool(re.search(r'[.:!?]$', last_raw))
        if continues:
            prev['text'] = (prev['text'] + ' ' + text).strip()
            prev['bbox'] = _union([prev['bbox'], band['bbox']])
            prev['ends_sentence'] = ends_sentence
        else:
            blocks.append({'text': text, 'bbox': band['bbox'], 'kind': kind, 'ends_sentence': ends_sentence})
    return blocks


# ---------- writing ----------

class _Assets:
    def __init__(self, out_dir):
        self.dir = os.path.join(out_dir, 'assets')
        os.makedirs(self.dir, exist_ok=True)

    def png(self, pixmap):
        data = pixmap.tobytes('png')
        digest = hashlib.sha256(data).hexdigest()
        path = os.path.join(self.dir, digest + '.png')
        if not os.path.exists(path):
            with open(path, 'wb') as fh:
                fh.write(data)
        return 'assets/' + digest + '.png'


def _git_commit():
    try:
        return subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True,
                              cwd=os.path.dirname(os.path.abspath(__file__)), check=True).stdout.strip()
    except Exception:
        return ''


def extract(pdf_path, pages, out_dir):
    import fitz  # PyMuPDF; only the extractor needs it

    doc = fitz.open(pdf_path)
    os.makedirs(out_dir, exist_ok=True)
    assets = _Assets(out_dir)
    counts = {}
    for p in doc:
        for img in p.get_images():
            counts[img[0]] = counts.get(img[0], 0) + 1
    logos = logo_xrefs(counts, doc.page_count)
    with open(pdf_path, 'rb') as fh:
        source_sha = hashlib.sha256(fh.read()).hexdigest()
    warnings = []
    lines = []
    for n in pages:
        page = doc[n - 1]
        pid = f'{ATLAS_ID}:p{n}'
        bands, formula_clusters, tables, images, frags = _analyse(page, logos)
        has_text = len(''.join(f['text'] for f in frags).strip()) >= 50
        lines.append({'type': 'page', 'id': pid, 'page': n,
                      'image': assets.png(page.get_pixmap(dpi=PAGE_DPI)), 'has_text_layer': has_text})
        body = statistics.median([f['size'] for f in frags]) if frags else 11
        blocks = _blocks_from_bands(bands, body)
        block_ids = []
        for i, block in enumerate(blocks, 1):
            bid = f'{pid}:b{i:03d}'
            block_ids.append(bid)
            lines.append({'type': 'block', 'id': bid, 'page': n, 'bbox': _r(block['bbox']), 'he_raw': block['text'],
                          'kind_guess': block['kind'], 'order': i})
        formulas = []
        ordered = sorted(formula_clusters, key=lambda c: (round(_union([f['bbox'] for f in c])[1] / 10), -_union([f['bbox'] for f in c])[2]))
        for i, cluster in enumerate(ordered, 1):
            box = _union([f['bbox'] for f in cluster])
            text = ' '.join(f['text'].strip() for f in sorted(cluster, key=lambda f: (round(_yc(f['bbox']) / 4), f['bbox'][0])))
            fid = f'{pid}:f{i:02d}'
            formulas.append((fid, box))
            clip = fitz.Rect(box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 2)
            lines.append({'type': 'formula', 'id': fid, 'page': n, 'bbox': _r(box), 'source_text': text,
                          'crop': assets.png(page.get_pixmap(dpi=CROP_DPI, clip=clip))})
        boundary = 0.0
        for t_index, table in enumerate(tables):
            above = [f for f in formulas if boundary <= f[1][1] and f[1][3] <= table['header_bbox'][1] + 1]
            formula_id = above[0][0] if len(above) == 1 else None
            parsed = parse_symbol_rows([row['main'] + '\t' + row['unit'] for row in table['rows']])
            for s_index, (row, sym) in enumerate(zip(table['rows'], parsed), 1):
                # the ID follows the symbol table, not the binding: a later binding must not rename the symbol
                sid = f'{pid}:st{t_index + 1}:s{s_index:02d}'
                if formula_id is None:
                    warnings.append(f'symbol_unbound:{sid}')
                lines.append({'type': 'symbol', 'id': sid, 'formula_id': formula_id, 'page': n, 'bbox': _r(row['bbox']), **sym})
            boundary = table['header_bbox'][3]
        caption_blocks = [(bid, b) for bid, b in zip(block_ids, blocks) if b['kind'] == 'caption']
        unnumbered = 0
        used_captions = set()
        groups = {}  # caption block id (or a unique key) -> image boxes; images sharing a caption are one figure
        for k, image in enumerate(sorted(images, key=lambda i: (i['bbox'][1], -i['bbox'][2]))):
            box = list(image['bbox'])
            below = [(bid, b) for bid, b in caption_blocks if 0 <= b['bbox'][1] - box[3] <= 40]
            key = min(below, key=lambda x: x[1]['bbox'][1] - box[3])[0] if below else f'#{k}'
            groups.setdefault(key, []).append(box)
        caption_text = dict((bid, b['text']) for bid, b in caption_blocks)
        for key, boxes in sorted(groups.items(), key=lambda kv: (_union(kv[1])[1], -_union(kv[1])[2])):
            box = _union(boxes)
            caption_id = key if key in caption_text else None
            number = figure_number(caption_text[caption_id]) if caption_id else None
            if caption_id:
                used_captions.add(caption_id)
            if number is None:
                unnumbered += 1
                fig_id = f'{pid}:img{unnumbered:02d}'
            else:
                fig_id = f'{pid}:fig{number}'
            lines.append({'type': 'figure', 'id': fig_id, 'page': n, 'bbox': _r(box),
                          'crop': assets.png(page.get_pixmap(dpi=CROP_DPI, clip=fitz.Rect(*box))),
                          'number': number, 'caption_block_id': caption_id})
        for bid, cap in caption_blocks:
            if bid not in used_captions:
                warnings.append(f'caption_without_image:{n}:{figure_number(cap["text"])}')
        examples = 0
        for bid, block in zip(block_ids, blocks):
            if block['kind'] == 'example_heading':
                examples += 1
                lines.append({'type': 'example', 'id': f'{pid}:ex{examples}', 'page': n, 'heading_block_id': bid, 'image_only': False})
    with open(os.path.join(out_dir, 'pages.jsonl'), 'wb') as fh:
        for obj in lines:
            fh.write((json.dumps(obj, ensure_ascii=False) + '\n').encode('utf-8'))
    logo_digests = sorted(hashlib.sha256(doc.extract_image(x)['image']).hexdigest() for x in logos)
    manifest = {'schema': 'linguistpro.atlas-source-pack.1.0.0', 'atlas_id': ATLAS_ID,
                'source': {'filename': os.path.basename(pdf_path), 'sha256': source_sha, 'page_count': doc.page_count,
                           'page_size_pt': [round(doc[0].rect.width), round(doc[0].rect.height)]},
                'extractor': {'version': EXTRACTOR_VERSION, 'commit': _git_commit()},
                'pages': list(pages), 'logo_xref_digests': logo_digests, 'warnings': warnings}
    with open(os.path.join(out_dir, 'manifest.json'), 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    return manifest


COLORS = {'block': (0.55, 0.55, 0.55), 'formula': (0.06, 0.44, 0.45), 'figure': (0.85, 0.45, 0.05), 'symbol': (0.5, 0.2, 0.7)}


def contact_sheet(pdf_path, out_dir, columns=4, dpi=60):
    """contact-sheet.png: every pack page with block/formula/figure/symbol boxes."""
    import fitz

    src = fitz.open(pdf_path)
    with open(os.path.join(out_dir, 'pages.jsonl'), encoding='utf-8') as fh:
        objs = [json.loads(line) for line in fh if line.strip()]
    pages = [o['page'] for o in objs if o['type'] == 'page']
    marked = fitz.open()
    for n in pages:
        rect = src[n - 1].rect
        page = marked.new_page(width=rect.width, height=rect.height)
        page.show_pdf_page(rect, src, n - 1)
        for obj in objs:
            if obj.get('page') == n and obj['type'] in COLORS:
                page.draw_rect(fitz.Rect(*obj['bbox']), color=COLORS[obj['type']], width=1.2)
        page.insert_text((20, 20), f'p{n}', fontsize=14, color=(1, 0, 0))
    w, h = marked[0].rect.width, marked[0].rect.height
    rows = (len(pages) + columns - 1) // columns
    sheet = fitz.open()
    big = sheet.new_page(width=w * columns, height=h * rows)
    for i in range(len(pages)):
        r, c = divmod(i, columns)
        big.show_pdf_page(fitz.Rect(c * w, r * h, (c + 1) * w, (r + 1) * h), marked, i)
    path = os.path.join(out_dir, 'contact-sheet.png')
    big.get_pixmap(dpi=dpi).save(path)
    return path


def main(argv=None):
    parser = argparse.ArgumentParser(description='Extract an atlas source pack from the formulary PDF.')
    parser.add_argument('--pdf', required=True)
    parser.add_argument('--pages', required=True, help='comma-separated 1-based page numbers')
    parser.add_argument('--out', required=True)
    parser.add_argument('--no-contact-sheet', action='store_true')
    args = parser.parse_args(argv)
    pages = [int(p) for p in args.pages.split(',') if p.strip()]
    manifest = extract(args.pdf, pages, args.out)
    if not args.no_contact_sheet:
        contact_sheet(args.pdf, args.out)
    sys.stdout.write(f"pages: {manifest['pages']}\nwarnings: {len(manifest['warnings'])}\n")
    for w in manifest['warnings']:
        sys.stdout.write(f'  {w}\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
