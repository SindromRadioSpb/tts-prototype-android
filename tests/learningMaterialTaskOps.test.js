'use strict';
// Операции задачи живут в public/index.html: проверяем их порядок и наличие по тексту оболочки.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const opsStart = html.indexOf('window.LearningMaterialTaskUI.configure({');
const ops = html.slice(opsStart, html.indexOf('\n});', opsStart));
function method(name) {
  const at = ops.indexOf('  async ' + name + '(');
  assert.notEqual(at, -1, name + ' is declared');
  return ops.slice(at, ops.indexOf('\n  },', at));
}

test('translate proves the media context of THIS task before building the table', () => {
  const body = method('translate');
  const workspace = body.indexOf('setActiveWorkspace');
  const proof = body.indexOf('v3ResolveMediaContext()');
  const build = body.indexOf('translateTable()');
  assert.ok(workspace > -1 && proof > workspace && build > proof,
    'the check runs after the task text and workspace are in place and before the build');
  assert.match(body, /TASK_MEDIA_CONTEXT_LOST/);
});

test('the task can count play buttons and finish in the Room or the Studio', () => {
  assert.match(method('provePlayback'), /StudyVideoSourceUI\.context/);
  assert.match(method('openInRoom'), /library\.html\?my_text=/);
  assert.match(method('openInStudio'), /v3LibraryOpenText/);
});

test('a failed media resolution reports the first line that broke identity', () => {
  const start = html.indexOf('async function v3ResolveMediaContext');
  const body = html.slice(start, html.indexOf('\n    async function ', start + 20));
  assert.match(body, /first_mismatch_line/);
  assert.match(body, /firstMismatchLine/);
});

// Ведущий путь 2.3: ручная Студия больше не сохраняет медиа-материал без видео молча.
test('the manual Studio shows the lost-media bar and asks before saving without video', () => {
  const resolver = html.slice(html.indexOf('async function v3ResolveMediaContext'),
    html.indexOf('async function v3RestoreImportPassportFromWorkspace'));
  assert.match(resolver, /v3MediaLostBarRefresh\(\)/);
  assert.match(html, /function v3MediaLostBarRefresh\(/);
  assert.match(html, /async function v3MediaLostRestoreTranscript\(/);
  const save = html.slice(html.indexOf('async function v3LibrarySaveCurrentCore'));
  const head = save.slice(0, 1500);
  assert.match(head, /v3MediaIntentLost/, 'save checks the lost media intent first');
  assert.match(head, /acknowledged/);
});

// Прогон владельца 2026-09-24: карточка прогресса просила «сохранить карточку», хотя её сохраняла сама задача.
test('a table built inside the task does not ask the person to save the card', () => {
  assert.equal((html.match(/tableJob\.actionReview/g) || []).length, 1, 'every review hint goes through v3TableReviewAction');
  assert.match(html, /function v3TableReviewAction\(\)[\s\S]{0,300}v3TableBuildOwnedByTask[\s\S]{0,200}tableJob\.actionTaskContinues/);
  const translate = method('translate');
  assert.match(translate, /v3TableBuildOwnedByTask\s*=\s*true/);
  assert.match(translate, /finally[\s\S]{0,120}v3TableBuildOwnedByTask\s*=\s*false/);
});
