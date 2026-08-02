const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),studio=fs.readFileSync(path.join(root,'public/js/studio-portable-learning-package.js'),'utf8'),sw=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');

test('P2 scripts load in dependency order and remain offline/provider-free',()=>{
  const order=['/js/portable-learning-package-core.js','/js/portable-learning-package-repository.js','/js/studio-portable-learning-package.js'].map(item=>html.indexOf(item));
  assert.ok(order.every(n=>n>0));assert.ok(order[0]<order[1]&&order[1]<order[2]);
  assert.equal(/\bfetch\s*\(|XMLHttpRequest|apiCall\s*\(/.test(studio),false,'no server/provider transport');
  for(const item of ['/js/portable-learning-package-core.js','/js/portable-learning-package-repository.js','/js/studio-portable-learning-package.js'])assert.ok(sw.includes(item));
  assert.match(sw,/CACHE_VERSION = "v3\.11\.288"/,'owner-approved P2 release cache version');
});

test('premium modal is mobile/RTL safe and exposes explicit verify-before-apply semantics',()=>{
  assert.match(html,/\.p2-portable-dialog \{[^}]*width:min\(680px,100%\)/s);
  assert.match(html,/min-height:44px/);assert.match(html,/inset-inline|border-inline-start/);
  assert.match(studio,/Verifying before any writes/);assert.match(studio,/Apply verified package/);
  assert.match(studio,/media-free/i);assert.match(studio,/zero provider calls/i);
});

test('RU, EN and HE locales carry the complete P2 surface',()=>{
  for(const locale of ['en','ru','he']){const text=fs.readFileSync(path.join(root,`public/i18n/locales/${locale}.js`),'utf8');for(const key of ['button','privacy','snapshot','archive','verifying','apply','reused','applied'])assert.match(text,new RegExp(`${key}:`),`${locale}.${key}`);}
});

test('full backup integration cannot silently omit promoted Studio canon',()=>{
  assert.match(html,/await window\.StudioPortableLearningPackage\.augmentFullBackupZip\(zip, payload\)/);
  assert.match(html,/restoreEmbeddedPackages\(portableRestoreZip\)/);
});
