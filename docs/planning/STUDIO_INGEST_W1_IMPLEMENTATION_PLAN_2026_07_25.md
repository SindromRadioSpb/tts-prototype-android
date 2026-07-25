# Studio Ingest Wave 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Единая точка входа «Импорт» в Студии + четыре сценария Wave 1: S3 (любой язык → иврит-таблица), S1 (URL статьи → текст, анти-SSRF), S8 (фото → OCR → текст), S2 (PDF/Word → текст) — по архитектуре A (browser-first BYOK, тонкий сервер-прокси).

**Architecture:** Извлечение текста отделено от построения таблицы: новые эндпоинты `/api/ingest/*` возвращают ЧИСТЫЙ ТЕКСТ + провенанс-паспорт, текст приземляется в существующий `#inputText` Студии, дальше работает весь существующий пайплайн (таблица → Library → «Мои тексты» Зала). URL-извлечение и DOCX — детерминированные, без LLM (R16); фото/PDF — Gemini multimodal через BYOK-прокси (ключ пользователя per-request, как в `/api/translate-table`). S3 — параметр `direction` существующего эндпоинта.

**Tech Stack:** Node/Express (server.js, monolith + модули в топик-каталогах), vanilla JS (`public/js/*.js`, Studio live-код inline в `index.html`), `@google/generative-ai`, новые deps: `linkedom` + `@mozilla/readability`; `adm-zip` (уже есть) для DOCX; `node --test` (`tests/*.test.js`); smoke-скрипты по образцу `scripts/api-smoke.js`.

**Канон-контекст:** `docs/planning/STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md` (I-GO-W1 = GO 2026-07-25).

## Global Constraints

- **BYOK-only**: серверного GEMINI_API_KEY НЕТ и не появляется; ключ приходит per-request из браузера; формат ключа `/^(AIza|AQ\.)/` (новые AQ.-ключи валидны — см. память `reference_google_api_key_consoles`).
- **R11 честная деградация**: извлечение не удалось / низкая уверенность → явная ошибка или warning-бейдж, НИКОГДА молчаливый мусор в `#inputText`.
- **R9 derived≠asserted**: любой извлечённый (OCR/PDF/URL) и сгенерированный (any-he) текст несёт провенанс-паспорт `{kind, source, method, model, at}`.
- **R14 анти-SSRF**: только http/https, только порты 80/443, запрет приватных/loopback/link-local/CGNAT/metadata IP (v4+v6), ревалидация КАЖДОГО redirect-хопа, максимум 5 редиректов, таймаут 15с, максимум 5MB HTML.
- Файлы image/PDF: лимит 6MB (глобальный body-limit 10mb, base64-оверхед); ошибка лимита — с внятным текстом.
- Ошибки API — JSON с `error_code` (паттерн `GEMINI_KEY_REQUIRED` уже в кодовой базе).
- Все новые UI-строки → все ТРИ локали `public/i18n/locales/{ru,en,he}.js` (t() возвращает ключ при промахе — fallback-аргумент недостижим) + бамп `CACHE_VERSION` в `public/sw.js` (сейчас v3.11.241 → следующий патч-номер на момент коммита).
- `renderTable` и reader-ядро НЕ трогать (byte-parity гейт `smoke:reader-parity`); `library.html`/Зал в W1 не трогаем вообще.
- Новые модальные окна — класс `.v3-modal` (mobile-исключения `button { width:auto }` уже прописаны для него); перед каждым UI-коммитом — Playwright-скриншот @380×844.
- Перед каждым коммитом — зелёные релевантные гейты; после пуша в main Coolify авто-деплоит (docs-коммиты безвредны; кодовые — прод-верифай в финальной задаче).
- Git-коммиты — с trailer'ами Co-Authored-By/Claude-Session (норма сессии).

## File Structure (итог W1)

```
ingest/                                  # НОВЫЙ топик-каталог серверных модулей (по образцу agent/, db/)
  geminiKey.js                           # isPlausibleGeminiKey(key)
  ssrfGuard.js                           # isPrivateIp, assertPublicHttpUrl, safeFetchHtml
  urlExtract.js                          # extractArticle(html, url) — Readability + strip-fallback
  docxExtract.js                         # extractDocxText(buffer) — adm-zip, без LLM
  routes.js                              # registerIngestRoutes(app, deps) — /api/ingest/fetch-url, /api/ingest/extract-file
server.js                                # +require ingest/routes; /api/translate-table: +direction, общий валидатор ключа
public/js/studio-import.js               # НОВЫЙ клиент-модуль window.StudioImport (диалог «Импорт»)
public/index.html                        # +кнопка «Импорт», +модал #v3ImportModal, +селектор направления, +<script>, провенанс в v3LastGeminiMeta
public/sw.js                             # +precache studio-import.js, bump CACHE_VERSION
public/i18n/locales/{ru,en,he}.js        # новые ключи studio.import.* и classic.direction*
tests/ingestSsrfGuard.test.js            # unit
tests/ingestUrlExtract.test.js           # unit (фикстуры)
tests/ingestDocxExtract.test.js          # unit (фикстура .docx)
tests/ingestGeminiKey.test.js            # unit
scripts/ingest-smoke.js                  # детерминированный smoke (спавн сервера, без LLM/сети)
scripts/premium/ingest-live-smoke.js     # owner-keyed live smoke (реальный ключ, ручной)
scripts/premium/ingest-pdf-gold.js       # харнесс gold-чека PDF (W1-exit gate перед пилотом)
scripts/premium/fixtures/ingest/         # article-he.html, sample-he.docx, make-sample-docx.js, README.md
package.json                             # deps linkedom + @mozilla/readability; script smoke:ingest
```

Порядок: серверные задачи 1–7 (эндпоинты живут раньше UI), клиент 8–10, релиз-гейт 11, инструменты владельца 12, docs 13.

---

### Task 1: Общий валидатор Gemini-ключа (AIza + AQ.)

**Files:**
- Create: `ingest/geminiKey.js`
- Modify: `server.js:6320` (проверка формата в `/api/translate-table`)
- Test: `tests/ingestGeminiKey.test.js`

**Interfaces:**
- Produces: `isPlausibleGeminiKey(key: any) => boolean` — true для строк `/^AIza/` длиной ≥20 и `/^AQ\./` длиной ≥10.

- [ ] **Step 1: Write the failing test**

```js
// tests/ingestGeminiKey.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isPlausibleGeminiKey } = require("../ingest/geminiKey.js");

test("accepts AIza and AQ. key formats", () => {
  assert.equal(isPlausibleGeminiKey("AIzaSyA-fake-key-for-tests-123"), true);
  assert.equal(isPlausibleGeminiKey("AQ.fake-new-console-key-123"), true);
});

test("rejects junk", () => {
  for (const bad of [null, undefined, 42, "", "  ", "sk-openai", "AIza", "AQ."]) {
    assert.equal(isPlausibleGeminiKey(bad), false, String(bad));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ingestGeminiKey.test.js`
Expected: FAIL — `Cannot find module '../ingest/geminiKey.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// ingest/geminiKey.js
// Единый валидатор формата Gemini API-ключа для всех BYOK-эндпоинтов.
// Два живых формата консолей Google: классический "AIza…" (Google AI Studio)
// и новый "AQ.…" (см. память reference_google_api_key_consoles) — оба валидны.
"use strict";

function isPlausibleGeminiKey(key) {
  if (typeof key !== "string") return false;
  const k = key.trim();
  if (/^AIza/.test(k)) return k.length >= 20;
  if (/^AQ\./.test(k)) return k.length >= 10;
  return false;
}

module.exports = { isPlausibleGeminiKey };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ingestGeminiKey.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Заменить AIza-only проверку в `/api/translate-table`**

В `server.js` добавить рядом с прочими require: `const { isPlausibleGeminiKey } = require("./ingest/geminiKey.js");`
Заменить блок на строках ~6319–6325:

```js
    const trimmedKey = geminiApiKey.trim();
    if (!isPlausibleGeminiKey(trimmedKey)) {
      return res.status(400).json({
        error: "Неверный формат Gemini API Key (ожидается 'AIza…' или 'AQ.…').",
        error_code: "GEMINI_KEY_INVALID",
      });
    }
```

- [ ] **Step 6: Гейты и коммит**

Run: `node --test tests/ingestGeminiKey.test.js && node -c server.js` (синтаксис) и `npm run test:api-smoke`
Expected: PASS / smoke зелёный

```bash
git add ingest/geminiKey.js tests/ingestGeminiKey.test.js server.js
git commit -m "feat(ingest): shared Gemini key validator, accept new AQ. key format"
```

---

### Task 2: SSRF-guard модуль

**Files:**
- Create: `ingest/ssrfGuard.js`
- Test: `tests/ingestSsrfGuard.test.js`

**Interfaces:**
- Produces:
  - `isPrivateIp(ip: string) => boolean`
  - `assertPublicHttpUrl(rawUrl: string, opts?: {resolveAll?: (host)=>Promise<string[]>}) => Promise<URL>` — бросает Error с `.code` ∈ {BAD_URL, BAD_SCHEME, BAD_PORT, PRIVATE_ADDR}; message начинается с кода.
  - `safeFetchHtml(rawUrl, opts?: {maxBytes?, timeoutMs?, maxRedirects?, resolveAll?, fetchImpl?}) => Promise<{html: string, finalUrl: string}>` — коды ошибок дополнительно: FETCH_FAILED, NOT_HTML, TOO_LARGE, TOO_MANY_REDIRECTS, FETCH_TIMEOUT.
- `resolveAll`/`fetchImpl` инжектируются для тестов (unit-тесты БЕЗ сети).

- [ ] **Step 1: Write the failing test**

```js
// tests/ingestSsrfGuard.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isPrivateIp, assertPublicHttpUrl, safeFetchHtml } = require("../ingest/ssrfGuard.js");

