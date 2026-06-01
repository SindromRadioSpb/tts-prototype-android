"use strict";

// Pealim conjugation/declension provider (server-side scrape of www.pealim.com).
//
// WHY scrape: Dicta (our authoritative morphology source) has no public
// synchronous synthesis/inflection API — its Nakdan endpoint rejects
// task:synthesis/analyze/inflect and morph-analysis.loadbalancer is an async
// URL/file batch poll server, not a per-word synthesizer. Pealim has accurate,
// complete paradigms for verbs (спряжение) and nouns/adjectives (склонение).
//
// robots.txt compliance (checked 2026-06-01):
//   User-agent: * → "Allow: /", Content-Signal: search=yes, ai-train=no.
//   /ru/dict/ and /ru/search/ are NOT disallowed for a generic user agent.
//   Only AI-crawler bots (ClaudeBot/GPTBot/CCBot/…) are Disallow:/. This module
//   is an application reference-lookup proxy on an explicit end-user request
//   (equivalent to the user's own browser, which Allow:/ permits) — NOT an AI
//   crawler. We honour ai-train=no: Pealim content is cached only for direct
//   display to the learner and is NEVER used to train/fine-tune any model.
//   Politeness: shared server cache (one fetch per lemma globally), low
//   concurrency + delay (enforced in the gateway), honest UA, visible
//   "Источник: Pealim" attribution + retained deep-link, no audio hotlinking.
//
// Output is a lossless raw slot→form map (the client groups slots into the
// displayed grid). A parse miss returns { ok:false } — we NEVER fabricate a
// paradigm; the client falls back to the Pealim link.

const https = require("https");

const PEALIM_HOST   = "www.pealim.com";
const MODEL_VERSION = "pealim-infl-v3"; // v3: model-versioned page cache (v2 reused stale v1-parsed cells)
const TIMEOUT_MS    = Number(process.env.PEALIM_TIMEOUT_MS || 12000);
const UA            = "Mozilla/5.0 (compatible; LinguistPro/1.0; +https://linguistpro.kolosei.com)";

// ── HTTP helper — GET HTML, one-hop redirect follow (mirrors googleFree._get) ─
function _get(path, _redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: PEALIM_HOST, port: 443, path, method: "GET",
        headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
        timeout: TIMEOUT_MS },
      (res) => {
        const sc = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(sc) && res.headers.location && _redirects < 2) {
          res.resume();
          let loc = res.headers.location;
          try { loc = new URL(loc, "https://" + PEALIM_HOST).pathname + (new URL(loc, "https://" + PEALIM_HOST).search || ""); } catch (_) {}
          return resolve(_get(loc, _redirects + 1));
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          if (sc === 429) { const e = new Error("Pealim: rate limit (429)"); e.status = 429; e.kind = "rate_limit"; return reject(e); }
          if (sc >= 400)  { const e = new Error(`Pealim: HTTP ${sc}`); e.status = sc; e.kind = sc >= 500 ? "transient" : "unknown"; return reject(e); }
          resolve(body);
        });
      }
    );
    req.on("error", (e) => { e.kind = "network"; reject(e); });
    req.on("timeout", () => { req.destroy(); const e = new Error("Pealim: timeout"); e.kind = "timeout"; reject(e); });
    req.end();
  });
}

// ── small text utils ──────────────────────────────────────────────────────
const NIQQUD_RE = /[֑-ׇ]/g;          // niqqud + cantillation
const FORMAT_RE = /[‌-‏‪-‮⁦-⁩﻿]/g;
function stripNiqqud(s) { return String(s == null ? "" : s).replace(NIQQUD_RE, "").replace(FORMAT_RE, "").trim(); }
function stripTags(s)   { return String(s == null ? "" : s).replace(/<[^>]+>/g, ""); }
function decodeEntities(s) {
  return String(s == null ? "" : s)
    .replace(/&rlm;/g, "‏").replace(/&lrm;/g, "‎")           // bidi marks (Pealim imperative)
    .replace(/&zwnj;/g, "‌").replace(/&zwj;/g, "‍")
    .replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (_) { return ""; } })
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch (_) { return ""; } })
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"); // &amp; LAST
}
// Strip tags + decode entities + drop bidi-format chars (keeps niqqud). Used
// for both Hebrew forms and transliterations.
function clean(s) { return decodeEntities(stripTags(s)).replace(FORMAT_RE, "").replace(/\s+/g, " ").trim(); }

