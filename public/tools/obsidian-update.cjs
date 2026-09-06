#!/usr/bin/env node
'use strict';
// Standalone offline updater. No dependencies, network, OPFS or learner writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const MANIFEST = '_LinguistPro/package-manifest.json';
const STATE = '_LinguistPro/.install-state.json';
const JOURNALS = '_LinguistPro/.updates';
const MAX_FILE = 128 * 1024 * 1024;
function fail(code) { throw new Error(code); }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function safeRelative(value, internal = false) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || value.length > 1000) fail('UNSAFE_PATH');
  const parts = value.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[<>:"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) fail('UNSAFE_PATH');
  if (!internal && !(value.startsWith('_LinguistPro/') || value === '.obsidian/snippets/linguistpro-study-v3.css')) fail('UNMANAGED_PATH');
  if (!internal && (value.toLowerCase() === STATE.toLowerCase() || value.toLowerCase() === JOURNALS.toLowerCase() || value.toLowerCase().startsWith(JOURNALS.toLowerCase() + '/'))) fail('RESERVED_PATH');
  return value;
}
function checked(root, relative = '') {
  const resolved = path.resolve(root, relative);
  if (relative && !resolved.startsWith(path.resolve(root) + path.sep)) fail('PATH_ESCAPE');
  // Check ancestors as well as the named root: a junction above it also escapes.
  const parsed = path.parse(resolved); let cursor = parsed.root;
  for (const segment of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (fs.existsSync(cursor)) {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink()) fail('SYMLINK_OR_REPARSE_PATH');
    } else {
      try { fs.lstatSync(cursor); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      fail('DANGLING_LINK_PATH');
    }
  }
  return resolved;
}
function readFile(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX_FILE) fail('FILE_SIZE_OR_TYPE');
  return fs.readFileSync(file);
}
function readJson(file) { return JSON.parse(readFile(file).toString('utf8')); }
function hashAt(root, relative) {
  const file = checked(root, relative);
  return fs.existsSync(file) ? sha(readFile(file)) : null;
}
function validateTexts(texts) {
  if (!Array.isArray(texts) || !texts.length || texts.length > 10000) fail('TEXT_MANIFEST_INVALID');
  const ids = new Set(), paths = new Set();
  for (const text of texts) {
    if (typeof text.text_id !== 'string' || !text.text_id || ids.has(text.text_id)) fail('TEXT_ID_INVALID');
    ids.add(text.text_id);
    for (const [field, prefix] of [['text_path','_LinguistPro/Тексты/'],['service_path','_LinguistPro/Служебное/']]) {
      safeRelative(text[field]);
      if (!text[field].startsWith(prefix) || text[field].slice(prefix.length).includes('/')) fail('TEXT_PATH_INVALID');
      const key = text[field].normalize('NFC').toLowerCase();
      if (paths.has(key)) fail('TEXT_PATH_COLLISION'); paths.add(key);
    }
  }
}
function stateOf(vault) {
  const file = checked(vault, STATE);
  if (!fs.existsSync(file)) return {schema:'linguistpro-obsidian-installed-v1',texts:[],files:{}};
  const state = readJson(file);
  validateState(state);
  return state;
}
function validateState(state) {
  if (!state || state.schema !== 'linguistpro-obsidian-installed-v1' || !Array.isArray(state.texts) || !state.files || typeof state.files !== 'object' || Array.isArray(state.files)) fail('INSTALL_STATE_INVALID');
  if (state.texts.length) validateTexts(state.texts);
  for (const [name, value] of Object.entries(state.files)) {
    safeRelative(name);
    if (!value || !/^[a-f0-9]{64}$/.test(value.sha256)) fail('INSTALL_STATE_HASH_INVALID');
  }
}
function pendingJournals(vault) {
  const dir = checked(vault,JOURNALS);
  if (!fs.existsSync(dir)) return [];
  const pending = [];
  for (const name of fs.readdirSync(dir)) {
    if (!/^[a-f0-9-]{36}$/.test(name)) continue;
    const file = checked(vault,JOURNALS + '/' + name + '/journal.json');
    if (!fs.existsSync(file)) continue; // no journal => no managed writes started
    const journal = readJson(file);
    if (!['prepared','complete','rolled_back'].includes(journal.status)) fail('UPDATE_JOURNAL_INVALID');
    if (journal.status === 'prepared') pending.push(name);
  }
  return pending;
}
function prepare(packageRoot, vaultRoot) {
  const source = path.resolve(packageRoot), vault = path.resolve(vaultRoot);
  checked(source); checked(vault);
  const pending = pendingJournals(vault);
  if (pending.length) fail('RECOVERY_REQUIRED:' + pending.join(','));
  if (!fs.statSync(source).isDirectory() || !fs.statSync(vault).isDirectory()) fail('DIRECTORY_REQUIRED');
  if (source === vault || source.startsWith(vault + path.sep) || vault.startsWith(source + path.sep)) fail('PACKAGE_MUST_BE_OUTSIDE_VAULT');
  const manifest = readJson(checked(source, MANIFEST));
  if (manifest.schema !== 'linguistpro-obsidian-package-manifest-v1' || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 50000) fail('PACKAGE_MANIFEST_REQUIRED');
  validateTexts(manifest.texts);
  const state = stateOf(vault), oldTexts = new Map(state.texts.map(t => [t.text_id,t]));
  const texts = manifest.texts.map(t => oldTexts.has(t.text_id) ? {...t,text_path:oldTexts.get(t.text_id).text_path,service_path:oldTexts.get(t.text_id).service_path} : t);
  const mergedTexts = state.texts.filter(t => !texts.some(n => n.text_id === t.text_id)).concat(texts);
  validateTexts(mergedTexts);
  const replacements = manifest.texts.flatMap((text,i) => ['text_path','service_path'].map(field => [text[field],texts[i][field]])).filter(([a,b]) => a !== b);
  const contentPaths = new Map(replacements.flatMap(([from,to]) => [[from,to],[from.replace(/^_LinguistPro\//,''),to.replace(/^_LinguistPro\//,'')]]));
  const contentPattern = contentPaths.size ? new RegExp([...contentPaths.keys()].sort((a,b) => b.length-a.length).map(value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'), 'g') : null;
  function remap(value) { for (const [from,to] of replacements) if (value === from || value.startsWith(from + '/')) return to + value.slice(from.length); return value; }
  function content(entry) {
    const bytes = readFile(checked(source,entry.path));
    if (sha(bytes) !== entry.sha256 || bytes.length !== entry.bytes) fail('PACKAGE_FILE_CHANGED');
    if (!/\.(md|base|json|tsv)$/.test(entry.path) || !replacements.length) return bytes;
    // One pass: a replacement must never be interpreted as another old path.
    const text = bytes.toString('utf8').replace(contentPattern, value => contentPaths.get(value));
    return Buffer.from(text);
  }
  const entries = [], seen = new Set(), targets = new Set(); let total = 0;
  for (const entry of manifest.files) {
    safeRelative(entry.path);
    if ((entry.path.startsWith('_LinguistPro/Тексты/') || entry.path.startsWith('_LinguistPro/Служебное/')) && !manifest.texts.some(t => entry.path.startsWith(t.text_path + '/') || entry.path.startsWith(t.service_path + '/'))) fail('FILE_OUTSIDE_DECLARED_TEXTS');
    if (entry.path === MANIFEST || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > MAX_FILE) fail('FILE_MANIFEST_INVALID');
    total += entry.bytes; if (total > 2 * 1024 * 1024 * 1024) fail('PACKAGE_TOO_LARGE');
    const target = remap(entry.path), caseKey = target.normalize('NFC').toLowerCase();
    if (seen.has(caseKey)) fail('FILE_PATH_COLLISION'); seen.add(caseKey);
    targets.add(target);
    const bytes = content(entry), nextHash = sha(bytes), currentHash = hashAt(vault,target), prior = state.files[target];
    const action = currentHash === nextHash ? 'unchanged' : !currentHash ? (prior ? 'conflict' : 'create') : prior && prior.sha256 === currentHash ? 'update' : 'conflict';
    entries.push({path:target,entry,sha256:nextHash,currentHash,action});
  }
  for (const [name, prior] of Object.entries(state.files)) {
    if (targets.has(name)) continue;
    const inScope = texts.some(t => name.startsWith(t.text_path + '/') || name.startsWith(t.service_path + '/'));
    if (!inScope) continue;
    const currentHash = hashAt(vault,name);
    entries.push({path:name,sha256:null,currentHash,action:currentHash === prior.sha256 ? 'retire' : 'conflict'});
  }
  const counts = {create:0,update:0,unchanged:0,conflict:0,retire:0}; entries.forEach(e => counts[e.action]++);
  return {source,vault,state,texts:mergedTexts,entries,counts,content};
}
function atomic(root, relative, bytes) {
  const file = checked(root,relative); fs.mkdirSync(path.dirname(file),{recursive:true}); checked(root,relative);
  const temp = file + '.lp-' + crypto.randomUUID() + '.tmp';
  const fd = fs.openSync(temp,'wx');
  try { fs.writeFileSync(fd,bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { checked(root,relative); fs.renameSync(temp,file); }
  catch (error) { if (fs.existsSync(temp)) fs.unlinkSync(temp); throw error; }
}
function withLock(vault, operation) {
  fs.mkdirSync(checked(vault,JOURNALS),{recursive:true});
  const lock = checked(vault,JOURNALS + '/lock');
  const handle = fs.openSync(lock,'wx');
  const owner = JSON.stringify({pid:process.pid,host:os.hostname(),nonce:crypto.randomUUID()});
  try { fs.writeFileSync(handle,owner); fs.fsyncSync(handle); return operation(); }
  finally {
    fs.closeSync(handle);
    if (fs.existsSync(lock) && readFile(checked(vault,JOURNALS + '/lock')).toString() === owner) fs.unlinkSync(lock);
  }
}
function unlockStale(vault) {
  const lock = checked(path.resolve(vault),JOURNALS + '/lock'), bytes = readFile(lock), owner = JSON.parse(bytes.toString());
  if (owner.host !== os.hostname() || !Number.isInteger(owner.pid) || owner.pid <= 0) fail('LOCK_OWNER_UNVERIFIABLE');
  try { process.kill(owner.pid,0); fail('UPDATER_PROCESS_STILL_ALIVE'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  if (!readFile(lock).equals(bytes)) fail('LOCK_CHANGED');
  fs.unlinkSync(lock);
  return {status:'stale-lock-removed'};
}
function apply(plan, options = {}) {
  if (plan.counts.conflict) fail('CONFLICTS_REQUIRE_REVIEW');
  // Recompute under an exclusive local lock; UI must be closed while applying.
  return withLock(plan.vault, () => {
    const fresh = prepare(plan.source,plan.vault);
    if (fresh.counts.conflict) fail('CONFLICTS_REQUIRE_REVIEW');
    const changes = fresh.entries.filter(e => e.action !== 'unchanged');
    const files = {...fresh.state.files};
    for (const entry of fresh.entries) {
      if (entry.action === 'retire') delete files[entry.path];
      else files[entry.path] = {sha256:entry.sha256};
    }
    const nextState = JSON.stringify({schema:'linguistpro-obsidian-installed-v1',texts:fresh.texts,files},null,2);
    const oldState = fs.existsSync(checked(plan.vault,STATE)) ? readFile(checked(plan.vault,STATE)).toString('utf8') : null;
    if (!changes.length && oldState === nextState) return {status:'unchanged',counts:fresh.counts};
    const id = crypto.randomUUID(), base = JOURNALS + '/' + id;
    const journal = {schema:'linguistpro-obsidian-update-journal-v1',id,status:'prepared',operations:[],oldState,
      oldStateHash:oldState == null ? null : sha(oldState),newStateHash:sha(nextState)};
    for (const [i,entry] of changes.entries()) {
      if (entry.currentHash) atomic(plan.vault,base + '/' + i + '.bak',readFile(checked(plan.vault,entry.path)));
      journal.operations.push({path:entry.path,before:entry.currentHash,after:entry.sha256,backup:entry.currentHash ? base + '/' + i + '.bak' : null});
    }
    atomic(plan.vault,base + '/journal.json',JSON.stringify(journal,null,2));
    for (const entry of fresh.entries) {
      if (hashAt(plan.vault,entry.path) !== entry.currentHash) fail('VAULT_CHANGED_DURING_UPDATE');
      if (entry.action === 'retire') { fs.unlinkSync(checked(plan.vault,entry.path)); delete files[entry.path]; }
      else {
        if (entry.action !== 'unchanged') atomic(plan.vault,entry.path,fresh.content(entry.entry));
        files[entry.path] = {sha256:entry.sha256};
      }
      if (typeof options.onStep === 'function') options.onStep(entry.path);
    }
    if (hashAt(plan.vault,STATE) !== journal.oldStateHash) fail('INSTALL_STATE_CHANGED_DURING_UPDATE');
    atomic(plan.vault,STATE,nextState);
    journal.status = 'complete'; atomic(plan.vault,base + '/journal.json',JSON.stringify(journal,null,2));
    return {status:'complete',counts:fresh.counts,backup:base};
  });
}
function recover(vaultRoot, id, execute = false) {
  const vault = path.resolve(vaultRoot);
  if (!/^[a-f0-9-]{36}$/.test(id)) fail('JOURNAL_ID_INVALID');
  const base = JOURNALS + '/' + id;
  function inspect() {
    const journal = readJson(checked(vault,base + '/journal.json'));
    if (journal.schema !== 'linguistpro-obsidian-update-journal-v1' || journal.id !== id || !Array.isArray(journal.operations) || journal.operations.length > 50000 || !['prepared','complete','rolled_back'].includes(journal.status)) fail('JOURNAL_INVALID');
    if (journal.status === 'rolled_back') return {journal,changes:[]};
    if (!/^[a-f0-9]{64}$/.test(journal.newStateHash)) fail('JOURNAL_STATE_INVALID');
    if (journal.oldState !== null) {
      if (typeof journal.oldState !== 'string' || sha(journal.oldState) !== journal.oldStateHash) fail('JOURNAL_STATE_INVALID');
      validateState(JSON.parse(journal.oldState));
    } else if (journal.oldStateHash !== null) fail('JOURNAL_STATE_INVALID');
    const stateHash = hashAt(vault,STATE);
    if (stateHash !== journal.oldStateHash && stateHash !== journal.newStateHash) fail('NEWER_OR_EDITED_INSTALL_STATE');
    const seen = new Set(), changes = [];
    for (const [i,op] of journal.operations.entries()) {
      safeRelative(op.path);
      if (op.path === MANIFEST || seen.has(op.path.toLowerCase())) fail('JOURNAL_PATH_INVALID'); seen.add(op.path.toLowerCase());
      if (![op.before,op.after].every(value => value === null || /^[a-f0-9]{64}$/.test(value))) fail('JOURNAL_HASH_INVALID');
      if (op.before) {
        if (op.backup !== base + '/' + i + '.bak' || hashAt(vault,op.backup) !== op.before) fail('BACKUP_CORRUPT');
      } else if (op.backup !== null) fail('JOURNAL_BACKUP_INVALID');
      const current = hashAt(vault,op.path);
      if (current !== op.before && current !== op.after) fail('RECOVERY_CONFLICT:' + op.path);
      if (current !== op.before) changes.push(op);
    }
    return {journal,changes};
  }
  const preview = inspect();
  if (!execute) return {status:'recovery-preview',id,files:preview.changes.map(op => op.path)};
  return withLock(vault, () => {
    const {journal,changes} = inspect();
    if (journal.status === 'rolled_back') return {status:'already-rolled-back',id};
    for (const op of changes) {
      if (hashAt(vault,op.path) !== op.after) fail('VAULT_CHANGED_DURING_RECOVERY');
      if (op.before) atomic(vault,op.path,readFile(checked(vault,op.backup)));
      else fs.unlinkSync(checked(vault,op.path));
    }
    if (journal.oldState !== null) atomic(vault,STATE,journal.oldState);
    else if (fs.existsSync(checked(vault,STATE))) fs.unlinkSync(checked(vault,STATE));
    journal.status = 'rolled_back'; atomic(vault,base + '/journal.json',JSON.stringify(journal,null,2));
    return {status:'rolled-back',id,restored:changes.length};
  });
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2), value = flag => args[args.indexOf(flag)+1];
    if (!args.includes('--vault') || !value('--vault') || value('--vault').startsWith('--')) fail('VAULT_REQUIRED');
    let result;
    if (args.includes('--unlock-stale')) result = args.includes('--apply') ? unlockStale(value('--vault')) : {status:'unlock-requires-apply'};
    else if (args.includes('--recover')) result = recover(value('--vault'),value('--recover'),args.includes('--apply'));
    else {
      if (!args.includes('--package') || !value('--package') || value('--package').startsWith('--')) fail('Usage: node obsidian-update.cjs --package EXTRACTED_FOLDER --vault EXISTING_VAULT [--apply]');
      const plan = prepare(value('--package'),value('--vault'));
      result = args.includes('--apply') ? apply(plan) : {status:'preview',counts:plan.counts,changes:plan.entries.filter(e => e.action !== 'unchanged').map(e => ({path:e.path,action:e.action}))};
    }
    console.log(JSON.stringify(result,null,2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {prepare,apply,recover,unlockStale,safeRelative,checked,sha};
