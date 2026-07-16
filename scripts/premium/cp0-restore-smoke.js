#!/usr/bin/env node
"use strict";
process.env.CP0_OBSERVER_ENABLED="1";process.env.CP0_OBSERVER_OWNER_IDS="u1";
const path=require("path"),sqlite3=require("sqlite3"),dbh=require("./lib/cp0-test-db"),cp0=require("../../agent/controlPlane/observer"),identity=require("../../db/identityRepo"),sqlite=require("../../db/sqlite");
const {createBackup,restoreBackup}=require("../../db/backup");const {replayDeletionJournal}=require("../../db/restoreErasureReplay");
const allFile=(file,sql,p=[])=>new Promise((resolve,reject)=>{const db=new sqlite3.Database(file,sqlite3.OPEN_READONLY,(e)=>{if(e)return reject(e);db.all(sql,p,(x,rows)=>db.close(()=>x?reject(x):resolve(rows||[])));});});
(async()=>{const ctx=await dbh.setup("cp0-restore");try{await cp0.observe({userId:"u1",surface:"pwa"},{scenarioId:"agent.plan"},async()=>({ok:true}));await cp0.shutdownForEvidence();
  const backupsDir=path.join(ctx.dir,"backups"),old=createBackup(ctx.dbPath,{label:"old-before-delete",backupsDir});if(!old.ok)throw new Error(old.error);await identity.deleteUserData("u1");await sqlite.closeDb();
  const restored=restoreBackup(old.backupPath,ctx.dbPath,{backupsDir});if(!restored.ok||!restored.preRestoreBackup)throw new Error(restored.error||"no pre-restore backup");const replay=await replayDeletionJournal(restored.preRestoreBackup,ctx.dbPath);if(!replay.ok)throw new Error(replay.error);
  const users=await allFile(ctx.dbPath,"SELECT id FROM users ORDER BY id"),cpRows=await allFile(ctx.dbPath,"SELECT user_id FROM cp0_observations"),journal=await allFile(ctx.dbPath,"SELECT user_id FROM deletion_journal WHERE user_id='u1'");
  if(users.some(r=>r.id==="u1")||cpRows.some(r=>r.user_id==="u1")||!users.some(r=>r.id==="u2")||journal.length!==1)throw new Error("restore erasure replay failed");
  console.log(JSON.stringify({ok:true,replayed_users:replay.replayed_users,restored_cp0_rows_removed:true,other_user_preserved:true,journal_rows:journal.length}));}finally{await dbh.cleanup(ctx);}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1);});
