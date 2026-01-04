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

// v3.0 foundation: SQLite (Library/Progress source of truth)
const { initDb, getDbHealth, ensureAudioAssetsDurationMsColumn } = require("./db/sqlite");

const { runMigrations, getMigrationsHealth } = require("./db/migrate");

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
  upsertAudioAsset,
  getAudioAssetByKey,
  touchAudioAsset,
  linkSentenceAudio,
  linkTextAudio,
  getSentenceAudio,
  getTextAudio,
} = require("./db/audioRepo");

const {
  listNotesByTextId,
  getNote,
  upsertNote,
  deleteNote,
} = require("./db/notesRepo");

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
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "app.db");
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
  })
  .catch((e) => {
    // initDb уже safe и отражает ошибку в health; сюда обычно не попадаем
    console.error("initDb unexpected error:", e);
  });

// --------------------------------------------------------
// 3. ПУТИ И ДИРЕКТОРИИ
// --------------------------------------------------------
const audioDir = path.join(__dirname, "audio");
const usageFile = path.join(__dirname, "usage.json");
const audioCacheDir = path.join(__dirname, "audio-cache");
const geminiCacheDir = path.join(__dirname, "gemini-cache");

// --------------------------------------------------------
// V3 Audio Assets helpers (P0)
// --------------------------------------------------------
const TTS_ENGINE_VERSION = "gcp-tts-v1"; // bump when you change engine/ssml normalization etc.

function ensureAudioCacheDir() {
  try {
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

// 4.1. Google Cloud TTS — креды из переменной GOOGLE_CLOUD_TTS_KEY
let ttsServiceAccount = null;

if (process.env.GOOGLE_CLOUD_TTS_KEY) {
  try {
    ttsServiceAccount = JSON.parse(process.env.GOOGLE_CLOUD_TTS_KEY);
    console.log("[TTS] GOOGLE_CLOUD_TTS_KEY загружен и успешно разобран как JSON");
  } catch (e) {
    console.error("[TTS] Невозможно разобрать GOOGLE_CLOUD_TTS_KEY как JSON:", e);
    ttsServiceAccount = null;
  }
} else {
  console.warn("[TTS] Переменная GOOGLE_CLOUD_TTS_KEY не задана — будет попытка использовать дефолтные креды");
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
  ttsServiceAccount ? "service_account из GOOGLE_CLOUD_TTS_KEY" : "Application Default Credentials"
);

// 4.2. Gemini
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
let genAI = null;
if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
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

  const relativePath = getAudioRelativePath(assetKey);
  const absPath = path.join(__dirname, relativePath);

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
        if (sentenceId) {
          await linkSentenceAudio(String(sentenceId), String(row.id), 1);
        }
        if (textId) {
          await linkTextAudio(String(textId), String(row.id), 1);
        }
      }
    }
  } catch (e) {
    console.warn("[v3-audio] db upsert/link failed (non-fatal)", {
      assetKey,
      message: e && e.message,
    });
  }

  const audioContent = mp3Buffer ? mp3Buffer.toString("base64") : "";
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
  const absPath = path.resolve(__dirname, rel);

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

    // tags: accept array or CSV string; normalize and store as JSON array
		let tagsJson = null;
		try {
			const normTags = v3NormalizeTags(body.tags);
			if (normTags.length) tagsJson = JSON.stringify(normTags);
		} catch (_) {}


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
    const tagsJson = (tags && tags.length) ? JSON.stringify(tags) : null;

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
    if (!text) return res.status(404).json({ error: "NOT_FOUND" });

    const sentences = await getSentencesByTextId(req.params.id);
    res.json({ ok: true, textId: req.params.id, sentences });
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

function normalizeNoteDto(r) {
  if (!r) return null;
  return {
    sentenceId: String(r.sentenceId ?? r.sentence_id ?? ""),
    note: String(r.note ?? ""),
    updatedAt: r.updatedAt ?? r.updated_at ?? null,
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
      } catch (e2) {
        // если sentence не в text => 404 обязателен
        if (e2 && (e2.code === "SENTENCE_NOT_IN_TEXT")) {
          return res.status(404).json({ error: "SENTENCE_NOT_IN_TEXT" });
        }
        // если просто "не было заметки" — считаем ok
      }
      return res.json({ ok: true, deleted: true });
    }

    if (note.length > 16000) return res.status(400).json({ error: "NOTE_TOO_LONG" });

    let saved = null;
    try {
      saved = await upsertNote({ textId, sentenceId, note });
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
    } catch (e2) {
      if (e2 && (e2.code === "SENTENCE_NOT_IN_TEXT")) {
        return res.status(404).json({ error: "SENTENCE_NOT_IN_TEXT" });
      }
      throw e2;
    }

    return res.json({ ok: true });
  } catch (e) {
    console.warn("DELETE note failed", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
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
    items = raw.split(","); // CSV
  } else {
    return [];
  }

  const out = [];
  const seen = new Set();

  for (const it of items) {
    const t = String(it || "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 25) break; // защита от мусора
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
      patch.tagsJson = tagsArr.length ? JSON.stringify(tagsArr) : null;
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
    const topTexts = await listTopTextsByPlays({ days, limit: 8, includeArchived, level });

    return res.json({ ok: true, period, all, topTexts });
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
        const tagsJson = Array.isArray(tagsArr) ? JSON.stringify(tagsArr) : null;

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
