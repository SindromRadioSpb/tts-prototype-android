// --------------------------------------------------------
// 1. ИМПОРТЫ
// --------------------------------------------------------
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

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
} = require("docx");

// --------------------------------------------------------
// 1.0. КОНФИГ ЛИМИТОВ GEMINI
// --------------------------------------------------------
// Суточный лимит запросов к Gemini (по умолчанию 20 — Free Tier)
const GEMINI_DAILY_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT || "20");

// Час суточного сброса квоты в UTC (например, 0 = 00:00 UTC)
const GEMINI_RESET_HOUR_UTC = Number(
  process.env.GEMINI_RESET_HOUR_UTC || "0"
);

// Название модели и тип тарифа (для UI)
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || "Gemini 2.5 Flash";
const GEMINI_BILLING_TIER = process.env.GEMINI_BILLING_TIER || "free";

// --------------------------------------------------------
// 1.1. КОНФИГ ЦЕНЫ И НАСТРОЕК TTS
// --------------------------------------------------------

// Стоимость TTS за 1M символов (USD) — указать свой тариф Google Cloud
const TTS_PRICE_PER_1M_CHARS_USD = Number(
  process.env.TTS_PRICE_PER_1M_CHARS_USD || "4.00"
);

// Значения по умолчанию для TTS
const TTS_DEFAULT_VOICE = process.env.TTS_DEFAULT_VOICE || "";
const TTS_DEFAULT_RATE = Number(process.env.TTS_DEFAULT_RATE || "1.0");
const TTS_DEFAULT_PITCH = Number(process.env.TTS_DEFAULT_PITCH || "0.0");

// --------------------------------------------------------
// 1.2. ЗАГРУЗКА КЛЮЧА GOOGLE CLOUD ИЗ ПЕРЕМЕННОЙ ОКРУЖЕНИЯ
// --------------------------------------------------------

if (process.env.GOOGLE_CLOUD_TTS_KEY) {
  const keyPath = path.join(__dirname, "gcp-key.json");

  // Если файла ещё нет — создаём
  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, process.env.GOOGLE_CLOUD_TTS_KEY);
  }

  // Сообщаем SDK, где лежит ключ
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
}

// --------------------------------------------------------
// 2. ИНИЦИАЛИЗАЦИЯ СЕРВЕРА И СТАТИКИ
// --------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const audioDir = path.join(__dirname, "audio");
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}
app.use("/audio", express.static(audioDir));

// Директория серверного кэша MP3 (по хэшу текста + настроек)
const audioCacheDir = path.join(__dirname, "audio-cache");
if (!fs.existsSync(audioCacheDir)) {
  fs.mkdirSync(audioCacheDir, { recursive: true });
}

// Директория серверного кэша Gemini (по хэшу текста)
const geminiCacheDir = path.join(__dirname, "gemini-cache");
if (!fs.existsSync(geminiCacheDir)) {
  fs.mkdirSync(geminiCacheDir, { recursive: true });
}

// --------------------------------------------------------
// 2.1. СИСТЕМА УЧЁТА ИСПОЛЬЗОВАНИЯ
// --------------------------------------------------------
const USAGE_FILE = path.join(__dirname, "usage.json");

// Хелпер: вычислить начало текущего "дня квоты" по UTC+час сброса
function getCurrentQuotaDayStartISO() {
  const now = new Date();

  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDate = now.getUTCDate();

  // Момент сегодняшнего ресета в UTC
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
    // Уже после сегодняшнего ресета — день квоты начался сегодня
    quotaDayStartMs = todayResetMs;
  } else {
    // Ещё до ресета — день квоты начался вчера в это же время
    quotaDayStartMs = todayResetMs - 24 * 60 * 60 * 1000;
  }

  return new Date(quotaDayStartMs).toISOString();
}

// Получить "пустую" структуру статистики
function getEmptyUsage() {
  return {
    ttsChars: 0, // Символов TTS (всего, реально отправленных в Google)
    ttsFirstUseAt: null, // Первый вызов TTS
    ttsLastUseAt: null, // Последний вызов TTS
    geminiRequests: 0, // Запросов к Gemini (всего)
    geminiRequestsToday: 0, // Запросов к Gemini за текущий день квоты
    geminiDayStart: getCurrentQuotaDayStartISO(), // Начало текущего дня квоты
    lastDailyLimitHitAt: null, // Когда последний раз словили daily-limit
  };
}

