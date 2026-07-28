// scripts/premium/retell-live-smoke.js
// W2-S11 T8 — live-смоук (quota-aware): 1 реальный вызов Gemini через ingest/retell.js
// buildRetellPrompt (тот же промт, что сервер шлёт из POST /api/ingest/retell), затем R1-скан
// выходного текста через офлайн-резолвер agent/access/wordMorphologyResolver.js — печатает
// UNRESOLVED-типы как кандидатов на выдуманные/несуществующие формы для ручной проверки глазами.
// Пропуск (exit 0, SKIP) без ключа или при 429 — free tier 20 req/день
// (docs/research/studio-ingest-graded-retell/2026-07-28/README.md §квоты).
"use strict";
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
require(path.join(ROOT, "node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });
const IR = require(path.join(ROOT, "ingest/retell.js"));
const morph = require(path.join(ROOT, "agent/access/wordMorphologyResolver.js"));
const RM = require(path.join(ROOT, "public/js/reader-morph.js"));

const KEY = process.env.GEMINI_API_KEY || "";
if (!/^(AIza|AQ\.)/.test(KEY)) { console.log("SKIP: нет GEMINI_API_KEY"); process.exit(0); }
const SRC = "החתול ישב על החלון והסתכל על הציפורים בגינה. " +
  "הוא רצה לצאת החוצה אבל הדלת הייתה סגורה. " +
  "בערב חזרה בעלת הבית ופתחה לו את הדלת. ".repeat(8);

(async () => {
  let resp;
  try {
    resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: IR.buildRetellPrompt(SRC, "A2") }] }],
                             generationConfig: { temperature: 0, maxOutputTokens: 16384 } }),
      signal: AbortSignal.timeout(30000), // hard cap — undici default has no ceiling and can hang ~5 min
    });
  } catch (e) {
    if (e && (e.name === "AbortError" || e.name === "TimeoutError")) { console.error("FAIL: timeout 30s"); process.exit(1); }
    throw e;
  }
  if (resp.status === 429) { console.log("SKIP: 429 (free-tier квота)"); process.exit(0); }
  if (!resp.ok) { console.error("FAIL http", resp.status, (await resp.text()).slice(0, 300)); process.exit(1); }
  const data = await resp.json();
  const out = (((data.candidates || [])[0] || {}).content || {}).parts.map((p) => p.text || "").join("").trim();
  const lines = out.split(/\n+/).filter((l) => l.trim());
  let ok = true;
  if (!(lines.length >= 4 && lines.length <= 30)) { console.error("FAIL: строк " + lines.length); ok = false; }
  if (!/[א-ת]/.test(out)) { console.error("FAIL: не иврит"); ok = false; }
  // R1-скан: UNRESOLVED контент-типы = кандидаты выдуманных форм → печать для ручной проверки
  const types = new Set();
  for (const w of out.split(/[^֐-׿'"׳״-]+/)) {
    const t = RM.stripNiqqud(w).replace(/^["'׳״-]+|["'׳״-]+$/g, "");
    if (t.length >= 2 && /[א-ת]/.test(t) && !(RM.functionGate(t) || {}).isFunc) types.add(t);
  }
  const unresolved = [];
  for (const t of types) {
    const r = await morph.resolveCoverageToken({ word: t });
    if (!r || r.resolution === "UNRESOLVED") unresolved.push(t);
  }
  console.log("строк:", lines.length, "· типов:", types.size, "· UNRESOLVED (кандидаты — проверить глазами):", unresolved.join(" ") || "нет");
  console.log(ok ? "OK" : "FAIL");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
