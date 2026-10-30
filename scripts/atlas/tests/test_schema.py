"""Subset JSON Schema checker, JSONL reader and the two pack schemas."""
import os
import tempfile
import unittest

import atlas_schema as S

STATUS = {'language_review': 'producer_checked'}


class CheckTest(unittest.TestCase):
    def test_required_and_enum(self):
        schema = {'type': 'object', 'required': ['a'], 'properties': {'a': {'enum': ['x', 'y']}}}
        self.assertEqual(S.check(schema, {'a': 'x'}), [])
        self.assertEqual(S.check(schema, {}), ['$: missing required property a'])
        self.assertEqual(len(S.check(schema, {'a': 'z'})), 1)
        self.assertIn('$.a', S.check(schema, {'a': 'z'})[0])

    def test_additional_properties_false(self):
        schema = {'type': 'object', 'properties': {'a': {'type': 'string'}}, 'additionalProperties': False}
        self.assertEqual(S.check(schema, {'a': 'q', 'b': 1}), ['$: unexpected property b'])

    def test_types_pattern_bounds_items(self):
        schema = {'type': 'object', 'properties': {
            'n': {'type': 'integer', 'minimum': 1, 'maximum': 3},
            'xs': {'type': 'array', 'minItems': 2, 'items': {'type': 'number'}},
            's': {'type': 'string', 'pattern': '^[a-z]+$', 'minLength': 2},
            'o': {'type': ['string', 'null']},
            'c': {'const': 'k'}}}
        self.assertEqual(S.check(schema, {'n': 2, 'xs': [1, 2.5], 's': 'ab', 'o': None, 'c': 'k'}), [])
        errors = S.check(schema, {'n': 4, 'xs': [1], 's': 'A', 'o': 3, 'c': 'z'})
        self.assertEqual(len(errors), 6)  # maximum, minItems, pattern, minLength, type, const
        self.assertTrue(S.check({'type': 'integer'}, True))  # bool is not an integer

    def test_ref_and_defs(self):
        schema = {'$defs': {'bbox': {'type': 'array', 'minItems': 4, 'items': {'type': 'number'}}},
                  'type': 'object', 'properties': {'bbox': {'$ref': '#/$defs/bbox'}}}
        self.assertEqual(S.check(schema, {'bbox': [0, 0, 1, 1]}), [])
        self.assertTrue(S.check(schema, {'bbox': [0, 'a', 1, 1]}))

    def test_oneof_dispatch_by_type_const(self):
        schema = S.load_schema('content-pack')
        errors = S.check(schema, {'type': 'regoin', 'id': 'x'})
        self.assertEqual(errors, ["$.type: unknown type 'regoin'"])
        region_errors = S.check(schema, {'type': 'region', 'id': 'new:a97002:p197:fig79:shkiv-small'})
        self.assertTrue(region_errors)
        self.assertTrue(all('region' not in e or 'unknown type' not in e for e in region_errors))


class JsonlTest(unittest.TestCase):
    def write(self, data):
        fd, path = tempfile.mkstemp(suffix='.jsonl')
        with os.fdopen(fd, 'wb') as fh:
            fh.write(data)
        self.addCleanup(os.remove, path)
        return path

    def test_read_jsonl_bom_crlf_blank_lines(self):
        path = self.write('﻿{"a": 1}\r\n\r\n{"b": "ש"}\r\n   \r\n'.encode('utf-8'))
        rows, errors = S.read_jsonl(path)
        self.assertEqual(errors, [])
        self.assertEqual(rows, [(1, {'a': 1}), (3, {'b': 'ש'})])

    def test_read_jsonl_bad_line_reports_number(self):
        path = self.write(b'{"a":1}\n{"b":2}\n{bad\n{"d":4}\n')
        rows, errors = S.read_jsonl(path)
        self.assertEqual([n for n, _ in rows], [1, 2, 4])
        self.assertEqual(len(errors), 1)
        self.assertTrue(errors[0].startswith('line 3:'))

    def test_non_object_line_is_error(self):
        rows, errors = S.read_jsonl(self.write(b'[1,2]\n'))
        self.assertEqual(rows, [])
        self.assertTrue(errors[0].startswith('line 1:'))


MINIMAL_SOURCE = [
    {'type': 'page', 'id': 'a97002:p197', 'page': 197, 'image': 'assets/' + 'a' * 64 + '.png', 'has_text_layer': True},
    {'type': 'block', 'id': 'a97002:p197:b001', 'page': 197, 'bbox': [1, 2, 3, 4], 'he_raw': 'יחס תמסורת',
     'kind_guess': 'heading', 'order': 1},
    {'type': 'formula', 'id': 'a97002:p197:f01', 'page': 197, 'bbox': [1, 2, 3, 4], 'source_text': '𝑖= 𝑑',
     'crop': 'assets/' + 'b' * 64 + '.png'},
    {'type': 'symbol', 'id': 'a97002:p197:st1:s01', 'formula_id': 'a97002:p197:f01', 'page': 197, 'bbox': [1, 2, 3, 4],
     'symbol_raw': 'd', 'description_he_raw': 'קוטר', 'unit_raw': 'mm'},
    {'type': 'symbol', 'id': 'a97002:p197:st1:s02', 'formula_id': None, 'page': 197, 'bbox': [1, 2, 3, 4],
     'symbol_raw': 'D', 'description_he_raw': 'קוטר', 'unit_raw': ''},
    {'type': 'figure', 'id': 'a97002:p197:fig79', 'page': 197, 'bbox': [1, 2, 3, 4], 'crop': 'assets/' + 'c' * 64 + '.png',
     'number': 79, 'caption_block_id': 'a97002:p197:b001'},
    {'type': 'example', 'id': 'a97002:p288:ex1', 'page': 288, 'heading_block_id': None, 'image_only': True},
]

