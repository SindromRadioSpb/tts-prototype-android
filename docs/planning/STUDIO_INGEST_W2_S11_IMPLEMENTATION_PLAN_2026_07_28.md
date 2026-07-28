# W2-S11 «Упростить до моего уровня» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка «Упростить до моего уровня»: из любого текста в Студии строится graded-пересказ на иврите (Gemini BYOK), приземляется как ОТДЕЛЬНЫЙ текст с провенансом derivedFrom и честным «знакомо до/после».

**Architecture:** Серверный pure-модуль промта (`ingest/retell.js`) + эндпоинт `/api/ingest/retell` класса extract-file (BYOK, sha256-кэш, classifyGeminiError) + клиентский модуль `public/js/studio-retell.js` (pure-ядро dual-export: смета/паспорт/агрегация coverage; браузер: модал, coverage-мост через ReaderMorph, приземление в композер). Провенанс едет существующим паспортом `v3LastImportMeta → v3AttachImportSource → панель «Происхождение»`.

**Tech Stack:** Node.js/Express, @google/generative-ai SDK, `node --test`, ванильный JS (UMD dual-export), i18n ru/en/he, PWA SW precache.

**Дизайн (канон):** `docs/planning/STUDIO_INGEST_W2_S11_GRADED_RETELL_DESIGN_2026_07_28.md` (УТВЕРЖДЁН 2026-07-28).
**Замеры:** `docs/research/studio-ingest-graded-retell/2026-07-28/README.md`.

## Global Constraints

- Работаем на `main`; коммит после каждой задачи; **push — ТОЛЬКО в Task 9 (релиз)**.
- `renderTable`/`reader-core` НЕ трогать (`npm run smoke:reader-parity` обязан оставаться зелёным).
- `corpus-vocab.js` НЕ менять (CFG/classifyZone только импортируются; `smoke:corpus-vocab` зелёный).
- BYOK: серверного Gemini-ключа НЕТ; ключ per-request из тела запроса; в логи не попадает.
- Каждая новая UI-строка — СРАЗУ во все три локали `public/i18n/locales/{ru,en,he}.js`; бамп `?v=` всех трёх locale-тегов + `node tests/i18n.smoke.js --write-lock` + `CACHE_VERSION` — одним изменением (Task 7).
- Новый JS-модуль обязан попасть в precache `public/sw.js` (Task 7), иначе офлайн молча теряет модуль.
- Mobile-ловушка `button { width:100% }` на ≤600px — новые кнопки вне `.v3-modal` требуют явного исключения; скриншот 380×844 перед каждым UI-коммитом.
- Комментарии в коде цитируют проверяемый источник (дизайн-док/README замеров), не «память сессии» (R9).
- `public/check_script.js` — МЁРТВАЯ копия, не редактировать.
- Прод-модель: `gemini-flash-latest`. temperature 0. `maxOutputTokens: 16384` (замер: thinking входит в бюджет, 8192 обрезало).
- Оригинал никогда не подменяется (R11): после приземления пересказа — `v3SessionSet({textId:null, baseTextId:null, mode:"draft", title:null})`.

---

### Task 1: `ingest/retell.js` — серверный pure-модуль (уровни, промт, валидация, кэш-ключ)

**Files:**
- Create: `ingest/retell.js`
- Test: `tests/ingestRetell.test.js`

**Interfaces:**
- Consumes: ничего (pure, zero deps).
- Produces (используют Task 2, 3, 8):
  `LEVELS = ["A1","A2","B1","B2"]` · `RETELL_PROMPT_ID = "retell-he-v1"` ·
  `MAX_RETELL_INPUT_CHARS = 100000` ·
  `estimateSentences(text) → number≥1` · `targetSentences(text) → number∈[8..80]` ·
  `buildRetellPrompt(text, level) → string` ·
  `validateRetellInput({text, level}) → {ok:true} | {ok:false, status, error_code}` ·
  `cacheKeyInput(text, level) → string`

- [ ] **Step 1: Написать падающий тест**

```js
// tests/ingestRetell.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../ingest/retell.js");

test("LEVELS — ровно четыре CEFR-метки, порядок фиксирован", () => {
  assert.deepEqual(R.LEVELS, ["A1", "A2", "B1", "B2"]);
});

test("estimateSentences: считает по терминаторам и переводам строк, минимум 1", () => {
  assert.equal(R.estimateSentences("שלום. מה שלומך? טוב!"), 3);
  assert.equal(R.estimateSentences("שורה אחת\nשורה שתיים\nשורה שלוש"), 3);
  assert.equal(R.estimateSentences("בלי סוף משפט"), 1);
  assert.equal(R.estimateSentences(""), 1);
});

test("targetSentences: /3 с клампом 8..80", () => {
  assert.equal(R.targetSentences("א. ".repeat(9)), 8);     // 9/3=3 → clamp 8
  assert.equal(R.targetSentences("א. ".repeat(90)), 30);   // 90/3=30
  assert.equal(R.targetSentences("א. ".repeat(600)), 80);  // 200 → clamp 80
});

test("buildRetellPrompt: содержит метку уровня, диапазон предложений, R1-запрет, частотное ограничение и сам текст", () => {
  const p = R.buildRetellPrompt("זהו טקסט לדוגמה. עוד משפט.", "B1");
  assert.ok(p.includes("B1"), "CEFR-метка уровня");
  assert.ok(/\d+ ל-\d+ משפטים/.test(p), "числовой диапазон предложений (замер: доли не работают)");
  assert.ok(p.includes("אל תמציא מילים"), "R1-запрет выдумывать формы");
  assert.ok(p.includes("שכיח"), "частотное ограничение лексики (freq-вариант замера)");
  assert.ok(p.includes("זהו טקסט לדוגמה"), "исходный текст в конце промта");
  // все 4 уровня дают разные промты
  const set = new Set(R.LEVELS.map((l) => R.buildRetellPrompt("א.", l)));
  assert.equal(set.size, 4);
});

test("validateRetellInput: пустой текст / кривой уровень / перебор длины", () => {
  assert.deepEqual(R.validateRetellInput({ text: "שלום.", level: "B1" }), { ok: true });
  assert.equal(R.validateRetellInput({ text: "", level: "B1" }).error_code, "RETELL_EMPTY");
  assert.equal(R.validateRetellInput({ text: "  ", level: "B1" }).error_code, "RETELL_EMPTY");
  assert.equal(R.validateRetellInput({ text: "שלום.", level: "C2" }).error_code, "BAD_LEVEL");
  assert.equal(R.validateRetellInput({ text: "שלום.", level: "C2" }).status, 400);
  const long = "א".repeat(R.MAX_RETELL_INPUT_CHARS + 1);
  assert.equal(R.validateRetellInput({ text: long, level: "A2" }).error_code, "RETELL_TOO_LONG");
});

test("cacheKeyInput: включает promptId, УРОВЕНЬ и трим текста (разные уровни = разные ключи)", () => {
  assert.equal(R.cacheKeyInput(" שלום ", "B1"), "retell-he-v1|B1||שלום");
  assert.notEqual(R.cacheKeyInput("שלום", "A2"), R.cacheKeyInput("שלום", "B1"));
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `node --test tests/ingestRetell.test.js`
Expected: FAIL — `Cannot find module '../ingest/retell.js'`

- [ ] **Step 3: Минимальная реализация**

```js
// ingest/retell.js
// W2-S11 graded-пересказ — pure-модуль промта/валидации (без сети, без fs).
// Числа и формулировки промта — из замеров R10:
// docs/research/studio-ingest-graded-retell/2026-07-28/README.md
//   - метка уровня + частотное ограничение работают; явный список лемм — НЕТ;
//   - длина держится только ЧИСЛОМ предложений («⅓» дала 6–22%);
//   - клиентский зеркальный LEVELS — public/js/studio-retell.js (lock-step тест).
"use strict";

const LEVELS = ["A1", "A2", "B1", "B2"];
const RETELL_PROMPT_ID = "retell-he-v1";
const MAX_RETELL_INPUT_CHARS = 100000; // ≈50К токенов — замер long-probe: один вызов ок

