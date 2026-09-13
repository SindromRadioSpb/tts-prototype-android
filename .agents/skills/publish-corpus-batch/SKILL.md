---
name: publish-corpus-batch
description: Publish an already baked Ben-Yehuda corpus batch to LinguistPro production, including versioning and release verification.
---

# Publish Corpus Batch (Ben-Yehuda Reading Room → prod)

The corpus bake (`scripts/premium/run-corpus-prebake.js --bake --ids-file …`) continuously
translates works into `.tmp/benyehuda/shards/`. This skill publishes the accumulated batch so
they appear as «✓ Готовы к чтению» in the live Зал (https://linguistpro.kolosei.com). It's a
**periodic, outward-facing** operation. The committed helper `scripts/premium/publish-corpus-batch.js`
automates the deterministic part; you (the assistant) do the secret/judgment/outward steps.

## Why each guardrail exists (do not skip)
- **Catalog version bump is MANDATORY.** The lazy catalog files (sidecar/search/manifests/works)
  are fetched `?v=<CORPUS_CATALOG_VERSION>` and served **immutable** — without bumping the version a
  re-publish is invisible to existing PWA users. The script bumps `library-ui.js` + `sw.js` (CACHE_VERSION
  + the precached root) in lockstep.
- **Bodies → prod VOLUME, never git.** ~26MB/batch (scales to ~400MB) — `push-corpus-works.js` uploads
  them to the volume. **Never `git add` `public/data/benyehuda/works/*.json`.**
- **Bodies FIRST.** Push bodies and verify a sample body is 200 **before** committing the catalog —
  a card must never claim "ready" pointing at a 404 body (R1/R8 honesty).
- **Shards snapshot-validated.** The bake runs concurrently; the script copies + JSZip-validates every
  shard and aborts on a mid-flush/truncated zip (never ship a partial batch as complete).
- **`public/index.html` must NOT be touched.** Reading-Room work is `library.html` only.

## Procedure

### 0) Pre-flight (read-only)
- `node scripts/premium/run-corpus-prebake.js --status` — see ledger totals (done/pending) + targeted progress.
- Is a bake running in the owner's terminal? Default flow uses a **snapshot copy** (no need to pause it).
  Only `--no-snapshot` if it's confirmed paused.
- `git status --short` — preserve unrelated dirty files. Check the release allowlist for overlapping edits; use an isolated checkout if needed, without resetting owner work.

### 1) Build + version-bump + gates (automated — the helper)
```
node scripts/premium/publish-corpus-batch.js --dry-run     # preview: next version, baked count, proposed CACHE_VERSION, self-check, manual block (WRITES NOTHING)
node scripts/premium/publish-corpus-batch.js --apply        # build v(N+1) into public/data + bump the 3 version sites + run gates
```
The helper does: snapshot+validate shards → build v2 → compute next version (current+1) → build
v(N+1) root/index/search/manifests → (`--apply`) edit `CORPUS_CATALOG_VERSION` + `CACHE_VERSION` +
the precache root → structural self-check → gates (`smoke:corpus-room`, `smoke:corpus-nav`,
`probe:niqqud`, each retried under concurrent-bake CPU load). **If it aborts (mid-flush shard / R1 lie /
anchor mismatch) or any gate fails → block publication. Diagnose and repair recoverable local failures within scope, then rerun affected gates. Do NOT push until gates pass.** Review the printed proposed CACHE_VERSION +
version diffs before continuing.
- Note: the helper does NOT run `smoke:full-catalog` — it re-tests the *producer* with fixtures (not the
  published catalog) and flakes under a concurrent bake; the published v(N+1) is validated by the helper's
  own self-check (`version`, `counts.baked`, `pointers.ready`, manifests-on-disk, precache↔client) + corpus-room/nav.

### 2) Push bodies FIRST (manual — secret, outward-facing)
```
$env:AUDIO_UPLOAD_TOKEN='<secret>'; node scripts/premium/push-corpus-works.js --skip-existing
```
- The token is a **secret** (pending rotation) — never echo it, never log it, never put it in a commit.
- `--skip-existing` makes it resumable (the prior batch's bodies are skipped). Expect `0 failed`.

### 3) Git-add — ALLOWLIST ONLY (manual — one mistake = a 400MB repo)
```
git add public/data/benyehuda/corpus-catalog-v2.json \
        public/data/benyehuda/corpus-catalog-v<N+1>.json \
        public/data/benyehuda/corpus-index-v<N+1>.json \
        public/data/benyehuda/corpus-search-v<N+1>.json \
        public/data/benyehuda/catalog/era-*-v<N+1>.json \
        public/js/library-ui.js public/sw.js
git diff --cached --name-only    # This release commit must contain only its reviewed allowlist
```
- If work bodies were staged by this run, unstage only those paths. Preserve pre-existing owner staging and isolate this release commit.
- **NEVER** `git add -A`. **NEVER** stage `index.html` or `.tmp/**`.

### 4) Commit + push (autonomous per owner norm; gates green first)
```
git commit -m "feat(corpus): publish batch — <baked> ready (catalog v<N+1>)" && git push
```
Push → Coolify auto-deploys.

### 5) Prod-verify (when the target deployment is ready)
```
node scripts/premium/publish-corpus-batch.js --verify-only --base https://linguistpro.kolosei.com
```
Poll deployment readiness with bounded checks; elapsed time alone is not readiness. If rolling images remain mixed beyond the normal window, diagnose before declaring success.

Confirms: prod SW CACHE_VERSION updated, `corpus-catalog-v<N+1>.json` serves with the new baked count,
a sample ready body is 200. Optionally a Playwright drill opens a NEW work in the live Корпус room.

### 6) Resume the bake — only if you PAUSED it (the snapshot path needs no resume).

## DO-NOT (invariants)
- ❌ `git add` any `public/data/benyehuda/works/*.json` (volume-only).
- ❌ touch `public/index.html`.
- ❌ commit before the bodies are on the volume (bodies-FIRST).
- ❌ skip the version bump (re-publish would be invisible to existing users).
- ❌ skip gates before push.
- ❌ echo / log / commit the `AUDIO_UPLOAD_TOKEN`.

## Output report (when done)
Changed files (allowlist), baked count + version delta (v_old → v_new), CACHE_VERSION, gate results,
body-push result (uploaded/failed), prod-verify result. Mirror the project's «Выход» convention.
