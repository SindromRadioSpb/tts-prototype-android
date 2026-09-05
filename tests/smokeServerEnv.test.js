"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require("../scripts/smoke-server-env");
const vm = require("node:vm");

test("smoke server isolates all storage and drops inherited credentials and background flags", () => {
  const root = path.resolve("disposable-smoke");
  const env = smokeServerEnv(root, 3107, {
    Path: "system-path", SystemRoot: "windows", DB_PATH: "owner.db", DATA_DIR: "owner",
    AUDIO_CACHE_DIR: "owner-audio", BACKUPS_DIR: "owner-backups", GOOGLE_API_KEY: "sentinel",
    AGENT_ACCESS_ENABLED: "1", TELEGRAM_BOT_TOKEN: "sentinel", NODE_OPTIONS: "--require=operator.js",
  });
  assert.deepEqual(env, { Path: "system-path", SystemRoot: "windows", NODE_ENV: "test", BIND_HOST: "127.0.0.1",
    DATA_DIR: root, DB_PATH: path.join(root, "app.db"), PORT: "3107" });
});

test("readiness requires the spawned child's listening receipt and fails if it exits", async () => {
  const { EventEmitter } = require("node:events");
  const child = new EventEmitter();
  const ready = waitForSmokeServer(child);
  child.emit("message", { type: "other", port: 3000 });
  child.emit("message", { type: "smoke-listening", port: 54321 });
  assert.equal(await ready, 54321);
  assert.equal(child.listenerCount("message"), 0);
  const stopped = new EventEmitter();
  const failed = waitForSmokeServer(stopped);
  stopped.emit("exit", 1);
  await assert.rejects(failed, /exited before listening/);
});

test("smoke bootstrap disables dotenv before loading the server", () => {
  const dotenv = { config: () => { throw new Error("must not load owner .env"); } };
  let started = false;
  vm.runInNewContext(SMOKE_SERVER_BOOTSTRAP, { require(name) {
    if (name === "dotenv") return dotenv;
    if (name === "node:http") return { Server: function Server() {} };
    assert.equal(name, "./server.js");
    assert.equal(Object.keys(dotenv.config().parsed).length, 0);
    started = true;
  } });
  assert.equal(started, true);
});
