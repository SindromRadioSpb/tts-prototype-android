"""Verify immutable source and package the bounded candidate plus audit evidence."""
import collections,hashlib,html,json,subprocess,zipfile
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
SRC=ROOT/'Архив/atlas97001-audit-2026-11-06/atlas97001-source-audit'
OUT=ROOT/'Архив/atlas97001-audit-results-2026-11-06.zip'
load=lambda p:json.loads(p.read_text(encoding='utf8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
initial=load(HERE/'input-verification.json')
assert len(initial['files'])==45
for f in initial['files']:
 p=SRC/f['file'];assert p.stat().st_size==f['bytes'] and sha(p)==f['sha256'],str(p)
ledger=load(HERE/'observation-ledger.json');assert ledger['counts']=={'reviewed':346}
ops=load(ROOT/'scripts/atlas/corrections/a97001.json')['structure']
runtime=ROOT/'data/atlas/a97001'
sections={p.name:sha(p) for p in (runtime/'sections').glob('*.json')}
search=load(runtime/'search.json');find=load(runtime/'train/find.json')
for target in [search,find]:
 hashes=target.get('sections_sha256',target.get('built_from',{}).get('sections',{}))
 assert hashes,'missing section hashes'
 for sid,digest in hashes.items():assert sections[sid+'.json']==digest,(sid,digest)
manifest={'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
 'release_status':'see release-verification.json for actual publication outcome','candidate_version':'3.11.864',
 'archive_sha256':initial['archive_sha256'],'source_files_reverified':45,
 'sections':sections,'observations':ledger['verdict_counts'],
 'open_ids':[r['id'] for r in ledger['observations'] if r['check_result'] in ['source_limit_disclosed_release_waived','source_reading_open','local_fix_source_limit_open']],
 'corrected_objects':len({(o['page'],o.get('collection','items'),o.get('id',str(o.get('ids')))) for o in ops if o.get('audit_ids')}),
 'runtime_files':{str(p.relative_to(runtime)).replace('\\','/'):sha(p) for folder in ['sections','train'] for p in (runtime/folder).glob('*.json')}}
for p in runtime.glob('*.json'):manifest['runtime_files'][p.name]=sha(p)
manifest_text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
(ROOT/'.tmp/atlas97001-source-review/candidate-manifest.json').write_text(manifest_text,encoding='utf8')
e=html.escape;rows=[]
for r in ledger['observations']:
 obs=r['input_observation'];details=obs.get('detail',obs.get('description',obs.get('summary',obs.get('title',''))))
 rows.append('<tr>'+''.join('<td>'+e(str(v))+'</td>' for v in [r['id'],r.get('page') or r.get('pages'),r['verdict'],details,r['action'],r['check_result']])+'</tr>')
htmltext='<!doctype html><meta charset="utf-8"><title>Atlas 97001 — registry</title><style>body{font:15px system-ui;margin:24px}td,th{border:1px solid #ccc;padding:8px;vertical-align:top}table{border-collapse:collapse}td:first-child{white-space:nowrap}</style><h1>Atlas 97001: 346 observations</h1><p>Authorized partial release; exact publication status is in release-verification.json. Full coordinates, targets and checks: observation-ledger.json. Counts: '+e(str(ledger['verdict_counts']))+'</p><table><tr><th>ID<th>Page<th>Verdict<th>Observation<th>Action / limits<th>Check</tr>'+''.join(rows)+'</table>'
(HERE/'registry.html').write_text(htmltext,encoding='utf8')
with zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in HERE.iterdir():
  if p.is_file():z.write(p,'report/'+p.name)
 z.write(ROOT/'scripts/atlas/corrections/a97001.json','corrections/a97001.json')
 z.write(ROOT/'public/css/atlas-reader.css','code/public/css/atlas-reader.css')
 z.write(ROOT/'public/js/library-ui.js','code/public/js/library-ui.js')
 z.writestr('candidate-manifest.json',manifest_text)
 for rel in manifest['runtime_files']:z.write(runtime/rel,'candidate-data/'+rel)
 for p in (ROOT/'.tmp/atlas97001-source-review').glob('*.log'):z.write(p,'checks/'+p.name)
 for p in (ROOT/'.tmp/atlas97001-source-review').glob('*.json'):z.write(p,'checks/'+p.name)
 for p in (ROOT/'.tmp/atlas97001-source-review/browser').glob('*'):
  if p.is_file():z.write(p,'browser/'+p.name)
 for p in (ROOT/'.tmp/atlas97001-source-review').glob('*crops-*.png'):z.write(p,'source-crops/'+p.name)
 for p in (ROOT/'.tmp/atlas97001-source-review').glob('SUP-figures-*.png'):z.write(p,'source-crops/'+p.name)
with zipfile.ZipFile(OUT) as z:assert z.testzip() is None;count=len(z.infolist())
print(json.dumps({'path':str(OUT),'bytes':OUT.stat().st_size,'sha256':sha(OUT),'entries':count,'source_files_reverified':45},ensure_ascii=False))
