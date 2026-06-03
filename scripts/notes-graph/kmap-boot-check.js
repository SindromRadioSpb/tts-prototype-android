#!/usr/bin/env node
// Boot check for the index.html integration (flag + 🌳 button + module loads).
// Verifies the real app page boots with no fatal pageerror, the modules expose
// their globals, and the Knowledge Map button is revealed when the flag is on.
"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3224;
const BASE = `http://127.0.0.1:${PORT}`;
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
let passed=0,failed=0;
function test(n,c,e){ if(c){passed++;console.log("  ✓ "+n);} else {failed++;console.log("  ✗ "+n+(e?" — "+e:""));} }
function startServer(){return spawn(process.execPath,["server.js"],{cwd:REPO_ROOT,env:{...process.env,PORT:String(PORT)},stdio:["ignore","pipe","pipe"]});}
async function stopServer(c){ if(!c||c.killed)return; c.kill("SIGTERM"); await new Promise(r=>{const t=setTimeout(()=>r(),4000);c.once("exit",()=>{clearTimeout(t);r();});}); if(process.platform==="win32")spawnSync("taskkill",["/PID",String(c.pid),"/T","/F"],{stdio:"ignore"}); }
async function waitForReady(ms=15000){const s=Date.now();while(Date.now()-s<ms){try{const r=await fetch(BASE+"/healthz");if(r.status===200)return true;}catch(_){}await sleep(200);}return false;}

async function main(){
  const playwright=require("playwright");
  const srv=startServer();
  if(!(await waitForReady())){console.error("server failed");await stopServer(srv);process.exit(1);}
  const browser=await playwright.chromium.launch();
  const errs=[];
  try{
    const ctx=await browser.newContext({serviceWorkers:"block",viewport:{width:1440,height:900}});
    const pg=await ctx.newPage();
    pg.on("pageerror",e=>errs.push(String(e.message||e)));
    await pg.goto(BASE+"/index.html?v=kmapboot",{waitUntil:"domcontentloaded"});
    await sleep(2500); // let boot run
    const r=await pg.evaluate(()=>{
      var b=document.getElementById("btnKnowledgeMap");
      var visible = !!b && getComputedStyle(b).display!=="none";
      return { hasData: !!window.KnowledgeMapData, hasView: !!window.KnowledgeMap, btnVisible: visible };
    });
    test("index.html boots; kmap modules expose globals", r.hasData && r.hasView, JSON.stringify(r));
    test("🌳 button visible by default (no flag)", r.btnVisible===true, JSON.stringify(r));
    // JSZip loader hotfix — must resolve and define window.JSZip (Library import)
    const jz = await pg.evaluate(async () => { try { const Z = await window.v3LoadJSZip(); return { ok: (typeof window.JSZip === "function") && !!Z }; } catch (e) { return { ok: false, err: String(e && e.message || e) }; } });
    test("v3LoadJSZip resolves; window.JSZip defined", jz.ok === true, JSON.stringify(jz));
    // fatal pageerrors only (ignore benign resource warnings captured as pageerror is rare)
    test("no fatal pageerror", errs.length===0, errs.join(" | "));
    await pg.screenshot({path:path.join(REPO_ROOT,".tmp","kmap-boot.png")});
    await pg.close();await ctx.close();
  } finally { await browser.close(); await stopServer(srv); }
  console.log(`\n[kmap-boot-check] ${passed}/${passed+failed} passed`);
  process.exit(failed===0?0:1);
}
main().catch(e=>{console.error("fatal:",e);process.exit(1);});
