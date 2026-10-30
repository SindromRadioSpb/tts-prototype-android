"""The term-core archive is self-contained: unpacked anywhere, its validator checks a terms pack."""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile

import build_dots_bundle as B


class TermsBundleTest(unittest.TestCase):
    def test_terms_bundle_validates_a_pack_in_isolation(self):
        tmp = tempfile.mkdtemp(prefix='atlas-terms-bundle-')
        book = os.path.join(tmp, 'book.jsonl')
        cands = os.path.join(tmp, 'cands.jsonl')
        with open(book, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps({'page': 197, 'section': 's09-belt', 'text': 'יחס תמסורת'}, ensure_ascii=False) + '\n')
        with open(cands, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps({'id': 'c0001', 'he': 'יחס תמסורת', 'sources': ['heading'], 'count': 1, 'pages': [197],
                                 'sections': ['s09-belt'], 'context': ''}, ensure_ascii=False) + '\n')
        zip_path = os.path.join(tmp, 'terms.zip')
        names = B.build_terms_bundle(zip_path, book, cands)
        self.assertTrue({'TASK.ru.md', 'term-candidates.jsonl', 'book-text.jsonl', 'sections.json', 'tools/atlas_validate.py'} <= set(names))
        out = os.path.join(tmp, 'unpacked')
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(out)
            task = zf.read('TASK.ru.md').decode('utf-8')
        sha = hashlib.sha256(open(cands, 'rb').read()).hexdigest()
        self.assertNotIn('{CANDIDATES_SHA256}', task)
        self.assertIn(sha, task)
        self.assertIn('1 кандидатов', task)
        term = {'type': 'term', 'id': 'a97002:term:yakhas-timsoret', 'lemma_he': 'יחס תמסורת', 'niqqud': 'יַחַס תִּמְסֹרֶת',
                'translit': 'yakhas timsoret', 'senses': [{'sense': 'gear-ratio', 'ru': 'передаточное отношение', 'context': ''}],
                'occurrences': [{'page': 197, 'he': 'יחס תמסורת'}], 'candidates': ['c0001']}
        header = {'type': 'header', 'schema': 'linguistpro.atlas-terms-pack.1.0.0', 'atlas_id': 'a97002',
                  'candidates_sha256': sha, 'producer': 't', 'produced_at': 'now'}
        with open(os.path.join(out, 'terms.jsonl'), 'w', encoding='utf-8') as fh:
            fh.write(json.dumps(header, ensure_ascii=False) + '\n' + json.dumps(term, ensure_ascii=False) + '\n')
        result = subprocess.run([sys.executable, '-I', 'tools/atlas_validate.py', '--terms', 'terms.jsonl',
                                 '--book-text', 'book-text.jsonl', '--candidates', 'term-candidates.jsonl', '--json'],
                                cwd=out, capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stdout[-1500:] + result.stderr[-1500:])


if __name__ == '__main__':
    unittest.main()
