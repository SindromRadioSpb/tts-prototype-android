// Ф4 · Д8-К3: one history per word — the alias rule shared by the client and the mentor's server.
const test = require("node:test");
const assert = require("node:assert");
const KA = require("../public/js/key-alias-core.js");

const ev = (oldK, to, at, id) => Object.assign(KA.aliasRow(oldK, to, at), id ? { id } : {});
const rv = (key, at, grade) => ({ id: key + "@" + at, item_key: key, kind: "review", reviewed_at: at, grade: grade || 3, source: "room" });

test("the latest decision wins; an alias to itself is an undo", () => {
  const rows = [ev("אביו#", "pid:1", "2026-10-01T00:00:00.000Z"), ev("אביו#", "pid:2", "2026-10-02T00:00:00.000Z"), rv("pid:1", "2026-09-01T00:00:00.000Z")];
  assert.strictEqual(KA.mapFromRows(rows).get("אביו#"), "pid:2");
  rows.push(ev("אביו#", "אביו#", "2026-10-03T00:00:00.000Z"));
  assert.strictEqual(KA.mapFromRows(rows).has("אביו#"), false);
});

test("canonical follows a chain and stops on a cycle", () => {
  const map = KA.mapFromRows([ev("a#", "b#", "2026-10-01T00:00:00.000Z"), ev("b#", "dl:c#noun", "2026-10-01T00:00:00.000Z")]);
  assert.strictEqual(KA.canonical(map, "a#"), "dl:c#noun");
  assert.strictEqual(KA.canonical(map, "x#"), "x#");
  const cyc = KA.mapFromRows([ev("a#", "b#", "2026-10-01T00:00:00.000Z"), ev("b#", "a#", "2026-10-01T00:00:00.000Z")]);
  assert.ok(["a#", "b#"].includes(KA.canonical(cyc, "a#")));
});

test("members and merged rows: the union by time, alias events are not reviews", () => {
  const rows = [ev("אביו#", "pid:7", "2026-10-05T00:00:00.000Z"), rv("pid:7", "2026-10-02T00:00:00.000Z"), rv("אביו#", "2026-10-01T00:00:00.000Z"), rv("אביו#", "2026-10-03T00:00:00.000Z")];
  const map = KA.mapFromRows(rows);
  assert.deepStrictEqual(KA.membersOf(map, "pid:7"), ["pid:7", "אביו#"]);
  const merged = KA.mergeRows([rows.filter((r) => r.item_key === "pid:7"), rows.filter((r) => r.item_key === "אביו#")]);
  assert.deepStrictEqual(merged.map((r) => r.reviewed_at.slice(8, 10)), ["01", "02", "03"]);
  assert.ok(merged.every((r) => r.kind !== "alias"));
  assert.deepStrictEqual(KA.touchedKeys(rows), ["אביו#", "pid:7"]);
});

test("the event: deterministic id per decision, a valid log row; the validator", () => {
  const a = KA.aliasRow("אביו#", "pid:7", "2026-10-05T00:00:00.000Z", "d8k3");
  assert.strictEqual(a.id, KA.aliasRow("אביו#", "pid:7", "2026-10-05T00:00:00.000Z").id);
  assert.notStrictEqual(a.id, KA.aliasRow("אביו#", "pid:7", "2026-10-06T00:00:00.000Z").id);
  assert.deepStrictEqual([a.kind, a.grade, a.source, JSON.parse(a.meta_json).alias_to], ["alias", null, "identity", "pid:7"]);
  assert.ok(a.id.length < 200);
  assert.deepStrictEqual(KA.validate(a), { ok: true });
  assert.strictEqual(KA.validate({ kind: "alias", meta_json: "{}" }).ok, false);
  assert.strictEqual(KA.validate({ kind: "alias", grade: 3, meta_json: JSON.stringify({ alias_to: "x" }) }).ok, false);
  assert.deepStrictEqual(KA.validate(rv("x", "2026-10-01T00:00:00.000Z")), { ok: true });
});
