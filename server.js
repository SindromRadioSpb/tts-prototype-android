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

// Получить текущую статистику
function getUsage() {
  if (!fs.existsSync(USAGE_FILE)) {
    return {
      ttsChars: 0, // Символов TTS
      geminiRequests: 0, // Запросов к Gemini
      startDate: new Date().toLocaleDateString("ru-RU"), // Дата начала отсчета
    };
  }

  try {
    const raw = fs.readFileSync(USAGE_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("Ошибка чтения usage.json:", e);
    return {
      ttsChars: 0,
      geminiRequests: 0,
      startDate: new Date().toLocaleDateString("ru-RU"),
    };
  }
}

// Обновить статистику
function updateUsage(type, amount = 1) {
  const stats = getUsage();
  if (type === "tts") {
    stats.ttsChars += amount;
  } else if (type === "gemini") {
    stats.geminiRequests += amount;
  }
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(stats, null, 2), "utf8");
  } catch (e) {
    console.error("Ошибка записи usage.json:", e);
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
  res.json(getUsage());
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

    // Считаем символы
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

    // Считаем запрос
    updateUsage("gemini", 1);

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

    res.json(parsed);
  } catch (error) {
    console.error("Gemini Error:", error);
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
