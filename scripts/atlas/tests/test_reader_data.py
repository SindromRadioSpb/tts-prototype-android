"""Reader data: per-section JSON for the Reading Room atlas screen, built from the graph."""
import json
import os
import shutil
import tempfile
import unittest

import atlas_import as I
import atlas_validate as V
import build_reader_data as R

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PILOT = os.path.join(ROOT, 'atlas', 'a97002', 'pilot')


class ReaderDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = tempfile.mkdtemp(prefix='atlas-reader-')
        source_dir = os.path.join(PILOT, 'source-pack')
        section = {'id': 's09-belt', 'part': 'machine-parts', 'first': 197, 'last': 197, 'he': 'תמסורת רצועה', 'ru': 'Ременная передача'}
        cls.data = R.build_section(section, source_dir, os.path.join(PILOT, 'reference', 'reference-content.jsonl'), cls.out)
        cls.raw = R.build_section(dict(section, id='s25-size-tolerance', first=485, last=485), source_dir, None, cls.out)

    def test_translated_section_shape(self):
        d = self.data
        self.assertEqual(d['schema'], 'linguistpro.atlas-reader-section.1.0.0')
        self.assertTrue(d['translated'])
        self.assertEqual([p['page'] for p in d['pages']], [197])
        page = d['pages'][0]
        kinds = [i['type'] for i in page['items']]
        self.assertIn('block', kinds)
        self.assertIn('formula', kinds)
        ys = [i['y'] for i in page['items']]
        self.assertEqual(ys, sorted(ys))                       # page order
        formula = next(i for i in page['items'] if i['type'] == 'formula' and 'n_{out}' in (i.get('latex') or ''))
        self.assertTrue(formula['mathml'].startswith('<math'))
        self.assertTrue(formula['vars'])
        fig = next(f for f in page['figures'] if f['number'] == 79)
        self.assertTrue(any(r['label_ru'] == 'ведущий шкив d' for r in fig['regions']))
        self.assertTrue(os.path.exists(os.path.join(self.out, 'assets', os.path.basename(page['image']))))
        self.assertTrue(page['image'].startswith('/data/atlas/a97002/assets/'))

    def test_terms_subset_and_status(self):
        self.assertIn('a97002:term:galgal-mania', self.data['terms'])
        block = next(i for i in self.data['pages'][0]['items'] if i['type'] == 'block')
        self.assertEqual(block['status']['owner_status'], 'none')

    def test_untranslated_section_is_honest(self):
        r = self.raw
        self.assertFalse(r['translated'])
        block = next(i for i in r['pages'][0]['items'] if i['type'] == 'block')
        self.assertIn('he_raw', block)
        self.assertNotIn('ru', block)

    def test_index(self):
        sections = [{'id': 's09-belt', 'part': 'machine-parts', 'first': 195, 'last': 234, 'he': 'x', 'ru': 'y'}]
        idx = R.build_index(sections, {'s09-belt': self.data}, parts=[{'id': 'machine-parts', 'he': 'h', 'ru': 'r'}])
        self.assertEqual(idx['sections'][0]['translated'], True)
        self.assertEqual(idx['schema'], 'linguistpro.atlas-reader-index.1.0.0')


if __name__ == '__main__':
    unittest.main()
