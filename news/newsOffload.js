'use strict';
// Offloading archived news days to the owner's PC and bringing them back
// (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.11).
// A day's archive holds, byte for byte, what the server keeps for its articles: the body, the study
// snapshots of each version (same work ids) and the photos. The server forgets them only after the
// owner's browser has written the file, read it back and confirmed its sha256. Restoring puts the same
// bytes back. The cards and the «Обзор дня» rows never leave the server.
// Photos and texts live inside SQLite: deleted rows free pages that new data reuses (the database stops
// growing); the file itself shrinks only with VACUUM, which is not run here.
const crypto = require('node:crypto');
const fs = require('node:fs');
const AdmZip = require('adm-zip');
const { israelIso } = require('./harvest/newsExtract');

const FRESH_MS = 72 * 3600e3, PHOTO_MS = 61 * 86400e3, LOW_BYTES = 2e9, SUGGEST_BYTES = 1e9, MAX_ARCHIVE = 120 * 1024 * 1024, CACHE_MS = 10 * 60e3;
const DAY = /^\d{4}-\d{2}-\d{2}$/, ID = /^na_[0-9a-f]{24}$/, WORK = /^na_[0-9a-f]{24}\.[a-z0-9]{2}$/, IMG = /^img-\d{1,2}\.(jpg|jpeg|png|webp)$/;
const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
class OffloadError extends Error { constructor(code, status = 409) { super(code); this.code = code; this.status = status; } }
const fail = (code, status) => { throw new OffloadError(code, status); };
const README = `Архив новостей LinguistPro — один день, выгруженный с сервера, чтобы освободить место.
Не переименовывайте и не распаковывайте файл.
Вернуть на сервер: «Редактор новостей» → «Место» → «Вернуть выгруженное на сервер» → выбрать папку с этими файлами.
Запасной путь: node scripts/news/offload.js --restore <папка> (из репозитория LinguistPro).
`;

