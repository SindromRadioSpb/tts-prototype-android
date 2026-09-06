'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Updater = require('../public/tools/obsidian-update.cjs');
const Preview = require('../public/js/obsidian-lexical-preview.js');

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'lp-obsidian-update-'));
  t.after(() => { assert.ok(path.basename(root).startsWith('lp-obsidian-update-')); fs.rmSync(root,{recursive:true,force:true}); });
  const source = path.join(root,'package'), vault = path.join(root,'vault');
  fs.mkdirSync(source); fs.mkdirSync(vault);
  return {root,source,vault};
}
function writePackage(source, title = 'Первое название', value = 'Содержимое', id = 'text-1') {
  const textPath = '_LinguistPro/Тексты/' + title;
  const servicePath = '_LinguistPro/Служебное/' + title;
  const file = {path:textPath + '/Текст.md',content:'# ' + title + '\n' + value};
  fs.mkdirSync(path.dirname(path.join(source,file.path)),{recursive:true});
  fs.writeFileSync(path.join(source,file.path),file.content);
  const manifest = {schema:'linguistpro-obsidian-package-manifest-v1',texts:[{text_id:id,title,text_path:textPath,service_path:servicePath}],
    files:[{path:file.path,kind:'text-hub',bytes:Buffer.byteLength(file.content),sha256:Updater.sha(file.content)}]};
  fs.writeFileSync(path.join(source,'_LinguistPro/package-manifest.json'),JSON.stringify(manifest));
  return {manifest,file};
}
test('dry-run is read-only; apply is repeatable and protects personal files', t => {
  const {source,vault} = setup(t);
  const {file} = writePackage(source);
  fs.writeFileSync(path.join(vault,'Мои примеры.md'),'Личная работа');
  const plan = Updater.prepare(source,vault);
  assert.equal(plan.counts.create,1);
  assert.deepEqual(fs.readdirSync(vault),['Мои примеры.md']);
  assert.equal(Updater.apply(plan).status,'complete');
  const installed = fs.readFileSync(path.join(vault,file.path),'utf8');
  assert.equal(Updater.apply(Updater.prepare(source,vault)).status,'unchanged');
  assert.equal(fs.readFileSync(path.join(vault,file.path),'utf8'),installed);
  assert.equal(fs.readFileSync(path.join(vault,'Мои примеры.md'),'utf8'),'Личная работа');
});
test('renamed texts keep installed locations and updates retain a recoverable backup', t => {
  const {source,vault} = setup(t);
  const first = writePackage(source);
  Updater.apply(Updater.prepare(source,vault));
  writePackage(source,'Новое название','Новое содержимое');
  const update = Updater.prepare(source,vault);
  assert.equal(update.counts.update,1);
  assert.equal(update.entries[0].path,first.file.path);
  const result = Updater.apply(update);
  assert.match(fs.readFileSync(path.join(vault,first.file.path),'utf8'),/Новое содержимое/);
  assert.equal(fs.readFileSync(path.join(vault,result.backup,'0.bak'),'utf8'),first.file.content);
  assert.equal(fs.existsSync(path.join(vault,'_LinguistPro/Тексты/Новое название')),false);
});
test('renamed path prefixes are rewritten once, without cascading', t => {
  const {source,vault} = setup(t);
  writePackage(source,'AA');
  Updater.apply(Updater.prepare(source,vault));
  writePackage(source,'A','[[_LinguistPro/Тексты/A/Текст]] [[Тексты/A/Текст]]');
  const update = Updater.prepare(source,vault);
  const content = update.content(update.entries[0].entry).toString();
  assert.match(content, /\[\[_LinguistPro\/Тексты\/AA\/Текст\]\]/);
  assert.match(content, /\[\[Тексты\/AA\/Текст\]\]/);
  assert.doesNotMatch(content, /Тексты\/AAA\//);
});

test('owner modifications and unrecognized files block an overwrite', t => {
  const {source,vault} = setup(t);
  const first = writePackage(source);
  Updater.apply(Updater.prepare(source,vault));
  fs.writeFileSync(path.join(vault,first.file.path),'Моя правка');
  writePackage(source,'Первое название','Изменение источника');
  const plan = Updater.prepare(source,vault);
  assert.equal(plan.counts.conflict,1);
  assert.throws(() => Updater.apply(plan),/CONFLICTS_REQUIRE_REVIEW/);
  assert.equal(fs.readFileSync(path.join(vault,first.file.path),'utf8'),'Моя правка');
});
test('tampered payloads and unsafe paths fail closed', t => {
  const {source,vault} = setup(t);
  const {file} = writePackage(source);
  fs.appendFileSync(path.join(source,file.path),'tamper');
  assert.throws(() => Updater.prepare(source,vault),/PACKAGE_FILE_CHANGED/);
  for (const name of ['../x','_LinguistPro/../x','C:/x','_LinguistPro/CON.md','_LinguistPro/x:stream','_LinguistPro/.updates/x','.obsidian/app.json']) assert.throws(() => Updater.safeRelative(name));
});
test('sealing hashes actual package bytes, not receipt estimates', async () => {
  const plan = {text_id:'t',text_title:'Test',text_path:'_LinguistPro/Тексты/Test',service_path:'_LinguistPro/Служебное/Test',files:[{path:'_LinguistPro/Тексты/Test/Текст.md',kind:'text-hub',content:'שלום'}],external_files:[],would_create_files:1,would_write_bytes:8};
  const sealed = await Preview.sealPackage(plan,new Map());
  assert.equal(sealed.manifest.files[0].sha256,Updater.sha('שלום'));
  assert.equal(sealed.manifest.files[0].bytes,Buffer.byteLength('שלום'));
  assert.equal(plan.files.length,1);
  assert.equal(sealed.files.length,2);
});

test('interrupted writes block updates until explicit recovery restores the previous bytes', t => {
  const {source,vault} = setup(t);
  const first = writePackage(source);
  Updater.apply(Updater.prepare(source,vault));
  writePackage(source,'Первое название','Новый текст');
  assert.throws(() => Updater.apply(Updater.prepare(source,vault),{onStep:() => {throw new Error('INJECTED_INTERRUPTION');}}),/INJECTED_INTERRUPTION/);
  assert.match(fs.readFileSync(path.join(vault,first.file.path),'utf8'),/Новый текст/);
  let message;
  try { Updater.prepare(source,vault); } catch (error) { message = error.message; }
  assert.match(message,/^RECOVERY_REQUIRED:/);
  const id = message.split(':')[1];
  assert.equal(Updater.recover(vault,id).status,'recovery-preview');
  assert.match(fs.readFileSync(path.join(vault,first.file.path),'utf8'),/Новый текст/);
  assert.equal(Updater.recover(vault,id,true).status,'rolled-back');
  assert.equal(fs.readFileSync(path.join(vault,first.file.path),'utf8'),first.file.content);
  assert.equal(Updater.recover(vault,id,true).status,'already-rolled-back');
  assert.equal(Updater.prepare(source,vault).counts.update,1);
});
test('recovery refuses an owner edit made after failure', t => {
  const {source,vault} = setup(t);
  const {file} = writePackage(source);
  assert.throws(() => Updater.apply(Updater.prepare(source,vault),{onStep:() => {throw new Error('STOP');}}),/STOP/);
  const id = fs.readdirSync(path.join(vault,'_LinguistPro/.updates')).find(x => /^[a-f0-9-]{36}$/.test(x));
  fs.writeFileSync(path.join(vault,file.path),'Работа после сбоя');
  assert.throws(() => Updater.recover(vault,id,true),/RECOVERY_CONFLICT/);
  assert.equal(fs.readFileSync(path.join(vault,file.path),'utf8'),'Работа после сбоя');
});
test('matching pre-extracted files are adopted transactionally and rollback preserves them', t => {
  const {source,vault} = setup(t);
  const {file} = writePackage(source);
  fs.mkdirSync(path.dirname(path.join(vault,file.path)),{recursive:true});
  fs.writeFileSync(path.join(vault,file.path),file.content);
  const plan = Updater.prepare(source,vault);
  assert.equal(plan.counts.unchanged,1);
  const applied = Updater.apply(plan);
  assert.equal(applied.status,'complete');
  assert.ok(fs.existsSync(path.join(vault,'_LinguistPro/.install-state.json')));
  Updater.recover(vault,path.basename(applied.backup),true);
  assert.equal(fs.existsSync(path.join(vault,'_LinguistPro/.install-state.json')),false);
  assert.equal(fs.readFileSync(path.join(vault,file.path),'utf8'),file.content);
});
test('live locks are never stolen and junction targets are rejected', t => {
  const {source,vault,root} = setup(t);
  writePackage(source);
  fs.mkdirSync(path.join(vault,'_LinguistPro/.updates'),{recursive:true});
  fs.writeFileSync(path.join(vault,'_LinguistPro/.updates/lock'),JSON.stringify({pid:process.pid,host:os.hostname()}));
  assert.throws(() => Updater.apply(Updater.prepare(source,vault)),/EEXIST/);
  assert.throws(() => Updater.unlockStale(vault),/UPDATER_PROCESS_STILL_ALIVE/);
  const target = path.join(root,'outside'); fs.mkdirSync(target);
  const link = path.join(root,'linked-vault');
  fs.symlinkSync(target,link,process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => Updater.prepare(source,link),/SYMLINK_OR_REPARSE_PATH/);
  assert.deepEqual(fs.readdirSync(target),[]);
});

test('retirement is text-scoped and rollback restores retired managed files', t => {
  const {source,vault} = setup(t);
  const initial = writePackage(source);
  const oldPath = '_LinguistPro/Тексты/Первое название/Старая карточка.md';
  fs.writeFileSync(path.join(source,oldPath),'Старый разбор');
  initial.manifest.files.push({path:oldPath,kind:'text-lexeme',bytes:Buffer.byteLength('Старый разбор'),sha256:Updater.sha('Старый разбор')});
  fs.writeFileSync(path.join(source,'_LinguistPro/package-manifest.json'),JSON.stringify(initial.manifest));
  Updater.apply(Updater.prepare(source,vault));
  writePackage(source,'Другой текст','Независимый материал','text-2');
  const other = Updater.prepare(source,vault);
  assert.equal(other.counts.retire,0);
  Updater.apply(other);
  writePackage(source);
  const retired = Updater.prepare(source,vault);
  assert.equal(retired.counts.retire,1);
  const applied = Updater.apply(retired);
  assert.equal(fs.existsSync(path.join(vault,oldPath)),false);
  assert.ok(fs.existsSync(path.join(vault,'_LinguistPro/Тексты/Другой текст/Текст.md')));
  Updater.recover(vault,path.basename(applied.backup),true);
  assert.equal(fs.readFileSync(path.join(vault,oldPath),'utf8'),'Старый разбор');
});
test('a manifest cannot target a text outside its declared scope', t => {
  const {source,vault} = setup(t);
  const {manifest} = writePackage(source);
  manifest.files[0].path = '_LinguistPro/Тексты/Other/Текст.md';
  fs.writeFileSync(path.join(source,'_LinguistPro/package-manifest.json'),JSON.stringify(manifest));
  assert.throws(() => Updater.prepare(source,vault),/FILE_OUTSIDE_DECLARED_TEXTS/);
});
