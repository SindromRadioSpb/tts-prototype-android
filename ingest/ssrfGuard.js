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
