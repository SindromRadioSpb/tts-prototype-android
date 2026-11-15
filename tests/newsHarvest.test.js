'use strict';
// The daily article harvester (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §16). Pages here are
// synthetic copies of each outlet's layout — no real article text is kept in the repository.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const sqlite3 = require('sqlite3');
const express = require('express');
const AdmZip = require('adm-zip');
const sharp = require('sharp');
const { normalizeHebrewPunct, splitSentences } = require('../news/harvest/newsText');
const { extractArticle, israelIso } = require('../news/harvest/newsExtract');
const { flightSections } = require('../news/harvest/newsFlight');
const { sourceFor } = require('../news/harvest/newsHarvestSources');
const { createNewsHarvester, parseFeed, parseRobots } = require('../news/harvest/newsHarvest');
const { buildPack } = require('../scripts/news/build-pack');
const C = require('../news/newsPackCore');
const { mountNewsRoutes } = require('../news/newsRoutes');

const exec = (db, sql) => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));
const P1 = 'ראש הממשלה נאם הערב בכנסת ואמר כי הממשלה תמשיך לפעול. הוא הוסיף כי "המצב קשה, אבל נעבור את זה" ופנה לאופוזיציה.';
const P2 = 'יו״ר ישר! גדי איזנקוט הגיב לדברים ואמר שמדובר בספין. לדבריו, הפגישה כבר נקבעה למחר בבוקר בירושלים.';
const P3 = 'בתום הדיון הצביעו חברי הכנסת על ההצעה, והיא עברה ברוב של 61 תומכים מול 59 מתנגדים בקריאה הראשונה.';

test('Hebrew marks inside words become geresh and gershayim; quotes around words stay', () => {
  assert.equal(normalizeHebrewPunct("צ'ילה ג`ימי רה\"מ נתב”ג ח''כ"), 'צ׳ילה ג׳ימי רה״מ נתב״ג ח״כ');
  assert.equal(normalizeHebrewPunct('אמר "שלום"  לכולם‏'), 'אמר "שלום" לכולם');
});
test('one row = one sentence; the rows give back the paragraph exactly', () => {
  const p = 'יו״ר ישר! גדי איזנקוט אמר: "ניסיון יפה. אבל לא". ד. כהן הגיע ב-3. אחר כך הלך!';
  const rows = splitSentences(p);
  assert.deepEqual(rows, ['יו״ר ישר! גדי איזנקוט אמר: "ניסיון יפה.', 'אבל לא".', 'ד. כהן הגיע ב-3.', 'אחר כך הלך!']);
  assert.equal(rows.join(' '), p);
  assert.deepEqual(splitSentences('שורה אחת בלי נקודה'), ['שורה אחת בלי נקודה']);
});
test('Israel time carries its offset: winter +02:00, summer +03:00', () => {
  assert.equal(israelIso(Date.parse('2026-11-14T19:49:59Z')), '2026-11-14T21:49:59+02:00');
  assert.equal(israelIso(Date.parse('2026-07-01T09:00:00Z')), '2026-07-01T12:00:00+03:00');
});

function ynetPage({ withHero = true } = {}) {
  return `<!doctype html><html><head><title>t</title>
  <meta property="og:image" content="https://ynet-pic1.yit.co.il/picserver6/crop_images/2026/11/14/HeroId1234/HeroId1234_0_0_3000_1689_0_large.jpg">
  <script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', headline: 'כותרת', description: 'הממשלה מתכוננת לשבוע סוער בכנסת, והאופוזיציה מאיימת בהפגנות', datePublished: '2026-11-14T19:49:59.494Z', author: { '@type': 'Person', name: 'כתב ynet' } })}</script>
  </head><body><nav><li>חדשות ספורט כלכלה תרבות ועוד הרבה קישורים בתפריט</li></nav>
  <main><article><h1>נתניהו נאם בכנסת: "נעבור את זה"</h1>
  ${withHero ? '<figure><div class="ArticleImageComponenta firstIm"><img src="https://ynet-pic1.yit.co.il/cdn-cgi/image/f=auto,w=740,q=75/picserver6/crop_images/2026/11/14/HeroId1234/HeroId1234_0_0_3000_1689_0_large.jpg" alt="ראש הממשלה"></div><figcaption>גלריהראש הממשלה בכנסת(צילום: אלכס קולומויסקי)</figcaption></figure>' : ''}
  <div class="DraftEditor-editorContainer">
   <div class="text_editor_paragraph rtl"><span>${P1}</span></div>
   <figure><img src="https://ynet-pic1.yit.co.il/cdn-cgi/image/f=auto,w=740,q=75/picserver6/crop_images/2026/11/14/Second5678/Second5678_large.jpg" alt="איזנקוט"><figcaption>יו״ר ישר! גדי איזנקוט(צילום: רויטרס)</figcaption></figure>
   <h3 class="pHeader"><span>האופוזיציה מגיבה</span></h3>
   <div class="text_editor_paragraph rtl"><strong>תגובה חריפה</strong><br>${P2}</div>
   <blockquote class="twitter-tweet"><p>ציוץ שלא שייך לטקסט של הכתבה עצמה בכלל</p></blockquote>
   <div class="text_editor_paragraph rtl">קראו גם: כתבה אחרת לגמרי באתר</div>
   <div class="text_editor_paragraph rtl">${P3}</div>
   <div class="text_editor_paragraph rtl copyright-27a-notice">התמונות מתפרסמות לפי סעיף 27א לחוק זכות יוצרים</div>
  </div></article>
  <aside><figure><img src="https://ynet-pic1.yit.co.il/picserver6/related/Other999.jpg"><figcaption>כתבה קשורה</figcaption></figure></aside>
  <figure><img src="https://ynet-pic1.yit.co.il/picserver6/after/After111.jpg"><figcaption>אחרי הכתבה</figcaption></figure></main></body></html>`;
}

