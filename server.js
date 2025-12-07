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
const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, AlignmentType } = require("docx");

// --------------------------------------------------------
// 2. ИНИЦИАЛИЗАЦИЯ И СТАТИСТИКА
// --------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const audioDir = path.join(__dirname, "audio");
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
app.use("/audio", express.static(audioDir));

// --- СИСТЕМА УЧЁТА (НОВОЕ) ---
const USAGE_FILE = path.join(__dirname, "usage.json");

// Получить текущую статистику
function getUsage() {
    // Если файла нет, создаем начальный
    if (!fs.existsSync(USAGE_FILE)) {
        return { 
            ttsChars: 0,       // Символов TTS
            geminiRequests: 0, // Запросов к Gemini
            startDate: new Date().toLocaleDateString("ru-RU") // Дата начала отсчета
        };
    }
    return JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
}

// Обновить статистику
function updateUsage(type, amount = 1) {
    const stats = getUsage();
    if (type === "tts") {
        stats.ttsChars += amount;
    } else if (type === "gemini") {
        stats.geminiRequests += amount;
    }
    fs.writeFileSync(USAGE_FILE, JSON.stringify(stats, null, 2));
}

// --------------------------------------------------------
// 3. КЛИЕНТЫ API
// --------------------------------------------------------
const ttsClient = new textToSpeech.TextToSpeechClient();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// --------------------------------------------------------
// 4. API ЭНДПОИНТЫ
// --------------------------------------------------------

// --- API: Получить статистику для фронтенда ---
app.get("/api/usage", (req, res) => {
    res.json(getUsage());
});

// --- API: TTS (Озвучка) ---
app.post("/api/tts", async (req, res) => {
  try {
    const { text, language, languageCode } = req.body;
    const lang = language || languageCode;
    if (!text || !lang) return res.status(400).json({ error: "Нет текста" });

    // Считаем символы
    updateUsage("tts", text.length);

    const request = {
      input: { text },
      voice: { languageCode: lang, ssmlGender: "NEUTRAL" },
      audioConfig: { audioEncoding: "MP3" },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    const base64Audio = Buffer.from(response.audioContent).toString("base64");
    res.json({ audioContent: base64Audio, mimeType: "audio/mpeg" });
  } catch (error) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: "Ошибка синтеза" });
  }
});

// --- API: SAVE (Сохранение) ---
app.post("/api/save", async (req, res) => {
  try {
    const { text, language, languageCode } = req.body;
    const lang = language || languageCode;
    if (!text || !lang) return res.status(400).json({ error: "Нет текста" });

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

    res.json({ success: true, audioUrl: `/audio/${id}.mp3`, textUrl: `/audio/${id}.txt` });
  } catch (error) {
    console.error("Save Error:", error);
    res.status(500).json({ error: "Ошибка сохранения" });
  }
});

// --- API: TRANSLATE (Gemini) ---
app.post("/api/translate-table", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Нет текста" });
    if (!genAI) return res.status(500).json({ error: "API Key не найден" });

    // Считаем запрос
    updateUsage("gemini", 1);

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
      You are a strict JSON generator. 
      Task: Translate Hebrew to Russian.
      Input: "${text.trim()}"
      Output Format (JSON only): { "rows": [ { "he": "...", "he_niqqud": "...", "translit": "...", "ru": "..." } ] }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    if (!rawText) throw new Error("Пустой ответ");
    const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      const parsed = JSON.parse(cleanJson);
      res.json(parsed);
    } catch (e) {
      console.error("JSON Error:", e);
      res.status(500).json({ error: "Ошибка JSON", raw: rawText });
    }

  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({ error: "Ошибка Gemini", details: error.message });
  }
});

// --- API: EXPORT DOCX ---
app.post("/api/export-docx", async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows)) return res.status(400).json({ error: "Нет данных" });

    const tableRows = [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: "Иврит", bold: true })] }),
          new TableCell({ children: [new Paragraph({ text: "Огласовки", bold: true })] }),
          new TableCell({ children: [new Paragraph({ text: "Транслит", bold: true })] }),
          new TableCell({ children: [new Paragraph({ text: "Перевод", bold: true })] }),
        ],
      }),
    ];

    rows.forEach((row) => {
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.he, rightToLeft: true })], alignment: AlignmentType.RIGHT })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.he_niqqud, rightToLeft: true })], alignment: AlignmentType.RIGHT })] }),
            new TableCell({ children: [new Paragraph(row.translit || "")] }),
            new TableCell({ children: [new Paragraph(row.ru || "")] }),
          ],
        })
      );
    });

    const doc = new Document({
      sections: [{ children: [new Paragraph({ text: "Таблица перевода", heading: "Heading1" }), new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } })] }],
    });

    const buffer = await Packer.toBuffer(doc);
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="translation.docx"',
      "Content-Length": buffer.length,
    });
    res.end(buffer);
  } catch (error) {
    console.error("Docx Error:", error);
    res.status(500).json({ error: "Ошибка Docx" });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});