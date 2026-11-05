'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const fixture=path.join(__dirname,'fixtures/course/mini');
const X=()=>require('../scripts/course/export-dots-pack.cjs');
const I=()=>require('../scripts/course/import-dots-pack.cjs');
const L=()=>require('../scripts/course/lesson-to-text.cjs');
function tmp(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'dots-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
// Minimal valid PNG with the given size (IHDR only is enough for header checks).
function png(w,h,pad=0){
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const crc=Buffer.alloc(4);crc.writeUInt32BE(zlib.crc32?zlib.crc32(Buffer.concat([Buffer.from(type),data])):0);return Buffer.concat([len,Buffer.from(type),data,crc]);};
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',Buffer.alloc(pad)),chunk('IEND',Buffer.alloc(0))]);
}
function course(t,edit){
  const src=path.join(tmp(t),'src');fs.cpSync(fixture,src,{recursive:true});
  const file=path.join(src,'lessons/L001-cafe.json'),l=JSON.parse(fs.readFileSync(file,'utf8'));
  const m=(id,target,kind='image')=>({id,kind,target,purpose:{ru:'зачем '+id},brief:{ru:'нарисовать '+id},alt:{ru:'описание '+id},aspect:'4:3',fallback:{ru:{ru:'слова '+id}}});
  l.media=[m('cafe',l.scene.id),m('cups',l.scene.turns[2].id),m('swap',l.tasks[0].id,'sequence')];
  if(edit)edit(l);
  fs.writeFileSync(file,JSON.stringify(l,null,2));
  return {src,lesson:()=>JSON.parse(fs.readFileSync(file,'utf8')),file};
}
function pack(t,c){const out=path.join(tmp(t),'pack');X().exportPack(c.src,'L001-cafe',out,{now:()=>Date.UTC(2026,10,5)});return out;}
const result=(dir,slot,meta={})=>fs.writeFileSync(path.join(dir,'results',slot+'.json'),JSON.stringify({alt:{ru:'alt '+slot},containsText:false,tool:'test',...meta}));

