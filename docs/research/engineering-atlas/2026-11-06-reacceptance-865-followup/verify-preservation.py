"""Compare source pages to the exact archived runtime published as 3.11.865."""
import hashlib,json,tarfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];QA=ROOT/'.tmp/atlas97001-source-review';HERE=Path(__file__).parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def omit_refs(x):
 if isinstance(x,dict):return {k:omit_refs(v) for k,v in x.items() if k not in ['terms','title_terms']}
 if isinstance(x,list):return [omit_refs(v) for v in x]
 return x
rows=[]
with tarfile.open(QA/'release-data-865.tgz') as tar:
 baseline_bank=json.load(tar.extractfile('train/terms.json'))
 for member in tar.getmembers():
  if not member.name.startswith('sections/'):continue
  before=json.load(tar.extractfile(member));file=ROOT/'data/atlas/a97001'/member.name;after=json.loads(file.read_text(encoding='utf-8'))
  assert omit_refs(before['pages'])==omit_refs(after['pages']),member.name
  rows.append({'section':after['id'],'pages':len(after['pages']),'all_page_fields_unchanged_except_term_refs':True,'sha256':sha(file.read_bytes())})
bank=json.loads((ROOT/'data/atlas/a97001/train/terms.json').read_text(encoding='utf-8'))
assert set(baseline_bank['terms']).issubset(bank['terms']),'Old global learner keys were removed'
source_zip=Path(r'C:\Users\lletp\attachments\05290c8e-df6f-4c1e-9e6d-aaac936b0e24\atlas97001-source-audit-2026-11-06.zip')
assert sha(source_zip.read_bytes())=='911ea445d3957752f8af5c59a6a28d722883c797a13efb42a2100c64836d5e6c'
pdf=next((ROOT/'Архив/atlas97001-audit-2026-11-06').rglob('original97001.pdf'))
with zipfile.ZipFile(source_zip) as z:
 name=next(n for n in z.namelist() if n.endswith('original97001.pdf'))
 assert z.read(name)==pdf.read_bytes(),'Original PDF changed'
report={'base_commit':'82328f3327a0fd80be539b8efd03969170d96ad6','baseline_archive_sha256':sha((QA/'release-data-865.tgz').read_bytes()),'sections':rows,'pages':sum(r['pages'] for r in rows),'source_text_and_notes_preserved':True,'source_limits_open':20,'old_global_cards_retained':len(baseline_bank['terms']),'new_global_cards':len(bank['terms']),'original_pdf_sha256':sha(pdf.read_bytes()),'original_pdf_matches_initial_zip':True}
(HERE/'source-preservation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({k:v for k,v in report.items() if k!='sections'}))
