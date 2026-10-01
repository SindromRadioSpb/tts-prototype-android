"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {core}=require("../public/js/world-engine"), profile=require("../public/js/world-illustrated").core;
const dir=path.join(__dirname,"../public/worlds/jerusalem-up-close");
const pack=JSON.parse(fs.readFileSync(path.join(dir,"manifest.json"))),atlas=JSON.parse(fs.readFileSync(path.join(dir,"atlas.json")));
test("Jerusalem 0.2.1 validates alongside the two existing worlds without changing the default",()=>{
 assert.deepEqual(core.validatePack(pack,atlas,pack.id).errors,[]);
 assert.deepEqual(Object.keys(core.REGISTRY).sort(),["israel-elections-2026","jerusalem-up-close","sukkot"]);
 assert.equal(core.DEFAULT_WORLD,"israel-elections-2026");
 for(const id of ["sukkot","israel-elections-2026"]){const d=path.join(dir,"..",id);assert.deepEqual(core.validatePack(JSON.parse(fs.readFileSync(path.join(d,"manifest.json"))),JSON.parse(fs.readFileSync(path.join(d,"atlas.json"))),id).errors,[]);}
});
test("every supplied illustrated PNG matches its declared size, dimensions and SHA256",()=>{
 for(const sheet of Object.values(atlas.atlases)){const b=fs.readFileSync(path.join(dir,sheet.file));assert.equal(b.length,sheet.bytes,sheet.file);assert.equal(crypto.createHash("sha256").update(b).digest("hex"),sheet.sha256,sheet.file);assert.equal(b.readUInt32BE(16),sheet.width);assert.equal(b.readUInt32BE(20),sheet.height);}
});
test("blink scheduler suppresses incompatible poses and resets after suspension",()=>{
 const clock=profile.createBlinkClock(pack.illustration.layers,()=>0);
 clock.advance(0,{},true);
 assert.deepEqual(clock.advance(4300,{timsah:"inspect"},true).states,{nura:"closed"});
 assert.deepEqual(clock.advance(4310,{nura:"point",timsah:"walk-0"},true),{states:{},nextAt:null});
 assert.deepEqual(clock.advance(5000,{},false),{states:{},nextAt:null});
 assert.equal(clock.advance(6000,{},true).nextAt,9600);
});
test("source links remain declarative and disallowed remote atlas URLs are rejected",()=>{
 const bad=structuredClone(atlas);Object.values(bad.atlases)[0].file="https://example.com/art.png";
 assert.ok(core.validatePack(pack,bad,pack.id).errors.length);
 const engine=fs.readFileSync(path.join(__dirname,"../public/js/world-engine.js"),"utf8");
 assert.doesNotMatch(engine,/LPWorldHostAssets|LPWorldHostStorage/);
});
