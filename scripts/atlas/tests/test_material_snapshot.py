import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('snapshot', pathlib.Path(__file__).parents[1] / 'material_snapshot.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class SnapshotTest(unittest.TestCase):
    def test_roundtrip_tamper_collision_and_invalidation(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = pathlib.Path(tmp); s = r / 'source'; (s / 'sections').mkdir(parents=True)
            (s / 'sections/s01.json').write_bytes(b'{"unknown":{"id":"preserved"}}\r\n')
            (s / 'image.bin').write_bytes(bytes(range(256)))
            m.transfer(s, r / 'package', True)
            m.verify(r / 'package')
            m.transfer(r / 'package/payload', r / 'candidate')
            m.transfer(r / 'candidate', r / 'again', True)
            self.assertEqual(m.verify(r / 'package'), m.verify(r / 'again'))
            with self.assertRaises(ValueError): m.transfer(s, r / 'candidate')
            (r / 'candidate/sections/s01.json').write_bytes(b'changed')
            self.assertEqual(m.difference(s, r / 'candidate')['ai_requires_review'], ['sections/s01.json'])
            (r / 'package/payload/extra').write_bytes(b'x')
            with self.assertRaises(ValueError): m.verify(r / 'package')
