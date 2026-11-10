// The Room's Learning Compass worker loads the whole Pealim inflection dictionary
// (~44 MB of heap in Chromium). An idle worker must not keep it alive while the
// learner reads or watches a material: on iPhone every open tab shares one memory
// budget, and the page is killed when it runs out.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ui = fs.readFileSync(path.join(__dirname, "../public/js/library-ui.js"), "utf8");

function loadPool({ narrow = true } = {}) {
  const start = ui.indexOf("const COMPASS_WORKER_IDLE_MS");
  const end = ui.indexOf("function compassStatusContext(");
  assert.ok(start > 0 && end > start, "compass worker pool block not found");
  const workers = [];
  const timers = new Map();
  let timerSeq = 0;
  class FakeWorker {
    constructor(url) { this.url = url; this.posted = []; this.terminated = false; workers.push(this); }
    postMessage(message) { this.posted.push(message); }
    terminate() { this.terminated = true; }
    reply(ok = true) {
      const last = this.posted[this.posted.length - 1];
      this.onmessage({ data: { id: last.id, ok, ingredients: { id: last.id } } });
    }
  }
  const sandbox = {
    Worker: FakeWorker,
    matchMedia: () => ({ matches: narrow }),
    setTimeout: (fn, ms) => { const id = ++timerSeq; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    Promise, Error,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    "let _compassJobSeq = 0; const _compassWorkerSlots = []; const _compassWorkerQueue = [];\n" +
      ui.slice(start, end) +
      "\nthis.api = { analyzeLearningRows, slots: _compassWorkerSlots, idleMs: COMPASS_WORKER_IDLE_MS };",
    sandbox,
  );
  const runTimers = () => { const due = [...timers.entries()]; timers.clear(); for (const [, t] of due) t.fn(); };
  return { api: sandbox.api, workers, timers, runTimers };
}

test("an idle compass worker is terminated, releasing the dictionary", async () => {
  const { api, workers, timers, runTimers } = loadPool();
  const done = api.analyzeLearningRows({ rows: [] });
  assert.equal(workers.length, 1);
  workers[0].reply();
  await done;
  assert.equal(workers[0].terminated, false, "kept briefly for the next card");
  assert.equal(timers.size, 1);
  assert.ok(api.idleMs > 0 && api.idleMs <= 30000);
  runTimers();
  assert.equal(workers[0].terminated, true);
  assert.equal(api.slots.length, 0);
});

test("a job arriving before the idle timeout reuses the warm worker", async () => {
  const { api, workers, timers, runTimers } = loadPool();
  const first = api.analyzeLearningRows({ rows: [] });
  workers[0].reply(); await first;
  const second = api.analyzeLearningRows({ rows: [] });
  assert.equal(workers.length, 1, "no second dictionary load");
  assert.equal(timers.size, 0, "idle timer cancelled by the new job");
  workers[0].reply(); await second;
  runTimers();
  assert.equal(workers[0].terminated, true);
});

test("the pool starts only as many workers as there are jobs", async () => {
  const { api, workers } = loadPool({ narrow: false });
  const one = api.analyzeLearningRows({ rows: [] });
  assert.equal(workers.length, 1, "a second idle worker is not spawned on desktop");
  const two = api.analyzeLearningRows({ rows: [] });
  assert.equal(workers.length, 2);
  workers[0].reply(); workers[1].reply();
  await Promise.all([one, two]);
});

test("a new job after the worker was retired starts a fresh worker", async () => {
  const { api, workers, runTimers } = loadPool();
  const first = api.analyzeLearningRows({ rows: [] });
  workers[0].reply(); await first;
  runTimers();
  const again = api.analyzeLearningRows({ rows: [] });
  assert.equal(workers.length, 2);
  workers[1].reply();
  assert.deepEqual(await again, { id: workers[1].posted[0].id });
});
