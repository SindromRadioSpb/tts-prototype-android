"use strict";

const SHA256_RE = /^[a-f0-9]{64}$/i;
const MAX_PAGE_MANIFEST_ITEMS = 64;

function buildGeminiExtractSchema(Type) {
  if (!Type) throw new Error("Type required");
  return {
    type: Type.OBJECT,
    properties: {
      pages: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            page_index: { type: Type.INTEGER },
            text: { type: Type.STRING },
          },
          required: ["page_index", "text"],
        },
      },
      language: { type: Type.STRING },
      warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["pages", "language", "warnings"],
  };
}

function validatePageManifest(input) {
  if (input == null) return { ok: true, value: [] };
  if (!Array.isArray(input) || input.length > MAX_PAGE_MANIFEST_ITEMS) {
    return { ok: false, error_code: "BAD_PAGE_MANIFEST" };
  }
  const seen = new Set();
  const value = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error_code: "BAD_PAGE_MANIFEST" };
    }
    const pageIndex = Number(raw.pageIndex);
    const sourceFilename = typeof raw.sourceFilename === "string" ? raw.sourceFilename.trim() : "";
    const sourceSha256 = typeof raw.sourceSha256 === "string" ? raw.sourceSha256.trim().toLowerCase() : "";
    const sourcePage = raw.sourcePage == null ? null : Number(raw.sourcePage);
    if (!Number.isInteger(pageIndex) || pageIndex < 1 || pageIndex > MAX_PAGE_MANIFEST_ITEMS
        || seen.has(pageIndex) || !sourceFilename || sourceFilename.length > 255
        || !SHA256_RE.test(sourceSha256)
        || (sourcePage != null && (!Number.isInteger(sourcePage) || sourcePage < 1))) {
      return { ok: false, error_code: "BAD_PAGE_MANIFEST" };
    }
    seen.add(pageIndex);
    value.push({ pageIndex, sourceFilename, sourceSha256, sourcePage });
  }
  value.sort((a, b) => a.pageIndex - b.pageIndex);
  return { ok: true, value };
}

function normalizeExtractPayload(parsed) {
  const rawPages = parsed && Array.isArray(parsed.pages)
    ? parsed.pages
    : (parsed && typeof parsed.text === "string" ? [{ page_index: 1, text: parsed.text }] : []);
  const pages = [];
  const seen = new Set();
  for (const raw of rawPages) {
    const pageIndex = Number(raw && (raw.page_index ?? raw.pageIndex));
    if (!Number.isInteger(pageIndex) || pageIndex < 1 || pageIndex > MAX_PAGE_MANIFEST_ITEMS || seen.has(pageIndex)) continue;
    seen.add(pageIndex);
    pages.push({ pageIndex, text: typeof raw.text === "string" ? raw.text.trim() : "" });
  }
  pages.sort((a, b) => a.pageIndex - b.pageIndex);
  const warnings = parsed && Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];
  return {
    pages,
    language: parsed && typeof parsed.language === "string" && parsed.language.trim() ? parsed.language.trim() : null,
    warnings: [...new Set(warnings)],
  };
}

function mergePageProvenance(modelPages, pageManifest, fileSha256) {
  const pageByIndex = new Map((Array.isArray(modelPages) ? modelPages : []).map((page) => [page.pageIndex, page]));
  const manifest = Array.isArray(pageManifest) ? pageManifest : [];
  const warnings = [];
  const pages = manifest.length
    ? manifest.map((source) => {
        const modelPage = pageByIndex.get(source.pageIndex);
        if (!modelPage || !modelPage.text) warnings.push("PAGE_TEXT_MISSING");
        return {
          pageIndex: source.pageIndex,
          text: modelPage ? modelPage.text : "",
          sourceFilename: source.sourceFilename,
          sourceSha256: source.sourceSha256,
          sourcePage: source.sourcePage,
        };
      })
    : (Array.isArray(modelPages) ? modelPages.map((page) => ({ ...page })) : []);
  const text = pages.map((page) => page.text).filter(Boolean).join("\n\n");
  if (!text) warnings.push("NO_TEXT_FOUND");
  return {
    fileSha256: SHA256_RE.test(String(fileSha256 || "")) ? String(fileSha256).toLowerCase() : null,
    pages,
    text,
    warnings: [...new Set(warnings)],
  };
}

module.exports = {
  MAX_PAGE_MANIFEST_ITEMS,
  buildGeminiExtractSchema,
  validatePageManifest,
  normalizeExtractPayload,
  mergePageProvenance,
};
