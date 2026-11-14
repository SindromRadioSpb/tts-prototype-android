'use strict';
// The daily article harvester (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §16, owner decision
// 2026-11-14): once a day the server reads the outlets' RSS feeds, takes the new articles one-to-one —
// body by paragraphs and sentences, photos with captions and credits — and writes one archive of
// drafts. dot adds translation and learning fields and packs it with scripts/news/build-pack.js.
// Polite by construction: robots.txt is honoured, one request at a time with a pause, an honest
// User-Agent, nothing behind a paywall or a bot challenge is worked around.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const C = require('../newsPackCore');
const Outlets = require('../../public/js/news-outlets');
const { SOURCES } = require('./newsHarvestSources');
const { extractArticle, israelIso } = require('./newsExtract');
const { splitSentences } = require('./newsText');

const USER_AGENT = 'LinguistProNewsReader/1.0 (+https://linguistpro.kolosei.com)';
const LIMITS = { perOutlet: 8, imagesPerArticle: 8, rows: 400, page: 4 * 1024 * 1024, feed: 2 * 1024 * 1024, image: 15 * 1024 * 1024,
  imageOut: 600 * 1024, minChars: 400, minParagraphs: 2, maxAgeMs: 36 * 3600 * 1000, keepRunsDays: 7, keepSeenDays: 45, staleRunMs: 3600 * 1000 };
const RUN_HOUR = 6; // Israel time

