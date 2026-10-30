"""Preview layout fixes from the supplier's review of the printed pilot (2026-10-31)."""
import re
import unittest

import render_preview as P


def table(cells, title='t'):
    return {'type': 'table', 'id': 'a97002:p284:img02:t-x', 'title_ru': title, 'cells': cells, 'status': {}}


def cell(row, col, ru, colspan=1, unit=None):
    c = {'row': row, 'col': col, 'rowspan': 1, 'colspan': colspan, 'he': ru, 'ru': ru}
    if unit:
        c['unit'] = unit
    return c


class TableGridTest(unittest.TestCase):
    def test_sparse_row_keeps_columns(self):
        # row 1 has cells only in columns 0 and 3: the unit 'kg' must stay under column 3
        html = P._table_html(table([cell(0, 0, 'd'), cell(0, 1, 'C'), cell(0, 2, 'n'), cell(0, 3, 'Масса'),
                                     cell(1, 0, 'mm'), cell(1, 3, 'kg')]))
        rows = re.findall(r'<tr>(.*?)</tr>', html)
        self.assertEqual(len(re.findall(r'<td', rows[-1])), 4)
        self.assertTrue(re.search(r'<td[^>]*></td><td[^>]*></td><td[^>]*>kg', rows[-1]))

    def test_header_rows_repeat_on_every_printed_page(self):
        html = P._table_html(table([cell(0, 0, 'd'), cell(0, 1, 'Масса'), cell(1, 0, '20'), cell(1, 1, '0.050')]))
        self.assertIn('<thead>', html)
        self.assertLess(html.index('Масса'), html.index('</thead>'))

    def test_unit_not_repeated_when_already_in_text(self):
        html = P._table_html(table([cell(0, 0, 'Fr = 2000 N', unit='N'), cell(0, 1, '1.5', unit='—')]))
        self.assertNotIn('2000 N<small> N', html)
        self.assertIn('Fr = 2000 N', html)


class DirectionTest(unittest.TestCase):
    def test_numbers_only_label_is_ltr(self):
        self.assertIn('dir="ltr"', P.he('+0.2 20-0.1'))
        self.assertIn('dir="rtl"', P.he('גבול עליון'))


class ErratumTest(unittest.TestCase):
    def test_proposed_wording(self):
        html = P._erratum_html({'as_printed': 'a', 'proposed': 'b', 'explanation_ru': 'x', 'target': 't'})
        self.assertIn('предлагаемое исправление', html)
        self.assertNotIn('верно:', html)

    def test_core_finding_merged_into_supplier_erratum(self):
        supplier = {'type': 'erratum', 'id': 'e1', 'target': 'a97002:p485:f01', 'page': 485,
                    'as_printed': 'ΔA = 0.05 − (0.1) = 0.15', 'proposed': '0.05 − (−0.1) = 0.15', 'explanation_ru': 'знак'}
        core = {'type': 'erratum', 'id': 'e2', 'target': 'a97002:p485:x-t', 'page': 485, 'origin': 'core',
                'as_printed': '0.15', 'proposed': '', 'explanation_ru': 'Ядро: u-d не даёт 0.15'}
        merged = P.merge_core_errata([supplier, core])
        self.assertEqual(len(merged), 1)
        self.assertIn('Ядро', P._erratum_html(merged[0]))


class PrintSheetTest(unittest.TestCase):
    def test_sheet_header_repeats_and_single_footer(self):
        graph = {'objects': {'a97002:p7': {'type': 'page', 'id': 'a97002:p7', 'page': 7, 'image': 'assets/x.png'},
                             'a97002:p7:b001': {'type': 'block', 'id': 'a97002:p7:b001', 'page': 7, 'order': 1, 'kind': 'heading',
                                                'he': 'פירוק כוח', 'he_raw': 'פירוק כוח', 'ru': 'Разложение силы'}},
                 'pages': {'7': ['a97002:p7', 'a97002:p7:b001']}, 'terms': {}}
        html = P._print_page(P.Page(graph, 7), {}, '.', '.')
        self.assertIn('<thead>', html)                 # the 'стр. 7' header repeats on continuation sheets
        self.assertLess(html.index('стр. 7'), html.index('</thead>'))
        self.assertNotIn('class="foot"', html)         # footer is one running element, not a trailing block


if __name__ == '__main__':
    unittest.main()
