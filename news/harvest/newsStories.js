'use strict';
// One event, many outlets (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §17): groups the day's
// articles into stories by the words of their title, subtitle and first paragraph, then picks the
// day's main stories — the more outlets write about an event, the more it matters — with a quota per
// rubric, and one article per story for the full study treatment.

const STOP = new Set(('של את על עם לא כי גם זה זו זאת הוא היא הם הן אני אנחנו אתה את יש אין היה היתה היו יהיה '
  + 'אבל או אם כל כך רק עוד כבר מה מי איך למה כדי אחרי לפני בין תחת מול נגד אל עד יותר פחות מאוד אחד אחת שני שתי '
  + 'שלו שלה שלהם להם לו לה בו בה הזה הזאת האלה אלה כמו לפי בגלל אך ועוד וגם מאז היום אתמול מחר הערב הלילה הבוקר '
  + 'שבת ראשון שני שלישי רביעי חמישי שישי בשבת ביום יום שנה שנים חודש דקות שעות אמר אמרה אמרו לדבריו לדבריה נמסר '
  + 'דיווח דיווחו פרסם פרסמה תיעוד צפו וידאו ynet וואלה מעריב הארץ mako חדשות כתבה עכשיו').split(/\s+/));
const PREFIXES = /^(ו|ה|ב|ל|מ|ש|כ|וה|וב|ול|ומ|וש|שה|שב|של|מה|כש|לה|בה|מש)(?=[א-ת]{3,})/;
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