// Нормализовать структуру статистики (добавить недостающие поля + сбросить день)
function normalizeUsage(stats) {
  const base = getEmptyUsage();

  const merged = {
    ...base,
    ...(stats || {}),
  };

  const currentDayStartISO = getCurrentQuotaDayStartISO();
  const currentDayStartMs = Date.parse(currentDayStartISO);
  const storedDayStartMs = merged.geminiDayStart
    ? Date.parse(merged.geminiDayStart)
    : 0;

  // Если сохранённый день квоты "старее" текущего — сбрасываем суточный счётчик
  if (!merged.geminiDayStart || storedDayStartMs < currentDayStartMs) {
    merged.geminiRequestsToday = 0;
    merged.geminiDayStart = currentDayStartISO;
    merged.lastDailyLimitHitAt = null;
  }

  return merged;
}

// Получить текущую статистику
function getUsage() {
  if (!fs.existsSync(USAGE_FILE)) {
    const empty = getEmptyUsage();
    try {
      fs.writeFileSync(USAGE_FILE, JSON.stringify(empty, null, 2), "utf8");
    } catch (e) {
      console.error("Ошибка первичной записи usage.json:", e);
    }
    return empty;
  }

  try {
    const raw = fs.readFileSync(USAGE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const normalized = normalizeUsage(parsed);

    // На всякий случай синхронизируем файл с нормализованной структурой
    try {
      fs.writeFileSync(
        USAGE_FILE,
        JSON.stringify(normalized, null, 2),
        "utf8"
      );
    } catch (e) {
      console.error("Ошибка синхронизации usage.json:", e);
    }

    return normalized;
  } catch (e) {
    console.error("Ошибка чтения usage.json:", e);
    const empty = getEmptyUsage();
    try {
      fs.writeFileSync(USAGE_FILE, JSON.stringify(empty, null, 2), "utf8");
    } catch (err) {
      console.error("Ошибка записи usage.json после сбоя:", err);
    }
    return empty;
  }
}

// Обновить статистику (tts или gemini)
function updateUsage(type, amount = 1) {
  const stats = getUsage(); // уже нормализованный
  const nowIso = new Date().toISOString();

  if (type === "tts") {
    stats.ttsChars += amount;
    if (!stats.ttsFirstUseAt) {
      stats.ttsFirstUseAt = nowIso;
    }
    stats.ttsLastUseAt = nowIso;
  } else if (type === "gemini") {
    // считаем и общий, и суточный счётчики
    stats.geminiRequests += amount;
    stats.geminiRequestsToday += amount;
  }

  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(stats, null, 2), "utf8");
  } catch (e) {
    console.error("Ошибка записи usage.json:", e);
  }
}

// Отметить, что сегодня словили daily-limit (для UI)
function markGeminiDailyLimitHit() {
  const stats = getUsage();
  const nowIso = new Date().toISOString();

  stats.lastDailyLimitHitAt = nowIso;

  // Опционально "дожимаем" суточный счётчик до лимита
  if (stats.geminiRequestsToday < GEMINI_DAILY_LIMIT) {
    stats.geminiRequestsToday = GEMINI_DAILY_LIMIT;
  }

  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(stats, null, 2), "utf8");
  } catch (e) {
    console.error("Ошибка записи usage.json при daily-limit:", e);
  }
}

// --------------------------------------------------------
// 3. КЛИЕНТЫ ВНЕШНИХ API
// --------------------------------------------------------
const ttsClient = new textToSpeech.TextToSpeechClient();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// --------------------------------------------------------
// 4. API ЭНДПОИНТЫ
// --------------------------------------------------------

// --- API: Healthcheck (удобно для Android/WebView и Railway) ---
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    ttsConfigured: !!process.env.GOOGLE_CLOUD_TTS_KEY,
    geminiConfigured: !!GEMINI_API_KEY,
  });
});