test('extract: body in order, photos between paragraphs with caption and credit, junk left out', () => {
  const r = extractArticle(ynetPage(), { url: 'https://www.ynet.co.il/news/article/abc123', source: sourceFor('ynet') });
  assert.equal(r.ok, true);
  const a = r.article;
  assert.equal(a.title_he, 'נתניהו נאם בכנסת: "נעבור את זה"');
  assert.equal(a.subtitle_he, 'הממשלה מתכוננת לשבוע סוער בכנסת, והאופוזיציה מאיימת בהפגנות');
  assert.equal(a.author, 'כתב ynet');
  assert.equal(a.published_at, '2026-11-14T21:49:59+02:00');
  assert.deepEqual(a.paragraphs, [P1, 'האופוזיציה מגיבה', 'תגובה חריפה', P2, P3]);
  assert.equal(a.images.length, 2);
  assert.deepEqual({ ...a.images[0] }, { src: 'https://ynet-pic1.yit.co.il/picserver6/crop_images/2026/11/14/HeroId1234/HeroId1234_0_0_3000_1689_0_large.jpg',
    caption_he: 'ראש הממשלה בכנסת', credit_he: 'צילום: אלכס קולומויסקי', alt_he: 'ראש הממשלה', role: 'hero' });
  assert.equal(a.images[1].role, 'inline'); assert.equal(a.images[1].after_p, 1);
  assert.equal(a.images[1].caption_he, 'יו״ר ישר! גדי איזנקוט'); assert.equal(a.images[1].credit_he, 'צילום: רויטרס');
  assert.ok(!JSON.stringify(a).includes('ציוץ') && !JSON.stringify(a).includes('27א') && !JSON.stringify(a).includes('קראו גם'));
});
test('extract: no photo above the body → the og:image photo in the body becomes the main one', () => {
  const html = ynetPage({ withHero: false }).replace('HeroId1234/HeroId1234_0_0_3000_1689_0_large.jpg"', 'Second5678/Second5678_large.jpg"');
  const a = extractArticle(html, { url: 'https://www.ynet.co.il/news/article/abc123', source: sourceFor('ynet') }).article;
  assert.equal(a.images.length, 1);
  assert.equal(a.images[0].role, 'hero'); assert.equal(a.images[0].caption_he, 'יו״ר ישר! גדי איזנקוט'); assert.equal(a.images[0].after_p, undefined);
});
test('extract: the author avatar in the byline is not the main photo (mako wraps it in a <figure>)', () => {
  const html = `<html><head><meta property="og:image" content="https://img.mako.co.il/2015/06/10/story_i.jpg"><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-11-14T21:00:00+02:00"}</script></head>
  <body><article><h1>כותרת N12</h1><div class="ArticleCredits_root__x"><div class="Avatar_root__y"><figure><img class="Avatar_avatar__z" src="https://img.mako.co.il/2026/02/11/reporter.png" alt="שם הכתב"></figure></div></div>
  <div class="ArticleBodyWrapper_news__a"><div><p>${P1}</p><p>${P2}</p></div></div></article></body></html>`;
  const a = extractArticle(html, { url: 'https://www.mako.co.il/news-israel/2026_q4/Article-abc123.htm', source: sourceFor('n12') }).article;
  assert.deepEqual(a.images.map(i => [i.role, i.src]), [['hero', 'https://img.mako.co.il/2015/06/10/story_i.jpg']]);
});
test('extract: a page without body paragraphs is skipped', () => {
  assert.equal(extractArticle('<html><body><h1>כותרת בלבד</h1><p>טקסט</p></body></html>', { url: 'https://www.ynet.co.il/news/article/x', source: sourceFor('ynet') }).reason, 'NO_BODY');
});

test('Maariv: paragraphs sent only in the flight stream are put back at their section numbers', () => {
  const push = s => `<script>self.__next_f.push([1,${JSON.stringify(s)}])</script>`;
  const html = `<html><head><link rel="canonical" href="https://www.maariv.co.il/news/politics/article-1"><script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', datePublished: '2026-11-14T21:37:56+02:00', articleSection: 'פוליטי-מדיני', isAccessibleForFree: true })}</script></head>
  <body><article class="article-page-container"><h1>כותרת מעריב</h1>
  <section class="article-body-container"><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>
   <section id="section-2" class="article-image-container"><figure class="article-body-image-container"><img src="https://images.maariv.co.il/image/upload/f_auto,fl_lossy/c_fill,g_faces:center,h_400,w_711/954512" alt="x"><figcaption>הכנסת | צילום: פלאש 90</figcaption></figure></section>
   <p id="section-3" class="article-paragraph-section">${P3}</p>
  </section></article>
  ${push('2d:T' + Buffer.byteLength('<p>' + P1 + '</p>').toString(16) + ',')}${push('<p>' + P1 + '</p>')}
  ${push('\n3b:{"id":0,"type":100,"text":"$2d","section_object":null}\n3c:{"id":1,"type":100,"text":' + JSON.stringify('<p><strong>כותרת ביניים</strong><br>' + P2 + '</p>') + ',"section_object":null}\n')}
  </body></html>`;
  assert.deepEqual(flightSections(html).map(s => s.id), [0, 1]);
  const a = extractArticle(html, { url: 'https://www.maariv.co.il/news/politics/article-1', source: sourceFor('maariv') }).article;
  assert.deepEqual(a.paragraphs, [P1, 'כותרת ביניים', P2, P3]);
  assert.equal(a.section, 'politics'); assert.equal(a.paywalled, false);
  assert.equal(a.images[0].src, 'https://images.maariv.co.il/image/upload/f_jpg,q_85,w_1600/954512');
  assert.equal(a.images[0].credit_he, 'צילום: פלאש 90');
});

