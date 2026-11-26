'use strict';
// A synthetic copy of the home-PC C14 pilot of 2026-11-26 (10 cards: 9 with a full text, 1 NO_BODY).
// The real pilot's texts are not kept in the repository; the shape and the counts are the pilot's.
const crypto = require('node:crypto');
const P = [
  'הממשלה אישרה הבוקר תוכנית חדשה לשיפור התחבורה הציבורית בצפון הארץ. לפי התוכנית, יתווספו קווים חדשים בין הערים.',
  'שר התחבורה אמר כי "מדובר בצעד חשוב לתושבי הפריפריה" והוסיף שהעבודות יתחילו כבר בחודש הבא.',
  'ראשי הרשויות המקומיות בירכו על ההחלטה, אך ציינו כי נדרש תקציב נוסף כדי להשלים את כל הפרויקטים בזמן.',
];
function relayItem(i, { harvestedAt = '2026-11-26T03:34:19.000Z', body = true } = {}) {
  const url = 'https://www.c14.co.il/article/18099' + String(i).padStart(2, '0') + '/';
  const first = new Date(Date.parse(harvestedAt) - (10 - i) * 1000).toISOString();
  const article = body ? { title_he: 'כותרת בדיקה מספר ' + i, subtitle_he: 'תת כותרת לבדיקה ' + i, paragraphs: P, canonical_url: url,
    published_at: '2026-11-26T05:0' + (i % 10) + ':00+02:00', section: 'politics', content_type: 'news', paywalled: false, author: 'כתב בדיקה',
    images: [{ src: 'https://www.c14.co.il/wp-content/uploads/2026/11/photo-' + i + '.jpg', role: 'hero', caption_he: 'כיתוב', credit_he: 'צילום: בדיקה' }] } : null;
  return { url, feed_title: 'כותרת בדיקה מספר ' + i, feed_section: 'חדשות', feed_image: null, feed_pub_at: '2026-11-26T03:0' + (i % 10) + ':00.000Z', first_seen_at: first,
    published_at: article ? article.published_at : null, section: body ? 'politics' : 'news', content_type: 'news', title_he: 'כותרת בדיקה מספר ' + i,
    subtitle_he: article ? article.subtitle_he : null, lead_he: body ? P[0] : null, paywalled: 0, full_ok: body ? 1 : 0, chars: body ? P.join(' ').length : 0,
    images: body ? 1 : 0, reason: body ? null : 'NO_BODY', body: article };
}
function pilotBatch({ harvestedAt = '2026-11-26T03:34:19.000Z' } = {}) {
  const items = [];
  for (let i = 0; i < 10; i++) items.push(relayItem(i, { harvestedAt, body: i !== 5 }));
  const batch_id = crypto.createHash('sha256').update('c14:' + items.map(x => x.url + ':' + (x.body ? 1 : 0)).sort().join(',')).digest('hex');
  return { batch_id, outlet_id: 'c14', harvested_at: harvestedAt, items };
}
module.exports = { pilotBatch, relayItem };