// --- API: Получить статистику для фронтенда ---
app.get("/api/usage", (req, res) => {
  const stats = getUsage();

  let geminiNextResetAt = null;
  try {
    const dayStartMs = stats.geminiDayStart
      ? Date.parse(stats.geminiDayStart)
      : Date.parse(getCurrentQuotaDayStartISO());
    if (!Number.isNaN(dayStartMs)) {
      geminiNextResetAt = new Date(
        dayStartMs + 24 * 60 * 60 * 1000
      ).toISOString();
    }
  } catch (e) {
    console.error("Ошибка вычисления geminiNextResetAt:", e);
  }

  // Расчёт примерной стоимости TTS
  const pricePer1M = TTS_PRICE_PER_1M_CHARS_USD > 0 ? TTS_PRICE_PER_1M_CHARS_USD : 0;
  let ttsCostTotalUsd = null;
  let ttsMonthlyEstimateUsd = null;

  if (pricePer1M > 0) {
    ttsCostTotalUsd = (stats.ttsChars / 1_000_000) * pricePer1M;

    if (stats.ttsFirstUseAt) {
      const firstMs = Date.parse(stats.ttsFirstUseAt);
      const nowMs = Date.now();
      if (!Number.isNaN(firstMs) && nowMs > firstMs) {
        const days = Math.max(1, (nowMs - firstMs) / (24 * 60 * 60 * 1000));
        const avgCharsPerDay = stats.ttsChars / days;
        const monthlyChars = avgCharsPerDay * 30;
        ttsMonthlyEstimateUsd = (monthlyChars / 1_000_000) * pricePer1M;
      }
    }
  }

  res.json({
    ...stats,
    geminiDailyLimit: GEMINI_DAILY_LIMIT,
    geminiResetHourUtc: GEMINI_RESET_HOUR_UTC,
    geminiNextResetAt,
    geminiModelName: GEMINI_MODEL_NAME,
    geminiBillingTier: GEMINI_BILLING_TIER,
    geminiConfigured: !!GEMINI_API_KEY,
    // Стоимость TTS
    ttsPricePer1MCharsUsd: pricePer1M || null,
    ttsCostTotalUsd,
    ttsMonthlyEstimateUsd,
  });
});

// --- API: TTS (Озвучка) ---
app.post("/api/tts", async (req, res) => {
  try {
    const {
      text,
      language,
      languageCode,
      voiceId,
      speakingRate,
      pitch,
    } = req.body || {};

    const lang = language || languageCode;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Нет текста" });
    }
    if (!lang) {
      return res.status(400).json({ error: "Не указан язык" });
    }

    // Нормализуем голос и параметры
    const effectiveVoice = voiceId || TTS_DEFAULT_VOICE || null;

    let rate = typeof speakingRate === "number" ? speakingRate : Number(speakingRate);
    if (!rate || Number.isNaN(rate)) {
      rate = TTS_DEFAULT_RATE;
    }

    let pitchVal = typeof pitch === "number" ? pitch : Number(pitch);
    if (Number.isNaN(pitchVal)) {
      pitchVal = TTS_DEFAULT_PITCH;
    }

    // Хэш для серверного кэша (учитывает текст + язык + голос + настройки)
    const hashInput = `${lang}||${effectiveVoice || "auto"}||${rate}||${pitchVal}||${text}`;
    const hashKey = crypto.createHash("sha256").update(hashInput).digest("hex");
    const cacheFile = path.join(audioCacheDir, `${hashKey}.mp3`);

    // 1. Пытаемся отдать из кэша
    if (fs.existsSync(cacheFile)) {
      try {
        const audioBuffer = fs.readFileSync(cacheFile);
        const base64Audio = audioBuffer.toString("base64");
        return res.json({
          audioContent: base64Audio,
          mimeType: "audio/mpeg",
          fromCache: true,
        });
      } catch (e) {
        console.error("Ошибка чтения кэша TTS:", e);
        // если кэш не прочитался — пойдём в Google TTS ниже
      }
    }

    // 2. Генерируем новый звук через Google TTS
    const voiceConfig = effectiveVoice
      ? { languageCode: lang, name: effectiveVoice }
      : { languageCode: lang, ssmlGender: "NEUTRAL" };

    const request = {
      input: { text },
      voice: voiceConfig,
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: rate,
        pitch: pitchVal,
      },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    const audioBuffer = Buffer.from(response.audioContent);

    // Сохраняем в кэш
    try {
      fs.writeFileSync(cacheFile, audioBuffer);
    } catch (e) {
      console.error("Ошибка записи в кэш TTS:", e);
    }

    // Обновляем usage только при MISS (реальный вызов Google TTS)
    updateUsage("tts", text.length);

    const base64Audio = audioBuffer.toString("base64");

    res.json({
      audioContent: base64Audio,
      mimeType: "audio/mpeg",
      fromCache: false,
    });
  } catch (error) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: "Ошибка синтеза" });
  }
});

