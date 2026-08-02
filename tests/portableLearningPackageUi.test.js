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
  assert.match(sw,/CACHE_VERSION = "v3\.11\.293"/,'scoped portability UX release cache version');
});

test('premium modal is mobile/RTL safe and exposes explicit verify-before-apply semantics',()=>{
  assert.match(html,/\.p2-portable-dialog \{[^}]*width:min\(680px,100%\)/s);
  assert.match(html,/min-height:44px/);assert.match(html,/inset-inline|border-inline-start/);
  assert.match(studio,/Verifying before any writes/);assert.match(studio,/Apply verified package/);
  assert.match(studio,/media-free/i);assert.match(studio,/zero provider calls/i);
});

test('portability hub is globally discoverable even without an active Workspace',()=>{
  const workspaceStart=html.indexOf('<section id="l3WorkspaceCard"');
  const workspaceEnd=html.indexOf('</section>',workspaceStart);
  const globalEntry=html.indexOf('id="v3PortableGlobalBtn"');
  const libraryEntry=html.indexOf('id="v3PortabilityHubBtn"');
  assert.ok(globalEntry>workspaceEnd,'Studio entry must live outside the conditional Workspace card');
  assert.ok(libraryEntry>0,'Library must expose the same portability hub');
  assert.match(html,/StudioPortableLearningPackage\.open\(\{view:'import'\}\)/);
  assert.match(html,/StudioPortableLearningPackage\.open\(\{view:'library'\}\)/);
});

test('one hub names library, material, import and receipt-history scopes explicitly',()=>{
  for(const view of ['library','material','import','history'])assert.match(studio,new RegExp(`data-view="${view}"`));
  assert.match(studio,/listReceipts/);
  assert.match(studio,/reverseReferencePlan/);
  assert.match(studio,/undoReceipt/);
  assert.match(studio,/Full library backup/i);
  assert.match(studio,/Compatibility JSON/i);
});

test('format help is one keyboard-accessible decision guide, not hover-only tooltips',()=>{
  assert.match(studio,/id="p2FormatHelpToggle"/);
  assert.match(studio,/aria-expanded="false"/);
  assert.match(studio,/aria-controls="p2FormatHelp"/);
  assert.match(studio,/id="p2FormatHelp"/);
  assert.match(studio,/classList\.toggle\('p2-help-open',expanded\)/);
  for(const choice of ['Full device move','One material with history','Compact current state','Compatibility only'])assert.match(studio,new RegExp(choice,'i'));
  assert.match(studio,/media bytes/i);
});

test('text-card share links to the same material truth and single-card ZIP coverage',()=>{
  assert.match(html,/id="v3TcsPortableSection"/);
  assert.match(html,/id="v3TcsPortableTitle"/);
  assert.match(html,/id="v3TcsPortableHelp"/);
  assert.match(html,/id="v3TcsPortableBtn"/);
  assert.match(html,/openForText\(v3TcsCurrentTextId\)/);
  assert.match(html,/augmentTextBackupZip\(zip, manifest, v3TcsCurrentTextId\)/);
  assert.match(studio,/async function augmentTextBackupZip/);
  assert.match(html,/portableSection\.hidden = false/,'legacy text-card must explain zero P2 coverage instead of hiding the feature');
  assert.match(html,/shareLegacyTitle/);
  assert.match(html,/shareLegacyHelp/);
});

test('RU, EN and HE locales carry the complete P2 surface',()=>{
  for(const locale of ['en','ru','he']){const text=fs.readFileSync(path.join(root,`public/i18n/locales/${locale}.js`),'utf8');for(const key of ['button','privacy','snapshot','archive','verifying','apply','reused','applied','hub','libraryTab','materialTab','importTab','historyTab','undo','helpButton','helpFullMove','helpMaterialHistory','helpSnapshot','helpCompatibility','shareLegacyTitle','shareLegacyHelp','cues','currentRows','captionVersions','tableVersions','mediaMismatch','mediaExpected','mediaSelected','mediaTelegram','mediaConnected','mediaMissingShort'])assert.match(text,new RegExp(`${key}:`),`${locale}.${key}`);for(const key of ['labelSourceLink','sourceLinkHelp','provKindPortable','provMethodPortable'])assert.match(text,new RegExp(`${key}:`),`${locale}.textMeta.${key}`);}
});

test('full backup integration cannot silently omit promoted Studio canon',()=>{
  assert.match(html,/await window\.StudioPortableLearningPackage\.augmentFullBackupZip\(zip, payload\)/);
  assert.match(html,/restoreEmbeddedPackages\(portableRestoreZip\)/);
});

test('portable media recovery stays available after the transient import step',()=>{
  assert.match(studio,/mediaForText/);
  assert.match(studio,/data-action="relink-media"/);
  assert.match(studio,/MEDIA_SHA_MISMATCH/);
  assert.match(html,/id="v3TextMetaPortableMedia"/);
  assert.match(html,/v3TextMetaRelinkMedia/);
  assert.match(html,/v3TextMetaMediaFile/);
});
