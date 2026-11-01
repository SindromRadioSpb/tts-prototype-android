import json
import os
import unittest

import reader_corrections as RC


def section(items, page=22, sid='s02-rivets'):
    return {'id': sid, 'atlas_id': 'a97002', 'pages': [{'page': page, 'items': items, 'figures': [], 'tables': [], 'errata': [], 'editor': []}]}


class ReaderCorrectionsTest(unittest.TestCase):
    def test_lost_spaces_are_restored_and_real_words_stay(self):
        glued = {'жёсткостиверхнейинижнейпары': 'жёсткости верхней и нижней пары'}
        f = lambda t: RC.fix_text(t, glued)
        self.assertEqual(f('по таблице303 и4 силы'), 'по таблице 303 и 4 силы')
        self.assertEqual(f('228сохранена; 5ремней'), '228 сохранена; 5 ремней')
        self.assertEqual(f('частота вrpm, уголα, наf'), 'частота в rpm, угол α, на f')
        self.assertEqual(f('Computeпредставляет числоЭйлера'), 'Compute представляет число Эйлера')
        self.assertEqual(f('C1 — жёсткостиверхнейинижнейпары'), 'C1 — жёсткости верхней и нижней пары')
        # notation and units stay as they are
        self.assertEqual(f('nсреза, 10 кН, 2 кВт, 3 даН/мм², износостойкость'), 'nсреза, 10 кН, 2 кВт, 3 даН/мм², износостойкость')
        # a dictionary entry never cuts a longer word
        self.assertEqual(RC.fix_text('ивыбор ивыборка', {'ивыбор': 'и выбор'}), 'и выбор ивыборка')
        # Hebrew-only text is untouched
        self.assertEqual(f('קוטר מסמרה'), 'קוטר מסמרה')

    def test_structure_split_drop_set_and_idempotence(self):
        data = section([{'id': 'a97002:p22:b008', 'type': 'block', 'y': 553, 'he': 'd [mm] 1 הערה: x', 'ru': 'd [мм] 1 Примечание: x',
                         'status': {'language_review': 'producer_checked'}}])
        ops = {'glued': {}, 'structure': [
            {'section': 's02-rivets', 'page': 22, 'op': 'replace', 'id': 'a97002:p22:b008', 'why': 't',
             'with': [{'id': 'a97002:p22:b008', 'y': 553, 'he': 'd [mm] 1', 'ru': 'd [мм] 1'},
                      {'id': 'a97002:p22:b008s', 'y': 600, 'kind': 'prose', 'he': 'הערה: x', 'ru': 'Примечание: x'}]}]}
        once, log = RC.apply_section(data, ops)
        items = once['pages'][0]['items']
        self.assertEqual([i['id'] for i in items], ['a97002:p22:b008', 'a97002:p22:b008s'])
        self.assertEqual(items[1]['status'], {'language_review': 'producer_checked'}, 'the new block keeps the status')
        twice, log2 = RC.apply_section(once, ops)
        self.assertEqual(twice, once)
        self.assertEqual(log2, [])
        self.assertEqual(data['pages'][0]['items'][0]['ru'], 'd [мм] 1 Примечание: x', 'the input is not changed')

    def test_book_corrections_file_is_valid(self):
        c = RC.load_corrections('a97002')
        self.assertGreater(len(c['glued']), 100)
        # entries that also restore a letter the join swallowed (reviewed one by one)
        letter_fixes = {'полученокруглением'}
        for k, v in c['glued'].items():
            if k not in letter_fixes:
                self.assertEqual(k.replace(' ', ''), v.replace(' ', ''), 'a glued entry only adds spaces: ' + k)
        for op in c['structure']:
            self.assertIn(op['op'], ('replace', 'drop', 'set'))
            self.assertTrue(op.get('why'))

    def test_build_applies_the_corrections(self):
        src = open(os.path.join(RC.HERE, 'build_reader_data.py'), encoding='utf-8').read()
        self.assertIn('RC.apply_section(data)', src)


if __name__ == '__main__':
    unittest.main()
