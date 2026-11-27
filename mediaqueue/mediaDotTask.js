'use strict';
// The instruction for dot on the video queue (spec 2026-11-27 §5.4), at one stable public address. The version is a
// hash of the text, so any edit reaches dot through `task.version` in the answer of /editor/jobs/next.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TASK_URL = '/api/media-queue/dot-task.md';
const FILE = path.join(__dirname, 'dotTask.md');

function createMediaDotTask({ read = () => fs.readFileSync(FILE, 'utf8') } = {}) {
  let cached = null;
  function get() {
    if (cached) return cached;
    const text = String(read()).replace(/\s*$/, '\n');
    const m = /Обновлено:\s*(\d{4}-\d{2}-\d{2})/.exec(text);
    cached = { text, version: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12), updated: m ? m[1] : null, url: TASK_URL };
    return cached;
  }
  const meta = () => { const t = get(); return { version: t.version, updated: t.updated, url: t.url }; };
  return { get, meta };
}

module.exports = { createMediaDotTask, TASK_URL };
