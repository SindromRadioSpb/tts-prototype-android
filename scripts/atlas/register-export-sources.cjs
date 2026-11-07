'use strict';
// Local intake only. Copies explicit editorial sources into a NEW private root.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function main(){
 const [id,source,pdf,destination]=process.argv.slice(2);
 if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id||'') || !source || !destination || !pdf || path.basename(pdf)!==pdf || !pdf.endsWith('.pdf'))throw Error('Usage: <atlasId> <source-directory> <pdf-basename> <new-destination>');
 const src=path.resolve(source),dest=path.resolve(destination);
 if(dest===src || dest.startsWith(src+path.sep))throw Error('Destination must be outside source');
 const files={};
 async function walk(dir,prefix=''){
  if((await fs.lstat(dir)).isSymbolicLink())throw Error('Links forbidden');
  for(const e of await fs.readdir(dir,{withFileTypes:true})){
   const n=prefix+e.name;if(e.isSymbolicLink())throw Error('Links forbidden');
   if(e.isDirectory())await walk(path.join(dir,e.name),n+'/');
   else if(e.isFile()){if(n==='manifest.json')throw Error('Source manifest.json is reserved; rename it before intake');const b=await fs.readFile(path.join(dir,e.name));files[n]={sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length};}
  }
 }
 await walk(src);if(!files[pdf])throw Error('PDF missing');
 await fs.mkdir(dest,{recursive:false});
 for(const n of Object.keys(files)){const p=path.join(dest,n);await fs.mkdir(path.dirname(p),{recursive:true});await fs.copyFile(path.join(src,n),p,require('node:fs').constants.COPYFILE_EXCL);const b=await fs.readFile(p);if(crypto.createHash('sha256').update(b).digest('hex')!==files[n].sha256)throw Error('Source changed during intake');}
 // Manifest written last: interrupted intake cannot be offered as a full export.
 await fs.writeFile(path.join(dest,'manifest.json'),JSON.stringify({schema:'linguistpro.atlas-export-sources.1',atlas_id:id,pdf,files},null,2),{flag:'wx'});
 console.log(JSON.stringify({atlas_id:id,files:Object.keys(files).length,pdf_sha256:files[pdf].sha256,destination:dest}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
