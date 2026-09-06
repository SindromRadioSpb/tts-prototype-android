'use strict';
const fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const assert=require('node:assert/strict');
const ZIP=require('../../public/db/jszip.min.js');
const Preview=require('../../public/js/obsidian-lexical-preview.js');
const Updater=require('../../public/tools/obsidian-update.cjs');
const {resolverSet}=require('./export-public-corpus-obsidian.js');

async function main(sourcePath, reportPath) {
  if(fs.existsSync(reportPath))throw new Error('REPORT_EXISTS');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lp-obsidian-corpus-'));
  const source=path.join(temp,'package'),vault=path.join(temp,'vault');
  fs.mkdirSync(source);fs.mkdirSync(vault);
  const zip=await ZIP.loadAsync(fs.readFileSync(sourcePath));
  const publication=JSON.parse(await zip.file('manifest.json').async('string'));
  const publishedTitles=new Map(publication.items.map(item=>['works/'+item.public_work_id+'.json',item.title]));
  const resolvers=resolverSet(),plans=[],audio=new Map();
  for(const name of Object.keys(zip.files).filter(n=>/^works\/[^/]+\.json$/.test(n)).sort()){
    const bundle=JSON.parse(await zip.file(name).async('string'));
    // Same published-title authority as the production PublicCorpusAdapter.
    assert.ok(publishedTitles.has(name));
    bundle.library.texts[0].title=publishedTitles.get(name);
    const report=Preview.analyzeBundle(bundle,{...resolvers,textId:String(bundle.library.texts[0].text_id)});
    const draft=Preview.planObsidianPackage(report),results=[];
    for(const asset of draft.audio_plan.assets){
      if(!audio.has(asset.asset_key)){
        const entry=zip.file('audio/'+asset.asset_key+'.mp3');
        if(entry)audio.set(asset.asset_key,await entry.async('nodebuffer'));
      }
      const bytes=audio.get(asset.asset_key);
      results.push(bytes?{asset_key:asset.asset_key,status:'included',size_bytes:bytes.length}:{asset_key:asset.asset_key,status:'missing',reason:'not-in-source-snapshot'});
    }
    plans.push(Preview.planObsidianPackage(report,{audioResults:results}));
  }
  const merged=Preview.mergeObsidianPlans(plans,{title:'Проверка полного снимка песен'});
  const sealed=await Preview.sealPackage(merged,audio);
  for(const file of sealed.files){const target=path.join(source,Updater.safeRelative(file.path));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,file.content);}
  for(const file of sealed.external_files){const target=path.join(source,Updater.safeRelative(file.path));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,audio.get(file.asset_key));}
  fs.writeFileSync(path.join(vault,'Мои примеры.md'),'Личная заметка — не изменять');
  console.log('Package ready:',sealed.would_create_files,'files;',plans.length,'texts');
  const first=Updater.prepare(source,vault);
  assert.equal(first.counts.conflict,0);
  const installed=Updater.apply(first);
  console.log('Installed:',JSON.stringify(installed.counts));
  const repeated=Updater.apply(Updater.prepare(source,vault));
  assert.equal(repeated.status,'unchanged');
  assert.equal(fs.readFileSync(path.join(vault,'Мои примеры.md'),'utf8'),'Личная заметка — не изменять');
  const paths=new Set(sealed.manifest.files.map(f=>f.path)),broken=[];
  for(const file of sealed.files.filter(f=>f.path.endsWith('.md'))){
    const visible=file.content.replace(/```[\s\S]*?```/g,'').replace(/`[^`\n]*`/g,'');
    for(const match of visible.matchAll(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)){
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(file.path),match[1]));
      if(![target,target+'.md',target+'.base'].some(p=>paths.has(p)))broken.push({file:file.path,target:match[1]});
    }
  }
  assert.deepEqual(broken,[],'filesystem-relative generated link check (not native Obsidian acceptance)');
  const recovery=Updater.recover(vault,path.basename(installed.backup),true);
  assert.equal(recovery.status,'rolled-back');
  for(const file of sealed.manifest.files)assert.equal(fs.existsSync(path.join(vault,file.path)),false);
  assert.equal(fs.readFileSync(path.join(vault,'Мои примеры.md'),'utf8'),'Личная заметка — не изменять');
  const result={schema:'linguistpro-obsidian-package-rehearsal-v1',source_sha256:Updater.sha(fs.readFileSync(sourcePath)),
    texts:plans.length,package_files:sealed.would_create_files,audio_assets:audio.size,install:installed.counts,
    repeated:repeated.status,rollback:recovery.status,personal_note_preserved:true,filesystem_broken_links:broken.length,
    native_obsidian_acceptance:'NOT_RUN',temporary_root:temp};
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  // Kept for isolated native Obsidian validation. No user vault is involved.
}
if(require.main===module){const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];if(!a.includes('--source-zip')||!a.includes('--report'))throw new Error('--source-zip and --report required');main(get('--source-zip'),get('--report')).catch(e=>{console.error(e.stack);process.exitCode=1;});}
