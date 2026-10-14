import sys,json,time,concurrent.futures,pathlib,datetime
sys.path.insert(0,'E:/projects/tts-prototype-android/.tmp/youtube-editorial-research-deps')
import yt_dlp
ROOT=pathlib.Path(__file__).parent
class Quiet:
 def debug(self,*a): pass
 def warning(self,*a): pass
 def error(self,*a): pass
def fetch(key,url,limit=180):
 p=ROOT/(key+'.json')
 if p.exists(): return key,json.loads(p.read_text(encoding='utf-8-sig'))
 opts={'extract_flat':True,'skip_download':True,'quiet':True,'no_warnings':True,'logger':Quiet(),'socket_timeout':18,'retries':1,'extractor_retries':1,'playlistend':limit}
 try:
  with yt_dlp.YoutubeDL(opts) as y: r=y.extract_info(url,download=False)
  fields=['id','title','channel','channel_id','channel_url','uploader','uploader_url','channel_follower_count','playlist_count','webpage_url','description']
  out={k:r.get(k) for k in fields}; out['source_url']=url;out['checked_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();out['sample_limit']=limit
  out['entries']=[{k:e.get(k) for k in ['id','title','url','webpage_url','duration','view_count','channel','channel_id','channel_url','uploader','uploader_id','uploader_url','playlist_index','availability','release_timestamp','timestamp','description']} for e in r.get('entries',[]) if e]
 except Exception as e: out={'source_url':url,'error':str(e),'entries':[]}
 p.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
 print(key,len(out['entries']),out.get('error',''),flush=True);return key,out
CHANNELS={'digital':'https://www.youtube.com/@kan.digital.offical/playlists','kids':'https://www.youtube.com/@kankids/playlists','bac':'https://www.youtube.com/@Beit_Avi_Chai/playlists','davidson':'https://www.youtube.com/user/davidsonweb/playlists','yad':'https://www.youtube.com/user/yadvashemhebrew/playlists','reshet':'https://www.youtube.com/@reshettv/playlists','yes':'https://www.youtube.com/@yes/playlists','news13':'https://www.youtube.com/@News13/playlists','c14':'https://www.youtube.com/@C14news/playlists','project001':'https://www.youtube.com/@001_il/videos','gatekeeper':'https://www.youtube.com/@Shomersaf/videos','bigman':'https://www.youtube.com/@akibigman/videos'}
if __name__=='__main__':
 if sys.argv[1]=='channels':
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex: list(ex.map(lambda kv:fetch(kv[0]+'-index',kv[1]),CHANNELS.items()))
 elif sys.argv[1]=='collections':
  jobs=json.loads((ROOT/'collection-jobs.json').read_text(encoding='utf-8'))
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex: list(ex.map(lambda j:fetch(j['id'],j['url'],j.get('limit',40)),jobs))
