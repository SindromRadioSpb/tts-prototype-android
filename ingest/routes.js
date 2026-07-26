// ingest/routes.js
// Все /api/ingest/* эндпоинты W1. Сервер = тонкий прокси/экстрактор (архитектура A
// из STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md): возвращаем ЧИСТЫЙ ТЕКСТ
// + провенанс, таблицу строит существующий /api/translate-table.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { safeFetchHtml } = require("./ssrfGuard.js");
const { extractArticle } = require("./urlExtract.js");
const { extractDocxText } = require("./docxExtract.js");
const { isPlausibleGeminiKey } = require("./geminiKey.js");
const { classifyGeminiError } = require("./geminiError.js");

function errStatus(code) {
  return ["FETCH_FAILED", "FETCH_TIMEOUT"].includes(code) ? 502 : 400;
}

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
          return res.json({
            ok: true,
            text: cached.text,
            language: cached.language ?? null,
            warnings: Array.isArray(cached.warnings) ? cached.warnings : [],
            method,
            model: "gemini-flash-latest",
            fromCache: true,
          });
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
      const c = classifyGeminiError(e);
      return res.status(c.status).json({ ok: false, error: c.error, error_code: c.error_code });
    }
  });
}

module.exports = { registerIngestRoutes };