test('RSS items and robots.txt', () => {
  const items = parseFeed(`<rss><channel><item><title><![CDATA[כותרת &amp; עוד]]></title><link><![CDATA[https://www.ynet.co.il/news/article/a1]]></link><pubDate>Sat, 14 Nov 2026 19:49:59 GMT</pubDate><enclosure url="https://x/y.jpg"/></item>
    <item><title>ב</title><link>http://www.walla.co.il/news/israel/383961412</link></item></channel></rss>`);
  assert.deepEqual(items.map(i => [i.link, i.title, i.image]), [['https://www.ynet.co.il/news/article/a1', 'כותרת & עוד', 'https://x/y.jpg'], ['https://www.walla.co.il/news/israel/383961412', 'ב', null]]);
  const ok = parseRobots('User-agent: *\nDisallow: /english/\nDisallow: /private\nAllow: /private/open\n\nUser-agent: GPTBot\nDisallow: /');
  assert.equal(ok('/news/article/a1'), true); assert.equal(ok('/english/x'), false); assert.equal(ok('/private/x'), false); assert.equal(ok('/private/open/1'), true);
  assert.equal(parseRobots('User-agent: LinguistProNewsReader\nDisallow: /\nUser-agent: *\nAllow: /')('/news'), false);
});

// ---- end to end with a fake web ---------------------------------------------------------------------
async function harvesterSetup(t, { clock, pages = {}, onFetch = null } = {}) {
  const db = await new Promise((res, rej) => { const d = new sqlite3.Database(':memory:', e => e ? rej(e) : res(d)); });
  for (const m of ['081_news_harvest.sql', '082_news_harvest_items.sql', '083_news_editions.sql']) await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', m), 'utf8'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-harvest-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const photo = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#8899aa' } }).jpeg().toBuffer();
  const pub = new Date(clock.now - 3600e3).toUTCString();
  const web = {
    'https://www.ynet.co.il/Integration/StoryRss2.xml': `<rss><channel><item><title>א</title><link>https://www.ynet.co.il/news/article/abc123</link><pubDate>${pub}</pubDate></item>
      <item><title>ב</title><link>https://www.ynet.co.il/news/article/short1</link><pubDate>${pub}</pubDate></item>
      <item><title>ג</title><link>https://www.ynet.co.il/english/article/en1</link><pubDate>${pub}</pubDate></item></channel></rss>`,
    'https://www.ynet.co.il/robots.txt': 'User-agent: *\nDisallow: /english/',
    'https://www.ynet.co.il/news/article/abc123': ynetPage(),
    'https://www.ynet.co.il/news/article/short1': '<html><body><h1>קצר</h1><div class="text_editor_paragraph">משפט אחד קצר מאוד.</div></body></html>',
    ...pages,
  };
  const requests = [];
  const fetchImpl = async url => {
    requests.push(url);
    if (onFetch) await onFetch(url);
    if (/yit\.co\.il\/picserver6\/crop_images/.test(url) || /Second5678/.test(url)) return new Response(photo, { headers: { 'content-type': 'image/jpeg' } });
    if (url.includes('c14.co.il')) return new Response('<title>Just a moment...</title>', { status: 403 });
    return web[url] != null ? new Response(web[url], { headers: { 'content-type': 'text/html' } }) : new Response('nf', { status: 404 });
  };
  const sources = [sourceFor('ynet'), sourceFor('c14')];
  const harvester = createNewsHarvester({ db, dataDir, fetchImpl, sources, delayMs: 0, now: () => clock.now, limits: { minChars: 200 } });
  return { db, dataDir, harvester, requests };
}

