'use strict';
// A valid news article (format v1 §5.1) and a pack builder for tests.
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const C = require('../../news/newsPackCore');

const SOURCE = 'במליאת הכנסת התקיים אמש דיון סוער שבסופו הצביעו חברי הכנסת בעד הצעת התקציב לשנה הבאה '
  + 'הצעת התקציב תעבור כעת לוועדת הכספים שתדון בה במשך השבועות הקרובים לפני הקריאה השנייה והשלישית';

function fixtureArticle(over = {}) {
  const base = {
    revision: 1,
    source: {
      outlet_id: 'ynet', url: 'https://www.ynet.co.il/news/article/abc123?utm_source=x',
      canonical_url: 'https://www.ynet.co.il/news/article/abc123', section_original_he: 'חדשות', section: 'politics',
      content_type: 'news', published_at: '2026-11-12T07:40:00+02:00', updated_at: null,
      retrieved_at: '2026-11-12T07:55:00+02:00', author: 'כתב', original_title_he: 'הכנסת אישרה בקריאה ראשונה את תקציב המדינה',
      paywalled: false, language: 'he',
    },
    image: { mode: 'source_link', url: 'https://ynet-pic1.yit.co.il/picserver5/a/photo.jpg', credit_he: 'צילום: א', alt_he: 'הכנסת', alt_ru: 'Кнессет' },
    learning: {
      title_he: 'התקציב עבר בקריאה ראשונה', title_ru: 'Бюджет прошёл первое чтение', summary_ru: 'Кнессет одобрил бюджет в первом чтении.',
      versions: [{ level: 'B1', rows: [
        { p: 1, he_plain: 'אתמול בלילה הכנסת אמרה כן לתקציב.', ru: 'Вчера ночью Кнессет сказал «да» бюджету.' },
        { p: 1, he_plain: 'זה היה רק השלב הראשון.', he_niqqud: 'זֶה הָיָה רַק הַשָּׁלָב הָרִאשׁוֹן.', translit: 'ze haya rak hashalav harishon.', translit_ru: 'зэ хая рак хашалав харишон.', ru: 'Это был только первый этап.',
          field_meta: { he_niqqud: { authority: 'provider', provider: 'dot' } } },
        { p: 2, he_plain: 'עכשיו ועדה תבדוק את הפרטים.', ru: 'Теперь комиссия проверит детали.' },
      ] }],
      story_key: '2026-11-12-budget-first-reading', tags: ['כנסת'], sensitive: { heavy: false, kinds: [] },
    },
    check: { source_shingles: C.shingles(SOURCE), source_word_count: SOURCE.split(/\s+/).length },
    prepared: { method: 'paraphrase', by: 'dot', prepared_at: '2026-11-12T07:58:00+02:00' },
  };
  return deepMerge(base, over);
}
function deepMerge(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && a && typeof a[k] === 'object' && a[k] && !Array.isArray(a[k]) ? deepMerge(a[k], v) : v;
  return out;
}
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

// articles: array of article objects, or {path, json|buffer, extra:{name:buffer}} for hostile cases.
function fixturePack(articles, { packId = crypto.randomUUID(), withdraw = [], manifestOver = {}, entries = [] } = {}) {
  const zip = new AdmZip(), list = [];
  articles.forEach((a, i) => {
    const dir = 'articles/' + (a.__dir || ('a-' + String(i + 1).padStart(4, '0')));
    const copy = { ...a }; delete copy.__dir; delete copy.__files;
    const buf = Buffer.from(JSON.stringify(copy));
    zip.addFile(dir + '/article.json', buf);
    for (const [name, data] of Object.entries(a.__files || {})) zip.addFile(dir + '/' + name, Buffer.from(data));
    list.push({ path: dir + '/article.json', sha256: sha256(buf) });
  });
  for (const e of entries) { zip.addFile(e.name, Buffer.from(e.data)); if (e.list) list.push({ path: e.name, sha256: e.sha256 || sha256(Buffer.from(e.data)) }); }
  const manifest = { schema: 'linguistpro-news-pack', schema_version: 1, pack_id: packId, created_at: '2026-11-12T08:00:00+02:00',
    producer: { name: 'dot' }, ui_languages: ['ru'], articles: list, withdraw, ...manifestOver };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
  return zip.toBuffer();
}
module.exports = { fixtureArticle, fixturePack, SOURCE, sha256, deepMerge };
