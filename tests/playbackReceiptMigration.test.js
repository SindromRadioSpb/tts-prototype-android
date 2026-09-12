const test=require('node:test');
const assert=require('node:assert/strict');
const initSqlJs=require('sql.js');

test('v52 preserves every legacy receipt and learner row; transactional rollback restores the old schema',async()=>{
  const SQL=await initSqlJs(),db=new SQL.Database();
  const {MIGRATIONS}=await import('../public/db/migrations.js');
  assert.equal(MIGRATIONS.length,53);db.run(MIGRATIONS[46]);
  db.run(`CREATE TABLE review_log(id TEXT PRIMARY KEY,payload TEXT);INSERT INTO review_log VALUES('owner','untouched');
    INSERT INTO studio_portable_import_receipts VALUES('r','p','root','manifest',2,'archive','committed','plan','result','{"n":4}','{"x":"שלום"}','{}','["missing"]','t',NULL);`);
  const read=()=>db.exec('SELECT * FROM studio_portable_import_receipts ORDER BY receipt_id');
  const before=read(),learner=db.exec('SELECT * FROM review_log');
  db.run('BEGIN');db.run(MIGRATIONS[51]);assert.deepEqual(read(),before);
  db.run(`INSERT INTO studio_portable_import_receipts SELECT 'r3','p3','root3',manifest_sha256,3,package_mode,status,plan_sha256,result_sha256,counts_json,id_map_json,rollback_json,missing_media_json,created_at,rolled_back_at FROM studio_portable_import_receipts WHERE receipt_id='r';`);
  db.run('ROLLBACK');assert.deepEqual(read(),before);
  assert.throws(()=>db.run("UPDATE studio_portable_import_receipts SET schema_version=3"),/CHECK constraint/);
  db.run('BEGIN');db.run(MIGRATIONS[51]);db.run('COMMIT');
  assert.deepEqual(read(),before);assert.deepEqual(db.exec('SELECT * FROM review_log'),learner);
  assert.deepEqual(db.exec('PRAGMA integrity_check')[0].values,[['ok']]);
});