test('lesson text lists every scene line, every model answer and the media slots',()=>{
  const l=JSON.parse(fs.readFileSync(path.join(fixture,'lessons/L001-cafe.json'),'utf8'));
  const md=L().lessonToMarkdown(l);
  for(const turn of l.scene.turns)assert.ok(md.includes(turn.he.niqqud),turn.id);
  for(const task of l.tasks)if(task.model)assert.ok(md.includes(task.model.niqqud),task.id);
});
test('export writes the pack: readme with prohibitions, lesson text, review form, slots with context',t=>{
  const c=course(t),out=pack(t,c);
  for(const f of ['README.dots.ru.md','lesson.ru-he.md','lesson.json','review/form.ru.md','media/pack.json','media/style.ru.md'])assert.ok(fs.existsSync(path.join(out,f)),f);
  assert.ok(fs.statSync(path.join(out,'results')).isDirectory());
  const readme=fs.readFileSync(path.join(out,'README.dots.ru.md'),'utf8');
  assert.match(readme,/текст[а-я]* на иврите|ивритск[а-я]+ текст/i);assert.match(readme,/Marvel/);assert.match(readme,/Лерер/);
  const p=JSON.parse(fs.readFileSync(path.join(out,'media/pack.json'),'utf8'));
  assert.equal(p.format,'course-dots-pack-v1');assert.equal(p.lessonVersion,c.lesson().version);
  const cups=p.slots.find(s=>s.id==='cups');
  assert.equal(cups.context.he,c.lesson().scene.turns[2].he.niqqud);
  assert.equal(cups.maxBytes,400*1024);assert.equal(cups.maxSide,1600);
  assert.deepEqual(p.slots.find(s=>s.id==='swap').frames,{min:2,max:4});
});
test('import rejects a PNG named .webp, an oversized file, a one-frame sequence and missing containsText',t=>{
  const c=course(t),out=pack(t,c),r=path.join(out,'results');
  fs.writeFileSync(path.join(r,'cafe.webp'),png(800,600));result(out,'cafe');
  fs.writeFileSync(path.join(r,'cups.png'),png(800,600,600*1024));result(out,'cups');
  fs.writeFileSync(path.join(r,'swap.1.png'),png(800,600));result(out,'swap');
  const res=I().importPack(out,c.src,{dryRun:true});
  const why=Object.fromEntries(res.rejected.map(x=>[x.id,x.reason]));
  assert.match(why.cafe,/формат не совпадает с содержимым/);
  assert.match(why.cups,/больше/);
  assert.match(why.swap,/кадр/);
  fs.writeFileSync(path.join(r,'cafe.png'),png(800,600));fs.rmSync(path.join(r,'cafe.webp'));result(out,'cafe',{containsText:true});
  assert.match(Object.fromEntries(I().importPack(out,c.src,{dryRun:true}).rejected.map(x=>[x.id,x.reason])).cafe,/текст/);
});
test('import of an image larger than 1600 px on the long side is rejected',t=>{
  const c=course(t),out=pack(t,c);
  fs.writeFileSync(path.join(out,'results','cafe.png'),png(2000,900));result(out,'cafe');
  assert.match(I().importPack(out,c.src,{dryRun:true}).rejected[0].reason,/1600/);
});
test('import writes hashed files, fills empty slots, is idempotent, and dry-run writes nothing',t=>{
  const c=course(t),out=pack(t,c),r=path.join(out,'results');
  fs.writeFileSync(path.join(r,'cafe.png'),png(800,602));result(out,'cafe');
  fs.writeFileSync(path.join(r,'swap.1.png'),png(800,600));fs.writeFileSync(path.join(r,'swap.2.png'),png(800,601));result(out,'swap');
  const dry=I().importPack(out,c.src,{dryRun:true});
  assert.deepEqual(dry.accepted.sort(),['cafe','swap']);
  assert.equal(fs.existsSync(path.join(c.src,'media')),false);
  I().importPack(out,c.src,{});
  const files=fs.readdirSync(path.join(c.src,'media'));
  assert.equal(files.length,3);for(const f of files)assert.match(f,/^[0-9a-f]{16}\.png$/);
  const l=c.lesson();
  assert.match(l.media.find(m=>m.id==='cafe').src,/^[0-9a-f]{16}\.png$/);
  assert.equal(l.media.find(m=>m.id==='swap').frames.length,2);
  assert.equal(l.media.find(m=>m.id==='cafe').alt.ru,'alt cafe');
  I().importPack(out,c.src,{});
  assert.equal(fs.readdirSync(path.join(c.src,'media')).length,3);
  assert.ok(fs.existsSync(path.join(out,'review.html')));
});
test('a slot that already has a Claude version keeps it until the owner chooses dots',t=>{
  const c=course(t,l=>{l.media[0].src='0000000000000000.png';});
  fs.mkdirSync(path.join(c.src,'media'));fs.writeFileSync(path.join(c.src,'media','0000000000000000.png'),png(10,10));
  const out=pack(t,c);
  assert.ok(fs.existsSync(path.join(out,'media/examples/cafe.png')));
  fs.writeFileSync(path.join(out,'results','cafe.png'),png(800,600));result(out,'cafe');
  const res=I().importPack(out,c.src,{});
  assert.deepEqual(res.accepted,['cafe']);
  assert.equal(c.lesson().media[0].src,'0000000000000000.png');
  const html=fs.readFileSync(path.join(out,'review.html'),'utf8');
  assert.match(html,/0000000000000000\.png/);assert.match(html,/data-choice="cafe"/);
  I().importPack(out,c.src,{choice:{cafe:'dots'}});
  assert.notEqual(c.lesson().media[0].src,'0000000000000000.png');
});
test('a pack exported for an older lesson version imports only slots that still match',t=>{
  const c=course(t),out=pack(t,c);
  const l=c.lesson();l.version+=1;l.media[1].id='glasses';fs.writeFileSync(c.file,JSON.stringify(l));
  for(const s of ['cafe','cups']){fs.writeFileSync(path.join(out,'results',s+'.png'),png(800,600));result(out,s);}
  const res=I().importPack(out,c.src,{dryRun:true});
  assert.deepEqual(res.accepted,['cafe']);assert.deepEqual(res.skipped,['cups']);
});
