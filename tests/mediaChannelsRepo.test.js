'use strict';
// Mediatheque video pipeline, stage M3 «Каналы» (spec 2026-11-27 §5.2; plan ...-m3.md Task 1).
const test = require('node:test'), assert = require('node:assert/strict');
const { openDb } = require('./helpers/newsDb.cjs');
const { parseChannelInput, parseChannelFeed, createChannels, CHANNEL_LIMITS } = require('../mediaqueue/mediaChannelsRepo');

const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const C14 = 'UCKEImtWikw9usC1pl_9m1nQ';
const NOW = Date.parse('2026-11-27T10:00:00Z');
const day = n => new Date(NOW - n * 86400000).toISOString().replace('.000Z', '+00:00');

function entry(id, title, published, { shorts = false, desc = 'תיאור' } = {}) {
  return `<entry><id>yt:video:${id}</id><yt:videoId>${id}</yt:videoId><yt:channelId>${C14}</yt:channelId><title>${title}</title>`
    + `<link rel="alternate" href="https://www.youtube.com/${shorts ? 'shorts/' + id : 'watch?v=' + id}"/>`
    + `<author><name>C14</name><uri>https://www.youtube.com/channel/${C14}</uri></author><published>${published}</published>`
    + `<media:group><media:title>${title}</media:title><media:description>${desc}</media:description></media:group></entry>`;
}
const feed = entries => `<?xml version="1.0" encoding="UTF-8"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">`
  + `<link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=${C14}"/><id>yt:channel:${C14}</id><yt:channelId>${C14}</yt:channelId>`
  + `<title>C14 ערוץ</title><author><name>C14</name><uri>https://www.youtube.com/channel/${C14}</uri></author><published>2015-07-05T21:35:08+00:00</published>`
  + entries.join('') + '</feed>';

// A fake YouTube: the handle page and the feeds, counted.
function fakeYoutube(feeds = {}, { pages = { c14news: C14 } } = {}) {
  const calls = [];
  const fetchText = async url => {
    calls.push(url);
    const h = /youtube\.com\/@([^/?]+)/.exec(url);
    if (h) return pages[h[1]] ? { status: 200, text: `<html><link rel="canonical" href="https://www.youtube.com/channel/${pages[h[1]]}"></html>` } : { status: 404, text: '' };
    const f = /channel_id=([^&]+)/.exec(url);
    const v = f && feeds[f[1]];
    if (v instanceof Error) throw v;
    return v == null ? { status: 404, text: '' } : { status: 200, text: v };
  };
  return { fetchText, calls };
}

test('parseChannelInput accepts channel links and handles, refuses the rest', () => {
  assert.deepEqual(parseChannelInput('https://www.youtube.com/channel/' + C14), { channel_id: C14 });
  assert.deepEqual(parseChannelInput(C14), { channel_id: C14 });
  assert.deepEqual(parseChannelInput('https://m.youtube.com/@c14news/videos'), { handle: 'c14news' });
  assert.deepEqual(parseChannelInput('  @c14news '), { handle: 'c14news' });
  assert.deepEqual(parseChannelInput('youtube.com/@kan11'), { handle: 'kan11' });
  for (const bad of ['https://www.youtube.com/watch?v=z4NTzVuLp9U', 'https://www.youtube.com/playlist?list=PL1', 'https://example.com/@x',
    'https://www.youtube.com/channel/UCshort', '', null, '@a'])
    assert.equal(parseChannelInput(bad), null, String(bad));
});

test('parseChannelFeed reads entries, decodes entities, drops Shorts', () => {
  const f = parseChannelFeed(feed([entry('aaaaaaaaaaa', 'הפטריוטים עם אראל סג&quot;ל &amp; &#39;חברים&#39;', day(1)),
    entry('bbbbbbbbbbb', 'שני', day(2)), entry('ccccccccccc', 'שורט', day(1), { shorts: true })]));
  assert.equal(f.title, 'C14');
  assert.equal(f.entries.length, 2);
  assert.equal(f.entries[0].video_id, 'aaaaaaaaaaa');
  assert.equal(f.entries[0].title, 'הפטריוטים עם אראל סג"ל & \'חברים\'');
  assert.equal(f.entries[0].published_at, new Date(NOW - 86400000).toISOString());
  assert.equal(f.entries[0].description, 'תיאור');
  assert.deepEqual(parseChannelFeed('not xml at all').entries, []);
});

