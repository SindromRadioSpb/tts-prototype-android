'use strict';
// Same disposable profile, fonts, origin, viewport and Sukkot theme for base and candidate.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {fork,execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer}=require('../smoke-server-env');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(ROOT,'.tmp/learning-release/browser'),BASE='5f683507fd5bc993e468f9785648cdb070843ef2';
const cache=new Map();
function original(file){if(!cache.has(file))cache.set(file,execFileSync('git',['-c','safe.directory='+ROOT,'show',BASE+':'+file],{cwd:ROOT,stdio:['ignore','pipe','ignore']}));return cache.get(file);}
async function main(){
 const child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:ROOT,env:smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(),'lp-screen-parity-')),0),silent:true,windowsHide:true});child.stdout.resume();child.stderr.resume();let browser;
 try{
  const origin='http://127.0.0.1:'+await waitForSmokeServer(child,60000);browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:380,height:850},serviceWorkers:'block'});let mode='baseline';
  await context.route('**/*',async route=>{
   const req=route.request();if(!req.url().startsWith(origin))return route.abort();const u=new URL(req.url());
   if(mode==='baseline'&&u.pathname==='/api/client-config'){
    const response=await route.fetch(),json=await response.json();json.version='3.11.730';
    const integrity={};for(const url of Object.keys(json.shellIntegrity||{})){const baseUrl=url.replace(/v=731/g,'v=730');try{integrity[baseUrl]=crypto.createHash('sha256').update(original('public'+new URL(url,origin).pathname)).digest('hex');}catch(_){}}
    json.shellIntegrity=integrity;return route.fulfill({response,json});
   }
   if(mode==='baseline'&&['/library.html','/js/library-ui.js','/js/corpus-discovery-core.js','/js/corpus-discovery-browser.js'].includes(u.pathname))return route.fulfill({contentType:u.pathname.endsWith('.html')?'text/html':'text/javascript',body:original('public'+u.pathname)});
   return route.continue();
  });
  await context.addInitScript(()=>{localStorage.setItem('app.locale','ru');localStorage.setItem('appTheme_v1','light');localStorage.setItem('phase6Decision_v1','declined');localStorage.setItem('onboardingSeen_v1','1');localStorage.setItem('lp_world_sukkot_trial_v1','1');localStorage.setItem('lp_world_v1',JSON.stringify({id:'sukkot',mode:'live',paused:false,lighting:'day'}));});
  const page=await context.newPage(),measurements=[];
  for(const name of ['baseline','candidate']){
   mode=name;await page.goto(origin+'/library.html?canon=skip&parity='+name+'#room=benyehuda');await page.locator('.corpus-work-row').first().waitFor({timeout:30000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1000);
   const bounds=await page.evaluate(()=>{const r=document.querySelector('.corpus-work-row').getBoundingClientRect();const bottom=Array.from(document.querySelectorAll('body *')).filter(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return s.position==='fixed'&&s.display!=='none'&&r.height>0&&r.top>innerHeight/2&&r.bottom>=innerHeight-1;}).reduce((v,n)=>Math.min(v,n.getBoundingClientRect().top),innerHeight);return{firstCardTop:r.top,firstCardBottom:r.bottom,usableBottom:bottom,footer:document.querySelector('#roomFooterVersion').textContent,updateNotice:!!document.querySelector('.room-update-toast'),overflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert.equal(bounds.footer,name==='baseline'?'3.11.730':'3.11.731');assert.ok(bounds.firstCardBottom<=bounds.usableBottom&&!bounds.overflow&&!bounds.updateNotice);measurements.push({name,...bounds});await page.screenshot({path:path.join(OUT,'screen-parity-'+name+'.png')});
  }
  fs.writeFileSync(path.join(OUT,'screen-parity.json'),JSON.stringify({result:'pass',sameProfile:true,measurements,attribution:'The earlier 8px failure ran a mismatched 731 footer versus 731-corpus-v8 server, showing an update notice. Coherent base730 and candidate731 both pass without CSS changes.'},null,2));console.log(JSON.stringify(measurements));
 }finally{await browser?.close();child.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
