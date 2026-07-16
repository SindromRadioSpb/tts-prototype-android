#!/usr/bin/env node
"use strict";
const assert=require("assert"),T=require("../../db/f2CorpusTargetRepo");
(async()=>{const r=await T.selectTarget("pid:1");assert(r.ok,JSON.stringify(r));assert.notEqual(r.target.text_key,"missing");assert.equal(r.target.options.filter(x=>x.correct).length,1);assert(r.manifest.scanned_works<=T.MAX_WORKS);assert(r.manifest.scanned_rows<=T.MAX_ROWS);assert(r.manifest.elapsed_ms<=T.MAX_MS,`selector ${r.manifest.elapsed_ms}ms`);const miss=await T.selectTarget("legacy:key");assert.equal(miss.reason,"NON_PID");console.log("f2-target-smoke: ok",JSON.stringify(r.manifest));})().catch(e=>{console.error(e);process.exit(1)});
