// Read-only public YouTube oEmbed evidence for owner-supplied material links.
// No video downloads, credentials, provider calls or publication writes.
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const videos = {
  'kan-meeting-9': ['sJd84-Cg2OI','bYkOcZDBncw','80UiN8kj6z0','aKWUlRjulWs'],
  'kan-meeting-10': ['HJ_67BZMZkg','eLKIuifDClw','wSrwBrWHxH8'],
  'kan-enemies-5': ['sYd4zgR7f6w'],
  'kan-hidden': ['qaZ2zkI_X-U','lfecFGSQLaQ','cQcvn1qxZe0','_n0a5FuiV2g','2FyrBWBWSaI','7lM4l5t41us','nyoVFi9O7as','oVy7-aZ-G_Y','W15rdGHTVYk'],
  'kan-kfar-aza': ['VBNxvU5hw0w'],
  'kan-archive': ['VIAVBDHfdhc'],
  'kan-questions': ['PngchpnAS5E','eLYgTqNFn-s','xjYYXmtelnk'],
  'kan-connection': ['6wwokv4ODjo','3DyWmEZj5ww'],
  'kan-question-answer': ['_QBdko9mDsA'],
  'kan-day': ['y5yyuy19TL8'],
  'kan-news-elections': ['rVW2Sus6Bko','8WGXmkrCSOk','edUpnLjYc54','cPooKT5rFxc','YVa0CsON4UM','0h7uhp2l-lo'],
  'kan-news-reports': ['sZyF-g06PmQ','MlX2x9QJIMk'],
  'incoming-call': ['njtNjn4ya2U','dH_OkB7Uym4'],
  'reshet-vort': ['6151nkvX3Ic'],
  'interviews-sharon': ['IWy0iHFdw80','7qh3Q-FuwQE','Az6l5mv21JQ'],
  'crossroads': ['4N_-A5VHp2I','YqcQ4raoOLM','V2hPVipyWN0'],
  'gatekeeper': ['tKdDjbOkBmw','NE2DjMDQeYs'],
  'c14-judea': ['hJvH3L4VOP8','FJ8n3TRrvS4','SFGeAigUqpQ'],
  'c14-five-year': ['82JY5QIeEwM','v6PVBbZrjUk','yAeNOD8Vfzc'],
  'c14-south': ['KdQYwbVZW-Q','lmVm-eqQtGc'],
  'personal-stories': ['oiimWM0j7dQ','wJgtBgZvQnU'],
};
async function main() {
  const pending = Object.entries(videos).flatMap(([series, ids]) => ids.map((videoId, order) => ({ series, videoId, order })));
  const results = [];
  async function worker() {
    for (;;) {
      const item = pending.shift(); if (!item) return;
      const url = 'https://www.youtube.com/watch?v=' + item.videoId;
      try {
        const response = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('HTTP_' + response.status);
        const result = await response.json();
        results.push({ ...item, url, title: result.title, channel: result.author_name, channelUrl: result.author_url, status: 'metadata_verified', checkedAt: new Date().toISOString() });
      } catch (error) { results.push({ ...item, url, status: 'unverified', error: error.message }); }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  results.sort((a,b) => a.series.localeCompare(b.series) || a.videoId.localeCompare(b.videoId));
  const dir = path.resolve('docs/research/mediatheque-editorial/2026-09-22');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'youtube-source-evidence.json'), JSON.stringify({ source: 'Owner Telegram links, user examples, and selected public YouTube links; oEmbed verifies metadata, not playback, archive validity or rights.', videos: results }, null, 2) + '\n');
  console.log(JSON.stringify({ total: results.length, verified: results.filter(x=>x.status==='metadata_verified').length, channels: [...new Set(results.map(x=>x.channel).filter(Boolean))] }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
