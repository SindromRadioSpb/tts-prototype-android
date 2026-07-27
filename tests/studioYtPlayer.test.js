"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

const MODULE_PATH = require.resolve("../public/js/studio-yt-player.js");
const YT = require(MODULE_PATH);

test("parseVideoId: watch, youtu.be, embed, shorts, with extra params", () => {
  assert.equal(YT.parseVideoId("https://www.youtube.com/watch?v=iG9CE55wbtY"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://www.youtube.com/watch?v=iG9CE55wbtY&t=42s"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://youtu.be/iG9CE55wbtY?si=abc"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://www.youtube.com/embed/iG9CE55wbtY"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://www.youtube.com/shorts/iG9CE55wbtY"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://m.youtube.com/watch?v=iG9CE55wbtY"), "iG9CE55wbtY");
});

test("parseVideoId: rejects non-YouTube and malformed ids", () => {
  assert.equal(YT.parseVideoId("https://vimeo.com/12345"), null);
  assert.equal(YT.parseVideoId("https://example.com/watch?v=iG9CE55wbtY"), null);
  assert.equal(YT.parseVideoId("https://www.youtube.com/watch?v=short"), null);
  assert.equal(YT.parseVideoId("не ссылка"), null);
  assert.equal(YT.parseVideoId(""), null);
  assert.equal(YT.parseVideoId(null), null);
});

// Review finding (MINOR): the /live/ path branch and the music.youtube.com host branch were
// implemented but had no test coverage.
test("parseVideoId: /live/ path and music.youtube.com host (review finding, MINOR)", () => {
  assert.equal(YT.parseVideoId("https://www.youtube.com/live/iG9CE55wbtY"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://music.youtube.com/watch?v=iG9CE55wbtY"), "iG9CE55wbtY");
});

test("capability() in Node reports unsupported without throwing", () => {
  const c = YT.capability();
  assert.equal(typeof c.supported, "boolean");
  assert.equal(c.supported, false);
  assert.equal(c.reason, "no-credentialless");
});

// ---- Browser-mode fixes below: `apiPromise` reset-on-rejection and the `paused`/BUFFERING
// mapping both live in the branch of the module that only runs when window/document exist
// (everything after the early Node-export return). We shim a minimal DOM + YT IFrame API here
// so that branch runs for real, in-process, without a browser — no change to the module's
// dual-export shape, its COEP/COOP posture, or its `credentialless` attribute handling; this is
// a test-only technique using Node's `global` (which — like a browser's `window` — exposes its
// own properties as bare identifiers to code that runs after they are set).

function makeFakeEl(tag) {
  return {
    tagName: tag,
    style: {},
    _attrs: {},
    parentNode: null,
    children: [],
    setAttribute: function (k, v) { this._attrs[k] = v; },
    appendChild: function (c) { c.parentNode = this; this.children.push(c); },
    removeChild: function (c) {
      var i = this.children.indexOf(c);
      if (i < 0) throw new Error("removeChild: not a child");
      this.children.splice(i, 1);
      c.parentNode = null;
    },
  };
}

function installBrowserMocks() {
  var scripts = [];
  global.window = {};
  global.location = { origin: "http://localhost" };
  global.HTMLIFrameElement = function HTMLIFrameElement() {};
  global.HTMLIFrameElement.prototype.credentialless = "";
  global.document = {
    head: makeFakeEl("head"),
    createElement: function (tag) {
      var el = makeFakeEl(tag);
      if (tag === "script") scripts.push(el);
      return el;
    },
  };
  return { scripts: scripts };
}

function uninstallBrowserMocks() {
  delete global.window;
  delete global.document;
  delete global.HTMLIFrameElement;
  delete global.location;
  delete require.cache[MODULE_PATH];
}

function freshModule() {
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH);
}

// Minimal fake YT.Player: resolves onReady asynchronously (process.nextTick), matching the real
// IFrame API (which never fires onReady synchronously inside the constructor) — required so
// `adapter` is already assigned by the module before onReady runs.
function FakePlayer(iframeOrId, opts) {
  this._opts = opts;
  this._state = -1; // UNSTARTED
  this._time = 0;
  FakePlayer.instances.push(this);
  process.nextTick(function (self) {
    if (self._opts && self._opts.events && typeof self._opts.events.onReady === "function") {
      self._opts.events.onReady();
    }
  }, this);
}
FakePlayer.instances = [];
FakePlayer.prototype.getCurrentTime = function () { return this._time; };
FakePlayer.prototype.seekTo = function (t) { this._time = t; };
FakePlayer.prototype.getPlayerState = function () { return this._state; };
FakePlayer.prototype.getOption = function () { return []; };
FakePlayer.prototype.playVideo = function () { this._state = 1; };
FakePlayer.prototype.pauseVideo = function () { this._state = 2; };
FakePlayer.prototype.destroy = function () { this._destroyed = true; };

test("loadApi(): a failed script load clears the cached promise so a later create() retries (review finding: apiPromise never reset on rejection)", async () => {
  var mocks = installBrowserMocks();
  try {
    var mod = freshModule();
    var mountEl = makeFakeEl("div");

    var p1 = mod.create(mountEl, "iG9CE55wbtY");
    assert.equal(mocks.scripts.length, 1, "first create() must trigger one iframe_api script load attempt");
    mocks.scripts[0].onerror(); // simulate the script failing to load (network/CSP/offline)
    await assert.rejects(p1, /YT_API_FAILED/);

    var p2 = mod.create(mountEl, "iG9CE55wbtY");
    // Without the fix, apiPromise stays the stale REJECTED promise and this second create()
    // re-rejects from that same cache without ever trying to load the script again — scripts
    // stays at length 1 and YouTube playback is permanently disabled for the page session.
    assert.equal(mocks.scripts.length, 2, "a later create() must retry loading the API, not replay the stale rejection");
    mocks.scripts[1].onerror();
    await assert.rejects(p2, /YT_API_FAILED/);
  } finally {
    uninstallBrowserMocks();
  }
});

test("adapter.paused: BUFFERING reads as NOT paused, matching <audio> semantics through a stall (review finding: paused lied during buffering)", async () => {
  installBrowserMocks();
  FakePlayer.instances.length = 0;
  global.window.YT = { Player: FakePlayer };
  try {
    var mod = freshModule();
    var mountEl = makeFakeEl("div");
    var adapter = await mod.create(mountEl, "iG9CE55wbtY");
    assert.equal(FakePlayer.instances.length, 1);
    var player = FakePlayer.instances[0];

    player._state = -1; // UNSTARTED
    assert.equal(adapter.paused, true);
    player._state = 1; // PLAYING
    assert.equal(adapter.paused, false);
    player._state = 3; // BUFFERING — studio-media-karaoke.js isActive() reads this getter;
    assert.equal(adapter.paused, false, "a mid-playback stall must not read as stopped, same as a native <audio> element");
    player._state = 2; // PAUSED
    assert.equal(adapter.paused, true);
    player._state = 0; // ENDED
    assert.equal(adapter.paused, true);
    player._state = 5; // CUED
    assert.equal(adapter.paused, true);
  } finally {
    uninstallBrowserMocks();
  }
});