test('add resolves a handle, stores the channel and its fresh candidates', async () => {
  const db = await openDb();
  const yt = fakeYoutube({ [C14]: feed([entry('aaaaaaaaaaa', 'חדש', day(1)), entry('ooooooooooo', 'ישן', day(9))]) });
  const ch = createChannels({ db, fetchText: yt.fetchText, now: () => NOW });
  const r = await ch.add({ input: 'https://www.youtube.com/@c14news', actorId: 'owner-1' });
  assert.equal(r.existing, false);
  assert.equal(r.channel.channel_id, C14);
  assert.equal(r.channel.title, 'C14');
  assert.equal(r.channel.handle, 'c14news');
  assert.ok(yt.calls[0].includes('/@c14news') && yt.calls[1].includes('channel_id=' + C14));
  const cands = await ch.candidates();
  assert.deepEqual(cands.map(c => c.video_id), ['aaaaaaaaaaa'], 'older than 7 days stays out');
  assert.equal(cands[0].channel_title, 'C14');
  assert.equal(cands[0].job_status, null);
  assert.equal((await ch.add({ input: C14 })).existing, true);
  db.close();
});

test('add refuses an unknown channel, a bad link and the 51st channel', async () => {
  const db = await openDb();
  const ch = createChannels({ db, fetchText: fakeYoutube({}).fetchText, now: () => NOW });
  await assert.rejects(ch.add({ input: '@nobody' }), { code: 'MEDIA_CHANNEL_NOT_FOUND' });
  await assert.rejects(ch.add({ input: 'UC' + 'x'.repeat(22) }), { code: 'MEDIA_CHANNEL_NOT_FOUND' });
  await assert.rejects(ch.add({ input: 'https://youtu.be/z4NTzVuLp9U' }), { code: 'MEDIA_CHANNEL_URL_INVALID' });
  for (let i = 0; i < CHANNEL_LIMITS.MAX_CHANNELS; i++)
    await run(db, "INSERT INTO media_channels(channel_id,title,added_at,enabled) VALUES(?,?,?,1)", ['UC' + String(i).padStart(22, '0'), 't', 'x']);
  const full = createChannels({ db, fetchText: fakeYoutube({ [C14]: feed([]) }).fetchText, now: () => NOW });
  await assert.rejects(full.add({ input: C14 }), { code: 'MEDIA_CHANNELS_FULL' });
  db.close();
});

test('poll skips fresh channels, records one channel failure and goes on', async () => {
  const db = await openDb();
  const B = 'UC' + 'b'.repeat(22);
  const feeds = { [C14]: feed([entry('aaaaaaaaaaa', 'א', day(1))]), [B]: feed([]) };
  let t = NOW;
  const yt = fakeYoutube(feeds);
  const ch = createChannels({ db, fetchText: yt.fetchText, now: () => t });
  await ch.add({ input: C14 }); await ch.add({ input: B });
  yt.calls.length = 0;
  assert.deepEqual(await ch.poll(), { polled: 0, failed: 0, added: 0 }, 'just added = fresh');
  t += CHANNEL_LIMITS.POLL_MS + 1000;
  feeds[B] = new Error('socket hang up');
  feeds[C14] = feed([entry('aaaaaaaaaaa', 'א', day(1)), entry('ddddddddddd', 'ד', day(0))]);
  assert.deepEqual(await ch.poll(), { polled: 2, failed: 1, added: 1 });
  const list = await ch.list();
  const b = list.find(c => c.channel_id === B), c = list.find(c => c.channel_id === C14);
  assert.match(b.last_error, /socket hang up/);
  assert.equal(b.fail_count, 1);
  assert.equal(c.last_error, null);
  assert.equal((await ch.candidates()).length, 2);
  // force polls even fresh ones
  feeds[B] = feed([]);
  assert.equal((await ch.poll({ force: true })).polled, 2);
  assert.equal((await ch.list()).find(x => x.channel_id === B).last_error, null);
  db.close();
});

test('poll keeps the stored title when a feed returns garbage', async () => {
  const db = await openDb();
  const feeds = { [C14]: feed([]) };
  let t = NOW;
  const ch = createChannels({ db, fetchText: fakeYoutube(feeds).fetchText, now: () => t });
  await ch.add({ input: C14 });
  feeds[C14] = '<html>captcha</html>';
  t += CHANNEL_LIMITS.POLL_MS + 1000;
  assert.equal((await ch.poll()).failed, 1);
  const c = (await ch.list())[0];
  assert.equal(c.title, 'C14');
  assert.equal(c.last_error, 'MEDIA_FEED_INVALID');
  db.close();
});

