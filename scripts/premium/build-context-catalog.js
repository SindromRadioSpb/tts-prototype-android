'use strict';
// Catalog-only follow-up to enrich-benyehuda-context.js; preserves all edition keys.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const data = path.resolve('public/data/benyehuda'), task = path.resolve('.tmp/context-ai'), out = path.join(task, 'candidate');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const files = {};
const put = (file, value) => { const b = Buffer.from(JSON.stringify(value)); fs.mkdirSync(path.dirname(path.join(out,file)), {recursive:true}); fs.writeFileSync(path.join(out,file),b); files[file] = {sha256:sha(b),bytes:b.length}; return files[file]; };
const from=11,to=12,root=read(path.join(data,`corpus-catalog-v${from}.json`));
const report=read(path.join(task,'enrichment-report.json'));
const workMap=new Map(report.works.map(w=>[w.work_id,w]));
const index=read(path.join(data,root.index_file));
const release=read(path.join(data,root.release_manifest));
const update = c => {
  c.catalog_version=to;
  const w=workMap.get(String(c.id)); if(!w)return;
  const first=w.parts[0]; c.file=first.file;c.bundle_sha256=first.bundle_sha256;
  c.word_gloss_ai={...first.word_gloss_ai,rows:w.parts.reduce((n,p)=>n+p.layer_rows,0)};
  if(c.toc_file){
    const toc=read(path.join(data,c.toc_file));
    toc.parts=toc.parts.map((p,i)=>({...p,file:w.parts[i].file,bundle_sha256:w.parts[i].bundle_sha256,word_gloss_ai:w.parts[i].word_gloss_ai,word_gloss_ai_rows:w.parts[i].layer_rows}));
    const hash=sha(Buffer.from(JSON.stringify(toc)));c.toc_file=`toc/${c.id}-${hash.slice(0,16)}.json`;c.toc_sha256=hash;put(c.toc_file,toc);
  }
};
index.ready.forEach(update);index.version=to;
const cards=new Map(index.ready.map(c=>[String(c.id),c]));
root.manifests=root.manifests.map(m=>{const d=read(path.join(data,m.file));d.version=to;d.works.forEach(update);const file=m.file.replace(/-v\d+\.json$/,`-v${to}.json`);if(file===m.file)throw Error('Unversioned manifest');put(file,d);return {...m,file};});
root.index_file=`corpus-index-v${to}.json`;put(root.index_file,index);
root.search_file=`corpus-search-v${to}.json`;put(root.search_file,read(path.join(data,`corpus-search-v${from}.json`)));
root.authors_file=`corpus-authors-v${to}.json`;put(root.authors_file,{...read(path.join(data,`corpus-authors-v${from}.json`)),version:to});
for(const stem of ['corpus-fts','corpus-vocab','translit-ru']){
  const d=read(path.join(data,`${stem}-v${from}.json`));d.version=to;
  if(d.catalog_version)d.catalog_version=to;if(d.works_file)d.works_file=root.search_file;
  put(`${stem}-v${to}.json`,d);
}
const previous=new Map(release.works.map(w=>[String(w.work_id),w]));
for(const w of report.works){
  const c=cards.get(w.work_id),first=w.parts[0],old=previous.get(w.work_id)||{};
  previous.set(w.work_id,{...old,work_id:w.work_id,action:'context-enriched',body:first.file,body_sha256:first.bundle_sha256,body_bytes:fs.statSync(path.join(first.added?out:path.join(task,'baseline'),first.file)).size,
    rows:c.segments,edition_text_key:c.text_key,learning_edition_id:c.learning_edition_id,preview:c.preview_file,preview_sha256:c.preview_sha256,
    ...(c.toc_file?{toc:c.toc_file,toc_sha256:c.toc_sha256}:{}),
    parts:w.parts.map(p=>({part_id:p.part_id,body:p.file,body_sha256:p.bundle_sha256,rows:p.rows,word_gloss_ai:p.word_gloss_ai})),word_gloss_ai:first.word_gloss_ai});
}
release.catalog_version=to;release.baseline_catalog_version=from;release.works=[...previous.values()];release.retained_works=release.retained_works.filter(w=>!workMap.has(String(w.work_id)));
release.context_enrichment={schema:report.schema,works:report.works.length,source_layer_rows:report.source_layer_rows,mapped:report.mapped,rekeyed:report.rekeyed,preserved_existing_rows:report.already_present,unmatched:report.unmatched,archives:report.source_archives};
release.assets={...Object.fromEntries(Object.entries(release.assets).filter(([file])=>!/-v11\.json$/.test(file))),...files};
const manifest=put(`learning-release-v${to}.json`,release);root.version=to;root.release_manifest=`learning-release-v${to}.json`;root.release_manifest_sha256=manifest.sha256;root.generated_from='v11 + owner context layers; source rows and edition identities unchanged';put(`corpus-catalog-v${to}.json`,root);
const uploads=[];
for(const w of report.works)for(const p of w.parts){if(p.added)uploads.push({file:p.file,sha256:p.bundle_sha256});if(p.word_gloss_ai)uploads.push({file:p.word_gloss_ai.file,sha256:p.word_gloss_ai.sha256});}
fs.writeFileSync(path.join(task,'upload-allowlist.json'),JSON.stringify(uploads));
fs.writeFileSync(path.join(task,'catalog-allowlist.json'),JSON.stringify(Object.keys(files)));
console.log(JSON.stringify({catalog_version:to,ready:index.ready.length,uploads:uploads.length,catalog_files:Object.keys(files).length,volume_bytes:uploads.reduce((n,p)=>n+fs.statSync(path.join(out,p.file)).size,0)}));
