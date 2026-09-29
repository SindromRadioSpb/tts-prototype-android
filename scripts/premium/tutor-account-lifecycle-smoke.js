#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fixture = require("./lib/cp0-test-db");
const identity = require("../../db/identityRepo");

(async () => {
  const ctx = await fixture.setup("cp0-tutor-account");
  try {
    for (const [user, suffix] of [["u1", "a"], ["u2", "b"]]) {
      await ctx.run("INSERT INTO tutor_connections(id,user_id,token_hash,consent_revision,created_at) VALUES(?,?,?,?,1)", ["conn-"+suffix,user,"token-"+suffix,"v1"]);
      await ctx.run("INSERT INTO tutor_pairings(user_id,code_hash,expires_at) VALUES(?,?,100)", [user,"code-"+suffix]);
      await ctx.run("INSERT INTO tutor_enrollments(device_hash,code_hash,client_nonce,device_name,expires_at,user_id) VALUES(?,?,?,?,100,?)", ["device-"+suffix,"enroll-"+suffix,"nonce-"+suffix,"Device",user]);
      await ctx.run("INSERT INTO tutor_sessions(id,user_id,connection_id,request_key,request_hash,context_json,question,state,created_at,expires_at,result_json,result_hash) VALUES(?,?,?,?,?,?,?,'completed',1,100,?,?)", ["session-"+suffix,user,"conn-"+suffix,"key-"+suffix,"request-"+suffix,"{}","Question " + suffix,"{\"text\":\"Answer\"}","result-"+suffix]);
      await ctx.run("INSERT INTO tutor_practice(session_id,challenge_json,attempt_key,attempt_hash,receipt_json,proposal_state) VALUES(?,?,?,?,?,'completed')", ["session-"+suffix,"{\"expected\":\"word\"}","attempt-"+suffix,"attempt-hash-"+suffix,"{\"outcome\":\"source_match\"}"]);
    }
    const before = await identity.countUserRows("u1");
    assert.equal(before.perTable.tutor_practice, 1);
    const exported = await identity.exportUserData("u1");
    assert.equal(exported.tables.tutor_practice.length, 1);
    assert.equal(exported.tables.tutor_practice[0].session_id, "session-a");
    assert.equal(exported.table_list.filter(name => name === "tutor_practice").length, 1);
    const text = JSON.stringify(exported);
    for (const secret of ["token-a", "code-a", "enroll-a", "device-a", "nonce-a", "request-a", "result-a", "attempt-hash-a", "attempt-a", "key-a"])
      assert.equal(text.includes(secret), false, "export exposed " + secret);
    assert.equal(text.includes("session-b"), false);
    assert.equal(exported.tables.tutor_practice[0].receipt_json, '{"outcome":"source_match"}');
    const deleted = await identity.deleteUserData("u1");
    assert.equal(deleted.tables.includes("tutor_practice"), true);
    assert.equal((await identity.countUserRows("u1")).total, 0);
    assert.equal((await ctx.get("SELECT COUNT(*) c FROM tutor_practice WHERE session_id='session-a'")).c, 0);
    assert.equal((await ctx.get("SELECT COUNT(*) c FROM tutor_practice WHERE session_id='session-b'")).c, 1);
    console.log("tutor account export/delete isolation PASS");
  } finally { await fixture.cleanup(ctx); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
