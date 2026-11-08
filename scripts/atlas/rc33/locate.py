"""Find the canonical node(s) for an atlas id in RC3.2 sections (never occurrence_compatibility copies)."""
import json, os

FIELDS = ['he', 'he_niqqud', 'translit', 'translit_ru', 'ru', 'latex']


def load_sections(base):
    out = {}
    for f in sorted(os.listdir(os.path.join(base, 'sections'))):
        with open(os.path.join(base, 'sections', f), encoding='utf-8') as h:
            out[f[:-5]] = json.load(h)
    return out


def index_nodes(sections):
    idx = {}

    def walk(o, path, sid):
        if isinstance(o, dict):
            if isinstance(o.get('id'), str) and path and path[0] == 'pages' and any(k in o for k in ('he', 'he_niqqud', 'ru', 'translit', 'kind', 'type')):
                idx.setdefault(o['id'], []).append((sid, tuple(path), o))
            for k, v in o.items():
                walk(v, path + [k], sid)
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, path + [i], sid)
    for sid, s in sections.items():
        walk(s, [], sid)
    return idx
