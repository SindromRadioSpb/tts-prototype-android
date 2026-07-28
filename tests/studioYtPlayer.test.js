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

// loadApi() returns an already-resolved Promise.resolve() when window.YT.Player is preset, so
// create()'s iframe/player construction runs inside a deferred .then() callback (a microtask),
// not synchronously within the create() call itself. Tests that need to reach into the player
// (fire onError, advance a mocked timer) BEFORE it settles must let that microtask run first —
// setImmediate (a macrotask) guarantees every pending microtask has drained, regardless of how
// many .then() hops are involved.
function flushMicrotasks() {
  return new Promise(function (resolve) { setImmediate(resolve); });
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

// Re-review round: findings 1 (onError leak) and 4 (ready-timeout orphaned player) were
// deferred as "DOM-dependent, not unit-testable" — disputed on re-review since the DOM shim
// (and a player with a `_destroyed` flag) built for the two tests above make both cheap to
// reach directly, no real browser or wall-clock wait required.

// Never calls onReady — simulates a player construction that never becomes ready. Reused by
// BOTH tests below: it's the realistic shape for finding 1 (onError fires, onReady never does —
// embed-disabled/region-blocked/deleted-video errors are not preceded by a ready callback in the
// real IFrame API either) and for finding 4 (the 20s ready-timeout exists exactly to catch a
// construction that hangs like this). Deliberately does NOT auto-schedule onReady the way
// FakePlayer (above) does for the paused/BUFFERING test — scheduling it via process.nextTick
// would race the test's own attempt to intercept the player before it settles, since Node drains
// the nextTick queue before resuming any later microtask/macrotask continuation.
function HangingPlayer(iframeOrId, opts) {
  this._opts = opts;
  HangingPlayer.instances.push(this);
}
HangingPlayer.instances = [];
HangingPlayer.prototype.getCurrentTime = function () { return 0; };
HangingPlayer.prototype.seekTo = function () {};
HangingPlayer.prototype.getPlayerState = function () { return -1; };
HangingPlayer.prototype.getOption = function () { return []; };
HangingPlayer.prototype.playVideo = function () {};
HangingPlayer.prototype.pauseVideo = function () {};
HangingPlayer.prototype.destroy = function () { this._destroyed = true; };

// Models the REAL YouTube IFrame API's async gap: playVideo()/pauseVideo() are fire-and-forget
// postMessage calls that do NOT update getPlayerState() by themselves — only a later
// onStateChange postMessage (simulated here via _fireState()) does. FakePlayer above updates
// _state synchronously inside playVideo()/pauseVideo(), which is why it could never have caught
// the W2-S5a Task 10 live-smoke finding (isActiveAfterStart/pausedAfterStop false, 9/9 browsers):
// a fake that is more optimistic than the real API hides exactly the bug the live smoke found.
function LaggyPlayer(iframeOrId, opts) {
  this._opts = opts;
  this._state = -1; // UNSTARTED
  this._time = 0;
  LaggyPlayer.instances.push(this);
  process.nextTick(function (self) {
    if (self._opts && self._opts.events && typeof self._opts.events.onReady === "function") {
      self._opts.events.onReady();
    }
  }, this);
}
LaggyPlayer.instances = [];
LaggyPlayer.prototype.getCurrentTime = function () { return this._time; };
LaggyPlayer.prototype.seekTo = function (t) { this._time = t; };
LaggyPlayer.prototype.getPlayerState = function () { return this._state; };
LaggyPlayer.prototype.getOption = function () { return []; };
LaggyPlayer.prototype.playVideo = function () { /* real API: no synchronous state change */ };
LaggyPlayer.prototype.pauseVideo = function () { /* real API: no synchronous state change */ };
LaggyPlayer.prototype.destroy = function () { this._destroyed = true; };
// Test-only: simulate the async onStateChange postMessage actually arriving.
LaggyPlayer.prototype._fireState = function (st) {
  this._state = st;
  if (this._opts && this._opts.events && typeof this._opts.events.onStateChange === "function") {
    this._opts.events.onStateChange({ data: st });
  }
};

test("adapter.paused: synchronous intent right after play()/pause(), before YouTube's async onStateChange confirms it (W2-S5a Task 10 live-smoke finding, fixed here)", async () => {
  installBrowserMocks();
  LaggyPlayer.instances.length = 0;
  global.window.YT = { Player: LaggyPlayer };
  try {
    var mod = freshModule();
    var mountEl = makeFakeEl("div");
    var adapter = await mod.create(mountEl, "iG9CE55wbtY");
    assert.equal(LaggyPlayer.instances.length, 1);
    var player = LaggyPlayer.instances[0];

    // No intent yet → falls back to the real (UNSTARTED) state → paused.
    assert.equal(adapter.paused, true, "starts paused: no intent, UNSTARTED state");

    // play() must flip `paused` to false SYNCHRONOUSLY — before the async onStateChange arrives.
    adapter.play();
    assert.equal(player._state, -1, "sanity: the fake's underlying state has NOT moved yet — this is exactly the race the live smoke caught");
    assert.equal(adapter.paused, false, "paused must read false immediately after play(), before the async state event");

    // The real onStateChange(PLAYING) arrives later and must be consistent with the intent, not fight it.
    player._fireState(1);
    assert.equal(adapter.paused, false, "still false once the real PLAYING event confirms it");

    // pause() must flip `paused` to true SYNCHRONOUSLY too, before the async event.
    adapter.pause();
    assert.equal(player._state, 1, "sanity: underlying state still shows PLAYING — intent must override it");
    assert.equal(adapter.paused, true, "paused must read true immediately after pause(), before the async state event");

    player._fireState(2);
    assert.equal(adapter.paused, true, "still true once the real PAUSED event arrives");

    // Trap: a genuine externally-driven change must supersede a stale intent, not be masked by it —
    // e.g. the caller asks to play, but the video actually ends before that ever happens.
    adapter.play();
    assert.equal(adapter.paused, false, "intent says playing");
    player._fireState(0); // ENDED, arriving while a stale "play" intent is still pending
    assert.equal(adapter.paused, true, "a real ENDED event must win over a stale play() intent");

    // BUFFERING mapping is unchanged once intent has been retired by a real event.
    player._fireState(3);
    assert.equal(adapter.paused, false, "BUFFERING still reads not-paused after intent has been superseded");
    player._fireState(2);
    assert.equal(adapter.paused, true);
  } finally {
    uninstallBrowserMocks();
  }
});

// Whole-branch review 2026-07-28, third round: studio-import.js's caption hint was missing a
// video that reached BUFFERING and stayed there (no 'play' ever fires from state 3) — the fix
// needed the adapter to forward EVERY YT.PlayerState transition, not only the three that already
// had named events. These tests prove "statechange" fires for states with no named event
// (BUFFERING/CUED/UNSTARTED) AND that the pre-existing named events are completely unaffected —
// studio-media-karaoke.js depends on play/pause/ended/error exactly as they were.
test("adapter 'statechange': fires for EVERY YT.PlayerState transition, including ones with no named event (BUFFERING/CUED/UNSTARTED)", async () => {
  installBrowserMocks();
  LaggyPlayer.instances.length = 0;
  global.window.YT = { Player: LaggyPlayer };
  try {
    var mod = freshModule();
    var mountEl = makeFakeEl("div");
    var adapter = await mod.create(mountEl, "iG9CE55wbtY");
    var player = LaggyPlayer.instances[0];

    var seen = [];
    adapter.addEventListener("statechange", function (state) { seen.push(state); });

    player._fireState(3); // BUFFERING — no named event exists for this state
    player._fireState(5); // CUED — no named event exists for this state either
    player._fireState(-1); // UNSTARTED
    player._fireState(1); // PLAYING — also has the named "play" event
    player._fireState(2); // PAUSED — also has "pause"
    player._fireState(0); // ENDED — also has "ended"

    assert.deepEqual(seen, [3, 5, -1, 1, 2, 0], "statechange must fire for every transition, carrying the raw state, in order");
  } finally {
    uninstallBrowserMocks();
  }
});

test("adapter 'statechange' is purely additive: play/pause/ended still fire exactly as before, for the SAME transitions", async () => {
  installBrowserMocks();
  LaggyPlayer.instances.length = 0;
  global.window.YT = { Player: LaggyPlayer };
  try {
    var mod = freshModule();
    var mountEl = makeFakeEl("div");
    var adapter = await mod.create(mountEl, "iG9CE55wbtY");
    var player = LaggyPlayer.instances[0];

    var named = [];
    var stateSeen = [];
    ["play", "pause", "ended"].forEach(function (ev) {
      adapter.addEventListener(ev, function () { named.push(ev); });
    });
    adapter.addEventListener("statechange", function (s) { stateSeen.push(s); });

    player._fireState(1); // PLAYING
    player._fireState(3); // BUFFERING — no named event, statechange only
    player._fireState(2); // PAUSED
    player._fireState(0); // ENDED

    assert.deepEqual(named, ["play", "pause", "ended"], "named events fire only for their own states, unchanged, in order");
    assert.deepEqual(stateSeen, [1, 3, 2, 0], "statechange fires alongside every one of them PLUS the state with no named event");
  } finally {
    uninstallBrowserMocks();
  }
});

test("adapter.destroy() clears 'statechange' listeners too (same generic Object.keys(listeners) sweep as the other four)", async () => {
  installBrowserMocks();
  LaggyPlayer.instances.length = 0;
  global.window.YT = { Player: LaggyPlayer };
  try {
    var mod = freshModule();
    var mountEl = makeFakeEl("div");
    var adapter = await mod.create(mountEl, "iG9CE55wbtY");
    var player = LaggyPlayer.instances[0];
    var calls = 0;
    adapter.addEventListener("statechange", function () { calls++; });
    player._fireState(3);
    assert.equal(calls, 1);
    adapter.destroy();
    // Firing after destroy() would normally still reach the (real) player's onStateChange in the
    // browser, but here we call the adapter's own emit path directly via a fresh state to prove
    // the listener array was actually cleared, not just that the player stopped emitting.
    player._fireState(1);
    assert.equal(calls, 1, "listener must not fire after destroy() — Object.keys(listeners) sweep covers statechange too");
  } finally {
    uninstallBrowserMocks();
  }
});

test("onError before ready: destroys the YT.Player and detaches the iframe (review finding 1 — was leaking on embed-disabled/region-blocked/deleted video)", async () => {
  installBrowserMocks();
  HangingPlayer.instances.length = 0;
  global.window.YT = { Player: HangingPlayer };
  try {
    var mod = freshModule();
    var mountEl = makeFakeEl("div");
    var createPromise = mod.create(mountEl, "iG9CE55wbtY");
    await flushMicrotasks(); // let the deferred loadApi().then(...) callback construct the player
    assert.equal(HangingPlayer.instances.length, 1);
    var player = HangingPlayer.instances[0];
    assert.equal(mountEl.children.length, 1, "iframe must already be attached to the mount when onError can fire");
    var iframe = mountEl.children[0];

    // Reach the onError callback directly, the same way the apiPromise test above reaches
    // scripts[0].onerror() — no timers involved.
    player._opts.events.onError({ data: 101 });

    var caught = null;
    try { await createPromise; } catch (e) { caught = e; }
    assert.ok(caught, "create() must reject when onError fires before ready");
    assert.equal(caught.code, "YT_EMBED_DENIED");
    assert.equal(player._destroyed, true, "the constructed YT.Player must be destroyed on error, not orphaned");
    assert.equal(iframe.parentNode, null, "the iframe must be detached from the mount on error");
    assert.equal(mountEl.children.length, 0, "no orphaned iframe left in the mount");
  } finally {
    uninstallBrowserMocks();
  }
});

test("ready-timeout: destroys the YT.Player and detaches the iframe, rejects YT_NOT_READY (review finding 4 — was orphaning the player)", async (t) => {
  installBrowserMocks();
  HangingPlayer.instances.length = 0;
  global.window.YT = { Player: HangingPlayer };
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    var mod = freshModule();
    var mountEl = makeFakeEl("div");
    var createPromise = mod.create(mountEl, "iG9CE55wbtY");
    await flushMicrotasks(); // let the deferred loadApi().then(...) callback construct the player
    assert.equal(HangingPlayer.instances.length, 1);
    var player = HangingPlayer.instances[0];
    assert.equal(mountEl.children.length, 1, "iframe must already be attached to the mount when the ready-timeout can fire");
    var iframe = mountEl.children[0];

    t.mock.timers.tick(20000); // fire the 20s ready-timeout synchronously — no real wait

    var caught = null;
    try { await createPromise; } catch (e) { caught = e; }
    assert.ok(caught, "create() must reject on ready-timeout");
    assert.equal(caught.code, "YT_NOT_READY");
    assert.equal(player._destroyed, true, "the constructed YT.Player must be destroyed on ready-timeout, not orphaned");
    assert.equal(iframe.parentNode, null, "the iframe must be detached from the mount on ready-timeout");
    assert.equal(mountEl.children.length, 0, "no orphaned iframe left in the mount");
  } finally {
    t.mock.timers.reset();
    uninstallBrowserMocks();
  }
});