const LEVEL_LINE = {
  A1: "רמת השפה: רמה A1 (CEFR) — מתחיל גמור: אוצר מילים בסיסי ביותר, משפטים של 4-6 מילים.",
  A2: "רמת השפה: רמה A2 (CEFR) — מתחיל: אוצר מילים יומיומי פשוט, משפטים קצרים.",
  B1: "רמת השפה: רמה B1 (CEFR) — בינוני: אוצר מילים שכיח, משפטים פשוטים.",
  B2: "רמת השפה: רמה B2 (CEFR) — בינוני-גבוה: מותר אוצר מילים מגוון יותר, אך המשפטים נשארים ברורים.",
};

function estimateSentences(text) {
  const t = String(text || "").trim();
  if (!t) return 1;
  const byEnders = (t.match(/[.!?…]+(\s|$)/g) || []).length;
  const byLines = t.split(/\n+/).filter((l) => l.trim()).length;
  return Math.max(1, byEnders, byLines);
}

function targetSentences(text) {
  return Math.min(80, Math.max(8, Math.round(estimateSentences(text) / 3)));
}

function buildRetellPrompt(text, level) {
  const t = targetSentences(text);
  const hi = Math.round(t * 1.2);
  return [
    "אתה עוזר הוראה של עברית. קרא את הטקסט ובנה ממנו פרפרזה לימודית מקוצרת בעברית פשוטה מודרנית.",
    "חוקים מחייבים:",
    "- שמור על המשמעות והרעיונות המרכזיים של המקור; אל תוסיף עובדות, דעות או פרטים שאינם במקור.",
    "- " + LEVEL_LINE[level],
    "- השתמש רק באוצר מילים שכיח מאוד; מילים נדירות — רק אם הן הכרחיות לתוכן.",
    "- כתוב בין " + t + " ל-" + hi + " משפטים. כסה את כל חלקי המקור, לא רק את ההתחלה.",
    "- אל תמציא מילים או צורות דקדוקיות שאינן קיימות בעברית תקנית.",
    "- כתוב בלי ניקוד.",
    "- הפלט: רק משפטי הפרפרזה, משפט אחד בכל שורה. בלי כותרות, בלי הערות, בלי תרגום.",
    "",
    "הטקסט:",
    String(text || ""),
  ].join("\n");
}

function validateRetellInput(body) {
  const text = body && typeof body.text === "string" ? body.text : "";
  const level = body && body.level;
  if (!LEVELS.includes(level)) return { ok: false, status: 400, error_code: "BAD_LEVEL" };
  if (!text.trim()) return { ok: false, status: 400, error_code: "RETELL_EMPTY" };
  if (text.length > MAX_RETELL_INPUT_CHARS) return { ok: false, status: 400, error_code: "RETELL_TOO_LONG" };
  return { ok: true };
}

function cacheKeyInput(text, level) {
  return RETELL_PROMPT_ID + "|" + level + "||" + String(text || "").trim();
}

module.exports = {
  LEVELS, RETELL_PROMPT_ID, MAX_RETELL_INPUT_CHARS,
  estimateSentences, targetSentences, buildRetellPrompt, validateRetellInput, cacheKeyInput,
};
```

- [ ] **Step 4: Прогнать — зелёный**

Run: `node --test tests/ingestRetell.test.js`
Expected: PASS (все тесты)

- [ ] **Step 5: Commit**

```bash
git add ingest/retell.js tests/ingestRetell.test.js
git commit -m "feat(retell): S11 T1 — pure-модуль промта/валидации graded-пересказа (LEVELS, целевые предложения, кэш-ключ с уровнем)"
```

---

### Task 2: `POST /api/ingest/retell` — эндпоинт + офлайн-смоук валидации

**Files:**
- Modify: `ingest/routes.js` (внутри `registerIngestRoutes`, после `/api/ingest/extract-file`)
- Modify: `scripts/ingest-smoke.js` (добавить retell-чеки в существующую матрицу)

**Interfaces:**
- Consumes: Task 1 (`require("./retell.js")`), существующие в routes.js: `isPlausibleGeminiKey`, `classifyGeminiError`, `GoogleGenerativeAI`, `crypto`, `fs`, `path`, `deps.geminiCacheDir`, `limiter`.
- Produces (использует Task 6): `POST /api/ingest/retell` body `{text, level, geminiApiKey}` →
  200 `{ok:true, retell, promptId:"retell-he-v1", model:"gemini-flash-latest", fromCache, cacheKey}`;
  ошибки: 401 `GEMINI_KEY_REQUIRED`, 400 `GEMINI_KEY_INVALID|BAD_LEVEL|RETELL_EMPTY|RETELL_TOO_LONG`,
  502 `RETELL_EMPTY_OUTPUT`, из classifyGeminiError: `GEMINI_KEY_REJECTED|GEMINI_QUOTA|GEMINI_OVERLOADED|GEMINI_FAILED`.

- [ ] **Step 1: Дописать падающие смоук-чеки**

В `scripts/ingest-smoke.js`: рядом с константами URL добавить
`const RETELL_URL = `${BASE_URL}/api/ingest/retell`;`, в конец матрицы — четыре чека
(перенять хелперы `readBody`/`check` файла; перед правкой прочитать 2-3 существующих чека
и повторить их стиль дословно):

```js
// S11 Task 2 — /api/ingest/retell: валидация ДО любого Gemini-вызова (офлайн-гарантия).
// check N+1: нет ключа → 401 GEMINI_KEY_REQUIRED
{
  const res = await fetch(RETELL_URL, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "שלום עולם.", level: "B1" }) });
  const { data } = await readBody(res);
  check("retell: no key -> 401 GEMINI_KEY_REQUIRED", res.status === 401 && data && data.error_code === "GEMINI_KEY_REQUIRED");
}
// check N+2: кривой уровень → 400 BAD_LEVEL (до проверки ключа не дойдёт — валидация входа первая)
{
  const res = await fetch(RETELL_URL, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "שלום עולם.", level: "C2", geminiApiKey: "AIzaFakeKeyForSmokeOnly123456789" }) });
  const { data } = await readBody(res);
  check("retell: bad level -> 400 BAD_LEVEL", res.status === 400 && data && data.error_code === "BAD_LEVEL");
}
// check N+3: перебор длины → 400 RETELL_TOO_LONG
{
  const res = await fetch(RETELL_URL, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "א".repeat(100001), level: "B1", geminiApiKey: "AIzaFakeKeyForSmokeOnly123456789" }) });
  const { data } = await readBody(res);
  check("retell: too long -> 400 RETELL_TOO_LONG", res.status === 400 && data && data.error_code === "RETELL_TOO_LONG");
}
// check N+4: кэш-хит отвечает БЕЗ Gemini-вызова (синтетический кэш-файл, как check 14 extract-file)
{
  const retellMod = require(path.join(REPO_ROOT, "ingest", "retell.js"));
  const key = crypto.createHash("sha256").update(retellMod.cacheKeyInput("טקסט קטן לבדיקה.", "A2")).digest("hex");
  fs.writeFileSync(path.join(smokeGeminiCacheDir, `retell-v1-${key}.json`),
    JSON.stringify({ retell: "משפט פשוט.", level: "A2", createdAt: new Date().toISOString() }));
  const res = await fetch(RETELL_URL, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "טקסט קטן לבדיקה.", level: "A2", geminiApiKey: "AIzaFakeKeyForSmokeOnly123456789" }) });
  const { data } = await readBody(res);
  check("retell: cache hit -> fromCache:true без сети",
    res.status === 200 && data && data.ok === true && data.fromCache === true && data.retell === "משפט פשוט.");
}
```

⚠ Имя переменной каталога кэша смоука (`smokeGeminiCacheDir`) — взять РЕАЛЬНОЕ из
`scripts/ingest-smoke.js` (там уже есть синтетическая запись кэша extract-file, check 14 —
повторить её механику один в один).

- [ ] **Step 2: Прогнать — падает**

Run: `npm run smoke:ingest`
Expected: FAIL — retell-чеки получают 404 (эндпоинта нет)

- [ ] **Step 3: Реализовать эндпоинт**

В `ingest/routes.js`: вверху `const retell = require("./retell.js");`,
внутри `registerIngestRoutes` после extract-file:

```js
  // W2-S11: graded-пересказ (дизайн STUDIO_INGEST_W2_S11_GRADED_RETELL_DESIGN_2026_07_28.md §4.2).
  // Порядок проверок: вход → ключ → кэш → Gemini (валидация входа не тратит ничего).
  app.post("/api/ingest/retell", limiter, async (req, res) => {
    const { text, level, geminiApiKey } = req.body || {};
    const v = retell.validateRetellInput({ text, level });
    if (!v.ok) return res.status(v.status).json({ ok: false, error: "Некорректный вход", error_code: v.error_code });
    if (!geminiApiKey || typeof geminiApiKey !== "string" || !geminiApiKey.trim()) {
      return res.status(401).json({ ok: false, error: "Gemini API Key required (BYOK)", error_code: "GEMINI_KEY_REQUIRED" });
    }
    if (!isPlausibleGeminiKey(geminiApiKey)) {
      return res.status(400).json({ ok: false, error: "Неверный формат Gemini API Key", error_code: "GEMINI_KEY_INVALID" });
    }
    const hash = crypto.createHash("sha256").update(retell.cacheKeyInput(text, level)).digest("hex");
    const cacheFile = path.join(deps.geminiCacheDir, `retell-v1-${hash}.json`);
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        if (cached && typeof cached.retell === "string" && cached.retell.trim()) {
          return res.json({ ok: true, retell: cached.retell, promptId: retell.RETELL_PROMPT_ID,
                            model: "gemini-flash-latest", fromCache: true, cacheKey: hash });
        }
      } catch (e) { console.error("retell cache read error", e); }
    }
    try {
      const ai = new GoogleGenerativeAI(geminiApiKey.trim());
      const model = ai.getGenerativeModel({
        model: "gemini-flash-latest",
        // maxOutputTokens 16384: thinking входит в бюджет вывода — 8192 обрезало list-вариант
        // (замер M1, docs/research/studio-ingest-graded-retell/2026-07-28/README.md)
        generationConfig: { temperature: 0, maxOutputTokens: 16384 },
      });
      const result = await model.generateContent(retell.buildRetellPrompt(text, level));
      const raw = (await result.response).text();
      const out = raw.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
      if (!out) return res.status(502).json({ ok: false, error: "Пустой ответ модели", error_code: "RETELL_EMPTY_OUTPUT" });
      try { fs.writeFileSync(cacheFile, JSON.stringify({ retell: out, level, createdAt: new Date().toISOString() })); }
      catch (e) { console.error("retell cache write error", e); }
      return res.json({ ok: true, retell: out, promptId: retell.RETELL_PROMPT_ID,
                        model: "gemini-flash-latest", fromCache: false, cacheKey: hash });
    } catch (e) {
      console.error("retell gemini error", e && e.message); // только .message — ключ не логируем
      const c = classifyGeminiError(e);
      return res.status(c.status).json({ ok: false, error: c.error, error_code: c.error_code });
    }
  });
