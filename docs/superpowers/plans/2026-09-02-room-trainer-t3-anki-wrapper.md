# Room Trainer T3 — Anki Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the scheduler wrapper Anki has and the Room lacks — interval fuzz so reviews stop returning in clumps, a spaced in-session return for failed words, a leech policy that offers repair instead of surrender, and separation of same-root words within one session.

**Architecture:** Fuzz goes **inside** `public/js/fsrs-core.js` as an opt-in flag whose seed is derived from data the log row already carries (`item_key` + the pre-review `reps`), so `applyRow` reproduces it during `replay` and `replay(log) == stored` holds by construction. The reference `alea` PRNG and `get_fuzz_range` are transcribed exactly from `ts-fsrs@5.4.1`, and new golden vectors are **generated from the installed reference** rather than hand-written. Everything else — the spaced ladder, the leech policy, sibling separation — lives in `library-ui.js` and needs no schema change.

**Tech Stack:** Vanilla ES5-style UMD JavaScript, `ts-fsrs@5.4.1` as the fixture oracle (installed in `node_modules`, never called by a gate), Node 20 gates, Playwright for live-OPFS and screenshots.

## Global Constraints

- Spec of record: `docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md` §7.
- **`smoke:fsrs` must stay green at every commit.** The existing 30 assertions run with fuzz OFF and their vectors must remain byte-identical — fuzz is opt-in and off by default, so the pinned long-term regime is untouched.
- **`replay(review_log) == stored` is non-negotiable.** Any fuzz applied on the live path must be reproducible from the log row alone. The seed is therefore derived from `row.item_key` plus the pre-review `reps`, both of which `applyRow` already has.
- **The applied fuzz is RECORDED ON THE EVENT, and replay prefers the recorded value.** This was changed after reading `db/learnerGraphRepo.js:188` and `db/learnerProjectionRepo.js:101`; the naive design would have shipped a silent, profile-wide reschedule. See "Why the fuzz offset is an event fact" below.
- **Fuzz enablement for NEW rows is a build constant.** It decides what the live path records; it never decides how a recorded row replays.
- **Golden vectors are generated, never authored.** `scripts/premium/generate-fsrs-fixture.js` calls the installed `ts-fsrs@5.4.1`; the gate reads the committed JSON and never calls ts-fsrs. A fuzz vector set is only meaningful if the reference is configured with the SAME seed string our implementation builds — the plan uses ts-fsrs's pluggable `seed_strategy` to guarantee that.
- **No schema change in this wave.** Leech release is an event (`review_log`, `kind='mark'`, `meta.leech_released`), not a column.
- No `Math.random()`; `nowMs` stays injected.
- New UI strings land in all three locales; check for an existing key of the same name in the SAME object first — `room.morph.study.scopeAll` already collided once and the later literal silently wins.
- **Release moves SIX version stamps** (`docs/planning/PROD_INCIDENT_SW_INTEGRITY_AND_DISK_2026_09_02.md` §1.2). Three are gated; move all six.
- Check prod `disk_pct_used` before pushing and prune after the release lands.
- Baseline runtime: `3.11.458`.
- Gates green at every commit: `smoke:fsrs`, `smoke:memory-canon`, `smoke:grade-policy`, `smoke:train-queue`, `smoke:word-context`, `smoke:room-training-premium`, `smoke:studio-room-srs`, `smoke:reader-word-status`, `smoke:reader-morph`, `smoke:i18n`.

## Why the fuzz offset is an event fact

Reading the server before writing any code changed this wave's design.

`db/learnerProjectionRepo.js:101` stamps `FC.ENGINE_VERSION` onto every recomputed projection, and
`db/learnerGraphRepo.js:188` then **skips** any projection row whose `engine` differs from the
current one:

```js
// Derived rows from an older replay engine are not learner truth under the current engine.
if (row.engine && String(row.engine) !== String(FC.ENGINE_VERSION)) continue;
```

The naive design — flip a global fuzz constant, bump `ENGINE_VERSION` — has two consequences the
spec did not anticipate:

1. **Every existing word would silently reschedule.** Its rows were graded with fuzz off, so a
   fuzz-on replay produces a different due date than the one already stored. `replay(log) ==
   stored` would report a mismatch for the entire accumulated profile, and the live server oracle
   would flag every pre-fuzz word.
2. **Agent-facing coverage would go blind** until every projection was recomputed, because the
   filter above drops rows stamped with the old engine.

The fix is to treat the applied fuzz as what it actually is: **a fact about what the scheduler did
at that moment**, exactly like `grade` and `channel`, which the log already records. So the live
path writes `meta.fuzz_days` on the grade row, and `applyRow` prefers a recorded value when one is
present. Then:

- a pre-T3 row has no `fuzz_days` and replays **unfuzzed** — byte-identical to what is stored;
- a T3 row replays to exactly the interval it was scheduled with;
- `replay(log) == stored` holds across both epochs, with no mass reschedule;
- the `ENGINE_VERSION` bump stays honest, and the projection rebuild becomes a safe re-stamp
  rather than a rewrite.

The `(item_key, reps)` seed is still implemented and still gated: it is what makes the live value
reproducible in the first place, and it is the fallback when a row predates the recorded field but
was written by a fuzz-on build.

---

### Task 1: Fuzz vectors from the real reference

**Files:**
- Modify: `scripts/premium/generate-fsrs-fixture.js`
- Create: `scripts/premium/fixtures/fsrs/fsrs6-fuzz-golden-v1.json`
- Modify: `scripts/premium/fixtures/fsrs/README.md`

**Interfaces:**
- Consumes: `ts-fsrs@5.4.1` from `node_modules` (generator only).
- Produces: a committed fixture with `provenance` (reference version, weights, `enable_fuzz: true`, the seed-strategy description) and `scenarios[]` whose steps record `{ dt, grade, seed, interval, stability, difficulty, reps, lapses }`.

