#!/usr/bin/env node
'use strict';
// Read-only production HTTP + disposable browser storage. Never calls a publication writer.
const {chromium}=require('playwright'),{execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),BASE='https://linguistpro.kolosei.com',VERSION=process.env.MEDIATHEQUE_EXPECT_VERSION||'3.11.523';
const OUT=path.join(ROOT,'docs/research/room-mediatheque-stage2/2026-09-12/production');
const evidence={base:BASE,expectedVersion:VERSION,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),mode:'production reads; fresh isolated Chromium profile; no owner data',checks:[],errors:[],providerRequests:[]};
fs.mkdirSync(OUT,{recursive:true});
const check=(name,value)=>{assert.ok(value,name);evidence.checks.push(name);console.log('PASS',name);};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(page){await page.locator('#ml-root[aria-busy=false]').waitFor({timeout:60000});}
async function shot(page,name){await page.screenshot({path:path.join(OUT,name+'.png'),animations:'disabled'});check(name+' no overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
async function main(){let browser,page;
try{
 let config;
 for(let n=0;n<180;n++){try{const r=await fetch(BASE+'/api/client-config?mediatheque_verify='+Date.now(),{cache:'no-store'});config=await r.json();if(config.version===VERSION)break;}catch{}await delay(2000);}
 check('target version is served',config?.version===VERSION);
 const urls=Object.keys(config.shellIntegrity).filter(url=>/mediatheque|\/library-ui\.js|\/local-db\.js|\/i18n\/locales\//.test(url));
 for(const url of urls){const r=await fetch(BASE+url+(url.includes('?')?'&':'?')+'ml_verify='+Date.now(),{cache:'no-store'}),bytes=Buffer.from(await r.arrayBuffer()),hash=crypto.createHash('sha256').update(bytes).digest('hex');check('served integrity '+url,r.ok&&hash===config.shellIntegrity[url]);}
 const catalog=await fetch(BASE+'/api/mediatheque',{cache:'no-store'}),body=await catalog.json();check('public metadata is explicitly uncached',/no-store/.test(catalog.headers.get('cache-control')));check('public material catalog resolves',body.ok&&body.items.length>0);evidence.publicItems=body.items.length;
 const shell=await fetch(BASE+'/library.html?ml_verify='+Date.now());const csp=shell.headers.get('content-security-policy-report-only');check('report-only policy recognizes the supported YouTube frame and thumbnail',csp.includes('frame-src')&&csp.includes('https://www.youtube.com')&&csp.includes('https://i.ytimg.com'));
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});page=await context.newPage();
 page.on('pageerror',e=>evidence.errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(tts|translate|gemini|asr|publication)/.test(r.url()))evidence.providerRequests.push(new URL(r.url()).pathname);});
 await page.goto(BASE+'/mediatheque.html?space=public&section=catalog');await ready(page);check('guest has no editor entry',await page.locator('[data-action=organize]').count()===0);check('real public catalog uses at most 36 cards',await page.locator('.ml-item').count()===Math.min(36,body.items.length));
 for(let n=0;n<3;n++){await page.reload();await ready(page);check('completed guest reload '+(n+1),await page.locator('.ml-item').count()>0);}
 check('public text covers display actual titles',await page.locator('.ml-cover[data-kind=text] .ml-cover-type strong').first().innerText().then(Boolean));
 await page.locator('[data-action=next-page]').click();await page.goBack();await ready(page);check('public Back restores first page',!new URL(page.url()).searchParams.has('page'));
 await page.goForward();await ready(page);check('public Forward restores second page',new URL(page.url()).searchParams.get('page')==='2');await page.locator('[data-action=previous-page]').click();await page.evaluate(()=>scrollTo(0,0));
 await shot(page,'public-desktop-ru');await page.locator('#ml-theme').click();await shot(page,'public-desktop-dark');
 const colors=await page.evaluate(()=>({bg:getComputedStyle(document.body).backgroundColor,fg:getComputedStyle(document.body).color}));check('dark theme changes both body background and text',colors.bg==='rgb(23, 33, 50)'&&colors.fg==='rgb(236, 241, 250)');await page.locator('#ml-theme').click();
 for(const lang of ['ru','en','he']){await page.setViewportSize({width:380,height:844});await page.evaluate(l=>window.appSetLocale(l),lang);await shot(page,'public-380-'+lang);}
 await page.locator('[data-action=open-filters]').click();await shot(page,'public-380-he-filters');await page.locator('[data-action=cancel-dialog]').click();
 await page.evaluate(()=>window.appSetLocale('ru'));await page.setViewportSize({width:1280,height:900});
 const title=body.items.find(i=>i.ref.slug==='physics-year1-problems')?.title||body.items[0].title;await page.locator('#ml-search').fill(title);await page.waitForTimeout(350);check('public title search finds actual result',await page.locator('.ml-item').count()>0);
 await page.locator('.ml-item .ml-open').first().click();await page.locator('#roomReaderTable tbody tr').first().waitFor({timeout:60000});check('real published material opens reader rows',true);await page.locator('#readerBack').click();await ready(page);check('public reader back preserves search',await page.locator('#ml-search').inputValue()===title);
 await page.evaluate(async()=>{const db=await import('/db/local-db.js?v=520');await db.createText({id:'qa-mediatheque-live',text_key:'qa-mediatheque-live',title:'QA video — disposable local fixture',source_meta_json:JSON.stringify({source:{captions:{video:{videoId:'7qh3Q-FuwQE'},media:{durationSec:3094},captions:{language:'he'}}}})});await db.addSentence('qa-mediatheque-live',{id:'qa-live-row',order_index:0,he_plain:'שלום עולם',ru:'Привет, мир'});});
 await page.goto(BASE+'/mediatheque.html?space=personal&section=catalog');await ready(page);await page.locator('#ml-search').fill('QA video');await page.waitForTimeout(350);await page.locator('[data-action=layout][data-layout=list]').click();check('known platform is shown without inventing a channel',await page.locator('.ml-item-meta').innerText()==='YouTube');
 await page.locator('.ml-item .ml-open').click();await page.locator('#roomMediaYtMount iframe').waitFor({timeout:60000});check('video identity reaches existing reader iframe',(await page.locator('#roomMediaYtMount iframe').getAttribute('src')).includes('/7qh3Q-FuwQE?'));
 await page.locator('#readerBack').click();await ready(page);check('personal reader back preserves search and list',await page.locator('#ml-search').inputValue()==='QA video'&&await page.locator('.ml-materials[data-layout=list]').count()===1);
 check('disposable profile has no generated review events',await page.evaluate(async()=>{const db=await import('/db/local-db.js?v=520');return (await db.dbQuery('SELECT COUNT(*) n FROM review_log',[]))[0].n===0;}));
 check('no provider calls or production editorial writes',evidence.providerRequests.length===0);check('zero page errors',evidence.errors.length===0);evidence.status='PASS';
}catch(e){evidence.status='FAIL';evidence.failure=e.stack;if(page)await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});throw e;}
finally{fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2));if(browser)await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