test("isPrivateIp blocks loopback/RFC1918/link-local/CGNAT/metadata/v6-private", () => {
  const bad = ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
               "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fe80::1", "fd00::1", "fc00::2", "::ffff:10.0.0.1"];
  for (const ip of bad) assert.equal(isPrivateIp(ip), true, ip);
  const good = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700::1111", "93.184.216.34"];
  for (const ip of good) assert.equal(isPrivateIp(ip), false, ip);
});

test("isPrivateIp fails closed on garbage", () => {
  for (const junk of ["", "999.1.1.1", "1.2.3", "abc"]) assert.equal(isPrivateIp(junk), true, junk);
});

test("assertPublicHttpUrl rejects scheme/credentials/port/literal-private", async () => {
  await assert.rejects(assertPublicHttpUrl("ftp://example.com/"), /BAD_SCHEME/);
  await assert.rejects(assertPublicHttpUrl("file:///etc/passwd"), /BAD_SCHEME/);
  await assert.rejects(assertPublicHttpUrl("not a url"), /BAD_URL/);
  await assert.rejects(assertPublicHttpUrl("http://u:p@example.com/"), /BAD_URL/);
  await assert.rejects(assertPublicHttpUrl("http://example.com:8080/x"), /BAD_PORT/);
  await assert.rejects(assertPublicHttpUrl("http://127.0.0.1/x"), /PRIVATE_ADDR/);
  await assert.rejects(assertPublicHttpUrl("http://[::1]/x"), /PRIVATE_ADDR/);
  await assert.rejects(assertPublicHttpUrl("http://localhost/x"), /PRIVATE_ADDR/);
});

test("assertPublicHttpUrl resolves hostnames and rejects private results", async () => {
  const fake = async (host) => (host === "evil.example" ? ["93.184.216.34", "10.0.0.9"] : ["93.184.216.34"]);
  await assert.rejects(assertPublicHttpUrl("http://evil.example/", { resolveAll: fake }), /PRIVATE_ADDR/);
  const u = await assertPublicHttpUrl("https://ok.example/a", { resolveAll: fake });
  assert.equal(u.hostname, "ok.example");
});

