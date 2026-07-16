#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");
const T = require("./lib/cp0-test-db");
const sqlite = require("../../db/sqlite");
const repo = require("../../db/agentAccessOAuthRepo");
const identity = require("../../db/identityRepo");
const restore = require("../../db/restoreErasureReplay");
const C = require("../../agent/access/oauthContracts");

const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null)));
const close = (db) => new Promise((resolve) => db.close(resolve));
const T0 = "2026-07-17T09:00:00.000Z";
const REDIRECT = "http://127.0.0.1:3210/callback";

(async () => {
  let ctx, old, opened;
  try {
    ctx = await T.setup("cp0-agent-access-restore");
    await repo.registerClientFixture({ oauth_client_id: "client-restore", display_name: "Restore fixture", software_id: "fixture", software_version: "1", redirect_uris: [REDIRECT], registration_version: "v1" }, T0);
    await repo.createSubjectMapping("u1", "subject-restore-opaque", "v1", T0);
    await repo.createPendingConnection("u1", { connection_id: "conn-restore", oauth_client_id: "client-restore", display_label: "Restore profile", consent_version: "aa-consent-v1", capability_version: "aa-v0.1", retention_notice_version: "aa-retention-v1" }, T0);
    await identity.recordConsent("u1", C.consentKey("conn-restore", "agent.connection.read"), true, "aa-consent-v1");
    await repo.activateConnectionWithGrants("u1", "conn-restore", ["agent.connection.read"], T0);
    await ctx.run("PRAGMA wal_checkpoint(FULL)");
    old = path.join(ctx.dir, "old-before-connection-delete.db");
    fs.copyFileSync(ctx.dbPath, old);
    await repo.deleteConnection("u1", "conn-restore", "USER_DELETE", "2026-07-17T09:05:00.000Z");
    await ctx.run("PRAGMA wal_checkpoint(FULL)");
    await sqlite.closeDb();

    const replay = await restore.replayDeletionJournal(ctx.dbPath, old);
    assert.strictEqual(replay.ok, true, JSON.stringify(replay));
    assert.strictEqual(replay.replayed_agent_connections, 1);
    opened = new sqlite3.Database(old, sqlite3.OPEN_READONLY);
    assert.strictEqual((await get(opened, `SELECT COUNT(*) c FROM agent_connections WHERE user_id='u1' AND connection_id='conn-restore'`)).c, 0);
    assert.strictEqual((await get(opened, `SELECT COUNT(*) c FROM agent_access_erasure_journal WHERE user_id='u1' AND connection_id='conn-restore'`)).c, 1);
    assert.strictEqual((await get(opened, `SELECT COUNT(*) c FROM users WHERE id='u2'`)).c, 1);
    console.log(JSON.stringify({ ok: true, replayed_agent_connections: 1, resurrected_connections: 0, other_user_preserved: true }));
  } finally {
    if (opened) await close(opened);
    try { await sqlite.closeDb(); } catch (_) {}
    if (ctx && fs.existsSync(ctx.dir)) fs.rmSync(ctx.dir, { recursive: true, force: true });
  }
})().catch((err) => { console.error(err && err.stack || err); process.exit(1); });