function createNewsOffload({ db, repo, dataDir, now = () => Date.now(), statfs = p => fs.statfsSync(p), transaction = null }) {
  const iso = ms => new Date(ms).toISOString();
  const dayOfIso = s => israelIso(Date.parse(s)).slice(0, 10);
  const tx = transaction || (repo && repo._transaction) || (fn => fn());

  // The archive articles of an Israel day: published that day, not withdrawn, still holding a body.
  async function articlesOfDay(day) {
    const from = iso(Date.parse(day + 'T00:00:00Z') - 86400e3), to = iso(Date.parse(day + 'T00:00:00Z') + 2 * 86400e3);
    const rows = await dbAll(db, `SELECT article_id, tier, published_at, body_json, offloaded_day FROM news_articles WHERE published_at >= ? AND published_at < ? AND tier IN ('fresh','archive')`, [from, to]);
    return rows.filter(r => dayOfIso(r.published_at) === day);
  }
  const offloadable = (rows, day) => rows.length > 0 && rows.every(r => r.tier === 'archive') && now() - Date.parse(day + 'T22:00:00Z') > FRESH_MS;

  // Heavy (it measures what news take by month): cached for 10 minutes, dropped after a release or a restore.
  let cached = null;
  async function storage() {
    if (cached && now() - cached.at < CACHE_MS) return cached.value;
    const value = await measure();
    cached = { at: now(), value };
    return value;
  }
  async function measure() {
    let disk = null;
    try { const s = statfs(dataDir); disk = { free: Number(s.bavail) * Number(s.bsize), total: Number(s.blocks) * Number(s.bsize) }; } catch (_) { disk = null; }
    const pc = await dbGet(db, 'PRAGMA page_count'), ps = await dbGet(db, 'PRAGMA page_size'), fl = await dbGet(db, 'PRAGMA freelist_count');
    const pageSize = ps ? Number(Object.values(ps)[0]) : 4096, dbFree = fl ? Number(Object.values(fl)[0]) * pageSize : 0;
    const photos = await dbAll(db, `SELECT substr(a.published_at,1,7) month, SUM(length(i.bytes)) bytes FROM news_images i JOIN news_articles a ON a.article_id=i.article_id GROUP BY month`);
    const bodies = await dbAll(db, `SELECT substr(a.published_at,1,7) month, SUM(length(a.body_json)) + COALESCE((SELECT SUM(length(w.snapshot_json)) FROM news_works w JOIN news_articles b ON b.article_id=w.article_id
      WHERE substr(b.published_at,1,7)=substr(a.published_at,1,7)), 0) bytes FROM news_articles a WHERE a.body_json IS NOT NULL GROUP BY month`);
    const months = new Map();
    for (const r of photos) months.set(r.month, { month: r.month, photos: r.bytes || 0, bodies: 0 });
    for (const r of bodies) { const m = months.get(r.month) || { month: r.month, photos: 0, bodies: 0 }; m.bodies = r.bytes || 0; months.set(r.month, m); }
    const offloaded = await dbAll(db, 'SELECT * FROM news_offloads ORDER BY day');
    const released = new Set(offloaded.filter(o => o.state === 'released').map(o => o.day));
    // Suggested: the oldest archived days that still hold something, until about 1 GB.
    const cands = await dbAll(db, `SELECT a.article_id, a.published_at, a.tier, length(a.body_json) b, COALESCE((SELECT SUM(length(bytes)) FROM news_images i WHERE i.article_id=a.article_id), 0)
      + COALESCE((SELECT SUM(length(snapshot_json)) FROM news_works w WHERE w.article_id=a.article_id), 0) p FROM news_articles a
      WHERE a.body_json IS NOT NULL AND a.tier IN ('fresh','archive') AND a.offloaded_day IS NULL ORDER BY a.published_at`);
    const byDay = new Map();
    for (const c of cands) { const d = dayOfIso(c.published_at); const x = byDay.get(d) || { rows: [], bytes: 0 }; x.rows.push(c); x.bytes += (c.b || 0) + (c.p || 0); byDay.set(d, x); }
    const days = [];
    let bytes = 0;
    for (const [d, x] of [...byDay.entries()].sort()) {
      if (bytes >= SUGGEST_BYTES) break;
      if (released.has(d) || !offloadable(x.rows, d)) continue;
      days.push(d); bytes += x.bytes;
    }
    // «Low» is about the disk itself (builds, WAL and images cannot use SQLite's free pages); no disk figure → no alarm.
    return { disk, db_free: dbFree, low: !!disk && disk.free < LOW_BYTES, by_month: [...months.values()].sort((a, b) => a.month < b.month ? 1 : -1),
      offloaded: offloaded.map(o => ({ day: o.day, state: o.state, sha256: o.sha256, articles: o.articles, photos: o.photos, bytes: o.bytes, released_at: o.released_at })),
      suggest: { days, bytes } };
  }

  async function exportDay(day) {
    if (!DAY.test(String(day || ''))) fail('OFFLOAD_DAY_INVALID', 400);
    // A released day's archive is the only copy: never make another file for that day.
    const prevOff = await dbGet(db, 'SELECT state FROM news_offloads WHERE day=?', [day]);
    if (prevOff && prevOff.state === 'released') fail('OFFLOAD_DAY_RELEASED');
    const rows = (await articlesOfDay(day)).filter(r => !r.offloaded_day && r.body_json);
    if (!offloadable(rows, day)) fail('OFFLOAD_DAY_NOT_ARCHIVED');
    const zip = new AdmZip(), manifest = { schema: 'linguistpro-news-offload', schema_version: 1, day, created_at: israelIso(now()), articles: [] };
    let photos = 0;
    for (const r of rows) {
      const dir = 'articles/' + r.article_id + '/', body = Buffer.from(r.body_json, 'utf8');
      zip.addFile(dir + 'body.json', body);
      const works = await dbAll(db, 'SELECT work_id, level, position_no, snapshot_json, snapshot_sha256 FROM news_works WHERE article_id=? ORDER BY position_no', [r.article_id]);
      for (const w of works) zip.addFile(dir + 'works/' + w.work_id + '.json', Buffer.from(w.snapshot_json, 'utf8'));
      const imgs = await dbAll(db, 'SELECT name, mime, sha256, bytes, created_at FROM news_images WHERE article_id=? ORDER BY name', [r.article_id]);
      for (const im of imgs) { zip.addFile(dir + im.name, Buffer.from(im.bytes)); zip.getEntry(dir + im.name).header.method = 0; } // JPEGs: stored, not deflated
      photos += imgs.length;
      manifest.articles.push({ article_id: r.article_id, body_sha256: sha(body), works: works.map(w => ({ work_id: w.work_id, level: w.level, position_no: w.position_no, snapshot_sha256: w.snapshot_sha256,
        file_sha256: sha(Buffer.from(w.snapshot_json, 'utf8')) })), images: imgs.map(im => ({ name: im.name, mime: im.mime, sha256: im.sha256, created_at: im.created_at })) });
    }
    const ov = await dbAll(db, 'SELECT * FROM news_overview_items WHERE day=?', [day]).catch(() => []);
    zip.addFile('overview.json', Buffer.from(JSON.stringify({ day, rows: ov }, null, 1)));
    zip.addFile('README.txt', Buffer.from(README));
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 1)));
    const buf = zip.toBuffer(), digest = sha(buf);
    const held = JSON.stringify(manifest.articles.map(a => ({ article_id: a.article_id, body_sha256: a.body_sha256 })));
    await dbRun(db, `INSERT INTO news_offloads(day, sha256, state, articles, photos, bytes, exported_at, manifest_json) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(day) DO UPDATE SET sha256=excluded.sha256, state='exported', articles=excluded.articles,
      photos=excluded.photos, bytes=excluded.bytes, exported_at=excluded.exported_at, manifest_json=excluded.manifest_json`, [day, digest, 'exported', rows.length, photos, buf.length, iso(now()), held]);
    return { day, buf, sha256: digest, articles: rows.length, photos, name: `news-${day}.lpnews-archive.zip` };
  }

  // The owner's browser wrote the file, read it back and got this sha256: now the server forgets the day.
  async function release(day, digest) {
    const o = await dbGet(db, 'SELECT * FROM news_offloads WHERE day=?', [String(day || '')]);
    if (!o || o.state !== 'exported') fail('OFFLOAD_NOT_EXPORTED');
    if (String(digest || '') !== o.sha256) fail('OFFLOAD_SHA_MISMATCH');
    // Only what the archive holds, and only if it is still what was exported (a revision since keeps its data).
    const held = JSON.parse(o.manifest_json || '[]');
    let photos = 0, released = 0, skipped = 0;
    await tx(async () => {
      for (const h of held) {
        const r = await dbGet(db, 'SELECT article_id, body_json, offloaded_day FROM news_articles WHERE article_id=?', [h.article_id]);
        if (!r || r.offloaded_day || !r.body_json || sha(Buffer.from(r.body_json, 'utf8')) !== h.body_sha256) { skipped++; continue; }
        released++;
        const n = await dbGet(db, 'SELECT COUNT(*) n FROM news_images WHERE article_id=?', [r.article_id]);
        photos += n ? n.n : 0;
        await dbRun(db, 'DELETE FROM news_images WHERE article_id=?', [r.article_id]);
        await dbRun(db, 'DELETE FROM news_works WHERE article_id=?', [r.article_id]);
        await dbRun(db, 'UPDATE news_articles SET body_json=NULL, offloaded_day=?, updated_at=? WHERE article_id=?', [day, iso(now()), r.article_id]);
      }
      await dbRun(db, `UPDATE news_offloads SET state='released', released_at=? WHERE day=?`, [iso(now()), day]);
    });
    cached = null;
    return { day, articles: released, photos, ...(skipped ? { skipped } : {}) };
  }

  // Only the owner. Every file is checked against the manifest before anything is written.
  async function restore(actor, zipBuffer) {
    if (!actor || actor.kind !== 'owner') fail('RESTORE_OWNER_ONLY', 403);
    if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length > MAX_ARCHIVE) fail('OFFLOAD_DAMAGED', 400);
    let zip, m;
    try { zip = new AdmZip(zipBuffer); m = JSON.parse(zip.readAsText('manifest.json')); } catch (_) { fail('OFFLOAD_DAMAGED', 400); }
    if (!m || m.schema !== 'linguistpro-news-offload' || m.schema_version !== 1 || !DAY.test(String(m.day)) || !Array.isArray(m.articles)) fail('OFFLOAD_DAMAGED', 400);
    const read = name => { const e = zip.getEntry(name); return e ? e.getData() : null; };
    const plan = [];
    for (const a of m.articles) {
      if (!a || !ID.test(String(a.article_id))) fail('OFFLOAD_DAMAGED', 400);
      const dir = 'articles/' + a.article_id + '/', body = read(dir + 'body.json');
      if (!body || sha(body) !== a.body_sha256) fail('OFFLOAD_DAMAGED', 400);
      const works = (a.works || []).map(w => { if (!WORK.test(String(w.work_id))) fail('OFFLOAD_DAMAGED', 400); const b = read(dir + 'works/' + w.work_id + '.json'); if (!b || sha(b) !== w.file_sha256) fail('OFFLOAD_DAMAGED', 400); return { ...w, json: b.toString('utf8') }; });
      const images = (a.images || []).map(im => { if (!IMG.test(String(im.name))) fail('OFFLOAD_DAMAGED', 400); const b = read(dir + im.name); if (!b || sha(b) !== im.sha256) fail('OFFLOAD_DAMAGED', 400); return { ...im, bytes: b }; });
      plan.push({ id: a.article_id, body: body.toString('utf8'), works, images });
    }
    let restored = 0, duplicate = 0, missing = 0, expired = 0;
    await tx(async () => {
      for (const p of plan) {
        const row = await dbGet(db, 'SELECT offloaded_day, body_json, tier, published_at FROM news_articles WHERE article_id=?', [p.id]);
        if (!row) { missing++; continue; }
        if (!row.offloaded_day || row.body_json) { duplicate++; continue; }
        // Past the archive's 6 months the article is only a card: nothing to bring back.
        if (row.tier !== 'archive') { expired++; continue; }
        if (now() - Date.parse(row.published_at) > PHOTO_MS) p.images = []; // photos live 2 months
        await dbRun(db, 'UPDATE news_articles SET body_json=?, offloaded_day=NULL, updated_at=? WHERE article_id=?', [p.body, iso(now()), p.id]);
        for (const w of p.works) await dbRun(db, 'INSERT OR REPLACE INTO news_works(work_id, article_id, level, position_no, snapshot_json, snapshot_sha256) VALUES (?,?,?,?,?,?)', [w.work_id, p.id, w.level, w.position_no, w.json, w.snapshot_sha256]);
        for (const im of p.images) await dbRun(db, 'INSERT OR REPLACE INTO news_images(article_id, name, mime, sha256, bytes, created_at) VALUES (?,?,?,?,?,?)', [p.id, im.name, im.mime, im.sha256, im.bytes, im.created_at || iso(now())]);
        restored++;
      }
      if (restored) await dbRun(db, `UPDATE news_offloads SET state='restored', restored_at=? WHERE day=?`, [iso(now()), m.day]);
    });
    cached = null;
    return { day: m.day, restored, duplicate, missing, ...(expired ? { expired } : {}) };
  }
  return { storage, exportDay, release, restore, README };
}

module.exports = { createNewsOffload, OffloadError };
