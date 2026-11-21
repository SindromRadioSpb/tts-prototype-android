'use strict';
// An in-memory database with the news migrations (078–083).
const fs = require('node:fs'), path = require('node:path');
const sqlite3 = require('sqlite3');
const MIGRATIONS = ['078_news.sql', '079_news_manage.sql', '080_news_images.sql', '081_news_harvest.sql', '082_news_harvest_items.sql', '083_news_editions.sql', '089_news_refused_count.sql', '091_news_index.sql'];
const exec = (db, sql) => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));
async function openDb(extra = []) {
  const db = new sqlite3.Database(':memory:');
  for (const m of [...MIGRATIONS, ...extra]) await exec(db, fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', m), 'utf8'));
  return db;
}
module.exports = { openDb, MIGRATIONS };
