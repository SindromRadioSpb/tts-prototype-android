const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../public/js/course-format.js');
const load = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/course/mini', n), 'utf8'));
const lex = load('lexicon.json');
const idx = new Map(lex.entries.flatMap(e => [[e.id,e], ...(e.forms || []).map(f => [f.id,f])]));
test('transfer variants require unique IDs and valid authored replacement',()=>{
 const l=load('lessons/L001-cafe.json'),t=l.tasks.find(x=>x.transfer);
 t.variants=[{id:'new',prompt:{ru:'Иная ситуация'},spec:structuredClone(t.spec),model:structuredClone(t.model)}];
 assert.deepEqual(F.validateLesson(l,idx).filter(i=>i.level==='error'),[]);
 t.variants.push({...t.variants[0]});
 assert.ok(F.validateLesson(l,idx).some(i=>i.code==='ID_DUP'&&i.path.includes('variants')));
 t.variants.pop();t.variants[0].prompt={};
 assert.ok(F.validateLesson(l,idx).some(i=>i.path.endsWith('variants[0].prompt')));
});
test('fixture lexicon and lessons are valid', () => {
 assert.deepEqual(F.validateLexicon(lex).filter(i=>i.level==='error'), []);
 for(const id of ['L001-cafe','L002-cafe-again']) assert.deepEqual(F.validateLesson(load('lessons/'+id+'.json'),idx).filter(i=>i.level==='error'),[]);
});
test('duplicate turn and task IDs are rejected',()=>{for(const field of ['turns','tasks']){const l=load('lessons/L001-cafe.json');const a=field==='turns'?l.scene.turns:l.tasks;a.push({...a[0]});assert.ok(F.validateLesson(l,idx).some(i=>i.code==='ID_DUP' && i.path.includes(field)));}});
test('invalid Hebrew pair and marked plain rejected',()=>{const l=load('lessons/L001-cafe.json');l.scene.turns[0].he={niqqud:'סֻכָּר',plain:'סוגר'};l.scene.turns[1].he={niqqud:'שָׁלוֹם',plain:'שָׁלוֹם'};const codes=F.validateLesson(l,idx).map(i=>i.code);assert.ok(codes.includes('HE_SKELETON_MISMATCH'));assert.ok(codes.includes('HE_PLAIN_HAS_MARKS'));});
test('missing half and unknown reference rejected',()=>{const l=load('lessons/L001-cafe.json');l.scene.turns[0].he={niqqud:'שָׁלוֹם'};l.introduces.active.push('lx.nope');const codes=F.validateLesson(l,idx).map(i=>i.code);assert.ok(codes.includes('HE_PAIR_MISSING'));assert.ok(codes.includes('REF_UNKNOWN'));});
test('lexicon forms share ID namespace',()=>{const x=structuredClone(lex);x.entries[0].forms=[{id:x.entries[1].id,he:x.entries[0].he,tags:[]}];assert.ok(F.validateLexicon(x).some(i=>i.code==='ID_DUP'));});
test('malformed documents yield issues rather than throw',()=>{for(const x of [null,{},[],{entries:[null]}])assert.ok(F.validateLexicon(x).some(i=>i.level==='error'));for(const x of [null,{},[],{format:'course-lesson-v1',scene:null}])assert.ok(F.validateLesson(x,idx).some(i=>i.level==='error'));});
test('unknown task type, bad IDs and bare niqqud diagnosed',()=>{const l=load('lessons/L001-cafe.json');l.tasks[0].type='bogus';l.tasks[0].id='bad id';l.scene.turns[0].he={niqqud:'שלום',plain:'שלום'};const codes=F.validateLesson(l,idx).map(i=>i.code);for(const c of ['TASK_TYPE_UNKNOWN','ID_BAD','HE_NIQQUD_BARE'])assert.ok(codes.includes(c));});

