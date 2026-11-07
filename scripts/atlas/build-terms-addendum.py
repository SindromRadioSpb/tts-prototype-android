"""Apply only the 48 reviewed addendum scopes to the verified V2 edition."""
import argparse
import copy
import json
from pathlib import Path
import shutil
import subprocess
import zipfile
from importlib.util import spec_from_file_location, module_from_spec

spec = spec_from_file_location('v2', Path(__file__).with_name('build-terms-v2-edition.py'))
v2 = module_from_spec(spec)
spec.loader.exec_module(v2)
enc, digest, read, write, locate = v2.enc, v2.digest, v2.read, v2.write, v2.locate
ARCHIVE_SHA = '9e1f7345436ec4b99ebd26901ba5f007af335dd6b44276817e3e17195fbf6dcb'
BASE_REV = '420c34275a26fe37cae12a41e77a77dde173de207164f6b5421c5a5dcf1c92bc'
BASE_MANIFEST = '20f06244b634c8296456693ec2a9620e5b19eb67f7df32a11efe3340f925018f'


def build(package, archive, source, canonical, destination):
    assert digest(archive.read_bytes()) == ARCHIVE_SHA, 'Addendum archive hash'
    assert not destination.exists(), 'New staging directory required'
    manifest = read(source / 'manifest.json')
    assert digest((source / 'manifest.json').read_bytes()) == BASE_MANIFEST
    assert manifest['structure_revision'] == BASE_REV
    for name, entry in manifest['files'].items():
        b = (source / name).read_bytes()
        assert len(b) == entry['bytes'] and digest(b) == entry['sha256'], name
    delivery = read(package / 'ADDENDUM-MANIFEST.json')
    with zipfile.ZipFile(archive) as z:
        assert (package / 'ADDENDUM-MANIFEST.json').read_bytes() == z.read('ADDENDUM-MANIFEST.json')
        for entry in delivery['files']:
            name = entry['path']
            assert '..' not in Path(name).parts and not Path(name).is_absolute() and ':' not in name
            b = (package / name).read_bytes()
            assert b == z.read(name) and len(b) == entry['bytes'] and digest(b) == entry['sha256'], name
    proposals = read(package / 'reviewed-scoped-addendum.json')['records']
    assert len(proposals) == 48 and len({r['term_id'] for r in proposals}) == 48
    records = {r['record']['id']: r for r in map(json.loads, canonical.read_text(encoding='utf8').splitlines())}
    assert len(records) == 6255
    sections = {p.stem: read(p) for p in (source / 'sections').glob('*.json')}
    old = copy.deepcopy(sections)
    old_bank = read(source / 'train/terms.json')['terms']
    assert len(old_bank) == 761
    for a in proposals:
        cf, tid, sid, ref = a['canonical_after_patch'], a['term_id'], a['section_id'], a['source_ref']
        assert set(cf) == {'lemma_he', 'niqqud', 'translit', 'translit_ru', 'ru', 'learner_explanation_ru'}
        assert all(isinstance(x, str) and x.strip() for x in cf.values())
        assert digest(enc(cf)) == a['canonical_sha256']
        assert a['independent_review_approved'] and not a['training_eligible'] and not a['publication_allowed'] and not a['native_deployment_authorized']
        witness_path = a['independent_review_ref'].split('#')[0]
        assert witness_path.startswith('evidence/') and '..' not in Path(witness_path).parts
        witnesses = [r for r in read(package / witness_path)['records'] if r.get('term_id') == tid]
        assert len(witnesses) == 1
        w = witnesses[0]
        assert w['canonical_after_patch'] == cf and (w.get('canonical_sha256_after_patch') or w['canonical_sha256']) == a['canonical_sha256']
        assert w['decision'] in {'approve', 'approved_direct_scoped', 'approved_editorial_scoped'}
        src = records[ref]
        assert src['sid'] == sid and src['record']['he'] == a['source_quote_he']
        assert digest(a['source_quote_he'].encode('utf8')) == a['source_he_sha256']
        section = sections[sid]
        if tid in old_bank:
            assert old[sid]['terms'][tid]['training_eligible'] is False, 'May replace only an explicitly reviewed held canonical'
        notice = a.get('required_notice_ru') or ''
        if a.get('requires_no_literal_source_wordspan'):
            assert notice and w['decision'] == 'approved_editorial_scoped'
        section['terms'][tid] = {
            **{k: cf[k] for k in ['lemma_he', 'niqqud', 'translit', 'translit_ru']},
            'senses': [{'sense': a['sense'], 'ru': cf['ru']}], 'source_refs': [ref], 'definition_refs': [],
            'study_note': cf['learner_explanation_ru'] + (' ' + notice if notice else ''),
            'required_notice_ru': notice, 'source_word_span_verified': not a.get('requires_no_literal_source_wordspan', False),
            'source_relation': a['source_relation'], 'reading_origin': a['reading_origin'],
            'training_eligible': True, 'publication_allowed': False, 'reading_status': 'independently_reviewed_authored_scoped_candidate',
            'learning_eligibility': {'schema': 'atlas97001.learning-eligibility.1', 'lexical': {
                'allowed': True, 'target': 'canonical_term_sense', 'review_basis': a['independent_review_ref'],
                'canonical_fields_sha256': a['canonical_sha256'], 'whole_sentence_linguistic_certification': False}}}
        node, ancestors = locate(section, ref, src)
        assert node['he'] == src['record']['he']
        tr = tid + '#' + a['sense']
        for field in ['terms', 'term_context_refs']:
            node[field] = list(dict.fromkeys(node.get(field, []) + [tr]))
        node['term_context_eligible'] = True
        eligibility = node.setdefault('learning_eligibility', {'schema': 'atlas97001.learning-eligibility.1', 'lexical': {'allowed': False}})
        eligibility.setdefault('term_context', {}).update({'allowed': True, 'target': 'reviewed_terms_only', 'term_refs': node['term_context_refs'], 'whole_sentence_linguistic_certification': False})
        for parent in ancestors:
            parent.setdefault('learning_eligibility', {'schema': 'atlas97001.learning-eligibility.1', 'lexical': {'allowed': False}}).setdefault('term_context', {})['allowed'] = True
            parent['term_context_eligible'] = True
    destination.mkdir(parents=True)
    shutil.copytree(source / 'assets', destination / 'assets')
    for sid, section in sections.items():
        write(destination / 'sections' / (sid + '.json'), section)
    repo = Path(__file__).resolve().parents[2]
    subprocess.run(['node', str(repo / 'scripts/atlas/freeze-overlay-identities.cjs'), str(source), str(destination)], check=True, cwd=repo)
    sections = {p.stem: read(p) for p in (destination / 'sections').glob('*.json')}
    overlay = {'schema': 'linguistpro.atlas-terms-addendum-overlay.1', 'corpus_id': 'a97001rc32',
               'base_revision': BASE_REV, 'base_manifest_sha256': BASE_MANIFEST, 'source_pdf_sha256': v2.PDF_SHA,
               'term_archive_sha256': ARCHIVE_SHA, 'accepted_pairs': proposals, 'source_reading_corrections': [],
               'separate_editorial_proposals_activated': False, 'scientific_acceptance': False, 'production_permission': False}
    write(destination / 'terms-overlay-manifest.json', overlay)
    for section in sections.values():
        section.pop('structure_revision')
        section['content_pack_sha256'] = digest(enc({'pages': section['pages'], 'terms': section['terms']}))
    tool_names = ['scripts/atlas/build-terms-addendum.py', 'scripts/atlas/freeze-overlay-identities.cjs', 'scripts/atlas/build-structure-derivatives.cjs', 'scripts/atlas/build-search-index.cjs', 'scripts/atlas/build-train-bank.cjs', 'public/js/atlas-words.js', 'public/js/atlas-train.js', 'public/js/atlas-search.js', 'lib/atlasEdition.js']
    tools = {n: digest((repo / n).read_bytes()) for n in tool_names}
    revision = digest(enc({'builder': 'addressed-terms-addendum-1', 'base_revision': BASE_REV, 'overlay': overlay, 'sections': sections, 'tools': tools}))
    for sid, section in sections.items():
        section['structure_revision'] = revision
        write(destination / 'sections' / (sid + '.json'), section)
    index = read(source / 'index.json'); index['structure_revision'] = revision
    write(destination / 'index.json', index)
    for script, args in [('build-structure-derivatives.cjs', [str(destination)]), ('build-train-bank.cjs', ['--data=' + str(destination)])]:
        subprocess.run(['node', str(repo / 'scripts/atlas' / script), *args], check=True, cwd=repo)
    report = {'schema': 'atlas97001.addendum-build.1', 'revision': revision, 'accepted': 48, 'base_targets': 255,
              'expected_targets': 303, 'source_text_preserved': True, 'build_tools_sha256': tools, 'publication': False}
    write(destination / 'terms-build-report.json', report)
    print(json.dumps(report))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for k in ['package', 'archive', 'source', 'canonical', 'out']:
        p.add_argument('--' + k, type=Path, required=True)
    a = p.parse_args()
    build(*(getattr(a, k).resolve() for k in ['package', 'archive', 'source', 'canonical', 'out']))
