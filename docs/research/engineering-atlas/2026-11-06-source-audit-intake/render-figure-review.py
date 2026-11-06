"""Render pending figure observations from actual source page coordinates."""
import io,json,re
from pathlib import Path
import fitz
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[4];HERE=Path(__file__).resolve().parent
SRC=ROOT/'Архив/atlas97001-audit-2026-11-06/atlas97001-source-audit';OUT=ROOT/'.tmp/atlas97001-source-review'
load=lambda p:json.loads(p.read_text(encoding='utf-8'))
pages={p['page']:p for p in load(SRC/'publication_snapshot.json')}
doc=fitz.open(SRC/'original97001.pdf');crops=[]
for row in load(HERE/'observation-ledger.json')['observations']:
 if row['review_status']!='pending':continue
 o=row['input_observation'];target=o.get('target',o.get('published_field',o.get('published_path','')))
 if not isinstance(target,str):continue
 m=re.search(r'figures\[(\d+)\]',target)
 if not m or not o.get('page'):continue
 page=o['page'];figure=pages[page]['figures'][int(m[1])];r=fitz.Rect(figure['bbox'])
 r.x0-=5;r.y0-=5;r.x1+=5;r.y1+=5
 pix=doc[page-1].get_pixmap(matrix=fitz.Matrix(3,3),clip=r)
 im=Image.open(io.BytesIO(pix.tobytes('png')));im.thumbnail((900,300))
 crops.append((o['id'],page,im))
for start in range(0,len(crops),6):
 sheet=Image.new('RGB',(1840,1050),'#eee');draw=ImageDraw.Draw(sheet)
 for j,(oid,page,im) in enumerate(crops[start:start+6]):
  x=j%2*920;y=j//2*350;draw.text((x+5,y+5),f'{oid} | PDF p{page}',fill='black');sheet.paste(im,(x+5,y+30))
 sheet.save(OUT/f'figure-review-{start//6+1:02d}.png')
print('figure observations',len(crops),'sheets',(len(crops)+5)//6)
