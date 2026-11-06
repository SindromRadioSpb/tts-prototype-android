'use strict';
// Authored senses, deterministic transliteration, occurrences from the immutable extraction.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../../../..');
const context = {}; vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'public/js/local-translit-bundle.js'),'utf8'),context);
const engine = context.LocalTranslit;
const source = fs.readFileSync(path.join(root,'data/atlas/a97001/supplier/source-pack/pages.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const authored = JSON.parse(fs.readFileSync(path.join(__dirname,'terms-authored.json'),'utf8'));
const plain = s => String(s||'').replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g,'').replace(/\s+/g,' ').trim();
const terms = [], missing = [];
for (const [slug, lemma, niqqud, ru, meaning] of authored) {
  const rx = new RegExp('(^|[^א-ת])[ובכלמהש]{0,2}'+lemma+'(?=$|[^א-ת])');
  const occurrences = source.filter(o => o.type === 'block' && rx.test(plain(o.he_raw))).map(o=>({page:o.page,he:plain(o.he_raw)}));
  if (!occurrences.length) { missing.push({slug,lemma}); continue; }
  terms.push({type:'term',id:'a97001:term:'+slug,lemma_he:lemma,niqqud,
    translit:engine.transliterateWithProfile(niqqud,'learner-latin'),
    translit_ru:engine.transliterateWithProfile(niqqud,'ru-phonetic'),
    senses:[{sense:'mechanics',ru,context:meaning}],occurrences});
}
fs.writeFileSync(path.join(__dirname,'terms-compiled.json'),JSON.stringify(terms,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'terms-not-found.json'),JSON.stringify(missing,null,2)+'\n');
console.log(JSON.stringify({terms:terms.length,notFound:missing}));
