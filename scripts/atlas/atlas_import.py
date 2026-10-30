"""Import a validated content pack into the atlas graph (linguistpro.atlas-graph.1.0.0).

    python scripts/atlas/atlas_import.py --source <source-pack dir> --content <content.jsonl> --out <dir>

Writes graph.json, id-map.json (temporary -> permanent IDs) and validation-report.json.
Permanent IDs of new objects come from their label (stable across revisions of a delivery).
The import, not the supplier, sets recognition/math_review/owner_status.
"""
import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atlas_schema as S  # noqa: E402
import atlas_validate as V  # noqa: E402

PREFIX = {'region': 'r', 'table': 't', 'erratum': 'e', 'example': 'x'}
REF_FIELDS = ('parent', 'target', 'formula_id')
REF_LISTS = ('links', 'symbols')


class ImportRejected(Exception):
    def __init__(self, report):
        super().__init__(f"content pack rejected: {len(report['errors'])} errors")
        self.report = report


def permanent_id(temp_id, type_):
    m = V.TEMP.match(temp_id)
    if not m:
        raise ValueError(f'not a temporary ID: {temp_id}')
    return f"{m.group('parent')}:{PREFIX[type_]}-{m.group('label')}"


def _page_of(object_id):
    return int(object_id.split(':')[1][1:])


def _rewrite(obj, id_map):
    for key in REF_FIELDS:
        if obj.get(key) in id_map:
            obj[key] = id_map[obj[key]]
    for key in REF_LISTS:
        if key in obj:
            obj[key] = [id_map.get(ref, ref) for ref in obj[key]]


def _status(supplied, recognition, math_review):
    return {'recognition': supplied.get('recognition', recognition),
            'language_review': supplied.get('language_review', 'unreviewed'),
            'math_review': math_review, 'owner_status': 'none'}


def build_graph(source, content_path):
    report = V.validate(source, content_path)
    if not report['ok']:
        raise ImportRejected(report)
    rows, _ = S.read_jsonl(content_path)
    content = [obj for _, obj in rows[1:] if obj['type'] != 'report']
    id_map = {obj['id']: permanent_id(obj['id'], obj['type']) for obj in content if obj['id'].startswith('new:')}

    step_review = {}
    for finding in report['findings']:
        oid, _, step = finding['ref'].rpartition('#step')
        step_review[(oid, int(step))] = 'core_verified' if finding['code'] == 'F_CORE_VERIFIED' else 'core_mismatch'

    objects, terms = {}, {}
    for sid in source.order:
        objects[sid] = dict(source.objects[sid])
    for obj in content:
        obj = json.loads(json.dumps(obj))
        if obj['type'] == 'term':
            terms[obj['id']] = obj
            continue
        temp = obj['id']
        pid = id_map.get(temp, temp)
        merged = dict(objects.get(pid, {}))
        merged.update(obj)
        merged['id'] = pid
        merged.setdefault('page', _page_of(pid))
        _rewrite(merged, id_map)
        if obj['type'] == 'example':
            for index, step in enumerate(merged['steps'], 1):
                step['math_review'] = step_review.get((temp, index), 'unchecked')
        objects[pid] = merged

    pages_with_text = {o['page'] for o in source.objects.values() if o['type'] == 'page' and o['has_text_layer']}
    for oid, obj in objects.items():
        supplied = obj.get('status') or {}
        if obj['type'] == 'formula':
            math = 'unchecked' if obj.get('compute') else 'not_applicable'
        elif obj['type'] == 'example':
            reviews = [s.get('math_review', 'unchecked') for s in obj.get('steps', [])]
            math = 'core_mismatch' if 'core_mismatch' in reviews else ('core_verified' if reviews and all(r == 'core_verified' for r in reviews) else 'unchecked')
        else:
            math = 'not_applicable'
        recognition = 'extracted' if (oid in source.objects or obj['page'] in pages_with_text) else 'ocr_low'
        if obj['type'] == 'page':
            continue
        obj['status'] = _status(supplied, recognition, math)

    supplier_targets = {o['target'] for o in objects.values() if o['type'] == 'erratum'}
    for oid, obj in list(objects.items()):
        if obj['type'] != 'example':
            continue
        for index, step in enumerate(obj['steps'], 1):
            target = step.get('block') or oid
            if step['math_review'] != 'core_mismatch' or target in supplier_targets:
                continue
            page = _page_of(oid)
            eid = f'a97002:p{page}:e-core-{oid.rsplit(":", 1)[1]}-step{index}'
            objects[eid] = {'type': 'erratum', 'id': eid, 'page': page, 'target': target, 'origin': 'core',
                            'as_printed': step['printed'], 'proposed': '',
                            'explanation_ru': f'Ядро: {step["compute"]} с подстановками {step["bindings"]} не даёт напечатанное {step["printed"]}.',
                            'status': _status({}, 'extracted', 'core_mismatch')}

    pages = {}
    order = {oid: i for i, oid in enumerate(source.order)}
    for oid, obj in objects.items():
        pages.setdefault(str(obj['page']), []).append(oid)
    for key in pages:
        pages[key].sort(key=lambda oid: (order.get(oid, len(order)), oid))

    def remap(findings):
        out = []
        for f in findings:
            f = dict(f)
            base, sep, step = (f.get('ref') or '').partition('#')
            if base in id_map:
                f['ref'] = id_map[base] + sep + step
            out.append(f)
        return out

    with open(content_path, 'rb') as fh:
        content_sha = hashlib.sha256(fh.read().replace(b'\r\n', b'\n')).hexdigest()
    graph = {'schema': 'linguistpro.atlas-graph.1.0.0', 'atlas_id': V.ATLAS_ID, 'source_pack_sha256': source.pages_sha256,
             'content_pack_sha256': content_sha, 'built_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
             'objects': dict(sorted(objects.items())), 'pages': dict(sorted(pages.items(), key=lambda kv: int(kv[0]))),
             'terms': dict(sorted(terms.items())), 'findings': remap(report['findings']), 'warnings': remap(report['warnings'])}
    return graph, id_map


def _write(path, data):
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write('\n')


def main(argv=None):
    parser = argparse.ArgumentParser(description='Импорт пакета содержимого в граф атласа.')
    parser.add_argument('--source', required=True)
    parser.add_argument('--content', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    source = V.load_source_pack(args.source)
    try:
        graph, id_map = build_graph(source, args.content)
    except ImportRejected as exc:
        _write(os.path.join(args.out, 'validation-report.json'), exc.report)
        sys.stdout.write(f'Импорт отклонён: ошибок {len(exc.report["errors"])} (см. validation-report.json)\n')
        return 1
    _write(os.path.join(args.out, 'graph.json'), graph)
    _write(os.path.join(args.out, 'id-map.json'), id_map)
    _write(os.path.join(args.out, 'validation-report.json'), V.validate(source, args.content))
    sys.stdout.write(f'Граф: объектов {len(graph["objects"])}, терминов {len(graph["terms"])}, новых ID {len(id_map)}\n')
    return 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    sys.exit(main())
