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
async function harvesterSetup(t, { clock, pages = {} } = {}) {
  const db = await new Promise((res, rej) => { const d = new sqlite3.Database(':memory:', e => e ? rej(e) : res(d)); });
  await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', '081_news_harvest.sql'), 'utf8'));
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
    if (/yit\.co\.il\/picserver6\/crop_images/.test(url) || /Second5678/.test(url)) return new Response(photo, { headers: { 'content-type': 'image/jpeg' } });
    if (url.includes('c14.co.il')) return new Response('<title>Just a moment...</title>', { status: 403 });
    return web[url] != null ? new Response(web[url], { headers: { 'content-type': 'text/html' } }) : new Response('nf', { status: 404 });
  };
  const sources = [sourceFor('ynet'), sourceFor('c14')];
  const harvester = createNewsHarvester({ db, dataDir, fetchImpl, sources, delayMs: 0, now: () => clock.now, limits: { minChars: 200 } });
  return { db, dataDir, harvester, requests };
}

test('a run makes one archive of drafts that pass the packer once dot fills the translation', async t => {
  const clock = { now: Date.parse('2026-11-15T06:30:00+02:00') };
  const { harvester, requests, dataDir } = await harvesterSetup(t, { clock });
  const r = await harvester.runOnce({ trigger: 'manual' });
  assert.equal(r.articles, 1, JSON.stringify(r.report)); assert.equal(r.images, 2);
  assert.deepEqual(r.report.outlets.ynet.skipped, { ROBOTS: 1, TOO_SHORT: 1 });
  assert.ok(r.report.outlets.c14.errors.some(e => e.startsWith('BOT_CHALLENGE')));
  assert.ok(!requests.includes('https://www.ynet.co.il/english/article/en1'));
  const file = await harvester.runFile(r.run_id);
  const zip = new AdmZip(file.path), names = zip.getEntries().map(e => e.entryName).sort();
  assert.deepEqual(names, ['README-dot.md', 'harvest.json', 'ynet-0001.draft.json', 'ynet-0001/img-1.jpg', 'ynet-0001/img-2.jpg']);
  const img = await sharp(zip.readFile('ynet-0001/img-1.jpg')).metadata();
  assert.equal(img.width, 1600); assert.ok(zip.readFile('ynet-0001/img-1.jpg').length <= 600 * 1024);
  const draft = JSON.parse(zip.readAsText('ynet-0001.draft.json'));
  assert.equal(draft.learning.versions[0].level, 'OR');
  assert.equal(draft.learning.versions[0].rows.map(x => x.he_plain).join(' '), [P1, 'האופוזיציה מגיבה', 'תגובה חריפה', P2, P3].join(' '));
  assert.deepEqual(draft.images.map(i => [i.file, i.role, i.after_p]), [['img-1.jpg', 'hero', undefined], ['img-2.jpg', 'inline', 1]]);
  assert.equal(draft.source.retrieved_at, '2026-11-15T06:30:00+02:00');
  assert.equal(draft.prepared.method, 'original');

  // Untouched it is not publishable (translation missing); filled like dot does, it packs at 100%.
  const dir = fs.mkdtempSync(path.join(dataDir, 'dot-'));
  zip.extractAllTo(dir, true);
  assert.equal((await buildPack(dir, { checkOnly: true, now: clock.now })).articles[0].code, 'TRANSLATION_MISSING');
  draft.learning.title_ru = 'Нетаньяху выступил в Кнессете'; draft.learning.summary_ru = 'О чём статья.'; draft.learning.subtitle_ru = 'Подзаголовок';
  for (const row of draft.learning.versions[0].rows) row.ru = 'Перевод';
  fs.writeFileSync(path.join(dir, 'ynet-0001.draft.json'), JSON.stringify(draft));
  const packed = await buildPack(dir, { checkOnly: true, now: clock.now });
  assert.equal(packed.ok, true, JSON.stringify(packed.articles)); assert.equal(packed.articles[0].fidelity, 1);

  // The next run does not take the same article again.
  const again = await harvester.runOnce({ trigger: 'manual' });
  assert.equal(again.articles, 0); assert.equal(again.file_name, null);
  const runs = await harvester.listRuns();
  assert.equal(runs.length, 2); assert.equal(runs.find(x => x.run_id === r.run_id).has_file, true);
});

test('the schedule runs once a day after 06:00 Israel time', async t => {
  const clock = { now: Date.parse('2026-11-15T05:50:00+02:00') };
  const { harvester } = await harvesterSetup(t, { clock });
  assert.equal(await harvester.tick(), null);
  clock.now = Date.parse('2026-11-15T06:05:00+02:00');
  const r = await harvester.tick();
  assert.equal(r.trigger, 'schedule'); assert.equal(r.articles, 1);
  clock.now = Date.parse('2026-11-15T09:00:00+02:00');
  assert.equal(await harvester.tick(), null);
  clock.now = Date.parse('2026-11-16T06:01:00+02:00');
  assert.equal((await harvester.tick()).trigger, 'schedule');
  // A manual run after 06:00 stands for the day's run: the schedule does not add a second archive.
  clock.now = Date.parse('2026-11-17T07:00:00+02:00');
  await harvester.runOnce({ trigger: 'manual' });
  clock.now = Date.parse('2026-11-17T07:10:00+02:00');
  assert.equal(await harvester.tick(), null);
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
