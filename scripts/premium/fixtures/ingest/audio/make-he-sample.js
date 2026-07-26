// scripts/premium/fixtures/ingest/audio/make-he-sample.js
// Генерация he-sample.mp3 (фикстура live-smoke W2-S4). Запуск (однократно):
//   node scripts/premium/fixtures/ingest/audio/make-he-sample.js --key <GCP_TTS_KEY>
"use strict";
const fs = require("fs");
const path = require("path");
const { synthesizeMp3, defaultProfile } = require("../../../lib/ttsBake.js");

const TEXT = "שלום, קוראים לי דוד. אני גר בתל אביב. היום מזג האוויר יפה מאוד.";
const keyArgIdx = process.argv.indexOf("--key");
const KEY = keyArgIdx > -1 ? process.argv[keyArgIdx + 1] : process.env.GCP_TTS_SMOKE_KEY;
if (!KEY) { console.error("ERROR: pass --key <GCP_TTS_KEY> or set GCP_TTS_SMOKE_KEY"); process.exit(1); }

(async () => {
  const mp3 = await synthesizeMp3(KEY, TEXT, defaultProfile("he-IL-Wavenet-B"));
  const out = path.join(__dirname, "he-sample.mp3");
  fs.writeFileSync(out, mp3);
  console.log("OK wrote", out, mp3.length, "bytes; text:", TEXT);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
