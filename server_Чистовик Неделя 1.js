// --------------------------------------------------------
// 1. ИМПОРТЫ
// --------------------------------------------------------
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

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

// --------------------------------------------------------
// 1.1. ЗАГРУЗКА КЛЮЧА GOOGLE CLOUD ИЗ ПЕРЕМЕННОЙ ОКРУЖЕНИЯ
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
    ttsChars: 0, // Символов TTS (всего)
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

  if (type === "tts") {
    stats.ttsChars += amount;
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
  res.json({
    ...stats,
    geminiDailyLimit: GEMINI_DAILY_LIMIT,
    geminiResetHourUtc: GEMINI_RESET_HOUR_UTC,
  });
});

// --- API: TTS (Озвучка) ---
app.post("/api/tts", async (req, res) => {
  try {
    const { text, language, languageCode } = req.body || {};
    const lang = language || languageCode;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Нет текста" });
    }
    if (!lang) {
      return res.status(400).json({ error: "Не указан язык" });
    }

    // Считаем символы (всегда — даже если потом клиент не скачает MP3)
    updateUsage("tts", text.length);

    const request = {
      input: { text },
      voice: { languageCode: lang, ssmlGender: "NEUTRAL" },
      audioConfig: { audioEncoding: "MP3" },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    const base64Audio = Buffer.from(response.audioContent).toString("base64");

    res.json({
      audioContent: base64Audio,
      mimeType: "audio/mpeg",
    });
  } catch (error) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: "Ошибка синтеза" });
  }
});

// --- API: SAVE (Сохранение MP3 на диск) ---
app.post("/api/save", async (req, res) => {
  try {
    const { text, language, languageCode } = req.body || {};
    const lang = language || languageCode;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Нет текста" });
    }
    if (!lang) {
      return res.status(400).json({ error: "Не указан язык" });
    }

    // Считаем символы
    updateUsage("tts", text.length);

    const id = uuidv4();
    const audioFile = path.join(audioDir, `${id}.mp3`);
    const textFile = path.join(audioDir, `${id}.txt`);

    const request = {
      input: { text },
      voice: { languageCode: lang, ssmlGender: "NEUTRAL" },
      audioConfig: { audioEncoding: "MP3" },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);

    fs.writeFileSync(audioFile, response.audioContent, "binary");
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

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
You are a strict JSON generator.
Task: Translate Hebrew to Russian and produce a table with 4 columns.
Input: "${text.trim()}"
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

    // Если всё прошло успешно — считаем запрос Gemini
    updateUsage("gemini", 1);

    res.json(parsed);
  } catch (error) {
    console.error("Gemini Error:", error);

    // Специальная обработка 429 (лимиты)
    if (error && (error.status === 429 || error.statusCode === 429)) {
      let retryAfterSec = null;
      let limitType = "unknown"; // rate | daily | unknown
      let quotaId = null;

      // error.errorDetails — структура, похожая на то, что ты присылал в логах
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

            if (d["@type"].includes("QuotaFailure") && Array.isArray(d.violations)) {
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

      // Если это daily-limit — отмечаем это в usage.json
      if (limitType === "daily") {
        markGeminiDailyLimitHit();
      }

      return res.status(429).json({
        error: "Лимит Gemini",
        details: error.message,
        limitType,
        retryAfterSec,
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
                  children: [new TextRun({ text: heNiqqud, rightToLeft: true })],
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