MINIMAL_CONTENT = [
    {'type': 'header', 'schema': 'linguistpro.atlas-content-pack.1.0.0', 'atlas_id': 'a97002',
     'source_pack_sha256': 'd' * 64, 'producer': 'dots', 'produced_at': '2026-11-01T10:00:00Z', 'pages': [197]},
    {'type': 'block', 'id': 'a97002:p197:b001', 'kind': 'heading', 'he': 'יחס תמסורת', 'he_niqqud': 'יַחַס תִּמְסֹרֶת',
     'translit': 'yakhas timsoret', 'ru': 'Передаточное отношение', 'terms': ['a97002:term:yakhas-timsoret#ratio'],
     'status': STATUS},
    {'type': 'formula', 'id': 'a97002:p197:f01', 'display_latex': 'i=\\frac{d(1-\\xi)}{D}', 'compute': 'd*(1-xi)/D',
     'ambiguity_note': 'i = n_out/n_in', 'status': STATUS},
    {'type': 'formula', 'id': 'a97002:p197:f02', 'display_latex': 'x', 'compute': None,
     'compute_absent_reason': 'table lookup', 'status': STATUS},
    {'type': 'symbol', 'id': 'a97002:p197:st1:s01', 'symbol_latex': 'd', 'var': 'd', 'description_he': 'קוטר',
     'description_ru': 'диаметр', 'unit': 'mm'},
    {'type': 'figure', 'id': 'a97002:p197:fig79', 'caption_he': 'תמסורת רצועה', 'caption_ru': 'Ременная передача'},
    {'type': 'region', 'id': 'new:a97002:p197:fig79:shkiv-small', 'parent': 'a97002:p197:fig79', 'bbox': [1, 2, 3, 4],
     'label_he': 'גלגל מניע', 'label_ru': 'ведущий шкив', 'links': [], 'status': {'recognition': 'ocr_high'}},
    {'type': 'table', 'id': 'new:a97002:p282:bearings', 'parent': 'a97002:p282', 'bbox': [1, 2, 3, 4],
     'cells': [{'row': 0, 'col': 0, 'rowspan': 1, 'colspan': 1, 'he': 'd', 'ru': 'd'}], 'status': {'recognition': 'ocr_low'}},
    {'type': 'term', 'id': 'a97002:term:yakhas-timsoret', 'lemma_he': 'יחס תמסורת', 'niqqud': 'יַחַס תִּמְסֹרֶת',
     'translit': 'yakhas timsoret', 'senses': [{'sense': 'ratio', 'ru': 'передаточное отношение', 'context': 'передачи'}]},
    {'type': 'example', 'id': 'a97002:p288:ex1', 'steps': [{'compute': 'a+b', 'bindings': {'a': 1, 'b': 2}, 'printed': '3'}]},
    {'type': 'erratum', 'id': 'new:a97002:p7:fy-cos', 'page': 7, 'target': 'a97002:p7:f02', 'as_printed': 'cos',
     'proposed': 'sin', 'explanation_ru': 'вертикальная составляющая через синус'},
    {'type': 'report', 'discrepancies': [{'ref': 'a97002:p197:b001', 'note': 'проверить'}]},
]


class PackSchemasTest(unittest.TestCase):
    def test_schemas_load_and_accept_minimal_objects(self):
        source, content = S.load_schema('source-pack'), S.load_schema('content-pack')
        for obj in MINIMAL_SOURCE:
            self.assertEqual(S.check(source, obj), [], obj['type'])
        for obj in MINIMAL_CONTENT:
            self.assertEqual(S.check(content, obj), [], obj['type'])

    def test_source_manifest_schema(self):
        manifest = {'schema': 'linguistpro.atlas-source-pack.1.0.0', 'atlas_id': 'a97002',
                    'source': {'filename': 'x.pdf', 'sha256': 'e' * 64, 'page_count': 564, 'page_size_pt': [595, 842]},
                    'extractor': {'version': '1.0.0'}, 'pages': [7, 197], 'logo_xref_digests': [], 'warnings': []}
        schema = S.load_schema('source-pack')
        self.assertEqual(S.check(schema['$defs']['manifest'], manifest, root=schema), [])
        bad = dict(manifest, source=dict(manifest['source'], filename='G:/Andasa/x.pdf'))
        self.assertTrue(S.check(schema['$defs']['manifest'], bad, root=schema))

    def test_content_rejects_bad_label_and_status_value(self):
        content = S.load_schema('content-pack')
        bad = dict(MINIMAL_CONTENT[6], id='new:a97002:p197:fig79:shkiv-D')
        self.assertTrue(S.check(content, bad))
        bad_status = dict(MINIMAL_CONTENT[1], status={'language_review': 'great'})
        self.assertTrue(S.check(content, bad_status))

    def test_block_kind_enum(self):
        content = S.load_schema('content-pack')
        self.assertTrue(S.check(content, dict(MINIMAL_CONTENT[1], kind='paragraph')))


if __name__ == '__main__':
    unittest.main()
