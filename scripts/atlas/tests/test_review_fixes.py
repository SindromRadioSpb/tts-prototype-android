"""Regression tests for the final-review findings (2026-10-31)."""
import copy
import json
import os
import unittest

import atlas_compute as C
import atlas_import as I
import atlas_schema as S
import atlas_validate as V
from tests.test_validate import Pack, clean_content, codes, edit

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'atlas', 'a97002', 'pilot'))


class OffHeaderPagesTest(unittest.TestCase):
    def test_text_checks_run_on_blocks_outside_header_pages(self):
        # a supplier may leave a page out of header.pages; its blocks must still be checked
        pack = Pack(self)
        header = pack.header(pages=[7])  # 197 not listed
        bad = edit(clean_content(), 'a97002:p197:b002', he='ניתן לשנות את (2 מרכיבי) 0,05 גלגלי הממסרת.',
                   he_niqqud='ניתן לשנות את (2 מרכיבי) 0,05 גלגלי הממסרת.', ru='Можно изменить без чисел.')
        report = pack.run(bad, header=header)
        self.assertIn('E_HEBREW_LETTERS', codes(report))
        self.assertIn('E_NUMBERS', codes(report))
        self.assertNotIn('E_COVERAGE', codes(report))  # coverage is still limited to header.pages


class RecognitionImportTest(unittest.TestCase):
    def test_new_object_without_recognition_is_not_extracted(self):
        pack = Pack(self)
        objs = edit(clean_content(), 'new:a97002:p197:fig79:shkiv-small', status={'language_review': 'producer_checked'})
        graph, _ = I.build_graph(pack.source, pack.write(objs))
        self.assertEqual(graph['objects']['a97002:p197:fig79:r-shkiv-small']['status']['recognition'], 'ocr_low')


class AnchoredPrintedTest(unittest.TestCase):
    def test_invented_printed_value_is_not_verified(self):
        source = V.load_source_pack(os.path.join(ROOT, 'source-pack'))
        with open(os.path.join(ROOT, 'reference', 'reference-content.jsonl'), encoding='utf-8') as fh:
            objs = [json.loads(line) for line in fh if line.strip()]
        for obj in objs:
            if obj.get('id') == 'new:a97002:p287:example-2':
                obj['steps'][2]['printed'] = '2320'  # not printed anywhere in the book
        path = os.path.join(Pack(self).dir, 'tampered.jsonl')
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(json.dumps(o, ensure_ascii=False) for o in objs))
        report = V.validate(source, path)
        step3 = [f for f in report['findings'] if f['ref'].endswith('#step3')]
        self.assertEqual([f['code'] for f in step3], ['F_CORE_UNANCHORED'])
        self.assertIn('W_PRINTED_UNANCHORED', codes(report, 'warnings'))
        graph, _ = I.build_graph(source, path)
        example = graph['objects']['a97002:p287:x-example-2']
        self.assertEqual(example['steps'][2]['math_review'], 'unchecked')

    def test_reference_steps_are_anchored(self):
        report = V.validate(V.load_source_pack(os.path.join(ROOT, 'source-pack')),
                            os.path.join(ROOT, 'reference', 'reference-content.jsonl'))
        self.assertEqual(sorted(f['code'] for f in report['findings']), ['F_CORE_MISMATCH', 'F_CORE_VERIFIED', 'F_CORE_VERIFIED'])


class ReservedNamesTest(unittest.TestCase):
    def test_compute_rejects_constant_names_as_bindings(self):
        with self.assertRaises(C.ComputeError) as ctx:
            C.evaluate('e*2', {'e': 5})
        self.assertEqual(ctx.exception.code, 'RESERVED_NAME')

    def test_validator_rejects_e_and_pi_as_variables(self):
        report = Pack(self).run(edit(clean_content(), 'a97002:p197:st1:s03', var='e'))
        self.assertIn('E_COMPUTE', codes(report))
        step = {'compute': 'Fa/Fr', 'bindings': {'Fa': 600, 'Fr': 2000, 'pi': 3}, 'printed': '0.3'}
        self.assertIn('E_COMPUTE', codes(Pack(self).run(edit(clean_content(), 'new:a97002:p197:demo', steps=[step]))))


class EncodingTest(unittest.TestCase):
    def test_utf16_file_is_reported_not_crashing(self):
        pack = Pack(self)
        text = '\n'.join(json.dumps(o, ensure_ascii=False) for o in [pack.header()] + clean_content())
        report = pack.run(raw=text.encode('utf-16'))
        self.assertEqual(codes(report), ['E_PARSE'])
        self.assertIn('UTF-16', report['errors'][0]['message'])

    def test_bad_byte_reports_its_line_and_checks_the_rest(self):
        pack = Pack(self)
        lines = [json.dumps(o, ensure_ascii=False).encode('utf-8') for o in [pack.header()] + clean_content()]
        lines.insert(2, b'{"type": "report", "discrepancies": [{"ref": "x", "note": "\xff\xfe"}]}')
        report = pack.run(raw=b'\n'.join(lines))
        parse = [f for f in report['errors'] if f['code'] == 'E_PARSE']
        self.assertEqual([f['line'] for f in parse], [3])
        self.assertEqual([c for c in codes(report) if c != 'E_PARSE'], [])
        self.assertIn('F_CORE_VERIFIED', codes(report, 'findings'))  # the rest of the file was checked

    def test_read_jsonl_reports_utf16(self):
        path = os.path.join(Pack(self).dir, 'u16.jsonl')
        with open(path, 'wb') as fh:
            fh.write('{"a": 1}\n'.encode('utf-16'))
        rows, errors = S.read_jsonl(path)
        self.assertEqual(rows, [])
        self.assertIn('UTF-16', errors[0])


class TableFigureTest(unittest.TestCase):
    def test_figure_holding_a_table_needs_no_regions(self):
        objs = [o for o in clean_content() if o['type'] != 'region']
        objs.append({'type': 'table', 'id': 'new:a97002:p197:fig79:values', 'parent': 'a97002:p197:fig79',
                     'bbox': [190, 270, 400, 380], 'cells': [{'row': 0, 'col': 0, 'rowspan': 1, 'colspan': 1, 'he': '1', 'ru': '1'}],
                     'status': {'recognition': 'ocr_high'}})
        self.assertNotIn('W_FIGURE_NO_REGIONS', codes(Pack(self).run(objs), 'warnings'))


class SupplierDocsTest(unittest.TestCase):
    def test_readme_and_task_name_the_same_file(self):
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        readme = open(os.path.join(here, 'README.dots.ru.md'), encoding='utf-8').read()
        task = open(os.path.join(here, 'TASK.pilot.ru.md'), encoding='utf-8').read()
        self.assertIn('a97002-content-pilot-v1.jsonl', task)
        self.assertNotIn(' content-pilot.jsonl', readme)
        self.assertIn('e', readme[readme.find('## 8.'):readme.find('## 9.')])
        self.assertIn('pi', readme[readme.find('## 8.'):readme.find('## 9.')])


if __name__ == '__main__':
    unittest.main()
