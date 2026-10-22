"""Modern release registry (phase F0): read-only inventory of the owner's learning archives.

Builds one registry of works, parts and archives from the media-library folders, anchors every
learning row in the Ben-Yehuda public-domain dump text, and checks part boundaries, AI-layer
coverage, required fields and public-package safety. Writes registry.json and report.md.
Nothing here uploads, publishes or edits the archives.

Plan: docs/planning/modern-release/2026-10-22/README.md
"""
import argparse
import csv
import difflib
import hashlib
import json
import re
import sys
import unicodedata
import urllib.request
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

RAW_BASE = 'https://raw.githubusercontent.com/projectbenyehuda/public_domain_dump/master'
HE_LETTER = re.compile('[א-ת]')
NIQQUD = re.compile('[֑-ׇ]')
# Fields a public body may carry. Anything else found in an archive is reported, never copied silently.
ROW_FIELDS = {'row_id', 'order_index', 'hebrew_plain', 'hebrew_niqqud', 'russian', 'translit', 'translit_ru',
              'translation_provider', 'translation_meta', 'niqqud_authority', 'meta'}
TEXT_FIELDS = {'text_id', 'text_key', 'title', 'level', 'tags', 'source_label', 'topic', 'source_text', 'source_meta',
               'corpus', 'table_model_meta', 'text_audio_asset_key', 'created_at', 'updated_at', 'is_archived',
               'rows', 'word_gloss_ai_layer'}
SECRET_PATTERNS = [re.compile(p) for p in (r'[A-Za-z]:\\\\', r'[A-Za-z]:/(Users|projects)', r'/home/', r'AIza[0-9A-Za-z_-]{20,}',
                                           r'\bsk-[A-Za-z0-9]{20,}', r'AQ\.[A-Za-z0-9_-]{20,}', r'"(api_?key|apiKey|access_token|refresh_token|auth_token|password|secret)"\s*:')]
