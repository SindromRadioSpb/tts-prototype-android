#!/usr/bin/env node
// Browser check for the proclitic-prefix conjugation fix (כזאת → זֹאת).
// Loads the real app page, exercises the real /api/conjugation server path the
// editor uses, renders the paradigm with the real client renderer, screenshots.
"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TMP = path.join(REPO_ROOT, ".tmp");
const PORT = 3227;
const BASE = `http://127.0.0.1:${PORT}`;
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function startServer(){return spawn(process.execPath,["server.js"],{cwd:REPO_ROOT,env:{...process.env,PORT:String(PORT)},stdio:["ignore","pipe","pipe"]});}
async function stopServer(c){if(!c||c.killed)return;c.kill("SIGTERM");await new Promise(r=>{const t=setTimeout(()=>r(),4000);c.once("exit",()=>{clearTimeout(t);r();});});if(process.platform==="win32")spawnSync("taskkill",["/PID",String(c.pid),"/T","/F"],{stdio:"ignore"});}
async function waitForReady(ms=15000){const s=Date.now();while(Date.now()-s<ms){try{const r=await fetch(BASE+"/healthz");if(r.status===200)return true;}catch(_){}await sleep(200);}return false;}

async function main(){
  const fs=require("fs"); if(!fs.existsSync(TMP))fs.mkdirSync(TMP,{recursive:true});
  const playwright=require("playwright");
  const srv=startServer();
  if(!(await waitForReady())){console.error("server failed");await stopServer(srv);process.exit(1);}
  const browser=await playwright.chromium.launch();
  try{
    const ctx=await browser.newContext({serviceWorkers:"block",viewport:{width:430,height:760}});
    const pg=await ctx.newPage();
    const errs=[]; pg.on("pageerror",e=>errs.push(String(e.message||e)));
    await pg.goto(BASE+"/index.html?v=conjcheck",{waitUntil:"domcontentloaded"});
    await sleep(1500);
    const res = await pg.evaluate(async () => {
      async function call(payload){
        const r = await fetch("/api/conjugation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        const data = await r.json().catch(()=>({}));
        let rendered = "";
        try { if (data && data.ok && data.paradigm && typeof window.v3RenderInflectionParadigm==="function") rendered = window.v3RenderInflectionParadigm(data.paradigm,{}); } catch(e){ rendered = "RENDER_ERR:"+e.message; }
        return { ok: !!(data&&data.ok), kind: data&&data.paradigm&&data.paradigm.kind, lemma: data&&data.paradigm&&data.paradigm.lemma_niqqud, reason: data&&data.reason, renderedLen: rendered.length, renderedEmpty: /v3-conj-empty|noTable|не даёт таблицу/i.test(rendered) };
      }
      const a = await call({ lemma:"זאת", pos:"pronoun", stem:"זאת", form:"כָּזֹאת" });          // editor sends stem-as-lemma for pronoun
      const b = await call({ lemma:"כזאת", pos:"pronoun", stem:"זאת" });                          // surface lemma + Dicta stem (stem threading)
      const c = await call({ lemma:"כזאת", pos:"pronoun" });                                       // CONTROL: no stem → should stay unresolved
      // render case (a) into the page for a screenshot
      try { if (a.ok) { const d=document.createElement("div"); d.id="conjShot"; d.style.cssText="position:fixed;inset:0;z-index:99999;background:#fff;padding:24px;font:16px sans-serif;direction:rtl;"; const r=await fetch("/api/conjugation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lemma:"זאת",pos:"pronoun",stem:"זאת",form:"כָּזֹאת"})}).then(x=>x.json()); d.innerHTML="<h3 dir=rtl>כזאת → "+(r.paradigm.lemma_niqqud||"")+"</h3>"+window.v3RenderInflectionParadigm(r.paradigm,{}); document.body.appendChild(d);} } catch(_){}
      return { a, b, c };
    });
    await sleep(400);
    await pg.screenshot({ path: path.join(TMP,"conj-kzot.png") });
    console.log(JSON.stringify(res,null,2));
    console.log("pageerrors:", errs.length?errs.join(" | "):"none");
    await pg.close();await ctx.close();
  } finally { await browser.close(); await stopServer(srv); }
  process.exit(0);
}
main().catch(e=>{console.error("fatal:",e);process.exit(1);});