// Transliteration HTML preserving Pealim's stress <b> (and ONLY <b>) — we
// generate it ourselves (escape text, re-insert our own <b>), so it is XSS-safe.
function buildTranslitHtml(raw) {
  const esc = (t) => decodeEntities(stripTags(t)).replace(FORMAT_RE, "")
    .replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[ch]));
  let out = "", rest = String(raw == null ? "" : raw);
  const re = /<\s*b\s*>([\s\S]*?)<\s*\/\s*b\s*>/i;
  let m;
  while ((m = re.exec(rest))) {
    out += esc(rest.slice(0, m.index));
    out += '<b class="v3-conj-stress">' + esc(m[1]) + "</b>";
    rest = rest.slice(m.index + m[0].length);
  }
  out += esc(rest);
  return out.replace(/\s+/g, " ").trim();
}
// Hebrew root letters only (drops the "כ - ת - ב" spacing/dashes + niqqud).
function normRoot(s) { return stripNiqqud(decodeEntities(stripTags(s))).replace(/[^א-ת]/g, ""); }

// Pealim Russian binyan name → app <select> value.
function pealimBinyanToApp(raw) {
  let s = String(raw || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я]/g, "").replace(/[ьъ]/g, "");
  if (!s) return null;
  if (s.includes("итпа")) return "hitpael";
  if (s.includes("уфал")) return "hufal";
  if (s.includes("ифил") || s.includes("ифъил")) return "hifil";
  if (s.includes("пуал")) return "pual";
  if (s.includes("пиэл") || s.includes("пиел")) return "piel";
  if (s.includes("ниф"))  return "nifal";
  if (s.includes("паал")) return "paal";
  return null;
}

// ── parse a dict page → normalized paradigm (or null) ─────────────────────
//   { kind:"verb"|"noun", pos, lemma_niqqud, root, binyan?, gizra_note?, cells }
function parsePealimPage(html) {
  const b = String(html || "");
  // header: "Спряжение глагола {lemma}" (verb) | "Формы слова {lemma}" (nominal)
  const hdr = b.match(/<h2 class="page-header">\s*(Спряжение глагола|Формы слова)\s+([\s\S]*?)(?:<span|<\/h2>)/);
  if (!hdr) return null;
  const kind = /Спряжение/.test(hdr[1]) ? "verb" : "noun";
  const lemmaNiqqud = clean(hdr[2]);

  // pos descriptor paragraph: "Глагол – ПААЛЬ" | "Существительное – …, мужской род" | "Прилагательное …"
  let pos = kind === "verb" ? "verb" : "noun";
  let binyan = null;
  const verbP = b.match(/Глагол\s*[–—-]\s*<b>\s*([^<]+?)\s*<\/b>/);
  if (verbP) { pos = "verb"; binyan = pealimBinyanToApp(verbP[1]); }
  else if (/<p>\s*Прилагательное/.test(b)) pos = "adjective";
  else if (/<p>\s*Существительное/.test(b)) pos = "noun";

  // root: <p>Корень: <span class="menukad"><a…>כ - ת - ב</a></span>
  const rootM = b.match(/Корень:\s*<span class="menukad">\s*(?:<a[^>]*>)?\s*([^<]+?)\s*(?:<\/a>|<\/span>)/);
  const root = rootM ? normRoot(rootM[1]) : null;

  // gizra/peculiarity note: first <p> after the root paragraph (skip ads/scripts).
  let gizraNote = null;
  const gz = b.match(/Корень:[\s\S]*?<\/p>\s*<p>([\s\S]*?)<\/p>/);
  if (gz) {
    const t = clean(gz[1]);
    if (t && t.length < 240 && /[А-Яа-я]/.test(t) && !/adsbygoogle|googlesyndication/i.test(t)) gizraNote = t;
  }

  // conjugation/declension cells: <td class="conj-td"><div id="SLOT">…
  //   <span class="menukad">FORM</span> … <div class="transcription">TR</div>
  const cells = {};
  const cellRe = /<td[^>]*class="conj-td"[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = cellRe.exec(b))) {
    const cell = m[1];
    const idM = cell.match(/<div[^>]*\bid="([^"]+)"/);
    if (!idM) continue;
    const heM = cell.match(/<span class="menukad">([\s\S]*?)<\/span>/);
    if (!heM) continue;                                  // empty cell ("—") — skip
    const he = clean(heM[1]);
    if (!he) continue;
    const trM = cell.match(/<div class="transcription">([\s\S]*?)<\/div>/);
    // translit = plain (tap-to-speak/aria); translit_html keeps Pealim's stress
    // <b> as our own red-stress span (XSS-safe — we generate it). Strip Pealim's
    // trailing "!" on imperatives (redundant — the group header marks the mood).
    const noBang = (x) => String(x || "").replace(/\s*!+\s*$/, "");
    cells[idM[1]] = {
      he: noBang(he),
      translit: trM ? noBang(clean(trM[1])) : "",
      translit_html: trM ? noBang(buildTranslitHtml(trM[1])) : "",
    };
  }
  if (!Object.keys(cells).length) return null;
  return { kind, pos, lemma_niqqud: lemmaNiqqud, root, binyan, gizra_note: gizraNote, cells };
}

