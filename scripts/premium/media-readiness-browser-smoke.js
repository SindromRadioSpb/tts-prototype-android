#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..','..'),PORT=Number(process.env.MEDIA_READINESS_BROWSER_PORT||3296),BASE=`http://127.0.0.1:${PORT}`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(){for(let i=0;i<240;i++){try{if((await fetch(BASE+'/healthz')).ok)return;}catch(_){}await sleep(250);}throw new Error('SERVER_NOT_READY');}
async function main(){
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'lp-media-readiness-'));
  const server=spawn(process.execPath,['server.js'],{cwd:ROOT,env:{...process.env,PORT:String(PORT),BIND_HOST:'127.0.0.1',DATA_DIR:data},stdio:['ignore','pipe','pipe']});
  const browser=await chromium.launch(),errors=[],provider=[];
  try{
    await ready();
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:380,height:844},locale:'ru-RU'}),page=await context.newPage();
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('request',request=>{if(/\/api\/(translate|gemini|asr|tts\/synthesize)/.test(request.url()))provider.push(request.url());});
    await page.addInitScript(()=>{localStorage.setItem('localMode','1');localStorage.setItem('v3OnboardingSeenV1','1');localStorage.setItem('onboardingSeen_v1','1');localStorage.setItem('v3.byokOnboardingDismissed','1');localStorage.setItem('v3.byokTourCompleted','1');});
    await page.goto(`${BASE}/index.html?localMode=1&media=${Date.now()}`,{waitUntil:'load'});
    const result=await page.evaluate(async()=>{
      if(window.__localDBInitPromise)await window.__localDBInitPromise;
      window.appSetLocale('ru');
      const H='b'.repeat(64),source='a'.repeat(64);let preparing=false;
      window.LocalAsrClient.getPairingToken=()=> 't'.repeat(64);
      window.LocalAsrClient.Client=function(){return{
        createMediaJob:async()=>({job_id:'media-test',state:'PROBING',progress:.05}),
        waitForMediaJob:async(_id,opts)=>{const job=preparing
          ?{job_id:'media-test',state:'COMPLETE',progress:1,source_sha256:source,output_sha256:H,output_name:'lesson-mobile-ready.mp4',report:{outcome:'READY',target_contract:'linguistpro-mobile-v1',codec_summary:{video_codec:'h264',profile:'Main',declared_level:32,width:1280,height:720,fps:50},duration_seconds:120},verification:{target_contract:true}}
          :{job_id:'media-test',state:'WAITING_FOR_DECISION',progress:.2,source_sha256:source,report:{outcome:'LOSSLESS_REPAIR',target_contract:'linguistpro-mobile-v1',codec_summary:{video_codec:'h264',profile:'Main',declared_level:62,width:1280,height:720,fps:50},duration_seconds:120,estimated_output_bytes:1000000,plan:{mode:'lossless_repair',video_encoder:null,audio_encoder:null},plan_sha256:'c'.repeat(64),next_action:'review-and-confirm-lossless-repair'}};
          opts.onStatus(job);return job;},
        prepareMediaJob:async()=>{preparing=true;return{job_id:'media-test',state:'REPAIRING',progress:.3};},
        mediaFile:async()=>new Blob([new Uint8Array([1,2,3])],{type:'video/mp4'}),
        deleteMediaJob:async()=>({schema:'media-job-delete-receipt-v1',job_id:'media-test',deleted_source:true,deleted_output:true}),
        cancelMediaJob:async()=>({state:'CANCELED'}),
      };};
      window.StudioImport.open();window.StudioImport.switchTab('file');
      const file=new File([new Uint8Array([9,8,7])],'lesson.mp4',{type:'video/mp4'});
      await window.StudioImport.onAudioChosen({target:{files:[file],value:'x'}});
      const before={outcome:document.getElementById('v3ImportMediaBadge').dataset.outcome,asr_disabled:document.getElementById('v3ImportAudioGo').disabled,repair_hidden:document.getElementById('v3ImportMediaPrepare').hidden};
      await window.StudioImport.prepareMedia();
      const panel=document.getElementById('v3ImportMediaReadiness'),modal=document.querySelector('#v3ImportModal .v3-modal-panel');
      const normal={document_overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,panel_overflow:panel.scrollWidth>panel.clientWidth,modal_overflow:modal.scrollWidth>modal.clientWidth};
      document.documentElement.style.fontSize='200%';
      const zoom200={document_overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,panel_overflow:panel.scrollWidth>panel.clientWidth,modal_overflow:modal.scrollWidth>modal.clientWidth};
      document.documentElement.style.fontSize='';window.appSetLocale('he');
      const he={dir:document.documentElement.dir,document_overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,panel_overflow:panel.scrollWidth>panel.clientWidth,modal_overflow:modal.scrollWidth>modal.clientWidth};
      return{before,after:{outcome:document.getElementById('v3ImportMediaBadge').dataset.outcome,label:document.getElementById('v3ImportMediaBadge').textContent.trim(),asr_disabled:document.getElementById('v3ImportAudioGo').disabled,device_hidden:document.getElementById('v3ImportMediaDeviceGate').hidden},normal,zoom200,he,transcript_only_present:!!document.getElementById('v3ImportMediaTranscriptOnly')};
    });
    const expected='d'.repeat(64);
    await page.evaluate(async expectedSha=>{
      window.StudioImport.close();window.appSetLocale('ru');
      const item={material_id:'m-device',text_id:'t-device',package_id:'p-device',binding_track_id:'track-device',portable_scope_id:'scope-device',import_receipt_id:null,title:'Device playback gate',projection_present:true,projection_archived:false,projection_rebuildable:false,caption_raw_present:true,caption_current_revision_id:'c-device',caption_current_sha256:'a'.repeat(64),caption_draft_present:false,table_current_revision_id:'table-device',table_content_sha256:'b'.repeat(64),table_mapping_sha256:'c'.repeat(64),table_bound_caption_revision_id:'c-device',table_bound_caption_revision_sha256:'a'.repeat(64),mapping_total:4,mapping_mapped:4,mapping_invalid:false,media_expected_sha256:expectedSha,media_actual_sha256:expectedSha,media_present:false,media_codec_supported:true,mime:'video/mp4',original_name:'lesson-mobile.mp4',size_bytes:3,import_integrity_state:'native',source_state_sha256:'e'.repeat(64)};
      const fake={lifecycleInventory:async()=>[item],listExportReceipts:async()=>[],mediaForText:async()=>({package_id:'p-device',media_sha256:expectedSha,mime:'video/mp4',original_name:'lesson-mobile.mp4'}),listReceipts:async()=>[],listMaterials:async()=>[item]};
      window.StudioPortableLearningPackage.setRepositoryForTests(fake);
      window.StudioMediaPackage.relinkFile=async()=>({ok:true,media_sha256:expectedSha});
      window.MediaReadiness.exactFileDeviceGate=async(_file,sha)=>({pass:true,device_family:'iPhone/iPad',browser_family:'Safari',os_family:'iOS/iPadOS',tested_at:'2026-08-08T20:00:00.000Z',media_sha256:sha,seek25:30,seek75:90,audio_evidence:'audioTracks'});
      await window.StudioPortableLearningPackage.open({view:'tasks',intent:'relink',textId:'t-device'});
    },expected);
    await page.locator('#p4RelinkInput').setInputFiles({name:'lesson-mobile.mp4',mimeType:'video/mp4',buffer:Buffer.from([1,2,3])});
    await page.locator('[data-device-playback]').waitFor();await page.locator('[data-device-playback]').click();await page.locator('[data-device-pass="iPhone/iPad"]').waitFor();
    const device=await page.evaluate(()=>({label:document.querySelector('[data-device-pass]')?.textContent.trim(),receipt:document.querySelector('#p4TaskStatus')?.textContent.trim(),persisted:localStorage.getItem('mediaDeviceGateReceipt')}));
    if(result.before.outcome!=='LOSSLESS_REPAIR'||!result.before.asr_disabled||result.before.repair_hidden||result.after.outcome!=='READY'||result.after.label!=='Совместимо по контракту iPhone + Android'||result.after.asr_disabled||result.after.device_hidden||Object.values(result.normal).some(Boolean)||Object.values(result.zoom200).some(Boolean)||result.he.dir!=='rtl'||result.he.document_overflow||result.he.panel_overflow||result.he.modal_overflow||!result.transcript_only_present||!device.label.includes('Проверено на этом iPhone/iPad')||!device.receipt.includes('Safari / iOS/iPadOS')||!device.receipt.includes('переход 25%')||device.persisted!==null||errors.length||provider.length)throw new Error('MEDIA_READINESS_BROWSER_GATE:'+JSON.stringify({result,device,errors,provider}));
    console.log(JSON.stringify({gate:'MEDIA_READINESS_380_RU_EXPLICIT_REPAIR_AND_IMPORT_CENTER_DEVICE_FILE',result,device,page_errors:errors.length,provider_requests:provider.length},null,2));
    await context.close();
  }finally{
    await browser.close();server.kill('SIGTERM');await sleep(800);
    if(process.platform==='win32'&&!server.killed)spawnSync('taskkill',['/PID',String(server.pid),'/T','/F'],{stdio:'ignore'});
    fs.rmSync(data,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error&&error.stack||error);process.exitCode=1;});
