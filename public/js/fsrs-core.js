/* fsrs-core.js — pure FSRS-6 scheduler core (UMD, no deps). Retention program P1
 * (docs/planning/RETENTION_PROGRAM_RECON_2026_07_02.md §4, owner sign-off D1/D2).
 *
 * ONE engine for both surfaces: the Reading Room recall loop (replaces SM2-lite nextSrs, P2)
 * and the Studio Trainer (replaces computeSM2, P3). Node-requirable for gates and reports.
 *
 * Math is a faithful transcription of the PINNED reference — ts-fsrs@5.4.1 (FSRS-6.0,
 * published default weights, learnable-decay w20) in its LONG-TERM regime:
 * enable_short_term=false, learning_steps=[], enable_fuzz=false, request_retention=0.9.
 * The golden gate `smoke:fsrs` asserts this file against committed reference vectors
 * (scripts/premium/fixtures/fsrs/fsrs6-golden-v1.json) — any formula drift fails the build.
 * Same rounding (roundTo 8), same integer UTC calendar-day elapsed semantics, same
 * interval-ordering cascade (again ≤ hard < good < easy).
 *
 * Product contracts layered ON TOP of the reference math (recon §4.1, adversarial-critique
 * fixes — these are OURS, not ts-fsrs's):
 *   • grade 1 (Again) → dueMs = now: the same-session retest of a failed word is preserved
 *     (today's SM2-lite lapse behavior; R11 M8). The reference cascade interval is still
 *     exposed as refIntervalDays for parity/reports.
 *   • Δt < 0 (clock skew across devices) NEVER throws — clamped to 0 (recon M10).
 *   • kind='skip' rows fold EXACTLY like their grade via the ONE shared applyRow step, so
 *     live state and replay() can never disagree (recon M9); skips are excluded from
 *     metrics/optimizer at the REPORT layer, not here.
 *   • kind='seed' rows materialize the SM2→FSRS handover in the log itself: replay() starts
 *     an item at its LAST seed row (watermark) — state is derivable from the log alone
 *     (independent-oracle gate, recon B4). interval=0 legacy rows (post-lapse) seed as
 *     initState(Again); D seeds as D0(Good) — the reps/lapses-based heuristic was refuted.
 *
 * Deterministic: nowMs injected everywhere, no Date.now()/Math.random().
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.FsrsCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // v3 — T3 interval fuzz. New rows carry meta.fuzz_days and replay to it; rows without the
  // field replay UNFUZZED, so the accumulated profile is not rescheduled by the switch-on.
  // NOTE for ops: db/learnerGraphRepo.js skips srs_projections rows stamped with another
  // engine, so this bump needs POST /api/learner/projections/rebuild to re-stamp them. That
  // rebuild moves no due dates — replaying a pre-T3 row reproduces the due it already has.
  // v2 — P7.0a annul-семантика фолда (annulled review/skip исключаются из replay);
  // для логов без annul-строк фолд байт-идентичен v1 (гейты fsrs 30/30 + server-replay
  // на нетронутом golden-v1 — доказательство). Бамп = маркер «какой семантикой посчитана
  // проекция» (server stamps engine; клиентский heal — по sync_state 'annul_engine_v').
  var ENGINE_VERSION = "fsrs6-core-v3";
  var GENERATION = "FSRS-6.0";
  var REFERENCE = "ts-fsrs@5.4.1";
  var SCHEME = "fsrs";   // stamped into word_status.srs_scheme / review_log meta by callers

  // Published FSRS-6 default weights (21; w20 = decay) — byte-equal to ts-fsrs default_w.
  var DEFAULT_W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
    0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
  var REQUEST_RETENTION = 0.9;
  var MAXIMUM_INTERVAL = 36500;
  var S_MIN = 1e-3, S_MAX = 36500;
  var DAY_MS = 86400000;

  function roundTo(num, decimals) { var f = Math.pow(10, decimals); return Math.round(num * f) / f; }
  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  var DECAY = -DEFAULT_W[20];
  var FACTOR = roundTo(Math.exp(Math.pow(DECAY, -1) * Math.log(0.9)) - 1, 8);
  var INTERVAL_MODIFIER = roundTo((Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1) / FACTOR, 8);

  // R(t,S) — probability of recall after t days at stability S.
  function forgettingCurve(elapsedDays, stability) {
    return roundTo(Math.pow(1 + FACTOR * elapsedDays / stability, DECAY), 8);
  }

  function initStability(w, g) { return Math.max(w[g - 1], 0.1); }
  function initDifficulty(w, g) { return roundTo(w[4] - Math.exp((g - 1) * w[5]) + 1, 8); }
  function linearDamping(deltaD, oldD) { return roundTo(deltaD * (10 - oldD) / 9, 8); }
  function meanReversion(w, init, current) { return roundTo(w[7] * init + (1 - w[7]) * current, 8); }
  function nextDifficulty(w, d, g) {
    var deltaD = -w[6] * (g - 3);
    var nextD = d + linearDamping(deltaD, d);
    return clamp(meanReversion(w, initDifficulty(w, 4), nextD), 1, 10);
  }
  function nextRecallStability(w, d, s, r, g) {
    var hardPenalty = g === 2 ? w[15] : 1;
    var easyBonus = g === 4 ? w[16] : 1;
    return roundTo(clamp(
      s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hardPenalty * easyBonus),
      S_MIN, S_MAX), 8);
  }
  function nextForgetStability(w, d, s, r) {
    return roundTo(clamp(
      w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]),
      S_MIN, S_MAX), 8);
  }

  // Memory-state step (long-term regime). mem = {stability, difficulty} | null (new item).
  // r may be precomputed (the cascade computes it ONCE from the pre-review stability, as the
  // reference scheduler does). g === 1 in long-term mode: S may only shrink (min vs pre-S).
  function nextDS(w, mem, t, g, r) {
    if (!mem) return { difficulty: clamp(initDifficulty(w, g), 1, 10), stability: initStability(w, g) };
    var d = mem.difficulty, s = mem.stability;
    r = typeof r === "number" ? r : forgettingCurve(t, s);
    var newS;
    if (g === 1) {
      var sAfterFail = nextForgetStability(w, d, s, r);
      newS = clamp(roundTo(s, 8), S_MIN, sAfterFail);
    } else {
      newS = nextRecallStability(w, d, s, r, g);
    }
    return { difficulty: nextDifficulty(w, d, g), stability: newS };
  }

  function baseInterval(s) { return Math.min(Math.max(1, Math.round(s * INTERVAL_MODIFIER)), MAXIMUM_INTERVAL); }

  // The reference computes DS + interval for ALL FOUR grades and enforces the ordering
  // cascade again ≤ hard < good < easy — a single grade's interval can be inflated purely
  // by the ordering (observable in the golden vectors), so the cascade is not optional.
  function step(w, mem, t, fuzzSeed) {
    var r = mem ? forgettingCurve(t, mem.stability) : null;
    var ds = { 1: nextDS(w, mem, t, 1, r), 2: nextDS(w, mem, t, 2, r), 3: nextDS(w, mem, t, 3, r), 4: nextDS(w, mem, t, 4, r) };
    var a = baseInterval(ds[1].stability), h = baseInterval(ds[2].stability),
        g = baseInterval(ds[3].stability), e = baseInterval(ds[4].stability);
    // T3: fuzz each RAW interval with ONE shared factor, exactly where the reference does it —
    // before the ordering cascade. With no seed this branch is skipped and the result is
    // byte-identical to the pinned long-term regime.
    if (fuzzSeed) {
      var factor = _alea(String(fuzzSeed))();
      a = _fuzzWith(a, t, factor, MAXIMUM_INTERVAL);
      h = _fuzzWith(h, t, factor, MAXIMUM_INTERVAL);
      g = _fuzzWith(g, t, factor, MAXIMUM_INTERVAL);
      e = _fuzzWith(e, t, factor, MAXIMUM_INTERVAL);
    }
    a = Math.min(a, h); h = Math.max(h, a + 1); g = Math.max(g, h + 1); e = Math.max(e, g + 1);
    return { ds: ds, ivl: { 1: a, 2: h, 3: g, 4: e } };
  }

  // Integer UTC calendar-day difference (reference semantics), clamped ≥ 0 (clock-skew guard —
  // the reference THROWS on t<0; we never do, recon M10).
  function utcDayDiff(lastMs, nowMs) {
    var l = new Date(lastMs), n = new Date(nowMs);
    var u1 = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate());
    var u2 = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    return Math.max(0, Math.floor((u2 - u1) / DAY_MS));
  }

  function _hasMemory(state) {
    return !!(state && typeof state.stability === "number" && state.stability > 0);
  }

  // ── T3: interval fuzz (ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02 §7.1) ─────────────────────
  // Anki fuzzes intervals so cards learned together stop returning together. Without it the queue
  // arrives in clumps, which was half of why the same words kept surfacing.
  //
  // The applied fuzz is RECORDED ON THE EVENT (review_log meta.fuzz_days) and applyRow prefers the
  // recorded value. That is what keeps replay(log) == stored across the switch-on: a pre-T3 row has
  // no field and replays UNFUZZED, byte-identical to what is already stored, so turning fuzz on
  // never reschedules the accumulated profile. A T3 row replays to exactly its own interval.
  // The offset is a fact about what the scheduler did at that moment — the same class of thing as
  // `grade` and `channel`, which the log already records.
  //
  // ENABLE_FUZZ decides only what NEW rows record; it never decides how a recorded row replays.
  // Transcribed byte-for-byte from ts-fsrs@5.4.1: FUZZ_RANGES, get_fuzz_range, and the alea PRNG
  // (Mash + Alea). Vectors are generated from that reference, never hand-written.
  var ENABLE_FUZZ = true;

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

  function _fuzzWith(interval, elapsedDays, factor, maximumInterval) {
    if (interval < 2.5) return Math.round(interval);
    var band = fuzzRange(interval, elapsedDays, maximumInterval);
    return Math.floor(factor * (band.max - band.min + 1) + band.min);
  }
  // The reference creates a FRESH alea per review and draws once, then applies that single
  // factor to every grade's raw interval BEFORE the ordering cascade — not to the cascade's
  // output. Fuzzing after the cascade diverges (measured: fuzz-hard-easy steps 2-4).
  function applyFuzz(interval, elapsedDays, seed, maximumInterval) {
    return _fuzzWith(interval, elapsedDays, _alea(String(seed))(), maximumInterval);
  }

  // The ONE scheduling step. state = null (never seen) | {stability, difficulty, reps, lapses,
  // lastReviewedAt} ; grade 1..4 ; nowMs = the review moment. Returns the full next state:
  //   intervalDays — the PRODUCT projection ((dueMs−now)/day; 0 for Again — mirrors today's
  //                  SM2-lite lapse and feeds the srs_interval legacy column, recon §3.4);
  //   refIntervalDays — the reference cascade interval (golden parity, reports).
  function nextState(state, grade, nowMs, opts) {
    var g = Math.min(4, Math.max(1, Math.round(Number(grade) || 1)));
    var now = Number(nowMs) || 0;
    var mem = _hasMemory(state) ? { stability: state.stability, difficulty: state.difficulty } : null;
    var t = mem && state.lastReviewedAt != null ? utcDayDiff(state.lastReviewedAt, now) : 0;
    var forced = (opts && opts.forceIntervalDays != null && isFinite(opts.forceIntervalDays))
      ? Math.round(Number(opts.forceIntervalDays)) : null;
    var useFuzz = !!(opts && opts.fuzz != null ? opts.fuzz : ENABLE_FUZZ);
    var seed = (forced == null && useFuzz && opts && opts.fuzzSeed) ? opts.fuzzSeed : null;
    var c = step(DEFAULT_W, mem, t, seed);
    var refPlain = seed ? step(DEFAULT_W, mem, t, null).ivl[g] : null;
    var ds = c.ds[g], refIvl = c.ivl[g];
    // T3 interval selection, in precedence order:
    //   1. opts.forceIntervalDays — a RECORDED fuzz from the log row: replay it exactly;
    //   2. fuzz — a new row on a fuzz-on build, seeded so it stays reproducible;
    //   3. the reference cascade interval — byte-identical to the pre-T3 engine.
    var ivl = forced != null ? forced : refIvl;
    var dueMs = g === 1 ? now : now + ivl * DAY_MS;   // product contract: Again → due NOW
    return {
      stability: ds.stability,
      difficulty: ds.difficulty,
      reps: ((state && state.reps) || 0) + 1,
      lapses: ((state && state.lapses) || 0) + (g === 1 && mem ? 1 : 0),   // first-ever Again is not a lapse (reference)
      lastReviewedAt: now,
      intervalDays: Math.round((dueMs - now) / DAY_MS),
      refIntervalDays: refPlain != null ? refPlain : refIvl,
      dueMs: dueMs,
    };
  }

  function initState(grade, nowMs) { return nextState(null, grade, nowMs); }

  function retrievability(state, nowMs) {
    if (!_hasMemory(state) || state.lastReviewedAt == null) return 0;
    return forgettingCurve(utcDayDiff(state.lastReviewedAt, Number(nowMs) || 0), state.stability);
  }

  function intervalFor(state) { return _hasMemory(state) ? baseInterval(state.stability) : 0; }
  function dueAt(state) {
    if (!_hasMemory(state) || state.lastReviewedAt == null) return null;
    return state.lastReviewedAt + intervalFor(state) * DAY_MS;
  }

  // SM2-lite → FSRS handover (recon §4.3, do-no-harm): interval>0 → S := interval (the
  // stability-at-90%-retention reading of an SM2 interval), D := D0(Good) — neutral default,
  // the reps/lapses heuristic was refuted (post-lapse reps = current-streak length, not
  // history). interval=0 (post-lapse hot rows — 6 of 37 on the owner's profile at P·0) →
  // initState(Again) floors. reps/lapses carry over. due is NOT produced here — lazy-seed
  // must never move a stored due (the caller keeps srs_due until the next real review).
  function seedFromSm2(legacy, nowMs) {
    var interval = Number(legacy && legacy.interval) || 0;
    var reps = Number(legacy && legacy.reps) || 0;
    var lapses = Number(legacy && legacy.lapses) || 0;
    var now = Number(nowMs) || 0;
    if (interval > 0) {
      return {
        stability: clamp(interval, S_MIN, S_MAX),
        difficulty: clamp(initDifficulty(DEFAULT_W, 3), 1, 10),
        reps: reps, lapses: lapses, lastReviewedAt: now,
        intervalDays: interval, refIntervalDays: interval, dueMs: null,
      };
    }
    return {
      stability: initStability(DEFAULT_W, 1),
      difficulty: clamp(initDifficulty(DEFAULT_W, 1), 1, 10),
      reps: reps, lapses: lapses, lastReviewedAt: now,
      intervalDays: 0, refIntervalDays: 0, dueMs: null,
    };
  }

  // The ONE log-row step shared by the live path (P2) and replay() — they cannot diverge by
  // construction. seed rows re-materialize state from their SM2 snapshot; review/skip rows
  // fold via nextState (a skip carries grade 1 and folds exactly like Again).
  function applyRow(state, row, opts) {
    if (!row) return state;
    var ts = Date.parse(row.reviewed_at || "") || 0;
    var meta = {};
    try { meta = typeof row.meta_json === "string" ? JSON.parse(row.meta_json) : (row.meta || {}); } catch (_) {}
    if (row.kind === "seed") return seedFromSm2(meta, ts);
    // T3 — prefer the RECORDED fuzz. A pre-T3 row has no meta.fuzz_days and replays unfuzzed,
    // byte-identical to what is stored, so switching fuzz on never reschedules the accumulated
    // profile. The (item_key, reps) seed is what made the live value reproducible; it stays as
    // the derivation for rows written by a fuzz-on build before the field existed.
    // The row's OWN recorded offset is the only fuzz replay ever applies. A row without one
    // replays unfuzzed, full stop — that is what makes switching fuzz on incapable of
    // rescheduling the accumulated profile. Re-deriving from a seed here would reintroduce
    // exactly the hazard this design removes.
    var recorded = (meta && meta.fuzz_days != null && isFinite(meta.fuzz_days)) ? Number(meta.fuzz_days) : null;
    return nextState(state, Number(row.grade) || 1, ts, { fuzz: false, forceIntervalDays: recorded });
  }

  // P7.0a (TELEGRAM_P7_DECISION_2026_07_06, критерии владельца 1–10): annul-семантика.
  // Правило владельца: annul НЕ удаляет событие — annul меняет ТОЛЬКО projection
  // (лог append-only, auditability). Сбор целей — по ВСЕМУ списку (annul-строка может
  // стоять раньше target-а по времени и до seed-watermark — двухпроходность делает
  // порядок неважным). Идемпотентность = Set (double-annul эквивалентен одному).
  // Un-annul НЕ поддерживается (annul-of-annul игнорируется — цель остаётся
  // аннулированной); исправление ошибочного annul = новое review-событие.
  function collectAnnulled(rows) {
    var out = {};
    var list = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row || row.kind !== "annul") continue;
      var meta = {};
      try { meta = typeof row.meta_json === "string" ? JSON.parse(row.meta_json) : (row.meta || {}); } catch (_) {}
      var target = meta && meta.annul_of != null ? String(meta.annul_of) : "";
      if (target) out[target] = 1;
    }
    return out;
  }
  // Аннулируются ТОЛЬКО фолдящиеся kinds (review/skip): seed не аннулируется (сдвиг
  // D3-watermark = потеря graded-истории), mark не аннулируется (у ручной оси LWW —
  // исправление = новый mark), annul не аннулируется (см. un-annul выше).
  function isAnnullableKind(kind) { return kind === "review" || kind === "skip"; }
  // Фильтр-помощник для читателей сырого лога вне fold-а (D1 grade-policy rows,
  // consumer-sweep P7.0a): те же правила исключения, что replay.
  function withoutAnnulled(rows) {
    var annulled = collectAnnulled(rows);
    var list = Array.isArray(rows) ? rows : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row) continue;
      if (isAnnullableKind(row.kind) && annulled[String(row.id)]) continue;
      out.push(row);
    }
    return out;
  }

  // Fold an item's ordered log rows (reviewed_at ASC, id ASC — getReviewLog's order) into its
  // state. Rows BEFORE the seed watermark are ignored for state (recon B4): the seed snapshot
  // subsumes them; they remain in the log for metrics.
  //
  // D3 (owner 2026-07-05, CLG-P3): a cross-device union can carry SEVERAL seed rows per item
  // (content-hashed seed ids). Watermark = the EARLIEST seed in (reviewed_at, id) order;
  // every LATER seed row is SKIPPED by the fold — honoring it would discard the graded history
  // after the first seed (earliest-wins, AI_MENTOR_RECON §14 D3). Single-seed logs (every log
  // minted before CLG-P3) fold byte-identically to the old "last seed" rule (first == last).
  // P7.0a: annulled review/skip rows are EXCLUDED from the fold (two-pass; do-no-harm: логи
  // без annul-строк дают пустой Set → фолд байт-идентичен прежнему). annul-строки сами по
  // себе state не меняют. Фолд per-item_key — annul обязан нести item_key target-а, иначе
  // он этот фолд не увидит (контракт минтера, no-op by construction).
  function replay(rows, opts) {
    var list = Array.isArray(rows) ? rows : [];
    var annulled = collectAnnulled(list);
    var start = -1;
    for (var i = 0; i < list.length; i++) { if (list[i] && list[i].kind === "seed") { start = i; break; } }
    var state = null;
    for (var j = (start >= 0 ? start : 0); j < list.length; j++) {
      var row = list[j];
      if (!row) continue;
      if (row.kind === "seed" && j !== start) continue;   // D3: later seeds skipped (earliest-wins)
      if (row.kind === "annul") continue;                  // annul — метасобытие проекции, не память
      if (row.kind === "mark") continue;                   // CLG-P3.2: manual-axis event — never memory
      if (isAnnullableKind(row.kind) && annulled[String(row.id)]) continue;   // P7.0a: аннулированный target исключён
      state = applyRow(state, row, opts);
    }
    return state;
  }

  return {
    ENGINE_VERSION: ENGINE_VERSION, GENERATION: GENERATION, REFERENCE: REFERENCE, SCHEME: SCHEME,
    DEFAULT_W: DEFAULT_W, REQUEST_RETENTION: REQUEST_RETENTION, MAXIMUM_INTERVAL: MAXIMUM_INTERVAL,
    S_MIN: S_MIN, S_MAX: S_MAX, ENABLE_FUZZ: ENABLE_FUZZ,
    fuzzRange: fuzzRange, applyFuzz: applyFuzz,
    roundTo: roundTo, clamp: clamp,
    forgettingCurve: forgettingCurve, utcDayDiff: utcDayDiff,
    initState: initState, nextState: nextState,
    retrievability: retrievability, intervalFor: intervalFor, dueAt: dueAt,
    seedFromSm2: seedFromSm2, applyRow: applyRow, replay: replay,
    collectAnnulled: collectAnnulled, withoutAnnulled: withoutAnnulled, isAnnullableKind: isAnnullableKind,
  };
});
