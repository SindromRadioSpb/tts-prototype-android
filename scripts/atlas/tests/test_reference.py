"""The hand-made reference content passes the validator and shows every object type."""
import json
import os
import unittest

import atlas_validate as V

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'atlas', 'a97002', 'pilot'))
SOURCE = os.path.join(ROOT, 'source-pack')
REFERENCE = os.path.join(ROOT, 'reference', 'reference-content.jsonl')


class ReferenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = V.validate(V.load_source_pack(SOURCE), REFERENCE)
        with open(REFERENCE, encoding='utf-8') as fh:
            cls.objs = [json.loads(line) for line in fh if line.strip()]

    def test_reference_passes(self):
        self.assertEqual(self.report['errors'], [])
        self.assertTrue(self.report['ok'])

    def test_core_findings(self):
        mismatch = [f for f in self.report['findings'] if f['code'] == 'F_CORE_MISMATCH']
        self.assertEqual(len(mismatch), 1)
        self.assertEqual(mismatch[0]['ref'], 'new:a97002:p287:example-2#step3')
        self.assertGreaterEqual(sum(f['code'] == 'F_CORE_VERIFIED' for f in self.report['findings']), 1)

    def test_every_type_present(self):
        types = {o['type'] for o in self.objs}
        self.assertTrue({'header', 'block', 'formula', 'symbol', 'figure', 'region', 'table', 'term', 'example', 'erratum', 'report'} <= types)
        self.assertGreaterEqual(sum(o['type'] == 'term' for o in self.objs), 6)

    def test_no_warnings_a_supplier_should_copy(self):
        # the reference is the model answer: it must not teach the supplier to ignore warnings
        self.assertEqual([w for w in self.report['warnings'] if w['code'] != 'W_FIGURE_NO_REGIONS'], [])


if __name__ == '__main__':
    unittest.main()
