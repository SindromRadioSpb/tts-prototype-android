'use strict';
// Seal local artifacts; upload is a separate, explicitly reviewed operation.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib');
const {buildAuthorNodes,validateAuthorNodes}=require('../../db/premium/authorNodes');
const dir=path.resolve(process.argv[2]||'.tmp/learning-release'),out=path.join(dir,'candidate');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x));
const root=read(path.join(out,'corpus-catalog-v8.json')),index=read(path.join(out,root.index_file));
for (const card of index.ready) card.catalog_version = 8;
write(path.join(out, root.index_file), index);
for (const item of root.manifests) {
  const file = path.join(out, item.file), manifest = read(file);
  for (const card of manifest.works) card.catalog_version = 8;
  write(file, manifest);
}
const eraMap=read(path.join(__dirname,'../../public/data/benyehuda/author-era-map-v1.json'));
const authors=buildAuthorNodes(index.authors,eraMap),valid=validateAuthorNodes(authors,index.authors);
if(!valid.ok)throw Error(valid.errors.join('; '));
write(path.join(out,'corpus-authors-v8.json'),{schema:1,version:8,generated_from:'verified-v8 index (authorNodes.js)',count:authors.length,authors});
const manifest=read(path.join(out,'learning-release-v8.json'));
const files=[root.index_file,root.search_file,root.authors_file,'corpus-fts-v8.json','corpus-vocab-v8.json','translit-ru-v8.json',...root.manifests.map(x=>x.file)];
const fts=read(path.join(out,'corpus-fts-v8.json'));
const shards=[...new Set([...Object.values(fts.bucket_files).flat(),...fts.lemma_files,fts.lemmamap_file])];
manifest.assets={};
for(const file of [...files,...shards]){const bytes=fs.readFileSync(path.join(out,file));manifest.assets[file]={bytes:bytes.length,sha256:sha(bytes)};}
for(const work of manifest.works){for(const [file,hash]of [[work.body,work.body_sha256],[work.preview,work.preview_sha256]]){if(sha(fs.readFileSync(path.join(out,file)))!==hash)throw Error('Work hash mismatch '+work.work_id);}}
write(path.join(out,'learning-release-v8.json'),manifest);
root.release_manifest_sha256=sha(fs.readFileSync(path.join(out,'learning-release-v8.json')));
write(path.join(out,'corpus-catalog-v8.json'),root);
const uploads=[...manifest.works.flatMap(x=>[x.body,x.preview]),...shards];
const stats={upload_files:uploads.length,body_and_preview_files:manifest.works.length*2,fts_shards:shards.length,volume_bytes:0,gzip_transport_bytes:0,largest_file_bytes:0,manifest_sha256:root.release_manifest_sha256,root_sha256:sha(fs.readFileSync(path.join(out,'corpus-catalog-v8.json'))),immutable_files:uploads.map(file=>({file,sha256:sha(fs.readFileSync(path.join(out,file))),bytes:fs.statSync(path.join(out,file)).size}))};
for(const file of uploads){const bytes=fs.readFileSync(path.join(out,file));stats.volume_bytes+=bytes.length;stats.gzip_transport_bytes+=zlib.gzipSync(bytes).length;stats.largest_file_bytes=Math.max(stats.largest_file_bytes,bytes.length);}
write(path.join(dir,'release-seal.json'),stats);
const publicDir=path.join(__dirname,'../../public/data/benyehuda');
for(const file of ['corpus-catalog-v8.json','learning-release-v8.json',...files,...shards,...manifest.works.flatMap(x=>[x.body,x.preview]),...manifest.retained_works.map(x=>x.body),...manifest.works.filter(x=>x.old_body).map(x=>x.old_body)]){
  const destination=path.join(publicDir,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(out,file),destination);
}
console.log(JSON.stringify({...stats,immutable_files:undefined}));
