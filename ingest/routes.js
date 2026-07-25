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
