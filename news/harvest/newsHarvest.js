'use strict';
// The article harvester (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §16–§17).
// v2, owner decision 2026-11-15: every hour the server reads the outlets' RSS feeds and keeps every new
// article (body by paragraphs, photos with captions). Each morning it groups the day's articles into
// stories, picks the main ~22 stories with a quota per rubric — one article each for the full study
// treatment — and lists all of the day's articles in «Обзор дня» (title, subtitle, first paragraph).
// dot translates and packs it with scripts/news/build-pack.js.
// Polite by construction: robots.txt is honoured, one request at a time with a pause, an honest
// User-Agent, nothing behind a paywall or a bot challenge is worked around.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const C = require('../newsPackCore');
const Outlets = require('../../public/js/news-outlets');
const { SOURCES, canFetchArchiveImage } = require('./newsHarvestSources');
const { extractArticle, israelIso } = require('./newsExtract');
const { splitSentences } = require('./newsText');
const { refineSection } = require('./newsStories');
const { createStoryStore } = require('./newsStoryStore');
const { normalizeSchedule, dayOf, dueSlot, slotTimes } = require('./newsEditions');
const { buildEdition, makeDraft } = require('./newsEditionBuild');
const { fingerprintOf, diffPrints, paragraphsOfRows } = require('../newsFingerprint');
const { ARTICLE_ID, ORDER_TTL_MS, ARCHIVE_WINDOW_MS, archiveDraftHash } = require('../newsArchiveOrder');

const USER_AGENT = 'LinguistProNewsReader/1.0 (+https://linguistpro.kolosei.com)';
const LIMITS = { mainStories: 22, imagesPerArticle: 8, rows: 400, page: 4 * 1024 * 1024, feed: 2 * 1024 * 1024, image: 15 * 1024 * 1024,
  imageOut: 600 * 1024, minChars: 400, minParagraphs: 2, maxAgeMs: 36 * 3600 * 1000, pagesPerPoll: 120, pollEveryMs: 55 * 60 * 1000,
  keepRunsDays: 7, keepItemsDays: 45, keepBodyDays: 45, plainBodyDays: 3, staleRunMs: 3600 * 1000, leadChars: 450 };
const DIGEST = /^חדשות היום|כותרות השבת|כותרות הבוקר|סיכום חדשות|סיכום השבוע|עדכונים שוטפים|מתעדכן|LIVE|לייב|^מבזק/;

