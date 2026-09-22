"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {contractManifest}=require("../product-pulse/contract");

test("cross-surface material integration uses canonical post-render success points",()=>{
  const studio=fs.readFileSync("public/index.html","utf8"),room=fs.readFileSync("public/js/library-ui.js","utf8"),media=fs.readFileSync("public/js/mediatheque-ui.js","utf8");
  const classic=studio.slice(studio.indexOf("async function v3LibraryOpenText"),studio.indexOf("async function v3LibraryArchiveText"));
  assert.ok(classic.indexOf("v3RenderTableFromLibrary")<classic.indexOf("ProductTelemetry?.confirmMaterialOpen"));
  assert.equal((classic.match(/ProductTelemetry\?\.confirmMaterialOpen/g)||[]).length,1);
  const ide=studio.slice(studio.indexOf("async function v3IdeOpenTextInCenter"),studio.indexOf("function v3IdeRenderTable"));
  assert.ok(ide.indexOf("v3IdeRenderTable(rows, textId)")<ide.indexOf("ProductTelemetry?.confirmMaterialOpen"));
  assert.equal((ide.match(/ProductTelemetry\?\.confirmMaterialOpen/g)||[]).length,1);
  const openRoom=room.slice(room.indexOf("async function openReader"),room.indexOf("function closeReader"));
  assert.ok(openRoom.indexOf("readerCore.openText")<openRoom.indexOf("ProductTelemetry?.confirmMaterialOpen"));
  assert.match(openRoom,/res && res\.ok && readerRows\.length/);
  assert.match(media,/from=mediatheque/);assert.match(media,/\/library\.html\?my_text=/);assert.match(media,/\/library\.html\?public_corpus=/);
});

test("revision 1.2 models material route, collection and media without identifiers",()=>{
  const manifest=contractManifest(),names=manifest.events.map(x=>x.name),props=manifest.properties.map(x=>x.name);
  assert.equal(manifest.contract_revision,"1.2");assert.ok(names.includes("material_started"));assert.ok(names.includes("material_engaged"));
  for(const key of ["entry_point","material_collection","material_media"])assert.ok(props.includes(key));
  for(const forbidden of ["material_id","text_id","note_id","url","query","title"])assert.equal(props.includes(forbidden),false);
});

test("owner-only Pulse shell is network-only and cannot be served from Service Worker cache",()=>{
  const sw=fs.readFileSync("public/sw.js","utf8"),guard='if (url.pathname === "/pulse.html") return;';
  assert.ok(sw.includes(guard));
  assert.ok(sw.indexOf(guard)<sw.indexOf("event.respondWith(staleWhileRevalidate(req))"));
  const precache=sw.slice(sw.indexOf("const PRECACHE_URLS = ["),sw.indexOf("self.addEventListener(\"install\""));
  assert.equal(precache.includes('"/pulse.html"'),false);
});
