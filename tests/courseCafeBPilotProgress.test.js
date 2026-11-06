'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../scripts/premium/lib/cp0-test-db');
const repo = require('../db/learnerArtifactsRepo');
const E = require('../public/js/course-evidence');

test('pilot cloud progress stays in its own artifact and never writes FSRS review_log', async () => {
  const ctx = await T.setup('cp0-cafe-b-isolation');
  try {
    const legacy = E.emptyProgress('ulpan');
    legacy.firstMet = { 'legacy-sentinel': 1000 };
    const original = await repo.putCourseProgress('u1', 'fixture-device', 'ulpan', legacy, null);
    assert.equal(original.ok, true);
    const before = await ctx.all('SELECT * FROM review_log ORDER BY rowid');
    let pilot = E.emptyProgress('ulpan-cafe-b-pilot');
    pilot = E.record(pilot, { lessonId: 'B001-cafe', lessonVersion: 1,
      task: { id: 'B-fixture', evidenceLexIds: ['B-W01'] },
      lesson: { introduces: { active: ['B-W01', 'B-W02'], receptive: [] } },
      channel: 'write_he', input: 'קפה', result: { kind: 'accepted' }, at: 2000 }).progress;
    const saved = await repo.putCourseProgress('u1', 'fixture-device', pilot.courseId, pilot, null);
    assert.equal(saved.ok, true);
    assert.deepEqual((await repo.getCourseProgress('u1', pilot.courseId)).payload, pilot);
    assert.equal((await repo.getCourseProgress('u1', 'ulpan')).digest, original.digest);
    assert.deepEqual((await repo.getCourseProgress('u1', 'ulpan')).payload, legacy);
    assert.equal(await repo.getCourseProgress('u2', pilot.courseId), null);
    assert.deepEqual(await ctx.all('SELECT * FROM review_log ORDER BY rowid'), before);
    assert.equal((await repo.putCourseProgress('u1', 'fixture-device', 'ulpan', pilot, original.digest)).error, 'BAD_PAYLOAD');
    await reviewJournalChecks(ctx);
  } finally { await T.cleanup(ctx); }
});

async function reviewJournalChecks(ctx){
 const R=require('../public/js/course-review');
  const plan={id:'B-plan',version:1,anchorLessonId:'B001-cafe',sessions:[]};
  const legacy=(await repo.getCourseProgress('u1','ulpan')).payload;
  const before=await ctx.all('SELECT * FROM review_log ORDER BY rowid');
  let p=E.record(E.emptyProgress('pilot-review-tests'),{lessonId:'B001-cafe',lessonVersion:1,task:{id:'entry'},channel:'write_he',input:'x',result:{kind:'unknown'},at:1000}).progress;
  p=R.ensureAnchor(p,plan);const saved=await repo.putCourseProgress('u1','d',p.courseId,p,null);assert.equal(saved.ok,true);
  assert.deepEqual((await repo.getCourseProgress('u1',p.courseId)).payload,p);
  assert.equal((await repo.putCourseProgress('u1','d',p.courseId,p,'stale')).conflict,true);
  assert.equal(await repo.getCourseProgress('u2',p.courseId),null);
  assert.deepEqual((await repo.getCourseProgress('u1','ulpan')).payload,legacy);
  assert.deepEqual(await ctx.all('SELECT * FROM review_log ORDER BY rowid'),before);
  let bad=structuredClone(p);bad.reviewEvents[0].type='pretend_mastery';assert.equal((await repo.putCourseProgress('u1','d',p.courseId,bad,saved.digest)).error,'BAD_PAYLOAD');
  bad={...p,reviewEvents:[{...p.reviewEvents[0],input:'x'.repeat(2*1024*1024)}]};assert.equal((await repo.putCourseProgress('u1','d',p.courseId,bad,saved.digest)).error,'PAYLOAD_TOO_BIG');
}
