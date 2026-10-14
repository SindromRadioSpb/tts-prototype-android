import json,re,pathlib,statistics,datetime,collections
P=pathlib.Path(__file__).parent
jobs=json.loads((P/'collection-jobs.json').read_text(encoding='utf-8'))
public=json.loads((P/'public-catalog.json').read_text(encoding='utf-8'))
existing={x.get('media',{}).get('videoId') for x in public['items'] if x.get('media')}
videos={};links=[];excluded=[]
promo=re.compile(r'טריילר|פרומו|הצצה|מאחורי הקלעים|פספוסים|טיזר|קדימון|teaser|trailer',re.I)
for j in jobs:
 r=json.loads((P/(j['id']+'.json')).read_text(encoding='utf-8'))
 j['sampled_count']=len(r['entries']);j['checked_at']=r.get('checked_at');j['channel']=r.get('channel') or r.get('uploader') or ''
 views=[e['view_count'] for e in r['entries'] if isinstance(e.get('view_count'),(int,float))]
 j['median_sample_views']=statistics.median(views) if len(views)>=5 else None
 for k,e in enumerate(r['entries'],1):
  vid=e.get('id');t=e.get('title') or '';dur=e.get('duration')
  if not vid or not re.fullmatch('[A-Za-z0-9_-]{11}',vid): continue
  reason=None
  if promo.search(t):reason='Трейлер, промо или закулисье; не считается основным выпуском'
  elif t in ['[Private video]','[Deleted video]']:reason='Недоступное видео'
  elif not re.search('[\u0590-\u05ff]',t):reason='Заголовок не на иврите; основной язык не установлен'
  elif re.search(r'בערבית|بلا مؤاخذة',t):reason='Издатель обозначил выпуск как арабоязычный'
  if reason:
   excluded.append({'video_id':vid,'collection_id':j['id'],'title':t,'url':'https://www.youtube.com/watch?v='+vid,'reason':reason});continue
  part='Самостоятельное видео'
  if j['format']=='Сериал':
   part='Полная серия — кандидат' if re.search(r'פרק\s*\d+',t) and dur and dur>=600 else 'Спецвыпуск сериала' if re.search(r'ספיישל|פרק מלחמה',t) and dur and dur>=600 else 'Длинный материал сериала; тип уточнить' if dur and dur>=600 else 'Фрагмент сериала'
  elif j['format']=='Интервью':part='Длинное интервью' if dur and dur>=900 else 'Короткое интервью / фрагмент'
  elif j['source']=='yad' and j['title'].startswith('עושים'):part='Аудио в YouTube'
  m=re.search(r'פרק\s*(\d+)',t);ep=int(m.group(1)) if m else None
  links.append({'video_id':vid,'collection_id':j['id'],'source_position':k,'episode_no':ep,'source_url':j['url']})
  if vid in videos: videos[vid]['collections'].append(j['id']);continue
  views_e=e.get('view_count');med=j['median_sample_views'];relative=round(views_e/med,2) if isinstance(views_e,(int,float)) and med else None
  signal='Нет метрики' if views_e is None else ('≥1 млн просмотров' if views_e>=1000000 else '100 тыс.–1 млн' if views_e>=100000 else '10–100 тыс.' if views_e>=10000 else '<10 тыс.')
  v={'video_id':vid,'collection_id':j['id'],'collections':[j['id']],'title':t,'url':'https://www.youtube.com/watch?v='+vid,'topic':j['topic'],'segment':j['segment'],'format':j['format'],'level':j['level']+' (гипотеза)','why':j['why'],'task':j['task'],'angle':j['angle'],'risk':j['risk'],'channel':e.get('channel') or j['channel'],'channel_id':e.get('channel_id') or r.get('channel_id'),'duration_seconds':dur,'views':views_e,'views_kind':'Округлённый счётчик в списке YouTube','median_sample_views':med,'relative_views':relative,'signal':signal,'source_position':k,'episode_no':ep,'part':part,'checked_at':r.get('checked_at'),'published_match':vid in existing,'evidence':'Метаданные списка; видео не просмотрено','subtitles':'Не проверено','language':'Иврит предполагается по заголовку и источнику','embed':'Не проверено','upload_date':None,'age_limit':None}
  v['list_views']=views_e
  v['sensitive_title']=bool(re.search(r'חטופ|חטיפ|התאבד|נרצח|טבח|בלב עזה|בעזה|שואה|בשבי|אונס|נאנס',t))
  if v['sensitive_title']:v['risk']='В заголовке есть чувствительная тема: предварительный просмотр и добровольный выбор. '+v['risk']
  videos[vid]=v
