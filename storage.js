// storage.js — single source of truth for Local Workspace paths.

const fs = require("fs");
const path = require("path");

function ensureDirSync(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.error("[storage] ensureDirSync failed:", dir, e && e.message);
  }
}

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");

ensureDirSync(DATA_DIR);

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "app.db");

const USAGE_FILE = process.env.USAGE_FILE || path.join(DATA_DIR, "usage.json");
const AUDIO_CACHE_DIR = process.env.AUDIO_CACHE_DIR || path.join(DATA_DIR, "audio-cache");
const GEMINI_CACHE_DIR = process.env.GEMINI_CACHE_DIR || path.join(DATA_DIR, "gemini-cache");
const BACKUPS_DIR = process.env.BACKUPS_DIR || path.join(DATA_DIR, "backups");
const RESEARCH_DATA_DIR = process.env.RESEARCH_DATA_DIR || path.join(DATA_DIR, "research");

ensureDirSync(AUDIO_CACHE_DIR);
ensureDirSync(GEMINI_CACHE_DIR);
ensureDirSync(BACKUPS_DIR);
ensureDirSync(RESEARCH_DATA_DIR);

module.exports = {
  DATA_DIR,
  DB_PATH,
  USAGE_FILE,
  AUDIO_CACHE_DIR,
  GEMINI_CACHE_DIR,
  BACKUPS_DIR,
  RESEARCH_DATA_DIR,
  ensureDirSync,
};