```

- [ ] **Step 4: Прогнать — зелёный (вся матрица, не только новые чеки)**

Run: `npm run smoke:ingest`
Expected: PASS все чеки, включая 4 новых

- [ ] **Step 5: Прогнать существующие юнит-тесты сервера ingest**

Run: `node --test tests/ingestRetell.test.js tests/ingestGeminiError.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ingest/routes.js scripts/ingest-smoke.js
git commit -m "feat(retell): S11 T2 — POST /api/ingest/retell (BYOK, sha256-кэш с уровнем, classifyGeminiError) + офлайн-смоук"
```

---

### Task 3: `public/js/studio-retell.js` — pure-ядро (смета, паспорт, LEVELS-зеркало, агрегация coverage)

**Files:**
- Create: `public/js/studio-retell.js` (UMD dual-export как `table-chunks.js`; браузерная часть добавится в Task 5/6 — в этой задаче ТОЛЬКО pure-ядро)
- Test: `tests/studioRetell.test.js`

**Interfaces:**
- Consumes: Task 1 (только в тесте — lock-step сравнение LEVELS).
- Produces (используют Task 4, 5, 6, 8):
  `LEVELS` (зеркало серверного) · `RETELL_LEVEL_LS_KEY = "studio.retell.level"` ·
  `estimateRetellCost(chars) → {usd, seconds}` ·
  `buildRetellPassport({originLabel, importKind, importSource, savedTextId, savedTitle, level, model, retellText, coverage}) → объект v3LastImportMeta-формы` ·
  `aggregateCoverage(items, knownMap, cfg) → {pct, zone, tokens, knownTok} | null` (items: `[{key, freq}]`; cfg: `{KNOWN_STATES, classifyZone}`).

- [ ] **Step 1: Написать падающий тест**

```js
// tests/studioRetell.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const SR = require("../public/js/studio-retell.js");
const IR = require("../ingest/retell.js");

test("LEVELS клиент/сервер совпадают ПО ПОСТРОЕНИЮ (config-string-match)", () => {
  assert.deepEqual(SR.LEVELS, IR.LEVELS);
});

test("estimateRetellCost: копейки на статье, ≤$0.05 на 100К символов; usd≥0.01 для лейбла", () => {
  const small = SR.estimateRetellCost(4000);   // статья
  const big = SR.estimateRetellCost(100000);   // потолок входа (≈48.5К ток., замер long-probe $0.027)
  assert.ok(small.usd >= 0.01 && small.usd <= 0.02, JSON.stringify(small));
  assert.ok(big.usd >= 0.02 && big.usd <= 0.05, JSON.stringify(big));
  assert.ok(big.seconds >= 20 && big.seconds <= 60);
});

test("buildRetellPassport: kind retell, snapshot = ПЕРЕСКАЗ, без audio/captions, derivedFrom собран", () => {
  const p = SR.buildRetellPassport({
    originLabel: "מאמר על חינוך", importKind: "url", importSource: "https://ex.am/a",
    savedTextId: "t-123", savedTitle: "Статья", level: "B1",
    model: "gemini-flash-latest", retellText: "משפט אחד.\nמשפט שני.",
    coverage: { before: 0.61, after: 0.84, zone: "in" },
  });
  assert.equal(p.kind, "retell");
  assert.equal(p.method, "gemini-retell");
  assert.equal(p.textSnapshot, "משפט אחד.\nמשפט שני.");   // снимок = пересказ, иначе edited врёт
  assert.equal(p.audio, undefined);                        // R11: медиа-паспорт НЕ наследуется
  assert.equal(p.captions, undefined);
  assert.equal(p.retell.v, 1);
  assert.equal(p.retell.level, "B1");
  assert.equal(p.retell.derivedFrom.textId, "t-123");
  assert.equal(p.retell.derivedFrom.importKind, "url");
  assert.equal(p.retell.coverage.after, 0.84);
  assert.ok(p.at && p.warnings.length === 0);
});

