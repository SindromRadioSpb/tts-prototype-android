'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const ui=fs.readFileSync(require.resolve('../public/js/library-ui.js'),'utf8');
function fixture(){
 const {window,document}=parseHTML('<html><body></body></html>');
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/reader-morph.js'),'utf8'),{window,document,setTimeout,clearTimeout});
 const section=document.createElement('section');document.body.append(section);
 const items=new Map();
 for(const [tag,id,he,ru] of [['div','block','כוח','сила'],['caption','title','מידות','Величины'],['td','cell','מסה','масса'],['figcaption','caption','כוח',' - сила']]){
  const row=document.createElement(tag);row.className=tag==='div'?'atlas-row':'atlas-learning-row';row.setAttribute('data-ref',id);
  for(const [col,text] of [['he',he],['niqqud',he],['ru',ru],['translit','koakh']]){const el=document.createElement('span');el.setAttribute('data-col',col);el.textContent=text;row.append(el);}
  section.append(row);items.set(id,{he,he_niqqud:he,ru});
 }
 return {window,document,section,ctx:{items}};
}
test('actual atlas attach configuration preserves RU and transliteration for blocks, cells, titles and captions',()=>{
 const f=fixture(),before=[...f.section.querySelectorAll('[data-col="ru"], [data-col="translit"]')].map(el=>[el,el.innerHTML]);
 const start=ui.indexOf('const handle = attachReaderMorph(section, {',ui.indexOf('function attachAtlasWords'));
 assert(start>=0,'find actual atlas attachment');
 const end=ui.indexOf('    buildOccurrence:',start);
 const script=ui.slice(start,end)+'}); handle;';
 const handle=vm.runInNewContext(script,{...f,attachReaderMorph:(mount,opts)=>f.window.ReaderMorph.attach(mount,opts)});
 handle.refresh();
 for(const [el,html] of before){assert.equal(el.innerHTML,html);assert.equal(el.hasAttribute('data-rm-wrapped'),false);}
 assert.equal(f.section.querySelectorAll('[data-col="he"] .rm-w').length,4);
 assert.equal(f.section.querySelectorAll('[data-col="niqqud"] .rm-w').length,4);
 handle.detach();
});
test('ReaderMorph rejects unknown language columns even with an overly broad caller selector',()=>{
 const f=fixture(),ru=[...f.section.querySelectorAll('[data-col="ru"]')].map(el=>[el,el.innerHTML]);
 const handle=f.window.ReaderMorph.attach(f.section,{cellSelector:'[data-col]',rowSelector:'[data-ref]',getRowForCell:(_cell,row)=>f.ctx.items.get(row.getAttribute('data-ref'))});
 for(const [el,html] of ru){assert.equal(el.innerHTML,html);assert.equal(el.hasAttribute('data-rm-wrapped'),false);}
 handle.detach();
});
test('custom vocalized column remains available for the course display without wrapping RU',()=>{
 const f=fixture(),row=f.section.firstElementChild;
 const handle=f.window.ReaderMorph.attach(f.section,{cellSelector:'[data-col]',rowSelector:'[data-ref]',plainColumn:'__course_plain__',vocalizedColumn:'he',getRowForCell:(_cell,tr)=>({...f.ctx.items.get(tr.getAttribute('data-ref')),display:'כּוֹחַ'}),getVocalizedText:item=>item.display});
 assert.equal(row.querySelector('[data-col="he"]').textContent,'כּוֹחַ');
 assert.equal(row.querySelector('[data-col="ru"]').textContent,'сила');
 handle.detach();
});
