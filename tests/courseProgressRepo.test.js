const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../scripts/premium/lib/cp0-test-db');
const repo = require('../db/learnerArtifactsRepo');
const E = require('../public/js/course-evidence');

test('course progress is scoped to user and rejects stale writes', async () => {
  const ctx = await T.setup('course-progress-repo');
  try {
    assert.deepEqual((await repo.put('u1', 'd1', { kind: 'unknown', artifact_key: 'ulpan', updated_at: new Date().toISOString(), payload: {} })).error, 'BAD_KIND');
    const p = E.emptyProgress('ulpan');
    const first = await repo.putCourseProgress('u1', 'd1', 'ulpan', p, null);
    assert.equal(first.ok, true);
    assert.equal((await repo.getCourseProgress('u1', 'ulpan')).digest, E.progressDigest(p));
    assert.equal(await repo.getCourseProgress('u2', 'ulpan'), null);
    const updated = { ...p, seen: { abc: 1 } };
    const stale = await repo.putCourseProgress('u1', 'd2', 'ulpan', updated, 'stale');
    assert.equal(stale.conflict, true);
    assert.deepEqual(stale.payload, p);
    assert.equal((await repo.getCourseProgress('u1', 'ulpan')).digest, first.digest);
    assert.equal((await repo.putCourseProgress('u1', 'd1', 'UPPER', p, null)).error, 'BAD_KEY');
    assert.equal((await repo.putCourseProgress('u1', 'd1', 'ulpan', { ...p, attempts: [{ input: 'x'.repeat(2 * 1024 * 1024) }] }, first.digest)).error, 'PAYLOAD_TOO_BIG');
    assert.equal((await repo.put('u1', 'd1', { kind: 'course_progress', artifact_key: 'ulpan', updated_at: new Date().toISOString(), payload: updated })).error, 'USE_COURSE_CAS');
    assert.equal((await repo.putCourseProgress('u1', 'd1', 'ulpan', { ...p, attempts: [{ id: 'broken' }] }, first.digest)).error, 'BAD_PAYLOAD');
  } finally { await T.cleanup(ctx); }
});
