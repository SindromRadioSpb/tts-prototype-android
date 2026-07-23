"use strict";

const crypto = require("crypto");
const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");
const groupCorpusRepo = require("./groupCorpusRepo");

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const get = (db, sql, p=[]) => new Promise((resolve,reject)=>db.get(sql,p,(e,r)=>e?reject(e):resolve(r||null)));
const all = (db, sql, p=[]) => new Promise((resolve,reject)=>db.all(sql,p,(e,r)=>e?reject(e):resolve(r||[])));
const run = (db, sql, p=[]) => new Promise((resolve,reject)=>db.run(sql,p,function(e){e?reject(e):resolve(this);}));
const exec = (db, sql) => new Promise((resolve,reject)=>db.exec(sql,(e)=>e?reject(e):resolve()));
const sha256 = (v) => crypto.createHash("sha256").update(String(v),"utf8").digest("hex");
const id = (prefix, bytes=16) => prefix + crypto.randomBytes(bytes).toString("hex");
const nowIso = () => new Date().toISOString();
function fail(code){const e=new Error(code);e.code=code;throw e;}
function db(){const out=getDb();if(!out)fail("DB_NOT_AVAILABLE");return out;}
function cleanToken(v){const s=String(v||"").trim();if(!/^[A-Za-z0-9_-]{40,100}$/.test(s))fail("GROUP_INVITE_INVALID");return s;}
function cleanUserId(v){const s=String(v||"").trim();if(!/^[A-Za-z0-9_.:-]{1,128}$/.test(s))fail("GROUP_MEMBER_NOT_FOUND");return s;}
function cleanDisplayName(v){const s=String(v||"").trim().replace(/\s+/g," ");if(!s||s.length>80||Buffer.byteLength(s,"utf8")>200)fail("GROUP_INVITE_DISPLAY_NAME_INVALID");return s;}

async function purgeOld(database){
  const cutoff=new Date(Date.now()-7*24*60*60*1000).toISOString();
  await run(database,`DELETE FROM group_access_invites WHERE (status!='ACTIVE' AND COALESCE(used_at,revoked_at,created_at)<?) OR expires_at<?`,[cutoff,cutoff]);
}

async function ownerContext(ownerId, corpusId){
  const corpus=await groupCorpusRepo.ownerCorpus(ownerId,corpusId);
  const group=await get(db(),`SELECT group_id,name FROM reading_groups WHERE group_id=? AND owner_user_id=? AND status='ACTIVE'`,[corpus.group_id,String(ownerId)]);
  if(!group)fail("GROUP_CORPUS_NOT_FOUND");
  return {corpus,group};
}

async function createInvite(ownerId, corpusId, options={}){
  const {corpus,group}=await ownerContext(ownerId,corpusId);const database=db();await purgeOld(database);
  const active=await get(database,`SELECT COUNT(*) c FROM group_access_invites WHERE group_id=? AND status='ACTIVE' AND expires_at>?`,[group.group_id,nowIso()]);
  if(Number(active&&active.c)>=50)fail("GROUP_INVITE_ACTIVE_LIMIT");
  let kind="JOIN",target=null;
  if(options.target_user_id){
    target=cleanUserId(options.target_user_id);kind="LOGIN";
    const m=await get(database,`SELECT m.user_id,u.display_name FROM reading_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? AND m.user_id=? AND m.role='MEMBER' AND m.status='ACTIVE'`,[group.group_id,target]);
    if(!m)fail("GROUP_MEMBER_NOT_FOUND");
  }
  const token=crypto.randomBytes(32).toString("base64url"),created=nowIso(),expires=new Date(Date.now()+INVITE_TTL_MS).toISOString(),inviteId=id("gi_",12);
  await run(database,`INSERT INTO group_access_invites(invite_id,group_id,corpus_id,kind,target_user_id,created_by_user_id,token_hash,status,expires_at,created_at) VALUES(?,?,?,?,?,?,?,'ACTIVE',?,?)`,[inviteId,group.group_id,corpus.corpus_id,kind,target,String(ownerId),sha256(token),expires,created]);
  return {invite_id:inviteId,kind,token,expires_at:expires,corpus_id:corpus.corpus_id,target_user_id:target};
}

