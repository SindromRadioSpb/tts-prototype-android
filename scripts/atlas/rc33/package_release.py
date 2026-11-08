"""Pack the RC3.3 release data for install-release-data.py (version 3.11.880).

Contains only the new native namespace and the new export-source descriptor directory; never learner data.
  python -I scripts/atlas/rc33/package_release.py --runtime .tmp/rc33/runtime --out <archive.tar.gz>
"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

VERSION = '3.11.880'
PREVIOUS = '841fd6424e8428ba5ebd1f489f514c5dff058d841e415c5a13a42fe7504b47cc'
RETAINED = [
    {'revision': PREVIOUS, 'manifest_sha256': '17ad83041d068b2a0a53e669d47c69ea2a631bc25530ac847106d70e78994b3d'},
    {'revision': '420c34275a26fe37cae12a41e77a77dde173de207164f6b5421c5a5dcf1c92bc', 'manifest_sha256': '20f06244b634c8296456693ec2a9620e5b19eb67f7df32a11efe3340f925018f'},
    {'revision': 'cea369d48494fcf58e78e0567fb82477abe7bb21ba02112707c3d7ba31fc4fd7', 'manifest_sha256': '0211488a36ef6a03c6f277c6c913fb18165ab19430d13a4e623c95fc640ba332'},
    {'revision': '50253381cb255822678b07e0ed41a608a3a701a661527eb796837b2f3ee64edc', 'manifest_sha256': '085d33fddbd04a1eaaa4a9e625273591683cdcf9ff19d0b16899d503132ada7a'},
]


def sha(b):
    return hashlib.sha256(b).hexdigest()


def main(runtime, out):
    ACTIVE = json.loads((runtime / 'rc33-context-rebind.json').read_text(encoding='utf8'))['pin']
    files, blobs = {}, {}
    native = runtime / 'atlas-editions/a97001' / ACTIVE['revision']
    sources = runtime / 'atlas-sources/a97001rc32'
    assert sha((native / 'manifest.json').read_bytes()) == ACTIVE['manifest_sha256']
    assert json.loads((sources / 'manifest.json').read_text(encoding='utf8'))['edition_revision'] == ACTIVE['revision']
    for base in [native, sources]:
        for p in sorted(base.rglob('*')):
            if p.is_file():
                rel = p.relative_to(runtime).as_posix()
                b = p.read_bytes()
                files[rel] = {'bytes': len(b), 'sha256': sha(b)}
                blobs[rel] = b
    meta = {'version': VERSION, 'corpus_id': 'a97001rc32', 'active_revision': ACTIVE['revision'], 'previous_revision': PREVIOUS,
            'native_pins': [ACTIVE], 'retained_native_pins': RETAINED, 'files': files}
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w', format=tarfile.PAX_FORMAT) as tar:
        def put(name, data):
            info = tarfile.TarInfo(name)
            info.size, info.mtime, info.mode = len(data), 0, 0o644
            tar.addfile(info, io.BytesIO(data))
        put('release-data.json', json.dumps(meta, sort_keys=True).encode('utf8'))
        for name in sorted(blobs):
            put(name, blobs[name])
    out.write_bytes(gzip.compress(buf.getvalue(), mtime=0))
    print(json.dumps({'archive': str(out), 'sha256': sha(out.read_bytes()), 'bytes': out.stat().st_size, 'files': len(files)}))


if __name__ == '__main__':
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--runtime', type=Path, required=True)
    a.add_argument('--out', type=Path, required=True)
    x = a.parse_args()
    main(x.runtime.resolve(), x.out.resolve())
