'use strict';
// Sequential anonymous production reads. Disposable browser profiles; no remote writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const BASE='https://linguistpro.kolosei.com';
const arg=name=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3);
const VERSION=arg('version'),ROUNDS=Number(arg('rounds')||4),OUT=path.resolve(arg('out')||'.tmp/production-performance.json');
const DIAGNOSTICS=process.argv.includes('--diagnostics');
const normal=x=>String(x||'').replace(/\s+/g,' ').trim();
async function main(){
  assert.ok(VERSION,'--version required');
  const checkVersion=async()=>assert.equal((await(await fetch(BASE+'/api/client-config?perf='+Date.now())).json()).version,VERSION);
  await checkVersion();const browser=await chromium.launch({headless:true}),results=[],errors=[];
  try{
    for(let i=0;i<ROUNDS;i++){
      const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:850}});
      await context.route('**/*',route=>route.request().url().startsWith(BASE)&&['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
      await context.addInitScript(()=>{if(location.protocol==='https:'){localStorage.setItem('app.locale','ru');localStorage.setItem('onboardingSeen_v1','1');localStorage.setItem('phase6Decision_v1','declined');}});
      if(DIAGNOSTICS)await context.addInitScript(()=>{
        window.__lpPerfDiag={rpcCount:0,rpcByType:{},slowRpc:[],transactions:[],longTasks:[]};
        new PerformanceObserver(list=>{for(const e of list.getEntries())__lpPerfDiag.longTasks.push({startMs:e.startTime,durationMs:e.duration});}).observe({type:'longtask',buffered:true});
        const original=Worker.prototype.postMessage,workers=new WeakMap();
        Worker.prototype.postMessage=function(message,...rest){
          let state=workers.get(this);
          if(!state){state={pending:new Map(),begin:null};workers.set(this,state);this.addEventListener('message',e=>{
            const item=state.pending.get(e.data.id);if(!item)return;state.pending.delete(e.data.id);
            const end=performance.now(),duration=end-item.start;
            if(duration>=30)__lpPerfDiag.slowRpc.push({type:item.type,startMs:item.start,durationMs:duration});
            if(item.type==='BEGIN')state.begin=item.start;
            if(item.type==='COMMIT'&&state.begin!==null){__lpPerfDiag.transactions.push({startMs:state.begin,durationMs:end-state.begin});state.begin=null;}
          });}
          if(message?.id!=null){const type=message.sql?.trim().match(/^\w+/)?.[0]?.toUpperCase()||message.type||'other';state.pending.set(message.id,{type,start:performance.now()});__lpPerfDiag.rpcCount++;__lpPerfDiag.rpcByType[type]=(__lpPerfDiag.rpcByType[type]||0)+1;}
          return original.call(this,message,...rest);
        };
      });
      context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
      const catalog=await context.newPage();const start=performance.now();
      await catalog.goto(BASE+'/mediatheque.html',{waitUntil:'domcontentloaded'});
      await catalog.locator('a[href*="public_work="]').first().waitFor({timeout:60000});
      const catalogMs=performance.now()-start;
      const hrefs=await catalog.locator('a[href*="public_work="]').evaluateAll(nodes=>[...new Set(nodes.filter(x=>x.getClientRects().length).map(x=>x.getAttribute('href')))].slice(0,2));
      assert.equal(hrefs.length,2);const materials=[];
      for(const href of hrefs){
        const url=new URL(href,BASE),slug=url.searchParams.get('public_corpus'),work=url.searchParams.get('public_work'),snapshot=url.searchParams.get('public_snapshot');
        const room=await context.newPage(),start=performance.now();
        await room.goto(url.href,{waitUntil:'domcontentloaded'});
        await room.locator('#roomReaderTable tbody tr').first().waitFor({timeout:60000});
        const readerMs=performance.now()-start;
        const diagnostic=DIAGNOSTICS?await room.evaluate(()=>({atMs:performance.now(),rows:document.querySelectorAll('#roomReaderTable tbody tr').length,...__lpPerfDiag,
          resources:performance.getEntriesByType('resource').filter(e=>e.name.startsWith(location.origin)).map(e=>({path:new URL(e.name).pathname,startMs:e.startTime,durationMs:e.duration,ttfbMs:e.responseStart-e.requestStart,downloadMs:e.responseEnd-e.responseStart,transferSize:e.transferSize,decodedBodySize:e.decodedBodySize})).sort((a,b)=>b.durationMs-a.durationMs).slice(0,30)})):undefined;
        // Fetch independent snapshot AFTER timing, avoiding pre-warming the measured request.
        const payload=await(await fetch(`${BASE}/api/public-corpora/${encodeURIComponent(slug)}/works/${encodeURIComponent(work)}?snapshot=${snapshot}`)).json();
        assert.equal(payload.item.snapshot_sha256,snapshot);
        const source=payload.item.snapshot.library.texts[0],row=(source.rows||source.sentences)[0];
        const rendered=normal(await room.locator('#roomReaderTable tbody tr').first().textContent());
        assert.equal(normal(await room.locator('#readerTitle').textContent()),normal(payload.item.title));
        assert.ok(rendered.includes(normal(row.hebrew_plain||row.he_plain)));
        const ru=normal(row.russian||row.ru);if(ru)assert.ok(rendered.includes(ru));
        assert.equal(new URL(room.url()).searchParams.get('public_work'),work);
        materials.push({slug,work,snapshot,readerMs,contentVerified:true,...(diagnostic?{diagnostic}:{})});await room.close();
      }
      results.push({round:i+1,catalogMs,materials});await context.close();console.log(`PASS production round ${i+1}/${ROUNDS}`);
    }
    await checkVersion();assert.deepEqual(errors,[]);
    const stats=values=>{const s=[...values].sort((a,b)=>a-b);return{n:s.length,medianMs:(s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2,minMs:s[0],maxMs:s.at(-1),samplesMs:values};};
    const report={status:'PASS',version:VERSION,at:new Date().toISOString(),chromium:browser.version(),diagnostics:DIAGNOSTICS,
      conditions:{anonymous:true,disposableProfiles:true,serviceWorkers:false,httpCache:false,remoteWrites:false,providers:false,ownerData:false,deviceEvidence:false,serverCache:'uncontrolled',network:'actual desktop connection'},
      metrics:{catalog:stats(results.map(x=>x.catalogMs)),readerFirstMaterial:stats(results.map(x=>x.materials[0].readerMs)),readerSecondMaterial:stats(results.map(x=>x.materials[1].readerMs))},results,errors};
    fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
  }catch(e){
    fs.mkdirSync(path.dirname(OUT),{recursive:true});
    fs.writeFileSync(OUT,JSON.stringify({status:'FAIL',version:VERSION,at:new Date().toISOString(),completedRounds:results,error:e.message,errors},null,2)+'\n');
    throw e;
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