test('hourly poll keeps every new article; an edition makes main drafts + «Обзор дня» that pack once dot translates', async t => {
  const clock = { now: Date.parse('2026-11-15T03:30:00+02:00') };
  const { harvester, requests, dataDir } = await harvesterSetup(t, { clock });
  const poll = await harvester.poll();
  assert.equal(poll.outlets.ynet.new, 3);
  assert.ok(poll.outlets.c14.errors.some(e => e.startsWith('BOT_CHALLENGE')));
  assert.ok(!requests.includes('https://www.ynet.co.il/english/article/en1'), 'robots.txt is honoured');
  assert.deepEqual(await harvester.pending().then(p => [p.items, p.queued]), [2, 0]);

  clock.now = Date.parse('2026-11-15T06:30:00+02:00');
  const r = await harvester.runOnce({ trigger: 'manual' });
  assert.equal(r.articles, 1, JSON.stringify(r.report)); assert.equal(r.images, 2);
  assert.equal(r.overview_items, 2); assert.equal(r.stories, 2);
  assert.equal(r.slot, 'extra'); assert.match(r.edition_id, /^ne_[0-9a-f]{18}$/);
  const zip = new AdmZip((await harvester.runFile(r.run_id)).path), names = zip.getEntries().map(e => e.entryName).sort();
  assert.deepEqual(names, ['README-dot.md', 'harvest.json', 'overview.json', 'ynet-0001.draft.json', 'ynet-0001/img-1.jpg', 'ynet-0001/img-2.jpg']);
  const img = await sharp(zip.readFile('ynet-0001/img-1.jpg')).metadata();
  assert.equal(img.width, 1600); assert.ok(zip.readFile('ynet-0001/img-1.jpg').length <= 600 * 1024);
  const draft = JSON.parse(zip.readAsText('ynet-0001.draft.json'));
  assert.equal(draft.learning.versions[0].rows.map(x => x.he_plain).join(' '), [P1, 'האופוזיציה מגיבה', 'תגובה חריפה', P2, P3].join(' '));
  assert.deepEqual(draft.images.map(i => [i.file, i.role, i.after_p]), [['img-1.jpg', 'hero', undefined], ['img-2.jpg', 'inline', 1]]);
  assert.match(draft.learning.story_key, /^2026-11-15-[0-9a-f]{8}$/);
  const ov = JSON.parse(zip.readAsText('overview.json'));
  assert.equal(ov.day, '2026-11-15'); assert.equal(ov.schema_version, 2); assert.equal(ov.edition_id, r.edition_id);
  assert.equal(ov.stories[0].main, true); assert.equal(ov.stories[0].story_key, draft.learning.story_key);
  const hj = JSON.parse(zip.readAsText('harvest.json'));
  assert.equal(hj.schema_version, 3); assert.equal(hj.edition_id, r.edition_id);
  assert.deepEqual(Object.keys(hj.main[0].images), ['img-1.jpg', 'img-2.jpg']);
  assert.equal(hj.main[0].images['img-1.jpg'], require('node:crypto').createHash('sha256').update(zip.readFile('ynet-0001/img-1.jpg')).digest('hex'));
  assert.deepEqual(ov.stories[0].items[0], { item_key: C.articleKey('ynet', 'https://www.ynet.co.il/news/article/abc123'), outlet_id: 'ynet', url: 'https://www.ynet.co.il/news/article/abc123', published_at: '2026-11-14T21:49:59+02:00', section: 'politics',
    title_he: 'נתניהו נאם בכנסת: "נעבור את זה"', title_ru: '', subtitle_he: 'הממשלה מתכוננת לשבוע סוער בכנסת, והאופוזיציה מאיימת בהפגנות', subtitle_ru: '',
    lead_he: 'ראש הממשלה נאם הערב בכנסת ואמר כי הממשלה תמשיך לפעול. הוא הוסיף כי "המצב קשה, אבל נעבור את זה" ופנה לאופוזיציה.', lead_ru: '', draft: 'ynet-0001.draft.json' });
  assert.equal(ov.stories[1].items[0].title_he, 'קצר'); assert.equal(ov.stories[1].main, false);

  // Untouched: the article lacks translation and the overview says so; translated, both pack.
  const dir = fs.mkdtempSync(path.join(dataDir, 'dot-'));
  zip.extractAllTo(dir, true);
  const raw = await buildPack(dir, { checkOnly: true, now: clock.now });
  assert.equal(raw.articles[0].code, 'TRANSLATION_MISSING'); assert.deepEqual(raw.overview.warnings, ['OVERVIEW_TRANSLATION_MISSING:2']);
  Object.assign(draft.learning, { title_ru: 'Нетаньяху выступил в Кнессете', summary_ru: 'О чём статья.', subtitle_ru: 'Подзаголовок' });
  const { studyRows, glossFor } = require('./helpers/newsFixture.cjs');
  draft.learning.versions[0].rows = studyRows(draft.learning.versions[0].rows.map(row => ({ ...row, he_niqqud: undefined, translit: undefined, translit_ru: undefined, ru: 'Перевод' })))
    .map(r => ({ ...r, he_niqqud: r.he_niqqud || r.he_plain, translit: r.translit || 'translit', translit_ru: r.translit_ru || 'транслит' }));
  draft.learning.versions[0].word_gloss_ai = 'or.word-gloss-ai.json';
  fs.writeFileSync(path.join(dir, 'ynet-0001', 'or.word-gloss-ai.json'), glossFor(draft.learning.versions[0].rows));
  fs.writeFileSync(path.join(dir, 'ynet-0001.draft.json'), JSON.stringify(draft));
  for (const s of ov.stories) for (const it of s.items) { it.title_ru = 'Заголовок'; if (it.subtitle_he) it.subtitle_ru = 'Подзаголовок'; if (it.lead_he) it.lead_ru = 'Первый абзац'; }
  fs.writeFileSync(path.join(dir, 'overview.json'), JSON.stringify(ov));
  const packed = await buildPack(dir, { now: clock.now, out: path.join(dir, 'pack.lpnews.zip') });
  assert.equal(packed.ok, true, JSON.stringify(packed)); assert.equal(packed.articles[0].ok, true, JSON.stringify(packed.articles)); assert.equal(packed.articles[0].fidelity, 1); assert.deepEqual(packed.overview.warnings, []);
  const pz = new AdmZip(packed.written), manifest = JSON.parse(pz.readAsText('manifest.json'));
  assert.equal(manifest.overview.path, 'overview.json'); assert.equal(manifest.overview.sha256, require('node:crypto').createHash('sha256').update(pz.readFile('overview.json')).digest('hex'));

  // dot took this archive: the next edition takes nothing of it while it is in work.
  await harvester.downloadEdition(r.edition_id);
  const again = await harvester.runOnce({ trigger: 'manual' });
  assert.equal(again.overview_items, 0); assert.equal(again.file_name, null); assert.equal(again.status, 'skipped');
  assert.equal((await harvester.listRuns()).find(x => x.run_id === r.run_id).overview_items, 2);
});

