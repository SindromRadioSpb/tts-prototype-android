"""Content-pack validator: every error code, the Review Focus cases, and a clean pack."""
import contextlib
import copy
import hashlib
import io
import json
import os
import shutil
import tempfile
import unittest

import atlas_validate as V

ST = {'language_review': 'producer_checked'}
PAGE = {'type': 'page', 'id': 'a97002:p197', 'page': 197, 'image': 'assets/' + 'a' * 64 + '.png', 'has_text_layer': True}
SOURCE = [
    PAGE,
    {'type': 'block', 'id': 'a97002:p197:b001', 'page': 197, 'bbox': [460, 90, 553, 111], 'he_raw': 'יחס תמסורת',
     'kind_guess': 'heading', 'order': 1},
    {'type': 'block', 'id': 'a97002:p197:b002', 'page': 197, 'bbox': [56, 120, 553, 160],
     'he_raw': ')ניתן לשנות את (2 מרכיבי ההספק 0,05 גלגלי הממסרת.', 'kind_guess': 'prose', 'order': 2},
    {'type': 'formula', 'id': 'a97002:p197:f01', 'page': 197, 'bbox': [333, 438, 411, 471], 'source_text': '𝑖= 𝑑∙(1 −𝜉) 𝐷',
     'crop': 'assets/' + 'b' * 64 + '.png'},
    {'type': 'symbol', 'id': 'a97002:p197:st1:s01', 'formula_id': 'a97002:p197:f01', 'page': 197, 'bbox': [300, 480, 553, 495],
     'symbol_raw': 'd', 'description_he_raw': 'קוטר גלגל מניע', 'unit_raw': 'mm'},
    {'type': 'symbol', 'id': 'a97002:p197:st1:s02', 'formula_id': 'a97002:p197:f01', 'page': 197, 'bbox': [300, 496, 553, 511],
     'symbol_raw': 'D', 'description_he_raw': 'קוטר גלגל מונע', 'unit_raw': 'mm'},
    {'type': 'symbol', 'id': 'a97002:p197:st1:s03', 'formula_id': None, 'page': 197, 'bbox': [300, 512, 553, 527],
     'symbol_raw': 'ξ', 'description_he_raw': 'מקדם החלקה', 'unit_raw': ''},
    {'type': 'figure', 'id': 'a97002:p197:fig79', 'page': 197, 'bbox': [189, 269, 406, 383],
     'crop': 'assets/' + 'c' * 64 + '.png', 'number': 79, 'caption_block_id': None},
]
MANIFEST = {'schema': 'linguistpro.atlas-source-pack.1.0.0', 'atlas_id': 'a97002',
            'source': {'filename': 'x.pdf', 'sha256': 'e' * 64, 'page_count': 564, 'page_size_pt': [595, 842]},
            'extractor': {'version': '1.0.0'}, 'pages': [197], 'logo_xref_digests': [], 'warnings': []}

TERM = {'type': 'term', 'id': 'a97002:term:galgal-mania', 'lemma_he': 'גלגל מניע', 'niqqud': 'גַּלְגַּל מֵנִיעַ',
        'translit': "galgal meni'a", 'senses': [{'sense': 'driving-pulley', 'ru': 'ведущий шкив', 'context': 'ремённая передача'}]}


