"use strict";
// O-017: the release-lock tests pinned literal versions (3.11.610, ?v=576 …) and went red after
// every release. Their real contract is an invariant, checked here against the current files:
//   • Studio, Room and the service worker ship one version;
//   • a versioned asset is requested by a shell at exactly the URL the SW precaches and the
//     server's shell-integrity manifest keys (a stale controlling SW must never serve old bytes).
const assert = require("node:assert/strict");

function lockstepVersion({ studio, room, sw }) {
  const app = studio.match(/window\.APP_VERSION\s*=\s*"([^"]+)"/);
  const footer = room.match(/id="roomFooterVersion"[^>]*>v([^<]+)</);
  const worker = sw.match(/const CACHE_VERSION\s*=\s*"v([^"]+)"/);
  assert.ok(app && footer && worker, "all public version surfaces must exist");
  assert.equal(footer[1], app[1], "Room footer version = Studio APP_VERSION");
  assert.equal(worker[1], app[1], "service worker CACHE_VERSION = Studio APP_VERSION");
  return app[1];
}

// The exact versioned URL a shell requests for `path` (e.g. "/js/library-ui.js").
function requestedUrl(shell, path, label) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const all = [...shell.matchAll(new RegExp(escaped + "\\?v=([A-Za-z0-9._-]+)", "g"))].map((m) => m[1]);
  assert.ok(all.length > 0, `${label || "shell"} must request ${path}?v=…`);
  assert.equal(new Set(all).size, 1, `${label || "shell"} requests ${path} with one version only`);
  return path + "?v=" + all[0];
}

function assertPrecachedExactly(url, { sw, server }) {
  assert.ok(sw.includes(JSON.stringify(url)), `${url} must be offline-precached exactly`);
  if (server) assert.ok(server.includes(JSON.stringify(url)), `${url} must use the identical integrity-manifest key`);
}

module.exports = { lockstepVersion, requestedUrl, assertPrecachedExactly };
