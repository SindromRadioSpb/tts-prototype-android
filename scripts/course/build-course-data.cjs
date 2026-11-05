'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateCourseDir } = require('./validate-course.cjs');

function assertPlainDirectories(target) {
  const absolute = path.resolve(target);
  const parent = path.dirname(absolute);
  if (parent !== absolute) assertPlainDirectories(parent);
  const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
  if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
    throw new Error('Output path must contain only real directories (no links or junctions): ' + absolute);
  }
}

function buildCourseData(srcDir, outRoot) {
  const issues = validateCourseDir(srcDir);
  if (issues.some(issue => issue.level === 'error')) {
    throw new Error(issues.map(issue => [issue.code, issue.lessonId || '', issue.path, issue.message].join(' ')).join('\n'));
  }
  const read = file => JSON.parse(fs.readFileSync(path.join(srcDir, file), 'utf8').replace(/^\uFEFF/, ''));
  const course = read('course.json');
  const lexicon = read(course.lexicon);
  // The published layout is fixed even when the source lexicon has a custom path.
  course.lexicon = 'lexicon.json';
  const files = new Map([
    ['course.json', course],
    ['lexicon.json', lexicon],
    ...course.lessons.map(id => ['lessons/' + id + '.json', read('lessons/' + id + '.json')]),
  ].map(([file, data]) => [file, JSON.stringify(data, null, 2) + '\n']));
  const manifest = { courseId: course.id, version: course.version, builtAt: new Date().toISOString(), files: {} };
  for (const [file, bytes] of files) manifest.files[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  files.set('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  const destination = path.resolve(outRoot, course.id);
  // Never replace an existing bundle: it may contain junctions or linked files.
  // Use a fresh output root for each build, then publish the reviewed bundle.
  assertPlainDirectories(outRoot);
  if (fs.lstatSync(destination, { throwIfNoEntry: false })) {
    throw new Error('Course output already exists; choose a fresh outRoot. Nothing was changed: ' + destination);
  }
  fs.mkdirSync(path.resolve(outRoot), { recursive: true });
  assertPlainDirectories(outRoot);
  fs.mkdirSync(destination);
  fs.mkdirSync(path.join(destination, 'lessons'));
  for (const [file, bytes] of files) {
    const target = path.join(destination, file);
    assertPlainDirectories(path.dirname(target));
    fs.writeFileSync(target, bytes, { flag: 'wx' });
  }
  return manifest;
}

module.exports = { buildCourseData };
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args.some(arg => arg.startsWith('--'))) throw new Error('Использование: node scripts/course/build-course-data.cjs <srcDir> <outRoot>');
    buildCourseData(...args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
