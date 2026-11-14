#!/usr/bin/env node
'use strict';
// The daily article harvester run by hand (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §16).
// The server does the same every day at 06:00 Israel time; this is for a home computer, e.g. for C14,
// which answers servers with a bot challenge. Seen articles are remembered in <out>/.harvest.sqlite.
//   node scripts/news/harvest.js [--out folder] [--only c14,ynet] [--per-outlet 8]
const fs = require('node:fs'), path = require('node:path');
const sqlite3 = require('sqlite3');
const { createNewsHarvester } = require('../../news/harvest/newsHarvest');
const { SOURCES } = require('../../news/harvest/newsHarvestSources');

async function main() {
  const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const out = path.resolve(opt('--out') || 'news-harvest');
  const only = (opt('--only') || '').split(',').map(s => s.trim()).filter(Boolean);
  const perOutlet = Number(opt('--per-outlet')) || undefined;
  fs.mkdirSync(out, { recursive: true });
  const db = new sqlite3.Database(path.join(out, '.harvest.sqlite'));
  await new Promise((res, rej) => db.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '081_news_harvest.sql'), 'utf8'), e => e ? rej(e) : res()));
  // The archive goes to <out>/news-harvest/ (the server layout); move it up next to the user.
  const harvester = createNewsHarvester({ db, dataDir: out, sources: only.length ? SOURCES.filter(s => only.includes(s.outlet_id)) : SOURCES,
    limits: perOutlet ? { perOutlet } : {}, log: m => console.log(m) });
  const r = await harvester.runOnce({ trigger: 'manual' });
  for (const [id, o] of Object.entries(r.report.outlets)) console.log(`${id}: в ленте ${o.feed_items}, взято ${o.taken}` + (Object.keys(o.skipped).length ? ', пропущено ' + JSON.stringify(o.skipped) : '') + (o.errors.length ? ', ошибки ' + o.errors.join(' ') : ''));
  if (r.file_name) {
    const target = path.join(out, r.file_name);
    fs.renameSync(path.join(out, 'news-harvest', r.file_name), target);
    console.log(`Итого: статей ${r.articles}, фото ${r.images}\nАрхив: ${target}`);
  } else console.log('Новых статей нет');
  db.close();
}
main().catch(e => { console.error(e); process.exit(1); });
