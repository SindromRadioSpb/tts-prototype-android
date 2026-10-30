"""The dots bundle is self-contained: unpacked anywhere, its validator passes the reference."""
import hashlib
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile

import build_dots_bundle as B

REQUIRED = ['README.ru.md', 'TASK.ru.md', 'schemas/source-pack.schema.json', 'schemas/content-pack.schema.json',
            'tools/atlas_compute.py', 'tools/atlas_schema.py', 'tools/atlas_validate.py',
            'source-pack/manifest.json', 'source-pack/pages.jsonl', 'source-pack/contact-sheet.png',
            'reference/reference-content.jsonl', 'reference/README.md']


class BundleTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='atlas-bundle-')
        cls.zip_path = os.path.join(cls.tmp, 'bundle.zip')
        cls.names = B.build_bundle(cls.zip_path)

    def test_bundle_contents(self):
        for name in REQUIRED:
            self.assertIn(name, self.names)
        self.assertTrue(any(n.startswith('source-pack/assets/') and n.endswith('.png') for n in self.names))

    def test_validator_runs_isolated_from_the_repo(self):
        out = os.path.join(self.tmp, 'unpacked')
        with zipfile.ZipFile(self.zip_path) as zf:
            zf.extractall(out)
        result = subprocess.run([sys.executable, '-I', 'tools/atlas_validate.py', '--source', 'source-pack',
                                 '--content', 'reference/reference-content.jsonl', '--json'],
                                cwd=out, capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stderr[-2000:])
        self.assertIn('"ok": true', result.stdout)

    def test_no_owner_paths(self):
        with zipfile.ZipFile(self.zip_path) as zf:
            for name in zf.namelist():
                if name.endswith(('.md', '.json', '.jsonl', '.py')):
                    text = zf.read(name).decode('utf-8')
                    for needle in ('G:\\', 'E:\\', 'Andasa', 'lletp'):
                        self.assertNotIn(needle, text, name)

    def test_bundle_is_reproducible(self):
        second = os.path.join(self.tmp, 'again.zip')
        B.build_bundle(second)
        digest = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
        self.assertEqual(digest(self.zip_path), digest(second))


if __name__ == '__main__':
    unittest.main()
