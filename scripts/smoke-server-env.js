"use strict";
const path = require("node:path");

// Smoke servers never inherit operator credentials, feature flags or storage paths.
function smokeServerEnv(dataDir, port, inherited = process.env) {
  const env = {};
  const systemKeys = new Set(["path", "systemroot", "windir", "systemdrive", "comspec", "temp", "tmp", "lang", "lc_all"]);
  for (const [key, value] of Object.entries(inherited)) {
    if (systemKeys.has(key.toLowerCase())) env[key] = value;
  }
  return { ...env, NODE_ENV: "test", BIND_HOST: "127.0.0.1", DATA_DIR: dataDir,
    DB_PATH: path.join(dataDir, "app.db"), PORT: String(port) };
}

// Suppress repo .env loading only in the disposable child, not in the app.
const SMOKE_SERVER_BOOTSTRAP = `
require("dotenv").config = () => ({ parsed: {} });
const http = require("node:http");
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  this.once("listening", () => process.send({ type: "smoke-listening", port: this.address().port }));
  return listen.apply(this, args);
};
require("./server.js");`;

function waitForSmokeServer(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const finish = (error, port) => {
      clearTimeout(timer);
      child.removeListener("message", message);
      child.removeListener("exit", exit);
      child.removeListener("error", failed);
      if (error) reject(error); else resolve(port);
    };
    const message = msg => {
      if (msg && msg.type === "smoke-listening" && Number.isInteger(msg.port) && msg.port > 0) finish(null, msg.port);
    };
    const exit = code => finish(new Error(`Smoke server exited before listening (${code})`));
    const failed = error => finish(error);
    const timer = setTimeout(() => finish(new Error("Smoke server did not start listening")), timeoutMs);
    child.on("message", message);
    child.once("exit", exit);
    child.once("error", failed);
  });
}
module.exports = { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer };
