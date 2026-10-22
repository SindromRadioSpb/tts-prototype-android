"""Offline tests for the Modern release registry: part passports, row anchoring, part boundaries."""
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('modern_registry', Path(__file__).resolve().parents[1] / 'modern-registry.py')
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


def row(i, he, ru='перевод'):
    return {'row_id': f'r{i}', 'order_index': i, 'hebrew_plain': he, 'hebrew_niqqud': he, 'russian': ru, 'translit': 'x'}


class PassportTest(unittest.TestCase):
    def test_section_scheme(self):
        p = R.passport({'text_id': 'by-1-a', 'source_meta': {'book_section': {
            'root_work_id': '1', 'section_id': '1-section-02', 'order': 2, 'kind': 'original_source_note_appendix',
            'char_start': 10, 'char_end_exclusive': 20, 'whole_book_complete': False}}})
        self.assertEqual((p['scheme'], p['order'], p['track'], p['char_start'], p['char_end']), ('section', 2, 'notes', 10, 20))
        self.assertFalse(p['whole_book_complete'])

    def test_literal_scheme_from_text_id(self):
        p = R.passport({'text_id': 'by-28023-literal-128666-129182', 'source_meta': {'book_section': {'char_start': 128666}}})
        self.assertEqual((p['scheme'], p['char_start'], p['char_end'], p['section_id']), ('literal', 128666, 129182, 'by-28023-literal-128666-129182'))

    def test_numbered_section_without_bounds(self):
        p = R.passport({'text_id': 'by-64596-section-47', 'source_meta': {'book_section': {}}})
        self.assertEqual((p['scheme'], p['order'], p['char_start']), ('section-n', 47, None))

    def test_plain_text_has_no_passport(self):
        self.assertEqual(R.passport({'text_id': 'by-10472', 'source_meta': {}})['scheme'], 'none')

    def test_tracks(self):
        self.assertEqual([R.track_of(k) for k in ('original_text', 'original_structure_appendix', 'original_book_appendix', None)],
                         ['text', 'structure', 'appendix', 'text'])


class AnchorTest(unittest.TestCase):
    SOURCE = 'כותרת\n\nשָׁלוֹם עוֹלָם, זה משפט ראשון. וזה משפט שני! ועוד משפט שלישי.'

    def test_letters_ignore_vowels_punctuation_and_spacing(self):
        self.assertEqual(R.letters('שָׁלוֹם, עוֹלָם!'), 'שלוםעולם')

    def test_rows_anchor_in_order_and_map_to_chars(self):
        stream, offsets = R.letter_index(self.SOURCE)
        spans = R.anchor_rows([row(0, 'שלום עולם, זה משפט ראשון.'), row(1, 'וזה משפט שני!')], stream)
        self.assertTrue(all(spans))
        self.assertLess(spans[0][1], spans[1][1])
        self.assertEqual(self.SOURCE[offsets[spans[1][0]]], 'ו')

    def test_unknown_row_does_not_derail_following_rows(self):
        stream, _ = R.letter_index(self.SOURCE)
        spans = R.anchor_rows([row(0, 'שלום עולם'), row(1, 'הערת עורך שאינה במקור'), row(2, 'ועוד משפט שלישי')], stream)
        self.assertIsNotNone(spans[0]); self.assertIsNone(spans[1]); self.assertIsNotNone(spans[2])

    def test_boundaries_report_gap_overlap_and_repeated_rows(self):
        src = {'text': self.SOURCE, 'sha256': 'x'}
        a = {'part_uid': 'a', 'title': 'A', 'passport': R.passport({'text_id': 'a'}), '_rows': [row(0, 'שלום עולם, זה משפט ראשון.'), row(1, 'וזה משפט שני!')]}
        b = {'part_uid': 'b', 'title': 'B', 'passport': R.passport({'text_id': 'b'}), '_rows': [row(0, 'וזה משפט שני!'), row(1, 'ועוד משפט שלישי.')]}
        R.anchor_work([a, b], src)
        edge = R.boundaries([a, b])[0]
        self.assertGreater(edge['overlap_letters'], 0)
        self.assertEqual(edge['repeated_edge_rows'], 1)
        c = {'part_uid': 'c', 'title': 'C', 'passport': R.passport({'text_id': 'c'}), '_rows': [row(0, 'ועוד משפט שלישי.')]}
        R.anchor_work([a, c], src)
        edge = R.boundaries([a, c])[0]
        self.assertEqual((edge['gap_letters'], edge['overlap_letters'], edge['repeated_edge_rows']), (0, 0, 0))


