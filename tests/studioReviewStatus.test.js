'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../public/index.html'), 'utf8');
const source = html.slice(html.indexOf('let v3StudioReviewCounts ='), html.indexOf('async function v3OpenRoomReview()'));
for (const [label, dueNow, scheduled, failure, key] of [
  ['due', 3, true, false, 'studioReview.start'],
  ['completed', 0, true, false, 'studioReview.allDone'],
  ['empty', 0, false, false, 'studioReview.noSchedule'],
  ['failed', 0, false, true, 'studioReview.openRoom'],
]) test(`review ${label} state survives later translation, never returns to Loading`, async () => {
  const state = { dataset: { i18n: 'studioReview.loading' }, textContent: 'Loading' };
  const counts = [{}, {}];
  const sandbox = { window: { ReaderMorph: { dueCounts: () => ({dueNow, inProgress: 2}) } },
    document: { querySelectorAll: () => counts, getElementById: id => id === 'studioReviewState' ? state : null },
    ensureLocalDB: async () => { if (failure) throw new Error('fixture DB unavailable'); return {
      getAllWordStatuses: async () => ({}), getSrsSchedule: async () => scheduled ? { fixture: {} } : {} }; },
    v3NotesT: name => name };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  await sandbox.refreshStudioReviewStatus();
  assert.equal(state.textContent, key);
  // The locale renderer translates every node carrying data-i18n again.
  state.textContent = state.dataset.i18n;
  assert.equal(state.textContent, key);
});
