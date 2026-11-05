'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures/course/mini');
const build = (src, out) => spawnSync(process.execPath, [path.join(root, 'scripts/course/build-course-data.cjs'), src, out], { encoding: 'utf8' });
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-data-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('builds validated course data and hashes every delivered JSON file', t => {
  const out = path.join(temporary(t), 'output');
  const result = build(fixture, out);
  assert.equal(result.status, 0, result.stderr);
  const dir = path.join(out, 'mini');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.courseId, 'mini');
  assert.equal(manifest.version, 1);
  assert.equal(new Date(manifest.builtAt).toISOString(), manifest.builtAt);
  const files = ['course.json', 'lexicon.json', 'lessons/L001-cafe.json', 'lessons/L002-cafe-again.json'];
  assert.deepEqual(Object.keys(manifest.files).sort(), files.sort());
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(dir, file));
    assert.equal(manifest.files[file], crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(JSON.parse(bytes), JSON.parse(fs.readFileSync(path.join(fixture, file))));
  }
});

test('invalid lesson without transfer task exits 1 and writes no output directory', t => {
  const dir = temporary(t), src = path.join(dir, 'source'), out = path.join(dir, 'output');
  fs.cpSync(fixture, src, { recursive: true });
  const file = path.join(src, 'lessons/L001-cafe.json');
  const lesson = JSON.parse(fs.readFileSync(file));
  lesson.tasks.forEach(task => { delete task.transfer; });
  fs.writeFileSync(file, JSON.stringify(lesson));
  const result = build(src, out);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /TRANSFER/);
  assert.equal(fs.existsSync(out), false);
});

test('validator exports a reusable function with isolated results', () => {
  const { validateCourseDir } = require('../scripts/course/validate-course.cjs');
  assert.equal(typeof validateCourseDir, 'function');
  assert.ok(validateCourseDir(path.join(fixture, 'missing')).some(i => i.level === 'error'));
  const valid = validateCourseDir(fixture);
  assert.equal(valid.some(i => i.level === 'error'), false);
  assert.deepEqual(validateCourseDir(fixture), valid);
});

for (const kind of ['course junction', 'nested junction', 'linked file', 'root junction']) {
  test('refuses ' + kind + ' without changing external files', t => {
    const dir = temporary(t), out = path.join(dir, 'output'), external = path.join(dir, 'external');
    fs.mkdirSync(external);
    const sentinel = path.join(external, kind === 'nested junction' ? 'L001-cafe.json' : 'course.json');
    fs.writeFileSync(sentinel, 'external sentinel');
    if (kind === 'root junction') fs.symlinkSync(external, out, 'junction');
    else {
      fs.mkdirSync(out);
      const destination = path.join(out, 'mini');
      if (kind === 'course junction') fs.symlinkSync(external, destination, 'junction');
      else {
        fs.mkdirSync(destination);
        if (kind === 'nested junction') fs.symlinkSync(external, path.join(destination, 'lessons'), 'junction');
        else fs.linkSync(sentinel, path.join(destination, 'course.json'));
      }
    }
    const before = fs.readdirSync(external);
    const result = build(fixture, out);
    assert.equal(result.status, 1);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'external sentinel');
    assert.deepEqual(fs.readdirSync(external), before);
  });
}

test('course volume route precedes public static and sets public cache and same-origin headers', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const route = server.match(/app\.use\(['"]\/data\/course['"],\s*express\.static\(path\.join\(DATA_DIR,\s*['"]course['"]\),\s*\{[\s\S]*?\}\)\);/);
  assert.ok(route, 'public course volume route exists');
  assert.ok(route.index < server.indexOf('app.use(express.static(path.join(__dirname, "public")'));
  assert.match(route[0], /index:\s*false/);
  assert.match(route[0], /fallthrough:\s*true/);
  assert.match(route[0], /setHeader\(['"]Cache-Control['"],\s*['"]public, max-age=300, must-revalidate['"]\)/);
  assert.match(route[0], /setHeader\(['"]Cross-Origin-Resource-Policy['"],\s*['"]same-origin['"]\)/);
});

test('P8a: build copies media files and hashes them into the manifest', t => {
  const dir = temporary(t), src = path.join(dir, 'src'), out = path.join(dir, 'out');
  fs.cpSync(fixture, src, { recursive: true });
  fs.mkdirSync(path.join(src, 'media'));
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  fs.writeFileSync(path.join(src, 'media', 'a.png'), png);
  const result = build(src, out);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'mini', 'manifest.json'), 'utf8'));
  assert.deepEqual(fs.readFileSync(path.join(out, 'mini', 'media', 'a.png')), png);
  assert.equal(manifest.files['media/a.png'], crypto.createHash('sha256').update(png).digest('hex'));
});
