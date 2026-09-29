"use strict";
// Every grant is explicit, bounded and read again at authorization boundaries.
function createRollout(getDb,env=process.env,clock=Date.now){
 const get=(sql,p=[])=>new Promise((r,j)=>getDb().get(sql,p,(e,row)=>e?j(e):r(row)));
 const off=()=>env.TUTOR_BYOA_EMERGENCY_OFF==='1';
 return {
  enabled:async()=>{if(off())return false;if(env.TUTOR_BYOA_ENABLED==='1')return true;try{return !!await get('SELECT user_id FROM tutor_rollout WHERE expires_at>? LIMIT 1',[clock()]);}catch(_){return false;}},
  allowed:async id=>{if(off()||!id)return false;if(env.TUTOR_BYOA_ENABLED==='1')return true;try{return !!await get('SELECT user_id FROM tutor_rollout WHERE user_id=? AND expires_at>?',[String(id),clock()]);}catch(_){return false;}},
 };
}
module.exports={createRollout};