const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const parse = s => { try { return JSON.parse(s || 'null'); } catch (_) { return null; } };
const { bodyOf, hasBody, packBody } = require('./newsBody');
const { buildNewsSnapshot } = require('../newsSnapshot');
const { publicWork, NewsError } = require('../../db/newsRepo');

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
function draftOf(a, { outletId, images, retrievedAt, storyKey }) {
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
      versions: [{ level: 'OR', rows }], ...(storyKey ? { story_key: storyKey } : {}), sensitive: { heavy: false, kinds: [] } },
    prepared: { method: 'original', by: 'linguistpro-harvester', prepared_at: retrievedAt },
    quality: { warnings },
    source_text_he: keptParagraphs.join('\n\n'),
  };
}
// The first paragraph for «Обзор дня»: whole sentences up to ~450 characters; a short subheading-like
// first paragraph takes the next one with it.
function leadOf(paragraphs, max = LIMITS.leadChars) {
  const ps = (paragraphs || []).slice(0, 3);
  let text = ps[0] || '';
  if (text.length < 60 && ps[1]) text = text + ' ' + ps[1];
  if (text.length <= max) return text;
  let out = '';
  for (const s of splitSentences(text)) { if ((out + ' ' + s).trim().length > max) break; out = (out + ' ' + s).trim(); }
  return out || text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

// ---- the harvester -----------------------------------------------------------------------------------
function createNewsHarvester({ db, dataDir, fetchImpl = globalThis.fetch, loadSharp = () => require('sharp'), sources = SOURCES,
  limits = {}, delayMs = 1200, now = () => Date.now(), log = () => {}, blocked = [], index = { refresh: async () => ({}), prune: async () => 0 }, diskGuard = null, tagsForDot = null } = {}) {
  // The news index follows every change of the slice (findability spec §7.1); a failure never stops the harvest.
  const reindex = keys => keys && keys.length ? index.refresh(keys).catch(e => log('[news-index] refresh failed: ' + (e && e.message))) : Promise.resolve();
  const L = { ...LIMITS, ...limits };
  const dir = path.join(dataDir, 'news-harvest');
  let busy = null, lastPollAt = 0, lastPollReport = null;

  async function get(url, { max, accept, redirect = 'follow', timeoutMs = 25000, streamBounded = false }) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: accept || '*/*', 'accept-language': 'he,en;q=0.5' }, redirect, signal: ctl.signal });
      if (!r.ok) { const e = new Error('HTTP_' + r.status); e.status = r.status; e.challenge = r.status === 403 || r.status === 503; throw e; }
      const len = Number(r.headers.get('content-length') || 0);
      if (len && len > max) throw new Error('TOO_LARGE');
      let buf;
      if (streamBounded && r.body) {
        const chunks = []; let size = 0;
        for await (const chunk of r.body) {
          size += chunk.byteLength;
          if (size > max) throw new Error('TOO_LARGE');
          chunks.push(chunk);
        }
        buf = Buffer.concat(chunks, size);
      } else buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > max) throw new Error('TOO_LARGE');
      return { buf, type: String(r.headers.get('content-type') || ''), url: r.url || url };
    } finally { clearTimeout(timer); }
  }
  const robotsCache = new Map();
  async function allowed(url) {
    const u = new URL(url);
    const cached = robotsCache.get(u.host);
    if (!cached || now() - cached.at > 6 * 3600e3) {
      let rule = () => true;
      try { rule = parseRobots((await get(u.origin + '/robots.txt', { max: 512 * 1024, accept: 'text/plain' })).buf.toString('utf8')); }
      catch (e) { if (e.challenge) rule = () => false; }
      robotsCache.set(u.host, { rule, at: now() });
    }
    return robotsCache.get(u.host).rule(u.pathname);
  }

  // A photo once fetched and resized is kept 3 days on disk: a carried draft does not ask the outlet again.
  const photoCache = path.join(dir, 'photo-cache');
  const cachedPhotoPath = src => path.join(photoCache, crypto.createHash('sha256').update(String(src)).digest('hex').slice(0, 32) + '.jpg');
  function cachedPhoto(src) {
    const b = fs.readFileSync(cachedPhotoPath(src));
    if (b.length > 1000 && b.length <= L.imageOut && b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9) return b;
    throw new Error('PHOTO_NOT_CACHED');
  }
  async function photo(src, sharp) {
    const cached = cachedPhotoPath(src);
    try { return cachedPhoto(src); } catch (_) {} // a whole JPEG only
    const out = await photoFresh(src, sharp);
    try { fs.mkdirSync(photoCache, { recursive: true }); fs.writeFileSync(cached + '.part', out); fs.renameSync(cached + '.part', cached); } catch (_) {}
    return out;
  }
  async function photoFresh(src, sharp, opts = {}) {
    const { buf } = await get(src, { max: L.image, accept: 'image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.5', ...opts });
    const info = await sharp(buf, { failOn: 'none' }).metadata();
    if (!info.width || info.width < 200 || (info.height || 0) < 120) throw new Error('TOO_SMALL');
    for (const [side, q] of [[1600, 82], [1600, 72], [1280, 72], [1024, 68]]) {
      const out = await sharp(buf, { failOn: 'none' }).rotate().resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
      if (out.length <= L.imageOut) return out;
    }
    throw new Error('TOO_LARGE');
  }
  function archivePhotoLoader(outletId, sharp) {
    const rules = new Map();
    const opts = { redirect: 'error', timeoutMs: 5000, streamBounded: true };
    return async src => {
      // Even previously cached bytes must originate from a permitted captured photo host.
      if (!canFetchArchiveImage(outletId, src)) throw new Error('ARCHIVE_IMAGE_HOST');
      try { return cachedPhoto(src); } catch (_) {}
      const u = new URL(src);
      if (!rules.has(u.origin)) {
        let allow;
        try { allow = parseRobots((await get(u.origin + '/robots.txt', { ...opts, max: 512 * 1024, accept: 'text/plain' })).buf.toString('utf8')); }
        catch (e) { if (e.status !== 404 && e.status !== 410) throw e; allow = () => true; }
        rules.set(u.origin, allow);
      }
      if (!rules.get(u.origin)(u.pathname)) throw new Error('ROBOTS');
      return photoFresh(src, sharp, opts);
    };
  }
  const keyOf = (outletId, url) => { try { return C.articleKey(outletId, C.canonicalizeUrl(url)); } catch (_) { return null; } };
  const iso = ms => new Date(ms).toISOString();

  // ---- hourly: feeds → queue → pages ----------------------------------------------------------------
  async function pollNow() {
    const started = now(), report = { at: iso(started), outlets: {}, pages: 0 }, touched = new Set();
    for (const src of sources) {
      const rep = report.outlets[src.outlet_id] = { feed_items: 0, new: 0, errors: [] };
      if (blocked.includes(src.outlet_id)) { rep.errors.push('BLOCKED_FOR_SERVERS'); continue; }
      for (const feed of src.feeds) {
        let items = [];
        try { items = parseFeed((await get(feed.url, { max: L.feed, accept: 'application/rss+xml,application/xml,text/xml' })).buf.toString('utf8')); }
        catch (e) { rep.errors.push((e.challenge ? 'BOT_CHALLENGE' : 'FEED_FAILED') + ':' + e.message); }
        rep.feed_items += items.length;
        for (const it of items) {
          if (!src.article.test(it.link) || Outlets.outletForUrl(it.link) !== src.outlet_id) continue;
          const t = Date.parse(it.pubDate);
          if (isFinite(t) && started - t > L.maxAgeMs) continue;
          const key = keyOf(src.outlet_id, it.link);
          if (!key) continue;
          // An article the v1 harvester already took (news_harvest_seen, before 3.11.891) is not taken again.
          const r = await dbRun(db, `INSERT OR IGNORE INTO news_harvest_items(url_key, outlet_id, url, feed_title, feed_section, feed_image, feed_pub_at, first_seen_at, status)
            SELECT ?,?,?,?,?,?,?,?,'queued' WHERE NOT EXISTS (SELECT 1 FROM news_harvest_seen WHERE url_key=?)`,
            [key, src.outlet_id, it.link, it.title || null, feed.section_he || null, it.image || null, isFinite(t) ? iso(t) : null, iso(now()), key]);
          if (r.changes) { rep.new++; touched.add(key); }
        }
        await sleep(delayMs);
      }
    }
    // Pages, oldest first; a page that fails is retried on the next polls, three times at most.
    const queue = await dbAll(db, `SELECT * FROM news_harvest_items WHERE status='queued' ORDER BY first_seen_at LIMIT ?`, [L.pagesPerPoll]);
    const challenged = new Set();
    for (const row of queue) {
      const src = sources.find(s => s.outlet_id === row.outlet_id);
      if (!src || challenged.has(row.outlet_id)) continue;
      touched.add(row.url_key);
      const fail = (reason, final) => dbRun(db, `UPDATE news_harvest_items SET status=?, reason=?, attempts=attempts+1 WHERE url_key=?`, [final ? 'failed' : 'queued', reason, row.url_key]);
      if (!(await allowed(row.url))) { await fail('ROBOTS', true); continue; }
      let page;
      try { page = await get(row.url, { max: L.page, accept: 'text/html' }); report.pages++; }
      catch (e) { if (e.challenge) { challenged.add(row.outlet_id); report.outlets[row.outlet_id].errors.push('BOT_CHALLENGE'); } await fail('PAGE_FAILED:' + e.message, row.attempts >= 2); await sleep(delayMs); continue; }
      await sleep(delayMs);
      const r = extractArticle(page.buf.toString('utf8'), { url: row.url, source: src, feed: { pubDate: row.feed_pub_at, section_he: row.feed_section, image: row.feed_image } });
      if (!r.ok) {
        // Not an article page we can read (a video, a gallery): still a headline of the day.
        await dbRun(db, `UPDATE news_harvest_items SET status='ready', reason=?, title_he=?, published_at=?, section=?, content_type='news', full_ok=0 WHERE url_key=?`,
          [r.reason, row.feed_title, row.feed_pub_at, 'news', row.url_key]);
        continue;
      }
      const a = r.article, chars = a.paragraphs.join(' ').length;
      a.section = refineSection(a.section, a.title_he, [a.subtitle_he, a.paragraphs[0]].join(' '));
      const canonicalKey = keyOf(row.outlet_id, a.canonical_url);
      if (canonicalKey && canonicalKey !== row.url_key && (await dbGet(db, `SELECT 1 FROM news_harvest_items WHERE (url_key=? OR canonical_key=?) AND url_key<>?`, [canonicalKey, canonicalKey, row.url_key]))) {
        await dbRun(db, `UPDATE news_harvest_items SET status='failed', reason='DUPLICATE', canonical_key=? WHERE url_key=?`, [canonicalKey, row.url_key]);
        continue;
      }
      // Digests and live pages («חדשות היום», «כותרות השבת») stay in the overview, not in the full treatment.
      const digest = DIGEST.test(a.title_he || '');
      const fullOk = !!a.published_at && !digest && a.paragraphs.length >= L.minParagraphs && chars >= L.minChars;
      const reason = !a.published_at ? 'NO_DATE' : digest ? 'DIGEST' : fullOk ? null : (a.paywalled ? 'PAYWALL' : 'TOO_SHORT');
      await dbRun(db, `UPDATE news_harvest_items SET status='ready', reason=?, canonical_key=?, published_at=?, section=?, content_type=?, title_he=?, subtitle_he=?, lead_he=?,
        paywalled=?, full_ok=?, chars=?, images=?, data_json=? WHERE url_key=?`,
        [reason, canonicalKey, a.published_at || row.feed_pub_at, a.section, a.content_type, a.title_he, a.subtitle_he || null, leadOf(a.paragraphs, L.leadChars) || null,
          a.paywalled ? 1 : 0, fullOk ? 1 : 0, chars, a.images.length, JSON.stringify(a), row.url_key]);
    }
    await reindex([...touched]);
    lastPollAt = started; lastPollReport = report;
    log(`[news-harvest] poll: ${Object.entries(report.outlets).map(([k, o]) => k + '+' + o.new).join(' ')} · pages ${report.pages}`);
    return report;
  }

  // ---- editions: cut-off → archive for dot (docs/superpowers/specs/2026-11-15-news-editions-design.md) --
  const stories = createStoryStore({ db, now });
  async function loadSchedule() {
    const r = await dbGet(db, `SELECT value_json FROM news_settings WHERE key='schedule'`).catch(() => null);
    try { return normalizeSchedule(r ? JSON.parse(r.value_json) : null); } catch (_) { return normalizeSchedule(null); }
  }
  async function saveSchedule(input) {
    const s = normalizeSchedule(input);
    await dbRun(db, `INSERT INTO news_settings(key, value_json, updated_at) VALUES ('schedule', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`,
      [JSON.stringify(s), iso(now())]);
    return s;
  }
  const newEditionId = () => 'ne_' + crypto.randomBytes(9).toString('hex');
  // Archives dot has not downloaded give way to the new one: their material is carried into it.
  async function supersede() {
    // The material of an archive dot did not take goes into the new one: its file is not needed any more.
    for (const e of await dbAll(db, `SELECT edition_id, file_name FROM news_editions WHERE status='archived'`)) {
      if (e.file_name) try { fs.rmSync(path.join(dir, path.basename(e.file_name)), { force: true }); } catch (_) {}
    }
    await dbRun(db, `UPDATE news_editions SET status='superseded', closed_at=?, file_name=NULL WHERE status='archived'`, [iso(now())]);
  }
  let closeExpired = null;
  function setCloseExpired(fn) { closeExpired = fn; }

  async function buildNow(editionId, { day, slot, trigger, schedule }) {
    await pollNow().catch(e => log('[news-harvest] poll before build failed: ' + (e && e.message)));
    const recheck = await recheckPublished({ editionId }).catch(e => { log('[news-harvest] re-check failed: ' + (e && e.message)); return { checked: 0, changed: 0, error: String(e && e.message || e) }; });
    const sharp = loadSharp();
    try { sharp.concurrency(1); sharp.cache(false); } catch (_) {}
    await supersede();
    if (closeExpired) await closeExpired();
    const interests = await interestsText().catch(() => ''), reading = await readingSummary().catch(() => null);
    const r = await buildEdition({ db, stories, editionId, day, slot, schedule, nowMs: now(), photo: src => photo(src, sharp), dir, draftOf, limits: L, log,
      // The owner's tags with their articles (findability W5): a signal for dot; an order is «Часть 0» of README-dot.
      extraFiles: { ...(tagsForDot ? { 'tags.json': JSON.stringify({ schema: 'linguistpro-news-owner-tags', tags: await tagsForDot().catch(() => ({})) }, null, 1) } : {}),
        'interests.md': interests || 'Интересы не записаны.\n', 'reading.json': JSON.stringify(reading || { days: 14, by_section: {}, by_outlet: {}, by_selected: {}, recent: [] }, null, 1) },
      readme: fs.readFileSync(path.join(__dirname, 'dotTask.md'), 'utf8'), sleep: () => sleep(Math.round(delayMs / 3)) });
    for (const [id, o] of Object.entries((lastPollReport && lastPollReport.outlets) || {})) if (o.errors.length) (r.report.outlets[id] = r.report.outlets[id] || { items: 0, main: 0 }).errors = o.errors;
    r.report.recheck = recheck;
    // Stories were assigned to the day's rows: the index takes their story keys.
    await reindex((await dbAll(db, 'SELECT url_key FROM news_harvest_items WHERE first_seen_at >= ?', [iso(now() - 26 * 3600000)])).map(x => x.url_key));
    const t = iso(now()), status = r.file_name ? 'archived' : 'skipped';
    await dbRun(db, `UPDATE news_editions SET status=?, cut_at=?, archive_ready_at=?, main_count=?, rework_count=?, overview_count=?, file_name=?, bytes=?, report_json=? WHERE edition_id=?`,
      [status, t, r.file_name ? t : null, r.main, r.rework, r.overview_items, r.file_name, r.bytes, JSON.stringify(r.report), editionId]);
    return { run_id: editionId, edition_id: editionId, day, slot, trigger, status, articles: r.articles, images: r.images, bytes: r.bytes,
      file_name: r.file_name, overview_items: r.overview_items, stories: r.stories, report: r.report };
  }
  async function startEdition({ day, slot, trigger, schedule, cutoffMs, readyMs }) {
    const editionId = newEditionId();
    await dbRun(db, `INSERT INTO news_editions(edition_id, day, slot, trigger, status, cutoff_at, target_ready_at) VALUES (?,?,?,?,'building',?,?)`,
      [editionId, day, slot, trigger, iso(cutoffMs || now()), readyMs ? iso(readyMs) : null]);
    try { return await buildNow(editionId, { day, slot, trigger, schedule }); }
    catch (e) {
      await dbRun(db, `UPDATE news_editions SET status='failed', closed_at=?, report_json=? WHERE edition_id=?`, [iso(now()), JSON.stringify({ error: String(e && e.message || e) }), editionId]).catch(() => {});
      throw e;
    }
  }

  // Articles the owner marked are kept beyond every retention (findability W4, news_pins); before migration 093 none.
  let pinsTable = null;
  async function unpinned() {
    if (pinsTable == null) pinsTable = !!(await dbGet(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name='news_pins'").catch(() => null));
    return pinsTable ? " AND url_key NOT IN (SELECT item_key FROM news_pins) AND COALESCE(canonical_key, '') NOT IN (SELECT item_key FROM news_pins)" : '';
  }
  async function cleanup() {
    const keep = await unpinned();
    for (const r of await dbAll(db, `SELECT order_id, file_name FROM news_archive_orders
      WHERE file_name IS NOT NULL AND expires_at <= ? ORDER BY expires_at LIMIT 100`, [iso(now())]).catch(() => [])) {
      if (r.file_name !== `news-archive-order-${r.order_id}.zip`) continue;
      try {
        fs.rmSync(path.join(dir, path.basename(r.file_name)), { force: true });
        await dbRun(db, 'UPDATE news_archive_orders SET file_name=NULL WHERE order_id=? AND file_name=?', [r.order_id, r.file_name]);
      } catch (_) {} // keep metadata and retry file cleanup on the next pass
    }
    for (const r of await dbAll(db, 'SELECT run_id, file_name FROM news_harvest_runs WHERE started_at < ?', [iso(now() - L.keepRunsDays * 86400000)])) {
      if (r.file_name) try { fs.rmSync(path.join(dir, path.basename(r.file_name)), { force: true }); } catch (_) {}
      await dbRun(db, 'DELETE FROM news_harvest_runs WHERE run_id = ?', [r.run_id]);
    }
    for (const r of await dbAll(db, 'SELECT edition_id, file_name FROM news_editions WHERE day < ? AND file_name IS NOT NULL', [israelIso(now() - L.keepRunsDays * 86400000).slice(0, 10)]).catch(() => [])) {
      try { fs.rmSync(path.join(dir, path.basename(r.file_name)), { force: true }); } catch (_) {}
      await dbRun(db, 'UPDATE news_editions SET file_name=NULL WHERE edition_id=?', [r.edition_id]);
    }
    // Full text (findability spec §2 п.5): plain 3 days, then gzip, gone after 45 days.
    for (;;) {
      const part = await dbAll(db, 'SELECT url_key, data_json FROM news_harvest_items WHERE data_json IS NOT NULL AND first_seen_at < ? LIMIT 200', [iso(now() - L.plainBodyDays * 86400000)]).catch(() => []);
      if (!part.length) break;
      for (const r of part) await dbRun(db, 'UPDATE news_harvest_items SET data_gz=?, data_json=NULL WHERE url_key=? AND data_json IS NOT NULL', [packBody(r.data_json), r.url_key]);
    }
    await dbRun(db, 'UPDATE news_harvest_items SET data_json=NULL, data_gz=NULL WHERE (data_json IS NOT NULL OR data_gz IS NOT NULL) AND first_seen_at < ?' + keep, [iso(now() - L.keepBodyDays * 86400000)]).catch(() => {});
    await trimForDisk().catch(e => log('[news-harvest] disk trim failed: ' + (e && e.message)));
    await dbRun(db, 'DELETE FROM news_harvest_items WHERE first_seen_at < ?' + keep, [iso(now() - L.keepItemsDays * 86400000)]);
    await index.prune(now()).catch(e => log('[news-index] prune failed: ' + (e && e.message)));
    // Tables that grew without end (findability spec §7.1): 45 days like the slice, study articles kept.
    const cutIso = iso(now() - L.keepItemsDays * 86400000), cutDay = israelIso(now() - L.keepItemsDays * 86400000).slice(0, 10);
    const alive = "SELECT article_id FROM news_articles WHERE tier<>'withdrawn'";
    await dbRun(db, `DELETE FROM news_overview_items WHERE day < ? AND item_key NOT IN (${alive})${keep ? ' AND item_key NOT IN (SELECT item_key FROM news_pins)' : ''}`, [cutDay]).catch(() => {});
    await dbRun(db, `DELETE FROM news_stories WHERE last_at < ? AND story_key NOT IN (SELECT story_key FROM news_overview_items) AND story_key NOT IN (SELECT story_key FROM news_harvest_items WHERE story_key IS NOT NULL)`, [cutIso]).catch(() => {});
    await dbRun(db, `DELETE FROM news_article_changes WHERE detected_at < ? AND article_id NOT IN (${alive})`, [cutIso]).catch(() => {});
    await dbRun(db, `DELETE FROM news_article_fingerprints WHERE created_at < ? AND article_id NOT IN (${alive})`, [cutIso]).catch(() => {});
    await dbRun(db, 'DELETE FROM news_read_signals WHERE at < ?', [iso(now() - 90 * 86400000)]).catch(() => {});
    // Photo cache: 3 days, and at most 500 MB (oldest first).
    try {
      const files = fs.readdirSync(photoCache).map(f => { const p = path.join(photoCache, f), st = fs.statSync(p); return { p, at: st.mtimeMs, size: st.size }; }).sort((a, b) => b.at - a.at);
      let total = 0;
      for (const f of files) { total += f.size; if (Date.now() - f.at > 3 * 86400000 || total > 500 * 1024 * 1024 || f.p.endsWith('.part')) fs.rmSync(f.p, { force: true }); }
    } catch (_) {}
    await dbRun(db, `UPDATE news_editions SET status='failed', closed_at=?, report_json=? WHERE status='building' AND cutoff_at < ?`,
      [iso(now()), JSON.stringify({ error: 'STALE' }), iso(now() - L.staleRunMs)]).catch(() => {});
  }

  // «Читать оригинал» (findability spec §2 п.8): any slice article with a kept body opens in the Reading Room
  // as the original without translation, built on request — nothing extra is stored. Photos only while cached.
  const RAW = /^(na_[0-9a-f]{24})\.rw$/, RAW_IMG = /^img-(\d{1,2})\.jpg$/;
  const notFound = () => new NewsError('NEWS_NOT_FOUND', 404);
  async function rawRow(itemKey, outletId) {
    const row = await dbGet(db, `SELECT * FROM news_harvest_items WHERE (url_key=? OR canonical_key=?) AND status='ready' AND full_ok=1 AND paywalled=0${outletId ? ' AND outlet_id=?' : ''} ORDER BY first_seen_at LIMIT 1`,
      outletId ? [itemKey, itemKey, outletId] : [itemKey, itemKey]);
    const a = row && bodyOf(row);
    return a && Array.isArray(a.paragraphs) && a.paragraphs.length ? { row, a } : null;
  }
  async function rawWork(outletId, workId) {
    const m = RAW.exec(String(workId || '')); if (!m) throw notFound();
    const got = await rawRow(m[1], String(outletId || '')); if (!got) throw notFound();
    const { row, a } = got;
    const images = (a.images || []).slice(0, L.imagesPerArticle || 12).map((im, i) => ({ ...im, file: 'img-' + (i + 1) + '.jpg', source_url: im.src }));
    const draft = draftOf(a, { outletId: row.outlet_id, images, retrievedAt: israelIso(Date.parse(row.first_seen_at) || now()), storyKey: row.story_key });
    const shown = [];
    for (const im of draft.images) {
      const bytes = await rawPhoto(m[1], im.file, im.source_url);
      if (bytes) shown.push({ ...im, url: '/api/news/images/' + m[1] + '/' + im.file + '?v=' + crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12) });
    }
    const article = { source: draft.source, image: draft.image, images: shown, learning: draft.learning, prepared: draft.prepared, quality: draft.quality };
    const { snapshot, snapshot_sha256 } = buildNewsSnapshot(article, article.learning.versions[0], { workId: m[0], raw: true });
    return publicWork({ outlet_id: row.outlet_id, work_id: m[0], title: a.title_he, snapshot, snapshot_sha256, published_at: a.published_at || row.published_at });
  }
  async function rawImage(itemKey, name) {
    const n = RAW_IMG.exec(String(name || '')); if (!n || !/^na_[0-9a-f]{24}$/.test(String(itemKey || ''))) return null;
    const got = await rawRow(itemKey, null); const im = got && (got.a.images || [])[Number(n[1]) - 1];
    if (!im) return null;
    const bytes = await rawPhoto(itemKey, 'img-' + n[1] + '.jpg', im.src);
    return bytes ? { mime: 'image/jpeg', sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes } : null;
  }
  // A raw photo: the 3-day cache, then the copy the owner's mark kept (W4).
  async function rawPhoto(itemKey, name, src) {
    try { return fs.readFileSync(cachedPhotoPath(src)); } catch (_) {}
    await unpinned();
    if (!pinsTable) return null;
    const p = await dbGet(db, 'SELECT bytes FROM news_pin_images WHERE item_key=? AND name=?', [itemKey, name]).catch(() => null);
    return p ? Buffer.from(p.bytes) : null;
  }

  // Below 2 GB free: the full text of the oldest days goes first, never inside 3 days; the day search by
  // text starts from is stored for the page (findability spec §2 п.5).
  async function trimForDisk() {
    const keep = await unpinned();
    const guard = diskGuard || (diskGuard = require('../newsDiskGuard').createDiskGuard({ dir: dataDir }));
    let trimmed = false;
    // One day per cleanup: cleared bodies only become reusable pages inside the file (no VACUUM), so free
    // disk does not rise right away — looping «while low» would empty all 45 days in one pass (review W3 I1).
    for (let i = 0; i < 1; i++) {
      if (!(await guard.check()).low) break;
      const oldest = await dbGet(db, 'SELECT MIN(first_seen_at) t FROM news_harvest_items WHERE (data_json IS NOT NULL OR data_gz IS NOT NULL) AND first_seen_at < ?' + keep, [iso(now() - L.plainBodyDays * 86400000)]);
      if (!oldest || !oldest.t) break;
      const day = israelIso(Date.parse(oldest.t)).slice(0, 10), end = new Date(Date.parse(israelIso(Date.parse(oldest.t)).slice(0, 10) + 'T00:00:00' + israelIso(Date.parse(oldest.t)).slice(-6)) + 86400000).toISOString();
      const keys = (await dbAll(db, 'SELECT url_key FROM news_harvest_items WHERE (data_json IS NOT NULL OR data_gz IS NOT NULL) AND first_seen_at < ? AND first_seen_at < ?' + keep, [end, iso(now() - L.plainBodyDays * 86400000)])).map(r => r.url_key);
      if (!keys.length) break;
      for (let j = 0; j < keys.length; j += 200) {
        const part = keys.slice(j, j + 200);
        await dbRun(db, `UPDATE news_harvest_items SET data_json=NULL, data_gz=NULL WHERE url_key IN (${part.map(() => '?').join(',')})`, part);
      }
      if (index.refreshInBatches) await index.refreshInBatches(keys).catch(e => log('[news-index] refresh failed: ' + (e && e.message)));
      else await reindex(keys);
      trimmed = true;
      log('[news-harvest] disk low: full text of ' + day + ' removed (' + keys.length + ')');
    }
    if (trimmed) {
      const left = await dbGet(db, 'SELECT MIN(first_seen_at) t FROM news_harvest_items WHERE data_json IS NOT NULL OR data_gz IS NOT NULL');
      const from = left && left.t ? israelIso(Date.parse(left.t)).slice(0, 10) : israelIso(now()).slice(0, 10);
      await dbRun(db, `INSERT INTO news_settings(key, value_json, updated_at) VALUES ('search_horizon', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`,
        [JSON.stringify({ from_day: from }), iso(now())]);
    } else {
      const h = await dbGet(db, "SELECT value_json FROM news_settings WHERE key='search_horizon'").catch(() => null);
      const cut = israelIso(now() - L.keepBodyDays * 86400000).slice(0, 10);
      if (h && (parse(h.value_json) || {}).from_day <= cut) await dbRun(db, "DELETE FROM news_settings WHERE key='search_horizon'");
    }
  }

  function exclusive(fn) {
    if (busy) { const e = new Error('HARVEST_RUNNING'); e.code = 'HARVEST_RUNNING'; return Promise.reject(e); }
    busy = Promise.resolve().then(fn).finally(() => { busy = null; cleanup().catch(() => {}); });
    return busy;
  }
  function poll() { return exclusive(pollNow); }
  // «Собрать сейчас»: an extra edition of the current day, picked like a midday one.
  function runOnce({ trigger = 'manual' } = {}) {
    return exclusive(async () => {
      const schedule = await loadSchedule();
      return startEdition({ day: dayOf(now(), schedule), slot: 'extra', trigger, schedule });
    });
  }
  // Called every few minutes: the edition of a slot whose cut-off has come (earlier slots missed while
  // the server was down are skipped — their material goes into this one), otherwise the hourly poll.
  async function tick() {
    if (busy) return null;
    const schedule = await loadSchedule(), t = now();
    const day = dayOf(t, schedule);
    const eds = await dbAll(db, 'SELECT slot, status FROM news_editions WHERE day=?', [day]);
    const due = dueSlot(t, schedule, eds);
    if (due) return exclusive(async () => {
      for (const slot of due.skip) await dbRun(db, `INSERT INTO news_editions(edition_id, day, slot, trigger, status, closed_at, report_json) VALUES (?,?,?,'schedule','skipped',?,?)`,
        [newEditionId(), day, slot, iso(t), JSON.stringify({ reason: 'MISSED' })]);
      return startEdition({ day, slot: due.slot, trigger: 'schedule', schedule, cutoffMs: due.cutoffMs, readyMs: due.readyMs });
    });
    if (t - lastPollAt >= L.pollEveryMs) return poll();
    return null;
  }

  // dot took the archive: its articles are «in work» for leaseHours and go in no other archive meanwhile.
  // The owner's download is only a look (lease: false): nothing is leased, dot still gets it as «next».
  async function downloadEdition(editionId, { lease = true } = {}) {
    const e = await dbGet(db, 'SELECT * FROM news_editions WHERE edition_id=?', [String(editionId)]);
    // A superseded edition's material is in the newer archive: never served (dot would translate it twice).
    if (!e || !e.file_name || ['superseded', 'skipped', 'failed', 'building'].includes(e.status)) return null;
    const file = path.join(dir, path.basename(e.file_name));
    if (!fs.existsSync(file)) return null;
    // dot's download leases; dot downloading it again (it crashed) renews the lease.
    if (lease && (e.status === 'archived' || (e.status === 'downloaded' && !e.first_upload_at && !e.closed_at))) {
      const schedule = await loadSchedule(), until = iso(now() + schedule.leaseHours * 3600e3), rep = parse(e.report_json) || {};
      await dbRun(db, `UPDATE news_editions SET status='downloaded', downloaded_at=COALESCE(downloaded_at, ?), lease_until=? WHERE edition_id=?`, [iso(now()), until, e.edition_id]);
      const keys = [...new Set([...(rep.overview_keys || []), ...(rep.main_keys || [])])];
      for (let i = 0; i < keys.length; i += 200) {
        const part = keys.slice(i, i + 200);
        await dbRun(db, `UPDATE news_harvest_items SET lease_until=? WHERE url_key IN (${part.map(() => '?').join(',')})`, [until, ...part]);
      }
    }
    return { path: file, name: path.basename(e.file_name), edition_id: e.edition_id };
  }

  // The editor's list: editions (and the pre-editions daily runs) in one shape.
  async function listRuns(limit = 14) {
    const lim = Math.max(1, Math.min(50, Number(limit) || 14));
    const eds = await dbAll(db, 'SELECT * FROM news_editions ORDER BY COALESCE(cut_at, cutoff_at, closed_at) DESC LIMIT ?', [lim]).catch(() => []);
    const old = await dbAll(db, 'SELECT * FROM news_harvest_runs ORDER BY started_at DESC LIMIT ?', [lim]);
    const fileOk = f => !!(f && fs.existsSync(path.join(dir, path.basename(f))));
    return [
      ...eds.map(e => { const report = parse(e.report_json) || {}; return { run_id: e.edition_id, edition_id: e.edition_id, day: e.day, slot: e.slot, trigger: e.trigger, status: e.status,
        started_at: e.cutoff_at || e.cut_at, finished_at: e.archive_ready_at, articles: e.main_count + e.rework_count, images: 0, bytes: e.bytes, file_name: e.file_name,
        outlets: report.outlets || {}, error: report.error || null, overview_items: e.overview_count, stories: report.stories || 0, has_file: fileOk(e.file_name) }; }),
      ...old.map(r => {
        const report = parse(r.report_json) || {};
        return { run_id: r.run_id, day: r.day, trigger: r.trigger, status: r.status, started_at: r.started_at, finished_at: r.finished_at,
          articles: r.articles, images: r.images, bytes: r.bytes, file_name: r.file_name, outlets: report.outlets || {}, error: report.error || null,
          overview_items: report.items || 0, stories: report.stories || 0, has_file: fileOk(r.file_name) };
      }),
    ].slice(0, lim);
  }
  // What the next edition will hold so far.
  async function pending() {
    const rows = await dbAll(db, `SELECT outlet_id, COUNT(*) n FROM news_harvest_items WHERE status='ready' AND overview_state='todo' AND first_seen_at >= ? GROUP BY outlet_id`, [iso(now() - L.maxAgeMs)]);
    const queued = await dbGet(db, `SELECT COUNT(*) n FROM news_harvest_items WHERE status='queued'`);
    return { items: rows.reduce((a, r) => a + r.n, 0), outlets: Object.fromEntries(rows.map(r => [r.outlet_id, r.n])), queued: queued ? queued.n : 0, last_poll_at: lastPollAt ? iso(lastPollAt) : null };
  }
  async function runFile(runId, opts) {
    const e = await dbGet(db, 'SELECT edition_id FROM news_editions WHERE edition_id = ?', [String(runId)]).catch(() => null);
    if (e) return downloadEdition(e.edition_id, opts);
    const r = await dbGet(db, 'SELECT file_name FROM news_harvest_runs WHERE run_id = ?', [String(runId)]);
    if (!r || !r.file_name) return null;
    const file = path.join(dir, path.basename(r.file_name));
    return fs.existsSync(file) ? { path: file, name: path.basename(r.file_name) } : null;
  }
  // ---- the owner's interests and reading (spec §4.5, §5.7): what dot reads before choosing its own articles.
  const READ_WINDOW = { open: 3600e3, finish: 86400e3 };
  async function interestsRow() { const r = await dbGet(db, `SELECT value_json, updated_at FROM news_settings WHERE key='interests'`).catch(() => null); return r ? { text: (parse(r.value_json) || {}).text || '', updated_at: r.updated_at } : { text: '', updated_at: null }; }
  async function interestsText() { return (await interestsRow()).text; }
  async function saveInterests(text) {
    const v = String(text == null ? '' : text);
    if (v.length > 4000) { const e = new Error('INTERESTS_TOO_LONG'); e.code = 'INTERESTS_TOO_LONG'; throw e; }
    await dbRun(db, `INSERT INTO news_settings(key, value_json, updated_at) VALUES ('interests', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`,
      [JSON.stringify({ text: v }), iso(now())]);
    return interestsRow();
  }
  // The caller has checked that the reader is the owner. Opens once per hour, finishes once per day.
  async function recordRead(workId, event) {
    const m = String(workId || '').match(/^(na_[0-9a-f]{24})\.[a-z0-9]{2}$/);
    if (!m || !READ_WINDOW[event]) return false;
    const recent = await dbGet(db, 'SELECT 1 FROM news_read_signals WHERE article_id=? AND event=? AND at>=? LIMIT 1', [m[1], event, iso(now() - READ_WINDOW[event])]);
    if (recent) return false;
    await dbRun(db, 'INSERT INTO news_read_signals(article_id, event, at) VALUES (?,?,?)', [m[1], event, iso(now())]);
    return true;
  }
  async function readingSummary(days = 14) {
    const has = await dbGet(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name='news_read_signals'").catch(() => null);
    const out = { days, by_section: {}, by_outlet: {}, by_selected: {}, recent: [] };
    if (!has) return out;
    const rows = await dbAll(db, `SELECT s.article_id, s.event, s.at, a.section, a.outlet_id, a.title_he, a.title_ru, a.story_key, a.provenance_json FROM news_read_signals s
      JOIN news_articles a ON a.article_id = s.article_id WHERE s.at >= ? ORDER BY s.at DESC`, [iso(now() - days * 86400e3)]);
    const bump = (o, k, ev) => { const x = o[k] = o[k] || { open: 0, finish: 0 }; x[ev]++; };
    const seen = new Map();
    for (const r of rows) {
      const sel = (parse(r.provenance_json) || {}).selected_by === 'dot' ? 'dot' : 'auto';
      bump(out.by_section, r.section || 'news', r.event); bump(out.by_outlet, r.outlet_id, r.event); bump(out.by_selected, sel, r.event);
      if (!seen.has(r.article_id)) seen.set(r.article_id, { title_he: r.title_he, title_ru: r.title_ru, story_key: r.story_key, section: r.section, outlet_id: r.outlet_id, selected_by: sel, finished: false, at: r.at });
      if (r.event === 'finish') seen.get(r.article_id).finished = true;
    }
    out.recent = [...seen.values()].slice(0, 30);
    return out;
  }

  // ---- dot's own choice (spec §4.5, §5.6): drafts of articles the selection left out, at most
  // schedule.extras per edition; the server makes them one-to-one, dot only says which and why.
  function extrasError(code) { const e = new Error(code); e.code = code; return e; }
  // One order at a time and never during a build or a poll: the checks and the writes see the same state.
  async function orderExtras(editionId, items) {
    while (busy) await busy.catch(() => {});
    return exclusive(() => orderExtrasNow(editionId, items));
  }
  async function orderExtrasNow(editionId, items) {
    const e = await dbGet(db, 'SELECT * FROM news_editions WHERE edition_id=?', [String(editionId || '')]);
    if (!e || e.closed_at || !['archived', 'downloaded', 'partial', 'published'].includes(e.status)) throw extrasError('EDITION_NOT_OPEN');
    const schedule = await loadSchedule(), list = Array.isArray(items) ? items : [];
    if (!list.length) throw extrasError('UNKNOWN_ITEM');
    if (list.length > 10) throw extrasError('ORDER_TOO_LARGE'); // up to 10 per request (photos take time); the edition allows schedule.extras
    const keysAsked = list.map(it => String((it && it.item_key) || ''));
    if (new Set(keysAsked).size !== keysAsked.length) throw extrasError('DUPLICATE_ITEM');
    const rep = parse(e.report_json) || {};
    // The same order again (the reply was lost): the same zip.
    const prev = (rep.extras || []).find(x => x.keys.length === keysAsked.length && x.keys.every(k => keysAsked.includes(k)));
    if (prev && fs.existsSync(path.join(dir, prev.file))) return { edition_id: e.edition_id, items: prev.items, buffer: fs.readFileSync(path.join(dir, prev.file)), name: prev.file };
    if ((e.extras_count || 0) + list.length > schedule.extras) throw extrasError('EXTRAS_LIMIT');
    const rows = [];
    for (const it of list) {
      const note = String((it && it.note_ru) || '').trim();
      if (!note || note.length > 200) throw extrasError('NOTE_REQUIRED');
      const k = String((it && it.item_key) || '');
      const row = await dbGet(db, 'SELECT * FROM news_harvest_items WHERE url_key=? OR canonical_key=? LIMIT 1', [k, k]);
      if (!row) throw extrasError('UNKNOWN_ITEM');
      if (row.main_state !== 'none' || await dbGet(db, `SELECT 1 FROM news_archive_orders
        WHERE url_key=? AND (emitted_pack_id IS NOT NULL OR expires_at>?)`, [row.url_key, iso(now())]).catch(() => null)) throw extrasError('ALREADY_TAKEN');
      // Only this edition's own articles (its overview), not another edition's material.
      if (row.edition_id !== e.edition_id && !(rep.overview_keys || []).includes(row.url_key)) throw extrasError('NOT_A_CANDIDATE');
      if (row.paywalled) throw extrasError('PAYWALL');
      const a = row.full_ok ? bodyOf(row) : null;
      if (!a || !Array.isArray(a.paragraphs) || !Array.isArray(a.images)) throw extrasError('NO_BODY');
      rows.push({ row: { ...row, selected_by: 'dot', selection_note_ru: note, asked: k }, a });
    }
    // The whole zip first; the database changes only once it exists (all or nothing).
    const sharp = loadSharp();
    try { sharp.concurrency(1); sharp.cache(false); } catch (_) {}
    const zip = new AdmZip(), out = [], retrievedAt = israelIso(now());
    let n = e.extras_count || 0;
    for (const { row, a } of rows) {
      n++;
      const folder = row.outlet_id + '-x' + String(n).padStart(2, '0');
      const { shas } = await makeDraft({ zip, row, a, folder, storyKey: row.story_key, photo: src => photo(src, sharp), draftOf, retrievedAt,
        imagesPerArticle: L.imagesPerArticle, sleep: () => sleep(Math.round(delayMs / 3)) });
      out.push({ item_key: row.asked, url_key: row.url_key, note: row.selection_note_ru, draft: folder + '.draft.json', images: shas });
    }
    const buffer = zip.toBuffer(), name = `news-extras-${e.day}-${e.slot}-${e.edition_id.slice(-6)}-${n}.zip`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buffer);
    // Extras are «in work» like the edition: leased now, and leased again with it when it is downloaded.
    const lease = iso(Math.max(Date.parse(e.lease_until || 0) || 0, now() + schedule.leaseHours * 3600e3));
    for (const o of out) await dbRun(db, `UPDATE news_harvest_items SET main_state='drafted', main_edition_id=?, selected_by='dot', selection_note_ru=?, draft_images_json=?, lease_until=? WHERE url_key=? AND main_state='none'`,
      [e.edition_id, o.note, JSON.stringify(o.images), lease, o.url_key]);
    await reindex(out.map(o => o.url_key));
    const items2 = out.map(o => ({ item_key: o.item_key, draft: o.draft, images: o.images }));
    const report = { ...rep, main_keys: [...new Set([...(rep.main_keys || []), ...out.map(o => o.url_key)])], extras: [...(rep.extras || []), { file: name, keys: keysAsked, items: items2 }] };
    await dbRun(db, 'UPDATE news_editions SET extras_count=?, report_json=? WHERE edition_id=?', [n, JSON.stringify(report), e.edition_id]);
    return { edition_id: e.edition_id, items: items2, buffer, name };
  }

  let archiveOrders = Promise.resolve();
  // A deliberately separate order: an exact historical candidate, not a new edition or a
  // re-lease. The original cut, job counters and overview are never edited by this path.
  // Build, store and reserve an archive order for one slice article (the draft of the kept full text with its
  // photos), shared by dot's archive orders and the owner's orders (findability W5).
  async function emitArchiveOrder({ row, a, itemKey, note, actor, storyKey, editionId, day, slot, firstSeen, old, when, t, mainStates = ['none'] }) {
    const id = 'nso_' + crypto.randomBytes(16).toString('hex');
    const folder = row.outlet_id + '-archive-01', zip = new AdmZip();
    if (draftOf(a, { outletId: row.outlet_id, storyKey: storyKey, images: [], retrievedAt: israelIso(t) }).quality.warnings.includes('TRUNCATED'))
      throw extrasError('NO_BODY');
    const sharp = a.images.length ? loadSharp() : null;
    // The full text always ships; a photo that cannot be had is left out with its reason (owner 2026-11-22).
    const { draft, shas, missing } = await makeDraft({ zip, row: { ...row, selected_by: 'dot', selection_note_ru: note },
      a, folder, storyKey: storyKey, photo: archivePhotoLoader(row.outlet_id, sharp), draftOf,
      retrievedAt: israelIso(t), imagesPerArticle: C.MAX_IMAGES, sleep: () => sleep(Math.round(delayMs / 3)) });
    if (missing.length) try { console.warn('[news-order] ' + itemKey + ': photos left out ' + JSON.stringify(missing)); } catch (_) {}
    // Slow CDN work does not hold the scheduler. Join its critical section only to claim
    // the candidate after rechecking its state (a scheduled draft may have won meanwhile).
    while (busy) await busy.catch(() => {});
    return exclusive(async () => {
      const readyAt = now();
      const expires = iso(Math.min(readyAt + ORDER_TTL_MS, firstSeen + L.keepBodyDays * 86400000));
      if (expires <= iso(readyAt)) throw extrasError('SOURCES_EXPIRED');
      const draftSha = archiveDraftHash(draft, shas);
      zip.addFile('archive-order.json', Buffer.from(JSON.stringify({
        order_id: id, parent_edition_id: editionId, day: day, slot: slot, expires_at: expires,
        item_key: itemKey, draft: folder + '.draft.json', images: shas, draft_sha256: draftSha,
        ...(missing.length ? { photos_missing: missing } : {}),
      }, null, 1)));
      const buffer = zip.toBuffer(), name = `news-archive-order-${id}.zip`, file = path.join(dir, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, buffer, { flag: 'wx', mode: 0o600 });
      let saved;
      try {
        // Recheck the same cached source/lease atomically; another writer or canonical publish
        // that won the race cannot be silently re-ordered or overwritten.
        saved = await dbRun(db, `INSERT INTO news_archive_orders(article_id,order_id,edition_id,actor_kind,actor_id,url_key,note_ru,created_at,expires_at,draft_sha256,file_name)
          SELECT ?,?,?,?,?,?,?,?,?,?,? FROM news_harvest_items AS h
          WHERE h.url_key=? AND h.status='ready' AND h.main_state IN (?, ?) AND h.full_ok=1 AND h.paywalled=0 AND h.data_json IS ? AND h.data_gz IS ? AND h.story_key IS ?
            AND (h.lease_until IS NULL OR h.lease_until<=?) AND NOT EXISTS(SELECT 1 FROM news_articles WHERE article_id=?)
          ON CONFLICT(article_id) DO UPDATE SET order_id=excluded.order_id,edition_id=excluded.edition_id,actor_kind=excluded.actor_kind,
            actor_id=excluded.actor_id,url_key=excluded.url_key,note_ru=excluded.note_ru,created_at=excluded.created_at,expires_at=excluded.expires_at,
            draft_sha256=excluded.draft_sha256,file_name=excluded.file_name
          WHERE news_archive_orders.expires_at<=? AND news_archive_orders.emitted_pack_id IS NULL`,
          [itemKey, id, editionId, actor.kind, String(actor.id), row.url_key, note, when, expires, draftSha, name,
            row.url_key, mainStates[0], mainStates[mainStates.length - 1], row.data_json, row.data_gz || null, storyKey, iso(readyAt), itemKey, iso(readyAt)]);
        if (!saved.changes) throw extrasError('ALREADY_TAKEN');
      } catch (err) { fs.rmSync(file, { force: true }); throw err; }
      if (old && old.file_name) try { fs.rmSync(path.join(dir, path.basename(old.file_name)), { force: true }); } catch (_) {}
      return { order_id: id, buffer, name };
    });
  }

  // The owner's order (findability W5): the same draft as an archive order, built from the kept full text of
  // the slice row — no edition archive needed, so it works for the 45 days the text is kept. The order is
  // reserved for the editor who takes it: only that key can upload the result.
  async function orderForOwner(order, actor) {
    const itemKey = order && order.item_key, note = String(order && order.note_ru || '').trim();
    if (typeof itemKey !== 'string' || !ARTICLE_ID.test(itemKey)) throw extrasError('UNKNOWN_ITEM');
    if (!note || note.length > 200) throw extrasError('NOTE_REQUIRED');
    if (!actor || !['owner', 'editor'].includes(actor.kind) || !actor.id) throw extrasError('ARCHIVE_ORDER_ACTOR');
    const task = archiveOrders.then(async () => {
      const t = now(), when = iso(t);
      const old = await dbGet(db, 'SELECT * FROM news_archive_orders WHERE article_id=?', [itemKey]);
      if (old && old.emitted_pack_id) throw extrasError('ALREADY_TAKEN');
      if (old && old.expires_at > when) {
        if (old.actor_kind !== actor.kind || old.actor_id !== String(actor.id) || old.note_ru !== note) throw extrasError('ALREADY_TAKEN');
        try { return { order_id: old.order_id, buffer: fs.readFileSync(path.join(dir, path.basename(old.file_name))), name: old.file_name }; }
        catch (_) { throw extrasError('SOURCES_EXPIRED'); }
      }
      const row = await dbGet(db, "SELECT * FROM news_harvest_items WHERE (url_key=? OR canonical_key=?) AND status='ready' ORDER BY first_seen_at LIMIT 1", [itemKey, itemKey]);
      const firstSeen = row && Date.parse(row.first_seen_at);
      if (!row || !hasBody(row) || !Number.isFinite(firstSeen) || firstSeen <= t - L.keepBodyDays * 86400000) throw extrasError('SOURCES_EXPIRED');
      if (row.paywalled) throw extrasError('PAYWALL');
      // A main article dot dropped can still be ordered by the owner (review W5 I2).
      if ((row.main_state !== 'none' && row.main_state !== 'dropped') || (row.lease_until && row.lease_until > when)
        || await dbGet(db, 'SELECT 1 FROM news_articles WHERE article_id=?', [itemKey])) throw extrasError('ALREADY_TAKEN');
      const a = row.full_ok ? bodyOf(row) : null;
      if (!a || !Array.isArray(a.paragraphs) || !a.paragraphs.length || !Array.isArray(a.images)) throw extrasError('NO_BODY');
      if (a.paywalled) throw extrasError('PAYWALL');
      if (keyOf(row.outlet_id, a.canonical_url) !== itemKey) throw extrasError('ARCHIVE_SOURCE_CHANGED');
      return emitArchiveOrder({ row, a, itemKey, note, actor, storyKey: row.story_key || null, editionId: row.edition_id || 'owner-order',
        day: israelIso(firstSeen).slice(0, 10), slot: 'extra', firstSeen, old, when, t, mainStates: ['none', 'dropped'] });
    });
    archiveOrders = task.catch(() => {});
    return task;
  }

  async function orderArchivedCandidate(editionId, item, actor) {
    const itemKey = item && item.item_key, note = String(item && item.note_ru || '').trim();
    if (typeof itemKey !== 'string' || !ARTICLE_ID.test(itemKey)) throw extrasError('UNKNOWN_ITEM');
    if (!note || note.length > 200) throw extrasError('NOTE_REQUIRED');
    if (!actor || !['owner', 'editor'].includes(actor.kind) || !actor.id) throw extrasError('ARCHIVE_ORDER_ACTOR');
    const task = archiveOrders.then(async () => {
      const t = now(), when = iso(t);
      const e = await dbGet(db, 'SELECT * FROM news_editions WHERE edition_id=?', [String(editionId)]);
      if (!e || !e.closed_at || !['archived', 'downloaded', 'partial', 'published'].includes(e.status)) throw extrasError('EDITION_NOT_CLOSED');
      const old = await dbGet(db, 'SELECT * FROM news_archive_orders WHERE article_id=?', [itemKey]);
      if (old && old.emitted_pack_id) throw extrasError('ALREADY_TAKEN');
      if (old && old.expires_at > when) {
        if (old.edition_id !== e.edition_id || old.actor_kind !== actor.kind || old.actor_id !== String(actor.id) || old.note_ru !== note)
          throw extrasError('ALREADY_TAKEN');
        try { return { order_id: old.order_id, buffer: fs.readFileSync(path.join(dir, path.basename(old.file_name))), name: old.file_name }; }
        catch (_) { throw extrasError('SOURCES_EXPIRED'); }
      }
      const cutAt = Date.parse(e.cut_at || e.cutoff_at);
      if (!e.file_name || !Number.isFinite(cutAt) || cutAt <= t - ARCHIVE_WINDOW_MS) throw extrasError('SOURCES_EXPIRED');
      let catalog, overview;
      try {
        const cut = new AdmZip(path.join(dir, path.basename(e.file_name)));
        catalog = parse(cut.readAsText('candidates.json'));
        overview = parse(cut.readAsText('overview.json'));
      } catch (_) { throw extrasError('SOURCES_EXPIRED'); }
      if (!catalog || catalog.edition_id !== e.edition_id || catalog.day !== e.day || catalog.slot !== e.slot || !Array.isArray(catalog.items)
        || !overview || overview.edition_id !== e.edition_id || overview.day !== e.day || overview.slot !== e.slot || !Array.isArray(overview.stories))
        throw extrasError('SOURCES_EXPIRED');
      const candidate = catalog.items.find(x => x.item_key === itemKey);
      if (!candidate) throw extrasError('NOT_A_CANDIDATE');
      if (candidate.paywalled) throw extrasError('PAYWALL');
      if (!candidate.full_ok) throw extrasError('NO_BODY');
      const archivedStory = overview.stories.find(s => s.story_key === candidate.story_key && s.items.some(x => x.item_key === itemKey));
      const archived = archivedStory && archivedStory.items.find(x => x.item_key === itemKey);
      if (!archived || archived.draft || archived.url !== candidate.url || archived.outlet_id !== candidate.outlet_id) throw extrasError('NOT_A_CANDIDATE');
      if (archived.paywalled) throw extrasError('PAYWALL');
      const row = await dbGet(db, `SELECT * FROM news_harvest_items WHERE outlet_id=? AND (url_key=? OR canonical_key=?)
        ORDER BY status='ready' DESC LIMIT 1`, [candidate.outlet_id, itemKey, itemKey]);
      const firstSeen = row && Date.parse(row.first_seen_at);
      if (!row || !hasBody(row) || !Number.isFinite(firstSeen) || firstSeen <= t - L.keepBodyDays * 86400000) throw extrasError('SOURCES_EXPIRED');
      if (row.paywalled) throw extrasError('PAYWALL');
      if (row.main_state !== 'none' || (row.lease_until && row.lease_until > when)
        || await dbGet(db, 'SELECT 1 FROM news_articles WHERE article_id=?', [itemKey])) throw extrasError('ALREADY_TAKEN');
      const a = row.full_ok ? bodyOf(row) : null;
      if (!a || !Array.isArray(a.paragraphs) || !a.paragraphs.length || !Array.isArray(a.images)) throw extrasError('NO_BODY');
      if (a.paywalled) throw extrasError('PAYWALL');
      if (row.status !== 'ready' || row.story_key !== candidate.story_key || a.title_he !== candidate.title_he
        || a.canonical_url !== archived.url || keyOf(row.outlet_id, a.canonical_url) !== itemKey || a.images.length !== candidate.images
        || !Number.isFinite(Date.parse(archived.published_at)) || Date.parse(a.published_at) !== Date.parse(archived.published_at))
        throw extrasError('ARCHIVE_SOURCE_CHANGED');
      return emitArchiveOrder({ row, a, itemKey, note, actor, storyKey: candidate.story_key, editionId: e.edition_id, day: e.day, slot: e.slot, firstSeen, old, when, t });
    });
    archiveOrders = task.catch(() => {});
    return task;
  }

  // ---- re-check published articles (spec §4.4, §5.5): the outlet may update an article after we took it.
  // The published article is never changed; the change is recorded, shown as a note, and a new title of
  // the overview row goes to dot in the next edition.
  async function recheckPublished({ editionId = null } = {}) {
    const has = await dbGet(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name='news_article_fingerprints'").catch(() => null);
    if (!has) return { checked: 0, changed: 0 };
    const rows = await dbAll(db, `SELECT f.*, a.outlet_id, a.original_title_he FROM news_article_fingerprints f JOIN news_articles a ON a.article_id = f.article_id
      WHERE a.tier='fresh' AND f.created_at >= ? ORDER BY f.created_at`, [iso(now() - 24 * 3600e3)]);
    let checked = 0, changed = 0;
    // Polite and bounded: one request at a time with a pause (also after a failure), an outlet that
    // answers with a bot challenge is left for this run, at most 3 minutes — the rest waits for the next cut-off.
    const challenged = new Set(), until = Date.now() + 3 * 60e3;
    for (const f of rows) {
      const src = sources.find(s => s.outlet_id === f.outlet_id);
      if (!src || blocked.includes(f.outlet_id) || challenged.has(f.outlet_id)) continue;
      if (Date.now() > until) break;
      let fetched = false;
      try {
        if (!(await allowed(f.url))) continue;
        fetched = true;
        let page;
        try { page = await get(f.url, { max: L.page, accept: 'text/html' }); }
        catch (e) { if (e.challenge) challenged.add(f.outlet_id); continue; }
        const r = extractArticle(page.buf.toString('utf8'), { url: f.url, source: src, feed: {} });
        if (!r.ok) continue;
        // The same article: a redirect to a section or another page is not an update of this one.
        if (keyOf(f.outlet_id, page.url || f.url) !== f.article_id || (r.article.canonical_url && keyOf(f.outlet_id, r.article.canonical_url) !== f.article_id)) continue;
        checked++;
        // Cut the page the way the draft was cut (400 rows), so a long unchanged article stays unchanged.
        const rowsNow = rowsOf(r.article.paragraphs).slice(0, L.rows);
        const nowPrint = fingerprintOf(String(r.article.title_he || '').slice(0, 300), paragraphsOfRows(rowsNow));
        const base = { title_hash: f.title_hash, para_hashes: JSON.parse(f.para_hashes_json) };
        const last = parse(f.last_seen_json) || base;
        await dbRun(db, 'UPDATE news_article_fingerprints SET checked_at=? WHERE article_id=?', [iso(now()), f.article_id]);
        // Any difference from the last check counts here (removed paragraphs too: that is how a revert looks).
        const sinceLast = diffPrints(last, nowPrint);
        if (!sinceLast.title_changed && !sinceLast.added && !sinceLast.changed && !sinceLast.removed) continue;
        const d = diffPrints(base, nowPrint);
        // Most of the text is different: another page under this address, not an update.
        if (d.changed + d.removed > 0.6 * Math.max(1, base.para_hashes.length)) { log('[news-recheck] replaced, not recorded: ' + f.url); continue; }
        await dbRun(db, 'UPDATE news_article_fingerprints SET last_seen_json=? WHERE article_id=?', [JSON.stringify(nowPrint), f.article_id]);
        if (!d.significant) {
          // Back to what we published: the overview row gets its first title back (to translate again), the note goes.
          const t0 = String(f.original_title_he || '').slice(0, 300);
          const titleWas = await dbGet(db, 'SELECT 1 FROM news_article_changes WHERE article_id=? AND significant=1 AND title_changed=1 LIMIT 1', [f.article_id]);
          await dbRun(db, 'UPDATE news_article_changes SET significant=0 WHERE article_id=?', [f.article_id]);
          await dbRun(db, 'UPDATE news_overview_items SET changed_at=NULL, change_json=NULL WHERE item_key=?', [f.article_id]).catch(() => {});
          if (t0 && titleWas) {
            await dbRun(db, `UPDATE news_overview_items SET title_he=?, title_ru=NULL, changed_at=NULL, change_json=NULL, updated_at=? WHERE item_key=? AND title_he<>?`, [t0, iso(now()), f.article_id, t0]).catch(() => {});
            await dbRun(db, `UPDATE news_harvest_items SET title_he=?, overview_state='todo' WHERE (url_key=? OR canonical_key=?) AND COALESCE(title_he,'')<>?`, [t0, f.article_id, f.article_id, t0]);
          }
          continue;
        }
        changed++;
        const t = iso(now());
        await dbRun(db, `INSERT INTO news_article_changes(article_id, detected_at, edition_id, source_updated_at, added, changed, removed, title_changed, new_title_he, significant)
          VALUES (?,?,?,?,?,?,?,?,?,1)`, [f.article_id, t, editionId, r.article.updated_at || null, d.added, d.changed, d.removed, d.title_changed ? 1 : 0, d.title_changed ? r.article.title_he : null]);
        const change = JSON.stringify({ added: d.added, changed: d.changed, removed: d.removed, title_changed: d.title_changed, source_updated_at: r.article.updated_at || null });
        if (d.title_changed) {
          await dbRun(db, `UPDATE news_overview_items SET title_he=?, title_ru=NULL, changed_at=?, change_json=?, updated_at=? WHERE item_key=?`, [r.article.title_he, t, change, t, f.article_id]).catch(() => {});
          await dbRun(db, `UPDATE news_harvest_items SET title_he=?, overview_state='todo' WHERE url_key=? OR canonical_key=?`, [r.article.title_he, f.article_id, f.article_id]);
        } else await dbRun(db, `UPDATE news_overview_items SET changed_at=?, change_json=? WHERE item_key=?`, [t, change, f.article_id]).catch(() => {});
      } catch (e) { log('[news-recheck] ' + f.url + ': ' + (e && e.message)); }
      finally { if (fetched) await sleep(delayMs); }
    }
    return { checked, changed };
  }

  // ---- accounting: what dot published (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.3, §5.8) --
  const keyFor = (outletId, url) => { try { return C.articleKey(outletId, C.canonicalizeUrl(url)); } catch (_) { return null; } };
  const PUBLISHED = new Set(['published', 'revised', 'duplicate', 'archived']);
  async function rowFor(k) {
    return dbGet(db, `SELECT * FROM news_harvest_items WHERE (url_key=? OR canonical_key=?) AND main_state IN ('drafted','published') ORDER BY main_state='drafted' DESC LIMIT 1`, [k, k]);
  }
  async function attempt(row, code, schedule) {
    const n = row.main_attempts + 1, dropped = n >= schedule.maxAttempts;
    await dbRun(db, `UPDATE news_harvest_items SET main_attempts=?, main_reason=?, main_state=?, lease_until=NULL WHERE url_key=?`,
      [n, String(code || 'REJECTED').slice(0, 60), dropped ? 'dropped' : 'drafted', row.url_key]);
  }
  async function refreshEdition(editionId) {
    const c = await dbGet(db, `SELECT SUM(main_state='drafted') open, SUM(main_state='published') done,
      SUM(main_attempts>0 AND main_state IN ('drafted','dropped')) rework FROM news_harvest_items WHERE main_edition_id=?`, [editionId]);
    const e = await dbGet(db, 'SELECT status, first_upload_at FROM news_editions WHERE edition_id=?', [editionId]);
    if (!e || !e.first_upload_at || ['superseded', 'skipped', 'failed'].includes(e.status)) return;
    await dbRun(db, `UPDATE news_editions SET status=?, published_count=? WHERE edition_id=?`, [(c && c.open) ? 'partial' : 'published', (c && c.done) || 0, editionId]);
    // Refused or skipped now — apart from rework_count (what the archive brought in rework/).
    await dbRun(db, 'UPDATE news_editions SET refused_count=? WHERE edition_id=?', [(c && c.rework) || 0, editionId]).catch(() => {});
  }
  // receipt of one pack: { edition_id, items:[{ status, article_id, code }], rejected:[{ outlet_id, canonical_url, code }], overview: bool }
  async function accountPack({ edition_id, items = [], rejected = [], overview = false }) {
    const e = await dbGet(db, 'SELECT * FROM news_editions WHERE edition_id=?', [String(edition_id || '')]);
    if (!e) return null;
    const schedule = await loadSchedule(), t = iso(now()), rep = parse(e.report_json) || {}, seen = new Set(rep.accounted || []);
    let published = 0;
    for (const it of items) {
      if (!it || !it.article_id) continue;
      const row = await rowFor(it.article_id);
      if (!row) continue;
      seen.add(row.url_key);
      if (PUBLISHED.has(it.status)) {
        published++;
        if (row.main_state !== 'published') await dbRun(db, `UPDATE news_harvest_items SET main_state='published', main_reason=NULL, lease_until=NULL WHERE url_key=?`, [row.url_key]);
      } else if (it.status === 'rejected' && row.main_state === 'drafted') await attempt(row, it.code, schedule);
    }
    for (const r of rejected) {
      const k = r && keyFor(r.outlet_id, r.canonical_url), row = k && await rowFor(k);
      if (!row || row.main_state !== 'drafted') continue;
      seen.add(row.url_key);
      await attempt(row, r.code, schedule);
    }
    const any = published || overview; // «Обновлено в …» moves only when readers got something
    await dbRun(db, `UPDATE news_editions SET first_upload_at=COALESCE(first_upload_at, ?), published_at=CASE WHEN ? THEN COALESCE(published_at, ?) ELSE published_at END, report_json=? WHERE edition_id=?`,
      [t, any ? 1 : 0, t, JSON.stringify({ ...rep, accounted: [...seen], packs: (rep.packs || 0) + 1 }), e.edition_id]);
    await refreshEdition(e.edition_id);
    return { edition_id: e.edition_id, published };
  }
  // The lease is over (or the next cut-off came): drafts of this edition no pack mentioned count as
  // skipped — only when dot uploaded something for it; with no pack at all they just carry over.
  async function closeEdition(editionId) {
    const e = await dbGet(db, 'SELECT * FROM news_editions WHERE edition_id=?', [String(editionId)]);
    if (!e || e.closed_at) return null;
    const rep = parse(e.report_json) || {}, seen = new Set(rep.accounted || []), schedule = await loadSchedule();
    let skipped = 0;
    if (e.first_upload_at) {
      for (const row of await dbAll(db, `SELECT * FROM news_harvest_items WHERE main_edition_id=? AND main_state='drafted'`, [e.edition_id])) {
        if (seen.has(row.url_key)) continue;
        await attempt(row, 'SKIPPED', schedule); skipped++;
      }
    }
    await dbRun(db, `UPDATE news_harvest_items SET lease_until=NULL WHERE lease_until=?`, [e.lease_until || '']);
    await dbRun(db, 'UPDATE news_editions SET closed_at=? WHERE edition_id=?', [iso(now()), e.edition_id]);
    await refreshEdition(e.edition_id);
    const after = await dbGet(db, 'SELECT rework_count FROM news_editions WHERE edition_id=?', [e.edition_id]);
    return { edition_id: e.edition_id, skipped, rework: after ? after.rework_count : 0 };
  }
  closeExpired = async () => {
    const schedule = await loadSchedule();
    for (const e of await dbAll(db, `SELECT edition_id FROM news_editions WHERE closed_at IS NULL AND status IN ('downloaded','partial','published')
      AND ((lease_until IS NOT NULL AND lease_until <= ?) OR (lease_until IS NULL AND first_upload_at IS NOT NULL AND COALESCE(cut_at, cutoff_at) <= ?))`,
      [iso(now()), iso(now() - schedule.leaseHours * 3600e3)]))
      await closeEdition(e.edition_id);
  };

  // ---- the editions API -----------------------------------------------------------------------------
  const lateOf = e => !!e.target_ready_at && (e.published_at ? e.published_at > e.target_ready_at : (!['skipped', 'superseded', 'failed'].includes(e.status) && iso(now()) > e.target_ready_at));
  const shape = e => ({ edition_id: e.edition_id, day: e.day, slot: e.slot, trigger: e.trigger, status: e.status, cutoff_at: e.cutoff_at, target_ready_at: e.target_ready_at,
    cut_at: e.cut_at, archive_ready_at: e.archive_ready_at, downloaded_at: e.downloaded_at, published_at: e.published_at, late: lateOf(e), main_count: e.main_count,
    overview_count: e.overview_count, published_count: e.published_count, rework_count: e.rework_count, refused_count: e.refused_count || 0, extras_count: e.extras_count,
    has_file: !!(e.file_name && fs.existsSync(path.join(dir, path.basename(e.file_name)))) });
  async function listEditions(limit = 28) {
    const lim = Math.max(1, Math.min(100, Number(limit) || 28));
    return (await dbAll(db, 'SELECT * FROM news_editions ORDER BY day DESC, COALESCE(cutoff_at, closed_at) DESC LIMIT ?', [lim])).map(shape);
  }
  async function nextEdition() {
    // An archive nobody took, or one dot downloaded and never answered (it crashed): offered again.
    // A downloaded one only after a grace period (dot may still be translating it), marked retry.
    const schedule = await loadSchedule(), grace = iso(now() - Math.min(3600e3, schedule.leaseHours * 1800e3));
    const e = await dbGet(db, `SELECT * FROM news_editions WHERE file_name IS NOT NULL AND closed_at IS NULL
      AND (status='archived' OR (status='downloaded' AND first_upload_at IS NULL AND downloaded_at < ?)) ORDER BY COALESCE(cut_at, cutoff_at) ASC LIMIT 1`, [grace]);
    return e ? { ...shape(e), ...(e.status === 'downloaded' ? { retry: true } : {}), download: '/api/news/editor/editions/' + e.edition_id + '/download' } : null;
  }
  // For the site: the last ready edition and what comes next — never «now».
  async function status() {
    const schedule = await loadSchedule(), t = now();
    const last = await dbGet(db, `SELECT day, slot, published_at FROM news_editions WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 1`);
    let next = null;
    const today = dayOf(t, schedule), tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 86400e3).toISOString().slice(0, 10); // calendar, not +24 h (DST)
    for (const day of [today, tomorrow]) {
      const eds = await dbAll(db, 'SELECT * FROM news_editions WHERE day=?', [day]);
      const slots = slotTimes(day, schedule);
      const lastDone = Math.max(-1, ...slots.map((s, i) => eds.some(e => e.slot === s.slot && e.published_at) ? i : -1));
      const passedOver = x => { const mine = eds.filter(e => e.slot === x.slot); return mine.some(e => ['skipped', 'superseded'].includes(e.status)) || mine.filter(e => e.status === 'failed').length >= 2; };
      const s = slots.slice(lastDone + 1).find(x => !passedOver(x) || x.cutoffMs > t);
      if (!s) continue;
      const ed = eds.find(e => e.slot === s.slot && !['skipped', 'superseded', 'failed'].includes(e.status));
      const readyAt = iso(ed && ed.target_ready_at ? Date.parse(ed.target_ready_at) : s.readyMs);
      const state = s.cutoffMs > t ? 'waiting' : (Date.parse(readyAt) > t ? 'preparing' : 'late');
      next = { slot: s.slot, day, target_ready_at: readyAt, state };
      break;
    }
    return { last_ready: last ? { slot: last.slot, day: last.day, published_at: last.published_at } : null, next };
  }
  return { runOnce, poll, tick, listRuns, pending, runFile, downloadEdition, loadSchedule, saveSchedule, setCloseExpired, stories, accountPack, closeEdition,
    closeExpired: () => closeExpired(), recheckPublished, orderExtras, orderArchivedCandidate, recordRead, readingSummary, interestsText, interestsRow, saveInterests, listEditions, nextEdition, status, isRunning: () => !!busy, cleanup, rawWork, rawImage, orderForOwner, cachedPhotoBytes: src => { try { return cachedPhoto(src); } catch (_) { return null; } } };
}

module.exports = { createNewsHarvester, parseFeed, parseRobots, draftOf, rowsOf, leadOf, USER_AGENT, LIMITS };
