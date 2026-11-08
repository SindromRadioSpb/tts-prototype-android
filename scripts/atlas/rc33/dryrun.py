import json, sys, collections
sys.path.insert(0, 'scripts/atlas/rc33')
import locate as L, apply as AP, corrections as C
sys.stdout.reconfigure(encoding='utf-8')
findings = json.load(open(sys.argv[1], encoding='utf-8'))
S = L.load_sections(sys.argv[2]); idx = L.index_nodes(S)
conf = {f['finding_id'] for f in findings if f['category'] == 'confirmed_atlas_defect'}
missing = conf - set(C.D); extra = set(C.D) - conf
print('missing', sorted(missing)); print('extra', sorted(extra))
errs = []
for fid, d in C.D.items():
    try:
        AP.apply(S, idx, {fid: d}, findings)
    except AP.Fail as e:
        errs.append(str(e))
print('errors', len(errs)); [print(' ', e) for e in errs]
print(collections.Counter(d['action'] for d in C.D.values()))
