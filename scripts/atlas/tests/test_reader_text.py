"""Reader-facing text: editor notes split off, ids and pipeline words replaced (acceptance R02/R03/R04/R06)."""
import unittest

import reader_text as X


class SplitNoteTest(unittest.TestCase):
    def test_p5_pipeline_sentences_go_to_the_editor(self):
        note = ('source_text извлёк только знаменатель, но каноническая вырезка содержит всю дробь. '
                'Полное тригонометрическое определение находится в b003 и таблице. '
                'result_var — редакционное имя отношения; угол здесь не вход вычисления.')
        reader, editor = X.split_note(note)
        self.assertEqual(reader, 'Полное тригонометрическое определение находится в b003 и таблице. Угол здесь не вход вычисления.')
        self.assertIn('source_text', editor)
        self.assertIn('result_var', editor)

    def test_p8_clause_with_report_stays_for_the_reader(self):
        note = 'Печатная зависимость, единицы по легенде. Знак момента зависит от принятого направления и геометрии; область применимости описана в report.'
        reader, editor = X.split_note(note)
        self.assertIn('Знак момента', reader)
        self.assertIn('report', reader)
        self.assertEqual(editor, '')

    def test_snake_case_names_are_editor_talk(self):
        reader, editor = X.split_note('На странице единица угла не задана. Градусы переводят alpha_rad=alpha_deg*pi/180.')
        self.assertEqual(reader, 'На странице единица угла не задана.')
        self.assertIn('alpha_rad', editor)

    def test_decimals_and_abbreviations_do_not_split(self):
        reader, _ = X.split_note('Коэффициент 0.6 не исправлен, см. b005.')
        self.assertEqual(reader, 'Коэффициент 0.6 не исправлен, см. b005.')


class RewriteRefsTest(unittest.TestCase):
    def test_p140_formula_reference_below(self):
        text = 'Sрасчётный=0.6· [дробь σy/τt сохранена в f03]. Примечание.'
        out = X.rewrite_refs(text, 140, here_y=260, positions={'f03': 287.3})
        self.assertEqual(out, 'Sрасчётный=0.6· [дробь σy/τt сохранена в формуле ниже]. Примечание.')

    def test_block_above_in_accusative_and_glued(self):
        self.assertEqual(X.rewrite_refs('см.b005', 140, here_y=300, positions={'b005': 270}), 'см. текст выше')
        self.assertEqual(X.rewrite_refs('находится вb003 и таблице', 5, here_y=262, positions={'b003': 200}),
                         'находится в тексте выше и таблице')

    def test_group_and_other_page(self):
        self.assertEqual(X.rewrite_refs('Полные выражения сохранены в f03/f04 и таблице.', 167, here_y=100, positions={'f03': 200}),
                         'Полные выражения сохранены в формулах ниже и таблице.')
        self.assertEqual(X.rewrite_refs('С.192 f02: 20/60', 191), 'формула на с. 192: 20/60')

    def test_report_and_other_pipeline_words(self):
        self.assertEqual(X.rewrite_refs('область применимости описана в report.', 8), 'область применимости описана в заметках редактора к странице.')
        self.assertEqual(X.rewrite_refs('См. region и erratum.', 519), 'См. отметку на рисунке и предлагаемое исправление.')

    def test_plain_text_untouched(self):
        self.assertEqual(X.rewrite_refs('Сила F = 10 N, b = 3 mm', 7), 'Сила F = 10 N, b = 3 mm')


class SymbolTest(unittest.TestCase):
    def test_pretty_symbol(self):
        self.assertEqual(X.pretty_symbol('sin_alpha'), '\\sin\\alpha')
        self.assertEqual(X.pretty_symbol('tau_t'), '\\tau_{t}')
        self.assertEqual(X.pretty_symbol('sigma_y'), '\\sigma_{y}')
        self.assertIsNone(X.pretty_symbol('M_t'))           # already a valid symbol
        self.assertIsNone(X.pretty_symbol('spring_index'))  # an editorial name, not a symbol
        self.assertIsNone(X.pretty_symbol('\\tan\\alpha'))

    def test_formula_with_result(self):
        self.assertEqual(X.formula_with_result('\\frac{a}{c}', '\\sin\\alpha'), '\\sin\\alpha=\\frac{a}{c}')
        self.assertIsNone(X.formula_with_result('c^2=a^2+b^2', 'c^2'))
        self.assertIsNone(X.formula_with_result('\\tau\\le[\\tau]', '\\tau'))


if __name__ == '__main__':
    unittest.main()


class PageStateTest(unittest.TestCase):
    """Acceptance R07: a page whose only content is a translated table is not 'without translation'."""

    def page(self, blocks=(), tables=(), figures=(), regions=(), formulas=()):
        import types
        return types.SimpleNamespace(blocks=list(blocks), tables=list(tables), figures=list(figures),
                                     regions=list(regions), formulas=list(formulas))

    def test_states(self):
        import build_reader_data as R
        table = {'cells': [{'ru': 'Основные размеры'}]}
        self.assertEqual(R._page_state(self.page(tables=[table])), 'translated')                      # p288
        self.assertEqual(R._page_state(self.page()), 'empty')                                         # p12
        self.assertEqual(R._page_state(self.page(blocks=[{'he_raw': 'x'}])), 'none')
        self.assertEqual(R._page_state(self.page(blocks=[{'ru': 'a'}, {'he_raw': 'x'}])), 'partial')
        self.assertEqual(R._page_state(self.page(blocks=[{'ru': 'a'}], tables=[{'cells': [{'he': 'x'}]}])), 'partial')
