import sys,json,pathlib,concurrent.futures,datetime,time
sys.path.insert(0,'E:/projects/tts-prototype-android/.tmp/youtube-editorial-research-deps')
import yt_dlp
from collect import Quiet
P=pathlib.Path(__file__).parent
data=json.loads((P/'dataset.json').read_text(encoding='utf-8'));p=P/'details.json'
results=json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}
def get(vid):
 if vid in results:return vid,results[vid]
 opts={'skip_download':True,'quiet':True,'no_warnings':True,'logger':Quiet(),'socket_timeout':15,'retries':1,'extractor_retries':1,'ignore_no_formats_error':True,'noplaylist':True}
 try:
  with yt_dlp.YoutubeDL(opts) as y:r=y.extract_info('https://www.youtube.com/watch?v='+vid,download=False)
  manual=[k for k in r.get('subtitles',{}) if k in ('iw','he')];auto=[k for k in r.get('automatic_captions',{}) if k in ('iw','he','iw-orig','he-orig')]
  caps='Ручная дорожка HE по метаданным' if manual else 'Автоматическая дорожка HE по метаданным' if auto else 'Дорожка HE не найдена в метаданных; вшитые титры не проверены'
  out={k:r.get(k) for k in ['id','title','channel','channel_id','view_count','upload_date','duration','availability','age_limit','language','playable_in_embed','like_count','comment_count']}
  out['video_id']=vid;out['views']=out.pop('view_count');out['duration_seconds']=out.pop('duration');out['subtitles']=caps;out['embed']='Разрешено по метаданным' if out.pop('playable_in_embed') is True else 'Не подтверждено по метаданным'
  if out.get('upload_date'):out['upload_date']=datetime.datetime.strptime(out['upload_date'],'%Y%m%d').date().isoformat()
  out['checked_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 except Exception as e:out={'video_id':vid,'error':str(e)[:300],'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 return vid,out
ids=data['enrichment_ids']
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 for i,(vid,out) in enumerate(ex.map(get,ids),1):
  results[vid]=out
  if i%30==0:
   p.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print(i,'/',len(ids),'errors',sum('error' in d for d in results.values()),flush=True)
p.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print('DONE',len(results),flush=True)
