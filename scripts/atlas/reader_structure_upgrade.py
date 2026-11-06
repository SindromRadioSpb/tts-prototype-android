"""Reproducible, lossless semantic-row upgrade. Never writes learner state.

Each boundary is a reviewed Unicode range in a pinned original field.  The
original item remains an addressable historical group; new rows receive new
IDs.  This is a reader-data correction, not an AI lesson/card generator.
"""
import copy
import hashlib
import json
import unicodedata
from pathlib import Path

FIELDS = ('he', 'he_niqqud', 'translit', 'translit_ru', 'ru')
HERE = Path(__file__).resolve().parent
SPEC_PATH = HERE / 'corrections' / 'a97001-structure-v1.json'


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def digest(value):
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def validate_ranges(original, record):
    """Every non-space original code point occurs once, including niqqud."""
    if record.get('original_fields') != {k: original.get(k, '') for k in FIELDS}:
        raise ValueError('STRUCTURE_SOURCE_CHANGED: ' + original['id'])
    children = record.get('children', [])
    if len(children) < 2:
        raise ValueError('STRUCTURE_NO_SPLIT: ' + original['id'])
    keys = [c['key'] for c in children]
    if len(set(keys)) != len(keys):
        raise ValueError('STRUCTURE_DUPLICATE_SUFFIX: ' + original['id'])
    for field in FIELDS:
        text = original.get(field, '')
        coverage = [0] * len(text)
        for child in children:
            spans = child.get('spans', {}).get(field, [])
            parts = []
            for start, end in spans:
                if not (isinstance(start, int) and isinstance(end, int) and 0 <= start < end <= len(text)):
                    raise ValueError('STRUCTURE_RANGE: ' + original['id'] + ':' + field)
                if start and unicodedata.combining(text[start]):
                    raise ValueError('STRUCTURE_SPLIT_DIACRITIC: ' + original['id'] + ':' + field)
                for n in range(start, end):
                    coverage[n] += 1
                parts.append(text[start:end])
            reconstructed = ' '.join(parts).strip()
            supplied = child.get('fields', {}).get(field, '')
            if ''.join(reconstructed.split()) != ''.join(supplied.split()):
                raise ValueError('STRUCTURE_FIELD_NOT_RAW: ' + original['id'] + ':' + child['key'] + ':' + field)
        missing = [n for n, ch in enumerate(text) if not ch.isspace() and coverage[n] != 1]
        if missing:
            raise ValueError('STRUCTURE_COVERAGE: ' + original['id'] + ':' + field + ':' + str(missing[:12]))


def load_spec():
    return json.loads(SPEC_PATH.read_text(encoding='utf-8')) if SPEC_PATH.exists() else None


def _apply_terms(data, spec):
    entries = spec.get('terms_by_section', {}).get(data['id'], {})
    for tid, term in entries.items():
        old = data.setdefault('terms', {}).get(tid)
        if old and old != term and tid not in spec.get('allowed_term_updates', []):
            raise ValueError('STRUCTURE_TERM_COLLISION: ' + tid)
        data['terms'][tid] = copy.deepcopy(term)
    by_id = {i['id']: i for p in data.get('pages', []) for i in p.get('items', [])}
    for p in data.get('pages', []):
        for t in p.get('tables', []):
            for c in t.get('cells', []):
                by_id[t['id'] + ':cell:' + str(c['row']) + ':' + str(c['col'])] = c
    for link in spec.get('term_links', []):
        if link['section'] != data['id']:
            continue
        obj = by_id.get(link['ref'])
        if obj is None:
            raise ValueError('STRUCTURE_TERM_TARGET: ' + link['ref'])
        refs = [r for r in obj.get('terms', []) if r not in link.get('remove', [])]
        for ref in link.get('add', []):
            if ref not in refs:
                refs.append(ref)
        obj['terms'] = refs
        if link.get('concept_status'):
            obj['concept_status'] = link['concept_status']
        if link.get('review_note'):
            obj['concept_review_note'] = link['review_note']
            obj['training_eligible'] = False
            page = next(p for p in data['pages'] if obj in p.get('items', []) or
                        any(obj in t.get('cells', []) for t in p.get('tables', [])))
            note = {'about': 'block', 'ref': link['ref'],
                    'text': 'Термин требует редакторской проверки: ' + link['review_note']}
            if note not in page.setdefault('editor', []):
                page['editor'].append(note)


