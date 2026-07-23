#!/usr/bin/env node
"use strict";

// H2.4 deterministic integration smoke. The upstream is a loopback mock that
// reproduces the token-array shape observed from Nakdan 5.1 on 2026-07-23.
// This file must never contact the live Dicta endpoint.

const assert = require("assert/strict");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { createNakdanClient, sourceHash } = require("../../db/premium/nakdanOnDemand");
const derived = require("../../public/js/nakdan-derived-core");

const REPO = path.resolve(__dirname, "..", "..");

function tokenResponse(text) {
  const vocalized = String(text)
    .replace(/שלום/g, "שָׁלוֹם")
    .replace(/עולם/g, "עוֹלָם")
    .replace(/אני/g, "אֲנִי")
    .replace(/לומד/g, "לוֹמֵד")
    .replace(/עברית/g, "עִבְרִית");
  return vocalized.split(/(\s+|[.,!?])/u).filter(Boolean).map((part) => {
    if (/^(\s+|[.,!?])$/u.test(part)) return { word: part, sep: true, options: [], fpasuk: [] };
    return { word: part.replace(/[\u0591-\u05c7]/g, ""), sep: false, options: [part], fpasuk: [] };
  });
}

async function startMock() {
  const state = { calls: 0, failing: false, active: 0, maxActive: 0, bodies: [] };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      state.calls++;
      state.active++;
      state.maxActive = Math.max(state.maxActive, state.active);
      let body = {};
      try { body = JSON.parse(raw); } catch (_) {}
      state.bodies.push(body);
      setTimeout(() => {
        state.active--;
        res.setHeader("Content-Type", "application/json");
        if (state.failing) { res.statusCode = 503; res.end(JSON.stringify({ error: "offline" })); return; }
        res.end(JSON.stringify(tokenResponse(body.data || "")));
      }, 5);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, state, url: `http://127.0.0.1:${address.port}/api` };
}

function read(rel) { return fs.readFileSync(path.join(REPO, rel), "utf8"); }