function tokens(text) {
  const out = new Set();
  const words = String(text || '').normalize('NFC').replace(/[֑-ׇ]/g, '').replace(/[״"׳'`]/g, '')
    .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const raw of words) {
    const w = raw.toLowerCase().replace(/[ךםןףץ]/g, ch => FINALS[ch]);
    if (/^\d+$/.test(w)) { if (w.length >= 2) out.add(w); continue; }
    if (w.length < 3 || STOP.has(raw)) continue;
    const bare = w.replace(PREFIXES, '');
    if (bare.length >= 3 && !STOP.has(bare)) out.add(bare);
  }
  return out;
}

// items: [{ id, outlet_id, title, text, at }] → Map id → story id (the id of the story's first item).
// Greedy, newest first: an item joins the most similar story (weighted overlap of rare words with the
// story's words) when the score passes the threshold; otherwise it starts a new story.
// `seeds` — stories kept from earlier editions ({ id, words: Map, mass }): they are joined by the same rule
// and keep their id. The returned Map also carries `.stories` ([{ id, words, mass, members, seed }]).
function clusterStories(items, { threshold = 0.3, titleWeight = 2, seeds = [] } = {}) {
  const docs = items.map(it => {
    const t = tokens(it.title), all = tokens([it.title, it.text].join(' '));
    return { it, t, all };
  });
  const df = new Map();
  for (const d of docs) for (const w of d.all) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length || 1, idf = w => Math.log(1 + N / (df.get(w) || 1));
  const weight = d => { const m = new Map(); for (const w of d.all) m.set(w, idf(w) * (d.t.has(w) ? titleWeight : 1)); return m; };
  const stories = seeds.map(s => ({ id: s.id, members: [], words: new Map(s.words), mass: s.mass || 1, seed: true })), of = new Map();
  for (const d of docs.slice().sort((a, b) => (b.it.at || 0) - (a.it.at || 0))) {
    const v = weight(d), mass = [...v.values()].reduce((a, b) => a + b, 0) || 1;
    let best = null, bestScore = 0;
    for (const s of stories) {
      let shared = 0, rare = 0;
      for (const [w, x] of v) if (s.words.has(w)) { shared += Math.min(x, s.words.get(w)); if (df.get(w) <= Math.max(2, N * 0.02)) rare++; }
      const score = shared / Math.min(mass, s.mass);
      if (score > bestScore && rare >= 1) { best = s; bestScore = score; }
    }
    if (best && bestScore >= threshold) {
      best.members.push(d.it);
      for (const [w, x] of v) best.words.set(w, Math.max(best.words.get(w) || 0, x));
      best.mass = Math.max(best.mass, mass);
      of.set(d.it.id, best.id);
    } else {
      const s = { id: d.it.id, members: [d.it], words: new Map(v), mass };
      stories.push(s); of.set(d.it.id, s.id);
    }
  }
  Object.defineProperty(of, 'stories', { value: stories, enumerable: false });
  return of;
}

// Outlets often file everything under a generic «חדשות» (or sport under «בעולם»): when the rubric says
// nothing specific, the words decide. Each rubric counts its words — a title word twice, a first-
// paragraph word once — and the strongest one wins; incidents and crime are «society».
const KEYWORDS = {
  sport: ['כדורגל', 'כדורסל', 'נבחרת', 'ליגת', 'ליגה', 'אליפות', 'יורובאסקט', 'מונדיאל', 'NBA', 'יורוליג', 'שערים', 'מאמן', 'שחקן', 'שחקני', 'מכבי', 'הפועל',
    'בית״ר', 'טניס', 'אולימפ', 'מדליי', 'גרנד פרי', 'קלאסיקו', 'שער ', 'ניצחון', 'הפסד', 'משחק', 'רבע'],
  security: ['צה״ל', 'צה"ל', 'חמאס', 'חיזבאללה', 'חות׳ים', 'מחבל', 'פיגוע', 'טיל', 'רקטות', 'כטב״מ', 'חיסול', 'חוסל', 'לחימה', 'מלחמ', 'חטיבת', 'שב״כ', 'שב"כ',
    'מערכת הביטחון', 'חטופ', 'עזה', 'רפיח', 'לבנון', 'איראן', 'גרעין', 'צבאי', 'הגנה אווירית', 'תקיפת צה'],
  politics: ['כנסת', 'ח״כ', 'ח"כ', 'נתניהו', 'איזנקוט', 'ממשלה', 'ממשלת', 'קואליצי', 'אופוזיצי', 'בחירות', 'ליכוד', 'יש עתיד', 'ש״ס', 'יהדות התורה', 'השר ',
    'רה״מ', 'מו״מ', 'הצבעה', 'בג״ץ', 'נשיא המדינה', 'מפלג', 'הרשימה המשותפת', 'רע״ם'],
  economy: ['מחירי', 'שקל', 'דולר', 'בורסה', 'מניית', 'מניות', 'ריבית', 'אינפלציה', 'ביטקוין', 'קריפטו', 'משכנתא', 'דירות', 'נדל״ן', 'משכורת', 'מסים', 'תקציב',
    'בנק ישראל', 'יוקר המחיה', 'הייטק', 'סטארט־אפ', 'שכר הדירה', 'צרכנ'],
  world: ['טראמפ', 'ארה״ב', 'ארצות הברית', 'הבית הלבן', 'רוסיה', 'פוטין', 'אוקראינה', 'סין', 'אירופ', 'בריטניה', 'צרפת', 'גרמניה', 'ספרד', 'האו״ם', 'נאט״ו', 'הודו'],
  news: ['רצח', 'נרצח', 'נעצר', 'חשוד', 'חשודים', 'משטרה', 'המשטרה', 'תאונ', 'שריפ', 'נהרג', 'נהרגה', 'טבע', 'נפצע', 'מד״א', 'בית משפט', 'כתב אישום', 'אלימות',
    'תקיפה', 'הותקפ', 'שוד', 'נשדד', 'התחזית', 'מזג האוויר', 'גשם', 'טמפרטורות'],
};
const GENERIC = new Set(['news', 'world', 'local', 'other']);
function refineSection(section, title, lead) {
  if (!GENERIC.has(section || 'news')) return section;
  const score = {};
  for (const [id, words] of Object.entries(KEYWORDS)) {
    let n = 0;
    for (const w of words) { if (String(title || '').includes(w)) n += 2; if (String(lead || '').includes(w)) n += 1; }
    if (n) score[id] = n;
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (!best) return section || 'news';
  // A story the outlet itself filed under «world» stays world unless it is clearly sport or security.
  if (section === 'world' && !['sport', 'security'].includes(best[0])) return 'world';
  return best[0];
}

// Rubric groups for the quota. Sport and culture share a group; «news» is society, law and incidents.
const GROUPS = { politics: 'politics', security: 'security', economy: 'economy', consumer: 'economy', world: 'world',
  news: 'society', local: 'society', health: 'society', science: 'society', tech: 'society', culture: 'culture', sport: 'culture', lifestyle: 'culture', other: 'society', opinion: 'opinion' };
const QUOTA = { politics: 5, security: 4, society: 4, economy: 3, world: 3, culture: 2, opinion: 2 };

// stories: [{ id, members:[{ outlet_id, section, at, full_ok, paywalled, images, chars }] }]
// → [{ story, pick }] the main stories, best first, at most `total`.
function selectStories(stories, { total = 22, quota = QUOTA } = {}) {
  const groupOf = s => {
    const votes = {};
    for (const m of s.members) votes[GROUPS[m.section] || 'society'] = (votes[GROUPS[m.section] || 'society'] || 0) + 1;
    return Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  };
  const latest = Math.max(0, ...stories.flatMap(s => s.members.map(m => m.at || 0)));
  const scored = stories.filter(s => s.members.some(m => m.full_ok)).map(s => {
    const outlets = new Set(s.members.map(m => m.outlet_id)).size;
    const newest = Math.max(...s.members.map(m => m.at || 0));
    const fresh = latest ? Math.max(0, 1 - (latest - newest) / (36 * 3600e3)) : 0;
    return { story: s, group: groupOf(s), outlets, score: outlets * 3 + Math.min(s.members.length, 6) + fresh * 2 };
  }).sort((a, b) => b.score - a.score);
  const chosen = [], used = {}, perOutlet = {};
  const pickOf = s => s.members.filter(m => m.full_ok).sort((a, b) =>
    (a.paywalled - b.paywalled) || ((perOutlet[a.outlet_id] || 0) - (perOutlet[b.outlet_id] || 0))
    || (Math.min(b.images, 3) - Math.min(a.images, 3)) || (Math.min(b.chars, 6000) - Math.min(a.chars, 6000)))[0];
  const take = x => { const pick = pickOf(x.story); chosen.push({ story: x.story, group: x.group, outlets: x.outlets, pick }); used[x.group] = (used[x.group] || 0) + 1; perOutlet[pick.outlet_id] = (perOutlet[pick.outlet_id] || 0) + 1; };
  for (const x of scored) if (chosen.length < total && (used[x.group] || 0) < (quota[x.group] || 0)) take(x);
  for (const x of scored) if (chosen.length < total && !chosen.some(c => c.story === x.story)) take(x);
  return chosen;
}

module.exports = { tokens, clusterStories, selectStories, refineSection, GROUPS, QUOTA };
