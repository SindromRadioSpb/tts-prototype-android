'use strict';
// Disk guard (docs/superpowers/specs/2026-11-21-news-findability-design.md §2 п.5): below 2 GB free the news
// section shortens how long it keeps the full text of slice articles. Unknown free space is not «low».
const fs = require('node:fs');

function createDiskGuard({ dir, statfs = p => fs.promises.statfs(p), minFreeBytes = 2 * 1024 ** 3 } = {}) {
  async function check() {
    try {
      const s = await statfs(dir);
      const free = Number(s.bavail) * Number(s.bsize);
      return { free, low: Number.isFinite(free) && free < minFreeBytes };
    } catch (_) { return { free: null, low: false }; }
  }
  return { check };
}

module.exports = { createDiskGuard };