def apply_section(data, spec=None):
    """Return a corrected copy and log. Unknown editions fail closed."""
    if data.get('atlas_id') != 'a97001':
        return copy.deepcopy(data), []
    spec = spec if spec is not None else load_spec()
    if not spec or data.get('id') not in spec.get('sections', {}):
        return copy.deepcopy(data), []
    if not data.get('source_pack_sha256'):
        # Tiny callers/tests are not a complete build edition.
        return copy.deepcopy(data), []
    if data.get('structure_revision') == spec['revision']:
        # Do not silently accept a half-applied edition.
        items = {i['id']: i for p in data.get('pages', []) for i in p.get('items', [])}
        groups = {g['id']: g for p in data.get('pages', []) for g in p.get('legacy_groups', [])}
        for rec in spec['sections'][data['id']]['splits']:
            if rec['target'] not in groups or any(rec['target'] + ':' + c['key'] not in items for c in rec['children']):
                raise ValueError('STRUCTURE_PARTIAL_EDITION: ' + rec['target'])
            validate_ranges(groups[rec['target']]['original'], rec)
            for c in rec['children']:
                item = items[rec['target'] + ':' + c['key']]
                if any(item.get(k, '') != c['fields'].get(k, '') for k in FIELDS):
                    raise ValueError('STRUCTURE_CHILD_CHANGED: ' + item['id'])
        return copy.deepcopy(data), []
    if data.get('structure_revision'):
        raise ValueError('STRUCTURE_REVISION_CONFLICT: ' + data['id'])
    out = copy.deepcopy(data)
    section_spec = spec['sections'][out['id']]
    if out.get('source_pack_sha256') != section_spec['source_pack_sha256'] or out.get('content_pack_sha256') != section_spec['content_pack_sha256']:
        raise ValueError('STRUCTURE_BASE_EDITION_CHANGED: ' + out['id'])
    compat = section_spec['occurrence_compatibility']
    out['occurrence_compatibility'] = copy.deepcopy(compat)
    old_order = {r['id']: r['order_index'] for r in compat['rows']}
    next_order = max(old_order.values(), default=-1) + 1
    by_id = {i['id']: (p, i) for p in out.get('pages', []) for i in p.get('items', [])}
    log = []
    for record in section_spec['splits']:
        target = record['target']
        if target not in by_id:
            raise ValueError('STRUCTURE_TARGET_MISSING: ' + target)
        page, original = by_id[target]
        validate_ranges(original, record)
        children = []
        for n, c in enumerate(record['children']):
            item = {k: copy.deepcopy(v) for k, v in original.items()
                    if k not in FIELDS + ('id', 'terms', 'ambiguity_note', 'note', 'kind')}
            item.update(copy.deepcopy(c['fields']))
            item.update({'id': target + ':' + c['key'], 'type': 'block', 'kind': c.get('kind', 'prose'),
                         'terms': list(c.get('terms', []))})
            sy = c.get('source_y') or []
            item['y'] = min(sy) if sy else original.get('y', 0) + n / 1000
            item['structure'] = {
                'parent_ref': target, 'order': n, 'depth': c.get('depth', 0),
                'marker': c.get('marker'), 'group': c.get('group'),
                'occurrence_order_index': next_order,
                'review_status': record.get('status', 'needs_review'),
                'source_spans': copy.deepcopy(c['spans']), 'source_y': sy,
                'source_page': page['page'], 'pdf_sha256': spec['pdf_sha256'],
                'notes': c.get('notes', []),
            }
            if c.get('applies_to'):
                item['structure']['applies_to'] = c['applies_to']
            common = [target + ':' + ctx['key'] for ctx in record['children']
                      if item['id'] in ctx.get('applies_to', [])]
            if common:
                item['structure']['shared_source_refs'] = common
            next_order += 1
            # The existing source statuses are not a certificate for new rows.
            item['structure']['owner_review_inherited'] = False
            item['training_eligible'] = c.get('training_eligible',
                bool(item.get('he') and item.get('ru')) and record.get('status') == 'ready'
                and item['kind'] not in ('editor_note', 'editorial_note', 'shared_source_context'))
            if c.get('editorial_fields'):
                item['editorial_fields'] = copy.deepcopy(c['editorial_fields'])
            children.append(item)
        if any(c['id'] in by_id for c in children):
            raise ValueError('STRUCTURE_ID_COLLISION: ' + target)
        group = {'id': target, 'children': [c['id'] for c in children],
                 'original': copy.deepcopy(original), 'legacy_order_index': old_order.get(target),
                 'source_revision': compat['source_revision'], 'review_status': record.get('status'),
                 'review_notes': record.get('review_notes', [])}
        page.setdefault('legacy_groups', []).append(group)
        at = page['items'].index(original)
        page['items'][at:at+1] = children
        log.append(target + ': ' + str(len(children)) + ' semantic rows; original retained')
    for patch in section_spec.get('patches', []):
        if patch['target'] not in by_id:
            raise ValueError('STRUCTURE_PATCH_TARGET: ' + patch['target'])
        obj = by_id[patch['target']][1]
        obj.update(copy.deepcopy(patch['patch']))
    _apply_terms(out, spec)
    out['structure_revision'] = spec['revision']
    out['structure_provenance'] = {'base_commit': spec['base_commit'], 'pdf_sha256': spec['pdf_sha256'],
        'coverage': 'confirmed registry only; not a complete philological or mathematical certification',
        'generated_ai_content': False}
    return out, log