HTML_ENTITY = re.compile(r'&(nbsp|amp|lt|gt|quot|#\d+);')
# Rows that match no Ben-Yehuda text at all are content of unconfirmed origin: blocked from release.
ABSENT_BLOCK_ROWS = 20
COMPLETE_MIN = 0.97
TRACK_RANK = {'text': 0, 'notes': 1, 'structure': 2, 'appendix': 3}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canon(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def letters(text):
    """Hebrew letters only: vowels, punctuation, spacing and layout differences between the
    learning rows and the dump text vanish; the consonant stream is what both must share."""
    text = unicodedata.normalize('NFC', str(text or ''))
    return ''.join(HE_LETTER.findall(text))


def letter_index(text):
    """Consonant stream of a source text plus each letter's char offset in that text."""
    stream, offsets = [], []
    for i, ch in enumerate(unicodedata.normalize('NFC', text)):
        if HE_LETTER.match(ch):
            stream.append(ch)
            offsets.append(i)
    return ''.join(stream), offsets


RELIABLE_LETTERS = 25


NOTE_MARK = '↩'  # «↩︎» back-link that ends a footnote row


def is_note_row(row):
    return NOTE_MARK in str(row.get('hebrew_plain') or '')


def anchor_rows(rows, stream, start=0, flags=None):
    """Find each row's consonants in the source. Returns per-row (start, end) letter spans or None.

    Pass 1 anchors long rows only: 25+ consonants practically never occur twice by chance, so they
    fix the part's true position. Pass 2 places each short row (dates, headings, one-word lines)
    only between its anchored neighbours, so a short row can never pull the cursor to an earlier
    accidental match. A row that is not found never moves the cursor.

    Footnote rows (and long rows found only before the cursor) live elsewhere in the source —
    footnotes are collected at the end of the book. Pass 3 just proves they exist; they never move
    the cursor and are marked in `flags` so they do not define the part's boundaries."""
    flags = flags if flags is not None else [None] * len(rows)
    flags[:] = ['note' if is_note_row(r) else None for r in rows]
    keys = ['' if flags[i] else letters(r.get('hebrew_plain') or r.get('hebrew_niqqud')) for i, r in enumerate(rows)]
    spans = [None] * len(rows)
    cursor = start
    for i, key in enumerate(keys):
        if len(key) < RELIABLE_LETTERS:
            continue
        pos = stream.find(key, cursor)
        if pos < 0:
            continue
        spans[i] = (pos, pos + len(key))
        cursor = pos + len(key)
    reliable = list(spans)
    last = max((i for i, s in enumerate(reliable) if s), default=-1)
    # Rows before an anchored row: the nearest occurrence just before it (right to left).
    for i in range(last - 1, -1, -1):
        key = keys[i]
        if not key or spans[i]:
            continue
        lo = next((reliable[j][1] for j in range(i - 1, -1, -1) if reliable[j]), start)
        hi = next(spans[j][0] for j in range(i + 1, len(keys)) if spans[j])
        pos = stream.rfind(key, lo, max(lo, hi))
        if pos >= 0:
            spans[i] = (pos, pos + len(key))
    # Rows after the last anchored row: forward from their predecessor.
    for i in range(last + 1, len(keys)):
        key = keys[i]
        if not key:
            continue
        lo = next((spans[j][1] for j in range(i - 1, -1, -1) if spans[j]), start)
        pos = stream.find(key, lo)
        if pos >= 0:
            spans[i] = (pos, pos + len(key))
    for i, row in enumerate(rows):
        if spans[i]:
            continue
        key = letters(row.get('hebrew_plain') or row.get('hebrew_niqqud'))
        if flags[i] != 'note' and len(key) < RELIABLE_LETTERS:
            continue
        pos = stream.find(key) if key else -1
        if pos >= 0:
            spans[i] = (pos, pos + len(key))
            flags[i] = flags[i] or 'out-of-order'
    return spans


EDITED_MIN = 0.85


def fuzzy_rows(rows, stream, spans):
    """Second look at rows with no exact match: a row edited for learning (spelling normalized,
    a typo fixed) still shares most consonants, in order, with the source between its neighbours.
    Returns {row_index: similarity} for rows judged 'edited'; the rest stay 'absent'."""
    keys = [letters(r.get('hebrew_plain') or r.get('hebrew_niqqud')) for r in rows]
    edited = {}
    for i, key in enumerate(keys):
        if not key or spans[i]:
            continue
        lo = next((spans[j][1] for j in range(i - 1, -1, -1) if spans[j]), None)
        hi = next((spans[j][0] for j in range(i + 1, len(keys)) if spans[j]), None)
        if lo is None and hi is None:
            continue
        if lo is None:
            lo = max(0, hi - 2 * len(key) - 50)
        if hi is None or hi - lo > 4 * len(key) + 200:
            hi = min(len(stream), lo + 2 * len(key) + 50)
        window = stream[lo:hi]
        sm = difflib.SequenceMatcher(None, key, window, autojunk=False)
        blocks = [b for b in sm.get_matching_blocks() if b.size]
        score = sum(b.size for b in blocks) / len(key)
        if score >= EDITED_MIN and blocks:
            spans[i] = (lo + blocks[0].b, lo + blocks[-1].b + blocks[-1].size)
            edited[i] = round(score, 3)
    return edited


def track_of(kind):
    kind = str(kind or '')
    if 'note' in kind:
        return 'notes'
    if 'structure' in kind:
        return 'structure'
    if 'appendix' in kind:
        return 'appendix'
    return 'text'


def passport(text):
    """Normalizes the three part-passport shapes seen in the archives."""
    sm = text.get('source_meta') or {}
    bs = sm.get('book_section')
    tid = str(text.get('text_id') or '')
    out = {'scheme': 'none', 'section_id': None, 'order': None, 'kind': None, 'track': 'text', 'char_start': None,
           'char_end': None, 'source_sha256': None, 'section_source_sha256': None, 'whole_book_complete': None,
           'selected_scope': None}
    if isinstance(bs, dict):
        out.update(scheme='section' if bs.get('section_id') else 'section-anon', section_id=bs.get('section_id'),
                   order=bs.get('order'), kind=bs.get('kind'), track=track_of(bs.get('kind')),
                   char_start=bs.get('char_start'), char_end=bs.get('char_end_exclusive'),
                   source_sha256=bs.get('source_dump_sha256'), section_source_sha256=bs.get('section_source_sha256'),
                   whole_book_complete=bs.get('whole_book_complete'), selected_scope=bs.get('selected_scope'))
    m = re.search(r'-(?:literal|clear|first-hebrew)-(\d+)-(\d+)$', tid)
    if m:
        if out['char_start'] is None:
            out['char_start'] = int(m.group(1))
        if out['char_end'] is None:
            out['char_end'] = int(m.group(2))
    if m and out['scheme'] in ('none', 'section-anon'):
        out['scheme'] = 'literal'
    m = re.search(r'-section-(\d+)$', tid)
    if m:
        if out['order'] is None:
            out['order'] = int(m.group(1))
        if out['scheme'] in ('none', 'section-anon'):
            out['scheme'] = 'section-n'
    if not out['section_id'] and out['scheme'] != 'none':
        out['section_id'] = tid
    return out


def folder_hint(name):
    m = re.match(r'(\d+)', name)
    low = name.lower()
    return {'folder': int(m.group(1)) if m else None, 'name': name,
            'says_published': 'не импортировано' not in low and 'импортировано' in low,
            'says_ai_layer': 'со слоем' in low, 'pilot': 'пилот' in low}


def archive_role(path, has_library):
    n = path.name.lower()
    if has_library:
        return 'learning'
    if 'evidence' in n:
        return 'evidence'
    if 'details' in n:
        return 'details'
    if n.endswith('.pdf'):
        return 'pdf'
    if n.endswith('.txt'):
        return 'readme'
    return 'other'


def load_catalog(index_path):
    index = json.loads(Path(index_path).read_text(encoding='utf-8'))
    return {str(c['id']): c for c in index.get('ready', [])}, index.get('version')


def load_pseudocatalogue(path):
    with open(path, encoding='utf-8', newline='') as f:
        return {row['ID']: row for row in csv.DictReader(f)}


OFFICIAL_DOWNLOAD = 'https://benyehuda.org/download/{id}?format=txt'


def _get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'LinguistPro-modern-registry/1 (read-only verification)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def source_text(work_id, catalog_row, cache_dir, fetch, official_dir=None, raw_shas=()):
    """Source text of one work: the public-domain dump first; for works newer than the dump,
    the official benyehuda.org text download the archives were built from (owner's
    'official_full_download'), accepted only when its bytes match the part passports."""
    if catalog_row and catalog_row.get('path'):
        rel = catalog_row['path'].lstrip('/') + '.txt'
        file = Path(cache_dir) / rel
        if not file.exists() and fetch:
            try:
                data = _get(RAW_BASE + '/txt/' + rel)
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(data)
            except Exception as e:  # noqa: BLE001 - reported per work, never aborts the run
                return None, 'fetch-failed: ' + str(e)[:80]
        if file.exists():
            raw = file.read_bytes()
            return {'text': raw.decode('utf-8'), 'sha256': sha(raw), 'path': 'dump:' + rel, 'origin': 'dump'}, 'ok'
        return None, 'not-cached'
    if not official_dir:
        return None, 'not-in-pseudocatalogue'
    file = Path(official_dir) / f'{work_id}.txt'
    if not file.exists():
        if not fetch:
            return None, 'official-not-cached'
        try:
            data = _get(OFFICIAL_DOWNLOAD.format(id=work_id))
        except Exception as e:  # noqa: BLE001
            return None, 'official-fetch-failed: ' + str(e)[:80]
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(data)
    raw = file.read_bytes()
    digest = sha(raw)
    expected = {h for h in raw_shas if h}
    if expected and digest not in expected:
        return None, 'official-sha-mismatch'
    return {'text': raw.decode('utf-8'), 'sha256': digest, 'path': 'official:' + work_id, 'origin': 'official',
            'raw_sha_verified': digest in expected}, 'ok'


def scan_secrets(body_text):
    return sorted({p.pattern for p in SECRET_PATTERNS if p.search(body_text)})


def ai_stats(text, rows):
    layer = text.get('word_gloss_ai_layer')
    he_rows = {r.get('order_index') for r in rows if letters(r.get('hebrew_plain') or r.get('hebrew_niqqud'))}
    if not isinstance(layer, dict) or not isinstance(layer.get('rows'), list):
        return {'present': False, 'he_rows': len(he_rows), 'rows': 0, 'covered': 0, 'glosses': 0, 'max_glosses': 0, 'max_mwe': 0}
    lrows = layer['rows']
    covered = {r.get('order_index') for r in lrows if r.get('glosses')} & he_rows
    return {'present': True, 'schema': layer.get('schema'), 'he_rows': len(he_rows), 'rows': len(lrows),
            'covered': len(covered), 'glosses': sum(len(r.get('glosses') or []) for r in lrows),
            'max_glosses': max((len(r.get('glosses') or []) for r in lrows), default=0),
            'max_mwe': max((len(r.get('mwe') or []) for r in lrows), default=0),
            'models': dict(Counter(str(r.get('model') or '') for r in lrows))}


def required_fields(rows):
    he = [r for r in rows if letters(r.get('hebrew_plain') or r.get('hebrew_niqqud'))]
    return {f: sum(1 for r in he if not str(r.get(f) or '').strip()) for f in ('hebrew_plain', 'hebrew_niqqud', 'russian', 'translit')}


def scan(root, catalog, pseudo, cache_dir, fetch):
    archives, parts = [], []
    for folder in sorted(p for p in Path(root).iterdir() if p.is_dir() and p.name != 'AntiGravity'):
        hint = folder_hint(folder.name)
        for file in sorted(f for f in folder.rglob('*') if f.is_file()):
            raw = file.read_bytes()
            rec = {'folder': hint['folder'], 'path': str(file.relative_to(root)), 'file': file.name, 'bytes': len(raw), 'sha256': sha(raw)}
            library = None
            if file.suffix.lower() == '.zip':
                try:
                    z = zipfile.ZipFile(file)
                    name = next((n for n in z.namelist() if n.endswith('library.json')), None)
                    rec['entries'] = len(z.namelist())
                    if name:
                        body = z.read(name)
                        rec['library_sha256'] = sha(body)
                        if 'manifest.json' in z.namelist():
                            m = json.loads(z.read('manifest.json'))
                            rec['manifest_library_sha256'] = m.get('library_json_sha256')
                            rec['manifest_ok'] = m.get('library_json_sha256') in (None, rec['library_sha256'])
                        library = json.loads(body)
                        rec['secret_patterns'] = scan_secrets(body.decode('utf-8'))
                        rec['non_learning_sections'] = {k: len(v) for k, v in library.items() if k not in ('texts', 'schema_version', 'corpus_meta_version') and v}
                except zipfile.BadZipFile:
                    rec['error'] = 'bad zip'
            rec['role'] = archive_role(file, library is not None)
            archives.append(rec)
            if library is None:
                continue
            for pos, text in enumerate(library.get('texts') or []):
                rows = text.get('rows') or []
                sm = text.get('source_meta') or {}
                corpus = text.get('corpus') or sm.get('corpus') or {}
                learning = sm.get('text_learning') or {}
                work_id = str(corpus.get('byehuda_id') or learning.get('byehuda_id') or '')
                card = catalog.get(work_id)
                parts.append({
                    'part_uid': rec['sha256'][:12] + ':' + str(pos), 'archive': rec['path'], 'archive_sha256': rec['sha256'], 'folder': hint['folder'],
                    'work_id': work_id, 'text_id': text.get('text_id'), 'text_key': text.get('text_key'), 'title': text.get('title'),
                    'rows': len(rows), 'rows_sha256': sha(canon(rows)), 'updated_at': text.get('updated_at'),
                    'raw_source_sha256': learning.get('raw_source_sha256'), 'source_version': learning.get('source_version'),
                    'official_period': learning.get('official_period'), 'era': corpus.get('era') or learning.get('app_era'),
                    'author': corpus.get('author'), 'passport': passport(text), 'ai': ai_stats(text, rows),
                    'empty_required': required_fields(rows),
                    'html_entity_rows': sum(1 for r in rows if HTML_ENTITY.search(str(r.get('hebrew_plain') or '') + str(r.get('russian') or ''))),
                    'max_row_words': max((len(str(r.get('hebrew_plain') or '').split()) for r in rows), default=0),
                    'unknown_text_fields': sorted(set(text) - TEXT_FIELDS),
                    'unknown_row_fields': sorted({k for r in rows for k in r} - ROW_FIELDS),
                    'catalog': ('learning-edition' if card and card.get('learning_edition_id') else 'machine' if card else 'absent'),
                    'catalog_edition_rows': (card or {}).get('segments'),
                    '_rows': rows,
                })
    return archives, parts


FOOTER_MARK = 'הפיקו מתנדבי פרויקט בן־יהודה'


def body_mask(text, offsets):
    """1 for each source letter that belongs to the work's body. Excluded: the title line, the
    project's volunteer footer and footnote paragraphs (they end with «↩︎»). Coverage is measured
    on the body only, so a complete text is not reported as 'selected' because of boilerplate."""
    text = unicodedata.normalize('NFC', text)
    excluded = bytearray(len(text) + 1)
    lines, pos = text.split('\n'), 0
    title_done = False
    for line in lines:
        end = pos + len(line)
        if not title_done and line.strip():
            excluded[pos:end] = b'\1' * (end - pos)
            title_done = True
        elif NOTE_MARK in line:
            excluded[pos:end] = b'\1' * (end - pos)
        pos = end + 1
    cut = text.find(FOOTER_MARK)
    if cut >= 0:
        start = text.rfind('\n', 0, cut) + 1
        excluded[start:] = b'\1' * (len(text) + 1 - start)
    return bytearray(0 if excluded[o] else 1 for o in offsets)


def anchor_work(work_parts, src):
    """Anchors every part of one work in its source text. Returns (body_letters, covered_body_letters)
    for the text track; per-part spans go to part['anchor']."""
    stream, offsets = letter_index(src['text'])
    body = body_mask(src['text'], offsets)
    covered = bytearray(len(stream))
    for p in work_parts:
        flags = []
        spans = anchor_rows(p['_rows'], stream, flags=flags)
        exact = sum(1 for s in spans if s)
        edited = fuzzy_rows(p['_rows'], stream, spans)
        found = [s for i, s in enumerate(spans) if s and not flags[i]]  # body rows in source order
        he_rows = sum(1 for r in p['_rows'] if letters(r.get('hebrew_plain') or r.get('hebrew_niqqud')))
        p['anchor'] = {'rows_found': sum(1 for s in spans if s), 'rows_exact': exact,
                       'rows_note': flags.count('note'), 'rows_out_of_order': flags.count('out-of-order'), 'rows_edited': len(edited),
                       'edited_samples': dict(list(edited.items())[:10]), 'rows_hebrew': he_rows,
                       'start': found[0][0] if found else None, 'end': found[-1][1] if found else None,
                       'char_start': offsets[found[0][0]] if found else None,
                       'char_end': offsets[found[-1][1] - 1] + 1 if found else None,
                       'letters': sum(b - a for a, b in found)}
        unmatched = [i for i, s in enumerate(spans) if s is None and letters(p['_rows'][i].get('hebrew_plain') or '')]
        p['anchor']['unmatched_rows'] = unmatched[:20]
        p['anchor']['unmatched_count'] = len(unmatched)
        p['_spans'] = spans
        ps = p['passport']
        if ps['char_start'] is not None and ps['char_end'] is not None and ps['source_sha256'] == src['sha256'] and ps['section_source_sha256']:
            p['passport_slice_ok'] = sha(src['text'][ps['char_start']:ps['char_end']].encode('utf-8')) == ps['section_source_sha256']
        if ps['track'] == 'text':
            for sp in spans:
                if sp:
                    covered[sp[0]:sp[1]] = b'\1' * (sp[1] - sp[0])
    return sum(body), sum(1 for i, c in enumerate(covered) if c and body[i])


def boundaries(work_parts):
    """Gaps, overlaps and repeated rows between consecutive parts of the same track, in dump letters."""
    out = []
    by_track = defaultdict(list)
    for p in work_parts:
        # Notes, structure and appendix tracks re-cover the text's source range by design.
        if p['passport']['track'] == 'text' and p.get('anchor', {}).get('start') is not None:
            by_track[p['passport']['track']].append(p)
    for track, items in by_track.items():
        items.sort(key=lambda p: (p['anchor']['start'], p['anchor']['end']))
        for a, b in zip(items, items[1:]):
            gap = b['anchor']['start'] - a['anchor']['end']
            a_rows = {letters(r.get('hebrew_plain')) for r in a['_rows'][-3:] if letters(r.get('hebrew_plain'))}
            repeated = sum(1 for r in b['_rows'][:3] if letters(r.get('hebrew_plain')) in a_rows)
            out.append({'track': track, 'from': a['part_uid'], 'to': b['part_uid'], 'from_title': a['title'], 'to_title': b['title'],
                        'gap_letters': max(gap, 0), 'overlap_letters': max(-gap, 0), 'repeated_edge_rows': repeated})
    return out


def rows_to_about(part, rows, decisions):
    """Rows the owner moves out of the learning rows into 'About the material' (decisions file).
    Counted here so the rule is proven on real data before the release builder applies it."""
    found = []
    for rule in decisions.get('rules', []):
        rx = re.compile(rule['match'])
        scope = rows[:2] if rule.get('position') == 'first_two_rows' else rows
        for r in scope:
            if rx.search(str(r.get('hebrew_plain') or '').strip()):
                found.append({'rule': rule['id'], 'order_index': r.get('order_index'), 'about_kind': rule['about_kind'],
                              'text': str(r.get('hebrew_plain'))[:120]})
    for move in decisions.get('works', {}).get(part['work_id'], {}).get('move_rows_to_about', []):
        rx = re.compile(move['match'])
        for r in rows:
            if rx.search(str(r.get('hebrew_plain') or '').strip()):
                found.append({'rule': 'work:' + part['work_id'], 'order_index': r.get('order_index'), 'about_kind': move['about_kind'],
                              'text': str(r.get('hebrew_plain'))[:120]})
    return found


def build(args):
    catalog, catalog_version = load_catalog(args.catalog_index)
    pseudo = load_pseudocatalogue(args.pseudocatalogue)
    decisions_path = getattr(args, 'decisions', None)
    decisions = json.loads(Path(decisions_path).read_text(encoding='utf-8')) if decisions_path else {}
    archives, parts = scan(args.library_root, catalog, pseudo, args.txt_cache, args.fetch)
    for p in parts:
        p['rows_to_about'] = rows_to_about(p, p['_rows'], decisions) if p['folder'] not in (1, 2, 3) else []

    # Same work + byte-identical rows in several archives = one part. The copy carrying the AI layer
    # represents it, so a layer-only pilot over a published text is never discarded as a duplicate.
    groups = defaultdict(list)
    for p in parts:
        groups[(p['work_id'], p['rows_sha256'])].append(p)
    dedup, conflicts = [], []
    for copies in groups.values():
        copies.sort(key=lambda p: (not p['ai']['present'], p['folder'] in (1, 2, 3), p['folder'] or 0))
        rep = copies[0]
        published = any(c['folder'] in (1, 2, 3) for c in copies)
        rep['copies'] = [{'archive': c['archive'], 'folder': c['folder'], 'ai': c['ai']['present']} for c in copies]
        rep['duplicate_archives'] = [c['archive'] for c in copies[1:]]
        rep['status'] = ('published' if published and not (rep['ai']['present'] and not any(c['ai']['present'] for c in copies if c['folder'] in (1, 2, 3)))
                         else 'enrich-layer' if published else 'new')
        dedup.append(rep)
    by_text_id = defaultdict(list)
    for p in dedup:
        by_text_id[(p['work_id'], p['text_id'])].append(p)
    for (w, tid), ps in by_text_id.items():
        if len(ps) > 1:
            conflicts.append({'work_id': w, 'text_id': tid, 'parts': [p['part_uid'] for p in ps], 'archives': [p['archive'] for p in ps]})

    works = defaultdict(list)
    for p in dedup:
        works[p['work_id']].append(p)

    work_records = []
    for wid, wparts in sorted(works.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0):
        row = pseudo.get(wid)
        src, status = source_text(wid, row, args.txt_cache, args.fetch, getattr(args, 'official_cache', None),
                                  {p.get('raw_source_sha256') for p in wparts})
        source_letters, covered = anchor_work(wparts, src) if src else (None, 0)
        edges = boundaries(wparts) if src else []
        # Reading order = position in the Ben-Yehuda source (owner decision 2026-10-22 §8.3).
        wparts.sort(key=lambda p: (p.get('anchor', {}).get('start') if p.get('anchor', {}).get('start') is not None else 10 ** 12,
                                   TRACK_RANK[p['passport']['track']], p['passport']['order'] or 0, p['text_id'] or ''))
        for i, p in enumerate(wparts, 1):
            p['reading_order'] = i
        published = {p['catalog'] for p in wparts}
        has_ai = [p['ai']['present'] for p in wparts]
        complete_flags = {p['passport']['whole_book_complete'] for p in wparts}
        periods = Counter(p['official_period'] for p in wparts)
        statuses = {p['status'] for p in wparts}
        new_ai = [p['ai']['present'] for p in wparts if p['status'] == 'new']
        if statuses == {'published'}:
            action = 'published'
        elif 'new' not in statuses:
            action = 'enrich-layer'
        else:
            action = 'publish-with-ai' if all(new_ai) else 'publish-without-ai' if not any(new_ai) else 'publish-mixed-ai'
        if 'new' in statuses and statuses - {'new'}:
            action += '+extends-published'
        work_records.append({
            'work_id': wid, 'title': (row or {}).get('title') or wparts[0]['title'], 'author': (row or {}).get('authors') or wparts[0]['author'],
            'official_period': periods.most_common(1)[0][0], 'official_periods': dict(periods),
            'shelf': 'modern' if periods.most_common(1)[0][0] == 'modern' else 'other',
            'parts': len(wparts), 'rows': sum(p['rows'] for p in wparts), 'tracks': dict(Counter(p['passport']['track'] for p in wparts)),
            'folders': sorted({p['folder'] for p in wparts}), 'catalog': sorted(published), 'action': action,
            'ai': {'parts_with_layer': sum(has_ai), 'he_rows': sum(p['ai']['he_rows'] for p in wparts),
                   'covered_rows': sum(p['ai']['covered'] for p in wparts)},
            'source': {'status': status, 'path': src['path'] if src else None, 'sha256': src['sha256'] if src else None,
                       'origin': src['origin'] if src else None, 'raw_sha_verified': (src or {}).get('raw_sha_verified'),
                       'body_letters': source_letters, 'body_letters_covered': covered,
                       'coverage': round(covered / source_letters, 4) if source_letters else None},
            # A part's whole_book_complete=false only says the part is not the whole book. The work's
            # scope is measured: how much of the source's consonants the text track covers.
            'scope': ('complete' if covered and source_letters and covered / source_letters >= COMPLETE_MIN
                      else 'selected' if source_letters else 'unmeasured'),
            'rows_unanchored': sum(p.get('anchor', {}).get('unmatched_count', 0) for p in wparts),
            'rows_edited': sum(p.get('anchor', {}).get('rows_edited', 0) for p in wparts),
            'html_entity_rows': sum(p['html_entity_rows'] for p in wparts),
            'edges': edges,
            'part_uids': [p['part_uid'] for p in wparts],
        })

    for w in work_records:
        decision = decisions.get('works', {}).get(w['work_id'], {})
        if w['action'] != 'published' and w['rows_unanchored'] >= ABSENT_BLOCK_ROWS:
            if decision.get('provenance_confirmed_by_owner'):
                w['provenance'] = 'owner-confirmed (' + decisions.get('decided_at', '') + ')'
            else:
                w['blocked'] = f"{w['rows_unanchored']} rows match no Ben-Yehuda source text"
        w['rows_to_about'] = [m for p in works[w['work_id']] for m in p.get('rows_to_about', [])]
    for p in dedup:
        p.pop('_rows', None)
        p.pop('_spans', None)
    counts = {
        'archives': dict(Counter(a['role'] for a in archives)),
        'parts_raw': len(parts), 'parts_unique': len(dedup), 'duplicate_parts': len(parts) - len(dedup),
        'works': len(work_records), 'multi_part_works': sum(1 for w in work_records if w['parts'] > 1),
        'actions': dict(Counter(w['action'] for w in work_records)),
        'actions_parts': dict(Counter(a for w in work_records for a in [w['action']] * w['parts'])),
        'text_id_conflicts': len(conflicts),
        'blocked_works': sorted(w['work_id'] for w in work_records if w.get('blocked')),
        'owner_confirmed_provenance': sorted(w['work_id'] for w in work_records if w.get('provenance')),
        'rows_to_about': dict(Counter(m['rule'] for w in work_records for m in w.get('rows_to_about', []))),
        'html_entity_rows_unpublished': sum(w['html_entity_rows'] for w in work_records if w['action'] != 'published'),
    }
    return {'schema': 'modern-release-registry-v1', 'catalog_version': catalog_version, 'counts': counts,
            'works': work_records, 'parts': dedup, 'archives': archives, 'conflicts': conflicts}


def report(reg):
    c = reg['counts']
    lines = ['# Реестр выпуска Modern', '', f"Каталог: v{reg['catalog_version']}. Схема: `{reg['schema']}`.", '',
             '## Счётчики', '', f"- Архивы по ролям: {c['archives']}",
             f"- Частей: {c['parts_unique']} уникальных (в архивах {c['parts_raw']}, повторов {c['duplicate_parts']})",
             f"- Произведений: {c['works']}, из них многочастных: {c['multi_part_works']}",
             f"- Действия (произведения): {c['actions']}", f"- Действия (части): {c['actions_parts']}",
             f"- Конфликтов text_id: {c['text_id_conflicts']}", '']
    todo = [w for w in reg['works'] if w['action'] != 'published']
    lines += ['## Произведения к выпуску: сводка', '', '| Действие | Полка | Произв. | Частей | Строк |', '|---|---|---:|---:|---:|']
    agg = defaultdict(lambda: [0, 0, 0])
    for w in todo:
        a = agg[(w['action'], w['shelf'])]; a[0] += 1; a[1] += w['parts']; a[2] += w['rows']
    for (act, shelf), (n, p, r) in sorted(agg.items()):
        lines.append(f'| {act} | {shelf} | {n} | {p} | {r} |')
    lines += ['', '## Многочастные произведения', '', '| ID | Название | Частей | Дорожки | Строк | Покрытие исходника | Объём | Правлено строк | Нет в источнике | Стыки: пропуск/наложение/повтор |', '|---|---|---:|---|---:|---:|---|---:|---:|---|']
    for w in reg['works']:
        if w['parts'] < 2:
            continue
        e = w['edges']
        gaps = sum(1 for x in e if x['gap_letters'] > 0); ov = sum(1 for x in e if x['overlap_letters'] > 0); rep = sum(1 for x in e if x['repeated_edge_rows'])
        cov = w['source']['coverage']
        lines.append(f"| {w['work_id']} | {w['title'][:40]} | {w['parts']} | {w['tracks']} | {w['rows']} | {'—' if cov is None else f'{cov:.1%}'} | {w['scope']} | {w['rows_edited']} | {w['rows_unanchored']} | {gaps}/{ov}/{rep} |")
    problems = []
    for w in reg['works']:
        if w['action'] == 'published':
            continue
        if w['source']['status'] != 'ok':
            problems.append(f"- {w['work_id']}: исходник не получен ({w['source']['status']})")
        for m in w.get('rows_to_about', []):
            problems.append(f"- {w['work_id']}: строка {m['order_index']} → «О материале» ({m['rule']}): {m['text'][:60]}")
        if w.get('blocked'):
            problems.append(f"- **БЛОК** {w['work_id']} {w['title'][:40]}: {w['blocked']}")
        if w['html_entity_rows']:
            problems.append(f"- {w['work_id']} {w['title'][:40]}: строк с HTML-сущностями (&nbsp; и т.п.): {w['html_entity_rows']}")
        if w['rows_unanchored']:
            problems.append(f"- {w['work_id']} {w['title'][:40]}: строк нет в источнике: {w['rows_unanchored']} (правленых найдено: {w['rows_edited']})")
        for x in w['edges']:
            if x['overlap_letters'] or x['repeated_edge_rows']:
                problems.append(f"- {w['work_id']} [{x['track']}] «{(x['from_title'] or '')[:30]}» → «{(x['to_title'] or '')[:30]}»: наложение {x['overlap_letters']} букв, повтор строк {x['repeated_edge_rows']}")
    for p in reg['parts']:
        if p['folder'] in (1, 2, 3):
            continue
        if p['unknown_text_fields'] or p['unknown_row_fields']:
            problems.append(f"- {p['archive']}: неизвестные поля {p['unknown_text_fields'] + p['unknown_row_fields']}")
        if any(p['empty_required'].values()):
            problems.append(f"- {p['archive']} «{(p['title'] or '')[:30]}»: пустые обязательные поля {p['empty_required']}")
        if p['ai']['present'] and p['ai']['covered'] < p['ai']['he_rows']:
            problems.append(f"- {p['archive']}: слой ИИ покрывает {p['ai']['covered']}/{p['ai']['he_rows']} строк")
        if p.get('passport_slice_ok') is False:
            problems.append(f"- {p['archive']}: хеш вырезки паспорта не совпал с исходником")
    for a in reg['archives']:
        if a.get('secret_patterns'):
            problems.append(f"- {a['path']}: подозрительные строки {a['secret_patterns']}")
        if a.get('non_learning_sections'):
            problems.append(f"- {a['path']}: неучебные разделы {a['non_learning_sections']}")
        if a.get('manifest_ok') is False:
            problems.append(f"- {a['path']}: library.json не совпал с хешем манифеста")
    for cf in reg['conflicts']:
        problems.append(f"- конфликт text_id {cf['text_id']}: {cf['archives']}")
    lines += ['', f'## Замечания ({len(problems)})', ''] + (problems[:400] or ['Нет.'])
    return '\n'.join(lines) + '\n'


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--library-root', type=Path, required=True)
    p.add_argument('--catalog-index', type=Path, required=True)
    p.add_argument('--pseudocatalogue', type=Path, required=True)
    p.add_argument('--txt-cache', type=Path, required=True, help='Ben-Yehuda dump txt cache (txt/pNN/mNNN.txt layout)')
    p.add_argument('--official-cache', type=Path, help='cache for official benyehuda.org text downloads (works newer than the dump)')
    p.add_argument('--fetch', action='store_true', help='download missing source texts into the caches')
    p.add_argument('--decisions', type=Path, help='owner decisions JSON (docs/planning/modern-release/.../owner-decisions.json)')
    p.add_argument('--out', type=Path, required=True)
    args = p.parse_args(argv)
    reg = build(args)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'registry.json').write_text(json.dumps(reg, ensure_ascii=False, indent=1), encoding='utf-8', newline='\n')
    (args.out / 'report.md').write_text(report(reg), encoding='utf-8', newline='\n')
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(reg['counts'], ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
