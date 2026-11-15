'use strict';
// Offload/restore in the owner's browser (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.11).
const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { parseHTML } = require('linkedom');
const OU = require('../public/js/news-offload-ui');

// A folder chosen with showDirectoryPicker, in memory. `corrupt` changes what is read back.
function fakeDir({ corrupt = null } = {}) {
  const files = new Map();
  return {
    files,
    async getFileHandle(name, opts) {
      if (!files.has(name) && !(opts && opts.create)) { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; }
      return {
        async createWritable() { const parts = []; return { async write(b) { parts.push(Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b)); }, async close() { files.set(name, Buffer.concat(parts)); } }; },
        async getFile() { let b = files.get(name); if (corrupt && corrupt(name)) b = Buffer.from('changed'); return { async arrayBuffer() { return new Uint8Array(b).buffer; }, async text() { return b.toString('utf8'); } }; },
      };
    },
  };
}
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function fakeServer() {
  const calls = [], packs = { '2026-11-12': Buffer.from('PK-day-12'), '2026-11-13': Buffer.from('PK-day-13') };
  const fetchImpl = async (url, init = {}) => {
    calls.push([init.method || 'GET', url, init.body]);
    const m = url.match(/offload\/(\d{4}-\d{2}-\d{2})(\/release)?$/);
    if (m && !m[2]) return new Response(packs[m[1]], { headers: { 'x-pack-sha256': sha(packs[m[1]]) } });
    if (m && m[2]) return JSON.parse(init.body).sha256 === sha(packs[m[1]]) ? new Response('{"ok":true}') : new Response('{"ok":false,"error":"OFFLOAD_SHA_MISMATCH"}', { status: 409 });
    if (url.endsWith('/offload/restore')) return new Response(JSON.stringify({ ok: true, restored: 2 }));
    return new Response('nf', { status: 404 });
  };
  return { calls, fetchImpl, packs };
}
const webcrypto = crypto.webcrypto;

test('offload: each day is written, read back, verified, then released', async () => {
  const dir = fakeDir(), srv = fakeServer(), progress = [];
  const r = await OU.run({ fetchImpl: srv.fetchImpl, csrf: 'c', pickDir: async () => dir, days: ['2026-11-12', '2026-11-13'], crypto: webcrypto, onProgress: p => progress.push(p.day + ':' + p.step), now: () => '2026-11-20T10:00:00.000Z' });
  assert.deepEqual(r, { done: ['2026-11-12', '2026-11-13'], failed: [] });
  const file = [...dir.files.keys()].find(n => n.startsWith('news-2026-11-12-'));
  assert.equal(file, 'news-2026-11-12-' + sha(srv.packs['2026-11-12']).slice(0, 12) + '.lpnews-archive.zip');
  assert.equal(dir.files.get(file).toString(), 'PK-day-12');
  assert.deepEqual(srv.calls.filter(c => c[1].endsWith('/release')).map(c => JSON.parse(c[2]).sha256), [sha(srv.packs['2026-11-12']), sha(srv.packs['2026-11-13'])]);
  assert.ok(progress.includes('2026-11-12:released'));
  assert.match(dir.files.get('ПРОЧТИ.txt').toString(), /Вернуть выгруженное на сервер/);
});
test('offload: a mismatch after read-back does not release', async () => {
  const dir = fakeDir({ corrupt: n => n.includes('11-13') }), srv = fakeServer();
  const r = await OU.run({ fetchImpl: srv.fetchImpl, csrf: 'c', pickDir: async () => dir, days: ['2026-11-12', '2026-11-13'], crypto: webcrypto });
  assert.deepEqual(r, { done: ['2026-11-12'], failed: [{ day: '2026-11-13', code: 'LOCAL_SHA_MISMATCH' }] });
  assert.equal(srv.calls.filter(c => c[1].endsWith('2026-11-13/release')).length, 0);
});
test('offload: index is appended, not replaced', async () => {
  const dir = fakeDir(), srv = fakeServer();
  await OU.run({ fetchImpl: srv.fetchImpl, csrf: 'c', pickDir: async () => dir, days: ['2026-11-12'], crypto: webcrypto });
  await OU.run({ fetchImpl: srv.fetchImpl, csrf: 'c', pickDir: async () => dir, days: ['2026-11-13'], crypto: webcrypto });
  const idx = JSON.parse(dir.files.get('offload-index.json').toString());
  assert.deepEqual(idx.days.map(d => d.day), ['2026-11-12', '2026-11-13']);
  assert.equal(idx.days[0].sha256, sha(srv.packs['2026-11-12']));
});
test('restore: every file of the index is uploaded', async () => {
  const dir = fakeDir(), srv = fakeServer();
  await OU.run({ fetchImpl: srv.fetchImpl, csrf: 'c', pickDir: async () => dir, days: ['2026-11-12', '2026-11-13'], crypto: webcrypto });
  srv.calls.length = 0;
  const r = await OU.restore({ fetchImpl: srv.fetchImpl, csrf: 'c', pickDir: async () => dir });
  assert.deepEqual(r, { done: ['2026-11-12', '2026-11-13'], already: [], failed: [] });
  assert.deepEqual(srv.calls.map(c => [c[0], c[1]]), [['POST', '/api/news/editor/offload/restore'], ['POST', '/api/news/editor/offload/restore']]);
});
test('banner: only the owner sees it, only when low', () => {
  const UI = require('../public/js/news-ui');
  const { document } = parseHTML('<html><body></body></html>');
  const st = { low: true, suggest: { days: ['2026-11-12', '2026-11-13'], bytes: 1.4e9 } };
  const el = UI.renderStorageBanner(document, st, { owner: true });
  assert.match(el.textContent, /Место на сервере заканчивается\. Можно выгрузить на этот компьютер 2 дн\. архива \(≈1,4 ГБ\)\./);
  assert.equal(el.querySelector('a').getAttribute('href'), '/news-editor.html#storage');
  assert.equal(UI.renderStorageBanner(document, st, { owner: false }), null);
  assert.equal(UI.renderStorageBanner(document, { ...st, low: false }, { owner: true }), null);
});
test('no File System Access → the desktop hint instead of buttons', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const el = OU.renderStorageCard(document, { disk: { free: 1e9, total: 38e9 }, db_free: 2e8, low: true, by_month: [{ month: '2026-11', photos: 5e8, bodies: 1e8 }], offloaded: [], suggest: { days: ['2026-11-12'], bytes: 3e8 } }, { win: {} });
  assert.match(el.textContent, /Выгрузка работает в Chrome или Edge на компьютере/);
  assert.equal(el.querySelectorAll('button').length, 0);
  const ok = OU.renderStorageCard(document, { disk: { free: 1e9, total: 38e9 }, db_free: 2e8, low: true, by_month: [], offloaded: [{ day: '2026-11-01', state: 'released', sha256: 'a'.repeat(64), articles: 30, photos: 70, bytes: 4e7 }], suggest: { days: ['2026-11-12'], bytes: 3e8 } }, { win: { showDirectoryPicker() {} } });
  assert.equal(ok.querySelectorAll('button').length, 2);
  assert.match(ok.textContent, /2026-11-01/);
});

