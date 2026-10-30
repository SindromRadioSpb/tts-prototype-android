"""Source-pack extractor: pure text rules, and (opt-in) the live pilot PDF."""
import json
import os
import tempfile
import unicodedata
import unittest

import atlas_extract as X
import atlas_schema as S


class RtlTest(unittest.TestCase):
    def test_leading_period_moves_to_end(self):
        self.assertEqual(X.normalize_rtl_line(' .הממסרת '), 'הממסרת.')
        self.assertEqual(X.normalize_rtl_line('.ביותר המותרת למידה הנקובה '), 'ביותר המותרת למידה הנקובה.')

    def test_latin_line_unchanged(self):
        self.assertEqual(X.normalize_rtl_line('(reducer)'), '(reducer)')
        self.assertEqual(X.normalize_rtl_line('.5 mm'), '.5 mm')

    def test_bidi_controls_removed(self):
        self.assertEqual(X.normalize_rtl_line('\u200fסמל\u202b'), 'סמל')


class JoinFragmentsTest(unittest.TestCase):
    """Fragments are (x0, x1, text) of one visual line, any order."""

    def test_rtl_order_and_ltr_run_reversed(self):
        frags = [(330, 553, ' ניתן לשנות (מומנט הסיבוב–'), (324, 327, 't'), (312, 324, 'M'), (225, 312, ' , מהירות')]
        self.assertEqual(X.join_fragments(frags), 'ניתן לשנות (מומנט הסיבוב– Mt , מהירות')

    def test_split_word_joined_without_space(self):
        self.assertEqual(X.join_fragments([(536, 553, 'לייצ'), (262, 536, 'ר מוצרים')]), 'לייצר מוצרים')

    def test_neutral_dash_keeps_rtl_position(self):
        frags = [(461, 538, ' תמסורת מפחיתה '), (411, 461, '(reducer)'), (401, 407, '–'), (310, 397, ' שימוש')]
        self.assertEqual(X.join_fragments(frags), 'תמסורת מפחיתה (reducer) – שימוש')

    def test_split_word_with_trailing_space_on_left_fragment(self):
        # p485: ' המידה ה' + 'גדולה ' are one word 'הגדולה'; the space after 'גדולה' is on its logical end
        frags = [(451, 496, ' המידה ה'), (414, 451, 'גדולה '), (265, 414, '.ביותר המותרת')]
        self.assertEqual(X.join_fragments(frags), 'המידה הגדולה ביותר המותרת.')
        self.assertEqual(X.join_fragments([(501, 528, 'תחתו'), (494, 501, 'ן ')]), 'תחתון')

    def test_period_moves_to_the_end_of_its_own_span(self):
        # p7: one PDF line holds two spans; the artefact '.' of the first span ends the first sentence
        frag = (50, 553, ' .כדי לבחון ישרי זווית כך נמנע של ציר', [' .כדי לבחון ישרי זווית', ' כך נמנע של ציר'])
        self.assertEqual(X.join_fragments([frag]), 'כדי לבחון ישרי זווית. כך נמנע של ציר')

    def test_ltr_paragraph_with_hebrew_tail(self):
        # p7: 'Fy = F ∙cos α° (רכיב אנכי)' is a left-to-right line; its Hebrew word is split across fragments
        frags = [(43, 179, 'Fy = F ∙cos α° (רכיב א'), (135, 187, 'נכי) ')]
        self.assertEqual(X.join_fragments(frags, rtl=False), 'Fy = F ∙cos α° (רכיב אנכי)')

    def test_line_direction(self):
        self.assertFalse(X.line_is_rtl([(43, 193, 'Fx = F ∙cos α° (רכיב אופקי)')], 595))
        self.assertTrue(X.line_is_rtl([(330, 553, ' ניתן לשנות'), (312, 324, 'M')], 595))
        self.assertTrue(X.line_is_rtl([(229, 360, 'איור 79 - תמסורת רצועה')], 595))

    def test_period_inside_line_fragment(self):
        frags = [(240, 553, ' .כדי לבחון ישרי זווית'), (200, 238, ' כך נמנע')]
        self.assertEqual(X.join_fragments(frags), 'כדי לבחון ישרי זווית. כך נמנע')


