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
require("dotenv").config({ path: path.join(__dirname, ".env") });

const {
  DATA_DIR,
  DB_PATH,
  USAGE_FILE,
  AUDIO_CACHE_DIR,
  GEMINI_CACHE_DIR,
  BACKUPS_DIR,
} = require("./storage");

// v3.0 foundation: SQLite (Library/Progress source of truth)
const { initDb, getDbHealth, ensureAudioAssetsDurationMsColumn } = require("./db/sqlite");

const { runMigrations, getMigrationsHealth } = require("./db/migrate");
const { startupCheck } = require("./db/integrity");
const { createBackup, cleanupBackups, DEFAULT_MAX_BACKUPS } = require("./db/backup");

const textToSpeech = require("@google-cloud/text-to-speech");
const { GoogleGenerativeAI } = require("@google/generative-ai");
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

app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

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

// --------------------------------------------------------
// V3 Audio Assets helpers (P0)
// --------------------------------------------------------
const TTS_ENGINE_VERSION = "gcp-tts-v1"; // bump when you change engine/ssml normalization etc.

function ensureAudioCacheDir() {
  try {
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
    if (!fs.existsSync(audioCacheDir)) fs.mkdirSync(audioCacheDir, { recursive: true });
  } catch (e) {
    console.error("ensureAudioCacheDir failed:", e);
  }
}

function stableStringify(obj) {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== "object") return JSON.stringify(obj);
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

function normalizeTtsProfile(profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  return {
    language: p.language || null,
    voiceName: p.voiceName || null,
    speakingRate: (p.speakingRate == null ? 1.0 : Number(p.speakingRate)),
    pitch: (p.pitch == null ? 0.0 : Number(p.pitch)),
  };
}

function computeAssetKey({ text, ttsProfile, assetType }) {
  const payload = {
    assetType: String(assetType || "row"),
    engine: TTS_ENGINE_VERSION,
    ttsProfile: normalizeTtsProfile(ttsProfile),
    text: String(text || ""),
  };
  return crypto.createHash("sha256").update(stableStringify(payload), "utf8").digest("hex");
}

function getAudioRelativePath(assetKey) {
  return `audio-cache/${assetKey}.mp3`;
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
app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    now: new Date().toISOString(),
    db: getDbHealth(),
	migrations: getMigrationsHealth(),
	
	dataDir: DATA_DIR,
    dbPath: DB_PATH,
    backupsDir: BACKUPS_DIR,
  });
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
let ttsServiceAccount = null;
const ttsCredentialsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();

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

const ttsClient = ttsServiceAccount
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

// 4.2. Gemini
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
let genAI = null;
if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
} else {
  console.warn("[Gemini] GEMINI_API_KEY / GOOGLE_API_KEY не задан — AI translation отключен");
}

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

