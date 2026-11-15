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
const { SOURCES } = require('./newsHarvestSources');
const { extractArticle, israelIso } = require('./newsExtract');
const { splitSentences } = require('./newsText');
const { refineSection } = require('./newsStories');
const { createStoryStore } = require('./newsStoryStore');
const { normalizeSchedule, dayOf, dueSlot, slotTimes } = require('./newsEditions');
const { buildEdition, makeDraft } = require('./newsEditionBuild');
const { fingerprintOf, diffPrints, paragraphsOfRows } = require('../newsFingerprint');

const USER_AGENT = 'LinguistProNewsReader/1.0 (+https://linguistpro.kolosei.com)';
const LIMITS = { mainStories: 22, imagesPerArticle: 8, rows: 400, page: 4 * 1024 * 1024, feed: 2 * 1024 * 1024, image: 15 * 1024 * 1024,
  imageOut: 600 * 1024, minChars: 400, minParagraphs: 2, maxAgeMs: 36 * 3600 * 1000, pagesPerPoll: 120, pollEveryMs: 55 * 60 * 1000,
  keepRunsDays: 7, keepItemsDays: 45, keepBodyDays: 3, staleRunMs: 3600 * 1000, leadChars: 450 };
const DIGEST = /^חדשות היום|כותרות השבת|כותרות הבוקר|סיכום חדשות|סיכום השבוע|עדכונים שוטפים|מתעדכן|LIVE|לייב|^מבזק/;