test("aggregateCoverage: токен-взвешенная доля знакомого + зона; пусто/нет знаний → null", () => {
  const cfg = { KNOWN_STATES: { known: true, l2: true }, classifyZone: (c) => (c >= 0.9 ? "easy" : c >= 0.7 ? "in" : "hard") };
  const items = [{ key: "pid:1", freq: 8 }, { key: "pid:2", freq: 1 }, { key: "שלום#noun", freq: 1 }];
  const r = SR.aggregateCoverage(items, { "pid:1": "known", "pid:2": "new" }, cfg);
  assert.equal(r.tokens, 10);
  assert.equal(r.knownTok, 8);
  assert.equal(r.pct, 0.8);
  assert.equal(r.zone, "in");
  assert.equal(SR.aggregateCoverage([], { "pid:1": "known" }, cfg), null);
  assert.equal(SR.aggregateCoverage(items, {}, cfg), null); // пустой профиль → честно нет цифры
});
```

- [ ] **Step 2: Прогнать — падает**

Run: `node --test tests/studioRetell.test.js`
Expected: FAIL — модуля нет

- [ ] **Step 3: Минимальная реализация pure-ядра**

```js
// public/js/studio-retell.js
// W2-S11 «Упростить до моего уровня» — graded-пересказ (дизайн
// STUDIO_INGEST_W2_S11_GRADED_RETELL_DESIGN_2026_07_28.md; замеры
// docs/research/studio-ingest-graded-retell/2026-07-28/README.md).
// Pure-ядро — dual-export (Node-тесты); браузерная часть добавляется ниже по задачам.
(function () {
  "use strict";

  // Зеркало ingest/retell.js LEVELS — совпадение сторожит tests/studioRetell.test.js
  var LEVELS = ["A1", "A2", "B1", "B2"];
  var RETELL_LEVEL_LS_KEY = "studio.retell.level";

  // Смета (R16). Константы из замера long-probe (48 514 ток. входа ← 99 950 символов ⇒
  // ~2.06 символа/токен; выход+thinking ≈ 5К ток.; $0.30/M in, $2.50/M out; wall 26 с).
  var COST = { CHARS_PER_TOKEN: 2.06, OUT_TOKENS: 5000, USD_IN: 0.30, USD_OUT: 2.5,
               SEC_BASE: 12, SEC_PER_10K_TOKENS: 6 };

  function estimateRetellCost(chars) {
    var inTok = Math.ceil((Number(chars) || 0) / COST.CHARS_PER_TOKEN);
    var usd = (inTok * COST.USD_IN + COST.OUT_TOKENS * COST.USD_OUT) / 1e6;
    var seconds = Math.round(COST.SEC_BASE + (inTok / 10000) * COST.SEC_PER_10K_TOKENS);
    return { usd: Math.max(0.01, Math.round(usd * 100) / 100), seconds: seconds };
  }

  // Паспорт для window.v3LastImportMeta. Снимок = ТЕКСТ ПЕРЕСКАЗА (флаг edited в
  // v3AttachImportSource сравнивает поле с ним). audio/captions НЕ копируются: у пересказа
  // нет соответствия исходной записи (R11), а shared-паспорт оригинала нельзя разделять
  // (односторонняя защёлка timingDropReason — дизайн §5.3).
  function buildRetellPassport(o) {
    return {
      kind: "retell",
      source: o.originLabel || o.importSource || o.savedTitle || "",
      method: "gemini-retell",
      model: o.model,
      warnings: [],
      at: new Date().toISOString(),
      textSnapshot: o.retellText,
      retell: {
        v: 1,
        level: o.level,
        derivedFrom: {
          textId: o.savedTextId || null,
          title: o.savedTitle || null,
          importKind: o.importKind || null,
          importSource: o.importSource || null,
        },
        coverage: o.coverage || null,
      },
    };
  }

  // Токен-взвешенная агрегация знакомости. items: [{key, freq}] по КОНТЕНТ-типам текста;
  // knownMap: localDb.getKnownWordStates(); cfg: {KNOWN_STATES, classifyZone} из CorpusVocab
  // (КАНОН-определение уровня — четвёртого не вводим, дизайн §1.1). Пустой профиль/пустой
  // текст → null (честно нет цифры, а не «0%» — урок silent-empty).
  function aggregateCoverage(items, knownMap, cfg) {
    if (!Array.isArray(items) || !items.length || !knownMap || !cfg) return null;
    var anyKnown = false;
    for (var k in knownMap) { if (cfg.KNOWN_STATES[knownMap[k]]) { anyKnown = true; break; } }
    if (!anyKnown) return null;
    var tokens = 0, knownTok = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], c = Number(it.freq) || 0;
      tokens += c;
      var st = knownMap[it.key];
      if (st && cfg.KNOWN_STATES[st]) knownTok += c;
    }
    if (!tokens) return null;
    var pct = knownTok / tokens;
    return { pct: pct, zone: cfg.classifyZone(pct), tokens: tokens, knownTok: knownTok };
  }

  var API = {
    LEVELS: LEVELS, RETELL_LEVEL_LS_KEY: RETELL_LEVEL_LS_KEY,
    estimateRetellCost: estimateRetellCost,
    buildRetellPassport: buildRetellPassport,
    aggregateCoverage: aggregateCoverage,
  };
  if (typeof window !== "undefined") window.StudioRetell = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
```

- [ ] **Step 4: Прогнать — зелёный**

Run: `node --test tests/studioRetell.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/studio-retell.js tests/studioRetell.test.js
git commit -m "feat(retell): S11 T3 — pure-ядро studio-retell (смета из замеров, retell-паспорт, LEVELS-зеркало, агрегация coverage)"
```

---

### Task 4: coverage-мост браузера — `estimateTextCoverage(text)`

**Files:**
- Modify: `public/js/studio-retell.js` (браузерная функция внутри того же IIFE, экспорт в API)
- Test: `tests/studioRetell.test.js` (добавить тест на новый pure-хелпер `collectTypeFreq`)

**Interfaces:**
- Consumes: `ReaderMorph.words/stripNiqqud/functionGate/ensureEngine/resolveCore/statusKeyForCard`
  (экспорты подтверждены: `public/js/reader-morph.js:2661-2694`), `window.CorpusVocab.CFG` +
  `classifyZone` (`public/js/corpus-vocab.js:25-87`), `window.localDb.getKnownWordStates()`
  (`public/db/local-db.js:2398`), Task 3 `aggregateCoverage`.
- Produces (использует Task 5/6): `StudioRetell.estimateTextCoverage(text) → Promise<{pct, zone, tokens} | null>`;
  pure: `collectTypeFreq(text, readerMorph) → [{surface, freq}]`.

- [ ] **Step 1: Тест pure-хелпера (частоты контент-типов без DOM)**

Добавить в `tests/studioRetell.test.js`:

```js
const RM = require("../public/js/reader-morph.js");

test("collectTypeFreq: иврит-типы без огласовок, функциональные слова отфильтрованы functionGate", () => {
  const items = SR.collectTypeFreq("הילד אכל תפוח. הילד רץ אל הבית.", RM);
  const map = Object.fromEntries(items.map((i) => [i.surface, i.freq]));
  assert.equal(map["הילד"], 2);          // контент-слово, 2 употребления
  assert.equal(map["תפוח"], 1);
  assert.equal(map["אל"], undefined);    // предлог — functionGate isFunc → исключён
  assert.ok(items.every((i) => i.freq >= 1 && /[א-ת]/.test(i.surface)));
});