test("safeFetchHtml follows redirects re-validating each hop and caps size", async () => {
  const fake = async () => ["93.184.216.34"];
  const pages = {
    "https://ok.example/start": { status: 302, headers: { location: "https://ok.example/final" } },
    "https://ok.example/final": { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: "<html><body>שלום</body></html>" },
    "https://ok.example/to-private": { status: 302, headers: { location: "http://192.168.0.1/" } },
    "https://ok.example/big": { status: 200, headers: { "content-type": "text/html" }, body: "x".repeat(200) },
    "https://ok.example/json": { status: 200, headers: { "content-type": "application/json" }, body: "{}" },
  };
  const fetchImpl = async (url) => {
    const p = pages[String(url)];
    if (!p) throw new Error("unexpected url " + url);
    return {
      status: p.status, ok: p.status >= 200 && p.status < 300,
      headers: { get: (k) => p.headers[k.toLowerCase()] || null },
      arrayBuffer: async () => Buffer.from(p.body || "", "utf8"),
    };
  };
  const okRes = await safeFetchHtml("https://ok.example/start", { resolveAll: fake, fetchImpl });
  assert.match(okRes.html, /שלום/);
  assert.equal(okRes.finalUrl, "https://ok.example/final");
  await assert.rejects(safeFetchHtml("https://ok.example/to-private", { resolveAll: fake, fetchImpl }), /PRIVATE_ADDR/);
  await assert.rejects(safeFetchHtml("https://ok.example/big", { resolveAll: fake, fetchImpl, maxBytes: 100 }), /TOO_LARGE/);
  await assert.rejects(safeFetchHtml("https://ok.example/json", { resolveAll: fake, fetchImpl }), /NOT_HTML/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ingestSsrfGuard.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```js
// ingest/ssrfGuard.js
// R14: серверный fetch произвольных URL — единственная новая внешняя поверхность W1.
// Fail-closed политика: непонятный IP = приватный; порты только 80/443; каждый
// redirect-хоп проходит полную ревалидацию. Остаточный риск DNS-rebinding
// (resolve→fetch TOCTOU) осознан и сужен: ответ используется ТОЛЬКО как text/html
// для извлечения статьи, порты ограничены, приватные диапазоны отрезаны на resolve.
"use strict";

const dns = require("dns").promises;
const net = require("net");

function ingestErr(code, msgRu) {
  const e = new Error(`${code}: ${msgRu}`);
  e.code = code;
  return e;
}

function isPrivateIp(ip) {
  if (typeof ip !== "string" || !ip.trim()) return true; // fail closed
  const v = ip.trim().toLowerCase();
  if (net.isIPv6(v)) {
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return false;
  }
  if (net.isIP(v) !== 4) return true; // не IP вовсе — fail closed
  const p = v.split(".").map(Number);
  if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 169 && p[1] === 254) return true; // link-local + cloud metadata
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
  return false;
}

async function defaultResolveAll(host) {
  const recs = await dns.lookup(host, { all: true, verbatim: true });
  return recs.map((r) => r.address);
}

async function assertPublicHttpUrl(rawUrl, opts = {}) {
  const resolveAll = opts.resolveAll || defaultResolveAll;
  let u;
  try { u = new URL(String(rawUrl)); } catch { throw ingestErr("BAD_URL", "Некорректный URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw ingestErr("BAD_SCHEME", "Разрешены только http/https");
  if (u.username || u.password) throw ingestErr("BAD_URL", "URL с учётными данными запрещён");
  if (u.port && u.port !== "80" && u.port !== "443") throw ingestErr("BAD_PORT", "Разрешены только порты 80/443");
  const host = u.hostname.replace(/^\[|\]$/g, ""); // [::1] → ::1
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw ingestErr("PRIVATE_ADDR", "Внутренние адреса запрещены");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw ingestErr("PRIVATE_ADDR", "Приватный IP запрещён");
    return u;
  }
  let addrs;
  try { addrs = await resolveAll(host); } catch { throw ingestErr("PRIVATE_ADDR", "Хост не разрешается"); }
  if (!Array.isArray(addrs) || addrs.length === 0 || addrs.some(isPrivateIp)) {
    throw ingestErr("PRIVATE_ADDR", "Хост указывает на приватный адрес");
  }
  return u;
}

function decodeHtmlBuffer(buf, contentType) {
  const ctCharset = /charset=([\w-]+)/i.exec(contentType || "");
  const headSample = buf.slice(0, 2048).toString("latin1");
  const metaCharset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(headSample);
  const enc = (ctCharset && ctCharset[1]) || (metaCharset && metaCharset[1]) || "utf-8";
  try { return new TextDecoder(enc).decode(buf); }
  catch { return buf.toString("utf8"); }
}

async function safeFetchHtml(rawUrl, opts = {}) {
  const { maxBytes = 5 * 1024 * 1024, timeoutMs = 15000, maxRedirects = 5, resolveAll, fetchImpl } = opts;
  const doFetch = fetchImpl || fetch; // Node 18+ global fetch
  let current = String(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const u = await assertPublicHttpUrl(current, { resolveAll });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let resp;
      try {
        resp = await doFetch(u.toString(), {
          redirect: "manual",
          signal: ctrl.signal,
          headers: {
            "user-agent": "LinguistPro-Ingest/1.0 (+https://linguistpro.kolosei.com)",
            accept: "text/html,application/xhtml+xml",
          },
        });
      } catch (e) {
        if (e && e.name === "AbortError") throw ingestErr("FETCH_TIMEOUT", "Превышено время загрузки страницы");
        throw ingestErr("FETCH_FAILED", "Не удалось загрузить страницу");
      }
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get("location");
        if (!loc) throw ingestErr("FETCH_FAILED", "Редирект без Location");
        current = new URL(loc, u).toString();
        continue;
      }
      if (!resp.ok) throw ingestErr("FETCH_FAILED", `HTTP ${resp.status}`);
      const ct = (resp.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
        throw ingestErr("NOT_HTML", "Страница не является HTML");
      }
      const ab = await resp.arrayBuffer();
      const buf = Buffer.from(ab);
      if (buf.length > maxBytes) throw ingestErr("TOO_LARGE", "Страница слишком большая");
      return { html: decodeHtmlBuffer(buf, ct), finalUrl: u.toString() };
    } finally {
      clearTimeout(timer);
    }
  }
  throw ingestErr("TOO_MANY_REDIRECTS", "Слишком много редиректов");
}

module.exports = { isPrivateIp, assertPublicHttpUrl, safeFetchHtml, ingestErr };
```

Примечание для реализатора: тестовый `fetchImpl` возвращает весь body через `arrayBuffer()` — поэтому и прод-ветка читает `arrayBuffer()` с пост-фактум проверкой размера. 5MB на CX23 приемлемо (страница читается за один запрос, буфер короткоживущий). НЕ переходить на стриминг в W1 — YAGNI.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ingestSsrfGuard.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add ingest/ssrfGuard.js tests/ingestSsrfGuard.test.js
git commit -m "feat(ingest): SSRF guard — public-http-only URL validation + safe HTML fetch"
```

---

### Task 3: Извлечение статьи из HTML (Readability + честный fallback)

**Files:**
- Create: `ingest/urlExtract.js`, `scripts/premium/fixtures/ingest/article-he.html`, `scripts/premium/fixtures/ingest/README.md`
- Modify: `package.json` (deps)
- Test: `tests/ingestUrlExtract.test.js`

**Interfaces:**
- Consumes: —
- Produces: `extractArticle(html: string, url: string) => {title: string|null, byline: string|null, text: string, method: "readability"|"strip", warnings: string[]}` — бросает Error `.code="EXTRACT_EMPTY"`, если извлечь нечего (<80 симв. после нормализации).

- [ ] **Step 1: Установить зависимости**

Run: `npm install linkedom @mozilla/readability --save`
Expected: обе появляются в `dependencies` package.json (обе — чистый JS, без нативных модулей).

- [ ] **Step 2: Создать HTML-фикстуру**

`scripts/premium/fixtures/ingest/article-he.html` (реалистичная страница с boilerplate):

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><title>חדשות הבוקר — אתר בדיקה</title></head>
<body>
  <nav><ul><li><a href="/">ראשי</a></li><li><a href="/sports">ספורט</a></li><li><a href="/weather">מזג אוויר</a></li></ul></nav>
  <div class="ad-banner">פרסומת: קנו עכשיו במבצע!</div>
  <article>
    <h1>ראש הממשלה נאם הבוקר בכנסת</h1>
    <p class="byline">מאת: כתב הבדיקה</p>
    <p>ראש הממשלה נשא הבוקר נאום ארוך בכנסת על מצב המשק. לדבריו, הכלכלה צומחת בקצב מהיר מהצפוי, והאבטלה נמצאת בשפל היסטורי.</p>
    <p>באופוזיציה מיהרו להגיב: לטענתם, יוקר המחיה ממשיך לעלות והציבור אינו מרגיש את הצמיחה. הדיון בכנסת נמשך כשלוש שעות.</p>
    <p>בסיום הדיון נערכה הצבעה על הצעת החוק החדשה, שעברה ברוב של שישים ואחד תומכים.</p>
  </article>
  <footer><p>כל הזכויות שמורות © אתר בדיקה 2026</p><p><a href="/about">אודות</a> | <a href="/contact">צור קשר</a></p></footer>
</body>
</html>
```

И `scripts/premium/fixtures/ingest/README.md`:

```markdown
# Ingest test fixtures (W1)

- `article-he.html` — рукописная HTML-фикстура «новостная статья на иврите с boilerplate»
  для tests/ingestUrlExtract.test.js. Ручная, редактируется свободно (тест держит инварианты).
- `sample-he.docx` — бинарная DOCX-фикстура для tests/ingestDocxExtract.test.js.
  СГЕНЕРИРОВАНА скриптом `make-sample-docx.js` (npm-пакет `docx`). Не редактировать руками —
  перегенерировать: `node scripts/premium/fixtures/ingest/make-sample-docx.js`.
- Всё в этой папке — тестовые данные, коммитятся в git (артефакт-правило CLAUDE.md).
```

- [ ] **Step 3: Write the failing test**

```js
// tests/ingestUrlExtract.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { extractArticle } = require("../ingest/urlExtract.js");

const FIXTURE = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "premium", "fixtures", "ingest", "article-he.html"), "utf8");

test("readability path: main text in, boilerplate out", () => {
  const r = extractArticle(FIXTURE, "https://news.example/morning");
  assert.equal(r.method, "readability");
  assert.match(r.title || "", /נאם הבוקר בכנסת|חדשות הבוקר/);
  assert.match(r.text, /נשא הבוקר נאום ארוך בכנסת/);
  assert.match(r.text, /שישים ואחד תומכים/);
  assert.doesNotMatch(r.text, /כל הזכויות שמורות/);   // footer
  assert.doesNotMatch(r.text, /קנו עכשיו במבצע/);      // ad
  assert.equal(r.warnings.length, 0);
});

test("strip fallback on page Readability cannot parse, with warning", () => {
  const thin = "<html><body><div>שלום עולם. זהו טקסט קצר אבל מספיק ארוך כדי לעבור את סף שמונים התווים של הבדיקה הזאת בקלות רבה.</div></body></html>";
  const r = extractArticle(thin, "https://x.example/");
  assert.equal(r.method, "strip");
  assert.match(r.text, /שלום עולם/);
  assert.deepEqual(r.warnings, ["EXTRACT_LOW_CONFIDENCE"]);
});

test("EXTRACT_EMPTY on empty page", () => {
  assert.throws(() => extractArticle("<html><body><nav>a</nav></body></html>", "https://x.example/"), /EXTRACT_EMPTY/);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test tests/ingestUrlExtract.test.js`
Expected: FAIL — module not found

- [ ] **Step 5: Write implementation**

```js
// ingest/urlExtract.js
// S1: детерминированное извлечение статьи — Readability (движок reader-mode Firefox)
// поверх linkedom-DOM; LLM не участвует (R16: деградация без LLM невозможна, если
// LLM не использовался). Честный fallback: грубый strip с warning-флагом, чтобы UI
// показал «низкая уверенность» (R11 — не выдавать strip за чистое извлечение).
"use strict";

const { parseHTML } = require("linkedom");
const { Readability } = require("@mozilla/readability");
const { ingestErr } = require("./ssrfGuard.js");

function normalizeText(s) {
  return String(s || "")
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:p|div|br|h[1-6]|li|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function titleFromHtml(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? normalizeText(stripTags(m[1])) || null : null;
}

function extractArticle(html, url) {
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document, { charThreshold: 200 }).parse();
    if (article && article.textContent && normalizeText(article.textContent).length >= 200) {
      return {
        title: article.title || titleFromHtml(html),
        byline: article.byline || null,
        text: normalizeText(article.textContent),
        method: "readability",
        warnings: [],
      };
    }
  } catch (e) {
    console.error("Readability failed, falling back to strip:", e && e.message);
  }
  const text = normalizeText(stripTags(html));
  if (text.length < 80) throw ingestErr("EXTRACT_EMPTY", "Не удалось извлечь текст со страницы");
  return { title: titleFromHtml(html), byline: null, text, method: "strip", warnings: ["EXTRACT_LOW_CONFIDENCE"] };
}

module.exports = { extractArticle, normalizeText };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/ingestUrlExtract.test.js`
Expected: PASS (3 tests). **Contingency:** если Readability на linkedom-DOM вернёт null на полноценной фикстуре (несовместимость DOM-API) — заменить `linkedom` на `happy-dom` (`const { Window } = require("happy-dom")`, документ из `window.document` c `document.write(html)`), тест не меняется. Если и это не пройдёт — остановиться и доложить, НЕ ослаблять тест.

- [ ] **Step 7: Commit**

```bash
git add ingest/urlExtract.js tests/ingestUrlExtract.test.js scripts/premium/fixtures/ingest/ package.json package-lock.json
git commit -m "feat(ingest): deterministic article extraction (Readability + honest strip fallback)"
```

---

### Task 4: Эндпоинт `/api/ingest/fetch-url` + скелет smoke

**Files:**
- Create: `ingest/routes.js`, `scripts/ingest-smoke.js`
- Modify: `server.js` (mount), `package.json` (script `smoke:ingest`)

**Interfaces:**
- Consumes: `safeFetchHtml`, `extractArticle`, `isPlausibleGeminiKey` (задачи 1–3); `makeRateLimiter` из server.js (передаётся в deps).
- Produces:
  - `registerIngestRoutes(app, { makeRateLimiter, geminiCacheDir })` — экспорт из `ingest/routes.js`; server.js вызывает ПОСЛЕ секции 10.
  - HTTP: `POST /api/ingest/fetch-url` body `{url}` → 200 `{ok:true, text, title, byline, sourceUrl, finalUrl, method, warnings}`; ошибки → 400 `{ok:false, error, error_code}` (error_code = код из ssrfGuard/urlExtract), 429 от rate-limiter (10 req/мин на IP).

- [ ] **Step 1: Написать `ingest/routes.js` (пока только fetch-url; extract-file добавит Task 6)**

```js
// ingest/routes.js
// Все /api/ingest/* эндпоинты W1. Сервер = тонкий прокси/экстрактор (архитектура A
// из STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md): возвращаем ЧИСТЫЙ ТЕКСТ
// + провенанс, таблицу строит существующий /api/translate-table.
"use strict";

const { safeFetchHtml } = require("./ssrfGuard.js");
const { extractArticle } = require("./urlExtract.js");

function errStatus(code) {
  return ["FETCH_FAILED", "FETCH_TIMEOUT"].includes(code) ? 502 : 400;
}

function registerIngestRoutes(app, deps) {
  const { makeRateLimiter } = deps;
  const limiter = makeRateLimiter({ windowMs: 60_000, max: 10, name: "ingest" });

  app.post("/api/ingest/fetch-url", limiter, async (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== "string" || !url.trim()) {
      return res.status(400).json({ ok: false, error: "Нет URL", error_code: "BAD_URL" });
    }
    try {
      const { html, finalUrl } = await safeFetchHtml(url.trim());
      const art = extractArticle(html, finalUrl);
      return res.json({
        ok: true,
        text: art.text,
        title: art.title,
        byline: art.byline,
        sourceUrl: url.trim(),
        finalUrl,
        method: art.method,
        warnings: art.warnings,
      });
    } catch (e) {
      const code = (e && e.code) || "INGEST_FAILED";
      return res.status(errStatus(code)).json({ ok: false, error: e.message || String(e), error_code: code });
    }
  });
}

module.exports = { registerIngestRoutes };
```

- [ ] **Step 2: Смонтировать в server.js**

Сразу после закрытия секции `10. API: TRANSLATE` (после хендлера `/api/translate-table-v2`, найти конец секции по комментарию следующей) добавить:

```js
// --------------------------------------------------------
// 10b. API: INGEST (W1 — STUDIO_INGEST_W1_IMPLEMENTATION_PLAN_2026_07_25)
// --------------------------------------------------------
require("./ingest/routes.js").registerIngestRoutes(app, { makeRateLimiter, geminiCacheDir });
```

(`makeRateLimiter` объявлен на server.js:370, `geminiCacheDir` — уже существующая константа кэша Gemini; обе в скоупе module-level.)

- [ ] **Step 3: Написать smoke-скрипт (валидационная матрица, БЕЗ сети и БЕЗ LLM)**

`scripts/ingest-smoke.js` — по образцу `scripts/api-smoke.js` (спавн сервера на свободном порту, ожидание `/healthz`, затем проверки; переиспользовать оттуда `waitForHealth`/spawn-паттерн):

```js
// Проверки (каждая печатает PASS/FAIL, финальный exit code 1 при любом FAIL):
// 1.  POST /api/ingest/fetch-url {}                          → 400 BAD_URL
// 2.  POST /api/ingest/fetch-url {url:"file:///etc/passwd"}  → 400 BAD_SCHEME
// 3.  POST /api/ingest/fetch-url {url:"http://127.0.0.1/"}   → 400 PRIVATE_ADDR
// 4.  POST /api/ingest/fetch-url {url:"http://10.0.0.1/"}    → 400 PRIVATE_ADDR
// 5.  POST /api/ingest/fetch-url {url:"http://[::1]/"}       → 400 PRIVATE_ADDR
// 6.  POST /api/ingest/fetch-url {url:"http://localhost/"}   → 400 PRIVATE_ADDR
// 7.  POST /api/ingest/fetch-url {url:"http://example.com:8080/"} → 400 BAD_PORT  (порт режется ДО DNS — оффлайн)
// (Task 6 добавит сюда extract-file кейсы, Task 7 — direction кейс.)
```

Все кейсы используют литеральные IP либо синтаксические ошибки — DNS и сеть не нужны, smoke детерминирован (CI-friendly, как api-smoke).

- [ ] **Step 4: npm script**

В package.json scripts добавить: `"smoke:ingest": "node scripts/ingest-smoke.js"`.

- [ ] **Step 5: Прогнать**

Run: `npm run smoke:ingest` и `npm run test:api-smoke`
Expected: оба зелёные (api-smoke докажет, что монтирование ingest-роутов ничего не сломало).

- [ ] **Step 6: Commit**

```bash
git add ingest/routes.js scripts/ingest-smoke.js server.js package.json
git commit -m "feat(ingest): POST /api/ingest/fetch-url (S1) + deterministic ingest smoke"
```

---

### Task 5: DOCX-извлечение (без LLM)

**Files:**
- Create: `ingest/docxExtract.js`, `scripts/premium/fixtures/ingest/make-sample-docx.js`, `scripts/premium/fixtures/ingest/sample-he.docx` (сгенерированный)
- Test: `tests/ingestDocxExtract.test.js`

**Interfaces:**
- Produces: `extractDocxText(buf: Buffer) => {text: string, method: "docx-xml"}` — Error `.code` ∈ {BAD_DOCX, DOCX_EMPTY}.

- [ ] **Step 1: Генератор фикстуры (пакет `docx` уже в dependencies)**

```js
// scripts/premium/fixtures/ingest/make-sample-docx.js
// Генерирует sample-he.docx для tests/ingestDocxExtract.test.js. Запуск:
//   node scripts/premium/fixtures/ingest/make-sample-docx.js
"use strict";
const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun } = require("docx");

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({ children: [new TextRun("שלום עולם — פסקה ראשונה")] }),
      new Paragraph({ children: [new TextRun("זהו מסמך בדיקה של LinguistPro.")] }),
      new Paragraph({ children: [new TextRun("Абзац на русском для смешанного документа.")] }),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "sample-he.docx");
  fs.writeFileSync(out, buf);
  console.log("written", out, buf.length, "bytes");
});
```

Run: `node scripts/premium/fixtures/ingest/make-sample-docx.js`
Expected: файл создан (~2–5KB).

- [ ] **Step 2: Write the failing test**

```js
// tests/ingestDocxExtract.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { extractDocxText } = require("../ingest/docxExtract.js");

const FIXTURE = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "premium", "fixtures", "ingest", "sample-he.docx"));

test("extracts paragraphs from Hebrew docx in order", () => {
  const r = extractDocxText(FIXTURE);
  assert.equal(r.method, "docx-xml");
  const lines = r.text.split("\n");
  assert.match(lines[0], /שלום עולם — פסקה ראשונה/);
  assert.match(lines[1], /זהו מסמך בדיקה של LinguistPro\./);
  assert.match(lines[2], /Абзац на русском/);
});

test("BAD_DOCX on non-zip garbage", () => {
  assert.throws(() => extractDocxText(Buffer.from("not a zip at all")), /BAD_DOCX/);
});

test("DOCX_EMPTY on zip without text", () => {
  const AdmZip = require("adm-zip");
  const z = new AdmZip();
  z.addFile("word/document.xml", Buffer.from("<w:document><w:body></w:body></w:document>", "utf8"));
  assert.throws(() => extractDocxText(z.toBuffer()), /DOCX_EMPTY/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/ingestDocxExtract.test.js`
Expected: FAIL — module not found

- [ ] **Step 4: Write implementation**

```js
// ingest/docxExtract.js
// S2 (Word-ветка): детерминированное извлечение текста из .docx БЕЗ LLM —
// word/document.xml это плоский XML, где текст лежит в <w:t>-ранах внутри
// <w:p>-параграфов. Никаких новых зависимостей: adm-zip уже в проекте.
"use strict";

const AdmZip = require("adm-zip");
const { ingestErr } = require("./ssrfGuard.js");

function decodeXmlEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
          .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

function extractDocxText(buf) {
  let zip;
  try { zip = new AdmZip(buf); } catch { throw ingestErr("BAD_DOCX", "Файл не является корректным .docx"); }
  let entry;
  try { entry = zip.getEntry("word/document.xml"); } catch { entry = null; }
  if (!entry) throw ingestErr("BAD_DOCX", "В файле нет word/document.xml");
  const xml = entry.getData().toString("utf8")
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n");
  const paras = [];
  for (const m of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
    const runs = [...m.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map((x) => decodeXmlEntities(x[1]));
    paras.push(runs.join(""));
  }
  const text = paras.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw ingestErr("DOCX_EMPTY", "Документ не содержит текста");
  return { text, method: "docx-xml" };
}

module.exports = { extractDocxText };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/ingestDocxExtract.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add ingest/docxExtract.js tests/ingestDocxExtract.test.js scripts/premium/fixtures/ingest/make-sample-docx.js scripts/premium/fixtures/ingest/sample-he.docx
git commit -m "feat(ingest): deterministic DOCX text extraction (adm-zip, no LLM)"
```

---

### Task 6: Эндпоинт `/api/ingest/extract-file` (DOCX без ключа; image/PDF через BYOK Gemini)

**Files:**
- Modify: `ingest/routes.js`, `scripts/ingest-smoke.js`

**Interfaces:**
- Consumes: `extractDocxText` (Task 5), `isPlausibleGeminiKey` (Task 1), `geminiCacheDir` из deps.
- Produces HTTP: `POST /api/ingest/extract-file` body `{kind: "docx"|"image"|"pdf", mimeType, dataBase64, filename?, geminiApiKey?}` →
  200 `{ok:true, text, language: string|null, warnings: string[], method: "docx-xml"|"gemini-ocr"|"gemini-pdf", model: string|null, fromCache: boolean}`.
  Ошибки: 400 BAD_KIND / BAD_MIME / FILE_TOO_LARGE / BAD_DOCX / DOCX_EMPTY / EXTRACT_BAD_JSON, 401 GEMINI_KEY_REQUIRED, 400 GEMINI_KEY_INVALID, 502 GEMINI_FAILED.
- Лимит: `dataBase64.length ≤ 8_400_000` (≈6MB файла). Mime-allowlist: image/jpeg, image/png, image/webp (kind=image); application/pdf (kind=pdf); для docx mime не проверяем (браузеры шлют разный) — валидирует сам zip-парсер.
- Кэш: `geminiCacheDir/ingest-extract-v1-<sha256(bytes)>.json` (тот же каталог, что кэш translate-table; контент-адресация — повторная загрузка того же файла бесплатна).

- [ ] **Step 1: Дописать в `ingest/routes.js`**

В начало файла добавить require'ы:

```js
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { extractDocxText } = require("./docxExtract.js");
const { isPlausibleGeminiKey } = require("./geminiKey.js");
```

Промпт (константа модуля):

```js
const EXTRACT_PROMPT = `
You are a strict JSON generator performing TEXT EXTRACTION (not translation).
The attached document (image or PDF) likely contains Hebrew and/or Russian text.
Extract the main readable text.
Rules:
- Output plain text with paragraph breaks preserved; Hebrew in logical (not visual) order.
- Preserve niqqud (vocalization marks) EXACTLY as printed; do NOT add niqqud that is not printed.
- Do NOT translate, summarize, correct or invent anything.
- Skip page headers, footers, page numbers, watermarks.
- If a region is illegible, insert "[…]" there and add "PARTIALLY_ILLEGIBLE" to warnings.
- If there is no readable text at all, return {"text":"","language":null,"warnings":["NO_TEXT_FOUND"]}.
Output ONLY JSON, no markdown fences:
{"text":"...","language":"he|ru|mixed|other","warnings":[]}
`;
```

Хендлер внутри `registerIngestRoutes` (тот же `limiter`):

```js
  const MIME_BY_KIND = {
    image: ["image/jpeg", "image/png", "image/webp"],
    pdf: ["application/pdf"],
  };

  app.post("/api/ingest/extract-file", limiter, async (req, res) => {
    const { kind, mimeType, dataBase64, geminiApiKey } = req.body || {};
    if (!["docx", "image", "pdf"].includes(kind)) {
      return res.status(400).json({ ok: false, error: "Неизвестный тип файла", error_code: "BAD_KIND" });
    }
    if (!dataBase64 || typeof dataBase64 !== "string") {
      return res.status(400).json({ ok: false, error: "Нет данных файла", error_code: "BAD_KIND" });
    }
    if (dataBase64.length > 8_400_000) {
      return res.status(400).json({ ok: false, error: "Файл больше 6MB — лимит W1", error_code: "FILE_TOO_LARGE" });
    }
    let bytes;
    try { bytes = Buffer.from(dataBase64, "base64"); }
    catch { return res.status(400).json({ ok: false, error: "Некорректный base64", error_code: "BAD_KIND" }); }

    // ── DOCX: детерминированно, без ключа, без LLM ──
    if (kind === "docx") {
      try {
        const r = extractDocxText(bytes);
        return res.json({ ok: true, text: r.text, language: null, warnings: [], method: "docx-xml", model: null, fromCache: false });
      } catch (e) {
        return res.status(400).json({ ok: false, error: e.message, error_code: e.code || "BAD_DOCX" });
      }
    }

    // ── image/PDF: BYOK Gemini multimodal ──
    if (!MIME_BY_KIND[kind].includes(mimeType)) {
      return res.status(400).json({ ok: false, error: "Недопустимый mime-тип для " + kind, error_code: "BAD_MIME" });
    }
    if (!geminiApiKey || typeof geminiApiKey !== "string" || !geminiApiKey.trim()) {
      return res.status(401).json({ ok: false, error: "Gemini API Key required (BYOK)", error_code: "GEMINI_KEY_REQUIRED" });
    }
    if (!isPlausibleGeminiKey(geminiApiKey)) {
      return res.status(400).json({ ok: false, error: "Неверный формат Gemini API Key", error_code: "GEMINI_KEY_INVALID" });
    }

    const method = kind === "pdf" ? "gemini-pdf" : "gemini-ocr";
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const cacheFile = path.join(deps.geminiCacheDir, `ingest-extract-v1-${hash}.json`);
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        if (cached && typeof cached.text === "string") {
          return res.json({ ok: true, ...cached, method, model: "gemini-flash-latest", fromCache: true });
        }
      } catch (e) { console.error("ingest cache read error", e); }
    }

    try {
      const ai = new GoogleGenerativeAI(geminiApiKey.trim());
      const model = ai.getGenerativeModel({ model: "gemini-flash-latest" });
      const result = await model.generateContent([
        { inlineData: { mimeType, data: dataBase64 } },
        { text: EXTRACT_PROMPT },
      ]);
      const raw = (await result.response).text();
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      let parsed;
      try { parsed = JSON.parse(cleaned); }
      catch { return res.status(502).json({ ok: false, error: "Модель вернула не-JSON", error_code: "EXTRACT_BAD_JSON" }); }
      const out = {
        text: typeof parsed.text === "string" ? parsed.text.trim() : "",
        language: parsed.language || null,
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      };
      if (!out.text) out.warnings = [...new Set([...out.warnings, "NO_TEXT_FOUND"])];
      try { fs.writeFileSync(cacheFile, JSON.stringify({ ...out, createdAt: new Date().toISOString() })); }
      catch (e) { console.error("ingest cache write error", e); }
      return res.json({ ok: true, ...out, method, model: "gemini-flash-latest", fromCache: false });
    } catch (e) {
      console.error("ingest gemini error", e && e.message);
      return res.status(502).json({ ok: false, error: "Gemini не смог обработать файл", error_code: "GEMINI_FAILED" });
    }
  });
```

- [ ] **Step 2: Дописать smoke-кейсы в `scripts/ingest-smoke.js`**

```js
// 8.  POST extract-file {kind:"weird", dataBase64:"AA=="}                         → 400 BAD_KIND
// 9.  POST extract-file {kind:"pdf", mimeType:"application/pdf", dataBase64:"AA=="} (без ключа) → 401 GEMINI_KEY_REQUIRED
// 10. POST extract-file {kind:"pdf", mimeType:"text/plain", dataBase64:"AA==", geminiApiKey:"AIza"+"x".repeat(30)} → 400 BAD_MIME
// 11. POST extract-file {kind:"image", ..., dataBase64: "A".repeat(8_400_001)}    → 400 FILE_TOO_LARGE
// 12. POST extract-file {kind:"docx", dataBase64: base64(fixture sample-he.docx)} → 200, text содержит "שלום עולם", method "docx-xml", model null
// 13. POST extract-file {kind:"docx", dataBase64: base64("garbage")}              → 400 BAD_DOCX
```

Кейс 12 — единственный e2e-положительный: полностью оффлайн (docx-ветка без LLM).

- [ ] **Step 3: Прогнать**

Run: `npm run smoke:ingest`
Expected: 13/13 PASS

- [ ] **Step 4: Commit**

```bash
git add ingest/routes.js scripts/ingest-smoke.js
git commit -m "feat(ingest): /api/ingest/extract-file — docx deterministic, image/pdf via BYOK Gemini (S2+S8)"
```

---

### Task 7: `direction=any-he` в `/api/translate-table` (S3)

**Files:**
- Modify: `server.js` (хендлер `/api/translate-table`, ~6303–6440), `scripts/ingest-smoke.js`

**Interfaces:**
- Produces HTTP: `/api/translate-table` принимает опц. `direction: "he-ru" (default) | "any-he"`; неизвестное значение → 400 `{error_code:"BAD_DIRECTION"}` (валидация ДО проверки ключа — smoke без ключа). Ответ — тот же `{rows:[{segment_index,he,he_niqqud,translit,ru}], fromCache, cacheKey}`.
- Кэш: promptId входит в hashInput (`any-he-table-v1||text`), существующие he-ru ключи кэша НЕ меняются (обратная совместимость).

- [ ] **Step 1: Правки хендлера**

После `const { text, geminiApiKey } = req.body || {};` (строка ~6305) добавить:

```js
    const direction = (req.body && req.body.direction) || "he-ru";
    if (!["he-ru", "any-he"].includes(direction)) {
      return res.status(400).json({ error: "Неизвестное направление", error_code: "BAD_DIRECTION" });
    }
```

promptId и кэш (заменить строку `const hashInput = ...`):

```js
    const promptId = direction === "any-he" ? "any-he-table-v1" : "he-ru-table-v1";
    const hashInput = `${promptId}||${cleanText}`;
```

Промпт: обернуть существующий литерал в `const prompt = direction === "any-he" ? ANY_HE_PROMPT(cleanText) : HE_RU_PROMPT(cleanText);` — существующий текст промпта вынести в `HE_RU_PROMPT` (функция-шаблон, содержимое БЕЗ изменений), новый:

```js
const ANY_HE_PROMPT = (cleanText) => `
You are a strict JSON generator.

Task:
1) The input text may be in ANY language (most commonly Russian).
2) Split it into logical sentences / segments in the original order.
3) Translate each segment into natural, correct Modern Hebrew.
4) Produce JSON with:
   - "segments": list of ORIGINAL segments (source language), for alignment.
   - "rows": table rows for the UI, one row per segment.

