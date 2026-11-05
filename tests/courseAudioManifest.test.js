const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { inventory } = require('../scripts/course/course-tts.cjs');
const { buildCourseData } = require('../scripts/course/build-course-data.cjs');
const script = path.resolve(__dirname, '../scripts/course/course-tts.cjs');
const lessonId = 'L001-cafe';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'course-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const src = path.join(root, 'src');
  fs.cpSync(path.join(__dirname, 'fixtures/course/mini'), src, { recursive: true });
  const items = inventory(src, { lesson: lessonId, outDir: root }).items;
  const review = { lessonId, reviewedAt: '2026-11-05T00:00:00Z', items: Object.fromEntries(items.map(i => [i.ref, { key: i.assetKey, status: 'ok', note: 'owner mark' }])) };
  const reviewFile = path.join(root, 'marks.json');
  const run = () => spawnSync(process.execPath, [script, 'manifest', src, '--lesson', lessonId, '--review', reviewFile], { encoding: 'utf8' });
  const save = () => fs.writeFileSync(reviewFile, JSON.stringify(review));
  const audio = path.join(src, 'audio', lessonId + '.json');
  return { root, src, items, review, reviewFile, run, save, audio };
}
test('manifest CLI includes seven ok marks, excludes bad, and preserves original review bytes', t => {
  const f = setup(t);
  f.review.items[f.items[7].ref].status = 'bad'; f.save();
  const r = f.run(); assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(read(f.audio), Object.fromEntries(f.items.slice(0, 7).map(i => [i.id, i.assetKey])));
  assert.equal(fs.readFileSync(path.join(f.src, 'audio-review', lessonId + '.json'), 'utf8'), fs.readFileSync(f.reviewFile, 'utf8'));
});
test('stale ok key is omitted and the affected ref is named in CLI output', t => {
  const f = setup(t); f.review.items[f.items[0].ref].key = '0'.repeat(64); f.save();
  const r = f.run(); assert.equal(r.status, 0, r.stderr);
  assert.equal(Object.keys(read(f.audio)).length, 7);
  assert.equal(read(f.audio)[f.items[0].id], undefined);
  assert.match(r.stdout + r.stderr, new RegExp(f.items[0].ref));
});
test('missing explicit review produces empty audio without reusing saved approvals', t => {
  const f = setup(t); f.save(); assert.equal(f.run().status, 0);
  fs.unlinkSync(f.reviewFile);
  const r = f.run(); assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(read(f.audio), {});
  assert.deepEqual(read(path.join(f.src, 'audio-review', lessonId + '.json')), f.review);
});
test('wrong lesson and malformed reviews are rejected before writing approval or manifest', t => {
  const f = setup(t);
  for (const value of [{ ...f.review, lessonId: 'L002-cafe-again' }, { lessonId, items: [] }, null]) {
    fs.writeFileSync(f.reviewFile, JSON.stringify(value));
    const r = f.run(); assert.notEqual(r.status, 0);
    assert.match(r.stderr, /review|lesson/i);
    assert.equal(fs.existsSync(f.audio), false);
    assert.equal(fs.existsSync(path.join(f.src, 'audio-review')), false);
  }
});
test('builder copies approved audio and hashes its exact output bytes', t => {
  const f = setup(t); f.save(); assert.equal(f.run().status, 0);
  const out = path.join(f.root, 'out'), manifest = buildCourseData(f.src, out);
  const file = 'audio/' + lessonId + '.json';
  const bytes = fs.readFileSync(path.join(out, manifest.courseId, file));
  assert.deepEqual(JSON.parse(bytes), read(f.audio));
  assert.equal(manifest.files[file], crypto.createHash('sha256').update(bytes).digest('hex'));
});
test('builder filters a stale manifest after source text changes and inventory needs a new recording', t => {
  const f = setup(t); f.save(); assert.equal(f.run().status, 0);
  fs.writeFileSync(path.join(f.root, f.items[0].assetKey + '.mp3'), 'old recording');
  const file = path.join(f.src, 'lessons', lessonId + '.json'), lesson = read(file);
  lesson.scene.turns[0].he.niqqud += ' שָׁלוֹם.'; lesson.scene.turns[0].he.plain += ' שלום.';
  fs.writeFileSync(file, JSON.stringify(lesson));
  const current = inventory(f.src, { lesson: lessonId, outDir: f.root }).items[0];
  assert.notEqual(current.assetKey, f.items[0].assetKey); assert.equal(current.haveFile, false);
  const out = path.join(f.root, 'out'), manifest = buildCourseData(f.src, out);
  const audio = read(path.join(out, manifest.courseId, 'audio', lessonId + '.json'));
  assert.equal(Object.keys(audio).length, 7); assert.equal(audio[current.id], undefined);
});
test('builder excludes unapproved audio even when asset keys match current inventory', t => {
  const f = setup(t); fs.mkdirSync(path.dirname(f.audio));
  fs.writeFileSync(f.audio, JSON.stringify(Object.fromEntries(f.items.map(i => [i.id, i.assetKey]))));
  const out = path.join(f.root, 'out'), manifest = buildCourseData(f.src, out);
  assert.deepEqual(read(path.join(out, manifest.courseId, 'audio', lessonId + '.json')), {});
});
test('manifest refuses linked output directories without changing external files', t => {
  const f = setup(t); f.save();
  const outside = path.join(f.root, 'outside'); fs.mkdirSync(outside);
  const sentinel = path.join(outside, lessonId + '.json'); fs.writeFileSync(sentinel, 'unchanged');
  fs.symlinkSync(outside, path.join(f.src, 'audio'), process.platform === 'win32' ? 'junction' : 'dir');
  const r = f.run(); assert.notEqual(r.status, 0); assert.match(r.stderr, /link|junction/i);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'unchanged');
  fs.unlinkSync(path.join(f.src, 'audio'));
});
test('builder rejects review belonging to another lesson', t => {
  const f = setup(t); f.save(); assert.equal(f.run().status, 0);
  f.review.lessonId = 'L002-cafe-again';
  fs.writeFileSync(path.join(f.src, 'audio-review', lessonId + '.json'), JSON.stringify(f.review));
  assert.throws(() => buildCourseData(f.src, path.join(f.root, 'out')), /lesson/i);
});
