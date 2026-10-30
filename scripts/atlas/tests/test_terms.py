"""Terms pack (linguistpro.atlas-terms-pack.1.0.0): checked against the book text and the candidate list."""
import copy
import hashlib
import json
import os
import shutil
import tempfile
import unittest

import atlas_book as B
import atlas_validate as V

BOOK = [{'page': 197, 'section': 's09-belt', 'text': 'שימוש בגלגל מניע קטן וגלגל מונע גדול. יחס תמסורת'},
        {'page': 198, 'section': 's09-belt', 'text': 'אורך רצועה'}]
CANDS = [{'id': 'c0001', 'he': 'גלגל מניע', 'sources': ['phrase'], 'count': 6, 'pages': [197], 'sections': ['s09-belt'], 'context': ''},
         {'id': 'c0002', 'he': 'יחס תמסורת', 'sources': ['heading'], 'count': 1, 'pages': [197], 'sections': ['s09-belt'], 'context': ''}]


def term(**over):
    t = {'type': 'term', 'id': 'a97002:term:galgal-mania', 'lemma_he': 'גלגל מניע', 'niqqud': 'גַּלְגַּל מֵנִיעַ',
         'translit': "galgal meni'a", 'senses': [{'sense': 'driving-pulley', 'ru': 'ведущий шкив', 'context': 'ременная передача'}],
         'occurrences': [{'page': 197, 'he': 'בגלגל מניע'}], 'candidates': ['c0001']}
    t.update(over)
    return t


class Env:
    def __init__(self, test):
        self.dir = tempfile.mkdtemp(prefix='atlas-terms-')
        test.addCleanup(shutil.rmtree, self.dir, True)
        self.book = self._jsonl('book-text.jsonl', BOOK)
        self.cands = self._jsonl('term-candidates.jsonl', CANDS)
        with open(self.cands, 'rb') as fh:
            self.sha = hashlib.sha256(fh.read().replace(b'\r\n', b'\n')).hexdigest()

    def _jsonl(self, name, rows):
        path = os.path.join(self.dir, name)
        with open(path, 'w', encoding='utf-8', newline='\n') as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + '\n')
        return path

    def run(self, terms, header=None):
        h = {'type': 'header', 'schema': 'linguistpro.atlas-terms-pack.1.0.0', 'atlas_id': 'a97002',
             'candidates_sha256': self.sha, 'producer': 'test', 'produced_at': '2026-10-31T04:00:00Z'}
        h.update(header or {})
        path = self._jsonl('terms.jsonl', [h] + terms)
        return V.validate_terms(self.book, self.cands, path)


def codes(report, kind='errors'):
    return sorted({f['code'] for f in report[kind]})


class TermsTest(unittest.TestCase):
    def test_clean_terms_ok(self):
        report = Env(self).run([term()])
        self.assertEqual(report['errors'], [])
        self.assertEqual(report['stats']['terms'], 1)

    def test_occurrence_must_be_on_that_page(self):
        self.assertIn('E_OCCURRENCE', codes(Env(self).run([term(occurrences=[{'page': 198, 'he': 'בגלגל מניע'}])])))
        self.assertIn('E_OCCURRENCE', codes(Env(self).run([term(occurrences=[{'page': 197, 'he': 'גלגל שיניים'}])])))
        # punctuation and niqqud in the quote do not matter, letters do
        self.assertEqual(codes(Env(self).run([term(occurrences=[{'page': 197, 'he': 'יַחַס תִּמְסֹרֶת'}])])), [])

    def test_occurrences_required(self):
        self.assertIn('E_SCHEMA', codes(Env(self).run([term(occurrences=[])])))

    def test_niqqud_skeleton(self):
        # מניע/מונע differ only in vowel letters, which the skeleton ignores by design; a different word must fail
        self.assertIn('E_NIQQUD_BASE', codes(Env(self).run([term(niqqud='גַּלְגַּל שִׁנַּיִם')])))

    def test_unknown_candidate_and_duplicates(self):
        self.assertIn('E_REF', codes(Env(self).run([term(candidates=['c9999'])])))
        self.assertIn('E_TERM', codes(Env(self).run([term(), term()])))

    def test_stale_candidates(self):
        self.assertEqual(codes(Env(self).run([term()], header={'candidates_sha256': '0' * 64})), ['E_SOURCE_MISMATCH'])

    def test_reserved_and_owner_fields_rejected(self):
        self.assertIn('E_SCHEMA', codes(Env(self).run([term(status={'owner_status': 'owner_confirmed'})])))


class BookTextTest(unittest.TestCase):
    def test_book_text_from_packs(self):
        root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, root, True)
        d = os.path.join(root, 's09-belt')
        os.makedirs(d)
        with open(os.path.join(d, 'pages.jsonl'), 'w', encoding='utf-8') as fh:
            for o in [{'type': 'page', 'id': 'a97002:p197', 'page': 197},
                      {'type': 'block', 'id': 'a97002:p197:b001', 'page': 197, 'he_raw': 'יחס תמסורת', 'kind_guess': 'heading'},
                      {'type': 'symbol', 'id': 'a97002:p197:st1:s01', 'page': 197, 'symbol_raw': 'd', 'description_he_raw': 'קוטר גלגל מניע', 'unit_raw': 'mm'}]:
                fh.write(json.dumps(o, ensure_ascii=False) + '\n')
        rows = B.book_text(root, ['s09-belt'])
        self.assertEqual(rows, [{'page': 197, 'section': 's09-belt', 'text': 'יחס תמסורת\nd — קוטר גלגל מניע mm'}])


if __name__ == '__main__':
    unittest.main()
