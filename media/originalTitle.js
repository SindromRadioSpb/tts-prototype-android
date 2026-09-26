"use strict";
// O-021: the original (usually Hebrew) title of a YouTube material, for the HE interface. The
// material's own title is the author's Russian label; YouTube keeps the original. Fetched once per
// video through oEmbed (no API key), persisted on the data volume; failures are cached for a day so
// a removed video does not cost a request on every page view.

const fs = require("fs");
const path = require("path");

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const FAILURE_TTL_MS = 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 5000;

function isVideoId(id) { return typeof id === "string" && VIDEO_ID_RE.test(id); }

function createOriginalTitleStore(opts) {
  const file = opts.file;
  const fetchImpl = opts.fetchImpl || ((url, init) => fetch(url, init));
  const now = opts.now || Date.now;
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch (_) { cache = {}; }
  const inflight = new Map();

  function persist() {
    // A few hundred short entries at most: a synchronous atomic write keeps it simple.
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + ".tmp", JSON.stringify(cache));
      fs.renameSync(file + ".tmp", file);
    } catch (e) { console.warn("[original-title] persist failed:", e && e.message); }
  }

  async function fetchOne(id) {
    const url = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id);
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
    try {
      const res = await fetchImpl(url, ctrl ? { signal: ctrl.signal } : undefined);
      if (!res || !res.ok) return null;
      const j = await res.json();
      const title = j && typeof j.title === "string" ? j.title.trim().slice(0, 300) : "";
      if (!title) return null;
      return { title, author: j && typeof j.author_name === "string" ? j.author_name.trim().slice(0, 200) : "" };
    } catch (_) { return null; }
    finally { if (timer) clearTimeout(timer); }
  }

  async function getOne(id) {
    const hit = cache[id];
    if (hit && hit.ok) return { title: hit.title, author: hit.author };
    if (hit && !hit.ok && now() - hit.at < FAILURE_TTL_MS) return null;
    if (inflight.has(id)) return inflight.get(id);
    const p = fetchOne(id).then((value) => {
      cache[id] = value ? { ok: true, title: value.title, author: value.author, at: now() } : { ok: false, at: now() };
      persist();
      inflight.delete(id);
      return value;
    });
    inflight.set(id, p);
    return p;
  }

  async function getMany(ids) {
    const out = {};
    const list = [...new Set((ids || []).filter(isVideoId))];
    const values = await Promise.all(list.map(getOne));
    list.forEach((id, i) => { out[id] = values[i]; });
    return out;
  }

  return { getMany };
}

module.exports = { createOriginalTitleStore, isVideoId };
