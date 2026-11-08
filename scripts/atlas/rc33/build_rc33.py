"""Build the RC3.3 native candidate: addressed audit corrections on the verified 841fd642 edition.

Never edits the source edition. Writes a new candidate directory; stage it with stage-edition.cjs.
  python -I scripts/atlas/rc33/build_rc33.py --source <841fd642 dir> --audit <findings.json> --out <new dir>
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import apply as AP  # noqa: E402
import corrections as C  # noqa: E402
import locate as L  # noqa: E402

BASE_REV = '841fd6424e8428ba5ebd1f489f514c5dff058d841e415c5a13a42fe7504b47cc'
BASE_MANIFEST = '17ad83041d068b2a0a53e669d47c69ea2a631bc25530ac847106d70e78994b3d'
FINDINGS_SHA = None  # recorded, not pinned: the archive SHA is pinned in corrections.AUDIT_SHA256


def enc(x):
    return json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf8')


def digest(b):
    return hashlib.sha256(b).hexdigest()


def read(p):
    return json.loads(Path(p).read_text(encoding='utf8'))


def write(p, x):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(enc(x))


def build(source, audit, destination):
    repo = HERE.parents[2]
    assert not destination.exists(), 'New candidate directory required'
    mbytes = (source / 'manifest.json').read_bytes()
    assert digest(mbytes) == BASE_MANIFEST, 'Base manifest'
    manifest = json.loads(mbytes)
    assert manifest['structure_revision'] == BASE_REV
    for name, entry in manifest['files'].items():
        b = (source / name).read_bytes()
        assert len(b) == entry['bytes'] and digest(b) == entry['sha256'], name
    findings_bytes = audit.read_bytes()
    findings = json.loads(findings_bytes)
    confirmed = {f['finding_id'] for f in findings if f['category'] == 'confirmed_atlas_defect'}
    assert confirmed == set(C.D), 'Every confirmed finding needs exactly one disposition'

    sections = L.load_sections(str(source))
    idx = L.index_nodes(sections)
    log = AP.apply(sections, idx, C.D, findings)
    assert len(log) > 0

    destination.mkdir(parents=True)
    shutil.copytree(source / 'assets', destination / 'assets')
    for sid, section in sections.items():
        write(destination / 'sections' / (sid + '.json'), section)
    subprocess.run(['node', str(repo / 'scripts/atlas/freeze-overlay-identities.cjs'), str(source), str(destination)], check=True, cwd=repo)
    sections = {p.stem: read(p) for p in (destination / 'sections').glob('*.json')}

    dispositions = {fid: {k: v for k, v in d.items() if k != 'ops'} | {'operations': len(d['ops'])} for fid, d in C.D.items()}
    overlay = {'schema': 'linguistpro.atlas-rc33-corrections.1', 'corpus_id': 'a97001rc32', 'source_atlas_id': 'a97001',
               'base_revision': BASE_REV, 'base_manifest_sha256': BASE_MANIFEST,
               'audit_archive_sha256': C.AUDIT_SHA256, 'audit_findings_sha256': digest(findings_bytes),
               'dispositions': dispositions, 'changes': log,
               'source_text_policy': 'Exact source restored only where legible on the scan; unresolved words stay marked.',
               'scientific_acceptance': False, 'production_permission': False}
    overlay_bytes = enc(overlay)
    overlay_sha = digest(overlay_bytes)
    (destination / 'rc33-corrections-manifest.json').write_bytes(overlay_bytes)

    for section in sections.values():
        section.pop('structure_revision')
        section['content_pack_sha256'] = digest(enc({'pages': section['pages'], 'terms': section['terms']}))
    tool_names = ['scripts/atlas/rc33/build_rc33.py', 'scripts/atlas/rc33/apply.py', 'scripts/atlas/rc33/corrections.py',
                  'scripts/atlas/rc33/locate.py', 'scripts/atlas/freeze-overlay-identities.cjs',
                  'scripts/atlas/build-structure-derivatives.cjs', 'scripts/atlas/build-search-index.cjs',
                  'scripts/atlas/build-train-bank.cjs', 'public/js/atlas-words.js', 'public/js/atlas-train.js',
                  'public/js/atlas-search.js', 'lib/atlasEdition.js']
    tools = {n: digest((repo / n).read_bytes().replace(b'\r\n', b'\n')) for n in tool_names}
    revision = digest(enc({'builder': 'addressed-rc33-corrections-1', 'base_revision': BASE_REV,
                           'overlay_sha256': overlay_sha, 'sections': sections, 'tools': tools}))
    assert revision != BASE_REV
    for sid, section in sections.items():
        section['structure_revision'] = revision
        write(destination / 'sections' / (sid + '.json'), section)
    index = read(source / 'index.json')
    index['structure_revision'] = revision
    write(destination / 'index.json', index)
    for script, args in [('build-structure-derivatives.cjs', [str(destination)]), ('build-train-bank.cjs', ['--data=' + str(destination)])]:
        subprocess.run(['node', str(repo / 'scripts/atlas' / script), *args], check=True, cwd=repo)
    old_bank = read(source / 'train/terms.json')['terms']
    new_bank = read(destination / 'train/terms.json')['terms']
    assert set(old_bank) == set(new_bank), 'Term set must not change'
    counts = {}
    for d in C.D.values():
        counts[d['action']] = counts.get(d['action'], 0) + 1
    report = {'schema': 'atlas97001.rc33-build.1', 'revision': revision, 'base_revision': BASE_REV,
              'overlay_sha256': overlay_sha, 'dispositions': counts, 'field_changes': len(log),
              'changed_nodes': len({e['target'] for e in log}), 'term_ids_unchanged': len(new_bank),
              'build_tools_sha256': tools, 'publication': False}
    write(destination / 'rc33-build-report.json', report)
    print(json.dumps(report, ensure_ascii=True))
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--audit', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    build(a.source.resolve(), a.audit.resolve(), a.out.resolve())