// ── search → candidate dict links ─────────────────────────────────────────
function parseSearchLinks(html) {
  const out = [], seen = new Set();
  const re = /href="(\/ru\/dict\/(\d+)-([a-z0-9-]+)\/)"/g;
  let m;
  while ((m = re.exec(String(html || "")))) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    out.push({ url: m[1], id: m[2], slug: m[3] });
  }
  return out;
}
async function searchLemma(heLemma) {
  const q = stripNiqqud(heLemma);
  if (!q) return [];
  const html = await _get("/ru/search/?from_lang=he&q=" + encodeURIComponent(q));
  return parseSearchLinks(html);
}

// Score a parsed candidate against what ① decoded (binyan/root/pos).
function scoreCandidate(parsed, want) {
  if (!parsed) return -1;
  let s = 0;
  const wantVerb = want.pos === "verb" || !!want.binyan;
  if (wantVerb && parsed.kind === "verb") s += 2; else if (!wantVerb && parsed.kind !== "verb") s += 2;
  if (want.root && parsed.root && want.root === parsed.root) s += 3;
  if (want.binyan && parsed.binyan && want.binyan === parsed.binyan) s += 3;
  return s;
}

// Resolve a lemma to a normalized paradigm via search + disambiguation.
// opts: { binyan, pos, root } from ①'s decode (all optional). pageGet/pagePut
// (optional) memoize parsed pages by pealim id (the gateway passes the disk
// cache so candidate fetches during disambiguation aren't wasted).
async function resolveLemma(heLemma, opts) {
  const want = opts || {};
  const candidates = await searchLemma(heLemma);
  if (!candidates.length) return { ok: false, reason: "no_search_results", model_version: MODEL_VERSION };

  const MAX_TRY = 3;
  let best = null, bestScore = -1, bestId = null;
  for (const c of candidates.slice(0, MAX_TRY)) {
    let parsed = null;
    try {
      if (want.pageGet) parsed = await want.pageGet(c.id);
      if (!parsed) {
        const html = await _get(c.url);
        parsed = parsePealimPage(html);
        if (parsed && want.pagePut) { try { await want.pagePut(c.id, parsed); } catch (_) {} }
      }
    } catch (e) {
      if (e && e.status === 429) throw e;                // surface rate-limit
      continue;
    }
    if (!parsed) continue;
    const sc = scoreCandidate(parsed, want);
    if (sc > bestScore) { best = parsed; bestScore = sc; bestId = c.id; }
    // strong match (right kind + root + binyan) → stop early (polite)
    if (sc >= 7) break;
  }
  if (!best) return { ok: false, reason: "no_parsable_entry", model_version: MODEL_VERSION };

  const wantRootMatched = want.root ? (best.root === want.root) : true;
  const wantBinyanMatched = want.binyan ? (best.binyan === want.binyan) : true;
  return {
    ok: true,
    model_version: MODEL_VERSION,
    provider: "pealim",
    paradigm: {
      lemma: stripNiqqud(best.lemma_niqqud) || stripNiqqud(heLemma),
      lemma_niqqud: best.lemma_niqqud,
      root: best.root || (want.root || null),
      pos: best.pos,
      binyan: best.binyan || (want.binyan || null),
      kind: best.kind,
      source: "pealim",
      pealim_id: bestId,
      pealim_url: "https://" + PEALIM_HOST + "/ru/dict/" + bestId + "-/",
      model_version: MODEL_VERSION,
      gizra_note: best.gizra_note || null,
      disambig: (wantRootMatched && wantBinyanMatched) ? "match" : "best-effort",
      cells: best.cells,
    },
  };
}

module.exports = {
  MODEL_VERSION, resolveLemma, searchLemma, parsePealimPage, parseSearchLinks,
  pealimBinyanToApp, normRoot, stripNiqqud, buildTranslitHtml, _get,
};
