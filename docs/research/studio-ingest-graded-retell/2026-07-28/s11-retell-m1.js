// S11 M1 (R10 measure-before-code): качество/управляемость graded-пересказа.
// Матрица: 3 реальных текста × 3 способа задать уровень в промте.
//   P1 cefr  — CEFR-метка (как lessonBuilder: ручная самооценка)
//   P2 list  — явный список разрешённых лемм (top-1200 частотных) + до 15 новых
//   P3 freq  — целевое ограничение «частотная лексика, ≤5% редких» без списка
// Модель/temperature — как прод (gemini-flash-latest, 0). Выход сохраняем сырым,
// метрики (coverage по top-1500/3000, OOV-vs-attested, компрессия) — пост-хок.
"use strict";
const path = require("path");
const fs = require("fs");
const PROJ = "E:\\projects\\tts-prototype-android";
require(path.join(PROJ, "node_modules", "dotenv")).config({ path: path.join(PROJ, ".env") });
const KEY = process.env.GEMINI_API_KEY || "";
if (!/^(AIza|AQ\.)/.test(KEY)) { console.error("no key"); process.exit(1); }
const GL = "https://generativelanguage.googleapis.com";
const MODEL = "gemini-flash-latest";
const OUT = __dirname;

const freq = JSON.parse(fs.readFileSync(path.join(OUT, "freq-ranked.json"), "utf8"));
// список для P2: top-1200 типов длиной ≥2 (функциональные + частотный контент)
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

async function runOne(textKey, varKey) {
  const prompt = VARIANTS[varKey] + "\n\nהטקסט:\n" + TEXTS[textKey];
  const t0 = Date.now();
  const resp = await fetch(GL + "/v1beta/models/" + MODEL + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8192 },
    }),
  });
  const wallMs = Date.now() - t0;
  const rec = { textKey, varKey, http: resp.status, wallMs, promptChars: prompt.length };
  if (!resp.ok) { rec.body = (await resp.text()).slice(0, 400); return rec; }
  const data = await resp.json();
  const cand = (data.candidates || [])[0] || {};
  rec.finishReason = cand.finishReason;
  rec.usage = data.usageMetadata || null;
  const raw = ((cand.content || {}).parts || []).map((p) => p.text || "").join("");
  rec.outChars = raw.length;
  fs.writeFileSync(path.join(OUT, `retell-${textKey}-${varKey}.txt`), raw);
  return rec;
}

(async () => {
  const results = [];
  for (const t of Object.keys(TEXTS)) {
    for (const v of Object.keys(VARIANTS)) {
      process.stdout.write(`--- ${t} × ${v} ... `);
      try {
        const r = await runOne(t, v);
        console.log(`http=${r.http} wall=${r.wallMs}ms out=${r.outChars || 0} finish=${r.finishReason || "-"}`);
        results.push(r);
      } catch (e) { console.log("ERR " + e.message); results.push({ textKey: t, varKey: v, err: e.message }); }
      fs.writeFileSync(path.join(OUT, "m1-results.json"), JSON.stringify(results, null, 2));
      await new Promise((res) => setTimeout(res, 4000));
    }
  }
  console.log("DONE");
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
