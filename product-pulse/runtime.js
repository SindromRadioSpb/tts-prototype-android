"use strict";
const { randomUUID } = require("crypto");
const { anonymousEventKey, durationBucket } = require("./contract");

function createDelivery(client, { now = Date.now, limit = 8, capacity = 20000 } = {}) {
  const seen = new Map(); let active = 0;
  const counters = { delivered: 0, unavailable: 0, saturated: 0 };
  async function deliver(event) {
    const time = now();
    for (const [key, at] of seen) { if (time - at > 86400000) seen.delete(key); else break; }
    const key = anonymousEventKey(event);
    if (seen.has(key)) return { accepted: false, duplicate: true };
    if (active >= limit || seen.size >= capacity) { counters.saturated++; return { accepted: false, reason: "capacity" }; }
    // At-most-once delivery, including failures: no browser retry queue.
    seen.set(key, time); active++;
    try { const result = await client.send(event); if(result.accepted) counters.delivered++; else counters.unavailable++; return result; }
    catch (_) { counters.unavailable++; return { accepted: false, reason: "delivery_unavailable" }; }
    finally { active--; }
  }
  return { deliver, counters };
}

function operationMiddleware({ deliver, excluded, version, now = Date.now }) {
  const routes = { "/api/tts": "tts", "/api/translate-table": "translate_table", "/api/translate-table-v2": "translate_table" };
  return (req, res, next) => {
    const operation = req.method === "POST" && routes[req.path];
    if (!operation) return next();
    const begin = now(); let sent = false;
    function end(result) {
      if (sent) return; sent = true;
      // Runs after the response; analytics cannot delay the operation.
      Promise.resolve().then(async () => {
        if (await excluded(req)) return;
        await deliver({ schema_version: 2, event_id: randomUUID(), session_id: randomUUID(),
          occurred_at: new Date(now()).toISOString(), app_version: version,
          event_name: "operation_result", properties: { surface: "unknown", operation, result, duration_bucket: durationBucket(now() - begin) } });
      }).catch(() => {});
    }
    res.once("finish", () => end(res.statusCode >= 200 && res.statusCode < 300 ? "success" : "failure"));
    res.once("close", () => { if (!res.writableFinished) end("cancelled"); });
    next();
  };
}
module.exports = { createDelivery, operationMiddleware };
