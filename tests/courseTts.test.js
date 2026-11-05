const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fixture = path.join(__dirname, 'fixtures/course/mini');
const script = path.join(__dirname, '../scripts/course/course-tts.cjs');
const api = () => require(script);
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-tts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const inventory = outDir => api().inventory(fixture, { lesson: 'L001-cafe', outDir });

test('offline inventory has eight rows, authored texts, keys and missing totals', t => {
  const outDir = temp(t), report = inventory(outDir);
  const lesson = JSON.parse(fs.readFileSync(path.join(fixture, 'lessons/L001-cafe.json')));
  assert.equal(report.profileId, 'course-he-wavenet-v1');
  assert.equal(report.items.length, 8);
  report.items.forEach((item, i) => {
    assert.equal(item.text, lesson.scene.turns[i].he.niqqud);
    assert.equal(item.plain, lesson.scene.turns[i].he.plain);
    assert.equal(item.chars, [...item.text].length);
    assert.match(item.assetKey, /^[a-f0-9]{64}$/);
    assert.equal(item.haveFile, false);
  });
  assert.equal(report.totals.chars, report.items.reduce((n, i) => n + i.chars, 0));
  assert.equal(report.totals.missingChars, report.totals.chars);
  fs.writeFileSync(path.join(outDir, report.items[0].assetKey + '.mp3'), 'existing');
  assert.equal(inventory(outDir).items[0].haveFile, true);
});

test('third-call failure preserves first two files and journal; resume skips them', async t => {
  const outDir = temp(t), items = inventory(outDir).items.slice(0, 3), requests = [];
  const client = { async synthesizeSpeech(request) {
    requests.push(request);
    if (requests.length === 3) throw new Error('provider failure');
    return [{ audioContent: Buffer.from('mp3-' + requests.length) }];
  } };
  assert.deepEqual(await api().bakeItems(items, { client, outDir, concurrency: 1 }), { made: 2, skipped: 0, failed: 1 });
  assert.deepEqual(requests[0], {
    input: { text: items[0].text },
    voice: { languageCode: 'he-IL', name: items[0].voiceName },
    audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000, speakingRate: 1, pitch: 0 }
  });
  const log = JSON.parse(fs.readFileSync(path.join(outDir, 'bake-log.json')));
  assert.equal(log.length, 2);
  assert.deepEqual(log[0], { ref: items[0].ref, key: items[0].assetKey, voice: items[0].voiceName,
    bytes: 5, sha256: crypto.createHash('sha256').update('mp3-1').digest('hex') });
  assert.equal(fs.readdirSync(outDir).some(f => f.endsWith('.part')), false);
  assert.deepEqual(await api().bakeItems(items, { client, outDir, concurrency: 1 }), { made: 1, skipped: 2, failed: 0 });
  assert.equal(requests.length, 4);
  assert.equal(JSON.parse(fs.readFileSync(path.join(outDir, 'bake-log.json'))).length, 3);
});

test('preflight rejects ceilings, unsafe voices, oversized rows and forged keys before calls', async t => {
  const outDir = temp(t), items = inventory(outDir).items;
  let calls = 0;
  const client = { async synthesizeSpeech() { calls++; return [{ audioContent: Buffer.from('x') }]; } };
  for (const ceiling of [10, 50001, -1, NaN]) {
    await assert.rejects(api().bakeItems(items, { client, outDir, ceiling }), /ceiling/i);
  }
  for (const change of [{ voiceName: 'he-IL-Chirp3-HD-X' }, { text: 'א'.repeat(2500) }, { assetKey: '../escape' }, { text: '' }]) {
    await assert.rejects(api().bakeItems([...items.slice(0, 1), { ...items[1], ...change }], { client, outDir }));
  }
  await assert.rejects(api().bakeItems(items, { client, outDir, concurrency: 0 }), /concurrency/i);
  assert.equal(calls, 0);
});

