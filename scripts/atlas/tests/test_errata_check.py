"""Independent check of the supplier's errata candidates: quotes on the page, arithmetic by the core."""
import json
import os
import tempfile
import unittest

import atlas_errata as E


class ArithmeticTest(unittest.TestCase):
    def test_equation_parts(self):
        self.assertEqual(E.equations('161.7 · 2.5 = 323 MPa'), [('161.7 * 2.5', '323')])
        self.assertEqual(E.equations('4 · 110² = 48500 mm²'), [('4 * 110^2', '48500')])
        self.assertEqual(E.equations('75·100 + 100²/3 = 10833.33'), [('75*100 + 100^2/3', '10833.33')])
        self.assertEqual(E.equations('F = 74865 N'), [])  # no arithmetic on the left

    def test_consistency(self):
        self.assertIs(E.consistent('161.7 · 2.5 = 323 MPa'), False)
        self.assertIs(E.consistent('161.7 · 2.5 = 404.25 MPa'), True)
        self.assertIs(E.consistent('4 · 110² = 48400 mm²'), True)
        self.assertIsNone(E.consistent('488604 N · mm'))
        self.assertIs(E.consistent('0.05 − (0.1) = 0.15'), False)
        self.assertIs(E.consistent('0.05 − (−0.1) = 0.15'), True)


class QuoteTest(unittest.TestCase):
    def test_quote_on_page(self):
        page = 'מאמץ 161.7 ∙2.5 = 323 MPa ועוד'
        self.assertIs(E.quote_found('161.7 · 2.5 = 323 MPa', page), True)
        self.assertIs(E.quote_found('161.7 · 2.5 = 330 MPa', page), False)
        self.assertIsNone(E.quote_found('anything', None))  # page without text layer: cannot tell


class ReportTest(unittest.TestCase):
    def test_check_file(self):
        d = tempfile.mkdtemp()
        book = os.path.join(d, 'book.jsonl')
        cands = os.path.join(d, 'c.jsonl')
        with open(book, 'w', encoding='utf-8') as fh:
            fh.write(json.dumps({'page': 78, 'section': 's04', 'text': '161.7 ∙2.5 = 323 MPa'}, ensure_ascii=False) + '\n')
        with open(cands, 'w', encoding='utf-8') as fh:
            for row in ({'page': 78, 'as_printed': '161.7 · 2.5 = 323 MPa', 'proposed': '161.7 · 2.5 = 404.25 MPa',
                         'kind': 'arithmetic', 'explanation_ru': 'x', 'confidence': 'high'},
                        {'page': 79, 'as_printed': '4 · 110² = 48500', 'proposed': '4 · 110² = 48400',
                         'kind': 'arithmetic', 'explanation_ru': 'x', 'confidence': 'high'}):
                fh.write(json.dumps(row, ensure_ascii=False) + '\n')
        rows, summary = E.check(cands, book)
        self.assertEqual(rows[0]['verdict'], 'core_confirms')
        self.assertIsNone(rows[1]['quote_found'])   # p79 has no text in this book file
        self.assertEqual(rows[1]['verdict'], 'core_confirms')
        self.assertEqual(summary['core_confirms'], 2)


if __name__ == '__main__':
    unittest.main()