const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- RSS -------------------------------------------------------------------------------------------
function decodeXml(s) {
  return String(s || '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&').trim();
}
function parseFeed(xml) {
  const items = [];
  for (const m of String(xml || '').matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const body = m[1], tag = name => { const t = body.match(new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>')); return t ? decodeXml(t[1]) : ''; };
    const enclosure = body.match(/<(?:enclosure|media:content|media:thumbnail)\b[^>]*\burl="([^"]+)"/);
    const link = tag('link') || tag('guid');
    if (/^https?:\/\//.test(link)) items.push({ link: link.replace(/^http:/, 'https:'), title: tag('title'), pubDate: tag('pubDate') || tag('dc:date'), image: enclosure ? decodeXml(enclosure[1]) : null });
  }
  return items;
}

// ---- robots.txt --------------------------------------------------------------------------------------
// Rules of the group for our agent, else of "*". Longest matching rule wins; Allow wins a tie.
function parseRobots(text, agent = 'linguistpronewsreader') {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(), m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') { if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(val.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (cur && (key === 'allow' || key === 'disallow')) cur.rules.push({ allow: key === 'allow', path: val });
  }
  const mine = groups.filter(g => g.agents.some(a => a !== '*' && agent.includes(a)));
  const rules = (mine.length ? mine : groups.filter(g => g.agents.includes('*'))).flatMap(g => g.rules).filter(r => r.path);
  return pathname => {
    let best = null;
    for (const r of rules) {
      const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
      if (re.test(pathname) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
    }
    return !best || best.allow;
  };
}

// ---- drafts ------------------------------------------------------------------------------------------
function rowsOf(paragraphs) {
  const rows = [];
  paragraphs.forEach((text, i) => { for (const s of splitSentences(text)) rows.push({ p: i + 1, he_plain: s, he_niqqud: '', translit: '', translit_ru: '', ru: '' }); });
  return rows;
}
function draftOf(a, { outletId, images, retrievedAt }) {
  const rows = rowsOf(a.paragraphs), warnings = [];
  if (rows.length > LIMITS.rows) { rows.length = LIMITS.rows; warnings.push('TRUNCATED'); }
  if (a.paywalled) warnings.push('PAYWALL_OPEN_PART_ONLY');
  const keptParagraphs = a.paragraphs.slice(0, rows.length ? rows[rows.length - 1].p : 0);
  const hero = images.find(im => im.role === 'hero');
  return {
    revision: 1,
    source: { outlet_id: outletId, url: a.url, canonical_url: a.canonical_url, section_original_he: a.section_original_he, section: a.section,
      content_type: a.content_type, published_at: a.published_at, updated_at: a.updated_at, retrieved_at: retrievedAt, author: a.author,
      original_title_he: a.title_he.slice(0, 300), paywalled: !!a.paywalled, language: 'he' },
    image: hero ? { mode: 'source_link', url: hero.source_url, credit_he: hero.credit_he || undefined, alt_he: hero.alt_he || undefined } : { mode: 'none' },
    images: images.map(im => ({ file: im.file, role: im.role, ...(im.role === 'inline' ? { after_p: im.after_p } : {}), source_url: im.source_url,
      ...(im.credit_he ? { credit_he: im.credit_he } : {}), ...(im.caption_he ? { caption_he: im.caption_he, caption_ru: '' } : {}), ...(im.alt_he ? { alt_he: im.alt_he } : {}), alt_ru: '' })),
    learning: { title_he: a.title_he, title_ru: '', ...(a.subtitle_he ? { subtitle_he: a.subtitle_he, subtitle_ru: '' } : {}), summary_ru: '',
      versions: [{ level: 'OR', rows }], sensitive: { heavy: false, kinds: [] } },
    prepared: { method: 'original', by: 'linguistpro-harvester', prepared_at: retrievedAt },
    quality: { warnings },
    source_text_he: keptParagraphs.join('\n\n'),
  };
}

// ---- the harvester -----------------------------------------------------------------------------------
function createNewsHarvester({ db, dataDir, fetchImpl = globalThis.fetch, loadSharp = () => require('sharp'), sources = SOURCES,
  limits = {}, delayMs = 1200, now = () => Date.now(), log = () => {}, blocked = [] } = {}) {
  const L = { ...LIMITS, ...limits };
  const dir = path.join(dataDir, 'news-harvest');
  let running = null;

  async function get(url, { max, accept }) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: accept || '*/*', 'accept-language': 'he,en;q=0.5' }, redirect: 'follow', signal: ctl.signal });
      if (!r.ok) { const e = new Error('HTTP_' + r.status); e.status = r.status; e.challenge = r.status === 403 || r.status === 503; throw e; }
      const len = Number(r.headers.get('content-length') || 0);
      if (len && len > max) throw new Error('TOO_LARGE');
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > max) throw new Error('TOO_LARGE');
      return { buf, type: String(r.headers.get('content-type') || ''), url: r.url || url };
    } finally { clearTimeout(timer); }
  }
  const robotsCache = new Map();
  async function allowed(url) {
    const u = new URL(url);
    if (!robotsCache.has(u.host)) {
      let rule = () => true;
      try { rule = parseRobots((await get(u.origin + '/robots.txt', { max: 512 * 1024, accept: 'text/plain' })).buf.toString('utf8')); }
      catch (e) { if (e.challenge) rule = () => false; }
      robotsCache.set(u.host, rule);
    }
    return robotsCache.get(u.host)(u.pathname);
  }

  async function photo(src, sharp) {
    const { buf } = await get(src, { max: L.image, accept: 'image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.5' });
    const img = sharp(buf, { failOn: 'none' }).rotate();
    const info = await img.metadata();
    if (!info.width || info.width < 200 || (info.height || 0) < 120) throw new Error('TOO_SMALL');
    for (const [side, q] of [[1600, 82], [1600, 72], [1280, 72], [1024, 68]]) {
      const out = await sharp(buf, { failOn: 'none' }).rotate().resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
      if (out.length <= L.imageOut) return out;
    }
    throw new Error('TOO_LARGE');
  }

  async function seenKeys(keys) {
    if (!keys.length) return new Set();
    const rows = await dbAll(db, `SELECT url_key FROM news_harvest_seen WHERE url_key IN (${keys.map(() => '?').join(',')})`, keys);
    return new Set(rows.map(r => r.url_key));
  }
  const keyOf = (outletId, url) => { try { return C.articleKey(outletId, C.canonicalizeUrl(url)); } catch (_) { return null; } };

  async function harvest(runId, trigger) {
    const started = now(), retrievedAt = israelIso(started), sharp = loadSharp();
    try { sharp.concurrency(1); sharp.cache(false); } catch (_) {}
    const zip = new AdmZip(), report = { outlets: {}, articles: [] };
    let articles = 0, images = 0, n = 0;
    for (const src of sources) {
      const rep = report.outlets[src.outlet_id] = { feed_items: 0, taken: 0, skipped: {}, errors: [] };
      const skip = reason => { rep.skipped[reason] = (rep.skipped[reason] || 0) + 1; };
      if (blocked.includes(src.outlet_id)) { rep.errors.push('BLOCKED_FOR_SERVERS'); continue; }
      let items = [];
      for (const feed of src.feeds) {
        try { items = items.concat(parseFeed((await get(feed.url, { max: L.feed, accept: 'application/rss+xml,application/xml,text/xml' })).buf.toString('utf8')).map(it => ({ ...it, section_he: feed.section_he }))); }
        catch (e) { rep.errors.push((e.challenge ? 'BOT_CHALLENGE' : 'FEED_FAILED') + ':' + e.message); }
        await sleep(delayMs);
      }
      rep.feed_items = items.length;
      const fresh = items.filter(it => src.article.test(it.link) && Outlets.outletForUrl(it.link) === src.outlet_id)
        .filter(it => { const t = Date.parse(it.pubDate); return !isFinite(t) || started - t <= L.maxAgeMs; });
      const keys = fresh.map(it => keyOf(src.outlet_id, it.link)), seen = await seenKeys(keys.filter(Boolean));
      const queue = [], inRun = new Set();
      fresh.forEach((it, i) => { if (keys[i] && !seen.has(keys[i]) && !inRun.has(keys[i])) { inRun.add(keys[i]); queue.push({ it, key: keys[i] }); } });
      for (const { it, key } of queue) {
        if (rep.taken >= L.perOutlet) break;
        if (!(await allowed(it.link))) { skip('ROBOTS'); continue; }
        let page;
        try { page = await get(it.link, { max: L.page, accept: 'text/html' }); }
        catch (e) { if (e.challenge) { rep.errors.push('BOT_CHALLENGE'); break; } skip('PAGE_FAILED'); continue; }
        finally { await sleep(delayMs); }
        const markSeen = () => dbRun(db, 'INSERT OR IGNORE INTO news_harvest_seen(url_key, outlet_id, run_id, seen_at) VALUES (?,?,?,?)', [key, src.outlet_id, runId, new Date(now()).toISOString()]);
        const r = extractArticle(page.buf.toString('utf8'), { url: it.link, source: src, feed: { pubDate: it.pubDate, section_he: it.section_he, image: it.image } });
        if (!r.ok) { skip(r.reason); await markSeen(); continue; }
        const a = r.article;
        if (!a.published_at) { skip('NO_DATE'); await markSeen(); continue; }
        if (a.paragraphs.length < L.minParagraphs || a.paragraphs.join(' ').length < L.minChars) { skip(a.paywalled ? 'PAYWALL' : 'TOO_SHORT'); await markSeen(); continue; }
        const canonicalKey = keyOf(src.outlet_id, a.canonical_url);
        if (canonicalKey && canonicalKey !== key && (await seenKeys([canonicalKey])).size) { skip('DUPLICATE'); await markSeen(); continue; }
        n++;
        const folder = src.outlet_id + '-' + String(n).padStart(4, '0'), files = [];
        for (const im of a.images.slice(0, L.imagesPerArticle)) {
          try {
            const bytes = await photo(im.src, sharp);
            const file = 'img-' + (files.length + 1) + '.jpg';
            zip.addFile(folder + '/' + file, bytes);
            files.push({ ...im, file, source_url: im.src });
          } catch (_) { /* a photo that does not load is left out; the article stays */ }
          await sleep(Math.round(delayMs / 3));
        }
        if (files.length && !files.some(f => f.role === 'hero')) files[0] = { ...files[0], role: 'hero' };
        const draft = draftOf(a, { outletId: src.outlet_id, images: files, retrievedAt });
        zip.addFile(folder + '.draft.json', Buffer.from(JSON.stringify(draft, null, 1)));
        await markSeen();
        if (canonicalKey && canonicalKey !== key) await dbRun(db, 'INSERT OR IGNORE INTO news_harvest_seen(url_key, outlet_id, run_id, seen_at) VALUES (?,?,?,?)', [canonicalKey, src.outlet_id, runId, new Date(now()).toISOString()]);
        rep.taken++; articles++; images += files.length;
        report.articles.push({ draft: folder + '.draft.json', outlet_id: src.outlet_id, title_he: a.title_he, url: a.canonical_url, published_at: a.published_at,
          rows: draft.learning.versions[0].rows.length, images: files.length, paywalled: !!a.paywalled, warnings: draft.quality.warnings });
        log('[news-harvest] ' + folder + ' ' + a.title_he.slice(0, 60));
      }
    }
    const day = retrievedAt.slice(0, 10);
    let fileName = null, bytes = 0;
    if (articles) {
      zip.addFile('README-dot.md', fs.readFileSync(path.join(__dirname, 'dotTask.md')));
      zip.addFile('harvest.json', Buffer.from(JSON.stringify({ schema: 'linguistpro-news-harvest', schema_version: 1, run_id: runId, created_at: retrievedAt, articles: report.articles, outlets: report.outlets }, null, 1)));
      fs.mkdirSync(dir, { recursive: true });
      fileName = `news-harvest-${day}-${runId.slice(-6)}.zip`;
      const buf = zip.toBuffer();
      fs.writeFileSync(path.join(dir, fileName + '.part'), buf);
      fs.renameSync(path.join(dir, fileName + '.part'), path.join(dir, fileName));
      bytes = buf.length;
    }
    await dbRun(db, `UPDATE news_harvest_runs SET status='done', finished_at=?, articles=?, images=?, bytes=?, file_name=?, report_json=? WHERE run_id=?`,
      [new Date(now()).toISOString(), articles, images, bytes, fileName, JSON.stringify(report), runId]);
    return { run_id: runId, trigger, status: 'done', articles, images, bytes, file_name: fileName, report };
  }

  async function cleanup() {
    const cutoff = new Date(now() - L.keepRunsDays * 86400000).toISOString();
    for (const r of await dbAll(db, 'SELECT run_id, file_name FROM news_harvest_runs WHERE started_at < ?', [cutoff])) {
      if (r.file_name) try { fs.rmSync(path.join(dir, path.basename(r.file_name)), { force: true }); } catch (_) {}
      await dbRun(db, 'DELETE FROM news_harvest_runs WHERE run_id = ?', [r.run_id]);
    }
    await dbRun(db, 'DELETE FROM news_harvest_seen WHERE seen_at < ?', [new Date(now() - L.keepSeenDays * 86400000).toISOString()]);
    await dbRun(db, `UPDATE news_harvest_runs SET status='failed', finished_at=?, report_json=? WHERE status='running' AND started_at < ?`,
      [new Date(now()).toISOString(), JSON.stringify({ error: 'STALE' }), new Date(now() - L.staleRunMs).toISOString()]);
  }

  // → the run summary; a second call while one is running gets HARVEST_RUNNING.
  async function runOnce({ trigger = 'manual' } = {}) {
    if (running) { const e = new Error('HARVEST_RUNNING'); e.code = 'HARVEST_RUNNING'; throw e; }
    const runId = 'nh_' + crypto.randomBytes(9).toString('hex'), startedIso = new Date(now()).toISOString();
    await dbRun(db, `INSERT INTO news_harvest_runs(run_id, day, trigger, status, started_at) VALUES (?,?,?,'running',?)`, [runId, israelIso(now()).slice(0, 10), trigger, startedIso]);
    running = harvest(runId, trigger).catch(async e => {
      await dbRun(db, `UPDATE news_harvest_runs SET status='failed', finished_at=?, report_json=? WHERE run_id=?`, [new Date(now()).toISOString(), JSON.stringify({ error: String(e && e.message || e) }), runId]).catch(() => {});
      throw e;
    }).finally(() => { running = null; cleanup().catch(() => {}); });
    return running;
  }
  // Called every few minutes: once a day after RUN_HOUR Israel time, unless today already has a run.
  async function tick() {
    if (running) return null;
    const t = now(), local = israelIso(t), hour = Number(local.slice(11, 13));
    if (hour < RUN_HOUR) return null;
    // Any run since today's 06:00 (a manual one too) counts: no second, nearly empty archive.
    const since = new Date(t - (((hour - RUN_HOUR) * 60 + Number(local.slice(14, 16))) * 60 + Number(local.slice(17, 19))) * 1000).toISOString();
    const today = await dbGet(db, `SELECT run_id FROM news_harvest_runs WHERE started_at >= ? AND status IN ('running','done')`, [since]);
    if (today) return null;
    return runOnce({ trigger: 'schedule' });
  }
  async function listRuns(limit = 14) {
    const rows = await dbAll(db, 'SELECT * FROM news_harvest_runs ORDER BY started_at DESC LIMIT ?', [Math.max(1, Math.min(50, Number(limit) || 14))]);
    return rows.map(r => {
      let report = {}; try { report = JSON.parse(r.report_json || '{}'); } catch (_) {}
      return { run_id: r.run_id, day: r.day, trigger: r.trigger, status: r.status, started_at: r.started_at, finished_at: r.finished_at,
        articles: r.articles, images: r.images, bytes: r.bytes, file_name: r.file_name, outlets: report.outlets || {}, error: report.error || null,
        has_file: !!(r.file_name && fs.existsSync(path.join(dir, path.basename(r.file_name)))) };
    });
  }
  async function runFile(runId) {
    const r = await dbGet(db, 'SELECT file_name FROM news_harvest_runs WHERE run_id = ?', [String(runId)]);
    if (!r || !r.file_name) return null;
    const file = path.join(dir, path.basename(r.file_name));
    return fs.existsSync(file) ? { path: file, name: path.basename(r.file_name) } : null;
  }
  return { runOnce, tick, listRuns, runFile, isRunning: () => !!running, cleanup };
}

module.exports = { createNewsHarvester, parseFeed, parseRobots, draftOf, rowsOf, USER_AGENT, LIMITS };
