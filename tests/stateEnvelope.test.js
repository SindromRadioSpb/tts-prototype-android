// O-088: state_bundle travels as a gzip envelope; the server stores it as is, checks it inflates,
// and hands old clients (no ?enc=gzip) the plain JSON. Text bundles never take the envelope.
const test = require("node:test");
const assert = require("node:assert");
const CloudSync = require("../public/js/cloud-sync.js");
const T = require("../scripts/premium/lib/cp0-test-db");
const laRepo = require("../db/learnerArtifactsRepo");

const state = () => ({ format: "linguistpro-state-v1", schema_version: 1, updated_at: "2026-10-14T00:00:00.000Z",
  state: { notes: Array.from({ length: 400 }, (_, i) => ({ id: "n" + i, title: "שָׁלוֹם", body_json: JSON.stringify({ meaning: "мир " + i }) })), occurrences: [] } });

test("pack/unpack round-trip; the envelope is much smaller; a plain payload passes unpack unchanged", async () => {
  assert.strictEqual(CloudSync.STATE_ENVELOPE_FORMAT, laRepo.STATE_ENVELOPE_FORMAT);
  const s = state();
  const env = await CloudSync.packState(s);
  assert.strictEqual(env.format, CloudSync.STATE_ENVELOPE_FORMAT);
  assert.strictEqual(env.inner_format, "linguistpro-state-v1");
  assert.ok(JSON.stringify(env).length * 3 < JSON.stringify(s).length);
  assert.deepStrictEqual(await CloudSync.unpackState(env), s);
  assert.strictEqual(await CloudSync.unpackState(s), s);
});

test("server: envelope stored for state only, verified by inflating; old clients get plain JSON", async () => {
  const ctx = await T.setup("cp0-state-envelope");
  try {
    const s = state();
    const env = await CloudSync.packState(s);
    const at = "2026-10-01T00:00:00.000Z";
    assert.deepStrictEqual(await laRepo.put("u1", "d1", { kind: "state_bundle", artifact_key: "__state__", updated_at: at, payload: env }), { ok: true, stored: true });
    const row = await laRepo.get("u1", "__state__", "state_bundle");
    assert.strictEqual(JSON.parse(row.payload_json).format, CloudSync.STATE_ENVELOPE_FORMAT);
    assert.deepStrictEqual(JSON.parse(await laRepo.payloadJsonFor(row, false)), s);
    assert.strictEqual(await laRepo.payloadJsonFor(row, true), row.payload_json);
    // a text bundle never takes the envelope (the agent and the meta read its JSON)
    assert.deepStrictEqual(await laRepo.put("u1", "d1", { artifact_key: "text-1", updated_at: at, payload: env }), { ok: false, error: "BAD_ENCODING" });
    // a broken blob is refused, not stored
    const bad = Object.assign({}, env, { data: Buffer.from("not gzip").toString("base64") });
    assert.deepStrictEqual(await laRepo.put("u1", "d1", { kind: "state_bundle", artifact_key: "__state__", updated_at: "2026-10-02T00:00:00.000Z", payload: bad }), { ok: false, error: "BAD_ENCODING" });
    // a plain (old-client) state still works and is passed through unchanged
    await laRepo.put("u2", "d1", { kind: "state_bundle", artifact_key: "__state__", updated_at: at, payload: s });
    const plain = await laRepo.get("u2", "__state__", "state_bundle");
    assert.strictEqual(await laRepo.payloadJsonFor(plain, false), plain.payload_json);
  } finally { await T.cleanup(ctx); }
});
