// Durable saved-material identity is separate from each tab's private draft.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.StudioSession=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const SESSION='ttsDashboard_session_state_v1', LAST='studio.lastMaterial.v1', MIGRATED='studio.sessionMigration.v2';
  const DRAFT_KEYS=['ttsDashboard_text_v1','ttsDashboard_table_cache_v1',SESSION,'ttsDashboard_last_selected_row_idx_v1'];
  const parse=raw=>{try{const value=JSON.parse(raw);return value&&typeof value==='object'?value:null;}catch(_){return null;}};
  function create(local,tab,now=()=>new Date().toISOString()) {
    const read=()=>{try{return parse(tab.getItem(SESSION));}catch(_){return null;}};
    function remember(id) { try {if(id)local.setItem(LAST,JSON.stringify({textId:String(id),updatedAt:now()}));}catch(_){} }
    function bootstrap() {
      try {
        if(!local.getItem(MIGRATED)) {
          // Upgrade once per browser; never revive the frozen pre-multitab cache again.
          if(!read()) for(const key of DRAFT_KEYS) { const value=local.getItem(key);if(value!==null&&tab.getItem(key)===null)tab.setItem(key,value); }
          const current=read();
          if(!local.getItem(LAST)&&current&&['library','saved'].includes(current.mode)&&current.textId)remember(current.textId);
          local.setItem(MIGRATED,'1');
        }
        if(!read()) {
          const last=parse(local.getItem(LAST));
          if(last?.textId)tab.setItem(SESSION,JSON.stringify({mode:'library',textId:String(last.textId),origin:'restore',openMode:'resume',resumeSentenceId:null}));
        }
      }catch(_){}
      return read();
    }
    function write(patch) {
      const next={...(read()||{}),...(patch||{}),updatedAt:now()};
      try {tab.setItem(SESSION,JSON.stringify(next));}catch(_){}
      return next;
    }
    function forget(id) {try{const last=parse(local.getItem(LAST));if(last&&String(last.textId)===String(id))local.removeItem(LAST);}catch(_){} }
    return {bootstrap,read,write,remember,forget};
  }
  return {create,keys:{SESSION,LAST,MIGRATED}};
});
