'use strict';
// The instruction for dot on the site (2026-11-22): the same dotTask.md that goes into every
// edition archive as README-dot.md, at one stable address. The version is a hash of the text,
// so any edit reaches dot through `task.version` in the answers it already reads.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TASK_URL = '/api/news/dot-task.md';
const FILE = path.join(__dirname, 'harvest', 'dotTask.md');

function createDotTask({ read = () => fs.readFileSync(FILE, 'utf8') } = {}) {
  let cached = null;
  function get() {
    if (cached) return cached;
    const text = String(read());
    const m = /Обновлено:\s*(\d{4}-\d{2}-\d{2})/.exec(text);
    cached = { text, version: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12), updated: m ? m[1] : null, url: TASK_URL };
    return cached;
  }
  // What dot needs in an answer: enough to know whether to re-read the text.
  const meta = () => { const t = get(); return { version: t.version, updated: t.updated, url: t.url }; };
  return { get, meta };
}

module.exports = { createDotTask, TASK_URL };