# Add video-level metadata already obtained; only compact, durable evidence is used.
details_path=P/'details.json'
details=json.loads(details_path.read_text(encoding='utf-8')) if details_path.exists() else {}
for vid,d in details.items():
 if vid not in videos or d.get('error'):continue
 v=videos[vid]
 for key in ['duration_seconds','views','channel','channel_id','upload_date','age_limit','language','embed','subtitles']:
  if d.get(key) is not None: v[key]=d[key]
 v['views_kind']='Точный счётчик метаданных видео';v['checked_at']=d['checked_at'];v['evidence']='Метаданные видео; воспроизведение и содержание не проверены'
 if d.get('availability') not in (None,'public','unlisted'):v['risk']+='; доступ: '+d['availability']
 if d.get('language') and d['language'] not in ['he','iw','Hebrew']:v['language']='Основной язык по метаданным: '+d['language'];v['not_hebrew']=True
 v['published_age_days']=(datetime.date(2026,10,13)-datetime.date.fromisoformat(v['upload_date'])).days if v.get('upload_date') else None
 v['lifetime_views_per_day']=round(v['views']/max(1,v['published_age_days']),1) if v.get('published_age_days') is not None and v.get('views') is not None else None
for vid in list(videos):
 v=videos[vid]
 reason='Язык по метаданным отличается от HE: '+v['language'] if v.get('not_hebrew') else 'Встраивание не подтверждено метаданными; вернуть после технической проверки' if v.get('embed')=='Не подтверждено по метаданным' else None
 if reason:
  excluded.append({'video_id':vid,'collection_id':v['collection_id'],'title':v['title'],'url':v['url'],'reason':reason})
  del videos[vid]
links=[l for l in links if l['video_id'] in videos]
# Comparisons use the same rounded playlist sample for every record; exact/rounded are kept separate.
for j in jobs:
 j['eligible_count']=len({l['video_id'] for l in links if l['collection_id']==j['id']})
 j['published_matches']=len({l['video_id'] for l in links if l['collection_id']==j['id'] and l['video_id'] in existing})
 j['priority']='Первый пилот' if j['id'] in ['C002','C003','C005','C007','C013','C014','C019','C024','C026','C027','C029','C034','C043','C044','C045','C047','C049','C053','C056','C059','C064','C070'] else 'Расширение'
for j in jobs:
 sample=[videos[l['video_id']] for l in links if l['collection_id']==j['id']]
 sample=list({v['video_id']:v for v in sample}.values())
 if j['format']=='Сериал' and any(v['part']=='Полная серия — кандидат' for v in sample):sample=[v for v in sample if v['part']=='Полная серия — кандидат']
 if j['format']=='Интервью' and any(v['part']=='Длинное интервью' for v in sample):sample=[v for v in sample if v['part']=='Длинное интервью']
 metrics=[v['list_views'] for v in sample if isinstance(v['list_views'],(int,float))]
 j['median_sample_views']=statistics.median(metrics) if len(metrics)>=5 else None
 j['metric_sample_n']=len(metrics)
for v in videos.values():
 med=next(j['median_sample_views'] for j in jobs if j['id']==v['collection_id']);v['median_sample_views']=med
 v['relative_views']=round(v['list_views']/med,2) if v['list_views'] is not None and med else None
def eligible(v):return not v['published_match'] and not v.get('not_hebrew') and v.get('embed')!='Не подтверждено по метаданным' and v.get('duration_seconds') and v['duration_seconds']>=60
used=set()
def ordered(cids):
 out=[]
 for cid in cids:
  group=[v for v in videos.values() if cid in v['collections'] and eligible(v) and v['part']=='Полная серия — кандидат']
  group.sort(key=lambda v:(v['episode_no'] or 999,v['source_position']))
  out.extend(group)
 return out
