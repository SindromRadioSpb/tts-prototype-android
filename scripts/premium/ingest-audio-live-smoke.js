// scripts/premium/ingest-audio-live-smoke.js
// W2-S4 live smoke (РЕАЛЬНЫЙ Gemini-ключ, ручной запуск; урок feedback_llm_path_test_before_ship):
//   node scripts/premium/ingest-audio-live-smoke.js --key <GEMINI_KEY> [--audio <path>] [--mime audio/mpeg]
// Прогоняет ПОЛНЫЙ протокол: resumable start → upload+finalize → poll ACTIVE → ASR → контракт-asserts.
// Для проверки iPhone-формата: --audio memo.m4a --mime audio/mp4 (и повторить с audio/x-m4a).
"use strict";
const fs = require("fs");
const path = require("path");
const A = require("../../public/js/asr-transcript.js");

const GL = "https://generativelanguage.googleapis.com";
function arg(name, dflt) { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : dflt; }
const KEY = arg("key", process.env.INGEST_SMOKE_GEMINI_KEY || "");
const AUDIO = arg("audio", path.join(__dirname, "fixtures/ingest/audio/he-sample.mp3"));
const MIME = arg("mime", "audio/mpeg");
if (!/^(AIza|AQ\.)/.test(KEY)) { console.error("ERROR: --key or INGEST_SMOKE_GEMINI_KEY (AIza…|AQ.…)"); process.exit(1); }

(async () => {
  const bytes = fs.readFileSync(AUDIO);
  console.log("1) start resumable…", AUDIO, bytes.length, "bytes", MIME);
  const start = await fetch(GL + "/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": KEY,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": MIME,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "s4-live-smoke" } }),
  });
  if (!start.ok) throw new Error("start HTTP " + start.status + ": " + (await start.text()));
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("no x-goog-upload-url header (протокол изменился?)");

  console.log("2) upload+finalize…");
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" },
    body: bytes,
  });
  if (!up.ok) throw new Error("upload HTTP " + up.status + ": " + (await up.text()));
  const fileInfo = (await up.json()).file;
  console.log("   file:", fileInfo.name, fileInfo.state, fileInfo.uri);

  console.log("3) poll ACTIVE…");
  let state = fileInfo.state, tries = 0;
  while (state !== "ACTIVE") {
    if (state === "FAILED") throw new Error("file state FAILED");
    if (++tries > 30) throw new Error("ACTIVE timeout (60s)");
    await new Promise((r) => setTimeout(r, 2000));
    const g = await fetch(GL + "/v1beta/" + fileInfo.name, { headers: { "x-goog-api-key": KEY } });
    if (!g.ok) throw new Error("files.get HTTP " + g.status);
    state = (await g.json()).state;
  }

  console.log("4) ASR generateContent…");
  const gen = await fetch(GL + "/v1beta/models/" + A.ASR_MODEL + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { file_data: { file_uri: fileInfo.uri, mime_type: MIME } },
        { text: A.ASR_PROMPT },
      ] }],
      generationConfig: { temperature: 0 },
    }),
  });
  if (!gen.ok) throw new Error("generateContent HTTP " + gen.status + ": " + (await gen.text()));
  const data = await gen.json();
  const raw = ((data.candidates || [])[0]?.content?.parts || []).map((p) => p.text || "").join("");
  console.log("   raw:", raw.slice(0, 300));

  const parsed = A.parseAsrResponse(raw);
  // Фикстура he-sample.mp3 ~18.3с (см. fixtures/ingest/audio/README.md) — 20 покрывает её
  // с запасом (validateSegments допуск +2с), не занижая честный timingOk ложным OOB-дропом.
  const v = A.validateSegments(parsed.segments, 20);
  console.log("5) contract:", JSON.stringify({ language: parsed.language, n: parsed.segments.length, timingOk: v.timingOk, warnings: parsed.warnings }));
  if (!parsed.segments.length) throw new Error("ASSERT: no segments on speech fixture");
  if (!parsed.segments.some((s) => /[֐-׿]/.test(s.text))) throw new Error("ASSERT: no Hebrew in transcript");
  if (!v.timingOk) console.warn("WARN: timing failed honest validation on fixture — inspect starts:", parsed.segments.map((s) => s.start));
  console.log("LIVE SMOKE OK");
})().catch((e) => { console.error("LIVE SMOKE FAIL:", e.message); process.exit(1); });
