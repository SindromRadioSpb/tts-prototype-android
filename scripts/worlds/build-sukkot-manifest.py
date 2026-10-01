#!/usr/bin/env python3
"""Build the additive Sukkot data pack; original Elections content is read-only."""
import json,copy
from pathlib import Path
R=Path(__file__).resolve().parents[2]
def read(p):return json.loads((R/p).read_text(encoding="utf-8"))
e=read('public/worlds/israel-elections-2026/manifest.json')
copytext=read('docs/planning/linguistpro-worlds/sukkot-scene-copy.json')
labels={x['id']:x for x in copytext['labels']};q={x['id']:x for x in copytext['quips']}
def L(ru,en,he):return dict(ru=ru,en=en,he=he)
def localized(x):return {k:x[k] for k in ['ru','en','he']}
def sign(id,x=-54):
 a=labels[id];latin={'courtyard':'khatser','building':'bonim sukkah','decorations':'kishutim','welcome':"brukhim ha-ba'im",'reading':"pinat kri'a",'evening':'erev ba-sukkah'};return dict(he=a['he'],translit=latin[id],gloss=localized(a),x=x)
m=dict(schema='lp-world/2',id='sukkot',version='0.1.1',engine=dict(min=2,max=2),kind='seasonal',names=L('Мир Суккота','Sukkot World','עולם סוכות'),blurb=L('Уютный дворик: строим и украшаем сукку, встречаем друзей. Художественная сценка, не руководство по обрядам.','A cozy courtyard: build and decorate a sukkah, welcome friends. An illustrated story, not a ritual guide.','חצר נעימה: בונים ומקשטים סוכה ומקבלים חברים. סיפור מאויר, לא מדריך הלכתי.'))
m['skin']=copy.deepcopy(e['skin'])
m['skin']['light'].update(surface='#fff9e9',surfaceSoft='#f2e5c8',ink='#27372f',line='#27372f',accent='#446149',accentInk='#ffffff',plate='#253c36',plateInk='#fff3d5')
m['skin']['dark'].update(surface='#24362f',surfaceSoft='#304238',ink='#f1e8ce',line='#101b20',accent='#637c51',accentInk='#ffffff',plate='#132823',plateInk='#fff3d5')
m['scenery']=copy.deepcopy(e['scenery']);sc=m['scenery']
sc['layers'][-1]=dict(id='courtyard',sheet={l:'courtyard-'+l for l in ['day','dusk','night']},frame='strip',parallax=1,bottom=0,front=True)
sc['backGround']=12
sc['walkers']=sc['walkers'][:1]
sc['walkers'][0]['lane']=0  # The courtyard ground differs from the Elections street lane.
m['ui']=e['ui'];m['here']=e['here']
m['actors']={k:copy.deepcopy(e['actors'][k]) for k in ['timsah','timsah-leisure','cat','neighbours']}
m['actors']['timsah']['lines']={lang:[a[lang] for a in copytext['quips']] for lang in ['ru','en','he']}
m['actors']['sukkah']=dict(sheet={l:'sukkah-'+l for l in ['day','dusk','night']},fictional=True)
m['actors']['festival']=dict(sheet='festival-props',fictional=True)
def prop(actor,frame,x,y=0,**kwargs):return dict(actor=actor,frame=frame,x=x,y=y,**kwargs)
def shelter(frame):return prop('sukkah',frame,18,back=True,ground=12,z=1)
m['locations']={
 'courtyard':dict(phase='add',x=120,names=localized(labels['courtyard']),sign=sign('courtyard'),icon='festival-icons-prep',quip=localized(q['tailRoom']),props=[prop('festival','preparation',31)]),
 'building':dict(phase='table',x=520,names=localized(labels['building']),sign=sign('building'),icon='festival-icons-build',quip=localized(q['lovelyShade']),props=[shelter('construction')]),
 'decorating':dict(phase='save',x=920,names=localized(labels['decorations']),sign=sign('decorations'),icon='festival-icons-decorate',quip=localized(q['pictureReady']),props=[shelter('decorated'),prop('festival','four-species',48,0)]),
 'welcome':dict(phase='learn',x=1320,names=localized(labels['welcome']),sign=sign('welcome'),icon='festival-icons-welcome',quip=localized(q['roomForFriend']),props=[shelter('welcome'),prop('festival','feast',35),prop('festival','chair',-18,z=1),prop('neighbours','w-a',65,0),prop('neighbours','m-a',-33,0)]),
 'reading':dict(x=1760,names=localized(labels['reading']),sign=sign('reading'),quip=localized(q['breezeBook']),props=[shelter('reading'),prop('festival','chair',0,z=1),prop('festival','books',33)]),
 'cinema':dict(x=2200,lighting='night',names=localized(labels['evening']),sign=sign('evening'),quip=localized(q['storyReady']),props=[shelter('cinema'),prop('festival','chair',0,z=1),prop('festival','screen',42),prop('neighbours','w-a',-33),prop('neighbours','m-a',66)])
}
m['slots']=copy.deepcopy(e['slots']);m['slots']['room-stage']['rest'][0]['y']=0
m['slots']['media-stage']['origin']=0.46
m['surfaces']=copy.deepcopy(e['surfaces']);m['surfaces']['room']['location']='reading';m['surfaces']['room']['react']['y']=0;m['surfaces']['mediatheque']['location']='courtyard'
m['surfaces']['mediatheque']['route']=['courtyard','building','decorating','welcome','cinema']
m['surfaces']['mediatheque']['restByLocation']={loc:copy.deepcopy(m['slots']['studio-stage']['rest']) for loc in ['courtyard','building','decorating','welcome']}
m['locations']['cinema']['icon']='festival-icons-welcome'
def scene(id,loc,trigger,actor='timsah',frames=['idle','blink','idle'],slot='studio-stage',surface='studio'):
 return dict(id=id,slot=slot,surfaces=[surface],trigger=trigger,location=loc,durationMs=2400,title=m['locations'][loc]['names'],caption=m['locations'][loc]['quip'],staticPose=[dict(actor=actor,frame=frames[-1],x=0)],tracks=[dict(actor=actor,z=3,keys=[dict(t=0,frame=frames[0],x=0,hold=True),dict(t=850,frame=frames[1],x=0,hold=True),dict(t=1800,frame=frames[-1],x=0,hold=True)])])
