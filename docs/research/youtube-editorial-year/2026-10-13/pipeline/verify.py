import json,pathlib,collections,datetime,zipfile,xml.etree.ElementTree as ET,hashlib,re
P=pathlib.Path(__file__).parent;O=P.parents[1]/'docs/research/youtube-editorial-year/2026-10-13'
d=json.loads((O/'research-data.json').read_text(encoding='utf-8'));by={v['video_id']:v for v in d['videos']};dates=[r['date'] for r in d['calendar']]
assert len(by)==len(d['videos'])==1502
assert len(dates)==len(set(dates))==365
assert dates[0]=='2026-10-14' and dates[-1]=='2027-10-13'
assert all((datetime.date.fromisoformat(b)-datetime.date.fromisoformat(a)).days==1 for a,b in zip(dates,dates[1:]))
primary=[r['video_id'] for r in d['calendar']];backup=[r['backup_id'] for r in d['calendar']]
assert len(set(primary))==365 and len(set(backup))==365 and not set(primary)&set(backup)
assert all(k in by for k in primary+backup)
assert not any(by[k]['published_match'] for k in primary+backup)
assert all(by[k]['views_kind'].startswith('Точный') for k in primary+backup)
assert all(by[k]['embed']=='Разрешено по метаданным' for k in primary+backup)
assert all(by[k]['language'] in (None,'he','iw','Иврит предполагается по заголовку и источнику') for k in primary+backup)
assert all(l['video_id'] in by for l in d['memberships'])
assert len(d['collections'])==90 and len(d['channels'])==11
series=collections.defaultdict(list)
for r in d['calendar']:
 v=by[r['video_id']]
 if v['format']=='Сериал':
  assert v['part']=='Полная серия — кандидат' and v['episode_no']
  series[v['collection_id']].append(v['episode_no'])
for cid,seq in series.items():
 assert seq==sorted(seq) and len(seq)==len(set(seq)),(cid,seq)
 assert seq[0]==1,(cid,seq)
 assert all(b==a+1 for a,b in zip(seq,seq[1:])),(cid,seq)
exact=sum(v['views_kind'].startswith('Точный') for v in d['videos'])
with zipfile.ZipFile(O/'LinguistPro_YouTube_365.xlsx') as z:
 ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
 workbook=ET.fromstring(z.read('xl/workbook.xml'));sheet_names=[x.attrib['name'] for x in workbook.findall('s:sheets/s:sheet',ns)]
 assert sheet_names==['Обзор','365 дней','Выбор редактора','Подборки','Видео','Исключения','Методика']
 shared=ET.fromstring(z.read('xl/sharedStrings.xml'));strings=[''.join(si.itertext()) for si in shared]
 def value(cell):
  n=cell.find('s:v',ns)
  if n is None:return None
  return strings[int(n.text)] if cell.get('t')=='s' else n.text
 def cell(sheet,address):return sheet.find(".//s:c[@r='"+address+"']",ns)
 overview=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
 assert cell(overview,'B4').get('t') not in ['s','str','inlineStr']
 expected_date=(datetime.date(2026,10,13)-datetime.date(1899,12,30)).days
 assert float(value(cell(overview,'B4')))==expected_date
 assert float(value(cell(overview,'B8')))==1502 and float(value(cell(overview,'B11')))==exact
 assert float(value(cell(overview,'B12')))==0
 cal=ET.fromstring(z.read('xl/worksheets/sheet2.xml'))
 assert float(value(cell(cal,'A7')))==expected_date+1
 assert value(cell(cal,'D7'))==primary[0]
 assert value(cell(cal,'E7'))==by[primary[0]]['title']
 assert value(cell(cal,'D371'))==primary[-1]
 assert value(cell(cal,'E371'))==by[primary[-1]]['title']
 assert value(cell(cal,'P7'))==by[primary[0]]['url']
 date_styles=ET.fromstring(z.read('xl/styles.xml'));assert any(x.get('formatCode')=='yyyy-mm-dd' for x in date_styles.findall('s:numFmts/s:numFmt',ns))
 formulas=0;panes={};errors=[]
 for i,name in enumerate(sheet_names,1):
  sh=ET.fromstring(z.read(f'xl/worksheets/sheet{i}.xml'))
  formulas+=len(sh.findall('.//s:f',ns))
  errors.extend((name,c.get('r'),value(c)) for c in sh.findall('.//s:c',ns) if c.get('t')=='e')
  pane=sh.find('.//s:pane',ns);panes[name]=pane.attrib if pane is not None else None
 assert not errors,errors
 for name in sheet_names[1:]:assert panes[name] and float(panes[name].get('ySplit',0))==6
 assert float(panes['Видео'].get('xSplit',0))==2
 assert len([n for n in z.namelist() if re.fullmatch(r'xl/tables/table\d+.xml',n)])==6
 chart_paths=[n for n in z.namelist() if re.fullmatch(r'.*/charts/[^/]+\.xml',n)]
 assert len(chart_paths)==1
 chart=z.read(chart_paths[0]).decode();assert '38659B' in chart.upper()
vchecks=json.loads((P/'workbook-checks.json').read_text(encoding='utf-8'))
for key in ['2026-12-04','2027-01-23','2027-03-08','2027-03-23','2027-06-04','2027-08-12','2027-10-07','2027-10-10']:
 row=next(r for r in d['calendar'] if r['date']==key)
 expected_ids={'2026-12-04':'TqKeggecIn0','2027-01-23':'8DGDUX7dbNI','2027-03-08':'Kd4GMjffP9k','2027-03-23':'nkTOs-_bS-Q','2027-06-04':'wASaSlx-fUc','2027-08-12':'AIdg74K8Cic','2027-10-07':'YncbYhkol3k','2027-10-10':'--X-hJFnkR4'}
 assert row['video_id']==expected_ids[key],key
assert not any('בערבית' in v['title'] or 'بلا مؤاخذة' in v['title'] for v in d['videos'])
result={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'data_checks':{'unique_videos':1502,'collections':90,'channels':11,'exact_metadata_records':exact,'dates_contiguous':True,'unique_primary_ids':365,'unique_distinct_backup_ids':365,'primary_backup_overlap':0,'public_catalog_matches_in_primary_or_backup':0,'all_primary_and_backup_metadata_enriched':True,'series_order_and_no_episode_gaps':True,'seasonal_assignments_reviewed':True,'explicitly_arabic_episodes_excluded':True},'workbook':{'sheets':sheet_names,'cached_formula_errors':errors,'formulas':formulas,'date_cells_numeric':True,'native_tables':6,'native_chart':1,'chart_color_verified':True,'header_and_identity_panes_verified':True,'calculated_url_export_verified':True,'calculated_lookup_export_verified':True,**vchecks},'visual_review':'Every sheet rendered and visually reviewed; overview lower area reviewed separately. Native Microsoft Excel was not used.','sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in O.iterdir() if p.is_file() and not p.name.endswith('.inspect.ndjson') and p.name!='verification.json'}}
(O/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result['data_checks'],ensure_ascii=False));print('XLSX',len(sheet_names),'sheets',formulas,'formulas','errors',len(errors))
