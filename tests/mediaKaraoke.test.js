// tests/mediaKaraoke.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { activeSegmentRange } = require("../public/js/studio-media-karaoke.js");
const K = require("../public/js/studio-media-karaoke.js");

test("activeSegmentRange: before first → null, ranges, tail to rowCount", () => {
  const e = [{ o: 0, t: 2 }, { o: 3, t: 10 }, { o: 4, t: 20 }];
  assert.equal(activeSegmentRange(e, 6, 0), null);
  assert.deepEqual(activeSegmentRange(e, 6, 2), { idx: 0, rowStart: 0, rowEnd: 3 });
  assert.deepEqual(activeSegmentRange(e, 6, 11.5), { idx: 1, rowStart: 3, rowEnd: 4 });
  assert.deepEqual(activeSegmentRange(e, 6, 999), { idx: 2, rowStart: 4, rowEnd: 6 });
  assert.equal(activeSegmentRange([], 6, 5), null);
  assert.equal(activeSegmentRange(null, 6, 5), null);
});

test("module exports only the pure part in Node (no DOM)", () => {
  // В Node модуль отдаёт лишь activeSegmentRange — DOM-часть не инициализируется.
  assert.equal(typeof K.activeSegmentRange, "function");
  assert.equal(typeof K.start, "undefined");
});

test("activeSegmentRange is unchanged by the adapter work", () => {
  const e = [{ o: 0, t: 2 }, { o: 3, t: 10 }];
  assert.deepEqual(K.activeSegmentRange(e, 5, 10), { idx: 1, rowStart: 3, rowEnd: 5 });
});

// ---- Browser-mode shim: W2-S5a's actual change lives entirely inside ensureRun()/start()/stop(),
// which only run when window/document exist (everything after the early Node-export return).
// We mirror the DOM-shim technique from tests/studioYtPlayer.test.js — fake globals in-process,
// no real browser needed — to pin the two things Task 6 is about: (1) an adapter source is used
// directly, never wrapped in a new Audio(), and (2) the module never calls destroy() on an
// adapter it did not create. The rAF polling loop / row painting itself stays genuinely
// DOM-dependent and is left to the live smoke + Task 12 owner acceptance (see task-6-report.md).

const MODULE_PATH = require.resolve("../public/js/studio-media-karaoke.js");

function makeFakeAudioEl() {
  var listeners = {};
  var el = {
    currentTime: 0,
    _paused: true,
    play: function () { this._paused = false; return Promise.resolve(); },
    pause: function () { this._paused = true; },
    addEventListener: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeEventListener: function (ev, fn) {
      var a = listeners[ev]; if (!a) return;
      var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    },
    _listeners: listeners,
  };
  Object.defineProperty(el, "paused", { get: function () { return this._paused; } });
  return el;
}

function makeFakeAdapter() {
  var el = makeFakeAudioEl();
  el.isYouTube = true;
  el.destroy = function () { this._destroyed = true; }; // must NEVER be called by the karaoke module
  return el;
}

function installBrowserMocks() {
  var createdAudios = [];
  var objectUrls = { created: [], revoked: [] };
  global.window = {
    requestAnimationFrame: function () { return 0; }, // rAF loop itself is out of scope here
    cancelAnimationFrame: function () {},
  };
  global.document = { getElementById: function () { return null; } };
  global.Blob = function Blob() {};
  global.URL = {
    createObjectURL: function (b) {
      var u = "blob:fake-" + objectUrls.created.length;
      objectUrls.created.push({ url: u, blob: b });
      return u;
    },
    revokeObjectURL: function (u) { objectUrls.revoked.push(u); },
  };
  global.Audio = function Audio(url) {
    var el = makeFakeAudioEl();
    el.src = url;
    createdAudios.push(el);
    return el;
  };
  return { createdAudios: createdAudios, objectUrls: objectUrls };
}

function uninstallBrowserMocks() {
  delete global.window;
  delete global.document;
  delete global.Blob;
  delete global.URL;
  delete global.Audio;
  delete require.cache[MODULE_PATH];
}

function freshModule() {
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH);
}

test("ensureRun: a Blob source builds its own Audio+object-URL; an adapter source is used AS the media element with url=null", () => {
  var mocks = installBrowserMocks();
  try {
    var mod = freshModule();

    var blob = new global.Blob();
    var runBlob = mod._ensureRun(blob, [{ o: 0, t: 0 }], 3);
    assert.equal(mocks.createdAudios.length, 1, "a Blob source must construct its own Audio element");
    assert.equal(runBlob.audioEl, mocks.createdAudios[0]);
    assert.ok(runBlob.url, "a Blob source must keep the object URL it created");
    assert.equal(mocks.objectUrls.created.length, 1);

    var adapter = makeFakeAdapter();
    var runAdapter = mod._ensureRun(adapter, [{ o: 0, t: 0 }], 3);
    assert.equal(runAdapter.audioEl, adapter, "an adapter source must be used directly, not wrapped");
    assert.equal(runAdapter.url, null, "an adapter has no blob URL to revoke — url must stay null");
    assert.equal(mocks.createdAudios.length, 1, "no extra Audio element must be created for an adapter source");
  } finally {
    uninstallBrowserMocks();
  }
});

test("stop(): revokes the object URL for a Blob-sourced run, and NEVER calls destroy() on an adapter — the module does not own an adapter's lifetime", () => {
  var mocks = installBrowserMocks();
  try {
    var mod = freshModule();

    var adapter = makeFakeAdapter();
    mod._ensureRun(adapter, [{ o: 0, t: 0 }], 3);
    mod.stop();
    assert.equal(adapter._destroyed, undefined,
      "karaoke must never destroy an adapter handed to it — the caller (Task 8) created it and owns teardown");
    assert.equal(mocks.objectUrls.revoked.length, 0, "nothing to revoke for an adapter run");

    var blob = new global.Blob();
    var runBlob = mod._ensureRun(blob, [{ o: 0, t: 0 }], 3);
    mod.stop();
    assert.deepEqual(mocks.objectUrls.revoked, [runBlob.url], "the module's own blob URL must be revoked on stop");
  } finally {
    uninstallBrowserMocks();
  }
});

test("start(): opts.media routes an adapter through the same path opts.blob routes a Blob through, and the entries-identity resume/restart contract is unaffected", async () => {
  installBrowserMocks();
  try {
    var mod = freshModule();
    var adapter = makeFakeAdapter();
    var entries = [{ o: 0, t: 0 }];

    await mod.start({ media: adapter, entries: entries, rowCount: 3 });
    assert.equal(mod.getAudioEl(), adapter);
    assert.equal(adapter.paused, false);

    // Same entries array by REFERENCE → resume onto the same run, no re-attach.
    await mod.start({ media: adapter, entries: entries, rowCount: 3 });
    assert.equal(mod.getAudioEl(), adapter, "resuming must not swap the media element");

    // A structurally-equal but distinct entries array must NOT resume — a fresh ensureRun() runs,
    // and it must not call destroy() on the adapter it is tearing down away from either.
    var blob = new global.Blob();
    await mod.start({ blob: blob, entries: entries.slice(), rowCount: 3 });
    assert.notEqual(mod.getAudioEl(), adapter, "a different entries array by identity must restart, not resume onto the old element");
    assert.equal(adapter._destroyed, undefined, "switching away from an adapter must still never destroy() it");
    mod.stop();
  } finally {
    uninstallBrowserMocks();
  }
});