def series_id(term):return [j['id'] for j in jobs if term in j['title']]
sun=ordered(series_id('קופה ראשית עונה 3')+series_id('קופה ראשית עונה 4')+series_id('קופה ראשית עונה 5'))
thu=ordered(['C007','C005','C009','C053','C054','C055','C008','C006'])
def rotate(fmt):
 groups=[]
 for j in jobs:
  if j['format']!=fmt:continue
  vals=[v for v in videos.values() if v['collection_id']==j['id'] and eligible(v) and (fmt=='Память' or not v.get('sensitive_title'))]
  vals.sort(key=lambda v:(-(v['relative_views'] or 0),-(v['views'] or 0)))
  groups.append(vals)
 out=[]
 for i in range(max(map(len,groups),default=0)):
  for g in groups:
   if i<len(g):out.append(g[i])
 return out
interviews=rotate('Интервью');education=rotate('Образование');life=rotate('Быт');history=rotate('История');culture=rotate('Культура');society=rotate('Общество');memory=rotate('Память')
def take(pool,condition=lambda v:True):
 for v in pool:
  if v['video_id'] not in used and v['video_id'] not in reserved_ids and condition(v):used.add(v['video_id']);return v
 return None
def find_event(pool,term):return take(pool,lambda v:term in v['topic'] or term in v['title'] or term in v['collection_id'])
events={
 '2026-11-09':('Сигд: знакомство с эфиопской общиной','История','ירוסלם'),
 '2026-11-10':('После памятной ночи 9–10 ноября: история Шоа','Память','yad'),
 '2026-12-04':('Ханука начинается вечером: наука о вращающемся волчке','Образование',''),
 '2026-12-31':('День иврита: история слов','История','עברית'),
 '2027-01-23':('Ту би-Шват: забота о природе Израиля','Быт',''),
 '2027-01-27':('Международный день памяти жертв Холокоста','Память','yad'),
 '2027-02-07':('День семьи в Израиле','Общество','משפחה'),
 '2027-03-08':('Международный женский день: голос и личный опыт','Общество',''),
 '2027-03-23':('Пурим: праздничная жизнь Иерусалима','Быт',''),
 '2027-04-17':('Йом ха-Алия: история общины и путь в Израиль','История','ירוסלם'),
 '2027-04-21':('Песах начинается вечером: исход и исторические источники','История','בארץ'),
 '2027-05-04':('Йом ха-Шоа: свидетельство и память','Память','yad'),
 '2027-05-11':('Йом ха-Зикарон: память и сообщество','Память','כפר עזה'),
 '2027-05-12':('Йом ха-Ацмаут: основание государства','История','1948'),
 '2027-06-04':('День Иерусалима: история и место','История',''),
 '2027-06-10':('Шавуот начинается вечером: текст и традиция','История',''),
 '2027-08-12':('Тиша бе-Ав: древняя история','История','Древняя'),
 '2027-10-01':('Рош ха-Шана начинается вечером: сезонный рассказ еврейской мудрости','Культура',''),
 '2027-10-07':('Гражданская годовщина 7 октября: память','Память','7 октября'),
 '2027-10-10':('Йом Кипур начинается вечером: традиция и размышление','История','Религия'),
}
def anchor(cid,pattern):
 vals=[v for v in videos.values() if cid in v['collections'] and eligible(v) and re.search(pattern,v['title'])]
 if not vals:raise RuntimeError('Missing event anchor '+cid+' '+pattern)
 return vals[0]['video_id']