// --- API: SAVE (Сохранение MP3 на диск) ---
app.post("/api/save", async (req, res) => {
  try {
    const {
      text,
      language,
      languageCode,
      voiceId,
      speakingRate,
      pitch,
    } = req.body || {};
    const lang = language || languageCode;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Нет текста" });
    }
    if (!lang) {
      return res.status(400).json({ error: "Не указан язык" });
    }

    // Нормализуем голос и параметры
    const effectiveVoice = voiceId || TTS_DEFAULT_VOICE || null;

    let rate = typeof speakingRate === "number" ? speakingRate : Number(speakingRate);
    if (!rate || Number.isNaN(rate)) {
      rate = TTS_DEFAULT_RATE;
    }

    let pitchVal = typeof pitch === "number" ? pitch : Number(pitch);
    if (Number.isNaN(pitchVal)) {
      pitchVal = TTS_DEFAULT_PITCH;
    }

    const id = uuidv4();
    const audioFile = path.join(audioDir, `${id}.mp3`);
    const textFile = path.join(audioDir, `${id}.txt`);

    // Ключ кэша
    const hashInput = `${lang}||${effectiveVoice || "auto"}||${rate}||${pitchVal}||${text}`;
    const hashKey = crypto.createHash("sha256").update(hashInput).digest("hex");
    const cacheFile = path.join(audioCacheDir, `${hashKey}.mp3`);

    let audioBuffer = null;

    // 1. Пытаемся использовать кэш
    if (fs.existsSync(cacheFile)) {
      try {
        audioBuffer = fs.readFileSync(cacheFile);
      } catch (e) {
        console.error("Ошибка чтения кэша TTS (SAVE):", e);
        audioBuffer = null;
      }
    }

    // 2. Если в кэше нет — генерируем новый звук
    if (!audioBuffer) {
      const voiceConfig = effectiveVoice
        ? { languageCode: lang, name: effectiveVoice }
        : { languageCode: lang, ssmlGender: "NEUTRAL" };

      const request = {
        input: { text },
        voice: voiceConfig,
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: rate,
          pitch: pitchVal,
        },
      };

      const [response] = await ttsClient.synthesizeSpeech(request);
      audioBuffer = Buffer.from(response.audioContent);

      // Сохраняем в кэш
      try {
        fs.writeFileSync(cacheFile, audioBuffer);
      } catch (e) {
        console.error("Ошибка записи в кэш TTS (SAVE):", e);
      }

      // Обновляем usage только при MISS
      updateUsage("tts", text.length);
    }

    // 3. Сохраняем пользовательский файл и текст
    fs.writeFileSync(audioFile, audioBuffer, "binary");
    fs.writeFileSync(textFile, text, "utf8");

    res.json({
      success: true,
      audioUrl: `/audio/${id}.mp3`,
      textUrl: `/audio/${id}.txt`,
    });
  } catch (error) {
    console.error("Save Error:", error);
    res.status(500).json({ error: "Ошибка сохранения" });
  }
});

