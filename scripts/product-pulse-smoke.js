"use strict";
// Hermetic API + browser evidence. No production/owner profile and no paid calls.
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawn}=require("node:child_process"),{chromium}=require("playwright");
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer}=require("./smoke-server-env");
const {contractManifest}=require("../product-pulse/contract");
const {createDashboard}=require("../product-pulse/dashboard");
const SECRET="pulse-disposable-bootstrap-0123456789";
async function main(){
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"lp-pulse-"));
  const child=spawn(process.execPath,["-e",SMOKE_SERVER_BOOTSTRAP],{cwd:path.resolve(__dirname,".."),env:{...smokeServerEnv(scratch,0),AUTH_BOOTSTRAP_SECRET:SECRET},stdio:["ignore","pipe","pipe","ipc"]});
  let logs="",browser;child.stdout.on("data",x=>logs+=x);child.stderr.on("data",x=>logs+=x);
  try{
    const port=await waitForSmokeServer(child,30000),base="http://127.0.0.1:"+port;
    for(let i=0;i<100;i++){const h=await fetch(base+"/healthz").then(r=>r.json());if(h.db?.ready&&h.migrations?.ready)break;await new Promise(r=>setTimeout(r,100));}
    for(const p of ["/pulse.html","/api/product-pulse/v1/contract","/api/product-pulse/v1/dashboard"]){
      assert.equal((await fetch(base+p)).status,401,p);
      assert.equal((await fetch(base+p+"?preview=1",{headers:{"X-Forwarded-For":"203.0.113.5"}})).status,401,"preview must fail on non-loopback");
      assert.equal((await fetch(base+p+"?preview=1")).status,200);
    }
    const login=await fetch(base+"/api/auth/bootstrap-login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({secret:SECRET})});
    assert.equal(login.status,200);const cookie=login.headers.get("set-cookie").split(";")[0];const me=await login.json();
    const manifest=await fetch(base+"/api/product-pulse/v1/contract",{headers:{cookie}}).then(r=>r.json());assert.deepEqual(manifest.contract,contractManifest());
    assert.equal((await fetch(base+"/pulse.html",{headers:{cookie}})).status,200);
    assert.equal((await fetch(base+"/api/product-pulse/v1/dashboard",{headers:{cookie}})).status,503);
    assert.equal((await fetch(base+"/api/product-pulse/v1/config",{headers:{cookie}}).then(r=>r.json())).collect,false);
    const sqlite=require("sqlite3");const db=new sqlite.Database(path.join(scratch,"app.db"));
    await new Promise((resolve,reject)=>db.run("UPDATE users SET role='learner' WHERE id=?",[me.user.id],e=>e?reject(e):resolve()));
    for(const p of ["/pulse.html","/api/product-pulse/v1/contract","/api/product-pulse/v1/dashboard"])assert.equal((await fetch(base+p,{headers:{cookie}})).status,404,p);
    await new Promise(r=>db.close(r));
    console.log("API PASS: owner / non-owner / anonymous / preview loopback / manifest parity / exclusion");
    browser=await chromium.launch({headless:true});const page=await browser.newPage();let mode="zero";
    const zero=await createDashboard({stats:async()=>({visits:0,visitors:0,pageviews:0}),read:async()=>[]})();
    const partial=await createDashboard({stats:async()=>{throw Error();},read:async()=>[]})();
    await page.route("**/api/product-pulse/v1/dashboard*",route=>route.fulfill(mode==="outage"?{status:502,contentType:"application/json",body:'{"error":"unavailable"}'}:{status:200,contentType:"application/json",body:JSON.stringify(mode==="partial"?partial:zero)}));
    const out=path.resolve(".tmp/product-pulse-smoke");fs.mkdirSync(out,{recursive:true});
    for(const width of [380,768,1440]){
      await page.setViewportSize({width,height:900});await page.goto(base+"/pulse.html?preview=1");await page.waitForFunction(n=>document.querySelectorAll(".event-card").length===n&&document.querySelector("#pulseStatus b").textContent==="Источник доступен",contractManifest().events.length);
      const overflow=await page.evaluate(()=>({ok:document.documentElement.scrollWidth<=innerWidth,scrollWidth:document.documentElement.scrollWidth,innerWidth,wide:Array.from(document.querySelectorAll("body *")).map(e=>({tag:e.tagName,id:e.id,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).filter(x=>x.right>innerWidth+1||x.width>innerWidth+1).slice(0,8)}));
      assert.equal(overflow.ok,true,"horizontal overflow "+width+" "+JSON.stringify(overflow));
      assert.equal(await page.locator("#usageMetrics .metric-card").count(),contractManifest().events.length);
      assert.equal(await page.locator("#materialBreakdowns .breakdown").count(),3);
      assert.deepEqual(await page.locator("#eventList .event-name").allTextContents(),contractManifest().events.map(e=>e.name));
      assert.deepEqual(await page.locator("#propertyList code").allTextContents(),contractManifest().properties.map(p=>p.name));
      assert.equal(await page.locator("#usageMetrics .metric-card").first().getAttribute("data-state"),"available zero");
      await page.screenshot({path:path.join(out,"pulse-"+width+".png"),fullPage:true});
      await page.screenshot({path:path.join(out,"pulse-"+width+"-viewport.png")});
      await page.locator('section[aria-labelledby="materialUsageTitle"]').screenshot({path:path.join(out,"pulse-materials-"+width+".png")});
    }
    await page.keyboard.press("Tab");const focus=await page.evaluate(()=>({tag:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineWidth}));assert.ok(["SELECT","BUTTON"].includes(focus.tag));assert.notEqual(focus.outline,"0px");
    mode="partial";await page.locator("#pulseRefresh").click();await page.waitForFunction(()=>document.querySelector("#pulseStatus b").textContent==="Частичные данные");assert.equal(await page.locator('[data-metric="visits"]').innerText(),"—");
    mode="outage";await page.locator("#pulseRefresh").click();await page.waitForFunction(()=>document.querySelector("#pulseStatus b").textContent==="Источник недоступен");assert.equal(await page.locator("#reliabilityRows tr").count(),0);assert.equal(await page.locator('[data-metric="visits"]').innerText(),"—");
    await page.screenshot({path:path.join(out,"pulse-unavailable.png"),fullPage:true});
    // WCAG text contrast for palette pairs actually used by panel CSS.
    function lum(hex){const c=hex.match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
    for(const [fg,bg] of [["aebbd0","111a29"],["edf3ff","111a29"],["77e0b5","0c1523"],["263247","aebcd5"]]){const a=lum(fg),b=lum(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,fg+" contrast");}
    console.log("UI PASS: 380/768/1440, manifest parity, zero/partial/outage, keyboard focus, palette contrast; screenshots "+out);
    const senderContext=await browser.newContext();
    await senderContext.addInitScript(()=>Object.defineProperty(navigator,"webdriver",{get:()=>false}));
    const sender=await senderContext.newPage(),wire=[];
    await sender.route("https://pulse.test/**",async route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname==="/api/product-pulse/v1/events") { wire.push(JSON.parse(route.request().postData()));return route.fulfill({status:202,body:'{"ok":true}'}); }
      if(pathname==="/api/client-config")return route.fulfill({contentType:"application/json",body:'{"version":"3.11.610"}'});
      if(pathname==="/api/product-pulse/v1/config")return route.fulfill({contentType:"application/json",body:'{"collect":true}'});
      if(pathname==="/sender.js")return route.fulfill({contentType:"application/javascript",body:fs.readFileSync("public/js/product-telemetry.js","utf8")});
      return route.fulfill({contentType:"text/html",body:'<textarea id="inputText">private fixture content</textarea><script src="/sender.js"></script>'});
    });
    await sender.goto("https://pulse.test/index.html");await sender.waitForFunction(()=>!!window.ProductTelemetry);
    for(let i=0;i<40&&!wire.length;i++)await new Promise(r=>setTimeout(r,25));
    await sender.locator("#inputText").click();await sender.locator("#inputText").press("ArrowRight");
    for(let i=0;i<40&&wire.length<2;i++)await new Promise(r=>setTimeout(r,25));
    assert.deepEqual(wire.map(x=>x.event_name),["app_open","study_started"]);
    const {normalizeEvent}=require("../product-pulse/contract");wire.forEach(e=>assert.equal(normalizeEvent(e).ok,true));
    assert.equal(JSON.stringify(wire).includes("private fixture content"),false);
    assert.equal(JSON.stringify(wire).includes("pulse.test"),false);
    await senderContext.close();console.log("BROWSER WIRE PASS: actual fetch envelope v2, trusted study action, no content or URL");
  }catch(e){console.error(logs.slice(-2500));throw e;}finally{if(browser)await browser.close();child.kill();await new Promise(r=>child.once("exit",r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
