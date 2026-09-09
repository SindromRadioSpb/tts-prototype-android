const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const P = require('../public/js/playback-source.js');

const A = 'iG9CE55wbtY', B = 'M7lc1UVf-VE';
const audio = { media: { sha256: 'a'.repeat(64) }, segments: [{ start: 1, end: 3, text: 'שלום' }, { start: 5, end: 8, text: 'עולם' }], timing: { entries: [{ o: 0, t: 1, end: 3 }, { o: 1, t: 5, end: 8 }] } };
const rows = [{ he: 'שלום', ru: 'привет' }, { he: 'עולם', ru: 'мир' }];

test('YouTube identity only accepts HTTPS/HTTP official video URLs, never credentials or lookalike hosts', () => {
  for (const url of [`https://youtu.be/${A}?t=20`, `https://www.youtube.com/watch?v=${A}`, `https://m.youtube.com/shorts/${A}`, `https://youtube.com/live/${A}`]) assert.equal(P.parseVideoId(url), A);
  for (const url of [`javascript://youtube.com/watch?v=${A}`, `https://user:pw@youtube.com/watch?v=${A}`, `https://youtube.com.evil.test/watch?v=${A}`, `https://youtu.be/${A}/extra`, `https://youtube.com:444/watch?v=${A}`]) assert.equal(P.parseVideoId(url), null, url);
});

test('attaching another video preserves rows and local clock; unconfirmed timing cannot drive YouTube', async () => {
  const before = JSON.stringify({audio,rows});
  const binding = P.append(null, { url: `https://youtu.be/${A}`, offset_ms: 2500, confirmed: false }, { now: '2026-09-09T12:00:00Z' });
  const view = await P.youtubeView(audio, rows, binding);
  assert.equal(view.video.videoId, A);
  assert.equal(view.entries, null);
  assert.equal(view.reason, 'PLAYBACK_TIMING_UNVERIFIED');
  assert.equal(JSON.stringify({audio,rows}), before);
});

test('confirmed mapping uses a separate source clock and invalidates if source rows/timing change', async () => {
  const basis = await P.timingBasis(audio, rows);
  const binding = P.append(null, { url: `https://youtu.be/${A}`, offset_ms: 2500, confirmed: true }, { basis_sha256: basis, now: '2026-09-09T12:00:00Z' });
  assert.deepEqual((await P.youtubeView(audio, rows, binding)).entries, [{o:0,t:3.5,end:5.5},{o:1,t:7.5,end:10.5}]);
  assert.equal((await P.youtubeView(audio, [{he:'אחר'}, rows[1]], binding)).entries, null);
  assert.equal((await P.youtubeView(audio, [{...rows[0],ru:'исправленный перевод'}, rows[1]], binding)).entries.length, 2);
  const shifted = structuredClone(audio); shifted.timing.entries[1].t = 6;
  assert.equal((await P.youtubeView(shifted, rows, binding)).reason, 'PLAYBACK_TIMING_CHANGED');
});

test('source edits append immutable history; detach suppresses legacy fallback; invalid offsets fail closed', () => {
  const first = P.append(null, {url:`https://youtu.be/${A}`});
  const second = P.append(first, {url:`https://youtu.be/${B}`});
  assert.equal(first.revision, 1);
  assert.equal(second.revision, 2);
  assert.deepEqual(second.history[0], first.history[0]);
  const removed = P.append(second, {remove:true});
  assert.equal(P.selected(removed).source, null);
  assert.throws(()=>P.append(first, {url:`https://youtu.be/${B}`,offset_ms:NaN}), /PLAYBACK_OFFSET_INVALID/);
  assert.throws(()=>P.append(first, {url:`https://youtu.be/${B}`,offset_ms:1.5}), /PLAYBACK_OFFSET_INVALID/);
  assert.throws(()=>P.append(first, {url:`https://youtu.be/${B}`,confirmed:true}), /PLAYBACK_BASIS_REQUIRED/);
});

test('legacy source is normalized, while a detached explicit binding cannot resurrect it', async () => {
  const legacy = {...audio,video:{platform:'youtube',videoId:A,url:`https://www.youtube.com/watch?v=${A}`}};
  const record = P.fromLegacy(legacy);
  assert.equal((await P.youtubeView(legacy, rows, record)).entries.length,2);
  assert.equal((await P.youtubeView(legacy, rows, P.append(record,{remove:true}))).video,null);
  assert.throws(()=>P.validate({...record,history:[{...record.history[0],source:{kind:'youtube',video_id:'invalid',url:'https://evil.test'}}]}), /PLAYBACK_SOURCE_INVALID/);
});

test('binding repository changes only source metadata with compare-and-swap and preserves manual rows/SRS', async () => {
  const SQL=await initSqlJs(),db=new SQL.Database();
  db.run(`CREATE TABLE texts(id TEXT PRIMARY KEY,source_meta_json TEXT,updated_at TEXT);
    CREATE TABLE sentences(id TEXT PRIMARY KEY,he_plain TEXT,ru TEXT);
    CREATE TABLE review_log(id TEXT PRIMARY KEY);
    INSERT INTO texts VALUES('a','{"custom":"owner"}', 'old');
    INSERT INTO sentences VALUES('s','שלום','ручной перевод');
    INSERT INTO review_log VALUES('r');`);
  const query=(sql,params=[])=>{const s=db.prepare(sql);s.bind(params);const out=[];while(s.step())out.push(s.getAsObject());s.free();return out;};
  const adapter={dbQuery:async(sql,p)=>query(sql,p),dbRun:async(sql,p)=>{db.run(sql,p);return{changes:db.getRowsModified()};}};
  const repo=P.createRepository(adapter);
  const record=await repo.save('a',{url:`https://youtu.be/${A}`},{expected_revision:0});
  assert.equal(record.revision,1);
  assert.equal(JSON.parse(query('SELECT source_meta_json FROM texts')[0].source_meta_json).custom,'owner');
  await assert.rejects(()=>repo.save('a',{url:`https://youtu.be/${B}`},{expected_revision:0}),/PLAYBACK_SOURCE_STALE/);
  assert.equal(query('SELECT ru FROM sentences')[0].ru,'ручной перевод');
  assert.equal(query('SELECT COUNT(*) n FROM review_log')[0].n,1);
  assert.deepEqual(await repo.read('a'),record);
  db.run(`INSERT INTO texts VALUES('public','{"public_corpus":{"slug":"fixture"}}','t')`);
  await assert.rejects(()=>repo.save('public',{url:`https://youtu.be/${A}`},{expected_revision:0}),/PLAYBACK_PUBLISHED_READ_ONLY/);
});
