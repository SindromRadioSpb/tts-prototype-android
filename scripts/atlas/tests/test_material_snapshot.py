import importlib.util
import pathlib
import tempfile
import unittest
import sys
import json
import hashlib
import copy

sys.path.insert(0, str(pathlib.Path(__file__).parents[1]))

spec = importlib.util.spec_from_file_location('snapshot', pathlib.Path(__file__).parents[1] / 'material_snapshot.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class SnapshotTest(unittest.TestCase):
    def test_pdf_and_images_invalidate_all_sections_without_text_changes(self):
        for name in ['source.pdf','edition/assets/scan.png','edition/assets/figure.JPG','edition/assets/opaque.bin']:
            for operation in ['replace','delete','add']:
                with self.subTest(name=name,operation=operation), tempfile.TemporaryDirectory() as tmp:
                    root=pathlib.Path(tmp);base=root/'base';(base/'edition/sections').mkdir(parents=True)
                    for sid in ['s01','s02']:(base/('edition/sections/'+sid+'.json')).write_text('{}')
                    if operation!='add':
                        p=base/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'original image or PDF')
                    edited=root/'edited';m.transfer(base,edited);p=edited/name
                    if operation=='delete':p.unlink()
                    else:p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'changed image or PDF')
                    diff=m.difference(base,edited)
                    self.assertEqual(diff['ai_requires_review'],['edition/sections/s01.json','edition/sections/s02.json'])
                    self.assertEqual(diff['source_changes'],[name])
                    self.assertEqual(diff['invalidation_scope'],'all_sections_source_changed')
                    for sid in ['s01','s02']:self.assertEqual((base/('edition/sections/'+sid+'.json')).read_bytes(),(edited/('edition/sections/'+sid+'.json')).read_bytes())

    def test_semantics_and_stale_ai_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp); base = root / 'base'
            (base / 'edition/sections').mkdir(parents=True)
            (base / 'context').mkdir()
            (base / 'source.pdf').write_bytes(b'pdf fixture')
            pdf = hashlib.sha256(b'pdf fixture').hexdigest()
            index = {'atlas_id':'a97001','sections':[{'id':'s01-test','first':1,'last':1}]}
            section = {'atlas_id':'a97001','id':'s01-test','structure_provenance':{'pdf_sha256':pdf},
                'pages':[{'page':1,'items':[{'id':'a97001:p1:b1','he':'original','terms':['t#s']}],
                          'tables':[{'id':'a97001:p1:t1','parent':'a97001:p1','cells':[{'row':0,'col':0,'he':'cell'}]}]}],
                'terms':{'t':{'senses':[{'sense':'s'}]}}}
            def save(s): (base / 'edition/sections/s01-test.json').write_text(json.dumps(s),encoding='utf8')
            (base / 'edition/index.json').write_text(json.dumps(index),encoding='utf8');save(section)
            (base / 'context/s01-test.json').write_text('{"accepted":true}')
            (base / 'context/manifest.json').write_text('{}')
            self.assertTrue(m.validate_material(base)['ok'])
            for mutate in [
                lambda s:s['pages'][0]['items'].append(copy.deepcopy(s['pages'][0]['items'][0])),
                lambda s:s['pages'][0]['tables'][0].update(parent='missing'),
                lambda s:s['pages'][0]['items'][0].update(terms=['missing']),
                lambda s:s['pages'][0]['tables'][0]['cells'].append({'row':0,'col':0}),
                lambda s:s['structure_provenance'].update(pdf_sha256='wrong')]:
                bad=copy.deepcopy(section);mutate(bad);save(bad)
                with self.assertRaises(ValueError):m.validate_material(base)
            save(section)
            edited=root/'edited';m.transfer(base,edited)
            changed=copy.deepcopy(section);changed['pages'][0]['items'][0]['he']='edited'
            (edited/'edition/sections/s01-test.json').write_text(json.dumps(changed),encoding='utf8')
            destination=root/'draft';before=m.inventory(edited)
            report=m.prepare(edited,base,destination)
            self.assertFalse(destination.exists());self.assertEqual(m.inventory(edited),before)
            self.assertEqual(report['ai_requires_review'],['s01-test.json'])
            m.prepare(edited,base,destination,True)
            self.assertFalse((destination/'context/s01-test.json').exists())
            self.assertFalse((destination/'context/manifest.json').exists())
            self.assertEqual((destination/'evidence/ai-requires-review/s01-test.json').read_bytes(),(base/'context/s01-test.json').read_bytes())
            self.assertFalse(json.loads((destination/'DRAFT.json').read_text())['publication_allowed'])
            with self.assertRaises(ValueError):m.prepare(edited,base,destination,True)
            # Image-only edit: section bytes stay untouched but active AI is removed.
            (base/'edition/assets').mkdir();(base/'edition/assets/scan.png').write_bytes(b'original')
            visual=root/'visual';m.transfer(base,visual)
            (visual/'edition/assets/scan.png').write_bytes(b'replacement')
            visual_report=m.prepare(visual,base,root/'visual-draft',True)
            self.assertEqual(visual_report['ai_requires_review'],['s01-test.json'])
            self.assertFalse((root/'visual-draft/context/s01-test.json').exists())
            self.assertTrue((root/'visual-draft/evidence/ai-requires-review/s01-test.json').exists())
            self.assertEqual((visual/'edition/sections/s01-test.json').read_bytes(),(base/'edition/sections/s01-test.json').read_bytes())
            # A replacement PDF with an old provenance binding fails before writing.
            (visual/'source.pdf').write_bytes(b'different pdf')
            with self.assertRaises(ValueError):m.prepare(visual,base,root/'bad-pdf-draft',True)
            self.assertFalse((root/'bad-pdf-draft').exists())

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
