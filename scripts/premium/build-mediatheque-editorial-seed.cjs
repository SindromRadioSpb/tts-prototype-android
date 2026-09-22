'use strict';
// Deterministic editorial scaffold. Candidate videos are NOT public materials.
const fs = require('node:fs');
const evidence = require('../../docs/research/mediatheque-editorial/2026-09-22/youtube-source-evidence.json');
const playlists = require('../../docs/research/mediatheque-editorial/2026-09-22/playlist-evidence.json');
const names = {
  'kan-meeting-9':'פגישה עם רוני קובן · עונה 9', 'kan-meeting-10':'פגישה עם רוני קובן · עונה 10',
  'kan-enemies-5':'אויבים · עונה 5', 'kan-hidden':'בהסתורה', 'kan-kfar-aza':'כפר עזה — 95% גן עדן',
  'kan-archive':'מארכיון הטלוויזיה הישראלית', 'kan-questions':'סליחה על השאלה',
  'kan-connection':'תרגיל בחיבור', 'kan-question-answer':'שאלה תשובה', 'kan-day':'היום שלא נגמר',
  'kan-news-elections':'תקופת המנדט', 'kan-news-reports':'כתבות מהשטח', 'incoming-call':'שיחה נכנסת',
  'reshet-vort':'ווארט', 'interviews-sharon':'שיחות עם פרופ׳ משה שרון', 'crossroads':'הצומת',
  'gatekeeper':'שומר סף', 'c14-judea':'7.10 — גרסת יו״ש', 'c14-five-year':'תוכנית חומש',
  'c14-south':'הדרום הפרוע', 'personal-stories':'סיפורים אישיים',
};
const channels = [], collections = [], videos = [];
const channelIds = new Map();
for (const video of [...evidence.videos].sort((a,b)=>a.series.localeCompare(b.series)||a.order-b.order)) {
  if (video.status !== 'metadata_verified') continue;
  let categoryId = channelIds.get(video.channelUrl);
  if (!categoryId) {
    categoryId = 'yt_' + Buffer.from(video.channelUrl).toString('hex').slice(-70);
    channelIds.set(video.channelUrl, categoryId);
    channels.push({ id: categoryId, title: video.channel, url: video.channelUrl });
  }
  // A generic editorial series can contain different sources: split by actual channel.
  const id = 'series_' + video.series.replaceAll('-','_') + (video.series === 'personal-stories' ? '_' + categoryId.slice(-16) : '');
  if (!collections.some(c => c.id === id)) collections.push({ id, title: names[video.series], categoryId });
  videos.push({ videoId: video.videoId, collectionId: id, title: video.title });
}
for(const [series,title] of Object.entries({'kan-enemies-5':'אויבים','kan-hidden':'בהסתורה','c14-south':'הדרום הפרוע','c14-five-year':'תוכנית חומש'})){
  const entry=playlists.find(p=>p.title.includes(title)),collection=collections.find(c=>c.id==='series_'+series.replaceAll('-','_'));
  if(entry&&collection)collection.sourceUrl=entry.url;
}
const priority=['@KAN11','@KAN11NEWS','@C14news'];
channels.sort((a,b)=>{const rank=x=>{const i=priority.findIndex(p=>x.url.endsWith('/'+p));return i<0?99:i;};return rank(a)-rank(b);});
const seed = { schema:'mediatheque-editorial-seed-v1', date:'2026-09-22', channels, collections, videos };
fs.mkdirSync('public/data/mediatheque', { recursive:true });
fs.writeFileSync('public/data/mediatheque/editorial-seed-v1.json', JSON.stringify(seed,null,2)+'\n');
console.log(JSON.stringify({channels:channels.length,collections:collections.length,videos:videos.length}));
