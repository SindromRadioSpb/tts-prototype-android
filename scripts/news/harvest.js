#!/usr/bin/env node
'use strict';
// The daily article harvester run by hand (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §16).
// The server does the same every day at 06:00 Israel time; this is for a home computer, e.g. for C14,
// which answers servers with a bot challenge. Seen articles are remembered in <out>/.harvest.sqlite.
//   node scripts/news/harvest.js [--out folder] [--only c14,ynet] [--main 22] [--pages 400]
// With --push the PC hands its harvest to the server instead of making a local archive (spec 2026-11-26 §6):
//   node scripts/news/harvest.js --only c14,haipo --out <folder> --push https://linguistpro.kolosei.com --key-file <file with the lpr_ key>
// It reads the feeds and pages (one poll), then sends every ready card — with the text and without — and the photos.
const fs = require('node:fs'), path = require('node:path');
const sqlite3 = require('sqlite3');
const { createNewsHarvester } = require('../../news/harvest/newsHarvest');
const { SOURCES } = require('../../news/harvest/newsHarvestSources');
const { pushPending } = require('../../news/harvest/newsRelayClient');

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
  // 092 adds data_gz (the compressed text the relay reads too): once only.
  const cols = await new Promise((res, rej) => db.all('PRAGMA table_info(news_harvest_items)', (e, r) => e ? rej(e) : res(r || [])));
  if (!cols.some(c => c.name === 'data_gz')) await run(fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '092_news_body_gz.sql'), 'utf8'));
  // The archive goes to <out>/news-harvest/ (the server layout); move it up next to the user.
  const harvester = createNewsHarvester({ db, dataDir: out, sources: only.length ? SOURCES.filter(s => only.includes(s.outlet_id)) : SOURCES,
    limits: { pagesPerPoll: pages, ...(main ? { mainStories: main } : {}) }, log: m => console.log(m) });
  const push = opt('--push');
  if (push) {
    const keyFile = opt('--key-file');
    if (!keyFile || !only.length) throw new Error('--push needs --key-file and the outlets in --only');
    const key = fs.readFileSync(path.resolve(keyFile), 'utf8').trim();
    const origin = new URL(push).origin, harvestedAt = new Date().toISOString();
    // One poll reads every listed outlet; each outlet is then handed over on its own (the server
    // takes a batch only for an outlet switched to «с ПК», so one refusal never stops the others).
    const poll = await harvester.poll();
    let failed = 0;
    for (const outletId of only) {
      const o = poll.outlets[outletId] || {};
      console.log(`${outletId}: новых в лентах ${o.new || 0}` + ((o.errors || []).length ? ', ошибки ' + o.errors.join(' ') : ''));
      // Every feed of the outlet failed on the PC too: the server records an error, not a harvest (spec §6.4).
      const src = SOURCES.find(x => x.outlet_id === outletId);
      const feedErrors = (o.errors || []).filter(e => /^(FEED_FAILED|BOT_CHALLENGE):/.test(e));
      const pollOk = !(src && feedErrors.length >= src.feeds.length);
      try {
        const sent = await pushPending({ db, origin, key, outletId, harvestedAt, photoOf: src2 => harvester.photoFor(src2), log: m => console.log(m),
          pollOk, pollError: pollOk ? null : feedErrors[0] });
        console.log(`${outletId} → сервер: новых ${sent.accepted}, дополнено текстом ${sent.updated}, уже были ${sent.kept}, отклонено ${sent.rejected}; фото ${sent.photos_sent}, не удалось ${sent.photos_failed}`);
      } catch (e) { failed++; console.log(`${outletId} → сервер: не принято (${e && e.message})`); }
    }
    console.log(`Страниц прочитано ${poll.pages}`);
    db.close();
    if (failed) process.exitCode = 1;
    return;
  }
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