Input text (any language, may contain newlines):

"""
${cleanText}
"""

Strict output format (JSON only, no comments, no markdown):
{
  "segments": [
    { "index": 1, "he": "..." }
  ],
  "rows": [
    {
      "segment_index": 1,
      "he": "...",
      "he_niqqud": "...",
      "translit": "...",
      "ru": "..."
    }
  ]
}

Field rules for "rows":
- "he": the HEBREW TRANSLATION of the segment, without niqqud.
- "he_niqqud": the same Hebrew translation, fully vocalized with niqqud.
- "translit": transliteration of the Hebrew translation (Latin letters).
- "ru": the ORIGINAL segment if it is Russian; otherwise a Russian translation of it.
- In "segments", the "he" field holds the ORIGINAL segment text (kept for schema compatibility).

Rules:
- Preserve the original order of segments.
- Do NOT merge semantically different sentences into a single row.
- Always return ALL data inside a single JSON object exactly in the format above.
`;
```

⚠ **Пост-обработка:** изучить код между `JSON.parse` и `res.json` в v1-хендлере. Если там есть fallback «he берётся из segments, когда row.he пуст» (аналог `prepareRows` v2, server.js:6250–6298) — для `direction==="any-he"` этот fallback ОТКЛЮЧИТЬ: в any-he `segments.he` содержит исходный (не-ивритский) текст, и fallback вставил бы русский в колонку иврита (R11). Вместо fallback: строка с пустым `he` отбрасывается.

