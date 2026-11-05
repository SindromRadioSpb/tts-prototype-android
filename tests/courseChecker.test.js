const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/course-checker.js');
const lesson = require('./fixtures/course/mini/lessons/L001-cafe.json');
const lexicon = require('./fixtures/course/mini/lexicon.json');
const index = C.buildIndex(lexicon.entries);
const task = id => lesson.tasks.find(t => t.id === id);
const more = [
 ['19d','כן','mismatch'], ['19d','כן, תודה','mismatch'],
 ['19d','בלי חלב','accepted'], ['19d','לא, בלי חלב, בבקשה','accepted'],
 ['19d','קטן','mismatch'], ['19d-ok','כן, תודה','accepted'], ['19d-ok','לא','mismatch'],
 ['13','סליחה, עוד פעם?','accepted'], ['13','מה?','accepted'], ['13','לא הבנתי','accepted'],
 ['13','אפשר לחזור?','accepted'], ['13','סליחה, אפשר שוב?','accepted'], ['13','שלום','unknown'],
 ['18b','אפשר קפה במקום תה','accepted'], ['18b','אפשר תה במקום קפה','mismatch'],
 ['18b','קפה תה במקום תה','unknown'], ['18b','קפה במקום תה במקום קפה','unknown'],
 ['13','מה קפה','unknown']
];
for (const [id,input,kind] of more) test(`repair ${id}: ${input}`, () => assert.equal(C.assess(input,task(id),lesson,index).kind,kind));
test('confirm mismatch names slot and rejects other contradictory details', () => {
 assert.match(C.assess('כן',task('19d'),lesson,index).message.ru,/молок/);
 const t=structuredClone(task('19d')); t.spec.card.size='big'; t.spec.claim.size='big';
 assert.equal(C.assess('בלי חלב קטן',t,lesson,index).kind,'mismatch');
});
test('confirm cannot verify claims whose slot domain differs from the card', () => {
 const t=structuredClone(task('19d-ok')); t.spec.claim.drink='coffee';
 assert.equal(C.assess('כן',t,lesson,index).kind,'unknown');
 delete t.spec.claim.drink; t.spec.card.drink='coffee';
 assert.equal(C.assess('כן',t,lesson,index).kind,'unknown');
});
const cases = [
['6','אפשר תה בלי סוכר, בבקשה?','accepted'],
['6','תֵּה בְּלִי סֻכָּר, בְּבַקָּשָׁה','accepted'],
['6','תה בלי סוכר','accepted'],
['6','אפשר תה בלי חלב','partial'],
['6','אפשר תה עם סוכר','mismatch'],
['6','אני רוצה תה בלי סוכר','unknown'],
['6','тэ бли сукар','unknown'],
['6','אפשר תה בלי סוכר — Можно чай без сахара','unknown'],
['6','   ','empty'],
['9','אפשר קפה גדול עם חלב?','accepted'],
['9','אפשר קפה גדולה עם חלב','form'],
['9','אפשר גדול קפה עם חלב','form'],
['9','אפשר קפה עם חלב גדול','form'],
['10a','לשבת פה','accepted'],
['10a','פה','accepted'],
['10a','לקחת','mismatch'],
['6','אפשר\u200F תֵה־בלי סוכר ,, בבקשה','accepted'],
['6','אין תה בלי סוכר','unknown'],
['6','תה קפה בלי סוכר','unknown'],
['6','לא תה בלי סוכר','mismatch']
];
for (const [id,input,kind] of cases) test(`${id}: ${input} -> ${kind}`, () => assert.equal(C.assess(input,task(id),lesson,index).kind,kind));
test('preferFrame and slot labels', () => {
 assert.match(C.assess('תה בלי סוכר',task('6'),lesson,index).detail.ru,/אפשר/);
 assert.match(C.assess('תה עם סוכר',task('6'),lesson,index).message.ru,/с сахаром|без сахара/);
});
test('index preserves all homographs and form gender', () => {
 assert.deepEqual(index.get('פה').map(c=>c.lexId).sort(),['lx.pe-mouth','lx.po-here']);
 assert.equal(index.get('גדולה')[0].gender,'f');
});
test('multiword lexeme is recognized as a whole, not isolated constituent tokens', () => {
 const entry={id:'lx.phrase',he:{niqqud:'בֵּית סֵפֶר',plain:'בית ספר'}};
 const idx=C.buildIndex([...lexicon.entries,entry]);
 const l=structuredClone(lesson); l.introduces.receptive.push(entry.id);
 l.slots.push({id:'place',label:{ru:'место'},values:[{key:'school',label:{ru:'школа'},seq:[entry.id]}]});
 const t={spec:{kind:'short',expect:{place:'school'},require:['place']}};
 assert.equal(C.assess('בית ספר',t,l,idx).kind,'accepted');
 assert.equal(C.assess('בית',t,l,idx).kind,'unknown');
});
test('course preknown can be supplied on index without changing lesson data', () => {
 const idx=C.buildIndex(lexicon.entries); idx.preknown=['lx.ein'];
 assert.deepEqual(C.assess('אין',task('6'),lesson,idx).parsed.unknownTokens,[]);
});
test('prototype-name slot IDs do not read inherited values', () => {
 const l=structuredClone(lesson);
 l.slots=[{id:'constructor',label:{ru:'напиток'},values:[{key:'tea',label:{ru:'чай'},seq:['lx.tea']}]}];
 l.orderRules=[];
 const t={spec:{kind:'short',expect:{constructor:'tea'},require:['constructor']}};
 assert.equal(C.assess('בבקשה',t,l,index).kind,'partial');
 assert.equal(C.assess('תה',t,l,index).kind,'accepted');
});

