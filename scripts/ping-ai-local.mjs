#!/usr/bin/env node
/**
 * Minimal Node client that proves the Node ↔ Python plumbing works.
 * Exits non-zero on any failure so it can gate CI or npm scripts.
 *
 * Usage:
 *   node scripts/ping-ai-local.mjs
 *   node scripts/ping-ai-local.mjs --translate
 */

const HOST = process.env.AI_LOCAL_HOST || "127.0.0.1";
const PORT = process.env.AI_LOCAL_PORT || "8799"; // 8765 = AnkiConnect; see pythonClient
const BASE = `http://${HOST}:${PORT}`;
const WANT_TRANSLATE = process.argv.includes("--translate");

async function call(path, init) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, init);
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) {
    throw new Error(`${init?.method || "GET"} ${path} → ${r.status}: ${text}`);
  }
  return body;
}

(async () => {
  console.log(`ping ${BASE}/healthz`);
  const health = await call("/healthz");
  console.log("  →", JSON.stringify(health));

  console.log("POST /models/warmup { nakdan }");
  const warmup = await call("/models/warmup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "nakdan" }),
  });
  console.log("  →", JSON.stringify(warmup));

  console.log("POST /nakdan");
  const nakdan = await call("/nakdan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texts: ["שלום עולם"] }),
  });
  console.log("  →", JSON.stringify(nakdan));

  if (WANT_TRANSLATE) {
    console.log("POST /translate (first call: cold-start ~20-40s)");
    const t0 = Date.now();
    const translated = await call("/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        segments: [{ index: 1, he: "שלום עולם" }],
        target: "ru",
      }),
    });
    console.log(`  → (${Date.now() - t0} ms)`, JSON.stringify(translated));
  }

  console.log("\nOK");
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
