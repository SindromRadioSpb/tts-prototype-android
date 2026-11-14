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
const { clusterStories, selectStories, refineSection } = require('./newsStories');

const USER_AGENT = 'LinguistProNewsReader/1.0 (+https://linguistpro.kolosei.com)';
const LIMITS = { mainStories: 22, imagesPerArticle: 8, rows: 400, page: 4 * 1024 * 1024, feed: 2 * 1024 * 1024, image: 15 * 1024 * 1024,
  imageOut: 600 * 1024, minChars: 400, minParagraphs: 2, maxAgeMs: 36 * 3600 * 1000, pagesPerPoll: 120, pollEveryMs: 55 * 60 * 1000,
  keepRunsDays: 7, keepItemsDays: 45, keepBodyDays: 3, staleRunMs: 3600 * 1000, leadChars: 450 };
const RUN_HOUR = 6; // Israel time
const DIGEST = /^חדשות היום|כותרות השבת|כותרות הבוקר|סיכום חדשות|סיכום השבוע|עדכונים שוטפים|מתעדכן|LIVE|לייב|^מבזק/;

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

  async function photo(src, sharp) {
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

  // ---- morning: stories → main articles + «Обзор дня» ------------------------------------------------
  async function buildNow(runId, trigger) {
    await pollNow().catch(e => log('[news-harvest] poll before build failed: ' + (e && e.message)));
    const started = now(), retrievedAt = israelIso(started), day = retrievedAt.slice(0, 10), sharp = loadSharp();
    try { sharp.concurrency(1); sharp.cache(false); } catch (_) {}
    const rows = await dbAll(db, `SELECT * FROM news_harvest_items WHERE status='ready' AND run_id IS NULL AND first_seen_at >= ? ORDER BY first_seen_at`, [iso(started - L.maxAgeMs)]);
    const members = rows.map(r => ({ id: r.url_key, row: r, outlet_id: r.outlet_id, section: r.section || 'news', title: r.title_he || r.feed_title || '',
      text: [r.subtitle_he, r.lead_he].filter(Boolean).join(' '), at: Date.parse(r.published_at || r.first_seen_at) || 0,
      full_ok: !!r.full_ok, paywalled: r.paywalled ? 1 : 0, images: r.images, chars: r.chars })).filter(m => m.title);
    const of = clusterStories(members);
    const byStory = new Map();
    for (const m of members) { const sid = of.get(m.id); if (!byStory.has(sid)) byStory.set(sid, { id: sid, members: [] }); byStory.get(sid).members.push(m); }
    const stories = [...byStory.values()];
    const storyKey = s => day + '-' + crypto.createHash('sha256').update(s.id).digest('hex').slice(0, 8);
    // Main stories in reading order: politics, security, society, economy, world, culture and sport, opinion.
    const ORDER = ['politics', 'security', 'society', 'economy', 'world', 'culture', 'opinion'];
    const main = selectStories(stories, { total: L.mainStories }).map((m, i) => ({ ...m, rank: i }))
      .sort((a, b) => (ORDER.indexOf(a.group) - ORDER.indexOf(b.group)) || (a.rank - b.rank));

    const zip = new AdmZip(), report = { day, items: members.length, stories: stories.length, main: [], outlets: {} };
    const drafts = new Map(); // url_key → draft file
    let n = 0, images = 0;
    for (const { story, group, outlets, pick } of main) {
      let a; try { a = JSON.parse(pick.row.data_json || 'null'); } catch (_) { a = null; }
      if (!a) continue;
      n++;
      const folder = pick.outlet_id + '-' + String(n).padStart(4, '0'), files = [];
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
      const draft = draftOf(a, { outletId: pick.outlet_id, images: files, retrievedAt, storyKey: storyKey(story) });
      zip.addFile(folder + '.draft.json', Buffer.from(JSON.stringify(draft, null, 1)));
      drafts.set(pick.id, folder + '.draft.json');
      images += files.length;
      report.main.push({ draft: folder + '.draft.json', story_key: storyKey(story), group, outlets, outlet_id: pick.outlet_id, title_he: a.title_he, url: a.canonical_url,
        published_at: a.published_at, rows: draft.learning.versions[0].rows.length, images: files.length, warnings: draft.quality.warnings });
      log('[news-harvest] ' + folder + ' ' + a.title_he.slice(0, 60));
    }
    // «Обзор дня»: every article of the day, main stories first, then the stories several outlets
    // wrote about, then the rest by time. Titles, subtitles and first paragraphs; dot fills the *_ru.
    const mainIds = new Map(main.map((m, i) => [m.story.id, i]));
    // The page's canonical address: the same key the published article gets, so the site links them.
    const canonicalOf = row => { try { const a = JSON.parse(row.data_json || 'null'); if (a && a.canonical_url && Outlets.outletForUrl(a.canonical_url) === row.outlet_id) return a.canonical_url; } catch (_) {} return row.url; };
    const ordered = stories.slice().sort((a, b) => {
      const ma = mainIds.has(a.id) ? mainIds.get(a.id) : 1e6, mb = mainIds.has(b.id) ? mainIds.get(b.id) : 1e6;
      if (ma !== mb) return ma - mb;
      const oa = new Set(a.members.map(m => m.outlet_id)).size, ob = new Set(b.members.map(m => m.outlet_id)).size;
      return (ob - oa) || (Math.max(...b.members.map(m => m.at)) - Math.max(...a.members.map(m => m.at)));
    });
    const overview = { schema: 'linguistpro-news-overview', schema_version: 1, day, created_at: retrievedAt,
      stories: ordered.map(s => ({ story_key: storyKey(s), main: mainIds.has(s.id),
        items: s.members.sort((a, b) => b.at - a.at).map(m => ({ outlet_id: m.outlet_id, url: canonicalOf(m.row), published_at: m.row.published_at || m.row.feed_pub_at || null,
          section: m.section, title_he: m.title, title_ru: '', ...(m.row.subtitle_he ? { subtitle_he: m.row.subtitle_he, subtitle_ru: '' } : {}),
          ...(m.row.lead_he ? { lead_he: m.row.lead_he, lead_ru: '' } : {}), ...(m.row.paywalled ? { paywalled: true } : {}), ...(drafts.has(m.id) ? { draft: drafts.get(m.id) } : {}) })) })) };
    for (const m of members) { const o = report.outlets[m.outlet_id] = report.outlets[m.outlet_id] || { items: 0, main: 0 }; o.items++; if (drafts.has(m.id)) o.main++; }
    for (const [id, o] of Object.entries((lastPollReport && lastPollReport.outlets) || {})) if (o.errors.length) (report.outlets[id] = report.outlets[id] || { items: 0, main: 0 }).errors = o.errors;

    let fileName = null, bytes = 0;
    if (members.length) {
      zip.addFile('overview.json', Buffer.from(JSON.stringify(overview, null, 1)));
      zip.addFile('README-dot.md', fs.readFileSync(path.join(__dirname, 'dotTask.md')));
      zip.addFile('harvest.json', Buffer.from(JSON.stringify({ schema: 'linguistpro-news-harvest', schema_version: 2, run_id: runId, created_at: retrievedAt, ...report }, null, 1)));
      fs.mkdirSync(dir, { recursive: true });
      fileName = `news-harvest-${day}-${runId.slice(-6)}.zip`;
      const buf = zip.toBuffer();
      fs.writeFileSync(path.join(dir, fileName + '.part'), buf);
      fs.renameSync(path.join(dir, fileName + '.part'), path.join(dir, fileName));
      bytes = buf.length;
      for (let i = 0; i < members.length; i += 200) {
        const ids = members.slice(i, i + 200).map(m => m.id);
        await dbRun(db, `UPDATE news_harvest_items SET run_id=? WHERE url_key IN (${ids.map(() => '?').join(',')})`, [runId, ...ids]);
      }
    }
    await dbRun(db, `UPDATE news_harvest_runs SET status='done', finished_at=?, articles=?, images=?, bytes=?, file_name=?, report_json=? WHERE run_id=?`,
      [iso(now()), n, images, bytes, fileName, JSON.stringify(report), runId]);
    return { run_id: runId, trigger, status: 'done', articles: n, images, bytes, file_name: fileName, overview_items: members.length, stories: stories.length, report };
  }

  async function cleanup() {
    for (const r of await dbAll(db, 'SELECT run_id, file_name FROM news_harvest_runs WHERE started_at < ?', [iso(now() - L.keepRunsDays * 86400000)])) {
      if (r.file_name) try { fs.rmSync(path.join(dir, path.basename(r.file_name)), { force: true }); } catch (_) {}
      await dbRun(db, 'DELETE FROM news_harvest_runs WHERE run_id = ?', [r.run_id]);
    }
    await dbRun(db, 'UPDATE news_harvest_items SET data_json=NULL WHERE data_json IS NOT NULL AND first_seen_at < ?', [iso(now() - L.keepBodyDays * 86400000)]);
    await dbRun(db, 'DELETE FROM news_harvest_items WHERE first_seen_at < ?', [iso(now() - L.keepItemsDays * 86400000)]);
    await dbRun(db, `UPDATE news_harvest_runs SET status='failed', finished_at=?, report_json=? WHERE status='running' AND started_at < ?`,
      [iso(now()), JSON.stringify({ error: 'STALE' }), iso(now() - L.staleRunMs)]);
  }

  function exclusive(fn) {
    if (busy) { const e = new Error('HARVEST_RUNNING'); e.code = 'HARVEST_RUNNING'; return Promise.reject(e); }
    busy = Promise.resolve().then(fn).finally(() => { busy = null; cleanup().catch(() => {}); });
    return busy;
  }
  function poll() { return exclusive(pollNow); }
  // The morning archive (also «Собрать сейчас»): polls once more, then builds.
  function runOnce({ trigger = 'manual' } = {}) {
    return exclusive(async () => {
      const runId = 'nh_' + crypto.randomBytes(9).toString('hex');
      await dbRun(db, `INSERT INTO news_harvest_runs(run_id, day, trigger, status, started_at) VALUES (?,?,?,'running',?)`, [runId, israelIso(now()).slice(0, 10), trigger, iso(now())]);
      try { return await buildNow(runId, trigger); }
      catch (e) {
        await dbRun(db, `UPDATE news_harvest_runs SET status='failed', finished_at=?, report_json=? WHERE run_id=?`, [iso(now()), JSON.stringify({ error: String(e && e.message || e) }), runId]).catch(() => {});
        throw e;
      }
    });
  }
  // Called every few minutes: the morning build once a day after 06:00 Israel time (any run since then
  // counts, a manual one too), otherwise an hourly poll of the feeds.
  async function tick() {
    if (busy) return null;
    const t = now(), local = israelIso(t), hour = Number(local.slice(11, 13));
    if (hour >= RUN_HOUR) {
      const since = iso(t - (((hour - RUN_HOUR) * 60 + Number(local.slice(14, 16))) * 60 + Number(local.slice(17, 19))) * 1000);
      if (!(await dbGet(db, `SELECT run_id FROM news_harvest_runs WHERE started_at >= ? AND status IN ('running','done')`, [since]))) return runOnce({ trigger: 'schedule' });
    }
    if (t - lastPollAt >= L.pollEveryMs) return poll();
    return null;
  }
  async function listRuns(limit = 14) {
    const rows = await dbAll(db, 'SELECT * FROM news_harvest_runs ORDER BY started_at DESC LIMIT ?', [Math.max(1, Math.min(50, Number(limit) || 14))]);
    return rows.map(r => {
      let report = {}; try { report = JSON.parse(r.report_json || '{}'); } catch (_) {}
      return { run_id: r.run_id, day: r.day, trigger: r.trigger, status: r.status, started_at: r.started_at, finished_at: r.finished_at,
        articles: r.articles, images: r.images, bytes: r.bytes, file_name: r.file_name, outlets: report.outlets || {}, error: report.error || null,
        overview_items: report.items || 0, stories: report.stories || 0,
        has_file: !!(r.file_name && fs.existsSync(path.join(dir, path.basename(r.file_name)))) };
    });
  }
  // What the next morning archive will hold so far.
  async function pending() {
    const rows = await dbAll(db, `SELECT outlet_id, COUNT(*) n, SUM(full_ok) full_n FROM news_harvest_items WHERE status='ready' AND run_id IS NULL AND first_seen_at >= ? GROUP BY outlet_id`, [iso(now() - L.maxAgeMs)]);
    const queued = await dbGet(db, `SELECT COUNT(*) n FROM news_harvest_items WHERE status='queued'`);
    return { items: rows.reduce((a, r) => a + r.n, 0), outlets: Object.fromEntries(rows.map(r => [r.outlet_id, r.n])), queued: queued ? queued.n : 0, last_poll_at: lastPollAt ? iso(lastPollAt) : null };
  }
  async function runFile(runId) {
    const r = await dbGet(db, 'SELECT file_name FROM news_harvest_runs WHERE run_id = ?', [String(runId)]);
    if (!r || !r.file_name) return null;
    const file = path.join(dir, path.basename(r.file_name));
    return fs.existsSync(file) ? { path: file, name: path.basename(r.file_name) } : null;
  }
  return { runOnce, poll, tick, listRuns, pending, runFile, isRunning: () => !!busy, cleanup };
}

module.exports = { createNewsHarvester, parseFeed, parseRobots, draftOf, rowsOf, leadOf, USER_AGENT, LIMITS };
