"""Validate the published reader graph, not historical compatibility snapshots."""
import hashlib
import json
from pathlib import Path

def read(path):
    return json.loads(Path(path).read_text(encoding='utf8'))

def validate(root):
    root = Path(root)
    edition = root / 'edition'
    index = read(edition / 'index.json')
    atlas = index['atlas_id']
    errors, objects, refs, terms, termrefs, pages = [], {}, [], set(), [], set()
    sections = index['sections']
    names = [s['id'] for s in sections]
    if len(set(names)) != len(names): errors.append('Duplicate section IDs')
    if set(p.stem for p in (edition / 'sections').glob('*.json')) != set(names):
        errors.append('Section file coverage differs from index')
    def register(key, where):
        if key in objects: errors.append('Duplicate ID: ' + key)
        objects[key] = where
    def walk(value, where):
        if isinstance(value, dict):
            if isinstance(value.get('id'), str): register(value['id'], where)
            if isinstance(value.get('cells'), list):
                occupied = set()
                for cell in value['cells']:
                    coords = [cell.get(k, 1 if k.endswith('span') else None) for k in ('row','col','rowspan','colspan')]
                    if any(type(n) is not int for n in coords) or min(coords[:2]) < 0 or min(coords[2:]) < 1:
                        errors.append('Invalid cell coordinates: ' + where); continue
                    r,c,rs,cs = coords
                    if rs * cs > 10000: errors.append('Excessive span: ' + where); continue
                    for pos in ((y,x) for y in range(r,r+rs) for x in range(c,c+cs)):
                        if pos in occupied: errors.append('Overlapping cells: ' + where)
                        occupied.add(pos)
            for key, item in value.items():
                if key == 'legacy_groups': continue  # preserved provenance, not live graph
                if key in ('parent','target','formula_id') and isinstance(item,str): refs.append((where,item))
                if key in ('links','symbols','terms') and isinstance(item,list):
                    (termrefs if key == 'terms' else refs).extend((where,x) for x in item if isinstance(x,str))
                walk(item, where + '/' + key)
        elif isinstance(value,list):
            for i,item in enumerate(value): walk(item,where + '/' + str(i))
        elif isinstance(value,str) and value.startswith('/data/atlas/'):
            prefix = '/data/atlas/' + atlas + '/'
            rel = value.removeprefix(prefix)
            if not value.startswith(prefix) or '..' in Path(rel).parts or not (edition / rel).is_file():
                errors.append('Missing/foreign asset: ' + value)
    pdfs = list(root.glob('*.pdf'))
    pdfhashes = {hashlib.sha256(p.read_bytes()).hexdigest() for p in pdfs}
    for spec in sections:
        sid = spec['id']
        if '/' in sid or '\\' in sid or '..' in sid: raise ValueError('Unsafe section ID')
        data = read(edition / 'sections' / (sid + '.json'))
        if data['id'] != sid or data['atlas_id'] != atlas: errors.append('Section identity: ' + sid)
        if data.get('structure_provenance',{}).get('pdf_sha256') not in pdfhashes: errors.append('PDF binding: ' + sid)
        for key,term in data.get('terms',{}).items():
            terms.add(key)
            terms.update(key + '#' + s['sense'] for s in term.get('senses',[]))
        localpages = []
        for page in data['pages']:
            n = page['page']; localpages.append(n)
            if n in pages: errors.append('Duplicate page: ' + str(n))
            pages.add(n); register(atlas + ':p' + str(n),sid)
            walk(page,sid + '/p' + str(n))
        if localpages != list(range(spec['first'],spec['last']+1)): errors.append('Page coverage: ' + sid)
    for where,ref in refs:
        if ref not in objects: errors.append('Dangling link: ' + where + ' -> ' + ref)
    for where,ref in termrefs:
        if ref not in terms: errors.append('Dangling term: ' + where + ' -> ' + ref)
    return {'ok':not errors,'errors':errors,'sections':len(sections),'pages':len(pages),
            'objects':len(objects),'references':len(refs),'term_references':len(termrefs)}

if __name__ == '__main__':
    import sys
    result = validate(sys.argv[1])
    print(json.dumps(result,ensure_ascii=False,indent=2))
    sys.exit(0 if result['ok'] else 1)
