// ingest/routes.js
// Все /api/ingest/* эндпоинты W1. Сервер = тонкий прокси/экстрактор (архитектура A
// из STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md): возвращаем ЧИСТЫЙ ТЕКСТ
// + провенанс, таблицу строит существующий /api/translate-table.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Type } = require("@google/genai");
const { safeFetchHtml } = require("./ssrfGuard.js");
const { extractArticle } = require("./urlExtract.js");
const { extractDocxText } = require("./docxExtract.js");
const { isPlausibleGeminiKey } = require("./geminiKey.js");
const { classifyGeminiError } = require("./geminiError.js");
const { generateGeminiContent } = require("./geminiClient.js");
const {
  getGeminiScenario,
  buildGeminiCacheKey,
  cacheMatchesScenario,
} = require("./geminiPolicy.js");
const {
  buildGeminiExtractSchema,
  validatePageManifest,
  normalizeExtractPayload,
  mergePageProvenance,
} = require("./geminiExtract.js");
const retell = require("./retell.js");

function errStatus(code) {
  return ["FETCH_FAILED", "FETCH_TIMEOUT"].includes(code) ? 502 : 400;
}

const EXTRACT_PROMPT = `
You are a strict JSON generator performing TEXT EXTRACTION (not translation).
The attached document (image or PDF) likely contains Hebrew and/or Russian text.
Extract the main readable text separately for every input page.
Rules:
- Return one item in "pages" for each input page, in order. "page_index" is 1-based.
- Output plain text with paragraph breaks preserved; Hebrew in logical (not visual) order.
- Preserve niqqud (vocalization marks) EXACTLY as printed; do NOT add niqqud that is not printed.
- Do NOT translate, summarize, correct or invent anything.
- Skip page headers, footers, page numbers, watermarks.
- If a region is illegible, insert "[…]" there and add "PARTIALLY_ILLEGIBLE" to warnings.
- If one page has no readable text, keep that page with an empty "text" and add "PAGE_TEXT_MISSING".
- If there is no readable text at all, return all pages with empty text and add "NO_TEXT_FOUND".
Output ONLY JSON, no markdown fences:
{"pages":[{"page_index":1,"text":"..."}],"language":"he|ru|mixed|other|unknown","warnings":[]}
`;

