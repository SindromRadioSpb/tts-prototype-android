import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).parents[1]))
import material_package as package

class MaterialPackageTest(unittest.TestCase):
    def archive(self, root, extra=None):
        data = b'{"unknown":"preserved"}\r\n'
        manifest = {'schema':'linguistpro.atlas-material.1','atlas_id':'a97002','revision':'fixture',
                    'files':{'edition/index.json':{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}}}
        manifest['ai_dependencies_sha256'] = hashlib.sha256(b'{}').hexdigest()
        file = root / 'source.zip'
        with zipfile.ZipFile(file,'x') as z:
            z.writestr('manifest.json',json.dumps(manifest));z.writestr('edition/index.json',data)
            if extra:z.writestr(extra,b'bad')
        return file, manifest

    def test_restore_dry_run_collision_and_repack(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);archive,manifest=self.archive(root);destination=root/'restored'
            package.restore(archive,destination);self.assertFalse(destination.exists())
            package.restore(archive,destination,True)
            with self.assertRaises(ValueError):package.restore(archive,destination,True)
            package.repack(destination,root/'again.zip')
            self.assertEqual(package.verify(root/'again.zip'),manifest)
            with zipfile.ZipFile(archive) as a, zipfile.ZipFile(root/'again.zip') as b:
                self.assertEqual({n:a.read(n) for n in a.namelist()},{n:b.read(n) for n in b.namelist()})
            (destination/'edition/index.json').write_bytes(b'changed')
            with self.assertRaises(ValueError):package.verify(destination)

    def test_unsafe_or_extra_zip_entries_refused_before_write(self):
        for name in ['../outside','/absolute','C:/escape','edition/extra.json','CON','edition/a\\b']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);archive,_=self.archive(root,name)
                with self.assertRaises(ValueError):package.restore(archive,root/'destination',True)
                self.assertFalse((root/'destination').exists())

    def test_updated_file_hash_cannot_preserve_stale_ai_dependencies(self):
        for name in ('edition/sections/s01.json', 'sources/source.pdf', 'edition/assets/page.png'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                data = b'original'
                files = {name: {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}}
                manifest = {'schema': 'linguistpro.atlas-material.1', 'atlas_id': 'future-atlas',
                            'files': files, 'ai_dependencies_sha256': hashlib.sha256(
                                json.dumps(files, separators=(',', ':')).encode()).hexdigest()}
                (root / name).parent.mkdir(parents=True)
                (root / name).write_bytes(data)
                (root / 'manifest.json').write_text(json.dumps(manifest))
                package.verify(root)
                # Updating the ordinary file inventory is insufficient: the old
                # AI dependency binding must not be carried into changed material.
                (root / name).write_bytes(b'changed')
                files[name] = {'sha256': hashlib.sha256(b'changed').hexdigest(), 'bytes': 7}
                (root / 'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, 'AI requires revalidation'):
                    package.verify(root)