test('candidates carry the latest job of the video; translate writes only known candidates', async () => {
  const db = await openDb();
  const ch = createChannels({ db, fetchText: fakeYoutube({ [C14]: feed([entry('aaaaaaaaaaa', 'א', day(1)), entry('bbbbbbbbbbb', 'ב', day(2))]) }).fetchText, now: () => NOW });
  await ch.add({ input: C14 });
  await run(db, "INSERT INTO media_jobs(job_id,video_id,url,source,priority,status,attempts,created_at,updated_at) VALUES('mj_0000000000000001','aaaaaaaaaaa','u','dot',10,'queued',0,'2026-11-27T09:00:00Z','x')");
  const r = await ch.translate([{ video_id: 'aaaaaaaaaaa', title_ru: '  Патриоты  ' }, { video_id: 'zzzzzzzzzzz', title_ru: 'нет' }, { video_id: 'bbbbbbbbbbb', title_ru: 'x'.repeat(400) }], 'ed-1');
  assert.equal(r.translated, 2);
  const c = await ch.candidates();
  assert.deepEqual(c.map(x => x.video_id), ['aaaaaaaaaaa', 'bbbbbbbbbbb'], 'newest first');
  assert.equal(c[0].title_ru, 'Патриоты');
  assert.equal(c[0].job_status, 'queued');
  assert.equal(c[0].job_source, 'dot');
  assert.equal(c[1].title_ru.length, 300);
  await assert.rejects(ch.translate('nope'), { code: 'MEDIA_INPUT_INVALID' });
  db.close();
});

test('remove drops the channel and its candidates without a job', async () => {
  const db = await openDb();
  const ch = createChannels({ db, fetchText: fakeYoutube({ [C14]: feed([entry('aaaaaaaaaaa', 'א', day(1)), entry('bbbbbbbbbbb', 'ב', day(2))]) }).fetchText, now: () => NOW });
  await ch.add({ input: C14 });
  await run(db, "INSERT INTO media_jobs(job_id,video_id,url,source,priority,status,attempts,created_at,updated_at) VALUES('mj_0000000000000001','aaaaaaaaaaa','u','owner',100,'queued',0,'x','x')");
  await ch.remove(C14);
  assert.deepEqual(await ch.list(), []);
  assert.deepEqual((await all(db, 'SELECT video_id FROM media_candidates')).map(r => r.video_id), ['aaaaaaaaaaa']);
  assert.equal((await all(db, 'SELECT * FROM media_jobs')).length, 1, 'jobs stay');
  await assert.rejects(ch.remove(C14), { code: 'MEDIA_CHANNEL_NOT_FOUND' });
  db.close();
});

test('poll prunes candidates older than 14 days that never got a job', async () => {
  const db = await openDb();
  let t = NOW;
  const ch = createChannels({ db, fetchText: fakeYoutube({ [C14]: feed([]) }).fetchText, now: () => t });
  await ch.add({ input: C14 });
  await run(db, "INSERT INTO media_candidates(video_id,channel_id,title,published_at,first_seen_at) VALUES('ooooooooooo',?,?,?,?)", [C14, 'old', new Date(NOW - 15 * 86400000).toISOString(), 'x']);
  t += CHANNEL_LIMITS.POLL_MS + 1000;
  await ch.poll();
  assert.equal((await all(db, 'SELECT * FROM media_candidates')).length, 0);
  db.close();
});

test('two polls at once read each feed once (a slow poll never overlaps the next tick)', async () => {
  const db = await openDb();
  let t = NOW, reads = 0, release;
  const gate = new Promise(r => { release = r; });
  const base = fakeYoutube({ [C14]: feed([]) });
  const ch = createChannels({ db, fetchText: async (u, o) => { if (u.includes('channel_id')) { reads++; await gate; } return base.fetchText(u, o); }, now: () => t });
  await run(db, "INSERT INTO media_channels(channel_id,title,added_at,enabled) VALUES(?,?,?,1)", [C14, 'C14', 'x']);
  const a = ch.poll(), b = ch.poll();
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(reads, 1); assert.deepEqual(ra, rb);
  db.close();
});

test('candidates of a removed channel leave the list even when they have a job', async () => {
  const db = await openDb();
  const ch = createChannels({ db, fetchText: fakeYoutube({ [C14]: feed([entry('aaaaaaaaaaa', 'א', day(1))]) }).fetchText, now: () => NOW });
  await ch.add({ input: C14 });
  await run(db, "INSERT INTO media_jobs(job_id,video_id,url,source,priority,status,attempts,created_at,updated_at) VALUES('mj_0000000000000001','aaaaaaaaaaa','u','owner',100,'queued',0,'x','x')");
  await ch.remove(C14);
  assert.deepEqual(await ch.candidates(), []);
  db.close();
});
