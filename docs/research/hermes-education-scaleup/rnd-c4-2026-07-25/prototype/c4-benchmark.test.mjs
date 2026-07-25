import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { AFFIRMATION, blindResponses, buildPackets, chainLedger, createConsent, revokeConsent, scoreRatings, validateDataset } from "./c4-core.mjs";

function fixture() {
  return {
    schema_version: "c4.notes.1", dataset_class: "synthetic",
    notes: Array.from({ length: 20 }, (_, i) => ({
      source_note_id: `synthetic-${i + 1}`, word: `מילה${i + 1}`, query_context: `synthetic context ${i + 1}`,
      dictionary_facts: { pos: "noun", gloss: `generic ${i + 1}` },
      personal_note: { meaning: `owner distinction ${i + 1}`, mnemonic: i % 2 ? `mnemonic ${i + 1}` : "", explanation: "", example_sentence: "" },
    })),
  };
}

test("C4 dataset is exactly 20 unique personal notes", () => {
  assert.equal(validateDataset(fixture()).notes.length, 20);
  const bad = fixture(); bad.notes.pop();
  assert.throws(() => validateDataset(bad), /EXACTLY_20/);
});

test("C4 consent is exact, temporary, dataset-bound and revocable", () => {
  const ds = fixture();
  assert.throws(() => createConsent(ds, { affirmation: "yes" }), /AFFIRMATION/);
  const receipt = createConsent(ds, { affirmation: AFFIRMATION, now: new Date("2026-07-25T10:00:00Z"), ttlMinutes: 60 });
  assert.equal(buildPackets(ds, receipt, new Date("2026-07-25T10:30:00Z")).privatePackets.pairs.length, 20);
  assert.throws(() => buildPackets(ds, receipt, new Date("2026-07-25T11:00:00Z")), /EXPIRED/);
  const revoked = revokeConsent(receipt, new Date("2026-07-25T10:20:00Z"));
  assert.throws(() => buildPackets(ds, revoked, new Date("2026-07-25T10:30:00Z")), /REVOKED/);
});

test("C4 exposure ledger is content-free and hash-chained", () => {
  const ds = fixture(); const receipt = createConsent(ds, { affirmation: AFFIRMATION });
  const built = buildPackets(ds, receipt); const rows = chainLedger(built.ledgerEvents);
  assert.equal(rows.length, 20);
  assert.equal(rows[0].previous_event_sha256, "GENESIS");
  assert.equal(rows[1].previous_event_sha256, rows[0].event_sha256);
  const serialized = JSON.stringify(rows);
  assert.equal(serialized.includes("owner distinction"), false);
  assert.equal(serialized.includes("mnemonic 2"), false);
  assert.match(built.privatePackets.pairs[0].without_note, /label-blind benchmark/);
  assert.match(built.privatePackets.pairs[0].with_note, /OWNER_PERSONAL_NOTE/);
});

test("C4 blind scoring freezes 14/20 success and counts ties against success", () => {
  const responses = { responses: Array.from({ length: 20 }, (_, i) => ({ pair_id: `c4-pair-${String(i + 1).padStart(2, "0")}`, without_note: `A${i}`, with_note: `B${i}` })) };
  const { evaluation, mapping } = blindResponses(responses);
  assert.equal(evaluation.pairs.some((x) => Object.hasOwn(x, "with_note")), false);
  const ratings = { ratings: mapping.pairs.map((m, i) => ({ pair_id: m.pair_id, preferred: i < 14 ? m.with_note : "TIE" })) };
  const result = scoreRatings(ratings, mapping);
  assert.equal(result.verdict, "DONE_GO"); assert.equal(result.preference_rate, 0.7);
  ratings.ratings[13].preferred = "TIE";
  assert.equal(scoreRatings(ratings, mapping).verdict, "DONE_NO_GO");
});

test("C4 CLI flushes ledger before private packet exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c4-test-"));
  const notes = path.join(dir, "notes.json"), consent = path.join(dir, "consent.json");
  const ledger = path.join(dir, "exposure.jsonl"), packets = path.join(dir, "packets.json");
  fs.writeFileSync(notes, JSON.stringify(fixture()));
  const cli = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1")), "c4-benchmark.mjs");
  execFileSync(process.execPath, [cli, "consent", "--notes", notes, "--out", consent, "--affirmation", AFFIRMATION]);
  execFileSync(process.execPath, [cli, "prepare", "--notes", notes, "--consent", consent, "--ledger", ledger, "--out", packets]);
  assert.equal(fs.readFileSync(ledger, "utf8").trim().split(/\r?\n/).length, 20);
  assert.equal(JSON.parse(fs.readFileSync(packets, "utf8")).pairs.length, 20);
  execFileSync(process.execPath, [cli, "revoke", "--consent", consent]);
  assert.throws(() => execFileSync(process.execPath, [cli, "prepare", "--notes", notes, "--consent", consent, "--ledger", path.join(dir, "after-revoke.jsonl"), "--out", path.join(dir, "after-revoke.json")], { stdio: "pipe" }));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("C4 browser selector is OPFS-local and exports only the frozen sample", () => {
  const source = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1")), "export-owner-notes.browser.js"), "utf8");
  assert.equal(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(source), false);
  assert.match(source, /WHERE n\.note_type='word_study'/);
  assert.match(source, /selected\.length !== 20/);
  assert.match(source, /dataset_class: "owner-private"/);
});

test("C4 browser selector synchronous SHA-256 preserves UTF-8 ordering", () => {
  const source = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1")), "export-owner-notes.browser.js"), "utf8");
  const fragment = source.slice(source.indexOf("  // Synchronous SHA-256"), source.indexOf("  const eligible = [];"));
  const digest = Function(`${fragment}\nreturn digest;`)();
  const samples = ["", "abc", "C4-2026-07-25:123", "C4-2026-07-25:מילה", "C4-2026-07-25:uuid-α"];
  for (const sample of samples) {
    assert.equal(digest(sample), crypto.createHash("sha256").update(sample, "utf8").digest("hex"));
  }
});
