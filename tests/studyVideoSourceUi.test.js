'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/js/study-video-source-ui.js'),'utf8');
function browser(storage=new Map(),playSegment=async()=>({ok:true}),extras={}){
 const events={};
 const window={addEventListener:(name,fn)=>{events[name]=fn;}};
 const context={window,document:{documentElement:{lang:'ru'},addEventListener(){}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},StudioMediaKaraoke:{playSegment}};
 Object.assign(context,extras);Object.assign(window,extras);
 vm.runInNewContext(source,context);
 return {ui:window.StudyVideoSourceUI,events};
}
test('playback choice survives a new page, remains per card and observes other-tab changes',()=>{
 const storage=new Map(),a=browser(storage),b=browser(storage);
 a.ui.selectSource('card-a','local');a.ui.selectSource('card-b','youtube');
 assert.equal(browser(storage).ui.preferredSource('card-a'),'local');
 assert.equal(a.ui.preferredSource('card-b'),'youtube');
 b.ui.selectSource('card-a','youtube');
 a.events.storage({key:'lp.playback-source.v1:card-a'});
 assert.equal(a.ui.preferredSource('card-a'),'youtube');
 assert.equal(a.ui.preferredSource('unknown'),null);
});

test('source context inspects exact binding without activating or replacing the current player',async()=>{
 let activations=0;const audio={media:{sha256:'local'}},exact={media:{sha256:'exact'}},active={player:true};
 const {ui}=browser(new Map(),undefined,{
  __localDB:{getTextById:async()=>({id:'card'}),getSentences:async()=>[{he_plain:'hello'}]},
  v3ActiveMediaAudio:active,
  MediaHost:{passportFromTextRow:()=>audio,restoreForRows:()=>{},pickExactBindingPassport:(original,bound)=>bound},
  PlaybackSource:{fromText:()=>null,timingBasis:async()=>null},
  StudioMediaPackage:{activateTextBinding:()=>{activations++;},browserRepository:()=>({getTextBinding:async()=>({revision_id:'r',package_id:'p'}),getRevision:async()=>({}),getPackage:async()=>({})}),buildExactBindingPassport:()=>exact}
 });
 const result=await ui.context('card');
 assert.equal(activations,0);assert.equal(result.audio,exact);assert.equal(result.rows[0].he,'hello');
});
test('replay failures are visible only while their source is current; cancelled seeks stay silent',async()=>{
 let finish;
 const {ui}=browser(new Map(),()=>new Promise(resolve=>{finish=resolve;}));
 const note={dataset:{},textContent:''};
 let active=true;
 const stale=ui.replayRow(0,note,()=>active);active=false;finish({ok:false,reason:'YT_SEEK_TIMEOUT'});await stale;
 assert.equal(note.textContent,'');
 active=true;
 const failed=ui.replayRow(0,note,()=>active);finish({ok:false,reason:'YT_SEEK_TIMEOUT'});await failed;
 assert.equal(note.dataset.youtubeError,'YT_SEEK_TIMEOUT');assert.ok(note.textContent.includes('YouTube'));
 note.textContent='';
 const cancelled=ui.replayRow(0,note,()=>active);finish({ok:false,reason:'YT_SEEK_CANCELLED'});await cancelled;
 assert.equal(note.textContent,'');
});