async function inviteRow(token){
  const t=cleanToken(token),row=await get(db(),`SELECT i.*,g.name group_name,c.title corpus_title,u.display_name target_display_name FROM group_access_invites i JOIN reading_groups g ON g.group_id=i.group_id AND g.status='ACTIVE' JOIN group_corpora c ON c.corpus_id=i.corpus_id AND c.group_id=g.group_id AND c.status IN ('PILOT','ACTIVE') LEFT JOIN users u ON u.id=i.target_user_id WHERE i.token_hash=? AND i.status='ACTIVE' AND i.expires_at>? LIMIT 1`,[sha256(t),nowIso()]);
  if(!row)fail("GROUP_INVITE_INVALID");
  if(row.kind==="LOGIN"){
    const member=await get(db(),`SELECT 1 ok FROM reading_group_members WHERE group_id=? AND user_id=? AND role='MEMBER' AND status='ACTIVE'`,[row.group_id,row.target_user_id]);
    if(!member)fail("GROUP_INVITE_INVALID");
  }
  return {token:t,row};
}

async function preview(token){
  const {row}=await inviteRow(token);
  return {kind:row.kind,corpus_id:row.corpus_id,corpus_title:row.corpus_title,group_name:row.group_name,expires_at:row.expires_at,target_user_id:row.kind==="LOGIN"?row.target_user_id:null,target_display_name:row.kind==="LOGIN"?row.target_display_name:null};
}

async function redeem(token, options={}){
  const cleaned=cleanToken(token);const database=db();
  return withTxnLock(async()=>{await exec(database,"BEGIN IMMEDIATE");try{
    const row=await get(database,`SELECT i.*,g.status group_status,c.title corpus_title FROM group_access_invites i JOIN reading_groups g ON g.group_id=i.group_id JOIN group_corpora c ON c.corpus_id=i.corpus_id AND c.group_id=g.group_id AND c.status IN ('PILOT','ACTIVE') WHERE i.token_hash=? AND i.status='ACTIVE' AND i.expires_at>? LIMIT 1`,[sha256(cleaned),nowIso()]);
    if(!row||row.group_status!=="ACTIVE")fail("GROUP_INVITE_INVALID");
    let userId=row.target_user_id,displayName;
    if(row.kind==="JOIN"){
      displayName=cleanDisplayName(options.display_name);userId=id("u_");
      await run(database,`INSERT INTO users(id,role,display_name) VALUES(?,'member',?)`,[userId,displayName]);
      await run(database,`INSERT INTO reading_group_members(group_id,user_id,role,status,created_at,updated_at,revoked_at) VALUES(?,?,'MEMBER','ACTIVE',?,?,NULL)`,[row.group_id,userId,nowIso(),nowIso()]);
    }else{
      const member=await get(database,`SELECT u.display_name FROM reading_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? AND m.user_id=? AND m.role='MEMBER' AND m.status='ACTIVE'`,[row.group_id,userId]);
      if(!member)fail("GROUP_INVITE_INVALID");displayName=member.display_name;
    }
    const deviceId=id("d_",8),sessionId=id("s_",8),secret=crypto.randomBytes(32).toString("hex"),csrf=crypto.randomBytes(24).toString("hex"),created=nowIso(),expires=new Date(Date.now()+SESSION_TTL_MS).toISOString();
    await run(database,`INSERT INTO devices(id,user_id,label,last_seen_at) VALUES(?,?,?,?)`,[deviceId,userId,String(options.device_label||"group_invite").slice(0,120),created]);
    await run(database,`INSERT INTO user_sessions(id,user_id,device_id,token_hash,csrf_token,expires_at,ip,user_agent,session_kind,auth_method) VALUES(?,?,?,?,?,?,?,?, 'pwa','group_invite')`,[sessionId,userId,deviceId,sha256(secret),csrf,expires,String(options.ip||"").slice(0,64)||null,String(options.user_agent||"").slice(0,200)||null]);
    const used=await run(database,`UPDATE group_access_invites SET status='USED',used_at=?,used_by_user_id=? WHERE invite_id=? AND status='ACTIVE'`,[created,userId,row.invite_id]);
    if(used.changes!==1)fail("GROUP_INVITE_INVALID");await exec(database,"COMMIT");
    return {cookie_value:sessionId+"."+secret,csrf,expires_at:expires,user:{id:userId,role:"member",display_name:displayName},corpus:{corpus_id:row.corpus_id,title:row.corpus_title},kind:row.kind};
  }catch(e){try{await exec(database,"ROLLBACK");}catch(_){}throw e;}});
}

