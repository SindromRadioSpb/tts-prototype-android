'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {buildCourseData}=require('../scripts/course/build-course-data.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('pilot is a separate discoverable text-only corpus while legacy entry stays available',async()=>{
 const registry=await import('data:text/javascript;base64,'+Buffer.from(read('public/js/corpus-registry.js')).toString('base64'));
 const pilot=registry.corpusById('course:ulpan-cafe-b-pilot'),legacy=registry.corpusById('course:ulpan');
 assert.ok(pilot&&legacy);assert.equal(pilot.kind,'course');assert.match(pilot.title.fb,/текстовый пилот/);assert.match(pilot.desc.fb,/Без аудио/);assert.equal(pilot.capabilities.includes('audio'),false);assert.equal(legacy.title.fb,'Курс иврита');
 for(const lang of ['ru','en','he'])assert.match(read('public/i18n/locales/'+lang+'.js'),/course\.pilotCorpus = /);
});

test('production image builds only the separate pilot fallback, without touching persistent legacy data',()=>{
 const docker=read('Dockerfile').replace(/\r\n/g,'\n'),commands=docker.split('\n').filter(line=>line.startsWith('RUN ')&&line.includes('build-course-data.cjs'));
 assert.deepEqual(commands,['RUN node scripts/course/build-course-data.cjs content/course/ulpan-cafe-b-pilot public/data/course']);
 assert.ok(docker.indexOf(commands[0])<docker.indexOf('VOLUME ["/app/data"]'));
 assert.match(read('.dockerignore'),/^public\/data\/course\/$/m);
});

test('fresh image pilot bundle manifest matches every file and has no invented audio',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'course-cafe-b-release-'));
 try{
  const legacy=path.join(out,'ulpan');fs.mkdirSync(legacy);fs.writeFileSync(path.join(legacy,'sentinel'),'unchanged');
  const manifest=buildCourseData(path.join(root,'content/course/ulpan-cafe-b-pilot'),out);
  assert.equal(manifest.courseId,'ulpan-cafe-b-pilot');assert.equal(Object.keys(manifest.files).length,4);
  for(const [file,hash]of Object.entries(manifest.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(out,manifest.courseId,file))).digest('hex'),hash);
  assert.equal(fs.existsSync(path.join(out,manifest.courseId,'audio')),false);assert.equal(fs.readFileSync(path.join(legacy,'sentinel'),'utf8'),'unchanged');
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
