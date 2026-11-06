"""Render actual PDF pixels at source-fragment coordinates; extraction is only a locator."""
import io,json
from pathlib import Path
import fitz
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[4]
SRC=ROOT/'Архив/atlas97001-audit-2026-11-06/atlas97001-source-audit'
OUT=ROOT/'.tmp/atlas97001-source-review'
load=lambda p:json.loads(p.read_text(encoding='utf-8'))
registry=load(SRC/'full_audit_registry.json')
units={u['source_unit_id']:u for u in registry['units'] if u['layer']=='HE_text'}
ledger=load(Path(__file__).parent/'observation-ledger.json')
doc=fitz.open(SRC/'original97001.pdf')
crops=[];missing=[]
for row in ledger['observations']:
 if row['review_status']!='pending' or not row['id'].startswith('HE-'):continue
 o=row['input_observation'];boxes=[units[i]['source_bbox'] for i in o.get('source_fragment_ids',[]) if i in units and units[i].get('source_bbox')]
 if not boxes:missing.append(row['id']);continue
 rect=fitz.Rect(min(b[0] for b in boxes)-7,min(b[1] for b in boxes)-7,max(b[2] for b in boxes)+7,max(b[3] for b in boxes)+7)
 rect.x0=max(0,rect.x0);rect.x1=min(doc[o['page']-1].rect.width,rect.x1)
 pix=doc[o['page']-1].get_pixmap(matrix=fitz.Matrix(2.5,2.5),clip=rect)
 image=Image.open(io.BytesIO(pix.tobytes('png')))
 image.thumbnail((920,240))
 crops.append((row['id'],o['page'],image))
for start in range(0,len(crops),8):
 sheet=Image.new('RGB',(1900,1120),'#eee')
 draw=ImageDraw.Draw(sheet)
 for j,(oid,page,img) in enumerate(crops[start:start+8]):
  x=(j%2)*950;y=(j//2)*280
  draw.text((x+10,y+5),f'{oid} | source PDF p{page}',fill='black')
  sheet.paste(img,(x+10,y+30))
 sheet.save(OUT/f'HE-crops-{start//8+1:02d}.png')
print('sheets', (len(crops)+7)//8, 'crops',len(crops),'full-page review required',missing)
