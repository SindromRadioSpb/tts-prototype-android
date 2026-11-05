'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {lockstepVersion, requestedUrl, assertPrecachedExactly} = require('./helpers/releaseLock');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const modules = ['course-hebrew','course-checker','course-format','course-review','course-evidence','course-store','course-sync','course-keyboard','course-audio','course-tasks','course-scene','course-media','course-review-reader','course-reader'];
test('course modules follow atlas in dependency order, with exact offline and integrity keys', () => {
  const room=read('public/library.html'), sw=read('public/sw.js'), server=read('server.js');
  let previous=room.indexOf('/js/atlas-train-ui.js?v=');
  assert.ok(previous>0);
  for(const module of modules) {
    const url=requestedUrl(room, '/js/'+module+'.js');
    const at=room.indexOf(url);
    assert.ok(at>previous, module+' order'); previous=at;
    assertPrecachedExactly(url,{sw,server});
  }
  assertPrecachedExactly(requestedUrl(room,'/css/course-reader.css'),{sw,server});
});
test('course release shell and changed dependencies use consistent cache keys', () => {
  const studio=read('public/index.html'), room=read('public/library.html'), sw=read('public/sw.js'), server=read('server.js'), host=read('public/js/library-ui.js');
  lockstepVersion({studio,room,sw});
  assertPrecachedExactly(requestedUrl(room,'/js/library-ui.js'),{sw,server});
  for(const module of ['corpus-registry','room-b6-core']) assertPrecachedExactly(requestedUrl(host,'/js/'+module+'.js'),{sw,server});
  for(const lang of ['ru','en','he']) {
    const url=requestedUrl(room,'/i18n/locales/'+lang+'.js');
    assert.equal(url,requestedUrl(studio,'/i18n/locales/'+lang+'.js'));
    assertPrecachedExactly(url,{sw,server});
  }
});