// ---- D review fixes ------------------------------------------------------------------------------------
test('review: an archive file is never replaced — a second file of the same day gets its own name', async () => {
  const dir = fakeDir(), srv = fakeServer();
  await OU.run({ fetchImpl: srv.fetchImpl, csrf: 'c', pickDir: async () => dir, days: ['2026-11-12'], crypto: webcrypto });
  const first = [...dir.files.keys()].find(n => n.endsWith('.lpnews-archive.zip'));
  srv.packs['2026-11-12'] = Buffer.from('PK-day-12-part-two');
  await OU.run({ fetchImpl: srv.fetchImpl, csrf: 'c', pickDir: async () => dir, days: ['2026-11-12'], crypto: webcrypto });
  const zips = [...dir.files.keys()].filter(n => n.endsWith('.lpnews-archive.zip'));
  assert.equal(zips.length, 2);
  assert.equal(dir.files.get(first).toString(), 'PK-day-12');
  assert.equal(JSON.parse(dir.files.get('offload-index.json').toString()).days.length, 2);
});
test('review: the index entry is written before the release (a closed tab cannot lose a released day)', async () => {
  const dir = fakeDir(), srv = fakeServer();
  const order = [], f = srv.fetchImpl;
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/release')) order.push('release:' + (dir.files.has('offload-index.json') ? JSON.parse(dir.files.get('offload-index.json').toString()).days[0].state : 'none'));
    return f(url, init);
  };
  await OU.run({ fetchImpl, csrf: 'c', pickDir: async () => dir, days: ['2026-11-12'], crypto: webcrypto });
  assert.deepEqual(order, ['release:pending']);
  assert.equal(JSON.parse(dir.files.get('offload-index.json').toString()).days[0].state, 'released');
});
test('review: restore reports what came back, not just that the request went through', async () => {
  const dir = fakeDir(), srv = fakeServer();
  await OU.run({ fetchImpl: srv.fetchImpl, csrf: 'c', pickDir: async () => dir, days: ['2026-11-12'], crypto: webcrypto });
  const r = await OU.restore({ fetchImpl: async () => new Response(JSON.stringify({ ok: true, restored: 0, duplicate: 2, missing: 0, expired: 0 })), csrf: 'c', pickDir: async () => dir });
  assert.deepEqual(r.done, []); assert.deepEqual(r.already, ['2026-11-12']);
});
test('review: the reminder without anything to offload has no button', () => {
  const UI = require('../public/js/news-ui');
  const { document } = parseHTML('<html><body></body></html>');
  const el = UI.renderStorageBanner(document, { low: true, suggest: { days: [], bytes: 0 } }, { owner: true });
  assert.match(el.textContent, /Выгружать пока нечего/);
  assert.equal(el.querySelector('a'), null);
});
