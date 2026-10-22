"""Read-only inventory of learning archives in the media library folders."""
import hashlib, json, sys, zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(sys.argv[1])
OUT = Path(sys.argv[2])


def sha(b):
    return hashlib.sha256(b).hexdigest()


def find_library(z):
    names = z.namelist()
    for n in names:
        if n.endswith('library/library.json') or n == 'library.json':
            return n
    return None


def scan_zip(path, folder):
    raw = path.read_bytes()
    rec = {'folder': folder, 'file': path.name, 'bytes': len(raw), 'sha256': sha(raw)}
    try:
        z = zipfile.ZipFile(path)
    except Exception as e:  # noqa
        rec['error'] = 'not a zip: %s' % e
        return rec
    names = z.namelist()
    rec['entries'] = len(names)
    rec['entry_kinds'] = dict(Counter((n.rsplit('/', 1)[0] if '/' in n else '.') for n in names).most_common(8))
    if 'manifest.json' in names:
        try:
            m = json.loads(z.read('manifest.json'))
            rec['manifest'] = {k: m[k] for k in list(m)[:20] if not isinstance(m[k], (list, dict)) or k in ('counts', 'summary')}
        except Exception as e:
            rec['manifest_error'] = str(e)
    lib = find_library(z)
    if not lib:
        return rec
    body = z.read(lib)
    rec['library_sha256'] = sha(body)
    data = json.loads(body)
    if 'library' in data and isinstance(data['library'], dict):
        data = data['library']
    rec['library_top_keys'] = sorted(data.keys())
    texts = []
    for t in data.get('texts', []):
        rows = t.get('rows') or []
        rowkeys = Counter()
        metakeys = Counter()
        ai = 0; ai_items = 0; morph = 0
        for r in rows:
            rowkeys.update(r.keys())
            meta = r.get('meta') or {}
            if isinstance(meta, dict):
                metakeys.update(meta.keys())
            layer = r.get('word_gloss_ai_layer') or (meta.get('word_gloss_ai_layer') if isinstance(meta, dict) else None)
            if layer:
                ai += 1
                if isinstance(layer, dict):
                    ai_items += len(layer.get('items') or layer.get('words') or layer.get('glosses') or [])
                elif isinstance(layer, list):
                    ai_items += len(layer)
            if any(k in r for k in ('morph', 'morphology', 'sentence_morph', 'dicta')) or (isinstance(meta, dict) and any('morph' in k or 'dicta' in k for k in meta)):
                morph += 1
        corpus = t.get('corpus') or (t.get('source_meta') or {}).get('corpus') or {}
        sm = t.get('source_meta') or {}
        texts.append({
            'title': t.get('title'),
            'text_id': t.get('text_id'),
            'text_key': t.get('text_key'),
            'byehuda_id': corpus.get('byehuda_id'),
            'author': corpus.get('author'),
            'era': corpus.get('era'),
            'rows': len(rows),
            'ai_rows': ai,
            'ai_items': ai_items,
            'morph_rows': morph,
            'text_keys': sorted(k for k in t.keys() if k != 'rows'),
            'source_meta_keys': sorted(sm.keys()),
            'row_keys': dict(rowkeys),
            'meta_keys': dict(metakeys.most_common(40)),
            'first_he': (rows[0].get('hebrew_plain') or rows[0].get('hebrew_niqqud') or '')[:80] if rows else '',
            'last_he': (rows[-1].get('hebrew_plain') or rows[-1].get('hebrew_niqqud') or '')[:80] if rows else '',
        })
    rec['texts'] = texts
    for extra in ('shelves', 'series', 'word_studies', 'notes', 'progress', 'bookmarks', 'audio_assets', 'srs', 'cards'):
        v = data.get(extra)
        if v:
            rec.setdefault('extras', {})[extra] = len(v) if hasattr(v, '__len__') else 1
    return rec


result = []
for folder in sorted(p for p in ROOT.iterdir() if p.is_dir() and p.name != 'AntiGravity'):
    for f in sorted(folder.rglob('*')):
        if f.is_file():
            if f.suffix.lower() == '.zip':
                rel = str(f.parent.relative_to(ROOT))
                try:
                    result.append(scan_zip(f, rel))
                except Exception as e:
                    result.append({'folder': rel, 'file': f.name, 'error': repr(e)})
            else:
                result.append({'folder': str(f.parent.relative_to(ROOT)), 'file': f.name, 'bytes': f.stat().st_size, 'kind': 'non-zip'})
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf-8')
print('records', len(result))
