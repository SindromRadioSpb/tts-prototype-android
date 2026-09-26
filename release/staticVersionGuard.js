"use strict";
// O-019: a build serves a versioned static URL (…?v=N) as cacheable only for the N it shipped.
// During a rolling deploy an old container can receive the NEW ?v= URLs and would otherwise hand
// out old bytes that browsers keep for a day under the new key. The shipped versions are read
// from the service worker's precache list — the same list the shell integrity check uses.

function parsePrecacheVersions(swSource) {
  const out = new Map();
  const list = String(swSource || "").match(/const\s+PRECACHE_URLS\s*=\s*\[([\s\S]*?)\];/);
  if (!list) return out;
  const re = /"(\/[^"?#]+)\?v=([^"&#]+)"/g;
  let m;
  while ((m = re.exec(list[1]))) out.set(m[1], m[2]);
  return out;
}

function cacheBustMismatch(shipped, pathname, v) {
  if (v === undefined || v === null || !shipped || !pathname) return false;
  if (!shipped.has(pathname)) return false;
  return shipped.get(pathname) !== String(v);
}

module.exports = { parsePrecacheVersions, cacheBustMismatch };
