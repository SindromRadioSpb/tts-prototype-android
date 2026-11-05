"""Build the native pack and app-owned renderer over the saved origin/main snapshot.
This does not deploy or write Git metadata. Run from the repository root.
"""
from pathlib import Path
import copy
import hashlib
import json
import shutil
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
TARGET = REPO / '.tmp/ulpan-integration'
WORLD = 'ulpan-journey'
PACK = TARGET / 'public/worlds' / WORLD
PACK.mkdir(parents=True, exist_ok=True)
BASE = '56c5b4de'
for relative in ['server.js','public/js/world-engine.js','public/css/world-skin.css','public/js/world-activity.js','public/js/world-boot.js','public/sw.js','public/index.html','public/library.html','public/mediatheque.html']:
    raw = subprocess.run(['git','show',BASE + ':' + relative],cwd=REPO,check=True,capture_output=True).stdout
    (TARGET / relative).write_bytes(raw)

def read(path): return json.loads(path.read_text(encoding='utf-8'))
def write(path, data): path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
story = read(ROOT / 'src/story.json')
translations = read(ROOT / 'src/dialogues-i18n.json')
assert all(len(translations[lang]) == sum(len(s['beats']) for s in story) for lang in ['en', 'he'])
i = 0
for scene in story:
    for beat in scene['beats']:
        beat['text'] = {'ru': beat['text'], 'en': translations['en'][i], 'he': translations['he'][i]}
        i += 1
base = read(TARGET / 'public/worlds/israel-elections-2026/manifest.json')
source_atlas = read(TARGET / 'public/worlds/israel-elections-2026/atlas.json')
atlas = {'schema': 'lp-world-atlas/1', 'world': WORLD, 'atlases': {}}
hero = read(ROOT / 'assets/hero.json')
for image in (ROOT / 'assets').glob('*.png'):
    shutil.copyfile(image, PACK / image.name)
    width, height = struct.unpack('>II', image.read_bytes()[16:24])
    key = image.stem
    if key in source_atlas['atlases']:
        entry = copy.deepcopy(source_atlas['atlases'][key])
    else:
        entry = {'file': image.name, 'width': width, 'height': height, 'frames': {'still': {'x': 0, 'y': 0, 'w': width, 'h': height, 'anchor': [0, 0]}}}
    if key == 'hero':
        entry['frames'].update({clip + '-' + str(n): dict(frame, anchor=[48, 90]) for clip, frames in hero['clips'].items() for n, frame in enumerate(frames)})
    entry['bytes'] = image.stat().st_size
    entry['sha256'] = hashlib.sha256(image.read_bytes()).hexdigest()
    atlas['atlases'][key] = entry
for key in ['ui-bubble', 'ui-tail', 'ui-here']:
    entry = copy.deepcopy(source_atlas['atlases'][key]); atlas['atlases'][key] = entry
    shutil.copyfile(TARGET / 'public/worlds/israel-elections-2026' / entry['file'], PACK / entry['file'])
loc_en = ['Tel Aviv promenade', 'Tel Aviv market', 'Workshop', 'Jaffa viewpoint', 'Train to Haifa', 'First ulpan', 'Cinema courtyard']
loc_he = ['טיילת תל אביב', 'שוק בתל אביב', 'בית המלאכה', 'תצפית ביפו', 'רכבת לחיפה', 'האולפן הראשון', 'חצר הקולנוע']
symbols = ['🌊', '🍅', '🔧', '🗺', '🚆', '📖', '🎬']
manifest = {key: copy.deepcopy(base[key]) for key in ['schema', 'engine', 'skin']}
manifest.update(id=WORLD, version='1.0.0', kind='story', names={'ru':'Человек-Паук: в поисках первого Ульпана','en':'Spider-Man: finding the first ulpan','he':'ספיידרמן: בדרך לאולפן הראשון'},
 blurb={'ru':'Тимсах и Человек-паук ищут ульпан. Нажмите на персонажей, чтобы поговорить.','en':'Timsah and Spider-Man look for an ulpan. Tap the characters to talk.','he':'תמסח וספיידרמן מחפשים אולפן. לחצו על הדמויות כדי לדבר.'},
 scenery={'sceneHeight':228,'groundY':0,'lighting':{light:{'sky':['#173b47','#173b47'],'actorTint':'#ffffff'} for light in ['day','dusk','night']},'layers':[]},
 actors={key:{'sheet':key,'fictional':True} for key in atlas['atlases']},
 ui={'bubbleFrame':'ui-bubble','bubbleTail':'ui-tail'}, here='ui-here',
 slots={slot:{'origin':.5,'rest':[]} for slot in ['studio-stage','room-stage','media-stage']},
 surfaces={surface:{'slot':slot,'location':'promenade','route':[scene['id'] for scene in story]} for surface, slot in [('studio','studio-stage'),('room','room-stage'),('mediatheque','media-stage')]},
 locations={scene['id']:{'x':index*1000,'symbol':symbols[index],'names':{'ru':scene['city'],'en':loc_en[index],'he':loc_he[index]}} for index, scene in enumerate(story)},
 scenes=[], ulpan={'story':story,'heroClips':hero['clips']})