const editionRows = db => new Promise((res, rej) => db.all('SELECT slot, status FROM news_editions ORDER BY rowid', (e, r) => e ? rej(e) : res(r)));
test('tick: morning at 06:00 builds an edition; the next tick before 10:30 only polls', async t => {
  const clock = { now: Date.parse('2026-11-16T06:05:00+02:00') };
  const { harvester, db } = await harvesterSetup(t, { clock });
  const r = await harvester.tick();
  assert.equal(r.slot, 'morning'); assert.equal(r.trigger, 'schedule'); assert.equal(r.articles, 1);
  clock.now = Date.parse('2026-11-16T06:20:00+02:00');
  await harvester.tick();
  assert.deepEqual(await editionRows(db), [{ slot: 'morning', status: 'archived' }]);
});
test('tick: missed midday is skipped, evening carries everything', async t => {
  const clock = { now: Date.parse('2026-11-16T06:05:00+02:00') };
  const { harvester, db } = await harvesterSetup(t, { clock });
  const m = await harvester.tick();
  clock.now = Date.parse('2026-11-16T17:00:00+02:00');
  const ev = await harvester.tick();
  assert.equal(ev.slot, 'evening');
  assert.deepEqual(await editionRows(db), [{ slot: 'morning', status: 'superseded' }, { slot: 'midday', status: 'skipped' }, { slot: 'evening', status: 'archived' }]);
  assert.equal(ev.overview_items, m.overview_items, 'the morning archive was not taken by dot: its material is in the evening one');
  assert.equal(ev.articles, 1, 'the morning draft is carried over');
});
test('edition: items of a downloaded edition are leased for 4 h and not repeated', async t => {
  const clock = { now: Date.parse('2026-11-16T06:05:00+02:00') };
  const { harvester } = await harvesterSetup(t, { clock });
  const m = await harvester.tick();
  clock.now = Date.parse('2026-11-16T07:00:00+02:00');
  await harvester.downloadEdition(m.edition_id); // in work until 11:00
  clock.now = Date.parse('2026-11-16T10:31:00+02:00');
  const mid = await harvester.tick();
  assert.equal(mid.slot, 'midday'); assert.equal(mid.overview_items, 0); assert.equal(mid.articles, 0);
  // the lease is over and nothing was published: the material comes back
  clock.now = Date.parse('2026-11-16T16:31:00+02:00');
  const ev = await harvester.tick();
  assert.equal(ev.overview_items, m.overview_items); assert.equal(ev.articles, 1);
});
test('edition: carried-over drafts come on top of the new ones', async t => {
  const clock = { now: Date.parse('2026-11-16T06:05:00+02:00') };
  const { harvester, db } = await harvesterSetup(t, { clock });
  await harvester.tick();
  clock.now = Date.parse('2026-11-16T10:31:00+02:00');
  await harvester.saveSchedule({ slots: { midday: { main: 1 } } });
  const mid = await harvester.tick();
  const states = await new Promise((res, rej) => db.all("SELECT main_state, main_edition_id FROM news_harvest_items WHERE main_state<>'none'", (e, r) => e ? rej(e) : res(r)));
  assert.equal(states.length, 1); assert.equal(states[0].main_edition_id, mid.edition_id);
  assert.equal(mid.articles, 1);
});
test('manual run makes an extra edition of the current day', async t => {
  const clock = { now: Date.parse('2026-11-16T05:00:00+02:00') };
  const { harvester, db } = await harvesterSetup(t, { clock });
  const r = await harvester.runOnce({ trigger: 'manual' });
  assert.equal(r.slot, 'extra'); assert.equal(r.day, '2026-11-15'); assert.equal(r.trigger, 'manual');
  assert.deepEqual(await editionRows(db), [{ slot: 'extra', status: 'archived' }]);
});

test('schedule: the feeds are polled every hour between cut-offs', async t => {
  const clock = { now: Date.parse('2026-11-15T05:00:00+02:00') };
  const { harvester, db } = await harvesterSetup(t, { clock });
  // 05:00 belongs to the day before; its late edition (20:30) is due — the first tick builds it.
  const late = await harvester.tick();
  assert.equal(late.slot, 'late'); assert.equal(late.day, '2026-11-14');
  clock.now += 20 * 60 * 1000;
  assert.equal(await harvester.tick(), null, 'no second poll within the hour');
  clock.now = Date.parse('2026-11-15T05:58:00+02:00');
  const p = await harvester.tick();
  assert.ok(p && p.outlets && !p.edition_id, 'between cut-offs a tick polls');
  clock.now = Date.parse('2026-11-15T06:05:00+02:00');
  assert.equal((await harvester.tick()).slot, 'morning');
  assert.deepEqual((await editionRows(db)).map(e => e.slot + ':' + e.status),
    ['morning:skipped', 'midday:skipped', 'evening:skipped', 'late:superseded', 'morning:archived']);
});

