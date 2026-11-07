"""Addressed V2 overlay on a verified immutable RC3.2 source; never edits that source.

Only a new staging directory is written. Native search/train/stage builders remain authoritative.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

PACKAGE_SHA = '3de437c6424889f52389217bf961c6104ad8714fe6305d9d0b7579cee3568069'
BASE_REV = 'cea369d48494fcf58e78e0567fb82477abe7bb21ba02112707c3d7ba31fc4fd7'
BASE_MANIFEST = '0211488a36ef6a03c6f277c6c913fb18165ab19430d13a4e623c95fc640ba332'
PDF_SHA = 'eb4e4ee7f154bce30dbd61b094d6a42a9925af909bd7ecb2f80bce4639af0e0c'


def enc(x):
    return json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf8')


def digest(b):
    return hashlib.sha256(b).hexdigest()


def read(p):
    return json.loads(p.read_text(encoding='utf8'))


def write(p, x):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(enc(x))


def locate(section, ref, source_record):
    # Address the canonical semantic location, never an identically named copy
    # embedded in source evidence or a historical compatibility object.
    pages = [p for p in section['pages'] if p['page'] == source_record['page']]
    assert len(pages) == 1
    parts = source_record['location'].split('/')
    assert parts[0] in {'items', 'tables', 'figures'} and all(p not in {'..', ''} for p in parts)
    node, ancestors = pages[0], []
    for part in parts:
        node = node[int(part)] if isinstance(node, list) else node[part]
        if isinstance(node, dict) and 'id' in node:
            ancestors.append(node)
    assert node['id'] == ref
    return node, ancestors[:-1]


def build(package, archive, source, destination, runtime):
    assert digest(archive.read_bytes()) == PACKAGE_SHA, 'Term ZIP hash'
    assert not destination.exists(), 'New staging destination required'
    assert source not in destination.parents and package not in destination.parents, 'Output overlaps input'
    manifest = read(source / 'manifest.json')
    assert digest((source / 'manifest.json').read_bytes()) == BASE_MANIFEST
    assert manifest['structure_revision'] == BASE_REV
    for name, entry in manifest['files'].items():
        b = (source / name).read_bytes()
        assert len(b) == entry['bytes'] and digest(b) == entry['sha256'], ('source bytes', name)
    p = package / 'term-enrichment-round3'
    index = read(source / 'index.json')
    critical = ['inspection/canonical-native-records.jsonl'] + ['term-enrichment-round3/' + name for name in [
        'lexical-acceptance-v2.json', 'source-link-scoped-diff.json', 'source-reading-correction-diff.json', 'linguistic-review-round2.json']]
    critical += ['term-enrichment-round3/runtime-preview/sections/' + s['id'] + '.json' for s in index['sections']]
    critical += ['export/edition/sections/' + s['id'] + '.json' for s in index['sections']]
    with zipfile.ZipFile(archive) as z:
        for name in critical:
            assert (package / name).read_bytes() == z.read(name), ('Unpacked package input drift', name)
    baseline = {s['id']: read(source / 'sections' / (s['id'] + '.json')) for s in index['sections']}
    sections = copy.deepcopy(baseline)
    ledger = read(p / 'lexical-acceptance-v2.json')
    accepted = {r['term_id']: r for r in ledger['records']}
    held = {r['term_id'] for r in ledger['held']}
    assert len(accepted) == 222 and len(held) == 48 and not accepted.keys() & held
    link = read(p / 'source-link-scoped-diff.json')['rows']
    corrections = read(p / 'source-reading-correction-diff.json')['records']
    assert len(link) == 222 and {r['term_id'] for r in link} == accepted.keys()
    assert {r['term_id'] for r in corrections} == {'a97001:term:element-s', 'a97001:term:element-k'}
    original_bank = read(source / 'train/terms.json')['terms']
    assert len(original_bank) == 513
    canonical_records = {r['record']['id']: r for r in map(json.loads, (package / 'inspection/canonical-native-records.jsonl').read_text(encoding='utf8').splitlines())}
    assert len(canonical_records) == 6255
    hash_metadata_corrections = []
    lexical_review = {r['term_id']: r for r in read(p / 'linguistic-review-round2.json')['records']}
    for sid, base in baseline.items():
        assert (package / 'export/edition/sections' / (sid + '.json')).read_bytes() == (source / 'sections' / (sid + '.json')).read_bytes(), ('baseline drift', sid)
        preview = read(p / 'runtime-preview/sections' / (sid + '.json'))
        for tid, term in base['terms'].items():
            assert preview['terms'][tid] == term, ('old term modified', tid)
        for tid, term in preview['terms'].items():
            if tid in base['terms']:
                continue
            assert tid not in original_bank and tid in accepted.keys() | held
            if tid not in accepted or accepted[tid]['sid'] != sid:
                assert term.get('training_eligible') is False and not term.get('learning_eligibility', {}).get('lexical', {}).get('allowed'), ('held term admitted', tid)
            else:
                a = accepted[tid]
                assert a['sid'] == sid and a['source_pdf_sha256'] == PDF_SHA
                cf = a['canonical_fields']
                compact = a['canonical_hash_algorithm'] == 'sha256_utf8_json_sorted_compact_six_fields'
                raw = json.dumps(cf, ensure_ascii=False, sort_keys=True, **({'separators': (',', ':')} if compact else {})).encode('utf8')
                if digest(raw) != a['canonical_fields_sha256']:
                    # Earlier approvals were hashed compactly but mislabeled by the V2 wrapper.
                    # Prove the exact digest against the independently retained lexical witness;
                    # never ignore a hash or accept arbitrary serialization alternatives.
                    assert not compact and guard_is_legacy(a)
                    assert digest(enc(cf)) == a['canonical_fields_sha256'], ('canonical digest', tid)
                    witness = lexical_review[tid]
                    assert witness['canonical_after_patch'] == cf and witness['canonical_after_patch_sha256'] == a['canonical_fields_sha256'] and witness['decision'] == 'accepted_as_authored_for_review'
                    hash_metadata_corrections.append({'term_id': tid, 'declared': a['canonical_hash_algorithm'], 'verified': 'sha256_utf8_json_sorted_compact_six_fields', 'sha256': a['canonical_fields_sha256']})
                for key in ['lemma_he', 'niqqud', 'translit', 'translit_ru']:
                    assert term[key] == cf[key], (tid, key)
                assert term['study_note'].startswith(cf['learner_explanation_ru']) and any(s['sense'] == a['sense'] and s['ru'] == cf['ru'] for s in term['senses'])
                assert term['source_refs'] == a['source_refs'] and term.get('training_eligible') is True
            sections[sid]['terms'][tid] = copy.deepcopy(term)
    for r in corrections:
        node, _ = locate(sections[r['sid']], r['source_ref'], canonical_records[r['source_ref']])
        assert set(r['changes']) <= {'he_niqqud', 'translit', 'translit_ru'}
        for key, diff in r['changes'].items():
            assert node.get(key) == diff['before'], ('reading precondition', r['source_ref'], key)
            node[key] = diff['after']
        node['enrichment_reading_correction'] = {'evidence_ref': 'lexical-acceptance-round2.json#' + r['term_id'], 'reason': 'Independent dictionary-backed correction; not source text replacement', 'changed_fields': list(r['changes'])}
    for r in link:
        a = accepted[r['term_id']]
        assert r['sid'] == a['sid'] and a['source_refs'] == [r['source_ref']]
        src = canonical_records[r['source_ref']]
        node, ancestors = locate(sections[r['sid']], r['source_ref'], src)
        assert src['sid'] == r['sid'] and src['record']['he'] == node['he']
        guard = a.get('required_projection_guard')
        if guard:
            assert guard['source_he_sha256'] == digest(node['he'].encode('utf8')) and guard['canonical_sha256'] == a['canonical_fields_sha256']
            assert guard['term_id'] == r['term_id'] and guard['source_ref'] == r['source_ref'] and guard['sid'] == r['sid'] and guard['source_pdf_sha256'] == PDF_SHA
        for key, value in r['before'].items():
            assert node.get(key) == value, ('source link precondition', r['term_id'], key)
        # The supplier's earlier `after` snapshots contain shared policy objects
        # later enriched by other terms on the same row. Reconstruct one approved
        # operation at a time, checking each `before`, then compare the final tree.
        term_ref = r['term_id'] + '#' + a['sense']
        node['terms'] = list(dict.fromkeys(node.get('terms', []) + [term_ref]))
        node['term_context_refs'] = list(dict.fromkeys(node.get('term_context_refs', []) + [term_ref]))
        node['term_context_eligible'] = True
        policy = node.setdefault('learning_eligibility', {'schema': 'atlas97001.learning-eligibility.1', 'lexical': {'allowed': False}})
        old_context = policy.get('term_context', {})
        policy['term_context'] = {**old_context, 'allowed': True, 'target': 'verified_canonical_terms_in_plain_source_context',
                                  'term_refs': node['term_context_refs'], 'evidence_refs': list(dict.fromkeys(old_context.get('evidence_refs', []) + ['lexical-acceptance-round2.json#' + r['term_id']])), 'whole_sentence_linguistic_certification': False}
        # Only the corresponding containing objects become traversable for this term place.
        for parent in ancestors:
            parent.setdefault('learning_eligibility', {'schema': 'atlas97001.learning-eligibility.1', 'lexical': {'allowed': False}}).setdefault('term_context', {})['allowed'] = True
            parent['term_context_eligible'] = True
    # Prove the addressed application equals the reviewed preview, rather than copying it blindly.
    for sid, section in sections.items():
        preview = read(p / 'runtime-preview/sections' / (sid + '.json'))
        assert section == preview, ('unexpected preview delta', sid)
    overlay = {'schema': 'linguistpro.atlas-terms-overlay.1', 'corpus_id': 'a97001rc32', 'source_atlas_id': 'a97001',
               'base_revision': BASE_REV, 'base_manifest_sha256': BASE_MANIFEST, 'source_pdf_sha256': PDF_SHA,
               'term_archive_sha256': PACKAGE_SHA, 'accepted_pairs': ledger['records'], 'held': ledger['held'],
               'source_links_sha256': digest((p / 'source-link-scoped-diff.json').read_bytes()),
               'source_reading_corrections': corrections, 'supplier_hash_metadata_corrections': hash_metadata_corrections, 'scientific_acceptance': False, 'production_permission': False}
    overlay_bytes = enc(overlay)
    overlay_sha = digest(overlay_bytes)
    for section in sections.values():
        section.pop('structure_revision')
        section['content_pack_sha256'] = digest(enc({'pages': section['pages'], 'terms': section['terms']}))
    tools = {name: digest((runtime / name).read_bytes()) for name in ['scripts/atlas/build-terms-v2-edition.py', 'scripts/atlas/build-structure-derivatives.cjs', 'scripts/atlas/build-search-index.cjs', 'scripts/atlas/build-train-bank.cjs', 'public/js/atlas-search.js', 'public/js/atlas-words.js', 'public/js/atlas-train.js', 'lib/atlasEdition.js']}
    revision = digest(enc({'builder': 'addressed-terms-v2-1', 'base_revision': BASE_REV, 'overlay_sha256': overlay_sha, 'sections': sections, 'tools': tools}))
    assert revision != BASE_REV
    destination.mkdir(parents=True)
    shutil.copytree(source / 'assets', destination / 'assets')
    for sid, section in sections.items():
        section['structure_revision'] = revision
        write(destination / 'sections' / (sid + '.json'), section)
    index['structure_revision'] = revision
    write(destination / 'index.json', index)
    (destination / 'terms-overlay-manifest.json').write_bytes(overlay_bytes)
    subprocess.run(['node', str(runtime / 'scripts/atlas/build-structure-derivatives.cjs'), str(destination)], check=True, cwd=runtime)
    subprocess.run(['node', str(runtime / 'scripts/atlas/build-train-bank.cjs'), '--data=' + str(destination)], check=True, cwd=runtime)
    rebuilt = read(destination / 'train/terms.json')['terms']
    for tid, term in original_bank.items():
        assert rebuilt[tid] == term, ('rebuilt old train term drift', tid)
    report = {'schema': 'atlas97001.terms-v2-addressed-build.1', 'revision': revision, 'overlay_sha256': overlay_sha,
              'accepted': 222, 'held': 48, 'old_term_ids_unchanged': 513, 'source_record_count': len(canonical_records),
              'source_text_preserved': True, 'reading_corrections': corrections, 'build_tools_sha256': tools, 'publication': False}
    report['supplier_hash_metadata_corrections'] = hash_metadata_corrections
    write(destination / 'terms-build-report.json', report)
    print(json.dumps(report, ensure_ascii=True))
    return report


def guard_is_legacy(approval):
    return approval.get('required_projection_guard') is None and approval['independent_linguistic_review_ref'].startswith('linguistic-review-round2.json#')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ['package', 'archive', 'source', 'out']:
        parser.add_argument('--' + key, type=Path, required=True)
    args = parser.parse_args()
    build(args.package.resolve(), args.archive.resolve(), args.source.resolve(), args.out.resolve(), Path(__file__).resolve().parents[2])