(async () => {
  const mock = await startMock();
  const checks = [];
  const pass = (name) => checks.push(name);
  try {
    let clock = 100_000;
    const client = createNakdanClient({
      url: mock.url,
      now: () => clock,
      sleep: async (ms) => { clock += ms; },
      timeoutMs: 1_000,
    });

    const input = "שלום עולם.\nאני לומד עברית.";
    const first = await client.vocalize(input);
    assert.equal(first.niqqud, "שָׁלוֹם עוֹלָם.\nאֲנִי לוֹמֵד עִבְרִית.");
    assert.match(first.niqqud_provenance, /^DICTA_NAKDAN_\d{4}_\d{2}_\d{2}$/);
    assert.equal(first.source_hash, sourceHash(input));
    assert.deepEqual(mock.state.bodies[0], { task: "nakdan", genre: "modern", data: input, addmorph: false, keepqq: false });
    pass("preview parses observed Nakdan token shape and records provenance");

    const cached = await client.vocalize(input);
    assert.equal(cached.from_cache, true);
    assert.equal(mock.state.calls, 1, "unchanged text must not reach upstream twice");
    const beforeConcurrent = mock.state.calls;
    const concurrent = await Promise.all([client.vocalize("שלום במקביל"), client.vocalize("שלום במקביל")]);
    assert.equal(mock.state.calls, beforeConcurrent + 1, "identical in-flight requests must be coalesced");
    assert.equal(concurrent[1].from_cache, true);
    pass("unchanged text is served from cache");

    const beforeSecond = clock;
    await client.vocalize("שלום אני");
    assert.ok(clock - beforeSecond >= 1_000, "upstream starts must be at least one second apart");
    assert.equal(mock.state.maxActive, 1, "client concurrency must remain one");
    pass("global client queue enforces <=1 request/s and concurrency 1");

    const rows = [
      { id: "s1", he_plain: "שלום עולם.", he_niqqud: "", meta_json: "{}", edit_meta_json: "{}" },
      { id: "s2", he_plain: "אני לומד עברית.", he_niqqud: "", meta_json: "{}", edit_meta_json: "{}" },
    ];
    const bodyHash = sourceHash(derived.plainBody(rows));
    const values = derived.splitLines(first.niqqud);
    const stored = rows.map((row, i) => ({ ...row, meta_json: derived.mergeDerivedMeta(row, values[i], {
      provenance: first.niqqud_provenance, source_hash: bodyHash,
      generated_at: first.generated_at, model_version: first.model_version,
    }) }));
    const projected = derived.applyProjection(stored, bodyHash);
    assert.deepEqual(projected.map((row) => row.niqqud_authority), ["DERIVED", "DERIVED"]);
    assert.equal(projected[0].he_niqqud, "שָׁלוֹם עוֹלָם.");
    assert.equal(derived.applyProjection(stored, sourceHash("текст изменён"))[0].he_niqqud, "");
    pass("derived cache projects only while the whole-body hash is unchanged");

    const asserted = { ...rows[0], he_niqqud: "שָׁלוֹם עוֹלָם מְאוּמָּת" };
    assert.throws(() => derived.mergeDerivedMeta(asserted, "machine", {
      provenance: first.niqqud_provenance, source_hash: bodyHash,
    }), /NIQQUD_ASSERTED_PROTECTED/);
    assert.equal(asserted.he_niqqud, "שָׁלוֹם עוֹלָם מְאוּמָּת");
    pass("verified or user niqqud cannot be overwritten");

    mock.state.failing = true;
    let failClock = 200_000;
    const failing = createNakdanClient({
      url: mock.url,
      now: () => failClock,
      sleep: async (ms) => { failClock += ms; },
      timeoutMs: 1_000,
    });
    const callsBeforeFailure = mock.state.calls;
    for (const text of ["שלום א", "שלום ב", "שלום ג"]) {
      await assert.rejects(failing.vocalize(text), (error) => error && error.code === "NAKDAN_UNAVAILABLE");
    }
    const callsAfterThree = mock.state.calls;
    await assert.rejects(failing.vocalize("שלום ד"), (error) => error && error.code === "NAKDAN_UNAVAILABLE");
    assert.equal(callsAfterThree, callsBeforeFailure + 3);
    assert.equal(mock.state.calls, callsAfterThree, "open circuit must reject without another upstream call");
    const importRowsAfterFailure = rows.map((row) => ({ ...row }));
    assert.deepEqual(importRowsAfterFailure.map((row) => row.he_plain), ["שלום עולם.", "אני לומד עברית."]);
    assert.deepEqual(importRowsAfterFailure.map((row) => row.he_niqqud), ["", ""]);
    pass("NAKDAN_UNAVAILABLE is typed, circuit opens, and plain import remains valid");

    const server = read("server.js");
    assert.match(server, /app\.post\("\/api\/niqqud\/on-demand", requireSameOriginJson, rlNakdanOnDemand/);
    assert.match(server, /requireUser\(req, res\)/);
    assert.match(server, /requireCsrf\(req, res, auth\)/);
    const agent = read("public/js/agent-access.js");
    assert.match(agent, /saveDerivedNiqqud\(textId,nq\)/);
    assert.match(agent, /catch\(machineError\)/);
    assert.match(read("public/js/library-ui.js"), /purpose: 'LIBRARY_OWNER'/);
    for (const locale of ["ru", "en", "he"]) assert.match(read(`public/i18n/locales/${locale}.js`), /nakdan:\s*\{/);
    assert.match(read("public/sw.js"), /CACHE_VERSION = "v3\.11\.237"/);
    pass("server boundary, both UI entry points, locales, and SW bump are wired");

    console.log(`PASS smoke:nakdan-integration (${checks.length} checks)`);
    for (const check of checks) console.log(`  - ${check}`);
  } finally {
    await new Promise((resolve) => mock.server.close(resolve));
  }
})().catch((error) => {
  console.error("FAIL smoke:nakdan-integration");
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
