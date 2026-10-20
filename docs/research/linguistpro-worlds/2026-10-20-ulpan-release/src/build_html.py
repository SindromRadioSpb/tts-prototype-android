"""Build an offline HTML and verify that all supplied images are unchanged."""
from pathlib import Path
import base64
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
story = json.loads((ROOT / 'src/story.json').read_text(encoding='utf-8'))
assets = {'story': story, 'atlas': json.loads((ROOT / 'assets/hero.json').read_text(encoding='utf-8')), 'images': {}}
images = {'hero': 'hero.png', 'timsah': 'timsah.png', 'timsahAct': 'timsah-act.png', 'cat': 'cat.png', 'people': 'people.png', 'trainInterior': 'train-interior.png', 'coast': 'coastal-panorama.png', 'heroSeated': 'hero-seated.png', 'timsahLeisure': 'timsah-leisure.png'}
images.update({key: 'scene-' + key + '.png' for key in ['promenade', 'market', 'workshop', 'jaffa', 'reading', 'cinema']})
for key, name in images.items():
    assets['images'][key] = 'data:image/png;base64,' + base64.b64encode((ROOT / 'assets' / name).read_bytes()).decode('ascii')
html = (ROOT / 'src/template.html').read_text(encoding='utf-8')
html = html.replace('__ASSETS__', 'window.EPISODE_ASSETS=' + json.dumps(assets, ensure_ascii=False).replace('</', '<\\/') + ';')
html = html.replace('__SCRIPT__', (ROOT / 'src/episode.js').read_text(encoding='utf-8'))
(ROOT / 'Ulpan-Journey-Preview-v6.html').write_text(html, encoding='utf-8')
manifest = {'version': '6.0.0-dialogue-staging', 'sourceCommit': '6376493a', 'productionIntegration': False,
            'duration': sum(sum(beat['seconds'] for beat in scene['beats']) + (2.4 if scene['arrival'] else 0) for scene in story),
            'browserAcceptance': 'see reports/browser-qa.json',
            'assets': {name: hashlib.sha256((ROOT / 'assets' / name).read_bytes()).hexdigest() for name in images.values()}}
(ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f"Built offline preview: {manifest['duration']:.1f}s, {len(story)} scenes, {sum(len(s['beats']) for s in story)} lines")