test('role, next, slot and spec references are checked', () => {
 const l=load('lessons/L001-cafe.json');
 l.scene.turns[0].role='missing-role'; l.scene.turns[0].next='missing-turn';
 l.slots[0].values[0].seq=['lx.missing']; l.tasks[0].spec.expect={missing:'value'};
 const issues=F.validateLesson(l,idx);
 for(const suffix of ['.role','.next','.seq[0]','.expect.missing']) assert.ok(issues.some(i=>i.code==='REF_UNKNOWN' && i.path.endsWith(suffix)),suffix);
});

test('spec kinds require their structural fields', () => {
 for (const [kind,fields] of Object.entries({order:['expect','require'],short:['expect','require'],confirm:['card','claim'],replacement:['next','prev','via']})) {
  const l=load('lessons/L001-cafe.json'); l.tasks[0].spec={kind};
  const issues=F.validateLesson(l,idx);
  for(const field of fields) assert.ok(issues.some(i=>i.code==='FORMAT' && i.path==='tasks[0].spec.'+field),kind+': '+field);
 }
 const l=load('lessons/L001-cafe.json');l.tasks[0].spec={kind:'repeat'};
 assert.deepEqual(F.validateLesson(l,idx).filter(i=>i.level==='error'),[]);
});

test('prototype names are invalid spec kinds without throwing', () => {
 for(const kind of ['constructor','toString','__proto__']) {
  const l=load('lessons/L001-cafe.json');l.tasks[0].spec={kind};
  assert.ok(F.validateLesson(l,idx).some(i=>i.code==='FORMAT' && i.path==='tasks[0].spec.kind'));
 }
});

test('audio references in malformed scenes report issues without throwing', () => {
 for (const turns of [{}, [null], [42], [null,{id:'a1-01'}]]) {
  const l=load('lessons/L001-cafe.json');l.scene.turns=turns;l.tasks[0].audioTurnId='missing';
  let issues;assert.doesNotThrow(()=>{issues=F.validateLesson(l,idx);});
  assert.ok(issues.some(i=>i.code==='FORMAT'&&i.path.startsWith('scene.turns')));
  assert.ok(issues.some(i=>i.code==='REF_UNKNOWN'&&i.path==='tasks[0].audioTurnId'));
 }
});

test('turn and paragraph IDs share the spoken namespace while task IDs remain separate', () => {
 const l = load('lessons/L001-cafe.json');
 const turn = l.scene.turns[0];
 l.text = { id: 'reading', paras: [{ id: turn.id, he: turn.he, ru: turn.ru }] };
 const issues = F.validateLesson(l, idx).filter(i => i.level === 'error');
 assert.deepEqual(issues.map(i => [i.code, i.path]), [['ID_DUP', 'text.paras[0].id']]);
 l.text.paras[0].id = 'paragraph-1';
 l.tasks[0].id = turn.id;
 assert.deepEqual(F.validateLesson(l, idx).filter(i => i.level === 'error'), []);
 l.tasks[0].audioTurnId = 'paragraph-1';
 assert.ok(F.validateLesson(l, idx).some(i => i.code === 'REF_UNKNOWN' && i.path === 'tasks[0].audioTurnId'));
});

