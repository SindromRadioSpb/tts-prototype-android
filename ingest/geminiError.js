// ingest/geminiError.js
// W2-S4: реализация переехала в public/js/gemini-error.js (нужна и браузеру — ASR-путь
// идёт браузер→Google напрямую). Этот файл — тонкий re-export, чтобы серверные require
// и существующие тесты не менялись. Прецедент require из public/: ttsBake ← reader-morph.js.
"use strict";
module.exports = require("../public/js/gemini-error.js");
