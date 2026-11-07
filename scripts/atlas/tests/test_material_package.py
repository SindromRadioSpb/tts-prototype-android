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