// --- P8a extensions ---
const E8 = require('../public/js/course-evidence.js');
const codes8 = l => F.validateLesson(l, idx).map(i => i.code);
const learnerScene = () => {
 const l = load('lessons/L001-cafe.json');
 l.scene.roles.push({ id: 'learner', voice: 'he-IL-Wavenet-C' });
 const t = l.scene.turns;
 for (let i = 0; i < t.length - 1; i++) t[i].next = t[i + 1].id;
 return l;
};
test('P8a: flow steps must reference existing tasks and grammar', () => {
 const l = load('lessons/L001-cafe.json');
 l.flow = [{ id: 'p1', title: { ru: 'Часть 1' }, steps: [{ kind: 'scene', mode: 'listen' }, { kind: 'task', ref: l.tasks[0].id }, { kind: 'summary' }] }];
 assert.deepEqual(F.validateLesson(l, idx).filter(i => i.level === 'error'), []);
 l.flow[0].steps.push({ kind: 'task', ref: 'nope' });
 assert.ok(codes8(l).includes('FLOW_REF_UNKNOWN'));
 l.flow[0].steps[3] = { kind: 'grammar', ref: 'nope' };
 assert.ok(codes8(l).includes('FLOW_REF_UNKNOWN'));
 l.flow[0].steps[3] = { kind: 'bogus' };
 assert.ok(codes8(l).includes('FORMAT'));
});
test('P8a: scene choices are checked for next, reachability and cycles', () => {
 const l = learnerScene(), t = l.scene.turns;
 assert.deepEqual(F.validateLesson(l, idx).filter(i => i.level === 'error'), []);
 const last = t[t.length - 1];
 const extra = { id: 'x-repair', role: t[0].role, he: t[0].he, ru: { ru: 'Ещё раз?' } };
 t.push(extra);
 assert.ok(codes8(l).includes('SCENE_UNREACHABLE'));
 t[1].role = 'learner'; delete t[1].next;
 t[1].choices = [{ id: 'ok', he: t[1].he, ru: { ru: 'да' }, next: t[2].id, verdict: 'ok' }, { id: 'rp', he: t[1].he, ru: { ru: 'что?' }, next: 'x-repair', verdict: 'repair' }];
 extra.next = t[2].id;
 assert.deepEqual(F.validateLesson(l, idx).filter(i => i.level === 'error'), []);
 t[1].choices[1].next = 'missing';
 assert.ok(codes8(l).includes('SCENE_NEXT_UNKNOWN'));
 t[1].choices[1].next = 'x-repair';
 last.next = t[0].id;
 assert.ok(codes8(l).includes('SCENE_CYCLE'));
});
test('P8a: media need a fallback; grammar slots stay inside the line; skills reference tasks', () => {
 const l = load('lessons/L001-cafe.json');
 l.media = [{ id: 'm1', kind: 'image', target: l.tasks[0].id, purpose: { ru: 'заказ' }, brief: { ru: 'бриф' }, alt: { ru: 'алт' }, aspect: '4:3' }];
 assert.ok(codes8(l).includes('MEDIA_FALLBACK_MISSING'));
 l.media[0].fallback = { ru: { ru: 'Большой чай' }, icons: ['cup-large'] };
 assert.deepEqual(F.validateLesson(l, idx).filter(i => i.level === 'error'), []);
 l.media[0].kind = 'sequence';
 assert.deepEqual(F.validateLesson(l, idx).filter(i => i.level === 'error'), [], 'empty slot is valid until filled');
 l.media[0].frames = ['a.png'];
 assert.ok(codes8(l).includes('FORMAT'), 'a filled sequence needs at least 2 frames');
 l.media[0].kind = 'image'; delete l.media[0].frames;
 l.grammar = { g1: { title: { ru: 'Т' }, body: { ru: 'Б' }, line: { he: { niqqud: 'קָפֶה גָּדוֹל', plain: 'קפה גדול' }, slots: [{ from: 0, to: 0, label: { ru: 'что' } }, { from: 1, to: 1, label: { ru: 'какой' } }] } } };
 assert.deepEqual(F.validateLesson(l, idx).filter(i => i.level === 'error'), []);
 l.grammar.g1.line.slots[1].to = 2;
 assert.ok(codes8(l).includes('GRAMMAR_SLOT_RANGE'));
 l.grammar.g1.line.slots[1].to = 1;
 l.skills = [{ id: 'order', label: { ru: 'Заказать' }, tasks: ['nope'] }];
 assert.ok(codes8(l).includes('SKILL_TASK_UNKNOWN'));
});
test('P8a: tiles and order task types are known and validated', () => {
 const l = load('lessons/L001-cafe.json');
 const base = l.tasks[0];
 l.tasks.push({ ...structuredClone(base), id: 'tl', type: 'tiles', tiles: [base.model], distractors: [] });
 l.tasks.push({ ...structuredClone(base), id: 'or', type: 'order', card: structuredClone(base.spec.expect) });
 assert.deepEqual(F.validateLesson(l, idx).filter(i => i.level === 'error'), []);
 l.tasks[l.tasks.length - 2].tiles = [];
 assert.ok(codes8(l).includes('FORMAT'));
 l.tasks[l.tasks.length - 2].tiles = [base.model];
 l.tasks[l.tasks.length - 1].cardMedia = 'nope';
 assert.ok(codes8(l).includes('REF_UNKNOWN'));
});
test('P8a: match pairs may use media instead of a label', () => {
 const l = load('lessons/L001-cafe.json');
 l.media = [{ id: 'tea', kind: 'image', target: l.scene.id, purpose: { ru: 'п' }, brief: { ru: 'б' }, alt: { ru: 'чай' }, aspect: '1:1', fallback: { ru: { ru: 'чай' } } }];
 l.tasks[0].pairs = [{ id: 'p1', he: l.tasks[0].model, media: 'tea' }];
 assert.ok(!codes8(l).some(c => c === 'FORMAT'));
 l.tasks[0].pairs[0].media = 'missing';
 assert.ok(codes8(l).includes('REF_UNKNOWN'));
});
test('P8a: fingerprints of tasks without new fields are unchanged', () => {
 const l = load('lessons/L001-cafe.json');
 const pinned = { '6': '187185cf', '9': '3fee8117', '10a': 'bfef9dc0', '13': 'e70c3301', '18b': '3c17690e', '19d': '2618960a', '19d-ok': 'a17d5663' };
 for (const t of l.tasks) assert.equal(E8.fingerprint(l.id, t), pinned[t.id], t.id);
 const t = structuredClone(l.tasks[0]); t.tiles = [t.model];
 assert.notEqual(E8.fingerprint(l.id, t), pinned[t.id]);
});
test('P8a: a text paragraph role must be a scene role', () => {
 const l = load('lessons/L001-cafe.json');
 l.text = { id: 'tx', paras: [{ id: 'p1', role: l.scene.roles[0].id, he: l.scene.turns[0].he, ru: { ru: 'x' } }] };
 assert.deepEqual(F.validateLesson(l, idx).filter(i => i.level === 'error'), []);
 l.text.paras[0].role = 'nobody';
 assert.ok(F.validateLesson(l, idx).some(i => i.code === 'REF_UNKNOWN' && i.path === 'text.paras[0].role'));
});

test('task, variant and step lexical scopes validate shape, duplicates and references',()=>{
 for(const location of ['task','variant','step']){
  const l=load('lessons/L001-cafe.json'),t=l.tasks[0];
  t.variants=[{id:'v',prompt:t.prompt,spec:t.spec}];
  l.flow=[{id:'part',title:{ru:'Часть'},steps:[{kind:'task',ref:t.id}]}];
  const obj=location==='task'?t:location==='variant'?t.variants[0]:l.flow[0].steps[0];
  const field=location==='step'?'metLexIds':'evidenceLexIds';
  for(const valid of [[],[...idx.keys()].slice(0,2)]){
   obj[field]=valid;assert.deepEqual(F.validateLesson(l,idx).filter(i=>i.level==='error'),[]);
  }
  for(const [value,code] of [[null,'FORMAT'],['tea','FORMAT'],[[12],'ID_BAD'],[['missing'],'REF_UNKNOWN'],[[...idx.keys()].slice(0,1).flatMap(x=>[x,x]),'ID_DUP']]){
   obj[field]=value;assert.ok(F.validateLesson(l,idx).some(i=>i.code===code&&i.path.includes(field)),location+': '+code);
  }
 }
});
