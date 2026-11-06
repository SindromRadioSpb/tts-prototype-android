import copy
import unittest
import reader_structure_upgrade as U

class SemanticUpgradeTest(unittest.TestCase):
    def fixture(self):
        values={'he':'מסה. נפח.', 'he_niqqud':'מַסָּה. נֶפַח.', 'translit':'Masa. Nefakh.', 'translit_ru':'Маса. Нэфах.', 'ru':'Масса. Объём.'}
        old={'id':'a97001:p1:b001','type':'block','kind':'prose','y':10,**values}
        children=[]
        for n in (0,1):
            spans={k:([[0,v.index(' ')+1]] if n==0 else [[v.index(' ')+1,len(v)]]) for k,v in values.items()}
            children.append({'key':f's0{n+1}','kind':'definition','fields':{k:values[k][a[0][0]:a[0][1]].strip() for k,a in spans.items()},'spans':spans,'terms':[]})
        rec={'target':old['id'],'original_fields':values,'children':children,'status':'ready'}
        section={'atlas_id':'a97001','id':'s0','source_pack_sha256':'source','content_pack_sha256':'content','pages':[{'page':1,'items':[old]}],'terms':{}}
        spec={'revision':'revision','pdf_sha256':'pdf','base_commit':'commit','sections':{'s0':{'source_pack_sha256':'source','content_pack_sha256':'content','splits':[rec],'occurrence_compatibility':{'source_revision':'content','rows':[{'id':old['id'],'order_index':0,**{k:values[k] for k in ('he','he_niqqud','ru')}}]}}}}
        return section,spec

    def test_lossless_split_legacy_snapshot_and_idempotence(self):
        old,spec=self.fixture();fixed,log=U.apply_section(old,spec)
        self.assertEqual(fixed['pages'][0]['legacy_groups'][0]['original'],old['pages'][0]['items'][0])
        self.assertEqual(len(fixed['pages'][0]['items']),2)
        self.assertEqual(U.apply_section(fixed,spec),(fixed,[]))
        self.assertEqual(len(old['pages'][0]['items']),1)

    def test_altered_source_and_altered_child_are_rejected(self):
        old,spec=self.fixture();bad=copy.deepcopy(old);bad['pages'][0]['items'][0]['ru']+='!'
        with self.assertRaisesRegex(ValueError,'STRUCTURE_SOURCE_CHANGED'):U.apply_section(bad,spec)
        fixed,_=U.apply_section(old,spec);fixed['pages'][0]['items'][0]['he']+='!'
        with self.assertRaisesRegex(ValueError,'STRUCTURE_CHILD_CHANGED'):U.apply_section(fixed,spec)

    def test_missing_span_is_not_declared_complete(self):
        old,spec=self.fixture();r=spec['sections']['s0']['splits'][0]
        r['children'][1]['spans']['ru']=[];r['children'][1]['fields']['ru']=''
        with self.assertRaisesRegex(ValueError,'STRUCTURE_COVERAGE'):U.apply_section(old,spec)

    def test_different_book_is_unchanged(self):
        old,spec=self.fixture();old['atlas_id']='a97002';self.assertEqual(U.apply_section(old,spec),(old,[]))