write(PACK / 'manifest.json', manifest); write(PACK / 'atlas.json', atlas)
if (PACK / 'ATTRIBUTION.md').exists(): (PACK / 'ATTRIBUTION.md').unlink()

source = (ROOT / 'src/episode.js').read_text(encoding='utf-8')
painter = source[source.index('  function shadow('):source.index('  function paint(')]
# Infinite calm background movement without rewinding visible pedestrians at a loop boundary.
painter = painter.replace("const p = reduced ? .65 : ease((s.local - 3) / 17);", "const p = reduced ? .65 : (1 - Math.cos(s.local * Math.PI / 22)) / 2;")
painter = painter.replace("const travel = reduced ? 1 : ease((s.local - 5) / 10);", "const travel = reduced ? 1 : (1 - Math.cos(s.local * Math.PI / 18)) / 2;")
painter = painter.replace("const walking = !reduced && s.local > 5 && s.local < 15;", "const walking = !reduced && Math.abs(Math.sin(s.local * Math.PI / 18)) > .12;")
painter = painter.replace("side === 'right');", "side === 'right' !== (!reduced && Math.sin(s.local * Math.PI / 18) < 0));")
painter = painter.replace("const movement = reduced ? 3 : s.local <= 22 ? s.local : 22 + 3 * ease((s.local - 22) / 7);", "const movement = reduced ? 3 : s.local % 120;")
painter = painter.replace("const offset = t * speed;", "const offset = (t * speed) % 1280;")
head = (ROOT / 'src/ulpan-world-head.js').read_text(encoding='utf-8')
tail = (ROOT / 'src/ulpan-world-tail.js').read_text(encoding='utf-8')
(TARGET / 'public/js/ulpan-world.js').write_text(head + painter + tail, encoding='utf-8')

# Narrow native engine hooks. Existing worlds keep their original path.
engine_path = TARGET / 'public/js/world-engine.js'
engine = engine_path.read_text(encoding='utf-8')
if '"ulpan-journey":' not in engine:
    engine = engine.replace('var REGISTRY = {', '''var REGISTRY = {
    "ulpan-journey": { base: "/worlds/ulpan-journey/", pack: "1.0.0", retired: false, category: "israel",
      names: { ru: "Человек-Паук: в поисках первого Ульпана", en: "Spider-Man: finding the first ulpan", he: "ספיידרמן: בדרך לאולפן הראשון" },
      note: { ru: "Нажмите на героев, чтобы поговорить. Семь локаций от Тель-Авива до Хайфы.", en: "Tap the characters to talk. Seven stops from Tel Aviv to Haifa.", he: "לחצו על הדמויות כדי לדבר. שבע תחנות מתל אביב לחיפה." },
      routeLabel: { ru: "В поисках первого ульпана", en: "Finding the first ulpan", he: "בדרך לאולפן הראשון" },
      greeting: "שלום", previewLocation: "promenade" },''')
    engine = engine.replace('  function onStageTap(e) {', '''  function activateActor(id) {
    var st = state.stage;
    if (!st || !st.renderer.dialogue) return;
    var reply = st.renderer.dialogue(id, locale());
    if (!reply) return;
    endScene();
    state.react = { start: now(), durationMs: Math.max(6000, Math.min(14000, reply.length * 65)) };
    showBubble(reply);
    if (!animating()) drawOnce(); else kick();
  }
  function onStageTap(e) {''')
    engine = engine.replace('    var lx = (e.clientX - r.left)', '''    if (st.renderer.hitTest) { var actor = st.renderer.hitTest(e.clientX-r.left, e.clientY-r.top); if (actor) activateActor(actor); return; }
    var lx = (e.clientX - r.left)''')
    engine = engine.replace('t - state.react.start > 3200', 't - state.react.start > (state.react.durationMs || 3200)')
    engine = engine.replace('    b.setAttribute("aria-hidden", "true");', '''    if (state.stage.renderer.dialogue) { b.setAttribute("role", "status"); b.setAttribute("aria-live", "polite"); }
    else b.setAttribute("aria-hidden", "true");''')
    engine = engine.replace('    if (reducedMotion()) b.textContent = text;', '    if (reducedMotion() || state.stage.renderer.dialogue) b.textContent = text;')
    engine = engine.replace('    var sc = st.scale, cam = st.renderer.camera();', '''    if (st.renderer.bubbleAnchor) {
      var a = st.renderer.bubbleAnchor();
      b.style.whiteSpace = "normal"; b.style.maxWidth = Math.min(360, st.el.clientWidth - 16) + "px";
      var bx = Math.max(8, Math.min(st.el.clientWidth - b.offsetWidth - 8, a.x - b.offsetWidth / 2));
      b.style.left = bx + "px"; b.style.transform = "none";
      b.style.bottom = Math.min(st.el.clientHeight - b.offsetHeight - 8, a.bottom + 8) + "px";
      b.style.setProperty("--lpw-tail", Math.max(8, Math.min(b.offsetWidth - 20, a.x - bx)) + "px");
      return;
    }
    var sc = st.scale, cam = st.renderer.camera();''')
    engine = engine.replace('seed: 26 });', 'seed: 26, onActor: activateActor });')
    engine = engine.replace('if (state.stage && state.stage.sign) state.stage.sign.dataset.loc = ""; });', 'if (state.stage && state.stage.sign) state.stage.sign.dataset.loc = ""; drawOnce(); });')
    engine = engine.replace('      if (L0.icon &&', '''      if (L0.symbol) { var symbol = document.createElement("span"); symbol.className = "lp-world-stop-icon"; symbol.textContent = L0.symbol; symbol.setAttribute("aria-hidden", "true"); b.appendChild(symbol); }
      if (L0.icon &&''')
    engine = engine.replace('      if (!localized(L.names)) err("location " + id + " names");', '''      if (!localized(L.names)) err("location " + id + " names");
      if (L.symbol && (!isPlainText(L.symbol) || L.symbol.length > 8)) err("location " + id + " symbol");''')
    engine = engine.replace('    if (id !== "memorial-three-scenes"', '''    if (id === "ulpan-journey") return ensureUlpanRenderer();
    if (id !== "memorial-three-scenes"''')
    engine = engine.replace('  var memorialLoading = null;', '''  var ulpanLoading = null;
  function ensureUlpanRenderer() {
    if (window.LPUlpanWorld) return Promise.resolve();
    if (!ulpanLoading) ulpanLoading = new Promise(function(resolve, reject) {
      var s = document.createElement("script"); s.src = "/js/ulpan-world.js?v=ulpan1";
      s.onload = function() { if (window.LPUlpanWorld) resolve(); else { ulpanLoading=null; reject(new Error("ulpan renderer missing")); } };
      s.onerror = function() { ulpanLoading=null; reject(new Error("ulpan renderer failed")); }; document.head.appendChild(s);
    });
    return ulpanLoading;
  }
  var memorialLoading = null;''')
    engine = engine.replace('      while (m.el.firstChild)', '      if (m.renderer && m.renderer.destroy) m.renderer.destroy();\n      while (m.el.firstChild)')
    # Header/scenery code changed: keep shell, SW and lazy module URL pins coherent locally.
    engine = engine.replace('/css/world-skin.css?v=715', '/css/world-skin.css?v=ulpan1')
    engine_path.write_text(engine, encoding='utf-8')