def clean_content():
    return [
        {'type': 'block', 'id': 'a97002:p197:b001', 'kind': 'heading', 'he': 'יחס תמסורת', 'he_niqqud': 'יַחַס תִּמְסֹרֶת',
         'translit': 'yakhas timsoret', 'translit_ru': 'яхас тимсорет', 'ru': 'Передаточное отношение', 'terms': [], 'status': dict(ST)},
        {'type': 'block', 'id': 'a97002:p197:b002', 'kind': 'prose', 'he': 'ניתן לשנות את (2 מרכיבי ההספק) 0,05 גלגלי הממסרת.',
         'he_niqqud': 'נִתָּן לְשַׁנּוֹת אֶת (2 מַרְכִּיבֵי הַהֶסְפֵּק) 0,05 גַּלְגַּלֵּי הַמִּמְסֶרֶת.',
         'translit': 'nitan leshanot', 'translit_ru': 'нитан', 'ru': 'Можно изменить 2 составляющие мощности 0.05 ведущий шкив передачи.',
         'terms': ['a97002:term:galgal-mania#driving-pulley'], 'status': dict(ST)},
        {'type': 'formula', 'id': 'a97002:p197:f01', 'display_latex': 'i=\\frac{d(1-\\xi)}{D}', 'compute': 'd*(1-xi)/D',
         'symbols': ['a97002:p197:st1:s03'], 'status': dict(ST)},
        {'type': 'symbol', 'id': 'a97002:p197:st1:s01', 'symbol_latex': 'd', 'var': 'd', 'description_he': 'קוטר גלגל מניע',
         'description_ru': 'диаметр ведущего шкива', 'unit': 'mm', 'term': 'a97002:term:galgal-mania#driving-pulley'},
        {'type': 'symbol', 'id': 'a97002:p197:st1:s02', 'symbol_latex': 'D', 'var': 'D', 'description_he': 'קוטר גלגל מונע',
         'description_ru': 'диаметр ведомого шкива', 'unit': 'mm'},
        {'type': 'symbol', 'id': 'a97002:p197:st1:s03', 'symbol_latex': '\\xi', 'var': 'xi', 'description_he': 'מקדם החלקה',
         'description_ru': 'коэффициент проскальзывания', 'unit': ''},
        {'type': 'figure', 'id': 'a97002:p197:fig79', 'caption_he': 'תמסורת רצועה', 'caption_ru': 'Ременная передача'},
        {'type': 'region', 'id': 'new:a97002:p197:fig79:shkiv-small', 'parent': 'a97002:p197:fig79', 'bbox': [340, 290, 400, 340],
         'label_he': 'גלגל מניע', 'label_ru': 'ведущий шкив', 'links': ['a97002:p197:st1:s01'], 'status': {'recognition': 'ocr_high'}},
        TERM,
        {'type': 'example', 'id': 'new:a97002:p197:demo', 'steps': [{'compute': 'a*b', 'bindings': {'a': 2, 'b': 3}, 'printed': '6'}]},
        {'type': 'erratum', 'id': 'new:a97002:p197:ratio-sign', 'page': 197, 'target': 'a97002:p197:f01',
         'as_printed': 'i = d(1-ξ)/D', 'proposed': 'i = d(1-ξ)/D', 'explanation_ru': 'пример'},
        {'type': 'report', 'discrepancies': []},
    ]


class Pack:
    def __init__(self, test):
        self.dir = tempfile.mkdtemp(prefix='atlas-val-')
        test.addCleanup(shutil.rmtree, self.dir, True)
        src = os.path.join(self.dir, 'source')
        os.makedirs(src)
        with open(os.path.join(src, 'pages.jsonl'), 'wb') as fh:
            for obj in SOURCE:
                fh.write((json.dumps(obj, ensure_ascii=False) + '\n').encode('utf-8'))
        with open(os.path.join(src, 'manifest.json'), 'w', encoding='utf-8') as fh:
            json.dump(MANIFEST, fh)
        self.source = V.load_source_pack(src)

    def header(self, **over):
        h = {'type': 'header', 'schema': 'linguistpro.atlas-content-pack.1.0.0', 'atlas_id': 'a97002',
             'source_pack_sha256': self.source.pages_sha256, 'producer': 'test', 'produced_at': '2026-10-31T00:00:00Z', 'pages': [197]}
        h.update(over)
        return h

    def write(self, objs, header=None, raw=None):
        path = os.path.join(self.dir, 'content.jsonl')
        with open(path, 'wb') as fh:
            if raw is not None:
                fh.write(raw)
            else:
                for obj in [header or self.header()] + objs:
                    fh.write((json.dumps(obj, ensure_ascii=False) + '\n').encode('utf-8'))
        return path

    def run(self, objs=None, header=None, raw=None):
        return V.validate(self.source, self.write(clean_content() if objs is None else objs, header, raw))


def codes(report, kind='errors'):
    return sorted({f['code'] for f in report[kind]})