function registerIngestRoutes(app, deps) {
  const { makeRateLimiter } = deps;
  const generateContent = deps.generateGeminiContent || generateGeminiContent;
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

  const MIME_BY_KIND = {
    image: ["image/jpeg", "image/png", "image/webp"],
    pdf: ["application/pdf"],
  };

  app.post("/api/ingest/extract-file", limiter, async (req, res) => {
    const { kind, mimeType, dataBase64, geminiApiKey, pageManifest } = req.body || {};
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

    const manifestValidation = validatePageManifest(pageManifest);
    if (!manifestValidation.ok) {
      return res.status(400).json({ ok: false, error: "Некорректный page manifest", error_code: manifestValidation.error_code });
    }

    const method = kind === "pdf" ? "gemini-pdf" : "gemini-ocr";
    const scenario = getGeminiScenario("ocr");
    const fileSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const cacheKey = buildGeminiCacheKey({ ...scenario, contentSha256: fileSha256 });
    const cacheFile = path.join(deps.geminiCacheDir, `ingest-extract-v2-${cacheKey}.json`);
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        if (cacheMatchesScenario(cached, scenario) && Array.isArray(cached.pages)) {
          const merged = mergePageProvenance(cached.pages, manifestValidation.value, fileSha256);
          return res.json({
            ok: true,
            text: merged.text,
            pages: merged.pages,
            fileSha256,
            language: cached.language ?? null,
            warnings: [...new Set([...(Array.isArray(cached.warnings) ? cached.warnings : []), ...merged.warnings])],
            method,
            model: cached.model,
            requestedModel: cached.model,
            modelVersion: cached.modelVersion || null,
            promptId: cached.promptId,
            schemaId: cached.schemaId,
            fromCache: true,
            cacheKey,
          });
        }
      } catch (e) { console.error("ingest cache read error", e); }
    }

    try {
      const generated = await generateContent({
        apiKey: geminiApiKey.trim(),
        scenario,
        contents: [{ role: "user", parts: [
          { inlineData: { mimeType, data: dataBase64 } },
          { text: EXTRACT_PROMPT },
        ] }],
        config: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: buildGeminiExtractSchema(Type),
          maxOutputTokens: 65536,
        },
      });
      const raw = generated.text;
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      let parsed;
      try { parsed = JSON.parse(cleaned); }
      catch { return res.status(502).json({ ok: false, error: "Модель вернула не-JSON", error_code: "EXTRACT_BAD_JSON" }); }
      const normalized = normalizeExtractPayload(parsed);
      const merged = mergePageProvenance(normalized.pages, manifestValidation.value, fileSha256);
      const warnings = [...new Set([...normalized.warnings, ...merged.warnings])];
      const cachePayload = {
        pages: normalized.pages,
        language: normalized.language,
        warnings: normalized.warnings,
        model: scenario.model,
        modelVersion: generated.modelVersion,
        promptId: scenario.promptId,
        schemaId: scenario.schemaId,
        createdAt: new Date().toISOString(),
      };
      try { fs.writeFileSync(cacheFile, JSON.stringify(cachePayload)); }
      catch (e) { console.error("ingest cache write error", e); }
      return res.json({
        ok: true,
        text: merged.text,
        pages: merged.pages,
        fileSha256,
        language: normalized.language,
        warnings,
        method,
        model: scenario.model,
        requestedModel: scenario.model,
        modelVersion: generated.modelVersion,
        promptId: scenario.promptId,
        schemaId: scenario.schemaId,
        fromCache: false,
        cacheKey,
      });
    } catch (e) {
      console.error("ingest gemini error", e && e.message);
      const c = classifyGeminiError(e);
      return res.status(c.status).json({ ok: false, error: c.error, error_code: c.error_code });
    }
  });

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
    const scenario = getGeminiScenario("retell");
    const contentSha256 = crypto.createHash("sha256").update(retell.cacheKeyInput(text, level)).digest("hex");
    const hash = buildGeminiCacheKey({ ...scenario, contentSha256 });
    const cacheFile = path.join(deps.geminiCacheDir, `retell-v2-${hash}.json`);
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        if (cacheMatchesScenario(cached, scenario) && typeof cached.retell === "string" && cached.retell.trim()) {
          return res.json({ ok: true, retell: cached.retell, promptId: scenario.promptId,
                            model: cached.model, requestedModel: cached.model,
                            modelVersion: cached.modelVersion || null, fromCache: true, cacheKey: hash });
        }
      } catch (e) { console.error("retell cache read error", e); }
    }
    try {
      const generated = await generateContent({
        apiKey: geminiApiKey.trim(),
        scenario,
        contents: retell.buildRetellPrompt(text, level),
        // maxOutputTokens 16384: thinking входит в бюджет вывода — 8192 обрезало list-вариант
        // (замер M1, docs/research/studio-ingest-graded-retell/2026-07-28/README.md)
        config: { temperature: 0, maxOutputTokens: 16384 },
      });
      const raw = generated.text;
      const out = raw.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
      if (!out) return res.status(502).json({ ok: false, error: "Пустой ответ модели", error_code: "RETELL_EMPTY_OUTPUT" });
      try { fs.writeFileSync(cacheFile, JSON.stringify({ retell: out, level, model: scenario.model,
        modelVersion: generated.modelVersion, promptId: scenario.promptId, schemaId: scenario.schemaId,
        createdAt: new Date().toISOString() })); }
      catch (e) { console.error("retell cache write error", e); }
      return res.json({ ok: true, retell: out, promptId: scenario.promptId,
                        model: scenario.model, requestedModel: scenario.model,
                        modelVersion: generated.modelVersion, fromCache: false, cacheKey: hash });
    } catch (e) {
      console.error("retell gemini error", e && e.message); // только .message — ключ не логируем
      const c = classifyGeminiError(e);
      return res.status(c.status).json({ ok: false, error: c.error, error_code: c.error_code });
    }
  });
}

module.exports = { registerIngestRoutes };