test("collectTypeFreq: пустой/неивритский текст → []", () => {
  assert.deepEqual(SR.collectTypeFreq("", RM), []);
  assert.deepEqual(SR.collectTypeFreq("hello world 123", RM), []);
});
```

- [ ] **Step 2: Прогнать — падает** (`collectTypeFreq` не существует)

Run: `node --test tests/studioRetell.test.js`

- [ ] **Step 3: Реализация**

В `public/js/studio-retell.js` (в IIFE, до `var API`):

```js
  // Частоты контент-типов текста (без DOM). functionGate возвращает {isFunc:false} для
  // контент-слов — проверять .isFunc, НЕ truthy (ловушка найдена на замерах S11).
  var MAX_COV_TOKENS = 60000, MAX_COV_TYPES = 4000;
  function collectTypeFreq(text, RM) {
    var out = new Map(), tokens = 0;
    var parts = String(text || "").split(/[^֐-׿'"׳״-]+/);
    for (var i = 0; i < parts.length; i++) {
      var t = RM.stripNiqqud(parts[i]).replace(/^["'׳״-]+|["'׳״-]+$/g, "");
      if (t.length < 2 || !/[א-ת]/.test(t)) continue;
      if (++tokens > MAX_COV_TOKENS) break;
      var g = RM.functionGate(t);
      if (g && g.isFunc) continue;               // служебные/числительные/имена — вне меры
      if (!out.has(t) && out.size >= MAX_COV_TYPES) continue;
      out.set(t, (out.get(t) || 0) + 1);
    }
    return Array.from(out, function (e) { return { surface: e[0], freq: e[1] }; });
  }

  // Браузер: «знакомо ~N%» для произвольного текста КАНОН-определением CorpusVocab.CFG
  // (дизайн §1.1: единственный движок уровня). null = честно нет цифры (пустой профиль,
  // нет словаря, <30% типов зарезолвилось) — цифра тогда скрывается, не фабрикуется.
  async function estimateTextCoverage(text) {
    try {
      var RM = window.ReaderMorph, CV = window.CorpusVocab, db = window.localDb;
      if (!RM || !CV || !db || typeof db.getKnownWordStates !== "function") return null;
      var items = collectTypeFreq(text, RM);
      if (!items.length) return null;
      var eng = await RM.ensureEngine();
      var keyed = [], resolved = 0;
      for (var i = 0; i < items.length; i++) {
        var card = null;
        try { card = await RM.resolveCore(eng, items[i].surface, ""); } catch (_) {}
        if (!card) continue;
        resolved++;
        var key = RM.statusKeyForCard(eng.NA, card, "", items[i].surface);
        if (key) keyed.push({ key: key, freq: items[i].freq });
      }
      if (resolved / items.length < 0.3) return null;  // резолв слаб → цифре нельзя верить
      var knownMap = await db.getKnownWordStates();
      return aggregateCoverage(keyed, knownMap, { KNOWN_STATES: CV.CFG.KNOWN_STATES, classifyZone: CV.classifyZone });
    } catch (_) { return null; }
  }
```

И в `API` добавить: `collectTypeFreq: collectTypeFreq, estimateTextCoverage: estimateTextCoverage,`.

⚠ Перед реализацией ПРОВЕРИТЬ по живому коду (и поправить вызовы, если расходится):
`grep -n "getKnownWordStates" public/index.html public/db/local-db.js` — как Студия
получает инстанс БД (`window.localDb` или иной аксессор); `grep -n "statusKeyForCard = function\|function statusKeyForCard" public/js/reader-morph.js`
— сигнатура `(NA, card, niqqud, surface)` (reader-morph.js:711).

- [ ] **Step 4: Прогнать — зелёный**

Run: `node --test tests/studioRetell.test.js`
Expected: PASS (включая новые)

- [ ] **Step 5: Commit**

```bash
git add public/js/studio-retell.js tests/studioRetell.test.js
git commit -m "feat(retell): S11 T4 — coverage-мост произвольного текста (канон-CFG corpus-vocab, честный null)"
```

---

### Task 5: UI — модал уровня, кнопка Студии, кнопка превью импорта, провайдер-хинт

**Files:**
- Modify: `public/index.html` (разметка модала + кнопка в `#v3ImportEntry`:10701 + `<script>` тег + CSS-исключения)
- Modify: `public/js/studio-retell.js` (браузерный UI-код: open/close/fill модала)
- Modify: `public/js/studio-import.js` (кнопка в превью 46845-46848 → `useTextAndRetell()`; провайдер-хинт при медиа)

**Interfaces:**
- Consumes: Task 3/4 (`estimateRetellCost`, `estimateTextCoverage`, `LEVELS`, `RETELL_LEVEL_LS_KEY`), `StudioImport.useText()` (`studio-import.js:480`).
- Produces (использует Task 6): `StudioRetell.openFromComposer()` (читает `#inputText`, показывает `#v3RetellModal`), `StudioImport.useTextAndRetell()`; DOM: `#v3RetellModal`, `#v3RetellLevel`, `#v3RetellCovNow`, `#v3RetellCost`, `#v3RetellGo`, `#v3RetellStatus`.

- [ ] **Step 1: Разметка модала** — в `public/index.html` рядом с другими `.v3-modal` (например, после `#v3ImportModal`, ~46852):

```html
<div id="v3RetellModal" class="v3-modal" hidden>
  <div class="v3-modal-backdrop" onclick="window.StudioRetell && StudioRetell.close()"></div>
  <div class="v3-modal-panel" role="dialog" aria-modal="true" aria-labelledby="v3RetellTitle" style="max-width:480px;">
    <h3 id="v3RetellTitle" data-i18n="studio.retell.title">✨ Упростить до моего уровня</h3>
    <div class="input-label" data-i18n="studio.retell.levelLabel">Уровень пересказа</div>
    <select id="v3RetellLevel" style="width:100%; box-sizing:border-box;"></select>
    <div id="v3RetellCovNow" style="font-size:12px; color:#6c757d; margin-top:6px;" hidden></div>
    <div id="v3RetellCost" style="font-size:12px; color:#6c757d; margin-top:4px;"></div>
    <div id="v3RetellStatus" style="font-size:12px; margin-top:6px;" aria-live="polite"></div>
    <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
      <button type="button" id="v3RetellGo" class="btn-primary" onclick="StudioRetell.run()" data-i18n="studio.retell.goBtn">Упростить</button>
      <button type="button" class="btn-secondary" onclick="StudioRetell.close()" data-i18n="studio.retell.cancelBtn">Отмена</button>
    </div>
  </div>
</div>
```

⚠ Перед вставкой посмотреть 1 существующий `.v3-modal` в index.html и повторить его
структуру backdrop/panel ДОСЛОВНО (классы могут отличаться от примера — истина в файле).

- [ ] **Step 2: Кнопка Студии** — `#v3ImportEntry` (index.html:10701) превратить в ряд:

```html
<div id="v3ImportEntry" style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
    <button type="button" class="btn-secondary" onclick="window.StudioImport && StudioImport.open()">📥 <span data-i18n="studio.import.button">Импорт: ссылка / файл / фото</span></button>
    <button type="button" id="v3RetellEntryBtn" class="btn-secondary" onclick="window.StudioRetell && StudioRetell.openFromComposer()">✨ <span data-i18n="studio.retell.button">Упростить до моего уровня</span></button>
</div>
```

CSS: в мобильный `@media (max-width:600px)` блок (~строка 2255, рядом с исключениями
`#v3ImportTabs`) добавить:

```css
#v3ImportEntry button { width: auto; }
```

- [ ] **Step 3: Script-тег** — в цепочку модулей index.html (~12423-12444, ПОСЛЕ
`table-chunks.js` и ДО `studio-import.js`): `<script src="/js/studio-retell.js"></script>`.
Порядок load-bearing — соседние теги смотреть в файле.

- [ ] **Step 4: Браузерный UI-код** в `public/js/studio-retell.js` (внутри IIFE):

```js
  // ------- браузерная часть (UI) -------
  function $(id) { return document.getElementById(id); }
  function tr(k, f) { try { var v = window.t && window.t(k); return v && v !== k ? v : f; } catch (_) { return f; } }
  var pendingSource = null; // {text} на время открытого модала

  function fillLevelSelect() {
    var sel = $("v3RetellLevel");
    if (!sel || sel.options.length) return;
    for (var i = 0; i < LEVELS.length; i++) {
      var o = document.createElement("option");
      o.value = LEVELS[i];
      o.textContent = LEVELS[i] + " — " + tr("studio.retell.level" + LEVELS[i], LEVELS[i]);
      sel.appendChild(o);
    }
    var last = null; try { last = localStorage.getItem(RETELL_LEVEL_LS_KEY); } catch (_) {}
    sel.value = LEVELS.includes(last) ? last : "B1";
  }

  function openFromComposer() {
    var text = (($("inputText") || {}).value || "").trim();
    if (!text) { if (window.toast) toast(tr("studio.retell.errEmptyField", "Поле ввода пусто"), "warning"); return; }
    pendingSource = { text: text };
    fillLevelSelect();
    var est = estimateRetellCost(text.length);
    $("v3RetellCost").textContent = tr("studio.retell.costLine", "Смета") + ": ≈$" + est.usd.toFixed(2) + " · ~" + est.seconds + tr("studio.retell.secShort", " сек");
    $("v3RetellStatus").textContent = "";
    var cov = $("v3RetellCovNow"); cov.hidden = true;
    estimateTextCoverage(text).then(function (c) {
      if (c && pendingSource) {
        cov.textContent = tr("studio.retell.covNow", "Знакомо сейчас") + ": ~" + Math.round(c.pct * 100) + "% · " + tr("studio.retell.zone_" + c.zone, c.zone);
        cov.hidden = false;
      }
    });
    $("v3RetellModal").hidden = false;
  }
  function close() { $("v3RetellModal").hidden = true; pendingSource = null; }
```

Функция `run()` появляется в Task 6. В T5 в `API` добавить только
`openFromComposer: openFromComposer, close: close,` — до T6 клик по «Упростить» честно
бросит `StudioRetell.run is not a function` (не маскировать заглушкой: тихий no-op хуже);
финальный смоук T8 проверяет наличие `run` в экспорте. Новый локальный ключ
`studio.retell.secShort` (" сек") — добавить в список ключей Task 7.

- [ ] **Step 5: Кнопка в превью импорта** — `public/index.html:46845-46848`, третьей кнопкой:

```html
<button type="button" class="btn-secondary" onclick="StudioImport.useTextAndRetell()" data-i18n="studio.retell.fromImportBtn">✨ Упростить…</button>
```

В `public/js/studio-import.js` — новый экспорт рядом с `useText` (и добавить в
`window.StudioImport = {...}` внизу файла):

```js
  // W2-S11: «→ В поле ввода» + сразу открыть модал пересказа (шорткат превью импорта).
  async function useTextAndRetell() {
    var t = ($("v3ImportPreview").value || "").trim();
    if (!t) { setStatus("studio.import.errEmpty"); return; }
    await useText(); // штатное приземление С паспортом импорта (derivedFrom возьмёт его)
    if (window.StudioRetell) window.StudioRetell.openFromComposer();
  }
```

- [ ] **Step 6: Провайдер-хинт (решение 7)** — в `studio-import.js`, в `showPreview()`
(строки ~355-364): после отрисовки провенанс-строки, для `kind === "audio" || kind === "captions"`
добавить строку-хинт, если активный провайдер ≠ gemini:

```js
    // W2-S11 (решение 7): дефолт-провайдер google-free не задействует seg-путь —
    // мягкая подсказка, БЕЗ автопереключения (дизайн §1.7).
    try {
      var provSel = document.getElementById("translationProvider");
      if ((meta.kind === "audio" || meta.kind === "captions") && provSel && provSel.value !== "gemini") {
        var hint = document.createElement("div");
        hint.style.cssText = "font-size:12px;color:#b8860b;margin-top:4px;";
        hint.textContent = tr("studio.retell.providerHint", "Для караоке и длинных таблиц включите провайдер Gemini");
        $("v3ImportProv").appendChild(hint);
      }
    } catch (_) {}
```

⚠ Id селектора провайдера ПРОВЕРИТЬ: `grep -n "translationProvider\|getTableDirection\|usePremium" public/index.html | head` — взять реальный id из `translateTable()` (~33104); если он другой — поправить и здесь, и нигде больше.

- [ ] **Step 7: Скриншот 380×844** (обе точки: Студия с двумя кнопками; модал открыт;
превью импорта с тремя кнопками). Playwright:

```js
// .tmp/s11-shot.js  (node .tmp/s11-shot.js при запущенном npm start)
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setViewportSize({ width: 380, height: 844 });
  await p.goto("http://localhost:3000/?v=" + Date.now());
  await p.screenshot({ path: ".tmp/s11-composer-380.png" });
  await p.click("#v3RetellEntryBtn");
  await p.screenshot({ path: ".tmp/s11-modal-380.png" });
  await b.close();
})();
```

Посмотреть оба PNG глазами (кнопки не растянуты на 100%, ряд переносится, модал читаем).

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/js/studio-retell.js public/js/studio-import.js
git commit -m "feat(retell): S11 T5 — модал уровня, кнопки Студии/превью импорта, провайдер-хинт (380px проверено)"
```

---

### Task 6: `run()` — вызов, coverage-после, подтверждение, приземление, паспорт, панель «Происхождение», фикс draft_retell

**Files:**
- Modify: `public/js/studio-retell.js` (функция `run()` + экспорт)
- Modify: `public/index.html` — `v3AttachImportSource` (23370-23383): +1 строка копии `retell`; `v3TextMetaRenderProvenance` (32126+): KIND/METHOD/`isAi`/retell-блок
- Modify: `public/js/studio-agent.js` — `applyDraftToComposer` (~1252): retell-паспорт вместо потери провенанса

**Interfaces:**
- Consumes: Task 2 (эндпоинт), Task 3/4/5; index.html-глобалы `v3SessionGet`/`v3SessionSet` (16840), `window.geminiKeyGet`.
- Produces: `StudioRetell.run()`; `v3LastGeminiMeta.source.retell` в сохранённой мете; рендер панели.

- [ ] **Step 1: `run()` в studio-retell.js**

```js
  var ERROR_KEY = {
    GEMINI_KEY_REQUIRED: "studio.retell.errNoKey",
    GEMINI_KEY_INVALID: "studio.retell.errNoKey",
    GEMINI_KEY_REJECTED: "studio.retell.errKeyRejected",
    GEMINI_QUOTA: "studio.retell.errQuota",
    GEMINI_OVERLOADED: "studio.retell.errOverloaded",
    RETELL_TOO_LONG: "studio.retell.errTooLong",
    RETELL_EMPTY_OUTPUT: "studio.retell.errFailed",
  };

  async function run() {
    if (!pendingSource) return;
    var text = pendingSource.text;
    var level = $("v3RetellLevel").value;
    try { localStorage.setItem(RETELL_LEVEL_LS_KEY, level); } catch (_) {}
    var key = typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "";
    var st = $("v3RetellStatus");
    if (!key) { st.textContent = tr("studio.retell.errNoKey", "Нужен Gemini API-ключ (BYOK)"); return; }
    $("v3RetellGo").disabled = true;
    st.textContent = tr("studio.retell.working", "Готовлю пересказ…");
    var covBeforeP = estimateTextCoverage(text); // параллельно с вызовом
    var resp, data;
    try {
      resp = await fetch("/api/ingest/retell", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, level: level, geminiApiKey: key }) });
      data = await resp.json();
    } catch (e) { st.textContent = tr("studio.retell.errNetwork", "Сеть недоступна"); $("v3RetellGo").disabled = false; return; }
    if (!resp.ok || !data || !data.ok) {
      var ek = data && data.error_code && ERROR_KEY[data.error_code];
      st.textContent = tr(ek || "studio.retell.errFailed", "Не удалось построить пересказ");
      $("v3RetellGo").disabled = false; return;
    }
    var covBefore = null; try { covBefore = await covBeforeP; } catch (_) {}
    var covAfter = null; try { covAfter = await estimateTextCoverage(data.retell); } catch (_) {}

    // подтверждение замены поля; несохранённый оригинал — отдельная формулировка
    var sess = null; try { sess = window.v3SessionGet ? window.v3SessionGet() : null; } catch (_) {}
    var savedId = sess && (sess.baseTextId || sess.textId) || null;
    var msg = savedId
      ? tr("studio.retell.confirmReplace", "Заменить текст в поле пересказом? Оригинал сохранён в Библиотеке.")
      : tr("studio.retell.confirmReplaceUnsaved", "Заменить текст в поле пересказом? Оригинал НЕ сохранён — он останется только в паспорте пересказа.");
    if (!window.confirm(msg)) { $("v3RetellGo").disabled = false; st.textContent = ""; return; }

    var prevIm = window.v3LastImportMeta || null;
    var fromImport = prevIm && prevIm.textSnapshot && prevIm.textSnapshot.trim() === text.trim();
    var input = $("inputText");
    input.value = data.retell;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    window.v3LastImportMeta = buildRetellPassport({
      originLabel: fromImport ? prevIm.source : (sess && sess.title) || "",
      importKind: fromImport ? prevIm.kind : null,
      importSource: fromImport ? prevIm.source : null,
      savedTextId: savedId, savedTitle: (sess && sess.title) || null,
      level: level, model: data.model, retellText: data.retell,
      coverage: covBefore || covAfter ? {
        before: covBefore ? Math.round(covBefore.pct * 100) / 100 : null,
        after: covAfter ? Math.round(covAfter.pct * 100) / 100 : null,
        zone: covAfter ? covAfter.zone : null,
      } : null,
    });
    // R11-мина обезврежена: «Сохранить» после пересказа обязан создавать НОВУЮ карточку
    try { window.v3SessionSet && window.v3SessionSet({ textId: null, baseTextId: null, mode: "draft", title: null }); } catch (_) {}
    close();
    if (window.toast) {
      var covLine = covBefore && covAfter
        ? " " + Math.round(covBefore.pct * 100) + "% → " + Math.round(covAfter.pct * 100) + "%"
        : "";
      toast(tr("studio.retell.done", "Пересказ в поле ввода. Соберите таблицу.") + covLine, "success");
    }
    $("v3RetellGo").disabled = false;
  }
```

В `API` добавить `run: run`.

⚠ Проверить перед кодом: `window.toast` — есть ли глобальный тост в index.html
(`grep -n "function toast" public/index.html public/js/studio-import.js`) — studio-import
использует свой `toast(key, kind)` c i18n-ключом; НЕ смешивать сигнатуры — если глобального
нет, показать статус в `#v3RetellStatus` и просто закрыть модал.

- [ ] **Step 2: `v3AttachImportSource` — копия retell-подобъекта** (index.html:23379-23380, после captions):

```js
      if (im.audio) v3LastGeminiMeta.source.audio = im.audio;
      if (im.captions) v3LastGeminiMeta.source.captions = im.captions;
      if (im.retell) v3LastGeminiMeta.source.retell = im.retell;   // W2-S11: derivedFrom/level/coverage
```

- [ ] **Step 3: Панель «Происхождение»** (index.html:32134-32180):

в `KIND` добавить: `retell: { icon: "✨", label: T("textMeta.provKindRetell", "Упрощённый пересказ (ИИ)") },`
в `METHOD` добавить: `"gemini-retell": T("textMeta.provMethodRetell", "graded-пересказ (Gemini)"),`
в `isAi`: `|| source.method === "gemini-retell"`.
После блока `if (source.edited) ...` добавить:

```js
  // W2-S11: retell-паспорт — уровень, источник-оригинал, знакомость (оценка с устройства, R9)
  if (source.kind === "retell" && source.retell) {
    const rt = source.retell;
    if (rt.level) rows.push('<div>🎯 ' + esc(T("textMeta.provRetellLevel", "Уровень")) + ': ' + esc(rt.level) + '</div>');
    const df = rt.derivedFrom || {};
    const origin = df.title || df.importSource || null;
    if (origin) rows.push('<div>↩ ' + esc(T("textMeta.provRetellFrom", "Пересказ текста")) + ': ' + esc(origin) + '</div>');
    if (rt.coverage && rt.coverage.after != null) {
      const b = rt.coverage.before != null ? Math.round(rt.coverage.before * 100) + "% → " : "";
      rows.push('<div>📊 ' + esc(T("textMeta.provRetellCov", "Знакомо (оценка с устройства)")) + ': ' +
                esc(b + Math.round(rt.coverage.after * 100) + "%") + '</div>');
    }
  }
```

- [ ] **Step 4: Фикс потери провенанса draft_retell** — `public/js/studio-agent.js`,
в `applyDraftToComposer` (~1252-1281) сразу после записи текста в `#inputText` и ДО вызова
`translateTable()`:

```js
    // W2-S11: PAS-C draft_retell терял провенанс (p.agent выбрасывался — разведка S11 §6).
    // Паспорт kind:"retell" включает существующую панель «Происхождение» бесплатно.
    if (p.agent && p.agent.scenario === "draft_retell" && window.StudioRetell) {
      window.v3LastImportMeta = window.StudioRetell.buildRetellPassport({
        originLabel: p.title || "", importKind: "corpus", importSource: p.title || null,
        savedTextId: null, savedTitle: p.title || null,
        level: null, model: p.agent.model || null, retellText: p.source_text,
        coverage: null,
      });
    }
```

⚠ Прочитать `applyDraftToComposer` целиком перед правкой: точные имена полей payload
(`p.source_text`, `p.agent.scenario`, `p.agent.model`, `p.title`) сверить по коду
`library-ui.js:4176-4196` (пишущая сторона handoff).

- [ ] **Step 5: Ручная проверка цепочки локально**

Run: `npm start`, в браузере: вставить иврит-текст → ✨ Упростить → уровень B1 →
(без ключа: честный disabled-статус; с ключом: пересказ) → подтвердить замену →
Собрать таблицу → Сохранить (создаётся НОВАЯ карточка, старая не тронута) →
открыть мета-модал → панель «Происхождение» показывает «Упрощённый пересказ (ИИ) · Уровень B1».
Проверить в DevTools: `v3SessionGet().baseTextId === null` сразу после приземления.
Дополнительно: сохранить пересказ → переоткрыть карточку из Библиотеки → мета-модал
по-прежнему показывает провенанс (панель имеет фолбэк на `source_meta_json`).
ИЗВЕСТНЫЙ pre-existing баг (НЕ чинить молча в этом слайсе, дизайн §9): LOCAL create
пишет паспорт в `source_meta_json`, а путь ОТКРЫТИЯ текста читает только
`table_model_meta_json` → после «сохранить→переоткрыть» `v3LastGeminiMeta` в композере
становится null. На пересказ не влияет (медиа-паспорта нет), панель работает через
фолбэк; если ревью T9 сочтёт нужным чинить — отдельным коммитом с явной пометкой.

- [ ] **Step 6: Commit**

```bash
git add public/js/studio-retell.js public/js/studio-agent.js public/index.html
git commit -m "feat(retell): S11 T6 — run(): вызов+coverage до/после+подтверждение+приземление отдельным текстом; retell в паспорте и панели; фикс провенанса draft_retell"
```

---

### Task 7: Локали ru/en/he + бамп версий + SW precache

**Files:**
- Modify: `public/i18n/locales/ru.js`, `en.js`, `he.js` (неймспейс `studio.retell.*` внутри объекта `studio:` рядом с `import:` (ru.js:3043); ключи `textMeta.provKindRetell` и др. — рядом с существующими `textMeta.prov*`)
- Modify: `public/index.html` — три тега `/i18n/locales/*.js?v=72` → `?v=73` (12349-12351)
- Modify: `tests/i18n.locale-version.lock.json` — через `node tests/i18n.smoke.js --write-lock`
- Modify: `public/sw.js` — precache `"/js/studio-retell.js"` (после `"/js/studio-import.js"`, :122) + `CACHE_VERSION` `"v3.11.257"` → `"v3.11.258"` (:32)

**Interfaces:**
- Consumes: все ключи из Task 5/6: `studio.retell.{title, button, fromImportBtn, levelLabel, levelA1, levelA2, levelB1, levelB2, goBtn, cancelBtn, costLine, secShort, covNow, zone_easy, zone_in, zone_hard, working, done, confirmReplace, confirmReplaceUnsaved, errEmptyField, errNoKey, errKeyRejected, errQuota, errOverloaded, errTooLong, errFailed, errNetwork, providerHint}` + `textMeta.{provKindRetell, provMethodRetell, provRetellLevel, provRetellFrom, provRetellCov}`.

- [ ] **Step 1: Собрать ПОЛНЫЙ список ключей из кода**

Run: `grep -oE "studio\.retell\.[a-zA-Z_]+|textMeta\.provRetell[a-zA-Z]*|textMeta\.provKindRetell|textMeta\.provMethodRetell" public/index.html public/js/studio-retell.js public/js/studio-import.js public/js/studio-agent.js | sort -u`
Каждый найденный ключ обязан попасть во все ТРИ локали (tt-fallback мёртв — урок проекта).

- [ ] **Step 2: Добавить переводы** (ru — основной; en/he — полноценные, не транслит):

```js
// ru.js, внутри studio: { ..., retell: {
retell: {
  title: "✨ Упростить до моего уровня",
  button: "Упростить до моего уровня",
  fromImportBtn: "✨ Упростить…",
  levelLabel: "Уровень пересказа",
  levelA1: "начинающий", levelA2: "элементарный", levelB1: "средний", levelB2: "выше среднего",
  goBtn: "Упростить", cancelBtn: "Отмена",
  costLine: "Смета", covNow: "Знакомо сейчас",
  zone_easy: "легко", zone_in: "зона роста", zone_hard: "сложно",
  working: "Готовлю пересказ…",
  done: "Пересказ в поле ввода. Соберите таблицу.",
  confirmReplace: "Заменить текст в поле пересказом? Оригинал сохранён в Библиотеке.",
  confirmReplaceUnsaved: "Заменить текст в поле пересказом? Оригинал НЕ сохранён — он останется только в паспорте пересказа.",
  errEmptyField: "Поле ввода пусто",
  errNoKey: "Нужен Gemini API-ключ (BYOK) — добавьте в настройках",
  errKeyRejected: "Google отклонил ваш Gemini-ключ — проверьте ключ",
  errQuota: "Квота Gemini исчерпана — повторите позже",
  errOverloaded: "Gemini перегружен — попробуйте через минуту",
  errTooLong: "Текст слишком длинный для пересказа (лимит ~100 000 символов)",
  errFailed: "Не удалось построить пересказ",
  errNetwork: "Сеть недоступна",
  providerHint: "Для караоке и длинных таблиц включите провайдер Gemini",
},
```

(en/he — те же ключи, переводы полноценные; he — RTL-совместимые формулировки.)
В `textMeta`: `provKindRetell: "Упрощённый пересказ (ИИ)"`, `provMethodRetell: "graded-пересказ (Gemini)"`, `provRetellLevel: "Уровень"`, `provRetellFrom: "Пересказ текста"`, `provRetellCov: "Знакомо (оценка с устройства)"`.

- [ ] **Step 3: Бампы одним изменением**

- index.html: три тега `?v=72` → `?v=73`;
- `node tests/i18n.smoke.js --write-lock`;
- sw.js: precache + `CACHE_VERSION = "v3.11.258"`.

- [ ] **Step 4: Прогнать i18n-гейт**

Run: `node tests/i18n.smoke.js`
Expected: PASS (включая Suite 10 cache-bust)

- [ ] **Step 5: Commit**

```bash
git add public/i18n/locales/ru.js public/i18n/locales/en.js public/i18n/locales/he.js public/index.html public/sw.js tests/i18n.locale-version.lock.json
git commit -m "feat(retell): S11 T7 — локали studio.retell (ru/en/he), locale v=73, SW precache studio-retell.js, CACHE_VERSION v3.11.258"
```

---

### Task 8: Смоуки — детерминированный гейт + live-смоук с R1-сканом

**Files:**
- Create: `scripts/premium/studio-retell-smoke.js`
- Create: `scripts/premium/retell-live-smoke.js`
- Modify: `package.json` (scripts: `"smoke:studio-retell": "node scripts/premium/studio-retell-smoke.js"`, `"smoke:retell-live": "node scripts/premium/retell-live-smoke.js"`)

**Interfaces:**
- Consumes: Task 1-7 всё; `agent/access/wordMorphologyResolver.js` (`resolveCoverageToken({word})` — Node, для OOV-скана).
- Produces: гейты `npm run smoke:studio-retell` (офлайн, CI-safe) и `npm run smoke:retell-live` (1 реальный вызов, quota-aware).

- [ ] **Step 1: Детерминированный смоук** — pure-API + wiring-маркеры (config-string-match):

```js
// scripts/premium/studio-retell-smoke.js
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const SR = require(path.join(ROOT, "public/js/studio-retell.js"));
const IR = require(path.join(ROOT, "ingest/retell.js"));
let fails = 0;
function check(name, ok) { console.log((ok ? "✓ " : "✗ ") + name); if (!ok) fails++; }

check("LEVELS зеркала совпадают", JSON.stringify(SR.LEVELS) === JSON.stringify(IR.LEVELS));
check("StudioRetell экспортирует полный API", ["openFromComposer", "close", "run", "estimateRetellCost", "buildRetellPassport", "estimateTextCoverage", "aggregateCoverage"].every((k) => typeof SR[k] === "function"));
const p = SR.buildRetellPassport({ originLabel: "x", level: "B1", model: "m", retellText: "א." });
check("паспорт без audio/captions", p.audio === undefined && p.captions === undefined && p.kind === "retell");

const idx = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
check("index.html: модал v3RetellModal", idx.includes('id="v3RetellModal"'));
check("index.html: кнопка композера v3RetellEntryBtn", idx.includes('id="v3RetellEntryBtn"'));
check("index.html: v3AttachImportSource копирует im.retell", /if \(im\.retell\) v3LastGeminiMeta\.source\.retell = im\.retell/.test(idx));
check("index.html: KIND retell в панели провенанса", idx.includes("provKindRetell"));
check("index.html: script-тег studio-retell.js", idx.includes('src="/js/studio-retell.js"'));

const sw = fs.readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
check("sw.js: precache studio-retell.js", sw.includes('"/js/studio-retell.js"'));

for (const loc of ["ru", "en", "he"]) {
  const l = fs.readFileSync(path.join(ROOT, "public/i18n/locales", loc + ".js"), "utf8");
  check("локаль " + loc + ": studio.retell.*", l.includes("retell:") && l.includes("providerHint") && l.includes("confirmReplaceUnsaved"));
  check("локаль " + loc + ": textMeta.provKindRetell", l.includes("provKindRetell"));
}

const routes = fs.readFileSync(path.join(ROOT, "ingest/routes.js"), "utf8");
check("routes: /api/ingest/retell зарегистрирован с limiter", /app\.post\("\/api\/ingest\/retell", limiter/.test(routes));

console.log(fails ? `FAIL: ${fails}` : "OK");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Live-смоук (quota-aware, R1-скан)**

```js
// scripts/premium/retell-live-smoke.js
// 1 реальный вызов /api/ingest/retell-класса (напрямую Gemini через ingest/retell-промт).
// Пропуск (exit 0 с пометкой SKIP) без ключа или при 429 — free tier 20 req/день
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
  const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: IR.buildRetellPrompt(SRC, "A2") }] }],
                           generationConfig: { temperature: 0, maxOutputTokens: 16384 } }),
  });
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
```

- [ ] **Step 3: Прогнать оба**

Run: `npm run smoke:studio-retell` → OK; `npm run smoke:retell-live` → OK или SKIP (при исчерпанной квоте — SKIP легитимен, отметить в PR-описании релиза).

- [ ] **Step 4: Commit**

```bash
git add scripts/premium/studio-retell-smoke.js scripts/premium/retell-live-smoke.js package.json
git commit -m "feat(retell): S11 T8 — детерминированный смоук-гейт (wiring/локали/SW) + live-смоук с R1 OOV-сканом"
```

---

### Task 9: Релиз — полный гейт-набор, whole-branch ревью, push, прод-верификация, owner-приёмка

**Files:**
- Modify: `docs/planning/STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md` (§4/§7: S11 → SHIPPED со ссылками)
- Modify: `docs/planning/STUDIO_INGEST_W2_S11_GRADED_RETELL_DESIGN_2026_07_28.md` (шапка-статус)

- [ ] **Step 1: Полный гейт-набор локально**

```bash
node --test tests/ingestRetell.test.js tests/studioRetell.test.js tests/ingestGeminiError.test.js
npm run smoke:studio-retell
npm run smoke:ingest
node tests/i18n.smoke.js
npm run smoke:reader-parity
npm run smoke:corpus-vocab
npm run smoke:retell-live   # OK или SKIP(квота)
```
Expected: все PASS/OK (retell-live допускает SKIP).

- [ ] **Step 2: Whole-branch ревью ДО пуша** — subagent-driven flow: диспетчеризовать
code-reviewer на `git diff <база-S11>..HEAD` (все коммиты T1-T8); внимание ревью:
мина baseTextId (сессия сбрасывается ПОСЛЕ приземления), shared-паспорт (retell не несёт
audio), порядок script-тегов, кэш-ключ включает level, ключ не логируется. Найденные
BLOCKER/MAJOR — чинить до пуша.

- [ ] **Step 3: Обновить канон-доки** — в decision packet §4 п.10 и §7: S11 SHIPPED
vX (реальная версия), ссылки на дизайн/план/замеры; в дизайн-доке шапка →
`SHIPPED vX <дата> (владелец-приёмка pending)`.

- [ ] **Step 4: Прод-предполётная проверка и push**

```bash
ssh -i ~/.ssh/<SSH_KEY> <SSH_USER>@<PROD_IP> "df -h /"   # диск (урок 2026-07-28: было 100%)
git push origin main
```

- [ ] **Step 5: Прод-верификация после деплоя Coolify**

```bash
curl -s https://linguistpro.kolosei.com/healthz
curl -s -X POST https://linguistpro.kolosei.com/api/ingest/retell -H "Content-Type: application/json" -d '{"text":"שלום.","level":"B1"}'
# ожидание: 401 {"ok":false,...,"error_code":"GEMINI_KEY_REQUIRED"}
curl -s https://linguistpro.kolosei.com/sw.js | grep CACHE_VERSION   # v3.11.258
curl -s https://linguistpro.kolosei.com/js/studio-retell.js | head -3
```
Rolling-update даёт транзиентные 404 — подождать и повторить (урок Coolify).

- [ ] **Step 6: Owner-приёмка (последняя задача, блокирует закрытие слайса)**

Сценарии владельцу: (1) импортированная статья → Упростить B1 → таблица → сохранить →
панель «Происхождение»; (2) вставленный вручную сложный текст → Упростить A2 →
coverage-строка до/после (профиль владельца непустой); (3) проверить, что оригинал
в Библиотеке нетронут; (4) TTS-озвучка пересказа с word-подсветкой; (5) iPhone-регресс
композера (кнопки не разъехались). Результат — в decision packet §7.

- [ ] **Step 7: Финальный коммит статусов**

```bash
git add docs/planning/STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md docs/planning/STUDIO_INGEST_W2_S11_GRADED_RETELL_DESIGN_2026_07_28.md
git commit -m "docs(planning): S11 SHIPPED — статусы канона обновлены"
git push origin main
```