test('rubric: a generic «חדשות» article gets its rubric from the words of its title and first paragraph', () => {
  const { refineSection } = require('../news/harvest/newsStories');
  assert.equal(refineSection('news', 'בכיר חמאס נפצע אנוש בתקיפת צה״ל', ''), 'security');
  assert.equal(refineSection('news', 'נתניהו קורא למו״מ, איזנקוט: כבר נקבעה פגישה', ''), 'politics');
  assert.equal(refineSection('world', 'ראפיניה רתח אחרי ההפסד של ברזיל', 'המשחק הסתיים במהומה'), 'sport');
  assert.equal(refineSection('news', 'בת 12 הותקפה ונשדדה בגן ציבורי בחולון', 'המשטרה פתחה בחקירה'), 'news');
  assert.equal(refineSection('world', 'פוטין התקשר לטראמפ', 'בכנסת הגיבו'), 'world');
  assert.equal(refineSection('opinion', 'נתניהו וכנסת', ''), 'opinion', 'a specific rubric is kept');
});
test('stories: one event across outlets is one story; the main stories follow the rubric quota', () => {
  const { clusterStories, selectStories } = require('../news/harvest/newsStories');
  const items = [
    { id: 'a', outlet_id: 'ynet', title: 'צה״ל חיסל את מפקד חטיבת רפיח של חמאס', text: 'הותקף בחאן יונס', at: 3 },
    { id: 'b', outlet_id: 'maariv', title: 'בעזה מדווחים: מפקד חטיבת רפיח בחמאס חוסל בתקיפה', text: '', at: 2 },
    { id: 'c', outlet_id: 'walla', title: 'נבחרת ישראל סיימה ב-0:0 מול קוסובו', text: 'ליגת האומות', at: 1 },
    { id: 'd', outlet_id: 'haaretz', title: 'ישראל סיימה 0:0 בקוסובו בליגת האומות', text: '', at: 1 },
    { id: 'e', outlet_id: 'n12', title: 'התחזית: גשם ראשון בצפון', text: '', at: 1 },
  ];
  const of = clusterStories(items);
  assert.equal(of.get('a'), of.get('b')); assert.equal(of.get('c'), of.get('d'));
  assert.notEqual(of.get('a'), of.get('c')); assert.notEqual(of.get('e'), of.get('a'));
  const m = (id, outlet, section, extra) => ({ id, outlet_id: outlet, section, at: 1, full_ok: true, paywalled: 0, images: 1, chars: 2000, ...extra });
  const stories = [
    { id: 's1', members: [m('1', 'ynet', 'security'), m('2', 'maariv', 'security', { images: 3 }), m('3', 'haaretz', 'security', { paywalled: 1 })] },
    { id: 's2', members: [m('4', 'walla', 'sport'), m('5', 'ynet', 'sport')] },
    { id: 's3', members: [m('6', 'n12', 'sport')] },
    { id: 's4', members: [m('7', 'ynet', 'opinion')] },
    { id: 's5', members: [m('8', 'walla', 'news', { full_ok: false })] },
  ];
  const picked = selectStories(stories, { total: 3, quota: { security: 1, culture: 1, opinion: 1 } });
  assert.deepEqual(picked.map(p => p.story.id), ['s1', 's2', 's4']);
  assert.equal(picked[0].pick.id, '2', 'not paywalled, more photos');
  assert.equal(picked[1].pick.outlet_id, 'walla', 'outlets are rotated');
});

test('«Обзор дня»: packed overview is checked, stored by day and links readable articles; GET /api/news/overview', async t => {
  const C = require('../news/newsPackCore');
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');
  const db = await new Promise((res, rej) => { const d = new sqlite3.Database(':memory:', e => e ? rej(e) : res(d)); });
  t.after(() => db.close());
  for (const m of ['078_news.sql', '079_news_manage.sql', '080_news_images.sql', '082_news_harvest_items.sql']) await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', m), 'utf8'));
  const NOW = Date.parse('2026-11-12T08:00:00+02:00');
  const repo = createNewsRepo({ db, now: () => NOW });
  const art = fixtureArticle();
  const ov = { schema: 'linguistpro-news-overview', schema_version: 1, day: '2026-11-12', stories: [
    { story_key: '2026-11-12-aaaa', main: true, items: [{ outlet_id: art.source.outlet_id, url: art.source.canonical_url, section: 'politics', title_he: 'כותרת ראשית', title_ru: 'Главный заголовок', lead_he: 'פסקה ראשונה.', lead_ru: 'Первый абзац.' },
      { outlet_id: 'walla', url: 'https://www.walla.co.il/news/israel/383961412', section: 'politics', title_he: 'כותרת שנייה', title_ru: 'Второй' }] }] };
  assert.equal(C.validateOverview(ov).ok, true);
  assert.equal(C.validateOverview({ ...ov, stories: [{ story_key: 'x', items: [{ outlet_id: 'ynet', url: 'https://www.walla.co.il/news/1', title_he: 'א' }] }] }).code, 'OVERVIEW_ITEM_INVALID');
  // A pack with one article and the overview.
  const zip = new AdmZip(fixturePack([art]));
  const buf = Buffer.from(JSON.stringify(ov));
  const manifest = JSON.parse(zip.readAsText('manifest.json'));
  manifest.overview = { path: 'overview.json', sha256: C.sha256(buf) };
  zip.addFile('overview.json', buf); zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
  const receipt = await repo.ingestPack({ id: 'owner', kind: 'owner' }, zip.toBuffer());
  assert.equal(receipt.totals.published, 1);
  assert.deepEqual(receipt.overview, { status: 'published', day: '2026-11-12', stories: 1, items: 2, warnings: [] });
  const got = await repo.getOverview();
  assert.equal(got.day, '2026-11-12'); assert.equal(got.prev, null);
  assert.match(got.stories[0].items[0].work_id, /^na_[0-9a-f]{24}\.b1$/);
  assert.equal(got.stories[0].items[1].work_id, undefined);
  // A wrong hash is refused, the articles of the pack still go in.
  manifest.overview.sha256 = '0'.repeat(64); zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
  assert.equal((await repo.ingestPack({ id: 'owner', kind: 'owner' }, zip.toBuffer())).overview.code, 'SHA_MISMATCH');

  const app = express();
  mountNewsRoutes(app, { repo, editorAuth: { resolve: async () => null }, resolveUser: async () => null });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const res = await (await fetch(base + '/api/news/overview?day=2026-11-12')).json();
  assert.equal(res.overview.stories[0].items[0].title_ru, 'Главный заголовок');
  assert.equal((await fetch(base + '/api/news/overview?day=2026-01-01')).status, 404);
});

