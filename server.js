// --------------------------------------------------------
// 1. ИМПОРТЫ
// --------------------------------------------------------
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const { execFile } = require("child_process");
const http = require("http");
const archiver = require("archiver");
const AdmZip = require("adm-zip");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const {
  DATA_DIR,
  DB_PATH,
  USAGE_FILE,
  AUDIO_CACHE_DIR,
  GEMINI_CACHE_DIR,
  BACKUPS_DIR,
} = require("./storage");

const { isPlausibleGeminiKey } = require("./ingest/geminiKey");
const segTable = require("./ingest/segTable.js");
const {
  buildRowsFromGeminiPayload,
  canonicalizeKnownNiqqudRows,
  validateHebrewSourceCoverage,
} = require("./ingest/tableRows.js");
const { buildGeminiTableResponseSchema } = require("./ingest/geminiTableSchema.js");
const { generateGeminiContent } = require("./ingest/geminiClient.js");
const {
  GEMINI_STUDIO_MODEL,
  getGeminiScenario,
  buildGeminiCacheKey,
  cacheMatchesScenario,
} = require("./ingest/geminiPolicy.js");
const {
  buildRawTableCachePayload,
  readRawTableCache,
  writeRawTableCacheAtomic,
} = require("./ingest/geminiTableRawCache.js");

// v3.0 foundation: SQLite (Library/Progress source of truth)
const { initDb, getDbHealth, ensureAudioAssetsDurationMsColumn } = require("./db/sqlite");

const { runMigrations, getMigrationsHealth } = require("./db/migrate");
const { startupCheck } = require("./db/integrity");
const { createBackup, cleanupBackups, DEFAULT_MAX_BACKUPS } = require("./db/backup");

const textToSpeech = require("@google-cloud/text-to-speech");
const { Type } = require("@google/genai");
const hebrewTtsClient = require("./db/premium/hebrewTtsClient");
const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
  TextRun,
  AlignmentType,
  ExternalHyperlink,
} = require("docx");

const {
  computeTextKey,
  guessTitle,
  createTextWithSentences,
  updateTextWithSentences,
  listTexts,
  getTextById,
  getSentencesByTextId,
  getSentenceById,
  searchSentences,
  getExportRowsByTextId,
  touchTextOpened,
  archiveTextById,
  deleteTextById,

  // Week9 dashboard meta
  updateTextMeta,
} = require("./db/libraryRepo");

const {
  getSentenceCount,
  getProgressByTextId,
  setProgress,
  clearProgress,
} = require("./db/progressRepo");

const {
  recordRowTtsEvent,
  listRecentTexts,
  listRecentRowsByText,
  listRecentActivity,
  getAnalyticsSummary,
  listTopTextsByPlays,
} = require("./db/historyRepo");
const {
  recordEvent,
  countEventsByType,
} = require("./db/eventsRepo");

const {
  buildExportRowsWithNotes,
  countBundleNotes,
  isValidBundleAudioEntryName,
} = require("./db/libraryBundle");

const {
  listTemplates,
  getSentenceCardSnapshot,
  getCardSnapshotById,
  createSentenceCard,
  generateSentenceCards,
  reviewSentenceCard,
  listTodayCards,
} = require("./db/srsRepo");

const {
  getTodaySummary,
  createTodaySession,
  getSessionById,
  getSessionNext,
  reviewSessionNext,
  finishSession,
} = require("./db/srsSessionRepo");
const {
  buildTrainerPayload,
  checkAttempt,
} = require("./db/srsAttemptRepo");
const {
  computeSrsExportHash,
  getSrsCardExport,
  upsertSrsCardExport,
} = require("./db/ankiExportRepo");

const {
  upsertAudioAsset,
  getAudioAssetByKey,
  touchAudioAsset,

  // linking / defaults
  linkSentenceAudio,
  linkTextAudio,
  setSentenceDefaultAudio,
  setTextDefaultAudio,

  // read
  getSentenceAudio,
  getTextAudio,
  getDefaultSentenceAudioMap,
} = require("./db/audioRepo");

const {
  listNotesByTextId,
  getNote,
  getNoteBySentenceId,
  upsertNote,
  deleteNote,
  searchNotes,
  getNoteWithContext,
} = require("./db/notesRepo");

async function v3TrackEventSafe(event) {
  try {
    await recordEvent(event);
  } catch (e) {
    console.warn("[events] track failed:", e && e.message ? e.message : e);
  }
}

// --------------------------------------------------------
// 2. НАСТРОЙКИ СЕРВЕРА
// --------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

// Don't advertise the framework — drops the `X-Powered-By: Express` header.
app.disable("x-powered-by");
// We run behind Traefik (Coolify). Trust the first proxy hop so req.ip and
// req.protocol/req.secure reflect the real client + scheme (used by the
// same-origin guard below and rate-limiter keying).
app.set("trust proxy", 1);

// CLG-P7.1a: the Telegram webhook is the first internet-facing surface. Its secret MUST be
// checked BEFORE any body is parsed (an unauth attacker must not force a 10 MB JSON parse). So
// exclude the webhook path from the global parser; the webhook route mounts its own secret gate
// + a tiny 256 KB parser (a Telegram update is small). Adjudication of critique wf_a67874c5.
const TELEGRAM_WEBHOOK_PATH = "/api/telegram/webhook";
const AGENT_ACCESS_MCP_PATH = "/agent-access/mcp";
// Sync-hardening P0 (§6.3, критика F2-2): artifacts/put выведен из-под глобального парсера —
// state_bundle (кап 24 МБ) не влезает в 10mb, а auth/CSRF/consent обязаны отработать ДО
// тяжёлого парса (тот же инвариант, что у webhook'а: unauth не должен заставлять сервер
// парсить мегабайты). Роут монтирует свой 32mb-парсер ПОСЛЕ гейтов.
const LEARNER_ARTIFACTS_PUT_PATH = "/api/learner/artifacts/put";
const GROUP_CORPUS_IMPORT_RE = /^\/api\/group-corpora\/[^/]+\/import\/(catalog|backup)$/;
const _globalJson = bodyParser.json({ limit: "10mb" });
app.use((req, res, next) => ([TELEGRAM_WEBHOOK_PATH, AGENT_ACCESS_MCP_PATH, LEARNER_ARTIFACTS_PUT_PATH].includes(req.path) || GROUP_CORPUS_IMPORT_RE.test(req.path) ? next() : _globalJson(req, res, next)));

// ── Content-Security-Policy: REPORT-ONLY rollout ───────────────────────────
// index.html is inline-script/style heavy, so we can't enforce a strict CSP
// yet without a nonce/refactor pass. Report-Only is the safe first step: the
// browser NEVER blocks anything, it only POSTs a violation report to
// /api/csp-report. That lets us discover the real source map (external
// origins, eval/wasm needs, framed content) on live traffic with zero risk of
// breaking the app, then tighten toward an enforceable policy later.
//
// This candidate is deliberately strict on the dimensions we want to discover
// (default/connect/img/font/media/object/frame) and tolerant of inline
// script/style (a known, separately-tracked refactor) so reports stay signal,
// not noise. Codebase scan found NO direct client-side calls to Google APIs
// (BYOK TTS/Translate/Gemini go through our /api proxy), so connect-src 'self'
// should cover normal traffic — anything else will surface in the reports.
//
// Kill switch: set CSP_REPORT_ONLY=0 (or "off") to drop the header instantly
// via an env change + restart, no code edit. Report-Only cannot regress
// behaviour, so it ships enabled by default.
const CSP_REPORT_ONLY_ENABLED =
  !["0", "off", "false", "no"].includes(String(process.env.CSP_REPORT_ONLY || "").trim().toLowerCase());
const CSP_REPORT_ONLY_VALUE = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  // Inline tolerated for now (known refactor); wasm-unsafe-eval for wa-sqlite /
  // sherpa-onnx WASM; blob: for worker/wasm bootstrap. No 'unsafe-eval' — we
  // want a report if any plain eval()/new Function() sneaks in.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "report-uri /api/csp-report",
  "report-to csp-endpoint",
].join("; ");

// CLG-P8.1 — /miniapp.html runs inside Telegram webviews and is embedded as an
// IFRAME by Telegram Web (web.telegram.org): X-Frame-Options SAMEORIGIN would
// block it there, and COEP require-corp would block the mandatory SDK script
// https://telegram.org/js/telegram-web-app.js. The shell uses no
// SharedArrayBuffer/OPFS, so cross-origin isolation is not needed on it —
// instead it gets an ENFORCED strict CSP (frame-ancestors pinned to self +
// web.telegram.org; scripts pinned to self + telegram.org, no inline JS) and
// no-cache (an auth shell must never be served stale from HTTP cache).
const MINIAPP_SHELL_PATH = "/miniapp.html";
const AGENT_ACCESS_SHELL_PATH = "/agent-access.html";
const PRONUNCIATION_SHELL_PATH = "/pronunciation.html";
const MINIAPP_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'self' https://web.telegram.org",
  "script-src 'self' https://telegram.org",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'none'",
].join("; ");
const AGENT_ACCESS_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
].join("; ");
const PRONUNCIATION_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' http://127.0.0.1:8766",
  "form-action 'none'",
].join("; ");

// Security + cross-origin-isolation headers on every response.
//   • COOP/COEP/CORP enable SharedArrayBuffer (wa-sqlite AccessHandlePoolVFS).
//   • HSTS: site is HTTPS-only behind Traefik + Let's Encrypt — pin it.
//   • nosniff / frame-deny / referrer / permissions: standard hardening.
//   • CSP: Report-Only (see above) — observational, never blocks.
app.use((req, res, next) => {
  const isMiniappShell = req.path === MINIAPP_SHELL_PATH;
  const isAgentAccessShell = req.path === AGENT_ACCESS_SHELL_PATH;
  const isPronunciationShell = req.path === PRONUNCIATION_SHELL_PATH;
  if (isMiniappShell) {
    res.setHeader("Content-Security-Policy", MINIAPP_CSP);
    res.setHeader("Cache-Control", "no-cache");
  } else if (isAgentAccessShell) {
    res.setHeader("Content-Security-Policy", AGENT_ACCESS_CSP);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
  } else if (isPronunciationShell) {
    res.setHeader("Content-Security-Policy", PRONUNCIATION_CSP);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  } else {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  }
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", isPronunciationShell
    ? "camera=(), microphone=(self), geolocation=(), browsing-topics=(), local-network-access=(self), local-network=(self), loopback-network=(self)"
    : "camera=(), microphone=(), geolocation=(), browsing-topics=()");
  if (CSP_REPORT_ONLY_ENABLED && !isMiniappShell && !isAgentAccessShell && !isPronunciationShell) {
    // Modern Reporting API endpoint (Chrome) + classic report-uri (all browsers).
    // The miniapp shell is excluded: it carries its own ENFORCED CSP above, and the
    // report-only frame-ancestors 'self' would spam violation reports from Telegram Web.
    res.setHeader("Reporting-Endpoints", 'csp-endpoint="/api/csp-report"');
    res.setHeader("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY_VALUE);
  }
  next();
});

// CSP violation report sink (Report-Only). Browsers POST here as either
// application/csp-report (report-uri, CSP2) or application/reports+json
// (report-to, Reporting API). We ACK 204 unconditionally and never throw — the
// browser ignores failures anyway. Logging is windowed + deduped so a noisy
// policy can't flood the container logs (visible in Coolify → Logs).
const cspReportState = { windowStart: 0, logged: 0, dropped: 0, seen: new Set() };
app.post(
  "/api/csp-report",
  bodyParser.json({
    type: ["application/csp-report", "application/reports+json", "application/json", "text/*"],
    limit: "64kb",
  }),
  (req, res) => {
    res.sendStatus(204);
    try {
      const now = Date.now();
      if (now - cspReportState.windowStart > 60_000) {
        if (cspReportState.dropped > 0) {
          console.warn(`[csp-report] window: ${cspReportState.logged} logged, ${cspReportState.dropped} deduped/dropped`);
        }
        cspReportState.windowStart = now;
        cspReportState.logged = 0;
        cspReportState.dropped = 0;
        cspReportState.seen.clear();
      }
      // Normalise both report shapes into a flat list of violation bodies.
      const body = req.body || {};
      const reports = Array.isArray(body)
        ? body.map((r) => (r && r.body) || r)            // report-to batch
        : [body["csp-report"] || body];                 // report-uri single
      for (const r of reports) {
        if (!r || typeof r !== "object") continue;
        const directive = r["effective-directive"] || r["violated-directive"] || r.effectiveDirective || "?";
        const blocked = String(r["blocked-uri"] || r.blockedURL || "?").slice(0, 200);
        const key = `${directive}|${blocked}`;
        if (cspReportState.seen.has(key) || cspReportState.logged >= 50) {
          cspReportState.dropped++;
          continue;
        }
        cspReportState.seen.add(key);
        cspReportState.logged++;
        const doc = String(r["document-uri"] || r.documentURL || "").slice(0, 140);
        console.warn(`[csp-report] ${directive} blocked=${blocked} doc=${doc}`);
      }
    } catch (_) {
      /* never let the report sink throw */
    }
  }
);

// ── B4: Per-IP rate limiting for stateless endpoints ───────────────────────
// Sliding-window in-memory token bucket. Cheap (O(1) amortised) and zero
// dependencies — sufficient given Railway is single-instance. Mount on the
// LOCAL_MODE-friendly stateless endpoints so a misbehaving (or compromised)
// client can't run up our LLM/CPU bill.
function makeRateLimiter({ windowMs = 60_000, max = 60, name = "limit" } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const ip = req.ip || (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
               (req.connection && req.connection.remoteAddress) || "unknown";
    const now = Date.now();
    const arr = buckets.get(ip) || [];
    const fresh = [];
    for (const t of arr) if (now - t < windowMs) fresh.push(t);
    if (fresh.length >= max) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ ok: false, error: "TOO_MANY_REQUESTS", limit: max, windowMs, name });
    }
    fresh.push(now);
    buckets.set(ip, fresh);
    // Drop empty buckets periodically — bounds memory under unique-IP attack.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        const keep = v.filter((t) => now - t < windowMs);
        if (keep.length === 0) buckets.delete(k);
        else if (keep.length !== v.length) buckets.set(k, keep);
      }
    }
    next();
  };
}
const rlTransliterate = makeRateLimiter({ windowMs: 60_000, max: 60,  name: "transliterate" });
const rlExportDocx    = makeRateLimiter({ windowMs: 60_000, max: 30,  name: "export-docx" });
// audio-cache-upload sees legitimate bulk traffic from ZIP-bundle imports
// (typical bundle: 2000–3000 MP3s, client concurrency=4). The first cut at
// 200/min was too tight — full imports got 429-storm'd after the first
// minute. 2000/min is generous enough that a single import completes in
// roughly its own minute even under contention, but still bounds total
// writes per attacker per minute.
const rlAudioUpload   = makeRateLimiter({ windowMs: 60_000, max: 2000, name: "audio-cache-upload" });
// Throttle the prefetch job-submission endpoint. Its gate (v3AudioPrefetchIsAllowed)
// honours an X-Local-Mode header, so without a per-IP cap an unauthenticated remote
// caller could enqueue heavy TTS batches (up to V3_AUDIO_PREFETCH_MAX_ROWS each).
const rlAudioPrefetch = makeRateLimiter({ windowMs: 60_000, max: 20,   name: "audio-prefetch" });
// BRR-P1-014 A4 — corpus work-body push onto the persistent volume. Same generous
// window as audio-cache-upload (an A2 publish ships many small JSON bodies in a burst).
const rlWorksUpload   = makeRateLimiter({ windowMs: 60_000, max: 2000, name: "corpus-works-upload" });

// ── Phase 6: stateful library/SRS/progress/history routes are gone ────────
// After the localMode default-on flip (2026-05-08), every stateful API
// that touched the server's SQLite DB is permanently gone. Library data,
// SRS cards, progress, history, search — all run client-side from OPFS.
// We keep:
//   • Stateless services (TTS, transliterate, audio cache, DOCX builder).
//   • GET /api/library/export(/bundle) — last-mile data recovery for any
//     straggler whose client-side migration didn't run.
//     SECURITY INVARIANT (2026-06-13 going-public audit, AUTHZ-1 — accepted): the
//     export/import routes are intentionally unauthenticated. The app has no
//     server-side user auth (user data is client-side OPFS), so this is acceptable
//     ONLY while the server `texts` table stays empty in prod — it is, the OPFS
//     migration retired it. If the server DB is ever repopulated, gate export +
//     import behind requireAudioUploadAuth (the owner token) before doing so.
// Everything else returns 410 Gone with a friendly pointer to the user
// guide. We chose middleware over physical handler deletion to keep the
// diff small, the helper functions intact (some are imported by stateless
// paths), and the rollback trivial.
function gone410(req, res) {
  res.set("Cache-Control", "no-store");
  return res.status(410).json({
    ok: false,
    error: "GONE_PHASE6",
    message: "Эта функция больше не доступна на сервере. Библиотека работает в локальном режиме браузера. См. /docs/OPFS_USER_GUIDE.md",
    docs: "/docs/OPFS_USER_GUIDE.md",
  });
}

// ── D2: Header trust audit — same-origin + content-type guards ─────────────
// Mounted on stateless POST endpoints below. Two checks:
//   1. Same-origin: Origin/Referer header must match our own host. Browsers
//      always send these on cross-origin POSTs so a simple match defeats
//      basic CSRF / a malicious site posting from the user's browser.
//      Server-to-server callers (curl, Android v2, etc.) typically omit
//      Origin — we accept that, since they're not subject to CSRF.
//   2. Content-Type: must start with application/json (bodyParser.json
//      already requires this de facto, but rejecting early gives a clearer
//      error than a parsed-empty body).
// We deliberately don't add a CSRF token — there are no per-user sessions
// to scope it to. The Origin/Referer check is the right tool for this app.
function requireSameOriginJson(req, res, next) {
  const ct = String(req.headers["content-type"] || "").toLowerCase();
  if (!ct.startsWith("application/json")) {
    return res.status(415).json({ ok: false, error: "UNSUPPORTED_MEDIA_TYPE", expected: "application/json" });
  }
  const origin = String(req.headers["origin"] || "").trim();
  const referer = String(req.headers["referer"] || "").trim();
  // Accept absent Origin (server-to-server, native clients) but reject
  // mismatched Origin (cross-site form post / fetch with credentials).
  if (origin) {
    const host = String(req.headers["host"] || "").trim();
    const proto = (req.protocol || (req.secure ? "https" : "http"));
    const expected = proto + "://" + host;
    if (origin !== expected && !origin.endsWith("://" + host)) {
      return res.status(403).json({ ok: false, error: "BAD_ORIGIN", origin });
    }
  } else if (referer) {
    const host = String(req.headers["host"] || "").trim();
    if (host && !referer.includes("://" + host + "/") && !referer.includes("://" + host + "?")) {
      return res.status(403).json({ ok: false, error: "BAD_REFERER", referer });
    }
  }
  next();
}

// AA2-B2 — browser-only Agent Access boundary. This is intentionally stricter
// than requireSameOriginJson: no absent-Origin exception, no permissive CORS,
// and no forwarded-host trust unless its own flag is explicitly enabled.
const agentAccessRequestBoundary = require("./agent/access/requestBoundary");
function agentAccessBoundaryVerdict(req) {
  return agentAccessRequestBoundary.validateBrowserRequest({
    enabled: process.env.AGENT_ACCESS_UI_ENABLED,
    canonical_origin: process.env.AGENT_ACCESS_CANONICAL_ORIGIN,
    host: req.get("host"),
    protocol: req.socket && req.socket.encrypted ? "https" : "http",
    forwarded_host: req.get("x-forwarded-host"),
    forwarded_proto: req.get("x-forwarded-proto"),
    trust_proxy: String(process.env.AGENT_ACCESS_TRUST_PROXY || "") === "1",
    allow_loopback_fixture: process.env.NODE_ENV === "test"
      && String(process.env.AGENT_ACCESS_LOOPBACK_FIXTURE || "") === "1",
    method: req.method,
    content_type: req.get("content-type"),
    origin: req.get("origin"),
  });
}
function requireAgentAccessBoundary(req, res, next) {
  const verdict = agentAccessBoundaryVerdict(req);
  res.set("Cache-Control", "no-store");
  res.set("Vary", "Origin");
  if (verdict.ok) return next();
  const disabled = verdict.error === "AGENT_ACCESS_DISABLED";
  return res.status(disabled ? 404 : 403).json({ ok: false, error: verdict.error });
}

// Gate the HTML before express.static. JS/CSS contain no authority or data, but
// the product entry point itself remains absent unless B2 is explicitly enabled.
app.get(AGENT_ACCESS_SHELL_PATH, requireAgentAccessBoundary, (_req, _res, next) => next());

// Static assets with PWA-aware Cache-Control. Three tiers:
//   1. Long-immutable (1 year) for content-stable assets — fonts, raster
//      icons. Vendored and don't change across normal deploys.
//   2. Short revalidate (1 day) for code modules that may change between
//      deploys but where staleness for a few hours is acceptable. The
//      Service Worker (Phase C) also caches these and revalidates in the
//      background.
//   3. no-cache for entry points (index.html, manifest.json, sw.js) so the
//      Service Worker controls its own update lifecycle and the browser
//      always re-validates the shell.
// BRR-P1-014 A4 — corpus work bodies live on the PERSISTENT volume
// (DATA_DIR/benyehuda/works/<id>.json), NOT git, so the ~26K corpus tail never bloats
// the repo (only the thin catalog index ships in the repo). Mounted at the SAME public
// URL the Reading Room already fetches (`/data/benyehuda/works/<id>.json?v=N`) and placed
// BEFORE express.static(public) so a volume copy wins; a miss falls through
// (fallthrough:true) to the in-git canon baseline, then to an honest 404. The client URL
// is unchanged → no library-ui.js / SW change. Versioned via ?v=<catalogVersion> → a
// re-publish bumps the query and busts the cache, so the body is immutable-cacheable.
app.use("/data/benyehuda/works", express.static(path.join(DATA_DIR, "benyehuda", "works"), {
  fallthrough: true,
  index: false,
  setHeaders(res) {
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));

// BRR-P2-001 full-text index shards live on the SAME persistent volume (DATA_DIR/benyehuda/fts/),
// NOT git — the index grows with corpus coverage (tens of MB) and would bloat the repo. The THIN
// manifest (corpus-fts-v<N>.json) DOES ship in the repo (precached); only the per-letter exact
// shards + lemma index are volume-served + lazy. Same fallthrough-to-public pattern as works/.
app.use("/data/benyehuda/fts", express.static(path.join(DATA_DIR, "benyehuda", "fts"), {
  fallthrough: true,
  index: false,
  setHeaders(res) {
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));

// BRR Phase-3 proclitic overlays — per-work Dicta segmentation sidecars on the SAME persistent
// volume (DATA_DIR/benyehuda/proclitic/<id>.json), NOT git — one per baked work, grows with
// coverage. Served KEYLESS at /data/benyehuda/proclitic/<id>.json?v=<catalogVersion>; the client
// (library-ui.loadProcliticOverlay) fetches it best-effort, a miss falls through (offline-hedge).
// Same fallthrough + immutable-cache pattern as works/ + fts/.
app.use("/data/benyehuda/proclitic", express.static(path.join(DATA_DIR, "benyehuda", "proclitic"), {
  fallthrough: true,
  index: false,
  setHeaders(res) {
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));

// Context-disambiguation overlays (strategic #1, BRR_CONTEXT_OVERLAY_RECON_2026_07_02.md) —
// per-work baked Dicta context FACTS on the volume (DATA_DIR/benyehuda/context/<id>.json), NOT
// git. Served KEYLESS; the client (library-ui.loadContextOverlay) fetches best-effort — a 404
// keeps the live+consent Tier-3 path (honest un-baked semantics). Same pattern as proclitic/.
app.use("/data/benyehuda/context", express.static(path.join(DATA_DIR, "benyehuda", "context"), {
  fallthrough: true,
  index: false,
  setHeaders(res) {
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, filePath) {
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    const lower = filePath.toLowerCase();
    if (
      lower.endsWith(".woff2") ||
      lower.endsWith(".woff") ||
      /[\\/]icons[\\/].+\.(png|svg|ico)$/.test(lower) ||
      lower.endsWith("favicon.ico") ||
      // Versioned shipped datasets under public/data (e.g.
      // pealim-infl-v12.json.gz, pealim-function-links.v1.json). The version
      // token in the filename guarantees a new URL on every data change, so
      // these are safe to cache forever. Without this they fell through to
      // express.static's default `max-age=0`, forcing a revalidation of the
      // 3.3 MB inflection dict on every cold load.
      /[\\/]data[\\/].*[._-]v\d+[._-]/.test(lower)
    ) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (
      /[\\/](db|i18n|tts)[\\/].+\.js$/.test(lower)
    ) {
      res.setHeader("Cache-Control", "public, max-age=86400, must-revalidate");
    } else if (
      lower.endsWith("index.html") ||
      lower.endsWith("manifest.json") ||
      lower.endsWith("sw.js")
    ) {
      // Shell + SW: always revalidate. SW will handle its own caching.
      res.setHeader("Cache-Control", "no-cache");
    }
  },
}));

// RMA-2: audited incremental SHA-256 runtime. The exact package/integrity lives in
// package-lock.json; exposing one allowlisted file avoids a CDN/network dependency on mobile.
app.get("/vendor/hash-wasm/sha256.umd.min.js", (_req, res) => {
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.type("application/javascript").sendFile(
    path.join(__dirname, "node_modules", "hash-wasm", "dist", "sha256.umd.min.js")
  );
});

// P0-3: user-facing docs. The footer and feature onboarding link to /docs/*,
// but express.static only serves public/ — those would otherwise 404. Serve
// a STRICT WHITELIST of user docs, rendered as
// styled HTML pages with TOC and language switcher. The whitelist is a fixed
// map (no req.params in the filesystem path) so there is no path-traversal
// and no other internal docs/* file is ever exposed.
const DOCS_WHITELIST = {
  "PRIVACY.md": { file: "PRIVACY.md", lang: "ru", group: "PRIVACY" },
  "OPFS_USER_GUIDE.md": { file: "OPFS_USER_GUIDE.md", lang: "ru", group: "OPFS" },
  "BYOK_SETUP.md": { file: "BYOK_SETUP.md", lang: "ru", group: "BYOK_SETUP" },
  "BYOK_SETUP.en.md": { file: "BYOK_SETUP.en.md", lang: "en", group: "BYOK_SETUP" },
  "BYOK_SETUP.he.md": { file: "BYOK_SETUP.he.md", lang: "he", group: "BYOK_SETUP" },
  "LOCAL_ASR_COMPANION_GUIDE.md": { file: "LOCAL_ASR_COMPANION_GUIDE.md", lang: "ru", group: "LOCAL_ASR" },
  "LOCAL_ASR_COMPANION_GUIDE.en.md": { file: "LOCAL_ASR_COMPANION_GUIDE.en.md", lang: "en", group: "LOCAL_ASR" },
  "LOCAL_ASR_COMPANION_GUIDE.he.md": { file: "LOCAL_ASR_COMPANION_GUIDE.he.md", lang: "he", group: "LOCAL_ASR" },
};

// Filenames a group exposes per language — used by the language switcher.
const DOC_GROUP_LANGS = {
  BYOK_SETUP: { ru: "BYOK_SETUP.md", en: "BYOK_SETUP.en.md", he: "BYOK_SETUP.he.md" },
  PRIVACY:    { ru: "PRIVACY.md" },
  OPFS:       { ru: "OPFS_USER_GUIDE.md" },
  LOCAL_ASR:  { ru: "LOCAL_ASR_COMPANION_GUIDE.md", en: "LOCAL_ASR_COMPANION_GUIDE.en.md", he: "LOCAL_ASR_COMPANION_GUIDE.he.md" },
};

const _marked = require("marked");
const _markedInstance = new _marked.Marked();

function _docSlugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\wЀ-ӿ֐-׿\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "section";
}

// Custom renderer: anchor links on h2/h3, callout boxes for "Note/Warning/
// Tip" blockquotes, external link target=_blank, table wrapper for mobile
// overflow.
_markedInstance.use({
  gfm: true,
  breaks: false,
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const plain = tokens.map(t => t.raw || t.text || "").join("");
      const id = _docSlugify(plain);
      const anchor = depth <= 3 ? `<a class="doc-anchor" href="#${id}" aria-label="Permalink">#</a>` : "";
      return `<h${depth} id="${id}">${anchor}${text}</h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const isExternal = /^https?:\/\//i.test(href);
      const attrs = isExternal ? ' target="_blank" rel="noopener"' : "";
      const t = title ? ` title="${title.replace(/"/g, "&quot;")}"` : "";
      return `<a href="${href}"${attrs}${t}>${text}</a>`;
    },
    table({ header, rows }) {
      const head = "<thead><tr>" + header.map(c => {
        const text = this.parser.parseInline(c.tokens);
        const align = c.align ? ` style="text-align:${c.align}"` : "";
        return `<th${align}>${text}</th>`;
      }).join("") + "</tr></thead>";
      const body = "<tbody>" + rows.map(row =>
        "<tr>" + row.map(c => {
          const text = this.parser.parseInline(c.tokens);
          const align = c.align ? ` style="text-align:${c.align}"` : "";
          return `<td${align}>${text}</td>`;
        }).join("") + "</tr>"
      ).join("") + "</tbody>";
      return `<div class="doc-table-wrap"><table>${head}${body}</table></div>\n`;
    },
    blockquote({ tokens }) {
      const inner = this.parser.parse(tokens);
      // Detect "**Note:** …", "**Warning:** …", "**Tip:** …" → callout.
      const m = inner.match(/^\s*<p><strong>(Note|Warning|Tip|Внимание|Совет|Замечание)[: ]/i);
      if (m) {
        const kind = m[1].toLowerCase();
        const className = /warn|внимание/.test(kind) ? "warn"
                        : /tip|совет/.test(kind) ? "tip"
                        : "note";
        return `<aside class="doc-callout doc-callout-${className}">${inner}</aside>\n`;
      }
      return `<blockquote>${inner}</blockquote>\n`;
    },
    code({ text, lang }) {
      const escaped = String(text)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const langClass = lang ? ` class="language-${lang}"` : "";
      return `<pre class="doc-code"><code${langClass}>${escaped}</code></pre>\n`;
    },
  },
});

// Build a TOC from h2/h3 only (h1 is the page title).
function _docExtractToc(md) {
  const lines = md.split(/\r?\n/);
  const items = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const depth = m[1].length;
    const text = m[2].replace(/`/g, "").trim();
    items.push({ depth, text, id: _docSlugify(text) });
  }
  return items;
}

function _docHtmlEscape(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _docRenderPage(md, entry) {
  const toc = _docExtractToc(md);
  // Drop the leading H1 from the markdown — we render it ourselves in the
  // page header so the title sits above the TOC sidebar.
  const titleMatch = md.match(/^#\s+(.+?)\s*$/m);
  const pageTitle = titleMatch ? titleMatch[1] : entry.file;
  const mdBody = md.replace(/^#\s+.+?\s*\n+/m, "");
  const bodyHtml = _markedInstance.parse(mdBody);

  const groupLangs = DOC_GROUP_LANGS[entry.group] || {};
  const langSwitcherItems = Object.entries(groupLangs).map(([lang, fn]) => {
    const label = lang === "ru" ? "RU" : lang === "en" ? "EN" : "HE";
    const isActive = entry.file === fn;
    return `<a class="${isActive ? "active" : ""}" href="/docs/${fn}" aria-current="${isActive ? "page" : "false"}">${label}</a>`;
  }).join("");

  const tocHtml = toc.length
    ? "<nav class=\"doc-toc\" aria-label=\"Содержание\">" +
      "<div class=\"doc-toc-title\">" +
      (entry.lang === "en" ? "Contents" : entry.lang === "he" ? "תוכן" : "Содержание") +
      "</div><ul>" +
      toc.map(t => `<li class="doc-toc-h${t.depth}"><a href="#${t.id}">${_docHtmlEscape(t.text)}</a></li>`).join("") +
      "</ul></nav>"
    : "";

  const dir = entry.lang === "he" ? "rtl" : "ltr";
  const htmlLang = entry.lang;

  return `<!doctype html>
<html dir="${dir}" lang="${htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${_docHtmlEscape(pageTitle)} · LinguistPro</title>
<style>
  :root {
    --bg: #0b1220;
    --panel: #111a2e;
    --panel-soft: #15213a;
    --border: #233152;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --heading: #f1f5f9;
    --accent: #60a5fa;
    --accent-hover: #93c5fd;
    --code-bg: #0f172a;
    --note: #38bdf8;
    --tip: #4ade80;
    --warn: #fbbf24;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
  body {
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .doc-topbar {
    position: sticky; top: 0; z-index: 50;
    background: rgba(11, 18, 32, 0.92);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
  }
  .doc-topbar-inner {
    max-width: 1100px; margin: 0 auto;
    display: flex; align-items: center; gap: 16px;
    padding: 10px 16px;
  }
  .doc-back {
    color: var(--muted); text-decoration: none;
    font-size: 14px;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 8px; border-radius: 7px;
    transition: color 120ms, background 120ms;
  }
  .doc-back:hover { color: var(--heading); background: var(--panel-soft); }
  .doc-lang-switcher {
    margin-${dir === "rtl" ? "right" : "left"}: auto;
    display: flex; gap: 4px;
    background: var(--panel); border: 1px solid var(--border);
    padding: 3px; border-radius: 8px;
  }
  .doc-lang-switcher a {
    padding: 4px 10px; border-radius: 6px;
    color: var(--muted); text-decoration: none;
    font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
    transition: color 120ms, background 120ms;
  }
  .doc-lang-switcher a:hover { color: var(--heading); }
  .doc-lang-switcher a.active {
    background: var(--accent); color: #0b1220;
  }
  .doc-layout {
    max-width: 1100px; margin: 0 auto;
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 36px;
    padding: 28px 16px 80px;
  }
  .doc-toc {
    position: sticky; top: 64px; align-self: start;
    max-height: calc(100vh - 88px); overflow: auto;
    padding-${dir === "rtl" ? "left" : "right"}: 12px;
  }
  .doc-toc-title {
    font-size: 12px; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--muted);
    margin-bottom: 10px; padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .doc-toc ul { list-style: none; padding: 0; margin: 0; }
  .doc-toc li { margin: 0; padding: 0; }
  .doc-toc a {
    display: block; padding: 5px 8px;
    color: var(--muted); text-decoration: none;
    font-size: 13.5px; line-height: 1.45;
    border-${dir === "rtl" ? "right" : "left"}: 2px solid transparent;
    border-radius: 0 6px 6px 0;
    transition: color 120ms, background 120ms, border-color 120ms;
  }
  .doc-toc a:hover { color: var(--heading); background: var(--panel-soft); }
  .doc-toc a.active {
    color: var(--accent); border-${dir === "rtl" ? "right" : "left"}-color: var(--accent);
    background: var(--panel-soft);
  }
  .doc-toc-h3 a { padding-${dir === "rtl" ? "right" : "left"}: 22px; font-size: 13px; }
  .doc-content { min-width: 0; }
  .doc-title {
    font-size: 32px; line-height: 1.2; font-weight: 700;
    color: var(--heading); margin: 0 0 24px;
    padding-bottom: 14px; border-bottom: 1px solid var(--border);
    letter-spacing: -0.01em;
  }
  .doc-content h2 {
    font-size: 24px; line-height: 1.25; font-weight: 600;
    color: var(--heading); margin: 40px 0 14px;
    letter-spacing: -0.005em; scroll-margin-top: 80px;
  }
  .doc-content h3 {
    font-size: 18px; line-height: 1.3; font-weight: 600;
    color: var(--heading); margin: 28px 0 10px;
    scroll-margin-top: 80px;
  }
  .doc-content h2, .doc-content h3 { position: relative; }
  .doc-anchor {
    position: absolute;
    ${dir === "rtl" ? "right: -22px" : "left: -22px"};
    color: var(--accent); opacity: 0; text-decoration: none;
    font-weight: 500; transition: opacity 120ms;
  }
  .doc-content h2:hover .doc-anchor, .doc-content h3:hover .doc-anchor { opacity: 1; }
  .doc-content p { margin: 0 0 16px; }
  .doc-content a { color: var(--accent); text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 120ms, color 120ms; }
  .doc-content a:hover { color: var(--accent-hover); border-bottom-color: currentColor; }
  .doc-content ul, .doc-content ol { margin: 0 0 18px; padding-${dir === "rtl" ? "right" : "left"}: 22px; }
  .doc-content li { margin-bottom: 6px; }
  .doc-content li > p { margin-bottom: 6px; }
  .doc-content strong { color: var(--heading); font-weight: 600; }
  .doc-content em { color: var(--text); font-style: italic; }
  .doc-content code {
    background: var(--code-bg); padding: 2px 6px; border-radius: 4px;
    font: 0.92em "SF Mono", Menlo, Consolas, "Courier New", monospace;
    border: 1px solid var(--border); color: #fbbf24;
  }
  .doc-code {
    background: var(--code-bg); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px 16px;
    margin: 18px 0; overflow-x: auto;
    font: 13.5px/1.55 "SF Mono", Menlo, Consolas, "Courier New", monospace;
  }
  .doc-code code { background: none; border: none; padding: 0; color: var(--text); font: inherit; }
  blockquote {
    margin: 18px 0; padding: 12px 18px;
    border-${dir === "rtl" ? "right" : "left"}: 3px solid var(--border);
    color: var(--muted); background: var(--panel-soft);
    border-radius: 0 8px 8px 0;
  }
  blockquote p:last-child { margin-bottom: 0; }
  .doc-callout {
    margin: 22px 0; padding: 14px 18px;
    border-radius: 10px; background: var(--panel);
    border: 1px solid var(--border);
    border-${dir === "rtl" ? "right" : "left"}-width: 4px;
    position: relative;
  }
  .doc-callout p:last-child { margin-bottom: 0; }
  .doc-callout-note  { border-${dir === "rtl" ? "right" : "left"}-color: var(--note); }
  .doc-callout-tip   { border-${dir === "rtl" ? "right" : "left"}-color: var(--tip); }
  .doc-callout-warn  { border-${dir === "rtl" ? "right" : "left"}-color: var(--warn); }
  .doc-callout strong { color: var(--heading); }
  .doc-table-wrap {
    margin: 18px 0; overflow-x: auto;
    border: 1px solid var(--border); border-radius: 10px;
  }
  .doc-table-wrap table {
    width: 100%; border-collapse: collapse;
    font-size: 14.5px;
  }
  .doc-table-wrap th, .doc-table-wrap td {
    padding: 10px 14px;
    text-align: ${dir === "rtl" ? "right" : "left"};
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  .doc-table-wrap th {
    background: var(--panel-soft); color: var(--heading);
    font-weight: 600; letter-spacing: 0.02em;
    border-bottom: 2px solid var(--border);
  }
  .doc-table-wrap tr:last-child td { border-bottom: none; }
  .doc-table-wrap tr:nth-child(even) td { background: rgba(21, 33, 58, 0.4); }
  hr { border: none; height: 1px; background: var(--border); margin: 36px 0; }

  @media (max-width: 900px) {
    .doc-layout {
      grid-template-columns: 1fr;
      gap: 20px;
      padding: 18px 14px 60px;
    }
    .doc-toc {
      position: static; max-height: none;
      padding: 14px 16px;
      background: var(--panel); border: 1px solid var(--border);
      border-radius: 12px;
    }
    .doc-title { font-size: 24px; }
    .doc-content h2 { font-size: 20px; margin-top: 28px; }
    .doc-content h3 { font-size: 17px; margin-top: 20px; }
    .doc-anchor { display: none; }
  }
  @media print {
    body { background: white; color: black; }
    .doc-topbar, .doc-toc { display: none; }
    .doc-content a { color: black; border-bottom: 1px dotted; }
    .doc-callout, blockquote, .doc-code, .doc-table-wrap { background: #f5f5f5; border: 1px solid #ccc; color: black; }
  }
</style>
</head>
<body>
<header class="doc-topbar">
  <div class="doc-topbar-inner">
    <a class="doc-back" href="/" aria-label="${entry.lang === "en" ? "Back to app" : entry.lang === "he" ? "חזרה לאפליקציה" : "Назад в приложение"}">
      <span aria-hidden="true">${dir === "rtl" ? "→" : "←"}</span>
      <span>${entry.lang === "en" ? "Back to app" : entry.lang === "he" ? "לאפליקציה" : "К приложению"}</span>
    </a>
    ${Object.keys(groupLangs).length > 1 ? `<div class="doc-lang-switcher" role="group" aria-label="Language">${langSwitcherItems}</div>` : ""}
  </div>
</header>
<div class="doc-layout">
  ${tocHtml}
  <main class="doc-content">
    <h1 class="doc-title">${_docHtmlEscape(pageTitle)}</h1>
    <article>${bodyHtml}</article>
  </main>
</div>
<script>
  // Scroll-spy: highlight the TOC entry matching the section currently in view.
  (function () {
    const links = document.querySelectorAll(".doc-toc a");
    if (!links.length || !("IntersectionObserver" in window)) return;
    const linkById = new Map();
    links.forEach(a => { const id = a.getAttribute("href").slice(1); if (id) linkById.set(id, a); });
    const headings = Array.from(document.querySelectorAll(".doc-content h2[id], .doc-content h3[id]"));
    let activeId = null;
    function setActive(id) {
      if (id === activeId) return;
      activeId = id;
      links.forEach(a => a.classList.remove("active"));
      const a = linkById.get(id);
      if (a) a.classList.add("active");
    }
    const io = new IntersectionObserver((entries) => {
      // Pick the first heading whose top is near the viewport top.
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.target.offsetTop - b.target.offsetTop);
      if (visible.length) setActive(visible[0].target.id);
    }, { rootMargin: "-72px 0px -70% 0px" });
    headings.forEach(h => io.observe(h));
  })();
</script>
</body>
</html>`;
}

app.get("/docs/:file", (req, res) => {
  const entry = DOCS_WHITELIST[req.params.file];
  if (!entry) return res.status(404).type("text").send("Not found");
  let md;
  try {
    md = require("fs").readFileSync(path.join(__dirname, "docs", entry.file), "utf8");
  } catch (_) {
    return res.status(404).type("text").send("Not found");
  }
  try {
    res.type("html").send(_docRenderPage(md, entry));
  } catch (e) {
    console.error("[docs] render failed for", entry.file, e && e.message);
    res.status(500).type("text").send("Render error");
  }
});

// Serve design mockups (HTML/CSS prototypes) so we can review them on
// real devices before wiring into the app. Mounted at /mockups/* so the
// path is self-explanatory and easy to remove when no longer needed.
app.use("/mockups", express.static(path.join(__dirname, "mockups")));

// Rolling deploys may briefly route /api and static files to different
// containers. The service worker verifies these content hashes before it
// activates a new shell cache, so a mixed release fails closed and retries.
const SHELL_INTEGRITY_PATHS = [
  "/library.html",
  "/js/library-ui.js?v=461",
  "/js/train-queue.js?v=461",
  "/js/retention-report.js?v=461",
  "/js/corpus-item-presenter.js?v=419",
  "/css/publication-center.css?v=415",
  "/js/publication-center.js?v=415",
  "/js/public-corpus-adapter.js?v=421",
  "/js/reader-morph.js?v=452",
  "/js/public-word-audio.js?v=453",
  "/js/morph-host.js?v=416",
  "/js/room-b6-core.js",
  "/db/local-db.js",
  "/js/mentor-connection-core.js?v=414",
  "/js/mentor-home.js?v=414",
  "/js/reader-core.js?v=401",
  "/css/reader-core.css?v=399",
  "/css/reader-morph.css?v=394",
  "/js/media-host.js?v=403",
  "/js/lesson-artifact.js",
  "/js/table-niqqud-normalizer.js?v=429",
  "/i18n/locales/ru.js?v=195",
  "/i18n/locales/en.js?v=195",
  "/i18n/locales/he.js?v=195",
];
let shellIntegrityCache = null;
function shellIntegrity() {
  if (shellIntegrityCache) return shellIntegrityCache;
  const out = {};
  for (const url of SHELL_INTEGRITY_PATHS) {
    // Integrity keys must be byte-for-byte identical to the precache request
    // keys, including their release query. The filesystem lookup uses only
    // the URL pathname; otherwise "?v=..." becomes part of the filename and
    // makes every cache-busted worker install fail closed forever.
    const pathname = new URL(url, "http://linguistpro.local").pathname;
    const file = path.join(__dirname, "public", ...pathname.slice(1).split("/"));
    out[url] = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  }
  shellIntegrityCache = Object.freeze(out);
  return shellIntegrityCache;
}

// App version shown to the client (About modal + footer) — single source of
// truth is CACHE_VERSION in public/sw.js, the value the Service Worker itself
// ships. package.json's "version" field is NOT touched at deploy time and
// systematically drifted behind the real shipped build (2026-07-29:
// package.json said 3.11.241 while prod was already on 3.11.261) — the
// About-modal version display silently lied to the owner and blocked SW
// update-verification. Read sw.js ONCE at server start; fall back to
// package.json only if that read/parse fails.
function resolveAppVersion() {
  try {
    const swSource = fs.readFileSync(path.join(__dirname, "public", "sw.js"), "utf8");
    // Anchored on `const CACHE_VERSION` (S12.4 fix1 M1): the loose /CACHE_VERSION\s*=…/ also
    // matched the SUFFIX of other declarations — public/sw.js also ships GRAPH_CACHE_VERSION
    // ("v3.3.6-1", versioned independently of the shell). It only worked by accident of line
    // order; reordering the file would have made the server report a foreign version, silently.
    const m = swSource.match(/\bconst\s+CACHE_VERSION\s*=\s*"v?([^"]+)"/);
    if (m && m[1]) return m[1];
    throw new Error("CACHE_VERSION pattern not found in public/sw.js");
  } catch (err) {
    console.warn(
      "[client-config] could not derive version from public/sw.js CACHE_VERSION, " +
        "falling back to package.json version:",
      err && err.message
    );
    try {
      const pkg = require("./package.json");
      if (pkg && pkg.version) return String(pkg.version);
    } catch (_) {}
    return "3.0.0";
  }
}
const RESOLVED_APP_VERSION = resolveAppVersion();

app.get("/api/client-config", (_req, res) => {
  const ttsEnabledRaw = String(process.env.TTS_ENABLED || "true").trim().toLowerCase();
  const debugDiagnosticsRaw = String(process.env.TTS_DEBUG_DIAGNOSTICS || "").trim().toLowerCase();
  const allowSystemFallbackRaw = String(process.env.TTS_ALLOW_SYSTEM_FALLBACK || "true").trim().toLowerCase();
  const preferredBackendRaw = String(process.env.TTS_PREFERRED_BACKEND || "web_wasm").trim();
  const webWasmEnabledRaw = String(process.env.TTS_WEB_WASM_ENABLED || "false").trim().toLowerCase();
  const preloadRaw = String(process.env.TTS_PRELOAD || "false").trim().toLowerCase();
  const modelStagingRequiredRaw = String(process.env.TTS_MODEL_STAGING_REQUIRED || "true").trim().toLowerCase();
  const cacheEnabledRaw = String(process.env.TTS_CACHE_ENABLED || "true").trim().toLowerCase();
  const runtimePathRaw = String(process.env.TTS_WEB_WASM_RUNTIME_PATH || "/tts/runtime/sherpa-onnx").trim();
  const cacheMaxMbRaw = Number(process.env.TTS_CACHE_MAX_MB || "250");
  const hebrewLocalExperimentalRaw = String(process.env.TTS_HEBREW_LOCAL_EXPERIMENTAL || "false").trim().toLowerCase();
  const hebrewLocalLicenseMode = String(process.env.TTS_HEBREW_LOCAL_LICENSE_MODE || "research_only").trim().toLowerCase() || "research_only";

  const enabled = !(ttsEnabledRaw === "false" || ttsEnabledRaw === "0" || ttsEnabledRaw === "off");
  const debugDiagnostics =
    debugDiagnosticsRaw
      ? !(debugDiagnosticsRaw === "false" || debugDiagnosticsRaw === "0" || debugDiagnosticsRaw === "off")
      : (process.env.NODE_ENV !== "production");
  const allowSystemFallback = !(
    allowSystemFallbackRaw === "false" ||
    allowSystemFallbackRaw === "0" ||
    allowSystemFallbackRaw === "off"
  );
  const webWasmEnabled = !(
    webWasmEnabledRaw === "false" ||
    webWasmEnabledRaw === "0" ||
    webWasmEnabledRaw === "off"
  );
  const preload = !(
    preloadRaw === "false" ||
    preloadRaw === "0" ||
    preloadRaw === "off"
  );
  const modelStagingRequired = !(
    modelStagingRequiredRaw === "false" ||
    modelStagingRequiredRaw === "0" ||
    modelStagingRequiredRaw === "off"
  );
  const cacheEnabled = !(
    cacheEnabledRaw === "false" ||
    cacheEnabledRaw === "0" ||
    cacheEnabledRaw === "off"
  );
  const hebrewLocalExperimentalEnabled = !(
    hebrewLocalExperimentalRaw === "false" ||
    hebrewLocalExperimentalRaw === "0" ||
    hebrewLocalExperimentalRaw === "off"
  );

  // D5: kill switch — set KILL_LOCAL_MODE=1 in Railway to force every
  // client back to server mode at next page load (within the cache TTL).
  // No app deploy needed; the client polls /api/client-config at boot
  // and obeys this flag before any LOCAL_MODE-dependent code runs.
  const killLocalModeRaw = String(process.env.KILL_LOCAL_MODE || "0").trim().toLowerCase();
  const killLocalMode = killLocalModeRaw === "1" || killLocalModeRaw === "true" || killLocalModeRaw === "on";
  // Wave 2 C3a — runtime rollback for browser-owned voice-to-editable-text.
  // Default-on; false/0/off removes only the microphone affordance and leaves
  // the existing text role-play untouched.
  const c3aVoiceRaw = String(process.env.C3A_VOICE_ENABLED || "true").trim().toLowerCase();
  const c3aVoiceEnabled = !(c3aVoiceRaw === "false" || c3aVoiceRaw === "0" || c3aVoiceRaw === "off");
  // C1-X — visible product entry point for the loopback-only pronunciation lab.
  // Default-on under the explicit owner decision; false/0/off is the complete
  // production rollback because the companion has no server or learner-state authority.
  const c1ExperimentalRaw = String(process.env.C1_EXPERIMENTAL_ENABLED || "true").trim().toLowerCase();
  const c1ExperimentalEnabled = !(
    c1ExperimentalRaw === "false" || c1ExperimentalRaw === "0" || c1ExperimentalRaw === "off"
  );
  // Windows Local ASR invite-only beta. Default-off is intentional: this is a
  // staged exposure seam, not an entitlement or a provider-default switch.
  const localAsrBetaRaw = String(process.env.LOCAL_ASR_BETA_ENABLED || "false").trim().toLowerCase();
  const localAsrBetaEnabled = !(
    localAsrBetaRaw === "false" || localAsrBetaRaw === "0" || localAsrBetaRaw === "off"
  );
  const localAsrDownloadRaw = String(process.env.LOCAL_ASR_COMPANION_DOWNLOAD_URL || "").trim();
  const localAsrCompanionDownloadUrl =
    (/^https:\/\//i.test(localAsrDownloadRaw) || (/^\/(?!\/)/.test(localAsrDownloadRaw)))
      ? localAsrDownloadRaw
      : "";
  // Studio L4 MADLAD invite beta. This exposure gate is independent from
  // ASR enrollment even though both capabilities share one Companion token.
  const localMtBetaRaw = String(process.env.LOCAL_MT_BETA_ENABLED || "false").trim().toLowerCase();
  const localMtBetaEnabled = !(
    localMtBetaRaw === "false" || localMtBetaRaw === "0" || localMtBetaRaw === "off"
  );

  // Feedback config — phone number for WhatsApp deep-link / QR, plus
  // typical response time used in the WOW card. Both are environment-
  // driven so contact info changes don't require an app deploy.
  // Phone format: digits only, no '+', no dashes/spaces (wa.me convention).
  const developerWhatsappPhoneRaw = String(process.env.DEVELOPER_WHATSAPP_PHONE || "972535536175").replace(/[^0-9]/g, "");
  const developerEmail = String(process.env.DEVELOPER_EMAIL || "sindromradiospb@gmail.com").trim();
  const developerGithub = String(process.env.DEVELOPER_GITHUB_REPO || "SindromRadioSpb/tts-prototype-android").trim();
  const responseTimeHours = Number(process.env.DEVELOPER_RESPONSE_TIME_HOURS || "4");

  // App version surfaced to the client About modal and footer. Resolved
  // once at server start from public/sw.js CACHE_VERSION — see
  // resolveAppVersion() above for why (package.json drift).
  const appVersion = RESOLVED_APP_VERSION;

  return res.json({
    ok: true,
    version: appVersion,
    shellIntegrity: shellIntegrity(),
    tts: {
      enabled,
      provider: "online_tts",
      preferredBackend: preferredBackendRaw || "web_wasm",
      webWasmEnabled,
      webWasmRuntimePath: runtimePathRaw || "/tts/runtime/sherpa-onnx",
      allowSystemFallback,
      preload,
      modelStagingRequired,
      cacheEnabled,
      hebrewLocalExperimentalEnabled,
      hebrewLocalLicenseMode,
      maxChars: 2000,
      cacheMaxMb: Number.isFinite(cacheMaxMbRaw) && cacheMaxMbRaw > 0 ? cacheMaxMbRaw : 250,
      defaultSpeed: 1.0,
      debugDiagnostics
    },
    flags: {
      killLocalMode,
      c3aVoiceEnabled,
      c1ExperimentalEnabled,
      localAsrBetaEnabled,
      localMtBetaEnabled,
    },
    localAsr: {
      beta: localAsrBetaEnabled,
      companionDownloadUrl: localAsrBetaEnabled ? localAsrCompanionDownloadUrl : "",
      supportedBrowsers: ["Chrome"],
      supportedOs: "Windows 11",
      firefoxSupported: false,
    },
    gemini: {
      model: GEMINI_STUDIO_MODEL,
      structuredOutput: true,
      semanticValidation: true,
    },
    localMt: {
      beta: localMtBetaEnabled,
      supportedBrowsers: ["Chrome"],
      supportedOs: "Windows 11",
      gpu: "NVIDIA CUDA, 8 GB VRAM minimum",
      runtimeBytes: 10739625126,
      draftQuality: "LIMITED EVIDENCE / NO BILINGUAL HUMAN VALIDATION",
    },
    feedback: {
      whatsappPhone: developerWhatsappPhoneRaw,
      email: developerEmail,
      githubRepo: developerGithub,
      responseTimeHours: Number.isFinite(responseTimeHours) && responseTimeHours > 0 ? responseTimeHours : 4,
    },
  });
});

app.get("/api/tts/hebrew-local/health", async (_req, res) => {
  const licenseMode = getHebrewLocalLicenseMode();
  const licenseStatus = HEBREW_TTS_LICENSE_MODES_ALLOWED.has(licenseMode)
    ? (licenseMode === "noncommercial" ? "noncommercial_allowed" : "research_only")
    : "license_mode_blocked";

  if (!isHebrewLocalExperimentalEnabled()) {
    return res.json({
      status: "disabled",
      provider: HEBREW_TTS_PROVIDER,
      licenseMode,
      licenseStatus,
      voices: ["shaul"],
      modelLoaded: false,
      phonikudReady: false,
      piperReady: false
    });
  }

  if (HEBREW_TTS_LICENSE_MODES_BLOCKED.has(licenseMode)) {
    return res.json({
      status: "blocked",
      provider: HEBREW_TTS_PROVIDER,
      licenseMode,
      licenseStatus,
      voices: ["shaul"],
      modelLoaded: false,
      phonikudReady: false,
      piperReady: false
    });
  }

  const health = await hebrewTtsClient.healthz();
  if (!health.ok || !health.body) {
    return res.status(503).json({
      status: "unavailable",
      provider: HEBREW_TTS_PROVIDER,
      licenseMode,
      licenseStatus,
      voices: ["shaul"],
      modelLoaded: false,
      phonikudReady: false,
      piperReady: false,
      error: health.error || "sidecar_unavailable"
    });
  }

  return res.json(Object.assign({}, health.body, {
    provider: HEBREW_TTS_PROVIDER,
    licenseMode: health.body.licenseMode || licenseMode,
    licenseStatus: health.body.licenseStatus || licenseStatus
  }));
});

// --------------------------------------------------------
// 2.1 DB_PATH (SQLite) — safe init; process must not crash on DB errors
// --------------------------------------------------------
// Fire-and-forget; errors are reflected in /healthz.

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(__dirname, "migrations");

initDb(DB_PATH)
  .then(() => runMigrations({ migrationsDir: MIGRATIONS_DIR }))
  .then(async () => {
    // PATCH B: schema guard for duration_ms (idempotent, non-fatal)
    try {
      const r = await ensureAudioAssetsDurationMsColumn();
      if (r && r.ok === false && !r.skipped) {
        console.warn("[db] ensureAudioAssetsDurationMsColumn failed (non-fatal):", r);
      }
    } catch (e) {
      console.warn("[db] ensureAudioAssetsDurationMsColumn threw (non-fatal):", e && e.message);
    }

    // DATA-PROTECT-01: startup integrity check (non-blocking)
    try {
      const { getDb } = require("./db/sqlite");
      const db = getDb();
      await startupCheck(db);
    } catch (e) {
      console.warn("[db] startupCheck failed (non-fatal):", e && e.message);
    }

    // B7: immutable protected corpora are corpus-prepared before owner browse;
    // this is a bounded, content-free Worker projection and never learner data.
    try {
      const warm = await require("./db/groupCorpusRepo").prewarmLearningIndexes();
      console.log(`[b7] protected learning indexes: ${warm.prepared}/${warm.corpora} corpora · ${warm.works} works`);
      if (warm.failures.length) console.warn("[b7] protected learning index failures:", warm.failures);
    } catch (e) {
      console.warn("[b7] protected learning index prewarm failed (request fallback remains):", e && e.message);
    }
    try {
      const warm = await require("./db/publicationRepo").getPublicationRepo().prewarmPublicLearningIndexes();
      console.log(`[b7] public learning indexes: ${warm.prepared}/${warm.corpora} corpora · ${warm.works} works`);
      if (warm.failures.length) console.warn("[b7] public learning index failures:", warm.failures);
    } catch (e) {
      console.warn("[b7] public learning index prewarm failed (request fallback remains):", e && e.message);
    }
  })
  .catch((e) => {
    // initDb уже safe и отражает ошибку в health; сюда обычно не попадаем
    console.error("initDb unexpected error:", e);
  });

// --------------------------------------------------------
// 3. ПУТИ И ДИРЕКТОРИИ
// --------------------------------------------------------
const audioDir = path.join(__dirname, "audio"); // если это статика/ассеты репо — оставляем
const usageFile = USAGE_FILE;
const audioCacheDir = AUDIO_CACHE_DIR;
const geminiCacheDir = GEMINI_CACHE_DIR;
const hebrewLocalCacheDir = path.join(audioCacheDir, "hebrew-local");
const HEBREW_TTS_PROVIDER = "hebrew_phonikud_piper";
const HEBREW_TTS_LICENSE_MODES_ALLOWED = new Set(["research_only", "noncommercial"]);
const HEBREW_TTS_LICENSE_MODES_BLOCKED = new Set(["commercial", "premium_commercial"]);

// --------------------------------------------------------
// V3 Audio Assets helpers (P0)
// --------------------------------------------------------
// The content-addressed asset-key cluster lives in db/premium/ttsAssetKey.js so
// the offline canon-audio bake (BRR-P0-007) computes byte-identical keys. Keep
// these names in local scope — they're referenced throughout this file.
const {
  TTS_ENGINE_VERSION,
  stableStringify,
  normalizeTtsProfile,
  computeAssetKey,
  getAudioRelativePath,
} = require("./db/premium/ttsAssetKey");

// BRR-P1-008c — word-level timepoints synth (GCP v1beta1 SSML <mark>), reused from the canon-bake
// lib. DB-free, key-from-arg; require-safe in Node (its reader-morph/ttsAssetKey deps already load
// under the smoke harness). Used only by ensureAudioAssetWithTiming (opt-in /api/tts withTimepoints).
const { synthesizeWithTimepoints, utf8Len: ttsUtf8Len } = require("./scripts/premium/lib/ttsBake");

function ensureAudioCacheDir() {
  try {
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
    if (!fs.existsSync(audioCacheDir)) fs.mkdirSync(audioCacheDir, { recursive: true });
    if (!fs.existsSync(hebrewLocalCacheDir)) fs.mkdirSync(hebrewLocalCacheDir, { recursive: true });
  } catch (e) {
    console.error("ensureAudioCacheDir failed:", e);
  }
}

function writeMp3IfNotExists(absPath, mp3Buffer) {
  try {
    // Atomic create: avoids partial writes / races on concurrent requests.
    const fd = fs.openSync(absPath, "wx"); // throws EEXIST if already created
    try {
      fs.writeFileSync(fd, mp3Buffer);
    } finally {
      try { fs.closeSync(fd); } catch (_) {}
    }
    return { written: true };
  } catch (e) {
    if (e && e.code === "EEXIST") return { written: false };
    console.error("writeMp3IfNotExists failed:", e);
    return { written: false, error: String(e && e.message ? e.message : e) };
  }
}

function probeMp3DurationMs(absPath) {
  return new Promise((resolve) => {
    try {
      if (!absPath || typeof absPath !== "string") return resolve(null);
      if (!fs.existsSync(absPath)) return resolve(null);

      // ffprobe must be available in PATH (ffmpeg install). Best-effort only.
      const args = [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        absPath,
      ];

      execFile("ffprobe", args, { windowsHide: true }, (err, stdout, stderr) => {
        try {
          if (err) {
            // Do not spam logs too much; keep it compact.
            console.warn("[v3-audio] ffprobe failed (duration_ms stays null)", {
              code: err.code,
              message: err.message,
            });
            return resolve(null);
          }

          const raw = String(stdout || "").trim();
          if (!raw) return resolve(null);

          const sec = Number(raw);
          if (!Number.isFinite(sec) || sec <= 0) return resolve(null);

          const ms = Math.max(0, Math.round(sec * 1000));
          return resolve(ms);
        } catch (_) {
          return resolve(null);
        }
      });
    } catch (_) {
      return resolve(null);
    }
  });
}

// --------------------------------------------------------
// 3.1 HEALTHZ (always 200; db status is informative)
// --------------------------------------------------------
// CLG-P1 — disk watermark for the DATA volume (recon §9 CLG-P1 / §11: диск-алёрт с порога
// ~80% уже в P1 — урок инцидента 100%-диска 2026-07-04). Percentage only (no paths leaked);
// UptimeRobot keyword-monitoring can alert on `"disk_warn":true`. Sampled at most once/min;
// fs.statfs may be absent on old Node → null (never breaks liveness).
const DISK_WARN_PCT = 80;
let _diskSample = { at: 0, pctUsed: null };
async function sampleDiskPct() {
  const now = Date.now();
  if (now - _diskSample.at < 60_000) return _diskSample.pctUsed;
  _diskSample.at = now;
  try {
    const s = await fs.promises.statfs(DATA_DIR);
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize);
    _diskSample.pctUsed = total > 0 ? Math.round((1 - free / total) * 100) : null;
  } catch (_) { _diskSample.pctUsed = null; }
  return _diskSample.pctUsed;
}
app.get("/healthz", async (req, res) => {
  const diskPct = await sampleDiskPct();
  res.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    now: new Date().toISOString(),
    // Liveness only — do NOT leak internal paths (dataDir/dbPath/backupsDir) or
    // the migration inventory to unauthenticated callers. UptimeRobot needs ok=200;
    // detailed health lives behind the admin token / /api/diag for the operator.
    db: { ready: getDbHealth().ready === true },
    migrations: { ready: getMigrationsHealth().ready === true },
    disk_pct_used: diskPct,
    disk_warn: diskPct != null && diskPct >= DISK_WARN_PCT,
  });
});

app.get("/api/tts/key", (_req, res) => {
  try {
    // Privacy (INFO-LEAK-1): do not expose the service-account identity
    // (project_id/client_email) to unauthenticated callers — only whether a key
    // is configured + its source. The status UI degrades gracefully without them.
    const s = getTtsKeyStatusSummary() || {};
    res.json({ configured: !!s.configured, source: s.source || null });
  } catch (e) {
    res.status(500).json({ error: "Не удалось прочитать статус TTS ключа", details: e.message });
  }
});

// Admin-gated: BYOK is the default user flow (per-request key in localStorage),
// so this server-wide upload endpoint must require an operator token. Without
// RESEARCH_ADMIN_TOKEN configured the endpoint is disabled entirely.
function requireAdminToken(req, res) {
  const adminSecret = process.env.RESEARCH_ADMIN_TOKEN || "";
  if (!adminSecret) {
    res.status(503).json({ error: "ADMIN_DISABLED", message: "Server-wide key upload is disabled. Set RESEARCH_ADMIN_TOKEN to enable." });
    return false;
  }
  const provided = (req.body && req.body.admin_token) || req.get("X-Admin-Token") || "";
  const a = Buffer.from(String(provided), "utf8");
  const b = Buffer.from(adminSecret, "utf8");
  let ok = false;
  if (a.length === b.length) {
    try { ok = crypto.timingSafeEqual(a, b); } catch (_) { ok = false; }
  } else {
    // Run a same-length compare to keep timing flat.
    try { crypto.timingSafeEqual(b, b); } catch (_) {}
  }
  if (!ok) {
    res.status(403).json({ error: "BAD_ADMIN_TOKEN" });
    return false;
  }
  return true;
}

// BRR-P0-010 — /api/audio/cache/upload is a server-wide WRITE into the shared
// audio cache (reader-core tier-1 serves it KEYLESS to every reader). It must NOT
// be writable anonymously. The previous gate (v3AudioPrefetchIsAllowed) honoured an
// `X-Local-Mode: 1` header from ANY remote client — so anyone could pre-seed or
// disk-fill the prod cache. This gate requires an operator token instead. Decision
// logic lives in the pure, unit-tested db/premium/audioUploadAuth.js.
const { decideAudioUploadAuth } = require("./db/premium/audioUploadAuth");

// Defence-in-depth: a tight, SEPARATE brute-force bound on FAILED upload-token
// attempts. rlAudioUpload (2000/min) is sized for legit bulk ZIP imports and is far
// too loose for secret guessing; this caps wrong-token attempts per IP (cf. the
// tight rlResearchAdmin cap). Success / loopback-dev / disabled never count here.
// Primary defence remains a high-entropy AUDIO_UPLOAD_TOKEN (>=32 random bytes).
const AUDIO_UPLOAD_AUTHFAIL_WINDOW_MS = 600_000; // 10 min
const AUDIO_UPLOAD_AUTHFAIL_MAX = 20;
const _audioUploadAuthFails = new Map(); // ip -> [timestamps]
function _audioUploadAuthFailsFresh(ip, now) {
  const arr = (_audioUploadAuthFails.get(ip) || []).filter((t) => now - t < AUDIO_UPLOAD_AUTHFAIL_WINDOW_MS);
  // Bound memory under a unique-IP flood (mirrors makeRateLimiter's sweep).
  if (_audioUploadAuthFails.size > 5000) {
    for (const [k, v] of _audioUploadAuthFails) {
      const keep = v.filter((t) => now - t < AUDIO_UPLOAD_AUTHFAIL_WINDOW_MS);
      if (keep.length === 0) _audioUploadAuthFails.delete(k);
      else if (keep.length !== v.length) _audioUploadAuthFails.set(k, keep);
    }
  }
  return arr;
}
function audioUploadAuthFailExceeded(ip) {
  const now = Date.now();
  const arr = _audioUploadAuthFailsFresh(ip, now);
  _audioUploadAuthFails.set(ip, arr);
  return arr.length >= AUDIO_UPLOAD_AUTHFAIL_MAX;
}
function audioUploadAuthFailRecord(ip) {
  const now = Date.now();
  const arr = _audioUploadAuthFailsFresh(ip, now);
  arr.push(now);
  _audioUploadAuthFails.set(ip, arr);
}

// Owner-token gate for /api/audio/cache/upload. Writes the 4xx/5xx response and
// returns false when not authorized; returns true to proceed. When AUDIO_UPLOAD_TOKEN
// is set, ONLY a matching X-Audio-Upload-Token authorizes — even from loopback — so
// no Traefik/X-Forwarded-For behaviour is load-bearing. When unset: loopback-only
// (pure dev), remote → 503 disabled (fail-closed). timingSafeStrEqual /
// ankiIsLocalHttpRequest are hoisted function declarations (defined later in file).
function requireAudioUploadAuth(req, res) {
  const secret = process.env.AUDIO_UPLOAD_TOKEN || "";
  const secretSet = !!secret;
  const ip = req.ip || "unknown";
  // Bound brute force before running any compare.
  if (secretSet && audioUploadAuthFailExceeded(ip)) {
    res.set("Retry-After", String(Math.ceil(AUDIO_UPLOAD_AUTHFAIL_WINDOW_MS / 1000)));
    res.status(429).json({ ok: false, error: "TOO_MANY_AUTH_FAILURES" });
    return false;
  }
  const provided = req.get("X-Audio-Upload-Token") || (req.body && req.body.upload_token) || "";
  const tokenMatches = secretSet && timingSafeStrEqual(provided, secret);
  const isLoopback = (typeof ankiIsLocalHttpRequest === "function") && ankiIsLocalHttpRequest(req);
  const verdict = decideAudioUploadAuth({ secretSet, tokenMatches, isLoopback });
  if (verdict.authorized) return true;
  if (verdict.error === "BAD_UPLOAD_TOKEN") audioUploadAuthFailRecord(ip);
  res.status(verdict.status).json({ ok: false, error: verdict.error, message: verdict.message });
  return false;
}

// ============================================================================
// CLG-P1 — Identity & Account (AI_MENTOR_RECON_2026_07_04.md §9 CLG-P1, §13.1).
// Owner-only bootstrap login on a FULL multi-tenant schema (migration 020):
// every future learner endpoint derives user_id ONLY from the validated session
// (recon §6 B2 — a caller-supplied user_id is never authorization).
//
// Cookie model: lp_session = "<sessionId>.<secret>" (secret 256 bit, stored as
// sha256), HttpOnly + SameSite=Lax + Secure (behind Traefik). CSRF: every
// cookie-authenticated MUTATION requires X-LP-CSRF == the session's csrf_token
// (double-submit; the old server.js "no sessions → no CSRF" invariant is retired
// for THESE routes — the header-token endpoints stay CSRF-immune by construction,
// and no pre-existing endpoint reads this cookie, so none becomes vulnerable).
//
// Bootstrap secret: AUTH_BOOTSTRAP_SECRET env, ≥22 chars (~128 bit) enforced
// fail-closed; accepted ONLY from the POST body (never query/header → never in
// access logs); timing-safe compare; tight per-IP fail limiter FROM DAY ONE
// (recon: rate limits обязательны с введения каждого публичного эндпоинта).
// ============================================================================
const identityRepo = require("./db/identityRepo");
const channelLinkRepo = require("./db/channelLinkRepo");   // CLG-P7.1a Telegram channel state
const agentChallengeRepo = require("./db/agentChallengeRepo");   // CLG-P7.2a challenge-binding state
const AUTH_BOOTSTRAP_MIN_LEN = 22;
const AUTH_FAIL_WINDOW_MS = 600_000; // 10 min
const AUTH_FAIL_MAX = 10;            // tighter than audio-upload's 20: login is pure secret-guessing surface
const _authFails = new Map();        // ip -> [timestamps] (same bounded-sweep pattern as _audioUploadAuthFails)
function _authFailsFresh(ip, now) {
  const arr = (_authFails.get(ip) || []).filter((t) => now - t < AUTH_FAIL_WINDOW_MS);
  if (_authFails.size > 5000) {
    for (const [k, v] of _authFails) {
      const keep = v.filter((t) => now - t < AUTH_FAIL_WINDOW_MS);
      if (keep.length === 0) _authFails.delete(k);
      else if (keep.length !== v.length) _authFails.set(k, keep);
    }
  }
  return arr;
}
function authFailExceeded(ip) {
  const now = Date.now();
  const arr = _authFailsFresh(ip, now);
  _authFails.set(ip, arr);
  return arr.length >= AUTH_FAIL_MAX;
}
function authFailRecord(ip) {
  const now = Date.now();
  const arr = _authFailsFresh(ip, now);
  arr.push(now);
  _authFails.set(ip, arr);
}

function getSessionCookie(req) {
  const h = String(req.headers.cookie || "");
  for (const part of h.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() === "lp_session") {
      try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch (_) { return part.slice(eq + 1).trim(); }
    }
  }
  return "";
}
function setSessionCookie(req, res, value, maxAgeSec) {
  const secure = req.secure || req.get("x-forwarded-proto") === "https";
  res.append("Set-Cookie",
    `lp_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}; Max-Age=${Math.max(0, maxAgeSec | 0)}`);
}

// Session gate: writes 401 and returns null when unauthenticated.
async function requireUser(req, res) {
  const auth = await identityRepo.validateSession(getSessionCookie(req)).catch(() => null);
  if (!auth) { res.status(401).json({ ok: false, error: "UNAUTHENTICATED" }); return null; }
  return auth;
}
// CSRF gate for cookie-authenticated mutations (double-submit header).
function requireCsrf(req, res, auth) {
  const provided = String(req.get("X-LP-CSRF") || "");
  if (!provided || !timingSafeStrEqual(provided, String(auth.session.csrf || ""))) {
    res.status(403).json({ ok: false, error: "BAD_CSRF" });
    return false;
  }
  return true;
}

// RMA-1/RMA-2 — the Node application mints only a short-lived capability. It never
// resolves upstream media, receives a signed CDN URL, downloads bytes or proxies a stream.
const rlMediaAcquisitionCapability = makeRateLimiter({
  windowMs: 60_000,
  max: 20,
  name: "media-acquisition-capability",
});
function mediaAcquisitionOrigin(req) {
  return `${req.protocol || "https"}://${String(req.headers.host || "").trim()}`;
}
function mediaAcquisitionToken(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body, "ascii").digest("base64url");
  return `${body}.${signature}`;
}
function mediaAcquisitionPublicUrl() {
  const value = String(process.env.MEDIA_ACQUISITION_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (!value) return "";
  try {
    const parsed = new URL(value);
    const local = parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname);
    if (!(parsed.protocol === "https:" || (process.env.NODE_ENV !== "production" && local))) return "";
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return "";
    const pathname = parsed.pathname.replace(/\/$/, "");
    return parsed.origin + (pathname === "/" ? "" : pathname);
  } catch (_) { return ""; }
}
app.post("/api/media-acquisition/capability", rlMediaAcquisitionCapability, requireStrictSameOriginJson, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const roles = new Set(String(process.env.MEDIA_ACQUISITION_ALLOWED_ROLES || "owner")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (!roles.has(String(auth.user.role || "").toLowerCase())) {
    return res.status(403).json({ ok: false, error: "MEDIA_ACQUISITION_ROLE_FORBIDDEN" });
  }
  const secret = String(process.env.MEDIA_ACQUISITION_SHARED_SECRET || "");
  const workerUrl = mediaAcquisitionPublicUrl();
  if (secret.length < 32 || !workerUrl) {
    return res.status(503).json({ ok: false, error: "MEDIA_ACQUISITION_DISABLED" });
  }
  const now = Math.floor(Date.now() / 1000), expiresAt = now + 300;
  const origin = mediaAcquisitionOrigin(req);
  const token = mediaAcquisitionToken(secret, {
    typ: "lp_media_capability_v1",
    sub: String(auth.user.id),
    origin,
    scopes: ["prepare", "resolve", "stream"],
    iat: now,
    exp: expiresAt,
    nonce: crypto.randomBytes(18).toString("base64url"),
  });
  identityRepo.audit("media_acquisition_capability_minted", auth.user.id,
    { expires_at: expiresAt, scopes: ["prepare", "resolve", "stream"] }, req.ip);
  res.set("Cache-Control", "no-store");
  return res.json({ ok: true, schema_version: "lp_media_capability.1.0.0",
    worker_url: workerUrl, capability: token, expires_at: expiresAt });
});

// AA2-B2 — first-party consent/revoke controller. No route stages a trusted
// authorization request in B2; the unmounted B3 AS bridge will be the only
// future caller of stageTrustedRequest after protocol validation.
const agentAccessOAuthRepo = require("./db/agentAccessOAuthRepo");
const { createConsentCeremony } = require("./agent/access/consentCeremony");
const {
  createOAuthDefaultOffGate,
  PROTECTED_RESOURCE_METADATA_PATH,
  PROTECTED_RESOURCE_METADATA_MCP_ALIAS_PATH,
} = require("./agent/access/oauthDefaultOffGate");
const { createOAuthInteractionBridge } = require("./agent/access/oauthInteractionBridge");
const { createContentSafeOAuthAudit } = require("./agent/access/oauthAudit");
const { createOAuthRateLimiter } = require("./agent/access/oauthRateLimiter");
const { createMcpDefaultOffGate } = require("./agent/access/mcpAdapter");
const { createMcpRateLimiter } = require("./agent/access/mcpRateLimiter");
const { createAgentAccessService } = require("./agent/access/service");
const agentAccessDeployment = require("./agent/access/oauthDeploymentContracts");
// AA2-CP1 — runtime control plane: effective flags = env OR owner journal.
// The resolver never rejects and fails closed; with
// AGENT_ACCESS_RUNTIME_FLAGS_ENABLED unset it never touches the DB and the
// gates behave byte-identically to the historical direct env reads.
const agentAccessControlRepo = require("./db/agentAccessControlRepo");
const { createRuntimeFlagResolver } = require("./agent/access/runtimeControl");
const { createControlPlane } = require("./agent/access/controlPlane");
const agentAccessFlagResolver = createRuntimeFlagResolver({ readLatest: agentAccessControlRepo.latestFlagStates });
const agentAccessControlPlane = createControlPlane({
  controlRepo: agentAccessControlRepo,
  oauthRepo: agentAccessOAuthRepo,
  resolver: agentAccessFlagResolver,
});
const agentAccessConsent = createConsentCeremony({
  oauthRepo: agentAccessOAuthRepo,
  recordConsent: identityRepo.recordConsent,
});
const agentAccessOAuthBridge = createOAuthInteractionBridge({ consentCeremony: agentAccessConsent });
const agentAccessOAuthLimiter = createOAuthRateLimiter();
let agentAccessOAuthRuntimePromise = null;
async function getAgentAccessOAuthRuntime() {
  if (String(process.env.AGENT_ACCESS_OAUTH_ENABLED || "") !== "1"
    || String(process.env.AGENT_ACCESS_UI_ENABLED || "") !== "1") return null;
  if (!agentAccessOAuthRuntimePromise) {
    agentAccessOAuthRuntimePromise = (async () => {
      let cookieKeys;
      try { cookieKeys = JSON.parse(String(process.env.AGENT_ACCESS_OAUTH_COOKIE_KEYS_JSON || "")); }
      catch (_) { throw new Error("AA_OAUTH_COOKIE_KEYS_REQUIRED"); }
      const audit = createContentSafeOAuthAudit({
        key: String(process.env.AGENT_ACCESS_OAUTH_AUDIT_HMAC_KEY || ""),
        emit: (row) => { void identityRepo.audit("agent_access_oauth", null, row, null); },
      });
      const { createDefaultOffOAuthRuntime } = await import("./agent/access/oauthRuntime.mjs");
      return createDefaultOffOAuthRuntime({
        repo: agentAccessOAuthRepo,
        consentCeremony: agentAccessConsent,
        interactionBridge: agentAccessOAuthBridge,
        resolveUser: async (req, res) => {
          const auth = await requireUser(req, res);
          return auth ? auth.user : null;
        },
        privateJwksJson: String(process.env.AGENT_ACCESS_OAUTH_PRIVATE_JWKS_JSON || ""),
        cookieKeys,
        audit,
        limiter: agentAccessOAuthLimiter,
        trustProxy: String(process.env.AGENT_ACCESS_OAUTH_TRUST_PROXY || "") === "1",
      });
    })().catch((err) => {
      // AA2-CP1: a rejected build must not stay memoized — under runtime flag
      // control the process now lives across config fixes, so the next request
      // retries instead of 503ing until a redeploy.
      agentAccessOAuthRuntimePromise = null;
      throw err;
    });
  }
  return agentAccessOAuthRuntimePromise;
}
// AA2-B3.1 — discovery exists only behind the exact double-default-off gate;
// authorization/interaction/token/revoke additionally require the independent
// AGENT_ACCESS_OAUTH_CLIENTS_ENABLED=1 kill switch. A client row alone cannot
// activate access. Enabling discovery without a complete runtime fails 503.
const agentAccessOAuthGate = createOAuthDefaultOffGate({
  getRuntime: getAgentAccessOAuthRuntime,
  limiter: agentAccessOAuthLimiter,
  resolveFlags: () => agentAccessFlagResolver.resolve(),
});
app.all(PROTECTED_RESOURCE_METADATA_PATH, agentAccessOAuthGate);
app.all(PROTECTED_RESOURCE_METADATA_MCP_ALIAS_PATH, agentAccessOAuthGate);
app.all("/.well-known/oauth-authorization-server/oauth", agentAccessOAuthGate);
app.all(/^\/oauth(?:\/|$)/, agentAccessOAuthGate);

// AA2-C1 — stateless Streamable HTTP MCP adapter. The independent exact-1
// flag is checked before bearer parsing, body reads, runtime/session creation,
// rate buckets, tool dispatch or audit writes. No production handler is added
// in C1: the endpoint remains default-off and fixture tests inject handlers.
const agentAccessMcpLimiter = createMcpRateLimiter();
let agentAccessMcpRuntimePromise = null;
function agentAccessOwnerIds() {
  const raw = String(process.env.AGENT_ACCESS_OWNER_IDS || "");
  const values = raw.split(",").map((value) => value.trim());
  if (!raw.trim() || values.length !== 1 || !values[0] || values[0] === "*"
    || !/^[A-Za-z0-9._:@/-]{1,128}$/.test(values[0]) || new Set(values).size !== 1) {
    throw new Error("AA_MCP_OWNER_ALLOWLIST_INVALID");
  }
  return Object.freeze(values);
}
async function getAgentAccessMcpRuntime(effectiveFlags) {
  // AA2-CP1: the gate resolves flags ONCE per request and passes the snapshot
  // here, so gate and runtime getter can never disagree (a second independent
  // resolve could straddle a cache/TTL boundary and 503 inside an open
  // window). Without a snapshot (defensive default) fall back to env.
  const flags = effectiveFlags || {
    ui: process.env.AGENT_ACCESS_UI_ENABLED,
    oauth: process.env.AGENT_ACCESS_OAUTH_ENABLED,
    clients: process.env.AGENT_ACCESS_OAUTH_CLIENTS_ENABLED,
    mcp: process.env.AGENT_ACCESS_MCP_ENABLED,
  };
  if (["ui", "oauth", "clients", "mcp"].some((name) => String(flags[name] || "") !== "1")) return null;
  if (!agentAccessMcpRuntimePromise) {
    agentAccessMcpRuntimePromise = (async () => {
      const oauthRuntime = await getAgentAccessOAuthRuntime();
      if (!oauthRuntime?.keyset) throw new Error("AA_MCP_OAUTH_RUNTIME_REQUIRED");
      const ownerIds = agentAccessOwnerIds();
      const audit = createContentSafeOAuthAudit({
        key: String(process.env.AGENT_ACCESS_OAUTH_AUDIT_HMAC_KEY || ""),
        emit: (row) => { void identityRepo.audit("agent_access_mcp", null, row, null); },
      });
      const { createMcpResourceValidator } = await import("./agent/access/mcpResourceValidator.mjs");
      const validator = createMcpResourceValidator({
        keyset: oauthRuntime.keyset,
        repo: agentAccessOAuthRepo,
        issuer: agentAccessDeployment.ISSUER,
        resource: agentAccessDeployment.RESOURCE,
        allowedClientIds: agentAccessDeployment.FIXTURE_CLIENTS.map((client) => client.client_id),
        allowedOwnerIds: ownerIds,
      });
      // C4-PRE: production handlers are created only after every exact-1 gate,
      // OAuth runtime and exact-one owner contract pass. Merely importing the
      // server with default-off flags performs no handler construction, DB read
      // or public-catalog load.
      const { AsyncLocalStorage } = require("async_hooks");
      const { createProductionHandlers } = require("./agent/access/productionHandlers");
      const { createPublicReadingCatalog } = require("./agent/access/publicReadingCatalog");
      const learnerGraphRepoForAgentAccess = require("./db/learnerGraphRepo");
      const agentRepoForAgentAccess = require("./db/agentRepo");
      const keyingServiceForAgentAccess = require("./db/keyingService");
      const corpusSentenceRepoForAgentAccess = require("./db/corpusSentenceRepo");
      const handoffRepoForAgentAccess = require("./db/handoffRepo");
      const agentProposalsRepoForAgentAccess = require("./db/agentProposalsRepo");
      const nextTextForAgentAccess = require("./agent/nextText");
      const { createPublicPublicationReadService } = require("./agent/access/publicPublicationReadService");
      const { getPublicationAgentRightsRepo } = require("./db/publicationAgentRightsRepo");
      const { getPhysicsTaskResourceRepo: getPhysicsTaskResourceRepoForAgentAccess } = require("./db/physicsTaskResourceRepo");
      const principalContext = new AsyncLocalStorage();
      const handlers = createProductionHandlers({
        learnerGraphRepo: learnerGraphRepoForAgentAccess,
        agentRepo: agentRepoForAgentAccess,
        oauthRepo: agentAccessOAuthRepo,
        publicCatalog: createPublicReadingCatalog({ catalogVersion: nextTextForAgentAccess.catalogVersion }),
        keyingService: keyingServiceForAgentAccess,
        corpusSentenceRepo: corpusSentenceRepoForAgentAccess,
        handoffRepo: handoffRepoForAgentAccess,
        agentProposalsRepo: agentProposalsRepoForAgentAccess,
        personalTextsRepo: require("./db/learnerArtifactsRepo"),   // S1: sidecar-мета (list_personal_texts); прямой require — const-декларация ниже по файлу (TDZ)
        personalTextsContentRepo: require("./db/agentSentenceRepo"),   // S2: aa-экстрактор окна (single-parser)
        textGrantsRepo: require("./db/agentTextGrantsRepo"),           // S2: standing-грант владельца
        groupCorpusRepo: require("./db/groupCorpusRepo"),             // restricted corpus; ACTIVE membership on every read
        weeklyGoalsRepo: require("./db/weeklyGoalsRepo"),             // H2.3 server-authoritative weekly goals
        publicPublicationReadService: createPublicPublicationReadService({
          rightsRepo: getPublicationAgentRightsRepo(),
          physicsRepo: getPhysicsTaskResourceRepoForAgentAccess(),
          learningSupportProviders: {
            "physics-year1-problems": require("./physics/physicsYear1LearningSupport"),
            "materials-science-year1-problem-book-2": require("./materials/materialsPb2LearningSupport"),
          },
          canonicalOrigin: "https://linguistpro.kolosei.com",
          // Domain separation over the already-required MCP audit secret; no
          // cursor is accepted across filters/editions or another environment.
          cursorKey: `publication-cursor:${String(process.env.AGENT_ACCESS_OAUTH_AUDIT_HMAC_KEY || "")}`,
        }),
        // AA3: report the real access window (control-plane) rather than the token TTL.
        connectionPersistence: async () => {
          try {
            const resolved = await agentAccessFlagResolver.resolve(true);
            const mcp = resolved && resolved.detail ? resolved.detail.mcp : null;
            if (!mcp) return { access_lifetime: "TOKEN_ONLY", window_expires_at: null };
            if (mcp.source === "env" || mcp.source === "db_permanent") return { access_lifetime: "PERSISTENT_WINDOW", window_expires_at: null };
            if (mcp.source === "db_window" && mcp.expires_at) return { access_lifetime: "TIMED_WINDOW", window_expires_at: mcp.expires_at };
            return { access_lifetime: "TOKEN_ONLY", window_expires_at: null };
          } catch (_) { return { access_lifetime: "TOKEN_ONLY", window_expires_at: null }; }
        },
        now: Date.now,
        principalAccessExpiresAt: (context) => {
          const principal = principalContext.getStore();
          if (!principal || principal.user_id !== context.user_id || principal.oauth_client_id !== context.oauth_client_id
            || principal.connection_id !== context.connection_id || principal.request_id !== context.request_id) {
            throw new Error("AA_MCP_PRINCIPAL_CONTEXT_INVALID");
          }
          return principal.access_expires_at;
        },
      });
      const baseService = createAgentAccessService({ enabled: true, ownerIds, handlers });
      const service = Object.freeze({
        enabled: baseService.enabled,
        capability_version: baseService.capability_version,
        execute: (principal, tool, args) => principalContext.run(principal, () => baseService.execute(principal, tool, args)),
      });
      return Object.freeze({ validator, service, limiter: agentAccessMcpLimiter, audit });
    })().catch((err) => {
      // AA2-CP1: same memo-heal as the OAuth runtime — never cache a rejection.
      agentAccessMcpRuntimePromise = null;
      throw err;
    });
  }
  return agentAccessMcpRuntimePromise;
}
app.all(AGENT_ACCESS_MCP_PATH, createMcpDefaultOffGate({
  getRuntime: getAgentAccessMcpRuntime,
  resolveFlags: () => agentAccessFlagResolver.resolve(),
}));
function agentAccessHttpError(res, err) {
  const code = String((err && (err.code || err.message)) || "AA_CONSENT_FAILED");
  const status = code.endsWith("NOT_FOUND") ? 404
    : code.includes("REPLAYED") || code.includes("STATE_CONFLICT") ? 409
    : code.includes("INACTIVE") || code.includes("BINDING") ? 403
    : 400;
  return res.status(status).json({ ok: false, error: /^AA_[A-Z0-9_]+$/.test(code) ? code : "AA_CONSENT_FAILED" });
}

// Express otherwise synthesizes a permissive 200 Allow response for OPTIONS.
// Agent Access has no browser cross-origin contract, so preflight is an exact
// fail-closed route and never reaches the generic automatic responder.
app.options(/^\/api\/agent-access(?:\/|$)/, requireAgentAccessBoundary);

app.get("/api/agent-access/connections", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const connections = await agentAccessOAuthRepo.listConnectionsForUser(auth.user.id);
    return res.json({ ok: true, schema_version: "aa.connections.1.0.0", connections });
  } catch (e) { return agentAccessHttpError(res, e); }
});
app.get("/api/agent-access/consent/:requestId", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try { return res.json({ ok: true, preview: agentAccessConsent.preview(auth.user.id, req.params.requestId) }); }
  catch (e) { return agentAccessHttpError(res, e); }
});
app.post("/api/agent-access/consent/decision", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const result = await agentAccessConsent.decide(auth.user.id, req.body || {});
    const continuation = agentAccessOAuthBridge.complete(auth.user.id, req.body.request_id, result.decision);
    identityRepo.audit(`agent_access_consent_${result.decision}`, auth.user.id, { scopes: result.granted_scopes || [] }, req.ip);
    return res.json({ ...result, continue_url: `/oauth/interaction/${encodeURIComponent(continuation.interaction_uid)}/complete?request_id=${encodeURIComponent(req.body.request_id)}` });
  } catch (e) { return agentAccessHttpError(res, e); }
});
app.post("/api/agent-access/connections/:connectionId/revoke", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const connection = await agentAccessOAuthRepo.revokeConnection(auth.user.id, req.params.connectionId, "USER_REVOKE");
    // S2 §2.5 — revoke подключения = status-флип (FK CASCADE не срабатывает) → явный отзыв
    // text-грантов этого подключения; провал видим (audit), read-path и так re-assert'ит статус.
    try {
      const g = await require("./db/agentTextGrantsRepo").revokeForConnection(auth.user.id, connection.connection_id);
      if (g.revoked) identityRepo.audit("agent_text_grants_connection_cascade", auth.user.id, { connection_id: connection.connection_id, revoked: g.revoked }, req.ip);
    } catch (e2) {
      identityRepo.audit("agent_text_grants_cascade_failed", auth.user.id, { connection_id: connection.connection_id, message: String(e2 && e2.message).slice(0, 120) }, req.ip);
    }
    identityRepo.audit("agent_access_connection_revoke", auth.user.id, { connection_id: connection.connection_id }, req.ip);
    return res.json({ ok: true, connection_id: connection.connection_id, status: connection.status });
  } catch (e) { return agentAccessHttpError(res, e); }
});
app.delete("/api/agent-access/connections/:connectionId", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const existing = await agentAccessOAuthRepo.loadConnection(auth.user.id, req.params.connectionId);
    if (!new Set(["REVOKED", "DELETED"]).has(existing.status)) {
      await agentAccessOAuthRepo.revokeConnection(auth.user.id, existing.connection_id, "USER_DELETE");
    }
    try { await require("./db/agentTextGrantsRepo").revokeForConnection(auth.user.id, existing.connection_id); } catch (_) {}
    const deleted = await agentAccessOAuthRepo.deleteConnection(auth.user.id, existing.connection_id, "USER_DELETE");
    identityRepo.audit("agent_access_connection_delete", auth.user.id, { connection_id: deleted.connection_id }, req.ip);
    return res.json({ ok: true, connection_id: deleted.connection_id, deleted: true });
  } catch (e) { return agentAccessHttpError(res, e); }
});

// ── S2 — панель: standing-грант «агент читает тела моих текстов» (DESIGN §2.1/§2.4) ─────────
// Выдача: session+CSRF; целевое подключение = живое с scope personal.texts.content.read (если
// несколько — connection_id в теле). ПОРЯДОК: INSERT гранта → cancelOpenForUser (TOCTOU-щель:
// challenge до cancel — погашен, после — селектор уже видит грант). Отзыв — отдельной кнопкой.
app.get("/api/agent-access/text-grants", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const grantsRepo = require("./db/agentTextGrantsRepo");
    const rows = await grantsRepo.listGrants(auth.user.id);
    const active = await grantsRepo.activeGrant(auth.user.id);
    res.json({ ok: true, grants: rows, active_state: active.state });
  } catch (e) { return agentAccessHttpError(res, e); }
});
app.post("/api/agent-access/text-grants", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const grantsRepo = require("./db/agentTextGrantsRepo");
    const body = req.body || {};
    let connectionId = body.connection_id != null ? String(body.connection_id) : null;
    if (!connectionId) {
      // Единственное живое подключение с content-scope — типичный single-owner случай.
      const conns = await agentAccessOAuthRepo.listConnectionsForUser(auth.user.id);
      // Форма listConnectionsForUser: grants[{scope,status}] — НЕ granted_scopes (live-инцидент
      // 2026-07-19: выдумка поля = вечный NO_ELIGIBLE_CONNECTION; урок config-string-match).
      const eligible = (conns || []).filter((c) => new Set(["ACTIVE", "SCOPE_REDUCED"]).has(c.status)
        && (c.grants || []).some((g) => g.scope === "personal.texts.content.read" && g.status === "ACTIVE"));
      if (eligible.length !== 1) return res.status(400).json({ ok: false, error: eligible.length ? "CONNECTION_AMBIGUOUS" : "NO_ELIGIBLE_CONNECTION" });
      connectionId = eligible[0].connection_id;
    }
    const ttlDays = body.ttl_days == null ? null : Number(body.ttl_days);
    const out = await grantsRepo.issueGrant(auth.user.id, connectionId, { ttlDays });
    if (out.ok === false) return res.status(400).json(out);
    // Этап 1 двухрежимности (владелец 2026-07-19): прежний cancelOpenForUser-каскад СНЯТ —
    // открытое задание не гасится, а его грейд получит провенанс meta.agent_exposed
    // (OR-проверка activeGrant на грейде в agent/reviewer.js покрывает выдачу между mint и ответом).
    identityRepo.audit("agent_text_grant_issue", auth.user.id, { grant_id: out.grant_id, connection_id: connectionId, ttl_days: ttlDays }, req.ip);
    res.json(out);
  } catch (e) { return agentAccessHttpError(res, e); }
});
app.post("/api/agent-access/text-grants/:grantId/revoke", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const out = await require("./db/agentTextGrantsRepo").revokeGrant(auth.user.id, req.params.grantId);
    identityRepo.audit("agent_text_grant_revoke", auth.user.id, { grant_id: String(req.params.grantId || "").slice(0, 64), revoked: out.revoked }, req.ip);
    res.json(out);
  } catch (e) { return agentAccessHttpError(res, e); }
});

// AA3-3c — W1 propose-then-confirm. The agent creates PENDING rows via MCP;
// ONLY these owner-session routes can decide them (R17: the decision channel is
// first-party, session+CSRF; no MCP tool can reach it). listPending already
// filters to live PENDING rows of ACTIVE/SCOPE_REDUCED connections.
const agentProposalsRepo = require("./db/agentProposalsRepo");

// H2.4 — authenticated, explicit-owner on-demand niqqud. The server never stores
// the submitted personal text or the returned niqqud in SQLite/logs; durable cache
// authority lives beside the OPFS text as a DERIVED sentence meta layer.
const nakdanOnDemand = require("./db/premium/nakdanOnDemand");
const rlNakdanOnDemand = makeRateLimiter({ windowMs: 60_000, max: 10, name: "nakdan-on-demand" });
app.post("/api/niqqud/on-demand", requireSameOriginJson, rlNakdanOnDemand, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const body = req.body || {};
  const purpose = String(body.purpose || "");
  if (!["IMPORT_PREVIEW", "LIBRARY_OWNER"].includes(purpose)) {
    return res.status(400).json({ ok: false, error: "NAKDAN_INVALID_INPUT" });
  }
  try {
    const out = await nakdanOnDemand.vocalize(body.text);
    void identityRepo.audit("nakdan_on_demand", auth.user.id, {
      purpose, source_hash: out.source_hash, from_cache: out.from_cache,
      model_version: out.model_version,
    }, req.ip);
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, schema_version: "nakdan.on_demand.1.0.0", ...out });
  } catch (error) {
    const code = String(error && (error.code || error.message) || "NAKDAN_UNAVAILABLE");
    if (code === "NAKDAN_INVALID_INPUT") return res.status(400).json({ ok: false, error: code });
    const retryMs = Number(error && error.retry_after_ms) || 0;
    if (retryMs > 0) res.set("Retry-After", String(Math.max(1, Math.ceil(retryMs / 1000))));
    return res.status(503).json({ ok: false, error: "NAKDAN_UNAVAILABLE" });
  }
});
// AA4-4b — count-only badge feed for Studio/Room chips. By construction the
// SAME predicate as the panel list (literally listPending().length, ≤10 rows by
// PENDING_CAP) so the badge can never over-claim vs what the panel shows (R11).
// No proposal content leaves this endpoint: index/library run Report-Only CSP —
// agent-authored TEXT renders only on the enforced-CSP /agent-access.html.
// Hidden-at-zero == hidden-on-error is a considered decision: the badge may
// under-claim (panel stays reachable via its normal entry), never over-claim.
app.get("/api/agent-access/proposals/summary", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const rows = await agentProposalsRepo.listPending(auth.user.id);
    return res.json({ ok: true, schema_version: "aa.proposals_summary.1.0.0", pending_total: rows.length });
  } catch (e) { return agentAccessHttpError(res, e); }
});
app.get("/api/agent-access/proposals", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const rows = await agentProposalsRepo.listPending(auth.user.id);
    // payload_json stays server-side; the panel gets the parsed payload + the
    // SERVER-resolved display_title (never an agent-asserted work description).
    const ticketsRepo = require("./db/agentProposalTicketsRepo");
    const proposals = await Promise.all(rows.map(async (r) => ({
      proposal_id: r.proposal_id, kind: r.kind, payload: r.payload,
      display_title: r.display_title, authority: r.authority,
      client_display_name: r.client_display_name, created_at: r.created_at, expires_at: r.expires_at,
      executions: ["import_text","track_word"].includes(r.kind) ? await ticketsRepo.state(auth.user.id, r.proposal_id) : [],
    })));
    return res.json({ ok: true, schema_version: "aa.proposals.1.0.0", proposals });
  } catch (e) { return agentAccessHttpError(res, e); }
});
app.post("/api/agent-access/proposals/:proposalId/decision", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const decision = String(((req.body || {}).decision) || "");
  if (!["confirm", "deny"].includes(decision)) return res.status(400).json({ ok: false, error: "AA_PROPOSAL_BAD_DECISION" });
  try {
    const row = await agentProposalsRepo.getPending(auth.user.id, req.params.proposalId);
    // Execute-before-flip (R14): mint first so a mint failure leaves the row
    // PENDING and re-confirmable; an orphaned token dies in 5 min unused.
    let handoffUrl = null;
    if (decision === "confirm" && ["import_text","track_word"].includes(row.kind)) {
      return res.status(409).json({ ok: false, error: "AA_PROPOSAL_BROWSER_EXECUTION_REQUIRED" });
    }
    if (decision === "confirm" && row.kind === "open_reading" && row.payload) {
      const listed = require("./db/corpusSentenceRepo").listWorkTexts(row.payload.work_id);
      if (!listed || !listed.ok) return res.status(409).json({ ok: false, error: "AA_PROPOSAL_WORK_UNAVAILABLE" });
      const text = row.payload.text_key ? listed.texts.find((t) => t.text_key === row.payload.text_key) : listed.texts[0];
      if (!text) return res.status(409).json({ ok: false, error: "AA_PROPOSAL_WORK_UNAVAILABLE" });
      const minted = await handoffRepo.mint(auth.user.id, {
        textKey: text.text_key,
        orderIndex: row.payload.order_index != null ? Number(row.payload.order_index) : (Number(text.first_order_index) || 0),
        action: "open_corpus", workId: String(row.payload.work_id),
      });
      handoffUrl = "/library.html?handoff=" + encodeURIComponent(minted.raw);
    }
    if (decision === "confirm" && row.kind === "goal") {
      await require("./db/weeklyGoalsRepo").createFromProposal(auth.user.id, row);
    }
    const rejectStatus = ["import_text","track_word","goal"].includes(row.kind) ? "REJECTED" : "DENIED";
    const decided = await agentProposalsRepo.decide(auth.user.id, req.params.proposalId, decision === "confirm" ? "CONFIRMED" : rejectStatus);
    identityRepo.audit("agent_access_proposal_decision", auth.user.id, { proposal_id: decided.proposal_id, kind: decided.kind, decision: decided.status }, req.ip);
    return res.json({ ok: true, proposal_id: decided.proposal_id, status: decided.status, handoff_url: handoffUrl });
  } catch (e) { return agentAccessHttpError(res, e); }
});

// H2.3 owner-confirmed browser execution. MCP cannot reach these routes:
// first-party session + CSRF are mandatory, and the ticket expires in 5 min.
app.post("/api/agent-access/proposals/:proposalId/execution", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const row = await agentProposalsRepo.getPending(auth.user.id, req.params.proposalId);
    if (!["import_text","track_word"].includes(row.kind)) return res.status(409).json({ ok:false,error:"AA_PROPOSAL_BROWSER_EXECUTION_NOT_APPLICABLE" });
    if (row.kind === "import_text" && row.payload && row.payload.duplicate_of_text_key) return res.status(409).json({ ok:false,error:"AA_PROPOSAL_TEXT_DUPLICATE" });
    const out = await require("./db/agentProposalTicketsRepo").issue(auth.user.id, row, Number((req.body || {}).item_index));
    identityRepo.audit("agent_access_proposal_ticket_issue", auth.user.id, { proposal_id: row.proposal_id, kind: row.kind, item_index: Number((req.body || {}).item_index) }, req.ip);
    return res.json({ ok:true, schema_version:"aa.proposal_execution.1.0.0", ...out });
  } catch (e) { return agentAccessHttpError(res, e); }
});
app.post("/api/agent-access/proposals/:proposalId/execution/receipt", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const body = req.body || {}; const row = await agentProposalsRepo.getPending(auth.user.id, req.params.proposalId);
    const index = Number(body.item_index); const expected = require("./db/agentProposalTicketsRepo").actionFor(row, index);
    const receipt = body.receipt || {};
    if (expected.type === "IMPORT_TEXT" && (receipt.type !== "IMPORT_TEXT" || receipt.text_key !== expected.text_key || !Number.isInteger(receipt.rows_written) || receipt.rows_written < 1)) throw Object.assign(new Error("AA_PROPOSAL_RECEIPT_INVALID"),{code:"AA_PROPOSAL_RECEIPT_INVALID"});
    if (expected.type === "TRACK_WORD" && (receipt.type !== "TRACK_WORD" || receipt.item_key !== expected.item_key || receipt.status !== "new")) throw Object.assign(new Error("AA_PROPOSAL_RECEIPT_INVALID"),{code:"AA_PROPOSAL_RECEIPT_INVALID"});
    const required = row.kind === "import_text" ? 1 : row.payload.items.filter((x) => x.item_key).length;
    const consumed = await require("./db/agentProposalTicketsRepo").consume(auth.user.id, row.proposal_id, body.ticket, body.action_digest, receipt, required);
    const complete = consumed.complete;
    identityRepo.audit("agent_access_proposal_execution_receipt", auth.user.id, { proposal_id: row.proposal_id, kind: row.kind, item_index:index, complete }, req.ip);
    return res.json({ ok:true, proposal_id:row.proposal_id, item_index:index, status:complete?"CONFIRMED":"PENDING" });
  } catch (e) { return agentAccessHttpError(res, e); }
});

app.get("/api/agent-access/goals/current", requireAgentAccessBoundary, async (req,res)=>{const auth=await requireUser(req,res);if(!auth)return;try{return res.json({ok:true,goal:await require("./db/weeklyGoalsRepo").getCurrent(auth.user.id)});}catch(e){return agentAccessHttpError(res,e);}});
app.post("/api/agent-access/goals/:goalId/close", requireAgentAccessBoundary, async (req,res)=>{const auth=await requireUser(req,res);if(!auth)return;if(!requireCsrf(req,res,auth))return;try{const out=await require("./db/weeklyGoalsRepo").close(auth.user.id,req.params.goalId,String((req.body||{}).status||""));identityRepo.audit("agent_access_goal_close",auth.user.id,{goal_id:out.id,status:out.status},req.ip);return res.json({ok:true,...out});}catch(e){return agentAccessHttpError(res,e);}});
app.delete("/api/agent-access/goals/:goalId", requireAgentAccessBoundary, async (req,res)=>{const auth=await requireUser(req,res);if(!auth)return;if(!requireCsrf(req,res,auth))return;try{const out=await require("./db/weeklyGoalsRepo").remove(auth.user.id,req.params.goalId);identityRepo.audit("agent_access_goal_delete",auth.user.id,{goal_id:out.id},req.ip);return res.json({ok:true,...out});}catch(e){return agentAccessHttpError(res,e);}});
app.delete("/api/agent-access/proposals/:proposalId", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const out = await agentProposalsRepo.deleteProposal(auth.user.id, req.params.proposalId);
    identityRepo.audit("agent_access_proposal_delete", auth.user.id, { proposal_id: out.proposal_id }, req.ip);
    return res.json({ ok: true, proposal_id: out.proposal_id, deleted: true });
  } catch (e) { return agentAccessHttpError(res, e); }
});

// AA2-CP1 — owner-only runtime control plane. Guard order is deliberate:
// boundary -> requireUser(401) -> owner allowlist(404, an invalid/absent env
// allowlist also 404s) -> CSRF -> control-plane logic (503 disabled, 403
// step-up, 409 env-pin/terminal). A denied authenticated user is audited so
// an env/owner-id mismatch is diagnosable from logs instead of a silent 404.
async function requireAgentAccessOwner(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return null;
  let owners = null;
  try { owners = agentAccessOwnerIds(); } catch (_) { owners = null; }
  if (!owners || !owners.includes(auth.user.id)) {
    identityRepo.audit("agent_access_admin_denied", auth.user.id, { owner_env_configured: !!owners }, req.ip);
    res.status(404).json({ ok: false, error: "not_found" });
    return null;
  }
  return auth;
}
function agentAccessAdminHttpError(res, err) {
  const code = String((err && (err.code || err.message)) || "AA_CP_FAILED");
  const status = code === "AA_CP_DISABLED" ? 503
    : code === "AA_CP_STEP_UP_REQUIRED" || code === "AA_CP_STEP_UP_UNAVAILABLE" ? 403
    : code === "AA_CP_FLAG_ENV_PINNED" || code === "AA_CP_CLIENT_REVOKED_TERMINAL" ? 409
    : code === "AA_CP_CLIENT_NOT_FOUND" ? 404
    : 400;
  return res.status(status).json({ ok: false, error: /^AA_[A-Z0-9_]+$/.test(code) ? code : "AA_CP_FAILED" });
}
app.get("/api/agent-access/admin/state", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireAgentAccessOwner(req, res); if (!auth) return;
  try { return res.json(await agentAccessControlPlane.state()); }
  catch (e) { return agentAccessAdminHttpError(res, e); }
});
app.post("/api/agent-access/admin/transition", requireAgentAccessBoundary, async (req, res) => {
  const auth = await requireAgentAccessOwner(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const type = String(((req.body || {}).type) || "");
  try {
    const result = await agentAccessControlPlane.transition(auth.user.id, req.body || {});
    identityRepo.audit("agent_access_admin_transition", auth.user.id, { type, ok: result.ok === true }, req.ip);
    return res.json(result);
  } catch (e) {
    identityRepo.audit("agent_access_admin_transition_denied", auth.user.id, { type, code: String(e.code || e.message || "") }, req.ip);
    return agentAccessAdminHttpError(res, e);
  }
});

app.post("/api/auth/bootstrap-login", async (req, res) => {
  const secret = process.env.AUTH_BOOTSTRAP_SECRET || "";
  if (!secret || secret.length < AUTH_BOOTSTRAP_MIN_LEN) {
    return res.status(503).json({ ok: false, error: "AUTH_DISABLED", message: `Set AUTH_BOOTSTRAP_SECRET (≥${AUTH_BOOTSTRAP_MIN_LEN} chars) to enable login.` });
  }
  const ip = req.ip || "unknown";
  if (authFailExceeded(ip)) {
    res.set("Retry-After", String(Math.ceil(AUTH_FAIL_WINDOW_MS / 1000)));
    return res.status(429).json({ ok: false, error: "TOO_MANY_AUTH_FAILURES" });
  }
  const provided = String((req.body && req.body.secret) || "");   // POST body ONLY — never query/header
  if (!provided || !timingSafeStrEqual(provided, secret)) {
    authFailRecord(ip);
    identityRepo.audit("login_failed", null, {}, ip);
    return res.status(401).json({ ok: false, error: "BAD_SECRET" });
  }
  try {
    const user = await identityRepo.ensureOwnerUser();
    const s = await identityRepo.createSession(user.id, {
      deviceLabel: req.body && req.body.deviceLabel, ip, userAgent: req.get("user-agent"),
    });
    setSessionCookie(req, res, s.cookieValue, Math.floor(identityRepo.SESSION_TTL_MS / 1000));
    identityRepo.audit("login", user.id, { sessionId: s.sessionId, deviceId: s.deviceId }, ip);
    res.json({ ok: true, user: { id: user.id, role: user.role, displayName: user.display_name }, csrf: s.csrf, expiresAt: s.expiresAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: "LOGIN_FAILED", message: e.message });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  let consents = { current: {}, history: [] };
  try { consents = await identityRepo.listConsents(auth.user.id); } catch (_) {}
  res.json({
    ok: true,
    user: { id: auth.user.id, role: auth.user.role, displayName: auth.user.display_name, createdAt: auth.user.created_at },
    session: { id: auth.session.id, deviceId: auth.session.deviceId, createdAt: auth.session.createdAt, expiresAt: auth.session.expiresAt },
    csrf: auth.session.csrf,
    consents: consents.current,
  });
});

app.post("/api/auth/logout", async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try { await identityRepo.revokeSession(auth.user.id, auth.session.id); } catch (_) {}
  setSessionCookie(req, res, "", 0);
  identityRepo.audit("logout", auth.user.id, { sessionId: auth.session.id }, req.ip);
  res.json({ ok: true });
});

app.get("/api/auth/sessions", async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const rows = await identityRepo.listSessions(auth.user.id);
    res.json({ ok: true, currentSessionId: auth.session.id, sessions: rows });
  } catch (e) { res.status(500).json({ ok: false, error: "SESSIONS_FAILED", message: e.message }); }
});

app.post("/api/auth/sessions/revoke", async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const sid = String((req.body && req.body.sessionId) || "");
  if (!sid) return res.status(400).json({ ok: false, error: "NO_SESSION_ID" });
  try {
    const done = await identityRepo.revokeSession(auth.user.id, sid);
    identityRepo.audit("session_revoke", auth.user.id, { sessionId: sid, done }, req.ip);
    res.json({ ok: true, revoked: done });
  } catch (e) { res.status(500).json({ ok: false, error: "REVOKE_FAILED", message: e.message }); }
});

// P2 (критика F2-15): на consent-роуте висят самые тяжёлые каскады (purge артефактов до
// 2000×8МБ строк в single-writer sqlite) — toggle-спам не должен блокировать event-loop.
const rlConsent = makeRateLimiter({ windowMs: 60_000, max: 10, name: "auth-consent" });
app.post("/api/auth/consent", rlConsent, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const key = String((req.body && req.body.key) || "");
  const granted = !!(req.body && req.body.granted);
  const version = String((req.body && req.body.version) || "v1");
  try {
    const consentRowId = await identityRepo.recordConsent(auth.user.id, key, granted, version);
    identityRepo.audit(granted ? "consent_grant" : "consent_revoke", auth.user.id, { key, version }, req.ip);
    // CLG-P6.2 (решение владельца 2026-07-06, §5 v3 «отзыв → каскад на derived»): отзыв
    // agent_read_texts зануляет контентные поля agent_explanations до tombstone —
    // объяснения цитируют предложения пользователя, «оставить как было» недостаточно.
    let purgeInfo = null;
    // PAS-B2: отзыв digest-ключа чистит study_summary (резюме цитируют ВЕСЬ текст —
    // «пометить и оставить» недостаточно, та же логика, что agent_read_texts ниже).
    if (key === "agent_read_texts_digest" && !granted) {
      try {
        const purged = await require("./db/agentRepo").purgeExplanationContentByKind(auth.user.id, "study_summary", "consent_revoked");
        identityRepo.audit("agent_summaries_purge", auth.user.id, { purged: purged.purged }, req.ip);
        purgeInfo = { purged: purged.purged };
      } catch (e2) {
        identityRepo.audit("agent_summaries_purge_failed", auth.user.id, { message: String(e2 && e2.message).slice(0, 120) }, req.ip);
        purgeInfo = { purge_error: "PURGE_FAILED" };
      }
    }
    if (key === "agent_read_texts" && !granted) {
      // Revoke обязан устоять даже при провале purge (fail-closed для НОВЫХ объяснений),
      // но провал НЕ молчит (R11): он виден в ответе и в audit_log.
      try {
        const purged = await require("./db/agentRepo").purgeExplanationContent(auth.user.id, "consent_revoked");
        identityRepo.audit("agent_explanations_purge", auth.user.id, { purged: purged.purged }, req.ip);
        purgeInfo = { purged: purged.purged };
      } catch (e2) {
        identityRepo.audit("agent_explanations_purge_failed", auth.user.id, { message: String(e2 && e2.message).slice(0, 120) }, req.ip);
        purgeInfo = { purge_error: "PURGE_FAILED" };
      }
    }
    // P7.2b (§5): отзыв cloud_texts ИЛИ agent_read_texts — согласий, породивших право читать текст
    // пользователя — ГАСИТ открытые cloze-challenges и ЗАНУЛЯЕТ класс-C стимул (blanked-предложение
    // пользователя не переживает отзыв). cancelOpenForUser зануляет class-C по построению. Best-effort.
    if ((key === "cloud_texts" || key === "agent_read_texts") && !granted) {
      try {
        const cancelled = await agentChallengeRepo.cancelOpenForUser(auth.user.id);
        identityRepo.audit("cloze_text_consent_cascade", auth.user.id, { key, cancelled_challenges: cancelled }, req.ip);
      } catch (e4) {
        identityRepo.audit("cloze_text_consent_cascade_failed", auth.user.id, { key, message: String(e4 && e4.message).slice(0, 120) }, req.ip);
      }
      // PAS-C1 (критика wf_5ea38001 BLOCKER): RAM-сессия диалога личного текста несёт
      // derived-контент (реплики наставника пересказывают окно window_5) — каскад отзыва
      // обязан дотянуться и до RAM, не только до agent_explanations/challenges. Синхронно,
      // best-effort (in-memory, провал невозможен кроме require-сбоя).
      try {
        const dropped = require("./agent/roleplay").dropPersonalSessions(auth.user.id);
        if (dropped) identityRepo.audit("roleplay_consent_cascade", auth.user.id, { key, dropped_sessions: dropped }, req.ip);
      } catch (e5) {
        identityRepo.audit("roleplay_consent_cascade_failed", auth.user.id, { key, message: String(e5 && e5.message).slice(0, 120) }, req.ip);
      }
    }
    // P2 §6.8 — отзыв cloud_texts = deletion-семантика класса C (BRIDGE_RECON §2.5, GDPR-канон
    // AI_MENTOR_RECON:421–425): немедленный purge ВСЕХ артефактов (text_bundle + state_bundle)
    // и tombstones, purged_at на этой revoke-строке. Провал НЕ молчит (паттерн memory-ключей
    // F1/F2, НЕ best-effort соседей): 500 PURGE_FAILED; отзыв уже записан (чтение fail-closed),
    // допурж доделает ops-sweep reconcile. S2: сюда же каскад отзыва agent_text_grants —
    // «воскресающий доступ агента» при повторном включении синка месяцы спустя запрещён.
    if (key === "cloud_texts" && !granted) {
      try {
        const purged = await require("./db/learnerArtifactsRepo").purgeAllForUser(auth.user.id);
        await require("./db/learnerArtifactsRepo").markConsentPurged(consentRowId);
        const grantsRevoked = await require("./db/agentTextGrantsRepo").revokeAllForUser(auth.user.id);
        identityRepo.audit("artifacts_purge", auth.user.id, { artifacts: purged.artifacts, tombstones: purged.tombstones, text_grants_revoked: grantsRevoked.revoked }, req.ip);
        purgeInfo = { ...(purgeInfo || {}), artifacts_purged: purged.artifacts };
      } catch (e7) {
        identityRepo.audit("artifacts_purge_failed", auth.user.id, { message: String(e7 && e7.message).slice(0, 120) }, req.ip);
        return res.status(500).json({ ok: false, error: "PURGE_FAILED", key });
      }
    }
    // F1: revoking durable-memory consent is an immediate bounded purge, not a
    // cosmetic toggle. Any failure is visible and context use remains fail-closed.
    if (["mentor_memory_store", "mentor_memory_unfinished", "mentor_memory_candidates"].includes(key) && !granted) {
      try {
        const purged = await require("./agent/memory/runtime").revoke(auth.user.id, key);
        identityRepo.audit("memory_consent_purge", auth.user.id, { key, deleted: purged.deleted || 0 }, req.ip);
        purgeInfo = { memory_deleted: purged.deleted || 0 };
      } catch (e6) {
        identityRepo.audit("memory_consent_purge_failed", auth.user.id, { key, message: String(e6 && e6.message).slice(0, 120) }, req.ip);
        return res.status(500).json({ ok: false, error: "PURGE_FAILED", key });
      }
    }
    // F2: every relevant revoke is synchronous and fail-closed. The store and
    // construct keys erase their bounded chains; handoff revoke blocks preview.
    if (["f2_shadow_store", "f2_shadow_b1_dictation", "f2_shadow_b2_context_transfer", "f2_shadow_planner_handoff"].includes(key) && !granted) {
      try {
        const purged = await require("./agent/evidence/runtime").revoke(auth.user.id, key);
        identityRepo.audit("f2_consent_purge", auth.user.id, { key, deleted: purged.deleted || 0 }, req.ip);
        purgeInfo = { f2_deleted: purged.deleted || 0 };
      } catch (e7) {
        identityRepo.audit("f2_consent_purge_failed", auth.user.id, { key, message: String(e7 && e7.message).slice(0, 120) }, req.ip);
        return res.status(500).json({ ok: false, error: "PURGE_FAILED", key });
      }
    }
    // CLG-P7.1a: отзыв telegram_delivery ОБЯЗАН гасить активные связки + невыгашенные токены
    // АТОМАРНО (критика: доставка авторизуется фактом активной связки, не живым consent — если
    // unlink упадёт, канал доставлял бы после отзыва = fail-open). Здесь каскад — honest-fail:
    // провал каскада → 500, consent-строка уже записана, но клиенту виден отказ (revoke не
    // «подтверждён» на уровне канала до успешного каскада; повтор безопасен — идемпотентен).
    if (key === channelLinkRepo.TELEGRAM_CONSENT_KEY && !granted) {
      try {
        const casc = await channelLinkRepo.revokeTelegramCascade(auth.user.id);
        // P7.2a (§8): revoke telegram_delivery ГАСИТ незакрытые challenges — старый prompt не
        // остаётся действующим правом записи (защита от write — уже в submitAnswer recheck; это
        // явная зачистка слота). Best-effort: провал не откатывает подтверждённый revoke.
        let cancelledChallenges = 0;
        try { cancelledChallenges = await agentChallengeRepo.cancelOpenForUser(auth.user.id); } catch (_) {}
        try { await identityRepo.bumpUserAuthContextVersion(auth.user.id); } catch (_) {} // P8.1: invalidate miniapp sessions
        identityRepo.audit("telegram_consent_cascade", auth.user.id, { ...casc, challenges: cancelledChallenges }, req.ip);
        purgeInfo = { telegram_revoked_links: casc.links, telegram_revoked_tokens: casc.tokens };
      } catch (e3) {
        identityRepo.audit("telegram_consent_cascade_failed", auth.user.id, { message: String(e3 && e3.message).slice(0, 120) }, req.ip);
        return res.status(500).json({ ok: false, error: "TELEGRAM_UNLINK_FAILED", message: "consent recorded; channel unlink failed — retry" });
      }
    }
    const consents = await identityRepo.listConsents(auth.user.id);
    res.json({ ok: true, consents: consents.current, ...(purgeInfo ? { explanations: purgeInfo } : {}) });
  } catch (e) { res.status(400).json({ ok: false, error: "CONSENT_FAILED", message: e.message }); }
});

// Full user-stream export (recon §5 — working function from day one, not a promise).
app.get("/api/account/export", async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const data = await identityRepo.exportUserData(auth.user.id);
    identityRepo.audit("account_export", auth.user.id, { tables: data.table_list.length }, req.ip);
    res.set("Content-Disposition", `attachment; filename="linguistpro-export-${auth.user.id}.json"`);
    res.json({ ok: true, ...data });
  } catch (e) { res.status(500).json({ ok: false, error: "EXPORT_FAILED", message: e.message }); }
});

// forget-the-stream account deletion (recon §1.3 carve-out (а) + §11 deletion-journal).
// The durable record of the erasure is deletion_journal (audit_log cascade-deletes with the user).
app.post("/api/account/delete", async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  if (String((req.body && req.body.confirm) || "") !== "DELETE") {
    return res.status(400).json({ ok: false, error: "CONFIRM_REQUIRED", message: 'Pass {"confirm":"DELETE"}.' });
  }
  try {
    // CLG-P7.1a delete-completeness: NULL-user bot_action_log строки несут telegram_chat_id
    // (PII непривязанного чата) — user_id-sweep их не достаёт. Чистим по chat_id связок ДО
    // каскада (пока channel_links ещё существуют). Провал НЕ молчит, но не блокирует delete
    // (основной sweep всё равно снесёт user-scoped строки).
    try {
      const purged = await channelLinkRepo.purgeTelegramTraceForUser(auth.user.id);
      identityRepo.audit("telegram_trace_purge", auth.user.id, purged, req.ip);
    } catch (e2) { identityRepo.audit("telegram_trace_purge_failed", auth.user.id, { message: String(e2 && e2.message).slice(0, 120) }, req.ip); }
    const { tables } = await identityRepo.deleteUserData(auth.user.id);
    identityRepo.audit("account_delete", null, { tables: tables.length }, req.ip);   // user_id=null: the row must survive the cascade
    setSessionCookie(req, res, "", 0);
    res.json({ ok: true, tablesPurged: tables });
  } catch (e) { res.status(500).json({ ok: false, error: "DELETE_FAILED", message: e.message }); }
});

// ============================================================================
// CLG-P2 — Cloud Event Log ingest + read-back (AI_MENTOR_RECON_2026_07_04.md §6/§9).
// Server mirror until the CLG-P3 lossless gate (§4.6 canon transition): nothing
// learner-facing reads these rows yet. user_id is derived ONLY from the session
// principal; a batch carrying a foreign user_id is rejected wholesale (B2).
// Rate-limited from day one (recon: лимиты обязательны с введения эндпоинта).
// ============================================================================
const learnerLogRepo = require("./db/learnerLogRepo");
const rlLearnerIngest = makeRateLimiter({ windowMs: 60_000, max: 60, name: "learner-ingest" });
const rlLearnerRead = makeRateLimiter({ windowMs: 60_000, max: 120, name: "learner-read" });

app.post("/api/learner/ingest", rlLearnerIngest, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const body = req.body || {};
  // B2 — a caller-supplied user_id is NEVER authorization: mismatch → 403, zero writes.
  const claimed = [];
  if (body.user_id != null) claimed.push(String(body.user_id));
  for (const r of (Array.isArray(body.review_log) ? body.review_log : [])) if (r && r.user_id != null) claimed.push(String(r.user_id));
  for (const e of (Array.isArray(body.learner_events) ? body.learner_events : [])) if (e && e.user_id != null) claimed.push(String(e.user_id));
  if (claimed.some((u) => u !== auth.user.id)) {
    return res.status(403).json({ ok: false, error: "USER_ID_MISMATCH", message: "user_id is derived from the session; do not send it." });
  }
  try {
    const out = await learnerLogRepo.ingestBatch(auth.user.id, auth.session.deviceId, body);
    if (out && out.ok === false) return res.status(400).json(out);
    // CLG-P4 — maintain the derived server projections in the SAME request (recon §4.4 chain:
    // review_log → FSRS replay → srs_projections). Replayed batches carry no new_item_keys.
    if (out && Array.isArray(out.new_item_keys) && out.new_item_keys.length) {
      // P7.0a: провал пересчёта НЕ молчит (критика wf_1bf34023 — «тихий 0»): до annul
      // stale-проекция значила «не хватает последнего review» и самочинилась следующим
      // ingest-ом; с annul она значит «фантомное событие сохранено в проекции».
      try { await learnerProjectionRepo.recomputeForKeys(auth.user.id, out.new_item_keys); }
      catch (e) {
        out.projections_recompute_failed = true;
        console.error("[ingest] projections recompute failed:", e && e.message);
      }
      delete out.new_item_keys;   // internal detail, not part of the API contract
    }
    res.json(out);
  } catch (e) {
    res.status(500).json({ ok: false, error: "INGEST_FAILED", message: e.message });
  }
});

// CLG-P4 — derived-projection surface + the REAL-PROFILE oracle (recon §9 CLG-P4 gate).
const learnerProjectionRepo = require("./db/learnerProjectionRepo");
const rlLearnerProj = makeRateLimiter({ windowMs: 60_000, max: 30, name: "learner-projections" });

app.get("/api/learner/projections", rlLearnerProj, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const rows = await learnerProjectionRepo.listProjections(auth.user.id, {
      dueBeforeMs: req.query.due_before ? Number(req.query.due_before) : null, limit: req.query.limit,
    });
    res.json({ ok: true, rows });
  } catch (e) { res.status(500).json({ ok: false, error: "PROJECTIONS_FAILED", message: e.message }); }
});

app.post("/api/learner/projections/rebuild", rlLearnerProj, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try { res.json({ ok: true, ...(await learnerProjectionRepo.rebuildAll(auth.user.id)) }); }
  catch (e) { res.status(500).json({ ok: false, error: "REBUILD_FAILED", message: e.message }); }
});

// Live oracle on the principal's REAL data: fresh replay(log) vs the ingest-maintained stored
// projection. Surfaced in the Room's ☁ modal so the owner's profile continuously re-proves
// replay==stored on every sync (the recon's «на реальном профиле» requirement, always-on).
app.get("/api/learner/oracle", rlLearnerProj, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try { res.json({ ok: true, ...(await learnerProjectionRepo.oracle(auth.user.id, { sample: req.query.sample })) }); }
  catch (e) { res.status(500).json({ ok: false, error: "ORACLE_FAILED", message: e.message }); }
});

// ============================================================================
// CLG-P5 — Learner Graph API (AI_MENTOR_RECON §9 CLG-P5): read-only views every
// cloud client (agent P6+, push P4.5, Mini App P8) consumes. Honesty: the server
// serves only what it holds — memory axis (srs_projections) + manual axis (mark
// fold, §4.7). Artifact-dependent views (recent sentences / reading progress /
// next text) arrive with CLG-P5.5 class-B artifacts, never fabricated here.
// ============================================================================
const learnerGraphRepo = require("./db/learnerGraphRepo");
const rlLearnerGraph = makeRateLimiter({ windowMs: 60_000, max: 60, name: "learner-graph" });

app.get("/api/learner/due", rlLearnerGraph, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const rows = await learnerGraphRepo.getDue(auth.user.id, { nowMs: req.query.now ? Number(req.query.now) : null, limit: req.query.limit });
    res.json({ ok: true, rows });
  } catch (e) { res.status(500).json({ ok: false, error: "DUE_FAILED", message: e.message }); }
});

app.get("/api/learner/known", rlLearnerGraph, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try { res.json({ ok: true, words: await learnerGraphRepo.getKnownWords(auth.user.id) }); }
  catch (e) { res.status(500).json({ ok: false, error: "KNOWN_FAILED", message: e.message }); }
});

app.get("/api/learner/weak", rlLearnerGraph, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try { res.json({ ok: true, rows: await learnerGraphRepo.getWeakWords(auth.user.id, { limit: req.query.limit }) }); }
  catch (e) { res.status(500).json({ ok: false, error: "WEAK_FAILED", message: e.message }); }
});

app.get("/api/learner/context", rlLearnerGraph, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try { res.json({ ok: true, ...(await learnerGraphRepo.getAgentContext(auth.user.id, { nowMs: req.query.now ? Number(req.query.now) : null })) }); }
  catch (e) { res.status(500).json({ ok: false, error: "CONTEXT_FAILED", message: e.message }); }
});

// ============================================================================
// CLG-P6 prep — серверный keying/resolver-стек (AI_MENTOR_RECON §7 «Границы
// item_key»): сервер сам выводит item_key для НОВЫХ слов на том же датасете и
// тех же pure-модулях, что браузер (notes-autogen + lemma-canon + pealim-infl-v12
// + function-links). Снимает ограничение «агент оперирует только существующими
// item_key». Stateless (DB не трогает); датасет lazy-load + idle-выгрузка (R16).
// Гейт: smoke:server-keying (parity vs reference-бандл build-notes).
// ============================================================================
const keyingService = require("./db/keyingService");
const rlLearnerKeying = makeRateLimiter({ windowMs: 60_000, max: 30, name: "learner-keying" });

app.post("/api/learner/keying/resolve", rlLearnerKeying, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const words = Array.isArray(req.body && req.body.words) ? req.body.words : null;
  if (!words || !words.length) return res.status(400).json({ ok: false, error: "NO_WORDS" });
  if (words.length > keyingService.MAX_WORDS) {
    return res.status(400).json({ ok: false, error: "TOO_MANY_WORDS", max: keyingService.MAX_WORDS });
  }
  try { res.json({ ok: true, ...(await keyingService.resolveWords(words)) }); }
  catch (e) { res.status(500).json({ ok: false, error: "KEYING_FAILED", message: e.message }); }
});

app.get("/api/learner/keying/status", rlLearnerKeying, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  res.json({ ok: true, ...keyingService.status() });
});

// ============================================================================
// CLG-P6 — Agent Runtime, слайс 1 (AI_MENTOR_RECON §9 «принятый план», owner
// brief 2026-07-05): сценарий /plan (read-only, НЕ пишет grade/review_log) +
// status. LLM → tool router → закрытые инструменты (agent/tools.js); user_id
// только из принципала; cost ledger pre-call reserve (§11); LLM-less fallback.
// Гейт: smoke:agent-plan (honest counts, degradation, лимиты, stdout-гигиена).
// ============================================================================
const agentRuntime = require("./agent/runtime");
const cp0Observer = require("./agent/controlPlane/observer");
const memoryRuntime = require("./agent/memory/runtime");
const evidenceRuntime = require("./agent/evidence/runtime");
evidenceRuntime.validateStartupConfig();
const rlAgent = makeRateLimiter({ windowMs: 60_000, max: 20, name: "agent" });
const rlMemory = makeRateLimiter({ windowMs: 60_000, max: 40, name: "agent-memory" });
const rlEvidence = makeRateLimiter({ windowMs: 60_000, max: 30, name: "agent-evidence" });

app.post("/api/agent/plan", rlAgent, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const ctx = _agentByokCtx(req, res, auth); if (!ctx) return;
  try { res.json(await agentRuntime.plan(ctx)); }
  catch (e) { res.status(500).json({ ok: false, error: "AGENT_PLAN_FAILED", message: e.message }); }
});

// CLG-P6.2 — /explain sentence (решение владельца 2026-07-06): scope-контракт ЖЁСТКИЙ —
// сервер принимает ТОЛЬКО scope_level='sentence_only' (явный, не дефолтный: это
// privacy-контракт, а не удобство); consent-провалы = 403 с точным кодом (fail-closed,
// НЕ тихая деградация — consent это не optional LLM-limit); неизвестный якорь = 404.
// PAS-A1: source='corpus' — общий артефакт (work_id+text_key+order_index, consent не
// нужен by-design); смешанный body-контракт → 400 (гейты путей не смешиваются).
// PAS-F1 — BYOK-ctx хелпер для ВСЕХ LLM-тратящих агент-endpoint'ов (критика R11-5:
// инъекция и валидация корректны ПО ПОСТРОЕНИЮ — один хелпер, забыть невозможно).
// Present-семантика (критика R16-04): byok !== undefined/null → ПОЛНАЯ валидация,
// ЛЮБАЯ деформация (не-объект, пустой/короткий key, provider вне enum, gemini без
// AIza) → 400 BYOK_INVALID — деградат НИКОГДА не проваливается тихо на серверный
// путь (молчаливое заимствование серверного бюджета). Ключ не логируется и не
// попадает в ответ. Возврат: ctx | null (ответ уже отправлен).
const BYOK_PROVIDERS = new Set(["openrouter", "gemini"]);
function _agentByokCtx(req, res, auth) {
  const ctx = { userId: auth.user.id, deviceId: auth.session.deviceId };
  const b = (req.body || {}).byok;
  if (b === undefined || b === null) return ctx;   // полностью отсутствует → серверный путь
  const bad = () => { res.status(400).json({ ok: false, error: "BYOK_INVALID" }); return null; };
  if (typeof b !== "object" || Array.isArray(b)) return bad();
  const provider = String(b.provider || "");
  if (!BYOK_PROVIDERS.has(provider)) return bad();
  const key = typeof b.key === "string" ? b.key.trim() : "";
  if (key.length < 20 || key.length > 200 || !/^[\x21-\x7e]+$/.test(key)) return bad();
  // Gemini: классический AIza-формат ИЛИ новый AQ.-формат Google (live-verified 2026-07-13:
  // AI Studio выдаёт AQ.-ключи, они работают против generativelanguage.googleapis.com)
  if (provider === "gemini" && !(key.startsWith("AIza") || key.startsWith("AQ."))) return bad();
  ctx.byok = { provider, key };
  return ctx;
}

// Отдельный limiter explain-семьи: rlAgent 20/мин делится с Mentor-Home GET'ами и
// душил бы интерактивную сессию чтения (критика wf_35f46603; прецедент rlAgentReview).
const rlAgentExplain = makeRateLimiter({ windowMs: 60_000, max: 40, name: "agent-explain" });
app.post("/api/agent/explain", rlAgentExplain, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const b = req.body || {};
  if (String(b.scope_level || "") !== "sentence_only") {
    return res.status(400).json({ ok: false, error: "UNSUPPORTED_EXPLAIN_SCOPE", supported: ["sentence_only"] });
  }
  const isCorpus = String(b.source || "") === "corpus";
  if (!isCorpus && b.work_id != null) return res.status(400).json({ ok: false, error: "BAD_SOURCE_MIX" });
  const textKey = String(b.text_key || "").trim();
  const orderIndex = Number(b.order_index);
  if (!textKey || !Number.isFinite(orderIndex)) {
    return res.status(400).json({ ok: false, error: "BAD_ANCHOR" });
  }
  if (isCorpus && !String(b.work_id || "").trim()) return res.status(400).json({ ok: false, error: "BAD_ANCHOR" });
  // PAS-B1 — опциональный точный якорь Студии (row_id бандла; кэш order_index на
  // клиенте протухает при реордере). Личный путь only; мусорный формат → игнор (мягко).
  const rowIdRaw = !isCorpus && b.sentence_row_id != null ? String(b.sentence_row_id).trim() : "";
  const rowId = /^[\w-]{1,64}$/.test(rowIdRaw) ? rowIdRaw : null;
  try {
    const ctx = _agentByokCtx(req, res, auth); if (!ctx) return;
    const r = await agentRuntime.explain(ctx,
      { text_key: textKey, order_index: orderIndex, ...(rowId ? { row_id: rowId } : {}),
        ...(isCorpus ? { source: "corpus", work_id: String(b.work_id).trim() } : {}) });
    if (!r.ok) {
      const code = String(r.error || "");
      if (code === "CLOUD_TEXTS_CONSENT_REQUIRED" || code === "AGENT_READ_TEXTS_CONSENT_REQUIRED") return res.status(403).json(r);
      if (code === "TEXT_NOT_IN_CLOUD" || code === "SENTENCE_NOT_FOUND" ||
          code === "CORPUS_WORK_NOT_FOUND" || code === "CORPUS_SENTENCE_NOT_FOUND") return res.status(404).json(r);
      if (code === "CORPUS_WORK_TOO_LARGE") return res.status(413).json(r);
      if (code === "BAD_ANCHOR" || code === "BAD_WORK_ID" || code === "BAD_TEXT_KEY" || code === "BAD_CORPUS") return res.status(400).json(r);
      return res.status(500).json(r);
    }
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_EXPLAIN_FAILED", message: e.message }); }
});

// PAS-A2 — bounded follow-up (≤3 ходов, серверный счётчик): клиент шлёт ТОЛЬКО
// {explanation_id, question}; pack пересобирается сервером (consent-recheck на каждый
// ход личного пути). Фолбэка нет по природе — коды честные.
app.post("/api/agent/explain/followup", rlAgentExplain, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const b = req.body || {};
  try {
    const ctx = _agentByokCtx(req, res, auth); if (!ctx) return;
    const r = await agentRuntime.explainFollowup(ctx,
      { explanation_id: b.explanation_id, question: b.question });
    if (!r.ok) {
      const code = String(r.error || "");
      if (code === "CLOUD_TEXTS_CONSENT_REQUIRED" || code === "AGENT_READ_TEXTS_CONSENT_REQUIRED") return res.status(403).json(r);
      if (code === "EXPLANATION_NOT_FOUND" || code === "TEXT_NOT_IN_CLOUD" || code === "SENTENCE_NOT_FOUND" ||
          code === "CORPUS_WORK_NOT_FOUND" || code === "CORPUS_SENTENCE_NOT_FOUND") return res.status(404).json(r);
      if (code === "EXPLANATION_PURGED") return res.status(410).json(r);
      if (code === "FOLLOWUP_LIMIT" || code === "USER_LIMIT" || code === "GLOBAL_LIMIT") return res.status(429).json(r);
      if (code === "LLM_UNAVAILABLE") return res.status(503).json(r);
      if (code === "BYOK_FAILED") return res.status(502).json(r);   // PAS-F1: фейл ключа пользователя
      if (code === "BAD_QUESTION" || code === "QUESTION_TOO_LONG") return res.status(400).json(r);
      return res.status(500).json(r);
    }
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_FOLLOWUP_FAILED", message: e.message }); }
});

// PAS-A3 — «проверь меня по абзацу» (advisory). Корпус (work_id) — public domain;
// ЛИЧНЫЙ текст (без work_id) — решение владельца 2026-07-12: окно ≤5 строк за двойным
// consent (scope sentence_window_5). Никогда не пишет review_log; ключ ответа =
// утверждение LLM (плашка «не оценка» обязательна на клиенте).
app.post("/api/agent/comprehension", rlAgentExplain, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const b = req.body || {};
  if (b.text_key == null) return res.status(400).json({ ok: false, error: "BAD_ANCHOR" });
  const orderIndex = Number(b.order_index);
  if (!Number.isFinite(orderIndex)) return res.status(400).json({ ok: false, error: "BAD_ANCHOR" });
  const isCorpus = b.work_id != null && String(b.work_id).trim();
  try {
    const ctx = _agentByokCtx(req, res, auth); if (!ctx) return;
    const r = await agentRuntime.comprehension(ctx,
      { ...(isCorpus ? { work_id: String(b.work_id).trim() } : {}), text_key: String(b.text_key).trim(), order_index: orderIndex });
    if (!r.ok) {
      const code = String(r.error || "");
      if (code === "CLOUD_TEXTS_CONSENT_REQUIRED" || code === "AGENT_READ_TEXTS_CONSENT_REQUIRED") return res.status(403).json(r);
      if (code === "CORPUS_WORK_NOT_FOUND" || code === "CORPUS_SENTENCE_NOT_FOUND" ||
          code === "TEXT_NOT_IN_CLOUD" || code === "SENTENCE_NOT_FOUND") return res.status(404).json(r);
      if (code === "CORPUS_WORK_TOO_LARGE") return res.status(413).json(r);
      if (code === "BAD_ANCHOR" || code === "BAD_WORK_ID" || code === "BAD_TEXT_KEY" || code === "BAD_CORPUS") return res.status(400).json(r);
      if (code === "USER_LIMIT" || code === "GLOBAL_LIMIT") return res.status(429).json(r);
      if (code === "LLM_UNAVAILABLE") return res.status(503).json(r);
      if (code === "COMPREHENSION_INVALID" || code === "BYOK_FAILED") return res.status(502).json(r);
      return res.status(500).json(r);
    }
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_COMPREHENSION_FAILED", message: e.message }); }
});

// PAS-A4 — «объяснить это слово в этом предложении» (tap-карточка Зала). Те же
// source-правила и коды, что /explain; surface обязателен (иврит), displayed-чтение
// карточки — опциональный client_card-факт (sanitize внутри explainer).
app.post("/api/agent/explain-word", rlAgentExplain, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const b = req.body || {};
  const isCorpus = String(b.source || "") === "corpus";
  if (!isCorpus && b.work_id != null) return res.status(400).json({ ok: false, error: "BAD_SOURCE_MIX" });
  const textKey = String(b.text_key || "").trim();
  const orderIndex = Number(b.order_index);
  if (!textKey || !Number.isFinite(orderIndex)) return res.status(400).json({ ok: false, error: "BAD_ANCHOR" });
  if (isCorpus && !String(b.work_id || "").trim()) return res.status(400).json({ ok: false, error: "BAD_ANCHOR" });
  try {
    const ctx = _agentByokCtx(req, res, auth); if (!ctx) return;
    const r = await agentRuntime.explainWord(ctx,
      { text_key: textKey, order_index: orderIndex, surface: b.surface, displayed: b.displayed,
        ...(isCorpus ? { source: "corpus", work_id: String(b.work_id).trim() } : {}) });
    if (!r.ok) {
      const code = String(r.error || "");
      if (code === "CLOUD_TEXTS_CONSENT_REQUIRED" || code === "AGENT_READ_TEXTS_CONSENT_REQUIRED") return res.status(403).json(r);
      if (code === "TEXT_NOT_IN_CLOUD" || code === "SENTENCE_NOT_FOUND" ||
          code === "CORPUS_WORK_NOT_FOUND" || code === "CORPUS_SENTENCE_NOT_FOUND") return res.status(404).json(r);
      if (code === "CORPUS_WORK_TOO_LARGE") return res.status(413).json(r);
      if (code === "BAD_ANCHOR" || code === "BAD_WORK_ID" || code === "BAD_TEXT_KEY" || code === "BAD_CORPUS" || code === "BAD_WORD") return res.status(400).json(r);
      return res.status(500).json(r);
    }
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_EXPLAIN_WORD_FAILED", message: e.message }); }
});

// PAS-B2 — «что стоит выучить из этого текста» (advisory-резюме; Студия). Тонкий glue:
// вся логика в agent/material.js (авто-скан log-hygiene); дайджест-tool внутри держит
// ТРОЙНОЙ consent fail-closed (agent_read_texts_digest — отдельный durable-ключ).
app.post("/api/agent/study-summary", rlAgentExplain, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const textKey = String((req.body && req.body.text_key) || "").trim();
  if (!textKey) return res.status(400).json({ ok: false, error: "BAD_ANCHOR" });
  try {
    const ctx = _agentByokCtx(req, res, auth); if (!ctx) return;
    const r = await agentRuntime.studySummary(ctx, { text_key: textKey });
    if (!r.ok) {
      const code = String(r.error || "");
      if (code === "CLOUD_TEXTS_CONSENT_REQUIRED" || code === "AGENT_READ_TEXTS_CONSENT_REQUIRED" ||
          code === "AGENT_READ_TEXTS_DIGEST_CONSENT_REQUIRED") return res.status(403).json(r);
      if (code === "TEXT_NOT_IN_CLOUD" || code === "SENTENCE_NOT_FOUND") return res.status(404).json(r);
      if (code === "BAD_ANCHOR" || code === "ARTIFACT_UNREADABLE") return res.status(400).json(r);
      return res.status(500).json(r);
    }
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_STUDY_SUMMARY_FAILED", message: e.message }); }
});

// PAS-B3 — «упрощённый пересказ» окна ≤5 строк: корпус (public domain, consent-классов
// нет) И личный текст (записанное решение владельца 2026-07-12: window_5 = понимание +
// пересказ; двойной consent fail-closed в репо). Пересказ без LLM невозможен → честные
// 429/503, фолбэка нет (паттерн followup).
app.post("/api/agent/draft-retell", rlAgentExplain, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const b = req.body || {};
  try {
    const ctx = _agentByokCtx(req, res, auth); if (!ctx) return;
    const r = await agentRuntime.draftRetell(ctx,
      { work_id: b.work_id, text_key: b.text_key, order_index: b.order_index });
    if (!r.ok) {
      const code = String(r.error || "");
      if (code === "CLOUD_TEXTS_CONSENT_REQUIRED" || code === "AGENT_READ_TEXTS_CONSENT_REQUIRED") return res.status(403).json(r);
      if (code === "TEXT_NOT_IN_CLOUD" || code === "SENTENCE_NOT_FOUND" ||
          code === "CORPUS_WORK_NOT_FOUND" || code === "CORPUS_SENTENCE_NOT_FOUND") return res.status(404).json(r);
      if (code === "CORPUS_WORK_TOO_LARGE") return res.status(413).json(r);
      if (code === "BAD_ANCHOR" || code === "BAD_WORK_ID" || code === "BAD_TEXT_KEY" || code === "BAD_CORPUS") return res.status(400).json(r);
      if (code === "USER_LIMIT" || code === "GLOBAL_LIMIT") return res.status(429).json(r);
      if (code === "LLM_UNAVAILABLE" || code === "NO_API_KEY") return res.status(503).json(r);
      if (code === "DRAFT_INVALID" || code === "BYOK_FAILED") return res.status(502).json(r);
      return res.status(500).json(r);
    }
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_DRAFT_RETELL_FAILED", message: e.message }); }
});

// PAS-C1 — grounded-диалог «обсуждение прочитанного» (agent/roleplay.js; спека
// PAS_SLICE_C_SPEC v2). Сессия — эфемерный класс D в RAM модуля (не персистится,
// TTL+sweep); start БЕЗ LLM (детерминированный opening); каждый ход — consent-recheck
// по якорю + scenario-cap ROLEPLAY_DAILY поверх дневной квоты. Тонкий glue —
// логика в agent/roleplay.js (авто-скан log-hygiene), маппинг кодов честный.
function _roleplayHttpCode(code) {
  if (code === "CLOUD_TEXTS_CONSENT_REQUIRED" || code === "AGENT_READ_TEXTS_CONSENT_REQUIRED") return 403;
  if (code === "SESSION_NOT_FOUND" || code === "TEXT_NOT_IN_CLOUD" || code === "SENTENCE_NOT_FOUND" ||
      code === "CORPUS_WORK_NOT_FOUND" || code === "CORPUS_SENTENCE_NOT_FOUND") return 404;
  if (code === "TURN_IN_FLIGHT") return 409;
  if (code === "CORPUS_WORK_TOO_LARGE") return 413;
  if (code === "TURNS_LIMIT" || code === "ROLEPLAY_DAILY_LIMIT" || code === "USER_LIMIT" || code === "GLOBAL_LIMIT") return 429;
  if (code === "LLM_UNAVAILABLE" || code === "NO_API_KEY") return 503;
  if (code === "ROLEPLAY_INVALID" || code === "BYOK_FAILED") return 502;
  if (code === "BAD_ANCHOR" || code === "BAD_WORK_ID" || code === "BAD_TEXT_KEY" || code === "BAD_CORPUS" ||
      code === "BAD_MESSAGE" || code === "MESSAGE_TOO_LONG" || code === "ARTIFACT_UNREADABLE") return 400;
  return 500;
}
app.post("/api/agent/roleplay/start", rlAgentExplain, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const b = req.body || {};
  try {
    const r = await agentRuntime.roleplayStart({ userId: auth.user.id, deviceId: auth.session.deviceId },
      { work_id: b.work_id, text_key: b.text_key, order_index: b.order_index, sentence_row_id: b.sentence_row_id });
    if (!r.ok) return res.status(_roleplayHttpCode(String(r.error || ""))).json(r);
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_ROLEPLAY_START_FAILED", message: e.message }); }
});
app.post("/api/agent/roleplay/turn", rlAgentExplain, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const b = req.body || {};
  try {
    const ctx = _agentByokCtx(req, res, auth); if (!ctx) return;
    const r = await agentRuntime.roleplayTurn(ctx,
      { session_id: b.session_id, message: b.message });
    if (!r.ok) return res.status(_roleplayHttpCode(String(r.error || ""))).json(r);
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_ROLEPLAY_TURN_FAILED", message: e.message }); }
});
app.get("/api/agent/roleplay/state", rlAgent, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const r = await agentRuntime.roleplayState({ userId: auth.user.id, deviceId: auth.session.deviceId },
      { session_id: req.query.session_id });
    if (!r.ok) return res.status(_roleplayHttpCode(String(r.error || ""))).json(r);
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_ROLEPLAY_STATE_FAILED", message: e.message }); }
});
app.post("/api/agent/roleplay/stop", rlAgentExplain, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    res.json(await agentRuntime.roleplayStop({ userId: auth.user.id, deviceId: auth.session.deviceId },
      { session_id: (req.body || {}).session_id }));
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_ROLEPLAY_STOP_FAILED", message: e.message }); }
});

// PAS-C2 — constrained writing (agent/writing.js): targets — детерминированный
// выбор целей (без LLM/леджера); review — advisory-разбор поверх forward-матча
// (класс D: submission не персистится; review_log/agent_explanations не пишутся).
app.get("/api/agent/writing/targets", rlAgent, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try { res.json(await agentRuntime.writingTargets({ userId: auth.user.id, deviceId: auth.session.deviceId })); }
  catch (e) { res.status(500).json({ ok: false, error: "AGENT_WRITING_TARGETS_FAILED", message: e.message }); }
});
app.post("/api/agent/writing/review", rlAgentExplain, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const b = req.body || {};
  try {
    const ctx = _agentByokCtx(req, res, auth); if (!ctx) return;
    const r = await agentRuntime.writingReview(ctx,
      { targets: b.targets, text: b.text });
    if (!r.ok) {
      const code = String(r.error || "");
      if (code === "BAD_TEXT" || code === "TEXT_TOO_LONG" || code === "NOT_HEBREW_ENOUGH" ||
          code === "BAD_TARGETS" || code === "TARGET_NOT_ELIGIBLE") return res.status(400).json(r);
      if (code === "USER_LIMIT" || code === "GLOBAL_LIMIT") return res.status(429).json(r);
      return res.status(500).json(r);
    }
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_WRITING_REVIEW_FAILED", message: e.message }); }
});

// Wave 2 LB0 — one bounded, editable lesson draft from 1–3 explicitly selected
// existing sources. The service is read-only for learner truth and returns an
// ephemeral typed artifact; browser session storage owns the 24-hour draft.
app.post("/api/agent/lesson-builder/build", rlAgentExplain, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const ctx = _agentByokCtx(req, res, auth); if (!ctx) return;
    const r = await agentRuntime.buildLesson(ctx, req.body || {});
    if (!r.ok) {
      const code = String(r.error || "");
      if (code === "CLOUD_TEXTS_CONSENT_REQUIRED" || code === "AGENT_READ_TEXTS_CONSENT_REQUIRED" ||
          code === "AGENT_READ_TEXTS_DIGEST_CONSENT_REQUIRED") return res.status(403).json(r);
      if (code === "TEXT_NOT_IN_CLOUD" || code === "SENTENCE_NOT_FOUND" || code === "CORPUS_WORK_NOT_FOUND" ||
          code === "CORPUS_SENTENCE_NOT_FOUND") return res.status(404).json(r);
      if (code === "CORPUS_WORK_TOO_LARGE" || code === "SOURCE_SELECTION_TOO_LARGE" || code === "SOURCE_ANCHOR_TOO_LARGE" ||
          code === "SOURCE_TOTAL_TOO_LARGE") return res.status(413).json(r);
      if (code === "LESSON_BUILDER_DISABLED") return res.status(503).json(r);
      if (code === "GRAMMAR_TARGET_REQUIRED" || code === "GRAMMAR_TARGET_UNAVAILABLE") return res.status(409).json(r);
      if (code.startsWith("BAD_") || code === "DUPLICATE_SOURCE" || code === "SOURCE_SELECTION_TOO_SHORT" ||
          code === "ARTIFACT_UNREADABLE") return res.status(400).json(r);
      return res.status(500).json(r);
    }
    res.json(r);
  } catch (_) { res.status(500).json({ ok: false, error: "LESSON_BUILD_FAILED" }); }
});

// PAS-F1 — проверка BYOK-ключа (owner-фидбэк 2026-07-13: «премиальное ощущение» =
// мгновенный вердикт после сохранения). Микро-вызов НА КЛЮЧЕ ПОЛЬЗОВАТЕЛЯ через
// llmGate (byok-ветка: серверная квота не резервируется; телеметрия kind='llm_call_byok'
// scenario='byok_check'); byok ОБЯЗАТЕЛЕН — без него 400 (серверный ключ проверять нечего).
app.post("/api/agent/byok/check", rlAgent, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const ctx = _agentByokCtx(req, res, auth); if (!ctx) return;
  if (!ctx.byok) return res.status(400).json({ ok: false, error: "BYOK_REQUIRED" });
  try {
    await cp0Observer.observe({ ...ctx, surface: "pwa" }, { scenarioId: "provider.byok_check", surface: "pwa" }, async () => {
      const llmGate = require("./agent/llmGate");
      const g = await llmGate.gatedGenerate(ctx, {
        scenario: "byok_check",
        system: "Reply with exactly: OK",
        prompt: "ping",
        maxOutputTokens: 64,   // 16 не хватало даже thinking-off моделям
      });
      if (g.phase === "kill") return res.status(503).json({ ok: false, error: "KILL_SWITCH" });
      if (g.phase === "byok") return res.status(502).json({ ok: false, error: "BYOK_FAILED", provider_error: g.provider_error });
      if (g.phase !== "ok") return res.status(502).json({ ok: false, error: "BYOK_FAILED" });
      return res.json({ ok: true, provider: g.out.provider, model: g.out.model, key_source: "byok" });
    });
  } catch (e) { res.status(500).json({ ok: false, error: "BYOK_CHECK_FAILED", message: e.message }); }
});

// PAS-D1 — next-text (agent/nextText.js): скоринг детерминирован НА КЛИЕНТЕ (единый
// движок corpus-vocab.js), сервер валидирует иды/числа и деривит ВЕСЬ текстовый
// grounding сам (index по построению той же версии, R11); advisory класса A.
app.post("/api/agent/next-text/explain", rlAgentExplain, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const ctx = _agentByokCtx(req, res, auth); if (!ctx) return;
    const r = await agentRuntime.nextTextExplain(ctx, { pick: (req.body || {}).pick });
    if (!r.ok) {
      const code = String(r.error || "");
      if (code === "UNKNOWN_WORK" || code === "BAD_COV" || code === "BAD_KIND" || code === "BAD_FRONTIER") return res.status(400).json(r);
      if (code === "USER_LIMIT" || code === "GLOBAL_LIMIT") return res.status(429).json(r);
      if (code === "KILL_SWITCH" || code === "INDEX_UNAVAILABLE") return res.status(503).json(r);
      return res.status(502).json(r);
    }
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_NEXT_TEXT_FAILED", message: e.message }); }
});

app.get("/api/agent/status", rlAgent, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try { res.json({ ok: true, ...(await agentRuntime.status({ userId: auth.user.id })) }); }
  catch (e) { res.status(500).json({ ok: false, error: "AGENT_STATUS_FAILED", message: e.message }); }
});

app.get("/api/agent/tasks", rlAgent, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try { res.json({ ok: true, tasks: await agentRuntime.listTasks({ userId: auth.user.id }, { status: req.query.status, limit: req.query.limit }) }); }
  catch (e) { res.status(500).json({ ok: false, error: "AGENT_TASKS_FAILED", message: e.message }); }
});

app.post("/api/agent/profile", rlAgent, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    // PAS-D4: валидация в runtime (language enum, goals allowlist) → невалидное 400
    const r = await agentRuntime.updateProfile({ userId: auth.user.id }, req.body || {});
    if (!r.ok) return res.status(400).json(r);
    res.json({ ok: true, profile: { mode: r.mode, language: r.language, depth: r.depth } });
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_PROFILE_FAILED", message: e.message }); }
});

// Wave 2 F1 — correctable continuity. First-party, deterministic and default-off.
function sendMemoryResult(res, out) {
  if (out && out.ok) return res.json(out);
  const code = String(out && out.error || "MEMORY_FAILED");
  const status = code === "MEMORY_NOT_FOUND" ? 404
    : code === "STATE_CONFLICT" || code === "IDEMPOTENCY_CONFLICT" ? 409
    : ["F1_DISABLED","F1_NOT_ALLOWLISTED","CONSENT_REQUIRED","CATEGORY_DISABLED","F1_CANDIDATES_DISABLED","F1_CONTEXT_DISABLED"].includes(code) ? 403
    : 400;
  return res.status(status).json(out || { ok:false,error:code });
}
function memoryError(res, e) {
  const code=String(e&&e.message||"MEMORY_FAILED");
  const known=/^(BAD_|MEMORY_|PENDING_|REVISION_|ACTION_|STATE_|IDEMPOTENCY_|SOURCE_|CONSENT_|CUSTOM_|F1_)/.test(code);
  return res.status(known?(code==="MEMORY_NOT_FOUND"?404:code==="STATE_CONFLICT"?409:400):500).json({ok:false,error:known?code:"MEMORY_FAILED"});
}
app.get("/api/agent/memory", rlMemory, async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;try{return sendMemoryResult(res,await memoryRuntime.list({userId:auth.user.id,surface:"pwa"},{status:req.query.status,limit:req.query.limit,before:req.query.before}));}catch(e){return memoryError(res,e);}});
app.post("/api/agent/memory", rlMemory, async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;if(!requireCsrf(req,res,auth))return;try{return sendMemoryResult(res,await memoryRuntime.create({userId:auth.user.id,surface:"pwa"},req.body||{}));}catch(e){return memoryError(res,e);}});
app.post("/api/agent/memory/proposals", rlMemory, async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;if(!requireCsrf(req,res,auth))return;try{return sendMemoryResult(res,await memoryRuntime.propose({userId:auth.user.id,surface:"pwa"}));}catch(e){return memoryError(res,e);}});
app.post("/api/agent/memory/:id/action", rlMemory, async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;if(!requireCsrf(req,res,auth))return;if(req.body&&("user_id" in req.body||"userId" in req.body))return res.status(403).json({ok:false,error:"USER_ID_FORBIDDEN"});try{return sendMemoryResult(res,await memoryRuntime.action({userId:auth.user.id,surface:"pwa"},req.params.id,req.body||{}));}catch(e){return memoryError(res,e);}});
app.get("/api/agent/memory/continue", rlMemory, async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;try{return sendMemoryResult(res,await memoryRuntime.continueItem({userId:auth.user.id,surface:"pwa"}));}catch(e){return memoryError(res,e);}});
app.get("/api/agent/memory/export", rlMemory, async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;try{const out=await memoryRuntime.exportMemory({userId:auth.user.id,surface:"pwa"});res.set("Content-Disposition",`attachment; filename="linguistpro-memory-${auth.user.id}.json"`);return res.json(out);}catch(e){return memoryError(res,e);}});
app.post("/api/agent/memory/delete-all", rlMemory, async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;if(!requireCsrf(req,res,auth))return;try{return sendMemoryResult(res,await memoryRuntime.deleteAll({userId:auth.user.id,surface:"pwa"},req.body||{}));}catch(e){return memoryError(res,e);}});

// Wave 2 F2 — bounded deterministic shadow evidence. No route writes review_log,
// projections, F1 memory, planner tasks, notifications or provider usage.
function sendEvidenceResult(res,out){if(out&&out.ok)return res.json(out);const code=String(out&&out.error||"F2_FAILED");const status=code==="F2_NOT_FOUND"?404:["STATE_CONFLICT","IDEMPOTENCY_CONFLICT","REQUEST_EXPIRED","ATTEMPT_FINAL","SOURCE_DRIFT"].includes(code)?409:["F2_DISABLED","F2_NOT_ALLOWLISTED","CONSENT_REQUIRED","CONSTRUCT_DISABLED","F2_CONTEXT_DISABLED"].includes(code)?403:400;return res.status(status).json(out||{ok:false,error:code});}
function evidenceError(res,e){const code=String(e&&e.message||"F2_FAILED");const known=/^(BAD_F2_|F2_|STATE_|REQUEST_|ATTEMPT_|SOURCE_|CONSENT_|CONFIRM_)/.test(code);return res.status(known?(code==="F2_NOT_FOUND"?404:code==="STATE_CONFLICT"?409:400):500).json({ok:false,error:known?code:"F2_FAILED"});}
app.get("/api/agent/evidence",rlEvidence,async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;try{return sendEvidenceResult(res,await evidenceRuntime.list({userId:auth.user.id,surface:"pwa"},{state:req.query.state,limit:req.query.limit,before:req.query.before}));}catch(e){return evidenceError(res,e);}});
app.post("/api/agent/evidence/scan",rlEvidence,async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;if(!requireCsrf(req,res,auth))return;try{return sendEvidenceResult(res,await evidenceRuntime.scan({userId:auth.user.id,surface:"pwa"},req.body||{}));}catch(e){return evidenceError(res,e);}});
app.get("/api/agent/evidence/offer",rlEvidence,async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;try{return sendEvidenceResult(res,await evidenceRuntime.offer({userId:auth.user.id,surface:"pwa"}));}catch(e){return evidenceError(res,e);}});
app.get("/api/agent/evidence/:id/audio",rlEvidence,async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;try{const out=await evidenceRuntime.audio({userId:auth.user.id,surface:"pwa"},req.params.id);if(!out||!out.ok)return sendEvidenceResult(res,out);const root=path.resolve(DATA_DIR,"audio-cache"),abs=path.resolve(root,out.assetKey+".mp3");if(!abs.startsWith(root+path.sep))return res.status(400).json({ok:false,error:"BAD_PATH"});fs.stat(abs,(err,st)=>{if(err||!st.isFile())return res.status(404).json({ok:false,error:"F2_AUDIO_UNAVAILABLE"});res.setHeader("Content-Type","audio/mpeg");res.setHeader("Content-Length",st.size);res.setHeader("Cache-Control","private, max-age=86400");fs.createReadStream(abs).pipe(res);});}catch(e){return evidenceError(res,e);}});
app.post("/api/agent/evidence/:id/action",rlEvidence,async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;if(!requireCsrf(req,res,auth))return;try{return sendEvidenceResult(res,await evidenceRuntime.action({userId:auth.user.id,surface:"pwa"},req.params.id,req.body||{}));}catch(e){return evidenceError(res,e);}});
app.post("/api/agent/evidence/:id/attempt",rlEvidence,async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;if(!requireCsrf(req,res,auth))return;try{return sendEvidenceResult(res,await evidenceRuntime.attempt({userId:auth.user.id,surface:"pwa"},req.params.id,req.body||{}));}catch(e){return evidenceError(res,e);}});
app.get("/api/agent/evidence/handoff-preview",rlEvidence,async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;try{return sendEvidenceResult(res,await evidenceRuntime.handoffPreview({userId:auth.user.id,surface:"pwa"}));}catch(e){return evidenceError(res,e);}});
app.get("/api/agent/evidence/export",rlEvidence,async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;try{const out=await evidenceRuntime.exportEvidence({userId:auth.user.id,surface:"pwa"});res.set("Content-Disposition",`attachment; filename="linguistpro-evidence-${auth.user.id}.json"`);return sendEvidenceResult(res,out);}catch(e){return evidenceError(res,e);}});
app.post("/api/agent/evidence/delete-all",rlEvidence,async(req,res)=>{const auth=await requireUser(req,res);if(!auth)return;if(!requireCsrf(req,res,auth))return;try{return sendEvidenceResult(res,await evidenceRuntime.deleteAll({userId:auth.user.id,surface:"pwa"},req.body||{}));}catch(e){return evidenceError(res,e);}});

// ============================================================================
// CLG-P9 «дом наставника» (MENTOR_HOME_P9_DECISION_2026_07_06). Оба endpoint'а
// read-only (MNAR: review_log не трогается), строго user-scoped из принципала.
// ============================================================================
// История объяснений: purge-aware — tombstone-строки после отзыва agent_read_texts
// отдаются честно помеченными (purged + причина), контент — никогда (R11).
app.get("/api/agent/explanations", rlAgent, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    res.json({ ok: true, ...(await agentRuntime.listExplanations({ userId: auth.user.id },
      { limit: req.query.limit, beforeRid: req.query.before_rid })) });
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_EXPLANATIONS_FAILED", message: e.message }); }
});

// Зачаток misconception-блока: агрегат construct_id из facts_used объяснений
// (purge-aware по построению: у purged-строк facts_used='[]') + plan-task payload;
// наружу — только известные реестру ids с серверными титулами (⊆ registry).
app.get("/api/agent/constructs/summary", rlAgent, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try { res.json({ ok: true, ...(await agentRuntime.constructsSummary({ userId: auth.user.id })) }); }
  catch (e) { res.status(500).json({ ok: false, error: "AGENT_CONSTRUCTS_FAILED", message: e.message }); }
});

// ============================================================================
// P7.0c — record_review_answer (TELEGRAM_P7_DECISION §P7.0c v2): запись ответа/
// annul через closed tool router → agent/reviewer → ШТАТНЫЙ ingest + recompute.
// Прод: выключено флагом AGENT_REVIEW_WRITE (403 FEATURE_FLAG_OFF) до решения
// владельца. Свой лимитер (write-путь сессии из ~20+ карточек; общий rlAgent
// 20/мин душил бы тренировку и флакал гейт). Маппинг кодов — паттерн /explain;
// abstain (gradable=false / ktiv-гейт) = 200 recorded:false — вердикт, не ошибка.
// ============================================================================
const rlAgentReview = makeRateLimiter({ windowMs: 60_000, max: 60, name: "agent-review" });
app.post("/api/agent/review", rlAgentReview, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  // BLOCKER-3 (критика wf_15f4c1ae): HTTP-эндпоинт НЕ разблокирует production. challenge_id —
  // bearer-токен, обошёл бы Telegram single-use reviewer/reply-binding/cooldown/consent-recheck;
  // production-каналы (dictate/reverse) заперты вне webhook-trusted пути. Реджектим ОБА здесь
  // (ctx без viaTelegramReview reviewer тоже отвергает — defense-in-depth) с явным 400.
  const body = req.body || {};
  if (body.challenge_id != null) return res.status(400).json({ ok: false, error: "CHALLENGE_ID_NOT_ALLOWED_HERE" });
  if (/^(dictate|reverse)(:|$)/.test(String(body.channel || ""))) return res.status(400).json({ ok: false, error: "PRODUCTION_CHANNEL_LOCKED" });
  try {
    const r = await agentRuntime.recordReview({ userId: auth.user.id, deviceId: auth.session.deviceId }, body);
    if (r && r.ok === false) {
      const code = String(r.error || "");
      const status = code === "TOOL_DISABLED" ? 403
        : (code === "UNKNOWN_ITEM" || code === "ANNUL_TARGET_NOT_FOUND") ? 404
        : (code === "TOOL_FAILED" || code === "UNKNOWN_TOOL") ? 500 : 400;
      return res.status(status).json(r);
    }
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_REVIEW_FAILED", message: e.message }); }
});

// ============================================================================
// CLG-P7.1a — Telegram channel: pairing (web-initiated + двусторонний confirm) +
// webhook (secret-before-parse, dedup+эффект атомарны, from.id rate, private-only).
// TELEGRAM_P7_1_PAIRING_SPEC v2 (owner flow-decision A 2026-07-07). Прод: без
// TELEGRAM_WEBHOOK_SECRET webhook = 503 fail-closed; без BOT_TOKEN — не отвечает.
// ============================================================================
const telegramRouter = require("./agent/telegram/router");
const telegramApi = require("./agent/telegram/api");
const rlTelegramPair = makeRateLimiter({ windowMs: 60_000, max: 20, name: "telegram-pair" });

// ── web: pair (session+CSRF) — consent telegram_delivery записывается ЗДЕСЬ, ДО минта токена ──
app.post("/api/agent/telegram/pair", rlTelegramPair, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  // consent — часть запроса pair (не отдельный молчаливый шаг): требуем явное согласие.
  if (!(req.body && req.body.consent === true)) {
    return res.status(400).json({ ok: false, error: "TELEGRAM_CONSENT_REQUIRED",
      consent_version: channelLinkRepo.TELEGRAM_CONSENT_VERSION });
  }
  try {
    // consent-строка со СЕРВЕРНОЙ версией (клиентская version игнорируется — критика)
    await identityRepo.recordConsent(auth.user.id, channelLinkRepo.TELEGRAM_CONSENT_KEY, true, channelLinkRepo.TELEGRAM_CONSENT_VERSION);
    identityRepo.audit("telegram_consent_grant", auth.user.id, { version: channelLinkRepo.TELEGRAM_CONSENT_VERSION }, req.ip);
    const tok = await channelLinkRepo.mintPairingToken(auth.user.id, auth.session.id || null);
    const uname = process.env.TELEGRAM_BOT_USERNAME || "LinguistProMentorBot";
    // сырой токен ТОЛЬКО в deep_link ответа (в БД — sha256); клиент открывает ссылку.
    res.json({ ok: true, deep_link: `https://t.me/${uname}?start=${tok.raw}`, expires_at: tok.expiresAt });
  } catch (e) { res.status(500).json({ ok: false, error: "TELEGRAM_PAIR_FAILED", message: e.message }); }
});

app.get("/api/agent/telegram/status", rlTelegramPair, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const uname = process.env.TELEGRAM_BOT_USERNAME || "LinguistProMentorBot";
    const botUrl = `https://t.me/${uname}`;
    const link = await channelLinkRepo.getLinkForUser(auth.user.id);
    const consents = await identityRepo.listConsents(auth.user.id);
    const _tgc = consents.current && consents.current[channelLinkRepo.TELEGRAM_CONSENT_KEY];
    const tgConsent = !!(_tgc && _tgc.granted);   // current[key] = {granted,version,at}, не булев
    if (!link) return res.json({ ok: true, linked: false, pending: false, consent: tgConsent, bot_url: botUrl });
    const mask = link.telegram_user_id ? String(link.telegram_user_id).slice(0, 3) + "···" : null;
    res.json({ ok: true, linked: link.status === "active", pending: link.status === "pending",
      telegram_user_masked: mask, consent: tgConsent, since: link.confirmed_at || link.created_at, bot_url: botUrl });
  } catch (e) { res.status(500).json({ ok: false, error: "TELEGRAM_STATUS_FAILED", message: e.message }); }
});

app.post("/api/agent/telegram/unlink", rlTelegramPair, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const r = await channelLinkRepo.unlinkByUser(auth.user.id);
    try { await agentChallengeRepo.cancelOpenForUser(auth.user.id); } catch (_) {}   // P7.2a: гасим challenges
    try { await identityRepo.bumpUserAuthContextVersion(auth.user.id); } catch (_) {} // P8.1: invalidate miniapp sessions
    identityRepo.audit("telegram_unlink", auth.user.id, r, req.ip);
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ ok: false, error: "TELEGRAM_UNLINK_FAILED", message: e.message }); }
});

// ============================================================================
// CLG-P8.1 — Telegram Mini App: auth exchange + BFF (TELEGRAM_MINI_APP_P8_1_SPEC).
// Separate cookie (lp_miniapp_session), fixed session_kind='telegram_miniapp',
// BFF /api/miniapp/* guarded by requireMiniappSession (never direct /api/learner/*).
// Everything fail-closed; nothing writes review_log. Owner-pilot: MINI_APP_ENABLED
// off by default + MINI_APP_OWNER_USER_IDS allowlist (by Telegram principal).
// ============================================================================
const miniappAuth = require("./agent/telegram/miniappAuth");

function miniappEnabled() { return process.env.MINI_APP_ENABLED === "1"; }
function miniappOwnerAllow() {
  return new Set(String(process.env.MINI_APP_OWNER_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean));
}
function miniappCfg() {
  return {
    maxAgeSec: Number(process.env.MINIAPP_INITDATA_MAX_AGE_SECONDS) || 3600,
    idleMs: (Number(process.env.MINIAPP_SESSION_IDLE_SECONDS) || 7200) * 1000,
    absoluteMs: (Number(process.env.MINIAPP_SESSION_ABSOLUTE_SECONDS) || 86400) * 1000,
  };
}
function getMiniappCookie(req) {
  const h = String(req.headers.cookie || "");
  for (const part of h.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() === "lp_miniapp_session") {
      try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch (_) { return part.slice(eq + 1).trim(); }
    }
  }
  return "";
}
function setMiniappCookie(req, res, value, maxAgeSec) {
  const secure = req.secure || req.get("x-forwarded-proto") === "https";
  res.append("Set-Cookie",
    `lp_miniapp_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}; Max-Age=${Math.max(0, maxAgeSec | 0)}`);
}
// BFF audience guard: valid scoped session + LIVE fail-closed re-checks (link active + telegram
// consent granted). auth_context_version match is enforced inside validateMiniappSession.
async function requireMiniappSession(req, res) {
  if (!miniappEnabled()) { res.status(503).json({ ok: false, error: "FEATURE_DISABLED" }); return null; }
  const cfg = miniappCfg();
  const auth = await identityRepo.validateMiniappSession(getMiniappCookie(req), { idleMs: cfg.idleMs }).catch(() => null);
  if (!auth) { res.status(401).json({ ok: false, error: "MINIAPP_SESSION_INVALID" }); return null; }
  try {
    const link = await channelLinkRepo.getLinkForUser(auth.user.id);
    if (!link || link.status !== "active") { res.status(401).json({ ok: false, error: "MINIAPP_LINK_INACTIVE" }); return null; }
    if (!(await channelLinkRepo.telegramConsentActive(null, auth.user.id))) { res.status(401).json({ ok: false, error: "MINIAPP_CONSENT_REVOKED" }); return null; }
  } catch (_) { res.status(401).json({ ok: false, error: "MINIAPP_SESSION_INVALID" }); return null; }
  return auth;
}

// initData → scoped session. user_id NEVER from body — derived from the active channel link only.
app.post("/api/miniapp/session", async (req, res) => {
  if (!miniappEnabled()) return res.status(503).json({ ok: false, error: "FEATURE_DISABLED" });
  const ip = req.ip || "unknown";
  // shares the login fail-limiter (both are Telegram/secret surfaces on one owner-pilot host)
  if (authFailExceeded(ip)) { res.set("Retry-After", String(Math.ceil(AUTH_FAIL_WINDOW_MS / 1000))); return res.status(429).json({ ok: false, error: "TOO_MANY_AUTH_FAILURES" }); }
  const cfg = miniappCfg();
  const v = miniappAuth.validateInitData((req.body && req.body.init_data) || "", { maxAgeSec: cfg.maxAgeSec });
  if (!v.ok) {
    authFailRecord(ip);
    identityRepo.audit("miniapp_auth_failed", null, { code: v.code }, ip);   // enum only — never raw initData
    return res.status(401).json({ ok: false, error: "MINIAPP_AUTH_FAILED", code: v.code });
  }
  const allow = miniappOwnerAllow();
  if (allow.size && !allow.has(v.telegramUserId)) return res.status(503).json({ ok: false, error: "NOT_ALLOWLISTED" });
  try {
    const link = await channelLinkRepo.getActiveLinkByTg(v.telegramUserId, "telegram");
    if (!link) return res.status(401).json({ ok: false, error: "MINIAPP_NOT_PAIRED" });
    const userId = link.user_id;
    if (!(await channelLinkRepo.telegramConsentActive(null, userId))) return res.status(401).json({ ok: false, error: "MINIAPP_CONSENT_REVOKED" });
    // Replay ledger = audit/observability. The real replay bound is the short auth_date TTL; a
    // legit lost-response retry reuses the SAME initData and must still get a session, so a replay
    // is NOT hard-rejected here (it would break retry) — it is recorded.
    try {
      const seen = await identityRepo.recordMiniappInitDataSeen(userId, miniappAuth.initDataDedupKey(v.hash), v.authDate);
      if (!seen.fresh) identityRepo.audit("miniapp_auth_replay", userId, {}, ip);
    } catch (_) {}
    const acv = await identityRepo.getUserAuthContextVersion(userId);
    const s = await identityRepo.createMiniappSession(userId, {
      channelLinkId: link.id, authContextVersion: acv, ip, userAgent: req.get("user-agent"),
      idleMs: cfg.idleMs, absoluteMs: cfg.absoluteMs,
    });
    setMiniappCookie(req, res, s.cookieValue, Math.floor(cfg.absoluteMs / 1000));
    identityRepo.audit("miniapp_auth", userId, { sessionId: s.sessionId }, ip);
    const consents = await identityRepo.listConsents(userId);
    res.json({ ok: true, csrf: s.csrf, user: { id: userId }, consents: consents.current, expiresAt: s.expiresAt });
  } catch (e) { res.status(500).json({ ok: false, error: "MINIAPP_AUTH_FAILED", code: "SERVER" }); }
});

// ── P8.2 read-only home + lazy plan/explanations (BFF: same application services as
// the PWA/bot, guarded ONCE by requireMiniappSession — the miniapp cookie never calls
// /api/agent/* directly). All read-only except plan (LLM-quota spend → CSRF). ──
const miniappHome = require("./agent/miniappHome");
// P8.4a-fix (owner live-verify 2026-07-10: серия из ~5 заданий за 3 мин — start+hint+audio+answer+
// next — пробила 30/мин → 429 маскировался под «проверьте связь»). Тренировочная сессия легально
// делает ~30-60 req/мин; 120 остаётся анти-abuse потолком (auth имеет свой fail-limiter жёстче).
const rlMiniapp = makeRateLimiter({ windowMs: 60_000, max: 120, name: "miniapp" });

// Home payload (MNAR: opening the home is not a learning event; writes NOTHING).
// Composition lives in agent/miniappHome.js — the smoke gate tests that exact function.
app.get("/api/miniapp/home", rlMiniapp, async (req, res) => {
  const auth = await requireMiniappSession(req, res); if (!auth) return;
  try {
    const payload = await miniappHome.buildHomePayload(auth.user.id, { lang: req.query.lang });
    const consents = await identityRepo.listConsents(auth.user.id);
    res.json({ ok: true, ...payload, consents: consents.current });
  } catch (e) { res.status(500).json({ ok: false, error: "MINIAPP_HOME_FAILED" }); }
});

// Lazy plan (on-tap ONLY — LLM-quota spend; same deterministic-plan runtime as PWA/bot).
app.post("/api/miniapp/plan", rlMiniapp, async (req, res) => {
  const auth = await requireMiniappSession(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try { res.json(await agentRuntime.plan({ userId: auth.user.id, deviceId: auth.session.deviceId, surface: "miniapp" })); }
  catch (e) { res.status(500).json({ ok: false, error: "AGENT_PLAN_FAILED" }); }
});

// Lazy explanation history (purge-aware tombstones — same runtime as the P9 home).
app.get("/api/miniapp/explanations", rlMiniapp, async (req, res) => {
  const auth = await requireMiniappSession(req, res); if (!auth) return;
  try {
    res.json({ ok: true, ...(await agentRuntime.listExplanations({ userId: auth.user.id },
      { limit: req.query.limit, beforeRid: req.query.before_rid })) });
  } catch (e) { res.status(500).json({ ok: false, error: "AGENT_EXPLANATIONS_FAILED" }); }
});

// ── P8.3 review-session (SPEC §3/§6 + адъюдикация §9). P8.3 = render-only preview:
// MINI_APP_REVIEW_WRITE выключен → start НЕ создаёт challenge/exposure (§9 п.5, не DoS-ит
// бота), answer/skip — честный 403. Клиент передаёт только ИНТЕНТ {mode}; item/modality/
// select_reason решает сервер (norm §20.4). ──
const reviewSessionSvc = require("./agent/reviewSession");

app.post("/api/miniapp/review-sessions", rlMiniapp, async (req, res) => {
  const auth = await requireMiniappSession(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  const mode = String((req.body && req.body.mode) || "reading_first");
  if (mode !== "reading_first" && mode !== "all_due" && mode !== "manual" && mode !== "ahead") return res.status(400).json({ ok: false, error: "BAD_MODE" });
  // P8.4b: клиент передаёт ТОЛЬКО интент (mode + modality-enum); провенанс пишет сервер
  const modality = mode === "manual" ? String((req.body && req.body.modality) || "") : undefined;
  try {
    const link = await channelLinkRepo.getLinkForUser(auth.user.id);   // для ON-пути (chat ids by construction)
    const r = await reviewSessionSvc.start({
      userId: auth.user.id, surface: "telegram_miniapp", mode, modality, lng: String(req.body && req.body.lang || "ru"),
      tgUserId: link && link.telegram_user_id, tgChatId: link && link.telegram_chat_id,
    });
    if (!r || r.ok === false) return res.status(400).json(r || { ok: false, error: "START_FAILED" });
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: "REVIEW_SESSION_FAILED" }); }
});

// dictate/sentence-аудио: опак-токен с привязкой {userId, challengeId, classC} → стрим байтов
// (assetKey контент-производен и инвертируем → НИКОГДА в клиентском payload/URL, §9 п.15).
// §10 п.9 P8.4a: сверка userId сессии; class-C-производное (TTS предложения пользователя) —
// double-consent recheck В МОМЕНТ стрима (revoke между hint и play → 404, fail-closed).
app.get("/api/miniapp/review-audio", rlMiniapp, async (req, res) => {
  const auth = await requireMiniappSession(req, res); if (!auth) return;
  const tok = reviewSessionSvc.resolveAudioToken(req.query.t);
  if (!tok || !/^[A-Za-z0-9_-]+$/.test(tok.assetKey)) return res.status(404).json({ ok: false, error: "AUDIO_TOKEN_INVALID" });
  if (tok.userId && tok.userId !== auth.user.id) return res.status(404).json({ ok: false, error: "AUDIO_TOKEN_INVALID" });
  if (tok.classC) {
    const okCloud = await require("./db/learnerArtifactsRepo").hasConsent(auth.user.id).catch(() => false);
    const okRead = await require("./db/agentSentenceRepo").hasAgentReadConsent(auth.user.id).catch(() => false);
    if (!okCloud || !okRead) return res.status(404).json({ ok: false, error: "AUDIO_TOKEN_INVALID" });
  }
  const abs = path.resolve(DATA_DIR, "audio-cache/" + tok.assetKey + ".mp3");
  if (!abs.startsWith(path.resolve(DATA_DIR))) return res.status(400).json({ ok: false, error: "BAD_PATH" });
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) return res.status(404).json({ ok: false, error: "AUDIO_NOT_FOUND" });
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");   // токен одноразового окна — не кешировать
    fs.createReadStream(abs).pipe(res);
  });
});

// ── P8.4a write-flow: answer/skip/hint/annul через reviewSessionService → reviewer (канон).
// Оба флага (MINI_APP_REVIEW_WRITE + AGENT_REVIEW_WRITE) проверяет сервис — dormant по умолчанию.
const _miniappWriteStatus = (r) =>
  r && r.error === "MINIAPP_REVIEW_WRITE_OFF" ? 403
  : r && (r.error === "CHALLENGE_NOT_FOUND" || r.error === "ANNUL_TARGET_NOT_FOUND") ? 404
  : r && r.error === "CHALLENGE_CLOSED" ? 409
  : r && (r.error === "HINT_TOO_LATE" || r.error === "HINT_KIND_MISMATCH" || r.error === "RETRY_WITH_ORIGINAL") ? 409
  : 400;

app.post("/api/miniapp/review-sessions/:id/answer", rlMiniapp, async (req, res) => {
  const auth = await requireMiniappSession(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const b = req.body || {};
    const r = await reviewSessionSvc.answer({
      userId: auth.user.id, surface: "telegram_miniapp", challengeId: req.params.id,
      clientNonce: b.nonce, answer: b.answer, inputMode: b.input_mode,
    });
    if (!r || r.ok !== true) return res.status(_miniappWriteStatus(r)).json(r || { ok: false, error: "REVIEW_FAILED" });
    res.json(r);
  } catch (e) { console.error("[miniapp] review route failed:", e && e.message); res.status(500).json({ ok: false, error: "REVIEW_FAILED" }); }
});

app.post("/api/miniapp/review-sessions/:id/skip", rlMiniapp, async (req, res) => {
  const auth = await requireMiniappSession(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const r = await reviewSessionSvc.skip({
      userId: auth.user.id, surface: "telegram_miniapp", challengeId: req.params.id,
      clientNonce: (req.body || {}).nonce,
    });
    if (!r || r.ok !== true) return res.status(_miniappWriteStatus(r)).json(r || { ok: false, error: "REVIEW_FAILED" });
    res.json(r);
  } catch (e) { console.error("[miniapp] review route failed:", e && e.message); res.status(500).json({ ok: false, error: "REVIEW_FAILED" }); }
});

app.post("/api/miniapp/review-sessions/:id/hint", rlMiniapp, async (req, res) => {
  const auth = await requireMiniappSession(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const r = await reviewSessionSvc.hint({
      userId: auth.user.id, surface: "telegram_miniapp", challengeId: req.params.id,
      kind: String((req.body || {}).kind || ""),
    });
    if (!r || r.ok !== true) {
      const code = r && (r.error === "HINT_UNAVAILABLE" ? 404 : _miniappWriteStatus(r));
      return res.status(code || 400).json(r || { ok: false, error: "HINT_UNAVAILABLE" });
    }
    res.json(r);
  } catch (e) { console.error("[miniapp] hint route failed:", e && e.message); res.status(500).json({ ok: false, error: "HINT_FAILED" }); }
});

// P8.5: issue — за miniapp-сессией (сервер ре-резолвит якорь; клиентские указатели не принимаются)
app.post("/api/miniapp/reading-handoffs", rlMiniapp, async (req, res) => {
  const auth = await requireMiniappSession(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const r = await reviewSessionSvc.issueHandoff({
      userId: auth.user.id, surface: "telegram_miniapp", challengeId: String((req.body || {}).challenge_id || ""),
    });
    if (!r || r.ok !== true) {
      const code = r && r.error === "HANDOFF_UNAVAILABLE" ? 404 : _miniappWriteStatus(r);
      return res.status(code || 400).json(r || { ok: false, error: "HANDOFF_FAILED" });
    }
    res.json(r);
  } catch (e) { console.error("[miniapp] handoff issue failed:", e && e.message); res.status(500).json({ ok: false, error: "HANDOFF_FAILED" }); }
});

// P8.5: redeem — ПУБЛИЧНЫЙ (токен = одноразовая capability, TTL 5 мин; отдаёт ТОЛЬКО указатели —
// контент текста живёт в OPFS устройства). PWA зовёт при boot по ?handoff= и сразу чистит URL.
app.get("/api/reading-handoffs/redeem", rlMiniapp, async (req, res) => {
  try {
    const r = await require("./db/handoffRepo").redeem(String(req.query.t || ""));
    if (!r) return res.status(404).json({ ok: false, error: "HANDOFF_INVALID" });
    // work_id (AA3-3c, nullable): corpus tokens carry the catalog id so the Room
    // can open a not-yet-materialized work via openCorpusWork. Additive field —
    // both redeem consumers access fields by name (verified sweep).
    res.json({ ok: true, text_key: r.text_key, order_index: r.order_index, action: r.action, work_id: r.work_id || null });
  } catch (e) { res.status(500).json({ ok: false, error: "HANDOFF_FAILED" }); }
});

app.post("/api/miniapp/review-events/:id/annul", rlMiniapp, async (req, res) => {
  const auth = await requireMiniappSession(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const r = await reviewSessionSvc.annul({
      userId: auth.user.id, surface: "telegram_miniapp",
      reviewRowId: req.params.id, reason: String((req.body || {}).reason || "user_undo"),
    });
    if (!r || r.ok !== true) return res.status(_miniappWriteStatus(r)).json(r || { ok: false, error: "ANNUL_FAILED" });
    res.json(r);
  } catch (e) { console.error("[miniapp] annul route failed:", e && e.message); res.status(500).json({ ok: false, error: "ANNUL_FAILED" }); }
});

// ── webhook: secret-middleware (raw, ДО парсинга) → 256kb-json → handler ──────
const _tgWebhookJson = bodyParser.json({ limit: "256kb" });
function telegramSecretGate(req, res, next) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (!secret) return res.status(503).json({ ok: false, error: "WEBHOOK_NOT_CONFIGURED" });   // fail-closed
  const got = String(req.get("X-Telegram-Bot-Api-Secret-Token") || "");
  const a = Buffer.from(got), b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: "BAD_WEBHOOK_SECRET" });   // тело НЕ распарсено
  }
  next();
}
// from.id rate-limit (НЕ по IP: весь трафик с IP Telegram; критика). Превышение → drop-with-200.
const _tgFromBuckets = new Map();
const _tgContentBuckets = new Map();
function _bucketAllowed(map, key, max, windowMs) {
  const now = Date.now();
  const arr = (map.get(key) || []).filter((t) => now - t < windowMs);
  if (map.size > 5000) { for (const [k, v] of map) if (!v.some((t) => now - t < windowMs)) map.delete(k); }
  if (arr.length >= max) { map.set(key, arr); return false; }
  arr.push(now); map.set(key, arr); return true;
}
function tgFromIdAllowed(fromId) { return _bucketAllowed(_tgFromBuckets, fromId, 30, 60_000); }
// P7.1b: тайтовый отдельный cap на content-команды (особенно LLM-дорогой /plan) — критика:
// generic 30/мин выжигал бы суточный LLM-бюджет за ~2 мин. Превышение → drop-with-200.
const TG_CONTENT_CMDS = new Set(["/plan", "/due", "/summary", "/explain", "/review"]);
const TG_CONTENT_MAX = Number(process.env.TG_CONTENT_MAX) || 10;   // человеку хватает; ограничивает LLM-burn /plan
function tgContentAllowed(fromId) { return _bucketAllowed(_tgContentBuckets, fromId, TG_CONTENT_MAX, 60_000); }
const telegramContent = require("./agent/telegram/content");
const telegramReview = require("./agent/telegram/review");   // P7.2a пишущий review-поток (webhook-trusted)
const telegramFormat = require("./agent/telegram/format");
const notificationPrefsRepo = require("./db/notificationPrefsRepo");   // P7.3a /stop//resume + P7.3c /mute//notoday
const nudgeRepo = require("./db/nudgeRepo");                            // P7.3a/c проактивный нудж-sweep
const nudgeLedgerRepo = require("./db/nudgeLedgerRepo");                // P7.3c /notoday claimedToday-ответ
const telegramLocaltime = require("./db/localtime");                    // P7.3c muted_until (tz DST-safe)
const agentRepoForTg = require("./db/agentRepo");

app.post(TELEGRAM_WEBHOOK_PATH, telegramSecretGate, _tgWebhookJson, async (req, res) => {
  const upd = req.body || {};
  const msg = upd.message;
  // только private-message с числовым from.id (fix: group-leak + channel-posts без from)
  const isPrivate = msg && msg.chat && msg.chat.type === "private" && msg.from && typeof msg.from.id === "number";
  if (!isPrivate) return res.json({ ok: true, ignored: true });
  const fromId = String(msg.from.id);
  const chatId = msg.chat.id;
  const updateId = upd.update_id;
  // P7.2a reply-binding: сообщение-ответ несёт reply_to_message.message_id — сервер передаёт его
  // роутеру (isReply/replyToMessageId); challenge-lookup/binding — в phase-2 (submitAnswer).
  const replyToMessageId = (msg.reply_to_message && msg.reply_to_message.message_id != null)
    ? msg.reply_to_message.message_id : null;
  const isReply = replyToMessageId != null;
  if (!tgFromIdAllowed(fromId)) return res.json({ ok: true, throttled: true });   // drop-with-200, не 429
  // P7.1b: тайтовый cap на content-команды ДО dedup (throttled command не помечается seen).
  const firstWord = String(msg.text || "").trim().split(/\s+/)[0].toLowerCase().split("@")[0];
  if (TG_CONTENT_CMDS.has(firstWord) && !tgContentAllowed(fromId)) return res.json({ ok: true, throttled: true });

  let result;
  // ── ФАЗА 1 (в txn): dedup + эффект роутера + bot_action_log. Сбой ЗДЕСЬ → rollback (включая
  // dedup) → 500 → Telegram переиграет (at-least-once честен). ──
  try {
    const r = await channelLinkRepo.processUpdateTxn(updateId, async (db) => {
      const out = await telegramRouter.handle(db, { tgUserId: fromId, tgChatId: chatId, text: msg.text || "", updateId, isReply, replyToMessageId });
      // P7.3a/c: durable-запись prefs ВНУТРИ webhook-txn — атомарно с dedup (сбой → rollback → Telegram
      // переиграет → opt-out/mute не теряется). Роутер transitive-read-only (пишет здесь).
      if (out && out.kind === "pref") {
        await notificationPrefsRepo.setTelegramEnabledTxn(db, out.userId, out.enable);
        if (out.enable) await notificationPrefsRepo.clearMuteTxn(db, out.userId);   // /resume снимает и mute
      } else if (out && out.kind === "snooze") {
        // muted_until = начало (today+days) local-дня в tz пользователя (DST-safe); tz из prefs (txn-read)
        const tzRow = await new Promise((res, rej) => db.get(`SELECT timezone FROM notification_preferences WHERE user_id=?`, [out.userId], (e, x) => (e ? rej(e) : res(x))));
        const tz = telegramLocaltime.safeTz(tzRow && tzRow.timezone);
        out._mutedUntil = telegramLocaltime.startOfLocalDay(tz, Date.now(), out.days);
        out._tz = tz;
        await notificationPrefsRepo.setMuteTxn(db, out.userId, out._mutedUntil);
      }
      return out;
    });
    if (r.duplicate) return res.json({ ok: true, duplicate: true });   // уже обработан → без эффекта
    result = r.result;
  } catch (e) {
    console.error("[telegram] webhook txn failed:", e && e.message);
    return res.status(500).json({ ok: false, error: "WEBHOOK_HANDLER_FAILED" });
  }

  // ── ФАЗА 2 (ВНЕ txn, best-effort → ВСЕГДА 200): content-produce / review / account-reply. dedup
  // уже закоммичен — сбой produce НЕ должен давать 500 (иначе retry-шторм без переигрывания). ──
  res.json({ ok: true });
  try {
    if (result && result.kind === "content") {
      // /plan зовёт LLM (секунды) + свой txnLock — ТОЛЬКО здесь, вне webhook-txn. content.serve
      // делает delivery-point recheck (revoke во время produce → refusal, не контент).
      const served = await telegramContent.serve(result);
      for (const p of (served.parts || [])) await telegramApi.sendMessage(result.chatId != null ? result.chatId : chatId, p);
    } else if (result && result.kind === "review-start") {
      // startReview сам отправляет prompt (нужен message_id для reply-binding); note — для
      // недоступно/нечего/занято (флаг/consent/eligibility). Пишущий путь — reviewer.record внутри.
      const r = await telegramReview.startReview(result);
      if (r && r.note) await telegramApi.sendMessage(result.chatId != null ? result.chatId : chatId, r.note);
    } else if (result && result.kind === "review-answer") {
      // submitAnswer: reply-binding + grader + challenge-bound reviewer.record. null → сообщение НЕ
      // относилось к активному review (свободный reply) → тихо игнорируем (не спамим).
      const r = await telegramReview.submitAnswer({
        userId: result.userId, tgUserId: result.tgUserId, chatId: result.chatId,
        replyToMessageId: result.replyToMessageId, text: msg.text || "", updateId: result.updateId,
      });
      if (r && r.note) await telegramApi.sendMessage(result.chatId != null ? result.chatId : chatId, r.note);
    } else if (result && result.kind === "pref") {
      // P7.3a /stop//resume: запись prefs УЖЕ применена атомарно в phase-1 (durable). Здесь — только
      // локализованное подтверждение (класс A). Связка/consent остаются активны (не /unlink).
      let lng = "ru"; try { const p = await agentRepoForTg.getProfile(result.userId); lng = (p && p.language) || "ru"; } catch (_) {}
      const txt = result.enable ? telegramFormat.nudgeResumeText(lng) : telegramFormat.nudgeStopText(lng);
      await telegramApi.sendMessage(result.chatId != null ? result.chatId : chatId, txt);
    } else if (result && result.kind === "snooze") {
      // P7.3c /notoday//mute: запись muted_until уже применена в phase-1. Подтверждение (класс A). /notoday:
      // если день УЖЕ нуджнут/занят — честный «на сегодня всё», иначе «понял, сегодня не напомню».
      let lng = "ru"; try { const p = await agentRepoForTg.getProfile(result.userId); lng = (p && p.language) || "ru"; } catch (_) {}
      let txt;
      if (result.command === "mute") txt = telegramFormat.formatMuteOk(result.days, lng);
      else {
        let already = false;
        try { already = await nudgeLedgerRepo.claimedToday(result.userId, telegramLocaltime.localDay(result._tz || "Asia/Jerusalem", Date.now())); } catch (_) {}
        txt = telegramFormat.notodayText(lng, already);
      }
      await telegramApi.sendMessage(result.chatId != null ? result.chatId : chatId, txt);
    } else if (result && result.kind === "mute-bad") {
      let lng = "ru"; try { const p = await agentRepoForTg.getProfile(result.userId); lng = (p && p.language) || "ru"; } catch (_) {}
      await telegramApi.sendMessage(result.chatId != null ? result.chatId : chatId, telegramFormat.muteBadText(lng));
    } else if (result && result.text) {
      await telegramApi.sendMessage(result.chatId != null ? result.chatId : chatId, result.text);
    }
  } catch (e) { console.error("[telegram] content/review/reply failed:", e && e.message); }
});

// TTL-prune (реальный триггер): telegram_updates >48ч, NULL-user bot_action_log >30д.
const _tgPruneInterval = setInterval(() => {
  channelLinkRepo.pruneOld().catch(() => {});
}, 6 * 3600 * 1000);
if (_tgPruneInterval.unref) _tgPruneInterval.unref();

// ── P8.6 часовой ops-sweep (§19: session-purge + challenge-expiry cleanup) ──────
// До него protuхшие user_sessions/miniapp_initdata_seen копились бессрочно (lazy-validate
// их лишь игнорировал), а agentChallengeRepo.pruneOld/handoffRepo.pruneOld звались только
// lazy на review-путях — при простое протухшее висело. Каждый purge — одиночный
// autocommit-стейтмент; пачка под withTxnLock, чтобы стейтменты не всасывались в чужую
// открытую BEGIN..COMMIT на общем коннекте (критика r11: молчаливый откат при чужом
// ROLLBACK). Лог — только счётчики (класс A). Boot-тик через 2 мин + каждый час.
const { withTxnLock } = require("./db/txnLock");
const handoffRepo = require("./db/handoffRepo");
const cp0ObservationRepo = require("./db/cp0ObservationRepo");
const learnerMemoryRepo = require("./db/learnerMemoryRepo");
const f2EvidenceRepo = require("./db/f2EvidenceRepo");
async function opsSweepTick() {
  if (getDbHealth().ready !== true) return;
  try {
    await withTxnLock(async () => {
      const sessions = await identityRepo.purgeStaleSessions();
      const initSeen = await identityRepo.purgeStaleInitDataSeen();
      const devices = await identityRepo.purgeOrphanDevices();
      const ch = await agentChallengeRepo.pruneOld();
      await handoffRepo.pruneOld();
      await agentProposalsRepo.pruneOld();   // AA3-3c: expire PENDING + retention bounds (proposalPolicy)
      const cp0Purged = await cp0ObservationRepo.purgeExpired();
      const memoryPurged = await learnerMemoryRepo.expireAndPurge();
      if (sessions || initSeen || devices || ch.challenges || ch.purgedTerminal || cp0Purged.observations || cp0Purged.boots || memoryPurged.expired || memoryPurged.records || memoryPurged.queries || memoryPurged.journal) {
        console.log(`[ops-sweep] sessions=${sessions} initdata_seen=${initSeen} devices=${devices} challenges_expired=${ch.challenges} challenges_purged=${ch.purgedTerminal} cp0_observations=${cp0Purged.observations} cp0_boots=${cp0Purged.boots} memory_expired=${memoryPurged.expired} memory_records=${memoryPurged.records} memory_queries=${memoryPurged.queries} memory_journal=${memoryPurged.journal}`);
      }
    });
    const f2Purged = await f2EvidenceRepo.expireAndPurge();
    if (f2Purged.requests || f2Purged.content || f2Purged.queries || f2Purged.audit || f2Purged.journal) {
      console.log(`[ops-sweep] f2_expired=${f2Purged.requests} f2_content=${f2Purged.content} f2_queries=${f2Purged.queries} f2_audit=${f2Purged.audit} f2_journal=${f2Purged.journal}`);
    }
    // P2 §6.4/§6.8 — tombstone-TTL (180 дн, заявлен в consent-карте) + допурж после упавшего
    // revoke-purge (обещание «отзыв = немедленное удаление» не должно тихо провисать).
    try {
      const laRepo = require("./db/learnerArtifactsRepo");
      const pr = await laRepo.pruneTombstones(180);
      const rc = await laRepo.reconcileRevokedPurges();
      // S1 — production-rebuild derived-меты (краш-окно put'а / пропуски backfill'а)
      const rm = await laRepo.reconcileArtifactMeta(200);
      // Exposure-леджер (мигр. 053): TTL-прюнинг метаданных прочитанных окон (заявлен в карте гранта)
      const ex = await require("./db/agentTextExposureRepo").prune();
      if (pr.pruned || rc.users || rm.rebuilt || ex.pruned) console.log(`[ops-sweep] tombstones_pruned=${pr.pruned} revoked_purge_reconciled=${rc.users} (artifacts=${rc.artifacts}) meta_rebuilt=${rm.rebuilt} exposures_pruned=${ex.pruned}`);
    } catch (e2) { console.error("[ops-sweep] artifacts-reconcile failed:", e2 && e2.message); }
  } catch (e) { console.error("[ops-sweep] failed:", e && e.message); }
}
const _opsSweepBoot = setTimeout(() => { opsSweepTick(); }, 2 * 60 * 1000);
if (_opsSweepBoot.unref) _opsSweepBoot.unref();
const _opsSweepInterval = setInterval(opsSweepTick, 3600 * 1000);
if (_opsSweepInterval.unref) _opsSweepInterval.unref();

// ============================================================================
// CLG-P5.5 — Artifact Sync, класс C (постановление 2026-07-18, BRIDGE_RECON §2.5:
// тела личных текстов = класс C; прежняя маркировка «B» — дрейф ярлыка): OPAQUE
// bundle store под ЯВНЫМ consent'ом (consent_records 'cloud_texts', карта v2).
// Server-side enforcement на КАЖДОМ запросе — выключенный переключатель означает
// 403 даже для чтения; отзыв = немедленный purge (P2 §6.8), не freeze.
// ============================================================================
const learnerArtifactsRepo = require("./db/learnerArtifactsRepo");
// 240/мин: fresh-device restore = 80+ GET подряд (83 текста у владельца) — 120 было впритык.
const rlLearnerArtifacts = makeRateLimiter({ windowMs: 60_000, max: 240, name: "learner-artifacts" });

// P1 (§6.7) — sync-поверхность требует ТОЧНУЮ версию consent-карты (грант старой карты не
// переносится молча — решение владельца); 403 различает «нет согласия» и «подтвердите новую
// карту» (reconsent:true → клиент показывает амбер-строку, а не немую ошибку).
async function requireArtifactConsent(req, res, auth) {
  let v = { ok: false, reconsent: false };
  try { v = await learnerArtifactsRepo.hasConsentVersioned(auth.user.id); } catch (_) {}
  if (!v.ok) {
    res.status(403).json({ ok: false, error: "CONSENT_REQUIRED", key: learnerArtifactsRepo.CONSENT_KEY,
      ...(v.reconsent ? { reconsent: true, required_version: learnerArtifactsRepo.REQUIRED_CONSENT_VERSION } : {}) });
    return false;
  }
  return true;
}
// Delete/restore — any-version (right-to-delete не запирается за новым согласием, F2-10).
async function requireArtifactConsentAnyVersion(req, res, auth) {
  let ok = false;
  try { ok = await learnerArtifactsRepo.hasConsent(auth.user.id); } catch (_) {}
  if (!ok) { res.status(403).json({ ok: false, error: "CONSENT_REQUIRED", key: learnerArtifactsRepo.CONSENT_KEY }); return false; }
  return true;
}

app.get("/api/learner/artifacts", rlLearnerArtifacts, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!(await requireArtifactConsent(req, res, auth))) return;
  try {
    const rows = await learnerArtifactsRepo.list(auth.user.id);
    // P0 — additive-поле state (метаданные state_bundle БЕЗ payload); старые клиенты игнорируют,
    // rows остаётся чистым text_bundle-списком (старый клиент не увидит state-артефакт вовсе).
    let state = null;
    try { state = await learnerArtifactsRepo.getMeta(auth.user.id, "__state__", learnerArtifactsRepo.STATE_KIND); } catch (_) {}
    // P2 — additive-поле tombstones: клиент применяет их ЛОКАЛЬНО ДО своего UP-цикла
    // (иначе стейл-девайс ресурректит удалённое раньше, чем узнает об удалении).
    let tombstones = [];
    try { tombstones = await learnerArtifactsRepo.listTombstones(auth.user.id); } catch (_) {}
    res.json({ ok: true, rows, state: state || null, tombstones });
  }
  catch (e) { res.status(500).json({ ok: false, error: "ARTIFACTS_FAILED", message: e.message }); }
});

app.get("/api/learner/artifacts/get", rlLearnerArtifacts, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!(await requireArtifactConsent(req, res, auth))) return;
  try {
    const kind = String(req.query.kind || learnerArtifactsRepo.KIND);
    if (!learnerArtifactsRepo.KINDS.has(kind)) return res.status(400).json({ ok: false, error: "BAD_KIND" });
    const row = await learnerArtifactsRepo.get(auth.user.id, req.query.key || "", kind);
    if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    // Raw-passthrough (§6.3, критика F2-9): payload_json валидирован на PUT — не тратим
    // event-loop 1.5-vCPU контейнера на JSON.parse+re-stringify многомегабайтного блоба.
    res.set("Content-Type", "application/json; charset=utf-8");
    res.send('{"ok":true,"artifact_key":' + JSON.stringify(row.artifact_key)
      + ',"updated_at":' + JSON.stringify(row.updated_at)
      + ',"payload":' + row.payload_json + '}');
  } catch (e) { res.status(500).json({ ok: false, error: "ARTIFACT_GET_FAILED", message: e.message }); }
});

// P0 §6.3 — гейты КАК route-middleware ДО 32mb-парсера (путь исключён из глобального 10mb):
// неавторизованный/без-CSRF/без-consent запрос отваливается до того, как сервер согласится
// парсить мегабайты. Порядок: rate-limit → auth → CSRF (заголовок, тело не нужно) → consent → parse.
const _artifactsJson = bodyParser.json({ limit: "32mb" });
const _mwArtifactsUser = (req, res, next) => {
  requireUser(req, res).then((auth) => { if (!auth) return; req._auth = auth; next(); })
    .catch(() => { try { res.status(500).json({ ok: false, error: "AUTH_FAILED" }); } catch (_) {} });
};
app.post(LEARNER_ARTIFACTS_PUT_PATH, rlLearnerArtifacts,
  _mwArtifactsUser,
  (req, res, next) => { if (!requireCsrf(req, res, req._auth)) return; next(); },
  (req, res, next) => { requireArtifactConsent(req, res, req._auth).then((ok) => { if (ok) next(); }).catch(() => { try { res.status(500).json({ ok: false, error: "CONSENT_CHECK_FAILED" }); } catch (_) {} }); },
  _artifactsJson,
  async (req, res) => {
    try {
      const out = await learnerArtifactsRepo.put(req._auth.user.id, req._auth.session.deviceId, req.body || {});
      if (out.ok === false) return res.status(400).json(out);
      res.json(out);
    } catch (e) { res.status(500).json({ ok: false, error: "ARTIFACT_PUT_FAILED", message: e.message }); }
  });

// P2 §3.1/§6.4 — right-to-delete: физическое удаление артефакта + tombstone (анти-ресуррекция),
// restore:true снимает tombstone (пере-импорт пользователем). Consent-гейт — грант ЛЮБОЙ версии
// (сокращение данных НЕ запирается за новым согласием — критика F2-10; requireArtifactConsent
// проверяет только granted, и при ужесточении карты до v2 этот роут ОСТАЁТСЯ на any-version).
app.post("/api/learner/artifacts/delete", rlLearnerArtifacts, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  if (!(await requireArtifactConsentAnyVersion(req, res, auth))) return;
  try {
    const body = req.body || {};
    const out = body.restore === true
      ? await learnerArtifactsRepo.restoreArtifact(auth.user.id, body)
      : await learnerArtifactsRepo.deleteArtifact(auth.user.id, body);
    if (out.ok === false) return res.status(400).json(out);
    identityRepo.audit(body.restore === true ? "artifact_restore" : "artifact_delete", auth.user.id,
      { key: String(body.artifact_key || "").slice(0, 64), deleted: out.deleted === true, restored: out.restored === true, reason: out.reason }, req.ip);
    res.json(out);
  } catch (e) { res.status(500).json({ ok: false, error: "ARTIFACT_DELETE_FAILED", message: e.message }); }
});

// ============================================================================
// MASS_ACCESS_I2 — the authenticated Publication Center is the only HTTP
// writer for public corpora. The Reading Room can deep-link here, but exposes
// no publication mutation of its own. Every canonical write delegates to the
// single publication repository and is protected by session, CSRF, strict
// same-origin JSON and an idempotency key.
// ============================================================================
const { getPublicationRepo } = require("./db/publicationRepo");
const { getPhysicsTaskResourceRepo } = require("./db/physicsTaskResourceRepo");
const { resolveLearningSupport: resolvePhysicsLearningSupport } = require("./physics/physicsYear1LearningSupport");
const {
  loadManifest: loadMaterialsPb2LearningSupportManifest,
  resolveLearningSupport: resolveMaterialsPb2LearningSupport,
  resolveAsset: resolveMaterialsPb2LearningAsset,
  resolveWordAudioIndex: resolveMaterialsPb2WordAudioIndex,
} = require("./materials/materialsPb2LearningSupport");
const rlPublicationRead = makeRateLimiter({ windowMs: 60_000, max: 180, name: "publication-read" });
const rlPublicationWrite = makeRateLimiter({ windowMs: 60_000, max: 90, name: "publication-write" });

function publicationError(res, error) {
  const code = String((error && (error.code || error.message)) || "PUBLICATION_FAILED");
  const safe = new Set([
    "UNAUTHENTICATED", "BAD_CSRF", "BAD_ORIGIN", "UNSUPPORTED_MEDIA_TYPE",
    "PUBLISHER_FORBIDDEN", "CORPUS_NOT_FOUND", "DRAFT_NOT_FOUND",
    "DRAFT_VERSION_CONFLICT", "PUBLICATION_INPUT_INVALID", "SOURCE_SNAPSHOT_INVALID",
    "SOURCE_CHANGED", "SOURCE_ALREADY_COPIED", "RIGHTS_PRESET_INVALID",
    "RIGHTS_REVIEW_REQUIRED", "PUBLIC_READ_NOT_ALLOWED", "IDEMPOTENCY_KEY_REQUIRED",
    "IDEMPOTENCY_CONFLICT", "EDITION_HASH_MISMATCH", "PUBLICATION_ASSET_INVALID",
  ]);
  const status = Number(error && error.status) || (code === "PUBLISHER_FORBIDDEN" ? 403 : 500);
  return res.status(status).json({ ok: false, error: safe.has(code) ? code : "PUBLICATION_FAILED" });
}
function publicationActor(auth) {
  return { id: auth.user.id, role: auth.user.role };
}
function publicationIdempotency(req) {
  return { idempotencyKey: String(req.get("X-Idempotency-Key") || "").trim() };
}
async function publicationRead(req, res, action) {
  const auth = await requireUser(req, res); if (!auth) return;
  res.set("Cache-Control", "private, no-store, max-age=0");
  try { return res.json({ ok: true, ...(await action(getPublicationRepo(), publicationActor(auth))) }); }
  catch (error) { return publicationError(res, error); }
}
async function publicationWrite(req, res, operation, action, created = false) {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const result = await action(getPublicationRepo(), publicationActor(auth), publicationIdempotency(req));
    identityRepo.audit("publication_" + operation, auth.user.id,
      { corpus_id: result && result.corpus_id || null, edition_id: result && result.edition_id || null }, req.ip);
    return res.status(created ? 201 : 200).json({ ok: true, ...result });
  } catch (error) { return publicationError(res, error); }
}

app.get("/api/publication/corpora", rlPublicationRead, (req, res) => publicationRead(req, res,
  async (repo, actor) => ({ schema_version: "publication_center.1.0.0", corpora: await repo.listPublisherCorpora(actor) })));
app.get("/api/publication/corpora/:corpusId", rlPublicationRead, (req, res) => publicationRead(req, res,
  async (repo, actor) => ({ schema_version: "publication_center_detail.1.0.0", corpus: await repo.getPublisherCorpus(actor, req.params.corpusId) })));

app.post("/api/publication/corpora", rlPublicationWrite, requireStrictSameOriginJson, (req, res) => publicationWrite(req, res, "corpus_created",
  (repo, actor, opts) => repo.createCorpus(actor, req.body || {}, opts), true));
app.post("/api/publication/corpora/:corpusId/draft/items\\:copy", rlPublicationWrite, requireStrictSameOriginJson, (req, res) => publicationWrite(req, res, "items_copied",
  (repo, actor, opts) => String(req.body && req.body.sourceDomain || "").toUpperCase() === "GROUP_CORPUS"
    ? repo.copyGroupCorpusItems(actor, req.params.corpusId, req.body || {}, opts)
    : repo.copyMyTextItems(actor, req.params.corpusId, req.body || {}, opts)));
app.post("/api/publication/corpora/:corpusId/draft/items\\:reorder", rlPublicationWrite, requireStrictSameOriginJson, (req, res) => publicationWrite(req, res, "draft_reordered",
  (repo, actor, opts) => repo.reorderDraftItems(actor, req.params.corpusId, req.body || {}, opts)));
app.post("/api/publication/corpora/:corpusId/draft/rights\\:apply-study-songs-preset", rlPublicationWrite, requireStrictSameOriginJson, (req, res) => publicationWrite(req, res, "rights_preset_applied",
  (repo, actor, opts) => repo.applyRightsPreset(actor, req.params.corpusId, req.body || {}, opts)));
app.post("/api/publication/corpora/:corpusId/draft\\:validate", rlPublicationWrite, requireStrictSameOriginJson, (req, res) => publicationWrite(req, res, "draft_validated",
  (repo, actor) => repo.validateDraft(actor, req.params.corpusId, req.body && req.body.expectedVersion)));
app.post("/api/publication/corpora/:corpusId\\:publish", rlPublicationWrite, requireStrictSameOriginJson, (req, res) => publicationWrite(req, res, "published",
  (repo, actor, opts) => repo.publish(actor, req.params.corpusId, req.body || {}, opts)));
app.post("/api/publication/corpora/:corpusId\\:withdraw", rlPublicationWrite, requireStrictSameOriginJson, (req, res) => publicationWrite(req, res, "withdrawn",
  (repo, actor, opts) => repo.withdraw(actor, req.params.corpusId, req.body || {}, opts)));
app.post("/api/publication/corpora/:corpusId\\:restore", rlPublicationWrite, requireStrictSameOriginJson, (req, res) => publicationWrite(req, res, "restored",
  (repo, actor, opts) => repo.restore(actor, req.params.corpusId, req.body || {}, opts)));
app.post("/api/publication/corpora/:corpusId\\:rollback", rlPublicationWrite, requireStrictSameOriginJson, (req, res) => publicationWrite(req, res, "pointer_rolled_back",
  (repo, actor, opts) => repo.rollback(actor, req.params.corpusId, req.body || {}, opts)));
app.post("/api/publication/corpora/:corpusId/draft\\:new-revision", rlPublicationWrite, requireStrictSameOriginJson, (req, res) => publicationWrite(req, res, "revision_draft_created",
  (repo, actor, opts) => repo.createRevisionDraft(actor, req.params.corpusId, opts), true));

// MASS_ACCESS_I4_PUBLIC_READ_BEGIN
// Anonymous public-corpus reads are a separate namespace and projection. They
// intentionally have no session, CSRF, audit or publication-write middleware.
const rlPublicCorpusRead = makeRateLimiter({ windowMs: 60_000, max: 300, name: "public-corpus-read" });
function publicCorpusNotFound(res, cacheControl = "public, max-age=30, must-revalidate") {
  res.set("Cache-Control", cacheControl);
  return res.status(404).json({ ok: false, error: "PUBLIC_MATERIAL_NOT_FOUND" });
}
async function publicCorpusRead(res, action) {
  try { return await action(getPublicationRepo()); }
  catch (error) {
    if (error && (error.code === "CORPUS_NOT_FOUND" || error.code === "PUBLICATION_INPUT_INVALID"
      || error.code === "PHYSICS_LEARNING_SUPPORT_NOT_FOUND"
      || error.code === "MATERIALS_PB2_LEARNING_SUPPORT_NOT_FOUND")) return publicCorpusNotFound(res);
    console.error("[public-corpus] read failed:", error && error.message);
    return res.status(500).json({ ok: false, error: "PUBLIC_MATERIAL_UNAVAILABLE" });
  }
}
function publicCorpusEtag(res, hash) {
  const value = String(hash || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) return null;
  const tag = '"' + value + '"';
  res.set("ETag", tag);
  return tag;
}

app.get("/api/public-corpora", rlPublicCorpusRead, (req, res) => publicCorpusRead(res, async repo => {
  const corpora = await repo.listPublicCorpora();
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  return res.json({ ok: true, schema_version: "public_corpora.1.0.0", corpora });
}));
app.get("/api/public-corpora/:slug", rlPublicCorpusRead, (req, res) => publicCorpusRead(res, async repo => {
  const published = await repo.getPublicCorpus(req.params.slug);
  publicCorpusEtag(res, published.edition.manifest_sha256);
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  return res.json({ ok: true, schema_version: "public_corpus.1.0.0", ...published });
}));
const PUBLIC_LEARNING_INDEX_PACKET_MAX = 256 * 1024;
function encodePublicLearningCursor(signature, offset) {
  return Buffer.from(JSON.stringify({ v: 1, s: String(signature), o: Number(offset) }), "utf8").toString("base64url");
}
function decodePublicLearningCursor(value, signature) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (!parsed || parsed.v !== 1 || parsed.s !== String(signature) || !Number.isInteger(parsed.o) || parsed.o < 0) return null;
    return parsed.o;
  } catch (_) { return null; }
}
app.get("/api/public-corpora/:slug/learning-index", rlPublicCorpusRead, (req, res) => publicCorpusRead(res, async repo => {
  const published = await repo.getPublicLearningIndex(req.params.slug);
  const index = published.index;
  const offset = decodePublicLearningCursor(req.query.cursor, index.index_signature);
  if (offset == null || offset > index.items.length) return res.status(400).json({ ok: false, error: "BAD_CURSOR" });
  const requested = Math.max(1, Math.min(48, Math.trunc(Number(req.query.limit) || 16)));
  const items = [];
  for (let i = offset; i < index.items.length && items.length < requested; i += 1) {
    const candidate = items.concat(index.items[i]);
    const probe = {
      ok: true, schema_version: "public_learning_index.1.0.0", index_revision: index.index_signature,
      edition_id: index.edition_id, manifest_sha256: index.manifest_sha256,
      resolver_version: index.resolver_version, matched_total: index.matched_total,
      prepared_total: index.prepared_total, unsupported_total: index.unsupported_total,
      items: candidate,
      next_cursor: offset + candidate.length < index.items.length
        ? encodePublicLearningCursor(index.index_signature, offset + candidate.length) : null,
    };
    if (Buffer.byteLength(JSON.stringify(probe), "utf8") > PUBLIC_LEARNING_INDEX_PACKET_MAX) break;
    items.push(index.items[i]);
  }
  if (offset < index.items.length && !items.length)
    return res.status(413).json({ ok: false, error: "PUBLIC_LEARNING_INDEX_ITEM_TOO_LARGE" });
  const nextOffset = offset + items.length;
  const body = {
    ok: true, schema_version: "public_learning_index.1.0.0", index_revision: index.index_signature,
    edition_id: index.edition_id, manifest_sha256: index.manifest_sha256,
    resolver_version: index.resolver_version, matched_total: index.matched_total,
    prepared_total: index.prepared_total, unsupported_total: index.unsupported_total,
    items,
    next_cursor: nextOffset < index.items.length ? encodePublicLearningCursor(index.index_signature, nextOffset) : null,
  };
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > PUBLIC_LEARNING_INDEX_PACKET_MAX)
    throw new Error("PUBLIC_CORPUS_LEARNING_INDEX_PACKET_LIMIT");
  publicCorpusEtag(res, index.index_signature);
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  res.set("Cross-Origin-Resource-Policy", "same-origin");
  res.set("X-Content-Type-Options", "nosniff");
  return res.json(body);
}));
app.get("/api/public-corpora/:slug/works", rlPublicCorpusRead, (req, res) => publicCorpusRead(res, async repo => {
  const published = await repo.getPublicCorpus(req.params.slug);
  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 60));
  const cursor = Math.max(0, Number.parseInt(req.query.cursor, 10) || 0);
  const query = String(req.query.q || "").trim().toLocaleLowerCase().slice(0, 200);
  const audio = String(req.query.facet || "").toLowerCase();
  const sort = String(req.query.sort || "position").toLowerCase();
  let items = published.items.filter(item => !query || String(item.title + " " + (item.creator || "")).toLocaleLowerCase().includes(query));
  if (audio === "complete") items = items.filter(item => !!item.package_complete);
  else if (audio === "missing") items = items.filter(item => Number(item.asset_missing) > 0);
  if (sort === "title") items.sort((a, b) => String(a.title).localeCompare(String(b.title)) || Number(a.position_no) - Number(b.position_no));
  const page = items.slice(cursor, cursor + limit);
  publicCorpusEtag(res, published.edition.manifest_sha256);
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  return res.json({ ok: true, schema_version: "public_corpus_works.1.0.0", corpus: published.corpus, edition: published.edition,
    items: page, matched_total: items.length, next_cursor: cursor + page.length < items.length ? String(cursor + page.length) : null });
}));
app.get("/api/public-corpora/:slug/works/:workId", rlPublicCorpusRead, (req, res) => publicCorpusRead(res, async repo => {
  const published = await repo.getPublicWork(req.params.slug, req.params.workId);
  publicCorpusEtag(res, published.item.snapshot_sha256);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  return res.json({ ok: true, schema_version: "public_corpus_work.1.0.0", ...published });
}));
function materialsPb2LearningSupportPublicReadEnabled() {
  const configured = String(process.env.MATERIALS_PB2_LEARNING_SUPPORT_PUBLIC_READ || "").trim();
  if (configured === "0") return false;
  if (configured === "1") return true;
  if (configured) return false;
  try {
    loadMaterialsPb2LearningSupportManifest();
    return true;
  } catch (_) {
    return false;
  }
}
function publicLearningSupportResolver(slug) {
  if (slug === "physics-year1-problems" && String(process.env.PHYSICS_TASK_LEARNING_SUPPORT_PUBLIC_READ || "") === "1")
    return resolvePhysicsLearningSupport;
  if (slug === "materials-science-year1-problem-book-2" && materialsPb2LearningSupportPublicReadEnabled())
    return resolveMaterialsPb2LearningSupport;
  return null;
}
app.get("/api/public-corpora/:slug/works/:workId/learning-support", rlPublicCorpusRead, (req, res) => {
  // A rollout-gated negative response must never survive the flag transition in
  // a browser HTTP cache. Exact enabled derivatives remain immutable below.
  const resolver = publicLearningSupportResolver(req.params.slug);
  if (!resolver) return publicCorpusNotFound(res, "no-store");
  return publicCorpusRead(res, async repo => {
    const published = await repo.getPublicWork(req.params.slug, req.params.workId);
    const body = resolver({
      slug: req.params.slug,
      editionId: published.edition.edition_id,
      editionNumber: published.edition.edition_number,
      editionManifestSha256: published.edition.manifest_sha256,
      editionItemId: published.item.edition_item_id,
      publicWorkId: published.item.public_work_id,
      snapshotSha256: published.item.snapshot_sha256,
      snapshot: published.item.snapshot,
    });
    const etag = publicCorpusEtag(res, body.derivative_sha256);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("Cross-Origin-Resource-Policy", "same-origin");
    res.set("X-Content-Type-Options", "nosniff");
    if (etag && req.headers["if-none-match"] === etag) return res.status(304).end();
    return res.json({ ok: true, ...body });
  });
});
app.get("/api/public-corpora/:slug/learning-support/assets/:assetSha256", rlPublicCorpusRead, (req, res) => {
  if (req.params.slug !== "materials-science-year1-problem-book-2"
    || !materialsPb2LearningSupportPublicReadEnabled()) return publicCorpusNotFound(res, "no-store");
  return publicCorpusRead(res, async () => {
    const found = resolveMaterialsPb2LearningAsset(req.params.assetSha256);
    const etag = publicCorpusEtag(res, found.sha256);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("Cross-Origin-Resource-Policy", "same-origin");
    res.set("X-Content-Type-Options", "nosniff");
    if (etag && req.headers["if-none-match"] === etag) return res.status(304).end();
    res.type(found.mime);
    return res.sendFile(found.absolute_path);
  });
});
app.get("/api/public-corpora/:slug/learning-support/word-audio-index", rlPublicCorpusRead, (req, res) => {
  if (req.params.slug !== "materials-science-year1-problem-book-2"
    || !materialsPb2LearningSupportPublicReadEnabled()) return publicCorpusNotFound(res, "no-store");
  return publicCorpusRead(res, async repo => {
    const published = await repo.getPublicCorpus(req.params.slug);
    const body = resolveMaterialsPb2WordAudioIndex({
      slug: req.params.slug, editionId: published.edition.edition_id,
      editionNumber: published.edition.edition_number,
      editionManifestSha256: published.edition.manifest_sha256,
    });
    const etag = publicCorpusEtag(res, body.asset_manifest_sha256);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("Cross-Origin-Resource-Policy", "same-origin");
    res.set("X-Content-Type-Options", "nosniff");
    if (etag && req.headers["if-none-match"] === etag) return res.status(304).end();
    return res.json({ ok: true, ...body });
  });
});
app.get("/api/public-corpora/:slug/assets/:assetKey", rlPublicCorpusRead, (req, res) => publicCorpusRead(res, async repo => {
  const found = await repo.getPublicAsset(req.params.slug, req.params.assetKey, "stream");
  publicCorpusEtag(res, found.asset.sha256);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.type(found.asset.mime || "audio/mpeg");
  return res.sendFile(found.absolute_path);
}));
app.get("/api/public-corpora/:slug/package", rlPublicCorpusRead, (req, res) => publicCorpusRead(res, async repo => {
  const found = await repo.getPublicPackage(req.params.slug);
  publicCorpusEtag(res, found.edition.package_sha256);
  res.set("Cache-Control", "public, max-age=30, must-revalidate");
  res.set("X-Publication-Package-Complete", found.edition.package_complete ? "true" : "false");
  res.set("X-Publication-Asset-Missing", String(Number(found.edition.asset_missing) || 0));
  res.type("application/zip");
  res.attachment(String(req.params.slug || "public-corpus") + ".zip");
  return res.sendFile(found.absolute_path);
}));

// PHYSICS-SOLUTION-DOCUMENTS-R2 — a separate, default-off read projection.
// It never writes learner/account state and never mutates an immutable corpus
// edition. The active edition is only used to validate the pinned task anchor.
function physicsTaskResourcesEnabled() {
  return String(process.env.PHYSICS_TASK_RESOURCES_PUBLIC_READ || "") === "1";
}
function physicsTaskResourceNotFound(res) {
  res.set("Cache-Control", "public, max-age=30, must-revalidate");
  return res.status(404).json({ ok: false, error: "PUBLIC_MATERIAL_NOT_FOUND" });
}
function physicsTaskResourceError(res, error) {
  const code = String(error && (error.code || error.message) || "");
  if (["PHYSICS_RESOURCE_NOT_FOUND", "PHYSICS_RESOURCE_FILE_UNAVAILABLE", "PHYSICS_SECTION_METADATA_INVALID", "PHYSICS_RESOURCE_INPUT_INVALID"].includes(code))
    return physicsTaskResourceNotFound(res);
  console.error("[physics-task-resources] read failed:", code);
  return res.status(500).json({ ok: false, error: "PUBLIC_MATERIAL_UNAVAILABLE" });
}
function sendImmutablePdf(req, res, found) {
  const size = Number(found.bytes);
  const etag = `"${found.sha256}"`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="physics-${found.public_work_id}-${found.revision_id}.pdf"`);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("ETag", etag);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none';");
  if (!req.headers.range && String(req.headers["if-none-match"] || "") === etag) return res.status(304).end();
  const value = String(req.headers.range || "");
  if (!value) {
    res.setHeader("Content-Length", String(size));
    const stream = fs.createReadStream(found.absolute_path);
    stream.on("error", () => res.destroy());
    return stream.pipe(res);
  }
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) {
    res.setHeader("Content-Range", `bytes */${size}`);
    return res.status(416).end();
  }
  let start; let end;
  if (!match[1]) {
    const suffix = Number.parseInt(match[2], 10);
    if (!Number.isInteger(suffix) || suffix <= 0) { res.setHeader("Content-Range", `bytes */${size}`); return res.status(416).end(); }
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= size) {
    res.setHeader("Content-Range", `bytes */${size}`);
    return res.status(416).end();
  }
  end = Math.min(end, size - 1);
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  res.setHeader("Content-Length", String(end - start + 1));
  const stream = fs.createReadStream(found.absolute_path, { start, end });
  stream.on("error", () => res.destroy());
  return stream.pipe(res);
}

app.get("/api/public-corpora/:slug/sections", rlPublicCorpusRead, async (req, res) => {
  if (!physicsTaskResourcesEnabled()) return physicsTaskResourceNotFound(res);
  try {
    const sections = await getPhysicsTaskResourceRepo().listPublicSections(req.params.slug);
    if (!sections.length) return physicsTaskResourceNotFound(res);
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.set("X-Content-Type-Options", "nosniff");
    return res.json({ ok: true, schema_version: "physics_sections.1.0.0", slug: req.params.slug, sections });
  } catch (error) { return physicsTaskResourceError(res, error); }
});
app.get("/api/public-corpora/:slug/works/:workId/resources", rlPublicCorpusRead, async (req, res) => {
  if (!physicsTaskResourcesEnabled()) return physicsTaskResourceNotFound(res);
  try {
    const resources = await getPhysicsTaskResourceRepo().listPublicResources(req.params.slug, req.params.workId);
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.set("X-Content-Type-Options", "nosniff");
    return res.json({ ok: true, schema_version: "physics_task_resources.1.0.0", slug: req.params.slug, public_work_id: req.params.workId, resources });
  } catch (error) { return physicsTaskResourceError(res, error); }
});
app.get("/api/public-corpora/:slug/resource-index", rlPublicCorpusRead, async (req, res) => {
  if (!physicsTaskResourcesEnabled()) return physicsTaskResourceNotFound(res);
  try {
    const resources = await getPhysicsTaskResourceRepo().listPublicResourceIndex(req.params.slug);
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.set("X-Content-Type-Options", "nosniff");
    return res.json({ ok: true, schema_version: "physics_task_resource_index.1.0.0", slug: req.params.slug, resources });
  } catch (error) { return physicsTaskResourceError(res, error); }
});
app.get("/api/public-corpora/:slug/resources/:revisionId/file", rlPublicCorpusRead, async (req, res) => {
  if (!physicsTaskResourcesEnabled()) return physicsTaskResourceNotFound(res);
  try { return sendImmutablePdf(req, res, await getPhysicsTaskResourceRepo().getPublicFile(req.params.slug, req.params.revisionId)); }
  catch (error) { return physicsTaskResourceError(res, error); }
});
// MASS_ACCESS_I4_PUBLIC_READ_END

// ============================================================================
// GROUP_SONG_CORPUS_P0 — restricted group corpus. Unlike Ben-Yehuda, no work
// or MP3 is mounted under express.static: every byte requires a signed-in user
// with ACTIVE membership. Bundles retain the existing importBundle shape so the
// Reading Room can reuse its offline reader without a second content model.
// ============================================================================
const groupCorpusRepo = require("./db/groupCorpusRepo");
const groupInviteRepo = require("./db/groupInviteRepo");
const rlGroupCorpus = makeRateLimiter({ windowMs: 60_000, max: 120, name: "group-corpus" });
const rlGroupInviteRedeem = makeRateLimiter({ windowMs: 10 * 60_000, max: 12, name: "group-invite-redeem" });
const rlGroupInviteOwner = makeRateLimiter({ windowMs: 60 * 60_000, max: 240, name: "group-invite-owner" });
function groupCorpusError(res, e) {
  const code = String((e && (e.code || e.message)) || "GROUP_CORPUS_FAILED");
  if (["GROUP_CORPUS_NOT_FOUND", "GROUP_CORPUS_WORK_NOT_FOUND", "GROUP_CORPUS_AUDIO_NOT_FOUND", "GROUP_CORPUS_TIMING_NOT_FOUND"].includes(code))
    return res.status(404).json({ ok: false, error: code });
  if (code === "GROUP_CORPUS_FILE_INVALID") return res.status(500).json({ ok: false, error: code });
  if (code === "GROUP_CORPUS_IMPORT_INVALID") return res.status(400).json({ ok: false, error: code });
  if (["GROUP_INVITE_INVALID","GROUP_INVITE_NOT_FOUND","GROUP_MEMBER_NOT_FOUND"].includes(code)) return res.status(404).json({ok:false,error:code});
  if (["GROUP_INVITE_DISPLAY_NAME_INVALID","GROUP_MEMBER_STATUS_INVALID"].includes(code)) return res.status(400).json({ok:false,error:code});
  if (code === "GROUP_INVITE_ACTIVE_LIMIT") return res.status(409).json({ok:false,error:code});
  return res.status(500).json({ ok: false, error: "GROUP_CORPUS_FAILED" });
}

async function requireGroupCorpusOwner(req, res, next) {
  const auth = await requireUser(req, res); if (!auth) return;
  try { req.groupCorpusOwner = { auth, corpus:await groupCorpusRepo.ownerCorpus(auth.user.id, req.params.corpusId) }; return next(); }
  catch (e) { return groupCorpusError(res, e); }
}
function requireGroupCorpusOwnerCsrf(req,res,next) {
  if (!req.groupCorpusOwner || !requireCsrf(req,res,req.groupCorpusOwner.auth)) return;
  next();
}
function requireSameOriginUpload(req, res, next) {
  const origin=String(req.headers.origin||"").trim(), referer=String(req.headers.referer||"").trim();
  const host=String(req.headers.host||"").trim(), expected=(req.protocol||"https")+"://"+host;
  if (origin && origin !== expected) return res.status(403).json({ok:false,error:"BAD_ORIGIN"});
  if (!origin && referer && !referer.startsWith(expected+"/")) return res.status(403).json({ok:false,error:"BAD_REFERER"});
  next();
}
function requireStrictSameOriginJson(req,res,next){
  const ct=String(req.headers["content-type"]||"").toLowerCase();
  if(!ct.startsWith("application/json"))return res.status(415).json({ok:false,error:"UNSUPPORTED_MEDIA_TYPE"});
  const origin=String(req.headers.origin||"").trim(),host=String(req.headers.host||"").trim();
  const expected=(req.protocol||"https")+"://"+host;
  if(!origin||origin!==expected)return res.status(403).json({ok:false,error:"BAD_ORIGIN"});
  res.set("Cache-Control","no-store");res.set("Vary","Origin");next();
}
function groupCorpusFileSha256(file) {
  return new Promise((resolve,reject)=>{const h=crypto.createHash("sha256"),s=fs.createReadStream(file);s.on("error",reject);s.on("data",(b)=>h.update(b));s.on("end",()=>resolve(h.digest("hex")));});
}

app.get("/api/group-corpora", rlGroupCorpus, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const corpora = await groupCorpusRepo.listCorpora(auth.user.id);
    return res.json({ ok: true, schema_version: "group_corpora.1.0.0", corpora });
  } catch (e) { return groupCorpusError(res, e); }
});

// Passwordless small-group access. The raw token lives only in the URL fragment
// and POST body; DB/audit/server URLs retain only opaque invite ids and hashes.
app.post("/api/group-invites/preview",rlGroupInviteRedeem,requireStrictSameOriginJson,async(req,res)=>{
  try{return res.json({ok:true,schema_version:"group_invite_preview.1.0.0",...(await groupInviteRepo.preview(req.body&&req.body.token))});}
  catch(e){return groupCorpusError(res,e);}
});
app.post("/api/group-invites/redeem",rlGroupInviteRedeem,requireStrictSameOriginJson,async(req,res)=>{
  try{
    const out=await groupInviteRepo.redeem(req.body&&req.body.token,{display_name:req.body&&req.body.display_name,device_label:req.body&&req.body.device_label,ip:req.ip,user_agent:req.get("user-agent")});
    setSessionCookie(req,res,out.cookie_value,Math.floor(identityRepo.SESSION_TTL_MS/1000));
    identityRepo.audit("group_invite_redeemed",out.user.id,{kind:out.kind,corpus_id:out.corpus.corpus_id},req.ip);
    return res.json({ok:true,schema_version:"group_invite_redeem.1.0.0",user:out.user,corpus:out.corpus,csrf:out.csrf,expires_at:out.expires_at});
  }catch(e){return groupCorpusError(res,e);}
});

app.get("/api/group-corpora/:corpusId/access",rlGroupInviteOwner,requireGroupCorpusOwner,async(req,res)=>{
  try{res.set("Cache-Control","private, no-store, max-age=0");return res.json({ok:true,schema_version:"group_corpus_access.1.0.0",...(await groupInviteRepo.listAccess(req.groupCorpusOwner.auth.user.id,req.params.corpusId))});}
  catch(e){return groupCorpusError(res,e);}
});
app.post("/api/group-corpora/:corpusId/invites",rlGroupInviteOwner,requireGroupCorpusOwner,requireGroupCorpusOwnerCsrf,requireStrictSameOriginJson,async(req,res)=>{
  try{
    const out=await groupInviteRepo.createInvite(req.groupCorpusOwner.auth.user.id,req.params.corpusId,{target_user_id:req.body&&req.body.target_user_id});
    const origin=(req.protocol||"https")+"://"+String(req.headers.host||"");
    const inviteUrl=origin+"/library.html#join="+encodeURIComponent(out.token);
    identityRepo.audit("group_invite_created",req.groupCorpusOwner.auth.user.id,{invite_id:out.invite_id,kind:out.kind,corpus_id:out.corpus_id,target_user_id:out.target_user_id},req.ip);
    return res.status(201).json({ok:true,schema_version:"group_invite_created.1.0.0",invite_id:out.invite_id,kind:out.kind,expires_at:out.expires_at,invite_url:inviteUrl});
  }catch(e){return groupCorpusError(res,e);}
});
app.post("/api/group-corpora/:corpusId/invites/:inviteId/revoke",rlGroupInviteOwner,requireGroupCorpusOwner,requireGroupCorpusOwnerCsrf,requireStrictSameOriginJson,async(req,res)=>{
  try{const out=await groupInviteRepo.revokeInvite(req.groupCorpusOwner.auth.user.id,req.params.corpusId,req.params.inviteId);identityRepo.audit("group_invite_revoked",req.groupCorpusOwner.auth.user.id,{invite_id:out.invite_id,corpus_id:req.params.corpusId},req.ip);return res.json({ok:true,...out});}
  catch(e){return groupCorpusError(res,e);}
});
app.post("/api/group-corpora/:corpusId/members/:userId/status",rlGroupInviteOwner,requireGroupCorpusOwner,requireGroupCorpusOwnerCsrf,requireStrictSameOriginJson,async(req,res)=>{
  try{const out=await groupInviteRepo.setMemberStatus(req.groupCorpusOwner.auth.user.id,req.params.corpusId,req.params.userId,req.body&&req.body.status);identityRepo.audit("group_member_status",req.groupCorpusOwner.auth.user.id,{corpus_id:req.params.corpusId,target_user_id:out.user_id,status:out.status},req.ip);return res.json({ok:true,...out});}
  catch(e){return groupCorpusError(res,e);}
});

app.get("/api/group-corpora/:corpusId/works", rlGroupCorpus, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const out = await groupCorpusRepo.listWorks(auth.user.id, req.params.corpusId);
    return res.json({ ok: true, schema_version: "group_corpus_catalog.1.0.0", ...out });
  } catch (e) { return groupCorpusError(res, e); }
});

const GROUP_LEARNING_INDEX_PACKET_MAX = 256 * 1024;
function encodeGroupLearningCursor(signature, offset) {
  return Buffer.from(JSON.stringify({ v: 1, s: String(signature), o: Number(offset) }), "utf8").toString("base64url");
}
function decodeGroupLearningCursor(value, signature) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (!parsed || parsed.v !== 1 || parsed.s !== String(signature) || !Number.isInteger(parsed.o) || parsed.o < 0) return null;
    return parsed.o;
  } catch (_) { return null; }
}

// B7 hardening — a complete, membership-gated lexical index for the protected
// corpus. The Worker-built sidecar contains only aggregate pid frequencies and
// exact revision bindings: no title/body/translation, learner state or identity.
app.get("/api/group-corpora/:corpusId/learning-index", rlGroupCorpus, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const out = await groupCorpusRepo.getLearningIndex(auth.user.id, req.params.corpusId);
    const index = out.index;
    const offset = decodeGroupLearningCursor(req.query.cursor, index.index_signature);
    if (offset == null || offset > index.items.length) return res.status(400).json({ ok: false, error: "BAD_CURSOR" });
    const requested = Math.max(1, Math.min(48, Math.trunc(Number(req.query.limit) || 16)));
    const items = [];
    for (let i = offset; i < index.items.length && items.length < requested; i += 1) {
      const candidate = items.concat(index.items[i]);
      const probe = {
        ok: true, schema_version: "group_learning_index.1.0.0", index_revision: index.index_signature,
        resolver_version: index.resolver_version, matched_total: index.matched_total,
        prepared_total: index.prepared_total, unsupported_total: index.unsupported_total,
        items: candidate,
        next_cursor: offset + candidate.length < index.items.length
          ? encodeGroupLearningCursor(index.index_signature, offset + candidate.length) : null,
      };
      if (Buffer.byteLength(JSON.stringify(probe), "utf8") > GROUP_LEARNING_INDEX_PACKET_MAX) break;
      items.push(index.items[i]);
    }
    if (offset < index.items.length && !items.length) return res.status(413).json({ ok: false, error: "GROUP_LEARNING_INDEX_ITEM_TOO_LARGE" });
    const nextOffset = offset + items.length;
    const body = {
      ok: true,
      schema_version: "group_learning_index.1.0.0",
      index_revision: index.index_signature,
      resolver_version: index.resolver_version,
      matched_total: index.matched_total,
      prepared_total: index.prepared_total,
      unsupported_total: index.unsupported_total,
      items,
      next_cursor: nextOffset < index.items.length ? encodeGroupLearningCursor(index.index_signature, nextOffset) : null,
    };
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > GROUP_LEARNING_INDEX_PACKET_MAX) throw new Error("GROUP_CORPUS_LEARNING_INDEX_PACKET_LIMIT");
    res.set("Cache-Control", "private, no-store, max-age=0");
    res.set("Cross-Origin-Resource-Policy", "same-origin");
    res.set("X-Content-Type-Options", "nosniff");
    return res.json(body);
  } catch (e) { return groupCorpusError(res, e); }
});

app.get("/api/group-corpora/:corpusId/export/catalog", rlGroupCorpus, requireGroupCorpusOwner, async (req,res) => {
  try {
    const out=await groupCorpusRepo.listWorks(req.groupCorpusOwner.auth.user.id,req.params.corpusId);
    res.setHeader("Cache-Control","private, no-store"); res.setHeader("Content-Disposition",`attachment; filename="${out.corpus.slug || "group-corpus"}-catalog.json"`);
    return res.json({ok:true,schema_version:"group_corpus_catalog_backup.1.0.0",exported_at:new Date().toISOString(),corpus:out.corpus,works:out.works});
  } catch(e){return groupCorpusError(res,e);}
});

app.post("/api/group-corpora/:corpusId/import/catalog",rlGroupCorpus,requireGroupCorpusOwner,requireGroupCorpusOwnerCsrf,requireSameOriginUpload,
  express.json({limit:"2mb"}),async(req,res)=>{
    try {
      if(!req.body||req.body.schema_version!=="group_corpus_catalog_backup.1.0.0"||String(req.body.corpus&&req.body.corpus.corpus_id)!==String(req.params.corpusId))
        return res.status(400).json({ok:false,error:"GROUP_CORPUS_IMPORT_INVALID"});
      const out=await groupCorpusRepo.updateCatalogMetadata(req.groupCorpusOwner.auth.user.id,req.params.corpusId,req.body);
      return res.json({ok:true,schema_version:"group_corpus_catalog_import_result.1.0.0",...out});
    }catch(e){return groupCorpusError(res,e);}
  });

app.get("/api/group-corpora/:corpusId/export/backup",rlGroupCorpus,requireGroupCorpusOwner,async(req,res)=>{
  try {
    const auth=req.groupCorpusOwner.auth; const [inventory,catalog]=await Promise.all([
      groupCorpusRepo.listBackupFiles(auth.user.id,req.params.corpusId),groupCorpusRepo.listWorks(auth.user.id,req.params.corpusId)]);
    for(const f of inventory.files){const abs=groupCorpusRepo.privatePath(f.storage_path),st=await fs.promises.stat(abs);if(!st.isFile()||(f.bytes!=null&&st.size!==f.bytes)||(await groupCorpusFileSha256(abs))!==f.sha256)throw new Error("GROUP_CORPUS_FILE_INVALID");}
    const manifest={schema_version:"group_corpus_backup.1.0.0",exported_at:new Date().toISOString(),corpus_id:inventory.corpus.corpus_id,files:inventory.files};
    res.setHeader("Content-Type","application/zip"); res.setHeader("Cache-Control","private, no-store");
    res.setHeader("Content-Disposition",`attachment; filename="${inventory.corpus.slug || "group-corpus"}-backup.zip"`);
    const archive=archiver("zip",{zlib:{level:6}}); archive.on("error",(e)=>{if(!res.headersSent)groupCorpusError(res,e);else res.destroy(e);}); archive.pipe(res);
    archive.append(JSON.stringify(manifest,null,2),{name:"manifest.json"});
    archive.append(JSON.stringify({ok:true,schema_version:"group_corpus_catalog_backup.1.0.0",exported_at:manifest.exported_at,corpus:catalog.corpus,works:catalog.works},null,2),{name:"catalog.json"});
    for(const f of inventory.files)archive.file(groupCorpusRepo.privatePath(f.storage_path),{name:f.archive_path});
    archive.finalize();
  }catch(e){return groupCorpusError(res,e);}
});

app.post("/api/group-corpora/:corpusId/import/backup",rlGroupCorpus,requireGroupCorpusOwner,requireGroupCorpusOwnerCsrf,requireSameOriginUpload,
  express.raw({type:"application/zip",limit:"500mb"}),async(req,res)=>{
    try {
      if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({ok:false,error:"GROUP_CORPUS_IMPORT_INVALID"});
      let zip;try{zip=new AdmZip(req.body);}catch(_){return res.status(400).json({ok:false,error:"GROUP_CORPUS_IMPORT_INVALID"});}
      const me=zip.getEntry("manifest.json");if(!me)return res.status(400).json({ok:false,error:"GROUP_CORPUS_IMPORT_INVALID"});
      let manifest;try{manifest=JSON.parse(me.getData().toString("utf8"));}catch(_){return res.status(400).json({ok:false,error:"GROUP_CORPUS_IMPORT_INVALID"});}
      if(manifest.schema_version!=="group_corpus_backup.1.0.0"||String(manifest.corpus_id)!==String(req.params.corpusId)||!Array.isArray(manifest.files)||manifest.files.length>20000)
        return res.status(400).json({ok:false,error:"GROUP_CORPUS_IMPORT_INVALID"});
      const inventory=await groupCorpusRepo.listBackupFiles(req.groupCorpusOwner.auth.user.id,req.params.corpusId);
      const supplied=new Map(manifest.files.map((f)=>[String(f.archive_path),f]));if(supplied.size!==inventory.files.length)return res.status(409).json({ok:false,error:"GROUP_CORPUS_BACKUP_MISMATCH"});
      const verified=[];
      for(const expected of inventory.files){const listed=supplied.get(expected.archive_path),entry=zip.getEntry(expected.archive_path);if(!listed||!entry||entry.isDirectory||listed.storage_path!==expected.storage_path||listed.sha256!==expected.sha256) return res.status(409).json({ok:false,error:"GROUP_CORPUS_BACKUP_MISMATCH"});
        const data=entry.getData();if((expected.bytes!=null&&data.length!==expected.bytes)||crypto.createHash("sha256").update(data).digest("hex")!==expected.sha256)return res.status(409).json({ok:false,error:"GROUP_CORPUS_BACKUP_MISMATCH"}); verified.push({expected,data});}
      let restored=0,already=0;
      for(const {expected,data} of verified){const dest=groupCorpusRepo.privatePath(expected.storage_path);if(fs.existsSync(dest)){if(crypto.createHash("sha256").update(fs.readFileSync(dest)).digest("hex")!==expected.sha256)return res.status(409).json({ok:false,error:"GROUP_CORPUS_TARGET_MISMATCH"});already++;continue;}
        await fs.promises.mkdir(path.dirname(dest),{recursive:true});const tmp=dest+".restore-"+process.pid;await fs.promises.writeFile(tmp,data,{flag:"wx"});await fs.promises.rename(tmp,dest);restored++;}
      return res.json({ok:true,schema_version:"group_corpus_backup_import_result.1.0.0",restored,already});
    }catch(e){return groupCorpusError(res,e);}
  });

app.get("/api/group-corpora/:corpusId/works/:workId", rlGroupCorpus, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const out = await groupCorpusRepo.getWork(auth.user.id, req.params.corpusId, req.params.workId);
    const st = await fs.promises.stat(out.absolute_path);
    if (!st.isFile()) return res.status(404).json({ ok: false, error: "GROUP_CORPUS_WORK_NOT_FOUND" });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.sendFile(out.absolute_path);
  } catch (e) { return groupCorpusError(res, e); }
});

app.get("/api/group-corpora/:corpusId/audio/:assetKey/timing", rlGroupCorpus, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const out = await groupCorpusRepo.getAudioTiming(auth.user.id, req.params.corpusId, req.params.assetKey);
    const st = await fs.promises.stat(out.absolute_path);
    if (!st.isFile() || st.size !== out.audio.timing_bytes)
      return res.status(404).json({ ok: false, error: "GROUP_CORPUS_TIMING_NOT_FOUND" });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.sendFile(out.absolute_path);
  } catch (e) { return groupCorpusError(res, e); }
});

app.get("/api/group-corpora/:corpusId/audio/:assetKey", rlGroupCorpus, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    const out = await groupCorpusRepo.getAudio(auth.user.id, req.params.corpusId, req.params.assetKey);
    const st = await fs.promises.stat(out.absolute_path);
    if (!st.isFile() || st.size !== out.audio.bytes)
      return res.status(404).json({ ok: false, error: "GROUP_CORPUS_AUDIO_NOT_FOUND" });
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.sendFile(out.absolute_path);
  } catch (e) { return groupCorpusError(res, e); }
});

// ============================================================================
// CLG-P4.5 — Web Push (AI_MENTOR_RECON §8/§9 P4.5): ежедневный нудж «N слов
// ждут повторения» БЕЗ содержимого. Первая видимая ценность пивота. Подписка —
// класс A (delete/export sweep покрывает автоматически). VAPID: env либо
// стабильные авто-ключи на томе. Sweep — раз в 15 минут (суточный дедуп внутри).
// ============================================================================
const pushRepo = require("./db/pushRepo");
const nudgeCoordinator = require("./db/nudgeCoordinator");              // Wave 2 N1 shared channel policy+claim
const rlPush = makeRateLimiter({ windowMs: 60_000, max: 30, name: "push" });

app.get("/api/push/vapid-key", rlPush, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try { res.json({ ok: true, key: pushRepo.ensureVapid().publicKey }); }
  catch (e) { res.status(503).json({ ok: false, error: "PUSH_UNAVAILABLE", message: e.message }); }
});

app.post("/api/push/subscribe", rlPush, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const out = await pushRepo.subscribe(auth.user.id, auth.session.deviceId, (req.body && req.body.subscription) || req.body);
    if (out.ok === false) return res.status(400).json(out);
    identityRepo.audit("push_subscribe", auth.user.id, {}, req.ip);
    res.json(out);
  } catch (e) { res.status(500).json({ ok: false, error: "SUBSCRIBE_FAILED", message: e.message }); }
});

app.post("/api/push/unsubscribe", rlPush, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try { res.json(await pushRepo.unsubscribe(auth.user.id, req.body && req.body.endpoint)); }
  catch (e) { res.status(500).json({ ok: false, error: "UNSUBSCRIBE_FAILED", message: e.message }); }
});

app.get("/api/push/status", rlPush, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try { res.json({ ok: true, ...(await pushRepo.status(auth.user.id)) }); }
  catch (e) { res.status(500).json({ ok: false, error: "STATUS_FAILED", message: e.message }); }
});

// «Проверить» из ☁-модала: немедленный нудж на все подписки пользователя (real-device verify).
app.post("/api/push/test", rlPush, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!requireCsrf(req, res, auth)) return;
  try {
    const out = await pushRepo.sendTest(auth.user.id);
    if (out.ok === false && out.error) return res.status(400).json(out);
    res.json(out);
  } catch (e) { res.status(500).json({ ok: false, error: "PUSH_TEST_FAILED", message: e.message }); }
});

// Ops/gate-триггер sweep-а (требует RESEARCH_ADMIN_TOKEN — паттерн requireAdminToken).
app.post("/api/push/sweep", async (req, res) => {
  if (!requireAdminToken(req, res)) return;
  const options = { nowMs: req.body && req.body.now ? Number(req.body.now) : null, force: !!(req.body && req.body.force) };
  try { res.json(await (nudgeCoordinator.flagOn() ? nudgeCoordinator.runUnifiedSweep(options) : pushRepo.runPushSweep(options))); }
  catch (e) { res.status(500).json({ ok: false, error: "SWEEP_FAILED", message: e.message }); }
});

// P7.3a — проактивный Telegram-нудж sweep (за флагом AGENT_NUDGE_ENABLED; runNudgeSweep сам гейтит).
// При N1 оба admin endpoint делегируют ОДНОМУ coordinator: channel выбран ДО единого claim.
app.post("/api/nudge/sweep", async (req, res) => {
  if (!requireAdminToken(req, res)) return;
  const options = { nowMs: req.body && req.body.now ? Number(req.body.now) : null, force: !!(req.body && req.body.force) };
  try { res.json(await (nudgeCoordinator.flagOn() ? nudgeCoordinator.runUnifiedSweep(options) : nudgeRepo.runNudgeSweep(options))); }
  catch (e) { res.status(500).json({ ok: false, error: "NUDGE_SWEEP_FAILED", message: e.message }); }
});

// Wave 2 N1 — ровно ОДИН scheduler-mode на процесс. Flag-off откатывает два
// legacy adapter sweep'а; flag-on запускает общий selector. Они никогда не
// работают одновременно, иначе timing-race вернулась бы через rollback-флаг.
setInterval(() => {
  try {
    if (getDbHealth().ready !== true) return;
    const options = { nowMs: Date.now() };
    if (nudgeCoordinator.flagOn()) nudgeCoordinator.runUnifiedSweep(options).catch(() => {});
    else {
      pushRepo.runPushSweep(options).catch(() => {});
      nudgeRepo.runNudgeSweep(options).catch(() => {});
    }
  } catch (_) {}
}, 15 * 60_000).unref();

app.get("/api/learner/log", rlLearnerRead, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try {
    // ROWID cursor (hole-free under the txn-lock; see learnerLogRepo.readLog). Legacy `since`
    // (ISO ingested_at) is deliberately IGNORED — an old cursor value restarts the scan from 0,
    // which is safe (client INSERT OR IGNORE) and heals any timestamp-cursor hole.
    const rows = await learnerLogRepo.readLog(auth.user.id, {
      afterRid: req.query.after_rid || 0, limit: req.query.limit,
    });
    res.json({ ok: true, rows, next_rid: rows.length ? rows[rows.length - 1].rid : null });
  } catch (e) { res.status(500).json({ ok: false, error: "READ_FAILED", message: e.message }); }
});

app.get("/api/learner/counts", rlLearnerRead, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  try { res.json({ ok: true, ...(await learnerLogRepo.counts(auth.user.id)) }); }
  catch (e) { res.status(500).json({ ok: false, error: "COUNTS_FAILED", message: e.message }); }
});

app.post("/api/tts/key", (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const key = req.body && req.body.key;
    if (!key || typeof key !== "object") {
      return res.status(400).json({ error: "Ожидается {key: {...service_account JSON...}}" });
    }
    if (key.type !== "service_account") {
      return res.status(400).json({ error: 'Поле "type" должно быть "service_account"' });
    }
    for (const field of REQUIRED_TTS_KEY_FIELDS) {
      if (!key[field] || typeof key[field] !== "string") {
        return res.status(400).json({ error: `Отсутствует или пустое поле: ${field}` });
      }
    }
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TTS_KEY_PATH, JSON.stringify(key, null, 2), { encoding: "utf8" });
    try { fs.chmodSync(TTS_KEY_PATH, 0o600); } catch (_) {}

    delete process.env.GOOGLE_CLOUD_TTS_KEY;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = TTS_KEY_PATH;
    initTtsClient();

    res.json({
      ok: true,
      configured: true,
      source: "uploaded",
      project_id: key.project_id,
      client_email: key.client_email,
    });
  } catch (e) {
    console.error("[tts] key upload error:", e);
    res.status(500).json({ error: "Не удалось сохранить TTS ключ", details: e.message });
  }
});

app.delete("/api/tts/key", (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    if (fs.existsSync(TTS_KEY_PATH)) fs.unlinkSync(TTS_KEY_PATH);
    if (ORIGINAL_TTS_KEY_ENV) {
      process.env.GOOGLE_CLOUD_TTS_KEY = ORIGINAL_TTS_KEY_ENV;
    } else {
      delete process.env.GOOGLE_CLOUD_TTS_KEY;
    }
    if (ORIGINAL_TTS_CREDENTIALS_ENV) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = ORIGINAL_TTS_CREDENTIALS_ENV;
    } else {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    initTtsClient();
    res.json({ ok: true, ...getTtsKeyStatusSummary() });
  } catch (e) {
    console.error("[tts] key delete error:", e);
    res.status(500).json({ error: "Не удалось удалить TTS ключ", details: e.message });
  }
});

// Создаём директории при необходимости
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir);
if (!fs.existsSync(audioCacheDir)) fs.mkdirSync(audioCacheDir);

// --------------------------------------------------------
// TTS helpers
// Google Cloud Text-to-Speech synthesizeSpeech ограничивает input.text/input.ssml
// примерно до 5000 BYTES (не символов). Для длинных текстов делаем безопасное
// разбиение на чанки и склеиваем MP3-буферы.
// --------------------------------------------------------
const TTS_MAX_INPUT_BYTES = 4900; // небольшой запас от 5000

// Безопасный целевой размер чанка (можно переопределить env-переменной)
const TTS_SAFE_TARGET_BYTES = (() => {
  const v = Number(process.env.TTS_SAFE_TARGET_BYTES);
  // по умолчанию — чуть меньше, чем TTS_MAX_INPUT_BYTES (чтобы не упереться в 5000 bytes из-за нюансов)
  if (Number.isFinite(v) && v >= 1000 && v <= TTS_MAX_INPUT_BYTES) return v;
  return 4700;
})();

function utf8ByteLength(s) {
  return Buffer.byteLength(String(s || ""), "utf8");
}

function splitTextForTts(text, maxBytes = TTS_MAX_INPUT_BYTES) {
  const src = String(text || "").trim();
  if (!src) return [];
  if (utf8ByteLength(src) <= maxBytes) return [src];

  const parts = [];
  let buf = "";

  // 1) сначала режем по строкам, чтобы уважать естественные границы
  const lines = src.split(/\r?\n/);

  function pushBuf() {
    const t = buf.trim();
    if (t) parts.push(t);
    buf = "";
  }

  function appendWithLimit(piece) {
    const candidate = buf ? (buf + "\n" + piece) : piece;
    if (utf8ByteLength(candidate) <= maxBytes) {
      buf = candidate;
      return;
    }
    // если буфер не пуст — сначала выгрузим
    if (buf) pushBuf();

    // если один кусок всё равно слишком большой — режем на предложения/слова
    if (utf8ByteLength(piece) > maxBytes) {
      // 2) предложения
      const sentences = piece.split(/(?<=[\.\!\?…])\s+/g);
      let sBuf = "";
      for (const s of sentences) {
        const c = sBuf ? (sBuf + " " + s) : s;
        if (utf8ByteLength(c) <= maxBytes) {
          sBuf = c;
          continue;
        }
        if (sBuf) {
          parts.push(sBuf.trim());
          sBuf = "";
        }
        // 3) слово/символ: крайний случай
        if (utf8ByteLength(s) > maxBytes) {
          let wBuf = "";
          for (const ch of Array.from(s)) {
            const cc = wBuf + ch;
            if (utf8ByteLength(cc) <= maxBytes) wBuf = cc;
            else {
              if (wBuf.trim()) parts.push(wBuf.trim());
              wBuf = ch;
            }
          }
          if (wBuf.trim()) parts.push(wBuf.trim());
        } else {
          parts.push(s.trim());
        }
      }
      if (sBuf.trim()) parts.push(sBuf.trim());
      return;
    }

    // кусок влезает — кладём в буфер
    buf = piece;
  }

  for (const line of lines) {
    const piece = line.trim();
    if (!piece) continue;
    appendWithLimit(piece);
  }
  if (buf) pushBuf();

  // гарантия: ни один чанк не превышает лимит
  return parts.filter(Boolean);
}
if (!fs.existsSync(geminiCacheDir)) fs.mkdirSync(geminiCacheDir);




// --------------------------------------------------------
// 4. ИНИЦИАЛИЗАЦИЯ КЛИЕНТОВ
// --------------------------------------------------------

// 4.1. Google Cloud TTS — креды из GOOGLE_CLOUD_TTS_KEY или GOOGLE_APPLICATION_CREDENTIALS
const TTS_KEY_PATH = path.join(DATA_DIR, "gcp-tts-key.json");
const ORIGINAL_TTS_KEY_ENV = process.env.GOOGLE_CLOUD_TTS_KEY || "";
const ORIGINAL_TTS_CREDENTIALS_ENV = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
const REQUIRED_TTS_KEY_FIELDS = ["type", "project_id", "private_key", "client_email"];

if (!ORIGINAL_TTS_KEY_ENV && fs.existsSync(TTS_KEY_PATH)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = TTS_KEY_PATH;
  console.log(`[TTS] using user-uploaded TTS key at ${TTS_KEY_PATH}`);
}

let ttsServiceAccount = null;
let ttsCredentialsPath = "";
let ttsClient = null;

function initTtsClient() {
  ttsServiceAccount = null;
  ttsCredentialsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();

  if (process.env.GOOGLE_CLOUD_TTS_KEY) {
    try {
      ttsServiceAccount = JSON.parse(process.env.GOOGLE_CLOUD_TTS_KEY);
      console.log("[TTS] GOOGLE_CLOUD_TTS_KEY загружен и успешно разобран как JSON");
    } catch (e) {
      console.error("[TTS] Невозможно разобрать GOOGLE_CLOUD_TTS_KEY как JSON:", e);
      ttsServiceAccount = null;
    }
  } else if (ttsCredentialsPath) {
    console.log("[TTS] Используется GOOGLE_APPLICATION_CREDENTIALS:", ttsCredentialsPath);
  } else {
    console.warn("[TTS] Не заданы GOOGLE_CLOUD_TTS_KEY и GOOGLE_APPLICATION_CREDENTIALS — будет попытка использовать дефолтные креды");
  }

  ttsClient = ttsServiceAccount
    ? new textToSpeech.TextToSpeechClient({
        projectId: ttsServiceAccount.project_id,
        credentials: {
          client_email: ttsServiceAccount.client_email,
          private_key: ttsServiceAccount.private_key,
        },
      })
    : new textToSpeech.TextToSpeechClient();

  console.log(
    "[TTS] Клиент инициализирован, режим кредов:",
    ttsServiceAccount
      ? "service_account из GOOGLE_CLOUD_TTS_KEY"
      : (ttsCredentialsPath ? "GOOGLE_APPLICATION_CREDENTIALS" : "Application Default Credentials")
  );
}

function getTtsKeyStatusSummary() {
  const inlineJson = String(process.env.GOOGLE_CLOUD_TTS_KEY || "").trim();
  const keyFile = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  const uploaded = fs.existsSync(TTS_KEY_PATH);
  let source = null;
  let project_id = null;
  let client_email = null;

  try {
    if (inlineJson) {
      source = "env_json";
      const raw = JSON.parse(inlineJson);
      project_id = raw.project_id || null;
      client_email = raw.client_email || null;
    } else if (keyFile) {
      source = uploaded && path.resolve(keyFile) === path.resolve(TTS_KEY_PATH) ? "uploaded" : "env_file";
      if (fs.existsSync(keyFile)) {
        const raw = JSON.parse(fs.readFileSync(keyFile, "utf8"));
        project_id = raw.project_id || null;
        client_email = raw.client_email || null;
      } else {
        source = null;
      }
    }
  } catch (_) {
    source = source || "invalid";
  }

  return {
    configured: !!source,
    source,
    project_id,
    client_email,
  };
}

initTtsClient();

// --------------------------------------------------------
// 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ USAGE/ЛИМИТОВ
// --------------------------------------------------------

// Структура usage.json (пример):
// {
//   "ttsChars": 12345,
//   "ttsCost": 0.12,
//   "geminiRequests": 7,
//   "geminiRequestsTotal": 20,
//   "geminiDayStart": "2024-12-10T00:00:00.000Z",
//   "geminiDailyLimitHit": false
// }

function getUsage() {
  try {
    if (!fs.existsSync(usageFile)) {
      // начальное состояние, если файла ещё нет
      return {
        ttsChars: 0,
        ttsCost: 0,
        // ДНЕВНОЙ счётчик запросов Gemini
        geminiRequests: 0,
        // ОБЩИЙ счётчик запросов Gemini (не сбрасывается)
        geminiRequestsTotal: 0,
        geminiDayStart: null,
        geminiDailyLimitHit: false,
      };
    }

    const raw = fs.readFileSync(usageFile, "utf8");
    const data = JSON.parse(raw);

    if (typeof data.ttsChars !== "number") data.ttsChars = 0;
    if (typeof data.ttsCost !== "number") data.ttsCost = 0;

    // дневной счётчик
    if (typeof data.geminiRequests !== "number") data.geminiRequests = 0;
    // общий счётчик
    if (typeof data.geminiRequestsTotal !== "number") data.geminiRequestsTotal = 0;

    if (!data.geminiDayStart) data.geminiDayStart = null;
    if (!Object.prototype.hasOwnProperty.call(data, "geminiDailyLimitHit")) {
      data.geminiDailyLimitHit = false;
    }

    return data;
  } catch (e) {
    console.error("Ошибка чтения usage.json:", e);
    return {
      ttsChars: 0,
      ttsCost: 0,
      geminiRequests: 0,
      geminiRequestsTotal: 0,
      geminiDayStart: null,
      geminiDailyLimitHit: false,
    };
  }
}

function saveUsage(data) {
  try {
    fs.writeFileSync(usageFile, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("Ошибка записи usage.json:", e);
  }
}

// Условная стоимость TTS: 1M символов = 16$ (пример)
const TTS_COST_PER_MILLION = 16;

// Ежедневный лимит по количеству запросов к Gemini
const GEMINI_DAILY_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT || "50");

// Час "сброса дня" квоты в UTC (например, 21:00 UTC)
const GEMINI_RESET_HOUR_UTC = Number(
  process.env.GEMINI_RESET_HOUR_UTC || "21"
);

// Определяем "начало дня квоты" с учётом GEMINI_RESET_HOUR_UTC
function getCurrentQuotaDayStartISO() {
  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDate = now.getUTCDate();

  const todayResetMs = Date.UTC(
    utcYear,
    utcMonth,
    utcDate,
    GEMINI_RESET_HOUR_UTC,
    0,
    0,
    0
  );

  let quotaDayStartMs;

  if (now.getTime() >= todayResetMs) {
    quotaDayStartMs = todayResetMs;
  } else {
    quotaDayStartMs = todayResetMs - 24 * 60 * 60 * 1000;
  }

  return new Date(quotaDayStartMs).toISOString();
}

// Сбросить счётчик Gemini, если "день квоты" поменялся
function ensureGeminiDay() {
  const usage = getUsage();
  const currentDayStart = getCurrentQuotaDayStartISO();

  if (usage.geminiDayStart !== currentDayStart) {
    usage.geminiDayStart = currentDayStart;
    usage.geminiRequests = 0;
    usage.geminiDailyLimitHit = false;
    saveUsage(usage);
  }
}

// Увеличить usage по TTS и Gemini
function updateUsage(type, value) {
  const usage = getUsage();

  if (type === "tts") {
    const chars = value || 0;
    usage.ttsChars += chars;
    usage.ttsCost = (usage.ttsChars / 1_000_000) * TTS_COST_PER_MILLION;
  } else if (type === "gemini") {
    ensureGeminiDay();

    const inc = value || 1;

    if (typeof usage.geminiRequests !== "number") usage.geminiRequests = 0;
    usage.geminiRequests += inc;

    if (typeof usage.geminiRequestsTotal !== "number") {
      usage.geminiRequestsTotal = 0;
    }
    usage.geminiRequestsTotal += inc;
  }

  saveUsage(usage);
}

function markGeminiDailyLimitHit() {
  const usage = getUsage();
  usage.geminiDailyLimitHit = true;
  saveUsage(usage);
}

// --------------------------------------------------------
// 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ TTS
// --------------------------------------------------------

// BYOK: per-request Google Cloud TTS via REST API.
// The @google-cloud/text-to-speech SDK does not support API-key auth (only
// service-account/OAuth), so we call texttospeech.googleapis.com directly with
// the user's AIza… key from their browser. The shape of `request` mirrors the
// SDK's synthesizeSpeech payload ({ input, voice, audioConfig }).
async function gcpTtsRestSynthesize(apiKey, request) {
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!resp.ok) {
    let bodyText = "";
    try { bodyText = await resp.text(); } catch (_) {}
    let parsed = null;
    try { parsed = JSON.parse(bodyText); } catch (_) {}
    const err = new Error(
      (parsed && parsed.error && parsed.error.message) ||
      `Google TTS REST error: HTTP ${resp.status}`
    );
    err.status = resp.status;
    err.code = parsed && parsed.error && parsed.error.status;
    err.upstream = parsed && parsed.error ? { status: parsed.error.status, code: parsed.error.code } : null;
    throw err;
  }
  const data = await resp.json();
  if (!data || !data.audioContent) {
    throw new Error("Google TTS REST: empty audioContent");
  }
  return Buffer.from(data.audioContent, "base64");
}

async function synthesizeWithCache(
  apiKey,
  text,
  languageCode,
  voiceName,
  speakingRate,
  pitch
) {
  const hash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({ text, languageCode, voiceName, speakingRate, pitch })
    )
    .digest("hex");

  const cachePath = path.join(audioCacheDir, `${hash}.mp3`);

  // Cache hit: serve without needing the user's API key.
  if (fs.existsSync(cachePath)) {
    const audioContent = fs.readFileSync(cachePath).toString("base64");
    return { audioContent, fromCache: true, cacheId: hash };
  }

  // Cache miss: a BYOK key is required to call Google TTS.
  if (!apiKey) {
    const err = new Error("TTS API key required (BYOK)");
    err.code = "TTS_KEY_REQUIRED";
    err.status = 401;
    throw err;
  }

  // Если текст превышает лимит по BYTES, синтезируем чанками и склеиваем MP3.
  // Это устойчивее, чем падать с INVALID_ARGUMENT.
  const byteLen = Buffer.byteLength(String(text || ""), "utf8");
  if (byteLen > TTS_MAX_INPUT_BYTES) {
    const parts = splitTextForTts(String(text || ""), TTS_SAFE_TARGET_BYTES);

	console.log("[TTS] chunking", {
    byteLen,
    partsCount: parts.length,
    maxPartBytes: Math.max(...parts.map(p => Buffer.byteLength(p, "utf8"))),
    safeTarget: TTS_SAFE_TARGET_BYTES,
    hardLimit: TTS_MAX_INPUT_BYTES
  });

    const buffers = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part || !part.trim()) continue;

      const requestPart = {
        input: { text: part },
        voice: {
          languageCode,
          name: voiceName || undefined,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: speakingRate || 1.0,
          pitch: pitch || 0.0,
        },
      };

      // BYOK: per-request REST call (returns mp3 buffer).
      const chunkBuf = await gcpTtsRestSynthesize(apiKey, requestPart);
      if (!chunkBuf || !chunkBuf.length) {
        throw new Error("TTS: empty audioContent for chunk #" + (i + 1));
      }
      buffers.push(chunkBuf);
    }

    const merged = Buffer.concat(buffers);
    const audioContent = merged.toString("base64");

    try {
      fs.writeFileSync(cachePath, merged);
    } catch (e) {
      console.error("Ошибка записи в audio-cache (chunked):", e);
    }

    return { audioContent, fromCache: false, cacheId: hash, chunked: true, chunks: parts.length };
  }

  const request = {
    input: { text },
    voice: {
      languageCode,
      name: voiceName || undefined,
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: speakingRate || 1.0,
      pitch: pitch || 0.0,
    },
  };

  const mp3Buffer = await gcpTtsRestSynthesize(apiKey, request);
  const audioContent = mp3Buffer.toString("base64");

  try {
    fs.writeFileSync(cachePath, Buffer.from(audioContent, "base64"));
  } catch (e) {
    console.error("Ошибка записи в audio-cache:", e);
  }

  return { audioContent, fromCache: false, cacheId: hash };
}

// --------------------------------------------------------
// V3 Audio Assets (Step 8.2): asset_key → mp3 in audio-cache → upsert audio_assets → link
// Safety:
// - does NOT change the single audio pipeline in UI (no new listeners)
// - DB failures are non-fatal for TTS response
// --------------------------------------------------------

async function synthesizeMp3Buffer(
  apiKey,
  text,
  languageCode,
  voiceName,
  speakingRate,
  pitch
) {
  const clean = String(text || "").trim();
  if (!clean) return Buffer.alloc(0);

  if (!apiKey) {
    const err = new Error("TTS API key required (BYOK)");
    err.code = "TTS_KEY_REQUIRED";
    err.status = 401;
    throw err;
  }

  const byteLen = Buffer.byteLength(clean, "utf8");

  if (byteLen > TTS_MAX_INPUT_BYTES) {
    const parts = splitTextForTts(clean, TTS_SAFE_TARGET_BYTES);

    console.log("[TTS] chunking", {
      byteLen,
      partsCount: parts.length,
      maxPartBytes: Math.max(...parts.map((p) => Buffer.byteLength(p, "utf8"))),
      safeTarget: TTS_SAFE_TARGET_BYTES,
      hardLimit: TTS_MAX_INPUT_BYTES,
    });

    const buffers = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part || !part.trim()) continue;

      const requestPart = {
        input: { text: part },
        voice: {
          languageCode,
          name: voiceName || undefined,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: speakingRate || 1.0,
          pitch: pitch || 0.0,
        },
      };

      const chunkBuf = await gcpTtsRestSynthesize(apiKey, requestPart);
      if (!chunkBuf || !chunkBuf.length) {
        throw new Error("TTS: empty audioContent for chunk #" + (i + 1));
      }
      buffers.push(chunkBuf);
    }

    return Buffer.concat(buffers);
  }

  const request = {
    input: { text: clean },
    voice: {
      languageCode,
      name: voiceName || undefined,
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: speakingRate || 1.0,
      pitch: pitch || 0.0,
    },
  };

  return await gcpTtsRestSynthesize(apiKey, request);
}

async function ensureAudioAsset(params) {
  const {
    apiKey,
    text,
    assetType,
    ttsProfile,
    sentenceId,
    textId,
    languageCode,
    voiceName,
    speakingRate,
    pitch,
  } = params || {};

  const cleanText = String(text || "").trim();
  if (!cleanText) {
    return { audioContent: "", fromCache: false, assetKey: null, relativePath: null };
  }

  ensureAudioCacheDir();

  const normalizedProfile = normalizeTtsProfile(
    ttsProfile || {
      language: languageCode || null,
      voiceName: voiceName || null,
      speakingRate: speakingRate == null ? 1.0 : Number(speakingRate),
      pitch: pitch == null ? 0.0 : Number(pitch),
    }
  );

  const assetKey = computeAssetKey({
    text: cleanText,
    ttsProfile: normalizedProfile,
    assetType: String(assetType || "row"),
  });

  const relativePath = getAudioRelativePath(assetKey).replace(/\\/g, "/");
const absPath = path.resolve(DATA_DIR, relativePath);

  let fromCache = false;
  let mp3Buffer = null;

  if (fs.existsSync(absPath)) {
    fromCache = true;
    mp3Buffer = fs.readFileSync(absPath);
  } else {
    mp3Buffer = await synthesizeMp3Buffer(
      apiKey,
      cleanText,
      normalizedProfile.language || languageCode,
      normalizedProfile.voiceName || voiceName,
      normalizedProfile.speakingRate,
      normalizedProfile.pitch
    );

    const wr = writeMp3IfNotExists(absPath, mp3Buffer);

    // If concurrent writer created it, read the file for consistency.
    if (!wr.written && fs.existsSync(absPath)) {
      fromCache = true;
      mp3Buffer = fs.readFileSync(absPath);
    }
  }

    // Best-effort duration probe (server-side, no UI listeners).
  // If ffprobe is missing or fails, durationMs remains null (allowed).
  let durationMs = null;
  try {
    // Prefer probing the file we just ensured on disk.
    durationMs = await probeMp3DurationMs(absPath);
  } catch (_) {
    durationMs = null;
  }

  // Best-effort DB upsert + linking. Must never break TTS response.
  try {
    const h = getDbHealth();
    if (h && h.ok) {
      const row = await upsertAudioAsset({
        id: uuidv4(),
        assetKey,
        assetType: String(assetType || "row"),
        relativePath,
        mime: "audio/mpeg",
        durationMs: durationMs,
        sizeBytes: mp3Buffer ? mp3Buffer.length : null,
        ttsProfileJson: JSON.stringify(normalizedProfile),
      });

      if (row && row.id) {
  // PRO: keep a single default audio per sentence/text
  if (sentenceId) {
    await setSentenceDefaultAudio(String(sentenceId), String(row.id));
  }
  if (textId) {
    await setTextDefaultAudio(String(textId), String(row.id));
  }
}
    }
  } catch (e) {
    console.warn("[v3-audio] db upsert/link failed (non-fatal)", {
      assetKey,
      message: e && e.message,
    });
  }

  const wantAudioContent = !(params && params.returnAudioContent === false);
const audioContent = wantAudioContent && mp3Buffer ? mp3Buffer.toString("base64") : "";
return { audioContent, fromCache, assetKey, relativePath };
}

// BRR-P1-008c — like ensureAudioAsset, but ALSO writes a per-clip word-timing sidecar
// (audio-cache/<key>.timing.json) via GCP v1beta1 SSML <mark> timepoints, so the Reading Room can do
// word-level karaoke for ANY text (incl. corpus) when a BYOK key is set. assetKey is identical (plain
// text + profile) → mp3+timing self-cache for everyone afterwards (even keyless tier-1). The mp3 is
// (over)written from the SAME SSML synth so the served clip matches the timepoints. Long text (over
// the SSML byte cap) gracefully falls back to a plain mp3 with NO timing (honest sentence-level).
async function ensureAudioAssetWithTiming(params) {
  const { apiKey, text, assetType, ttsProfile, sentenceId, textId, languageCode, voiceName, speakingRate, pitch } = params || {};
  const cleanText = String(text || "").trim();
  if (!cleanText) return { audioContent: "", fromCache: false, assetKey: null, relativePath: null };
  ensureAudioCacheDir();

  const normalizedProfile = normalizeTtsProfile(ttsProfile || {
    language: languageCode || null, voiceName: voiceName || null,
    speakingRate: speakingRate == null ? 1.0 : Number(speakingRate), pitch: pitch == null ? 0.0 : Number(pitch),
  });
  const assetKey = computeAssetKey({ text: cleanText, ttsProfile: normalizedProfile, assetType: String(assetType || "row") });
  const relativePath = getAudioRelativePath(assetKey).replace(/\\/g, "/");
  const absPath = path.resolve(DATA_DIR, relativePath);
  const timingPath = path.resolve(DATA_DIR, "audio-cache/" + assetKey + ".timing.json");

  let fromCache = false, mp3Buffer = null;
  if (fs.existsSync(absPath) && fs.existsSync(timingPath)) {
    fromCache = true; mp3Buffer = fs.readFileSync(absPath);                 // both cached → no synth, no key needed
  } else if (ttsUtf8Len(cleanText) > TTS_SAFE_TARGET_BYTES) {
    // Too long for one SSML+marks call → graceful: plain mp3, no timing (sentence-level karaoke).
    console.warn("[v3-audio-timing] text over SSML byte cap — skipping timepoints", { assetKey, bytes: ttsUtf8Len(cleanText) });
    if (fs.existsSync(absPath)) { fromCache = true; mp3Buffer = fs.readFileSync(absPath); }
    else {
      mp3Buffer = await synthesizeMp3Buffer(apiKey, cleanText, normalizedProfile.language || languageCode, normalizedProfile.voiceName || voiceName, normalizedProfile.speakingRate, normalizedProfile.pitch);
      const wr = writeMp3IfNotExists(absPath, mp3Buffer);
      if (!wr.written && fs.existsSync(absPath)) mp3Buffer = fs.readFileSync(absPath);
    }
  } else {
    const out = await synthesizeWithTimepoints(apiKey, cleanText, normalizedProfile);   // throws TTS_KEY_REQUIRED if no key
    mp3Buffer = out.mp3;
    try { fs.writeFileSync(absPath, mp3Buffer); } catch (e) { console.warn("[v3-audio-timing] mp3 write failed", { assetKey, message: e && e.message }); }
    try { fs.writeFileSync(timingPath, JSON.stringify(out.timing || { v: 1, n: 0, got: 0, words: [] })); }
    catch (e) { console.warn("[v3-audio-timing] timing write failed (non-fatal)", { assetKey, message: e && e.message }); }
  }

  let durationMs = null;
  try { durationMs = await probeMp3DurationMs(absPath); } catch (_) { durationMs = null; }

  try {
    const h = getDbHealth();
    if (h && h.ok) {
      const row = await upsertAudioAsset({ id: uuidv4(), assetKey, assetType: String(assetType || "row"), relativePath, mime: "audio/mpeg", durationMs, sizeBytes: mp3Buffer ? mp3Buffer.length : null, ttsProfileJson: JSON.stringify(normalizedProfile) });
      if (row && row.id) {
        if (sentenceId) await setSentenceDefaultAudio(String(sentenceId), String(row.id));
        if (textId) await setTextDefaultAudio(String(textId), String(row.id));
      }
    }
  } catch (e) { console.warn("[v3-audio-timing] db upsert/link failed (non-fatal)", { assetKey, message: e && e.message }); }

  const wantAudioContent = !(params && params.returnAudioContent === false);
  const audioContent = wantAudioContent && mp3Buffer ? mp3Buffer.toString("base64") : "";
  return { audioContent, fromCache, assetKey, relativePath };
}

function isHebrewLocalExperimentalEnabled() {
  const raw = String(process.env.TTS_HEBREW_LOCAL_EXPERIMENTAL || "false").trim().toLowerCase();
  return !(raw === "false" || raw === "0" || raw === "off" || raw === "no");
}

function getHebrewLocalLicenseMode() {
  return String(process.env.TTS_HEBREW_LOCAL_LICENSE_MODE || "research_only").trim().toLowerCase() || "research_only";
}

function normalizeHebrewLocalText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeHebrewLocalVoice(voiceId) {
  const value = String(voiceId || "shaul").trim().toLowerCase();
  return value || "shaul";
}

function normalizeHebrewLocalSpeed(speed) {
  const value = Number(speed);
  if (!Number.isFinite(value)) return 1.0;
  return Math.max(0.5, Math.min(2.0, Math.round(value * 10) / 10));
}

function normalizeHebrewLocalPitch(pitch) {
  const value = Number(pitch);
  if (!Number.isFinite(value)) return 0.0;
  return Math.max(-5, Math.min(5, Math.round(value * 10) / 10));
}

function buildHebrewLocalCacheKey(payload) {
  return crypto.createHash("sha256").update(stableStringify(payload), "utf8").digest("hex");
}

function getHebrewLocalCachePaths(cacheKey) {
  return {
    audioPath: path.join(hebrewLocalCacheDir, `${cacheKey}.wav`),
    metaPath: path.join(hebrewLocalCacheDir, `${cacheKey}.json`)
  };
}

function readHebrewLocalCache(cacheKey) {
  const paths = getHebrewLocalCachePaths(cacheKey);
  if (!fs.existsSync(paths.audioPath) || !fs.existsSync(paths.metaPath)) return null;
  try {
    const metadata = JSON.parse(fs.readFileSync(paths.metaPath, "utf8"));
    const audioContent = fs.readFileSync(paths.audioPath).toString("base64");
    return { audioContent, metadata };
  } catch (error) {
    console.warn("[hebrew-local-tts] cache read failed", { cacheKey, message: error && error.message });
    return null;
  }
}

function writeHebrewLocalCache(cacheKey, buffer, metadata) {
  const paths = getHebrewLocalCachePaths(cacheKey);
  try {
    fs.writeFileSync(paths.audioPath, buffer);
    fs.writeFileSync(paths.metaPath, JSON.stringify(metadata, null, 2), "utf8");
  } catch (error) {
    console.warn("[hebrew-local-tts] cache write failed", { cacheKey, message: error && error.message });
  }
}

function mapHebrewLocalErrorToFallbackReason(upstream) {
  const bodyError = upstream && upstream.body && upstream.body.error ? String(upstream.body.error) : "";
  const details = String(upstream && upstream.error ? upstream.error : bodyError).toLowerCase();
  if (!upstream || upstream.status === 0 || details === "timeout") return "timeout";
  if (bodyError === "sidecar_disabled") return "sidecar_disabled";
  if (bodyError === "license_mode_blocked") return "license_mode_blocked";
  if (bodyError === "unsupported_voice") return "unsupported_voice";
  if (details.indexOf("model") >= 0) return "model_missing";
  return "synthesis_failed";
}

async function synthesizeViaOnlineFallback({
  text,
  fallbackVoiceId,
  speakingRate,
  pitch,
  selectedProvider,
  fallbackReason,
  fallbackChain
}) {
  const online = await synthesizeWithCache(
    text,
    "he-IL",
    fallbackVoiceId || undefined,
    speakingRate,
    pitch
  );
  return {
    audioContent: online.audioContent,
    mimeType: "audio/mpeg",
    fromCache: !!online.fromCache,
    selectedProvider,
    actualProvider: "online_tts",
    fallbackReason,
    fallbackChain,
    diagnostics: {
      provider: HEBREW_TTS_PROVIDER,
      runtime: "node_server",
      selectedProvider,
      actualProvider: "online_tts",
      fallbackReason,
      fallbackChain,
      cacheHit: !!online.fromCache,
      voice: fallbackVoiceId || "",
      qualityTier: "fallback",
      speedSupported: true,
      pitchSupported: true,
      speedApplied: speakingRate,
      pitchApplied: pitch,
      licenseMode: getHebrewLocalLicenseMode(),
      licenseStatus: HEBREW_TTS_LICENSE_MODES_ALLOWED.has(getHebrewLocalLicenseMode())
        ? (getHebrewLocalLicenseMode() === "noncommercial" ? "noncommercial_allowed" : "research_only")
        : "license_mode_blocked"
    }
  };
}

async function synthesizeHebrewLocalProvider({
  text,
  voiceId,
  speakingRate,
  pitch,
  fallbackVoiceId,
  selectedProvider
}) {
  const normalizedText = normalizeHebrewLocalText(text);
  const normalizedVoice = normalizeHebrewLocalVoice(voiceId);
  const normalizedSpeed = normalizeHebrewLocalSpeed(speakingRate);
  const normalizedPitch = normalizeHebrewLocalPitch(pitch);
  const fallbackChain = [HEBREW_TTS_PROVIDER, "online_tts", "system_fallback", "unavailable"];
  const licenseMode = getHebrewLocalLicenseMode();
  const licenseStatus = HEBREW_TTS_LICENSE_MODES_ALLOWED.has(licenseMode)
    ? (licenseMode === "noncommercial" ? "noncommercial_allowed" : "research_only")
    : "license_mode_blocked";

  if (!normalizedText) {
    const error = new Error("Нет текста для озвучки");
    error.status = 400;
    throw error;
  }

  if (!isHebrewLocalExperimentalEnabled()) {
    return synthesizeViaOnlineFallback({
      text: normalizedText,
      fallbackVoiceId,
      speakingRate: normalizedSpeed,
      pitch: normalizedPitch,
      selectedProvider,
      fallbackReason: "sidecar_disabled",
      fallbackChain
    });
  }

  if (HEBREW_TTS_LICENSE_MODES_BLOCKED.has(licenseMode)) {
    return synthesizeViaOnlineFallback({
      text: normalizedText,
      fallbackVoiceId,
      speakingRate: normalizedSpeed,
      pitch: normalizedPitch,
      selectedProvider,
      fallbackReason: "license_mode_blocked",
      fallbackChain
    });
  }

  const health = await hebrewTtsClient.healthz();
  if (!health.ok || !health.body) {
    return synthesizeViaOnlineFallback({
      text: normalizedText,
      fallbackVoiceId,
      speakingRate: normalizedSpeed,
      pitch: normalizedPitch,
      selectedProvider,
      fallbackReason: "sidecar_unavailable",
      fallbackChain
    });
  }

  if (String(health.body.status || "").toLowerCase() === "blocked") {
    return synthesizeViaOnlineFallback({
      text: normalizedText,
      fallbackVoiceId,
      speakingRate: normalizedSpeed,
      pitch: normalizedPitch,
      selectedProvider,
      fallbackReason: "license_mode_blocked",
      fallbackChain
    });
  }

  if (health.body.modelLoaded === false || health.body.phonikudReady === false || health.body.piperReady === false) {
    return synthesizeViaOnlineFallback({
      text: normalizedText,
      fallbackVoiceId,
      speakingRate: normalizedSpeed,
      pitch: normalizedPitch,
      selectedProvider,
      fallbackReason: "model_missing",
      fallbackChain
    });
  }

  const modelVersion = String(health.body.modelVersion || "unknown");
  const phonikudVersion = String(health.body.phonikudVersion || "unknown");
  const piperModelVersion = String(health.body.piperModelVersion || "unknown");
  const cacheKey = buildHebrewLocalCacheKey({
    provider: HEBREW_TTS_PROVIDER,
    voice: normalizedVoice,
    normalizedText,
    speed: normalizedSpeed,
    pitch: normalizedPitch,
    modelVersion,
    phonikudVersion,
    piperModelVersion
  });

  const cached = readHebrewLocalCache(cacheKey);
  if (cached && cached.audioContent) {
    const diagnostics = Object.assign({}, cached.metadata && cached.metadata.diagnostics ? cached.metadata.diagnostics : {}, {
      selectedProvider,
      actualProvider: HEBREW_TTS_PROVIDER,
      fallbackChain,
      fallbackReason: null,
      cacheHit: true
    });
    return {
      audioContent: cached.audioContent,
      mimeType: "audio/wav",
      fromCache: true,
      selectedProvider,
      actualProvider: HEBREW_TTS_PROVIDER,
      fallbackReason: null,
      fallbackChain,
      diagnostics
    };
  }

  const upstream = await hebrewTtsClient.synthesize({
    text: normalizedText,
    voice: normalizedVoice,
    speed: normalizedSpeed,
    pitch: normalizedPitch,
    format: "wav"
  });
  if (!upstream.ok || !upstream.buffer) {
    return synthesizeViaOnlineFallback({
      text: normalizedText,
      fallbackVoiceId,
      speakingRate: normalizedSpeed,
      pitch: normalizedPitch,
      selectedProvider,
      fallbackReason: mapHebrewLocalErrorToFallbackReason(upstream),
      fallbackChain
    });
  }

  const diagnostics = Object.assign({}, upstream.diagnostics || {}, {
    provider: HEBREW_TTS_PROVIDER,
    runtime: "python_sidecar",
    selectedProvider,
    actualProvider: HEBREW_TTS_PROVIDER,
    fallbackChain,
    fallbackReason: null,
    licenseMode,
    licenseStatus,
    qualityTier: upstream.diagnostics && upstream.diagnostics.qualityTier ? upstream.diagnostics.qualityTier : "acceptable",
    cacheHit: false
  });

  writeHebrewLocalCache(cacheKey, upstream.buffer, {
    diagnostics,
    modelVersion,
    phonikudVersion,
    piperModelVersion
  });

  return {
    audioContent: upstream.buffer.toString("base64"),
    mimeType: upstream.headers && upstream.headers.contentType ? upstream.headers.contentType : "audio/wav",
    fromCache: false,
    selectedProvider,
    actualProvider: HEBREW_TTS_PROVIDER,
    fallbackReason: null,
    fallbackChain,
    diagnostics
  };
}

// --------------------------------------------------------
// 7. API: TTS (Google Cloud TTS + серверный кэш)
// --------------------------------------------------------
app.post("/api/tts/hebrew-local", async (req, res) => {
  const startedAt = Date.now();
  const requestId = uuidv4();

  try {
    const {
      text,
      voiceId,
      speakingRate,
      pitch,
      fallbackVoiceId,
      selectedProvider
    } = req.body || {};

    const result = await synthesizeHebrewLocalProvider({
      text,
      voiceId,
      speakingRate,
      pitch,
      fallbackVoiceId,
      selectedProvider: selectedProvider || HEBREW_TTS_PROVIDER
    });

    return res.json({
      audioContent: result.audioContent,
      mimeType: result.mimeType,
      fromCache: !!result.fromCache,
      selectedProvider: result.selectedProvider,
      actualProvider: result.actualProvider,
      fallbackReason: result.fallbackReason || null,
      fallbackChain: result.fallbackChain,
      diagnostics: Object.assign({}, result.diagnostics || {}, {
        requestId,
        durationMs: Date.now() - startedAt
      })
    });
  } catch (error) {
    console.error("[/api/tts/hebrew-local] error", {
      requestId,
      message: error && error.message,
      status: error && error.status,
      stack: error && error.stack
    });
    return res.status(error && error.status ? error.status : 500).json({
      error: (error && error.message) || "hebrew_local_tts_failed"
    });
  }
});

app.post("/api/tts", async (req, res) => {
  const requestId = uuidv4();
  const startedAt = Date.now();

  try {
    const {
  text,
  language,
  languageCode,
  voiceId,
  speakingRate,
  pitch,
  gcpTtsApiKey,

  // v3 context (optional) — Step 8.2
  assetType,
  ttsProfile,
  sentenceId,
  textId,
} = req.body || {};

    const lang = language || languageCode;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Нет текста для озвучки" });
    }

    if (!lang || typeof lang !== "string") {
      return res.status(400).json({ error: "Не указан язык для озвучки" });
    }

    // BYOK validation. The cache layer can serve hits without a key (handled
    // inside synthesizeWithCache), but a Google synthesis call cannot proceed
    // without one. Validate format up front so the client gets a clean 401.
    let byokKey = "";
    if (gcpTtsApiKey != null) {
      if (typeof gcpTtsApiKey !== "string") {
        return res.status(400).json({
          error: "gcpTtsApiKey must be a string",
          error_code: "TTS_KEY_INVALID",
        });
      }
      const trimmed = gcpTtsApiKey.trim();
      if (trimmed) {
        if (!trimmed.startsWith("AIza") || trimmed.length < 20) {
          return res.status(400).json({
            error: "Неверный формат GCP TTS API Key. Ключ должен начинаться с 'AIza'.",
            error_code: "TTS_KEY_INVALID",
          });
        }
        byokKey = trimmed;
      }
    }

    const cleanText = text.trim();

    const voiceName = voiceId && String(voiceId).trim()
      ? String(voiceId).trim()
      : "";

    let languageCodeForRequest = lang;
    if (voiceName && voiceName.includes("-")) {
      const parts = voiceName.split("-");
      if (parts.length >= 2) {
        languageCodeForRequest = parts[0] + "-" + parts[1];
      }
    }

    let rate = 1.0;
    if (typeof speakingRate === "number") {
      rate = speakingRate;
    } else if (typeof speakingRate === "string" && speakingRate.trim() !== "") {
      const num = Number(speakingRate);
      if (!Number.isNaN(num) && num > 0) rate = num;
    }

    let pitchVal = 0.0;
    if (typeof pitch === "number") {
      pitchVal = pitch;
    } else if (typeof pitch === "string" && pitch.trim() !== "") {
      const num = Number(pitch);
      if (!Number.isNaN(num)) pitchVal = num;
    }

	// -------------------------------
// Step 8.2: normalize v3 context
// включаем v3-ветку ТОЛЬКО когда есть линковка (sentenceId/textId)
// -------------------------------
const v3SentenceId =
  (sentenceId === null || sentenceId === undefined || String(sentenceId).trim() === "")
    ? null
    : String(sentenceId).trim();

const v3TextId =
  (textId === null || textId === undefined || String(textId).trim() === "")
    ? null
    : String(textId).trim();

let v3TtsProfile = null;
if (ttsProfile && typeof ttsProfile === "object") {
  v3TtsProfile = ttsProfile;
} else if (typeof ttsProfile === "string" && ttsProfile.trim()) {
  try { v3TtsProfile = JSON.parse(ttsProfile); } catch (_) { v3TtsProfile = null; }
}

const v3AssetType =
  (assetType && String(assetType).trim()) ? String(assetType).trim() : null;

// v3 mode is enabled when linking is requested (sentence/text) OR for the
// link-free "word" asset type (R-1.5 Anki word-card audio): arbitrary headword
// text → cached MP3 + stable assetKey, with NO sentence/text linking (both stay
// null below, so ensureAudioAsset never touches a default-audio row). Keeps all
// other legacy calls unchanged.
const hasV3Context = !!(v3SentenceId || v3TextId || v3AssetType === "word");

    console.log("[/api/tts] request", {
      requestId,
      textLength: cleanText.length,
      langFromClient: lang,
      languageCodeForRequest,
      voiceName: voiceName || "auto",
      speakingRate: rate,
      pitch: pitchVal,
      hasV3Context,
      v3SentenceId,
      v3TextId,
      v3AssetType,
      byokProvided: !!byokKey,
    });

    // --------------------------------------------------------
// Step 8.2 routing:
// - legacy: synthesizeWithCache (старый hash cacheId)
// - v3: ensureAudioAsset (stable asset_key + mp3 file + DB upsert + linking)
// --------------------------------------------------------
let audioContent, fromCache, cacheId, assetKeyOut, relativePathOut;

if (hasV3Context) {
  // BRR-P1-008c — Reading Room sends withTimepoints to also produce+cache a word-timing sidecar
  // (v1beta1 SSML marks) for word-level karaoke on ANY text. Absent flag → unchanged behavior.
  const withTiming = !!(req.body && req.body.withTimepoints === true);
  const ensured = await (withTiming ? ensureAudioAssetWithTiming : ensureAudioAsset)({
    apiKey: byokKey,
    text: cleanText,
    assetType: v3AssetType || (v3SentenceId ? "row" : "text"),
    // если профиль не пришёл — соберём из текущих параметров запроса
    ttsProfile: v3TtsProfile || {
      language: languageCodeForRequest,
      voiceName: voiceName || null,
      speakingRate: rate,
      pitch: pitchVal,
    },
    sentenceId: v3SentenceId,
    textId: v3TextId,
    languageCode: languageCodeForRequest,
    voiceName: voiceName || undefined,
    speakingRate: rate,
    pitch: pitchVal,
  });

  audioContent = ensured.audioContent;
  fromCache = ensured.fromCache;
  assetKeyOut = ensured.assetKey;
  relativePathOut = ensured.relativePath;

  // оставим cacheId для обратной совместимости (теперь это stable assetKey)
  cacheId = ensured.assetKey || null;
} else {
  const legacy = await synthesizeWithCache(
    byokKey,
    cleanText,
    languageCodeForRequest,
    voiceName || undefined,
    rate,
    pitchVal
  );

  audioContent = legacy.audioContent;
  fromCache = legacy.fromCache;
  cacheId = legacy.cacheId;

  assetKeyOut = null;
  relativePathOut = null;
}

    // считаем символы ТОЛЬКО если это не кэш
    if (!fromCache) {
      updateUsage("tts", cleanText.length);
    }

    return res.json({
  audioContent,
  mimeType: "audio/mpeg",
  fromCache: !!fromCache,

  // legacy field: for backward compatibility
  cacheId: cacheId || null,

  // v3 fields (Step 8.2)
  assetKey: assetKeyOut || null,
  relativePath: relativePathOut || null,

  debug: {
    requestId,
    durationMs: Date.now() - startedAt,
    fromCache: !!fromCache,
    hasV3Context: !!hasV3Context,
    assetKey: assetKeyOut || null,
  },
});

  } catch (error) {
    // BYOK: a missing key surfaces as a structured 401 the client recognises
    // and reroutes to Browser SpeechSynthesis (no toast spam).
    if (error && error.code === "TTS_KEY_REQUIRED") {
      console.warn("[/api/tts] missing BYOK key", { requestId });
      return res.status(401).json({
        error: "GCP TTS API key required",
        error_code: "TTS_KEY_REQUIRED",
      });
    }

    console.error("[/api/tts] Ошибка TTS", {
      requestId,
      message: error && error.message,
      name: error && error.name,
      code: error && error.code,
      status: error && error.status,
    });

    const safeDetails = {
      requestId,
      message: (error && error.message) || "Неизвестная ошибка TTS",
      code: (error && error.code) || null,
      status: (error && error.status) || null,
    };

    return res.status(error && error.status ? error.status : 500).json({
      error: "Ошибка TTS",
      details: safeDetails,
    });
  }
});

// --------------------------------------------------------
// 8.3 API: Stream MP3 by assetKey (V3 audio assets)
// GET /api/audio/:assetKey/timing — BRR-P1-008b word-level karaoke. Serves the per-clip
// word-timing sidecar (audio-cache/<key>.timing.json) from the volume. Content-addressed →
// immutable cache; 404 when absent (client gracefully falls back to sentence-level karaoke).
app.get("/api/audio/:assetKey/timing", (req, res) => {
  const assetKey = String(req.params.assetKey || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(assetKey)) return res.status(400).json({ error: "BAD_ASSET_KEY" });
  const audioCacheRoot = path.resolve(audioCacheDir);
  const absPath = path.resolve(DATA_DIR, "audio-cache/" + assetKey + ".timing.json");
  if (!absPath.startsWith(audioCacheRoot + path.sep)) return res.status(400).json({ error: "BAD_ASSET_PATH" });
  let raw;
  try { raw = fs.readFileSync(absPath, "utf8"); } catch (_) { return res.status(404).json({ error: "NOT_FOUND" }); }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("ETag", '"' + assetKey + '-t"');
  return res.status(200).send(raw);
});

// GET /api/audio/:assetKey
// - Streams file from audio-cache/<assetKey>.mp3
// - Supports Range requests (seeking)
// - ETag = assetKey (content-addressed)
// --------------------------------------------------------
app.get("/api/audio/:assetKey", async (req, res) => {
  const assetKey = String(req.params.assetKey || "").trim();

  // Strict validation: sha256 hex (64)
  if (!/^[a-f0-9]{64}$/i.test(assetKey)) {
    return res.status(400).json({ error: "BAD_ASSET_KEY" });
  }

  // P (perf): the Library bulk export sends `X-Bulk: 1` to take a DB-free fast
  // path — skip the last_used telemetry touch AND the relative_path DB lookup,
  // serving straight from the deterministic content-addressed path. Read-only
  // and stateless. Header (not query) so the browser HTTP-cache key matches a
  // normal playback fetch and cache hits are reused (see LIBRARY_EXPORT_PERF_P R-1).
  const bulk = String(req.headers["x-bulk"] || "") === "1";

  // Best-effort DB touch (do not block streaming) — skipped for bulk export.
  if (!bulk) {
    try {
      const h = typeof getDbHealth === "function" ? getDbHealth() : null;
      if (h && h.ok && typeof touchAudioAsset === "function") {
        touchAudioAsset(assetKey).catch(() => {});
      }
    } catch (_) {}
  }

  // Resolve file relative path (prefer DB relative_path if present; fallback to
  // deterministic). Bulk skips the DB lookup and uses the deterministic path.
  let rel = (typeof getAudioRelativePath === "function")
    ? getAudioRelativePath(assetKey)
    : `audio-cache/${assetKey}.mp3`;

  if (!bulk) {
    try {
      const h = typeof getDbHealth === "function" ? getDbHealth() : null;
      if (h && h.ok && typeof getAudioAssetByKey === "function") {
        const row = await getAudioAssetByKey(assetKey);
        if (row && row.relative_path) rel = String(row.relative_path);
      }
    } catch (_) {}
  }

  // Only allow paths inside audio-cache
  const audioCacheRoot = path.resolve(audioCacheDir);

// нормализация на случай путей, попавших в БД с Windows-разделителями
rel = String(rel || "").replace(/\\/g, "/");

// ВАЖНО: резолвим от DATA_DIR (volume root), а не от __dirname
const absPath = path.resolve(DATA_DIR, rel);

if (!absPath.startsWith(audioCacheRoot + path.sep)) {
  return res.status(400).json({ error: "BAD_ASSET_PATH" });
}

  let stat;
  try {
    stat = fs.statSync(absPath);
    if (!stat.isFile()) throw new Error("NOT_FILE");
  } catch (_) {
    return res.status(404).json({ error: "NOT_FOUND" });
  }

  const size = stat.size;

  // Headers
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("ETag", `"${assetKey}"`);

  // 304 support
  const ifNoneMatchRaw = String(req.headers["if-none-match"] || "");
  const ifNoneMatch = ifNoneMatchRaw.replace(/"/g, "");
  if (ifNoneMatch && ifNoneMatch === assetKey) {
    return res.status(304).end();
  }

  // Range support
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m) {
      res.setHeader("Content-Range", `bytes */${size}`);
      return res.status(416).end();
    }

    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : size - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      res.setHeader("Content-Range", `bytes */${size}`);
      return res.status(416).end();
    }

    end = Math.min(end, size - 1);

    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", String(end - start + 1));

    const stream = fs.createReadStream(absPath, { start, end });
    stream.on("error", () => res.end());
    return stream.pipe(res);
  }

  // Full file
  res.setHeader("Content-Length", String(size));
  const stream = fs.createReadStream(absPath);
  stream.on("error", () => res.end());
  return stream.pipe(res);
});

// --------------------------------------------------------
// W12-AUDIO-PREFETCH-API-01: Batch audio prefetch jobs (PRO)
// - job model: start/status/cancel
// - profile-aware: regenerate if TTS params changed (new default)
// - onlyMissing: skip rows that already have default audio for this profile
// - concurrency + retry/backoff
// Notes:
// - In-memory jobs (server restart clears them) — acceptable for local tooling.
// - Endpoints are LOCAL-ONLY by default (set ALLOW_REMOTE_AUDIO_PREFETCH=1 to enable remotely).
// --------------------------------------------------------

const V3_AUDIO_PREFETCH_MAX_ROWS = 2000;
const V3_AUDIO_PREFETCH_DEFAULT_CONCURRENCY = 3;
const V3_AUDIO_PREFETCH_MAX_CONCURRENCY = 6;

const V3_AUDIO_PREFETCH_DEFAULT_RETRY_ATTEMPTS = 3;
const V3_AUDIO_PREFETCH_DEFAULT_RETRY_BASE_DELAY_MS = 500;
const V3_AUDIO_PREFETCH_DEFAULT_RETRY_MAX_DELAY_MS = 8000;

const V3_AUDIO_PREFETCH_JOB_TTL_MS = 30 * 60 * 1000; // keep finished jobs for 30 min
const v3AudioPrefetchJobs = new Map();

function v3ClampInt(v, min, max, defVal) {
  const n = Number(v);
  if (!Number.isFinite(n)) return defVal;
  const i = Math.floor(n);
  return Math.max(min, Math.min(max, i));
}

function v3Sleep(ms) {
  const t = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => setTimeout(resolve, t));
}

function v3BackoffDelayMs(attempt, baseDelayMs, maxDelayMs) {
  const base = Math.max(50, Number(baseDelayMs) || V3_AUDIO_PREFETCH_DEFAULT_RETRY_BASE_DELAY_MS);
  const max = Math.max(base, Number(maxDelayMs) || V3_AUDIO_PREFETCH_DEFAULT_RETRY_MAX_DELAY_MS);
  const exp = Math.min(max, base * Math.pow(2, Math.max(0, attempt - 1)));
  // jitter 0.75..1.25
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.min(max, Math.floor(exp * jitter));
}

function v3AudioPrefetchIsAllowed(req) {
  if (process.env.ALLOW_REMOTE_AUDIO_PREFETCH === "1") return true;
  // Browser running with ?localMode=1 sends X-Local-Mode: 1 — that user manages
  // their own data in OPFS and drives prefetch from a single browser session,
  // so allowing it here is comparable to clicking Play 100 times in a row.
  if (req && req.headers && String(req.headers["x-local-mode"] || "") === "1") return true;
  // reuse existing local-only check
  if (typeof ankiIsLocalHttpRequest === "function") return ankiIsLocalHttpRequest(req);
  return false;
}

function v3AudioPrefetchNormalizeIncomingTts(body) {
  const b = body && typeof body === "object" ? body : {};
  const tts = (b.tts && typeof b.tts === "object") ? b.tts : (b.ttsProfile && typeof b.ttsProfile === "object" ? b.ttsProfile : {});
  const language = (tts.language || b.language || b.languageCode || null);
  const voiceName = (tts.voiceName || tts.voiceId || b.voiceId || b.voiceName || null);
  const speakingRate = (tts.speakingRate != null ? tts.speakingRate : b.speakingRate);
  const pitch = (tts.pitch != null ? tts.pitch : b.pitch);

  const normalized = normalizeTtsProfile({
    language,
    voiceName,
    speakingRate,
    pitch,
  });

  // stable JSON for comparisons (matches computeAssetKey normalization)
  const profileJson = JSON.stringify(normalized);
  return { profile: normalized, profileJson };
}

function v3AudioPrefetchJobPublic(job) {
  if (!job) return null;

  const now = Date.now();
  const startedAt = job.startedAtMs || null;
  const elapsedMs = startedAt ? (now - startedAt) : 0;

  const total = job.total || 0;
  const done = job.done || 0;
  const skipped = job.skipped || 0;
  const failed = job.failed || 0;
  const inFlight = job.inFlight || 0;

  const finished = job.state === "done" || job.state === "cancelled" || job.state === "error";
  const finishedAtMs = job.finishedAtMs || null;

  const pct = total > 0 ? Math.round(((done + skipped + failed) / total) * 100) : 0;

  return {
    jobId: job.jobId,
    state: job.state,
    cancelRequested: !!job.cancelRequested,

    createdAtIso: job.createdAtIso || null,
    startedAtIso: job.startedAtIso || null,
    finishedAtIso: job.finishedAtIso || null,

    textId: job.textId || null,
    onlyMissing: !!job.onlyMissing,

    ttsProfile: job.ttsProfile || null,
    ttsProfileJson: job.ttsProfileJson || null,

    // Per-row asset_key map: sentenceId → assetKey. LOCAL_MODE clients use
    // this to update their OPFS audio_assets links + UI cache markers without
    // having to re-query the server (which doesn't have the OPFS-saved text).
    results: Array.isArray(job.results) ? job.results.slice() : [],

    concurrency: job.concurrency || null,
    retry: job.retry || null,

    totals: {
      total,
      done,
      skipped,
      failed,
      inFlight,

      generated: job.generated || 0,
      cached: job.cached || 0,
      unlinked: job.unlinked || 0,
      empty: job.empty || 0,
    },

    progress: {
      pct,
      elapsedMs,
      finished,
      finishedAtMs,
    },

    errorsSample: Array.isArray(job.errorsSample) ? job.errorsSample.slice(-10) : [],
    fatalError: job.fatalError || null,
  };
}

function v3AudioPrefetchCleanup() {
  const now = Date.now();
  for (const [jobId, job] of v3AudioPrefetchJobs.entries()) {
    if (!job) {
      v3AudioPrefetchJobs.delete(jobId);
      continue;
    }
    const finishedAt = job.finishedAtMs || 0;
    if (finishedAt && (now - finishedAt) > V3_AUDIO_PREFETCH_JOB_TTL_MS) {
      v3AudioPrefetchJobs.delete(jobId);
    }
  }
}

// cleanup timer (do not keep node alive on its own)
try {
  const t = setInterval(v3AudioPrefetchCleanup, 60 * 1000);
  if (t && typeof t.unref === "function") t.unref();
} catch (_) {}

async function v3AudioPrefetchRun(job) {
  job.state = "running";
  job.startedAtMs = Date.now();
  job.startedAtIso = new Date(job.startedAtMs).toISOString();

  const rows = Array.isArray(job.rows) ? job.rows : [];
  job.total = rows.length;

  // onlyMissing map: sentenceId -> {assetKey, ttsProfileJson, ...} for CURRENT DEFAULT
  let defaultMap = new Map();
  if (job.onlyMissing) {
    try {
      const sentenceIds = [];
      const seen = new Set();
      for (const r of rows) {
        const sid = r && r.sentenceId ? String(r.sentenceId) : "";
        if (!sid || seen.has(sid)) continue;
        seen.add(sid);
        sentenceIds.push(sid);
      }

      const h = typeof getDbHealth === "function" ? getDbHealth() : null;
      if (h && h.ok && typeof getDefaultSentenceAudioMap === "function" && sentenceIds.length) {
        defaultMap = await getDefaultSentenceAudioMap(sentenceIds);
      }
    } catch (e) {
      // Non-fatal: if map fails, we just won't skip.
      defaultMap = new Map();
    }
  }

  const concurrency = Math.max(1, job.concurrency || V3_AUDIO_PREFETCH_DEFAULT_CONCURRENCY);
  const attempts = Math.max(1, (job.retry && job.retry.attempts) || V3_AUDIO_PREFETCH_DEFAULT_RETRY_ATTEMPTS);
  const baseDelayMs = (job.retry && job.retry.baseDelayMs) || V3_AUDIO_PREFETCH_DEFAULT_RETRY_BASE_DELAY_MS;
  const maxDelayMs = (job.retry && job.retry.maxDelayMs) || V3_AUDIO_PREFETCH_DEFAULT_RETRY_MAX_DELAY_MS;
  const maxPasses = 3;

  const processBatch = async (batchRows, passNo) => {
    let nextIdx = 0;
    const failedRows = [];

    const worker = async () => {
      while (true) {
        if (job.cancelRequested) return;

        const i = nextIdx++;
        if (i >= batchRows.length) return;

        const r = batchRows[i] || {};
        const sentenceId = r.sentenceId ? String(r.sentenceId) : "";
        const rawText = String(r.text || r.ttsText || r.he_niqqud || r.he || "").trim();

        if (!rawText) {
          job.empty = (job.empty || 0) + 1;
          continue;
        }

        if (job.onlyMissing && sentenceId) {
          const def = defaultMap.get(sentenceId);
          if (def && def.ttsProfileJson && def.assetKey && def.ttsProfileJson === job.ttsProfileJson) {
            const ak = String(def.assetKey || "").trim();
            if (/^[a-f0-9]{64}$/i.test(ak)) {
              const relMp3 = getAudioRelativePath(ak).replace(/\\/g, "/");
              const abs = path.resolve(DATA_DIR, relMp3);
              if (fs.existsSync(abs)) {
                job.skipped = (job.skipped || 0) + 1;
                continue;
              }
            }
          }
        }

        job.inFlight = (job.inFlight || 0) + 1;

        let ok = false;
        let lastErr = null;

        for (let attempt = 1; attempt <= attempts; attempt++) {
          if (job.cancelRequested) break;

          try {
            const ensured = await ensureAudioAsset({
              apiKey: job.apiKey || undefined,
              text: rawText,
              assetType: "row",
              ttsProfile: job.ttsProfile,
              sentenceId: sentenceId || null,
              textId: job.textId || null,
              languageCode: job.ttsProfile && job.ttsProfile.language,
              voiceName: job.ttsProfile && job.ttsProfile.voiceName,
              speakingRate: job.ttsProfile && job.ttsProfile.speakingRate,
              pitch: job.ttsProfile && job.ttsProfile.pitch,
              returnAudioContent: false,
            });

            if (ensured && ensured.assetKey) {
              if (ensured.fromCache) {
                job.cached = (job.cached || 0) + 1;
              } else {
                job.generated = (job.generated || 0) + 1;
                try { updateUsage("tts", rawText.length); } catch (_) {}
              }

              if (!sentenceId) {
                job.unlinked = (job.unlinked || 0) + 1;
              } else if (job.onlyMissing) {
                defaultMap.set(sentenceId, { assetKey: ensured.assetKey, ttsProfileJson: job.ttsProfileJson });
              }

              // Track per-row outcome for client-side marker updates / OPFS links.
              if (sentenceId) {
                if (!Array.isArray(job.results)) job.results = [];
                job.results.push({
                  sentenceId,
                  assetKey: ensured.assetKey,
                  fromCache: !!ensured.fromCache,
                });
              }
            }

            job.done = (job.done || 0) + 1;
            ok = true;
            break;
          } catch (e) {
            lastErr = e;
            if (attempt < attempts && !job.cancelRequested) {
              const delay = v3BackoffDelayMs(attempt, baseDelayMs, maxDelayMs);
              await v3Sleep(delay);
            }
          }
        }

        if (!ok) {
          failedRows.push({
            ...r,
            _lastErrorMessage: lastErr && lastErr.message ? String(lastErr.message) : String(lastErr || "UNKNOWN_ERROR"),
            _passNo: passNo,
          });
        }

        job.inFlight = Math.max(0, (job.inFlight || 1) - 1);
      }
    };

    const workers = [];
    for (let w = 0; w < concurrency; w++) workers.push(worker());
    await Promise.all(workers);
    return failedRows;
  };

  try {
    let pendingRows = rows.slice();
    for (let passNo = 1; passNo <= maxPasses && pendingRows.length && !job.cancelRequested; passNo++) {
      pendingRows = await processBatch(pendingRows, passNo);
    }

    if (pendingRows.length) {
      job.failed = pendingRows.length;
      if (!Array.isArray(job.errorsSample)) job.errorsSample = [];
      for (const r of pendingRows.slice(0, 10)) {
        job.errorsSample.push({
          idx: r.idx,
          sentenceId: r.sentenceId ? String(r.sentenceId) : null,
          message: r._lastErrorMessage || "UNKNOWN_ERROR",
          passNo: r._passNo || null,
        });
      }
    } else {
      job.failed = 0;
    }

    job.finishedAtMs = Date.now();
    job.finishedAtIso = new Date(job.finishedAtMs).toISOString();

    if (job.cancelRequested) {
      job.state = "cancelled";
    } else if (job.failed > 0) {
      job.state = "failed";
    } else {
      job.state = "done";
    }
  } catch (e) {
    job.finishedAtMs = Date.now();
    job.finishedAtIso = new Date(job.finishedAtMs).toISOString();
    job.state = "error";
    job.fatalError = (e && e.message) ? String(e.message) : String(e);
  }
}

// POST /api/audio/prefetch/start
app.post("/api/audio/prefetch/start", rlAudioPrefetch, async (req, res) => {
  try {
    if (!v3AudioPrefetchIsAllowed(req)) {
      return res.status(403).json({ ok: false, error: "LOCAL_ONLY" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { profile, profileJson } = v3AudioPrefetchNormalizeIncomingTts(body);

    const textId = body.textId != null ? String(body.textId) : null;
    const onlyMissing = (body.onlyMissing == null) ? true : !!body.onlyMissing;

    const concurrency = v3ClampInt(
      body.concurrency,
      1,
      V3_AUDIO_PREFETCH_MAX_CONCURRENCY,
      V3_AUDIO_PREFETCH_DEFAULT_CONCURRENCY
    );

    const retry = body.retry && typeof body.retry === "object" ? body.retry : {};
    const retryCfg = {
      attempts: v3ClampInt(retry.attempts, 1, 10, V3_AUDIO_PREFETCH_DEFAULT_RETRY_ATTEMPTS),
      baseDelayMs: v3ClampInt(retry.baseDelayMs, 50, 60000, V3_AUDIO_PREFETCH_DEFAULT_RETRY_BASE_DELAY_MS),
      maxDelayMs: v3ClampInt(retry.maxDelayMs, 200, 120000, V3_AUDIO_PREFETCH_DEFAULT_RETRY_MAX_DELAY_MS),
    };

    const rowsRaw = Array.isArray(body.rows) ? body.rows : [];
    if (!rowsRaw.length) {
      return res.status(400).json({ ok: false, error: "NO_ROWS" });
    }

    if (rowsRaw.length > V3_AUDIO_PREFETCH_MAX_ROWS) {
      return res.status(400).json({ ok: false, error: "TOO_MANY_ROWS", limit: V3_AUDIO_PREFETCH_MAX_ROWS });
    }

    const rows = rowsRaw.map((r, idx) => {
      const rr = r && typeof r === "object" ? r : {};
      return {
        idx: idx,
        sentenceId: rr.sentenceId != null ? String(rr.sentenceId) : null,
        text: (rr.text != null ? String(rr.text) : null),
        // optional fallbacks (handy if caller passes row objects)
        ttsText: (rr.ttsText != null ? String(rr.ttsText) : null),
        he_niqqud: (rr.he_niqqud != null ? String(rr.he_niqqud) : null),
        he: (rr.he != null ? String(rr.he) : null),
      };
    });

    const jobId = uuidv4();
    const createdAtMs = Date.now();

    const job = {
      jobId,
      state: "queued",
      cancelRequested: false,

      createdAtMs,
      createdAtIso: new Date(createdAtMs).toISOString(),

      startedAtMs: null,
      startedAtIso: null,
      finishedAtMs: null,
      finishedAtIso: null,

      textId,
      onlyMissing,

      ttsProfile: profile,
      ttsProfileJson: profileJson,

      concurrency,
      retry: retryCfg,

      // BYOK: the user's GCP key, used by the job's synthesis (cache-misses).
      // Held in-memory on the job only; never logged or persisted.
      apiKey: (body.gcpTtsApiKey != null ? String(body.gcpTtsApiKey) : ""),

      rows,

      total: rows.length,
      done: 0,
      skipped: 0,
      failed: 0,
      inFlight: 0,
      generated: 0,
      cached: 0,
      unlinked: 0,
      empty: 0,

      errorsSample: [],
      fatalError: null,

      // Per-row outcomes for clients (LOCAL_MODE relies on this to update
      // OPFS links + marker UI without a follow-up library round-trip).
      results: [],
    };

    v3AudioPrefetchJobs.set(jobId, job);

    // Run async (do not await)
    v3AudioPrefetchRun(job).catch((e) => {
      job.state = "error";
      job.finishedAtMs = Date.now();
      job.finishedAtIso = new Date(job.finishedAtMs).toISOString();
      job.fatalError = (e && e.message) ? String(e.message) : String(e);
    });

    return res.json({ ok: true, jobId });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "PREFETCH_START_FAILED", details: { message: e && e.message ? e.message : String(e) } });
  }
});

// GET /api/audio/prefetch/status?jobId=...
app.get("/api/audio/prefetch/status", async (req, res) => {
  try {
    if (!v3AudioPrefetchIsAllowed(req)) {
      return res.status(403).json({ ok: false, error: "LOCAL_ONLY" });
    }

    const jobId = String((req.query && req.query.jobId) || "").trim();
    if (!jobId) return res.status(400).json({ ok: false, error: "NO_JOB_ID" });

    const job = v3AudioPrefetchJobs.get(jobId);
    if (!job) return res.status(404).json({ ok: false, error: "JOB_NOT_FOUND" });

    return res.json({ ok: true, job: v3AudioPrefetchJobPublic(job) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "PREFETCH_STATUS_FAILED", details: { message: e && e.message ? e.message : String(e) } });
  }
});

// POST /api/audio/prefetch/cancel
app.post("/api/audio/prefetch/cancel", async (req, res) => {
  try {
    if (!v3AudioPrefetchIsAllowed(req)) {
      return res.status(403).json({ ok: false, error: "LOCAL_ONLY" });
    }

    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const jobId = String(body.jobId || (req.query && req.query.jobId) || "").trim();
    if (!jobId) return res.status(400).json({ ok: false, error: "NO_JOB_ID" });

    const job = v3AudioPrefetchJobs.get(jobId);
    if (!job) return res.status(404).json({ ok: false, error: "JOB_NOT_FOUND" });

    job.cancelRequested = true;
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "PREFETCH_CANCEL_FAILED", details: { message: e && e.message ? e.message : String(e) } });
  }
});

// POST /api/audio/cache/upload — repopulate the shared server audio-cache with an
// MP3 (owner canon push, or a user's ZIP-bundle Phase-5 cross-device flow).
// AUTH (BRR-P0-010): owner-token gated via requireAudioUploadAuth — X-Local-Mode no
// longer authorizes this write; anonymous remote → 403 (or 503 if token unset).
// Body: { assetKey: "<sha256>", mp3Base64: "<base64>" }
// The asset_key MUST be a 64-char lowercase hex SHA-256, identical to what
// the server itself produces in computeAssetKey — that's the contract that
// keeps cross-device URL stability. We DO NOT verify the MP3's actual hash
// POST /api/transliterate — stateless wrapper around transliterateWithProfile.
// Body: { items: [{ id, he_niqqud }], profile: 'sbl'|'ru-phonetic'|'learner-latin'|'both' }
// Returns: { items: [{ id, translit?, translit_ru? }] } where the keys present
// match the requested profile ('both' returns both).
//
// No DB, no auth. The function is purely deterministic CPU work — translit
// schema is part of the deployed code, no quota involved. LOCAL_MODE clients
// use this to lazy-fill missing transliterations after import or for older
// rows that pre-date the profile-aware pipeline.
app.post("/api/transliterate", requireSameOriginJson, rlTransliterate, async (req, res) => {
  try {
    const { transliterateWithProfile } = require("./db/premium/translit");
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const profile = String(body.profile || "both").trim().toLowerCase();
    if (!["sbl", "ru-phonetic", "learner-latin", "both"].includes(profile)) {
      return res.status(400).json({ ok: false, error: "BAD_PROFILE", got: profile });
    }
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length > 5000) {
      return res.status(413).json({ ok: false, error: "TOO_MANY_ITEMS", limit: 5000 });
    }
    const out = items.map((it) => {
      const id = it && it.id != null ? String(it.id) : null;
      const he = it && (it.he_niqqud || it.heNiqqud) ? String(it.he_niqqud || it.heNiqqud) : "";
      const r = { id };
      if (!he) {
        // No niqqud → empty results (deterministic, idempotent).
        if (profile === "sbl" || profile === "learner-latin" || profile === "both") r.translit = "";
        if (profile === "ru-phonetic" || profile === "both") r.translit_ru = "";
        return r;
      }
      if (profile === "sbl" || profile === "learner-latin" || profile === "both") {
        r.translit = transliterateWithProfile(he, profile === "learner-latin" ? "learner-latin" : "sbl") || "";
      }
      if (profile === "ru-phonetic" || profile === "both") r.translit_ru = transliterateWithProfile(he, "ru-phonetic") || "";
      return r;
    });
    return res.json({ ok: true, items: out, profile, count: out.length });
  } catch (e) {
    console.error("POST /api/transliterate error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR", details: e && e.message ? e.message : String(e) });
  }
});

// against the asset_key (cross-device users may have a different audio
// engine version), but we do validate the key shape.
app.post("/api/audio/cache/upload", rlAudioUpload, async (req, res) => {
  try {
    if (!requireAudioUploadAuth(req, res)) return; // BRR-P0-010 (writes the 4xx/5xx)
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const assetKey = String(body.assetKey || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(assetKey)) {
      return res.status(400).json({ ok: false, error: "BAD_ASSET_KEY" });
    }
    // BRR-P1-008b — accept mp3 and/or a word-timing sidecar; at least one required.
    const mp3B64 = String(body.mp3Base64 || "");
    const timingJson = (body.timingJson && typeof body.timingJson === "object" && !Array.isArray(body.timingJson)) ? body.timingJson : null;
    const overwrite = body.overwrite === true || body.overwrite === "1";
    if (!mp3B64 && !timingJson) return res.status(400).json({ ok: false, error: "NO_PAYLOAD" });

    const relPath = getAudioRelativePath(assetKey).replace(/\\/g, "/");
    const absPath = path.resolve(DATA_DIR, relPath);
    const dir = path.dirname(absPath);
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (_) {}

    let mp3Written = null;
    if (mp3B64) {
      let buf;
      try { buf = Buffer.from(mp3B64, "base64"); } catch (_) { return res.status(400).json({ ok: false, error: "BAD_BASE64" }); }
      if (!buf || !buf.length) return res.status(400).json({ ok: false, error: "EMPTY_MP3" });
      if (buf.length > 20 * 1024 * 1024) return res.status(413).json({ ok: false, error: "MP3_TOO_LARGE" });
      if (overwrite) {
        // re-bake (BRR-P1-008b): the served clip MUST match the pushed timepoints → overwrite.
        try { fs.writeFileSync(absPath, buf); mp3Written = true; }
        catch (e) { return res.status(500).json({ ok: false, assetKey, error: "WRITE_FAILED", details: e && e.message }); }
      } else {
        const wr = writeMp3IfNotExists(absPath, buf);
        if (wr.error) return res.status(500).json({ ok: false, assetKey, error: "WRITE_FAILED", details: wr.error });
        mp3Written = !!wr.written;
      }
    }

    let timingWritten = false;
    if (timingJson) {
      if (!Array.isArray(timingJson.words)) return res.status(400).json({ ok: false, error: "BAD_TIMING" });
      const tStr = JSON.stringify(timingJson);
      if (tStr.length > 2 * 1024 * 1024) return res.status(413).json({ ok: false, error: "TIMING_TOO_LARGE" });
      try { fs.writeFileSync(path.resolve(DATA_DIR, "audio-cache/" + assetKey + ".timing.json"), tStr); timingWritten = true; }
      catch (e) { return res.status(500).json({ ok: false, assetKey, error: "TIMING_WRITE_FAILED", details: e && e.message }); }
    }

    return res.json({ ok: true, assetKey, written: mp3Written, alreadyExisted: mp3Written === false, timingWritten });
  } catch (e) {
    console.error("POST /api/audio/cache/upload error:", e);
    return res.status(500).json({ ok: false, error: "UPLOAD_FAILED", details: e && e.message ? e.message : String(e) });
  }
});

// POST /api/benyehuda/works/upload — BRR-P1-014 A4. Owner-token push of ONE per-work
// corpus bundle JSON onto the persistent volume → DATA_DIR/benyehuda/works/<id>.json,
// served back KEYLESS at /data/benyehuda/works/<id>.json (static mount above). Keeps the
// ~26K corpus tail OFF git (only the thin catalog index ships in the repo).
// AUTH: reuses the BRR-P0-010 owner-token gate (AUDIO_UPLOAD_TOKEN + X-Audio-Upload-Token)
// — owner decision 2026-06-10: a single shared owner-upload secret, one thing to rotate.
// Re-publishable: ATOMIC overwrite (temp+rename), unlike content-addressed audio (a work's
// body changes on re-bake; the client cache-busts via ?v=<catalogVersion>). Body: { id, json }.
const WORKS_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
app.post("/api/benyehuda/works/upload", rlWorksUpload, async (req, res) => {
  try {
    if (!requireAudioUploadAuth(req, res)) return; // BRR-P0-010 shared owner-token gate (writes the 4xx/5xx)
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const id = String(body.id || "").trim();
    if (!WORKS_ID_RE.test(id)) return res.status(400).json({ ok: false, error: "BAD_WORK_ID" });
    const work = body.json;
    if (!work || typeof work !== "object" || !work.library || !Array.isArray(work.library.texts)) {
      return res.status(400).json({ ok: false, error: "BAD_WORK_PAYLOAD", message: "expected { id, json: { library: { texts: [...] } } }" });
    }
    const worksDir = path.join(DATA_DIR, "benyehuda", "works");
    const absPath = path.resolve(worksDir, id + ".json");
    // Path-traversal guard: the resolved file MUST sit directly inside worksDir (defence in
    // depth — WORKS_ID_RE already forbids '/', '\\' and '.'; this also rejects symlink games).
    if (path.dirname(absPath) !== path.resolve(worksDir)) {
      return res.status(400).json({ ok: false, error: "BAD_WORK_ID" });
    }
    const serialized = JSON.stringify(work);
    if (Buffer.byteLength(serialized) > 10 * 1024 * 1024) {
      // bodyParser already caps the request body at 10mb; a work beyond this would be
      // chaptered per-part upstream (BRR-P0-006 giant-pass). Honest refusal, not a silent trim.
      return res.status(413).json({ ok: false, error: "WORK_TOO_LARGE" });
    }
    try { if (!fs.existsSync(worksDir)) fs.mkdirSync(worksDir, { recursive: true }); } catch (_) {}
    const tmp = absPath + ".tmp-" + crypto.randomBytes(6).toString("hex");
    try {
      fs.writeFileSync(tmp, serialized, "utf8");
      fs.renameSync(tmp, absPath); // atomic replace (re-publishable)
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
      return res.status(500).json({ ok: false, id, error: "WRITE_FAILED", details: e && e.message ? e.message : String(e) });
    }
    return res.json({ ok: true, id, bytes: Buffer.byteLength(serialized) });
  } catch (e) {
    console.error("POST /api/benyehuda/works/upload error:", e);
    return res.status(500).json({ ok: false, error: "WORKS_UPLOAD_FAILED", details: e && e.message ? e.message : String(e) });
  }
});

// POST /api/benyehuda/proclitic/upload — BRR Phase-3. Owner-token push of ONE per-work proclitic
// overlay ({ _meta, overlay:{skeleton→{pre,pn,v,conf}} }) onto the volume → DATA_DIR/benyehuda/
// proclitic/<id>.json, served KEYLESS at /data/benyehuda/proclitic/<id>.json (static mount above).
// Same shared-owner-token gate + atomic overwrite + path-traversal guard as the works upload.
app.post("/api/benyehuda/proclitic/upload", rlWorksUpload, async (req, res) => {
  try {
    if (!requireAudioUploadAuth(req, res)) return;
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const id = String(body.id || "").trim();
    if (!WORKS_ID_RE.test(id)) return res.status(400).json({ ok: false, error: "BAD_WORK_ID" });
    const ovl = body.json;
    if (!ovl || typeof ovl !== "object" || !ovl.overlay || typeof ovl.overlay !== "object") {
      return res.status(400).json({ ok: false, error: "BAD_OVERLAY_PAYLOAD", message: "expected { id, json: { overlay: {...} } }" });
    }
    const dir = path.join(DATA_DIR, "benyehuda", "proclitic");
    const absPath = path.resolve(dir, id + ".json");
    if (path.dirname(absPath) !== path.resolve(dir)) return res.status(400).json({ ok: false, error: "BAD_WORK_ID" });
    const serialized = JSON.stringify(ovl);
    if (Buffer.byteLength(serialized) > 10 * 1024 * 1024) return res.status(413).json({ ok: false, error: "OVERLAY_TOO_LARGE" });
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    const tmp = absPath + ".tmp-" + crypto.randomBytes(6).toString("hex");
    try {
      fs.writeFileSync(tmp, serialized, "utf8");
      fs.renameSync(tmp, absPath); // atomic replace (re-publishable)
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
      return res.status(500).json({ ok: false, id, error: "WRITE_FAILED", details: e && e.message ? e.message : String(e) });
    }
    return res.json({ ok: true, id, bytes: Buffer.byteLength(serialized) });
  } catch (e) {
    console.error("POST /api/benyehuda/proclitic/upload error:", e);
    return res.status(500).json({ ok: false, error: "OVERLAY_UPLOAD_FAILED", details: e && e.message ? e.message : String(e) });
  }
});

// POST /api/benyehuda/context/upload — strategic #1 (context-disambiguation overlay). Owner-token
// push of ONE per-work context sidecar ({ _meta, sents:[hash], ctx:{hash→{skel→{nq,pos,c,st}}} })
// onto the volume → DATA_DIR/benyehuda/context/<id>.json, served KEYLESS at
// /data/benyehuda/context/<id>.json (static mount above). Same gate/atomicity as proclitic.
app.post("/api/benyehuda/context/upload", rlWorksUpload, async (req, res) => {
  try {
    if (!requireAudioUploadAuth(req, res)) return;
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const id = String(body.id || "").trim();
    if (!WORKS_ID_RE.test(id)) return res.status(400).json({ ok: false, error: "BAD_WORK_ID" });
    const ovl = body.json;
    if (!ovl || typeof ovl !== "object" || !Array.isArray(ovl.sents) || !ovl.ctx || typeof ovl.ctx !== "object") {
      return res.status(400).json({ ok: false, error: "BAD_CONTEXT_PAYLOAD", message: "expected { id, json: { sents:[…], ctx:{…} } }" });
    }
    const dir = path.join(DATA_DIR, "benyehuda", "context");
    const absPath = path.resolve(dir, id + ".json");
    if (path.dirname(absPath) !== path.resolve(dir)) return res.status(400).json({ ok: false, error: "BAD_WORK_ID" });
    const serialized = JSON.stringify(ovl);
    if (Buffer.byteLength(serialized) > 10 * 1024 * 1024) return res.status(413).json({ ok: false, error: "OVERLAY_TOO_LARGE" });
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    const tmp = absPath + ".tmp-" + crypto.randomBytes(6).toString("hex");
    try {
      fs.writeFileSync(tmp, serialized, "utf8");
      fs.renameSync(tmp, absPath); // atomic replace (re-publishable)
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
      return res.status(500).json({ ok: false, id, error: "WRITE_FAILED", details: e && e.message ? e.message : String(e) });
    }
    return res.json({ ok: true, id, bytes: Buffer.byteLength(serialized) });
  } catch (e) {
    console.error("POST /api/benyehuda/context/upload error:", e);
    return res.status(500).json({ ok: false, error: "OVERLAY_UPLOAD_FAILED", details: e && e.message ? e.message : String(e) });
  }
});

// POST /api/benyehuda/fts/upload — BRR-P2-001. Owner-token push of ONE full-text index shard
// (corpus-fts manifest / ex-<letter> / lemma / lemmamap) onto the volume → DATA_DIR/benyehuda/fts/,
// served KEYLESS at /data/benyehuda/fts/<file> (static mount above). Same shared-owner-token gate
// + atomic overwrite + path-traversal guard as the works upload. Body: { file, json }.
const FTS_FILE_RE = /^(corpus-fts-v\d+\.json|(ex-[א-ת]+(-\d+)?|lemma(-\d+)?|lemmamap)-v\d+\.json)$/;
app.post("/api/benyehuda/fts/upload", rlWorksUpload, async (req, res) => {
  try {
    if (!requireAudioUploadAuth(req, res)) return;
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const file = String(body.file || "").trim();
    if (!FTS_FILE_RE.test(file)) return res.status(400).json({ ok: false, error: "BAD_FTS_FILE" });
    const payload = body.json;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ ok: false, error: "BAD_FTS_PAYLOAD", message: "expected { file, json }" });
    }
    const ftsDir = path.join(DATA_DIR, "benyehuda", "fts");
    const absPath = path.resolve(ftsDir, file);
    if (path.dirname(absPath) !== path.resolve(ftsDir)) {
      return res.status(400).json({ ok: false, error: "BAD_FTS_FILE" });
    }
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized) > 10 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: "FTS_SHARD_TOO_LARGE" });
    }
    try { if (!fs.existsSync(ftsDir)) fs.mkdirSync(ftsDir, { recursive: true }); } catch (_) {}
    const tmp = absPath + ".tmp-" + crypto.randomBytes(6).toString("hex");
    try {
      fs.writeFileSync(tmp, serialized, "utf8");
      fs.renameSync(tmp, absPath); // atomic replace (re-publishable)
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
      return res.status(500).json({ ok: false, file, error: "WRITE_FAILED", details: e && e.message ? e.message : String(e) });
    }
    return res.json({ ok: true, file, bytes: Buffer.byteLength(serialized) });
  } catch (e) {
    console.error("POST /api/benyehuda/fts/upload error:", e);
    return res.status(500).json({ ok: false, error: "FTS_UPLOAD_FAILED", details: e && e.message ? e.message : String(e) });
  }
});

// --------------------------------------------------------
// 8. API: СОХРАНЕНИЕ АУДИО НА ДИСК
// --------------------------------------------------------
app.post("/api/save-audio", async (req, res) => {
  try {
    const { text, audioContent } = req.body || {};
    if (!text || !audioContent) {
      return res.status(400).json({ error: "Нет данных для сохранения" });
    }

    const id = uuidv4();
    const audioPath = path.join(audioDir, `${id}.mp3`);
    const textPath = path.join(audioDir, `${id}.txt`);

    fs.writeFileSync(audioPath, Buffer.from(audioContent, "base64"));
    fs.writeFileSync(textPath, text, "utf8");

    res.json({
      id,
      audioUrl: `/audio/${id}.mp3`,
      textUrl: `/audio/${id}.txt`,
    });
  } catch (error) {
    console.error("Save Error:", error);
    res.status(500).json({ error: "Ошибка сохранения" });
  }
});

// --------------------------------------------------------
// 10. API: TRANSLATE (Gemini -> таблица)
// --------------------------------------------------------
// buildRowsFromGeminiPayload lives in ingest/tableRows.js (extracted W2-S4
// Task 6 fix round 1, for standalone regression-test coverage — see
// tests/tableRows.test.js).

function canonicalizeGeminiTableRowsLocally(rows, translitProfile) {
  const { rows: normalizedRows, corrections } = canonicalizeKnownNiqqudRows(rows);
  const { transliterateWithProfile } = require("./db/premium/translit");
  const { translitProfileVersion } = require("./db/premium/versions");
  const resolvedTranslitProfile = translitProfileVersion(translitProfile);

  normalizedRows.forEach((row) => {
    row.translit = transliterateWithProfile(row.he_niqqud, translitProfile) || "";
    if (!row.translation_meta_json) return;
    try {
      const meta = JSON.parse(row.translation_meta_json);
      row.translation_meta_json = JSON.stringify({
        ...meta,
        translitProfile: resolvedTranslitProfile,
        localNiqqudNormalization: corrections.length > 0,
      });
    } catch (_) {
      // Preserve opaque legacy metadata. The response-level correction ledger
      // below still reports the local normalization honestly.
    }
  });

  return { rows: normalizedRows, corrections, resolvedTranslitProfile };
}

// direction="he-ru" (default): Hebrew source -> Russian table.
const HE_RU_PROMPT = (cleanText) => `
You are a strict JSON generator.

Task:
1) Split the input Hebrew text into logical sentences / segments in the original order.
2) Translate each segment into Russian.
3) Produce JSON with:
   - "segments": list of original segments.
   - "rows": table rows for the UI, one row per segment.

Input text (Hebrew, may contain newlines):

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

Rules:
- Preserve the original order of sentences.
- Do NOT merge semantically different sentences into a single row.
- If the input contains line breaks, you MAY use them as additional hints for segmentation.
- Copy every "he" segment from the input without changing, correcting or paraphrasing its base characters.
- In every row, "he_niqqud" MUST preserve the same lexical Hebrew and consonants as "he". Standard full-to-defective spelling changes involving matres א/ה/ו/י are allowed only where required by vocalized Hebrew. Never change morphology, expand abbreviations, or change digits/punctuation.
- Always return ALL data inside a single JSON object exactly in the format above.
`;

// direction="any-he": source text in ANY language (most commonly Russian) -> Hebrew table.
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
- "he_niqqud": the same Hebrew translation, fully vocalized with niqqud. Preserve the same lexical Hebrew and consonants. Standard full-to-defective spelling changes involving matres א/ה/ו/י are allowed only where required by vocalized Hebrew; never change morphology, expand abbreviations, or change digits/punctuation.
- "translit": transliteration of the Hebrew translation (Latin letters).
- "ru": the ORIGINAL segment if it is Russian; otherwise a Russian translation of it.
- In "segments", the "he" field holds the ORIGINAL segment text (kept for schema compatibility).

Rules:
- Preserve the original order of segments.
- Do NOT merge semantically different sentences into a single row.
- Always return ALL data inside a single JSON object exactly in the format above.
`;

app.post("/api/translate-table", async (req, res) => {
  try {
    const { text, geminiApiKey } = req.body || {};
    const direction = (req.body && req.body.direction) || "he-ru";
    if (!["he-ru", "any-he"].includes(direction)) {
      return res.status(400).json({
        error: "Неизвестное направление",
        error_code: "BAD_DIRECTION",
      });
    }

    // W2-S4: сегмент-режим (пре-сегментированный ASR-транскрипт). Только he-ru.
    const segMode = req.body && req.body.segments != null;
    if (segMode) {
      if (direction !== "he-ru") {
        return res.status(400).json({ error: "segments допустим только с direction he-ru", error_code: "BAD_SEGMENTS" });
      }
      const sv = segTable.validateSegmentsInput(req.body.segments);
      if (!sv.ok) return res.status(400).json({ error: "Некорректные segments", error_code: sv.error_code });
    }

    if (!segMode && (!text || typeof text !== "string" || !text.trim())) {
      return res.status(400).json({ error: "Нет текста" });
    }

    // BYOK-only: per-request Gemini key from user's browser localStorage.
    // No server-side fallback — server-level GEMINI_API_KEY is intentionally NOT used.
    if (!geminiApiKey || typeof geminiApiKey !== "string" || !geminiApiKey.trim()) {
      return res.status(401).json({
        error: "Gemini API Key required (BYOK)",
        error_code: "GEMINI_KEY_REQUIRED",
      });
    }
    const trimmedKey = geminiApiKey.trim();
    if (!isPlausibleGeminiKey(trimmedKey)) {
      return res.status(400).json({
        error: "Неверный формат Gemini API Key (ожидается 'AIza…' или 'AQ.…').",
        error_code: "GEMINI_KEY_INVALID",
      });
    }
    const cleanText = segMode ? segTable.buildSegInput(req.body.segments) : text.trim();
    const translitProfile = ["sbl", "ru-phonetic", "learner-latin"].includes(String(req.body.translit_profile || ""))
      ? String(req.body.translit_profile)
      : "learner-latin";

    const scenarioName = segMode ? "table-seg-he-ru" : (direction === "any-he" ? "table-any-he" : "table-he-ru");
    const scenario = getGeminiScenario(scenarioName);
    const contentSha256 = crypto.createHash("sha256")
      .update(`${cleanText}\n\u0000translit_profile=${translitProfile}`)
      .digest("hex");
    const hashKey = buildGeminiCacheKey({ ...scenario, contentSha256 });
    const cacheFile = path.join(geminiCacheDir, `table-v2-${hashKey}.json`);
    const rawCacheFile = path.join(geminiCacheDir, `table-raw-v1-${hashKey}.json`);

    if (fs.existsSync(cacheFile)) {
      try {
        const rawCache = fs.readFileSync(cacheFile, "utf8");
        const cached = JSON.parse(rawCache);
        if (cacheMatchesScenario(cached, scenario) && Array.isArray(cached.rows)) {
          const local = canonicalizeGeminiTableRowsLocally(cached.rows, translitProfile);
          const warnings = Array.isArray(cached.warnings) ? [...cached.warnings] : [];
          if (local.corrections.length > 0 && !warnings.includes("LOCAL_NIQQUD_CANONICALIZED")) {
            warnings.push("LOCAL_NIQQUD_CANONICALIZED");
          }
          return res.json({
            rows: local.rows,
            model: cached.model,
            requestedModel: cached.model,
            modelVersion: cached.modelVersion || null,
            promptId: cached.promptId,
            schemaId: cached.schemaId,
            fromCache: true,
            cacheKey: hashKey,
            cachedAt: cached.createdAt || null,
            warnings,
            translitProfile: cached.translitProfile || translitProfile,
            translitProfileVersion: local.resolvedTranslitProfile,
            localNiqqudCorrections: local.corrections,
          });
        }
      } catch (e) {
        console.error("Ошибка чтения/парсинга кэша Gemini:", e);
      }
    }

    const prompt = segMode
      ? segTable.HE_RU_SEG_PROMPT(cleanText)
      : (direction === "any-he" ? ANY_HE_PROMPT(cleanText) : HE_RU_PROMPT(cleanText));

    const rawCached = readRawTableCache(rawCacheFile, scenario, translitProfile, cacheMatchesScenario);
    let generated;
    let rawText;
    let rawFromCache = false;
    if (rawCached) {
      rawFromCache = true;
      rawText = rawCached.rawText;
      generated = { modelVersion: rawCached.modelVersion || null };
    } else {
      generated = await generateGeminiContent({
        apiKey: trimmedKey,
        scenario,
        contents: prompt,
        config: {
          temperature: 0,
          maxOutputTokens: 65536,
          responseMimeType: "application/json",
          responseSchema: buildGeminiTableResponseSchema(Type),
        },
      });
      rawText = generated.text;
      // The upstream generation has already consumed the owner's provider quota
      // even if JSON parsing or semantic Hebrew validation rejects the payload.
      // Count here (never on cache hits), not only after publication succeeds.
      updateUsage("gemini", 1);
      // Preserve the paid provider output before parsing or semantic validation.
      // It contains source/derived text only and deliberately excludes the BYOK key.
      try {
        writeRawTableCacheAtomic(rawCacheFile, buildRawTableCachePayload({
          rawText,
          scenario,
          modelVersion: generated.modelVersion,
          translitProfile,
        }));
      } catch (e) {
        console.error("Ошибка записи сырого кэша Gemini:", e && e.message ? e.message : String(e));
      }
    }

    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON parse error:", e);
      return res.status(500).json({
        error: "Ошибка JSON",
        raw: rawText,
        model: scenario.model,
        requestedModel: scenario.model,
        modelVersion: generated.modelVersion,
        promptId: scenario.promptId,
        schemaId: scenario.schemaId,
        fromCache: rawFromCache,
        rawCacheKey: hashKey,
      });
    }

    let preparedRows;
    try {
      preparedRows = buildRowsFromGeminiPayload(parsed, { direction }, { keepSegmentIndex: segMode });
      if (!segMode && direction === "he-ru") {
        validateHebrewSourceCoverage(preparedRows, text.trim());
      }
    } catch (e) {
      console.error("Gemini payload error:", e);
      return res.status(500).json({
        error: "Неверный формат данных от Gemini",
        raw: rawText,
        details: e.message,
        error_code: e.code || "GEMINI_SEMANTIC_INVALID",
        fromCache: rawFromCache,
        rawCacheKey: hashKey,
      });
    }

    const local = canonicalizeGeminiTableRowsLocally(preparedRows, translitProfile);
    preparedRows = local.rows;
    const resolvedTranslitProfile = local.resolvedTranslitProfile;
    preparedRows.forEach((row) => {
      row.translation_provider = `gemini:${scenario.model}`;
      row.translation_meta_json = JSON.stringify({
        provider: "gemini",
        model: scenario.model,
        modelVersion: generated.modelVersion || null,
        promptId: scenario.promptId,
        schemaId: scenario.schemaId,
        translitProfile: resolvedTranslitProfile,
        localNiqqudNormalization: local.corrections.length > 0,
      });
    });

    let warnings = local.corrections.length > 0 ? ["LOCAL_NIQQUD_CANONICALIZED"] : [];
    if (segMode) {
      if (!segTable.validateSegMapping(preparedRows, req.body.segments.length)) {
        preparedRows.forEach((r) => { delete r.segment_index; });
        warnings.push("SEG_MAPPING_LOST"); // честная деградация: таблица есть, тайминг клиент отбросит
      } else {
        // W2-S4.1 FIX A: mapping structurally valid but model may still have skipped whole
        // input segments — flag it WITHOUT stripping segment_index/timing (rows that DID
        // land keep honest timing; the warning only flags missing CONTENT, not bad timing).
        const cov = segTable.segCoverage(preparedRows, req.body.segments.length);
        if (!cov.covered) warnings.push("SEG_COVERAGE_PARTIAL");
      }
    }

    const cachePayload = {
      text: cleanText,
      rows: preparedRows,
      warnings,
      model: scenario.model,
      modelVersion: generated.modelVersion,
      promptId: scenario.promptId,
      schemaId: scenario.schemaId,
      translitProfile,
      translitProfileVersion: resolvedTranslitProfile,
      localNiqqudCorrections: local.corrections,
      createdAt: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(cachePayload, null, 2), "utf8");
    } catch (e) {
      console.error("Ошибка записи в кэш Gemini:", e);
    }

    res.json({
      rows: preparedRows,
      model: scenario.model,
      requestedModel: scenario.model,
      modelVersion: generated.modelVersion,
      promptId: scenario.promptId,
      schemaId: scenario.schemaId,
      fromCache: rawFromCache,
      cacheKey: hashKey,
      cachedAt: cachePayload.createdAt,
      warnings,
      translitProfile,
      translitProfileVersion: resolvedTranslitProfile,
      localNiqqudCorrections: local.corrections,
    });
  } catch (error) {
    // Sanitize: log only flat scalars, never the raw error object (it can
    // include the user's BYOK key in some Gemini SDK paths).
    console.error("Gemini Error:", {
      message: error && error.message,
      status: error && (error.status || error.statusCode),
      code: error && error.code,
    });

    if (error && (error.status === 429 || error.statusCode === 429)) {
      let retryAfterSec = null;
      let limitType = "unknown";
      let quotaId = null;

      const details = error.errorDetails || error.details || [];

      for (const d of details) {
        if (d && typeof d === "object" && typeof d["@type"] === "string") {
          if (d["@type"].includes("RetryInfo") && d.retryDelay) {
            const m = String(d.retryDelay).match(/(\d+)/);
            if (m) {
              retryAfterSec = Number(m[1]);
            }
          }

          if (d["@type"].includes("QuotaFailure") && Array.isArray(d.violations)) {
            const v = d.violations[0];
            if (v) {
              const q = String(v.description || "").toLowerCase();
              quotaId = v.subject || null;

              if (q.includes("perday") || q.includes("daily")) {
                limitType = "daily";
              } else if (q.includes("perminute") || q.includes("permin")) {
                limitType = "rate";
              }
            }
          }
        }
      }

      if (limitType === "unknown" && typeof retryAfterSec === "number") {
        if (retryAfterSec <= 120) {
          limitType = "rate";
        } else if (retryAfterSec >= 3600) {
          limitType = "daily";
        }
      }

      let errorType = null;
      if (limitType === "rate") {
        errorType = "rate-limit";
      } else if (limitType === "daily") {
        errorType = "daily-limit";
      }

      let resetAt = null;
      if (limitType === "daily") {
        const stats = getUsage();
        try {
          const dayStartMs = stats.geminiDayStart
            ? Date.parse(stats.geminiDayStart)
            : Date.parse(getCurrentQuotaDayStartISO());
          if (!Number.isNaN(dayStartMs)) {
            resetAt = new Date(dayStartMs + 24 * 60 * 60 * 1000).toISOString();
          }
        } catch (e) {
          console.error("Ошибка вычисления resetAt для daily-limit:", e);
        }
      }

      if (limitType === "daily") {
        markGeminiDailyLimitHit();
      }

      return res.status(429).json({
        error: "Лимит Gemini",
        errorType,
        retryAfterSec,
        resetAt,
        details: error.message,
      });
    }

    res.status(500).json({
      error: "Ошибка Gemini",
      details: error.message,
    });
  }
});

// --------------------------------------------------------
// 10b. API: PREMIUM AI TRANSLATE (v2)
// --------------------------------------------------------
{
  const premiumPipeline = require("./db/premium/pipeline");
  const GCP_KEY_PATH = path.join(DATA_DIR, "gcp-translate-key.json");
  const ORIGINAL_GCP_KEY_ENV = process.env.GCP_TRANSLATE_KEY_FILE;
  const REQUIRED_GCP_KEY_FIELDS = ["type", "project_id", "private_key", "client_email"];

  // Boot-time: if a user-uploaded key file exists, prefer it over any env setting.
  try {
    if (fs.existsSync(GCP_KEY_PATH)) {
      process.env.GCP_TRANSLATE_KEY_FILE = GCP_KEY_PATH;
      console.log(`[premium] using user-uploaded GCP key at ${GCP_KEY_PATH}`);
    }
  } catch (e) {
    console.warn("[premium] failed to check GCP key file at boot:", e.message);
  }

  // Response rows (verbatim from db/premium/pipeline.js — this handler must never
  // reshape them) carry TWO indexes, and they are not interchangeable:
  //   segment_index      1-based ordinal of the row in the premium table;
  //   source_line_index  0-based index of the SOURCE LINE the row came from
  //                      (K2, 2026-07-30). For text imported from audio/video/
  //                      captions one source line == one ASR segment, so this is
  //                      the field the client maps karaoke timing through — see
  //                      v3AttachAudioTiming() in public/index.html and
  //                      docs/planning/STUDIO_KARAOKE_ROW_TIMING_MISMAP_2026_07_30.md.
  // Cache note: doc-cache hits replay whatever rows were stored when the entry was
  // written. Entries written before source_line_index existed simply lack it, and
  // the client degrades honestly (no karaoke) instead of guessing — SEGMENTER_VERSION
  // was bumped so those entries are unreachable by new requests anyway.
  app.post("/api/translate-table-v2", async (req, res) => {
    try {
      const {
        text,
        target_lang = "ru",
        provider = "madlad",
        text_id = null,
        note = null,
        gcpTranslateApiKey,
      } = req.body || {};

      // D-HNR-10: user-local MADLAD is a direct Browser→Companion path.
      // The production server must neither receive/proxy the text nor infer
      // readiness from a sidecar in its own container/network namespace.
      if (provider === "madlad") {
        return res.status(409).json({
          error: "MADLAD requires a paired local Companion",
          error_code: "LOCAL_MADLAD_COMPANION_REQUIRED",
        });
      }

      // BYOK validation for provider=gcp. Other providers ignore the key.
      let gcpApiKey = null;
      if (provider === "gcp") {
        if (!gcpTranslateApiKey || typeof gcpTranslateApiKey !== "string" || !gcpTranslateApiKey.trim()) {
          return res.status(401).json({
            error: "GCP Translate API key required (BYOK)",
            error_code: "GCP_TRANSLATE_KEY_REQUIRED",
          });
        }
        const trimmed = gcpTranslateApiKey.trim();
        if (!trimmed.startsWith("AIza") || trimmed.length < 20) {
          return res.status(400).json({
            error: "Неверный формат GCP Translate API Key. Ключ должен начинаться с 'AIza'.",
            error_code: "GCP_TRANSLATE_KEY_INVALID",
          });
        }
        gcpApiKey = trimmed;
      }

      const out = await premiumPipeline.translateTable({
        text,
        target_lang,
        provider,
        text_id,
        note,
        gcpApiKey,
      });

      res.json(out);
    } catch (e) {
      if (e.code === "BAD_INPUT") {
        return res.status(400).json({ error: e.message });
      }
      // google-free: rate limit (429 from Google's free endpoint).
      if (e.provider === "google-free" && (e.kind === "rate_limit" || e.status === 429)) {
        return res.status(429).json({
          error: "Google Translate: лимит бесплатных запросов исчерпан",
          details: e.message,
        });
      }
      // google-free: any other upstream error (network, timeout, HTTP error from Google).
      if (e.provider === "google-free") {
        return res.status(502).json({
          error: "Google Translate недоступен",
          details: e.message,
        });
      }
      // GCP-specific: quota exhaustion (or 403/429) maps to 402 Payment
      // Required so the UI can surface "upgrade to paid tier" — auto-fallback
      // is intentionally NOT triggered for quota errors.
      if (e.provider === "gcp" && e.kind === "quota") {
        return res.status(402).json({
          error: "GCP translation quota reached",
          upstream: e.upstream,
          details: e.message,
        });
      }
      // GCP misconfiguration (no key file, etc.).
      if (e.provider === "gcp" && e.kind === "config") {
        return res.status(503).json({
          error: "GCP translation provider not configured",
          details: e.message,
        });
      }
      if (e.upstream) {
        // Sidecar reachable but returned non-2xx, or network/timeout failure.
        const code = e.status === 0 ? 502 : e.status || 502;
        return res.status(code).json({
          error: "premium upstream failed",
          upstream: e.upstream,
          details: e.message,
        });
      }
      console.error("[premium] translate-table-v2 error:", e);
      res.status(500).json({ error: "Ошибка premium pipeline", details: e.message });
    }
  });

  const premiumQuota = require("./db/premium/quota");
  const premiumGcp = require("./db/premium/providers/gcp");

  app.get("/api/premium/status", (_req, res) => {
    res.json({
      providers: {
        gcp: { configured: premiumGcp.isAvailable(), quota: premiumQuota.getGcpStatus() },
        madlad: {
          configured: false,
          scope: "server",
          reason: "local_companion_required",
        },
      },
    });
  });

  // GCP key management: upload/replace/delete a service account JSON without editing .env.
  // GET returns a safe summary (never the private_key).
  app.get("/api/premium/gcp-key", (_req, res) => {
    try {
      const keyFile = process.env.GCP_TRANSLATE_KEY_FILE;
      const uploaded = fs.existsSync(GCP_KEY_PATH);
      const source = uploaded && keyFile === GCP_KEY_PATH ? "uploaded" : (keyFile ? "env" : null);
      if (!keyFile || !fs.existsSync(keyFile)) {
        return res.json({ configured: false, source: null });
      }
      // Privacy (INFO-LEAK-1): do not expose the service-account identity
      // (project_id/client_email) to unauthenticated callers — only configured + source.
      res.json({ configured: true, source });
    } catch (e) {
      res.status(500).json({ error: "Не удалось прочитать статус GCP ключа", details: e.message });
    }
  });

  app.post("/api/premium/gcp-key", (req, res) => {
    if (!requireAdminToken(req, res)) return;
    try {
      const key = req.body && req.body.key;
      if (!key || typeof key !== "object") {
        return res.status(400).json({ error: "Ожидается {key: {...service_account JSON...}}" });
      }
      if (key.type !== "service_account") {
        return res.status(400).json({ error: 'Поле "type" должно быть "service_account"' });
      }
      for (const f of REQUIRED_GCP_KEY_FIELDS) {
        if (!key[f] || typeof key[f] !== "string") {
          return res.status(400).json({ error: `Отсутствует или пустое поле: ${f}` });
        }
      }
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(GCP_KEY_PATH, JSON.stringify(key, null, 2), { encoding: "utf8" });
      try { fs.chmodSync(GCP_KEY_PATH, 0o600); } catch (_) { /* Windows: чмод — no-op */ }

      process.env.GCP_TRANSLATE_KEY_FILE = GCP_KEY_PATH;
      premiumGcp._reset();

      res.json({
        ok: true,
        configured: true,
        source: "uploaded",
        project_id: key.project_id,
        client_email: key.client_email,
      });
    } catch (e) {
      console.error("[premium] gcp-key upload error:", e);
      res.status(500).json({ error: "Не удалось сохранить GCP ключ", details: e.message });
    }
  });

  app.delete("/api/premium/gcp-key", (req, res) => {
    if (!requireAdminToken(req, res)) return;
    try {
      if (fs.existsSync(GCP_KEY_PATH)) fs.unlinkSync(GCP_KEY_PATH);
      if (ORIGINAL_GCP_KEY_ENV) {
        process.env.GCP_TRANSLATE_KEY_FILE = ORIGINAL_GCP_KEY_ENV;
      } else {
        delete process.env.GCP_TRANSLATE_KEY_FILE;
      }
      premiumGcp._reset();
      res.json({ ok: true, configured: premiumGcp.isAvailable() });
    } catch (e) {
      console.error("[premium] gcp-key delete error:", e);
      res.status(500).json({ error: "Не удалось удалить GCP ключ", details: e.message });
    }
  });

  console.log("[premium] /api/translate-table-v2 enabled");
}

// --------------------------------------------------------
// 10b. API: INGEST (W1 — STUDIO_INGEST_W1_IMPLEMENTATION_PLAN_2026_07_25)
// --------------------------------------------------------
require("./ingest/routes.js").registerIngestRoutes(app, { makeRateLimiter, geminiCacheDir });

// --------------------------------------------------------
// 11a. API: DIAGNOSTICS (aggregated system status for the Dashboard panel)
// --------------------------------------------------------
// 10c. API: NIQQUD ANNOTATION GATEWAY
// --------------------------------------------------------
app.post("/api/niqqud", async (req, res) => {
  try {
    const { text, genre = "modern" } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        ok: false, input: "", niqqud: "",
        translit: { sblAcademic: "", ruPhonetic: "" },
        provider: "none", degraded: true,
        warnings: ["text is required"],
      });
    }
    const { annotate } = require("./db/premium/niqqudGateway");
    const result = await annotate(text.trim(), genre);
    res.json(result);
  } catch (e) {
    console.error("[niqqud] error:", e);
    res.status(500).json({
      ok: false,
      input: (req.body && req.body.text) || "",
      niqqud: "",
      translit: { sblAcademic: "", ruPhonetic: "" },
      provider: "none",
      degraded: true,
      warnings: [e.message || "Internal error"],
    });
  }
});

// --------------------------------------------------------
// 10d. API: MORPHOLOGY (context-aware, Dicta) — Phase B
// --------------------------------------------------------
// Opt-in, consent-gated on the CLIENT (outbound Hebrew text). Stateless +
// free (Dicta Nakdan addmorph). Returns per-word disambiguated morphology so
// the client can resolve the CORRECT root/lemma in context (e.g. שאין → ש+אין
// particle, not נשא). Body: { sentence, genre? }.
app.post("/api/morphology", async (req, res) => {
  try {
    const { sentence, genre = "modern" } = req.body || {};
    if (!sentence || typeof sentence !== "string" || !sentence.trim()) {
      return res.status(400).json({ ok: false, tokens: [], provider: "none", degraded: true, reason: "sentence is required" });
    }
    const { analyze } = require("./db/premium/morphologyGateway");
    const result = await analyze(sentence.trim(), { genre });
    res.json(result);
  } catch (e) {
    console.error("[morphology] error:", e);
    res.status(500).json({ ok: false, tokens: [], provider: "none", degraded: true, reason: e.message || "Internal error" });
  }
});

// Batch morphology for a whole text (Phase D corpus enrichment). Body:
// { sentences: string[], genre? }. Returns one result per input sentence, in
// order, throttled server-side. Opt-in + consent-gated on the client.
app.post("/api/morphology/batch", async (req, res) => {
  try {
    const { sentences, genre = "modern" } = req.body || {};
    if (!Array.isArray(sentences) || !sentences.length) {
      return res.status(400).json({ ok: false, results: [], reason: "sentences[] is required" });
    }
    if (sentences.length > 400) {
      return res.status(413).json({ ok: false, results: [], reason: "too many sentences (max 400 per request)" });
    }
    const { analyze, MODEL_VERSION } = require("./db/premium/morphologyGateway");
    const CONCURRENCY = 4;
    const results = new Array(sentences.length).fill(null);
    for (let i = 0; i < sentences.length; i += CONCURRENCY) {
      const slice = sentences.slice(i, i + CONCURRENCY);
      await Promise.all(slice.map(async (s, j) => {
        const idx = i + j;
        try {
          const out = await analyze(String(s || ""), { genre });
          results[idx] = { ok: !!out.ok, tokens: out.tokens || [], degraded: !!out.degraded };
        } catch (e) {
          results[idx] = { ok: false, tokens: [], degraded: true, reason: e && e.message };
        }
      }));
    }
    res.json({ ok: true, results, model_version: MODEL_VERSION });
  } catch (e) {
    console.error("[morphology:batch] error:", e);
    res.status(500).json({ ok: false, results: [], reason: e.message || "Internal error" });
  }
});

// --------------------------------------------------------
// 10e. API: INFLECTION (conjugation/declension tables, Pealim) — ②
// --------------------------------------------------------
// In-app conjugation (verbs) + declension (nouns/adj) paradigms scraped from
// Pealim, parsed server-side, shared-cached in /app/data (universal reference
// data, not user data). Opt-in + consent-gated on the CLIENT (outbound lemma).
// Body: { lemma, binyan?, pos?, root? } — binyan/root from ①'s decode help
// disambiguate homographs. A miss returns degraded (client falls back to the
// Pealim link; never a fabricated paradigm).
app.post("/api/conjugation", async (req, res) => {
  try {
    const { lemma, binyan, pos, root, form, stem } = req.body || {};
    if (!lemma || typeof lemma !== "string" || !lemma.trim()) {
      return res.status(400).json({ ok: false, provider: "none", degraded: true, reason: "lemma is required" });
    }
    const { inflect } = require("./db/premium/inflectionGateway");
    const result = await inflect(lemma.trim(), { binyan, pos, root, form, stem });
    res.json(result);
  } catch (e) {
    console.error("[conjugation] error:", e);
    res.status(500).json({ ok: false, provider: "none", degraded: true, reason: e.message || "Internal error" });
  }
});

// Batch inflection for a whole text's distinct lemmas (corpus enrichment, ②.5).
// Body: { items: [{ lemma, binyan?, pos?, root? }] }. Cache-first; uncached
// lemmas are scraped under the gateway's politeness limiter (low concurrency +
// delay). Returns one result per item, in order.
app.post("/api/conjugation/batch", async (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ ok: false, results: [], reason: "items[] is required" });
    }
    if (items.length > 120) {
      return res.status(413).json({ ok: false, results: [], reason: "too many items (max 120 per request)" });
    }
    const { inflect, MODEL_VERSION } = require("./db/premium/inflectionGateway");
    // The gateway already serialises outbound fetches (≤2 concurrent, spaced);
    // fire them together and let the limiter pace — cache hits resolve instantly.
    const results = await Promise.all(items.map(async (it) => {
      const lemma = String((it && it.lemma) || "").trim();
      if (!lemma) return { ok: false, degraded: true, reason: "empty" };
      try {
        return await inflect(lemma, { binyan: it.binyan, pos: it.pos, root: it.root });
      } catch (e) {
        return { ok: false, degraded: true, reason: e && e.message };
      }
    }));
    res.json({ ok: true, results, model_version: MODEL_VERSION });
  } catch (e) {
    console.error("[conjugation:batch] error:", e);
    res.status(500).json({ ok: false, results: [], reason: e.message || "Internal error" });
  }
});

// --------------------------------------------------------
app.get("/api/diag", async (_req, res) => {
  const { getDb } = require("./db/sqlite");
  const {
    SEGMENTER_VERSION, NIKUD_VERSION, TRANSLIT_PROFILE_VERSIONS, TRANSLATOR_VERSIONS,
  } = require("./db/premium/versions");
  const pythonClient = require("./db/premium/pythonClient");
  const hebrewLocalClient = require("./db/premium/hebrewTtsClient");

  // ── 1. Sidecar health (non-blocking, short timeout) ──────────────────────
  let sidecar = { ok: false, status: 0, models: null };
  try {
    const r = await pythonClient.healthz();
    sidecar.ok = !!r.ok;
    sidecar.status = r.status || 0;
    if (r.ok) {
      const m = await pythonClient.modelsStatus();
      // Sidecar returns { nakdan: { state, loaded_at, last_used_at, ... },
      //                   translator: { state, ... } }
      if (m.ok && m.body) sidecar.models = m.body;
    }
  } catch (_) {}

  let hebrew_tts_sidecar = { ok: false, status: 0, body: null };
  try {
    const r = await hebrewLocalClient.healthz();
    hebrew_tts_sidecar.ok = !!r.ok;
    hebrew_tts_sidecar.status = r.status || 0;
    if (r.ok && r.body) hebrew_tts_sidecar.body = r.body;
  } catch (_) {}

  // ── 2. Premium providers ─────────────────────────────────────────────────
  let providers = {
    gcp: { configured: false, quota: null },
    madlad: { configured: false, scope: "server", reason: "local_companion_required" },
  };
  const premiumV2Enabled = typeof PREMIUM_V2_ENABLED !== "undefined" ? !!PREMIUM_V2_ENABLED : false;
  if (premiumV2Enabled) {
    try {
      const premiumGcp   = require("./db/premium/providers/gcp");
      const premiumQuota = require("./db/premium/quota");
      providers.gcp.configured = premiumGcp.isAvailable();
      providers.gcp.quota      = premiumQuota.getGcpStatus();
    } catch (_) {}
  }

  // ── 3. DB stats (cache + library) ────────────────────────────────────────
  // Each query is isolated — one failure does not blank all stats.
  let db_stats = null;
  try {
    const db = getDb();
    // Resolves to row on success, null on error (never rejects).
    const qSafe = (sql) => new Promise((ok) =>
      db.get(sql, [], (e, r) => ok(e ? null : r)));
    const qAllSafe = (sql) => new Promise((ok) =>
      db.all(sql, [], (e, rows) => ok(e ? [] : (rows || []))));

    const [docCache, segCache, overrides, texts, textsActive, sentences, provRows] =
      await Promise.all([
        qSafe("SELECT COUNT(*) AS n FROM translation_doc_cache"),
        qSafe("SELECT COUNT(*) AS n FROM translation_segment_cache"),
        qSafe("SELECT COUNT(*) AS n FROM translation_overrides"),
        qSafe("SELECT COUNT(*) AS n FROM texts"),
        qSafe("SELECT COUNT(*) AS n FROM texts WHERE is_archived = 0 OR is_archived IS NULL"),
        qSafe("SELECT COUNT(*) AS n FROM sentences"),
        // Provider breakdown via sentences.translation_provider (texts has no provider column).
        qAllSafe(
          "SELECT translation_provider AS provider, COUNT(DISTINCT text_id) AS n " +
          "FROM sentences WHERE translation_provider IS NOT NULL GROUP BY translation_provider"
        ),
      ]);

    db_stats = {
      doc_cache:    docCache?.n   ?? null,
      seg_cache:    segCache?.n   ?? null,
      overrides:    overrides?.n  ?? null,
      texts:        texts?.n      ?? null,
      texts_active: textsActive?.n ?? null,
      sentences:    sentences?.n  ?? null,
      by_provider: provRows.reduce((acc, r) => {
        acc[r.provider || "unknown"] = r.n;
        return acc;
      }, {}),
    };
  } catch (_) {}

  // ── 4. Versions ───────────────────────────────────────────────────────────
  const versions = {
    segmenter:  SEGMENTER_VERSION,
    nikud:      NIKUD_VERSION,
    translit:   TRANSLIT_PROFILE_VERSIONS,
    translators: TRANSLATOR_VERSIONS,
  };

  res.json({ ok: true, sidecar, hebrew_tts_sidecar, providers, db_stats, versions, ts: new Date().toISOString() });
});

// --------------------------------------------------------
// 11. API: EXPORT DOCX
// --------------------------------------------------------
app.post("/api/export-docx", async (req, res) => {
  try {
    const { rows } = req.body || {};

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Нет данных для экспорта" });
    }

    const tableRows = [];

    const headerRow = new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Иврит", bold: true })],
            }),
          ],
        }),
        new TableCell({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Огласовки", bold: true })],
            }),
          ],
        }),
        new TableCell({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Транслит", bold: true })],
            }),
          ],
        }),
        new TableCell({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Перевод", bold: true })],
            }),
          ],
        }),
      ],
    });

    tableRows.push(headerRow);

    rows.forEach((row) => {
      const he = row.he || "";
      const heNiqqud = row.he_niqqud || "";
      const translit = row.translit || "";
      const ru = row.ru || "";

      const docxRow = new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun(he)] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun(heNiqqud)] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun(translit)] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun(ru)] })],
          }),
        ],
      });

      tableRows.push(docxRow);
    });

    const doc = new Document({
      sections: [
        {
          children: [
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: tableRows,
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="translation.docx"'
    );
    res.send(buffer);
  } catch (error) {
    console.error("DOCX Export Error:", error);
    res.status(500).json({ error: "Ошибка экспорта DOCX" });
  }
});

// --------------------------------------------------------
// 12. API: USAGE (для фронтенда)
// --------------------------------------------------------
app.get("/api/usage", (req, res) => {
  try {
    ensureGeminiDay();
    const usage = getUsage();

    const usedToday = typeof usage.geminiRequests === "number"
      ? usage.geminiRequests
      : 0;
    const limit = GEMINI_DAILY_LIMIT;
    const dayStart = usage.geminiDayStart || getCurrentQuotaDayStartISO();
    const totalGemini = typeof usage.geminiRequestsTotal === "number"
      ? usage.geminiRequestsTotal
      : 0;

    res.json({
      ttsChars: usage.ttsChars,
      ttsCost: usage.ttsCost,
      geminiRequestsToday: usedToday,
      geminiDailyLimit: limit,
      geminiDayStart: dayStart,
      geminiDailyLimitHit: !!usage.geminiDailyLimitHit,
      resetHourUTC: GEMINI_RESET_HOUR_UTC,
      geminiRequests: usedToday,
      geminiRequestsTotal: totalGemini,
      geminiModelName: GEMINI_STUDIO_MODEL,
      // The API key is supplied by the browser. Its Google billing tier is not
      // observable by LinguistPro, so never label BYOK usage as Free or Paid.
      geminiBillingTier: "byok",
    });
  } catch (error) {
    console.error("Usage Error:", error);
    res.status(500).json({ error: "Ошибка чтения usage" });
  }
});

// --------------------------------------------------------
// 12.1 Routes
// --------------------------------------------------------

// Helper для DB-ошибок
function requireDbOr503(res) {
  const h = getDbHealth();
  if (!h || !h.ok) {
    res.status(503).json({ error: "DB_NOT_AVAILABLE", db: h || null });
    return false;
  }
  return true;
}

// --------------------------------------------------------
// W10-EXPORT-DOCX-01 helpers
// --------------------------------------------------------
function getBaseUrl(req) {
  const xfProto = req.headers["x-forwarded-proto"];
  const xfHost = req.headers["x-forwarded-host"];
  const proto = String(xfProto || req.protocol || "http").split(",")[0].trim();
  const host = String(xfHost || req.get("host") || "").split(",")[0].trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

function makeSafeFilenameBase(title, fallback) {
  const raw = String(title || "").trim() || String(fallback || "export");
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || String(fallback || "export")).slice(0, 80);
}

function setAttachment(res, filename) {
  const asciiFallback = String(filename).replace(/[^\x20-\x7E]/g, "_");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
}

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return fallback;
  }
}

// --------------------------------------------------------
// W10-EXPORT-ANKI-01 helpers
// --------------------------------------------------------
function getBaseUrl(req) {
  const xfProto = req.headers["x-forwarded-proto"];
  const xfHost = req.headers["x-forwarded-host"];
  const proto = String(xfProto || req.protocol || "http").split(",")[0].trim();
  const host = String(xfHost || req.get("host") || "").split(",")[0].trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvLine(values) {
  return (values || []).map(csvEscape).join(",");
}

// Make filename safe for Windows + headers; keep Unicode but strip illegal chars
function makeSafeFilenameBase(title, fallback) {
  const raw = String(title || "").trim() || String(fallback || "export");
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || String(fallback || "export")).slice(0, 80);
}

function setAttachment(res, filename) {
  const asciiFallback = String(filename).replace(/[^\x20-\x7E]/g, "_");
  // Both filename + RFC5987 filename* for Unicode
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
}

// --------------------------------------------------------
// W11-ANKI-CONNECT-01 helpers (server-side bridge to local AnkiConnect)
// --------------------------------------------------------
const ANKI_CONNECT_HOST = process.env.ANKI_CONNECT_HOST || "127.0.0.1";
const ANKI_CONNECT_PORT = Number(process.env.ANKI_CONNECT_PORT || 8765);
const ANKI_CONNECT_VERSION = Number(process.env.ANKI_CONNECT_VERSION || 6);
const ANKI_CONNECT_API_KEY = process.env.ANKI_CONNECT_API_KEY || null;
// If AnkiConnect permission/origin checks are enabled, this Origin may be required.
const ANKI_CONNECT_ORIGIN = process.env.ANKI_CONNECT_ORIGIN || "";
const ANKI_CONNECT_TIMEOUT_MS = Number(process.env.ANKI_CONNECT_TIMEOUT_MS || 60000);

// Retry settings (transient socket resets are common on local bridges)
const ANKI_CONNECT_RETRIES = Number(process.env.ANKI_CONNECT_RETRIES || 3);
const ANKI_CONNECT_RETRY_DELAY_MS = Number(process.env.ANKI_CONNECT_RETRY_DELAY_MS || 250);

const ANKI_ADDNOTES_CHUNK = Math.max(5, Math.min(100, Number(process.env.ANKI_ADDNOTES_CHUNK || 25)));
const ANKI_MULTI_CHUNK = Math.max(10, Math.min(200, Number(process.env.ANKI_MULTI_CHUNK || 50)));

// Force a conservative agent (avoid keep-alive weirdness)
const ANKI_HTTP_AGENT = new http.Agent({ keepAlive: false, maxSockets: 1 });

function ankiSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ankiIsTransientNetErr(e) {
  const msg = String((e && e.message) || e || "");
  return /ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|socket hang up|ANKI_CONNECT_TIMEOUT/i.test(msg);
}

function ankiSafeTagPart(x, maxLen) {
  const s = String(x || "").trim();
  if (!s) return "";
  // Anki tags: no spaces; be conservative (letters/digits/_ only)
  const cleaned = s
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.slice(0, maxLen || 48);
}

function ankiNoDashId(uuid) {
  return String(uuid || "").replace(/-/g, "");
}

function ankiDedupSoundFieldValue(soundRaw) {
  const raw = String(soundRaw || "");
  if (!raw) return raw;

  const tags = raw.match(/\[sound:[^\]]+\]/g) || [];
  if (!tags.length) return raw;

  const uniq = [];
  const seen = new Set();
  for (const t of tags) {
    if (!seen.has(t)) {
      seen.add(t);
      uniq.push(t);
    }
  }

  // Меняем только если есть дубликаты и в поле нет ничего кроме sound-тегов/пробелов.
  if (uniq.length === tags.length) return raw;

  const remainder = raw
    .replace(/\[sound:[^\]]+\]/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (remainder) return raw;

  return uniq.join("\n");
}

function ankiIsLocalHttpRequest(req) {
  const ipRaw = String((req && (req.ip || (req.socket && req.socket.remoteAddress) || "")) || "");
  const ip = ipRaw.replace(/^::ffff:/, "");
  return ip === "127.0.0.1" || ip === "::1";
}

// baseUrl специально для AnkiConnect (скачивание audio по URL).
// ВАЖНО: форсим 127.0.0.1 ТОЛЬКО когда запрос локальный и host=localhost/[::1]/0.0.0.0
function getBaseUrlForAnki(req) {
  const xfProto = req.headers["x-forwarded-proto"];
  const xfHost = req.headers["x-forwarded-host"];
  const proto = String(xfProto || req.protocol || "http").split(",")[0].trim();

  let host = String(xfHost || req.get("host") || "").split(",")[0].trim();
  if (!host) return "";

  if (ankiIsLocalHttpRequest(req)) {
    const lower = host.toLowerCase();

    // localhost:3000 -> 127.0.0.1:3000
    if (lower === "localhost" || lower.startsWith("localhost:")) {
      host = host.replace(/^localhost\b/i, "127.0.0.1");
    }

    // [::1]:3000 -> 127.0.0.1:3000
    if (lower.startsWith("[::1]")) {
      host = host.replace(/^\[::1\]/i, "127.0.0.1");
    }

    // 0.0.0.0:3000 -> 127.0.0.1:3000 (иногда встречается в host)
    if (lower === "0.0.0.0" || lower.startsWith("0.0.0.0:")) {
      host = host.replace(/^0\.0\.0\.0\b/i, "127.0.0.1");
    }
  }

  return `${proto}://${host}`;
}

function ankiNoteHtmlFromMarkdown(mdRaw) {
  // Conservative: escape everything, then allow a tiny safe subset of markdown-like formatting.
  // NO raw HTML passthrough.
  const md = String(mdRaw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!md.trim()) return "";
  const esc = (s) => String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const safeLink = (url) => {
    const u = String(url || "").trim();
    if (!u) return null;
    if (/^https?:\/\//i.test(u)) return u;
    return null;
  };

  const lines = md.split("\n");
  const out = [];
  let inUl = false;

  const flushUl = () => {
    if (inUl) { out.push("</ul>"); inUl = false; }
  };

  for (let raw of lines) {
    const line = String(raw || "");

    // Bullets
    const mBul = line.match(/^\s*[-*]\s+(.*)$/);
    if (mBul) {
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push("<li>" + esc(mBul[1]) + "</li>");
      continue;
    } else {
      flushUl();
    }

    // Quote
    const mQ = line.match(/^\s*>\s?(.*)$/);
    if (mQ) {
      out.push("<blockquote>" + esc(mQ[1]) + "</blockquote>");
      continue;
    }

    // Paragraph / empty line
    if (!line.trim()) {
      out.push("<br>");
      continue;
    }

    out.push("<p>" + esc(line) + "</p>");
  }
  flushUl();

  let html = out.join("");

  // Inline formatting (operate after escaping)
  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/==([^=]+)==/g, "<mark>$1</mark>");

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => {
    const href = safeLink(url);
    const t = esc(text);
    if (!href) return t;
    return `<a href="${href}" target="_blank" rel="noreferrer noopener">${t}</a>`;
  });

  return html;
}

function ankiHttpJsonOnce(payload) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(payload || {});

    const reqOpts = {
      host: ANKI_CONNECT_HOST,
      port: ANKI_CONNECT_PORT,
      path: "/",
      method: "POST",
      family: 4, // force IPv4 (важно, если кто-то выставит host=localhost)
      agent: ANKI_HTTP_AGENT,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
      },
    };

    const req = http.request(reqOpts, (res) => {
      const status = Number(res.statusCode || 0);
      let raw = "";

      res.setEncoding("utf8");
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        let json = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch (_) {
          json = null;
        }

        resolve({
          status,
          json,
          rawBody: raw,
        });
      });
    });

    req.on("error", (err) => {
      // добавим контекст цели, чтобы видеть "куда стучались"
      err.details = Object.assign({}, err.details, {
        host: ANKI_CONNECT_HOST,
        port: ANKI_CONNECT_PORT,
      });
      reject(err);
    });

    req.setTimeout(ANKI_CONNECT_TIMEOUT_MS, () => {
      const err = new Error("ANKI_CONNECT_TIMEOUT");
      err.code = "ANKI_CONNECT_TIMEOUT";
      err.details = {
        host: ANKI_CONNECT_HOST,
        port: ANKI_CONNECT_PORT,
        timeoutMs: ANKI_CONNECT_TIMEOUT_MS,
      };
      req.destroy(err);
    });

    req.write(bodyStr);
    req.end();
  });
}

async function ankiHttpJson(payload) {
  const attempts = Math.max(1, ANKI_CONNECT_RETRIES | 0);

  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await ankiHttpJsonOnce(payload);
    } catch (e) {
      lastErr = e;

      // Only retry on transient socket-level errors
      if (!ankiIsTransientNetErr(e) || i === attempts) throw e;

      // Small backoff
      await ankiSleep(ANKI_CONNECT_RETRY_DELAY_MS * i);
    }
  }
  throw lastErr || new Error("ANKI_CONNECT_ERROR");
}

async function ankiInvoke(action, params) {
  const payload = {
    action: String(action || ""),
    version: ANKI_CONNECT_VERSION,
    params: params || {},
  };
  if (ANKI_CONNECT_API_KEY) payload.key = ANKI_CONNECT_API_KEY;

const resp = await ankiHttpJson(payload);

// Нормализация: поддерживаем оба формата:
// 1) Новый правильный: { status, json, rawBody }
// 2) Старый/сломанный: { result, error } (без status/json/rawBody)
let status = 0;
let json = null;
let rawBody = "";

if (resp && typeof resp === "object" && ("status" in resp || "json" in resp || "rawBody" in resp)) {
  status = Number(resp.status || 0);
  json = resp.json;
  rawBody = String(resp.rawBody || "");
} else {
  status = 200;
  json = resp;
  try {
    rawBody = JSON.stringify(resp || {});
  } catch (_) {
    rawBody = "";
  }
}
  // HTTP-level guard
  if (!status || status < 200 || status >= 300) {
    const e = new Error(`ANKI_CONNECT_HTTP_${status || 0}`);
    e.code = "ANKI_CONNECT_HTTP_ERROR";
    e.status = status || 0;
    e.details = {
      action: payload.action,
      status: status || 0,
      rawBodySnippet: String(rawBody || "").slice(0, 400),
    };
    throw e;
  }

  // Schema guard (AnkiConnect must return {result:..., error:...})
  if (!json || typeof json !== "object") {
  const err = new Error("ANKI_CONNECT_BAD_JSON");
  err.details = { action, status, rawBodySnippet: String(rawBody || "").slice(0, 240) };
  throw err;
}

  const hasResult = Object.prototype.hasOwnProperty.call(json, "result");
  const hasError = Object.prototype.hasOwnProperty.call(json, "error");
  if (!hasResult || !hasError) {
    const e = new Error("ANKI_CONNECT_BAD_SCHEMA");
    e.code = "ANKI_CONNECT_BAD_SCHEMA";
    e.status = status;
    e.details = { action: payload.action, status, jsonKeys: Object.keys(json), rawBodySnippet: String(rawBody || "").slice(0, 400) };
    throw e;
  }

  if (json.error) {
    const e = new Error(String(json.error));
    e.code = "ANKI_CONNECT_ERROR";
    e.status = status;
    e.details = { action: payload.action, status, error: String(json.error) };
    throw e;
  }

  return json.result;
}

async function ankiMulti(actions) {
  const arr = Array.isArray(actions) ? actions : [];
  return ankiInvoke("multi", { actions: arr.map((a) => ({ action: a.action, params: a.params || {} })) });
}

async function ankiEnsureDeck(deckName) {
  const name = String(deckName || "").trim();
  if (!name) throw new Error("ANKI_BAD_DECK_NAME");

  // createDeck is safe/idempotent: returns existing id if already exists
  await ankiInvoke("createDeck", { deck: name });
}

async function ankiEnsureModel(modelName, spec) {
  const name = String(modelName || "").trim();
  if (!name) throw new Error("ANKI_MODEL_REQUIRED");

  const names = await ankiInvoke("modelNames", {});
  const exists = Array.isArray(names) && names.includes(name);
  if (exists) return;

  // spec: { inOrderFields, css, cardTemplates:[{Name, Front, Back}] }
  const s = spec || {};
  await ankiInvoke("createModel", {
    modelName: name,
    inOrderFields: Array.isArray(s.inOrderFields) ? s.inOrderFields : [],
    css: String(s.css || ""),
    cardTemplates: Array.isArray(s.cardTemplates) ? s.cardTemplates : [],
  });
}

function getDefaultSrsAnkiDeck(textRec) {
  const level = textRec && textRec.level ? String(textRec.level || "").trim() : "";
  return level ? `LinguistPro::SRS::${level}` : "LinguistPro::SRS";
}

function getDefaultSrsAnkiModelName() {
  return "LinguistPro SRS Card v1";
}

function getSrsAnkiModelSpec() {
  return {
    inOrderFields: [
      "UID",
      "CardId",
      "SentenceId",
      "TextId",
      "TemplateCode",
      "Prompt",
      "Answer",
      "Hebrew",
      "HebrewNiqqud",
      "Russian",
      "Translit",
      "Note",
      "NoteHtml",
      "Sound",
      "AudioUrl",
      "AudioAssetKey",
      "Hint",
    ],
    css: `
.card {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  line-height: 1.4;
  text-align: left;
}
.prompt-he, .answer-he {
  direction: rtl;
  text-align: right;
  font-size: 34px;
  font-weight: 700;
  margin: 8px 0 10px;
}
.prompt, .answer {
  font-size: 24px;
  margin: 8px 0 10px;
}
.subtle {
  font-size: 12px;
  opacity: 0.68;
  margin-top: 6px;
}
.row {
  margin: 10px 0;
}
.label {
  font-size: 11px;
  opacity: 0.6;
  margin-bottom: 3px;
}
.val {
  font-size: 18px;
}
.note {
  margin-top: 10px;
  font-size: 15px;
}
.note pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  background: rgba(0,0,0,0.04);
  padding: 8px;
  border-radius: 6px;
}
mark { background: #fff2a8; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
blockquote { border-left: 3px solid rgba(0,0,0,0.2); margin: 6px 0; padding-left: 10px; opacity: 0.9; }
ul { margin: 6px 0 6px 22px; }
`.trim(),
    cardTemplates: [
      {
        Name: "SRS Card",
        Front: `
<div class="prompt">{{Prompt}}</div>
{{#Sound}}<div>{{Sound}}</div>{{/Sound}}
{{#Hint}}<div class="subtle">{{Hint}}</div>{{/Hint}}
        `.trim(),
        Back: `
{{#Sound}}<div>{{Sound}}</div>{{/Sound}}
<div class="prompt">{{Prompt}}</div>
<div class="answer">{{Answer}}</div>

<div class="row">
  <div class="label">Translit</div>
  <div class="val">{{Translit}}</div>
</div>

{{#NoteHtml}}
  <div class="note">{{NoteHtml}}</div>
{{/NoteHtml}}
{{^NoteHtml}}
  {{#Note}}
    <div class="note"><pre>{{Note}}</pre></div>
  {{/Note}}
{{/NoteHtml}}

{{#AudioUrl}}
  <div class="row"><a href="{{AudioUrl}}">audio url</a></div>
{{/AudioUrl}}

{{#Hint}}<div class="subtle">{{Hint}}</div>{{/Hint}}
        `.trim(),
      },
    ],
  };
}

function buildSrsAnkiHint(textRec) {
  const topic = String(textRec && textRec.topic || "").trim();
  const title = String(textRec && textRec.title || "").trim();
  const level = String(textRec && textRec.level || "").trim();
  const left = topic || title;
  if (left && level) return `${left} · ${level}`;
  return left || level || "";
}

async function buildSrsAnkiPreview(req, {
  cardId,
  deckName = "",
  modelName = "",
  includeNoteHtml = false,
} = {}) {
  const snapshot = await getCardSnapshotById(cardId);
  if (!snapshot || !snapshot.card) throw new Error("CARD_NOT_FOUND");

  const sentence = snapshot.sentence || {};
  const card = snapshot.card || {};
  const template = card.template || {};
  const textRec = sentence.textId ? await getTextById(sentence.textId) : null;
  const noteRec = sentence.sentenceId ? await getNoteBySentenceId(sentence.sentenceId) : null;
  const trainer = buildTrainerPayload(snapshot, "reveal");
  const noteText = String(noteRec && noteRec.note || "");
  const noteHtml = includeNoteHtml ? ankiNoteHtmlFromMarkdown(noteText) : "";
  const chosenDeck = String(deckName || getDefaultSrsAnkiDeck(textRec)).trim() || getDefaultSrsAnkiDeck(textRec);
  const chosenModel = String(modelName || getDefaultSrsAnkiModelName()).trim() || getDefaultSrsAnkiModelName();
  const audioAssetKey = String(sentence.audioAssetKey || "").trim();
  const baseUrl = getBaseUrlForAnki(req);
  const audioUrl = audioAssetKey ? `${baseUrl}/api/audio/${encodeURIComponent(audioAssetKey)}` : "";
  const cardTag = `lp_srs_card_${ankiNoDashId(card.id)}`;
  const textTag = sentence.textId ? `lp_text_${ankiNoDashId(sentence.textId)}` : "";
  const templateTag = template.code ? `lp_srs_tpl_${ankiSafeTagPart(template.code, 32)}` : "";
  const levelTag = ankiSafeTagPart(textRec && textRec.level, 24);
  const topicTag = ankiSafeTagPart(textRec && textRec.topic, 24);
  const fields = {
    UID: card.id,
    CardId: card.id,
    SentenceId: sentence.sentenceId || "",
    TextId: sentence.textId || "",
    TemplateCode: template.code || "",
    Prompt: String(trainer.promptText || ""),
    Answer: String(trainer.answerText || ""),
    Hebrew: String(sentence.hePlain || ""),
    HebrewNiqqud: String(sentence.heNiqqud || ""),
    Russian: String(sentence.ru || ""),
    Translit: String(sentence.translit || ""),
    Note: noteText,
    NoteHtml: noteHtml,
    Sound: audioAssetKey ? `[sound:lp_${audioAssetKey}.mp3]` : "",
    AudioUrl: audioUrl,
    AudioAssetKey: audioAssetKey,
    Hint: buildSrsAnkiHint(textRec),
  };
  const tags = ["lp", "lp_srs", "lp_ver_patch08", cardTag];
  if (textTag) tags.push(textTag);
  if (templateTag) tags.push(templateTag);
  if (levelTag) tags.push(`lp_level_${levelTag}`);
  if (topicTag) tags.push(`lp_topic_${topicTag}`);

  const note = {
    deckName: chosenDeck,
    modelName: chosenModel,
    fields,
    tags,
  };
  if (audioUrl && audioAssetKey) {
    note.audio = [
      {
        url: audioUrl,
        filename: `lp_${audioAssetKey}.mp3`,
        fields: ["Sound"],
      },
    ];
  }

  const exportHash = computeSrsExportHash({
    deckName: chosenDeck,
    modelName: chosenModel,
    fields,
    tags,
    audioFilename: audioAssetKey ? `lp_${audioAssetKey}.mp3` : "",
  });
  const exportRec = await getSrsCardExport("anki", card.id);
  const status = {
    export: exportRec,
    isExported: !!(exportRec && exportRec.externalNoteId),
    isUpToDate: !!(exportRec && exportRec.exportHash === exportHash && exportRec.lastSyncStatus === "ok"),
  };

  return {
    cardId: card.id,
    sentenceId: sentence.sentenceId || "",
    textId: sentence.textId || "",
    deckName: chosenDeck,
    modelName: chosenModel,
    exportHash,
    note,
    preview: {
      templateCode: template.code || "",
      templateLabel: template.label || "",
      promptText: String(trainer.promptText || ""),
      promptLang: String(trainer.promptLang || ""),
      answerText: String(trainer.answerText || ""),
      answerLang: String(trainer.answerLang || ""),
      supportText: String(trainer.supportText || ""),
      hasAudio: !!audioAssetKey,
      hasNote: !!noteText.trim(),
    },
    status,
  };
}

// --------------------------------------------------------
// Progress (V3-PROG-01)
// --------------------------------------------------------
app.get("/api/progress/:textId", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const textId = String(req.params.textId || "");
    const text = await getTextById(textId);
    if (!text) return res.status(404).json({ error: "NOT_FOUND" });

    const progress = await getProgressByTextId(textId);
    res.json({ ok: true, progress });
  } catch (e) {
    console.error("GET /api/progress/:textId error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

app.post("/api/progress/:textId", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const textId = String(req.params.textId || "");
    const text = await getTextById(textId);
    if (!text) return res.status(404).json({ error: "NOT_FOUND" });

    const body = req.body || {};
    const hasLastRow = Object.prototype.hasOwnProperty.call(body, "lastRowIdx");
    if (!hasLastRow) return res.status(400).json({ error: "VALIDATION", field: "lastRowIdx" });

    const lastStepId =
      (body.lastStepId === null || body.lastStepId === undefined) ? null : String(body.lastStepId);

    // null => clear progress
    if (body.lastRowIdx === null) {
      const cleared = await clearProgress(textId);
      return res.json({ ok: true, progress: cleared });
    }

    let lastRowIdx = Number(body.lastRowIdx);
if (!Number.isFinite(lastRowIdx)) {
  return res.status(400).json({ error: "VALIDATION", field: "lastRowIdx" });
}
// normalize to integer
lastRowIdx = Math.trunc(lastRowIdx);

// clamp negative (defensive)
if (lastRowIdx < 0) lastRowIdx = 0;

const cnt = await getSentenceCount(textId);

// If text has no sentences yet (or unexpected state) — clear progress safely
if (cnt <= 0) {
  lastRowIdx = null;
} else {
  // clamp instead of RANGE error to avoid silent progress loss on boundary races
  if (lastRowIdx >= cnt) lastRowIdx = cnt - 1;
}

    const progress = await setProgress({ textId, lastRowIdx, lastStepId });
    res.json({ ok: true, progress });
  } catch (e) {
    console.error("POST /api/progress/:textId error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});


// List texts
app.get("/api/library/texts", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const limit = Number(req.query.limit || "15");
	const includeArchived = String(req.query.includeArchived || "0") === "1";
	const q = (req.query.q || req.query.search || "").toString();
	const level = (req.query.level == null) ? null : (String(req.query.level).trim() || null);
	const tags = (req.query.tags == null) ? null : req.query.tags;

	const rows = await listTexts({ limit, includeArchived, q, level, tags });
    res.json({ ok: true, texts: rows });
  } catch (e) {
    console.error("GET /api/library/texts error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

//Create text (атомарно)
app.post("/api/library/texts", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const body = req.body || {};
    const sourceText = String(body.sourceText || "").trim();
    const rowsIn = Array.isArray(body.rows) ? body.rows : [];

    if (!sourceText) return res.status(400).json({ error: "VALIDATION", field: "sourceText" });
    if (!Array.isArray(rowsIn) || rowsIn.length < 1) return res.status(400).json({ error: "VALIDATION", field: "rows" });

        // tags: accept array or string; normalize and store as JSON array (never NULL)
    let tagsJson = "[]";
    try {
      const normTags = v3NormalizeTags(body.tags);
      tagsJson = JSON.stringify(normTags);
    } catch (_) {
      tagsJson = "[]";
    }

    const ttsProfileJson = body.ttsProfile ? JSON.stringify(body.ttsProfile) : null;
    const tableModelMetaJson = body.tableModelMeta ? JSON.stringify(body.tableModelMeta) : null;
    const sourceMetaJson = body.sourceMeta ? JSON.stringify(body.sourceMeta) : null;

    const textKey = String(body.textKey || "") || computeTextKey({
      sourceText,
      ttsProfile: body.ttsProfile || null,
      tableModelMeta: body.tableModelMeta || null,
    });

    const textId = body.id ? String(body.id) : uuidv4();
    const title = (body.title && String(body.title).trim()) ? String(body.title).trim() : guessTitle(sourceText);
    const levelRaw = (body.level && String(body.level).trim()) ? String(body.level).trim() : null;
	const level = v3NormalizeLevel(levelRaw);

	// Week9 dashboard meta (optional)
const source = Object.prototype.hasOwnProperty.call(body, "source")
  ? ((body.source == null) ? null : String(body.source).trim() || null)
  : null;

const topic = Object.prototype.hasOwnProperty.call(body, "topic")
  ? ((body.topic == null) ? null : String(body.topic).trim() || null)
  : null;

// isPinned: accept boolean / 0|1 / "0"|"1"
let isPinned = 0;
if (Object.prototype.hasOwnProperty.call(body, "isPinned")) {
  const v = body.isPinned;
  if (v === true || v === 1 || v === "1") isPinned = 1;
  else isPinned = 0;
}

// pinOrder: optional integer (only meaningful if pinned)
let pinOrder = null;
if (Object.prototype.hasOwnProperty.call(body, "pinOrder")) {
  if (body.pinOrder === null || body.pinOrder === "" || body.pinOrder === undefined) {
    pinOrder = null;
  } else {
    const n = Number(body.pinOrder);
    if (Number.isFinite(n)) pinOrder = Math.trunc(n);
  }
}
if (!isPinned) pinOrder = null;


    const rows = rowsIn.map((r, idx) => {
      const hePlain = String((r && r.he) || "");
      const heNiq = String((r && r.he_niqqud) || "");
      const translit = String((r && r.translit) || "");
      const ru = String((r && r.ru) || "");

      // row_hash — опционально; полезно для будущего дедуп/сверок
      const rowHash = crypto
        .createHash("sha256")
        .update(JSON.stringify({ hePlain, heNiq, translit, ru }), "utf8")
        .digest("hex");

      // meta_json — крючок под будущие verbs[] без миграций UI
      const meta = (r && typeof r === "object" && r.verbs) ? { verbs: r.verbs } : null;

      return {
        id: uuidv4(),
        he_plain: hePlain,
        he_niqqud: heNiq,
        translit,
        ru,
        row_hash: rowHash,
        meta_json: meta ? JSON.stringify(meta) : null,
        order_index: idx,
      };
    });

      const created = await createTextWithSentences({
      id: textId,
      textKey,
      title,
      level,
      tagsJson,
      sourceText,
      sourceMetaJson,
      ttsProfileJson,
      tableModelMetaJson,

      // Week9 dashboard meta
      source,
      topic,
      isPinned,
      pinOrder,

      rows,
    });

    res.json({ ok: true, text: created });
  } catch (e) {
    // уникальность text_key: если такой уже есть — возвращаем понятный код
    const msg = String(e && e.message ? e.message : e);
    const msgLc = msg.toLowerCase();
	if (msg.includes("ux_texts_text_key") || (msgLc.includes("text_key") && (msgLc.includes("unique") || msgLc.includes("duplicate")))) {
      return res.status(409).json({ error: "DUPLICATE_TEXT_KEY" });
    }
    console.error("POST /api/library/texts error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// PUT /api/library/texts/:id — update existing text (Saved-update)
app.put("/api/library/texts/:id", gone410, express.json({ limit: "2mb" }), async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const textId = String(req.params.id || "").trim();
    if (!textId) return res.status(400).json({ error: "BAD_REQUEST" });

    // Must exist
    const existing = await getTextById(textId);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

    const sourceText = String((req.body && req.body.sourceText) ? req.body.sourceText : "").trim();
    const rowsRaw = (req.body && Array.isArray(req.body.rows)) ? req.body.rows : null;

    if (!sourceText) return res.status(400).json({ error: "MISSING_SOURCE_TEXT" });
    if (!rowsRaw || rowsRaw.length < 1) return res.status(400).json({ error: "MISSING_ROWS" });

    // meta: if empty in request, keep existing (avoid wiping)
    const titleIn = (req.body && req.body.title != null) ? String(req.body.title).trim() : "";
    const levelIn = (req.body && req.body.level != null) ? String(req.body.level).trim() : "";
    const sourceIn = (req.body && req.body.source != null) ? String(req.body.source).trim() : "";
    const topicIn = (req.body && req.body.topic != null) ? String(req.body.topic).trim() : "";

    const title =
      titleIn ||
      (existing && existing.title ? String(existing.title) : "") ||
      guessTitle(sourceText);

    const level =
      (levelIn || (existing && existing.level ? String(existing.level) : "")).trim() || null;

    const source =
      (sourceIn || (existing && existing.source ? String(existing.source) : "")).trim() || null;

    const topic =
      (topicIn || (existing && existing.topic ? String(existing.topic) : "")).trim() || null;

    // tags: request tags -> else existing tags_json -> else []
    let tags = [];
    if (req.body && Array.isArray(req.body.tags)) {
      tags = req.body.tags;
    } else {
      try { tags = existing && existing.tags_json ? JSON.parse(String(existing.tags_json)) : []; }
      catch (_) { tags = []; }
    }
    const tagsJson = JSON.stringify(v3NormalizeTags(tags));

    // preserve ttsProfile/tableModelMeta if client didn't send them
    let ttsProfile = null;
    let tableModelMeta = null;

    if (req.body && ("ttsProfile" in req.body)) ttsProfile = req.body.ttsProfile;
    else {
      try { ttsProfile = existing && existing.tts_profile_json ? JSON.parse(String(existing.tts_profile_json)) : null; }
      catch (_) { ttsProfile = null; }
    }

    if (req.body && ("tableModelMeta" in req.body)) tableModelMeta = req.body.tableModelMeta;
    else {
      try { tableModelMeta = existing && existing.table_model_meta_json ? JSON.parse(String(existing.table_model_meta_json)) : null; }
      catch (_) { tableModelMeta = null; }
    }

    const ttsProfileJson = JSON.stringify(ttsProfile || null);
    const tableModelMetaJson = JSON.stringify(tableModelMeta || null);

    // For PUT update we keep the existing text_key to avoid UNIQUE collisions.
// Fork-as-new (POST) is the path that creates a new key.
const textKey = (existing && existing.text_key != null && String(existing.text_key).trim())
  ? String(existing.text_key).trim()
  : null;

    // normalize rows + stable row_hash (server-side truth)
    const rows = rowsRaw.map((r, idx) => {
      const he_plain = String((r && (r.he_plain || r.he)) ? (r.he_plain || r.he) : "").trim();
      const he_niqqud = String((r && r.he_niqqud) ? r.he_niqqud : "").trim();
      const translit = String((r && r.translit) ? r.translit : "").trim();
      const ru = String((r && r.ru) ? r.ru : "").trim();

      const hePlain = he_plain;
	const heNiq = he_niqqud;

	const row_hash = crypto
  .createHash("sha256")
  .update(JSON.stringify({ hePlain, heNiq, translit, ru }), "utf8")
  .digest("hex");


      let meta_json = null;
      if (r && r.meta_json != null) meta_json = String(r.meta_json);
      else if (r && typeof r === "object" && r.verbs) meta_json = JSON.stringify({ verbs: r.verbs });
      else meta_json = null;

      // IMPORTANT: your sentences insert expects explicit id
      const sId = (r && r.id) ? String(r.id) : uuidv4();

      return {
        id: sId,
        order_index: idx,
        he_plain,
        he_niqqud,
        translit,
        ru,
        row_hash,
        meta_json,
      };
    });

    const sourceMetaJson = JSON.stringify({
      updatedFrom: "ui-save",
      updatedAt: new Date().toISOString(),
    });

    const updatedText = await updateTextWithSentences({
      id: textId,                 // keep repo style (like createTextWithSentences)
      textKey,
      title,
      level,
      tagsJson,
      sourceText,
      sourceMetaJson,
      ttsProfileJson,
      tableModelMetaJson,
      source,
      topic,
      rows,
    });

    return res.json({ ok: true, text: updatedText });
  } catch (e) {
    if (e && (e.code === "NOT_FOUND" || String(e.message || "").includes("NOT_FOUND"))) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const msg = String(e && (e.message || e) ? (e.message || e) : "");
    const msgLc = msg.toLowerCase();
	if (msg.includes("ux_texts_text_key") || msg.includes("texts.text_key") || (msgLc.includes("text_key") && (msgLc.includes("unique") || msgLc.includes("duplicate")))) {
      return res.status(409).json({ error: "DUPLICATE_KEY" });
    }

    console.warn("PUT /api/library/texts/:id failed", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// Get text meta
app.get("/api/library/texts/:id", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const text = await getTextById(req.params.id);
    if (!text) return res.status(404).json({ error: "NOT_FOUND" });

    res.json({ ok: true, text });
  } catch (e) {
    console.error("GET /api/library/texts/:id error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// Get sentences
app.get("/api/library/texts/:id/sentences", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const text = await getTextById(req.params.id);
    if (!text) return res.status(404).json({ error: "TEXT_NOT_FOUND" });

    const sentences = await getSentencesByTextId(req.params.id);

    // Enrich each sentence with translit_ru (Russian phonetic) computed from he_niqqud.
    // Kept out of the DB to avoid a migration; deterministic and fast (pure JS, no I/O).
    const { transliterateWithProfile } = require("./db/premium/translit");
    const enriched = sentences.map((s) => {
      const heNiqqud = s.he_niqqud || "";
      let edited = {};
      try { edited = JSON.parse(s.edit_meta_json || "{}").edited || {}; } catch (_) {}

      // Recompute translits from he_niqqud (picks up schema fixes like DAGESH_CHAZAQ).
      // Skip recompute for fields the user has manually edited — respect their value.
      const computedTranslit   = heNiqqud ? (transliterateWithProfile(heNiqqud, "sbl")         || "") : "";
      const computedTranslitRu = heNiqqud ? (transliterateWithProfile(heNiqqud, "ru-phonetic") || "") : "";

      return Object.assign({}, s, {
        translit:    edited.translit    ? (s.translit    || "") : (computedTranslit    || s.translit    || ""),
        translit_ru: edited.translit_ru ? (s.translit_ru || "") : (computedTranslitRu || s.translit_ru || ""),
      });
    });

    res.json({ ok: true, textId: req.params.id, sentences: enriched });
  } catch (e) {
    console.error("GET /api/library/texts/:id/sentences error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ────────────────────────────────────────────────────────
// TABLE EDITING (018_sentence_edits)
// ────────────────────────────────────────────────────────

const {
  patchSentenceFields,
  resetSentenceEdit,
  deleteSentence,
  addSentence,
  reorderSentences,
} = require("./db/libraryRepo");

// PATCH /api/library/texts/:id/sentences/reorder  ← MUST be before /:sid route
app.patch("/api/library/texts/:id/sentences/reorder", gone410, express.json({ limit: "64kb" }), async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;
    const { order } = req.body || {};
    if (!Array.isArray(order)) return res.status(400).json({ error: "BAD_INPUT", message: "body.order must be array" });
    const result = await reorderSentences(req.params.id, order);
    res.json(result);
  } catch (e) {
    if (e.code === "BAD_INPUT") return res.status(400).json({ error: e.message });
    console.error("PATCH sentences/reorder error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// PATCH /api/library/texts/:id/sentences/:sid — edit cell fields
app.patch("/api/library/texts/:id/sentences/:sid", gone410, express.json({ limit: "32kb" }), async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;
    const { fields } = req.body || {};
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      return res.status(400).json({ error: "BAD_INPUT", message: "body.fields must be an object" });
    }
    const updated = await patchSentenceFields(req.params.id, req.params.sid, fields);
    res.json({ ok: true, sentence: updated });
  } catch (e) {
    if (e.code === "NOT_FOUND") return res.status(404).json({ error: e.message });
    if (e.code === "BAD_INPUT") return res.status(400).json({ error: e.message });
    console.error("PATCH sentence error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// POST /api/library/texts/:id/sentences/:sid/reset — restore original pipeline values
app.post("/api/library/texts/:id/sentences/:sid/reset", gone410, express.json({ limit: "8kb" }), async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;
    const fields = (req.body && Array.isArray(req.body.fields)) ? req.body.fields : [];
    const updated = await resetSentenceEdit(req.params.id, req.params.sid, fields);
    res.json({ ok: true, sentence: updated });
  } catch (e) {
    if (e.code === "NOT_FOUND") return res.status(404).json({ error: e.message });
    console.error("POST sentence/reset error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// DELETE /api/library/texts/:id/sentences/:sid
app.delete("/api/library/texts/:id/sentences/:sid", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;
    const result = await deleteSentence(req.params.id, req.params.sid);
    res.json(result);
  } catch (e) {
    // Treat already-deleted as success: memory is stale, let frontend sync.
    if (e.code === "NOT_FOUND") return res.json({ ok: true, alreadyGone: true });
    console.error("DELETE sentence error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// POST /api/library/texts/:id/sentences — add new sentence
app.post("/api/library/texts/:id/sentences", gone410, express.json({ limit: "32kb" }), async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;
    const body = req.body || {};
    const sentence = await addSentence(req.params.id, {
      afterOrderIndex: body.afterOrderIndex != null ? Number(body.afterOrderIndex) : null,
      afterSentenceId: body.afterSentenceId != null ? String(body.afterSentenceId) : null,
      he:         String(body.he         || ""),
      ru:         String(body.ru         || ""),
      translit:   String(body.translit   || ""),
      translit_ru:String(body.translit_ru|| ""),
      he_niqqud:  String(body.he_niqqud  || ""),
    });
    res.status(201).json({ ok: true, sentence });
  } catch (e) {
    if (e.code === "NOT_FOUND") return res.status(404).json({ error: e.message });
    console.error("POST sentence error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// (PATCH /sentences/reorder is defined earlier, before the /:sid catch-all route)

// ────────────────────────────────────────────────────────

// --------------------------------------------------------
// Notes per sentence (W10-NOTES-01)
// --------------------------------------------------------
const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(s) {
  return _UUID_RE.test(String(s || ""));
}

function normalizeIsoZ(x) {
  if (!x) return null;
  const s = String(x);
  // already ISO-ish
  if (s.includes("T")) return s;
  // sqlite CURRENT_TIMESTAMP: "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SSZ"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
    return s.replace(" ", "T") + "Z";
  }
  return s;
}

function normalizeNoteDto(r) {
  if (!r) return null;
  return {
    sentenceId: String(r.sentenceId ?? r.sentence_id ?? ""),
    note: String(r.note ?? ""),
    updatedAt: normalizeIsoZ(r.updatedAt ?? r.updated_at ?? null),
  };
}

// --------------------------------------------------------
// Wave D: shared search token parser (server-side)
// Supports: #tag, tag:xxx, topic:xxx
// --------------------------------------------------------
function v3SearchStripQuotes(s) {
  const x = String(s || "").trim();
  if (!x) return "";
  if ((x.startsWith('"') && x.endsWith('"')) || (x.startsWith("'") && x.endsWith("'"))) {
    return x.slice(1, -1).trim();
  }
  return x;
}

function v3SearchParseQueryTokens(qRaw) {
  const raw = String(qRaw || "").trim();
  const toks = raw ? raw.split(/\s+/).filter(Boolean) : [];

  const textTokens = [];
  const tagTokens = [];
  let topicNeedle = null;

  for (const tok0 of toks) {
    const tok = String(tok0 || "").trim();
    if (!tok) continue;

    // #tag
    if (tok[0] === "#" && tok.length > 1) {
      const t = v3SearchStripQuotes(tok.slice(1));
      if (t) tagTokens.push(t);
      continue;
    }

    const low = tok.toLowerCase();

    // tag:xxx
    if (low.startsWith("tag:") && tok.length > 4) {
      const t = v3SearchStripQuotes(tok.slice(4));
      if (t) tagTokens.push(t);
      continue;
    }

    // topic:xxx
    if (low.startsWith("topic:") && tok.length > 6) {
      const t = v3SearchStripQuotes(tok.slice(6));
      if (t) topicNeedle = t;
      continue;
    }

    // otherwise it is a text token
    textTokens.push(tok);
  }

  // de-dup tags, keep order
  const seen = new Set();
  const tags = [];
  for (const t of tagTokens) {
    const k = String(t || "").trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // strip leading # defensively
    tags.push(k[0] === "#" ? k.slice(1) : k);
    if (tags.length >= 25) break;
  }

  return {
    qText: textTokens.join(" ").trim(),
    tagTokens: tags,
    topicNeedle: topicNeedle ? String(topicNeedle).trim() : null,
  };
}

function v3SearchNormTagMode(x) {
  const m = String(x || "all").trim().toLowerCase();
  return (m === "any") ? "any" : "all";
}

function v3ClampInt(n, lo, hi, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  const z = Math.trunc(v);
  if (z < lo) return lo;
  if (z > hi) return hi;
  return z;
}

function v3SplitQueryParts(qRaw) {
  const s = String(qRaw || "").trim();
  if (!s) return [];
  // Split by whitespace but keep quoted segments together: "..." or bare token
  const parts = s.match(/"[^"]*"|\S+/g) || [];
  const out = [];
  for (const p of parts) {
    let t = String(p || "").trim();
    if (!t) continue;
    if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
      t = t.slice(1, -1).trim();
    }
    if (!t) continue;
    out.push(t);
    if (out.length >= 64) break; // defensive
  }
  return out;
}

function v3ParseNotesSearchQuery(qRaw) {
  const parts = v3SplitQueryParts(qRaw);
  const tagTokens = [];
  let topicNeedle = null;
  let notesOnly = false;
  const textParts = [];

  for (let i = 0; i < parts.length; i++) {
    const tok0 = parts[i];
    const tok = String(tok0 || "").trim();
    if (!tok) continue;

    const lc = tok.toLowerCase();

    // Notes-only markers (support UI token experiments)
    if (lc === "in:notes" || lc === "in:note" || lc === "notes-only" || lc === "notesonly" || lc === "notes") {
      notesOnly = true;
      continue;
    }
    if (lc === "note:" || lc === "notes:" || lc.startsWith("note:") || lc.startsWith("notes:")) {
      notesOnly = true;
      continue;
    }

    // tags
    if (tok[0] === "#" && tok.length > 1) {
  tagTokens.push(tok); // сохраняем # как в UI
  continue;
}
    if (lc.startsWith("tag:") || lc.startsWith("tags:")) {
      let v = tok.slice(tok.indexOf(":") + 1).trim();
      if (!v && i + 1 < parts.length) v = parts[++i];
      if (v) {
  v = String(v || "").trim();
  if (v && v[0] !== "#") v = "#" + v;  // приводим к UI формату
  if (v) tagTokens.push(v);
}
      continue;
    }

    // topic
    if (lc.startsWith("topic:")) {
      let v = tok.slice(tok.indexOf(":") + 1).trim();
      if (!v && i + 1 < parts.length) v = parts[++i];
      if (v) topicNeedle = String(v || "").trim() || null;
      continue;
    }

    // ignore "in:texts" token if user toggles back in UI experiments
    if (lc === "in:texts" || lc === "texts") {
      continue;
    }

    textParts.push(tok);
  }

  return {
    qText: String(textParts.join(" ") || "").trim(),
    tagTokens: v3NormalizeTags(tagTokens),
    topicNeedle,
    notesOnly,
  };
}

// GET all notes for text
app.get("/api/library/texts/:id/notes", gone410, async (req, res) => {
  try {
	  if (!requireDbOr503(res)) return;
    const textId = String(req.params.id || "");
    if (!isUuid(textId)) return res.status(400).json({ error: "BAD_TEXT_ID" });

    const t = await getTextById(textId);
    if (!t) return res.status(404).json({ error: "TEXT_NOT_FOUND" });

    const rows = await listNotesByTextId(textId);
    const notes = (rows || []).map(normalizeNoteDto).filter((x) => x && x.sentenceId);

    return res.json({ ok: true, notes });
  } catch (e) {
    console.warn("GET notes failed", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// PUT upsert note for sentence (sentence must belong to text)
app.put("/api/library/texts/:id/notes/:sentenceId", gone410, async (req, res) => {
  try {
	  if (!requireDbOr503(res)) return;
    const textId = String(req.params.id || "");
    const sentenceId = String(req.params.sentenceId || "");
    if (!isUuid(textId)) return res.status(400).json({ error: "BAD_TEXT_ID" });
    if (!isUuid(sentenceId)) return res.status(400).json({ error: "BAD_SENTENCE_ID" });

    const t = await getTextById(textId);
    if (!t) return res.status(404).json({ error: "TEXT_NOT_FOUND" });

    const raw = req.body ? req.body.note : undefined;
    if (typeof raw !== "string") return res.status(400).json({ error: "BAD_NOTE" });

    const note = raw.trim();

    // предпочитаем не хранить пустые заметки: пусто => delete
    if (!note) {
      try {
        await deleteNote({ textId, sentenceId });
        await v3TrackEventSafe({
          eventType: "save_note",
          entityType: "note",
          entityId: sentenceId,
          textId,
          sentenceId,
          source: "api",
          payload: { action: "delete", via: "put-empty" },
        });
      } catch (e2) {
        // если sentence не в text => 404 обязателен
        if (e2 && (e2.code === "SENTENCE_NOT_IN_TEXT")) {
          return res.status(404).json({ error: "SENTENCE_NOT_IN_TEXT" });
        }
        // если просто "не было заметки" — считаем ok
      }
      return res.json({
  ok: true,
  deleted: true,
  note: { sentenceId, note: "", updatedAt: new Date().toISOString() }
});
    }

    if (note.length > 16000) return res.status(400).json({ error: "NOTE_TOO_LONG" });

    let saved = null;
    try {
      saved = await upsertNote({ textId, sentenceId, note });
      await v3TrackEventSafe({
        eventType: "save_note",
        entityType: "note",
        entityId: saved && saved.id ? saved.id : sentenceId,
        textId,
        sentenceId,
        noteId: saved && saved.id ? saved.id : null,
        source: "api",
        payload: { action: "upsert", length: String(note || "").trim().length },
      });
    } catch (e2) {
      if (e2 && (e2.code === "SENTENCE_NOT_IN_TEXT")) {
        return res.status(404).json({ error: "SENTENCE_NOT_IN_TEXT" });
      }
      throw e2;
    }

    return res.json({ ok: true, note: normalizeNoteDto(saved) });
  } catch (e) {
    console.warn("PUT note failed", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// DELETE note for sentence (sentence must belong to text)
app.delete("/api/library/texts/:id/notes/:sentenceId", gone410, async (req, res) => {
  try {
	  if (!requireDbOr503(res)) return;
    const textId = String(req.params.id || "");
    const sentenceId = String(req.params.sentenceId || "");
    if (!isUuid(textId)) return res.status(400).json({ error: "BAD_TEXT_ID" });
    if (!isUuid(sentenceId)) return res.status(400).json({ error: "BAD_SENTENCE_ID" });

    const t = await getTextById(textId);
    if (!t) return res.status(404).json({ error: "TEXT_NOT_FOUND" });

    try {
      await deleteNote({ textId, sentenceId });
      await v3TrackEventSafe({
        eventType: "save_note",
        entityType: "note",
        entityId: sentenceId,
        textId,
        sentenceId,
        source: "api",
        payload: { action: "delete", via: "delete" },
      });
    } catch (e2) {
      if (e2 && (e2.code === "SENTENCE_NOT_IN_TEXT")) {
        return res.status(404).json({ error: "SENTENCE_NOT_IN_TEXT" });
      }
      throw e2;
    }

    return res.json({
  ok: true,
  deleted: true,
  note: { sentenceId, note: "", updatedAt: new Date().toISOString() }
});
  } catch (e) {
    console.warn("DELETE note failed", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// --------------------------------------------------------
// Wave D (D2): Notes search API
// GET /api/notes/search
// --------------------------------------------------------
app.get("/api/notes/search", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const qRaw = String((req.query.q ?? req.query.search ?? "") || "").trim();
    const includeArchived = String(req.query.includeArchived || "0") === "1";

    // notesOnly: explicit flag OR token inside q
    const notesOnlyParam = String(req.query.notesOnly || "0") === "1";
    const parsed = v3ParseNotesSearchQuery(qRaw);
    const notesOnly = notesOnlyParam || !!parsed.notesOnly;

    // hard limits (security/UX)
    if (qRaw.length > 128) {
      return res.status(400).json({ error: "QUERY_TOO_LONG", maxLen: 128 });
    }

    // limit/offset
    const lim0 = Number(req.query.limit == null ? 50 : req.query.limit);
    const off0 = Number(req.query.offset == null ? 0 : req.query.offset);

    const limit = Number.isFinite(lim0) ? Math.max(0, Math.min(200, Math.trunc(lim0))) : 50;
    const offset = Number.isFinite(off0) ? Math.max(0, Math.trunc(off0)) : 0;

    if (offset > 5000) {
      return res.status(400).json({ error: "OFFSET_TOO_LARGE", maxOffset: 5000 });
    }

    // level (optional)
    const levelRaw = (req.query.level == null) ? null : (String(req.query.level).trim() || null);
    const level = levelRaw ? v3NormalizeLevel(levelRaw) : null;
    if (levelRaw && !level) {
      return res.status(400).json({ error: "BAD_LEVEL" });
    }

    // tags: from query string (?tags=tag1,tag2 OR JSON array) + from q tokens (#tag / tag:)
    let tagsIn = [];
    if (Object.prototype.hasOwnProperty.call(req.query, "tags") && req.query.tags != null) {
      const raw = req.query.tags;
      if (Array.isArray(raw)) {
        tagsIn = raw;
      } else {
        const s = String(raw || "").trim();
        if (s) {
          // try JSON first, else treat as CSV/space
          let parsedTags = null;
          if (s[0] === "[") {
            try {
              const x = JSON.parse(s);
              if (Array.isArray(x)) parsedTags = x;
            } catch (_) {}
          }
          tagsIn = parsedTags || s.split(/[\s,]+/g);
        }
      }
    }

    const tagItems = [];
    for (const t of (Array.isArray(tagsIn) ? tagsIn : [])) tagItems.push(t);
    for (const t of (Array.isArray(parsed.tagTokens) ? parsed.tagTokens : [])) tagItems.push(t);
    const tagTokens = v3NormalizeTags(tagItems);

    // tagMode
    const tagModeRaw = String(req.query.tagMode || "all").toLowerCase();
    const tagMode = (tagModeRaw === "any") ? "any" : "all";

    // topic: explicit param or token topic:
    const topicNeedle =
      (req.query.topic != null && String(req.query.topic).trim())
        ? String(req.query.topic).trim()
        : (parsed.topicNeedle ? String(parsed.topicNeedle).trim() : null);

    // Free-text needle for note search: remove filters/tokens
    const qText = String(parsed.qText || "").trim();

    // Guards: never scan all notes
    if (!qText) {
      const query = {
        q: qRaw,
        includeNotes: true,
        notesOnly,
        includeArchived,
        level,
        tagMode,
        limit,
        offset,
      };
      return res.json({ ok: true, query, results: [], more: false });
    }

    // Stronger guard only in notesOnly mode (per Wave D spec)
    if (notesOnly && qText.length < 2) {
      const query = {
        q: qRaw,
        includeNotes: true,
        notesOnly,
        includeArchived,
        level,
        tagMode,
        limit,
        offset,
      };
      return res.json({ ok: true, query, results: [], more: false });
    }

    // Fetch (limit+1 for "more")
    const rows = await searchNotes({
      q: qText,
      includeArchived,
      level,
      tagTokens,
      tagMode,
      topicNeedle,
      limit: Math.min(200, limit + 1),
      offset,
    });

    const more = Array.isArray(rows) && rows.length > limit;
    const slice = more ? rows.slice(0, limit) : (rows || []);

    // PATCH-05: Include snippet and highlights from search results
    const results = slice.map((r) => ({
      textId: String(r.textId || ""),
      sentenceId: String(r.sentenceId || ""),
      orderIndex: (r.orderIndex == null ? null : Number(r.orderIndex)),

      note: String(r.note ?? ""),
      noteUpdatedAt: normalizeIsoZ(r.noteUpdatedAt ?? r.note_updated_at ?? null),

      sentenceText: String(r.sentenceText ?? ""),

      title: String(r.title ?? ""),
      level: (r.level == null ? null : String(r.level)),
      topic: (r.topic == null ? null : String(r.topic)),
      source: (r.source == null ? null : String(r.source)),

      tags: Array.isArray(r.tags) ? r.tags : [],

      // PATCH-05: Snippet and highlights
      snippet: r.snippet || null,
      snippetField: r.snippetField || null,
      highlights: r.highlights || {},
    }));

    const query = {
      q: qRaw,
      includeNotes: true,
      notesOnly,
      includeArchived,
      level,
      tagMode,
      limit,
      offset,
    };

    await v3TrackEventSafe({
      eventType: "search_query",
      entityType: "search",
      source: "api",
      payload: {
        scope: "notes",
        qLength: qRaw.length,
        includeArchived,
        level,
        limit,
        offset,
        resultsCount: results.length,
      },
    });

    return res.json({ ok: true, query, results, more });
  } catch (e) {
    console.error("GET /api/notes/search error:", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// --------------------------------------------------------
// Wave D (Premium PRO): Rows search (E1.2) — API
// --------------------------------------------------------
app.get("/api/sentences/search", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const qRaw = String(req.query.q || "").trim();
    if (qRaw.length > 128) return res.status(400).json({ error: "Q_TOO_LONG" });

    const includeArchived = String(req.query.includeArchived || "0") === "1";
    const level = (req.query.level == null) ? null : (String(req.query.level).trim() || null);

    const limit = v3ClampInt(req.query.limit, 1, 200, 50);
    const offset = v3ClampInt(req.query.offset, 0, 5000, 0);
    const tagMode = v3SearchNormTagMode(req.query.tagMode || "all");

    // Parse tokens inside q: #tag / topic:
    const parsed = v3SearchParseQueryTokens(qRaw);
    const qText = (parsed && parsed.qText) ? String(parsed.qText) : "";
    const tagTokens = (parsed && Array.isArray(parsed.tagTokens)) ? parsed.tagTokens : [];
    const topicNeedle = (parsed && parsed.topicNeedle) ? String(parsed.topicNeedle) : null;

    // Guard: do not scan all rows
    if (!qText || qText.trim().length < 2) {
      return res.json({
        ok: true,
        query: { q: qRaw, includeArchived, level, tagMode, limit, offset },
        results: [],
        more: false,
      });
    }

    const rows = await searchSentences({
      q: qText,
      includeArchived,
      level,
      tagTokens,
      tagMode,
      topicNeedle,
      limit,
      offset,
    });

    // Normalize DTO for API (do not leak tags_json etc unless needed)
    // PATCH-05: Include snippet and highlights from search results
    const results = (rows || []).map((r) => ({
      textId: String(r.textId || ""),
      sentenceId: String(r.sentenceId || ""),
      orderIndex: Number.isFinite(Number(r.orderIndex)) ? Number(r.orderIndex) : null,

      he: String(r.he_plain || ""),
      he_niqqud: String(r.he_niqqud || ""),
      translit: String(r.translit || ""),
      ru: String(r.ru || ""),

      title: String(r.title || ""),
      level: (r.level == null) ? null : String(r.level),
      topic: (r.topic == null) ? null : String(r.topic),
      source: (r.source == null) ? null : String(r.source),
      tags: Array.isArray(r.tags) ? r.tags : [],

      // PATCH-05: Snippet and highlights
      snippet: r.snippet || null,
      snippetField: r.snippetField || null,
      highlights: r.highlights || {},
    }));

    const more = results.length === limit;

    await v3TrackEventSafe({
      eventType: "search_query",
      entityType: "search",
      source: "api",
      payload: {
        scope: "sentences",
        qLength: qRaw.length,
        includeArchived,
        level,
        limit,
        offset,
        resultsCount: results.length,
      },
    });

    return res.json({
      ok: true,
      query: { q: qRaw, includeArchived, level, tagMode, limit, offset },
      results,
      more,
    });
  } catch (e) {
    console.error("GET /api/sentences/search error:", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// --------------------------------------------------------
// PATCH-03: Navigation resolver API
// GET /api/nav/resolve?type=<type>&id=<id>
// Resolves navigation target to entity context (textId, sentenceId, etc.)
// --------------------------------------------------------
app.get("/api/nav/resolve", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const type = String(req.query.type || "").trim().toLowerCase();
    const id = String(req.query.id || "").trim();

    if (!type || !id) {
      return res.status(400).json({ ok: false, error: "MISSING_PARAMS", message: "type and id are required" });
    }

    // Validate type
    const VALID_TYPES = ["text", "sentence", "note"];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ ok: false, error: "UNSUPPORTED_TYPE", message: `Unsupported type: ${type}` });
    }

    // Resolve based on type
    if (type === "text") {
      const text = await getTextById(id);
      if (!text) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND", message: "Text not found" });
      }
      return res.json({
        ok: true,
        type: "text",
        id: text.id,
        textId: text.id,
        title: text.title || null,
      });
    }

    if (type === "sentence") {
      const sentence = await getSentenceById(id);
      if (!sentence) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND", message: "Sentence not found" });
      }
      return res.json({
        ok: true,
        type: "sentence",
        id: sentence.sentenceId,
        textId: sentence.textId,
        orderIndex: sentence.orderIndex,
        hePlain: sentence.hePlain,
      });
    }

    if (type === "note") {
      const note = await getNoteWithContext(id);
      if (!note) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND", message: "Note not found" });
      }
      return res.json({
        ok: true,
        type: "note",
        id: note.noteId,
        textId: note.textId,
        sentenceId: note.sentenceId,
      });
    }

    // Should not reach here
    return res.status(400).json({ ok: false, error: "UNSUPPORTED_TYPE" });
  } catch (e) {
    console.error("GET /api/nav/resolve error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// --------------------------------------------------------
// PATCH-03: SRS v1 API
// --------------------------------------------------------
app.get("/api/srs/templates", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;
    const includeInactive = String(req.query.includeInactive || "") === "1";
    const templates = await listTemplates({ includeInactive });
    return res.json({ ok: true, templates });
  } catch (e) {
    console.error("GET /api/srs/templates error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.get("/api/srs/cards", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const cardId = String(req.query.cardId || "").trim();
    const sentenceId = String(req.query.sentenceId || "").trim();
    const templateCode = String(req.query.templateCode || "").trim();
    if (!cardId && !sentenceId) {
      return res.status(400).json({ ok: false, error: "BAD_CARD_QUERY" });
    }

    const snapshot = cardId
      ? await getCardSnapshotById(cardId)
      : await getSentenceCardSnapshot(sentenceId, { templateCode });
    if (!snapshot) {
      return res.status(404).json({ ok: false, error: cardId ? "CARD_NOT_FOUND" : "SENTENCE_NOT_FOUND" });
    }

    return res.json({ ok: true, sentence: snapshot.sentence, card: snapshot.card });
  } catch (e) {
    if (String(e && e.message || "") === "BAD_TEMPLATE") {
      return res.status(400).json({ ok: false, error: "BAD_TEMPLATE" });
    }
    console.error("GET /api/srs/cards error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/api/srs/cards", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const sentenceId = String(req.body && req.body.sentenceId || "").trim();
    const templateCode = String(req.body && req.body.templateCode || "").trim();
    if (!sentenceId) {
      return res.status(400).json({ ok: false, error: "BAD_SENTENCE_ID" });
    }

    const snapshot = await createSentenceCard({ sentenceId, templateCode });
    return res.json({ ok: true, sentence: snapshot.sentence, card: snapshot.card });
  } catch (e) {
    const msg = String(e && e.message || "");
    if (msg === "SENTENCE_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: "SENTENCE_NOT_FOUND" });
    }
    if (msg === "BAD_TEMPLATE") {
      return res.status(400).json({ ok: false, error: "BAD_TEMPLATE" });
    }
    console.error("POST /api/srs/cards error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/api/srs/cards/generate", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const sentenceId = String(req.body && req.body.sentenceId || "").trim();
    const templateCodes = Array.isArray(req.body && req.body.templateCodes) ? req.body.templateCodes : [];
    if (!sentenceId) {
      return res.status(400).json({ ok: false, error: "BAD_SENTENCE_ID" });
    }

    const cards = await generateSentenceCards({ sentenceId, templateCodes });
    return res.json({
      ok: true,
      cards: cards.map((item) => ({ sentence: item.sentence, card: item.card })),
    });
  } catch (e) {
    const msg = String(e && e.message || "");
    if (msg === "SENTENCE_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: "SENTENCE_NOT_FOUND" });
    }
    if (msg === "BAD_TEMPLATE") {
      return res.status(400).json({ ok: false, error: "BAD_TEMPLATE" });
    }
    console.error("POST /api/srs/cards/generate error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/api/srs/review", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const cardId = String(req.body && req.body.cardId || "").trim();
    const sentenceId = String(req.body && req.body.sentenceId || "").trim();
    const templateCode = String(req.body && req.body.templateCode || "").trim();
    const rating = Number(req.body && req.body.rating);
    const reviewTimeMs = req.body && req.body.reviewTimeMs;

    if (!cardId && !sentenceId) {
      return res.status(400).json({ ok: false, error: "BAD_SENTENCE_ID" });
    }
    if (![1, 2, 3, 4].includes(rating)) {
      return res.status(400).json({ ok: false, error: "BAD_RATING" });
    }

    const snapshot = await reviewSentenceCard({ cardId, sentenceId, templateCode, rating, reviewTimeMs });
    await v3TrackEventSafe({
      eventType: "srs_review",
      entityType: "srs_card",
      entityId: snapshot && snapshot.card ? snapshot.card.id : null,
      textId: snapshot && snapshot.sentence ? snapshot.sentence.textId : null,
      sentenceId: snapshot && snapshot.sentence ? snapshot.sentence.sentenceId : null,
      cardId: snapshot && snapshot.card ? snapshot.card.id : null,
      source: "api",
      payload: {
        rating,
        reviewTimeMs: reviewTimeMs == null ? null : Number(reviewTimeMs) || 0,
        templateCode: snapshot && snapshot.card && snapshot.card.template ? snapshot.card.template.code : templateCode || null,
        state: snapshot && snapshot.card ? snapshot.card.state : null,
        intervalDays: snapshot && snapshot.card ? Number(snapshot.card.intervalDays || 0) : null,
      },
    });
    return res.json({ ok: true, sentence: snapshot.sentence, card: snapshot.card });
  } catch (e) {
    const msg = String(e && e.message || "");
    if (msg === "SENTENCE_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: "SENTENCE_NOT_FOUND" });
    }
    if (msg === "CARD_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: "CARD_NOT_FOUND" });
    }
    if (msg === "BAD_RATING") {
      return res.status(400).json({ ok: false, error: "BAD_RATING" });
    }
    if (msg === "BAD_TEMPLATE") {
      return res.status(400).json({ ok: false, error: "BAD_TEMPLATE" });
    }
    console.error("POST /api/srs/review error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.get("/api/srs/cards/:id/trainer-view", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const cardId = String(req.params.id || "").trim();
    const mode = String(req.query.mode || "reveal").trim().toLowerCase();
    if (!cardId) return res.status(400).json({ ok: false, error: "BAD_CARD_ID" });
    if (!["reveal", "typing", "listening", "cloze"].includes(mode)) {
      return res.status(400).json({ ok: false, error: "BAD_TRAINER_MODE" });
    }

    const snapshot = await getCardSnapshotById(cardId);
    if (!snapshot || !snapshot.card) {
      return res.status(404).json({ ok: false, error: "CARD_NOT_FOUND" });
    }

    const trainer = buildTrainerPayload(snapshot, mode);
    return res.json({ ok: true, sentence: snapshot.sentence, card: snapshot.card, trainer });
  } catch (e) {
    console.error("GET /api/srs/cards/:id/trainer-view error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/api/srs/attempts/check", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const cardId = String(req.body && req.body.cardId || "").trim();
    const sessionId = String(req.body && req.body.sessionId || "").trim();
    const attemptType = String(req.body && req.body.attemptType || "").trim().toLowerCase();
    const answer = String(req.body && req.body.answer || "");
    const latencyMs = req.body && req.body.latencyMs;

    if (!cardId) return res.status(400).json({ ok: false, error: "BAD_CARD_ID" });
    if (!["typing", "listening", "cloze"].includes(attemptType)) {
      return res.status(400).json({ ok: false, error: "BAD_ATTEMPT_TYPE" });
    }
    if (!answer.trim()) {
      return res.status(400).json({ ok: false, error: "BAD_ATTEMPT_ANSWER" });
    }

    const result = await checkAttempt({
      sessionId: sessionId || null,
      cardId,
      attemptType,
      answer,
      latencyMs,
    });
    await v3TrackEventSafe({
      eventType: "trainer_attempt",
      entityType: "srs_card",
      entityId: result && result.cardId ? result.cardId : cardId,
      sessionId: sessionId || null,
      cardId: result && result.cardId ? result.cardId : cardId,
      source: "api",
      payload: {
        attemptType,
        isCorrect: !!(result && result.isCorrect),
        latencyMs: latencyMs == null ? null : Number(latencyMs) || 0,
        templateCode: result && result.trainer ? result.trainer.templateCode : null,
      },
    });
    return res.json(result);
  } catch (e) {
    const msg = String(e && e.message || "");
    if (msg === "CARD_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: "CARD_NOT_FOUND" });
    }
    if (msg === "BAD_ATTEMPT_TYPE") {
      return res.status(400).json({ ok: false, error: "BAD_ATTEMPT_TYPE" });
    }
    if (msg === "BAD_ATTEMPT_ANSWER") {
      return res.status(400).json({ ok: false, error: "BAD_ATTEMPT_ANSWER" });
    }
    console.error("POST /api/srs/attempts/check error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.get("/api/srs/today", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const limit = v3ClampInt(req.query.limit, 1, 200, 25);
    const templateCode = String(req.query.templateCode || "").trim();
    const cards = await listTodayCards({ limit, templateCode });
    return res.json({ ok: true, limit, templateCode: templateCode || null, cards });
  } catch (e) {
    console.error("GET /api/srs/today error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.get("/api/srs/today/summary", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const limit = v3ClampInt(req.query.limit, 1, 500, 200);
    const templateCode = String(req.query.templateCode || "").trim();
    const summary = await getTodaySummary({ limit, templateCode });
    return res.json({ ok: true, summary, limit, templateCode: templateCode || null });
  } catch (e) {
    console.error("GET /api/srs/today/summary error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/api/srs/sessions", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const limit = v3ClampInt(req.body && req.body.limit, 1, 200, 50);
    const source = String(req.body && req.body.source || "ui").trim().slice(0, 32) || "ui";
    const mode = String(req.body && req.body.mode || "reveal").trim().slice(0, 24) || "reveal";
    const templateCode = String(req.body && req.body.templateCode || "").trim();
    const session = await createTodaySession({ limit, source, mode, templateCode });
    const next = await getSessionNext(session.id);
    await v3TrackEventSafe({
      eventType: "srs_session_started",
      entityType: "srs_session",
      entityId: next && next.session ? next.session.id : session.id,
      sessionId: next && next.session ? next.session.id : session.id,
      source: "api",
      payload: {
        mode,
        templateCode: templateCode || null,
        cardsTotal: next && next.session ? Number(next.session.cardsTotal || 0) : Number(session.cardsTotal || 0),
      },
    });
    return res.json({
      ok: true,
      session: next.session,
      done: next.done,
      current: next.current,
      progress: next.progress,
      templateCode: templateCode || null,
    });
  } catch (e) {
    console.error("POST /api/srs/sessions error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.get("/api/srs/sessions/:id", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const sessionId = String(req.params.id || "").trim();
    if (!sessionId) return res.status(400).json({ ok: false, error: "BAD_SESSION_ID" });

    const session = await getSessionById(sessionId);
    if (!session) return res.status(404).json({ ok: false, error: "SESSION_NOT_FOUND" });

    return res.json({ ok: true, session });
  } catch (e) {
    console.error("GET /api/srs/sessions/:id error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.get("/api/srs/sessions/:id/next", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const sessionId = String(req.params.id || "").trim();
    if (!sessionId) return res.status(400).json({ ok: false, error: "BAD_SESSION_ID" });

    const next = await getSessionNext(sessionId);
    return res.json({
      ok: true,
      session: next.session,
      done: next.done,
      current: next.current,
      progress: next.progress,
    });
  } catch (e) {
    if (String(e && e.message || "") === "SESSION_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: "SESSION_NOT_FOUND" });
    }
    console.error("GET /api/srs/sessions/:id/next error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/api/srs/sessions/:id/review", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const sessionId = String(req.params.id || "").trim();
    const rating = Number(req.body && req.body.rating);
    const reviewTimeMs = req.body && req.body.reviewTimeMs;

    if (!sessionId) return res.status(400).json({ ok: false, error: "BAD_SESSION_ID" });
    if (![1, 2, 3, 4].includes(rating)) {
      return res.status(400).json({ ok: false, error: "BAD_RATING" });
    }

    const result = await reviewSessionNext({ sessionId, rating, reviewTimeMs });
    await v3TrackEventSafe({
      eventType: "srs_review",
      entityType: "srs_card",
      entityId: result && result.reviewed && result.reviewed.card ? result.reviewed.card.id : null,
      sessionId,
      textId: result && result.reviewed && result.reviewed.sentence ? result.reviewed.sentence.textId : null,
      sentenceId: result && result.reviewed && result.reviewed.sentence ? result.reviewed.sentence.sentenceId : null,
      cardId: result && result.reviewed && result.reviewed.card ? result.reviewed.card.id : null,
      source: "api",
      payload: {
        rating,
        reviewTimeMs: reviewTimeMs == null ? null : Number(reviewTimeMs) || 0,
        templateCode: result && result.reviewed && result.reviewed.card && result.reviewed.card.template ? result.reviewed.card.template.code : null,
        state: result && result.reviewed && result.reviewed.card ? result.reviewed.card.state : null,
        intervalDays: result && result.reviewed && result.reviewed.card ? Number(result.reviewed.card.intervalDays || 0) : null,
      },
    });
    if (result && result.done && result.session) {
      await v3TrackEventSafe({
        eventType: "srs_session_finished",
        entityType: "srs_session",
        entityId: result.session.id,
        sessionId,
        source: "api",
        payload: {
          mode: result.session.mode || null,
          status: result.session.status || null,
          cardsTotal: Number(result.session.cardsTotal || 0),
          reviewsDone: Number(result.session.reviewsDone || 0),
          trigger: "review-complete",
        },
      });
    }
    return res.json({
      ok: true,
      session: result.session,
      reviewed: result.reviewed,
      done: result.done,
      next: result.next,
      progress: result.progress,
    });
  } catch (e) {
    const msg = String(e && e.message || "");
    if (msg === "SESSION_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: "SESSION_NOT_FOUND" });
    }
    if (msg === "SESSION_NOT_ACTIVE" || msg === "SESSION_EMPTY") {
      return res.status(409).json({ ok: false, error: msg });
    }
    if (msg === "BAD_RATING") {
      return res.status(400).json({ ok: false, error: "BAD_RATING" });
    }
    console.error("POST /api/srs/sessions/:id/review error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/api/srs/sessions/:id/finish", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const sessionId = String(req.params.id || "").trim();
    if (!sessionId) return res.status(400).json({ ok: false, error: "BAD_SESSION_ID" });

    const session = await finishSession(sessionId);
    await v3TrackEventSafe({
      eventType: "srs_session_finished",
      entityType: "srs_session",
      entityId: session && session.id ? session.id : sessionId,
      sessionId,
      source: "api",
      payload: {
        mode: session && session.mode ? session.mode : null,
        status: session && session.status ? session.status : null,
        cardsTotal: session ? Number(session.cardsTotal || 0) : null,
        reviewsDone: session ? Number(session.reviewsDone || 0) : null,
      },
    });
    return res.json({ ok: true, session });
  } catch (e) {
    if (String(e && e.message || "") === "SESSION_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: "SESSION_NOT_FOUND" });
    }
    console.error("POST /api/srs/sessions/:id/finish error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// --------------------------------------------------------
// Export DOCX from Library text (W10-EXPORT-DOCX-01)
// --------------------------------------------------------
app.get("/api/library/texts/:id/export/docx", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const textId = String(req.params.id || "");
    if (!isUuid(textId)) return res.status(400).json({ error: "BAD_TEXT_ID" });

    const t = await getTextById(textId);
    if (!t) return res.status(404).json({ error: "TEXT_NOT_FOUND" });

    const rows = await getExportRowsByTextId(textId);
    const baseUrl = getBaseUrl(req);
    const exportedAtIso = new Date().toISOString();

    // tags_json может быть JSON-массивом строк
    let tagsStr = "";
    if (t.tags_json) {
      const parsed = safeJsonParse(String(t.tags_json), null);
      if (Array.isArray(parsed)) tagsStr = parsed.filter(Boolean).join(", ");
      else tagsStr = String(t.tags_json || "");
    }

    const title = String(t.title || "");
    const level = String(t.level || "");
    const topic = String(t.topic || "");
    const source = String(t.source || "");

    // Provenance of the AI translation (provider/model/generatedAt) lives in
    // table_model_meta_json. Older rows may not have it.
    let meta = null;
    try {
      meta = t.table_model_meta_json ? JSON.parse(String(t.table_model_meta_json)) : null;
    } catch (_) { meta = null; }
    const metaProvider = meta && meta.provider ? String(meta.provider) : "";
    const metaModel    = meta && meta.model    ? String(meta.model)    : "";
    const metaGenAt    = meta && meta.generatedAt ? String(meta.generatedAt) : "";
    const providerLabelMap = {
      gcp: "GCP Cloud Translation v3",
      madlad: "MADLAD-400 (local)",
      gemini: "Google Gemini",
    };
    const providerHuman = metaProvider
      ? (providerLabelMap[metaProvider] || metaProvider)
      : "—";
    const providerLine = metaProvider
      ? `Provider: ${providerHuman}${metaModel ? ` · ${metaModel}` : ""}${metaGenAt ? ` · generated ${metaGenAt}` : ""}`
      : "Provider: неизвестен (старый перевод без метаданных)";

    function cell(text, align = AlignmentType.LEFT, bold = false) {
      return new TableCell({
        children: [
          new Paragraph({
            alignment: align,
            children: [new TextRun({ text: String(text ?? ""), bold })],
          }),
        ],
      });
    }

    function linkCell(url) {
      const u = String(url || "");
      if (!u) return cell("", AlignmentType.LEFT, false);

      // Prefer real hyperlink if available, else plain text URL
      if (typeof ExternalHyperlink === "function") {
        return new TableCell({
          children: [
            new Paragraph({
              children: [
                new ExternalHyperlink({
                  link: u,
                  children: [new TextRun({ text: u, style: "Hyperlink" })],
                }),
              ],
            }),
          ],
        });
      }
      return cell(u, AlignmentType.LEFT, false);
    }

       const header = new TableRow({
  children: [
    cell("#", AlignmentType.CENTER, true),
    cell("Hebrew", AlignmentType.CENTER, true),
    cell("Hebrew (niqqud)", AlignmentType.CENTER, true),
    cell("Translit", AlignmentType.CENTER, true),
    cell("Russian", AlignmentType.CENTER, true),
    cell("Notes", AlignmentType.CENTER, true),
    cell("Audio URL", AlignmentType.CENTER, true),
  ],
});

    const tableRows = [header];

    for (let i = 0; i < (rows || []).length; i++) {
      const r = rows[i] || {};
      const idx = i + 1;

const hePlain = String(r.he_plain || "");
const heNiq = String(r.he_niqqud || "");
const tr = String(r.translit || "");
const ru = String(r.ru || "");
const note = String(r.note || "");
const assetKey = String(r.audio_asset_key || "");
const audioUrl = assetKey
  ? ((baseUrl ? `${baseUrl}` : "") + `/api/audio/${encodeURIComponent(assetKey)}`)
  : "";

tableRows.push(
  new TableRow({
    children: [
      cell(String(idx), AlignmentType.CENTER, false),
      cell(hePlain),
      cell(heNiq),
      cell(tr),
      cell(ru),
      cell(note),
      linkCell(audioUrl),
    ],
  })
);
    }

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ children: [new TextRun({ text: `Title: ${title || "Untitled"}` })] }),
            new Paragraph({ children: [new TextRun({ text: `ExportedAt: ${exportedAtIso}` })] }),
            new Paragraph({ children: [new TextRun({ text: providerLine, bold: true })] }),
            new Paragraph({ children: [new TextRun({ text: `Level: ${level}` })] }),
            new Paragraph({ children: [new TextRun({ text: `Topic: ${topic}` })] }),
            new Paragraph({ children: [new TextRun({ text: `Source: ${source}` })] }),
            new Paragraph({ children: [new TextRun({ text: `Tags: ${tagsStr}` })] }),
            new Paragraph({ text: "" }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: tableRows,
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    const yyyyMmDd = exportedAtIso.slice(0, 10);
    const baseName = makeSafeFilenameBase(title, "text");
    const filename = `${baseName}_${yyyyMmDd}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    setAttachment(res, filename);
    return res.status(200).send(buffer);
  } catch (e) {
    console.error("GET /api/library/texts/:id/export/docx error:", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// POST /api/export/docx — stateless DOCX builder
// Body: { text: { title, level, topic, source, tags_json, table_model_meta_json },
//         sentences: [{ he_plain, he_niqqud, translit, ru, audio_asset_key }],
//         notes: [{ sentence_id, note }]  // optional, merged by sentence_id
//       }
// LOCAL_MODE clients call this with a payload built from OPFS, since the
// GET /api/library/texts/:id/export/docx variant requires server DB lookups.
app.post("/api/export/docx", requireSameOriginJson, rlExportDocx, async (req, res) => {
  try {
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const t = (body.text && typeof body.text === "object") ? body.text : {};
    const sentences = Array.isArray(body.sentences) ? body.sentences : [];
    const notesArr  = Array.isArray(body.notes) ? body.notes : [];
    const notesBySid = {};
    for (const n of notesArr) {
      if (n && n.sentence_id) notesBySid[String(n.sentence_id)] = String(n.note || "");
    }

    const baseUrl = getBaseUrl(req);
    const exportedAtIso = new Date().toISOString();

    let tagsStr = "";
    if (t.tags_json) {
      const parsed = safeJsonParse(String(t.tags_json), null);
      if (Array.isArray(parsed)) tagsStr = parsed.filter(Boolean).join(", ");
      else tagsStr = String(t.tags_json || "");
    }

    const title = String(t.title || "");
    const level = String(t.level || "");
    const topic = String(t.topic || "");
    const source = String(t.source || "");

    let meta = null;
    try {
      meta = t.table_model_meta_json ? JSON.parse(String(t.table_model_meta_json)) : null;
    } catch (_) { meta = null; }
    const metaProvider = meta && meta.provider ? String(meta.provider) : "";
    const metaModel    = meta && meta.model    ? String(meta.model)    : "";
    const metaGenAt    = meta && meta.generatedAt ? String(meta.generatedAt) : "";
    const providerLabelMap = {
      gcp: "GCP Cloud Translation v3",
      madlad: "MADLAD-400 (local)",
      gemini: "Google Gemini",
    };
    const providerHuman = metaProvider
      ? (providerLabelMap[metaProvider] || metaProvider)
      : "—";
    const providerLine = metaProvider
      ? `Provider: ${providerHuman}${metaModel ? ` · ${metaModel}` : ""}${metaGenAt ? ` · generated ${metaGenAt}` : ""}`
      : "Provider: неизвестен (старый перевод без метаданных)";

    function cell(text, align = AlignmentType.LEFT, bold = false) {
      return new TableCell({
        children: [
          new Paragraph({
            alignment: align,
            children: [new TextRun({ text: String(text ?? ""), bold })],
          }),
        ],
      });
    }
    function linkCell(url) {
      const u = String(url || "");
      if (!u) return cell("", AlignmentType.LEFT, false);
      if (typeof ExternalHyperlink === "function") {
        return new TableCell({
          children: [
            new Paragraph({
              children: [
                new ExternalHyperlink({
                  link: u,
                  children: [new TextRun({ text: u, style: "Hyperlink" })],
                }),
              ],
            }),
          ],
        });
      }
      return cell(u, AlignmentType.LEFT, false);
    }

    const header = new TableRow({
      children: [
        cell("#", AlignmentType.CENTER, true),
        cell("Hebrew", AlignmentType.CENTER, true),
        cell("Hebrew (niqqud)", AlignmentType.CENTER, true),
        cell("Translit", AlignmentType.CENTER, true),
        cell("Russian", AlignmentType.CENTER, true),
        cell("Notes", AlignmentType.CENTER, true),
        cell("Audio URL", AlignmentType.CENTER, true),
      ],
    });
    const tableRows = [header];

    for (let i = 0; i < sentences.length; i++) {
      const r = sentences[i] || {};
      const idx = i + 1;
      const sid = r.id || r.sentence_id || "";
      const noteText = sid && notesBySid[String(sid)] ? notesBySid[String(sid)] : String(r.note || "");
      const assetKey = String(r.audio_asset_key || r.audioAssetKey || "");
      const audioUrl = assetKey
        ? ((baseUrl ? `${baseUrl}` : "") + `/api/audio/${encodeURIComponent(assetKey)}`)
        : "";

      tableRows.push(
        new TableRow({
          children: [
            cell(String(idx), AlignmentType.CENTER, false),
            cell(String(r.he_plain || "")),
            cell(String(r.he_niqqud || "")),
            cell(String(r.translit || "")),
            cell(String(r.ru || "")),
            cell(noteText),
            linkCell(audioUrl),
          ],
        })
      );
    }

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ children: [new TextRun({ text: `Title: ${title || "Untitled"}` })] }),
            new Paragraph({ children: [new TextRun({ text: `ExportedAt: ${exportedAtIso}` })] }),
            new Paragraph({ children: [new TextRun({ text: providerLine, bold: true })] }),
            new Paragraph({ children: [new TextRun({ text: `Level: ${level}` })] }),
            new Paragraph({ children: [new TextRun({ text: `Topic: ${topic}` })] }),
            new Paragraph({ children: [new TextRun({ text: `Source: ${source}` })] }),
            new Paragraph({ children: [new TextRun({ text: `Tags: ${tagsStr}` })] }),
            new Paragraph({ text: "" }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: tableRows,
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const yyyyMmDd = exportedAtIso.slice(0, 10);
    const baseName = makeSafeFilenameBase(title, "text");
    const filename = `${baseName}_${yyyyMmDd}.docx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    setAttachment(res, filename);
    return res.status(200).send(buffer);
  } catch (e) {
    console.error("POST /api/export/docx error:", e);
    return res.status(500).json({ error: "INTERNAL_ERROR", details: e && e.message ? e.message : String(e) });
  }
});

// --------------------------------------------------------
// Export Anki CSV (W10-EXPORT-ANKI-01)
// --------------------------------------------------------
app.get("/api/library/texts/:id/export/anki", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const textId = String(req.params.id || "");
    if (!isUuid(textId)) return res.status(400).json({ error: "BAD_TEXT_ID" });

    const t = await getTextById(textId);
    if (!t) return res.status(404).json({ error: "TEXT_NOT_FOUND" });

    const rows = await getExportRowsByTextId(textId);

    const baseUrl = getBaseUrl(req);
    const exportedAt = new Date().toISOString().slice(0, 10);
    const baseName = makeSafeFilenameBase(t.title, "text");
    const filename = `${baseName}_${exportedAt}_anki.csv`;

    // UTF-8 BOM for Excel compatibility
    const header = ["he_niqqud", "translit", "ru", "note", "audio_url", "audio_asset_key"];
    let out = "\ufeff" + header.join(",") + "\n";

    for (const r of rows || []) {
      const he = String(r.he_niqqud || "");
      const translit = String(r.translit || "");
      const ru = String(r.ru || "");
      const note = String(r.note || "");
      const assetKey = String(r.audio_asset_key || "");

      const audioUrl = assetKey
        ? ((baseUrl ? `${baseUrl}` : "") + `/api/audio/${encodeURIComponent(assetKey)}`)
        : "";

      out += csvLine([he, translit, ru, note, audioUrl, assetKey]) + "\n";
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    setAttachment(res, filename);
    return res.status(200).send(out);
  } catch (e) {
    console.error("GET /api/library/texts/:id/export/anki error:", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// --------------------------------------------------------
// W11-ANKI-CONNECT-01 (One-click): server-side bridge to local AnkiConnect
// --------------------------------------------------------

app.get("/api/anki/health", async (req, res) => {
  try {
    // If AnkiConnect is reachable, this will return a number (e.g. 6).
    const v = await ankiInvoke("version", {});
    res.json({ ok: true, ankiConnect: { version: v } });
  } catch (e) {
    res.status(503).json({
      ok: false,
      error: "ANKI_CONNECT_UNAVAILABLE",
      details: (e && typeof e === "object" && e.details)
  ? Object.assign({ message: String(e.message || "") }, e.details)
  : { message: String((e && e.message) || e || "") },
      hint: "Start Anki desktop and ensure AnkiConnect add-on is installed and running on 127.0.0.1:8765.",
    });
  }
});

app.get("/api/anki/debug", async (req, res) => {
  try {
    if (!ankiIsLocalHttpRequest(req)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN_LOCAL_ONLY" });
    }

    const out = {
      ok: true,
      localOnly: true,
      env: {
        host: ANKI_CONNECT_HOST,
        port: ANKI_CONNECT_PORT,
        version: ANKI_CONNECT_VERSION,
        timeoutMs: ANKI_CONNECT_TIMEOUT_MS,
        retries: ANKI_CONNECT_RETRIES,
        retryDelayMs: ANKI_CONNECT_RETRY_DELAY_MS,
        origin: ANKI_CONNECT_ORIGIN || null,
        hasApiKey: !!ANKI_CONNECT_API_KEY,
      },
      checks: {},
    };

    try {
      out.checks.version = await ankiInvoke("version", {});
    } catch (e) {
      out.checks.versionError = {
        message: String((e && e.message) || e || ""),
        details: (e && e.details) ? e.details : null,
      };
    }

    try {
      const decks = await ankiInvoke("deckNames", {});
      const arr = Array.isArray(decks) ? decks : [];
      out.checks.deckNames = {
        total: arr.length,
        linguistPro: arr.filter((n) => /^LinguistPro/i.test(String(n || ""))).slice(0, 50),
      };
    } catch (e) {
      out.checks.deckNamesError = {
        message: String((e && e.message) || e || ""),
        details: (e && e.details) ? e.details : null,
      };
    }

    try {
      const models = await ankiInvoke("modelNames", {});
      const arr = Array.isArray(models) ? models : [];
      out.checks.modelNames = {
        total: arr.length,
        linguistPro: arr.filter((n) => /LinguistPro/i.test(String(n || ""))).slice(0, 50),
      };
    } catch (e) {
      out.checks.modelNamesError = {
        message: String((e && e.message) || e || ""),
        details: (e && e.details) ? e.details : null,
      };
    }

    return res.json(out);
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      details: { message: String((e && e.message) || e || "") },
    });
  }
});

app.get("/api/srs/export/status", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const cardId = String(req.query.cardId || "").trim();
    if (!cardId) return res.status(400).json({ ok: false, error: "BAD_CARD_ID" });

    const preview = await buildSrsAnkiPreview(req, { cardId });
    return res.json({
      ok: true,
      provider: "anki",
      cardId: preview.cardId,
      export: preview.status.export,
      currentExportHash: preview.exportHash,
      isExported: preview.status.isExported,
      isUpToDate: preview.status.isUpToDate,
    });
  } catch (e) {
    if (String(e && e.message || "") === "CARD_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: "CARD_NOT_FOUND" });
    }
    console.error("GET /api/srs/export/status error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.get("/api/srs/export/anki/preview", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const cardId = String(req.query.cardId || "").trim();
    const deckName = String(req.query.deckName || "").trim();
    const modelName = String(req.query.modelName || "").trim();
    const includeNoteHtml = String(req.query.includeNoteHtml || "") === "1";
    if (!cardId) return res.status(400).json({ ok: false, error: "BAD_CARD_ID" });

    const preview = await buildSrsAnkiPreview(req, {
      cardId,
      deckName,
      modelName,
      includeNoteHtml,
    });
    return res.json({ ok: true, provider: "anki", ...preview });
  } catch (e) {
    if (String(e && e.message || "") === "CARD_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: "CARD_NOT_FOUND" });
    }
    console.error("GET /api/srs/export/anki/preview error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/api/srs/export/anki", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const cardId = String(req.body && req.body.cardId || "").trim();
    const deckName = String(req.body && req.body.deckName || "").trim();
    const modelName = String(req.body && req.body.modelName || "").trim();
    const includeNoteHtml = !!(req.body && req.body.includeNoteHtml);
    const dryRun = !!(req.body && req.body.dryRun);
    if (!cardId) return res.status(400).json({ ok: false, error: "BAD_CARD_ID" });

    const built = await buildSrsAnkiPreview(req, {
      cardId,
      deckName,
      modelName,
      includeNoteHtml,
    });

    if (dryRun) {
      return res.json({ ok: true, dryRun: true, provider: "anki", ...built });
    }

    let noteId = built.status.export && built.status.export.externalNoteId
      ? String(built.status.export.externalNoteId)
      : "";

    await ankiEnsureDeck(built.deckName);
    await ankiEnsureModel(built.modelName, getSrsAnkiModelSpec());

    if (!noteId) {
      const q = `note:"${built.modelName.replace(/"/g, '\\"')}" tag:lp_srs_card_${ankiNoDashId(built.cardId)}`;
      const foundNoteIds = await ankiInvoke("findNotes", { query: q });
      if (Array.isArray(foundNoteIds) && foundNoteIds.length) noteId = String(foundNoteIds[0]);
    }

    if (!noteId) {
      const createdId = await ankiInvoke("addNote", { note: built.note });
      if (createdId != null) noteId = String(createdId);
      if (!noteId) {
        const q = `tag:lp_srs_card_${ankiNoDashId(built.cardId)}`;
        const foundNoteIds = await ankiInvoke("findNotes", { query: q });
        if (Array.isArray(foundNoteIds) && foundNoteIds.length) noteId = String(foundNoteIds[0]);
      }
    } else {
      const fieldsUpdate = { ...built.note.fields };
      delete fieldsUpdate.Sound;
      await ankiInvoke("updateNoteFields", {
        note: { id: Number(noteId), fields: fieldsUpdate },
      });
    }

    if (!noteId) {
      throw new Error("ANKI_EXPORT_FAILED");
    }

    if (built.preview.hasAudio && built.note.fields.AudioAssetKey) {
      const assetKey = String(built.note.fields.AudioAssetKey || "").trim();
      const filename = `lp_${assetKey}.mp3`;
      const asset = await getAudioAssetByKey(assetKey);
      const rel = asset && asset.relative_path ? String(asset.relative_path || "").replace(/\\/g, "/") : "";
      let absPath = rel ? path.resolve(DATA_DIR, rel) : path.resolve(audioCacheDir, `${assetKey}.mp3`);
      const audioCacheRoot = path.resolve(audioCacheDir) + path.sep;
      if (!(absPath + path.sep).startsWith(audioCacheRoot) && !absPath.startsWith(audioCacheRoot)) {
        throw new Error("AUDIO_PATH_OUTSIDE_CACHE");
      }
      if (!fs.existsSync(absPath)) {
        absPath = path.resolve(audioCacheDir, `${assetKey}.mp3`);
      }
      if (fs.existsSync(absPath)) {
        const b64 = fs.readFileSync(absPath).toString("base64");
        await ankiInvoke("storeMediaFile", { filename, data: b64 });
        await ankiInvoke("updateNoteFields", {
          note: { id: Number(noteId), fields: { Sound: `[sound:${filename}]` } },
        });
      }
    }

    const verifyNoteIds = await ankiInvoke("findNotes", { query: `tag:lp_srs_card_${ankiNoDashId(built.cardId)}` });
    const cardIds = await ankiInvoke("findCards", { query: `tag:lp_srs_card_${ankiNoDashId(built.cardId)}` });
    if (!Array.isArray(verifyNoteIds) || !verifyNoteIds.length) {
      throw new Error("ANKI_VERIFY_FAILED");
    }

    const exportRec = await upsertSrsCardExport({
      provider: "anki",
      cardId: built.cardId,
      deckName: built.deckName,
      modelName: built.modelName,
      templateCode: built.preview.templateCode,
      externalNoteId: noteId,
      externalCardIds: Array.isArray(cardIds) ? cardIds : [],
      exportHash: built.exportHash,
      lastSyncStatus: "ok",
      lastError: null,
      exportedAt: new Date().toISOString(),
    });

    await v3TrackEventSafe({
      eventType: "export_anki",
      entityType: "srs_card",
      entityId: built.cardId,
      textId: built.textId || null,
      sentenceId: built.sentenceId || null,
      cardId: built.cardId,
      source: "api",
      payload: {
        provider: "anki",
        templateCode: built.preview.templateCode,
        deckName: built.deckName,
      },
    });

    return res.json({
      ok: true,
      provider: "anki",
      cardId: built.cardId,
      export: exportRec,
      verify: {
        foundNotes: verifyNoteIds.length,
        foundCards: Array.isArray(cardIds) ? cardIds.length : 0,
      },
    });
  } catch (e) {
    const cardId = String(req.body && req.body.cardId || "").trim();
    if (cardId) {
      try {
        const built = await buildSrsAnkiPreview(req, { cardId });
        await upsertSrsCardExport({
          provider: "anki",
          cardId,
          deckName: built.deckName,
          modelName: built.modelName,
          templateCode: built.preview.templateCode,
          externalNoteId: built.status.export && built.status.export.externalNoteId || null,
          externalCardIds: built.status.export && built.status.export.externalCardIds || [],
          exportHash: built.exportHash,
          lastSyncStatus: "error",
          lastError: String(e && e.message || e || ""),
          exportedAt: built.status.export && built.status.export.exportedAt || null,
        });
      } catch (_) {}
    }
    if (String(e && e.message || "") === "CARD_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: "CARD_NOT_FOUND" });
    }
    const msg = String(e && e.message || "");
    const isConn = /ANKI_CONNECT|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up/i.test(msg);
    console.error("POST /api/srs/export/anki error:", e);
    return res.status(isConn ? 503 : 500).json({
      ok: false,
      error: isConn ? "ANKI_CONNECT_UNAVAILABLE" : "ANKI_EXPORT_FAILED",
      details: { message: msg },
    });
  }
});

app.post("/api/library/texts/:id/push/anki", gone410, async (req, res) => {
  if (!requireDbOr503(res)) return;

  const textId = String(req.params.id || "").trim();
  if (!isUuid(textId)) return res.status(400).json({ ok: false, error: "BAD_ID" });

  let stage = "start";
	const startedAt = Date.now();

  try {
    const textRec = await getTextById(textId);
    if (!textRec) return res.status(404).json({ ok: false, error: "TEXT_NOT_FOUND" });

    const rows = await getExportRowsByTextId(textId);

    const body = req.body || {};
    const frontMode = String(body.frontMode || "plain"); // "plain" | "niqqud"
    const includeHint = body.includeHint !== false;
    const includeNoteHtml = !!body.includeNoteHtml;
    const moveToDeck = body.moveToDeck !== false; // default true

    const defaultDeck = (() => {
      const lvl = String(textRec.level || "").trim();
      if (lvl) return `LinguistPro::${ankiSafeTagPart(lvl, 32) || lvl}`;
      return "LinguistPro";
    })();

    const deckName = String(body.deckName || defaultDeck).trim() || defaultDeck;
    const modelName = String(body.modelName || "LinguistPro Sentence v1").trim() || "LinguistPro Sentence v1";

    const baseUrl = getBaseUrlForAnki(req);

    const modelSpec = {
      inOrderFields: [
        "UID",
        "SentenceId",
        "TextId",
        "RowIdx",
        "Hebrew",
        "HebrewNiqqud",
        "FrontHebrew",
        "Translit",
        "Russian",
        "Note",
        "NoteHtml",
        "Sound",
        "AudioUrl",
        "AudioAssetKey",
        "Hint",
      ],
      css: `
.card {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  line-height: 1.35;
  text-align: left;
}
.he {
  direction: rtl;
  text-align: right;
  font-size: 38px;
  font-weight: 700;
  margin: 8px 0 10px;
}
.hint {
  font-size: 12px;
  opacity: 0.65;
  margin-top: 4px;
  text-align: right;
  direction: rtl;
}
.row {
  margin: 10px 0;
}
.label {
  font-size: 11px;
  opacity: 0.6;
  margin-bottom: 3px;
}
.val {
  font-size: 18px;
}
.note {
  margin-top: 10px;
  font-size: 15px;
}
.note pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  background: rgba(0,0,0,0.04);
  padding: 8px;
  border-radius: 6px;
}
.fallback a { font-size: 12px; }
mark { background: #fff2a8; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
blockquote { border-left: 3px solid rgba(0,0,0,0.2); margin: 6px 0; padding-left: 10px; opacity: 0.9; }
ul { margin: 6px 0 6px 22px; }
`.trim(),
      cardTemplates: [
        {
          Name: "Sentence",
          Front: `
<div class="he">{{FrontHebrew}}</div>
{{#Sound}}<div>{{Sound}}</div>{{/Sound}}
{{#Hint}}<div class="hint">{{Hint}}</div>{{/Hint}}
`.trim(),
          Back: `
<div class="he">{{FrontHebrew}}</div>
{{#Sound}}<div>{{Sound}}</div>{{/Sound}}

<div class="row">
  <div class="label">Translit</div>
  <div class="val">{{Translit}}</div>
</div>

<div class="row">
  <div class="label">RU</div>
  <div class="val">{{Russian}}</div>
</div>

{{#NoteHtml}}
  <div class="note">{{NoteHtml}}</div>
{{/NoteHtml}}
{{^NoteHtml}}
  {{#Note}}
    <div class="note"><pre>{{Note}}</pre></div>
  {{/Note}}
{{/NoteHtml}}

{{#AudioUrl}}
  <div class="row fallback"><a href="{{AudioUrl}}">audio url</a></div>
{{/AudioUrl}}

{{#Hint}}<div class="hint">{{Hint}}</div>{{/Hint}}
`.trim(),
        },
      ],
    };

    // Ensure AnkiConnect is reachable + deck/model exist
stage = "ankiEnsureDeck";
await ankiEnsureDeck(deckName);

stage = "ankiEnsureModel";
await ankiEnsureModel(modelName, modelSpec);

    // Find existing notes for this text (by tag + note type)
    const textTag = `lp_text_${ankiNoDashId(textId)}`;
    const q = `note:"${modelName.replace(/"/g, '\\"')}" tag:${textTag}`;
stage = "ankiFindExisting";
const existingNoteIds = await ankiInvoke("findNotes", { query: q });

    const noteIdBySentenceId = new Map();
const soundBySentenceId = new Map();

if (Array.isArray(existingNoteIds) && existingNoteIds.length) {
  stage = "ankiNotesInfo";
  const infos = await ankiInvoke("notesInfo", { notes: existingNoteIds });

  if (Array.isArray(infos)) {
    for (const inf of infos) {
      const f = inf && inf.fields ? inf.fields : null;

      const sid = (f && f.SentenceId)
        ? String((f.SentenceId.value ?? "")).trim()
        : "";

      if (!sid) continue;

      noteIdBySentenceId.set(sid, inf.noteId);

      const sraw = (f && f.Sound)
        ? String((f.Sound.value ?? ""))
        : "";

      if (sraw) soundBySentenceId.set(sid, sraw);
    }
  }
}


    const createdNotes = [];
    const updateActions = [];

    let audioQueued = 0;
	const mediaStoreOps = []; // { actionIdx, assetKey, filename }

let audioStored = 0;
let audioStoreFailed = 0;



    for (const r of rows) {
      const sentenceId = String(r.sentence_id || "").trim();
      if (!sentenceId) continue;

      const hePlain = String(r.he_plain || "");
      const heNiqqud = String(r.he_niqqud || "");
      const frontHebrew = (frontMode === "niqqud") ? heNiqqud : hePlain;

      const audioAssetKey = String(r.audio_asset_key || "");
      const audioUrl = audioAssetKey ? `${baseUrl}/api/audio/${encodeURIComponent(audioAssetKey)}` : "";

      const hint = (() => {
        if (!includeHint) return "";
        const topic = String(textRec.topic || "").trim();
        const title = String(textRec.title || "").trim();
        const lvl = String(textRec.level || "").trim();
        const left = topic || title;
        if (left && lvl) return `${left} · ${lvl}`;
        return left || lvl || "";
      })();

      const noteText = String(r.note || "");
      const noteHtml = includeNoteHtml ? ankiNoteHtmlFromMarkdown(noteText) : "";

      const fieldsAll = {
        UID: sentenceId,
        SentenceId: sentenceId,
        TextId: textId,
        RowIdx: String((Number(r.order_index) || 0) + 1),
        Hebrew: hePlain,
        HebrewNiqqud: heNiqqud,
        FrontHebrew: frontHebrew,
        Translit: String(r.translit || ""),
        Russian: String(r.ru || ""),
        Note: noteText,
        NoteHtml: noteHtml,
        Sound: "",
        AudioUrl: audioUrl,
        AudioAssetKey: audioAssetKey,
        Hint: hint,
      };

      const tags = [
        "lp",
        "lp_ver_w11",
        textTag,
        `lp_uid_${ankiNoDashId(sentenceId)}`,
      ];
      const lvlTag = ankiSafeTagPart(textRec.level, 24);
      if (lvlTag) tags.push(`lp_level_${lvlTag}`);
      const topicTag = ankiSafeTagPart(textRec.topic, 24);
      if (topicTag) tags.push(`lp_topic_${topicTag}`);

      const existingNoteId = noteIdBySentenceId.get(sentenceId);

      if (!existingNoteId) {
        const note = {
          deckName,
          modelName,
          fields: fieldsAll,
          tags,
        };

        // Optional media (CREATE only): AnkiConnect will fetch audio from our URL and set [sound:...] into Sound field.
// IMPORTANT: do NOT set note.fields.Sound manually here — иначе ловите дубли.
if (audioUrl && audioAssetKey) {
  const filename = `lp_${audioAssetKey}.mp3`;
  note.audio = [
    {
      url: audioUrl,
      filename,
      fields: ["Sound"],
    },
  ];
  audioQueued += 1;
}

        createdNotes.push(note);
} else {
  const fieldsUpdate = { ...fieldsAll };

  // По умолчанию — не трогаем Sound, чтобы не затирать пользовательское/старое.
  delete fieldsUpdate.Sound;

  const existingSoundRaw = (typeof soundBySentenceId !== "undefined")
    ? String(soundBySentenceId.get(sentenceId) || "")
    : "";

  // Если аудио есть локально — “repair” на реэкспорте:
  // 1) загрузить mp3 в коллекцию (storeMediaFile)
  // 2) поставить Sound = [sound:lp_<assetKey>.mp3]
  let needStore = false;
  let filename = null;

  if (audioUrl && audioAssetKey) {
    filename = `lp_${audioAssetKey}.mp3`;
    const desiredSound = `[sound:${filename}]`;

    const hasDesired = existingSoundRaw.includes(desiredSound);
    if (!hasDesired) {
      fieldsUpdate.Sound = desiredSound;
      needStore = true;
    }
  }

  const actionIdx = updateActions.length;

  updateActions.push({
    action: "updateNoteFields",
    params: { note: { id: existingNoteId, fields: fieldsUpdate } },
  });

  if (needStore && audioAssetKey && filename) {
    mediaStoreOps.push({
      actionIdx,
      assetKey: audioAssetKey,
      filename,
      fallbackSound: existingSoundRaw || "",
    });
  }
}
}
    let created = 0;
    let updated = 0;

	// Debug/verify (dev-safe)
	let createdIdsSample = [];
	let createdNullIdxSample = [];
	let verifyQ = "";
	let verifyFoundNotes = 0;

    // Create (chunked) — strict: never report "created" unless AnkiConnect confirms ids
let createdNull = 0;

if (createdNotes.length) {
  const total = createdNotes.length;
  const chunkSize = ANKI_ADDNOTES_CHUNK;

  for (let offset = 0; offset < total; offset += chunkSize) {
    const chunk = createdNotes.slice(offset, offset + chunkSize);
    stage = `ankiAddNotes_${Math.floor(offset / chunkSize) + 1}`;

    const createdIds = await ankiInvoke("addNotes", { notes: chunk });

    if (!Array.isArray(createdIds)) {
      return res.status(502).json({
        ok: false,
        error: "ANKI_BAD_RESULT_ADDNOTES",
        details: {
          gotType: typeof createdIds,
          gotIsNull: createdIds === null,
          deckName,
          modelName,
          textTag,
          intendedCreate: total,
          chunkOffset: offset,
          chunkSize: chunk.length,
          stage,
          elapsedMs: Date.now() - startedAt,
        },
      });
    }

    for (let i = 0; i < createdIds.length; i++) {
      const v = createdIds[i];
      if (v === null || v === undefined) {
        createdNull += 1;
        const globalIdx = offset + i;
        if (createdNullIdxSample.length < 10) createdNullIdxSample.push(globalIdx);
        continue;
      }
      created += 1;
      if (createdIdsSample.length < 5) createdIdsSample.push(v);
    }
  }
}

// For UPDATE repairs: push media into Anki collection via storeMediaFile (reliable, no HTTP fetch).
if (mediaStoreOps.length) {
  const audioCacheRoot = path.resolve(audioCacheDir) + path.sep;

  for (const op of mediaStoreOps) {
    const { actionIdx, assetKey, filename, fallbackSound } = op;

    try {
      stage = "ankiStoreMediaFile";

      const asset = await getAudioAssetByKey(assetKey);
const rel = asset && asset.relative_path ? String(asset.relative_path || "") : "";

let absPath = null;

if (rel) {
  const relNorm = String(rel || "").replace(/\\/g, "/");
  absPath = path.resolve(DATA_DIR, relNorm);
} else {
  const relMp3 = getAudioRelativePath(assetKey).replace(/\\/g, "/");
  absPath = path.resolve(DATA_DIR, relMp3);
}

      // safety: не даём выйти за audio-cache
      if (!(absPath + path.sep).startsWith(audioCacheRoot) && !absPath.startsWith(audioCacheRoot)) {
        throw new Error("AUDIO_PATH_OUTSIDE_CACHE");
      }

      // fallback если rel битый
      if (!fs.existsSync(absPath)) {
        const fb = path.resolve(audioCacheDir, `${assetKey}.mp3`);
        if ((fb + path.sep).startsWith(audioCacheRoot) || fb.startsWith(audioCacheRoot)) {
          if (fs.existsSync(fb)) absPath = fb;
        }
      }

      if (!fs.existsSync(absPath)) {
        throw new Error("AUDIO_FILE_NOT_FOUND");
      }

      const b64 = fs.readFileSync(absPath).toString("base64");
      await ankiInvoke("storeMediaFile", { filename, data: b64 });

      audioStored += 1;
      audioQueued += 1; // чтобы UI видел, что аудио реально “обработано”
    } catch (e) {
      audioStoreFailed += 1;

      // Если не смогли сохранить media — нельзя оставлять Sound, который указывает на несуществующий файл
      try {
        const act = updateActions[actionIdx];
        const fields = act && act.params && act.params.note && act.params.note.fields ? act.params.note.fields : null;
        if (fields) {
          if (fallbackSound) fields.Sound = fallbackSound;
          else delete fields.Sound;
        }
      } catch (_) {}

      console.warn("[anki-push] storeMediaFile failed", {
        assetKey,
        filename,
        message: (e && e.message) ? String(e.message) : String(e),
      });
    }
  }
}

// Update (chunked via multi)
if (updateActions.length) {
  const total = updateActions.length;
  const chunkSize = ANKI_MULTI_CHUNK;

  for (let offset = 0; offset < total; offset += chunkSize) {
    const chunk = updateActions.slice(offset, offset + chunkSize);
    stage = `ankiMultiUpdate_${Math.floor(offset / chunkSize) + 1}`;
    await ankiMulti(chunk);
    updated += chunk.length;
  }
}

	// Verify: ensure notes exist in Anki for this textTag (prevents "false OK")
verifyQ = `tag:${textTag}`;
stage = "ankiVerifyFindNotes";
const verifyNoteIds = await ankiInvoke("findNotes", { query: verifyQ });
verifyFoundNotes = Array.isArray(verifyNoteIds) ? verifyNoteIds.length : 0;

if ((createdNotes.length || updateActions.length) && verifyFoundNotes === 0) {
  return res.status(502).json({
    ok: false,
    error: "ANKI_VERIFY_FAILED",
    details: {
      verifyQ,
      deckName,
      modelName,
      textTag,
      intendedCreate: createdNotes.length,
      intendedUpdate: updateActions.length,
      created,
	  createdNull,
      updated,
      audioQueued,
	  audioStored,
audioStoreFailed,
      createdIdsSample,
      createdNullIdxSample,
      stage,
      elapsedMs: Date.now() - startedAt,
    },
  });
}

    // Optional: move all cards for this text into selected deck (keeps deck switch intuitive)
    if (moveToDeck) {
  stage = "ankiFindCards";
  const cardIds = await ankiInvoke("findCards", { query: q });

  if (Array.isArray(cardIds) && cardIds.length) {
    stage = "ankiChangeDeck";
    await ankiInvoke("changeDeck", { cards: cardIds, deck: deckName });
  }
}


    res.json({
  ok: true,
  textId,
  deckName,
  modelName,
    stats: {
    totalRows: rows.length,
    created,
    updated,
    audioQueued,
    audioStored,
    audioStoreFailed,
  },

  verify: {
    query: verifyQ || null,
    foundNotes: verifyFoundNotes,
  },
  debug: {
    textTag,
    createdIdsSample,
    createdNullIdxSample,
  },
});

 } catch (e) {
  const msg = String((e && e.message) || e || "");
  const isConn = /ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|ANKI_CONNECT_UNAVAILABLE|ANKI_CONNECT_TIMEOUT/i.test(msg);

  let details = (e && typeof e === "object" && e.details) ? e.details : msg;

  // нормализуем details в объект, чтобы в UI не было "[object Object]"
  if (details && typeof details === "object") {
    details = { ...details };
  } else {
    details = { message: String(details || "") };
  }

  details.stage = stage;
  details.elapsedMs = Date.now() - startedAt;

  return res.status(isConn ? 503 : 500).json({
    ok: false,
    error: isConn ? "ANKI_CONNECT_UNAVAILABLE" : "ANKI_CONNECT_ERROR",
    details,
  });
}
});

// Mark opened (last_opened_at)
app.post("/api/library/texts/:id/opened", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const text = await getTextById(req.params.id);
    if (!text) return res.status(404).json({ error: "NOT_FOUND" });

    const updated = await touchTextOpened(req.params.id);
    res.json({ ok: true, text: updated });
  } catch (e) {
    console.error("POST /api/library/texts/:id/opened error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

function v3NormalizeLevel(raw) {
  if (raw == null) return null;
  const s0 = String(raw).trim();
  if (!s0 || s0 === "—") return null;

  const s = s0.toLowerCase().replace(/\s+/g, "");

  const map = Object.freeze({
    // canonical
    "alef": "alef",
    "alef+": "alef+",
    "bet": "bet",
    "bet+": "bet+",
    "gimel": "gimel",
    "gimel+": "gimel+",
    "dalet": "dalet",
    "dalet+": "dalet+",
    "he": "he",
    "he+": "he+",
    "vav": "vav",
    "vav+": "vav+",
    "unknown": "unknown",

    // synonyms (минимально полезные)
    "aleph": "alef",
    "aleph+": "alef+",
    "א": "alef",
    "א+": "alef+",
    "ב": "bet",
    "ב+": "bet+",
    "ג": "gimel",
    "ג+": "gimel+",
    "ד": "dalet",
    "ד+": "dalet+",
    "ה": "he",
    "ה+": "he+",
    "ו": "vav",
    "ו+": "vav+",

    "алеф": "alef",
    "алеф+": "alef+",
    "бет": "bet",
    "бет+": "bet+",
    "гимел": "gimel",
    "гимел+": "gimel+",
    "далет": "dalet",
    "далет+": "dalet+",
    "хей": "he",
    "хей+": "he+",
    "вав": "vav",
    "вав+": "vav+",
    "неизвестно": "unknown"
  });

  if (map[s]) return map[s];

  // Безопасный “escape hatch” на будущее (чтобы не блокировать новые уровни)
  // Разрешаем короткий токен вида "alef++" не нужно, поэтому строго:
  if (/^[a-z0-9][a-z0-9+_-]{0,24}$/i.test(s0)) return s0;

  return null;
}

function v3NormalizeTags(raw) {
  if (raw == null) return [];

  let items = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === "string") {
    // allow CSV / whitespace-separated
    items = raw.split(/[\s,]+/);
  } else {
    return [];
  }

  const out = [];
  const seen = new Set();

  for (const it of items) {
    let t = String(it || "").trim();
    if (!t) continue;

    if (t.length > 48) t = t.slice(0, 48).trim();
    if (!t) continue;

    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);

    out.push(t);
    if (out.length >= 50) break;
  }

  return out;
}

// PATCH /api/library/texts/:id/meta
app.patch("/api/library/texts/:id/meta", gone410, express.json({ limit: "64kb" }), async (req, res) => {
  const db = requireDbOr503(res);
  if (!db) return;

  try {
    const textId = String(req.params.id || "").trim();
    if (!textId) return res.status(400).json({ error: "BAD_TEXT_ID" });

    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const patch = {};

    // title
    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      const v = body.title == null ? null : String(body.title).trim();
      patch.title = (v && v.length) ? v : null;
    }

    // level
    if (Object.prototype.hasOwnProperty.call(body, "level")) {
      const raw = body.level;
      const norm = v3NormalizeLevel(raw);

      // если поле было прислано НЕ пустым — обязаны распарсить
      if (raw != null && String(raw).trim() && !norm) {
        return res.status(400).json({ error: "BAD_LEVEL" });
      }
      patch.level = norm; // null или нормализованный токен
    }

    // tags (принимаем "a,b,c" или ["a","b"])
    if (Object.prototype.hasOwnProperty.call(body, "tags")) {
      const tagsArr = v3NormalizeTags(body.tags);
      patch.tagsJson = JSON.stringify(tagsArr);
    }

    // source/topic
    if (Object.prototype.hasOwnProperty.call(body, "source")) {
      const v = body.source == null ? null : String(body.source).trim();
      patch.source = (v && v.length) ? v : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "topic")) {
      const v = body.topic == null ? null : String(body.topic).trim();
      patch.topic = (v && v.length) ? v : null;
    }

    // pinning
    let hasPin = false;
    let isPinned = null;

    if (Object.prototype.hasOwnProperty.call(body, "isPinned")) {
      hasPin = true;
      const v = body.isPinned;
      isPinned = (v === true || v === 1 || v === "1") ? 1 : 0;
      patch.isPinned = (isPinned === 1); // boolean
    }

    if (Object.prototype.hasOwnProperty.call(body, "pinOrder")) {
      hasPin = true;

      const raw = body.pinOrder;
      if (raw === null || raw === undefined || String(raw).trim() === "") {
        patch.pinOrder = null;
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          return res.status(400).json({ error: "BAD_PIN_ORDER" });
        }
        patch.pinOrder = Math.trunc(n);
      }
    }

    // Single source of truth: если снимаем pin — pinOrder всегда null
    if (hasPin && isPinned === 0) {
      patch.pinOrder = null;
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: "EMPTY_PATCH" });
    }

    const r = await updateTextMeta(textId, patch);
return res.json({ ok: true, result: r });
  } catch (e) {
    console.error("PATCH /api/library/texts/:id/meta failed:", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// --------------------------------------------------------
// Week9 (P0): Dashboard History API (Recent texts + Recent rows)

// POST /api/history/event
// body: { textId, sentenceId, assetKey?, audioLang?, voiceName? }
// также поддерживает legacy-ключи: text_id, sentence_id, asset_key, audio_lang, voice_name
app.post("/api/history/event", gone410, express.json({ limit: "64kb" }), async (req, res) => {
  const db = requireDbOr503(res);
  if (!db) return;

  try {
    const body = req.body || {};
    const textId = body.textId || body.text_id;
    const sentenceId = body.sentenceId || body.sentence_id;

    const assetKey = body.assetKey || body.asset_key || null;
    const audioLang = body.audioLang || body.audio_lang || null;
    const voiceName = body.voiceName || body.voice_name || null;

    if (!textId || !sentenceId) {
      return res.status(400).json({ ok: false, error: "textId and sentenceId are required" });
    }

    // Унифицируем вызов: если historyRepo ожидает иной объект — он сам может игнорировать лишние поля.
    const result = await recordRowTtsEvent({
      textId,
      sentenceId,
      assetKey,
      audioLang,
      voiceName,
      // legacy-поля (на случай старой реализации repo)
      id: body.id || uuidv4(),
      eventType: body.eventType || body.event_type || "ROW_TTS",
    });
    await v3TrackEventSafe({
      eventType: "play_audio",
      entityType: "sentence",
      entityId: sentenceId,
      textId,
      sentenceId,
      source: "api",
      payload: {
        assetKey: assetKey || null,
        audioLang: audioLang || null,
        voiceName: voiceName || null,
      },
    });

    return res.json({ ok: true, result });
  } catch (e) {
    console.error("history/event failed", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// GET /api/history/recent-texts?limit=20&includeArchived=0|1
	app.get("/api/history/recent-texts", gone410, async (req, res) => {
  const db = requireDbOr503(res);
  if (!db) return;

  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
    const includeArchived = String(req.query.includeArchived || req.query.include_archived || "") === "1";

    const recentRes = await listRecentTexts({ limit, includeArchived });
    const recent = Array.isArray(recentRes) ? recentRes : (recentRes && recentRes.texts ? recentRes.texts : []);

    const out = [];
    for (const r of (recent || [])) {
      const textId = r.text_id || r.textId || r.id; // подстраховка
      if (!textId) continue;

      // Подтягиваем полную карточку текста (как /api/library/texts/:id)
      let t = null;
      try {
        t = await getTextById(textId);
      } catch (_) {}

      const isArchived = !!(t && (t.is_archived === 1 || t.is_archived === true));
      if (!includeArchived && isArchived) continue;

      // Нормализуем поля времени/счётчика под UI:
      const lastSeenAt = r.last_seen_at || r.lastSeenAt || r.last_event_at || r.lastEventAt || null;
      const seenCount = (r.seen_count ?? r.seenCount ?? r.play_count ?? r.playCount ?? 0);

      out.push({
        text_id: textId,
        last_seen_at: lastSeenAt,
        seen_count: seenCount,
        last_sentence_id: r.last_sentence_id || r.lastSentenceId || null,
        last_asset_key: r.last_asset_key || r.lastAssetKey || null,
        ...(t || {}),
      });
    }

    return res.json({ ok: true, texts: out });
  } catch (e) {
    console.error("history/recent-texts failed", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// GET /api/history/recent-activity?limit=80&includeArchived=0|1&textId=...&level=...
app.get("/api/history/recent-activity", gone410, async (req, res) => {
  const db = requireDbOr503(res);
  if (!db) return;

  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 80));
    const includeArchived = String(req.query.includeArchived || req.query.include_archived || "") === "1";

    const textIdRaw = String(req.query.textId || req.query.text_id || "").trim();
    const textId = textIdRaw ? textIdRaw : null;

    const levelRaw = String(req.query.level || "").trim();
    const level = levelRaw ? levelRaw : null;

    const rowsRes = await listRecentActivity({ limit, includeArchived, textId, level });
    const rows = Array.isArray(rowsRes) ? rowsRes : (rowsRes && rowsRes.rows ? rowsRes.rows : []);

    return res.json({ ok: true, rows });
  } catch (e) {
    console.error("history/recent-activity failed", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// GET /api/history/analytics?days=7&includeArchived=0|1&level=...
app.get("/api/history/analytics", gone410, async (req, res) => {
  const db = requireDbOr503(res);
  if (!db) return;

  try {
    const days = Math.max(0, Math.min(3650, Number(req.query.days) || 7));
    const includeArchived = String(req.query.includeArchived || req.query.include_archived || "") === "1";

    const levelRaw = String(req.query.level || "").trim();
    const level = levelRaw ? levelRaw : null;

    const period = await getAnalyticsSummary({ days, includeArchived, level });
    const all = await getAnalyticsSummary({ days: 0, includeArchived, level });
    const periodEventCounts = await countEventsByType({ days });
    const allEventCounts = await countEventsByType({ days: 0 });
    const topTexts = await listTopTextsByPlays({ days, limit: 8, includeArchived, level });

    return res.json({
      ok: true,
      period: { ...period, eventCounts: periodEventCounts },
      all: { ...all, eventCounts: allEventCounts },
      topTexts,
    });
  } catch (e) {
    console.error("history/analytics failed", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// GET /api/history/texts/:textId/recent-rows
app.get("/api/history/texts/:textId/recent-rows", gone410, async (req, res) => {
  const db = requireDbOr503(res);
  if (!db) return;

  const textId = req.params.textId;

  try {
    const textId = req.params.textId;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 25));

    const recentRes = await listRecentRowsByText({ textId, limit });
    const recent = Array.isArray(recentRes) ? recentRes : (recentRes && recentRes.rows ? recentRes.rows : []);

    // Обогащаем строками из library sentences (order_index + тексты), чтобы Dashboard мог показывать превью
    let sentences = [];
    try {
      sentences = await getSentencesByTextId(textId);
    } catch (_) {}

    const byId = new Map((sentences || []).map(s => [s.id, s]));

    const rows = (recent || []).map(r => {
      const sentenceId = r.sentence_id || r.sentenceId;
      const s = sentenceId ? byId.get(sentenceId) : null;

      const lastSeenAt = r.last_seen_at || r.lastSeenAt || r.last_event_at || r.lastEventAt || null;
      const seenCount = (r.seen_count ?? r.seenCount ?? r.play_count ?? r.playCount ?? 0);

      return {
        text_id: r.text_id || textId,
        sentence_id: sentenceId,
        last_seen_at: lastSeenAt,
        seen_count: seenCount,
        last_asset_key: r.last_asset_key || r.lastAssetKey || null,
        ...(s ? {
          order_index: s.order_index,
          he_plain: s.he_plain,
          he_niqqud: s.he_niqqud,
          translit: s.translit,
          ru: s.ru,
        } : {}),
      };
    });

    return res.json({ ok: true, textId, rows });
  } catch (e) {
    console.error("history/texts/:textId/recent-rows failed", e);
  return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});


// Archive / Delete
app.post("/api/library/texts/:id/archive", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const text = await getTextById(req.params.id);
    if (!text) return res.status(404).json({ error: "NOT_FOUND" });

    const updated = await archiveTextById(req.params.id);
    res.json({ ok: true, text: updated });
  } catch (e) {
    console.error("POST /api/library/texts/:id/archive error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

app.delete("/api/library/texts/:id", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const text = await getTextById(req.params.id);
    if (!text) return res.status(404).json({ error: "NOT_FOUND" });

    const r = await deleteTextById(req.params.id);
    res.json(r);
  } catch (e) {
    console.error("DELETE /api/library/texts/:id error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});



// --------------------------------------------------------
// V3-IMP-01: Export/Import JSON (P0)
// --------------------------------------------------------

function v3SafeJsonParse(str, fallback) {
  try {
    if (str == null) return fallback;
    if (typeof str !== "string") return str; // уже объект
    const s = str.trim();
    if (!s) return fallback;
    return JSON.parse(s);
  } catch (_) {
    return fallback;
  }
}

// Export whole library (texts + sentences + progress)
app.get("/api/library/export", async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    // По умолчанию экспортируем ВСЁ, включая архив
    const includeArchived = String(req.query.includeArchived || "1") === "1";
    const limit = Number(req.query.limit || "100000");

    const rows = await listTexts({ limit, includeArchived });

    const exportedTexts = [];
    for (const r of rows) {
      const textId = String(r.id);
      const [text, sentences, progress] = await Promise.all([
        getTextById(textId),
        getSentencesByTextId(textId),
        getProgressByTextId(textId).catch(() => null),
      ]);
      if (!text) continue;
      exportedTexts.push({
        text,
        sentences: Array.isArray(sentences) ? sentences : [],
        progress: progress || null,
      });
    }

    const migrationsHealth = getMigrationsHealth ? getMigrationsHealth() : null;

    res.json({
      exportType: "linguist-pro-library",
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      migrations: migrationsHealth || null,
      texts: exportedTexts,
    });
  } catch (e) {
    console.error("GET /api/library/export error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// Import library JSON (safe by default: skip duplicates)
app.post("/api/library/import", gone410, async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const body = req.body || {};
    const mode = String(body.mode || "skip"); // "skip" | "asNew"
    const payload = body.payload || body; // поддержим и прямую отправку payload без обёртки

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "VALIDATION", field: "payload" });
    }

    const exportType = String(payload.exportType || "");
    const items = Array.isArray(payload.texts) ? payload.texts : [];

    if (exportType && exportType !== "linguist-pro-library") {
      return res.status(400).json({ error: "VALIDATION", field: "exportType" });
    }
    if (!Array.isArray(items) || items.length < 1) {
      return res.status(400).json({ error: "VALIDATION", field: "texts" });
    }

    // DATA-PROTECT-01: Pre-import backup for large imports (>10 texts)
    const LARGE_IMPORT_THRESHOLD = 10;
    let preImportBackupPath = null;
    if (items.length > LARGE_IMPORT_THRESHOLD) {
      try {
        const backupResult = createBackup(DB_PATH, { label: "pre-import" });
        if (backupResult.ok) {
          preImportBackupPath = backupResult.backupPath;
          console.log(`[import] Pre-import backup created: ${preImportBackupPath}`);
          cleanupBackups(DEFAULT_MAX_BACKUPS);
        } else {
          console.warn(`[import] Pre-import backup failed (continuing): ${backupResult.error}`);
        }
      } catch (e) {
        console.warn("[import] Pre-import backup error (continuing):", e && e.message);
      }
    }

    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const item of items) {
      try {
        const t = (item && (item.text || item.meta)) ? (item.text || item.meta) : item;
        const sentencesIn = Array.isArray(item && item.sentences) ? item.sentences : (Array.isArray(t && t.sentences) ? t.sentences : []);
        const progressIn = (item && item.progress) ? item.progress : (t && t.progress ? t.progress : null);

        const sourceText = String((t && (t.source_text || t.sourceText)) || "").trim();
        if (!sourceText) {
          errorCount++;
          errors.push({ error: "NO_SOURCE_TEXT", title: t && t.title ? String(t.title) : null });
          continue;
        }

        const title = (t && t.title && String(t.title).trim()) ? String(t.title).trim() : guessTitle(sourceText);
        const level = (t && t.level && String(t.level).trim()) ? String(t.level).trim() : null;

		        // Week9 dashboard meta (optional)
        const source =
          (t && Object.prototype.hasOwnProperty.call(t, "source"))
            ? ((t.source == null) ? null : String(t.source).trim() || null)
            : null;

        const topic =
          (t && Object.prototype.hasOwnProperty.call(t, "topic"))
            ? ((t.topic == null) ? null : String(t.topic).trim() || null)
            : null;

        // isPinned: accept boolean / 0|1 / "0"|"1" (supports both isPinned and is_pinned)
        let isPinned = 0;
        const pinRaw =
          (t && Object.prototype.hasOwnProperty.call(t, "isPinned")) ? t.isPinned :
          (t && Object.prototype.hasOwnProperty.call(t, "is_pinned")) ? t.is_pinned :
          undefined;
        if (pinRaw === true || pinRaw === 1 || pinRaw === "1") isPinned = 1;

        // pinOrder: supports both pinOrder and pin_order
        let pinOrder = null;
        const poRaw =
          (t && Object.prototype.hasOwnProperty.call(t, "pinOrder")) ? t.pinOrder :
          (t && Object.prototype.hasOwnProperty.call(t, "pin_order")) ? t.pin_order :
          undefined;

        if (poRaw !== undefined && poRaw !== null && poRaw !== "") {
          const n = Number(poRaw);
          if (Number.isFinite(n)) pinOrder = Math.trunc(n);
        }
        if (!isPinned) pinOrder = null;

        const tagsArr =
          (t && t.tags_json) ? v3SafeJsonParse(t.tags_json, []) :
          (t && Array.isArray(t.tags)) ? t.tags :
          [];
        const tagsJson = JSON.stringify(v3NormalizeTags(tagsArr));

        const sourceMetaJson =
          (t && t.source_meta_json) ? String(t.source_meta_json) :
          (t && t.sourceMeta) ? JSON.stringify(t.sourceMeta) :
          null;

        const ttsProfileObj =
          (t && t.tts_profile_json) ? v3SafeJsonParse(t.tts_profile_json, null) :
          (t && t.ttsProfile) ? t.ttsProfile :
          null;
        const ttsProfileJson = ttsProfileObj ? JSON.stringify(ttsProfileObj) : null;

        const tableModelMetaObj =
          (t && t.table_model_meta_json) ? v3SafeJsonParse(t.table_model_meta_json, null) :
          (t && t.tableModelMeta) ? t.tableModelMeta :
          null;

        let tableModelMetaJson = tableModelMetaObj ? JSON.stringify(tableModelMetaObj) : null;

        // textKey: либо из файла, либо вычисляем; в режиме asNew — добавляем соль
        let textKey = String((t && (t.text_key || t.textKey)) || "").trim();
        if (!textKey) {
          textKey = computeTextKey({
            sourceText,
            ttsProfile: ttsProfileObj || null,
            tableModelMeta: tableModelMetaObj || null,
          });
        }

        if (mode === "asNew") {
          const salt = uuidv4();
          const meta2 = (tableModelMetaObj && typeof tableModelMetaObj === "object")
            ? { ...tableModelMetaObj, importSalt: salt }
            : { importSalt: salt };

          textKey = computeTextKey({
            sourceText,
            ttsProfile: ttsProfileObj || null,
            tableModelMeta: meta2,
          });
          tableModelMetaJson = JSON.stringify(meta2);
        }

        // Собираем rows в формате createTextWithSentences
        const rows = (sentencesIn || []).map((r, idx) => {
          const hePlain = String((r && (r.he_plain || r.he)) || "");
          const heNiq = String((r && (r.he_niqqud || r.heNiq || r.he_niqqud_text)) || "");
          const translit = String((r && r.translit) || "");
          const ru = String((r && r.ru) || "");

          const rowHash = (r && r.row_hash) ? String(r.row_hash) : crypto
            .createHash("sha256")
            .update(JSON.stringify({ hePlain, heNiq, translit, ru }), "utf8")
            .digest("hex");

          const metaJson =
            (r && r.meta_json != null) ? (typeof r.meta_json === "string" ? r.meta_json : JSON.stringify(r.meta_json)) :
            null;

          return {
            id: uuidv4(),
            he_plain: hePlain,
            he_niqqud: heNiq,
            translit,
            ru,
            row_hash: rowHash,
            meta_json: metaJson,
            order_index: Number.isInteger(r && r.order_index) ? r.order_index : idx,
          };
        });

        if (!Array.isArray(rows) || rows.length < 1) {
          errorCount++;
          errors.push({ error: "NO_SENTENCES", title });
          continue;
        }

        const newTextId = uuidv4();

        const created = await createTextWithSentences({
  id: newTextId,
  textKey,
  title,
  level,
  tagsJson,
  sourceText,
  sourceMetaJson,
  ttsProfileJson,
  tableModelMetaJson,

  // Week9 dashboard meta
  source,
  topic,
  isPinned,
  pinOrder,

  rows,
});

        importedCount++;

        // Прогресс (если есть)
        if (progressIn && Number.isInteger(progressIn.lastRowIdx) && progressIn.lastRowIdx >= 0) {
          const lastStepId = (progressIn.lastStepId != null) ? String(progressIn.lastStepId) : null;
          try {
            await setProgress({ textId: newTextId, lastRowIdx: progressIn.lastRowIdx, lastStepId });
          } catch (_) {
            // прогресс не должен валить импорт
          }
        }

        // Архивность (если в файле было is_archived=true) — применим после импорта
        if (t && (t.is_archived === true || t.is_archived === 1)) {
          try { await archiveTextById(newTextId); } catch (_) {}
        }

        // created не используем дальше, но оставим на будущее
        void created;
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);

        // UNIQUE text_key => дубликат
        const msgLc = msg.toLowerCase();
		if (msg.includes("ux_texts_text_key") || (msgLc.includes("text_key") && (msgLc.includes("unique") || msgLc.includes("duplicate")))) {
          skippedCount++;
          continue;
        }

        errorCount++;
        errors.push({ error: msg });
      }
    }

    res.json({
      ok: true,
      mode,
      importedCount,
      skippedCount,
      errorCount,
      errors: errors.slice(0, 50),
    });
  } catch (e) {
    console.error("POST /api/library/import error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ── Bundle export: ZIP containing library.json (unified format) + audio MP3s ──
app.get("/api/library/export/bundle", async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const includeArchived = String(req.query.includeArchived || "1") === "1";
    const limit = Number(req.query.limit || "100000");

    const rows = await listTexts({ limit, includeArchived });

    const exportedTexts = [];
    const audioKeySet = new Set();

    for (const r of rows) {
      const textId = String(r.id);
      const [text, sentences, notes] = await Promise.all([
        getTextById(textId),
        getSentencesByTextId(textId),
        listNotesByTextId(textId).catch(() => []),
      ]);
      if (!text) continue;

      const exportRows = buildExportRowsWithNotes(sentences, notes, audioKeySet);

      const textAk = text.audio_asset_key && text.audio_asset_key.length === 64 ? text.audio_asset_key : null;
      if (textAk) audioKeySet.add(textAk);

      exportedTexts.push({
        text_id: text.id,
        text_key: text.text_key,
        title: text.title,
        level: text.level || null,
        tags: v3SafeJsonParse(text.tags_json, []),
        source_label: text.source || null,
        topic: text.topic || null,
        source_text: text.source_text,
        source_meta: text.source_meta_json ? v3SafeJsonParse(text.source_meta_json, null) : null,
        table_model_meta: text.table_model_meta_json ? v3SafeJsonParse(text.table_model_meta_json, null) : null,
        rows: exportRows,
        text_audio_asset_key: textAk,
        created_at: text.created_at,
        updated_at: text.updated_at,
        is_archived: text.is_archived === 1 || text.is_archived === true,
      });
    }

    // Resolve audio metadata and check file existence
    const exportAudioAssets = [];
    const missingAudio = [];

    for (const ak of audioKeySet) {
      const filePath = path.join(AUDIO_CACHE_DIR, `${ak}.mp3`);
      if (!fs.existsSync(filePath)) {
        missingAudio.push({ asset_key: ak, reason: "file_missing_in_cache" });
        continue;
      }
      let meta = null;
      try { meta = await getAudioAssetByKey(ak); } catch (_) {}
      const ttsProfile = meta && meta.tts_profile_json ? v3SafeJsonParse(meta.tts_profile_json, null) : null;
      exportAudioAssets.push({
        asset_key: ak,
        relative_export_path: `audio/${ak}.mp3`,
        mime_type: (meta && meta.mime) || "audio/mpeg",
        provider_id: (ttsProfile && ttsProfile.providerId) || "unknown",
        voice_name: (ttsProfile && ttsProfile.voiceName) || null,
        language: (ttsProfile && ttsProfile.language) || "he",
        duration_ms: (meta && meta.duration_ms) || null,
        size_bytes: (meta && meta.size_bytes) || null,
        content_hash: ak,
        provenance: ttsProfile ? { ttsProfile } : null,
      });
    }

    const rowCount = exportedTexts.reduce((s, t) => s + t.rows.length, 0);
    const noteCount = countBundleNotes(exportedTexts);
    const createdAt = new Date().toISOString();
    const tsTag = createdAt.slice(0, 19).replace(/[-T:]/g, (c) => (c === "T" ? "-" : c)).replace(/:/g, "");
    const safeTs = createdAt.slice(0, 10).replace(/-/g, "") + "-" + createdAt.slice(11, 19).replace(/:/g, "");
    const filename = `library-bundle-${safeTs}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => console.error("[export/bundle] archiver error:", err));
    archive.pipe(res);

    archive.append(JSON.stringify({
      export_schema_version: 2,
      app_id: "linguist-pro-web",
      created_at: createdAt,
      partial_backup: missingAudio.length > 0,
      text_count: exportedTexts.length,
      row_count: rowCount,
      note_count: noteCount,
      audio_count: exportAudioAssets.length,
      missing_audio_count: missingAudio.length,
      library_json_path: "library/library.json",
      missing_audio_path: "metadata/missing_audio.json",
    }, null, 2), { name: "manifest.json" });

    archive.append(JSON.stringify({
      schema_version: 2,
      texts: exportedTexts,
      audio_assets: exportAudioAssets,
    }, null, 2), { name: "library/library.json" });

    for (const ak of audioKeySet) {
      const filePath = path.join(AUDIO_CACHE_DIR, `${ak}.mp3`);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `audio/${ak}.mp3` });
      }
    }

    archive.append(JSON.stringify({ missing_audio: missingAudio }, null, 2), {
      name: "metadata/missing_audio.json",
    });

    archive.finalize();
  } catch (e) {
    console.error("GET /api/library/export/bundle error:", e);
    if (!res.headersSent) res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ── Bundle import: ZIP containing library/library.json (unified format) + audio MP3s ──
app.post(
  "/api/library/import/bundle",
  express.raw({ type: "application/zip", limit: "500mb" }),
  async (req, res) => {
    try {
      if (!requireDbOr503(res)) return;

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ error: "VALIDATION", field: "body", message: "Expected ZIP file body" });
      }

      let zip;
      try {
        zip = new AdmZip(body);
      } catch (_) {
        return res.status(400).json({ error: "VALIDATION", field: "body", message: "Invalid ZIP file" });
      }

      const libEntry = zip.getEntry("library/library.json");
      if (!libEntry) {
        return res.status(400).json({ error: "VALIDATION", message: "library/library.json not found in ZIP" });
      }

      let libraryJson;
      try {
        libraryJson = JSON.parse(libEntry.getData().toString("utf8"));
      } catch (_) {
        return res.status(400).json({ error: "VALIDATION", message: "Invalid JSON in library/library.json" });
      }

      const mode = String(req.query.mode || "skip");
      const texts = Array.isArray(libraryJson.texts) ? libraryJson.texts : [];
      if (texts.length === 0) {
        return res.status(400).json({ error: "VALIDATION", message: "No texts found in ZIP" });
      }

      // Build audio metadata map from library.json
      const audioAssetsMeta = new Map();
      if (Array.isArray(libraryJson.audio_assets)) {
        for (const aa of libraryJson.audio_assets) {
          if (aa && aa.asset_key) audioAssetsMeta.set(String(aa.asset_key), aa);
        }
      }

      // Pre-import backup before mutating DB or extracting audio files.
      if (texts.length > 10) {
        try {
          const br = createBackup(DB_PATH, { label: "pre-import-bundle" });
          if (br.ok) { console.log("[import/bundle] backup:", br.backupPath); cleanupBackups(DEFAULT_MAX_BACKUPS); }
        } catch (_) {}
      }

      // Extract audio files to AUDIO_CACHE_DIR
      let importedAudio = 0;
      let skippedAudio = 0;
      for (const entry of zip.getEntries()) {
        const name = entry.entryName;
        if (entry.isDirectory || !isValidBundleAudioEntryName(name)) continue;
        const ak = path.basename(name, ".mp3");
        if (!/^[0-9a-f]{64}$/i.test(ak)) continue;

        const dest = path.join(AUDIO_CACHE_DIR, `${ak}.mp3`);
        if (fs.existsSync(dest)) { skippedAudio++; continue; }

        const tmpDest = `${dest}.${process.pid}.tmp`;
        try {
          const data = entry.getData();
          if (!data || data.length === 0) { skippedAudio++; continue; }
          fs.writeFileSync(tmpDest, data);
          fs.renameSync(tmpDest, dest);

          const meta = audioAssetsMeta.get(ak);
          const ttsProf = meta ? {
            providerId: meta.provider_id || "unknown",
            language: meta.language || "he",
            voiceName: meta.voice_name || null,
          } : null;
          await upsertAudioAsset({
            id: uuidv4(),
            assetKey: ak,
            assetType: "row",
            relativePath: getAudioRelativePath(ak),
            mime: (meta && meta.mime_type) || "audio/mpeg",
            durationMs: (meta && meta.duration_ms) || null,
            sizeBytes: data.length,
            ttsProfileJson: ttsProf ? JSON.stringify(ttsProf) : null,
          });
          importedAudio++;
        } catch (e) {
          try { if (fs.existsSync(tmpDest)) fs.unlinkSync(tmpDest); } catch (_) {}
          console.warn(`[import/bundle] audio extract failed ${ak}:`, e && e.message);
          skippedAudio++;
        }
      }

      let importedCount = 0, skippedCount = 0, errorCount = 0, linkedAudio = 0, importedNotes = 0, skippedNotes = 0;
      const errors = [];
      const pendingLinks = []; // { newTextId, orderIndex, audioAssetKey }
      const pendingNotes = []; // { newTextId, orderIndex, note }

      for (const item of texts) {
        try {
          // Unified format fields: source_text, title, level, tags, source_label, topic,
          // source_meta, table_model_meta, text_key, rows (row_id, order_index,
          // hebrew_plain, hebrew_niqqud, translit, translit_ru, russian, audio_asset_key),
          // text_audio_asset_key, is_archived
          const sourceText = String(item.source_text || "").trim();
          if (!sourceText) { errorCount++; errors.push({ error: "NO_SOURCE_TEXT", title: item.title }); continue; }

          const title = (item.title && String(item.title).trim()) ? String(item.title).trim() : guessTitle(sourceText);
          const level = item.level ? String(item.level).trim() || null : null;
          const source = item.source_label || null;
          const topic = item.topic || null;
          const tagsJson = JSON.stringify(v3NormalizeTags(Array.isArray(item.tags) ? item.tags : []));
          const sourceMetaJson = item.source_meta != null ? JSON.stringify(item.source_meta) : null;
          const tableModelMetaObj = item.table_model_meta || null;
          let tableModelMetaJson = tableModelMetaObj ? JSON.stringify(tableModelMetaObj) : null;

          let textKey = String(item.text_key || "").trim();
          if (!textKey) textKey = computeTextKey({ sourceText, ttsProfile: null, tableModelMeta: tableModelMetaObj });

          if (mode === "asNew") {
            const salt = uuidv4();
            const meta2 = tableModelMetaObj ? { ...tableModelMetaObj, importSalt: salt } : { importSalt: salt };
            textKey = computeTextKey({ sourceText, ttsProfile: null, tableModelMeta: meta2 });
            tableModelMetaJson = JSON.stringify(meta2);
          }

          const rowsIn = Array.isArray(item.rows) ? item.rows : [];
          if (rowsIn.length === 0) { errorCount++; errors.push({ error: "NO_SENTENCES", title }); continue; }

          const rows = rowsIn.map((r, idx) => ({
            id: uuidv4(),
            he_plain: String(r.hebrew_plain || ""),
            he_niqqud: String(r.hebrew_niqqud || ""),
            translit: String(r.translit || ""),
            ru: String(r.russian || ""),
            translit_ru: String(r.translit_ru || ""),
            row_hash: crypto.createHash("sha256").update(
              JSON.stringify({ hePlain: String(r.hebrew_plain || ""), heNiq: String(r.hebrew_niqqud || ""), translit: String(r.translit || ""), ru: String(r.russian || "") }), "utf8"
            ).digest("hex"),
            meta_json: null,
            order_index: Number.isInteger(r.order_index) ? r.order_index : idx,
            _audio_asset_key: (r.audio_asset_key && /^[0-9a-f]{64}$/.test(r.audio_asset_key)) ? r.audio_asset_key : null,
            _note: String(r.note || "").trim(),
          }));

          const newTextId = uuidv4();
          await createTextWithSentences({
            id: newTextId, textKey, title, level, tagsJson, sourceText,
            sourceMetaJson, ttsProfileJson: null, tableModelMetaJson,
            source, topic, isPinned: 0, pinOrder: null,
            rows: rows.map(({ _audio_asset_key, _note, ...r }) => r),
          });
          importedCount++;

          if (item.is_archived === true) { try { await archiveTextById(newTextId); } catch (_) {} }

          for (const r of rows) {
            if (r._audio_asset_key) pendingLinks.push({ newTextId, orderIndex: r.order_index, audioAssetKey: r._audio_asset_key, isText: false });
            if (r._note) pendingNotes.push({ newTextId, orderIndex: r.order_index, note: r._note });
          }
          const textAk = item.text_audio_asset_key;
          if (textAk && /^[0-9a-f]{64}$/.test(textAk)) pendingLinks.push({ newTextId, orderIndex: null, audioAssetKey: textAk, isText: true });
        } catch (e) {
          const msg = String(e && e.message ? e.message : e);
          const lc = msg.toLowerCase();
          if (msg.includes("ux_texts_text_key") || (lc.includes("text_key") && (lc.includes("unique") || lc.includes("duplicate")))) {
            skippedCount++;
          } else {
            errorCount++;
            errors.push({ error: msg });
          }
        }
      }

      // Restore sentence notes after imported sentences receive new local IDs.
      for (const note of pendingNotes) {
        try {
          const sents = await getSentencesByTextId(note.newTextId);
          const sent = sents.find((s) => s.order_index === note.orderIndex);
          if (!sent) { skippedNotes++; continue; }
          await upsertNote({ textId: note.newTextId, sentenceId: sent.id, note: note.note });
          importedNotes++;
        } catch (e) {
          skippedNotes++;
          console.warn("[import/bundle] note restore failed:", e && e.message);
        }
      }

      // Link audio to imported sentences
      for (const link of pendingLinks) {
        try {
          const asset = await getAudioAssetByKey(link.audioAssetKey);
          if (!asset) continue;
          if (link.isText) {
            await linkTextAudio(link.newTextId, asset.id, 1);
          } else {
            const sents = await getSentencesByTextId(link.newTextId);
            const sent = sents.find((s) => s.order_index === link.orderIndex);
            if (sent) { await linkSentenceAudio(sent.id, asset.id, 1); linkedAudio++; }
          }
        } catch (e) {
          console.warn("[import/bundle] link failed:", e && e.message);
        }
      }

      res.json({ ok: true, mode, importedCount, skippedCount, errorCount, importedAudio, skippedAudio, linkedAudio, importedNotes, skippedNotes, errors: errors.slice(0, 50) });
    } catch (e) {
      console.error("POST /api/library/import/bundle error:", e);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

// ── Direction 11.4: research-mode endpoint family ──────────────────────────
// Privacy-preserving opt-in research data ingestion for ulpan diploma
// project. See docs/ULPAN_RESEARCH_PLAN_v3_2.md §7.4 + RESEARCH_METRICS_SCHEMA.md.
//
// Architectural exception (master plan D4): aggregates only, never raw events.
// Strict schema validation, recursive forbidden-field check, no-PII logging.
const researchStorage = require("./research/storage");
const researchValidate = require("./research/validate");
const researchRateLimit = require("./research/rateLimit");
const rlResearchByIp = makeRateLimiter({ windowMs: 60_000, max: 60, name: "research-metrics" });
// Cohort creation is a privileged, internet-reachable surface — throttle it
// hard even when the admin secret is correct (defence-in-depth vs brute force).
const rlResearchAdmin = makeRateLimiter({ windowMs: 3_600_000, max: 10, name: "research-admin" });
const RESEARCH_UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Constant-time secret compare that tolerates differing lengths without
// leaking which side differs (timingSafeEqual throws on length mismatch).
function timingSafeStrEqual(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) {
    // Still run a compare to keep timing flat, then fail.
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function logResearch(req, fields) {
  // No-PII logging contract: only student_id / cohort / bytes / status fields.
  // Payload bodies and any raw text MUST NEVER reach the log stream.
  try {
    const parts = ["[research]", req.method, req.path];
    for (const k of Object.keys(fields || {})) parts.push(`${k}=${fields[k]}`);
    console.log(parts.join(" "));
  } catch {}
}

app.post("/api/research/v1/metrics", requireSameOriginJson, rlResearchByIp, async (req, res) => {
  try {
    let payload;
    try {
      payload = researchValidate.validatePayload(req.body, req.body);
    } catch (e) {
      if (e && e.code === "SCHEMA_VIOLATION") {
        logResearch(req, { status: 400, error: "SCHEMA_VIOLATION", field: e.field });
        return res.status(400).json({ ok: false, error: "SCHEMA_VIOLATION", field: e.field, message: e.message });
      }
      throw e;
    }
    if (!researchStorage.cohortExists(payload.cohort_code)) {
      logResearch(req, { status: 404, error: "COHORT_NOT_FOUND", cohort: payload.cohort_code });
      return res.status(404).json({ ok: false, error: "COHORT_NOT_FOUND" });
    }
    const meta = researchStorage.readCohortMeta(payload.cohort_code);
    if (researchValidate.compareSemver(payload.consent_version, meta.consent_version_minimum) < 0) {
      logResearch(req, { status: 400, error: "CONSENT_VERSION_BELOW_MIN", cohort: payload.cohort_code, given: payload.consent_version, required: meta.consent_version_minimum });
      return res.status(400).json({ ok: false, error: "CONSENT_VERSION_BELOW_MIN", required: meta.consent_version_minimum });
    }
    const rl = researchRateLimit.checkAndIncrement(payload.cohort_code, payload.student_id);
    if (!rl.allowed) {
      logResearch(req, { status: 429, error: "RATE_LIMIT", cohort: payload.cohort_code, student: payload.student_id, count: rl.count });
      return res.status(429).json({ ok: false, error: "RATE_LIMIT", limit: rl.limit, remaining: 0 });
    }
    const result = researchStorage.appendUpload(payload.cohort_code, payload);
    const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
    logResearch(req, { status: 200, cohort: payload.cohort_code, student: payload.student_id, upload_ts: payload.upload_ts, bytes, dedupe: result.dedupe });
    return res.status(200).json({
      ok: true,
      stored: result.stored,
      dedupe: result.dedupe,
      rate_limit_remaining: rl.remaining,
    });
  } catch (e) {
    console.error("[research] POST /metrics error:", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// Admin-gated cohort provisioning (Direction 11 — UI replacement for the
// create_cohort.js CLI). DISABLED by default: requires the operator to set
// RESEARCH_ADMIN_TOKEN in the environment. The teacher pastes that secret
// once in the teacher.html "Create cohort" form and chooses a memorable
// cohort code + researcher token (so neither can be "forgotten" — the
// teacher picked them). Same-origin + rate-limited + constant-time secret.
app.post("/api/research/v1/admin/cohort", requireSameOriginJson, rlResearchAdmin, async (req, res) => {
  try {
    const adminSecret = process.env.RESEARCH_ADMIN_TOKEN || "";
    if (!adminSecret) {
      // Safe default: feature is off until the operator opts in. Do not
      // reveal whether a secret would have worked.
      logResearch(req, { status: 503, error: "ADMIN_DISABLED" });
      return res.status(503).json({ ok: false, error: "ADMIN_DISABLED", message: "Cohort creation is disabled. Operator must set RESEARCH_ADMIN_TOKEN." });
    }
    const body = req.body || {};
    if (!timingSafeStrEqual(body.admin_token, adminSecret)) {
      logResearch(req, { status: 403, error: "BAD_ADMIN_TOKEN" });
      return res.status(403).json({ ok: false, error: "BAD_ADMIN_TOKEN" });
    }
    const code = String(body.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,16}$/.test(code)) {
      return res.status(400).json({ ok: false, error: "BAD_COHORT_CODE", message: "4–16 chars, [A-Z0-9-] only." });
    }
    const tokenPlain = String(body.researcher_token || "");
    if (tokenPlain.length < 16 || tokenPlain.length > 128) {
      return res.status(400).json({ ok: false, error: "BAD_RESEARCHER_TOKEN", message: "Researcher token must be 16–128 chars." });
    }
    if (researchStorage.cohortExists(code)) {
      logResearch(req, { status: 409, error: "COHORT_EXISTS", cohort: code });
      return res.status(409).json({ ok: false, error: "COHORT_EXISTS", message: `Cohort "${code}" already exists.` });
    }
    const retentionDays = Number(body.retention_days) > 0 ? Math.floor(Number(body.retention_days)) : 730;
    const kThresh = Number.isInteger(Number(body.k)) && Number(body.k) >= 2 ? Number(body.k) : 5;
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + retentionDays);
    const meta = researchStorage.createCohort({
      code,
      researcherTokenPlain: tokenPlain,
      retentionUntil: d.toISOString().slice(0, 10),
      outcomeScale: typeof body.outcome_scale === "string" && body.outcome_scale ? body.outcome_scale : "0-100",
      kAnonymityThreshold: kThresh,
      consentVersionMinimum: typeof body.consent_min === "string" && body.consent_min ? body.consent_min : "1.0",
    });
    // Never echo the token (or its hash). Teacher already has the plaintext
    // they typed; they log in with it next.
    logResearch(req, { status: 200, cohort: code, k: meta.k_anonymity_threshold });
    return res.status(200).json({
      ok: true,
      cohort: {
        code: meta.code,
        created_at: meta.created_at,
        k_anonymity_threshold: meta.k_anonymity_threshold,
        retention_until: meta.retention_until,
        outcome_scale: meta.outcome_scale,
        consent_version_minimum: meta.consent_version_minimum,
      },
    });
  } catch (e) {
    if (e && e.code === "COHORT_EXISTS") {
      return res.status(409).json({ ok: false, error: "COHORT_EXISTS" });
    }
    console.error("[research] POST /admin/cohort error:", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.get("/api/research/v1/cohort/:code/aggregates", async (req, res) => {
  try {
    const code = String(req.params.code || "");
    if (!/^[A-Z0-9-]{4,16}$/.test(code)) {
      return res.status(400).json({ ok: false, error: "BAD_COHORT_CODE" });
    }
    if (!researchStorage.cohortExists(code)) {
      return res.status(404).json({ ok: false, error: "COHORT_NOT_FOUND" });
    }
    const authHeader = String(req.headers.authorization || "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!bearer) {
      return res.status(401).json({ ok: false, error: "MISSING_BEARER_TOKEN" });
    }
    if (!researchStorage.verifyResearcherToken(code, bearer)) {
      logResearch(req, { status: 403, error: "BAD_TOKEN", cohort: code });
      return res.status(403).json({ ok: false, error: "BAD_RESEARCHER_TOKEN" });
    }
    const agg = researchStorage.aggregateCohort(code);
    logResearch(req, { status: 200, cohort: code, cohort_size: agg.cohort_size, k_met: agg.k_anonymity_met });
    return res.status(200).json({ ok: true, ...agg });
  } catch (e) {
    console.error("[research] GET /cohort/:code/aggregates error:", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// Phase 11.6 — teacher CSV upload of outcomes. Bearer-auth (researcher
// token); CSV body parsed via express.text middleware on this route only.
app.post(
  "/api/research/v1/cohort/:code/outcomes",
  express.text({ type: ["text/csv", "text/plain"], limit: "256kb" }),
  async (req, res) => {
    try {
      const code = String(req.params.code || "");
      if (!/^[A-Z0-9-]{4,16}$/.test(code)) {
        return res.status(400).json({ ok: false, error: "BAD_COHORT_CODE" });
      }
      if (!researchStorage.cohortExists(code)) {
        return res.status(404).json({ ok: false, error: "COHORT_NOT_FOUND" });
      }
      const authHeader = String(req.headers.authorization || "");
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
      if (!bearer) return res.status(401).json({ ok: false, error: "MISSING_BEARER_TOKEN" });
      if (!researchStorage.verifyResearcherToken(code, bearer)) {
        logResearch(req, { status: 403, error: "BAD_TOKEN", cohort: code });
        return res.status(403).json({ ok: false, error: "BAD_RESEARCHER_TOKEN" });
      }
      const csvText = typeof req.body === "string" ? req.body : "";
      if (!csvText.trim()) {
        return res.status(400).json({ ok: false, error: "EMPTY_BODY", message: "Send CSV body with header row 'student_id,...'" });
      }
      let rows;
      try {
        rows = researchStorage.parseOutcomesCsvText(csvText);
      } catch (e) {
        if (e && e.code === "BAD_CSV") {
          logResearch(req, { status: 400, error: "BAD_CSV", line: e.lineNumber, cohort: code });
          return res.status(400).json({ ok: false, error: "BAD_CSV", line: e.lineNumber, message: e.message });
        }
        throw e;
      }
      if (!rows.length) {
        return res.status(400).json({ ok: false, error: "NO_ROWS", message: "CSV had a header but no data rows" });
      }
      const result = researchStorage.writeOutcomesCsv(code, rows);
      logResearch(req, {
        status: 200, cohort: code, inserted: result.inserted, updated: result.updated, total: result.total,
      });
      return res.status(200).json({ ok: true, ...result });
    } catch (e) {
      console.error("[research] POST /cohort/:code/outcomes error:", e && e.message ? e.message : e);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  }
);

app.delete("/api/research/v1/student/:student_id", async (req, res) => {
  try {
    const sid = String(req.params.student_id || "");
    if (!RESEARCH_UUID_RE.test(sid)) {
      return res.status(400).json({ ok: false, error: "BAD_STUDENT_ID" });
    }
    // Optional cohort_code query narrows the scope. UUID alone is the auth
    // token (per master-plan D4 — student_id is anonymous, possession = auth).
    const explicitCohort = req.query.cohort_code ? String(req.query.cohort_code) : null;
    // Validate before the code reaches the filesystem (path-traversal guard; the
    // sibling create/aggregates/outcomes routes apply this same pattern).
    if (explicitCohort && !/^[A-Z0-9-]{4,16}$/.test(explicitCohort)) {
      return res.status(400).json({ ok: false, error: "BAD_COHORT_CODE" });
    }
    let cohorts;
    if (explicitCohort) {
      if (!researchStorage.cohortExists(explicitCohort)) {
        return res.status(404).json({ ok: false, error: "COHORT_NOT_FOUND" });
      }
      cohorts = [explicitCohort];
    } else {
      cohorts = researchStorage.findCohortsForStudent(sid);
    }
    let totalRemoved = 0;
    for (const c of cohorts) {
      totalRemoved += researchStorage.deleteStudentFromCohort(c, sid);
    }
    logResearch(req, { status: 200, student: sid, cohorts_touched: cohorts.length, removed: totalRemoved });
    return res.status(200).json({ ok: true, cohorts_touched: cohorts.length, records_removed: totalRemoved });
  } catch (e) {
    console.error("[research] DELETE /student/:student_id error:", e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// Global error handler — ensures all unhandled Express errors return JSON, never HTML.
// PAS-F1 BLOCKER-фикс (критика wf_59ca6197 F1-R16-01): body-parser вешает на JSON-parse-
// ошибку ПОЛНОЕ сырое тело запроса (enumerable err.body) — console.error(err) печатал бы
// BYOK/TTS/Gemini-ключи из битых запросов в контейнер-логи. Логируем ТОЛЬКО безопасные
// скалярные поля; err.body/err целиком — НИКОГДА.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // parse-ошибки: Node ≥19 кладёт СНИППЕТ ввода в SyntaxError.message — тоже редактируем
  const isParse = !!(err && err.type === "entity.parse.failed");
  const safeMsg = isParse ? "Invalid JSON body" : ((err && err.message) || "Internal server error");
  console.error("[server] unhandled error:", (err && err.type) || "", (err && err.status) || "", isParse ? "Invalid JSON body" : String(safeMsg).slice(0, 200));
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: safeMsg });
});

// --------------------------------------------------------
// 13. ЗАПУСК СЕРВЕРА
// --------------------------------------------------------
// BIND_HOST (P8.6, критика r14): hermetic-гейты поднимают write-enabled инстанс и обязаны
// мочь запереть его на loopback; без env — прежнее поведение (все интерфейсы, за Traefik).
app.listen(PORT, process.env.BIND_HOST || undefined, () => {
  console.log(`Server is running on port ${PORT}`);
});