The oracle must be genuinely independent: the fixture is produced by ts-fsrs, and the gate never calls it. The seed strategy is pinned so our implementation and the reference agree by construction rather than by luck.

- [ ] **Step 1: Verify the reference is the pinned version**

Run: `node -e "console.log(require('./node_modules/ts-fsrs/package.json').version)"`
Expected: `5.4.1`. If it differs, stop — the existing fixture's provenance pins `5.4.1` and `smoke:fsrs` asserts `REFERENCE === "ts-fsrs@" + fixture.provenance.reference_version`.

- [ ] **Step 2: Extend the generator with a fuzz-on pass**

Append to `scripts/premium/generate-fsrs-fixture.js`, before it writes the existing file (keep the long-term fixture generation exactly as it is):

```js
// ── T3: fuzz-on vectors ──────────────────────────────────────────────────────────────────
// Fuzz is only reproducible if BOTH sides derive the same seed. ts-fsrs takes a pluggable
// seed strategy, so we pin it to the exact string fsrs-core builds: "<item_key>_<pre-review
// reps>". That makes the fixture a real oracle rather than a coincidence.
const FUZZ_KEY = "pid:900123";
const fuzzParams = { ...PARAMS, enable_fuzz: true };
const ff = tsfsrs.fsrs(tsfsrs.generatorParameters(fuzzParams));
ff.useStrategy(tsfsrs.StrategyMode.SEED, function () {
  return FUZZ_KEY + "_" + this.current.reps;
});

const FUZZ_SCENARIOS = [
  { name: "fuzz-good-chain", steps: [[0, 3], [3, 3], [14, 3], [44, 3], [120, 3], [300, 3]] },
  { name: "fuzz-short-intervals", steps: [[0, 3], [1, 3], [2, 3], [3, 3]] },
  { name: "fuzz-again-heavy", steps: [[0, 3], [3, 1], [1, 3], [2, 1], [1, 3], [5, 3]] },
  { name: "fuzz-long-gap", steps: [[0, 3], [60, 3], [365, 3], [900, 3]] },
  { name: "fuzz-hard-easy", steps: [[0, 2], [5, 4], [17, 2], [2, 4], [40, 3]] },
];

function runFuzz(scheduler, scenarios) {
  const out = [];
  for (const sc of scenarios) {
    let card = tsfsrs.createEmptyCard(new Date(T0));
    let now = T0;
    const steps = [];
    for (const [dt, grade] of sc.steps) {
      now += dt * 86400000;
      const preReps = card.reps;
      const rec = scheduler.next(card, new Date(now), grade);
      card = rec.card;
      steps.push({
        dt, grade,
        seed: FUZZ_KEY + "_" + preReps,
        scheduled_days: card.scheduled_days,
        stability: card.stability,
        difficulty: card.difficulty,
        reps: card.reps,
        lapses: card.lapses,
        due_ms: card.due.getTime(),
      });
    }
    out.push({ name: sc.name, steps });
  }
  return out;
}

const fuzzFixture = {
  provenance: {
    reference: "ts-fsrs",
    reference_version: refPkg.version,
    generation: "FSRS-6.0",
    weights: tsfsrs.default_w,
    request_retention: fuzzParams.request_retention,
    maximum_interval: fuzzParams.maximum_interval,
    enable_fuzz: true,
    enable_short_term: false,
    seed_strategy: "<item_key>_<pre-review reps>",
    item_key: FUZZ_KEY,
    note: "Generated by scripts/premium/generate-fsrs-fixture.js. The gate never calls ts-fsrs.",
  },
  scenarios: runFuzz(ff, FUZZ_SCENARIOS),
};
fs.writeFileSync(
  path.join(__dirname, "fixtures", "fsrs", "fsrs6-fuzz-golden-v1.json"),
  JSON.stringify(fuzzFixture, null, 2) + "\n");
console.log("wrote fsrs6-fuzz-golden-v1.json:", fuzzFixture.scenarios.length, "scenarios");
```

- [ ] **Step 3: Generate and confirm the fuzz actually varies**

Run: `node scripts/premium/generate-fsrs-fixture.js`
Expected: both fixtures written.

Then confirm the fuzz-on intervals genuinely differ from the fuzz-off ones — a fixture where they match would prove nothing:

