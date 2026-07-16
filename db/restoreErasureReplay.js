"use strict";

const sqlite3 = require("sqlite3");

function open(file, mode) { return new Promise((resolve, reject) => { const db = new sqlite3.Database(file, mode, (e) => e ? reject(e) : resolve(db)); }); }
function all(db, sql, params=[]) { return new Promise((resolve,reject)=>db.all(sql,params,(e,r)=>e?reject(e):resolve(r||[]))); }
function run(db, sql, params=[]) { return new Promise((resolve,reject)=>db.run(sql,params,function(e){e?reject(e):resolve(this);})); }
function exec(db, sql) { return new Promise((resolve,reject)=>db.exec(sql,(e)=>e?reject(e):resolve())); }
function close(db) { return new Promise((resolve)=>db.close(()=>resolve())); }

async function userScopedTables(db) {
  const tables = await all(db, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
  const out=[];
  for(const t of tables){
    if(t.name === "deletion_journal") continue;
    const cols=await all(db, `PRAGMA table_info("${String(t.name).replace(/"/g,'""')}")`);
    if(cols.some((c)=>c.name === "user_id")) out.push(t.name);
  }
  return out;
}

async function replayDeletionJournal(preRestoreDbPath, restoredDbPath) {
  let source=null,target=null;
  try {
    source=await open(preRestoreDbPath, sqlite3.OPEN_READONLY);
    let deleted=[];
    try { deleted=await all(source,"SELECT user_id,deleted_at,tables_purged_json FROM deletion_journal ORDER BY deleted_at,user_id"); }
    catch(e){ if(/no such table/i.test(String(e&&e.message))) deleted=[]; else throw e; }
    if(!deleted.length) return {ok:true,replayed_users:0,deleted_rows:0};
    target=await open(restoredDbPath, sqlite3.OPEN_READWRITE);
    await exec(target,"PRAGMA foreign_keys=ON;");
    const tables=await userScopedTables(target);
    await exec(target,"BEGIN IMMEDIATE;");
    let deletedRows=0;
    try {
      for(const j of deleted){
        const uid=String(j.user_id);
        let chatIds=[];
        try { chatIds=(await all(target,"SELECT telegram_chat_id FROM channel_links WHERE user_id=?",[uid])).map((r)=>String(r.telegram_chat_id)); } catch(_) {}
        for(const table of tables){
          const q=`DELETE FROM "${String(table).replace(/"/g,'""')}" WHERE user_id=?`;
          const rr=await run(target,q,[uid]);deletedRows+=Number(rr.changes)||0;
        }
        for(const chatId of chatIds){
          try { const rr=await run(target,"DELETE FROM bot_action_log WHERE user_id IS NULL AND telegram_chat_id=?",[chatId]);deletedRows+=Number(rr.changes)||0; } catch(_) {}
        }
        try { const rr=await run(target,"DELETE FROM users WHERE id=?",[uid]);deletedRows+=Number(rr.changes)||0; } catch(_) {}
        await run(target,`INSERT INTO deletion_journal (user_id,deleted_at,tables_purged_json)
          SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM deletion_journal WHERE user_id=? AND deleted_at=?)`,
          [uid,String(j.deleted_at),String(j.tables_purged_json||"[]"),uid,String(j.deleted_at)]);
      }
      await exec(target,"COMMIT;");
    }catch(e){try{await exec(target,"ROLLBACK;");}catch(_){}throw e;}
    return {ok:true,replayed_users:new Set(deleted.map((x)=>String(x.user_id))).size,deleted_rows:deletedRows};
  } catch(e) { return {ok:false,error:String(e&&e.message||e)}; }
  finally { if(source)await close(source);if(target)await close(target); }
}

module.exports={replayDeletionJournal};
