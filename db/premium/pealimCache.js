"use strict";

// Shared server-side disk cache for Pealim inflection paradigms.
// A lemma's paradigm is universal reference data (not user data) — caching it
// globally means Pealim is hit once per lemma across all users/texts. This is
// the main politeness lever for the scrape. Cache-forever; the provider
// MODEL_VERSION is part of the key, so bumping it transparently re-scrapes.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { INFLECTION_CACHE_DIR, ensureDirSync } = require("../../storage");

const PAGES_DIR = path.join(INFLECTION_CACHE_DIR, "pages");
ensureDirSync(PAGES_DIR);

function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }

// Final-paradigm cache, keyed by the resolution inputs + model version.
function keyFor(lemma, binyan, pos, modelVersion) {
  return sha1([lemma || "", binyan || "", pos || "", modelVersion || ""].join("|"));
}
function _read(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (_) { return null; }
}
function _write(file, obj) {
  try { fs.writeFileSync(file, JSON.stringify(obj)); return true; }
  catch (e) { console.error("[pealimCache] write failed:", e && e.message); return false; }
}

function get(key) { return _read(path.join(INFLECTION_CACHE_DIR, key + ".json")); }
function put(key, obj) { return _write(path.join(INFLECTION_CACHE_DIR, key + ".json"), obj); }

// Page-level cache (parsed dict page by Pealim id) — so candidate fetches during
// homograph disambiguation are never repeated.
function getPage(id) { return _read(path.join(PAGES_DIR, String(id) + ".json")); }
function putPage(id, parsed) { return _write(path.join(PAGES_DIR, String(id) + ".json"), parsed); }

module.exports = { keyFor, get, put, getPage, putPage };