def band(y0, frags, size=11.0):
    """Synthetic visual line: frags = [(x0, x1, text)]."""
    fs = [{'bbox': [x0, y0, x1, y0 + 13], 'text': t, 'size': size} for x0, x1, t in frags]
    return {'frags': fs, 'bbox': [min(f[0] for f in frags), y0, max(f[1] for f in frags), y0 + 13],
            'text': X.join_fragments(frags)}


class BlockMergeTest(unittest.TestCase):
    def test_moved_period_does_not_end_the_paragraph(self):
        # p485: the line ' .רכיבי ... יש צורך' continues on the next line 'לייצר ...'
        blocks = X._blocks_from_bands([band(144, [(59, 553, ' .רכיבי מכונות חייבים יש צורך')]),
                                       band(165, [(50, 553, 'לייצר מוצרים זהים במידותיהם')])], 11.0)
        self.assertEqual(len(blocks), 1)

    def test_real_final_period_ends_the_paragraph(self):
        blocks = X._blocks_from_bands([band(144, [(59, 553, 'משפט ראשון שנגמר.')]),
                                       band(165, [(50, 553, 'משפט חדש')])], 11.0)
        self.assertEqual(len(blocks), 2)


class ClassifyTest(unittest.TestCase):
    def test_caption(self):
        self.assertEqual(X.classify_block('איור 79 - תמסורת רצועה'), 'caption')

    def test_list_items_and_example(self):
        self.assertEqual(X.classify_block('• תמסורת מפחיתה'), 'list_item')
        self.assertEqual(X.classify_block('1 ) קביעת מקדמים'), 'list_item')
        self.assertEqual(X.classify_block('דוגמה 3 – תרגיל משולב'), 'example_heading')

    def test_heading_and_prose(self):
        self.assertEqual(X.classify_block('יחס תמסורת', is_large=True), 'heading')
        self.assertEqual(X.classify_block('ניתן לשנות את מרכיבי ההספק'), 'prose')


class FormulaTextTest(unittest.TestCase):
    def test_formula(self):
        self.assertTrue(X.is_formula_text('𝑖= 𝑑∙(1 −𝜉)'))
        self.assertTrue(X.is_formula_text('Fx = F ∙cos α °'))
        self.assertTrue(X.is_formula_text('𝐷'))

    def test_not_formula(self):
        self.assertFalse(X.is_formula_text('מהירות חיתוך – 𝐯𝐜'))
        self.assertFalse(X.is_formula_text('Fx = F ∙cos α° (רכיב אופקי רכיב)'))
        self.assertFalse(X.is_formula_text('(reducer)'))


class SymbolRowsTest(unittest.TestCase):
    def test_p365_rows(self):
        rows = X.parse_symbol_rows(['vc מהירות חיתוך m/min', 'd קוטר עובד או כלי mm', 'n מהירות סיבוב rpm'])
        self.assertEqual([(r['symbol_raw'], r['unit_raw']) for r in rows], [('vc', 'm/min'), ('d', 'mm'), ('n', 'rpm')])
        self.assertEqual(rows[1]['description_he_raw'], 'קוטר עובד או כלי')

    def test_p7_rows_with_inner_latin_and_no_unit(self):
        # the extractor passes '<symbol + description>	<unit column>' when it found the unit column geometrically
        rows = X.parse_symbol_rows(['Fx רכיב כוח על ציר ה- x )(רכיב אופקי N	', 'α זווית בין הכוח F לציר ה- x	°', 'i יחס תמסורת'])
        self.assertEqual(rows[0]['symbol_raw'], 'Fx')
        self.assertEqual(rows[0]['unit_raw'], 'N')
        self.assertEqual(rows[1]['unit_raw'], '°')
        self.assertEqual(rows[1]['description_he_raw'], 'זווית בין הכוח F לציר ה- x')
        self.assertEqual(rows[2]['unit_raw'], '')


