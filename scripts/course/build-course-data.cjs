'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateCourseDir } = require('./validate-course.cjs');

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
  const destination = path.join(outRoot, course.id);
  for (const [file, bytes] of files) {
    const target = path.join(destination, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
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
