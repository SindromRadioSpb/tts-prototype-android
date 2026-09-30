#!/usr/bin/env python3
"""Author deterministic native .px grids. PNGs are built by the unchanged repo builder.
New artwork uses the existing small-palette, integer-grid asset system; no new renderer.
"""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'art/worlds/sukkot'
P={'.':'transparent','o':'#292b32','s':'#5b493e','w':'#8d6449','W':'#bb8a5c','h':'#dfb67a','c':'#e6d7ac','C':'#fff2ce','d':'#354e42','g':'#526b45','G':'#839653','l':'#b0b76d','r':'#c55c48','R':'#ef9364','y':'#e9bd4d','Y':'#f9dc78','b':'#536e7b','B':'#8ba4aa','n':'#3f404b','t':'#847668'}
class Grid:
 def __init__(self,w,h): self.w=w; self.h=h; self.p=[['.']*w for _ in range(h)]
 def dot(self,x,y,c):
  if 0<=x<self.w and 0<=y<self.h: self.p[y][x]=c
 def rect(self,x,y,w,h,c):
  for j in range(y,y+h):
   for i in range(x,x+w): self.dot(i,j,c)
 def line(self,x0,y0,x1,y1,c):
  dx=abs(x1-x0); sx=1 if x0<x1 else -1; dy=-abs(y1-y0); sy=1 if y0<y1 else -1; e=dx+dy
  while True:
   self.dot(x0,y0,c)
   if x0==x1 and y0==y1: break
   e2=2*e
   if e2>=dy: e+=dy; x0+=sx
   if e2<=dx: e+=dx; y0+=sy
 def frame(self,id,anchor=None):
  a=anchor or (self.w//2,self.h-1)
  return f'@frame {id} {self.w}x{self.h} anchor={a[0]},{a[1]}\n'+'\n'.join(''.join(r) for r in self.p)+'\n'
def write(name,frames,palette=P,split=False):
 text='# Native World Engine v2 palette-grid extension: Sukkot, 2026-09-30.\n# All lettering is DOM text. No letters are baked into the art.\n'
 text+='\n'.join(k+' '+v for k,v in palette.items())+'\n'+('@split\n' if split else '')+'\n'
 (OUT/(name+'.px')).write_text(text+'\n'.join(frames),encoding='utf-8')
def wood(g,x,y,w,h):
 g.rect(x,y,w,h,'o'); g.rect(x+1,y+1,w-2,h-2,'w'); g.line(x+1,y+1,x+w-2,y+1,'h')
 for i in range(x+4,x+w-2,7): g.line(i,y+2,i,y+h-2,'s')
def foliage(g,x,y,wide=16):
 for k in range(4):
  g.line(x,y,x+wide,y-4-k*2,'d');g.line(x,y-1,x+wide-2,y-5-k*2,'g')
  g.line(x,y,x-wide+3,y-3-k*2,'G')
def sukkah(stage):
 g=Grid(148,86)
 # Low perspective platform, behind the foreground path.
 g.rect(7,78,136,6,'s');g.rect(7,77,136,2,'h');g.rect(9,79,132,3,'w')
 # Slatted rear wall and short side walls: front remains visibly open.
 for x in range(17,134,8):
  if stage!='construction' or x<76: wood(g,x,28,8,50)
 for x in [10,136]: wood(g,x,19,5,62)
 if stage=='construction':
  wood(g,9,17,133,6);wood(g,38,24,4,57)
  # Unplaced panels and roofing reeds are clearly a story illustration.
  for k in range(4): wood(g,84,70-k*4,44,4)
  foliage(g,70,76,18)
 else:
  wood(g,9,23,133,6)
  # Detached vegetation roof; a few small sky openings, more shade than light.
  for y in range(9,24):
   for x in range(7,143):
    if y<11 and (x*3+y)%17<4: continue
    g.dot(x,y,['d','g','G','g','l'][(x//4+y//2)%5])
  for x in range(8,142,9): g.line(x,11,x-5,23,'d');g.line(x+2,10,x-2,21,'l')
  for x,y in [(35,14),(87,13),(113,18),(60,18)]: g.rect(x,y,2,1,'.')
  g.line(7,24,143,24,'d')
  # Short side-wall panels define the interior without occluding the hero.
  wood(g,10,29,12,49);wood(g,131,29,10,49)
  if stage not in ['plain']:
   for x in range(25,132): g.dot(x,31+(x%34)//13,'s')
   for i,x in enumerate(range(28,129,17)):
    y=34+(i%2)*2;g.rect(x,y,3,4,['y','r','b'][i%3]);g.dot(x+1,y+4,'h')
   for x,y in [(29,40),(122,39)]:
    g.line(x,y-5,x,y,'g');g.rect(x-2,y,5,5,'r');g.rect(x-1,y+1,3,2,'R');g.dot(x,y-1,'y')
  if stage=='reading':
   wood(g,111,44,18,33)
   for yy in [48,61]:
    for i,xx in enumerate(range(113,128,3)): g.rect(xx,yy,2,10,['b','r','g','y','c'][i%5]);g.dot(xx,yy+2,'h')
   g.line(112,60,128,60,'h')
 return g
def preparation():
 g=Grid(116,66)
 for k in range(5): wood(g,19+k%2*4,59-k*5,69,5)
 # Tied rolls of reed roofing, gardening pail and plant.
 for j in range(3):
  g.rect(61+j*10,19,9,24,'d');g.rect(62+j*10,20,7,22,'G');g.line(65+j*10,20,65+j*10,42,'l');g.line(62+j*10,31,68+j*10,31,'s')
 g.rect(5,48,12,13,'o');g.rect(6,49,10,10,'b');g.rect(8,44,6,2,'h');g.line(7,46,7,50,'s');g.line(15,46,15,50,'s')
 foliage(g,100,49,12);g.rect(96,49,10,12,'w');g.rect(95,48,12,3,'h')
 return g
def table(kind):
 g=Grid(66,33);wood(g,4,13,58,5);wood(g,9,18,4,14);wood(g,53,18,4,14)
 g.rect(8,12,50,5,'c');g.line(8,12,57,12,'C');g.rect(11,17,5,5,'c');g.rect(52,17,4,5,'c')
 if kind=='feast':
  # Bread, fruit bowl and small cups. Everyday festive still life, no ritual action.
  g.rect(24,8,15,4,'s');g.rect(23,7,16,3,'h');g.rect(26,6,10,2,'y')
  for x in [27,32,37]:g.dot(x,8,'C')
  g.rect(44,9,12,3,'b');g.rect(45,7,4,3,'r');g.rect(50,7,4,3,'y');g.dot(48,6,'g')
  for x in [14,58]:g.rect(x,7,3,5,'C');g.dot(x,7,'b')
 else:
  # Open book and a closed volume; page marks are abstract, never Hebrew glyphs.
  g.rect(20,6,26,6,'s');g.rect(21,5,11,6,'C');g.rect(33,5,11,6,'c');g.line(32,6,32,11,'w')
  for y in [7,9]:g.line(23,y,29,y,'B');g.line(35,y,41,y,'B')
  g.rect(48,8,9,3,'r');g.line(49,9,55,9,'c')
 return g
def species():
 g=Grid(32,48)
 # One tall closed palm spine; not a broad open roofing frond.
 g.line(15,3,15,38,'d');g.line(16,2,16,38,'l');g.line(17,7,17,35,'G')
 # Three myrtle sprigs: small, round/oval grouped leaves.
 for x in [7,10,13]:
  g.line(x,17,x+2,38,'g')
  for y in [18,23,28]:g.rect(x-1,y,2,2,'G');g.rect(x+2,y+1,2,2,'l');g.dot(x+1,y-1,'G')
 # Two willow sprigs: longer, narrow alternate leaves.
 for x in [21,25]:
  g.line(x,15,x-3,39,'g')
  for y in [16,22,28]:g.line(x-3,y,x,y+1,'G');g.line(x,y+3,x+3,y+1,'l')
 g.rect(12,33,9,2,'w');g.rect(13,39,6,2,'w')
 # Separate knobbly yellow citron on cloth, visibly apart from bound branches.
 g.rect(1,44,29,3,'c');g.rect(3,39,9,5,'y');g.rect(4,38,7,7,'y');g.rect(5,39,5,3,'Y');g.dot(4,43,'h');g.dot(9,42,'h');g.dot(8,37,'w');g.dot(6,44,'h')
 return g
def screen():
 g=Grid(51,55);wood(g,7,45,4,9);wood(g,39,45,4,9)
 g.rect(2,5,47,37,'o');g.rect(4,7,43,31,'b');g.rect(6,9,39,27,'B');g.rect(6,9,39,13,'b')
 # An abstract quiet landscape on the screen, without people or text.
 g.rect(32,12,5,5,'y');g.rect(31,13,7,3,'Y')
 for x in range(6,45):
  peak=20+abs(x-19)//4;g.line(x,peak,x,35,'d')
  peak=25+abs(x-35)//5;g.line(x,peak,x,35,'g')
 g.line(6,34,44,34,'l');g.rect(24,40,3,2,'y');g.rect(1,43,49,3,'s')
 return g
def chair():
 g=Grid(23,33)
 wood(g,4,3,3,28);wood(g,17,3,3,28)
 for y in [4,10]:wood(g,5,y,13,4)
 wood(g,2,19,20,4);wood(g,2,23,3,9);wood(g,19,23,3,9)
 return g
def icon(kind):
 g=Grid(12,12)
 if kind=='prep':wood(g,1,7,10,3);wood(g,3,3,7,3)
 elif kind=='build':g.rect(2,2,2,9,'h');g.rect(8,2,2,9,'h');g.rect(1,1,10,2,'w')
 elif kind=='decorate':g.line(0,3,11,3,'h');g.rect(2,4,3,4,'r');g.rect(7,4,3,4,'y')
 else:
  g.rect(1,4,10,3,'c');g.rect(2,7,2,4,'w');g.rect(8,7,2,4,'w');g.rect(4,2,4,2,'y')
 return g
def street():
 g=Grid(320,30)
 for y in range(18,30):g.rect(0,y,320,1,'s' if y==18 else 'w')
 for y in [20,26]:
  for x in range(-10+(y%4)*4,320,28):g.line(x,y,x+24,y,'h');g.line(x+24,y,x+24,y+5,'s')
 # Small restrained herbs at the courtyard's edges. No overhead trees or awnings.
 for x in [13,286]:
  g.rect(x,9,10,9,'s');g.rect(x-1,8,12,3,'h')
  for i in range(4):g.line(x+4,8,x-2+i*3,2+(i%2)*2,'g');g.dot(x-2+i*3,1+(i%2)*2,'G')
 return g
frames=[]
for stage in ['construction','plain','decorated','welcome','reading','cinema']:frames.append(sukkah(stage).frame(stage,(74,83)))
# Identical geometry across lighting palettes; only colour grading changes.
def graded(p,mode):
 if mode=='day':return p
 out={}
 for k,v in p.items():
  if v=='transparent':out[k]=v;continue
  c=[int(v[i:i+2],16) for i in (1,3,5)]
  factors=(.86,.76,.76) if mode=='dusk' else (.45,.51,.66)
  c=[round(a*b) for a,b in zip(c,factors)]
  if mode=='night' and k in ['Y','y','C']: c=[int(v[i:i+2],16) for i in (1,3,5)]
  out[k]='#'+''.join(f'{a:02x}' for a in c)
 return out
for mode in ['day','dusk','night']:
 write('sukkah-'+mode,frames,graded(P,mode));write('courtyard-'+mode,[street().frame('strip',(160,29))],graded(P,mode))
write('festival-props',[preparation().frame('preparation',(58,64)),table('feast').frame('feast',(33,32)),table('books').frame('books',(33,32)),species().frame('four-species',(16,47)),screen().frame('screen',(25,54)),chair().frame('chair',(11,32))])
write('festival-icons',[icon(k).frame(k,(6,11)) for k in ['prep','build','decorate','welcome']],split=True)
