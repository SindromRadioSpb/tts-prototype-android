# Room Trainer T2 — Context Bank and Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop training a word in one frozen sentence forever, and let the learner aim a session at one text or one corpus — without ever forking a word's memory.

**Architecture:** One new device-local derived table `word_context` holds up to 8 verified occurrences per lemma, harvested from texts already on this device. The cross-text queue rotates through them by review count instead of re-serving the single pinned `srs_source` anchor. Scope is a **filter over that bank**, never a change to the due query: `getDueWithSource` stays source-neutral, and the Room intersects its result with the lemma keys that have a verified context inside the chosen scope.

**Tech Stack:** wa-sqlite over OPFS, vanilla ES5-style UMD JavaScript, Node 20 gates, Playwright for live-OPFS and screenshot evidence.

## Global Constraints

- Spec of record: `docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md`. Wave T2 = §6.
- **One memory per canonical lemma.** A scope filters what is *served*; it must never create a second FSRS state, a second `review_log` axis, or a per-scope schedule.
- **`word_context` is derived, never asserted.** It is never written to `review_log`, never synchronised (`public/js/cloud-sync.js` must not learn about it), and is fully rebuildable from local `texts`/`sentences`. Invalidation is a delete.
- **Every served sentence passes the canonical-keyer identity gate** (`_r2VerifyCandidate`'s rule: `card.lemmaKey === d.lemmaKey`, and for an unvocalised sentence the resolve must be decisive). A homograph is never substituted.
- **Migrations are append-only.** `public/db/db-worker.js:82` computes `version = i + 1`, so inserting anywhere but the end renumbers every later migration and re-runs it on existing profiles. The array currently holds 49 entries (indices 0–48, versions 1–49), so the new migration is **index 49 = version 50 = label `050_word_context`**.
- **`getDueWithSource` stays source-neutral.** `smoke:studio-room-srs` asserts it carries no `group_corpus`/`corpus_id`/`source_meta` reference; that assertion must keep passing.
- No `Math.random()` in selection; `nowMs`/`dayStr` stay injected.
- Every new UI string lands in all three locales.
- **Release moves SIX version stamps** (`docs/planning/PROD_INCIDENT_SW_INTEGRITY_AND_DISK_2026_09_02.md` §1.2): `APP_VERSION`, `CACHE_VERSION`, locale `?v=` in both shells, `#roomFooterVersion`, per-module `?v=` in the shell **and** the `sw.js` precache, and `SHELL_INTEGRITY_PATHS` in `server.js`. `smoke:train-queue` and `smoke:i18n` now enforce the last three.
- Baseline runtime: `3.11.457`.
- Gates that must stay green at every commit: `smoke:train-queue`, `smoke:fsrs`, `smoke:memory-canon`, `smoke:grade-policy`, `smoke:room-training-premium`, `smoke:studio-room-srs`, `smoke:reader-word-status`, `smoke:reader-morph`, `smoke:i18n`.

---

### Task 1: The `word_context` table and its single source classifier

**Files:**
- Modify: `public/db/migrations.js` (append index 49)
- Modify: `public/db/local-db.js` (add `_sourceClassSql`, `insertWordContexts`)
- Create: `scripts/premium/word-context-smoke.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `insertWordContexts(lemmaKey: string, rows: Array<{textKey, orderIndex, sentenceId, surface}>, keyerVersion: string) -> Promise<number>` — inserts up to the 8-per-lemma cap, deriving `source_class`/`corpus_id` in SQL; returns rows written.
  - `_sourceClassSql(alias: string) -> { cls: string, corpus: string }` — SQL expressions over a `texts` alias.

The classifier must be **one** expression consumed by both the harvester and the scope counter. Forking it would mean the "Ben-Yehuda" a counter reports and the "Ben-Yehuda" a session serves are different sets.

- [ ] **Step 1: Write the failing test**

Create `scripts/premium/word-context-smoke.js`:

```js
#!/usr/bin/env node
"use strict";
// smoke:word-context — T2 context bank + scope gate.
// Boots library.html against a real OPFS database (migration 050) and proves the bank's
// write path, its identity/cap rules, rotation determinism and the scope contract.
// Plan: docs/superpowers/plans/2026-09-02-room-trainer-t2-context-bank-and-scope.md

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3321, BASE = "http://127.0.0.1:" + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return;
  c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(ms = 20000) {
  const s = Date.now();
  while (Date.now() - s < ms) { try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {} await sleep(200); }
  return false;
}

(async () => {
  let pw; try { pw = require("playwright"); } catch (_) { console.error("no playwright"); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("server failed\n" + srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const failures = []; let checks = 0;
  const eq = (ok, m) => { checks++; if (!ok) failures.push(m); };
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("app.locale", "ru"); localStorage.setItem("localMode", "1"); } catch (_) {} });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/library.html?canon=skip", { waitUntil: "load" });

    const res = await pg.evaluate(async () => {
      const ldb = await import("/db/local-db.js");
      await ldb.initLocalDB();
      const out = {};

      // Three texts, one per source class.
      const defs = [
        { id: "wc-by", key: "wc:by:1", title: "BY", meta: { corpus: { schema: 1, byehuda_id: "by-1" } } },
        { id: "wc-song", key: "wc:song:1", title: "SONG", meta: { group_corpus: { schema: 1, corpus_id: "study-songs-pilot" } } },
        { id: "wc-mine", key: "wc:mine:1", title: "MINE", meta: { origin: "studio" } },
      ];
      for (const d of defs) {
        await ldb.createText({ id: d.id, text_key: d.key, title: d.title, source_text: "זֶה בַּיִת.", source_meta_json: JSON.stringify(d.meta) });
        for (let i = 0; i < 10; i++) {
          await ldb.addSentence(d.id, { id: d.id + "-s" + i, he_plain: "זה בית " + i, he_niqqud: "זֶה בַּיִת " + i, ru: "дом " + i });
        }
      }

      const LK = "pid:88800001";
      // 12 rows across the three texts — the cap is 8.
      const rows = [];
      for (let i = 0; i < 4; i++) rows.push({ textKey: "wc:by:1", orderIndex: i, sentenceId: "wc-by-s" + i, surface: "בית" });
      for (let i = 0; i < 4; i++) rows.push({ textKey: "wc:song:1", orderIndex: i, sentenceId: "wc-song-s" + i, surface: "בית" });
      for (let i = 0; i < 4; i++) rows.push({ textKey: "wc:mine:1", orderIndex: i, sentenceId: "wc-mine-s" + i, surface: "בית" });
      out.written = await ldb.insertWordContexts(LK, rows, "keyer-test-1");
      const stored = await ldb.getWordContexts(LK);
      out.count = stored.length;
      out.classes = Array.from(new Set(stored.map((x) => x.source_class))).sort().join(",");
      out.corpusIds = Array.from(new Set(stored.map((x) => x.corpus_id || ""))).sort().join(",");
      out.ordered = stored.map((x) => x.source_class + ":" + x.order_index).join("|");

      // Idempotence: the same rows again must not duplicate.
      await ldb.insertWordContexts(LK, rows, "keyer-test-1");
      out.countAfterRepeat = (await ldb.getWordContexts(LK)).length;

      // An unknown text_key must be refused (no orphan context).
      out.orphan = await ldb.insertWordContexts(LK, [{ textKey: "wc:nope:1", orderIndex: 0, sentenceId: "x", surface: "בית" }], "keyer-test-1");

      // Keyer invalidation wipes the bank for that lemma.
      out.staleDropped = await ldb.dropStaleWordContexts("keyer-test-2");
      out.countAfterKeyerBump = (await ldb.getWordContexts(LK)).length;

      await ldb.dbRun("DELETE FROM word_context WHERE lemma_key = ?", [LK]);
      for (const d of defs) { try { await ldb.deleteText(d.id); } catch (_) {} }
      return out;
    });

    eq(res.written === 8, "insertWordContexts must cap at 8 rows per lemma, wrote " + res.written);
    eq(res.count === 8, "the bank must hold exactly the capped rows, got " + res.count);
    eq(res.classes === "byehuda,group,mytext",
      "source_class must be derived in SQL for all three text kinds, got " + res.classes);
    eq(/study-songs-pilot/.test(res.corpusIds), "a group text must carry its corpus_id, got " + res.corpusIds);
    eq(res.ordered.indexOf("byehuda:0") === 0,
      "contexts must come back in the deterministic (source_class, text_key, order_index) order, got " + res.ordered);
    eq(res.countAfterRepeat === 8, "re-inserting the same rows must not duplicate, got " + res.countAfterRepeat);
    eq(res.orphan === 0, "a context for an unknown text_key must be refused, wrote " + res.orphan);
    eq(res.countAfterKeyerBump === 0, "a keyer-version bump must invalidate the bank, got " + res.countAfterKeyerBump);
    eq(errs.length === 0, "no pageerror, got: " + errs.join(" | "));

    if (failures.length) {
      console.error(`word-context-smoke: FAIL ${failures.length}/${checks}`);
      failures.forEach((f) => console.error("  ✗ " + f));
      await b.close(); await stop(srv.c); process.exit(1);
    }
    console.log(`word-context-smoke: PASS ${checks}/${checks}`);
  } finally { await b.close(); await stop(srv.c); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
```

Register in `package.json` scripts, after `"smoke:train-queue"`:

```json
    "smoke:word-context": "node scripts/premium/word-context-smoke.js",
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:word-context`
Expected: FAIL — `ldb.insertWordContexts is not a function`.

- [ ] **Step 3: Append the migration**

In `public/db/migrations.js`, append as the LAST array element (index 49 → version 50), directly before the closing `];`:

```js
  // 050_word_context — Room Trainer T2 (ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02 §6).
  // DEVICE-LOCAL DERIVED cache of verified occurrences of a scheduled word, so the cross-text
  // queue can rotate a word through DIFFERENT real sentences instead of re-serving the single
  // pinned word_status.srs_* anchor for ever (encoding specificity, R2).
  //
  // Derived, never asserted: nothing here is an event, nothing syncs, and every row is
  // rebuildable from the local texts/sentences tables. Invalidation is a DELETE — a keyer
  // bump drops the bank and it refills from reading. `surface` is the verified inflected form
  // in THAT sentence, so rotation can re-cloze without re-resolving.
  `CREATE TABLE IF NOT EXISTS word_context (
    lemma_key     TEXT NOT NULL,
    text_key      TEXT NOT NULL,
    order_index   INTEGER NOT NULL,
    sentence_id   TEXT,
    surface       TEXT NOT NULL,
    source_class  TEXT NOT NULL CHECK(source_class IN ('mytext','byehuda','public','group')),
    corpus_id     TEXT,
    keyer_version TEXT NOT NULL,
    verified_at   TEXT NOT NULL,
    PRIMARY KEY (lemma_key, text_key, order_index)
  );
  CREATE INDEX IF NOT EXISTS ix_word_context_lemma ON word_context(lemma_key, source_class);
  CREATE INDEX IF NOT EXISTS ix_word_context_scope ON word_context(source_class, corpus_id, lemma_key);
  CREATE INDEX IF NOT EXISTS ix_word_context_keyer ON word_context(keyer_version);`,
```

- [ ] **Step 4: Add the classifier and the writer**

In `public/db/local-db.js`, insert after `getDayGradeCounts`:

```js
// T2 — the ONE source classifier. Extends the convention already used by
// _PERSONAL_TEXT_PREDICATE and _b6MediaKindSql: read source_meta_json defensively, then
// discriminate. Consumed by BOTH the context harvester and the scope counter — forking it would
// mean the "Ben-Yehuda" a counter reports and the "Ben-Yehuda" a session serves are different sets.
function _sourceClassSql(alias) {
  const safe = `CASE WHEN json_valid(${alias}.source_meta_json) THEN ${alias}.source_meta_json ELSE '{}' END`;
  return {
    cls: `CASE
            WHEN json_type(${safe}, '$.group_corpus')  IS NOT NULL THEN 'group'
            WHEN json_type(${safe}, '$.public_corpus') IS NOT NULL THEN 'public'
            WHEN json_type(${safe}, '$.corpus')        IS NOT NULL THEN 'byehuda'
            ELSE 'mytext'
          END`,
    corpus: `COALESCE(
               json_extract(${safe}, '$.group_corpus.corpus_id'),
               json_extract(${safe}, '$.public_corpus.slug'),
               json_extract(${safe}, '$.corpus.byehuda_id')
             )`,
  };
}

const WORD_CONTEXT_CAP = 8;   // per lemma — enough to break sentence-memory, small enough to stay cheap

// T2 — record verified occurrences of one lemma. source_class/corpus_id are derived IN SQL from
// the joined text, so a row can only exist for a text this device actually holds (an unknown
// text_key inserts nothing — no orphan contexts). Idempotent on (lemma_key, text_key, order_index).
export async function insertWordContexts(lemmaKey, rows, keyerVersion) {
  const lk = String(lemmaKey || "").trim();
  const kv = String(keyerVersion || "").trim();
  const list = Array.isArray(rows) ? rows : [];
  if (!lk || !kv || !list.length) return 0;
  const { cls, corpus } = _sourceClassSql("t");
  let written = 0;
  try {
    const existing = await q(`SELECT COUNT(*) AS n FROM word_context WHERE lemma_key = ?`, [lk]);
    let room = WORD_CONTEXT_CAP - (Number(existing && existing[0] && existing[0].n) || 0);
    for (const row of list) {
      if (room <= 0) break;
      const tk = String((row && row.textKey) || "").trim();
      const surface = String((row && row.surface) || "").trim();
      const oix = row && row.orderIndex != null ? Number(row.orderIndex) : null;
      if (!tk || !surface || oix == null || !Number.isFinite(oix)) continue;
      const before = await q(`SELECT COUNT(*) AS n FROM word_context WHERE lemma_key = ?`, [lk]);
      await r(
        `INSERT OR IGNORE INTO word_context
           (lemma_key, text_key, order_index, sentence_id, surface, source_class, corpus_id, keyer_version, verified_at)
         SELECT ?, t.text_key, ?, ?, ?, ${cls}, ${corpus}, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')
           FROM texts t WHERE t.text_key = ? AND t.is_archived = 0`,
        [lk, oix, row.sentenceId != null ? String(row.sentenceId) : null, surface, kv, tk]);
      const after = await q(`SELECT COUNT(*) AS n FROM word_context WHERE lemma_key = ?`, [lk]);
      if ((Number(after[0].n) || 0) > (Number(before[0].n) || 0)) { written++; room--; }
    }
    return written;
  } catch (_) { return written; }
}

// Contexts for one lemma, in the deterministic order the rotation walks.
export async function getWordContexts(lemmaKey) {
  const lk = String(lemmaKey || "").trim();
  if (!lk) return [];
  try {
    return (await q(
      `SELECT wc.*, t.title AS text_title
         FROM word_context wc
         LEFT JOIN texts t ON t.text_key = wc.text_key AND t.is_archived = 0
        WHERE wc.lemma_key = ?
        ORDER BY wc.source_class ASC, wc.text_key ASC, wc.order_index ASC`, [lk])) || [];
  } catch (_) { return []; }
}

// A canonical-keyer bump invalidates the whole bank: the rows were keyed by a resolver contract
// that no longer holds. Derived data, so invalidation is a delete and reading refills it.
export async function dropStaleWordContexts(currentKeyerVersion) {
  const kv = String(currentKeyerVersion || "").trim();
  if (!kv) return 0;
  try {
    const before = await q(`SELECT COUNT(*) AS n FROM word_context`, []);
    await r(`DELETE FROM word_context WHERE keyer_version <> ?`, [kv]);
    const after = await q(`SELECT COUNT(*) AS n FROM word_context`, []);
    return Math.max(0, (Number(before[0].n) || 0) - (Number(after[0].n) || 0));
  } catch (_) { return 0; }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run smoke:word-context`
Expected: PASS 9/9.

- [ ] **Step 6: Prove the migration did not renumber anything**

Run: `npm run smoke:memory-canon`
Expected: PASS 79/79. This gate opens a real OPFS database and asserts migrations 041/042 semantics; a renumbering would break it.

- [ ] **Step 7: Commit**

```bash
git add public/db/migrations.js public/db/local-db.js scripts/premium/word-context-smoke.js package.json
git commit -m "feat(room): add the device-local word_context bank with one SQL source classifier"
```

---

### Task 2: Scope reads

**Files:**
- Modify: `public/db/local-db.js`
- Modify: `scripts/premium/word-context-smoke.js`

**Interfaces:**
- Consumes: `_sourceClassSql`, `word_context` (Task 1).
- Produces:
  - `getScopeCounts(nowMs: number) -> Promise<Array<{ id, source_class, corpus_id, title, due }>>` — one row per scope that actually has due words.
  - `getScopedLemmaKeys(scope: {kind, value}) -> Promise<string[]>` — lemma keys with at least one verified context inside the scope. `kind` is `'all' | 'text' | 'class' | 'corpus'`.

`getDueWithSource` is **not** touched: scope is an intersection applied by the Room, so the due query stays source-neutral and `smoke:studio-room-srs` keeps protecting that.

- [ ] **Step 1: Write the failing test**

In `scripts/premium/word-context-smoke.js`, inside the `pg.evaluate` block, before the cleanup lines, add:

```js
      // ── scope reads ───────────────────────────────────────────────────────
      const SK1 = "pid:88800101", SK2 = "pid:88800102", SK3 = "pid:88800103";
      const now = Date.now();
      // SK1 lives only in Ben-Yehuda, SK2 only in the song corpus, SK3 in both.
      await ldb.insertWordContexts(SK1, [{ textKey: "wc:by:1", orderIndex: 5, sentenceId: "wc-by-s5", surface: "בית" }], "keyer-test-2");
      await ldb.insertWordContexts(SK2, [{ textKey: "wc:song:1", orderIndex: 5, sentenceId: "wc-song-s5", surface: "בית" }], "keyer-test-2");
      await ldb.insertWordContexts(SK3, [
        { textKey: "wc:by:1", orderIndex: 6, sentenceId: "wc-by-s6", surface: "בית" },
        { textKey: "wc:song:1", orderIndex: 6, sentenceId: "wc-song-s6", surface: "בית" },
      ], "keyer-test-2");
      for (const k of [SK1, SK2, SK3]) {
        await ldb.setWordStatus(k, "l2", { due: now - 86400000, interval: 3, reps: 2, lapses: 0 }, null);
      }
      out.scopeAll = (await ldb.getScopedLemmaKeys({ kind: "all" })).filter((x) => x.indexOf("pid:888001") === 0).sort().join(",");
      out.scopeBy = (await ldb.getScopedLemmaKeys({ kind: "class", value: "byehuda" })).filter((x) => x.indexOf("pid:888001") === 0).sort().join(",");
      out.scopeSong = (await ldb.getScopedLemmaKeys({ kind: "corpus", value: "study-songs-pilot" })).filter((x) => x.indexOf("pid:888001") === 0).sort().join(",");
      out.scopeText = (await ldb.getScopedLemmaKeys({ kind: "text", value: "wc:song:1" })).filter((x) => x.indexOf("pid:888001") === 0).sort().join(",");
      const counts = await ldb.getScopeCounts(now);
      out.countsShape = counts.every((c) => c.id && typeof c.due === "number");
      out.byDue = (counts.find((c) => c.source_class === "byehuda") || {}).due;
      out.songDue = (counts.find((c) => c.corpus_id === "study-songs-pilot") || {}).due;
      for (const k of [SK1, SK2, SK3]) { await ldb.setWordStatus(k, ""); await ldb.dbRun("DELETE FROM word_context WHERE lemma_key = ?", [k]); }
```

Add the assertions next to the others:

```js
    eq(res.scopeAll === "pid:88800101,pid:88800102,pid:88800103", "scope 'all' must return every banked lemma, got " + res.scopeAll);
    eq(res.scopeBy === "pid:88800101,pid:88800103", "a class scope must return only lemmas with a context in that class, got " + res.scopeBy);
    eq(res.scopeSong === "pid:88800102,pid:88800103", "a corpus scope must return only lemmas with a context in that corpus, got " + res.scopeSong);
    eq(res.scopeText === "pid:88800102,pid:88800103", "a text scope must return only lemmas with a context in that text, got " + res.scopeText);
    eq(res.countsShape === true, "every scope count row must carry an id and a numeric due");
    eq(res.byDue === 2, "the Ben-Yehuda scope must report 2 due words, got " + res.byDue);
    eq(res.songDue === 2, "the song-corpus scope must report 2 due words, got " + res.songDue);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:word-context`
Expected: FAIL — `ldb.getScopedLemmaKeys is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `public/db/local-db.js` after `dropStaleWordContexts`:

```js
// T2 — the lemma keys that have at least one VERIFIED context inside a scope. This is the whole
// scope mechanism: membership is a property of the context bank, so getDueWithSource stays
// source-neutral and no second schedule can ever exist for a word.
//   { kind: 'all' }                          — every banked lemma
//   { kind: 'text',   value: <text_key> }    — one work
//   { kind: 'class',  value: 'byehuda' | 'mytext' | 'group' | 'public' }
//   { kind: 'corpus', value: <corpus_id> }   — one corpus inside a class
export async function getScopedLemmaKeys(scope) {
  const kind = String((scope && scope.kind) || "all");
  const value = scope && scope.value != null ? String(scope.value) : "";
  let where = "", params = [];
  if (kind === "text") { where = "WHERE text_key = ?"; params = [value]; }
  else if (kind === "class") { where = "WHERE source_class = ?"; params = [value]; }
  else if (kind === "corpus") { where = "WHERE corpus_id = ?"; params = [value]; }
  else if (kind !== "all") return [];
  try {
    const rows = await q(`SELECT DISTINCT lemma_key FROM word_context ${where}`, params);
    return (rows || []).map((x) => String(x.lemma_key || "")).filter(Boolean);
  } catch (_) { return []; }
}

// T2 — one row per scope that actually has due words, so the launch screen offers only scopes
// worth choosing. Counts come from the SAME bank the session is served from.
export async function getScopeCounts(nowMs) {
  const now = new Date(Number(nowMs) || 0).toISOString();
  try {
    const rows = await q(
      `SELECT wc.source_class, wc.corpus_id, COUNT(DISTINCT wc.lemma_key) AS due
         FROM word_context wc
         JOIN word_status w ON w.lemma_key = wc.lemma_key
        WHERE w.srs_due IS NOT NULL AND w.srs_due <= ? AND w.status != 'ignore'
        GROUP BY wc.source_class, wc.corpus_id`, [now]);
    const titles = await q(
      `SELECT DISTINCT wc.source_class, wc.corpus_id, t.title
         FROM word_context wc LEFT JOIN texts t ON t.text_key = wc.text_key
        WHERE wc.corpus_id IS NOT NULL`, []);
    const titleFor = Object.create(null);
    for (const t of (titles || [])) if (t && t.corpus_id) titleFor[String(t.corpus_id)] = String(t.title || "");
    return (rows || []).map((x) => ({
      id: x.corpus_id ? "corpus:" + x.corpus_id : "class:" + x.source_class,
      source_class: String(x.source_class || ""),
      corpus_id: x.corpus_id != null ? String(x.corpus_id) : null,
      title: x.corpus_id ? (titleFor[String(x.corpus_id)] || "") : "",
      due: Number(x.due) || 0,
    })).filter((x) => x.due > 0);
  } catch (_) { return []; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run smoke:word-context`
Expected: PASS 16/16.

- [ ] **Step 5: Confirm the due query is still source-neutral**

Run: `npm run smoke:studio-room-srs`
Expected: PASS — including "due query has no source quota/filter".

- [ ] **Step 6: Commit**

```bash
git add public/db/local-db.js scripts/premium/word-context-smoke.js
git commit -m "feat(room): read scopes from the context bank, leaving the due query source-neutral"
```

---

### Task 3: Deterministic context rotation

**Files:**
- Modify: `public/js/train-queue.js`
- Modify: `scripts/premium/train-queue-smoke.js`

**Interfaces:**
- Consumes: `TrainQueue` (T1).
- Produces: `TrainQueue.pickContext(contexts: Array, reps: number) -> object | null` — walks the list by review count.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js` before the final failure block:

```js
// ── Suite 13: context rotation (T2) ──────────────────────────────────────────
const ctxs = [{ id: "a" }, { id: "b" }, { id: "c" }];
check(TQ.pickContext(ctxs, 0).id === "a", "reps 0 must serve the first context");
check(TQ.pickContext(ctxs, 1).id === "b", "reps 1 must serve the second context");
check(TQ.pickContext(ctxs, 2).id === "c", "reps 2 must serve the third context");
check(TQ.pickContext(ctxs, 3).id === "a", "rotation must wrap around");
check(TQ.pickContext(ctxs, 7).id === "b", "rotation must be reps modulo length");
check(TQ.pickContext([{ id: "only" }], 5).id === "only", "a single-context word is unchanged by rotation");
check(TQ.pickContext([], 0) === null, "no contexts yields null, never a fabricated one");
check(TQ.pickContext(null, 0) === null, "a null context list yields null");
check(TQ.pickContext(ctxs, -3).id === "a", "a negative rep count must not throw or index out of range");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL — `TQ.pickContext is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `public/js/train-queue.js`, add before the `return` block:

```js
  // T2 — context rotation. Serving the SAME sentence on every review measures sentence memory,
  // not word knowledge (R2, encoding specificity). The caller supplies the bank in its stable
  // (source_class, text_key, order_index) order, so consecutive reviews walk to a different text
  // without storing any extra state.
  function pickContext(contexts, reps) {
    if (!Array.isArray(contexts) || !contexts.length) return null;
    var n = contexts.length;
    var i = Math.floor(Number(reps) || 0) % n;
    if (i < 0) i += n;
    return contexts[i];
  }
```

Add `pickContext: pickContext` to the `return` block.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run smoke:train-queue`
Expected: PASS with Suite 13 green.

- [ ] **Step 5: Commit**

```bash
git add public/js/train-queue.js scripts/premium/train-queue-smoke.js
git commit -m "feat(room): rotate a word through its banked contexts by review count"
```

---

### Task 4: Harvest on every graded answer

**Files:**
- Modify: `public/js/library-ui.js` (`checkTrainAnswer`, around `:3707`)
- Modify: `scripts/premium/word-context-smoke.js`

**Interfaces:**
- Consumes: `insertWordContexts` (Task 1).
- Produces: `_harvestContexts(item) -> Promise<number>` in `library-ui.js`.

Harvest rides the grade path because that is the one place already holding a verified anchor: `commitReviewAttempt({..., source: item._source})`. Two shapes:

- open-text — `item.occ` holds up to 8 occurrences (`{rowIdx, wordOffset}`) already resolved and identity-gated by `_scanWords`; `readerRows[rowIdx]` carries `_v3_sentenceId` / `_v3_orderIndex`, and `readerTextKey` names the work. All of them are written. Free: no extra resolution, no extra query.
- cross-text — the single served `item._source`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/word-context-smoke.js`, in the assertions section:

```js
    eq(/async function _harvestContexts\s*\(/.test(require("fs").readFileSync(path.join(REPO, "public/js/library-ui.js"), "utf8")),
      "the Room must harvest contexts on a graded answer");
    eq(/_harvestContexts\(item\)/.test(require("fs").readFileSync(path.join(REPO, "public/js/library-ui.js"), "utf8")),
      "the harvest must be called from the grade path");
```

Add at the top of the file, next to the other requires: `const fs = require("fs");` and use `fs.readFileSync` in place of the inline requires.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:word-context`
Expected: FAIL on both new assertions.

- [ ] **Step 3: Write minimal implementation**

In `public/js/library-ui.js`, insert before `async function checkTrainAnswer(`:

```js
// T2 — harvest verified occurrences of the answered word into the context bank. Rides the grade
// path because that is the ONE place already holding an identity-gated anchor. Nothing here is
// an event and nothing syncs: the bank is a derived cache, so a failure is silent and harmless —
// the next answer refills it.
async function _harvestContexts(item) {
  if (!item || !item.lemmaKey || !localDb.insertWordContexts) return 0;
  const LC = window.LemmaCanon;
  const keyer = (LC && LC.KEYER_VERSION) || '';
  if (!keyer) return 0;
  const rows = [];
  // Open-text: every occurrence _scanWords already resolved for this word in the open work.
  if (Array.isArray(item.occ) && item.occ.length && readerTextKey) {
    for (const o of item.occ) {
      const r = readerRows[o && o.rowIdx];
      if (!r || r._v3_orderIndex == null) continue;
      rows.push({ textKey: readerTextKey, orderIndex: Number(r._v3_orderIndex),
        sentenceId: r._v3_sentenceId != null ? String(r._v3_sentenceId) : null,
        surface: String(item.surface || '') });
    }
  }
  // Cross-text: the anchor actually served this round.
  const s = item._source;
  if (s && s.textKey && s.orderIndex != null && s.surface) {
    rows.push({ textKey: String(s.textKey), orderIndex: Number(s.orderIndex),
      sentenceId: s.sentenceId != null ? String(s.sentenceId) : null, surface: String(s.surface) });
  }
  if (!rows.length) return 0;
  try { return await localDb.insertWordContexts(item.lemmaKey, rows, keyer); } catch (_) { return 0; }
}
```

In `checkTrainAnswer`, directly after the successful-commit guard (the block that ends `return;` when `!commitResult.committed`), add:

```js
  // T2 — the bank grows from real study, not from a crawl. Deliberately after the commit: a
  // derived cache must never be able to fail a canonical write.
  try { await _harvestContexts(item); } catch (_) {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run smoke:word-context && npm run smoke:room-training-premium`
Expected: both PASS. `room-training-premium` proves the grade path's transactional contract is unchanged.

- [ ] **Step 5: Commit**

```bash
git add public/js/library-ui.js scripts/premium/word-context-smoke.js
git commit -m "feat(room): harvest verified contexts from every graded answer"
```

---

### Task 5: Serve a rotated context in the cross-text queue

**Files:**
- Modify: `public/js/library-ui.js` (`_buildDueSourcedItems`)
- Modify: `scripts/premium/word-context-smoke.js`

**Interfaces:**
- Consumes: `getWordContexts` (Task 1), `TrainQueue.pickContext` (Task 3).
- Produces: `_bankedContextFor(d) -> Promise<{sent, cz, card, ctx} | null>` in `library-ui.js`.

The bank is tried **first**; the stored `srs_source` anchor stays as the fallback, and the R2 ladder stays behind that. With an empty bank the behaviour is byte-for-byte today's. Every banked candidate passes the same identity gate as a stored anchor — a bank row is a hint, never a licence to skip verification.

- [ ] **Step 1: Write the failing test**

Append to the assertions in `scripts/premium/word-context-smoke.js`:

```js
    const roomSrc = fs.readFileSync(path.join(REPO, "public/js/library-ui.js"), "utf8");
    eq(/async function _bankedContextFor\s*\(/.test(roomSrc), "the Room must resolve a banked context for a due word");
    eq(/TrainQueue[\s\S]{0,80}pickContext|pickContext\(/.test(roomSrc), "the banked context must be chosen by the pure rotation helper");
    const buildBody = (roomSrc.match(/async function _buildDueSourcedItems[\s\S]*?\n}\n/) || [""])[0];
    eq(/_bankedContextFor/.test(buildBody), "the cross-text builder must try the bank before the pinned anchor");
    eq(/card\.lemmaKey !== d\.lemmaKey|card\.lemmaKey\s*!==\s*d\.lemmaKey/.test(buildBody),
      "the identity gate must still guard every served sentence");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:word-context`
Expected: FAIL on the four new assertions.

- [ ] **Step 3: Write minimal implementation**

In `public/js/library-ui.js`, insert before `async function _buildDueSourcedItems(`:

```js
// T2 — pick this review's context from the bank. Rotation is by the word's own review count, so
// consecutive reviews walk to a different text (R2: repeated success on ONE sentence measures
// sentence memory). A banked row is a HINT, never a licence to skip verification: the chosen
// sentence passes exactly the identity gate a stored anchor passes.
async function _bankedContextFor(d) {
  const R = window.ReaderMorph, TQ = window.TrainQueue;
  if (!R || !TQ || !localDb.getWordContexts) return null;
  let bank = [];
  try { bank = (await localDb.getWordContexts(d.lemmaKey)) || []; } catch (_) { return null; }
  if (bank.length < 2) return null;   // one context is what the pinned anchor already gives
  const reps = (d.srs && Number(d.srs.reps)) || 0;
  // Walk from the rotation slot so a dead or unverifiable row degrades to the next one rather
  // than silently dropping the word back to its frozen anchor.
  for (let step = 0; step < bank.length; step++) {
    const ctx = TQ.pickContext(bank, reps + step);
    if (!ctx) break;
    let sent = null;
    try { sent = await localDb.getSentenceForReview(ctx.sentence_id, ctx.text_key, ctx.order_index); } catch (_) { sent = null; }
    if (!sent) continue;
    const heN = String(sent.he_niqqud || sent.he_plain || sent.he || '');
    if (!heN) continue;
    const cz = R.buildClozeForTarget(R.tokenize(heN), R.stripNiqqud(String(ctx.surface || '')));
    if (!cz) continue;
    let card = null;
    try { card = await R.resolveWordLight(R.stripNiqqud(String(ctx.surface || '')), cz.answer); } catch (_) { card = null; }
    if (!card || card.lemmaKey !== d.lemmaKey) continue;
    if (!_HEB_VOWELED_RE.test(cz.answer || '') && card.label !== 'exact') continue;
    return { ctx, cz, card, heN, sent };
  }
  return null;
}
```

In `_buildDueSourcedItems`, replace the opening of the per-word loop body — the lines

```js
    if (!d.source || !d.source.surface) { if (ladder) laddered.push(d); continue; }   // never-sourced → R2 ladder
```

with

```js
    // T2 — the bank first: a word with several verified contexts rotates through them instead of
    // being re-served its one frozen anchor for ever.
    const banked = await _bankedContextFor(d);
    if (banked) {
      items.push({
        lemmaKey: d.lemmaKey, surface: banked.ctx.surface,
        niqqud: (banked.card && banked.card.niqqud) || banked.cz.answer || '',
        gloss: (banked.card && (banked.card.meaning || banked.card.gloss)) || '',
        root: (banked.card && banked.card.root) || '', pos: (banked.card && banked.card.pos) || '',
        status: d.status, _srs: d.srs, _card: banked.card,
        _source: { textKey: banked.ctx.text_key, sentenceId: banked.ctx.sentence_id,
          orderIndex: banked.ctx.order_index, surface: banked.ctx.surface,
          title: banked.ctx.text_title || null },
        _built: { cz: banked.cz, ru: banked.sent.ru || '', sentence: banked.heN,
          audioAssetKey: String(banked.sent.audio_asset_key || ''), rowIdx: null },
      });
      continue;
    }
    if (!d.source || !d.source.surface) { if (ladder) laddered.push(d); continue; }   // never-sourced → R2 ladder
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run smoke:word-context && npm run smoke:room-training-premium && npm run smoke:studio-room-srs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/library-ui.js scripts/premium/word-context-smoke.js
git commit -m "fix(room): rotate a due word through its banked contexts instead of one frozen sentence"
```

---

### Task 6: Bounded backfill for words the bank has not met

**Files:**
- Modify: `public/js/library-ui.js`
- Modify: `scripts/premium/word-context-smoke.js`

**Interfaces:**
- Consumes: `insertWordContexts` (Task 1), `findSentencesForWords` + `_r2VerifyCandidate` (existing).
- Produces: `_backfillContexts(due, opts) -> Promise<number>` in `library-ui.js`.

Words scheduled before T2 have at most their pinned anchor. The backfill reuses the R2 pipeline that already exists for healing unsourced words — the same batched `LIKE` prefilter, the same identity gate, the same 7-day negative cache — and is budgeted so a session never stalls behind it.

- [ ] **Step 1: Write the failing test**

Append to the assertions in `scripts/premium/word-context-smoke.js`:

```js
    eq(/async function _backfillContexts\s*\(/.test(roomSrc), "the Room must backfill contexts for pre-T2 words");
    const backfillBody = (roomSrc.match(/async function _backfillContexts[\s\S]*?\n}\n/) || [""])[0];
    eq(/_r2VerifyCandidate/.test(backfillBody), "the backfill must reuse the canonical identity-gated verifier");
    eq(/findSentencesForWords/.test(backfillBody), "the backfill must reuse the batched sentence prefilter");
    eq(/_r2MissGet|_r2MissFresh/.test(backfillBody), "the backfill must honour the negative-scan cache");
    eq(/BACKFILL_BUDGET|backfillBudget/.test(roomSrc), "the backfill must be budgeted so a session never stalls behind it");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:word-context`
Expected: FAIL on the five new assertions.

- [ ] **Step 3: Write minimal implementation**

In `public/js/library-ui.js`, insert after `_bankedContextFor`:

```js
const BACKFILL_BUDGET = 6;   // words per session — bounded like the R2 scan budget
// T2 — grow the bank for words scheduled before it existed (they carry at most their pinned
// anchor). Reuses the R2 re-source pipeline verbatim: one batched LIKE prefilter, the canonical
// identity gate, and the 7-day per-word negative cache so a permanently-unhealable word cannot
// monopolise the budget. Best-effort and silent: the bank is derived, and reading refills it.
async function _backfillContexts(due, opts) {
  const R = window.ReaderMorph, LC = window.LemmaCanon;
  const keyer = (LC && LC.KEYER_VERSION) || '';
  if (!R || !keyer || !localDb.getWordContexts || !localDb.insertWordContexts) return 0;
  const budget = Number((opts && opts.backfillBudget) != null ? opts.backfillBudget : BACKFILL_BUDGET) || 0;
  if (budget <= 0) return 0;
  const miss = _r2MissGet();
  const targets = [];
  for (const d of (due || [])) {
    if (targets.length >= budget) break;
    if (!d || !d.lemmaKey || _r2MissFresh(miss, 'bf:' + d.lemmaKey)) continue;
    let have = [];
    try { have = (await localDb.getWordContexts(d.lemmaKey)) || []; } catch (_) { have = []; }
    if (have.length >= 3) continue;   // enough variety already
    const surface = (d.source && d.source.surface) ? R.stripNiqqud(String(d.source.surface)) : (await _r2DeriveSurface(d.lemmaKey));
    if (!surface) continue;
    targets.push({ d, surface, needles: _r4NeedlesFor(surface, await _r2PidEntry(d.lemmaKey)) });
  }
  if (!targets.length) return 0;
  const needles = [];
  for (const t of targets) for (const n of t.needles) if (needles.indexOf(n) < 0 && needles.length < 90) needles.push(n);
  let rows = [];
  try { rows = (await localDb.findSentencesForWords(needles, 400)) || []; } catch (_) { rows = []; }
  let written = 0;
  for (const t of targets) {
    const found = [];
    for (const row of rows) {
      if (found.length >= 4) break;
      const hp = String(row.he_plain || '');
      if (!t.needles.some((n) => hp.indexOf(n) >= 0)) continue;
      let hit = null;
      try { hit = await _r2VerifyCandidate(R, t.d, t.needles, row); } catch (_) { hit = null; }
      if (!hit) continue;
      found.push({ textKey: row.text_key, orderIndex: row.order_index != null ? Number(row.order_index) : null,
        sentenceId: row.id != null ? String(row.id) : null, surface: hit.tskel });
    }
    if (found.length) {
      try { written += await localDb.insertWordContexts(t.d.lemmaKey, found, keyer); } catch (_) {}
    } else {
      _r2MissMark(miss, 'bf:' + t.d.lemmaKey);
    }
  }
  return written;
}
```

In `startDueReview`, immediately after the `due` list is fetched and before `_composeDueSession`, add:

```js
  // T2 — top up the bank for a few pre-T2 words before composing, so rotation reaches them.
  try { await _backfillContexts(due, { backfillBudget: BACKFILL_BUDGET }); } catch (_) {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run smoke:word-context && npm run smoke:memory-canon`
Expected: both PASS. `memory-canon` proves the R2 helpers still behave.

- [ ] **Step 5: Commit**

```bash
git add public/js/library-ui.js scripts/premium/word-context-smoke.js
git commit -m "feat(room): backfill contexts for words scheduled before the bank existed"
```

---

### Task 7: Scope selector on the launch screen

**Files:**
- Modify: `public/js/library-ui.js` (`renderTrainLaunch`, `_composeDueSession`, the sheet delegate)
- Modify: `public/library.html` (CSS)
- Modify: `public/i18n/locales/{ru,en,he}.js`
- Modify: `scripts/premium/train-queue-smoke.js`

**Interfaces:**
- Consumes: `getScopeCounts`, `getScopedLemmaKeys` (Task 2); `renderTrainLaunch`, `trainPrefs` (T1).
- Produces:
  - `trainScope() -> { kind: string, value: string }` and `trainScopeSet(scope)` — persisted in `localStorage`.
  - `_composeDueSession` gains scope intersection and reports `outOfScope: number`.

**Membership rule (spec §6.5):** a word belongs to a scope only if it has at least one verified context there. A due word with no in-scope context is excluded, and the screen says how many are waiting outside with one tap back to «Всё». The scope promise is never quietly broken.

New locale keys (all three files): `scopeLabel`, `scopeAll`, `scopeThisText`, `scopeMyTexts`, `scopeBenYehuda`, `scopeOutside`, `scopeEmpty`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js` before the final failure block:

```js
// ── Suite 14: scope selector (T2) ────────────────────────────────────────────
const SCOPE_KEYS = ["scopeLabel", "scopeAll", "scopeThisText", "scopeMyTexts", "scopeBenYehuda", "scopeOutside", "scopeEmpty"];
SCOPE_KEYS.forEach((k) => {
  check(new RegExp("room\\.morph\\.study\\." + k + "\\b").test(room), `library-ui must use the ${k} string`);
  localeSrc.forEach((L) => check(new RegExp("\\b" + k + "\\s*:").test(L.src), `locale ${L.name} must define ${k}`));
});
check(/function trainScope\s*\(/.test(room) && /function trainScopeSet\s*\(/.test(room),
  "the Room must persist the chosen training scope");
check(/data-train-scope/.test(room), "the launch screen must expose the scope selector");
check(/getScopedLemmaKeys/.test(room), "the session must intersect the due list with the scope's banked lemmas");
check(/outOfScope/.test(room), "the launch screen must report how many due words sit outside the scope");
check(/\.room-train-launch-scope[\s\S]{0,300}min-height:\s*44px/.test(html),
  "scope controls must meet the 44px project standard");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL on all Suite 14 checks.

- [ ] **Step 3: Add the locale strings**

In each of `public/i18n/locales/{ru,en,he}.js`, inside the same `study:` object that holds the `launch*` keys, add:

`ru.js`:
```js
        scopeLabel: "Источник",
        scopeAll: "Всё",
        scopeThisText: "Этот текст",
        scopeMyTexts: "Мои тексты",
        scopeBenYehuda: "Бен-Йехуда",
        scopeOutside: "Ещё {n} слов ждут повторения вне этого набора",
        scopeEmpty: "В этом наборе пока нет слов с проверенным предложением на этом устройстве. Почитайте его тексты — слова появятся сами.",
```

`en.js`:
```js
        scopeLabel: "Source",
        scopeAll: "Everything",
        scopeThisText: "This text",
        scopeMyTexts: "My texts",
        scopeBenYehuda: "Ben-Yehuda",
        scopeOutside: "{n} more words are due outside this set",
        scopeEmpty: "This set has no words with a verified sentence on this device yet. Read its texts and they will appear.",
```

`he.js`:
```js
        scopeLabel: "מקור",
        scopeAll: "הכול",
        scopeThisText: "הטקסט הזה",
        scopeMyTexts: "הטקסטים שלי",
        scopeBenYehuda: "בן-יהודה",
        scopeOutside: "עוד {n} מילים ממתינות לחזרה מחוץ לקבוצה הזו",
        scopeEmpty: "בקבוצה הזו אין עדיין מילים עם משפט מאומת במכשיר הזה. קראו את הטקסטים שלה והן יופיעו.",
```

- [ ] **Step 4: Persist the scope and intersect the session**

In `public/js/library-ui.js`, next to `trainPrefs`:

```js
const TRAIN_SCOPE_KEY = 'room.trainScope.v1';
function trainScope() {
  try {
    const raw = JSON.parse(localStorage.getItem(TRAIN_SCOPE_KEY) || '{}') || {};
    const kind = String(raw.kind || 'all');
    if (['all', 'text', 'class', 'corpus'].indexOf(kind) < 0) return { kind: 'all', value: '' };
    return { kind, value: String(raw.value || '') };
  } catch (_) { return { kind: 'all', value: '' }; }
}
function trainScopeSet(scope) {
  try { localStorage.setItem(TRAIN_SCOPE_KEY, JSON.stringify({ kind: String(scope.kind || 'all'), value: String(scope.value || '') })); } catch (_) {}
}
```

In `_composeDueSession`, after the `due` list is in hand and before `TQ.composeSession`, add the intersection:

```js
  // T2 — scope is an INTERSECTION with the context bank, never a change to the due query: a word
  // belongs to a scope only if it has a verified sentence there, so the promise «train this
  // corpus» is literally true. Words with no in-scope context are reported, not silently dropped.
  const scope = trainScope();
  let inScope = due, outOfScope = 0;
  if (scope.kind !== 'all') {
    let allowed = new Set();
    try { allowed = new Set((await localDb.getScopedLemmaKeys(scope)) || []); } catch (_) { allowed = new Set(); }
    inScope = due.filter((d) => allowed.has(String(d.lemmaKey)));
    outOfScope = due.length - inScope.length;
  }
```

Then feed `inScope` (not `due`) into the normalisation and `composeSession`, and add `scope` and `outOfScope` to the returned object.

- [ ] **Step 5: Render the selector**

In `renderTrainLaunch`, directly after the `facts` block, add:

```js
  // T2 — source selector. Only scopes that actually have due words are offered, and the counts
  // come from the same bank the session is served from.
  const scopeWrap = el('div', { class: 'room-train-launch-scope' });
  scopeWrap.appendChild(el('div', { class: 'room-train-launch-scope-label',
    i18n: 'room.morph.study.scopeLabel', text: tt('room.morph.study.scopeLabel', 'Источник') }));
  const current = trainScope();
  const options = [{ kind: 'all', value: '', label: tt('room.morph.study.scopeAll', 'Всё'), due: sel.load.dueNow }];
  if (readerTextKey) options.push({ kind: 'text', value: readerTextKey, label: tt('room.morph.study.scopeThisText', 'Этот текст'), due: null });
  for (const sc of (sel.scopes || [])) {
    const label = sc.corpus_id
      ? (sc.title || sc.corpus_id)
      : (sc.source_class === 'mytext' ? tt('room.morph.study.scopeMyTexts', 'Мои тексты')
        : sc.source_class === 'byehuda' ? tt('room.morph.study.scopeBenYehuda', 'Бен-Йехуда') : sc.source_class);
    options.push({ kind: sc.corpus_id ? 'corpus' : 'class', value: sc.corpus_id || sc.source_class, label, due: sc.due });
  }
  for (const o of options) {
    const on = current.kind === o.kind && String(current.value) === String(o.value);
    const btn = el('button', { class: 'room-train-launch-scopebtn' + (on ? ' on' : ''),
      attrs: { type: 'button', 'data-train-scope': o.kind, 'data-train-scope-value': o.value,
        'aria-pressed': on ? 'true' : 'false' },
      text: o.label + (o.due != null ? '  ' + o.due : '') });
    scopeWrap.appendChild(btn);
  }
  wrap.appendChild(scopeWrap);
  if (sel.outOfScope > 0) {
    wrap.appendChild(el('div', { class: 'room-train-launch-outside',
      text: tt('room.morph.study.scopeOutside', 'Ещё {n} слов ждут повторения вне этого набора').replace('{n}', String(sel.outOfScope)) }));
  }
  if (!sel.compose.items.length && current.kind !== 'all') {
    wrap.appendChild(el('div', { class: 'room-train-launch-note',
      i18n: 'room.morph.study.scopeEmpty',
      text: tt('room.morph.study.scopeEmpty', 'В этом наборе пока нет слов с проверенным предложением на этом устройстве. Почитайте его тексты — слова появятся сами.') }));
  }
```

In `_composeDueSession`, also load the scope list so the launch screen can render it:

```js
  let scopes = [];
  try { scopes = (await localDb.getScopeCounts(Date.now())) || []; } catch (_) { scopes = []; }
```

and include `scopes` in the returned object.

In the sheet click delegate, next to the launch-start handler:

```js
    const scopeBtn = t.closest('[data-train-scope]');
    if (scopeBtn) {
      trainScopeSet({ kind: scopeBtn.getAttribute('data-train-scope'), value: scopeBtn.getAttribute('data-train-scope-value') || '' });
      _launchConfirmed = false;
      startDueReview();
      return;
    }
```

- [ ] **Step 6: Style the selector**

In `public/library.html`, next to the other `.room-train-launch*` rules:

```css
    .room-train-launch-scope { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .room-train-launch-scope-label { width: 100%; font-size: 12px; text-transform: uppercase;
      letter-spacing: .04em; color: var(--text-secondary); }
    .room-train-launch-scopebtn { appearance: none; cursor: pointer; width: auto; min-height: 44px;
      padding: 0 14px; border-radius: 999px; border: 1px solid var(--border-soft);
      background: transparent; color: var(--text-primary); font-size: 13.5px; }
    .room-train-launch-scopebtn.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 700; }
    .room-train-launch-outside { font-size: 13px; color: var(--text-secondary); }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run smoke:train-queue && npm run smoke:i18n`
Expected: `train-queue` PASS; `i18n` reports the locale-lock drift, which Task 8 fixes.

- [ ] **Step 8: Capture the mandatory screenshots**

Extend `scripts/premium/train-queue-shots.js` to seed texts of two source classes so the scope row has something to show, then run it and **look at each image**.

Run: `node scripts/premium/train-queue-shots.js`
Expected: OK at 380 RU, 380 HE/RTL and 1280 RU with no horizontal overflow.

- [ ] **Step 9: Commit**

```bash
git add public/js/library-ui.js public/library.html public/i18n/locales/*.js scripts/premium/train-queue-smoke.js scripts/premium/train-queue-shots.js docs/research/room-trainer-maturity
git commit -m "feat(room): scope a training session to a text, a corpus or everything"
```

---

### Task 8: Release

**Files:**
- Modify: `public/index.html`, `public/library.html`, `public/sw.js`, `server.js`, `tests/i18n.locale-version.lock.json`

All **six** stamps move together. Three are gated; move all six anyway.

- [ ] **Step 1: Bump every stamp to `3.11.458` / locale `192`**

1. `public/index.html` — `window.APP_VERSION = "3.11.458";`
2. `public/sw.js` — `const CACHE_VERSION = "v3.11.458";`
3. locale `?v=191` → `?v=192` in `public/index.html` **and** `public/library.html`
4. `public/library.html` — `#roomFooterVersion` → `v3.11.458`
5. `public/library.html` **and** `public/sw.js` — `library-ui.js?v=457` → `?v=458`; `train-queue.js?v=457` → `?v=458`
6. `server.js` `SHELL_INTEGRITY_PATHS` — `library-ui.js?v=458`, `train-queue.js?v=458`, locales `?v=192`

Then: `node tests/i18n.smoke.js --write-lock`

- [ ] **Step 2: Full gate sweep**

Run each, OPFS gates one at a time:

```bash
npm run smoke:train-queue
npm run smoke:word-context
npm run smoke:i18n
npm run smoke:fsrs
npm run smoke:grade-policy
npm run smoke:memory-canon
npm run smoke:room-training-premium
npm run smoke:studio-room-srs
npm run smoke:reader-word-status
npm run smoke:reader-morph
npm run smoke:reader-parity
npm run smoke:canon-version
git diff --check
```

- [ ] **Step 3: Commit, push, verify**

```bash
git add public/index.html public/library.html public/sw.js server.js tests/i18n.locale-version.lock.json
git commit -m "release(room): T2 context bank and session scope (3.11.458)"
git push origin main
```

After the build lands, confirm `/api/client-config` reports `3.11.458` with `?v=458` / `?v=192` in `shellIntegrity`, that the served shell and `sw.js` agree, and that a fresh browser reaches service-worker state `activated` with a `linguistpro-precache-v3.11.458` bucket. Do not grade any word on the owner's profile.

**Watch the disk.** `docs/planning/PROD_INCIDENT_SW_INTEGRITY_AND_DISK_2026_09_02.md` §4: each deploy adds a ~1.25 GB image plus build cache to a 38 GB disk. Check `/healthz` `disk_pct_used` before pushing and prune unused images and build cache after the release lands.

---

## Self-Review

**Spec coverage (§6 of the program spec):**

| Spec requirement | Task |
|---|---|
| §6.1 `word_context` schema, device-local derived | 1 |
| §6.1 `keyer_version` invalidation | 1 (`dropStaleWordContexts`) |
| §6.2 one shared `_sourceClassSql()` for counter and harvester | 1 |
| §6.3.1 open-text harvest of every occurrence | 4 |
| §6.3.2 cross-text harvest of the served context | 4 |
| §6.3.3 bounded backfill via `findSentencesForWords` + identity gate + negative cache | 6 |
| §6.3 cap of 8 per lemma | 1 (`WORD_CONTEXT_CAP`) |
| §6.4 deterministic order, `contexts[reps % n]` | 2 (order), 3 (`pickContext`), 5 (serving) |
| §6.4 `srs_source` untouched, empty bank = today's behaviour | 5 (bank tried first, anchor falls through) |
| §6.5 scope selector with honest counts | 7 |
| §6.5 membership = ≥1 verified context in scope | 2, 7 |
| §6.5 «ещё N слов ждут вне набора» + one tap to «Всё» | 7 |
| §6.6 `smoke:word-context` covering harvest, identity, cap, rotation, invalidation, scope equality | 1, 2, 4, 5, 6 |
| §6.6 `smoke:memory-canon` stays green | 1 (Step 6), 6 (Step 4) |
| Global: identity gate on every served sentence | 5 |
| Global: six version stamps | 8 |

**Placeholder scan:** every code step carries the literal code. No "add error handling", no "similar to Task N".

**Type consistency:** `insertWordContexts(lemmaKey, rows, keyerVersion) -> number` is defined in Task 1 and called with that signature in Tasks 4 and 6. `getWordContexts(lemmaKey) -> rows` with `source_class` / `text_key` / `order_index` / `sentence_id` / `surface` / `text_title` is defined in Task 1 and read with exactly those column names in Tasks 5 and 2's test. `getScopedLemmaKeys({kind, value}) -> string[]` and `getScopeCounts(nowMs) -> [{id, source_class, corpus_id, title, due}]` are defined in Task 2 and read with those field names in Task 7. `TrainQueue.pickContext(contexts, reps)` is defined in Task 3 and called in Task 5. `trainScope() -> {kind, value}` is defined in Task 7 and consumed by `_composeDueSession` in the same task.

**One risk flagged for execution:** Task 5 changes which sentence a due word is served in. `smoke:studio-room-srs` asserts a three-source fixture resolves through `getSentenceForReview`; those fixture words have exactly one context each, so `_bankedContextFor` returns null (it requires ≥2) and the path is unchanged. If that gate does move, the fixture — not the rotation — is what needs updating.
