"""Atlas 97001 recordings: pack on the operator machine, install on the server volume.

  pack:    python -I audio_release.py pack --tts .tmp/rc33/tts --out atlas-audio-881.tar.gz
  install: sudo python3 audio_release.py install --data-root <DATA_DIR> --archive <tar.gz> --sha256 <sha>

Install writes only DATA_DIR/audio-cache/<sha-key>.mp3 (content-addressed, never overwritten with other bytes) and
DATA_DIR/atlas-audio/a97001rc32/<revision>/ (index + section manifests, placed atomically). No database, no learner
data, no atlas edition is touched. Re-running is a no-op.
"""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile

KEY = re.compile(r'^audio-cache/[a-f0-9]{64}\.mp3$')
MAN = re.compile(r'^atlas-audio/a97001rc32/[a-f0-9]{64}/(index|s\d{2}-[a-z0-9-]+)\.json$')


def sha(b):
    return hashlib.sha256(b).hexdigest()


def pack(tts, out):
    index = json.loads((tts / 'audio' / 'index.json').read_text(encoding='utf8'))
    rev = index['edition_revision']
    assert index['schema'] == 'linguistpro.atlas-audio-index.1' and index['atlas_id'] == 'a97001rc32' and re.fullmatch(r'[a-f0-9]{64}', rev)
    blobs = {}
    for sid, msha in index['audio'].items():
        mb = (tts / 'audio' / (sid + '.json')).read_bytes()
        assert sha(mb) == msha, sid
        blobs['atlas-audio/a97001rc32/%s/%s.json' % (rev, sid)] = mb
        for entry in json.loads(mb)['items'].values():
            name = 'audio-cache/%s.mp3' % entry['key']
            if name in blobs:
                continue
            b = (tts / 'audio-cache' / (entry['key'] + '.mp3')).read_bytes()
            assert len(b) == entry['bytes'] and sha(b) == entry['audio_sha256'], entry['key']
            blobs[name] = b
    blobs['atlas-audio/a97001rc32/%s/index.json' % rev] = (tts / 'audio' / 'index.json').read_bytes()
    meta = {'schema': 'linguistpro.atlas-audio-release.1', 'atlas_id': 'a97001rc32', 'edition_revision': rev,
            'files': {n: {'bytes': len(b), 'sha256': sha(b)} for n, b in sorted(blobs.items())}}
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w', format=tarfile.PAX_FORMAT) as tar:
        def put(name, data):
            info = tarfile.TarInfo(name)
            info.size, info.mtime, info.mode = len(data), 0, 0o644
            tar.addfile(info, io.BytesIO(data))
        put('audio-release.json', json.dumps(meta, sort_keys=True).encode('utf8'))
        for n in sorted(blobs):
            put(n, blobs[n])
    out.write_bytes(gzip.compress(buf.getvalue(), mtime=0))
    mp3 = sum(1 for n in blobs if n.endswith('.mp3'))
    print(json.dumps({'archive': str(out), 'sha256': sha(out.read_bytes()), 'bytes': out.stat().st_size, 'mp3': mp3,
                      'manifests': len(blobs) - mp3, 'edition_revision': rev}))


def inside(root, rel):
    p = PurePosixPath(rel)
    assert not p.is_absolute() and all(x not in {'', '.', '..'} for x in p.parts)
    target = root.joinpath(*p.parts)
    assert str(target.resolve()).startswith(str(root.resolve()) + os.sep)
    return target


def install(root, archive, expected):
    assert root.is_dir() and not root.is_symlink()
    assert sha(archive.read_bytes()) == expected, 'archive SHA'
    with tarfile.open(archive, 'r:gz') as tar:
        members = {m.name: m for m in tar.getmembers()}
        assert all(m.isfile() for m in members.values())
        meta = json.load(tar.extractfile('audio-release.json'))
        assert meta['schema'] == 'linguistpro.atlas-audio-release.1' and meta['atlas_id'] == 'a97001rc32'
        rev = meta['edition_revision']
        assert set(members) == {'audio-release.json', *meta['files']}
        for n in meta['files']:
            assert KEY.match(n) or (MAN.match(n) and n.split('/')[2] == rev), n
        # the edition the recordings belong to must already be installed
        assert inside(root, 'atlas-editions/a97001/' + rev + '/READY.json').is_file(), 'edition not installed'
        written = reused = 0
        cache = inside(root, 'audio-cache')
        cache.mkdir(exist_ok=True)
        for n, e in meta['files'].items():
            if not KEY.match(n):
                continue
            b = tar.extractfile(members[n]).read()
            assert len(b) == e['bytes'] and sha(b) == e['sha256'], n
            target = inside(root, n)
            if target.exists():
                assert sha(target.read_bytes()) == e['sha256'], 'different bytes under a content key: ' + n
                reused += 1
                continue
            tmp = target.with_name(target.name + '.part')
            tmp.write_bytes(b)
            os.replace(tmp, target)
            written += 1
        dest = inside(root, 'atlas-audio/a97001rc32/' + rev)
        manifests = {n: tar.extractfile(members[n]).read() for n in meta['files'] if MAN.match(n)}
        for n, b in manifests.items():
            assert sha(b) == meta['files'][n]['sha256'], n
        if dest.exists():
            for n, b in manifests.items():
                assert inside(root, n).read_bytes() == b, 'existing manifest differs: ' + n
            state = 'unchanged'
        else:
            stage = dest.with_name('.incoming-' + rev)
            if stage.exists():
                shutil.rmtree(stage)
            stage.mkdir(parents=True)
            for n, b in manifests.items():
                (stage / n.rsplit('/', 1)[1]).write_bytes(b)
            os.replace(stage, dest)
            state = 'installed'
    print(json.dumps({'mp3_written': written, 'mp3_reused': reused, 'manifests': len(manifests), 'manifest_dir': state, 'edition_revision': rev}))


if __name__ == '__main__':
    a = argparse.ArgumentParser(description=__doc__)
    s = a.add_subparsers(dest='cmd', required=True)
    p = s.add_parser('pack'); p.add_argument('--tts', type=Path, required=True); p.add_argument('--out', type=Path, required=True)
    i = s.add_parser('install'); i.add_argument('--data-root', type=Path, required=True); i.add_argument('--archive', type=Path, required=True); i.add_argument('--sha256', required=True)
    x = a.parse_args()
    if x.cmd == 'pack':
        pack(x.tts.resolve(), x.out.resolve())
    else:
        install(x.data_root.resolve(), x.archive.resolve(), x.sha256)