// --- API: TRANSLATE (Gemini -> таблица) ---
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

    // --- Серверный кэш Gemini по хэшу текста и формата таблицы ---
    const hashInput = `he-ru-table-v1||${cleanText}`;
    const hashKey = crypto.createHash("sha256").update(hashInput).digest("hex");
    const cacheFile = path.join(geminiCacheDir, `${hashKey}.json`);

    // 1. Пытаемся вернуть из кэша
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
        // если кэш битый — продолжаем и сделаем живой запрос к модели
      }
    }

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
You are a strict JSON generator.
Task: Translate Hebrew to Russian and produce a table with 4 columns.
Input: "${cleanText}"
Output format (JSON only, no comments, no markdown, no explanations):
{
  "rows": [
    { "he": "...", "he_niqqud": "...", "translit": "...", "ru": "..." }
  ]
}
Return ONLY valid JSON.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    if (!rawText || !rawText.trim()) {
      throw new Error("Пустой ответ от Gemini");
    }

    // Убираем обёртку ```json ... ```
    const cleanJson = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.error("JSON parse error:", e);
      return res.status(500).json({
        error: "Ошибка JSON",
        raw: rawText,
      });
    }

    if (!parsed.rows || !Array.isArray(parsed.rows)) {
      return res.status(500).json({
        error: "Неверный формат JSON: нет массива rows",
        raw: rawText,
      });
    }

    // 2. Сохраняем успешный результат в кэш
    const cachePayload = {
      text: cleanText,
      rows: parsed.rows,
      createdAt: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(cachePayload, null, 2), "utf8");
    } catch (e) {
      console.error("Ошибка записи в кэш Gemini:", e);
    }

    // Если всё прошло успешно — считаем запрос Gemini (только при MISS)
    updateUsage("gemini", 1);

    res.json({
      rows: parsed.rows,
      fromCache: false,
      cacheKey: hashKey,
      cachedAt: cachePayload.createdAt,
    });
  } catch (error) {
    console.error("Gemini Error:", error);

    // Специальная обработка 429 (лимиты)
    if (error && (error.status === 429 || error.statusCode === 429)) {
      let retryAfterSec = null;
      let limitType = "unknown"; // rate | daily | unknown
      let quotaId = null;

      const details = error.errorDetails || error.details || [];

      if (Array.isArray(details)) {
        for (const d of details) {
          if (
            d &&
            typeof d === "object" &&
            typeof d["@type"] === "string"
          ) {
            if (d["@type"].includes("RetryInfo") && d.retryDelay) {
              // retryDelay строка вида "57s" или "3600s"
              const m = String(d.retryDelay).match(/(\d+)/);
              if (m) {
                retryAfterSec = Number(m[1]);
              }
            }

            if (
              d["@type"].includes("QuotaFailure") &&
              Array.isArray(d.violations)
            ) {
              const v = d.violations[0];
              if (v && v.quotaId) {
                quotaId = v.quotaId;
              }
            }
          }
        }
      }

      // Определяем тип лимита по quotaId
      if (quotaId) {
        const q = quotaId.toLowerCase();
        if (q.includes("perday")) {
          limitType = "daily";
        } else if (q.includes("perminute") || q.includes("permin")) {
          limitType = "rate";
        }
      }

      // Если quotaId не дал ответа — используем эвристику по retryAfterSec
      if (limitType === "unknown" && typeof retryAfterSec === "number") {
        if (retryAfterSec <= 120) {
          limitType = "rate";
        } else if (retryAfterSec >= 3600) {
          limitType = "daily";
        }
      }

      // Готовим errorType и resetAt для фронтенда
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
            resetAt = new Date(
              dayStartMs + 24 * 60 * 60 * 1000
            ).toISOString();
          }
        } catch (e) {
          console.error("Ошибка вычисления resetAt для daily-limit:", e);
        }
      }

      // Если это daily-limit — отмечаем это в usage.json
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

    // Остальные ошибки
    res.status(500).json({
      error: "Ошибка Gemini",
      details: error.message,
    });
  }
});

// --- API: EXPORT DOCX ---
app.post("/api/export-docx", async (req, res) => {
  try {
    const { rows } = req.body || {};

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Нет данных для экспорта" });
    }

    const headerRow = new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Иврит", bold: true })],
            }),
          ],
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Огласовки", bold: true })],
            }),
          ],
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Транслит", bold: true })],
            }),
          ],
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Перевод", bold: true })],
            }),
          ],
        }),
      ],
    });

    const tableRows = [headerRow];

    rows.forEach((row) => {
      const he = row.he || "";
      const heNiqqud = row.he_niqqud || "";
      const translit = row.translit || "";
      const ru = row.ru || "";

      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: he, rightToLeft: true })],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: heNiqqud, rightToLeft: true }),
                  ],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
            }),
            new TableCell({
              children: [new Paragraph({ text: translit })],
            }),
            new TableCell({
              children: [new Paragraph({ text: ru })],
            }),
          ],
        })
      );
    });

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: "Таблица перевода",
              heading: "Heading1",
            }),
            new Table({
              rows: tableRows,
              width: { size: 100, type: WidthType.PERCENTAGE },
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    res.writeHead(200, {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="translation.docx"',
      "Content-Length": buffer.length,
    });

    res.end(buffer);
  } catch (error) {
    console.error("Docx Error:", error);
    res.status(500).json({ error: "Ошибка Docx" });
  }
});

// --------------------------------------------------------
// 5. ЗАПУСК СЕРВЕРА
// --------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
