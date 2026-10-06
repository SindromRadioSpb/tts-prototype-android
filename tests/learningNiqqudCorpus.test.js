'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const Corpus = require('../scripts/premium/learning-niqqud-corpus');
const Builder = require('../scripts/premium/build-learning-niqqud');
test('isolated holams do not pass as complete pointing even when every word has a mark', () => {
  const partial = Corpus.auditRows([{ hebrew_plain: 'הבוקר הטהורים.', hebrew_niqqud: 'הבוֹקר הטהוֹרים.' }]);
  assert.equal(partial.vocalized_ratio, 1); assert.equal(partial.needs_preparation, true);
  assert.equal(Corpus.auditRows([{ hebrew_plain: 'שלום לכם.', hebrew_niqqud: 'שָׁלוֹם לָכֶם.' }]).needs_preparation, false);
});
test('publication rejects catalog drift, incomplete coverage and a different work pin', () => {
  const bytes = Buffer.from(JSON.stringify({ version: 9, ready: [{ id: '34190' }, { id: '20' }] }));
  const manifest = { schema: 1, revision: 2, catalog_version: 9, catalog_sha256: Corpus.hash(bytes), works: {} };
  for (const id of ['34190', '20']) manifest.works[id] = { file: 'learning-niqqud/' + id + '-' + 'a'.repeat(32) + '.json', sha256: 'a'.repeat(64) };
  assert.equal(Corpus.assertPublication(manifest, bytes), 2);
  assert.throws(() => Corpus.assertPublication(manifest, Buffer.from(JSON.stringify({ version: 10, ready: [{ id: '34190' }] }))), /does not match/);
  delete manifest.works['20']; assert.throws(() => Corpus.assertPublication(manifest, bytes), /missing/);
  manifest.works['20'] = manifest.works['34190']; assert.throws(() => Corpus.assertPublication(manifest, bytes), /missing/);
});
test('provider outage opens the batch circuit before other works start; the ledger remains resumable', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-corpus-circuit-')), original = Builder.build;
  t.after(() => { Builder.build = original; fs.rmSync(dir, { recursive: true, force: true }); });
  const entries = ['1', '2', '3', '4', '5'].map(id => {
    const source = 'source-' + id + '.json', bytes = Buffer.from('{}'); fs.writeFileSync(path.join(dir, source), bytes);
    return { id, source, sha256: Corpus.hash(bytes) };
  });
  Corpus.atomic(path.join(dir, 'inventory.json'), { errors: [], works: 5, expected: 5, catalog_sha256: 'a'.repeat(64), entries });
  let calls = 0;
  Builder.build = async () => { calls++; await new Promise(resolve => setImmediate(resolve)); throw Object.assign(Error('HTTP 503'), { code: 'NIQQUD_PROVIDER_UNAVAILABLE' }); };
  await assert.rejects(Corpus.prepareCorpus({ out: dir }), /incomplete/);
  assert.ok(calls <= 2);
  const ledger = JSON.parse(fs.readFileSync(path.join(dir, 'preparation-ledger.json')));
  assert.equal(Object.keys(ledger.works).length, calls);
  assert.ok(Object.values(ledger.works).every(x => x.code === 'NIQQUD_PROVIDER_UNAVAILABLE'));
});

test('parallel compilation gives byte-identical manifest and three profiles without provider calls', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lp-corpus-finalize-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const entries=[],ledger={catalog_sha256:'a'.repeat(64),works:{}};
  for(const id of ['1','2','3']) {
    const source='sources/'+id+'.json',output=path.join(dir,'output',id);
    const value={library:{texts:[{source_meta:{corpus:{byehuda_id:id}},rows:[{order_index:0,hebrew_plain:'שלום לכם.',hebrew_niqqud:'שָׁלוֹם לָכֶם.'}]}]}};
    Corpus.atomic(path.join(dir,source),value);const bytes=fs.readFileSync(path.join(dir,source));
    const report=await Builder.build({source:path.join(dir,source),out:output,cache:path.join(dir,'cache'),quiet:true,provider:()=>assert.fail('Complete source requested provider')});
    entries.push({id,file:'works/'+id+'.json',source,sha256:Corpus.hash(bytes)});ledger.works[id]={status:'prepared',report};
  }
  Corpus.atomic(path.join(dir,'inventory.json'),{errors:[],expected:3,works:3,catalog_version:8,catalog_sha256:ledger.catalog_sha256,source_bytes:1,entries});
  Corpus.atomic(path.join(dir,'preparation-ledger.json'),ledger);
  const parallel=await Corpus.finalizeCorpus({out:dir,revision:2,workers:2});
  const before=fs.readFileSync(path.join(dir,'release/manifest.json'),'utf8');
  // Corrupt cached profile bytes must be rejected and regenerated, never trusted by filename alone.
  const firstPin=Object.values(parallel.manifest.works)[0],firstFile=path.join(dir,'release',firstPin.file);
  const broken=JSON.parse(fs.readFileSync(firstFile));broken.rows[0].translit_profiles['sbl']='BROKEN';fs.writeFileSync(firstFile,JSON.stringify(broken));
  const sequential=await Corpus.finalizeCorpus({out:dir,revision:2,workers:1});
  assert.equal(fs.readFileSync(path.join(dir,'release/manifest.json'),'utf8'),before);
  assert.deepEqual(parallel.manifest,sequential.manifest);
  for(const pin of Object.values(parallel.manifest.works)) {
    const layer=JSON.parse(fs.readFileSync(path.join(dir,'release',pin.file)));
    assert.deepEqual(Object.keys(layer.rows[0].translit_profiles),['learner-latin','sbl','ru-phonetic']);
    assert.ok(layer.rows[0].translit_profiles['learner-latin']);
  }
});
