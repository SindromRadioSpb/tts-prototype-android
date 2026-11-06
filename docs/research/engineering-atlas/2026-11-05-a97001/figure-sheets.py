"""Readable contact sheets of source figures, with stable IDs, for caption authoring."""
import json
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT/'data/atlas/a97001'
src = DATA/'supplier/source-pack'
figs = [json.loads(s) for s in (src/'pages.jsonl').read_text(encoding='utf-8').splitlines() if s.strip()]
figs = [f for f in figs if f['type']=='figure']
out=DATA/'review/figures'
out.mkdir(parents=True,exist_ok=True)
for start in range(0,len(figs),9):
    sheet=Image.new('RGB',(1500,1800),'#e2e8f0')
    draw=ImageDraw.Draw(sheet)
    for k, f in enumerate(figs[start:start+9]):
        x=(k%3)*500; y=(k//3)*600
        im=Image.open(src/f['crop']).convert('RGB')
        im.thumbnail((480,560))
        sheet.paste(im,(x+(500-im.width)//2,y+32))
        draw.text((x+10,y+8),f['id']+'   '+str(start+k+1),fill='black')
    sheet.save(out/f'{start+1:03}-{min(start+9,len(figs)):03}.jpg',quality=92)
print(len(figs),'figures;',len(list(out.glob('*.jpg'))),'sheets')
