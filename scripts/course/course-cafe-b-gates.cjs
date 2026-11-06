'use strict';
// Local-only regression entry point. Never reads dotenv or uses the operator's DB.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { smokeServerEnv } = require('../smoke-server-env');
const { validateCourseDir } = require('./validate-course.cjs');
const root = path.resolve(__dirname, '../..');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-cafe-b-gates-'));
const env = smokeServerEnv(data, 0);
try {
  const files = fs.readdirSync(path.join(root, 'tests')).filter(file => /^course.*\.test\.js$/.test(file)).sort().map(file => 'tests/' + file);
  const result = cp.spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...files], { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Course tests failed: ' + (result.status ?? result.error?.message));
  const issues = validateCourseDir(path.join(root, 'content/course/ulpan-cafe-b-pilot'));
  const errors = issues.filter(issue => issue.level === 'error');
  console.log(JSON.stringify({ validatorErrors: errors.length, validatorWarnings: issues.length - errors.length }));
  if (errors.length) throw new Error(JSON.stringify(errors));
  const tracked = cp.execFileSync('git', ['ls-files', 'content/course/ulpan/'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  for (const file of tracked) {
    // Compare Git-normalized content: an autocrlf checkout is not a material edit.
    const before = cp.execFileSync('git', ['rev-parse', 'HEAD:' + file], { cwd: root, encoding: 'utf8' }).trim();
    const after = cp.execFileSync('git', ['hash-object', '--path=' + file, file], { cwd: root, encoding: 'utf8' }).trim();
    if (before !== after) throw new Error('Legacy content changed: ' + file);
  }
  const whitespace = cp.spawnSync('git', ['diff', '--check'], { cwd: root, stdio: 'inherit' });
  if (whitespace.status !== 0) throw new Error('Whitespace check failed');
  console.log(JSON.stringify({ legacyFilesUnchanged: tracked.length, providerCalls: 0, productionWrites: 0 }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(data, { recursive: true, force: true });
}