def edit(objs, obj_id, **changes):
    objs = copy.deepcopy(objs)
    for obj in objs:
        if obj.get('id') == obj_id:
            for k, v in changes.items():
                if v is None:
                    obj.pop(k, None)
                else:
                    obj[k] = v
    return objs


class CleanTest(unittest.TestCase):
    def test_clean_pack_ok(self):
        report = Pack(self).run()
        self.assertEqual(report['errors'], [], report['errors'])
        self.assertTrue(report['ok'])
        self.assertEqual(codes(report, 'findings'), ['F_CORE_VERIFIED'])

    def test_source_hash_ignores_crlf(self):
        pack = Pack(self)
        path = os.path.join(pack.dir, 'source', 'pages.jsonl')
        with open(path, 'rb') as fh:
            data = fh.read()
        with open(path, 'wb') as fh:
            fh.write(data.replace(b'\n', b'\r\n'))
        self.assertEqual(V.load_source_pack(os.path.dirname(path)).pages_sha256, pack.source.pages_sha256)
        self.assertEqual(pack.source.pages_sha256, hashlib.sha256(data).hexdigest())


class ParseAndHeaderTest(unittest.TestCase):
    def test_bom_crlf_blank_lines_ok(self):
        pack = Pack(self)
        lines = [json.dumps(o, ensure_ascii=False) for o in [pack.header()] + clean_content()]
        raw = ('﻿' + '\r\n\r\n'.join(lines) + '\r\n\r\n').encode('utf-8')
        self.assertTrue(pack.run(raw=raw)['ok'])

    def test_parse_error_has_line_number(self):
        pack = Pack(self)
        lines = [json.dumps(o, ensure_ascii=False) for o in [pack.header()] + clean_content()]
        lines.insert(3, '{oops')
        report = pack.run(raw='\n'.join(lines).encode('utf-8'))
        parse = [f for f in report['errors'] if f['code'] == 'E_PARSE']
        self.assertEqual(len(parse), 1)
        self.assertEqual(parse[0]['line'], 4)

    def test_schema_error(self):
        self.assertIn('E_SCHEMA', codes(Pack(self).run(edit(clean_content(), 'a97002:p197:b001', kind='paragraph'))))

    def test_header_must_be_first(self):
        pack = Pack(self)
        objs = clean_content()
        report = pack.run(raw=('\n'.join(json.dumps(o, ensure_ascii=False) for o in objs + [pack.header()])).encode('utf-8'))
        self.assertIn('E_HEADER', codes(report))

    def test_stale_source_pack_stops_early(self):
        pack = Pack(self)
        report = pack.run(header=pack.header(source_pack_sha256='0' * 64))
        self.assertEqual(codes(report), ['E_SOURCE_MISMATCH'])


class IdTest(unittest.TestCase):
    def test_unknown_id(self):
        self.assertIn('E_UNKNOWN_ID', codes(Pack(self).run(edit(clean_content(), 'a97002:p197:b002', id='a97002:p197:b009'))))

    def test_type_mismatch(self):
        objs = clean_content() + [{'type': 'figure', 'id': 'a97002:p197:fig79x', 'caption_he': '', 'caption_ru': ''}]
        objs[-1]['id'] = 'a97002:p197:fig80'
        self.assertIn('E_UNKNOWN_ID', codes(Pack(self).run(objs)))
        objs2 = clean_content() + [{'type': 'block', 'id': 'a97002:p197:b001', 'kind': 'heading', 'he': 'x', 'he_niqqud': 'x',
                                    'translit': 'x', 'ru': 'x', 'status': dict(ST)}]
        self.assertIn('E_DUPLICATE_ID', codes(Pack(self).run(objs2)))

    def test_type_mismatch_code(self):
        # ID patterns are per type, so the schema already rejects a figure posing as formula f01
        objs = edit(clean_content(), 'a97002:p197:fig79', id='a97002:p197:f01')
        self.assertIn('E_SCHEMA', codes(Pack(self).run(objs)))

    def test_new_id_parent_missing_or_duplicate_label(self):
        objs = edit(clean_content(), 'new:a97002:p197:fig79:shkiv-small', id='new:a97002:p197:fig81:shkiv-small',
                    parent='a97002:p197:fig81')
        self.assertIn('E_NEW_ID', codes(Pack(self).run(objs)))
        dup = clean_content()
        dup.append(copy.deepcopy([o for o in dup if o['type'] == 'region'][0]))
        # a repeated label under one parent is a repeated temporary ID
        self.assertIn('E_DUPLICATE_ID', codes(Pack(self).run(dup)))

    def test_new_id_must_match_parent_field(self):
        objs = edit(clean_content(), 'new:a97002:p197:fig79:shkiv-small', parent='a97002:p197')
        self.assertIn('E_NEW_ID', codes(Pack(self).run(objs)))

    def test_pixel_bbox_rejected_with_hint(self):
        px = [round(v * 200 / 72) for v in [340 - 189, 290 - 269, 400 - 189, 340 - 269]]
        report = Pack(self).run(edit(clean_content(), 'new:a97002:p197:fig79:shkiv-small', bbox=px))
        bad = [f for f in report['errors'] if f['code'] == 'E_BBOX_OUTSIDE']
        self.assertEqual(len(bad), 1)
        self.assertIn('пункт', bad[0]['message'])


