// S11 M1b: допрогон матрицы с пейсингом под free-tier (429 → ждать retryDelay+5с, до 5 попыток).
// Перезапускает ячейки без сохранённого выхода + ted×list (обрезан MAX_TOKENS).
// maxOutputTokens 16384 (thinking у gemini-3.6-flash входит в бюджет выхода).
"use strict";
const path = require("path");
const fs = require("fs");
const PROJ = "E:\\projects\\tts-prototype-android";
require(path.join(PROJ, "node_modules", "dotenv")).config({ path: path.join(PROJ, ".env") });
const KEY = process.env.GEMINI_API_KEY || "";
const GL = "https://generativelanguage.googleapis.com";
const MODEL = process.env.S11_MODEL || "gemini-flash-latest";
const OUT = __dirname;

const freq = JSON.parse(fs.readFileSync(path.join(OUT, "freq-ranked.json"), "utf8"));
const allow = freq.top.slice(0, 1200).map(([w]) => w);
const TEXTS = {
  ted: fs.readFileSync(path.join(OUT, "text-ted.txt"), "utf8"),
  literary: fs.readFileSync(path.join(OUT, "text-literary.txt"), "utf8"),
  article: fs.readFileSync(path.join(OUT, "text-article.txt"), "utf8"),
};
const COMMON = [
  "אתה עוזר הוראה של עברית. קרא את הטקסט ובנה ממנו פסקת-עיבוד לימודית (פרפרזה מקוצרת) בעברית פשוטה.",
  "חוקים מחייבים:",
  "- שמור על המשמעות והרעיונות המרכזיים של המקור; אל תוסיף עובדות, דעות או פרטים שאינם במקור.",
  "- אורך היעד: בערך שליש מאורך המקור.",
  "- משפטים קצרים ופשוטים, זמן הווה או עבר פשוט, בלי תחביר ספרותי.",
  "- אל תמציא מילים או צורות דקדוקיות שאינן קיימות בעברית תקנית.",
  "- כתוב בלי ניקוד.",
  "- הפלט: רק הפסקאות של הפרפרזה, משפט אחד בכל שורה. בלי כותרות, בלי הערות.",
].join("\n");
const VARIANTS = {
  cefr: COMMON + "\n- רמת השפה: רמה A2–B1 (CEFR) — לומד עברית ברמה בינונית-מתחילה.",
  list: COMMON + "\n- השתמש רק במילים מהרשימה המצורפת (בכל צורה דקדוקית שלהן: הטיות, נטיות, ריבוי, כינויים חבורים וכו').\n- מותר להשתמש בעד 15 מילים שאינן ברשימה אם הן הכרחיות לתוכן; בסוף הפלט הוסף שורה שמתחילה ב-NEW: עם רשימת המילים החדשות שבחרת.\n\nרשימת המילים המותרות:\n" + allow.join(" "),
  freq: COMMON + "\n- השתמש רק באוצר מילים שכיח מאוד (בערך 1500 המילים הנפוצות ביותר בעברית מדוברת וכתובה); לכל היותר 5% מהמילים יכולות להיות מחוץ לאוצר הזה, ורק אם הן הכרחיות לתוכן.",
};

function parseRetrySec(body) {
  const m = /retry in ([0-9.]+)s/i.exec(body || "");
  return m ? Math.ceil(parseFloat(m[1])) : 60;
}

async function callOnce(prompt) {
  const t0 = Date.now();
  const resp = await fetch(GL + "/v1beta/models/" + MODEL + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 16384 },
    }),
  });
  const wallMs = Date.now() - t0;
  if (resp.status === 429) return { http: 429, wallMs, body: await resp.text() };
  if (!resp.ok) return { http: resp.status, wallMs, body: (await resp.text()).slice(0, 400) };
  const data = await resp.json();
  const cand = (data.candidates || [])[0] || {};
  return {
    http: 200, wallMs, finishReason: cand.finishReason, usage: data.usageMetadata || null,
    text: ((cand.content || {}).parts || []).map((p) => p.text || "").join(""),
  };
}

async function runCell(textKey, varKey) {
  const prompt = VARIANTS[varKey] + "\n\nהטקסט:\n" + TEXTS[textKey];
  for (let att = 1; att <= 5; att++) {
    const r = await callOnce(prompt);
    if (r.http === 429) {
      const sec = parseRetrySec(r.body) + 5;
      console.log(`  429, жду ${sec}с (попытка ${att})`);
      await new Promise((res) => setTimeout(res, sec * 1000));
      continue;
    }
    return r;
  }
  return { http: 429, exhausted: true };
}

(async () => {
  const results = fs.existsSync(path.join(OUT, "m1b-results.json"))
    ? JSON.parse(fs.readFileSync(path.join(OUT, "m1b-results.json"), "utf8")) : [];
  const cells = [];
  for (const t of Object.keys(TEXTS)) for (const v of Object.keys(VARIANTS)) cells.push([t, v]);
  for (const [t, v] of cells) {
    const f = path.join(OUT, `retell-${t}-${v}.txt`);
    const done = fs.existsSync(f) && !(t === "ted" && v === "list");
    if (done) { console.log(`skip ${t}×${v}`); continue; }
    console.log(`--- ${t} × ${v} ...`);
    const r = await runCell(t, v);
    console.log(`  http=${r.http} finish=${r.finishReason || "-"} out=${(r.text || "").length} think=${r.usage ? r.usage.thoughtsTokenCount : "-"}`);
    if (r.http === 200 && r.text) fs.writeFileSync(f, r.text);
    results.push({ textKey: t, varKey: v, http: r.http, wallMs: r.wallMs, finishReason: r.finishReason, usage: r.usage, outChars: (r.text || "").length });
    fs.writeFileSync(path.join(OUT, "m1b-results.json"), JSON.stringify(results, null, 2));
    await new Promise((res) => setTimeout(res, 8000));
  }
  console.log("DONE");
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