css_path = TARGET / 'public/css/world-skin.css'
css = css_path.read_text(encoding='utf-8')
extra = (ROOT / 'src/ulpan-world.css').read_text(encoding='utf-8')
if '/* Ulpan journey native stage */' not in css: css_path.write_text(css + '\n' + extra, encoding='utf-8')
activity_path = TARGET / 'public/js/world-activity.js'
activity = activity_path.read_text(encoding='utf-8')
if 'LPUlpanWorld?.setActivity' not in activity:
    activity = activity.replace('window.LPMemorialAdapter?.setActivity({ reading, audio: sources.size > 0 || speechOrRow });', 'window.LPMemorialAdapter?.setActivity({ reading, audio: sources.size > 0 || speechOrRow });\n    window.LPUlpanWorld?.setActivity({ reading, audio: sources.size > 0 || speechOrRow });')
    activity_path.write_text(activity, encoding='utf-8')
for name in ['js/world-boot.js','sw.js','index.html','library.html','mediatheque.html']:
    path = TARGET / 'public' / name
    text = path.read_text(encoding='utf-8').replace('/js/world-engine.js?v=736','/js/world-engine.js?v=ulpan1').replace('/css/world-skin.css?v=715','/css/world-skin.css?v=ulpan1').replace('/js/world-activity.js?v=749','/js/world-activity.js?v=ulpan1')
    if name == 'sw.js' and '"/js/ulpan-world.js?v=ulpan1"' not in text: text = text.replace('  "/js/world-engine.js?v=ulpan1",', '  "/js/ulpan-world.js?v=ulpan1",\n  "/js/world-engine.js?v=ulpan1",')
    path.write_text(text, encoding='utf-8')
server_path = TARGET / 'server.js'
server_text = server_path.read_text(encoding='utf-8').replace('/js/world-engine.js?v=736','/js/world-engine.js?v=ulpan1').replace('/css/world-skin.css?v=715','/css/world-skin.css?v=ulpan1').replace('/js/world-activity.js?v=749','/js/world-activity.js?v=ulpan1')
server_text = server_text.replace('  "/js/world-engine.js?v=ulpan1",','  "/js/ulpan-world.js?v=ulpan1",\n  "/js/world-engine.js?v=ulpan1",')
server_path.write_text(server_text, encoding='utf-8')
shutil.copyfile(ROOT / 'src/ulpanWorld.test.cjs', TARGET / 'tests/ulpanWorld.test.cjs')
print('Built native Ulpan pack and integration over saved origin/main. No deployment.')
