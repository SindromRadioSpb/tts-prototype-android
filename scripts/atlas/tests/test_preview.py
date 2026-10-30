"""Pilot preview: screen and print (variant B) pages rendered from the atlas graph."""
import os
import tempfile
import unittest

import atlas_import as I
import atlas_validate as V
import render_preview as P

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'atlas', 'a97002', 'pilot'))


class PreviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source_dir = os.path.join(ROOT, 'source-pack')
        cls.graph, _ = I.build_graph(V.load_source_pack(source_dir), os.path.join(ROOT, 'reference', 'reference-content.jsonl'))
        cls.out = tempfile.mkdtemp(prefix='atlas-preview-')
        P.build_preview(cls.graph, source_dir, cls.out, title='тест')
        with open(os.path.join(cls.out, 'screen.html'), encoding='utf-8') as fh:
            cls.screen = fh.read()
        with open(os.path.join(cls.out, 'print.html'), encoding='utf-8') as fh:
            cls.print = fh.read()

    def test_print_variant_b(self):
        self.assertIn('стр. 197', self.print)
        self.assertIn('Передаточное отношение', self.print)
        self.assertIn('יחס תמסורת', self.print)
        self.assertIn('class="pb-row"', self.print)          # two-column rows ru | he
        self.assertIn('\\frac{n_{out}}{n_{in}}', self.print)  # formula source for KaTeX
        self.assertIn('sin α°', self.print)                   # erratum shown next to the original

    def test_screen_has_original_regions_and_status(self):
        self.assertIn('data-region="a97002:p197:fig79:r-shkiv-small"', self.screen)
        self.assertIn('ведущий шкив d', self.screen)
        self.assertIn('assets/', self.screen)                 # original page image
        self.assertIn('producer_checked', self.screen)        # supplier status stays visible
        self.assertIn('F_CORE_MISMATCH', self.screen)         # core finding of example 2

    def test_pages_without_content_show_raw_text_honestly(self):
        self.assertIn('нет перевода', self.screen)            # pages 282+ of the reference are fragments

    def test_hebrew_is_marked_rtl(self):
        self.assertIn('lang="he" dir="rtl"', self.print)


if __name__ == '__main__':
    unittest.main()
