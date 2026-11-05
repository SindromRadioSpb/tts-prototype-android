const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {checkGraph}=require('../scripts/course/course-graph.cjs');
const base=path.join(__dirname,'fixtures/course/mini');
const load=()=>{const read=n=>JSON.parse(fs.readFileSync(path.join(base,n),'utf8'));const course=read('course.json');return {course,lexicon:read('lexicon.json'),lessons:course.lessons.map(id=>read('lessons/'+id+'.json'))};};
test('mini has no errors and pending reappearance',()=>{const x=checkGraph(load());assert.deepEqual(x.filter(i=>i.level==='error'),[]);assert.ok(x.some(i=>i.code==='REAPPEAR_PENDING'));});
test('missing transfer diagnosed',()=>{const c=load();c.lessons[1].tasks.forEach(t=>delete t.transfer);assert.ok(checkGraph(c).some(i=>i.code==='NO_TRANSFER'&&i.lessonId==='L002-cafe-again'));});
test('model and answers cannot use future vocabulary',()=>{for(const field of ['model','answers']){const c=load(),he={niqqud:'אֵין חָלָב',plain:'אין חלב'};c.lessons[0].tasks[0][field]=field==='model'?he:[he];assert.ok(checkGraph(c).some(i=>i.code==='REQUIRES_UNMET'&&i.lessonId==='L001-cafe'));}});
test('new text density warns; unknown text fails',()=>{const c=load();c.lessons[1].scene.turns[0].he={niqqud:'קָפֶה',plain:'קפה'};c.lessons[1].tasks.forEach(t=>{delete t.model;delete t.cue;});assert.ok(checkGraph(c).some(i=>i.code==='TEXT_DENSITY'));c.lessons[1].text.paras[0].he={niqqud:'זררר',plain:'זררר'};assert.ok(checkGraph(c).some(i=>i.code==='TEXT_UNKNOWN_TOKEN'));});
test('three subsequent lessons trigger low or satisfied reappearance',()=>{const c=load();c.lessons.push(...[3,4].map(n=>({...structuredClone(c.lessons[1]),id:'L00'+n})));c.course.lessons=c.lessons.map(l=>l.id);assert.ok(checkGraph(c).some(i=>i.code==='REAPPEAR_LOW'));assert.ok(!checkGraph(c).some(i=>i.code==='REAPPEAR_LOW'&&i.path==='introduces.active.lx.chalav'));});
test('preknown permits otherwise unmet IDs',()=>{const c=load();c.lessons[0].frame.push('lx.ein');c.course.preknown.push('lx.ein');assert.ok(!checkGraph(c).some(i=>i.code==='REQUIRES_UNMET'));});

test('multiword lexical units and homographs retain learned candidates',()=>{
 const c=load();
 c.lexicon.entries.push({id:'lx.phrase',pos:'phrase',he:{niqqud:'דָּבָר אַחֵר',plain:'דבר אחר'},translit_ru:'',gloss:{ru:'другое'}});
 c.course.preknown.push('lx.phrase');
 c.lessons[0].tasks[0].model={niqqud:'דָּבָר אַחֵר פֹּה',plain:'דבר אחר פה'};
 assert.ok(!checkGraph(c).some(i=>i.code==='REQUIRES_UNMET'));
 c.course.preknown=[];
 assert.ok(checkGraph(c).some(i=>i.code==='REQUIRES_UNMET'));
});

test('P8a: text words already met in the same lesson scene or tasks are not counted as new',()=>{
 const c=load(),l=c.lessons[0];
 l.text={id:'tx',paras:[{id:'p1',he:structuredClone(l.scene.turns[0].he),ru:{ru:'тот же'}}]};
 assert.ok(!checkGraph(c).some(i=>i.code==='TEXT_DENSITY'&&i.lessonId===l.id));
});

test('P8a: character names do not count as new words in the text',()=>{
 const c=load(),l=c.lessons[0];
 c.lexicon.entries.push({id:'lx.tamar',pos:'name',he:{niqqud:'תָּמָר',plain:'תמר'},translit_ru:'Тамар',gloss:{ru:'Тамар'}});
 l.introduces.receptive.push('lx.tamar');
 l.text={id:'tx',paras:[{id:'p1',he:{niqqud:l.scene.turns[0].he.niqqud+' תָּמָר',plain:l.scene.turns[0].he.plain+' תמר'},ru:{ru:'с именем'}}]};
 assert.ok(!checkGraph(c).some(i=>i.code==='TEXT_DENSITY'&&i.lessonId===l.id));
});
