#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { AFFIRMATION, blindResponses, buildPackets, chainLedger, createConsent, revokeConsent, scoreRatings, validateDataset } from "./c4-core.mjs";

const args = process.argv.slice(2);
const command = args.shift();
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith("--") || args[i + 1] === undefined) throw new Error("C4_BAD_ARGUMENTS");
  options[args[i].slice(2)] = args[i + 1];
}
const need = (name) => { if (!options[name]) throw new Error(`C4_MISSING_${name.toUpperCase()}`); return path.resolve(options[name]); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writePrivate = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
};

if (command === "consent") {
  const notes = validateDataset(readJson(need("notes")));
  const receipt = createConsent(notes, { affirmation: options.affirmation, ttlMinutes: options["ttl-minutes"] ? Number(options["ttl-minutes"]) : 240 });
  writePrivate(need("out"), receipt);
  process.stdout.write(`C4_CONSENT_CREATED ${receipt.consent_id} expires=${receipt.expires_at}\n`);
} else if (command === "prepare") {
  const notes = validateDataset(readJson(need("notes")));
  const consent = readJson(need("consent"));
  const ledgerFile = need("ledger"); const outFile = need("out");
  if (fs.existsSync(outFile)) throw new Error("C4_PRIVATE_PACKET_ALREADY_EXISTS");
  const built = buildPackets(notes, consent);
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  let previous = "GENESIS";
  if (fs.existsSync(ledgerFile)) {
    const lines = fs.readFileSync(ledgerFile, "utf8").trim().split(/\r?\n/).filter(Boolean);
    if (lines.length) previous = JSON.parse(lines.at(-1)).event_sha256;
  }
  const chained = chainLedger(built.ledgerEvents, previous);
  const fd = fs.openSync(ledgerFile, "a", 0o600);
  try {
    for (const row of chained) fs.writeSync(fd, `${JSON.stringify(row)}\n`, null, "utf8");
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  writePrivate(outFile, built.privatePackets);
  process.stdout.write(`C4_PACKETS_READY ${built.benchmark_id} exposures=${chained.length}\n`);
} else if (command === "revoke") {
  const consentFile = need("consent");
  const revoked = revokeConsent(readJson(consentFile));
  const tmp = `${consentFile}.revoke-tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(revoked, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(tmp, consentFile);
  process.stdout.write(`C4_CONSENT_REVOKED ${revoked.consent_id} at=${revoked.revoked_at}\n`);
} else if (command === "blind") {
  const blinded = blindResponses(readJson(need("responses")));
  writePrivate(need("out"), blinded.evaluation);
  writePrivate(need("mapping"), blinded.mapping);
  process.stdout.write("C4_BLIND_READY pairs=20\n");
} else if (command === "score") {
  const result = scoreRatings(readJson(need("ratings")), readJson(need("mapping")));
  writePrivate(need("out"), result);
  process.stdout.write(`C4_SCORE ${result.verdict} preferred=${result.with_note_preferred}/20\n`);
} else {
  process.stderr.write(`Usage: c4-benchmark.mjs consent|prepare|revoke|blind|score ...\nRequired affirmation: ${AFFIRMATION}\n`);
  process.exitCode = 2;
}