- [ ] **Step 2: Smoke-кейс**

В `scripts/ingest-smoke.js` добавить:

```js
// 14. POST /api/translate-table {text:"привет", direction:"nope"} → 400 BAD_DIRECTION (до проверки ключа)
```

- [ ] **Step 3: Прогнать**

Run: `npm run smoke:ingest && npm run test:api-smoke && node --test tests/ingestGeminiKey.test.js`
Expected: всё зелёное. LLM-ветка any-he проверяется в Task 12 живым ключом.

- [ ] **Step 4: Commit**

```bash
git add server.js scripts/ingest-smoke.js
git commit -m "feat(ingest): any-language -> Hebrew table direction in /api/translate-table (S3)"
```

---

### Task 8: Клиент — модал «Импорт» (`studio-import.js`) + i18n

**Files:**
- Create: `public/js/studio-import.js`
- Modify: `public/index.html` (кнопка + модал + `<script>`), `public/i18n/locales/ru.js`, `public/i18n/locales/en.js`, `public/i18n/locales/he.js`

**Interfaces:**
- Consumes: HTTP-эндпоинты задач 4/6; глобалы Студии: `#inputText`, `geminiKeyGet()` (index.html:32599, глобальная), `showToast(msg, type?)`, `t(key)`.
- Produces:
  - `window.StudioImport.open()` — открыть модал (вызывается кнопкой).
  - `window.v3LastImportMeta` — `{kind:"url"|"image"|"pdf"|"docx", source: string, method: string, model: string|null, warnings: string[], at: ISO-string, textSnapshot: string}` | `null`; выставляется при «Вставить в поле ввода» (Task 10 читает).