m['scenes']=[]
for loc in ['courtyard','building','decorating','welcome']:
 m['scenes'].append(scene('arrive-'+loc,loc,'arrive.'+loc,frames=['idle','jump','idle'] if loc=='welcome' else ['idle','blink','idle']))
m['scenes'].append(scene('welcome-preview','welcome','manual',frames=['idle','jump','idle']))
m['scenes'].append(scene('quiet-breeze','decorating','ambient'))
m['scenes'].append(scene('turn-page','reading','ambient','timsah-leisure',['read','read-turn','read'],'room-stage','room'))
m['scenes'].append(scene('evening-story','cinema','ambient','timsah-leisure',['watch','laugh','watch'],'media-stage','mediatheque'))
m['scenes'].append(scene('reading-preview','reading','manual','timsah-leisure',['read','read-turn','read'],'room-stage','room'))
m['scenes'].append(scene('cinema-preview','cinema','manual','timsah-leisure',['watch','laugh','watch'],'media-stage','mediatheque'))
# Reuse every Studio scene on the Mediatheque route without replacing its original.
for source in list(m['scenes']):
 if source['surfaces']==['studio']:
  clone=copy.deepcopy(source);clone['id']='media-'+source['id'];clone['slot']='media-stage';clone['surfaces']=['mediatheque'];m['scenes'].append(clone)
# Renderer-supported timeline only. No holiday ritual, learning state, or app content is read.
(R/'public/worlds/sukkot/manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
