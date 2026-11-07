'use strict';
// Final release evidence audit. Each input is produced by an independent live,
// archive, browser or retention check; this does not replace those checks.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8').replace(/^\uFEFF/,''));
const browser=read('browser.json'),roundtrip=read('roundtrip.json'),ai=read('ai-invalidation.json');
assert.equal(browser.status,'passed');assert.equal(browser.logout_status,200);
assert.equal(browser.corpora.length,2);assert.equal(browser.layouts.length,4);
assert.deepEqual(browser.page_errors,[]);assert.deepEqual(browser.blocked_mutations,[]);
for(const layout of browser.layouts)assert(layout.scrollWidth<=layout.width+1);
for(const [id,count] of [['a97001',872],['a97002',2517]]){
 assert(browser.corpora.some(c=>c.atlas_id===id&&c.download==='passed'&&c.learner_tables_unchanged));
 const r=roundtrip[id];assert.equal(r.files,count);assert(r.restored&&r.reexported&&r.manifest_equal&&r.production_equals_verified_local_material);
 for(const kind of ['text','pdf','image'])assert(ai[id][kind].updated_ordinary_hash_rejected);
 assert(ai[id].original_restored_and_verified);
}
for(const r of Object.values(read('persistent-archive-verification.json')))assert(r.verified&&r.manifest_equals_restored_production_zip);
const served=read('served.json'),sw=read('service-worker.json'),ci=read('ci.json');
assert.equal(served.version,'3.11.874');assert.equal(served.status,'passed');assert.equal(served.assets.length,214);
assert.equal(sw.status,'PASS');assert.equal(sw.shell.version,'3.11.874');assert(sw.shell.controller&&sw.studioOffline&&sw.roomOffline);
assert.deepEqual(sw.shell.missing,[]);assert.deepEqual(sw.shell.mismatch,[]);
assert.equal(ci.headSha,'8d696e1799db1b580e9fca72c7ad9df6e9d9cee4');assert.equal(ci.conclusion,'success');
for(const h of read('final-health.json'))assert(h.ok&&h.db.ready&&h.migrations.ready&&!h.disk_warn);
const preserved=read('preservation.json');
assert(preserved.active_atlas_files_unchanged&&preserved.atlas_editions_unchanged&&preserved.atlas_review_unchanged&&preserved.user_tables_unchanged);
assert.equal(preserved.tables.length,15);
const capacity=read('capacity.json');assert(capacity.free_bytes>=6*1024**3);
assert(capacity.current_image_retained&&capacity.rollback_image_retained&&capacity.pre_task_image_retained&&capacity.containers_retained&&capacity.volumes_retained&&capacity.only_selected_image_removed);
const access=read('access-boundary.json');assert(access.anonymous.every(r=>r.status===401));assert(access.private_sources.every(r=>r.status===404));
for(const source of Object.values(read('source-packages.json')))assert(source.sources_verified);
for(const archives of Object.values(read('source-archives.json')))for(const a of Object.values(archives))assert(a.read_all_members||a.crc_all_members);
assert.equal(read('source-coverage.json').preserved_material_files_by_sha256,869);
const report={status:'passed',runtime:'3.11.874',runtime_commit:ci.headSha,corpora:['a97001','a97002'],material_files:[872,2517],source_mutation_cases:6,served_assets:214,scope:'Runtime release, source packages, real production UI/API ZIPs, offline full restore/re-export, AI dependency invalidation, preservation and capacity'};
fs.writeFileSync(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