- [ ] **Step 1: HTML — кнопка и модал**

Кнопка: в `index.html` найти блок с `<textarea id="inputText"` (строка ~10573); СРАЗУ ПОСЛЕ textarea добавить:

```html
<div id="v3ImportEntry" style="margin-top:6px;">
  <button type="button" class="btn-secondary" onclick="window.StudioImport && StudioImport.open()">📥 <span data-i18n="studio.import.button">Импорт: ссылка / файл / фото</span></button>
</div>
```

Модал: перед закрывающим `</body>` (рядом с другими `.v3-modal`) добавить:

```html
<div id="v3ImportModal" class="v3-modal" hidden>
  <div class="v3-modal-backdrop" onclick="StudioImport.close()"></div>
  <div class="v3-modal-panel" role="dialog" aria-modal="true" aria-labelledby="v3ImportTitle">
    <h3 id="v3ImportTitle" data-i18n="studio.import.title">Импорт текста</h3>

    <label class="input-label" for="v3ImportUrl" data-i18n="studio.import.urlLabel">Ссылка на статью / страницу</label>
    <div style="display:flex; gap:6px;">
      <input id="v3ImportUrl" type="url" inputmode="url" data-i18n-placeholder="studio.import.urlPlaceholder" placeholder="https://…" style="flex:1; min-width:0;">
      <button type="button" class="btn-secondary" id="v3ImportUrlBtn" onclick="StudioImport.fetchUrl()" data-i18n="studio.import.fetchBtn">Извлечь</button>
    </div>

    <div style="margin-top:10px;">
      <label class="input-label" data-i18n="studio.import.fileLabel">Или файл: фото / PDF / Word (до 6MB)</label>
      <input id="v3ImportFile" type="file" accept="image/jpeg,image/png,image/webp,.pdf,application/pdf,.docx" style="display:none" onchange="StudioImport.onFileChosen(event)">
      <button type="button" class="btn-secondary" onclick="document.getElementById('v3ImportFile').click()" data-i18n="studio.import.fileBtn">Выбрать файл…</button>
    </div>

    <div id="v3ImportStatus" style="margin-top:10px; font-size:13px; color:#6c757d;" aria-live="polite"></div>

    <div id="v3ImportPreviewWrap" hidden style="margin-top:10px;">
      <div class="input-label" data-i18n="studio.import.previewLabel">Извлечённый текст (проверьте!)</div>
      <div id="v3ImportProv" style="font-size:12px; color:#6c757d; margin:4px 0;"></div>
      <textarea id="v3ImportPreview" dir="auto" style="width:100%; min-height:140px;"></textarea>
      <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
        <button type="button" class="btn-primary" onclick="StudioImport.useText()" data-i18n="studio.import.useBtn">→ В поле ввода</button>
        <button type="button" class="btn-secondary" onclick="StudioImport.close()" data-i18n="studio.import.cancelBtn">Закрыть</button>
      </div>
    </div>
  </div>
</div>
```

Реализатор: посмотреть разметку существующего `.v3-modal` в index.html и повторить её структуру классов (backdrop/panel могут называться иначе — скопировать фактический паттерн; исключение `.v3-modal button { width:auto !important }` уже в CSS). Если панель-класс другой — привести к фактическому.

- [ ] **Step 2: `public/js/studio-import.js`**

```js
// public/js/studio-import.js
// W1 «Импорт»: единая точка входа внешнего контента (URL/файл/фото) в Студию.
// Канон: docs/planning/STUDIO_INGEST_W1_IMPLEMENTATION_PLAN_2026_07_25.md.
// Извлечение делает сервер (/api/ingest/*); модуль приземляет ЧИСТЫЙ ТЕКСТ в
// #inputText и публикует провенанс-паспорт window.v3LastImportMeta (R9: derived).
// Зависимости-глобалы Студии: geminiKeyGet(), showToast(), t(), #inputText.
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  var MAX_FILE_BYTES = 6 * 1024 * 1024;
  var pending = null; // {kind, source, method, model, warnings, text}

  function $(id) { return document.getElementById(id); }
  function tr(key) { return (typeof window.t === "function") ? window.t(key) : key; }
  function toast(key, type) { if (typeof window.showToast === "function") window.showToast(tr(key), type || "info"); }

  function setStatus(msgKey, extra) {
    var el = $("v3ImportStatus");
    if (el) el.textContent = msgKey ? (tr(msgKey) + (extra ? " " + extra : "")) : "";
  }

  function setBusy(b) {
    var btn = $("v3ImportUrlBtn");
    if (btn) btn.disabled = b;
    var f = $("v3ImportFile");
    if (f) f.disabled = b;
  }

  function showPreview(p) {
    pending = p;
    $("v3ImportPreview").value = p.text;
    var provKey = { url: "studio.import.provUrl", image: "studio.import.provOcr", pdf: "studio.import.provPdf", docx: "studio.import.provDocx" }[p.kind];
    var prov = tr(provKey) + " · " + p.source + (p.model ? " · " + p.model : "");
    if (p.warnings && p.warnings.length) prov += " · ⚠ " + tr("studio.import.warnCheck");
    $("v3ImportProv").textContent = prov;
    $("v3ImportPreviewWrap").hidden = false;
    setStatus(null);
  }

  async function postJson(url, body) {
    var res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    var data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data || data.ok !== true) {
      var code = (data && data.error_code) || ("HTTP_" + res.status);
      var err = new Error(code);
      err.code = code;
      throw err;
    }
    return data;
  }

  var ERROR_KEY = {
    BAD_URL: "studio.import.errBadUrl", BAD_SCHEME: "studio.import.errBadUrl", BAD_PORT: "studio.import.errBadUrl",
    PRIVATE_ADDR: "studio.import.errPrivateUrl", NOT_HTML: "studio.import.errNotHtml",
    TOO_LARGE: "studio.import.errTooLarge", FILE_TOO_LARGE: "studio.import.errTooLarge",
    EXTRACT_EMPTY: "studio.import.errEmpty", DOCX_EMPTY: "studio.import.errEmpty", BAD_DOCX: "studio.import.errBadFile",
    BAD_MIME: "studio.import.errBadFile", BAD_KIND: "studio.import.errBadFile",
    GEMINI_KEY_REQUIRED: "studio.import.errNoKey", GEMINI_KEY_INVALID: "studio.import.errNoKey",
  };
  function errKey(code) { return ERROR_KEY[code] || "studio.import.errGeneric"; }

  function open() {
    $("v3ImportModal").hidden = false;
    $("v3ImportPreviewWrap").hidden = true;
    setStatus(null);
  }
  function close() { $("v3ImportModal").hidden = true; }

  async function fetchUrl() {
    var url = ($("v3ImportUrl").value || "").trim();
    if (!url) { setStatus("studio.import.errBadUrl"); return; }
    setBusy(true); setStatus("studio.import.working");
    try {
      var r = await postJson("/api/ingest/fetch-url", { url: url });
      showPreview({ kind: "url", source: r.sourceUrl, method: r.method, model: null, warnings: r.warnings || [], text: r.text });
    } catch (e) { setStatus(errKey(e.code)); }
    finally { setBusy(false); }
  }

  function kindForFile(file) {
    var name = (file.name || "").toLowerCase();
    if (name.endsWith(".docx")) return { kind: "docx", mimeType: file.type || "application/octet-stream" };
    if (file.type === "application/pdf" || name.endsWith(".pdf")) return { kind: "pdf", mimeType: "application/pdf" };
    if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { kind: "image", mimeType: file.type };
    return null;
  }

  function onFileChosen(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = ""; // тот же файл можно выбрать повторно
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setStatus("studio.import.errTooLarge"); return; }
    var k = kindForFile(file);
    if (!k) { setStatus("studio.import.errBadFile"); return; }
    var needsKey = k.kind !== "docx";
    var key = needsKey && (typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "");
    if (needsKey && !key) { setStatus("studio.import.errNoKey"); return; }
    setBusy(true); setStatus("studio.import.working");
    var reader = new FileReader();
    reader.onerror = function () { setBusy(false); setStatus("studio.import.errGeneric"); };
    reader.onload = async function () {
      try {
        var b64 = String(reader.result).split(",")[1] || "";
        var body = { kind: k.kind, mimeType: k.mimeType, dataBase64: b64, filename: file.name };
        if (needsKey) body.geminiApiKey = key;
        var r = await postJson("/api/ingest/extract-file", body);
        showPreview({ kind: k.kind, source: file.name, method: r.method, model: r.model, warnings: r.warnings || [], text: r.text });
      } catch (e) { setStatus(errKey(e.code)); }
      finally { setBusy(false); }
    };
    reader.readAsDataURL(file);
  }

  function useText() {
    if (!pending) return;
    var text = ($("v3ImportPreview").value || "").trim(); // пользователь мог поправить в превью — это ок
    if (!text) { setStatus("studio.import.errEmpty"); return; }
    var input = $("inputText");
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true })); // пусть существующие слушатели Студии отработают
    window.v3LastImportMeta = {
      kind: pending.kind, source: pending.source, method: pending.method, model: pending.model,
      warnings: pending.warnings, at: new Date().toISOString(), textSnapshot: text,
    };
    close();
    toast(pending.warnings && pending.warnings.length ? "studio.import.warnCheck" : "studio.import.done",
          pending.warnings && pending.warnings.length ? "warning" : "success");
  }

  window.StudioImport = { open: open, close: close, fetchUrl: fetchUrl, onFileChosen: onFileChosen, useText: useText };
})();
```

