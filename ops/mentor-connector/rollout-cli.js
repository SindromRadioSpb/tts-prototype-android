'use strict';
// Local operator command only. Identity comes from the existing server owner list.
const sqlite3=require('sqlite3'),{DB_PATH}=require('../../storage');
const operation=process.argv[2],ids=String(process.env.AGENT_ACCESS_OWNER_IDS||'').split(',').map(x=>x.trim());
if(!['enable-owner','disable-owner'].includes(operation)||ids.length!==1||!/^[A-Za-z0-9._:@/-]{1,128}$/.test(ids[0]))throw Error('EXPLICIT_OWNER_OPERATION_REQUIRED');
const db=new sqlite3.Database(DB_PATH);db.configure('busyTimeout',10000);
const sql=operation==='enable-owner'?"INSERT INTO tutor_rollout(user_id,expires_at,reason,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET expires_at=excluded.expires_at,reason=excluded.reason,updated_at=excluded.updated_at":"DELETE FROM tutor_rollout WHERE user_id=?";
const expiry=Date.now()+7*24*3600*1000;
db.run(sql,operation==='enable-owner'?[ids[0],expiry,'Owner-approved bounded tutor pilot',Date.now()]:[ids[0]],e=>{if(e){console.error('ROLLOUT_WRITE_FAILED');process.exitCode=1;}else console.log(JSON.stringify({operation,owner_count:1,expires_at:operation==='enable-owner'?new Date(expiry).toISOString():null}));db.close();});
