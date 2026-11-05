'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../public/js/course-audio');
class FakeAudio {
 static all=[];
 constructor(src){this.src=src;this.paused=true;this.listeners={};FakeAudio.all.push(this);}
 addEventListener(k,fn){this.listeners[k]=fn;}
 removeEventListener(k,fn){if(this.listeners[k]===fn)delete this.listeners[k];}
 play(){this.paused=false;return Promise.resolve();}
 pause(){this.paused=true;}
 removeAttribute(k){if(k==='src')this.src='';}
 end(){this.listeners.ended?.();}
}
const key='a'.repeat(64);
const create=(extra={})=>A.create({base:'/data/course',courseId:'mini',lessonId:'L001',AudioCtor:FakeAudio,fetch:async()=>({ok:true,json:async()=>({t1:key})}),...extra});
test('rate persists across replay and old audio is stopped',async()=>{
 FakeAudio.all=[];const a=create();await a.load();a.setRate(.75);await a.play('t1');await a.play('t1');
 assert.equal(FakeAudio.all.length,2);assert.ok(FakeAudio.all.every(x=>x.playbackRate===.75));assert.equal(FakeAudio.all[0].paused,true);assert.equal(FakeAudio.all[0].src,'');assert.equal(FakeAudio.all[1].src,'/api/audio/'+key);
 a.stop();assert.equal(FakeAudio.all[1].paused,true);assert.equal(FakeAudio.all[1].src,'');
});
test('missing or invalid manifest never exposes playback',async()=>{
 for(const fetch of [async()=>({ok:false}),async()=>{throw Error('offline');},async()=>({ok:true,json:async()=>({t1:'../bad'})})]){
 const a=create({fetch});await a.load();assert.equal(a.has('t1'),false);assert.equal(await a.play('t1'),false);}
});
test('stop cancels pending load; late response and ended callbacks cannot reactivate',async()=>{
 let resolve,signal,ended=0;const a=create({onEnded:()=>ended++,fetch:(_url,o)=>{signal=o.signal;return new Promise(r=>resolve=r);}});
 const loading=a.load();a.stop();assert.equal(signal.aborted,true);resolve({ok:true,json:async()=>({t1:key})});await loading;assert.equal(a.has('t1'),false);
 const b=create({onEnded:()=>ended++});await b.load();await b.play('t1');const audio=FakeAudio.all.at(-1), callback=audio.listeners.ended;b.stop();callback();assert.equal(ended,0);
});
test('only successful natural completion reports hearing; invalid rates ignored',async()=>{
 const seen=[];const a=create({onEnded:id=>seen.push(id)});await a.load();a.setRate(.2);await a.play('t1');assert.equal(FakeAudio.all.at(-1).playbackRate,1);assert.deepEqual(seen,[]);FakeAudio.all.at(-1).end();assert.deepEqual(seen,['t1']);
});
