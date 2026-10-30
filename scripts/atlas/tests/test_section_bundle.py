"""A section archive is self-contained and validates against the book-wide term core."""
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile

import build_dots_bundle as B

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PILOT = os.path.join(ROOT, 'atlas', 'a97002', 'pilot')
TERMS = os.path.join(ROOT, 'docs', 'research', 'engineering-atlas', '2026-10-31-dots-terms-errata', 'a97002-terms-v1.jsonl')


class SectionBundleTest(unittest.TestCase):
    def test_section_bundle(self):
        tmp = tempfile.mkdtemp(prefix='atlas-section-')
        section = {'id': 's09-belt', 'first': 195, 'last': 197, 'he': 'תמסורת רצועה', 'ru': 'Ременная передача'}
        zip_path = os.path.join(tmp, 's.zip')
        names = B.build_section_bundle(zip_path, section, os.path.join(PILOT, 'source-pack'), TERMS)
        self.assertIn('terms/a97002-terms-v1.jsonl', names)
        self.assertIn('source-pack/pages.jsonl', names)
        out = os.path.join(tmp, 'u')
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(out)
            task = zf.read('TASK.ru.md').decode('utf-8')
        self.assertNotIn('{', task.split('```json')[1].split('```')[0].replace('{"type"', '').replace('"}', ''))
        self.assertIn('a97002-content-s09-belt-v1.jsonl', task)
        self.assertIn('195,196,197', task)
        result = subprocess.run([sys.executable, '-I', 'tools/atlas_validate.py', '--source', 'source-pack',
                                 '--content', 'reference/reference-content.jsonl', '--terms-core', 'terms/a97002-terms-v1.jsonl', '--json'],
                                cwd=out, capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stdout[-1500:] + result.stderr[-800:])


if __name__ == '__main__':
    unittest.main()