test('routes: the owner lists, starts and downloads; strangers get 401', async t => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-hr-')), 'news-harvest-2026-11-15-abcdef.zip');
  fs.writeFileSync(file, 'PK-test');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  let started = 0;
  const harvester = { isRunning: () => false, listRuns: async () => [{ run_id: 'nh_1', status: 'done', articles: 3 }],
    runOnce: async () => { started++; return { run_id: 'nh_2', articles: 0 }; }, runFile: async id => id === 'nh_1' ? { path: file, name: path.basename(file) } : null };
  const app = express();
  const resolveUser = async req => String(req.headers.cookie || '').includes('owner') ? { user: { id: 'o', role: 'owner' }, session: { csrf: 'c' } } : null;
  mountNewsRoutes(app, { repo: {}, editorAuth: { resolve: async () => null }, resolveUser, harvester });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port, owner = { cookie: 'lp=owner' };
  assert.equal((await fetch(base + '/api/news/editor/harvests')).status, 401);
  const list = await (await fetch(base + '/api/news/editor/harvests', { headers: owner })).json();
  assert.equal(list.runs[0].run_id, 'nh_1');
  assert.equal((await fetch(base + '/api/news/editor/harvests/run', { method: 'POST', headers: { ...owner, 'content-type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/api/news/editor/harvests/run', { method: 'POST', headers: { ...owner, 'x-lp-csrf': 'c', 'content-type': 'application/json' }, body: '{}' })).status, 202);
  assert.equal(started, 1);
  const dl = await fetch(base + '/api/news/editor/harvests/nh_1/download', { headers: owner });
  assert.equal(dl.status, 200); assert.match(dl.headers.get('content-disposition'), /news-harvest-2026-11-15-abcdef\.zip/);
  assert.equal((await fetch(base + '/api/news/editor/harvests/nope/download', { headers: owner })).status, 404);
});

test('photos of articles live 2 months; the text stays in the archive', async t => {
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');
  const db = await new Promise((res, rej) => { const d = new sqlite3.Database(':memory:', e => e ? rej(e) : res(d)); });
  t.after(() => db.close());
  for (const m of ['078_news.sql', '079_news_manage.sql', '080_news_images.sql', '082_news_harvest_items.sql']) await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', m), 'utf8'));
  const NOW = Date.parse('2026-11-12T08:00:00+02:00');
  let clock = NOW;
  const repo = createNewsRepo({ db, now: () => clock });
  const jpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#abc' } }).jpeg().toBuffer();
  const a = fixtureArticle({ images: [{ file: 'img-1.jpg', role: 'hero', source_url: 'https://ynet-pic1.yit.co.il/p/1.jpg' }], __files: { 'img-1.jpg': jpeg } });
  const r = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([a]));
  const id = r.items[0].article_id;
  assert.ok(await repo.getImage(id, 'img-1.jpg'));
  clock = NOW + 30 * 86400000;
  assert.equal((await repo.runLifecycle(clock)).photos_removed, 0);
  clock = NOW + 62 * 86400000;
  const life = await repo.runLifecycle(clock);
  assert.equal(life.photos_removed, 1);
  assert.equal(await repo.getImage(id, 'img-1.jpg'), null);
  const card = await repo.getCard(r.items[0].work_id);
  assert.equal(card.tier, 'archive'); assert.equal(card.readable, true); assert.equal(card.image.stored, undefined);
});

test('rework: a refused draft goes to rework/ of the next edition with its reason', async t => {
  const clock = { now: Date.parse('2026-11-16T06:05:00+02:00') };
  const { harvester } = await harvesterSetup(t, { clock });
  const m = await harvester.tick();
  await harvester.downloadEdition(m.edition_id);
  await harvester.accountPack({ edition_id: m.edition_id, items: [], overview: true,
    rejected: [{ outlet_id: 'ynet', canonical_url: 'https://www.ynet.co.il/news/article/abc123', code: 'STUDY_LAYER_INVALID' }] });
  clock.now = Date.parse('2026-11-16T10:31:00+02:00'); // the lease (until 10:05) is over
  const mid = await harvester.tick();
  assert.equal(mid.articles, 1);
  const zip = new AdmZip((await harvester.downloadEdition(mid.edition_id)).path);
  const hj = JSON.parse(zip.readAsText('harvest.json'));
  assert.deepEqual(hj.rework.map(r => [r.draft, r.reason, r.attempts]), [['rework/ynet-0001.draft.json', 'STUDY_LAYER_INVALID', 1]]);
  assert.ok(zip.getEntry('rework/ynet-0001/img-1.jpg'));
});

