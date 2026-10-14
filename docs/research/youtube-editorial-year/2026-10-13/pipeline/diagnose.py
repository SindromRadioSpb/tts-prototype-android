import json,pathlib,zipfile,xml.etree.ElementTree as E
P=pathlib.Path(__file__).parent;d=json.loads((P/'dataset.json').read_text(encoding='utf-8'));b={v['video_id']:v for v in d['videos']}
print('BAD SERIES',[(r['date'],b[r['video_id']]['title'],b[r['video_id']]['part'],b[r['video_id']]['episode_no']) for r in d['calendar'] if b[r['video_id']]['format']=='Сериал' and (not b[r['video_id']]['episode_no'] or b[r['video_id']]['part']!='Полная серия — кандидат')])
z=zipfile.ZipFile(P.parents[1]/'docs/research/youtube-editorial-year/2026-10-13/LinguistPro_YouTube_365.xlsx');n={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
styles=E.fromstring(z.read('xl/styles.xml'));print('FORMATS',[(x.get('numFmtId'),x.get('formatCode')) for x in styles.findall('s:numFmts/s:numFmt',n)])
sh=E.fromstring(z.read('xl/worksheets/sheet2.xml'))
print('VALIDATIONS',[x.find('s:formula1',n).text for x in sh.findall('s:dataValidations/s:dataValidation',n)])
c=sh.find(".//s:c[@r='A7']",n);print('DATE CELL',E.tostring(c,encoding='unicode')[:300]);style_index=int(c.get('s',0));print('DATE STYLE',E.tostring(styles.find('s:cellXfs',n)[style_index],encoding='unicode')[:500])
