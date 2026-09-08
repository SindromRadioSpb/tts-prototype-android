# Studio Gemini table recovery — 2026-09-08

Status: implemented; relevant pre-release gates passed. Production/owner-browser evidence is recorded separately below after verification.

## Scope and evidence

Owner reports successful iPhone download, Open/Share and transcription on v3.11.493 (`OWNER_REPORTED_PASS`, 2026-09-08). The next operation, rebuilding the Gemini table, repeatedly stops at part 1/4 on desktop and iPhone. The active desktop transcript has 19,187 characters and 437 ASR segments; media SHA-256 is `f74cefd9cb6134a334463c508f995e4b4d5c1ef4ef29bcaab21d17c80d124461`.

Read-only production logs show Hebrew-consonant validation rejecting a vocalization that silently corrects a repeated consonant. The raw cache corresponding to the *current* 120-segment first request independently reproduces the same defect class at zero-based row 46: source `כשראיתי` became vocalized `כְּשֶׁרָצִיתִי` (saw → wanted). These are separate observed rows, not one interchangeable fixture.

The strict guard is correct. The recovery defect is that the paid raw answer is saved before validation and then replayed unchanged on every retry. Client retries cannot repair that durable semantic failure; the old message promises recovery without explaining the cause, even with zero completed parts.

Google explicitly separates structured JSON output from semantic correctness; application validation remains required: [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output). The pinned, live-working `gemini-3.7-flash` model is unchanged.

## Decisions and invariants

- R1/R9/R11: preserve the raw provider answer and source Hebrew; never silently correct the ASR transcript, delete consonants or weaken the niqqud guard. Repairs may change only the rejected row's niqqud, matching transliteration and Russian translation. All other raw rows and segment identities remain unchanged.
- R12/R13: keep recovery as a derivative in `table-repair-v1-<existing-request-hash>.json`, bound to raw bytes, model/prompt/schema and transliteration profile. Revalidate before publishing the existing validated table cache. No new source truth or OPFS schema.
- R16: at most two automatic repair generations, targeting at most 24 rejected rows from a chunk. This is a quality/cost guard, **not** a transcript-length limit. Persist reservations before provider work, paid responses before parsing and accepted patches after validation; reuse them after interruption. Same-process concurrent requests share one repair. Explicit authentication/rate rejection does not exhaust the paid-output budget.
- R4/R14: non-retryable semantic failures return 422 with safe reason/row locations; show actual completed segment coverage and an actionable source-review stop. Do not replay them in the browser or overwrite quota errors. SDK error messages are not returned or logged by this route; keys stay BYOK-only.
- Long texts, interviews and films remain supported by the existing chunk/resume/coverage pipeline. There is **no 250-line input block**. The old scenario7 test expected an obsolete refusal; the corrected oracle checks exact edited-source coverage and absence of stale audio timing instead.
- No ASR rerun, media migration, provider fallback, model switch, downloader rebuild or personal learner/SRS mutation.

## Safety and implementation

Before browser reload/mutation, an OPFS recovery snapshot was written and read back successfully: `recovery/gemini-table-owner-2026-09-08.json`, 572,071 bytes, preserving exact text, 437 segments, import metadata, media binding and table journal. A secret-pattern guard ran before writing. This is a recovery artifact, not competing source truth; the active source remained unchanged.

Main implementation: `ingest/geminiTableRepair.js`, existing `ingest/tableRows.js` preparation/validation separation, `/api/translate-table` integration and the existing chunk-loop error UI. Existing raw and validated cache namespaces remain compatible. App/SW/footer release: 3.11.494; locale assets/cache/integrity URLs: 212.

The owner raw cache and repair outputs remain ignored local scratch and server data, not published research content. Live smoke reads the owner key only in-process and prints bounded counts/provenance, never the key or SDK error messages.

## Verification commands

```text
node --test tests/geminiTableRepair.test.js tests/geminiTableRecoveryRoute.test.js tests/geminiTableRetryUi.test.js
npm test
node scripts/api-smoke.js
node scripts/premium/studio-chunks-smoke.js
node scripts/premium/studio-chunks-smoke.js --gemini-recovery-only
node tests/i18n.smoke.js
node scripts/premium/gemini-table-repair-live-smoke.js --raw=<private-raw-cache> --key-file=<owner-key-file> --repair-cache=<private-repair-derivative>
```

Live first-chunk repair gate: 120 rows; one rejected row; one request; source/segment identities, other 119 rows and original raw bytes unchanged. First narrow niqqud/transliteration experiment was followed by a second one-row gate including aligned Russian; both outputs are preserved privately. These are technical checks, **not** a linguistic gold-score or a completed 437-segment browser acceptance.

The historical full browser suite initially failed identically on unchanged predecessor 1fef3f55 because of its obsolete 250-line expectation. After the source-preserving oracle correction it passes, including offline media restoration, partial mapping, blind timing regions and explicit provider switching. Targeted 1440px/380px recovery cases pass first/second-part failure, 0/300 and 120/300 honest coverage, no client replay and completion to 300/300 with 300 timing entries after simulated resolution. Real iPhone acceptance of this **table repair** remains separate from the owner's successful downloader/transcription acceptance.

## Release gates

Pre-release: 1397/1397 unit tests; API smoke PASS; full Studio chunks/media smoke PASS; targeted 1440px/380px repair UI PASS; i18n 233/233. Live one-row aligned repair PASS; a second invocation reused that repair with zero provider calls.

An auxiliary `train-queue-smoke` inspection passes its exact shell-integrity URL/precache checks but fails one unrelated historical assertion (320/321): it requires the unchanged `library-ui.js?v=488` asset version to equal *every* global release patch. The identical failure was verified on the unchanged predecessor v3.11.493. The module bytes and its matching HTML/SW/integrity URL remain unchanged; no train-queue or Reading Room runtime change is included here.

Release commit, deployed version, exact owner-browser result and reload/cache proof: pending release verification. Do not infer production acceptance from local fixtures or the live one-row provider gate.