Подключение: в `index.html` рядом с `<script src="/js/studio-karaoke.js">`-строкой (найти) добавить `<script src="/js/studio-import.js" defer></script>`.

- [ ] **Step 3: Локали — все три файла, все ключи**

Добавить в `public/i18n/locales/ru.js` (и переводы в en.js/he.js — таблица ниже; структуру секций посмотреть в файле, ключи плоские вида `"studio.import.button"` либо вложенные — повторить фактический паттерн файла):

| key | ru | en | he |
|---|---|---|---|
| studio.import.button | Импорт: ссылка / файл / фото | Import: link / file / photo | ייבוא: קישור / קובץ / תמונה |
| studio.import.title | Импорт текста | Import text | ייבוא טקסט |
| studio.import.urlLabel | Ссылка на статью / страницу | Article / page link | קישור למאמר / לעמוד |
| studio.import.urlPlaceholder | https://… | https://… | https://… |
| studio.import.fetchBtn | Извлечь | Extract | חילוץ |
| studio.import.fileLabel | Или файл: фото / PDF / Word (до 6MB) | Or a file: photo / PDF / Word (up to 6MB) | או קובץ: תמונה / PDF / Word (עד 6MB) |
| studio.import.fileBtn | Выбрать файл… | Choose file… | בחירת קובץ… |
| studio.import.previewLabel | Извлечённый текст (проверьте!) | Extracted text (please review!) | הטקסט שחולץ (נא לבדוק!) |
| studio.import.useBtn | → В поле ввода | → To input field | → לשדה הקלט |
| studio.import.cancelBtn | Закрыть | Close | סגירה |
| studio.import.working | Извлекаю… | Extracting… | מחלץ… |
| studio.import.done | Текст вставлен в поле ввода | Text inserted into the input field | הטקסט הוכנס לשדה הקלט |
| studio.import.provUrl | Источник: веб-страница (без ИИ) | Source: web page (no AI) | מקור: עמוד אינטרנט (ללא AI) |
| studio.import.provOcr | Распознано ИИ (OCR) — текст производный | AI-recognized (OCR) — derived text | זוהה ע"י AI‏ (OCR) — טקסט נגזר |
| studio.import.provPdf | Извлечено ИИ из PDF — текст производный | AI-extracted from PDF — derived text | חולץ ע"י AI מ-PDF — טקסט נגזר |
| studio.import.provDocx | Извлечено из Word (без ИИ) | Extracted from Word (no AI) | חולץ מ-Word (ללא AI) |
| studio.import.warnCheck | Возможны пропуски/ошибки распознавания — проверьте текст | Possible recognition gaps/errors — please review | ייתכנו השמטות/שגיאות זיהוי — נא לבדוק |
| studio.import.errBadUrl | Некорректная ссылка (нужен обычный http/https-адрес) | Invalid link (plain http/https URL expected) | קישור לא תקין (נדרש http/https רגיל) |
| studio.import.errPrivateUrl | Эта ссылка указывает на внутренний адрес — запрещено | This link points to an internal address — not allowed | הקישור מפנה לכתובת פנימית — אסור |
| studio.import.errNotHtml | По ссылке не веб-страница | The link is not a web page | הקישור אינו עמוד אינטרנט |
| studio.import.errTooLarge | Слишком большой файл/страница (лимит 6MB) | File/page too large (6MB limit) | קובץ/עמוד גדול מדי (מגבלה 6MB) |
| studio.import.errEmpty | Не удалось извлечь текст | Could not extract any text | לא ניתן לחלץ טקסט |
| studio.import.errBadFile | Неподдерживаемый или повреждённый файл | Unsupported or corrupted file | קובץ לא נתמך או פגום |
| studio.import.errNoKey | Для фото/PDF нужен ваш Gemini-ключ (настройки → Gemini API Key) | Photo/PDF requires your Gemini key (settings → Gemini API Key) | לתמונה/PDF נדרש מפתח Gemini שלכם (הגדרות ← Gemini API Key) |
| studio.import.errGeneric | Ошибка импорта — попробуйте ещё раз | Import failed — please try again | הייבוא נכשל — נסו שוב |

- [ ] **Step 4: Ручная проверка + скриншот 380px**

Run: `npm start`, открыть `http://localhost:3000/?v=<N>` (cache-bust). Проверить: модал открывается/закрывается; URL-ошибки показывают человеческий текст; docx-файл (фикстура) проходит e2e и текст попадает в `#inputText`; предпросмотр RTL корректен (dir=auto).
Playwright (обязательный UI-workflow):

```js
await page.setViewportSize({ width: 380, height: 844 });
// открыть модал, затем:
await page.screenshot({ path: '.tmp/import-modal-380.png' });
```

Смотреть скриншот ПЕРЕД git add: кнопки не разъехались (в `.v3-modal` исключение ширины уже есть), input не вылезает, RTL-строки he-локали не ломают строки.

- [ ] **Step 5: Commit**

```bash
git add public/js/studio-import.js public/index.html public/i18n/locales/ru.js public/i18n/locales/en.js public/i18n/locales/he.js
git commit -m "feat(studio): Import dialog — URL/file/photo to input text (W1 S1+S2+S8 client)"
```

(SW-бамп будет один на весь UI-пакет — в Task 11.)

---

### Task 9: Клиент — селектор направления (S3)

**Files:**
- Modify: `public/index.html` (разметка возле `#providerSelect` ~10703; translate-флоу ~32440; сохранение выбора), локали ×3

**Interfaces:**
- Consumes: `direction` API из Task 7; `getSelectedProvider()` (index.html:32558).
- Produces: `getTableDirection() => "he-ru"|"any-he"` (глобальная функция в inline-скрипте Студии; Task 10 не зависит, но payload translate использует).

- [ ] **Step 1: Разметка**

Рядом с блоком `providerSelect` (после его `</select>` или соседним полем, повторив локальный паттерн label+select):

```html
<label for="tableDirectionSelect" class="input-label" data-i18n="classic.directionLabel">Направление таблицы</label>
<select id="tableDirectionSelect" class="provider-select">
  <option value="he-ru" data-i18n="classic.directionHeRu">Иврит → Русский</option>
  <option value="any-he" data-i18n="classic.directionAnyHe">Любой язык → Иврит</option>
</select>
```

- [ ] **Step 2: Inline-логика**

В inline-скрипт Студии (рядом с `getSelectedProvider`, ~32558):

```js
const TABLE_DIRECTION_LS_KEY = "v3.tableDirection";
function getTableDirection() {
    const el = document.getElementById("tableDirectionSelect");
    return (el && el.value === "any-he") ? "any-he" : "he-ru";
}
// init: восстановить из localStorage + persist на change
(function initTableDirection() {
    const el = document.getElementById("tableDirectionSelect");
    if (!el) return;
    try { const saved = localStorage.getItem(TABLE_DIRECTION_LS_KEY); if (saved === "any-he") el.value = saved; } catch (_) {}
    el.addEventListener("change", () => { try { localStorage.setItem(TABLE_DIRECTION_LS_KEY, el.value); } catch (_) {} });
})();
```

