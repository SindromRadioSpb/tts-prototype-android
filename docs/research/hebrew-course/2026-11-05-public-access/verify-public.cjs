const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const base='https://linguistpro.kolosei.com';
async function main(){
 const get=async p=>{const r=await fetch(base+p,{headers:{'Cache-Control':'no-cache'}});assert.equal(r.status,200,p);return r;};
 const config=await (await get('/api/client-config?publicCourse='+Date.now())).json();
 assert.equal(config.version,'3.11.860');
 const assets={};
 for(const url of ['/js/library-ui.js?v=860','/js/corpus-registry.js?v=860']){
  const bytes=Buffer.from(await (await get(url)).arrayBuffer());const hash=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(hash,config.shellIntegrity[url]);assets[url]=hash;
 }
 const course=await (await get('/data/course/ulpan/course.json')).json();
 const lessons=[];
 for(const id of course.lessons){const data=await (await get('/data/course/ulpan/lessons/'+id+'.json')).json();for(const media of data.media||[])if(media.src)await get('/data/course/ulpan/media/'+media.src);lessons.push({id,steps:data.flow.reduce((n,p)=>n+p.steps.length,0),media:(data.media||[]).length});}
 const browser=await chromium.launch({headless:true});
 const results=[];
 try {for(const width of [390,1440]){
 const ctx=await browser.newContext({viewport:{width,height:900}});
 await ctx.addInitScript(()=>localStorage.setItem('lp_world_v1',JSON.stringify({id:'classic'})));
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/library.html#room=hub');await p.waitForSelector('[data-corpus="course:ulpan"]',{timeout:60000});
 await p.locator('[data-corpus="course:ulpan"]').first().click();await p.waitForSelector('[data-course-lesson]');
 assert.equal(await p.locator('[data-course-lesson]').count(),lessons.length);
 for(const lesson of lessons){
 await p.locator('[data-course-lesson="'+lesson.id+'"]').click();await p.waitForSelector('[data-course-step]');
 assert.match(p.url(),new RegExp('les='+lesson.id));
 await p.reload();await p.waitForSelector('[data-course-step]');
 assert.equal(await p.locator('[data-course-step]').getAttribute('data-course-step'),'0');
 const first=p.url();for(let step=0;step<lesson.steps;step++){await p.goto(first.replace(/([?&#])st=\d+/,'$1st='+step));await p.waitForSelector('[data-course-part]');assert.equal(await p.locator('[data-course-step]').getAttribute('data-course-step'),String(step));}
 await p.screenshot({path:__dirname+'/public-'+width+'.png',fullPage:true});
 await p.locator('[data-course-home]').click();await p.waitForSelector('[data-course-lesson]');
 }
 assert.deepEqual(errors,[]);results.push({width,hub:true,lessons:true,deepLinkReload:true,pageErrors:errors});await ctx.close();
 }}finally{await browser.close();}
 const health=[];for(let i=0;i<3;i++){const h=await(await get('/healthz?publicCourse='+Date.now())).json();assert.ok(h.ok&&h.db.ready&&h.migrations.ready);health.push(h);}
 const report={version:config.version,anonymous:true,assets,lessons,results,health};fs.writeFileSync(__dirname+'/public-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
