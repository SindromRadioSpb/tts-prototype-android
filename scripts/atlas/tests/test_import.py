"""Import: stable label-based IDs, rewritten references, statuses set by import, core errata."""
import contextlib
import io
import json
import os
import tempfile
import unittest

import atlas_import as I
import atlas_validate as V
from tests.test_validate import Pack, clean_content, edit

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'atlas', 'a97002', 'pilot'))


class PermanentIdTest(unittest.TestCase):
    def test_permanent_ids_label_based(self):
        self.assertEqual(I.permanent_id('new:a97002:p197:fig79:shkiv-small', 'region'), 'a97002:p197:fig79:r-shkiv-small')
        self.assertEqual(I.permanent_id('new:a97002:p282:img02:radial-factors', 'table'), 'a97002:p282:img02:t-radial-factors')
        self.assertEqual(I.permanent_id('new:a97002:p7:fy-cos', 'erratum'), 'a97002:p7:e-fy-cos')
        self.assertEqual(I.permanent_id('new:a97002:p287:example-2', 'example'), 'a97002:p287:x-example-2')


class GraphTest(unittest.TestCase):
    def build(self, objs=None):
        pack = Pack(self)
        return I.build_graph(pack.source, pack.write(clean_content() if objs is None else objs))

    def test_refs_rewritten(self):
        graph, id_map = self.build()
        region = graph['objects']['a97002:p197:fig79:r-shkiv-small']
        self.assertEqual(region['parent'], 'a97002:p197:fig79')
        self.assertEqual(region['page'], 197)
        self.assertEqual(id_map['new:a97002:p197:fig79:shkiv-small'], 'a97002:p197:fig79:r-shkiv-small')
        objs = edit(clean_content(), 'new:a97002:p197:ratio-sign', target='new:a97002:p197:fig79:shkiv-small')
        graph, _ = self.build(objs)
        self.assertEqual(graph['objects']['a97002:p197:e-ratio-sign']['target'], 'a97002:p197:fig79:r-shkiv-small')
        self.assertNotIn('new:', json.dumps(graph))

    def test_status_axes_set_by_import(self):
        graph, _ = self.build()
        objects = graph['objects']
        self.assertEqual(objects['a97002:p197:b001']['status'],
                         {'recognition': 'extracted', 'language_review': 'producer_checked', 'math_review': 'not_applicable', 'owner_status': 'none'})
        self.assertEqual(objects['a97002:p197:fig79:r-shkiv-small']['status']['recognition'], 'ocr_high')
        self.assertEqual(objects['a97002:p197:fig79:r-shkiv-small']['status']['language_review'], 'unreviewed')
        self.assertEqual(objects['a97002:p197:f01']['status']['math_review'], 'unchecked')
        example = objects['a97002:p197:x-demo']
        self.assertEqual(example['status']['math_review'], 'core_verified')
        self.assertEqual(example['steps'][0]['math_review'], 'core_verified')

    def test_source_fields_kept_and_pages_ordered(self):
        graph, _ = self.build()
        block = graph['objects']['a97002:p197:b002']
        self.assertIn('he_raw', block)
        self.assertIn('ru', block)
        self.assertEqual(graph['pages']['197'][:3], ['a97002:p197', 'a97002:p197:b001', 'a97002:p197:b002'])
        self.assertIn('a97002:p197:fig79:r-shkiv-small', graph['pages']['197'])
        self.assertIn('a97002:term:galgal-mania', graph['terms'])

    def test_core_mismatch_becomes_erratum(self):
        step = {'compute': 'x*Fr+y*Fa', 'bindings': {'x': 0.56, 'Fr': 2000, 'y': 2, 'Fa': 600}, 'printed': '2200'}
        graph, _ = self.build(edit(clean_content(), 'new:a97002:p197:demo', steps=[step]))
        core = [o for o in graph['objects'].values() if o['type'] == 'erratum' and o.get('origin') == 'core']
        self.assertEqual(len(core), 1)
        self.assertEqual(core[0]['target'], 'a97002:p197:x-demo')
        self.assertEqual(core[0]['status']['owner_status'], 'none')
        self.assertEqual(graph['objects']['a97002:p197:x-demo']['status']['math_review'], 'core_mismatch')

    def test_rejects_invalid_pack(self):
        with self.assertRaises(I.ImportRejected) as ctx:
            self.build(edit(clean_content(), 'a97002:p197:b001', ru=''))
        self.assertFalse(ctx.exception.report['ok'])

    def test_reimport_same_ids(self):
        pack = Pack(self)
        path = pack.write(clean_content())
        g1, m1 = I.build_graph(pack.source, path)
        g2, m2 = I.build_graph(pack.source, path)
        self.assertEqual(m1, m2)
        g1.pop('built_at'), g2.pop('built_at')
        self.assertEqual(g1, g2)


class ReferenceImportTest(unittest.TestCase):
    def test_reference_import(self):
        source = V.load_source_pack(os.path.join(ROOT, 'source-pack'))
        graph, id_map = I.build_graph(source, os.path.join(ROOT, 'reference', 'reference-content.jsonl'))
        page = graph['pages']['197']
        objects = graph['objects']
        self.assertGreaterEqual(sum(objects[i]['type'] == 'region' for i in page), 4)
        self.assertEqual(sum(objects[i]['type'] == 'figure' for i in page), 2)
        self.assertIn('a97002:p7:e-fy-cos', objects)
        self.assertIn('a97002:p282:img02:t-radial-factors', objects)

    def test_cli_writes_three_files(self):
        out = tempfile.mkdtemp(prefix='atlas-import-')
        with contextlib.redirect_stdout(io.StringIO()):
            code = I.main(['--source', os.path.join(ROOT, 'source-pack'),
                           '--content', os.path.join(ROOT, 'reference', 'reference-content.jsonl'), '--out', out])
        self.assertEqual(code, 0)
        self.assertEqual(sorted(os.listdir(out)), ['graph.json', 'id-map.json', 'validation-report.json'])


if __name__ == '__main__':
    unittest.main()
