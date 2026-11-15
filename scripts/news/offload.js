#!/usr/bin/env node
'use strict';
// The fallback for the «Место» buttons (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.11):
// offload archived news days to a folder on this computer, or bring them back. Same steps as the
// browser: download, write, read back, check sha256, only then tell the server to forget the day.
//   node scripts/news/offload.js --dir <folder> [--from 2026-11-01 --to 2026-11-10 | --suggested]
//   node scripts/news/offload.js --restore <folder>
// The owner's session: LP_OWNER_COOKIE (the Cookie header of a signed-in owner) and LP_OWNER_CSRF;
// LP_BASE (default https://linguistpro.kolosei.com).
const fs = require('node:fs'), path = require('node:path');
const OU = require('../../public/js/news-offload-ui');

// A folder on disk with the File System Access shape the browser code uses.
function folder(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return {
    async getFileHandle(name, opts) {
      const file = path.join(dir, path.basename(name));
      if (!fs.existsSync(file) && !(opts && opts.create)) { const e = new Error('not found: ' + name); e.name = 'NotFoundError'; throw e; }
      return {
        async createWritable() { const parts = []; return { async write(b) { parts.push(Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b)); }, async close() { fs.writeFileSync(file + '.part', Buffer.concat(parts)); fs.renameSync(file + '.part', file); } }; },
        async getFile() { const b = fs.readFileSync(file); return { async arrayBuffer() { return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }, async text() { return b.toString('utf8'); } }; },
      };
    },
  };
}
function client({ base, cookie }) {
  return (url, init = {}) => fetch(base.replace(/\/$/, '') + url, { ...init, headers: { ...(init.headers || {}), cookie } });
}
function daysBetween(from, to) {
  const out = [];
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400e3) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
async function offload({ base, cookie, csrf, dir, days, log = () => {} }) {
  const fetchImpl = client({ base, cookie });
  if (!days) {
    const r = await fetchImpl('/api/news/editor/storage');
    if (!r.ok) throw new Error('storage: HTTP ' + r.status);
    days = (await r.json()).suggest.days;
  }
  return OU.run({ fetchImpl, csrf, pickDir: async () => folder(dir), days, crypto: require('node:crypto').webcrypto, onProgress: p => log(p.day + ' ' + p.step) });
}
async function restore({ base, cookie, csrf, dir }) {
  return OU.restore({ fetchImpl: client({ base, cookie }), csrf, pickDir: async () => folder(dir) });
}

async function main() {
  const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const base = process.env.LP_BASE || 'https://linguistpro.kolosei.com', cookie = process.env.LP_OWNER_COOKIE || '', csrf = process.env.LP_OWNER_CSRF || '';
  if (!cookie) { console.error('Нужна сессия владельца: LP_OWNER_COOKIE и LP_OWNER_CSRF'); process.exit(2); }
  if (opt('--restore')) { const r = await restore({ base, cookie, csrf, dir: path.resolve(opt('--restore')) }); console.log(JSON.stringify(r)); return; }
  const dir = path.resolve(opt('--dir') || 'news-archive');
  const days = opt('--from') && opt('--to') ? daysBetween(opt('--from'), opt('--to')) : null;
  const r = await offload({ base, cookie, csrf, dir, days, log: m => console.log(m) });
  console.log(`Выгружено: ${r.done.length}; не получилось: ${r.failed.map(f => f.day + ' ' + f.code).join(', ') || '0'}\nПапка: ${dir}`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { offload, restore, folder, daysBetween };