async function listAccess(ownerId,corpusId){
  const {corpus,group}=await ownerContext(ownerId,corpusId);const database=db();await purgeOld(database);
  const members=await all(database,`SELECT m.user_id,m.role,m.status,m.created_at,m.updated_at,m.revoked_at,u.display_name,
      (SELECT MAX(COALESCE(s.last_used_at,s.created_at)) FROM user_sessions s WHERE s.user_id=m.user_id AND s.auth_method='group_invite') last_sign_in_at
    FROM reading_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=?
    ORDER BY CASE m.role WHEN 'OWNER' THEN 0 ELSE 1 END,u.display_name,m.user_id`,[group.group_id]);
  const invites=await all(database,`SELECT invite_id,kind,target_user_id,status,expires_at,created_at,used_at,used_by_user_id,revoked_at
    FROM group_access_invites WHERE group_id=? ORDER BY created_at DESC LIMIT 100`,[group.group_id]);
  return {corpus,group,members,invites,refreshed_at:nowIso()};
}

async function revokeInvite(ownerId,corpusId,inviteId){
  const {group}=await ownerContext(ownerId,corpusId);const iid=String(inviteId||"");
  const r=await run(db(),`UPDATE group_access_invites SET status='REVOKED',revoked_at=? WHERE invite_id=? AND group_id=? AND status='ACTIVE'`,[nowIso(),iid,group.group_id]);
  if(r.changes!==1)fail("GROUP_INVITE_NOT_FOUND");return {invite_id:iid,revoked:true};
}

async function setMemberStatus(ownerId,corpusId,userId,status){
  const {group}=await ownerContext(ownerId,corpusId),uid=cleanUserId(userId),next=String(status||"");if(!["ACTIVE","REVOKED"].includes(next))fail("GROUP_MEMBER_STATUS_INVALID");
  return withTxnLock(async()=>{const database=db();await exec(database,"BEGIN IMMEDIATE");try{
    const member=await get(database,`SELECT role,status FROM reading_group_members WHERE group_id=? AND user_id=?`,[group.group_id,uid]);if(!member||member.role!=="MEMBER")fail("GROUP_MEMBER_NOT_FOUND");
    const at=nowIso();await run(database,`UPDATE reading_group_members SET status=?,updated_at=?,revoked_at=? WHERE group_id=? AND user_id=?`,[next,at,next==="REVOKED"?at:null,group.group_id,uid]);
    if(next==="REVOKED")await run(database,`UPDATE group_access_invites SET status='REVOKED',revoked_at=? WHERE group_id=? AND target_user_id=? AND status='ACTIVE'`,[at,group.group_id,uid]);
    await exec(database,"COMMIT");return {user_id:uid,status:next};
  }catch(e){try{await exec(database,"ROLLBACK");}catch(_){}throw e;}});
}

module.exports={INVITE_TTL_MS,createInvite,preview,redeem,listAccess,revokeInvite,setMemberStatus};
