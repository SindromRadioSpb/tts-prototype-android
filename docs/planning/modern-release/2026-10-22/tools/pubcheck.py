import sys,json,glob,re;sys.stdout.reconfigure(encoding='utf-8')
from collections import Counter,defaultdict
repo,texts=sys.argv[1],json.load(open(sys.argv[2],encoding='utf-8'))
v=max(int(re.search(r'v(\d+)',p).group(1)) for p in glob.glob(repo+'/public/data/benyehuda/corpus-index-v*.json'))
idx=json.load(open(f'{repo}/public/data/benyehuda/corpus-index-v{v}.json',encoding='utf-8'))
ready={str(c['id']):c for c in idx['ready']}
print('catalog v',v,'ready',len(ready),'with learning_edition',sum(1 for c in ready.values() if c.get('learning_edition_id')))
byf=defaultdict(lambda:Counter())
for t in texts:
    c=ready.get(t['by']);k='ready+edition' if c and c.get('learning_edition_id') else ('ready-machine' if c else 'absent')
    byf[t['folder']][k]+=1
for f in sorted(byf):print(f,dict(byf[f]))
