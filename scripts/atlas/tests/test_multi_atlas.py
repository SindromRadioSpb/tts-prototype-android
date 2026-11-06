"""Second-book identities and explicit numeric reflow retain import safeguards."""
import copy
import json
import unittest
import reader_corrections as RC

import atlas_import as I
import atlas_schema as S
import atlas_validate as V
import build_reader_data as R
from test_validate import Pack, clean_content, codes


class MultiAtlasTest(unittest.TestCase):
    def test_figure_reflow_preserves_other_collections_and_is_idempotent(self):
        data = {'atlas_id':'a97001','id':'s01','pages':[{'page':1,
                'items':[{'id':'a97001:p1:b001','type':'block','ru':'Текст'}],
                'figures':[{'id':'a97001:p1:img01','caption_ru':'Основная схема'},
                           {'id':'a97001:p1:img02','caption_ru':'Повтор подписи'}],
                'tables':[], 'editor':[], 'errata':[]}]}
        corrections = {'structure':[{'op':'drop','collection':'figures','section':'s01','page':1,
                       'ids':['a97001:p1:img02'],'why':'подпись включена в основную схему'}]}
        fixed, _ = RC.apply_section(data, corrections)
        self.assertEqual(fixed['pages'][0]['items'], data['pages'][0]['items'])
        self.assertEqual([f['id'] for f in fixed['pages'][0]['figures']], ['a97001:p1:img01'])
        self.assertEqual(len(data['pages'][0]['figures']), 2)
        self.assertEqual(RC.apply_section(fixed, corrections)[0], fixed)

    def test_second_book_accepts_own_ids_only(self):
        p = Pack(self)
        p.source.manifest = json.loads(json.dumps(p.source.manifest).replace('a97002', 'a97001'))
        p.source.objects = json.loads(json.dumps(p.source.objects).replace('a97002', 'a97001'))
        p.source.order = [s.replace('a97002', 'a97001') for s in p.source.order]
        content = json.loads(json.dumps(clean_content()).replace('a97002', 'a97001'))
        report = p.run(content, p.header(atlas_id='a97001'))
        self.assertTrue(report['ok'], report['errors'])
        bad = copy.deepcopy(content)
        bad[0]['id'] = bad[0]['id'].replace('a97001', 'a97002')
        self.assertIn('E_SCHEMA', codes(p.run(bad, p.header(atlas_id='a97001'))))
        self.assertIn('E_HEADER', codes(p.run(content, p.header())))
        self.assertEqual(I.permanent_id('new:a97001:p197:label', 'table'), 'a97001:p197:t-label')

    def test_schema_cache_does_not_leak_between_books(self):
        one = S.load_schema('content-pack', 'a97001')
        two = S.load_schema('content-pack')
        self.assertEqual(one['$defs']['header']['properties']['atlas_id']['const'], 'a97001')
        self.assertEqual(two['$defs']['header']['properties']['atlas_id']['const'], 'a97002')
        with self.assertRaises(ValueError):
            S.load_schema('content-pack', '../other')

    def test_numeric_reflow_requires_explicit_same_page_translation(self):
        p = Pack(self)
        content = clean_content()
        block = next(o for o in content if o['id'] == 'a97002:p197:b002')
        block['ru'] = 'Перевод без чисел'
        target = next(o for o in content if o['id'] == 'a97002:p197:b001')
        target['ru'] += ' 2; 0,05'
        self.assertIn('E_NUMBERS', codes(p.run(content)))
        block['number_refs'] = [target['id']]
        self.assertNotIn('E_NUMBERS', codes(p.run(content)))
        block['number_refs'] = ['a97002:p198:b001']
        self.assertIn('E_REF', codes(p.run(content)))
        self.assertIn('E_NUMBERS', codes(p.run(content)))

    def test_source_erratum_keeps_printed_number_in_note(self):
        p = Pack(self)
        content = clean_content()
        block = next(o for o in content if o['id'] == 'a97002:p197:b002')
        block['ru'] = 'Перевод с исправленным числом 3 и 0,05'
        self.assertIn('E_NUMBERS', codes(p.run(content)))
        block['ambiguity_note'] = 'В исходнике 2; редактор предлагает 3.'
        self.assertNotIn('E_NUMBERS', codes(p.run(content)))

    def test_book_index_uses_book_identity(self):
        book = {'atlas_id': 'a97001', 'title_he': 'מכניקה', 'title_ru': 'Механика'}
        index = R.build_index([], {}, [], book)
        self.assertEqual(index['atlas_id'], 'a97001')
        self.assertEqual(index['title_ru'], 'Механика')
        self.assertEqual(R.build_index([], {}, [])['atlas_id'], 'a97002')


if __name__ == '__main__':
    unittest.main()
