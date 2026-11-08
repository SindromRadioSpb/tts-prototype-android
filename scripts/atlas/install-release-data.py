"""Install only verified new Atlas namespaces; activate export sources separately.

No database, learner state, image or old immutable namespace is written.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tarfile


def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def read(p):
    return json.loads(p.read_text(encoding='utf8'))


def inside(root, relative):
    p = PurePosixPath(relative)
    assert not p.is_absolute() and all(x not in {'..', '.', ''} for x in p.parts) and ':' not in relative and '\\' not in relative
    target = root.joinpath(*p.parts)
    assert target.resolve().is_relative_to(root.resolve())
    for parent in [target, *target.parents]:
        assert not parent.is_symlink(), 'Symlink forbidden'
        if parent == root:
            break
    return target


def verify_files(root, inventory):
    for name, entry in inventory.items():
        p = inside(root, name)
        assert p.is_file() and p.stat().st_size == entry['bytes'] and sha(p) == entry['sha256'], name


def verify_native(root, pin):
    assert sha(root / 'manifest.json') == pin['manifest_sha256']
    m = read(root / 'manifest.json')
    assert m['atlas_id'] == 'a97001' and m['structure_revision'] == pin['revision']
    assert read(root / 'READY.json')['manifest_sha256'] == pin['manifest_sha256']
    verify_files(root, m['files'])


def verify_sources(root):
    m = read(root / 'manifest.json')
    assert m['atlas_id'] == 'a97001rc32'
    verify_files(root, m['files'])
    return m


def install(root, archive, expected, phase):
    assert root.exists() and root.is_dir() and not root.is_symlink()
    assert sha(archive) == expected, 'Release archive SHA'
    with tarfile.open(archive, 'r:gz') as tar:
        members = tar.getmembers()
        assert all(m.isfile() for m in members), 'Only regular files'
        names = [m.name for m in members]
        assert len(names) == len(set(names))
        meta = json.load(tar.extractfile('release-data.json'))
        assert meta['version'] == '3.11.879' and meta['corpus_id'] == 'a97001rc32'
        assert set(names) == {'release-data.json', *meta['files']}
        pins = meta['native_pins']
        assert len(pins) == 2
        prefixes = ['atlas-editions/a97001/' + p['revision'] + '/' for p in pins] + ['atlas-sources/a97001rc32/']
        assert all(any(n.startswith(prefix) for prefix in prefixes) for n in meta['files'])
        stage = inside(root, 'atlas-release-staging/3.11.879')
        if phase == 'stage':
            stage.mkdir(parents=True, exist_ok=True)
            for member in members:
                p = inside(stage, member.name)
                if p.exists():
                    if member.name != 'release-data.json':
                        e = meta['files'][member.name]
                        assert p.stat().st_size == e['bytes'] and sha(p) == e['sha256']
                    continue
                p.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as source, p.open('xb') as target:
                    shutil.copyfileobj(source, target)
            verify_files(stage, meta['files'])
            # Preserve the original and the currently published RC3.2 exactly.
            for p in meta['retained_native_pins']:
                verify_native(inside(root, 'atlas-editions/a97001/' + p['revision']), p)
            for p in pins:
                relative = 'atlas-editions/a97001/' + p['revision']
                candidate, destination = inside(stage, relative), inside(root, relative)
                verify_native(candidate, p)
                if destination.exists():
                    verify_native(destination, p)
                else:
                    shutil.copytree(candidate, destination.with_name('.incoming-' + p['revision']))
                    incoming = destination.with_name('.incoming-' + p['revision'])
                    verify_native(incoming, p)
                    incoming.rename(destination)
            candidate = inside(stage, 'atlas-sources/a97001rc32')
            assert verify_sources(candidate)['edition_revision'] == meta['active_revision']
            current = inside(root, 'atlas-sources/a97001rc32')
            baseline = verify_sources(current)
            assert baseline['edition_revision'] == meta['previous_revision']
            (stage / 'stage-report.json').write_text(json.dumps({'baseline_source_manifest_sha256': sha(current / 'manifest.json'), 'source_revision': baseline['edition_revision'], 'native_ready': True}), encoding='utf8')
            return {'phase': phase, 'native_ready': True, 'sources_activated': False}
    assert phase == 'activate'
    current = inside(root, 'atlas-sources/a97001rc32')
    candidate = inside(stage, 'atlas-sources/a97001rc32')
    backup = inside(root, 'atlas-sources/a97001rc32-backup-3.11.879')
    if verify_sources(current)['edition_revision'] == meta['active_revision']:
        assert backup.exists()
        return {'phase': phase, 'unchanged': True, 'backup': str(backup)}
    assert not backup.exists(), 'Backup target must be absent'
    assert sha(current / 'manifest.json') == read(stage / 'stage-report.json')['baseline_source_manifest_sha256']
    assert verify_sources(current)['edition_revision'] == meta['previous_revision']
    assert verify_sources(candidate)['edition_revision'] == meta['active_revision']
    baseline_sha = sha(current / 'manifest.json')
    current.rename(backup)
    try:
        candidate.rename(current)
    except BaseException:
        backup.rename(current)
        raise
    assert sha(backup / 'manifest.json') == baseline_sha
    assert verify_sources(current)['edition_revision'] == meta['active_revision']
    return {'phase': phase, 'sources_activated': True, 'backup': str(backup), 'backup_manifest_sha256': baseline_sha}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data-root', type=Path, required=True)
    p.add_argument('--archive', type=Path, required=True)
    p.add_argument('--sha256', required=True)
    p.add_argument('--phase', choices=['stage', 'activate'], required=True)
    a = p.parse_args()
    print(json.dumps(install(a.data_root.resolve(), a.archive.resolve(), a.sha256, a.phase)))