class FigureAndLogoTest(unittest.TestCase):
    def test_figure_number(self):
        self.assertEqual(X.figure_number('איור  80   -   מידות יסוד'), 80)
        self.assertIsNone(X.figure_number('מידות יסוד'))

    def test_logo_xrefs(self):
        self.assertEqual(X.logo_xrefs({5: 564, 6: 564, 40: 1}, 564), {5, 6})


PILOT = [7, 197, 282, 284, 287, 288, 289, 485]


@unittest.skipUnless(os.environ.get('ATLAS_SOURCE_PDF'), 'set ATLAS_SOURCE_PDF to the formulary PDF')
class PilotPdfTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = tempfile.mkdtemp(prefix='atlas-pilot-')
        cls.manifest = X.extract(os.environ['ATLAS_SOURCE_PDF'], PILOT, cls.out)
        with open(os.path.join(cls.out, 'pages.jsonl'), encoding='utf-8') as fh:
            cls.raw = fh.read()
        cls.objs = [json.loads(line) for line in cls.raw.splitlines() if line.strip()]

    def of(self, type_, page):
        return [o for o in self.objs if o['type'] == type_ and o.get('page') == page]

    def test_manifest(self):
        schema = S.load_schema('source-pack')
        self.assertEqual(S.check(schema['$defs']['manifest'], self.manifest, root=schema), [])
        self.assertEqual(self.manifest['pages'], PILOT)

    def test_every_object_matches_schema(self):
        schema = S.load_schema('source-pack')
        for obj in self.objs:
            self.assertEqual(S.check(schema, obj), [], obj.get('id'))

    def test_p197_figures_and_formula(self):
        self.assertEqual(sorted(f['number'] for f in self.of('figure', 197)), [79, 80])
        self.assertTrue(any('𝜉' in f['source_text'] for f in self.of('formula', 197)))
        self.assertGreaterEqual(len(self.of('formula', 197)), 4)  # three i-formulas side by side + L

    def test_p7_symbols(self):
        # raw text keeps the PDF's math italics (F𝑦); compare in NFKC
        self.assertEqual({unicodedata.normalize('NFKC', s['symbol_raw']) for s in self.of('symbol', 7)}, {'Fx', 'Fy', 'F', 'α'})

    def test_raster_pages(self):
        pages = {o['page']: o for o in self.objs if o['type'] == 'page'}
        self.assertFalse(pages[288]['has_text_layer'])
        self.assertTrue(self.of('figure', 282) and self.of('figure', 284))
        self.assertTrue(self.of('figure', 288))
        # 284 is Appendix A, 288 the figure of example 2 (its condition is text on 287): no false examples
        self.assertEqual(self.of('example', 284) + self.of('example', 288), [])

    def test_symbol_ids_follow_the_table_not_the_binding(self):
        syms = self.of('symbol', 7)
        self.assertEqual(len(syms), 4)
        for sym in syms:
            self.assertRegex(sym['id'], r'^a97002:p7:st1:s0[1-4]$')
            self.assertIsNone(sym['formula_id'])  # two formulas above the table: ambiguous, left unbound

    def test_ids_unique_and_p485_figure_merged(self):
        ids = [o['id'] for o in self.objs]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual([f['number'] for f in self.of('figure', 485)], [260])

    def test_p7_text_lines(self):
        texts = [b['he_raw'] for b in self.of('block', 7)]
        self.assertIn('Fy = F ∙cos α° (רכיב אנכי)', texts)
        self.assertTrue(any(t.startswith('כדי לבחון') and 'ישרי זווית. כך נמנע' in t for t in texts))

    def test_no_owner_paths(self):
        text = self.raw + json.dumps(self.manifest, ensure_ascii=False)
        self.assertNotIn('G:\\', text)
        self.assertNotIn('Andasa', text)

    def test_assets_exist(self):
        for obj in self.objs:
            for key in ('image', 'crop'):
                if key in obj:
                    self.assertTrue(os.path.exists(os.path.join(self.out, obj[key])), obj[key])


if __name__ == '__main__':
    unittest.main()