test('edited source text changes the key and makes the new inventory row missing', t => {
  const root = temp(t), src = path.join(root, 'src'), outDir = path.join(root, 'audio');
  fs.cpSync(fixture, src, { recursive: true });
  fs.mkdirSync(outDir);
  const before = api().inventory(src, { lesson: 'L001-cafe', outDir }).items[0];
  fs.writeFileSync(path.join(outDir, before.assetKey + '.mp3'), 'old');
  const filename = path.join(src, 'lessons/L001-cafe.json'), lesson = JSON.parse(fs.readFileSync(filename));
  lesson.scene.turns[0].he.niqqud += ' שָׁלוֹם.';
  lesson.scene.turns[0].he.plain += ' שלום.';
  fs.writeFileSync(filename, JSON.stringify(lesson));
  const after = api().inventory(src, { lesson: 'L001-cafe', outDir }).items[0];
  assert.equal(after.ref, before.ref);
  assert.notEqual(after.assetKey, before.assetKey);
  assert.equal(after.haveFile, false);
  assert.equal(fs.readFileSync(path.join(outDir, before.assetKey + '.mp3'), 'utf8'), 'old');
});

test('hard character limit and invalid course stop the entire run before synthesis', async t => {
  const root = temp(t), item = inventory(root).items[0];
  let calls = 0;
  const client = { async synthesizeSpeech() { calls++; return [{ audioContent: Buffer.from('x') }]; } };
  const items = Array.from({ length: 30 }, (_, i) => ({ ...item, assetKey: undefined, ref: 'long/' + i, text: 'א'.repeat(2000) + i }));
  await assert.rejects(api().bakeItems(items, { client, outDir: root }), /ceiling/i);
  assert.equal(calls, 0);
  const src = path.join(root, 'src');
  fs.cpSync(fixture, src, { recursive: true });
  fs.writeFileSync(path.join(src, 'course.json'), '{}');
  assert.throws(() => api().inventory(src), /FORMAT/);
});

test('concurrency is bounded and duplicate assets are synthesized once', async t => {
  const outDir = temp(t), items = inventory(outDir).items.slice(0, 4);
  let active = 0, max = 0, calls = 0;
  const client = { async synthesizeSpeech() {
    calls++; active++; max = Math.max(max, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return [{ audioContent: Buffer.from('mp3') }];
  } };
  const result = await api().bakeItems([...items, items[0]], { client, outDir, concurrency: 2 });
  assert.deepEqual(result, { made: 4, skipped: 1, failed: 0 });
  assert.equal(calls, 4);
  assert.equal(max, 2);
});

test('resume rebuilds a missing journal entry for an already committed MP3 without a call', async t => {
  const outDir = temp(t), item = inventory(outDir).items[0];
  fs.writeFileSync(path.join(outDir, item.assetKey + '.mp3'), 'saved-before-crash');
  let calls = 0;
  const client = { async synthesizeSpeech() { calls++; } };
  assert.deepEqual(await api().bakeItems([item], { client, outDir, ceiling: 0 }), { made: 0, skipped: 1, failed: 0 });
  assert.equal(calls, 0);
  const log = JSON.parse(fs.readFileSync(path.join(outDir, 'bake-log.json')));
  assert.equal(log[0].key, item.assetKey);
  assert.equal(log[0].bytes, 18);
});

test('CLI inventory is offline, distinguishes JSON out and audio-dir; invalid options and absent credentials fail', t => {
  const root = temp(t), report = path.join(root, 'report.json');
  const env = { ...process.env };
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
  const run = args => spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8' });
  const good = run(['inventory', fixture, '--lesson', 'L001-cafe', '--out', report, '--audio-dir', root]);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(fs.readFileSync(report)).items.length, 8);
  for (const args of [
    ['inventory', fixture, '--wat'], ['inventory', fixture, '--lesson', 'unknown'],
    ['inventory', fixture, '--lesson'], ['inventory', fixture, '--concurrency', '2'],
    ['bake', fixture, '--out', root], ['bake', fixture, '--audio-dir', root]
  ]) assert.notEqual(run(args).status, 0, args.join(' '));
  assert.match(run(['bake', fixture, '--out', root]).stderr, /GOOGLE_APPLICATION_CREDENTIALS/);
});