class StatusTest(unittest.TestCase):
    def test_owner_axes_forbidden(self):
        for status in ({'owner_status': 'owner_confirmed'}, {'language_review': 'owner_reviewed'}, {'math_review': 'core_verified'}):
            report = Pack(self).run(edit(clean_content(), 'a97002:p197:b001', status=status))
            self.assertIn('E_STATUS_OWNER', codes(report), status)

    def test_recognition_rules(self):
        report = Pack(self).run(edit(clean_content(), 'a97002:p197:b001', status={'recognition': 'ocr_high'}))
        self.assertIn('E_STATUS_RECOGNITION', codes(report))
        report = Pack(self).run(edit(clean_content(), 'new:a97002:p197:fig79:shkiv-small', status={'recognition': 'extracted'}))
        self.assertIn('E_STATUS_RECOGNITION', codes(report))


class TextTest(unittest.TestCase):
    def test_coverage(self):
        objs = [o for o in clean_content() if o.get('id') != 'a97002:p197:b002']
        self.assertIn('E_COVERAGE', codes(Pack(self).run(objs)))
        self.assertIn('E_COVERAGE', codes(Pack(self).run(edit(clean_content(), 'a97002:p197:b001', ru=''))))

    def test_dropped_word_rejected(self):
        report = Pack(self).run(edit(clean_content(), 'a97002:p197:b002', he='ניתן לשנות את (2 מרכיבי) 0,05 גלגלי הממסרת.',
                                     he_niqqud='ניתן לשנות את (2 מרכיבי) 0,05 גלגלי הממסרת.'))
        self.assertIn('E_HEBREW_LETTERS', codes(report))

    def test_swapped_words_rejected(self):
        he = 'ניתן לשנות את (2 ההספק מרכיבי) 0,05 גלגלי הממסרת.'
        report = Pack(self).run(edit(clean_content(), 'a97002:p197:b002', he=he, he_niqqud=he))
        self.assertEqual(codes(report), ['E_HEBREW_ORDER'])

    def test_fix_note_turns_letter_errors_into_warnings(self):
        he = 'ניתן לשנות את (2 ההספק מרכיבי) 0,05 גלגלי הממסרת.'
        report = Pack(self).run(edit(clean_content(), 'a97002:p197:b002', he=he, he_niqqud=he, he_fix_note='порядок по изображению'))
        self.assertTrue(report['ok'])
        self.assertIn('W_HEBREW_ORDER_FIXED', codes(report, 'warnings'))

    def test_moved_period_mirrored_parens_and_split_words_ok(self):
        # he_raw has ')…(' mirrored and a trailing period elsewhere; dots writes them correctly, words re-split
        he = 'ניתן לשנות את(2 מרכיבי ההספק) 0,05 גלגלי הממסרת'
        self.assertTrue(Pack(self).run(edit(clean_content(), 'a97002:p197:b002', he=he, he_niqqud=he))['ok'])

    def test_niqqud_base_mismatch(self):
        self.assertIn('E_NIQQUD_BASE', codes(Pack(self).run(edit(clean_content(), 'a97002:p197:b001', he_niqqud='יַחַס תִּמְסֹרֶה'))))

    def test_decimal_comma_accepted(self):
        self.assertTrue(Pack(self).run(edit(clean_content(), 'a97002:p197:b002',
                                            ru='Можно изменить 2 составляющие мощности 0,05 ведущий шкив передачи.'))['ok'])

    def test_missing_number_rejected(self):
        report = Pack(self).run(edit(clean_content(), 'a97002:p197:b002', ru='Можно изменить составляющие мощности 0.05 ведущий шкив.'))
        self.assertIn('E_NUMBERS', codes(report))


