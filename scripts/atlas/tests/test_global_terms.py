"""Section packs refer to the book-wide term core instead of redefining terms."""
import json
import os
import unittest

import atlas_validate as V
from tests.test_validate import Pack, clean_content, codes

TERM = {'type': 'term', 'id': 'a97002:term:galgal-mania', 'lemma_he': 'גלגל מניע', 'niqqud': 'גַּלְגַּל מֵנִיעַ',
        'translit': "galgal meni'a", 'senses': [{'sense': 'driving-pulley', 'ru': 'ведущий шкив', 'context': ''}],
        'occurrences': [{'page': 197, 'he': 'גלגל מניע'}]}


class GlobalTermsTest(unittest.TestCase):
    def write_terms(self, pack):
        path = os.path.join(pack.dir, 'terms.jsonl')
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(json.dumps({'type': 'header', 'schema': 'linguistpro.atlas-terms-pack.1.0.0', 'atlas_id': 'a97002',
                                 'candidates_sha256': '0' * 64, 'producer': 't', 'produced_at': 'x'}) + '\n')
            fh.write(json.dumps(TERM, ensure_ascii=False) + '\n')
        return path

    def test_refs_resolve_against_the_term_core(self):
        pack = Pack(self)
        objs = [o for o in clean_content() if o['type'] != 'term']  # the section pack defines no terms itself
        content = pack.write(objs)
        self.assertIn('E_REF', codes(V.validate(pack.source, content)))
        report = V.validate(pack.source, content, terms_path=self.write_terms(pack))
        self.assertEqual(report['errors'], [])

    def test_unused_core_terms_are_not_warned_about(self):
        pack = Pack(self)
        path = self.write_terms(pack)
        with open(path, 'a', encoding='utf-8') as fh:
            fh.write(json.dumps(dict(TERM, id='a97002:term:retsua'), ensure_ascii=False) + '\n')
        objs = [o for o in clean_content() if o['type'] != 'term']
        report = V.validate(pack.source, pack.write(objs), terms_path=path)
        self.assertNotIn('W_TERM_UNUSED', codes(report, 'warnings'))

    def test_redefining_a_core_term_is_flagged(self):
        pack = Pack(self)
        report = V.validate(pack.source, pack.write(clean_content()), terms_path=self.write_terms(pack))
        self.assertIn('W_TERM_REDEFINED', codes(report, 'warnings'))


if __name__ == '__main__':
    unittest.main()
