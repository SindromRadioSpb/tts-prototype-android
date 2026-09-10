const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 2026-09-11 · Реальный дефект релиза 3.11.509. Ключи целостности обязаны совпадать с ключами
// precache БАЙТ В БАЙТ, включая релизный запрос: install ищет запись через cache.match(url) и,
// не найдя её, роняет установку Service Worker целиком — то есть шелл уезжает на прод без офлайна
// и без штатного цикла обновления. Поймать это удалось только загрузкой живой страницы; гейт
// «cache-busts changed assets exactly» проверяет свой список URL, а не согласие двух списков.
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const list = (source, name) => {
  const block = source.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\n\\];'));
  assert.ok(block, name + ' not found');
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

test('every integrity-checked shell asset is precached under the exact same key', () => {
  const precache = new Set(list(read('public/sw.js'), 'PRECACHE_URLS'));
  const integrity = list(read('server.js'), 'SHELL_INTEGRITY_PATHS');
  assert.ok(integrity.length > 40, 'integrity manifest looks truncated: ' + integrity.length);
  const missing = integrity.filter((url) => !precache.has(url));
  assert.deepEqual(missing, [], 'these integrity keys are absent from PRECACHE_URLS, so the service worker install throws');
});

test('a release query on a shell asset is identical on both sides', () => {
  const versioned = (urls) => new Map(urls.filter((u) => u.includes('?v=')).map((u) => [u.split('?')[0], u]));
  const precache = versioned(list(read('public/sw.js'), 'PRECACHE_URLS'));
  const integrity = versioned(list(read('server.js'), 'SHELL_INTEGRITY_PATHS'));
  const drifted = [];
  for (const [file, url] of integrity) if (precache.has(file) && precache.get(file) !== url) drifted.push([url, precache.get(file)]);
  assert.deepEqual(drifted, [], 'the same file carries different release queries in the two lists');
});