class RefTermTest(unittest.TestCase):
    def test_bad_refs(self):
        self.assertIn('E_REF', codes(Pack(self).run(edit(clean_content(), 'a97002:p197:b002', terms=['a97002:term:nope#x']))))
        self.assertIn('E_REF', codes(Pack(self).run(edit(clean_content(), 'a97002:p197:b002', terms=['a97002:term:galgal-mania#nope']))))
        self.assertIn('E_REF', codes(Pack(self).run(edit(clean_content(), 'new:a97002:p197:fig79:shkiv-small', links=['a97002:p197:st9:s01']))))
        self.assertIn('E_REF', codes(Pack(self).run(edit(clean_content(), 'new:a97002:p197:ratio-sign', target='a97002:p197:f07'))))

    def test_term_rules(self):
        objs = clean_content() + [copy.deepcopy(TERM)]
        self.assertIn('E_TERM', codes(Pack(self).run(objs)))
        two = copy.deepcopy(TERM)
        two['senses'].append(dict(two['senses'][0]))
        self.assertIn('E_TERM', codes(Pack(self).run(edit(clean_content(), TERM['id'], senses=two['senses']))))

    def test_unused_term_warns(self):
        extra = dict(copy.deepcopy(TERM), id='a97002:term:retsua')
        self.assertIn('W_TERM_UNUSED', codes(Pack(self).run(clean_content() + [extra]), 'warnings'))

    def test_term_ru_stem_warning(self):
        report = Pack(self).run(edit(clean_content(), 'a97002:p197:b002', ru='Можно изменить 2 составляющие 0.05 колеса передачи.'))
        self.assertTrue(report['ok'])
        self.assertIn('W_TERM_RU', codes(report, 'warnings'))


class SymbolFormulaTest(unittest.TestCase):
    def test_compute_errors(self):
        for change in ({'compute': 'd*(1-xi)/Q'}, {'compute': 'd*('}, {'compute': 'd*sin(xi)/D'}, {'compute': None, 'compute_absent_reason': None}):
            objs = edit(clean_content(), 'a97002:p197:f01', **{k: v for k, v in change.items() if v is not None})
            if change.get('compute', 1) is None:
                for o in objs:
                    if o.get('id') == 'a97002:p197:f01':
                        o['compute'] = None
                        o.pop('compute_absent_reason', None)
            self.assertIn('E_COMPUTE', codes(Pack(self).run(objs)), change)

    def test_compute_absent_with_reason_ok(self):
        objs = edit(clean_content(), 'a97002:p197:f01', compute_absent_reason='выбор из таблицы')
        for o in objs:
            if o.get('id') == 'a97002:p197:f01':
                o['compute'] = None
        self.assertTrue(Pack(self).run(objs)['ok'])

    def test_trig_with_angle_unit_ok(self):
        objs = edit(clean_content(), 'a97002:p197:f01', compute='d*sin(xi)/D', angle_unit='deg')
        self.assertTrue(Pack(self).run(objs)['ok'])

    def test_symbol_binding_rules(self):
        report = Pack(self).run(edit(clean_content(), 'a97002:p197:st1:s01', formula_id='a97002:p197:f02'))
        self.assertIn('E_SYMBOL_BINDING', codes(report))
        report = Pack(self).run(edit(clean_content(), 'a97002:p197:st1:s03', formula_id='a97002:p197:f01'))
        self.assertTrue(report['ok'])
        self.assertIn('W_SYMBOL_BOUND_BY_PRODUCER', codes(report, 'warnings'))

    def test_unused_symbol_warns(self):
        report = Pack(self).run(edit(clean_content(), 'a97002:p197:f01', compute='d/D', symbols=['a97002:p197:st1:s03']))
        self.assertIn('W_SYMBOL_UNUSED', codes(report, 'warnings'))


