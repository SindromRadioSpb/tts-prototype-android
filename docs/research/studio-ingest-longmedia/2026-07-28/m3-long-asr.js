// M3 (S12 brainstorm, R10): длинный ASR — реальный иврит-подкаст.
// Фазы (задаются аргументом):
//   node m3-long-asr.js single   — ep258 (~46 мин) полный ASR как в проде сейчас
//   node m3-long-asr.js long     — ep258+ep255 склейка (~92 мин) полный ASR
//   node m3-long-asr.js range    — на той же склейке: транскрипция ТОЛЬКО диапазона 50:00–55:00
//                                  (реюз fileUri из m3-state.json — без повторной загрузки)
// generateContent — через https.request БЕЗ таймаута (undici headersTimeout=300s убивает долгие вызовы).
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const PROJ = "E:\\projects\\tts-prototype-android";
require(path.join(PROJ, "node_modules", "dotenv")).config({ path: path.join(PROJ, ".env") });
const A = require(path.join(PROJ, "public", "js", "asr-transcript.js"));

const KEY = process.env.GEMINI_API_KEY;
const GLHOST = "generativelanguage.googleapis.com";
const STATE = path.join(__dirname, "m3-state.json");

function httpsJson(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(Object.assign({ host: GLHOST, method: "POST" }, opts), (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.setTimeout(0);
    if (body) req.write(body);
    req.end();
  });
}

async function upload(filePath, mime) {
  const bytes = fs.readFileSync(filePath);
  console.log("upload:", filePath, (bytes.length / 1048576).toFixed(1) + "MB");
  let t0 = Date.now();
  const start = await fetch("https://" + GLHOST + "/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": KEY, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mime, "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: path.basename(filePath) } }),
  });
  if (!start.ok) throw new Error("start HTTP " + start.status + ": " + (await start.text()));
  const uploadUrl = start.headers.get("x-goog-upload-url");
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" },
    body: bytes,
  });
  if (!up.ok) throw new Error("upload HTTP " + up.status);
  const file = (await up.json()).file;
  const uploadSec = ((Date.now() - t0) / 1000).toFixed(0);
  t0 = Date.now();
  let state = file.state, tries = 0;
  while (state !== "ACTIVE") {
    if (state === "FAILED") throw new Error("FAILED");
    if (++tries > 150) throw new Error("ACTIVE timeout 300s");
    await new Promise((r) => setTimeout(r, 2000));
    const g = await fetch("https://" + GLHOST + "/v1beta/" + file.name, { headers: { "x-goog-api-key": KEY } });
    state = (await g.json()).state;
  }
  const activeSec = ((Date.now() - t0) / 1000).toFixed(0);
  console.log("uploaded:", file.uri, "| upload", uploadSec + "s | ACTIVE poll", activeSec + "s");
  return { uri: file.uri, name: file.name, uploadSec, activeSec };
}

