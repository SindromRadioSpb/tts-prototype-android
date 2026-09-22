'use strict';
// Isolated owner, synthetic rights, fresh profile; no production or learner writes.
const {chromium}=require('playwright'),{spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const fixture=require('../../tests/helpers/mediathequeArchiveFixture.cjs');
const Core=require('../../public/js/portable-learning-package-core'),Portable=require('../../public/js/studio-portable-learning-package'),Playback=require('../../public/js/playback-source');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(root,'.tmp/editorial-browser-'));
const out=path.resolve(root,process.env.MEDIATHEQUE_EVIDENCE_DIR||'docs/research/mediatheque-editorial/2026-09-22/publisher-browser');fs.mkdirSync(out,{recursive:true});
const port=3345,base='http://127.0.0.1:'+port,secret='editorial-synthetic-'+Date.now();
const evidence={mode:'isolated synthetic owner and source archive',checks:[],errors:[]};
const check=(label,value)=>{assert.ok(value,label);evidence.checks.push(label);console.log('PASS',label);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const input=fixture();input.playback_source=Playback.append(null,{url:'https://youtu.be/sYd4zgR7f6w'});
 const file=path.join(temp,'fixture.lplp.zip');fs.writeFileSync(file,await Portable.zipFiles(await Core.buildPackageFiles(input,{mode:'snapshot'}),'nodebuffer'));
 const server=spawn(process.execPath,['server.js'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),BIND_HOST:'127.0.0.1',DATA_DIR:temp,DB_PATH:path.join(temp,'app.db'),AUTH_BOOTSTRAP_SECRET:secret},stdio:['ignore','pipe','pipe']});
 let log='',browser,page;server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
 try{
  for(let n=0;n<150;n++){try{if((await fetch(base+'/api/client-config')).ok)break;}catch{}if(server.exitCode!==null)throw Error('server exited');await sleep(200);}
  browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});page=await context.newPage();page.on('pageerror',e=>evidence.errors.push(e.message));
  await page.goto(base+'/mediatheque.html');await page.locator('#ml-root[aria-busy=false]').waitFor();
  const anonymous=await context.request.post(base+'/api/publication/mediatheque/archive',{headers:{'Content-Type':'application/zip'},data:Buffer.from('invalid')});check('anonymous archive upload rejected before staging',anonymous.status()===401);
  await page.evaluate(async secret=>{const r=await fetch('/api/auth/bootstrap-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret})});const d=await r.json();if(!d.ok)throw Error(JSON.stringify(d));localStorage.setItem('cloud.csrf',d.csrf);},secret);
  const csrf=await page.evaluate(()=>localStorage.getItem('cloud.csrf'));
  const wrongOrigin=await context.request.post(base+'/api/publication/mediatheque/archive',{headers:{'Content-Type':'application/zip','X-LP-CSRF':csrf,Origin:'https://invalid.example'},data:Buffer.from('invalid')});check('authenticated cross-origin archive upload rejected',wrongOrigin.status()===403);
  await page.reload();await page.locator('[data-action=publish-material]').click();
  await page.locator('[name=archive]').setInputFiles(file);await page.locator('#ml-form button[type=submit]').click();
  await page.locator('[name=title]').waitFor();check('archive verified through authenticated upload route',true);
  await page.locator('[name=newCategory]').fill('כאן 11 — тестовый канал');await page.locator('[name=newCollection]').fill('אויבים — тестовая серия');
  await page.locator('[name=rights]').check();await page.locator('#ml-form button[type=submit]').click();
  await page.getByText('Будет опубликована новая редакция канала',{exact:false}).waitFor({timeout:20000});
  await page.screenshot({path:path.join(out,'publication-preview.png')});
  await page.locator('#ml-form button[type=submit]').click();
  await page.getByRole('heading',{name:'Опубликовать структуру',exact:true}).waitFor({timeout:20000});
  await page.locator('#ml-form button[type=submit]').click();await page.locator('#ml-dialog').waitFor({state:'hidden'});
  check('guided archive publication and separate structure review complete',true);
  const guest=await browser.newContext({serviceWorkers:'block'}),reader=await guest.newPage();reader.on('pageerror',e=>evidence.errors.push(e.message));
  await reader.goto(base+'/mediatheque.html?space=public&section=topics');await reader.locator('.ml-channel-card').waitFor();
  check('guest sees published channel',await reader.locator('.ml-channel-card').count()===1);
  check('guest cannot see editor actions',await reader.locator('[data-action=publish-material]').count()===0);
  for(const lang of ['ru','en','he'])for(const width of [380,820,1366]){
    await reader.setViewportSize({width,height:900});await reader.evaluate(l=>window.appSetLocale(l),lang);await reader.screenshot({path:path.join(out,`channels-${lang}-${width}.png`)});
    check(`${lang} ${width} no horizontal overflow`,await reader.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    check(`${lang} ${width} no missing translations`,!(await reader.locator('body').innerText()).includes('mediatheque.'));
  }
  await reader.locator('.ml-channel-card').focus();check('channel card has keyboard focus',await reader.locator('.ml-channel-card').evaluate(n=>n===document.activeElement));
  await reader.locator('#ml-theme').click();await reader.screenshot({path:path.join(out,'channels-dark-he.png')});await reader.locator('#ml-theme').click();
  await reader.locator('.ml-channel-card').click();await reader.locator('.ml-channel-series').waitFor();check('channel opens linked series',true);
  await reader.evaluate(()=>scrollTo(0,0));await reader.screenshot({path:path.join(out,'channel-series-he-desktop.png')});
  await reader.locator('.ml-channel-series .ml-collection a[data-nav]').first().click();await reader.locator('.ml-item').waitFor();check('series opens its episode',await reader.locator('.ml-item').count()===1);
  const api=await reader.evaluate(async()=>await(await fetch('/api/mediatheque')).json());check('only one public material',api.items.length===1);
  await page.locator('[data-action=organize]').click();await page.locator('[data-action=research-reserve]').click();await page.locator('#ml-research-search').fill('Calcalist');check('research search finds candidate',await page.locator('#ml-research-candidate option').count()===1);await page.locator('[data-action=cancel-dialog]').click();
  // A real tiny MP4 exercises stream delivery and the Room player, not only metadata.
  const mediaFile=path.join(temp,'synthetic.mp4');
  const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=320x180:r=25','-t','3','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',mediaFile],{windowsHide:true});
  if(ff.status!==0)throw Error('ffmpeg fixture failed: '+String(ff.stderr));
  const media=fs.readFileSync(mediaFile),hash=require('node:crypto').createHash('sha256').update(media).digest('hex');
  let local=fixture(),old=local.package.media_sha256;local=JSON.parse(JSON.stringify(local).replaceAll(old,hash));local.package.size_bytes=media.length;local.package.duration_ms=3000;
  const localZip=path.join(temp,'media.lplp.zip');fs.writeFileSync(localZip,await Portable.zipFiles(await Core.buildPackageFiles(local,{mode:'snapshot'}),'nodebuffer'));
  await page.locator('[data-action=publish-material]').click();await page.locator('[name=archive]').setInputFiles(localZip);await page.locator('[name=mode]').selectOption('media');await page.locator('[name=media]').setInputFiles(mediaFile);await page.locator('#ml-form button[type=submit]').click();
  await page.locator('[name=title]').waitFor();await page.locator('[name=title]').fill('Медиафайл — проверка');await page.locator('[name=category]').selectOption({label:'כאן 11 — тестовый канал'});await page.locator('[name=newCollection]').fill('Медиа');await page.locator('[name=rights]').check();await page.locator('#ml-form button[type=submit]').click();
  await page.getByText('Будет опубликована новая редакция канала',{exact:false}).waitFor();await page.locator('#ml-form button[type=submit]').click();await page.getByRole('heading',{name:'Опубликовать структуру',exact:true}).waitFor();await page.locator('#ml-form button[type=submit]').click();await page.locator('#ml-dialog').waitFor({state:'hidden'});
  check('second material publishes through a new edition of the existing channel',true);
  await reader.goto(base+'/mediatheque.html?space=public&section=catalog');await reader.locator('.ml-item').filter({hasText:'Медиафайл — проверка'}).locator('.ml-open').click();
  const player=reader.locator('video[src*="/api/public-corpora/"]');await player.waitFor({timeout:60000});
  await player.evaluate(video=>video.play());await reader.waitForFunction(()=>{const v=document.querySelector('video[src*="/api/public-corpora/"]');return v?.currentTime>0.2;});
  check('Room plays the published MP4 over the authorized public asset URL',true);
  const range=await player.evaluate(async video=>{const r=await fetch(video.getAttribute('src'),{headers:{Range:'bytes=0-31'}});return {status:r.status,length:(await r.arrayBuffer()).byteLength};});check('public video supports HTTP byte ranges',range.status===206&&range.length===32);
  await reader.screenshot({path:path.join(out,'room-public-media.png')});
  await page.locator('[data-action=organize]').click();
  await page.locator('[data-action=new-category]').first().click();await page.locator('[name=title]').fill('Канал без выпусков');await page.locator('#ml-form button[type=submit]').click();await page.locator('#ml-dialog').waitFor({state:'hidden'});
  await page.locator('[data-action=new-collection]').first().click();await page.locator('[name=title]').fill('Серия без выпусков');await page.locator('#ml-form button[type=submit]').click();await page.locator('#ml-dialog').waitFor({state:'hidden'});
  await page.locator('[data-action=preview]').first().click();await page.locator('[data-action=publish]').click();await page.locator('#ml-form button[type=submit]').click();await page.locator('#ml-dialog').waitFor({state:'hidden'});
  await reader.goto(base+'/mediatheque.html?space=public&section=topics');await reader.locator('.ml-channel-card').first().waitFor();
  await reader.evaluate(()=>window.appSetLocale('ru'));
  check('guest sees published empty topic',await reader.locator('.ml-channel-card').filter({hasText:'Канал без выпусков'}).count()===1);
  await reader.locator('.ml-channel-card').filter({hasText:'Канал без выпусков'}).click();
  check('empty topic explains missing episodes without claiming search failure',await reader.locator('.ml-empty').innerText().then(x=>x.includes('Выпуски пока не опубликованы')&&!x.includes('Ничего не найдено')));
  await reader.locator('[data-action=section][data-section=collections]').click();
  check('guest sees published empty collection',await reader.locator('.ml-collection').filter({hasText:'Серия без выпусков'}).count()===1);
  for(const lang of ['ru','en','he']){await reader.setViewportSize({width:380,height:844});await reader.evaluate(l=>window.appSetLocale(l),lang);await reader.screenshot({path:path.join(out,'empty-collections-'+lang+'.png')});check('empty collections '+lang+' fit mobile',await reader.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  check('zero page errors',evidence.errors.length===0);evidence.status='PASS';
 }catch(e){evidence.status='FAIL';evidence.error=e.stack;if(page){evidence.formError=await page.locator('#ml-form-error').textContent().catch(()=>null);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}throw e;}
 finally{fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(temp,'server.log'),log);if(browser)await browser.close();server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
