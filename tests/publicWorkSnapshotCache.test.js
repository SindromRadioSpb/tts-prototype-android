'use strict';
// 2026-09-23 · Прод: «Ворт» переимпортирован под тем же workId (тот же архив) — браузер год
// отдавал вычищенный снимок редакции №1: ответ /works/:workId помечался immutable, клиент брал
// force-cache, SW — cache-first. Правка карточки (тот же workId, новый снимок) ломалась так же.
// Неизменяем только адрес КОНКРЕТНОГО снимка (?snapshot=<sha256>); без него — ревалидация.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('public work route is immutable only for the exact requested snapshot', () => {
  const server = read('server.js');
  const start = server.indexOf('app.get("/api/public-corpora/:slug/works/:workId", ');
  const route = server.slice(start, server.indexOf('\n}));', start));
  assert.ok(start > 0, 'route present');
  assert.match(route, /req\.query\.snapshot/);
  assert.match(route, /PUBLIC_WORK_CHANGED/);
  assert.match(route, /public, max-age=0, must-revalidate/);
  assert.match(route, /immutable/);
  assert.ok(server.includes('"PUBLIC_WORK_CHANGED"') || route.includes("PUBLIC_WORK_CHANGED"));
});

test('clients request the snapshot they expect and reject a different one', () => {
  const ui = read('public/js/library-ui.js');
  const raw = ui.match(/fetch\('\/api\/public-corpora\/' \+ encodeURIComponent\([^)]*\) \+ '\/works\/' \+ encodeURIComponent\([^)]*\), \{/g) || [];
  assert.deepEqual(raw, [], 'no unversioned public work fetch remains');
  assert.equal((ui.match(/fetch\(publicWorkUrl\(/g) || []).length, 2, 'both public work fetch sites use the versioned URL');
  assert.match(ui, /function publicWorkUrl\(/);
  assert.match(ui, /PUBLIC_WORK_SNAPSHOT_MISMATCH/);
});

test('service worker serves public works cache-first only for snapshot-versioned URLs', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /const versionedWork = \/\\\/works\\\/\[\^\/\]\+\$\/\.test\(url\.pathname\) && \/\^\[a-f0-9\]\{64\}\$\/\.test\(url\.searchParams\.get\("snapshot"\) \|\| ""\);/);
  assert.ok(!/const immutable = \/\\\/works\\\/\[\^\/\]\+\$\/\.test\(url\.pathname\) \|\|/.test(sw), 'unversioned work URLs are no longer cache-first');
});

test('copies of public and group corpus works are not "my texts" in Studio or cloud sync', () => {
  const studio = read('public/index.html'), db = read('public/db/local-db.js');
  assert.match(studio, /sm\.public_corpus \|\| sm\.group_corpus/);
  const sync = db.slice(db.indexOf('export async function listOwnTextsForSync'), db.indexOf('export async function listArtifactIntents'));
  assert.equal((sync.match(/sm\.corpus \|\| sm\.group_corpus \|\| sm\.public_corpus/g) || []).length, 2, 'sync list and delete intent both skip public copies');
});
