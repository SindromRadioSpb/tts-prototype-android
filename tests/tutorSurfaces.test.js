'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../public/js/tutor-client');
const {createContext}=require('../agent/tutor/context');
const passport=()=>({timingMap:{authority:'studio-exact-binding',revision_id:'r1',revision_sha256:'a'.repeat(64),row_caption_segment_ids:['c1','c1','c2',null]},timing:{entries:[{o:0,t:1.2,end:3.5},{o:2,t:4,end:6,end_o:3}]}});
test('exact caption context binds selected row, revision and finite segment window',async()=>{
 const p=passport(),snap=C.capture({surface:'mediatheque',materialKey:'text:1',rows:[{id:0,he:'שלום'},{id:1,he:'אני כאן'}],index:1,locale:'he',mediaPassport:p});
 p.timing.entries[0].t=999;p.timingMap.revision_id='new';
 const ctx=await C.build(snap);
 assert.equal(ctx.source.kind,'caption');assert.equal(ctx.source.media.start_ms,1200);assert.equal(ctx.source.media.end_ms,3500);
 createContext(ctx,{principal_id:'u',connection_id:'c',consent_revision:'v',session_id:'s'});
 const changed=await C.build({...snap,media:{...snap.media,revision:'r2'}});
 assert.notEqual(ctx.source.revision_id,changed.source.revision_id);
});
test('blind, unmapped, derived, absent and nonfinite timing never invent a media window',()=>{
 assert.equal(C.captionWindow(passport(),3),null);
 for(const change of [p=>delete p.timingMap.revision_id,p=>p.timingMap.authority='derived',p=>p.timing.entries[0].blind=true,p=>p.timing.entries[0].end=null,p=>p.timing.entries[0].t=NaN,p=>p.timing.entries[0].end=Infinity]){const p=passport();change(p);assert.equal(C.captionWindow(p,1),null);}
});
test('review context is captured before async navigation and contains no asserted grade',async()=>{
 const rows=[{id:'attempt-source',he:'אתמול הלכתי הביתה'}];
 const snap=C.capture({surface:'review',materialKey:'book',rows,index:0,locale:'ru'});rows[0].he='different';
 const ctx=await C.build(snap);assert.equal(ctx.source.excerpt,'אתמול הלכתי הביתה');assert.equal(ctx.source.kind,'local_snapshot');assert.equal(ctx.surface,'review');assert.equal(ctx.grade,undefined);
});
