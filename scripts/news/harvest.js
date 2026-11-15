#!/usr/bin/env node
'use strict';
// The daily article harvester run by hand (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §16).
// The server does the same every day at 06:00 Israel time; this is for a home computer, e.g. for C14,
// which answers servers with a bot challenge. Seen articles are remembered in <out>/.harvest.sqlite.
//   node scripts/news/harvest.js [--out folder] [--only c14,ynet] [--main 22] [--pages 400]
const fs = require('node:fs'), path = require('node:path');
const sqlite3 = require('sqlite3');
const { createNewsHarvester } = require('../../news/harvest/newsHarvest');
const { SOURCES } = require('../../news/harvest/newsHarvestSources');

async function main() {
  const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const out = path.resolve(opt('--out') || 'news-harvest');
  const only = (opt('--only') || '').split(',').map(s => s.trim()).filter(Boolean);
  const main = Number(opt('--main')) || undefined, pages = Number(opt('--pages')) || 400;
  fs.mkdirSync(out, { recursive: true });
  const db = new sqlite3.Database(path.join(out, '.harvest.sqlite'));
  const run = sql => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));
  for (const m of ['081_news_harvest.sql', '082_news_harvest_items.sql']) await run(fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', m), 'utf8'));
  // 083 adds columns: once only.
  const has083 = await new Promise((res, rej) => db.get("SELECT 1 FROM sqlite_master WHERE name='news_editions'", (e, r) => e ? rej(e) : res(!!r)));
  if (!has083) await run(fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '083_news_editions.sql'), 'utf8'));
  // The archive goes to <out>/news-harvest/ (the server layout); move it up next to the user.
  const harvester = createNewsHarvester({ db, dataDir: out, sources: only.length ? SOURCES.filter(s => only.includes(s.outlet_id)) : SOURCES,
    limits: { pagesPerPoll: pages, ...(main ? { mainStories: main } : {}) }, log: m => console.log(m) });
  const r = await harvester.runOnce({ trigger: 'manual' });
  for (const [id, o] of Object.entries(r.report.outlets)) console.log(`${id}: в обзоре ${o.items}, полный разбор ${o.main}` + (o.errors ? ', ошибки ' + o.errors.join(' ') : ''));
  console.log(`Выпуск ${r.slot} ${r.day} · сюжетов ${r.stories}, статей в «Обзоре дня» ${r.overview_items}`);
  if (r.file_name) {
    const target = path.join(out, r.file_name);
    fs.renameSync(path.join(out, 'news-harvest', r.file_name), target);
    console.log(`Итого: статей ${r.articles}, фото ${r.images}\nАрхив: ${target}`);
  } else console.log('Новых статей нет');
  db.close();
}
main().catch(e => { console.error(e); process.exit(1); });