test('review: a pack ingested while the edition fetches photos is not undone by the build', async t => {
  const clock = { now: Date.parse('2026-11-16T06:05:00+02:00') };
  let db = null, fired = false;
  const onFetch = async url => {
    if (fired || !/picserver6\/crop_images/.test(url)) return;
    fired = true; // dot's pack lands now: the article is published, its overview row is done
    await new Promise((res, rej) => db.run("UPDATE news_harvest_items SET main_state='published', overview_state='done' WHERE url LIKE '%abc123%'", e => e ? rej(e) : res()));
  };
  const s = await harvesterSetup(t, { clock, onFetch });
  db = s.db;
  await s.harvester.tick();
  assert.ok(fired);
  const row = await new Promise((res, rej) => db.get("SELECT main_state, overview_state FROM news_harvest_items WHERE url LIKE '%abc123%'", (e, r) => e ? rej(e) : res(r)));
  assert.deepEqual(row, { main_state: 'published', overview_state: 'done' });
});

// ---- B2: re-check published articles at each cut-off (spec §4.4, §5.5) ---------------------------------
async function recheckSetup(t, { page = ynetPage(), robots = 'User-agent: *\nAllow: /' } = {}) {
  const { openDb } = require('./helpers/newsDb.cjs');
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');
  const { fingerprintOf } = require('../news/newsFingerprint');
  const db = await openDb(['084_news_fingerprints.sql']);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-recheck-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const clock = { now: Date.parse('2026-11-12T10:00:00+02:00') };
  const repo = createNewsRepo({ db, now: () => clock.now });
  const r = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([fixtureArticle()]));
  const id = r.items[0].article_id;
  // The published original: the old title and three paragraphs; the page now has five and a new title.
  const fp = fingerprintOf('כותרת ישנה', [P1, P2, P3]);
  await new Promise((res, rej) => db.run(`INSERT INTO news_article_fingerprints(article_id, url, title_hash, para_hashes_json, created_at) VALUES (?,?,?,?,?)`,
    [id, 'https://www.ynet.co.il/news/article/abc123', fp.title_hash, JSON.stringify(fp.para_hashes), new Date(clock.now).toISOString()], e => e ? rej(e) : res()));
  await new Promise((res, rej) => db.run(`INSERT INTO news_overview_items(item_key, day, story_key, outlet_id, url, title_he, title_ru, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, '2026-11-12', 'S', 'ynet', 'https://www.ynet.co.il/news/article/abc123', 'כותרת ישנה', 'Старый заголовок', 't', 't'], e => e ? rej(e) : res()));
  await new Promise((res, rej) => db.run(`INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status, overview_state, title_he) VALUES (?,?,?,?,'ready','done','כותרת ישנה')`,
    [id, 'ynet', 'https://www.ynet.co.il/news/article/abc123', new Date(clock.now - 3600e3).toISOString()], e => e ? rej(e) : res()));
  const requests = [];
  const fetchImpl = async url => { requests.push(url); return url.endsWith('/robots.txt') ? new Response(robots) : url.includes('abc123') ? new Response(page, { headers: { 'content-type': 'text/html' } }) : new Response('nf', { status: 404 }); };
  const harvester = createNewsHarvester({ db, dataDir, fetchImpl, sources: [sourceFor('ynet')], delayMs: 0, now: () => clock.now });
  const q = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, x) => e ? rej(e) : res(x)));
  return { db, harvester, id, clock, requests, q };
}
test('recheck: an article updated by the outlet gets a change row; the article itself is untouched', async t => {
  const { harvester, id, q } = await recheckSetup(t);
  const before = (await q('SELECT snapshot_json FROM news_works WHERE article_id=?', [id]))[0].snapshot_json;
  const r = await harvester.recheckPublished({ editionId: null });
  assert.deepEqual(r, { checked: 1, changed: 1 });
  const ch = await q('SELECT added, changed, removed, title_changed, new_title_he, significant FROM news_article_changes');
  assert.deepEqual(ch, [{ added: 2, changed: 0, removed: 0, title_changed: 1, new_title_he: 'נתניהו נאם בכנסת: "נעבור את זה"', significant: 1 }]);
  assert.equal((await q('SELECT snapshot_json FROM news_works WHERE article_id=?', [id]))[0].snapshot_json, before);
  const ov = (await q('SELECT title_he, title_ru, changed_at FROM news_overview_items WHERE item_key=?', [id]))[0];
  assert.equal(ov.title_he, 'נתניהו נאם בכנסת: "נעבור את זה"'); assert.equal(ov.title_ru, null); assert.ok(ov.changed_at);
  assert.equal((await q('SELECT overview_state s, title_he FROM news_harvest_items WHERE url_key=?', [id]))[0].s, 'todo', 'the new title goes to dot');
});
test('recheck: the same update is recorded once', async t => {
  const { harvester, q } = await recheckSetup(t);
  await harvester.recheckPublished({});
  await harvester.recheckPublished({});
  assert.equal((await q('SELECT COUNT(*) n FROM news_article_changes'))[0].n, 1);
});
test('recheck: only articles of the last 24 h, robots respected', async t => {
  const a = await recheckSetup(t, { robots: 'User-agent: *\nDisallow: /news/' });
  assert.deepEqual(await a.harvester.recheckPublished({}), { checked: 0, changed: 0 });
  assert.ok(!a.requests.some(u => u.includes('abc123')));
  const b = await recheckSetup(t);
  b.clock.now += 25 * 3600e3;
  assert.deepEqual(await b.harvester.recheckPublished({}), { checked: 0, changed: 0 });
});
