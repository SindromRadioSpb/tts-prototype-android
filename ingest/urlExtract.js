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
    .replace(/[ \t ]+/g, " ")
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