test('P1-F1: oversized answers are rejected before parsing within 200 ms', () => {
 const { spawnSync } = require('node:child_process');
 const script = `const C=require('./public/js/course-checker.js');
 const l=require('./tests/fixtures/course/mini/lessons/L001-cafe.json');
 const lex=require('./tests/fixtures/course/mini/lexicon.json');
 const idx=C.buildIndex(lex.entries); const start=performance.now();
 const result=C.assess('תה '.repeat(3000),l.tasks.find(t=>t.id==='6'),l,idx);
 console.log(JSON.stringify({result,elapsed:performance.now()-start}));`;
 const run=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8',timeout:2000});
 assert.equal(run.status,0,run.error?.message || run.stderr);
 const {result,elapsed}=JSON.parse(run.stdout);
 assert.equal(result.kind,'unknown');
 assert.equal(result.message.ru,'Ответ слишком длинный для автоматической проверки. Сравните с образцом.');
 assert.deepEqual(result.parsed,{slots:{},negated:{},unknownTokens:[]});
 assert.ok(elapsed<200,`elapsed ${elapsed} ms`);
});
test('P1-F1: 60 words remain eligible and finish within 50 ms', () => {
 const start=performance.now();
 const result=C.assess('תה '.repeat(60),task('6'),lesson,index);
 assert.ok(performance.now()-start<50);
 assert.equal(result.kind,'partial');
 assert.equal(index.maxSeqWords,Math.max(...[...index.keys(),...index.multiword.keys()].map(k=>k.split(' ').length)));
});
test('P1-F2: negated alternative asks for a direct condition', () => {
 const result=C.assess('אפשר תה לא עם סוכר',task('6'),lesson,index);
 assert.equal(result.kind,'unknown');
 assert.match(result.message.ru,/Скажите условие прямо:.*без сахара/);
});

test('P8a: a word-order error shows the authored order-rule message', () => {
  const fs = require('node:fs'), path = require('node:path');
  const C = require('../public/js/course-checker.js');
  const lex = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/course/mini/lexicon.json'), 'utf8'));
  const l = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/course/mini/lessons/L001-cafe.json'), 'utf8'));
  const t = { ...l.tasks[0], spec: { kind: 'order', expect: { drink: 'coffee', size: 'big' }, require: ['drink', 'size'] } };
  const r = C.assess('גדול קפה', t, l, C.buildIndex(lex.entries));
  assert.equal(r.kind, 'form');
  assert.equal(r.message.ru, l.orderRules[0].message.ru);
});
