// S11 замер 3: длинный вход. Псевдо-транскрипт ~35k токенов из корпусных работ.
// Шаг 1 (бесплатно): countTokens. Шаг 2 (1 вызов): пересказ с явным контролем длины.
"use strict";
const path = require("path");
const fs = require("fs");
const PROJ = "E:\\projects\\tts-prototype-android";
require(path.join(PROJ, "node_modules", "dotenv")).config({ path: path.join(PROJ, ".env") });
const KEY = process.env.GEMINI_API_KEY || "";
const GL = "https://generativelanguage.googleapis.com";
const MODEL = process.env.S11_MODEL || "gemini-2.5-flash";
const OUT = __dirname;

function workText(id) {
  const j = JSON.parse(fs.readFileSync(path.join(PROJ, "public/data/benyehuda/works", id + ".json"), "utf8"));
  return j.library.texts[0].rows.map(r => r.hebrew_plain).filter(Boolean).join("\n");
}

(async () => {
  // собрать ~35к токенов: набор длинных работ
  const ids = ["11780", "105", "10", "11782", "11790", "11784", "11791", "11787", "11778", "11788", "11783", "11777"];
  let text = "";
  for (const id of ids) { text += workText(id) + "\n\n"; }
  const mode = process.argv[2] || "count";

  const ct = await fetch(GL + "/v1beta/models/" + MODEL + ":countTokens", {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }] }),
  });
  const ctj = await ct.json();
  console.log(JSON.stringify({ chars: text.length, words: text.split(/\s+/).length, totalTokens: ctj.totalTokens }));
  if (mode === "count") return;

  const PROMPT = [
    "אתה עוזר הוראה של עברית. קרא את הטקסט ובנה ממנו פרפרזה לימודית מקוצרת בעברית פשוטה מודרנית.",
    "חוקים מחייבים:",
    "- שמור על המשמעות והרעיונות המרכזיים; אל תוסיף עובדות שאינן במקור.",
    "- אורך הפלט: בין 60 ל-80 משפטים (בערך 900-1200 מילים). כסה את כל חלקי המקור, לא רק את ההתחלה.",
    "- משפטים קצרים ופשוטים; רמת השפה: A2-B1 (CEFR).",
    "- אל תמציא מילים או צורות דקדוקיות שאינן קיימות בעברית תקנית.",
    "- כתוב בלי ניקוד. הפלט: רק משפטי הפרפרזה, משפט אחד בכל שורה.",
  ].join("\n") + "\n\nהטקסט:\n" + text;

  const t0 = Date.now();
  const resp = await fetch(GL + "/v1beta/models/" + MODEL + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: PROMPT }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 32768 },
    }),
  });
  const wallMs = Date.now() - t0;
  console.log("http=" + resp.status + " wall=" + wallMs + "ms");
  if (!resp.ok) { console.log((await resp.text()).slice(0, 500)); return; }
  const data = await resp.json();
  const cand = (data.candidates || [])[0] || {};
  const raw = ((cand.content || {}).parts || []).map(p => p.text || "").join("");
  fs.writeFileSync(path.join(OUT, "retell-longprobe.txt"), raw);
  console.log(JSON.stringify({ finish: cand.finishReason, usage: data.usageMetadata, outChars: raw.length, outLines: raw.split(/\n+/).filter(l => l.trim()).length }));
})().catch(e => { console.error("FAIL", e); process.exit(1); });