async function asr(fileUri, mime, promptText, label, videoMetadata) {
  const t0 = Date.now();
  const filePart = { file_data: { file_uri: fileUri, mime_type: mime } };
  if (videoMetadata) filePart.video_metadata = videoMetadata;
  const r = await httpsJson(
    { path: "/v1beta/models/" + A.ASR_MODEL + ":generateContent",
      headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" } },
    JSON.stringify({
      contents: [{ role: "user", parts: [
        filePart,
        { text: promptText },
      ] }],
      generationConfig: { temperature: 0 },
    })
  );
  const wallSec = ((Date.now() - t0) / 1000).toFixed(0);
  if (r.status !== 200) { console.log(label, "HTTP", r.status, r.body.slice(0, 400)); return null; }
  const data = JSON.parse(r.body);
  const cand = (data.candidates || [])[0] || {};
  const raw = ((cand.content || {}).parts || []).map((p) => p.text || "").join("");
  fs.writeFileSync(path.join(__dirname, "m3-raw-" + label + ".txt"), raw, "utf8");
  const rec = { label, wallSec: Number(wallSec), finishReason: cand.finishReason, usage: data.usageMetadata, rawChars: raw.length };
  try {
    const parsed = A.parseAsrResponse(raw);
    rec.segments = parsed.segments.length;
    rec.language = parsed.language;
    rec.warnings = parsed.warnings;
    if (parsed.segments.length) {
      rec.firstStart = parsed.segments[0].start;
      rec.lastStart = parsed.segments[parsed.segments.length - 1].start;
      const v = A.validateSegments(parsed.segments, 1e9);
      rec.validStarts = v.segments.filter((s) => s.start !== null).length;
      rec.timingOk = v.timingOk;
      rec.sample = parsed.segments.slice(0, 2).map((s) => ({ start: s.start, text: s.text.slice(0, 60) }));
      rec.sampleTail = parsed.segments.slice(-2).map((s) => ({ start: s.start, text: s.text.slice(0, 60) }));
    }
  } catch (e) { rec.parseErr = e.message; rec.rawTail = raw.slice(-300); }
  console.log(JSON.stringify(rec, null, 1));
  return rec;
}

(async () => {
  const phase = process.argv[2] || "single";
  const st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
  if (phase === "single") {
    const f = st.single || await upload(path.join(__dirname, "ep258.mp3"), "audio/mpeg");
    st.single = f; fs.writeFileSync(STATE, JSON.stringify(st));
    await asr(f.uri, "audio/mpeg", A.ASR_PROMPT, "single-46min-full");
  } else if (phase === "long") {
    const out = path.join(__dirname, "long.mp3");
    if (!fs.existsSync(out)) {
      fs.writeFileSync(out, Buffer.concat([fs.readFileSync(path.join(__dirname, "ep258.mp3")),
                                           fs.readFileSync(path.join(__dirname, "ep255.mp3"))]));
    }
    const f = await upload(out, "audio/mpeg");
    st.long = f; fs.writeFileSync(STATE, JSON.stringify(st));
    await asr(f.uri, "audio/mpeg", A.ASR_PROMPT, "long-92min-full");
  } else if (phase === "range") {
    if (!st.long) throw new Error("run long first");
    const rangePrompt = A.ASR_PROMPT +
      "\nIMPORTANT SCOPE: transcribe ONLY the region of the recording from 50:00 to 55:00 " +
      "(minutes:seconds from the very beginning of the file). Output NOTHING from outside this region. " +
      "Timestamps must remain ABSOLUTE (measured from the very beginning of the file, i.e. within 50:00-55:00).";
    await asr(st.long.uri, "audio/mpeg", rangePrompt, "range-50to55-of-92min");
  } else if (phase === "range258") {
    // Дыра в single-прогоне: 31:46 → 63:00 выпало. Спрашиваем ровно пропавшее окно 32:00–40:00.
    if (!st.single) throw new Error("run single first");
    const rp = A.ASR_PROMPT +
      "\nIMPORTANT SCOPE: transcribe ONLY the region of the recording from 32:00 to 40:00 " +
      "(minutes:seconds from the very beginning of the file). Output NOTHING from outside this region. " +
      "Timestamps must remain ABSOLUTE (measured from the very beginning of the file, i.e. within 32:00-40:00).";
    await asr(st.single.uri, "audio/mpeg", rp, "range258-32to40");
  } else if (phase === "clip258") {
    if (!st.single) throw new Error("run single first");
    await asr(st.single.uri, "audio/mpeg", A.ASR_PROMPT, "clip258-32to40",
              { start_offset: "1920s", end_offset: "2400s" });
  } else if (phase === "clip") {
    if (!st.long) throw new Error("run long first");
    // Проба: клипует ли API аудио через video_metadata (документировано для видео).
    // Если да — usage.promptTokenCount(AUDIO) должен быть ~маленьким (5 мин ≈ 8-10k), не 170k.
    await asr(st.long.uri, "audio/mpeg", A.ASR_PROMPT, "clip-50to55-of-92min",
              { start_offset: "3000s", end_offset: "3300s" });
  }
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