class BuildTest(unittest.TestCase):
    def test_end_to_end_dedup_conflict_and_actions(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            lib = tmp / 'lib'
            pub = lib / '2 без слоя импортировано в общедоступное'; new = lib / '7. со слоем не импортировано в общедоступное'
            pub.mkdir(parents=True); new.mkdir(parents=True)
            rows = [row(0, 'שלום עולם, זה משפט ראשון.'), row(1, 'וזה משפט שני!')]
            corpus = {'byehuda_id': 5}
            layer = {'schema': 'word-gloss-ai-layer-v1', 'rows': [{'order_index': 0, 'key': 'k', 'glosses': [{'gloss': 'a'}], 'mwe': [], 'model': 'm'}]}

            def write(folder, name, texts):
                with zipfile.ZipFile(folder / name, 'w') as z:
                    z.writestr('library/library.json', json.dumps({'schema_version': 1, 'texts': texts, 'shelves': [], 'audio_assets': []}))

            text = {'text_id': 'by-5', 'title': 'T', 'corpus': corpus, 'source_meta': {'text_learning': {'official_period': 'modern'}}, 'rows': rows}
            write(pub, 'a.learning.zip', [text])
            write(new, 'b.learning.zip', [dict(text, word_gloss_ai_layer=layer), {**text, 'text_id': 'by-6', 'corpus': {'byehuda_id': 6}, 'rows': [row(0, 'ועוד משפט שלישי.')]}])
            write(new, 'c.learning.zip', [{**text, 'text_id': 'by-6', 'corpus': {'byehuda_id': 6}, 'rows': [row(0, 'ועוד משפט שלישי.')]}])
            (tmp / 'idx.json').write_text(json.dumps({'version': 8, 'ready': [{'id': '5', 'learning_edition_id': 'e'}]}))
            (tmp / 'pc.csv').write_text('ID,path,title,authors\n5,/p1/m5,T,A\n6,/p1/m6,U,B\n', encoding='utf-8')
            (tmp / 'txt' / 'p1').mkdir(parents=True)
            (tmp / 'txt' / 'p1' / 'm5.txt').write_text(AnchorTest.SOURCE, encoding='utf-8')
            (tmp / 'txt' / 'p1' / 'm6.txt').write_text(AnchorTest.SOURCE, encoding='utf-8')
            args = type('A', (), {'library_root': lib, 'catalog_index': tmp / 'idx.json', 'pseudocatalogue': tmp / 'pc.csv', 'txt_cache': tmp / 'txt', 'fetch': False})
            reg = R.build(args)
            self.assertEqual(reg['counts']['duplicate_parts'], 2)  # by-6 in b and c; published by-5 absorbed by its layer copy
            works = {w['work_id']: w for w in reg['works']}
            # Work 5: identical rows already published in folder 2; the folder-7 copy only adds the AI layer.
            self.assertEqual((works['5']['action'], works['5']['parts']), ('enrich-layer', 1))
            part5 = next(p for p in reg['parts'] if p['work_id'] == '5')
            self.assertTrue(part5['ai']['present'])
            self.assertEqual(works['6']['action'], 'publish-without-ai')
            self.assertEqual(works['6']['rows_unanchored'], 0)
            self.assertIn('## Счётчики', R.report(reg))


if __name__ == '__main__':
    unittest.main()