const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const parse = s => { try { return JSON.parse(s || 'null'); } catch (_) { return null; } };

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
  limits = {}, delayMs = 1200, now = () => Date.now(), log = () => {}, blocked = [] } = {}) {
  const L = { ...LIMITS, ...limits };
  const dir = path.join(dataDir, 'news-harvest');
  let busy = null, lastPollAt = 0, lastPollReport = null;

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
  async function photo(src, sharp) {
    const cached = path.join(photoCache, crypto.createHash('sha256').update(String(src)).digest('hex').slice(0, 32) + '.jpg');
    try { return fs.readFileSync(cached); } catch (_) {}
    const out = await photoFresh(src, sharp);
    try { fs.mkdirSync(photoCache, { recursive: true }); fs.writeFileSync(cached, out); } catch (_) {}
    return out;
  }
  async function photoFresh(src, sharp) {
    const { buf } = await get(src, { max: L.image, accept: 'image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.5' });
    const info = await sharp(buf, { failOn: 'none' }).metadata();
    if (!info.width || info.width < 200 || (info.height || 0) < 120) throw new Error('TOO_SMALL');
    for (const [side, q] of [[1600, 82], [1600, 72], [1280, 72], [1024, 68]]) {
      const out = await sharp(buf, { failOn: 'none' }).rotate().resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
      if (out.length <= L.imageOut) return out;
    }
    throw new Error('TOO_LARGE');
  }
  const keyOf = (outletId, url) => { try { return C.articleKey(outletId, C.canonicalizeUrl(url)); } catch (_) { return null; } };
  const iso = ms => new Date(ms).toISOString();

  // ---- hourly: feeds → queue → pages ----------------------------------------------------------------
  async function pollNow() {
    const started = now(), report = { at: iso(started), outlets: {}, pages: 0 };
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
          if (r.changes) rep.new++;
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
      extraFiles: { 'interests.md': interests || 'Интересы не записаны.\n', 'reading.json': JSON.stringify(reading || { days: 14, by_section: {}, by_outlet: {}, by_selected: {}, recent: [] }, null, 1) },
      readme: fs.readFileSync(path.join(__dirname, 'dotTask.md'), 'utf8'), sleep: () => sleep(Math.round(delayMs / 3)) });
    for (const [id, o] of Object.entries((lastPollReport && lastPollReport.outlets) || {})) if (o.errors.length) (r.report.outlets[id] = r.report.outlets[id] || { items: 0, main: 0 }).errors = o.errors;
    r.report.recheck = recheck;
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

  async function cleanup() {
    for (const r of await dbAll(db, 'SELECT run_id, file_name FROM news_harvest_runs WHERE started_at < ?', [iso(now() - L.keepRunsDays * 86400000)])) {
      if (r.file_name) try { fs.rmSync(path.join(dir, path.basename(r.file_name)), { force: true }); } catch (_) {}
      await dbRun(db, 'DELETE FROM news_harvest_runs WHERE run_id = ?', [r.run_id]);
    }
    for (const r of await dbAll(db, 'SELECT edition_id, file_name FROM news_editions WHERE day < ? AND file_name IS NOT NULL', [israelIso(now() - L.keepRunsDays * 86400000).slice(0, 10)]).catch(() => [])) {
      try { fs.rmSync(path.join(dir, path.basename(r.file_name)), { force: true }); } catch (_) {}
      await dbRun(db, 'UPDATE news_editions SET file_name=NULL WHERE edition_id=?', [r.edition_id]);
    }
    await dbRun(db, 'UPDATE news_harvest_items SET data_json=NULL WHERE data_json IS NOT NULL AND first_seen_at < ?', [iso(now() - L.keepBodyDays * 86400000)]);
    await dbRun(db, 'DELETE FROM news_harvest_items WHERE first_seen_at < ?', [iso(now() - L.keepItemsDays * 86400000)]);
    await dbRun(db, 'DELETE FROM news_read_signals WHERE at < ?', [iso(now() - 90 * 86400000)]).catch(() => {});
    try { for (const f of fs.readdirSync(photoCache)) { const p = path.join(photoCache, f); if (Date.now() - fs.statSync(p).mtimeMs > 3 * 86400000) fs.rmSync(p, { force: true }); } } catch (_) {}
    await dbRun(db, `UPDATE news_editions SET status='failed', closed_at=?, report_json=? WHERE status='building' AND cutoff_at < ?`,
      [iso(now()), JSON.stringify({ error: 'STALE' }), iso(now() - L.staleRunMs)]).catch(() => {});
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
    if (lease && !e.downloaded_at && e.status === 'archived') {
      const schedule = await loadSchedule(), until = iso(now() + schedule.leaseHours * 3600e3), rep = parse(e.report_json) || {};
      await dbRun(db, `UPDATE news_editions SET status='downloaded', downloaded_at=?, lease_until=? WHERE edition_id=?`, [iso(now()), until, e.edition_id]);
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
      if (row.main_state !== 'none') throw extrasError('ALREADY_TAKEN');
      // Only this edition's own articles (its overview), not another edition's material.
      if (row.edition_id !== e.edition_id && !(rep.overview_keys || []).includes(row.url_key)) throw extrasError('NOT_A_CANDIDATE');
      if (row.paywalled) throw extrasError('PAYWALL');
      const a = row.full_ok ? parse(row.data_json) : null;
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
    const items2 = out.map(o => ({ item_key: o.item_key, draft: o.draft, images: o.images }));
    const report = { ...rep, main_keys: [...new Set([...(rep.main_keys || []), ...out.map(o => o.url_key)])], extras: [...(rep.extras || []), { file: name, keys: keysAsked, items: items2 }] };
    await dbRun(db, 'UPDATE news_editions SET extras_count=?, report_json=? WHERE edition_id=?', [n, JSON.stringify(report), e.edition_id]);
    return { edition_id: e.edition_id, items: items2, buffer, name };
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
        if (!diffPrints(last, nowPrint).significant) continue;
        const d = diffPrints(base, nowPrint);
        // Most of the text is different: another page under this address, not an update.
        if (d.changed + d.removed > 0.6 * Math.max(1, base.para_hashes.length)) { log('[news-recheck] replaced, not recorded: ' + f.url); continue; }
        await dbRun(db, 'UPDATE news_article_fingerprints SET last_seen_json=? WHERE article_id=?', [JSON.stringify(nowPrint), f.article_id]);
        if (!d.significant) {
          // Back to what we published: the overview row gets its first title back (to translate again), the note goes.
          const t0 = String(f.original_title_he || '').slice(0, 300);
          await dbRun(db, 'UPDATE news_article_changes SET significant=0 WHERE article_id=?', [f.article_id]);
          if (t0) {
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
    await dbRun(db, `UPDATE news_editions SET status=?, published_count=?, rework_count=? WHERE edition_id=?`, [(c && c.open) ? 'partial' : 'published', (c && c.done) || 0, (c && c.rework) || 0, editionId]);
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
    for (const e of await dbAll(db, `SELECT edition_id FROM news_editions WHERE closed_at IS NULL AND status IN ('downloaded','partial','published') AND lease_until IS NOT NULL AND lease_until <= ?`, [iso(now())]))
      await closeEdition(e.edition_id);
  };

  // ---- the editions API -----------------------------------------------------------------------------
  const lateOf = e => !!e.target_ready_at && (e.published_at ? e.published_at > e.target_ready_at : (!['skipped', 'superseded', 'failed'].includes(e.status) && iso(now()) > e.target_ready_at));
  const shape = e => ({ edition_id: e.edition_id, day: e.day, slot: e.slot, trigger: e.trigger, status: e.status, cutoff_at: e.cutoff_at, target_ready_at: e.target_ready_at,
    cut_at: e.cut_at, archive_ready_at: e.archive_ready_at, downloaded_at: e.downloaded_at, published_at: e.published_at, late: lateOf(e), main_count: e.main_count,
    overview_count: e.overview_count, published_count: e.published_count, rework_count: e.rework_count, extras_count: e.extras_count,
    has_file: !!(e.file_name && fs.existsSync(path.join(dir, path.basename(e.file_name)))) });
  async function listEditions(limit = 28) {
    const lim = Math.max(1, Math.min(100, Number(limit) || 28));
    return (await dbAll(db, 'SELECT * FROM news_editions ORDER BY day DESC, COALESCE(cutoff_at, closed_at) DESC LIMIT ?', [lim])).map(shape);
  }
  async function nextEdition() {
    // An archive nobody took, or one dot downloaded and never answered (it crashed): offered again.
    const e = await dbGet(db, `SELECT * FROM news_editions WHERE file_name IS NOT NULL AND closed_at IS NULL
      AND (status='archived' OR (status='downloaded' AND first_upload_at IS NULL)) ORDER BY COALESCE(cut_at, cutoff_at) ASC LIMIT 1`);
    return e ? { ...shape(e), download: '/api/news/editor/editions/' + e.edition_id + '/download' } : null;
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
    closeExpired: () => closeExpired(), recheckPublished, orderExtras, recordRead, readingSummary, interestsText, interestsRow, saveInterests, listEditions, nextEdition, status, isRunning: () => !!busy, cleanup };
}

module.exports = { createNewsHarvester, parseFeed, parseRobots, draftOf, rowsOf, leadOf, USER_AGENT, LIMITS };
