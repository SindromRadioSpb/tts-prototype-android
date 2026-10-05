"""Read-only owner archive inventory. Bodies stay in the specified private output directory."""
import argparse
import hashlib
import json
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical_key(text):
    source = str(text.get('source_text') or '').replace('\r\n', '\n').replace('\r', '\n').strip()
    payload = {'v': 1, 'sourceText': source, 'ttsProfile': None, 'tableModelMeta': text.get('table_model_meta') or None}
    return sha(json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-root', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    archives, records, raw_texts, problems = [], [], [], []
    for folder in ['1', '2', '3']:
        for path in sorted((args.input_root / folder).glob('*.zip')):
            raw = path.read_bytes()
            relative = folder + '/' + path.name
            learning = path.name.endswith('.learning.zip')
            info = {'archive': relative, 'role': 'learning' if learning else 'evidence', 'bytes': len(raw), 'sha256': sha(raw)}
            with zipfile.ZipFile(path) as z:
                names = z.namelist()
                info.update(entries=len(names), uncompressed_bytes=sum(e.file_size for e in z.infolist()), crc_bad_entry=z.testzip())
                info['duplicate_entries'] = [n for n, count in Counter(names).items() if count > 1]
                if info['crc_bad_entry'] or info['duplicate_entries']:
                    problems.append({'archive': relative, 'error': 'ZIP integrity'})
                if not learning:
                    info['metadata_entries'] = [n for n in names if re.search(r'(manifest|checksums|freeze|readme|source-work-profiles|source-manifest|audit|review|release|ledger)', n, re.I)]
                    archives.append(info)
                    continue
                entries = [n for n in names if n in ['library/library.json', 'library.json']]
                if len(entries) != 1:
                    problems.append({'archive': relative, 'error': 'library entry missing/ambiguous'})
                    archives.append(info)
                    continue
                body = z.read(entries[0]); lib = json.loads(body)
                manifest = json.loads(z.read('manifest.json')) if 'manifest.json' in names else None
                info.update(schema_version=lib.get('schema_version'), corpus_meta_version=lib.get('corpus_meta_version'), library_sha256=sha(body), works=len(lib.get('texts', [])), rows=0, manifest=manifest)
                for ordinal, text in enumerate(lib.get('texts', [])):
                    corpus = text.get('corpus') or text.get('source_meta', {}).get('corpus', {})
                    learning_meta = text.get('source_meta', {}).get('text_learning', {})
                    rows = text.get('rows', [])
                    work_id = str(corpus.get('byehuda_id') or '')
                    row_counts = {key: sum(bool(str(r.get(key) or '').strip()) for r in rows) for key in ['hebrew_plain', 'hebrew_niqqud', 'russian', 'translit', 'translit_ru']}
                    errors = []
                    if not work_id.isdigit(): errors.append('invalid work ID')
                    if not rows: errors.append('empty rows')
                    if any(r.get('order_index') != i for i, r in enumerate(rows)): errors.append('order_index mismatch')
                    if row_counts['hebrew_plain'] != len(rows): errors.append('empty Hebrew row')
                    if corpus.get('review_status') not in ['machine', 'machine_assisted']: errors.append('review status')
                    if corpus.get('audio_status') != 'none' or lib.get('audio_assets'): errors.append('audio claim')
                    stored = text.get('text_key')
                    recomputed = canonical_key(text)
                    record = {'archive': relative, 'ordinal': ordinal, 'work_id': work_id, 'title': text.get('title'), 'author': corpus.get('author'), 'stored_key': stored, 'recomputed_key': recomputed, 'key_matches': stored == recomputed, 'source_text_bytes': len(str(text.get('source_text') or '').encode('utf-8')), 'source_text_sha256': sha(str(text.get('source_text') or '').encode('utf-8')), 'rows_sha256': sha(json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')), 'rows': len(rows), 'filled_rows': row_counts, 'official_period': learning_meta.get('official_period'), 'app_era': corpus.get('era'), 'genre': corpus.get('genre'), 'revision': text.get('updated_at'), 'source_version': learning_meta.get('source_version'), 'dump_commit': learning_meta.get('dump_commit'), 'errors': errors}
                    records.append(record)
                    raw_texts.append({'archive': relative, 'ordinal': ordinal, 'text': text})
                    info['rows'] += len(rows)
                    if errors: problems.append({'archive': relative, 'work_id': work_id, 'errors': errors})
                archives.append(info)
                print(relative, info['works'], 'works', info['rows'], 'rows', flush=True)
    by_id, by_stored, by_recomputed = defaultdict(list), defaultdict(list), defaultdict(list)
    for record in records:
        by_id[record['work_id']].append(record)
        by_stored[record['stored_key']].append(record['work_id'])
        by_recomputed[record['recomputed_key']].append(record['work_id'])
    duplicate_ids = {k: v for k, v in by_id.items() if len(v) > 1}
    report = {'schema': 'learning-release-inventory-v1', 'archives': archives, 'works': records, 'summary': {'archives': len(archives), 'learning_archives': sum(a['role'] == 'learning' for a in archives), 'evidence_archives': sum(a['role'] == 'evidence' for a in archives), 'work_records': len(records), 'unique_work_ids': len(by_id), 'rows': sum(r['rows'] for r in records), 'stored_keys': len(by_stored), 'recomputed_keys': len(by_recomputed), 'key_mismatches': [r['work_id'] for r in records if not r['key_matches']], 'duplicate_id_count': len(duplicate_ids), 'stored_key_collisions': {k: v for k, v in by_stored.items() if len(set(v)) > 1}, 'recomputed_key_collisions': {k: v for k, v in by_recomputed.items() if len(set(v)) > 1}, 'schema_or_integrity_problems': len(problems)}, 'duplicate_ids': duplicate_ids, 'problems': problems}
    dump(args.out / 'input-inventory.json', report)
    dump(args.out / 'private-input-texts.json', raw_texts)
    print(json.dumps(report['summary'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
