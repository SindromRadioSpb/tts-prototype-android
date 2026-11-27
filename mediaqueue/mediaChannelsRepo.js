'use strict';
// YouTube channels and «Видео-кандидаты» (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.2, stage M3).
// The server reads each channel's RSS once an hour (measured 2026-11-27: YouTube serves the feeds and the @handle pages to the
// server as to the home PC). New videos of the last 7 days become candidates; dot translates their titles and picks some, the
// owner queues any of them. Shorts stay out (spec §2 non-goals).
const { dbGet, dbAll, dbRun } = require('../db/newsRepo');
const { MediaQueueError } = require('./mediaQueueRepo');

const fail = (code, status, detail) => { throw new MediaQueueError(code, status, detail); };
const DAY_MS = 24 * 3600 * 1000;
const CHANNEL_LIMITS = { MAX_CHANNELS: 50, CANDIDATE_DAYS: 7, KEEP_DAYS: 14, POLL_MS: 55 * 60 * 1000, TITLE_RU_MAX: 300, TRANSLATE_MAX: 100 };
const FEED_MAX_BYTES = 2 * 1024 * 1024;
const PAGE_MAX_BYTES = 4 * 1024 * 1024;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE = /^[A-Za-z0-9._-]{3,30}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const clip = (s, n) => s == null ? null : String(s).slice(0, n);

// → { channel_id } | { handle } | null. youtube.com/channel/UC…, youtube.com/@name[/…], a bare UC… id or @name.
function parseChannelInput(s) {
  const text = String(s == null ? '' : s).trim();
  if (CHANNEL_ID.test(text)) return { channel_id: text };
  if (text.startsWith('@')) return HANDLE.test(text.slice(1)) ? { handle: text.slice(1) } : null;
  let u;
  try { u = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text); } catch (_) { return null; }
  if (!['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(u.hostname.toLowerCase())) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'channel' && CHANNEL_ID.test(parts[1] || '')) return { channel_id: parts[1] };
  if (parts[0] && parts[0].startsWith('@')) { const h = decodeURIComponent(parts[0].slice(1)); return HANDLE.test(h) ? { handle: h } : null; }
  return null;
}

const ENTITIES = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" };
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] != null ? ENTITIES[e.toLowerCase()] : m;
  }).trim();
const tag = (xml, name) => { const m = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>').exec(xml); return m ? decode(m[1]) : null; };

// → { feed: boolean, title, entries: [{ video_id, title, published_at, description }] }.
function parseChannelFeed(xml) {
  const text = String(xml || '');
  const isFeed = /<feed\b/.test(text);
  const head = text.split(/<entry\b/)[0];
  const authorBlock = /<author\b[^>]*>([\s\S]*?)<\/author>/.exec(head);
  const title = (authorBlock && tag(authorBlock[1], 'name')) || tag(head, 'title');
  const entries = [];
  for (const m of text.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = tag(e, 'yt:videoId');
    const link = /<link\b[^>]*rel="alternate"[^>]*href="([^"]*)"/.exec(e);
    if (!id || !VIDEO_ID.test(id) || (link && /\/shorts\//.test(link[1]))) continue;
    const published = Date.parse(tag(e, 'published') || '');
    if (!Number.isFinite(published)) continue;
    entries.push({ video_id: id, title: clip(tag(e, 'title'), 500), published_at: new Date(published).toISOString(), description: clip(tag(e, 'media:description'), 600) });
  }
  return { feed: isFeed, title: clip(title, 200), entries };
}

// The real fetch: no cookies, a plain browser agent, the body cut at maxBytes.
async function httpFetchText(url, { maxBytes = FEED_MAX_BYTES, timeoutMs = 20000 } = {}) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'he,en;q=0.8' } });
  if (!r.body) return { status: r.status, text: '' };
  const reader = r.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel().catch(() => {}); throw new Error('response too large'); }
    chunks.push(value);
  }
  return { status: r.status, text: Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8') };
}

const feedUrl = id => 'https://www.youtube.com/feeds/videos.xml?channel_id=' + id;

