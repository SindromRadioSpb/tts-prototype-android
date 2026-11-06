'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'../../../..'),file=path.join(root,'scripts/atlas/corrections/a97001.json');
const cfg=JSON.parse(fs.readFileSync(file,'utf8')),context={};vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'public/js/local-translit-bundle.js'),'utf8'),context);
let n=0;
for(const op of cfg.structure){for(const term of Object.values(op.fields?.terms||{})){
 if(!term||term.source!=='reviewed-a97001-reacceptance'||!term.niqqud)continue;
 if(!term.lemma_he)term.lemma_he=term.niqqud.replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g,'');
 term.translit=context.LocalTranslit.transliterateWithProfile(term.niqqud,'learner-latin');
 term.translit_ru=context.LocalTranslit.transliterateWithProfile(term.niqqud,'ru-phonetic');
 if(term.pronunciation_override){
  const override=term.pronunciation_override;
  if(override.niqqud!==term.niqqud||!override.translit||!override.translit_ru||!override.basis)throw new Error('Invalid reviewed pronunciation override: '+term.lemma_he);
  term.translit=override.translit;term.translit_ru=override.translit_ru;
 }
 n++;
}}
fs.writeFileSync(file,JSON.stringify(cfg,null,2)+'\n');console.log('Prepared pronunciation for',n,'section entries');
