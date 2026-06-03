#!/usr/bin/env node
// Dev screenshot tool for Phase-3 facets on the REAL corpus. Drives the facet
// controls and captures each state to .tmp/kmap-facets-*.png. Self-skips if the
// library is absent.
"use strict";
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const JSZip = require("../../public/db/jszip.min.js");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TMP = path.join(REPO_ROOT, ".tmp");
const ZIP = path.join(REPO_ROOT, "Library", "test-enriched.zip");
const PORT = 3225;
const BASE = `http://127.0.0.1:${PORT}`;
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function startServer(){return spawn(process.execPath,["server.js"],{cwd:REPO_ROOT,env:{...process.env,PORT:String(PORT)},stdio:["ignore","pipe","pipe"]});}
async function stopServer(c){if(!c||c.killed)return;c.kill("SIGTERM");await new Promise(r=>{const t=setTimeout(()=>r(),4000);c.once("exit",()=>{clearTimeout(t);r();});});if(process.platform==="win32")spawnSync("taskkill",["/PID",String(c.pid),"/T","/F"],{stdio:"ignore"});}
async function waitForReady(ms=15000){const s=Date.now();while(Date.now()-s<ms){try{const r=await fetch(BASE+"/healthz");if(r.status===200)return true;}catch(_){}await sleep(200);}return false;}

async function main(){
  if(!fs.existsSync(ZIP)){console.log("SKIPPED: "+ZIP+" not found");process.exit(0);}
  if(!fs.existsSync(TMP))fs.mkdirSync(TMP,{recursive:true});
  const zip=await JSZip.loadAsync(fs.readFileSync(ZIP));
  const advanced=JSON.parse(await zip.file("library/notes_advanced.json").async("string"));
  const rows=(advanced.notes||[]).map(n=>{let b={};try{b=JSON.parse(n.body_json||"{}");}catch(_){}return{id:String(n.id),text_id:String(n.text_id||""),note_type:n.note_type||"word_study",j_root:b.root||null,j_binyan:b.binyan||null,j_word:b.word||null,j_pos:b.pos||null};});
  const prev={};(advanced.notes||[]).forEach(n=>{let b={};try{b=JSON.parse(n.body_json||"{}");}catch(_){}prev[String(n.id)]={meaning:b.meaning||"",niqqud:b.niqqud_variant||""};});
  const inject=`
    window.__localDBInitPromise=Promise.resolve();
    window.__localDB={isReady:()=>true,dbQuery:async function(sql,p){if(/WHERE id = \\?/i.test(sql)){var id=p&&p[0];var pv=(${JSON.stringify(prev)})[id]||{};return [{meaning:pv.meaning||null,niqqud:pv.niqqud||null}];}if(/FROM notes_v2/i.test(sql))return ${JSON.stringify(rows)};return [];},getLearningStateOverlay:async()=>({})};
    window.MorphNormalize={normalizeHebrew:w=>String(w||"").replace(/[\\u0591-\\u05C7]/g,"").trim()};
  `;
  const playwright=require("playwright");
  const srv=startServer();
  if(!(await waitForReady())){console.error("server failed");await stopServer(srv);process.exit(1);}
  const browser=await playwright.chromium.launch();
  const errs=[];
  async function setup(pg){pg.on("pageerror",e=>errs.push(String(e.message||e)));pg.on("dialog",d=>d.accept("Мой вид"));await pg.goto(BASE+"/crosstext-test.html",{waitUntil:"domcontentloaded"});await pg.addScriptTag({content:inject});await pg.addScriptTag({url:"/js/knowledge-map-data.js"});await pg.addScriptTag({url:"/js/knowledge-map-view.js"});await pg.waitForFunction(()=>!!window.KnowledgeMap,null,{timeout:5000});await pg.evaluate(async()=>{await window.KnowledgeMap.open();});await sleep(800);}
  try{
    const ctx=await browser.newContext({serviceWorkers:"block",viewport:{width:1440,height:900}});
    const pg=await ctx.newPage(); await setup(pg);
    await pg.screenshot({path:path.join(TMP,"kmap-facets-default.png")});
    await pg.selectOption("[data-kmap-ctl=color]","binyan"); await sleep(400);
    await pg.screenshot({path:path.join(TMP,"kmap-facets-color-binyan.png")});
    await pg.selectOption("[data-kmap-ctl=color]","status");
    await pg.selectOption("[data-kmap-ctl=layout]","tree"); await sleep(400);
    await pg.screenshot({path:path.join(TMP,"kmap-facets-tree.png")});
    await pg.selectOption("[data-kmap-ctl=layout]","radial");
    await pg.selectOption("[data-kmap-ctl=depth]","2"); await sleep(400);
    await pg.screenshot({path:path.join(TMP,"kmap-facets-depth2.png")});
    await pg.selectOption("[data-kmap-ctl=depth]","1");
    // click first binyan filter chip
    const chip=await pg.$("[data-kmap-filter^='binyan:']");
    if(chip){await chip.click();await sleep(400);await pg.screenshot({path:path.join(TMP,"kmap-facets-filtered.png")});}
    await pg.close();await ctx.close();

    // mobile facets (in root sheet)
    const mctx=await browser.newContext({serviceWorkers:"block",viewport:{width:380,height:820}});
    const mpg=await mctx.newPage(); mpg.on("pageerror",e=>errs.push(String(e.message||e)));
    await mpg.goto(BASE+"/crosstext-test.html",{waitUntil:"domcontentloaded"});
    await mpg.evaluate(()=>document.documentElement.setAttribute("dir","rtl"));
    await mpg.addScriptTag({content:inject});
    await mpg.addScriptTag({url:"/js/knowledge-map-data.js"});
    await mpg.addScriptTag({url:"/js/knowledge-map-view.js"});
    await mpg.waitForFunction(()=>!!window.KnowledgeMap,null,{timeout:5000});
    await mpg.evaluate(async()=>{await window.KnowledgeMap.open();});await sleep(500);
    const rb=await mpg.$("[data-kmap-root]"); if(rb){await rb.click();await sleep(700);}
    await mpg.screenshot({path:path.join(TMP,"kmap-facets-mobile.png")});
    await mpg.close();await mctx.close();
  } finally { await browser.close(); await stopServer(srv); }
  console.log("screenshots → .tmp/kmap-facets-*.png");
  console.log("pageerrors:",errs.length?errs.join(" | "):"none");
  process.exit(0);
}
main().catch(e=>{console.error("fatal:",e);process.exit(1);});