function createChannels({ db, fetchText = httpFetchText, now = () => Date.now() } = {}) {
  const iso = (ms = now()) => new Date(ms).toISOString();

  // → parsed feed, or throws a coded error (404 → not found, not a feed → invalid).
  async function readFeed(channelId) {
    const r = await fetchText(feedUrl(channelId), { maxBytes: FEED_MAX_BYTES });
    if (r.status === 404) fail('MEDIA_CHANNEL_NOT_FOUND', 404);
    if (r.status !== 200) fail('MEDIA_FEED_HTTP_' + r.status, 502);
    const f = parseChannelFeed(r.text);
    if (!f.feed) fail('MEDIA_FEED_INVALID', 502);
    return f;
  }
  async function ingest(channelId, entries) {
    const from = iso(now() - CHANNEL_LIMITS.CANDIDATE_DAYS * DAY_MS), t = iso();
    let added = 0;
    for (const e of entries) {
      if (e.published_at < from) continue;
      const r = await dbRun(db, `INSERT OR IGNORE INTO media_candidates(video_id,channel_id,title,description,published_at,first_seen_at) VALUES(?,?,?,?,?,?)`,
        [e.video_id, channelId, e.title, e.description, e.published_at, t]);
      if (r.changes) added++;
      else await dbRun(db, 'UPDATE media_candidates SET title=?, description=? WHERE video_id=?', [e.title, e.description, e.video_id]);
    }
    return added;
  }

  async function add({ input, actorId = null } = {}) {
    const parsed = parseChannelInput(input);
    if (!parsed) fail('MEDIA_CHANNEL_URL_INVALID', 400);
    let channelId = parsed.channel_id, handle = parsed.handle || null;
    if (!channelId) {
      const page = await fetchText('https://www.youtube.com/@' + encodeURIComponent(handle), { maxBytes: PAGE_MAX_BYTES }).catch(() => fail('MEDIA_CHANNEL_FETCH_FAILED', 502));
      if (page.status === 404) fail('MEDIA_CHANNEL_NOT_FOUND', 404);
      const m = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(page.text || '');
      if (!m) fail(page.status === 200 ? 'MEDIA_CHANNEL_NOT_FOUND' : 'MEDIA_CHANNEL_FETCH_FAILED', page.status === 200 ? 404 : 502);
      channelId = m[1];
    }
    const existing = await dbGet(db, 'SELECT * FROM media_channels WHERE channel_id=?', [channelId]);
    if (existing) return { channel: existing, existing: true };
    const n = await dbGet(db, 'SELECT COUNT(*) n FROM media_channels');
    if (n.n >= CHANNEL_LIMITS.MAX_CHANNELS) fail('MEDIA_CHANNELS_FULL', 409, { limit: CHANNEL_LIMITS.MAX_CHANNELS });
    const f = await readFeed(channelId).catch(e => { throw e instanceof MediaQueueError ? e : new MediaQueueError('MEDIA_CHANNEL_FETCH_FAILED', 502); });
    const t = iso();
    await dbRun(db, `INSERT INTO media_channels(channel_id,title,handle,added_by,added_at,enabled,last_polled_at,last_ok_at,fail_count) VALUES(?,?,?,?,?,1,?,?,0)`,
      [channelId, f.title, handle, actorId == null ? null : String(actorId), t, t, t]);
    await ingest(channelId, f.entries);
    return { channel: await dbGet(db, 'SELECT * FROM media_channels WHERE channel_id=?', [channelId]), existing: false };
  }

  const list = () => dbAll(db, 'SELECT * FROM media_channels ORDER BY added_at, rowid');

  async function remove(channelId) {
    const r = await dbGet(db, 'SELECT channel_id FROM media_channels WHERE channel_id=?', [String(channelId || '')]);
    if (!r) fail('MEDIA_CHANNEL_NOT_FOUND', 404);
    // A candidate that already became a job keeps its row: the job list shows its translated title.
    await dbRun(db, 'DELETE FROM media_candidates WHERE channel_id=? AND video_id NOT IN (SELECT video_id FROM media_jobs)', [r.channel_id]);
    await dbRun(db, 'DELETE FROM media_channels WHERE channel_id=?', [r.channel_id]);
    return { channel_id: r.channel_id };
  }

  // A poll still running (50 slow feeds can outlast the 15-minute tick) is joined, not started twice.
  let polling = null;
  const poll = (opts = {}) => polling || (polling = pollNow(opts).finally(() => { polling = null; }));
  // One channel's failure is written to it and the others are still read (per-item best-effort).
  async function pollNow({ force = false } = {}) {
    const due = iso(now() - CHANNEL_LIMITS.POLL_MS);
    const channels = await dbAll(db, `SELECT channel_id FROM media_channels WHERE enabled=1 AND (? OR last_polled_at IS NULL OR last_polled_at<?) ORDER BY last_polled_at`, [force ? 1 : 0, due]);
    let polled = 0, failed = 0, added = 0;
    for (const { channel_id } of channels) {
      polled++;
      try {
        const f = await readFeed(channel_id);
        added += await ingest(channel_id, f.entries);
        const t = iso();
        await dbRun(db, 'UPDATE media_channels SET title=COALESCE(?,title), last_polled_at=?, last_ok_at=?, last_error=NULL, fail_count=0 WHERE channel_id=?', [f.title, t, t, channel_id]);
      } catch (e) {
        failed++;
        await dbRun(db, 'UPDATE media_channels SET last_polled_at=?, last_error=?, fail_count=fail_count+1 WHERE channel_id=?',
          [iso(), clip(e instanceof MediaQueueError ? e.code : (e && e.message) || 'error', 200), channel_id]);
      }
    }
    await dbRun(db, 'DELETE FROM media_candidates WHERE published_at<? AND video_id NOT IN (SELECT video_id FROM media_jobs)', [iso(now() - CHANNEL_LIMITS.KEEP_DAYS * DAY_MS)]);
    return { polled, failed, added };
  }

  const SELECT = `SELECT c.*, ch.title AS channel_title,
      (SELECT j.job_id FROM media_jobs j WHERE j.video_id=c.video_id ORDER BY j.created_at DESC, j.rowid DESC LIMIT 1) AS job_id,
      (SELECT j.status FROM media_jobs j WHERE j.video_id=c.video_id ORDER BY j.created_at DESC, j.rowid DESC LIMIT 1) AS job_status,
      (SELECT j.source FROM media_jobs j WHERE j.video_id=c.video_id ORDER BY j.created_at DESC, j.rowid DESC LIMIT 1) AS job_source
    FROM media_candidates c LEFT JOIN media_channels ch ON ch.channel_id=c.channel_id`;
  // Only channels still on the list: a removed channel's videos that became jobs stay in the job list only.
  const candidates = ({ days = CHANNEL_LIMITS.CANDIDATE_DAYS } = {}) =>
    dbAll(db, SELECT + ' WHERE ch.channel_id IS NOT NULL AND c.published_at>=? ORDER BY c.published_at DESC, c.video_id', [iso(now() - Math.max(1, Math.min(14, Number(days) || 7)) * DAY_MS)]);
  const get = videoId => dbGet(db, SELECT + ' WHERE c.video_id=?', [String(videoId || '')]);

  async function translate(items, editorId = null) {
    if (!Array.isArray(items) || items.length > CHANNEL_LIMITS.TRANSLATE_MAX) fail('MEDIA_INPUT_INVALID', 400, 'translations');
    let translated = 0;
    const t = iso();
    for (const it of items) {
      const id = it && String(it.video_id || ''), title = it && typeof it.title_ru === 'string' ? it.title_ru.trim().slice(0, CHANNEL_LIMITS.TITLE_RU_MAX) : '';
      if (!VIDEO_ID.test(id) || !title) continue;
      const r = await dbRun(db, 'UPDATE media_candidates SET title_ru=?, title_ru_by=?, title_ru_at=? WHERE video_id=?', [title, editorId == null ? null : String(editorId), t, id]);
      translated += r.changes;
    }
    return { translated };
  }

  return { add, list, remove, poll, candidates, get, translate };
}

module.exports = { parseChannelInput, parseChannelFeed, createChannels, httpFetchText, CHANNEL_LIMITS };
