"use strict";
// Production collection policy, disposable identity DB and local fake Umami.
const assert = require("node:assert/strict");
const http = require("node:http"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawn } = require("node:child_process"), { randomUUID } = require("node:crypto");
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require("./smoke-server-env");

async function main() {
  const received = []; let outage = false;
  const fake = http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    res.setHeader("Content-Type", "application/json");
    if (outage) { res.statusCode = 503; return res.end('{}'); }
    if (req.url === "/api/send") { received.push(JSON.parse(body)); return res.end('{}'); }
    if (req.url === "/api/auth/login") return res.end('{"token":"disposable-token"}');
    res.end(req.url.includes("/stats?") ? '{"visits":0,"visitors":0,"pageviews":0}' : '[]');
  });
  await new Promise(r => fake.listen(0, "127.0.0.1", r));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-owner-collection-"));
  const secret = "disposable-owner-collection-0123456789";
  const child = spawn(process.execPath, ["-e", SMOKE_SERVER_BOOTSTRAP], {
    cwd: path.resolve(__dirname, ".."), stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...smokeServerEnv(scratch, 0), NODE_ENV: "production", AUTH_BOOTSTRAP_SECRET: secret,
      PRODUCT_PULSE_ENABLED: "true", UMAMI_BASE_URL: "http://127.0.0.1:" + fake.address().port,
      UMAMI_WEBSITE_ID: "disposable-site", UMAMI_USERNAME: "fixture", UMAMI_PASSWORD: "fixture" },
  });
  let logs = ""; child.stdout.on("data", x => logs += x); child.stderr.on("data", x => logs += x);
  try {
    const base = "http://127.0.0.1:" + await waitForSmokeServer(child, 30000);
    for (let i = 0; i < 100; i++) {
      const h = await fetch(base + "/healthz").then(r => r.json());
      if (h.db?.ready && h.migrations?.ready) break;
      await new Promise(r => setTimeout(r, 100));
    }
    const login = await fetch(base + "/api/auth/bootstrap-login", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const config = headers => fetch(base + "/api/product-pulse/v1/config", { headers }).then(r => r.json());
    assert.equal((await config({ cookie })).collect, true, "real owner must collect");
    assert.equal((await config({})).collect, true, "anonymous visitor must collect");
    assert.equal((await config({ cookie, "X-Product-Pulse-Exclude": "1" })).collect, false);
    const makeEvent = surface => ({ schema_version: 2, event_id: randomUUID(), session_id: randomUUID(),
      event_name: "app_open", app_version: "3.11.609", occurred_at: new Date().toISOString(), properties: { surface } });
    const send = (event, extra = {}) => fetch(base + "/api/product-pulse/v1/events", { method: "POST",
      headers: { cookie, "Content-Type": "application/json", ...extra }, body: JSON.stringify(event) }).then(r => r.json());
    for (const surface of ["studio", "reading_room", "mediatheque"]) {
      const e = makeEvent(surface), before = received.length;
      assert.equal((await send(e)).accepted, true);
      assert.equal(received.length - before, 2, "one pageview and one named app_open");
      assert.equal((await send(e)).duplicate, true);
      assert.equal(received.length - before, 2, "duplicate must not reach Umami");
    }
    const before = received.length;
    assert.equal((await send(makeEvent("studio"), { "X-Product-Pulse-Exclude": "1" })).reason, "excluded");
    assert.equal(received.length, before);
    assert.equal((await fetch(base + "/api/product-pulse/v1/dashboard", { headers: { cookie } })).status, 200);
    assert.equal((await fetch(base + "/api/product-pulse/v1/dashboard?preview=1")).status, 401);
    assert.equal((await fetch(base + "/pulse.html?preview=1")).status, 401);
    outage = true;
    assert.equal((await send(makeEvent("studio"))).reason, "delivery_unavailable");
    assert.equal((await fetch(base + "/healthz").then(r => r.json())).ok, true);
    assert.equal(JSON.stringify(received).includes(cookie), false);
    assert.equal(JSON.stringify(received).includes('"role"'), false);
    console.log("OWNER COLLECTION PASS: production HTTP config + delivery for Studio/Room/Mediatheque, exact pageviews/named events, dedupe, opt-out, owner read auth, outage isolation, no cookie/role upstream");
  } catch (e) { console.error(logs.slice(-1500)); throw e; }
  finally {
    const exited = new Promise(r => child.once("exit", r)); child.kill(); await exited;
    await new Promise(r => fake.close(r));
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
