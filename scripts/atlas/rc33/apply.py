"""Apply rc33 corrections to in-memory RC3.2 sections. Fails closed on any mismatch."""
import copy
import json
import re
import unicodedata

MARKS = re.compile('[֑-ׇ]')
TEXT_FIELDS = ['he', 'he_niqqud', 'translit', 'translit_ru', 'ru']


def nfc(x):
    return unicodedata.normalize('NFC', x)


def skeleton(x):
    return MARKS.sub('', x)


class Fail(Exception):
    pass


def check(ok, msg):
    if not ok:
        raise Fail(msg)


def node_copies(idx, target):
    tid = 'a97001:' + target
    hits = idx.get(tid, [])
    check(hits, 'TARGET_NOT_FOUND ' + target)
    return [n for _, _, n in hits]


def term_copies(sections, short):
    tid = 'a97001:term:' + short
    out = [(sid, s['terms'][tid]) for sid, s in sections.items() if tid in s.get('terms', {})]
    check(out, 'TERM_NOT_FOUND ' + short)
    return out


def count_sub(value, frm, to, n, where):
    frm, to = nfc(frm), nfc(to)
    value_n = nfc(value)
    k = value_n.count(frm)
    if n == '+':
        check(k >= 1, f'NO_MATCH {where} «{frm}»')
    else:
        check(k == n, f'COUNT {where} «{frm}» expected {n} got {k}')
    return value_n.replace(frm, to)


def regex_rules(rule):
    if rule == 'phase':
        return {
            'he_niqqud': [(nfc('פָּאז'), nfc('פָאז'))],
            'translit': [('re', r'(?<![A-Za-z’\'])((?:[Hh]a|[Bb]e|[Vv]e|[Ll]a|[Bb]a|[Ll]e|[Uu]|[Ss]he)?)([Pp])az(a|ot|ah|iyot|it|i)(?![a-z])')],
            'translit_ru': [('re', r'(?<![а-яёА-ЯЁ’\'])((?:[Хх]а|[Бб]э|[Вв]э|[Лл]а|[Бб]а|[Лл]э|[Уу]|[Шш]э)?)([Пп])аз(а|от|ийот|ит|и)(?![а-яё])')],
        }
    raise Fail('UNKNOWN_RULE ' + rule)


def phase_repl(m):
    p = m.group(2)
    f = {'P': 'F', 'p': 'f', 'П': 'Ф', 'п': 'ф'}[p]
    return m.group(1) + f + ('az' if p in 'Pp' else 'аз') + m.group(3)


def apply_rule_value(rule, field, value, extra_pairs=None):
    value = nfc(value)
    if rule == 'akhuz':
        if field != 'he_niqqud':
            return value
        for a, b in extra_pairs:
            value = value.replace(nfc(a), nfc(b))
        return value
    for kind in regex_rules(rule).get(field, []):
        if kind[0] == 're':
            value = re.sub(kind[1], phase_repl, value)
        else:
            value = value.replace(kind[0], kind[1])
    return value


def gavoah(value, field):
    value = nfc(value)
    if field == 'he_niqqud':
        return re.sub(nfc('גָּבוֹהַ') + '(?!ּ)', nfc('גָּבוֹהַּ'), value)
    if field == 'translit':
        return re.sub(r'(?<![A-Za-z])([Gg])avoha(?![a-z])', r'\1avoah', value)
    if field == 'translit_ru':
        return re.sub(r'(?<![а-яё])([Гг])авоха(?![а-яё])', r'\1авоах', value)
    return value


def apply(sections, idx, dispositions, findings):
    """Mutates sections. Returns a change log [{finding, target, field, before, after}]."""
    log = []
    fby = {f['finding_id']: f for f in findings}

    def record(fid, target, field, node, before, after, letters_ok):
        if before == after:
            return False
        if field == 'he_niqqud' and not letters_ok:
            check(skeleton(nfc(before)) == skeleton(after), f'LETTERS_CHANGED {fid} {target}')
        node[field] = after
        mark = node.setdefault('rc33_correction', {'finding_ids': [], 'fields': []})
        if fid not in mark['finding_ids']:
            mark['finding_ids'].append(fid)
        if field not in mark['fields']:
            mark['fields'].append(field)
        log.append({'finding': fid, 'target': target, 'field': field, 'before': before, 'after': after})
        return True

    for fid, d in dispositions.items():
        if d['action'] != 'fix':
            continue
        f = fby.get(fid)
        check(f and f['category'] == 'confirmed_atlas_defect', 'NOT_A_CONFIRMED_FINDING ' + fid)
        he_changes = {op.get('target') for op in d['ops'] if op.get('field') == 'he'}
        for op in d['ops']:
            kind = op['op']
            if kind == 'sub' and op['target'].startswith('term:'):
                for sid, term in term_copies(sections, op['target'][5:]):
                    if op['field'] == 'source_definition_ru':
                        hit = 0
                        for sense in term.get('senses', []):
                            defs = sense.get('source_definition_ru') or []
                            for i, v in enumerate(defs):
                                if nfc(op['from']) in nfc(v):
                                    defs[i] = count_sub(v, op['from'], op['to'], '+', fid)
                                    hit += 1
                                    log.append({'finding': fid, 'target': op['target'] + '@' + sid, 'field': 'source_definition_ru', 'before': v, 'after': defs[i]})
                        continue
                    v = term.get(op['field'])
                    if isinstance(v, str) and nfc(op['from']) in nfc(v):
                        after = count_sub(v, op['from'], op['to'], '+', fid)
                        if op['field'] == 'niqqud':
                            check(skeleton(nfc(v)) == skeleton(after), 'TERM_LETTERS_CHANGED ' + fid)
                        term[op['field']] = after
                        log.append({'finding': fid, 'target': op['target'] + '@' + sid, 'field': op['field'], 'before': v, 'after': after})
                check(any(e['finding'] == fid and e['target'].startswith(op['target'] + '@') and (e['field'] == op['field']) for e in log),
                      f'TERM_NO_MATCH {fid} {op["target"]} {op["field"]}')
                continue
            if kind in ('sub', 'set'):
                copies = node_copies(idx, op['target'])
                field = op['field']
                befores = {json.dumps(c.get(field), ensure_ascii=False) for c in copies}
                check(len(befores) == 1, f'COPIES_DIFFER {fid} {op["target"]} {field}')
                for c in copies:
                    before = c.get(field)
                    if kind == 'set':
                        check(before == op['expect'] or (op['expect'] is None and not before), f'SET_EXPECT {fid} {op["target"]} {field}')
                        after = nfc(op['value'])
                    else:
                        check(isinstance(before, str), f'NO_FIELD {fid} {op["target"]} {field}')
                        after = count_sub(before, op['from'], op['to'], op['n'], f'{fid} {op["target"]} {field}')
                    if not record(fid, op['target'], field, c, before, after, op['target'] in he_changes or kind == 'set'):
                        check(kind == 'set', f'NO_CHANGE {fid} {op["target"]} {field}')
                continue
            if kind == 'subs':
                for c in node_copies(idx, op['target']):
                    before = c[op['field']]
                    after = nfc(before)
                    for a, b in op['pairs']:
                        after = after.replace(nfc(a), nfc(b))
                    check(after != nfc(before), f'SUBS_NO_MATCH {fid} {op["target"]}')
                    record(fid, op['target'], op['field'], c, before, after, False)
                continue
            if kind == 'subs_any':
                for t in op['targets']:
                    if t.startswith('term:'):
                        for sid, term in term_copies(sections, t[5:]):
                            for k in ['niqqud', 'translit', 'translit_ru']:
                                v = term.get(k)
                                if isinstance(v, str):
                                    after = nfc(v)
                                    for a, b in op['pairs']:
                                        after = after.replace(nfc(a), nfc(b))
                                    if after != nfc(v):
                                        term[k] = after
                                        log.append({'finding': fid, 'target': t + '@' + sid, 'field': k, 'before': v, 'after': after})
                    else:
                        for c in node_copies(idx, t):
                            for k in ['he_niqqud', 'translit', 'translit_ru']:
                                v = c.get(k)
                                if isinstance(v, str):
                                    after = nfc(v)
                                    for a, b in op['pairs']:
                                        after = after.replace(nfc(a), nfc(b))
                                    record(fid, t, k, c, v, after, False)
                continue
            if kind == 'gavoah':
                changed = False
                for c in node_copies(idx, op['target']):
                    for k in ['he_niqqud', 'translit', 'translit_ru']:
                        if isinstance(c.get(k), str):
                            changed |= record(fid, op['target'], k, c, c[k], gavoah(c[k], k), False)
                check(changed, 'GAVOAH_NO_MATCH ' + op['target'])
                continue
            if kind == 'rule':
                changed_targets = 0
                for t in f['targets']:
                    short = t.replace('a97001:', '', 1)
                    hit = False
                    if short.startswith('term:'):
                        for sid, term in term_copies(sections, short[5:]):
                            for k, nk in [('niqqud', 'he_niqqud'), ('translit', 'translit'), ('translit_ru', 'translit_ru')]:
                                v = term.get(k)
                                if isinstance(v, str):
                                    after = apply_rule_value(op['rule'], nk, v, op.get('pairs'))
                                    if after != nfc(v):
                                        if k == 'niqqud':
                                            check(skeleton(nfc(v)) == skeleton(after), 'TERM_LETTERS_CHANGED ' + fid)
                                        term[k] = after
                                        hit = True
                                        log.append({'finding': fid, 'target': short + '@' + sid, 'field': k, 'before': v, 'after': after})
                    else:
                        for c in node_copies(idx, short):
                            for k in ['he_niqqud', 'translit', 'translit_ru']:
                                if isinstance(c.get(k), str):
                                    hit |= record(fid, short, k, c, c[k], apply_rule_value(op['rule'], k, c[k], op.get('pairs')), False)
                    changed_targets += hit
                check(changed_targets >= 1, 'RULE_NO_MATCH ' + fid)
                d.setdefault('rule_report', {})['targets_changed'] = changed_targets
                d['rule_report']['targets_total'] = len(f['targets'])
                continue
            if kind == 'flag':
                for c in node_copies(idx, op['target']):
                    check(op['key'] not in c, 'FLAG_EXISTS ' + fid)
                    c[op['key']] = copy.deepcopy(op['value'])
                    c.setdefault('rc33_correction', {'finding_ids': [], 'fields': []})['finding_ids'].append(fid)
                log.append({'finding': fid, 'target': op['target'], 'field': op['key'], 'before': None, 'after': op['value']})
                continue
            if kind == 'note':
                hits = []

                def walk(o):
                    if isinstance(o, dict):
                        if o.get('id') == op['id'] and isinstance(o.get('text'), str):
                            hits.append(o)
                        for v in o.values():
                            walk(v)
                    elif isinstance(o, list):
                        for v in o:
                            walk(v)
                for s in sections.values():
                    walk(s)
                check(hits, 'NOTE_NOT_FOUND ' + fid)
                for o in hits:
                    before = o['text']
                    o['text'] = count_sub(before, op['from'], op['to'], 1, fid)
                    log.append({'finding': fid, 'target': op['id'], 'field': 'text', 'before': before, 'after': o['text']})
                continue
            raise Fail('UNKNOWN_OP ' + kind)
    return log
