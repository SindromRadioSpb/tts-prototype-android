// ingest/ssrfGuard.js
// R14: серверный fetch произвольных URL — единственная новая внешняя поверхность W1.
// Fail-closed политика: непонятный IP = приватный; порты только 80/443; каждый
// redirect-хоп проходит полную ревалидацию. Соединение использует только
// проверенные DNS-адреса; hostname сохраняется для Host и TLS-проверки.
"use strict";

const dns = require("dns").promises;
const net = require("net");
const { Agent, fetch: undiciFetch } = require("undici");

function ingestErr(code, msgRu) {
  const e = new Error(`${code}: ${msgRu}`);
  e.code = code;
  return e;
}

const INGEST_CODES = new Set([
  "BAD_URL", "BAD_SCHEME", "BAD_PORT", "PRIVATE_ADDR", "FETCH_FAILED", "NOT_HTML",
  "TOO_LARGE", "TOO_MANY_REDIRECTS", "FETCH_TIMEOUT",
  "EXTRACT_EMPTY", "DOCX_EMPTY", "BAD_DOCX" // Task 3/5 extract codes
]);

function isPrivateIp(ip) {
  if (typeof ip !== "string" || !ip.trim()) return true; // fail closed
  let v = ip.trim().toLowerCase();
  if (net.isIPv6(v)) {
    // DNS may return expanded notation; prefix checks require canonical form.
    try { v = new URL(`http://[${v}]/`).hostname.slice(1, -1); }
    catch { return true; }
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    if (v.startsWith("::")) return true; // reserved ::/96
    if (/^fe[89a-f]/.test(v)) return true; // link-local fe80::/10, site-local fec0::/10
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique-local
    if (v.startsWith("ff")) return true; // multicast
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

async function resolvePublicHttpTarget(rawUrl, opts = {}) {
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
    return { url: u, addresses: [host] };
  }
  let addrs;
  try { addrs = await resolveAll(host); } catch { throw ingestErr("PRIVATE_ADDR", "Хост не разрешается"); }
  if (!Array.isArray(addrs) || addrs.length === 0 || addrs.some(isPrivateIp)) {
    throw ingestErr("PRIVATE_ADDR", "Хост указывает на приватный адрес");
  }
  return { url: u, addresses: addrs };
}

async function assertPublicHttpUrl(rawUrl, opts = {}) {
  return (await resolvePublicHttpTarget(rawUrl, opts)).url;
}

function withAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(ingestErr("FETCH_TIMEOUT", "Превышено время загрузки страницы"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(ingestErr("FETCH_TIMEOUT", "Превышено время загрузки страницы"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function pinnedLookup(addresses) {
  return (_host, options, callback) => {
    const records = addresses.map(address => ({ address, family: net.isIP(address) }));
    const family = typeof options === "number" ? options : options.family;
    const candidates = family ? records.filter(record => record.family === family) : records;
    if (!candidates.length) return callback(ingestErr("FETCH_FAILED", "Нет адреса нужного семейства"));
    if (options.all) callback(null, candidates);
    else callback(null, candidates[0].address, candidates[0].family);
  };
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
  const doFetch = fetchImpl || undiciFetch;
  const deadline = Date.now() + timeoutMs;
  let current = String(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(0, deadline - Date.now()));
    let dispatcher;
    try {
      const { url: u, addresses } = await withAbort(resolvePublicHttpTarget(current, { resolveAll }), ctrl.signal);
      dispatcher = new Agent({ connect: { lookup: pinnedLookup(addresses) }, connections: 1 });
      let resp;
      try {
        resp = await doFetch(u.toString(), {
          redirect: "manual",
          signal: ctrl.signal,
          dispatcher,
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
        let nextUrl;
        try {
          nextUrl = new URL(loc, u).toString();
        } catch (e) {
          throw ingestErr("FETCH_FAILED", "Некорректный редирект");
        }
        current = nextUrl;
        continue;
      }
      if (!resp.ok) throw ingestErr("FETCH_FAILED", `HTTP ${resp.status}`);
      const ct = (resp.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
        ctrl.abort();
        throw ingestErr("NOT_HTML", "Страница не является HTML");
      }
      const clStr = resp.headers.get("content-length");
      if (clStr && Number(clStr) > maxBytes) {
        ctrl.abort();
        throw ingestErr("TOO_LARGE", "Страница слишком большая");
      }
      let buf = Buffer.alloc(0);
      try {
        if (resp.body) {
          const chunks = [];
          let totalBytes = 0;
          for await (const chunk of resp.body) {
            const bufChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            chunks.push(bufChunk);
            totalBytes += bufChunk.length;
            if (totalBytes > maxBytes) throw ingestErr("TOO_LARGE", "Страница слишком большая");
          }
          buf = Buffer.concat(chunks);
        } else {
          const ab = await resp.arrayBuffer();
          buf = Buffer.from(ab);
          if (buf.length > maxBytes) throw ingestErr("TOO_LARGE", "Страница слишком большая");
        }
      } catch (e) {
        if (e && e.name === "AbortError") throw ingestErr("FETCH_TIMEOUT", "Превышено время загрузки страницы");
        if (e && typeof e.code === "string" && INGEST_CODES.has(e.code)) throw e;
        throw ingestErr("FETCH_FAILED", "Не удалось прочитать страницу");
      }
      return { html: decodeHtmlBuffer(buf, ct), finalUrl: u.toString() };
    } finally {
      clearTimeout(timer);
      ctrl.abort(); // release unread redirect/error bodies as well as timed-out requests
      if (dispatcher) await dispatcher.destroy();
    }
  }
  throw ingestErr("TOO_MANY_REDIRECTS", "Слишком много редиректов");
}

module.exports = { isPrivateIp, assertPublicHttpUrl, safeFetchHtml, ingestErr };