async function synthesizeWithCache(
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

  if (fs.existsSync(cachePath)) {
    const audioContent = fs.readFileSync(cachePath).toString("base64");
    return { audioContent, fromCache: true, cacheId: hash };
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

      // Важно: response.audioContent — это Buffer.
      const [resp] = await ttsClient.synthesizeSpeech(requestPart);
      if (!resp || !resp.audioContent) {
        throw new Error("TTS: empty audioContent for chunk #" + (i + 1));
      }
      buffers.push(Buffer.from(resp.audioContent));
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

  const [response] = await ttsClient.synthesizeSpeech(request);
  const audioContent = response.audioContent.toString("base64");

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
  text,
  languageCode,
  voiceName,
  speakingRate,
  pitch
) {
  const clean = String(text || "").trim();
  if (!clean) return Buffer.alloc(0);

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

      const [resp] = await ttsClient.synthesizeSpeech(requestPart);
      if (!resp || !resp.audioContent) {
        throw new Error("TTS: empty audioContent for chunk #" + (i + 1));
      }
      buffers.push(Buffer.from(resp.audioContent));
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

  const [response] = await ttsClient.synthesizeSpeech(request);
  if (!response || !response.audioContent) {
    throw new Error("TTS: empty audioContent");
  }
  return Buffer.from(response.audioContent);
}

async function ensureAudioAsset(params) {
  const {
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

// --------------------------------------------------------
// 7. API: TTS (Google Cloud TTS + серверный кэш)
// --------------------------------------------------------
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

// v3 mode is enabled only when linking is requested (keeps legacy calls unchanged)
const hasV3Context = !!(v3SentenceId || v3TextId);

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
      nodeEnv: process.env.NODE_ENV || null,
hasGoogleCredentials:!!process.env.GOOGLE_APPLICATION_CREDENTIALS || !!process.env.GOOGLE_CLOUD_TTS_KEY,
    });

    // --------------------------------------------------------
// Step 8.2 routing:
// - legacy: synthesizeWithCache (старый hash cacheId)
// - v3: ensureAudioAsset (stable asset_key + mp3 file + DB upsert + linking)
// --------------------------------------------------------
let audioContent, fromCache, cacheId, assetKeyOut, relativePathOut;

if (hasV3Context) {
  const ensured = await ensureAudioAsset({
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
    console.error("[/api/tts] Ошибка TTS", {
      requestId,
      message: error && error.message,
      name: error && error.name,
      code: error && error.code,
      status: error && error.status,
      details: error && error.details,
      stack: error && error.stack,
      nodeEnv: process.env.NODE_ENV || null,
      hasGoogleCredentials:!!process.env.GOOGLE_APPLICATION_CREDENTIALS || !!process.env.GOOGLE_CLOUD_TTS_KEY,

    });

    const safeDetails = {
      requestId,
      message: (error && error.message) || "Неизвестная ошибка TTS",
      code: (error && error.code) || null,
      status: (error && error.status) || null,
    };

    return res.status(500).json({
      error: "Ошибка TTS",
      details: safeDetails,
    });
  }
});

// --------------------------------------------------------
// 8.3 API: Stream MP3 by assetKey (V3 audio assets)
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

  // Best-effort DB touch (do not block streaming)
  try {
    const h = typeof getDbHealth === "function" ? getDbHealth() : null;
    if (h && h.ok && typeof touchAudioAsset === "function") {
      touchAudioAsset(assetKey).catch(() => {});
    }
  } catch (_) {}

  // Resolve file relative path (prefer DB relative_path if present; fallback to deterministic)
  let rel = (typeof getAudioRelativePath === "function")
    ? getAudioRelativePath(assetKey)
    : `audio-cache/${assetKey}.mp3`;

  try {
    const h = typeof getDbHealth === "function" ? getDbHealth() : null;
    if (h && h.ok && typeof getAudioAssetByKey === "function") {
      const row = await getAudioAssetByKey(assetKey);
      if (row && row.relative_path) rel = String(row.relative_path);
    }
  } catch (_) {}

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
app.post("/api/audio/prefetch/start", async (req, res) => {
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
// 9. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ GEMINI
// --------------------------------------------------------
function buildRowsFromGeminiPayload(parsed) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Пустой ответ от Gemini");
  }

  const rows = Array.isArray(parsed.rows) ? parsed.rows : null;
  const segments = Array.isArray(parsed.segments) ? parsed.segments : null;

  if (!rows || rows.length === 0) {
    throw new Error("Пустой массив rows");
  }

  const segMap = new Map();
  if (segments && segments.length > 0) {
    segments.forEach((seg, idx) => {
      if (!seg || typeof seg !== "object") return;
      let index = seg.index;
      if (
        typeof index !== "number" ||
        !Number.isFinite(index) ||
        index <= 0
      ) {
        index = idx + 1;
      }
      const heBase = (seg.he || "").trim();
      if (heBase) {
        segMap.set(index, heBase);
      }
    });
  }

  const preparedRows = rows.map((row, idx) => {
    if (!row || typeof row !== "object") row = {};
    let segIndex = row.segment_index;
    if (
      typeof segIndex !== "number" ||
      !Number.isFinite(segIndex) ||
      segIndex <= 0
    ) {
      segIndex = idx + 1;
    }

    let heBase = segMap.get(segIndex);
    if (!heBase) {
      heBase = (row.he || "").trim();
    }

    return {
      segmentId: segIndex,
      he: heBase || "",
      he_niqqud: row.he_niqqud || "",
      translit: row.translit || "",
      ru: row.ru || "",
    };
  });

  return preparedRows;
}

// --------------------------------------------------------
// 10. API: TRANSLATE (Gemini -> таблица)
// --------------------------------------------------------
app.post("/api/translate-table", async (req, res) => {
  try {
    const { text } = req.body || {};

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Нет текста" });
    }

    if (!genAI) {
      return res.status(500).json({ error: "API Key не найден" });
    }

    const cleanText = text.trim();

    const hashInput = `he-ru-table-v1||${cleanText}`;
    const hashKey = crypto.createHash("sha256").update(hashInput).digest("hex");
    const cacheFile = path.join(geminiCacheDir, `${hashKey}.json`);

    if (fs.existsSync(cacheFile)) {
      try {
        const rawCache = fs.readFileSync(cacheFile, "utf8");
        const cached = JSON.parse(rawCache);
        if (cached && Array.isArray(cached.rows)) {
          return res.json({
            rows: cached.rows,
            fromCache: true,
            cacheKey: hashKey,
            cachedAt: cached.createdAt || null,
          });
        }
      } catch (e) {
        console.error("Ошибка чтения/парсинга кэша Gemini:", e);
      }
    }

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
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
- Always return ALL data inside a single JSON object exactly in the format above.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

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
      });
    }

    let preparedRows;
    try {
      preparedRows = buildRowsFromGeminiPayload(parsed);
    } catch (e) {
      console.error("Gemini payload error:", e);
      return res.status(500).json({
        error: "Неверный формат данных от Gemini",
        raw: rawText,
        details: e.message,
      });
    }

    const cachePayload = {
      text: cleanText,
      rows: preparedRows,
      createdAt: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(cachePayload, null, 2), "utf8");
    } catch (e) {
      console.error("Ошибка записи в кэш Gemini:", e);
    }

    updateUsage("gemini", 1);

    res.json({
      rows: preparedRows,
      fromCache: false,
      cacheKey: hashKey,
      cachedAt: cachePayload.createdAt,
    });
  } catch (error) {
    console.error("Gemini Error:", error);

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
// 10b. API: PREMIUM AI TRANSLATE (v2, behind PREMIUM_V2 flag)
// --------------------------------------------------------
const PREMIUM_V2_ENABLED = process.env.PREMIUM_V2 === "1";

if (PREMIUM_V2_ENABLED) {
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

  app.post("/api/translate-table-v2", async (req, res) => {
    try {
      const {
        text,
        target_lang = "ru",
        provider = "madlad",
        text_id = null,
        note = null,
      } = req.body || {};

      const out = await premiumPipeline.translateTable({
        text,
        target_lang,
        provider,
        text_id,
        note,
      });

      res.json(out);
    } catch (e) {
      if (e.code === "BAD_INPUT") {
        return res.status(400).json({ error: e.message });
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
      // Python sidecar (ai-local) не запущен. Встречается только при provider=madlad
      // — для GCP пайплайн мягко обходит недоступность и лишь теряет огласовку/транслит.
      if (e.kind === "sidecar_down") {
        return res.status(503).json({
          error: "Python sidecar (ai-local) не запущен",
          details: e.message,
          hint: "Запустите ai-local (uvicorn) на 127.0.0.1:8765 или выберите провайдер GCP Translate",
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
        madlad: { configured: true /* always available via sidecar */ },
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
      let project_id = null, client_email = null;
      try {
        const raw = JSON.parse(fs.readFileSync(keyFile, "utf8"));
        project_id = raw.project_id || null;
        client_email = raw.client_email || null;
      } catch (_) {}
      res.json({ configured: true, source, project_id, client_email });
    } catch (e) {
      res.status(500).json({ error: "Не удалось прочитать статус GCP ключа", details: e.message });
    }
  });

  app.post("/api/premium/gcp-key", (req, res) => {
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

  app.delete("/api/premium/gcp-key", (_req, res) => {
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

  console.log("[premium] /api/translate-table-v2 enabled (PREMIUM_V2=1)");
}

// --------------------------------------------------------
// 11a. API: DIAGNOSTICS (aggregated system status for the Dashboard panel)
// --------------------------------------------------------
app.get("/api/diag", async (_req, res) => {
  const { getDb } = require("./db/sqlite");
  const {
    SEGMENTER_VERSION, NIKUD_VERSION, TRANSLIT_PROFILE_VERSIONS, TRANSLATOR_VERSIONS,
  } = require("./db/premium/versions");
  const pythonClient = require("./db/premium/pythonClient");

  // ── 1. Sidecar health (non-blocking, short timeout) ──────────────────────
  let sidecar = { ok: false, status: 0, models: null };
  try {
    const r = await pythonClient.healthz();
    sidecar.ok = !!r.ok;
    sidecar.status = r.status || 0;
    if (r.ok) {
      const m = await pythonClient.modelsStatus();
      if (m.ok && m.body) sidecar.models = m.body;
    }
  } catch (_) {}

  // ── 2. Premium providers ─────────────────────────────────────────────────
  let providers = { gcp: { configured: false, quota: null }, madlad: { configured: true } };
  if (PREMIUM_V2_ENABLED) {
    try {
      const premiumGcp   = require("./db/premium/providers/gcp");
      const premiumQuota = require("./db/premium/quota");
      providers.gcp.configured = premiumGcp.isAvailable();
      providers.gcp.quota      = premiumQuota.getGcpStatus();
    } catch (_) {}
  }

  // ── 3. DB stats (cache + library) ────────────────────────────────────────
  let db_stats = null;
  try {
    const db = getDb();
    const q = (sql) => new Promise((ok, err) =>
      db.get(sql, [], (e, r) => e ? err(e) : ok(r)));

    const [docCache, segCache, overrides, texts, textsActive, sentences, provRows] =
      await Promise.all([
        q("SELECT COUNT(*) AS n FROM translation_doc_cache"),
        q("SELECT COUNT(*) AS n FROM translation_segment_cache"),
        q("SELECT COUNT(*) AS n FROM translation_overrides"),
        q("SELECT COUNT(*) AS n FROM texts"),
        q("SELECT COUNT(*) AS n FROM texts WHERE archived = 0 OR archived IS NULL"),
        q("SELECT COUNT(*) AS n FROM sentences"),
        new Promise((ok) =>
          db.all(
            "SELECT provider, COUNT(*) AS n FROM texts GROUP BY provider",
            [],
            (e, rows) => ok(e ? [] : (rows || []))
          )
        ),
      ]);

    db_stats = {
      doc_cache:   docCache?.n  ?? 0,
      seg_cache:   segCache?.n  ?? 0,
      overrides:   overrides?.n ?? 0,
      texts:       texts?.n     ?? 0,
      texts_active: textsActive?.n ?? 0,
      sentences:   sentences?.n ?? 0,
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

  res.json({ ok: true, sidecar, providers, db_stats, versions, ts: new Date().toISOString() });
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
app.get("/api/progress/:textId", async (req, res) => {
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

app.post("/api/progress/:textId", async (req, res) => {
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
app.get("/api/library/texts", async (req, res) => {
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
app.post("/api/library/texts", async (req, res) => {
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
app.put("/api/library/texts/:id", express.json({ limit: "2mb" }), async (req, res) => {
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
app.get("/api/library/texts/:id", async (req, res) => {
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
app.get("/api/library/texts/:id/sentences", async (req, res) => {
  try {
    if (!requireDbOr503(res)) return;

    const text = await getTextById(req.params.id);
    if (!text) return res.status(404).json({ error: "TEXT_NOT_FOUND" });

    const sentences = await getSentencesByTextId(req.params.id);

    // Enrich each sentence with translit_ru (Russian phonetic) computed from he_niqqud.
    // Kept out of the DB to avoid a migration; deterministic and fast (pure JS, no I/O).
    const { transliterateWithProfile } = require("./db/premium/translit");
    const enriched = sentences.map((s) => {
      const heNiqqud = s.he_niqqud || s.heNiqqud || "";
      return Object.assign({}, s, {
        translit_ru: heNiqqud ? (transliterateWithProfile(heNiqqud, "ru-phonetic") || "") : "",
      });
    });

    res.json({ ok: true, textId: req.params.id, sentences: enriched });
  } catch (e) {
    console.error("GET /api/library/texts/:id/sentences error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

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
app.get("/api/library/texts/:id/notes", async (req, res) => {
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
app.put("/api/library/texts/:id/notes/:sentenceId", async (req, res) => {
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
app.delete("/api/library/texts/:id/notes/:sentenceId", async (req, res) => {
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
app.get("/api/notes/search", async (req, res) => {
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
app.get("/api/sentences/search", async (req, res) => {
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
app.get("/api/nav/resolve", async (req, res) => {
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
app.get("/api/srs/templates", async (req, res) => {
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

app.get("/api/srs/cards", async (req, res) => {
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

app.post("/api/srs/cards", async (req, res) => {
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

app.post("/api/srs/cards/generate", async (req, res) => {
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

app.post("/api/srs/review", async (req, res) => {
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

app.get("/api/srs/cards/:id/trainer-view", async (req, res) => {
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

app.post("/api/srs/attempts/check", async (req, res) => {
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

app.get("/api/srs/today", async (req, res) => {
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

app.get("/api/srs/today/summary", async (req, res) => {
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

app.post("/api/srs/sessions", async (req, res) => {
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

app.get("/api/srs/sessions/:id", async (req, res) => {
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

app.get("/api/srs/sessions/:id/next", async (req, res) => {
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

app.post("/api/srs/sessions/:id/review", async (req, res) => {
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

app.post("/api/srs/sessions/:id/finish", async (req, res) => {
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
app.get("/api/library/texts/:id/export/docx", async (req, res) => {
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

// --------------------------------------------------------
// Export Anki CSV (W10-EXPORT-ANKI-01)
// --------------------------------------------------------
app.get("/api/library/texts/:id/export/anki", async (req, res) => {
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

app.get("/api/srs/export/status", async (req, res) => {
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

app.get("/api/srs/export/anki/preview", async (req, res) => {
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

app.post("/api/srs/export/anki", async (req, res) => {
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

app.post("/api/library/texts/:id/push/anki", async (req, res) => {
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
app.post("/api/library/texts/:id/opened", async (req, res) => {
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
app.patch("/api/library/texts/:id/meta", express.json({ limit: "64kb" }), async (req, res) => {
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
app.post("/api/history/event", express.json({ limit: "64kb" }), async (req, res) => {
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
	app.get("/api/history/recent-texts", async (req, res) => {
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
app.get("/api/history/recent-activity", async (req, res) => {
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
app.get("/api/history/analytics", async (req, res) => {
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
app.get("/api/history/texts/:textId/recent-rows", async (req, res) => {
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
app.post("/api/library/texts/:id/archive", async (req, res) => {
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

app.delete("/api/library/texts/:id", async (req, res) => {
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
app.post("/api/library/import", async (req, res) => {
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


// --------------------------------------------------------
// 13. ЗАПУСК СЕРВЕРА
// --------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