class LocalVarsTest(unittest.TestCase):
    LOCAL = [{'var': 'n_out', 'symbol_latex': 'n_{out}', 'description_ru': 'частота вращения ведомого', 'unit': 'rpm'},
             {'var': 'n_in', 'symbol_latex': 'n_{in}', 'description_ru': 'частота вращения ведущего', 'unit': 'rpm'},
             {'var': 'i', 'symbol_latex': 'i', 'description_ru': 'передаточное отношение', 'unit': ''}]

    def formula(self, **changes):
        objs = edit(clean_content(), 'a97002:p197:f01', compute='n_out/n_in', symbols=None, local_vars=self.LOCAL, result_var='i')
        return edit(objs, 'a97002:p197:f01', **changes) if changes else objs

    def test_local_vars_allow_compute_without_a_symbol_table(self):
        # page 197 has no symbol table: the formula declares its own variables
        objs = [o for o in self.formula() if o['type'] != 'symbol' or o['id'] != 'a97002:p197:st1:s03']
        report = Pack(self).run(objs)
        self.assertTrue(report['ok'], report['errors'])

    def test_result_var_is_not_reported_unused(self):
        report = Pack(self).run(self.formula())
        unused = [f['message'] for f in report['warnings'] if f['code'] == 'W_SYMBOL_UNUSED']
        self.assertFalse(any(' i ' in m for m in unused), unused)

    def test_result_var_must_be_known(self):
        self.assertIn('E_COMPUTE', codes(Pack(self).run(self.formula(result_var='q'))))

    def test_duplicate_local_var(self):
        twice = self.LOCAL + [dict(self.LOCAL[0])]
        self.assertIn('E_COMPUTE', codes(Pack(self).run(self.formula(local_vars=twice))))

    def test_term_stem_tolerates_declension(self):
        # term sense 'ремень' must be recognised in 'Длина ремня'
        self.assertTrue(V._ru_has_stem('Длина ремня', 'ремень'))
        self.assertTrue(V._ru_has_stem('большой ведущий шкив', 'ведущий шкив'))
        self.assertFalse(V._ru_has_stem('колеса передачи', 'ведущий шкив'))


class CoreTest(unittest.TestCase):
    def test_core_mismatch_is_finding_not_error(self):
        step = {'compute': 'x*Fr+y*Fa', 'bindings': {'x': 0.56, 'Fr': 2000, 'y': 2, 'Fa': 600}, 'printed': '2200'}
        report = Pack(self).run(edit(clean_content(), 'new:a97002:p197:demo', steps=[step]))
        self.assertTrue(report['ok'])
        self.assertEqual(codes(report, 'findings'), ['F_CORE_MISMATCH'])

    def test_step_compute_error(self):
        step = {'compute': 'a*', 'bindings': {'a': 2}, 'printed': '6'}
        self.assertIn('E_COMPUTE', codes(Pack(self).run(edit(clean_content(), 'new:a97002:p197:demo', steps=[step]))))


class WarningTest(unittest.TestCase):
    def test_translit_ru_and_figure_regions(self):
        objs = edit(clean_content(), 'a97002:p197:b001', translit_ru=None)
        objs = [o for o in objs if o['type'] != 'region']
        report = Pack(self).run(objs)
        self.assertTrue(report['ok'])
        self.assertIn('W_TRANSLIT_RU_MISSING', codes(report, 'warnings'))
        self.assertIn('W_FIGURE_NO_REGIONS', codes(report, 'warnings'))


class CliTest(unittest.TestCase):
    def test_cli_exit_codes(self):
        pack = Pack(self)
        good = pack.write(clean_content())
        src = os.path.join(pack.dir, 'source')
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(V.main(['--source', src, '--content', good, '--json']), 0)
            bad = pack.write(edit(clean_content(), 'a97002:p197:b001', ru=''))
            self.assertEqual(V.main(['--source', src, '--content', bad]), 1)
        self.assertIn('E_COVERAGE', out.getvalue())


if __name__ == '__main__':
    unittest.main()
