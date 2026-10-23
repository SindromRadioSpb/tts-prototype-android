"""Read-only material-opening release verification against exact Git blobs.

Defaults reproduce S1 (815); --version=3.11.816 verifies the S2 shell/Room bump
while retaining the unchanged 815 shared data-module pins.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--commit', required=True)
parser.add_argument('--base', default='https://linguistpro.kolosei.com')
parser.add_argument('--out', required=True)
parser.add_argument('--version', default='3.11.815')
args = parser.parse_args()

def fetch(path):
    url = args.base + path + ('&' if '?' in path else '?') + 'verify=' + str(time.time())
    return urllib.request.urlopen(urllib.request.Request(url, headers={'Cache-Control': 'no-cache'}), timeout=30).read()

config = json.loads(fetch('/api/client-config'))
health = json.loads(fetch('/healthz'))
report = {'checkedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'version': config['version'], 'health': health,
          'sourceCommit': subprocess.check_output(['git', 'rev-parse', args.commit], text=True).strip(), 'assets': []}
assert args.version in ['3.11.815', '3.11.816'], 'Unsupported release contract'
assert config['version'] == args.version, report
paths = ['/db/material-read.js?v=815', '/db/local-db.js?v=815', '/db/db-worker-runtime.js?v=815', '/js/material-open.js?v=815',
         '/js/library-ui.js?v=' + args.version.rsplit('.', 1)[1], '/js/dictionary-ui.js?v=815', '/js/mediatheque-ui.js?v=815', '/js/study-video-source-ui.js?v=815',
         '/js/agent-access.js?v=815', '/sw.js']
for url in paths:
    blob = subprocess.check_output(['git', 'show', args.commit + ':public' + url.split('?')[0]])
    expected = hashlib.sha256(blob).hexdigest()
    served = hashlib.sha256(fetch(url)).hexdigest()
    report['assets'].append({'url': url, 'expected': expected, 'served': served, 'match': expected == served})
report['allAssetsMatch'] = all(item['match'] for item in report['assets'])
report['shells'] = {url: args.version in fetch(url).decode('utf-8') for url in ['/', '/library.html']}
out = pathlib.Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'version': report['version'], 'assetsMatched': sum(item['match'] for item in report['assets']),
                  'assetCount': len(paths), 'shells': report['shells'], 'health': health}))
assert report['allAssetsMatch'] and all(report['shells'].values()) and health['db']['ready'] and health['migrations']['ready']
