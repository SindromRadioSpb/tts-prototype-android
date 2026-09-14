const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('journal is opt-in, bounded, sanitized, survives recreation and stops immediately', async () => {
  const { createDiagnosticJournal, readJournal, ENABLE_KEY } = await import('../public/db/diagnostic-journal.js');
  const data = new Map(); const storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) };
  let now = 100;
  const make = id => createDiagnosticJournal({ storage, workerId: id, version:'3.11.541', surface:'studio', now: () => now });
  make('00000000-0000-0000-0000-000000000001').record({phase:'waiting-lock'});
  assert.equal(readJournal(storage).length, 0);
  storage.setItem(ENABLE_KEY, 10000);
  for (let i=0;i<12;i++) {
    const j=make('00000000-0000-0000-0000-'+String(i).padStart(12,'0'));
    for (let n=0;n<40;n++) j.record({phase:'waiting-lock',sql:'PRIVATE SQL',params:['PRIVATE TEXT'],vfs:'AccessHandlePool',error:'PRIVATE ERROR',requestId:n});
  }
  const rows=readJournal(storage);
  assert.equal(rows.length,8); assert.equal(rows[0].events.length,24);
  assert.equal(JSON.stringify(rows).includes('PRIVATE'), false);
  const j=make('00000000-0000-0000-0000-000000000099');
  storage.setItem(ENABLE_KEY, 0); j.record({phase:'hidden'});
  assert.deepEqual(readJournal(storage),rows);
  storage.setItem(ENABLE_KEY, 10000); now=10001; j.record({phase:'hidden'});
  assert.deepEqual(readJournal(storage),rows);
});
test('page lifecycle survives SQL phase bursts and identity fields are sanitized', async () => {
  const { createDiagnosticJournal, readJournal, ENABLE_KEY, JOURNAL_KEY } = await import('../public/db/diagnostic-journal.js');
  const data = new Map(); const storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) };
  storage.setItem(ENABLE_KEY, 10000);
  const journal = createDiagnosticJournal({ storage, workerId: '00000000-0000-4000-8000-000000000001',
    documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', generation: 2, version: '3.11.544', surface: 'studio', now: () => 100 });
  journal.record({ event: 'pagehide', persisted: true });
  for (let n = 0; n < 60; n++) journal.record({ phase: 'executing-sql', requestId: n });
  const [row] = readJournal(storage);
  assert.deepEqual(row.lifecycle, [{ event: 'pagehide', persisted: true, at: 100 }]);
  assert.equal(row.events.length, 24);
  assert.equal(row.documentId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(row.generation, 2);
  storage.setItem(JOURNAL_KEY, JSON.stringify([{ workerId: 'x', documentId: 'private title', generation: 'SELECT', lifecycle: [{ event: 'pagehide', sql: 'PRIVATE SQL' }], events: [] }]));
  const serialized = JSON.stringify(readJournal(storage));
  assert.equal(/private|PRIVATE|SELECT/.test(serialized), false);
});
test('inaccessible diagnostic storage never throws or opens the application database', async () => {
  const { createDiagnosticJournal, readJournal } = await import('../public/db/diagnostic-journal.js');
  const storage={getItem(){throw new Error('denied');},setItem(){throw new Error('quota');}};
  assert.deepEqual(readJournal(storage),[]);
  assert.doesNotThrow(()=>createDiagnosticJournal({storage}).record({phase:'starting'}));
  for (const file of ['diagnostic-page.js','diagnostic-journal.js']) {
    const source=fs.readFileSync(path.join(__dirname,'../public/db',file),'utf8');
    assert.doesNotMatch(source,/new Worker|\.dbQuery\(|indexedDB\.open|createSyncAccessHandle|import.*local-db/);
  }
});
