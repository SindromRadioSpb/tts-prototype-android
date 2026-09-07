'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const check = require('../public/js/iphone-media-check.js');

test('iPhone check reduces supported YouTube URLs to a safe identifier', () => {
  for (const value of ['https://www.youtube.com/watch?v=dH_OkB7Uym4&t=5', 'https://youtu.be/dH_OkB7Uym4', 'https://m.youtube.com/shorts/dH_OkB7Uym4']) {
    assert.equal(check.videoId(value), 'dH_OkB7Uym4');
  }
  for (const value of ['http://youtu.be/dH_OkB7Uym4', 'https://youtube.com.evil.test/watch?v=dH_OkB7Uym4', 'https://a:password@youtu.be/dH_OkB7Uym4', 'https://youtu.be/dH_OkB7Uym4;rm', 'https://www.youtube.com/watch?v=dH_OkB7Uym4&v=dH_OkB7Uym4', 'https://www.youtube.com:444/watch?v=dH_OkB7Uym4']) {
    assert.throws(() => check.videoId(value));
  }
});

test('download commands require explicit known rights and cannot interpolate arbitrary shell input', () => {
  assert.equal(check.downloadCommand('https://youtu.be/dH_OkB7Uym4', 'audio', 'permission'),
    'python3 run.py --download --video-id dH_OkB7Uym4 --kind audio --rights permission');
  assert.equal(check.downloadCommand('https://youtu.be/dH_OkB7Uym4', 'video', 'owned'),
    'python3 run.py --download --video-id dH_OkB7Uym4 --kind video --quality 360 --rights owned');
  for (const rights of ['', 'permission;open evil', 'public', null]) {
    assert.throws(() => check.downloadCommand('https://youtu.be/dH_OkB7Uym4', 'audio', rights));
  }
  assert.throws(() => check.downloadCommand('https://youtu.be/dH_OkB7Uym4', 'audio;rm', 'owned'));
});

test('Chrome return command only accepts a random hex ID', () => {
  assert.equal(check.returnCommand('a'.repeat(32)), 'python3 run.py --return-chrome ' + 'a'.repeat(32));
  for (const value of ['../owner', 'a'.repeat(32) + ';open bad', 'https://example.org', 'A'.repeat(32)]) {
    assert.throws(() => check.returnCommand(value));
  }
});

test('published kit bytes match the inspected qualification artifact', () => {
  const file = path.join(__dirname, '../public/downloads/linguistpro-iphone-probe-0744253a.zip');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    '0744253ad45912fd53f641b10f9832e68511641f211d1bf82ae8151d6f7e4282');
});

test('owner check remains an explicit experiment, without a media server or automatic ASR', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/iphone-media-check.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../public/js/iphone-media-check.js'), 'utf8');
  assert.match(html, /не готовая функция/i);
  assert.match(html, /не передаётся автоматически/i);
  assert.match(html, /name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(js, /fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|innerHTML|eval\s*\(/);
  assert.match(html, /<option value="">/);
});