В translate-флоу (строка ~32445): в НЕ-premium payload добавить `direction: getTableDirection()`; в premium-ветке — guard ПЕРЕД `apiCall`:

```js
        if (usePremium && getTableDirection() === "any-he") {
            showError(t("classic.directionPremiumBlocked"));
            setLoading(false); setAiButtonDisabled(false); updateAiButtonState();
            return;
        }
```

(вставить ДО `const res = await apiCall(...)`, после формирования payload; проверить, что setLoading уже вызван — вернуть состояние кнопок как в существующих ранних return).
Мета (строка ~32479): `promptId: getTableDirection() === "any-he" ? "any-he-table-v1" : "he-ru-table-v1"`.

- [ ] **Step 3: Локали ×3**

| key | ru | en | he |
|---|---|---|---|
| classic.directionLabel | Направление таблицы | Table direction | כיוון הטבלה |
| classic.directionHeRu | Иврит → Русский | Hebrew → Russian | עברית ← רוסית |
| classic.directionAnyHe | Любой язык → Иврит | Any language → Hebrew | כל שפה ← עברית |
| classic.directionPremiumBlocked | Направление «Любой язык → Иврит» доступно только через Gemini-провайдера | "Any language → Hebrew" is only available with the Gemini provider | הכיוון «כל שפה ← עברית» זמין רק דרך ספק Gemini |

- [ ] **Step 4: Ручная проверка + скриншот**

`npm start`, cache-bust URL: селектор виден, переключение персистится через reload; premium-провайдер + any-he → внятная ошибка, без запроса. Playwright скриншот @380×844 области контролов — смотреть перед add.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/i18n/locales/ru.js public/i18n/locales/en.js public/i18n/locales/he.js
git commit -m "feat(studio): table direction selector — any language to Hebrew (S3 client)"
```

---

### Task 10: Провенанс импорта → мета сохранения таблицы

**Files:**
- Modify: `public/index.html` (translate-флоу, ~32465–32488)

**Interfaces:**
- Consumes: `window.v3LastImportMeta` (Task 8).
- Produces: `v3LastGeminiMeta.source` — `{kind, source, method, model, warnings, at, edited: boolean}` | отсутствует. Провенанс-паспорт (R9) уезжает в Library вместе с остальной метой (`v3LastGeminiMeta` уже сохраняется существующим Library-save — реализатор: grep `v3LastGeminiMeta` по index.html, убедиться что объект сериализуется целиком, доп. полей нигде не отбрасывает; если сохраняется выборочно по полям — добавить `source` в это перечисление).

- [ ] **Step 1: Вставка в оба места установки `v3LastGeminiMeta`** (premium-ветка ~32468 и gemini-ветка ~32479):

```js
// провенанс импорта (R9 derived≠asserted): текст пришёл из «Импорта»?
try {
  const im = window.v3LastImportMeta;
  if (im && im.textSnapshot) {
    v3LastGeminiMeta.source = {
      kind: im.kind, source: im.source, method: im.method, model: im.model,
      warnings: im.warnings || [], at: im.at,
      edited: getText().trim() !== im.textSnapshot.trim(),
    };
  }
} catch (_) {}
```

(Оформить как маленькую функцию `v3AttachImportSource()` рядом и вызвать из обеих веток — DRY.)

- [ ] **Step 2: Проверка**

Вручную: импорт docx-фикстуры → перевод → в Library-save мета содержит `source.kind === "docx"`; поправить текст руками → `source.edited === true`. Проверить через DevTools (`v3LastGeminiMeta`).

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(studio): thread import provenance passport into table meta (R9 derived)"
```

---

### Task 11: SW precache + CACHE_VERSION + полный гейт-прогон + деплой-верифай

**Files:**
- Modify: `public/sw.js`

- [ ] **Step 1: SW**

В `public/sw.js`: найти в precache-списке запись `"/js/studio-karaoke.js"` (или аналог) и добавить рядом `"/js/studio-import.js"`; бампнуть `CACHE_VERSION` (строка 32) на следующий патч-номер относительно текущего в файле на момент коммита.

- [ ] **Step 2: Полный гейт-прогон**

Run:
```
npm test
npm run smoke:ingest
npm run test:api-smoke
npm run smoke:reader-parity   # (если скрипт называется иначе — взять точное имя из package.json; renderTable не трогали — гейт обязан быть зелёным)
```
плюс i18n-гейт, если есть отдельный script (grep `"i18n"` по package.json scripts; `tests/i18n.smoke.js` запускается как `node tests/i18n.smoke.js`, если не подхватывается `npm test`).
Expected: всё зелёное. Любой FAIL — чинить до коммита, не скипать.

- [ ] **Step 3: Commit + push + prod-verify**

```bash
git add public/sw.js
git commit -m "chore(sw): precache studio-import.js + bump CACHE_VERSION (ingest W1 UI)"
git push
```

После авто-деплоя Coolify (учесть ловушки из памяти: деплой может зависнуть/дать transient 404 — подождать и перепроверить):
1. `https://linguistpro.kolosei.com/healthz` — ok.
2. `POST https://linguistpro.kolosei.com/api/ingest/fetch-url` c `{url:"http://127.0.0.1/"}` → 400 PRIVATE_ADDR (анти-SSRF жив на проде).
3. Открыть Студию на проде, дождаться обновления SW, проверить кнопку «Импорт» и селектор направления.

---

### Task 12: Owner-инструменты — live-smoke (реальный ключ) и PDF-gold харнесс

**Files:**
- Create: `scripts/premium/ingest-live-smoke.js`, `scripts/premium/ingest-pdf-gold.js`

**Interfaces:**
- Consumes: прод/локальные эндпоинты задач 4/6/7.
- Produces: ручные инструменты владельца; gold-отчёт в `docs/research/ingest-pdf-gold/<YYYY-MM-DD>/` (артефакт-правило: с README).

- [ ] **Step 1: `ingest-live-smoke.js`**

CLI: `node scripts/premium/ingest-live-smoke.js --base http://localhost:3000 --key <GEMINI_KEY> [--url <article-url>] [--image <path>] [--pdf <path>] [--any-he "русский текст"]`.
Ключ: `--key` или env `INGEST_SMOKE_GEMINI_KEY` (НЕ коммитить; серверного ключа нет — BYOK-инвариант).
Для каждого переданного входа: вызвать соответствующий эндпоинт, напечатать `method/model/warnings` + первые 400 символов текста (или rows для any-he: первые 3 строки he/he_niqqud/translit/ru). Exit 1, если любой вызов вернул не-ok. Это ЖИВОЙ smoke (сеть+LLM) — запускается владельцем/по требованию, НЕ в CI.

- [ ] **Step 2: `ingest-pdf-gold.js` (W1-exit gate перед анонсом пилотникам, R11 measure-before-scale)**

CLI: `node scripts/premium/ingest-pdf-gold.js --dir <папка с 10–20 реальными иврит-PDF> --key <GEMINI_KEY> --out docs/research/ingest-pdf-gold/<YYYY-MM-DD>/`.
Для каждого PDF: extract-file → сохранить `<имя>.extracted.txt` + сводный `REPORT.md` (файл, размер, method, warnings, длина текста, доля ивритских символов) + `README.md` (что это, как сгенерировано, командой какой, какой коммит, что владелец аннотирует: колонка verdict ✅/⚠/❌ в REPORT.md).
Критерий гейта (владелец заполняет verdict вручную): ≥80% файлов ✅ «текст пригоден для таблицы без ручной чистки» — иначе PDF-ветка помечается в UI как beta (warning всегда) до улучшения.

- [ ] **Step 3: Прогнать live-smoke локально с ключом владельца**

Run (владелец или сессия с ключом): URL-статья (реальный новостной сайт), фото с ивритским текстом, маленький PDF, any-he строка.
Expected: 4/4 ok; результаты глазами проверить на честность (нет выдуманного текста, no-warnings там где чисто).

- [ ] **Step 4: Commit**

```bash
git add scripts/premium/ingest-live-smoke.js scripts/premium/ingest-pdf-gold.js
git commit -m "feat(ingest): owner live-smoke + PDF gold harness (W1 exit gate)"
git push
```

---

### Task 13: Документация — закрытие W1

**Files:**
- Modify: `docs/planning/STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md` (I-GO-W1 → ✅ GO 2026-07-25 + строка со статусом W1 и версией), `CLAUDE.md` (добавить `npm run smoke:ingest` в «Ключевые команды» + 1–2 строки про `ingest/` и «Импорт» в Студии)

- [ ] **Step 1:** Обновить оба файла (в пакете — фактические номера версий/коммитов реализации).
- [ ] **Step 2:** Commit + push:

```bash
git add docs/planning/STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md CLAUDE.md
git commit -m "docs(ingest): W1 shipped — packet status + CLAUDE.md commands"
git push
```

---

## Порядок и контрольные точки

1→2→3→4 (S1 серверно готов) → 5→6 (S2/S8 серверно) → 7 (S3 серверно) → 8→9→10 (клиент) → 11 (релиз-гейт+деплой) → 12 (owner-верификация живым ключом; PDF-gold — exit gate до анонса пилотникам) → 13 (docs).

**Что НЕ входит в W1 (не расползаться):** «в Зал» отдельной кнопкой (личные тексты уже прорастают из Library Студии), share_target (W2), аудио/видео (W2), drag&drop, история импортов, batch-режим.