```bash
node -e "
const off=require('./scripts/premium/fixtures/fsrs/fsrs6-golden-v1.json');
const on=require('./scripts/premium/fixtures/fsrs/fsrs6-fuzz-golden-v1.json');
const a=off.scenarios.find(s=>s.name==='good-chain');
const b=on.scenarios.find(s=>s.name==='fuzz-good-chain');
console.log('fuzz-off intervals:', a.steps.map(s=>s.interval||s.scheduled_days).join(','));
console.log('fuzz-on  intervals:', b.steps.map(s=>s.scheduled_days).join(','));
"
```
Expected: the two lines differ on at least one step beyond the first (intervals under 2.5 days are never fuzzed, by the reference's own rule).

- [ ] **Step 4: Verify the existing fixture is byte-unchanged**

Run: `git diff --stat scripts/premium/fixtures/fsrs/fsrs6-golden-v1.json`
Expected: **no output**. The long-term fixture must not move; if it did, the generator's shared parameters were disturbed and `smoke:fsrs` is about to change meaning.

Run: `npm run smoke:fsrs`
Expected: PASS 30/30.

- [ ] **Step 5: Document the new fixture**

Append to `scripts/premium/fixtures/fsrs/README.md`:

```markdown
## `fsrs6-fuzz-golden-v1.json`

Reference vectors for the **fuzz-on** path (T3, `ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md` §7.1).

Fuzz is only reproducible when both sides derive the same PRNG seed, so the generator pins
ts-fsrs's pluggable seed strategy to the exact string `fsrs-core.js` builds:
`<item_key>_<pre-review reps>`. Without that pinning a fuzz fixture would agree only by
coincidence and would prove nothing.

Regenerate with `node scripts/premium/generate-fsrs-fixture.js`. The gate reads the committed
JSON and never calls ts-fsrs.
```

- [ ] **Step 6: Commit**

```bash
git add scripts/premium/generate-fsrs-fixture.js scripts/premium/fixtures/fsrs/
git commit -m "test(fsrs): generate fuzz-on golden vectors from the pinned reference"
```

---

### Task 2: Fuzz inside the engine, reproducible by replay

**Files:**
- Modify: `public/js/fsrs-core.js`
- Modify: `scripts/premium/fsrs-core-smoke.js`

**Interfaces:**
- Consumes: the fuzz fixture (Task 1).
- Produces:
  - `FsrsCore.ENABLE_FUZZ: boolean` — the build constant.
  - `FsrsCore.fuzzRange(interval, elapsedDays, maximumInterval) -> { min, max }`
  - `FsrsCore.applyFuzz(interval, elapsedDays, seed) -> number`
  - `nextState(state, grade, nowMs, opts)` — `opts.fuzzSeed` optional; absent ⇒ no fuzz ⇒ byte-identical to today.
  - `applyRow` derives `fuzzSeed` from `row.item_key` + the pre-review `reps`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/fsrs-core-smoke.js`, before its final report block:

```js
// ── T3: fuzz parity against the generated reference vectors ────────────────────────────────
const FUZZ = require(path.join(__dirname, "fixtures", "fsrs", "fsrs6-fuzz-golden-v1.json"));
eq(FUZZ.provenance && FUZZ.provenance.enable_fuzz === true, "fuzz fixture must be generated with fuzz ON");
eq(String(F.REFERENCE) === "ts-fsrs@" + FUZZ.provenance.reference_version,
  "fuzz fixture reference version must match the engine's pin");
eq(FUZZ.provenance.seed_strategy === "<item_key>_<pre-review reps>",
  "the fuzz fixture must pin the seed strategy the engine builds");

// The default build must NOT fuzz: the 30 long-term assertions above depend on it.
eq(F.ENABLE_FUZZ === false, "fuzz must be OFF by default so the pinned long-term regime is untouched");

// get_fuzz_range transcription
const fr = F.fuzzRange(10, 0, 36500);
eq(fr.min === 8 && fr.max === 12, "fuzzRange(10) must reproduce the reference band, got " + JSON.stringify(fr));
eq(F.applyFuzz(2, 0, "x_0") === 2, "an interval below 2.5 days is never fuzzed");

// Full parity: replaying each scenario with the fixture's own seeds must reproduce its intervals.
for (const sc of FUZZ.scenarios) {
  let state = null, now = Date.UTC(2026, 0, 1);
  for (let i = 0; i < sc.steps.length; i++) {
    const st = sc.steps[i];
    now += st.dt * 86400000;
    state = F.nextState(state, st.grade, now, { fuzzSeed: st.seed, fuzz: true });
    eq(state.reps === st.reps, `${sc.name} step ${i}: reps ${state.reps} != ${st.reps}`);
    eq(state.lapses === st.lapses, `${sc.name} step ${i}: lapses ${state.lapses} != ${st.lapses}`);
    eq(close(state.stability, st.stability), `${sc.name} step ${i}: S ${state.stability} != ${st.stability}`);
    eq(state.dueMs === st.due_ms, `${sc.name} step ${i}: due ${state.dueMs} != ${st.due_ms} (fuzz mismatch)`);
  }
}

// Replay reproducibility: the seed must be derivable from the LOG ROW, or replay != stored.
{
  const key = FUZZ.provenance.item_key;
  const rows = [];
  let now = Date.UTC(2026, 0, 1);
  const sc = FUZZ.scenarios[0];
  for (const st of sc.steps) {
    now += st.dt * 86400000;
    rows.push({ id: "r" + rows.length, item_key: key, kind: "review", reviewed_at: new Date(now).toISOString(), grade: st.grade, meta_json: "{}" });
  }
  const replayed = F.replay(rows, { fuzz: true });
  const last = sc.steps[sc.steps.length - 1];
  eq(replayed && replayed.dueMs === last.due_ms,
    "replay must reproduce the fuzzed due date from the log alone, got " + (replayed && replayed.dueMs) + " != " + last.due_ms);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:fsrs`
Expected: FAIL — `F.fuzzRange is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `public/js/fsrs-core.js`, add before `nextState`:

```js
  // ── T3: interval fuzz (ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02 §7.1) ────────────────
  // Anki fuzzes intervals so cards learned together stop returning together. Without it the
  // queue arrives in clumps, which is half of why the same words kept surfacing.
  //
  // ENABLE_FUZZ is a BUILD CONSTANT, never a per-call option, because the live path and
  // replay() must never disagree within a build. Flipping it is a deliberate scheduler
  // generation change of the same class as changing weights: bump ENGINE_VERSION and
  // regenerate the fixture.
  //
  // The seed is derived from data the LOG ROW already carries — item_key plus the pre-review
  // reps — so applyRow reproduces it during replay and replay(log) == stored holds by
  // construction. Transcribed from ts-fsrs@5.4.1: FUZZ_RANGES, get_fuzz_range, and the alea
  // PRNG (Mash + Alea), byte-for-byte.
  var ENABLE_FUZZ = false;

  var FUZZ_RANGES = [
    { start: 2.5, end: 7, factor: 0.15 },
    { start: 7, end: 20, factor: 0.1 },
    { start: 20, end: Infinity, factor: 0.05 }
  ];

  function fuzzRange(interval, elapsedDays, maximumInterval) {
    var maxI = maximumInterval || MAXIMUM_INTERVAL;
    var delta = 1;
    for (var i = 0; i < FUZZ_RANGES.length; i++) {
      var rg = FUZZ_RANGES[i];
      delta += rg.factor * Math.max(Math.min(interval, rg.end) - rg.start, 0);
    }
    interval = Math.min(interval, maxI);
    var min = Math.max(2, Math.round(interval - delta));
    var max = Math.min(Math.round(interval + delta), maxI);
    if (interval > elapsedDays) min = Math.max(min, elapsedDays + 1);
    min = Math.min(min, max);
    return { min: min, max: max };
  }

  function _mash() {
    var n = 4022871197;
    return function (data) {
      data = String(data);
      for (var i = 0; i < data.length; i++) {
        n += data.charCodeAt(i);
        var h = 0.02519603282416938 * n;
        n = h >>> 0;
        h -= n;
        h *= n;
        n = h >>> 0;
        h -= n;
        n += h * 4294967296;
      }
      return (n >>> 0) * 23283064365386963e-26;
    };
  }

  function _alea(seed) {
    var mash = _mash();
    var c = 1, s0 = mash(" "), s1 = mash(" "), s2 = mash(" ");
    s0 -= mash(seed); if (s0 < 0) s0 += 1;
    s1 -= mash(seed); if (s1 < 0) s1 += 1;
    s2 -= mash(seed); if (s2 < 0) s2 += 1;
    return function () {
      var t = 2091639 * s0 + c * 23283064365386963e-26;
      s0 = s1; s1 = s2; c = t | 0; s2 = t - c;
      return s2;
    };
  }

  function applyFuzz(interval, elapsedDays, seed, maximumInterval) {
    if (interval < 2.5) return Math.round(interval);
    var factor = _alea(String(seed))();
    var band = fuzzRange(interval, elapsedDays, maximumInterval);
    return Math.floor(factor * (band.max - band.min + 1) + band.min);
  }
```

Then change `nextState` to accept `opts` and apply fuzz to the non-Again interval:

```js
  function nextState(state, grade, nowMs, opts) {
    var g = Math.min(4, Math.max(1, Math.round(Number(grade) || 1)));
    var now = Number(nowMs) || 0;
    var mem = _hasMemory(state) ? { stability: state.stability, difficulty: state.difficulty } : null;
    var t = mem && state.lastReviewedAt != null ? utcDayDiff(state.lastReviewedAt, now) : 0;
    var c = step(DEFAULT_W, mem, t);
    var ds = c.ds[g], refIvl = c.ivl[g];
    // T3: fuzz only a real forward interval. Again keeps the product contract (due = now).
    var useFuzz = !!(opts && opts.fuzz != null ? opts.fuzz : ENABLE_FUZZ);
    var ivl = refIvl;
    if (useFuzz && g !== 1 && opts && opts.fuzzSeed) ivl = applyFuzz(refIvl, t, opts.fuzzSeed, MAXIMUM_INTERVAL);
    var dueMs = g === 1 ? now : now + ivl * DAY_MS;   // product contract: Again → due NOW
    return {
      stability: ds.stability,
      difficulty: ds.difficulty,
      reps: ((state && state.reps) || 0) + 1,
      lapses: ((state && state.lapses) || 0) + (g === 1 && mem ? 1 : 0),
      lastReviewedAt: now,
      intervalDays: Math.round((dueMs - now) / DAY_MS),
      refIntervalDays: refIvl,
      dueMs: dueMs
    };
  }
```

Thread the seed through `applyRow` and `replay`:

```js
  function applyRow(state, row, opts) {
    if (!row) return state;
    var ts = Date.parse(row.reviewed_at || "") || 0;
    if (row.kind === "seed") {
      var meta = {};
      try { meta = typeof row.meta_json === "string" ? JSON.parse(row.meta_json) : (row.meta || {}); } catch (_) {}
      return seedFromSm2(meta, ts);
    }
    // T3: prefer the RECORDED fuzz. A pre-T3 row has no meta.fuzz_days and replays unfuzzed —
    // byte-identical to what is already stored — so turning fuzz on never reschedules the
    // accumulated profile. A T3 row replays to exactly the interval it was scheduled with.
    // The (item_key, reps) seed remains the fallback: it is what makes the live value
    // reproducible in the first place.
    var rowMeta = {};
    try { rowMeta = typeof row.meta_json === "string" ? JSON.parse(row.meta_json) : (row.meta || {}); } catch (_) {}
    var recorded = rowMeta && rowMeta.fuzz_days != null ? Number(rowMeta.fuzz_days) : null;
    var seed = String(row.item_key == null ? "" : row.item_key) + "_" + ((state && state.reps) || 0);
    return nextState(state, Number(row.grade) || 1, ts, {
      fuzz: recorded != null ? false : !!(opts && opts.fuzz != null ? opts.fuzz : ENABLE_FUZZ),
      fuzzSeed: seed,
      forceIntervalDays: recorded
    });
  }
```

`nextState` honours `opts.forceIntervalDays` when it is a finite number, using it instead of both
the reference interval and the fuzz — that is what makes a recorded row replay exactly.

`replay(rows, opts)` must pass `opts` down to every `applyRow` call. Export `ENABLE_FUZZ`, `fuzzRange`, `applyFuzz`, and bump `ENGINE_VERSION` to `"fsrs6-core-v3"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run smoke:fsrs`
Expected: PASS — the original 30 assertions plus the fuzz parity block.

- [ ] **Step 5: Prove the untouched regime really is untouched**

Run: `git diff scripts/premium/fixtures/fsrs/fsrs6-golden-v1.json`
Expected: no output.

Run: `npm run smoke:memory-canon`
Expected: PASS 79/79 — the replay oracle still folds every stored profile identically.

- [ ] **Step 6: Commit**

```bash
git add public/js/fsrs-core.js scripts/premium/fsrs-core-smoke.js
git commit -m "feat(fsrs): add opt-in interval fuzz whose seed replay can reproduce"
```

---

### Task 3: Turn fuzz on for the Room, with the seed the log carries

**Files:**
- Modify: `public/js/reader-morph.js` (`fsrsStep`)
- Modify: `public/js/library-ui.js` (`checkTrainAnswer` — pass the key)
- Modify: `scripts/premium/train-queue-smoke.js`

**Interfaces:**
- Consumes: `FsrsCore.nextState(state, grade, nowMs, opts)` (Task 2).
- Produces: `fsrsStep(FC, prev, correct, nowMs, opts)` — `opts.itemKey` builds the seed.

`fsrsStep` is the single handover point both surfaces use, so the seed is threaded there and nowhere else. `ENABLE_FUZZ` flips to `true` in this task — that is the scheduler-generation change, and it lands with its own `ENGINE_VERSION`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js`:

```js
// ── Suite 15: fuzz is live and seeded from the item key (T3) ─────────────────
const morphSrc2 = fs.readFileSync(path.join(ROOT, "public/js/reader-morph.js"), "utf8");
const fsrsSrc = fs.readFileSync(path.join(ROOT, "public/js/fsrs-core.js"), "utf8");
check(/var ENABLE_FUZZ = true;/.test(fsrsSrc), "the shipped build must have fuzz ON");
check(/fsrs6-core-v3/.test(fsrsSrc), "flipping the fuzz constant must bump ENGINE_VERSION");
const stepBody = (morphSrc2.match(/function fsrsStep[\s\S]*?\n  }\n/) || [""])[0];
check(/fuzzSeed|itemKey/.test(stepBody), "fsrsStep must thread the fuzz seed");
check(/fsrsStep\([^)]*itemKey|itemKey:/.test(room), "the Room must pass the item key into the scheduler step");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL on all four.

- [ ] **Step 3: Write minimal implementation**

In `public/js/fsrs-core.js`, flip the constant and bump the version:

```js
  var ENABLE_FUZZ = true;
```
```js
  var ENGINE_VERSION = "fsrs6-core-v3";
```

In `public/js/reader-morph.js`, extend `fsrsStep`'s signature to `(FC, prev, correct, nowMs, opts)` and pass the seed into the `nextState` call:

```js
    // T3: the fuzz seed is (item key + pre-review reps) — the same string applyRow rebuilds
    // during replay, so replay(log) == stored survives fuzz by construction.
    var seed = (opts && opts.itemKey) ? String(opts.itemKey) + "_" + ((state && state.reps) || 0) : null;
    var next = FC.nextState(state, g, nowMs, seed ? { fuzzSeed: seed } : null);
```

In `public/js/library-ui.js`, pass the key at the one call site:

```js
  const fs = window.ReaderMorph.fsrsStep ? window.ReaderMorph.fsrsStep(window.FsrsCore, item._srs, d1 ? d1.grade : correct, now, { itemKey: item.lemmaKey }) : null;
```

And record the applied fuzz on the grade row, next to the existing `scheduler` block in `row.meta`:

```js
        // T3 — what the scheduler actually did, so replay reproduces THIS row exactly and a
        // pre-T3 row (no field) keeps replaying unfuzzed. Recorded only when it differs from the
        // reference interval, so an unfuzzed row stays byte-identical to today.
        fuzz_days: (fs && fs.state && fs.state.intervalDays !== fs.state.refIntervalDays)
          ? fs.state.intervalDays : undefined,
```

`fsrsStep` must therefore return the full `state` (it already does) so the caller can compare
`intervalDays` against `refIntervalDays`.

- [ ] **Step 3b: Assert the two-epoch contract**

Add to `scripts/premium/fsrs-core-smoke.js`:

```js
// A pre-T3 row carries no meta.fuzz_days and MUST replay unfuzzed even on a fuzz-on build —
// otherwise turning fuzz on silently reschedules every accumulated word.
{
  const rows = [
    { id: "a", item_key: "pid:1", kind: "review", reviewed_at: "2026-01-01T00:00:00.000Z", grade: 3, meta_json: "{}" },
    { id: "b", item_key: "pid:1", kind: "review", reviewed_at: "2026-01-05T00:00:00.000Z", grade: 3, meta_json: "{}" },
  ];
  const noFuzz = F.replay(rows, { fuzz: false });
  const onFuzzBuild = F.replay(rows, { fuzz: true });
  eq(noFuzz.dueMs === onFuzzBuild.dueMs,
    "a row with no recorded fuzz must replay identically on a fuzz-on build (no silent reschedule)");
}
// A recorded row replays to exactly its recorded interval.
{
  const rows = [
    { id: "a", item_key: "pid:2", kind: "review", reviewed_at: "2026-01-01T00:00:00.000Z", grade: 3, meta_json: JSON.stringify({ fuzz_days: 9 }) },
  ];
  const st = F.replay(rows, { fuzz: true });
  eq(st.intervalDays === 9, "a recorded fuzz interval must replay exactly, got " + st.intervalDays);
}
```

- [ ] **Step 4: Run the whole scheduler surface**

Run each and confirm PASS: `npm run smoke:fsrs`, `npm run smoke:memory-canon`, `npm run smoke:grade-policy`, `npm run smoke:train-queue`, `npm run smoke:room-training-premium`, `npm run smoke:studio-room-srs`.

`smoke:memory-canon` is the one that matters most here: it asserts `replay(log) == stored` on real OPFS profiles. If it fails, the seed is not reproducible and the fuzz must go back off until it is.

- [ ] **Step 5: Commit**

```bash
git add public/js/fsrs-core.js public/js/reader-morph.js public/js/library-ui.js scripts/premium/train-queue-smoke.js
git commit -m "feat(room): turn interval fuzz on so reviews stop returning in clumps"
```

---

### Task 4: A spaced in-session return for failed words

**Files:**
- Modify: `public/js/library-ui.js` (`checkTrainAnswer`, `onTrainNext`)
- Modify: `scripts/premium/train-queue-smoke.js`

**Interfaces:**
- Consumes: the existing `retryQueue` / `retryPhase` machinery.
- Produces: `MID_RETRY_GAP` constant and a mid-session re-insertion in `checkTrainAnswer`.

Today a failed word returns only in one batch at the very end. Anki's learning steps exist to give a second, spaced retrieval; the Room already has an in-session return, so it needs the SPACING, not persisted steps (spec §7.2, owner decision). A failed word now returns after at least four other items **and** once more in the closing phase — two spaced retrievals instead of one.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js`:

```js
// ── Suite 16: spaced in-session return (T3) ──────────────────────────────────
check(/MID_RETRY_GAP/.test(room), "the failure ladder must define its spacing");
const answerBody = (room.match(/async function checkTrainAnswer[\s\S]*?\nfunction renderTrainReveal/) || [""])[0];
check(/_midRetryDone/.test(answerBody), "a word may take only ONE mid-session return, or the session never ends");
check(/splice\(/.test(answerBody), "the failed word must be re-inserted mid-session, not only appended at the end");
check(/retryQueue\.push/.test(answerBody), "the closing reinforcement pass must still happen — two spaced retrievals, not one");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL on the first three.

- [ ] **Step 3: Write minimal implementation**

In `public/js/library-ui.js`, next to `LEECH_LAPSES`:

```js
// T3 — a failed word returns after at least this many other items, then AGAIN in the closing
// reinforcement pass: two spaced retrievals instead of one. This is the pedagogically valuable
// half of Anki's learning steps; persisted cross-session steps were considered and rejected
// (spec §7.2) because the Room already has an in-session return and steps would force replay to
// reconstruct a step position from the log.
const MID_RETRY_GAP = 4;
```

In `checkTrainAnswer`, replace the retry-queue block:

```js
  if ((!correct || skipped) && !item._retryAttempt && !item._retryQueued) {
    item._retryQueued = true;
    s.retryQueue.push(item);
  }
```

with:

```js
  if ((!correct || skipped) && !item._retryAttempt && !item._retryQueued) {
    item._retryQueued = true;
    s.retryQueue.push(item);
    // T3 — and bring it back once mid-session, spaced. Bounded to ONE mid-session return per
    // word (_midRetryDone) so a repeatedly-failed word cannot extend the session without end,
    // and only when there is room before the closing pass.
    if (!item._midRetryDone && s.idx + MID_RETRY_GAP < s.items.length) {
      item._midRetryDone = true;
      const echo = Object.assign(Object.create(Object.getPrototypeOf(item)), item, { _midEcho: true });
      s.items.splice(s.idx + MID_RETRY_GAP, 0, echo);
      s.total = s.items.length;
    }
  }
```

- [ ] **Step 4: Run tests**

Run: `npm run smoke:train-queue && npm run smoke:room-training-premium && npm run smoke:studio-room-srs`
Expected: all PASS. `room-training-premium` asserts the reinforcement pass is bounded and that every attempt is its own canonical event — both must survive.

- [ ] **Step 5: Commit**

```bash
git add public/js/library-ui.js scripts/premium/train-queue-smoke.js
git commit -m "feat(room): give a failed word a spaced mid-session return, not just an end pass"
```

---

### Task 5: Leech policy with a repair path, and same-root separation

**Files:**
- Modify: `public/js/library-ui.js`
- Modify: `public/library.html` (CSS)
- Modify: `public/i18n/locales/{ru,en,he}.js`
- Modify: `scripts/premium/train-queue-smoke.js`

**Interfaces:**
- Consumes: `LEECH_LAPSES`, `_buildDueSourcedItems`.
- Produces:
  - `leechThreshold()` / `leechThresholdSet(n)` — configurable, default `LEECH_LAPSES`.
  - `_leechRelease(lemmaKey)` — writes `review_log` `kind='mark'`, `meta.leech_released`.
  - Same-root separation inside `_buildDueSourcedItems`.

Today the product's only suggestion for a leech is `отметить ignore?` — surrender. In a morphologically rich language a leech is usually a bad context or an unresolved homograph, not learner failure (R10/R11), so the reveal now offers: **change context** (rotate to the next banked sentence), **change channel**, **open the card**, and **keep going**. Release is an assertion, so it is an event, not a column.

New locale keys (check for collisions in the same object first): `leechTitle`, `leechWhy`, `leechNextContext`, `leechChannel`, `leechKeep`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js`:

```js
// ── Suite 17: leech repair path + sibling separation (T3) ────────────────────
const LEECH_KEYS = ["leechTitle", "leechWhy", "leechNextContext", "leechChannel", "leechKeep"];
LEECH_KEYS.forEach((k) => {
  check(new RegExp("room\\.morph\\.study\\." + k + "\\b").test(room), `library-ui must use the ${k} string`);
  localeSrc.forEach((L) => check(new RegExp("\\b" + k + "\\s*:").test(L.src), `locale ${L.name} must define ${k}`));
});
check(/function leechThreshold\s*\(/.test(room), "the leech threshold must be configurable");
check(/leech_released/.test(room), "releasing a leech must be an EVENT in review_log, not a column");
check(/data-train-leech-context/.test(room), "the leech panel must offer a different context");
check(/data-train-leech-keep/.test(room), "the leech panel must offer keeping the word in rotation");
const buildBody3 = (room.match(/async function _buildDueSourcedItems[\s\S]*?\n}\n/) || [""])[0];
check(/seenRoots|_sameRoot/.test(buildBody3), "same-root words must be separated within one session");
check(/deferred/.test(buildBody3),
  "a deferred same-root word must be able to come back when the session would otherwise be short — never silently lost");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL on all Suite 17 checks.

- [ ] **Step 3: Add the locale strings**

Check first: `grep -n "leechTitle\|leechWhy\|leechNextContext\|leechChannel\|leechKeep" public/i18n/locales/ru.js` must print nothing. Then add to each locale's `study:` object, next to the existing `leechDone`:

`ru.js`:
```js
        leechTitle: "Это слово застряло",
        leechWhy: "Обычно дело не в вас: чаще виноват неудачный контекст или омограф. Попробуйте другое.",
        leechNextContext: "Другое предложение",
        leechChannel: "Сменить режим",
        leechKeep: "Оставить в обороте",
```

`en.js`:
```js
        leechTitle: "This word is stuck",
        leechWhy: "Usually it is not you: an awkward context or a homograph is the more common cause. Try a different one.",
        leechNextContext: "A different sentence",
        leechChannel: "Change the mode",
        leechKeep: "Keep it in rotation",
```

`he.js`:
```js
        leechTitle: "המילה הזו נתקעה",
        leechWhy: "לרוב זו לא אשמתכם: הסיבה השכיחה היא הקשר לא מוצלח או הומוגרף. נסו אחר.",
        leechNextContext: "משפט אחר",
        leechChannel: "להחליף מצב",
        leechKeep: "להשאיר בסבב",
```

- [ ] **Step 4: Implement the threshold, the release event and the panel**

Add next to `MID_RETRY_GAP`:

```js
const LEECH_KEY = 'room.leechThreshold.v1';
function leechThreshold() {
  try { const n = Number(JSON.parse(localStorage.getItem(LEECH_KEY) || 'null')); return Number.isFinite(n) && n >= 2 && n <= 20 ? Math.round(n) : LEECH_LAPSES; }
  catch (_) { return LEECH_LAPSES; }
}
function leechThresholdSet(n) { try { localStorage.setItem(LEECH_KEY, JSON.stringify(Number(n) || LEECH_LAPSES)); } catch (_) {} }
// T3 — releasing a leech is the learner ASSERTING the word is workable again, so it belongs in
// the append-only log as a mark event (synchronised, replayable), not in a column.
async function _leechRelease(lemmaKey) {
  const LC = window.LemmaCanon;
  if (!LC || !localDb.appendReviewLog) return false;
  const row = {
    item_key: String(lemmaKey), kind: 'mark', reviewed_at: new Date().toISOString(),
    grade: null, source: 'room-leech',
    meta: { leech_released: 1, keyer_version: LC.KEYER_VERSION },
  };
  row.id = LC.reviewId ? LC.reviewId(row) : ('leech:' + lemmaKey + ':' + row.reviewed_at);
  try { await localDb.appendReviewLog(row); return true; } catch (_) { return false; }
}
```

Replace the `isLeech` computation to use `leechThreshold()`, and extend `renderTrainReveal`'s leech block to render the title, the "why", and four actions: `[data-train-leech]` (existing ignore), `[data-train-leech-context]`, `[data-train-leech-channel]`, `[data-train-leech-keep]`. Wire the three new ones in the sheet delegate:

```js
    if (t.closest('[data-train-leech-context]')) { onTrainLeechNextContext(); return; }
    if (t.closest('[data-train-leech-channel]')) { onTrainChannel(trainChannel() === 'read' ? 'reverse' : 'read'); return; }
    if (t.closest('[data-train-leech-keep]')) { const it = _trainSession && _trainSession.items[_trainSession.idx]; if (it) _leechRelease(it.lemmaKey); onTrainNext(); return; }
```

`onTrainLeechNextContext` advances the word's rotation by one and re-renders, so the learner immediately sees a different sentence.

- [ ] **Step 5: Separate same-root words**

In `_buildDueSourcedItems`, before returning `items`, add:

```js
  // T3 — sibling separation. Two words of the same root cue each other, so one session should
  // not test both. Deferred words are NOT lost: if the session would otherwise be short they
  // come back, and either way they stay due.
  const seenRoots = Object.create(null), kept = [], deferred = [];
  for (const it of items) {
    const rt = String((it && it.root) || '').trim();
    if (rt && seenRoots[rt]) { deferred.push(it); continue; }
    if (rt) seenRoots[rt] = 1;
    kept.push(it);
  }
  items = kept.concat(deferred);
```

(`items` must be declared with `let` for this; it is currently `const items = []` — change the declaration.)

- [ ] **Step 6: Style the panel**

Add to `public/library.html` next to the existing `.room-train-leech` rules:

```css
    .room-train-leech-title { font-weight: 700; margin-bottom: 4px; }
    .room-train-leech-why { font-size: 13px; color: var(--text-secondary); line-height: 1.45; margin-bottom: 8px; }
    .room-train-leech-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .room-train-leech-actions button { width: auto; min-height: 44px; padding: 0 14px; border-radius: 10px;
      border: 1px solid var(--border-soft); background: transparent; color: var(--text-primary); font-size: 13px; cursor: pointer; }
```

- [ ] **Step 7: Run tests and capture screenshots**

Run: `npm run smoke:train-queue && npm run smoke:room-training-premium && npm run smoke:word-context`
Then extend `scripts/premium/train-queue-shots.js` to seed a word past the leech threshold, capture the reveal panel, and **look at the images**.

- [ ] **Step 8: Commit**

```bash
git add public/js/library-ui.js public/library.html public/i18n/locales/*.js scripts/premium/train-queue-smoke.js scripts/premium/train-queue-shots.js docs/research/room-trainer-maturity
git commit -m "feat(room): offer a leech a repair path instead of surrender, and separate same-root words"
```

---

### Task 6: Release

- [ ] **Step 1: Check the prod disk first**

Run: `curl -s https://linguistpro.kolosei.com/healthz`
If `disk_pct_used` is above 85, prune unused images and build cache before pushing — three deploys in an hour once took it to 100% and blocked the fix for the very defect being fixed.

- [ ] **Step 2: Move all six version stamps to `3.11.459` / locale `193`**

1. `public/index.html` — `window.APP_VERSION`
2. `public/sw.js` — `CACHE_VERSION`
3. locale `?v=` in `public/index.html` **and** `public/library.html`
4. `public/library.html` — `#roomFooterVersion`
5. `library-ui.js?v=` and `train-queue.js?v=` in `public/library.html` **and** `public/sw.js`
6. `server.js` `SHELL_INTEGRITY_PATHS`

Then `node tests/i18n.smoke.js --write-lock`.

- [ ] **Step 3: Full gate sweep**

`smoke:fsrs`, `smoke:memory-canon`, `smoke:grade-policy`, `smoke:train-queue`, `smoke:word-context`, `smoke:i18n`, `smoke:room-training-premium`, `smoke:studio-room-srs`, `smoke:reader-word-status`, `smoke:reader-morph`, `smoke:reader-parity`, `smoke:canon-version`, `git diff --check`. Run OPFS gates one at a time.

- [ ] **Step 4: Commit, push, verify**

After the build lands, confirm `/api/client-config` reports `3.11.459` with matching `shellIntegrity`, that a fresh browser reaches service-worker state `activated` with a `linguistpro-precache-v3.11.459` bucket, and that `window.FsrsCore.ENGINE_VERSION` is `fsrs6-core-v3` with `ENABLE_FUZZ` true. Do not grade any word on the owner's profile. Prune the superseded image and build cache afterwards.

- [ ] **Step 5: Hand the owner the projection rebuild**

`db/learnerGraphRepo.js:188` skips any `srs_projections` row whose `engine` differs from the
current `FC.ENGINE_VERSION`, so after the bump the agent-facing coverage view ignores every row
still stamped `fsrs6-core-v2` until it is recomputed.

Because the fuzz offset is recorded on the event, this rebuild is a **safe re-stamp**: replaying a
pre-T3 row produces the same due it already has, so no schedule moves. It is still required, and
it is the owner's to run — `POST /api/learner/projections/rebuild` needs their authenticated
session and CSRF token, and it operates on their own data.

Tell the owner explicitly: what the endpoint is, that it changes no due dates, and that without it
the mentor's coverage view under-reports until each word is next reviewed. Do not attempt to call
it with borrowed credentials.

---

## Self-Review

**Spec coverage (§7):**

| Spec requirement | Task |
|---|---|
| §7.1 fuzz inside fsrs-core, opt-in, default off | 2 |
| §7.1 existing golden vectors byte-identical | 1 (Step 4), 2 (Step 5) |
| §7.1 new fuzz vectors from ts-fsrs@5.4.1 | 1 |
| §7.1 seed = (lemmaKey, reps), replay-reproducible | 2 (`applyRow`), 3 (`fsrsStep`) |
| §7.1 ENGINE_VERSION bumped | 3 |
| §7.2 failed word returns after k items and once at the end | 4 |
| §7.2 every return is its own canonical grade event | 4 (existing contract, asserted by room-training-premium) |
| §7.3 configurable threshold | 5 |
| §7.4 same-root separation, degrades when root unknown | 5 (Step 5) |
| §7.5 gates | 1–5 |
| Global: six version stamps | 6 |

**Placeholder scan:** every code step carries literal code. The one deliberately deferred value is the fuzz fixture's contents, which Task 1 Step 3 generates from the reference rather than guessing.

**Type consistency:** `applyFuzz(interval, elapsedDays, seed, maximumInterval)` and `fuzzRange(interval, elapsedDays, maximumInterval)` are defined in Task 2 and asserted with those signatures in its test. `nextState(state, grade, nowMs, opts)` gains `opts` in Task 2 and is called with `{ fuzzSeed }` in Tasks 2 and 3. `fsrsStep(FC, prev, correct, nowMs, opts)` gains `opts.itemKey` in Task 3 and is called with it from `library-ui.js` in the same task. `_leechRelease(lemmaKey) -> Promise<boolean>` is defined and called in Task 5.

**Risks flagged for execution:**

1. **`smoke:memory-canon` is the real gate for Task 3.** It asserts `replay(log) == stored` against live OPFS profiles. If the seed is not perfectly reproducible the fuzz must go back off until it is — shipping a scheduler whose replay disagrees with its own projection would corrupt cross-device history.
2. **`ENGINE_VERSION` gates the server's coverage view.** `db/learnerGraphRepo.js:188` skips projection rows stamped with any other engine, so the bump requires the owner-run rebuild in Task 6 Step 5. Checked: the many `fsrs6-core-v2` occurrences in `scripts/premium/telegram-*-smoke.js` are INSERT literals in test fixtures, not assertions against the live constant, so they are unaffected.
3. **The two-epoch contract is the thing to protect.** A pre-T3 row must replay unfuzzed on a fuzz-on build. Task 2 Step 3b asserts exactly that; if it ever fails, turning fuzz on has become a silent profile-wide reschedule and must be reverted rather than accommodated.
3. **Task 4 mutates `s.items` mid-session.** The progress element reads `plannedTotal` for the denominator, so an inserted echo must not inflate the planned figure — check the rendered `X / N` after a deliberate miss.