event_ids={
 '2026-11-09':anchor('C032',r'פרק 1'),
 '2026-11-10':anchor('C076',r'.'),
 '2026-12-04':'TqKeggecIn0',
 '2026-12-31':anchor('C065',r'שיעור 1'),
 '2027-01-23':'8DGDUX7dbNI',
 '2027-01-27':anchor('C077',r'פרק ראשון'),
 '2027-02-07':anchor('C011',r'פרק 1'),
 '2027-03-08':'Kd4GMjffP9k',
 '2027-03-23':'nkTOs-_bS-Q',
 '2027-04-17':anchor('C032',r'פרק 2'),
 '2027-04-21':anchor('C074',r'שיעור 1'),
 '2027-05-04':anchor('C078',r'בתוניסיה'),
 '2027-05-11':'grYnnaPC0VI',
 '2027-05-12':anchor('C030',r"חלק א'"),
 '2027-06-04':'wASaSlx-fUc',
 '2027-06-10':'pZHaUMn3vD8',
 '2027-08-12':'AIdg74K8Cic',
 '2027-10-01':'Ikg3u2kb_AY',
 '2027-10-07':'YncbYhkol3k',
 '2027-10-10':anchor('C089',r'שיעור 1'),
}
reserved_ids=set(event_ids.values())
assert len(reserved_ids)==len(event_ids)
start=datetime.date(2026,10,14);calendar=[]
for i in range(365):
 date=start+datetime.timedelta(days=i);date_s=date.isoformat();day=date.weekday();event='';source=''
 pools={0:interviews,1:education,2:life,3:thu,4:history if (i//7)%2==0 else culture,5:society,6:sun}
 rubric={0:'Интервью',1:'Образование',2:'Быт',3:'Сериал',4:'История' if (i//7)%2==0 else 'Культура',5:'Общество',6:'Сериал'}[day]
 pool=pools[day];cond=lambda v:True
 if day==5 and date.day<=7 and date_s not in events:
  available=[v for v in memory if v['collection_id'] in ['C041','C042','C052'] and v['video_id'] not in used and v['video_id'] not in reserved_ids]
  if available:
   pool=available;rubric='Память';event='Ежемесячная добровольная рубрика памяти 7 октября';source='Редакционная периодичность, не памятная дата'
 if date_s in events:
  event,rubric,term=events[date_s];pool={'История':history,'Быт':life,'Образование':education,'Общество':society,'Культура':culture,'Память':memory}[rubric]
  if term=='yad':cond=lambda v:v['collection_id'] in ['C076','C077','C078']
  elif term:cond=lambda v:term in v['topic'] or any(term in j['title'] for j in jobs if j['id']==v['collection_id'])
  source='https://www.hebcal.com/holidays/'+str(date.year)+'?i=on' if date_s not in ['2026-11-10','2027-01-27','2027-03-08','2027-10-07'] else ('https://www.un.org/en/observances/commemoration-holocaust-victims-day' if date_s=='2027-01-27' else 'Редакционный гражданский календарь')
 if date_s in event_ids:
  v=videos[event_ids[date_s]]
  assert eligible(v) and v['video_id'] not in used
  used.add(v['video_id']);rubric=v['format']
 else:v=take(pool,cond) or take(pool)
 if v is None:v=take(education+life+society+history+culture+interviews+sun+thu)
 if v is None:raise RuntimeError('No unique video for '+date_s)
 calendar.append({'date':date_s,'offset':i,'weekday':['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][day],'rubric':rubric,'video_id':v['video_id'],'backup_id':'','event':event,'event_source':source,'learning_minutes':5 if v['duration_seconds']<600 else 10,'watch_minutes':round(v['duration_seconds']/60,1),'publication':'Предложено','editor_note':''})
# A distinct reserve for every daily slot; backups stay out of the planned set.
reserve_used=set(used)
for row in calendar:
 chosen=videos[row['video_id']]
 alternatives=[v for v in videos.values() if eligible(v) and v['video_id'] not in reserve_used and v['format']==chosen['format'] and v['part']!='Фрагмент сериала' and (chosen['format']=='Память' or not v.get('sensitive_title'))]
 if chosen['format']=='Сериал':alternatives=[v for v in videos.values() if eligible(v) and v['video_id'] not in reserve_used and v['format'] in ['Быт','Образование'] and v['duration_seconds']<=900 and not v.get('sensitive_title')]
 if not alternatives:alternatives=[v for v in videos.values() if eligible(v) and v['video_id'] not in reserve_used and v['format'] in ['Быт','Образование'] and not v.get('sensitive_title')]
 alternatives.sort(key=lambda v:-(v['relative_views'] or 0))
 if alternatives:row['backup_id']=alternatives[0]['video_id'];reserve_used.add(row['backup_id'])
 row['backup_rule']='При недоступной серии приостановить сюжетную ветку; резерв — самостоятельное видео' if chosen['format']=='Сериал' else 'Резерв меняет выбор видео; снова проверить повод, аудиторию и все редакторские условия'
shortlist=[]
for j in jobs:
 vals=[v for v in videos.values() if v['collection_id']==j['id'] and eligible(v)]
 vals.sort(key=lambda v:(v['part']=='Фрагмент сериала',-(v['relative_views'] or 0),-(v['views'] or 0)))
 if j['format']=='Сериал':vals.sort(key=lambda v:(v['part']=='Фрагмент сериала',v['episode_no'] or 999))
 shortlist.extend([v['video_id'] for v in vals[:2]])
selected=set(v['video_id'] for v in calendar)|set(v['backup_id'] for v in calendar if v['backup_id'])|set(shortlist)
for v in videos.values():
 j=next(j for j in jobs if j['id']==v['collection_id'])
 if v['format']=='Сериал':
  specific=f"Эпизод {v['episode_no']} в знакомой сюжетной ветке. " if v['episode_no'] else 'Самостоятельный специальный выпуск. ' if v['part']=='Спецвыпуск сериала' else 'Тип длинного материала требует уточнения. ' if v['part']=='Длинный материал сериала; тип уточнить' else 'Сценка из сериала; полезна для короткого разбора, не заменяет полную серию. '
 elif v['format']=='Интервью':
  guest=v['title'].split('|')[-1].strip();specific='Тема / гость: '+guest+'. '
 elif v['duration_seconds'] and v['duration_seconds']<=600:specific='Завершённый короткий просмотр около '+str(round(v['duration_seconds']/60))+' мин. '
 else:specific='Тема: '+v['title']+'. '
 if v['relative_views'] is not None and v['relative_views']>=1.5:specific+=f"Просмотры в списке выше медианы выборки этого цикла в {v['relative_views']} раза. "
 elif v['relative_views'] is not None and v['relative_views']<0.5:specific+='Просмотры ниже медианы цикла; выбирать за нишевую ценность, а не за массовый охват. '
 v['video_why']=specific+j['why']
 v['priority']='Пилот' if v['video_id'] in shortlist and j['priority']=='Первый пилот' else 'План года' if v['video_id'] in used else 'Резерв'
channels=[]
source_roles={'kan':'Сериалы, интервью, документальные циклы','digital-all':'Короткие истории и объяснения','kids':'Семейные сериалы и образование','davidson':'Научно-популярные объяснения','bac':'История, литература и еврейское наследие','yad':'Историческая память и свидетельства','reshet':'Коммерческое ТВ и фрагменты сериалов','c14':'Интервью, общество и традиция','project001':'Длинные разговоры','gatekeeper':'Авторская общественная дискуссия','bigman':'Авторская общественная дискуссия'}
for src,role in source_roles.items():
 idx=json.loads((P/(src+'-index.json')).read_text(encoding='utf-8-sig'))
 channels.append({'source':src,'title':idx.get('channel') or idx.get('title'),'url':idx.get('channel_url') or idx.get('uploader_url') or idx.get('source_url'),'followers':idx.get('channel_follower_count'),'scope':'Списки официального канала' if src not in ['project001','gatekeeper','bigman'] else 'Последние видео авторского канала','role':role})
out={'as_of':'2026-10-13','start_date':start.isoformat(),'end_date':calendar[-1]['date'],'source_commit':'b150dbb5','extractor_version':'2026.08.19','channels':channels,'public_catalog_revision':public['revision'],'public_catalog_items':len(public['items']),'collections':jobs,'videos':list(videos.values()),'memberships':links,'excluded':excluded,'calendar':calendar,'shortlist':list(dict.fromkeys(shortlist)),'enrichment_ids':sorted(selected)}
(P/'dataset.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'collections':len(jobs),'unique_videos':len(videos),'memberships':len(links),'excluded':len(excluded),'calendar':len(calendar),'unique_planned':len(used),'backups':sum(bool(r['backup_id']) for r in calendar),'enrichment':len(selected),'formats':dict(collections.Counter(v['format'] for v in videos.values())),'planned_formats':dict(collections.Counter(videos[r['video_id']]['format'] for r in calendar)),'published_matches':sum(v['published_match'] for v in videos.values())},ensure_ascii=False))
