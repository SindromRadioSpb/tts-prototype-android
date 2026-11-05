'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const source=fs.readFileSync(path.join(__dirname,'../public/js/library-ui.js'),'utf8');
function block(name,end){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);const stop=source.indexOf(end,start);assert.ok(stop>start);return (source.slice(start-6,start)==='async '?'async ':'')+source.slice(start,stop);}
function env(){
 const {document}=parseHTML('<main id="roomContent"></main>');const mounted=[],states=[],requests=[];
 const ctx=vm.createContext({document,window:{CourseReader:{mount(container,opts){const reader={home(){container.textContent='home';},openLesson(id,step){container.textContent=id+':'+step;},destroy(){container.textContent='';reader.dead=true;}};mounted.push({container,opts,reader});return reader;}},CourseStore:{localStore:(storage,opts)=>opts}},localStorage:{},
 $:id=>document.getElementById(id),el:(tag,opts)=>{const node=document.createElement(tag);node.className=opts?.class||'';return node;},tt:(k,fb)=>fb,corpusSwitcherBar:()=>document.createElement('nav'),readerCfg:{heOn:true,niqqudMode:'full',ruMode:'reveal',translitOn:false},corpusRenderToken:1,roomCourseReader:null,roomCourseAnchor:null,roomCoursePosition:null,roomCourseUserId:null,roomSessionRole:'owner',roomSessionUserId:'u1',roomCommitPresentation:(...args)=>states.push(args),attachCourseWords(){},showState(){},
 roomRefreshSessionRole:()=>new Promise(resolve=>requests.push(resolve))});
 vm.runInContext(block('renderCourseCorpus','function attachCourseWords'),ctx);
 return {ctx,mounted,states,requests,document};
}
test('course dispatch and teardown cover corpus switch and Room exit',()=>{
 assert.match(block('renderCorpus','// The open section'),/startsWith\('course:'\)/);
 assert.match(block('renderCorpus','// The open section'),/destroyCourseReader\(\)/);
 assert.match(source.slice(source.indexOf('const leaveRoom ='),source.indexOf('const leaveRoom =')+800),/destroyCourseReader\(\)/);
});
test('late auth response cannot mount over newer corpus render',async()=>{
 const e=env();const first=e.ctx.renderCourseCorpus('ulpan',1);e.ctx.corpusRenderToken=2;
 const second=e.ctx.renderCourseCorpus('ulpan',2);
 e.requests[1]({user:{id:'u1',role:'owner'}});await second;
 e.requests[0]({user:{id:'u1',role:'owner'}});await first;
 assert.equal(e.mounted.length,1);assert.equal(e.document.querySelector('#roomContent').textContent,'home');
});
test('direct course route denies non-owner and binds owner progress/restoration',async()=>{
 const e=env();let p=e.ctx.renderCourseCorpus('ulpan',1);e.ctx.roomSessionRole='member';e.requests[0]({user:{id:'u2',role:'member'}});await p;assert.equal(e.mounted.length,0);
 e.ctx.roomSessionRole='owner';e.ctx.roomCourseAnchor={lessonId:'L001-cafe',step:3};p=e.ctx.renderCourseCorpus('ulpan',1);e.requests[1]({user:{id:'u1',role:'owner'}});await p;
 assert.equal(e.mounted[0].opts.store.userKey,'u1');assert.match(e.document.querySelector('#roomContent').textContent,/L001-cafe:3/);
 e.mounted[0].opts.onState({lessonId:'L001-cafe',step:3});assert.equal(e.states.at(-1)[0],'replace');
 e.mounted[0].opts.onState({lessonId:'',step:0});assert.equal(e.states.at(-1)[0],'push');
});
test('course word adapter disables occurrence writes and recall, keeps dictionary save',()=>{
 const {document}=parseHTML('<section><div class="course-line" data-ref="L/t"><div data-col="he"><span data-w-offset="0" data-surface="תה"></span></div></div></section>');let opts,saved;
 const ctx=vm.createContext({window:{ReaderMorph:{}},attachReaderMorph:(root,o)=>{opts=o;return {detach(){}};},roomSaveWord:(card,occ)=>{saved=occ;}});
 vm.runInContext(block('attachCourseWords','// The open section'),ctx);
 ctx.attachCourseWords(document.querySelector('section'),{id:'L',scene:{turns:[{id:'t',he:{plain:'תה',niqqud:'תֵּה'},ru:{ru:'чай'}}]}});
 assert.equal(opts.getPlainText(opts.getRowForCell(null,document.querySelector('.course-line'))),'תה');
 const occ=opts.buildOccurrence(document.querySelector('span'));assert.equal(occ.source_kind,'course_line');assert.equal(occ.text_id,null);assert.equal(occ.sentence_id,null);
 opts.saveWord({},occ);assert.equal(saved,null);assert.equal(opts.getDueSchedule,null);assert.equal(opts.gradeReadingTap,null);assert.equal(opts.confirmOccurrenceAnalysis,null);
});

test('changing course identity destroys old reader before returning to hub',()=>{
 const actions=[];
 const ctx=vm.createContext({roomSessionRole:'owner',roomSessionUserId:'u1',roomCourseReader:{destroy(){actions.push('destroy');}},roomCourseAnchor:{lessonId:'old'},roomCoursePosition:{lessonId:'old'},window:{ReaderMorph:{closeSheet(){actions.push('close');}}},corpusNav:{corpus:'course:ulpan'},activeTrack:'corpus',roomRefreshCorpusSwitchers(){},renderCorpus(){},corpusNavToCorpus(id){actions.push(id);ctx.corpusNav={corpus:id};}});
 vm.runInContext(block('destroyCourseReader','async function renderCourseCorpus'),ctx);
 vm.runInContext(block('roomSetSessionRole','async function roomRefreshSessionRole'),ctx);
 ctx.roomSetSessionRole({user:{id:'u2',role:'owner'}});
 assert.deepEqual(actions,['destroy','close','hub']);assert.equal(ctx.roomCourseReader,null);assert.equal(ctx.roomCourseAnchor,null);assert.equal(ctx.roomCoursePosition,null);
});

