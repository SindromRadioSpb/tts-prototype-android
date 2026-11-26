'use strict';
// The generic article reader (plan W3 Task 2; spec 2026-11-26 §5.1). Pages are synthetic.
const test = require('node:test'), assert = require('node:assert/strict');
const { extractArticle } = require('../news/harvest/newsExtract');

const P1 = 'עיריית חיפה הודיעה הבוקר על פתיחת קו אוטובוס חדש שיחבר בין הקריות לבין מרכז העיר בתוך חצי שעה בלבד.';
const P2 = 'לדברי ראש העירייה, "מדובר בבשורה של ממש לתושבים" והקו יפעל כל יום מהשעה חמש בבוקר ועד חצות.';
const P3 = 'תושבי השכונות הצפוניות בירכו על ההחלטה, אך ביקשו להוסיף תחנות גם ליד בתי הספר והמרכזים הקהילתיים.';
const source = { outlet_id: 'haipo', generic: true };
const url = 'https://haipo.co.il/item/12345';

test('generic reads JSON-LD articleBody into paragraphs', () => {
  const ld = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: 'קו אוטובוס חדש בחיפה', datePublished: '2026-11-26T08:00:00+02:00',
    author: { '@type': 'Person', name: 'כתבת בדיקה' }, articleBody: [P1, P2, P3, P1 + ' ' + P3].join('\n'), image: 'https://haipo.co.il/wp-content/uploads/bus.jpg' };
  const html = `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><h1>קו אוטובוס חדש בחיפה</h1><div class="x">טיזר</div></body></html>`;
  const r = extractArticle(html, { url, source });
  assert.equal(r.ok, true);
  assert.deepEqual(r.article.paragraphs, [P1, P2, P3, P1 + ' ' + P3]);
  assert.equal(r.article.author, 'כתבת בדיקה'); assert.match(r.article.published_at, /^2026-11-26T08:00:00/);
  assert.equal(r.article.images[0].role, 'hero');
});
test('generic picks the article body, not related links or comments', () => {
  const html = `<html><body><header><nav>תפריט ראשי</nav></header><main>
    <h1>קו אוטובוס חדש בחיפה</h1><div class="byline">מאת כתבת</div>
    <div class="entry-content"><p>${P1}</p><figure><img src="https://haipo.co.il/wp-content/uploads/bus-1200x630.jpg"><figcaption>האוטובוס החדש (צילום: עיריית חיפה)</figcaption></figure><p>${P2}</p><p>${P3}</p></div>
    <div class="related-posts"><p><a href="/a">כתבה קשורה ראשונה עם כותרת ארוכה מאוד על נושא אחר לגמרי בעיר</a></p><p><a href="/b">כתבה קשורה שנייה עם כותרת ארוכה מאוד על נושא אחר לגמרי בעיר</a></p></div>
    <section id="comments"><p>תגובה ארוכה של קורא שכתב הרבה מאוד מילים על הקו החדש ועל התחבורה הציבורית בחיפה ובקריות בכלל, והוא לא מרוצה.</p>
      <p>תגובה ארוכה נוספת של קורא אחר שכתב גם הוא הרבה מאוד מילים על הקו החדש ועל התחבורה הציבורית בחיפה ובקריות, והוא דווקא מרוצה מאוד.</p>
      <p>ועוד תגובה ארוכה מאוד של קורא שלישי שמסביר בפירוט רב למה לדעתו הקו הזה מיותר ולמה צריך להשקיע את הכסף בתחנות רכבת חדשות.</p></section>
    <div class="newsletter"><p>הירשמו לניוזלטר שלנו וקבלו את כל החדשות של חיפה והקריות ישירות למייל שלכם בכל בוקר</p></div></main></body></html>`;
  const r = extractArticle(html, { url, source });
  assert.equal(r.ok, true);
  assert.deepEqual(r.article.paragraphs, [P1, P2, P3]);
  assert.equal(r.article.images.length, 1);
  assert.equal(r.article.images[0].credit_he, 'צילום: עיריית חיפה');
  assert.equal(r.article.promoted, false);
});
test('promoted content is marked', () => {
  const html = `<html><body><article><div class="label">תוכן מקודם</div><h1>הדירה שתשנה לכם את החיים</h1><div class="content"><p>${P1}</p><p>${P2}</p><p>${P3}</p></div></article></body></html>`;
  assert.deepEqual(extractArticle(html, { url, source }), { ok: false, reason: 'PROMOTED' });
  const sponsored = `<html><head><meta property="article:tag" content="sponsored"></head><body><article><h1>כותרת</h1><div class="content sponsored-post"><p>${P1}</p><p>${P2}</p><p>${P3}</p></div></article></body></html>`;
  assert.deepEqual(extractArticle(sponsored, { url, source }), { ok: false, reason: 'PROMOTED' });
  // An outlet with its own selectors is checked the same way.
  assert.deepEqual(extractArticle(html, { url, source: { outlet_id: 'x', text: 'div.content p' } }), { ok: false, reason: 'PROMOTED' });
});
test('a page with only short teasers has no body', () => {
  const html = `<html><body><h1>כותרת</h1><div><p>שורה</p></div></body></html>`;
  assert.deepEqual(extractArticle(html, { url, source }), { ok: false, reason: 'NO_BODY' });
});
test('a wrapper with a noisy class that holds the article is kept', () => {
  const html = `<html><body><main><h1>קו אוטובוס חדש</h1><div class="post-content tags-list"><p>${P1}</p><p>${P2}</p><p>${P3}</p><p>${P1}</p></div></main></body></html>`;
  const r = extractArticle(html, { url, source });
  assert.equal(r.ok, true); assert.equal(r.article.paragraphs.length, 4);
});
test('a «תוכן מקודם» widget in a sidebar does not make the article an ad', () => {
  const html = `<html><body><div class="wrap"><div class="main"><h1>קו אוטובוס חדש</h1><div class="body"><p>${P1}</p><p>${P2}</p><p>${P3}</p></div></div>
    <div class="sidebar-widget"><span>תוכן מקודם</span><a href="/x">משהו</a></div></div></body></html>`;
  assert.equal(extractArticle(html, { url, source }).ok, true);
});
