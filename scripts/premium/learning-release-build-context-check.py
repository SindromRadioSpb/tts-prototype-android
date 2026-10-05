"""Static build-context check for required release paths and excluded staging paths.

This evaluates the repository's simple ordered rules for these concrete paths.
It is not a Docker image build or a substitute for post-deploy asset readback.
"""
import fnmatch, hashlib, json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
rules = [line.strip() for line in (root / '.dockerignore').read_text(encoding='utf-8').splitlines()
         if line.strip() and not line.lstrip().startswith('#')]

def excluded(file):
    parts = file.split('/')
    candidates = ['/'.join(parts[:i]) for i in range(1, len(parts) + 1)]
    # Basename rules are considered too, covering the existing unanchored data rule.
    candidates += parts
    state = False
    for line in rules:
        include = line.startswith('!')
        pattern = line.lstrip('!').strip('/')
        if any(fnmatch.fnmatchcase(candidate, pattern) for candidate in candidates):
            state = not include
    return state

catalog = json.loads((root / 'public/data/benyehuda/corpus-catalog-v8.json').read_text())
manifest_path = 'public/data/benyehuda/' + catalog['release_manifest']
manifest = json.loads((root / manifest_path).read_text())
required = ['server.js', 'db/corpusSentenceRepo.js', 'db/benyehudaLearningRelease.js',
            'public/index.html', 'public/library.html', 'public/sw.js', 'public/js/library-ui.js',
            'public/js/benyehuda-learning-edition.js', 'public/js/corpus-discovery-core.js',
            'public/js/corpus-discovery-browser.js', 'public/data/benyehuda/corpus-catalog-v8.json', manifest_path]
required += ['public/data/benyehuda/' + file for file in manifest['assets'] if not file.startswith('fts/')]
for file in required:
    assert (root / file).is_file() and not excluded(file), 'Required runtime asset excluded: ' + file
for file, asset in manifest['assets'].items():
    if not file.startswith('fts/'):
        assert hashlib.sha256((root / ('public/data/benyehuda/' + file)).read_bytes()).hexdigest() == asset['sha256']
blocked = ['.tmp/private-input-texts.json', '.tmp/rollback-v7.zip',
           'public/data/benyehuda/works/3557.json', 'public/data/benyehuda/fts/lemma-v8.json']
for file in blocked:
    assert excluded(file), 'Private/volume path enters build context: ' + file
report = {'result': 'pass', 'method': 'Static ordered-rule check of concrete required paths; local Docker daemon unavailable, image build not performed',
          'required_runtime_paths_included': sorted(set(required)), 'private_and_volume_canaries_excluded': blocked,
          'manifest_sha256': catalog['release_manifest_sha256']}
out = root / '.tmp/learning-release/build-context-report.json'
out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'result': 'pass', 'included_paths': len(set(required)), 'excluded_canaries': len(blocked)}))
