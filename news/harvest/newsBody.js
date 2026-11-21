'use strict';
// The full text of a slice article (findability spec §2 п.5): plain JSON for the first 3 days (dot works on
// it), then gzip in data_gz until day 45. Every reader goes through bodyOf, never data_json directly.
const zlib = require('node:zlib');

function bodyOf(row) {
  if (!row) return null;
  try {
    if (row.data_json) return JSON.parse(row.data_json);
    if (row.data_gz) return JSON.parse(zlib.gunzipSync(Buffer.from(row.data_gz)).toString('utf8'));
  } catch (_) { /* a broken body counts as none */ }
  return null;
}
const hasBody = row => !!(row && (row.data_json || row.data_gz));
const packBody = article => zlib.gzipSync(Buffer.from(typeof article === 'string' ? article : JSON.stringify(article), 'utf8'), { level: 9 });

module.exports = { bodyOf, hasBody, packBody };
