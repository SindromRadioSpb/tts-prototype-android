# YouTube learning implementation

Owner approved implementation through production on 2026-09-09. The final full-table workflow correction is released as 3.11.503, runtime commit `83f38afb`; Chrome production acceptance and the gzip-only proxy correction pass. Conditional P5 remains NOT QUALIFIED, and physical iPhone acceptance remains pending.
Canon: [research and implementation plan](YOUTUBE_LEARNING_MATERIAL_RESEARCH_AND_PLAN_2026_09_09.md).
Base: `origin/main` at `02124fb1`; isolated branch `feat/youtube-learning-materials-2026-09-09`.

## Contract decisions

- Per-card canon is `texts.source_meta_json.playback_source`, with append-only bounded revision history and atomic compare-and-swap. Package `external_ref_json` remains original acquisition provenance, not a second editable playback source. Local SHA relinking remains separate.
- Newly attached YouTube timing is unverified until the owner confirms. The confirmation binds to a deterministic fingerprint of Hebrew rows and local timing; a changed basis disables YouTube timing. Offset changes only the derived YouTube clock.
- Packages containing playback history use format v3; legacy v2 stays supported. Required source file is hash-covered. Older clients reject v3 instead of dropping the source. Browser migration 052 preserves all old receipts while widening their package format constraint to 2/3; no learner state changes.
- An ordinary top-level `study-video.html` uses YouTube without credentialless; the isolated Studio and Reading Room retain COEP. The same-origin handoff is an allowlisted reading projection in IndexedDB: 5 snapshots, 5 MiB each, 24-hour expiry, opaque fragment IDs. No SQLite, keys or learner state on that screen.
- YouTube segment replay must wait for the actual seek clock before arming its end. Stale completions cannot resume an abandoned player. Known cue ends stop highlighting during silence.

## Implemented surfaces

- Saved-card source dialog: add/replace/detach/history, offset, independent preview tab, explicit timing confirmation; stale revisions and published sources are protected. Studio and Room open the shared screen. Local original media remains available through its existing controls.
- Common player supports row replay, silence gaps, blocked autoplay, retry, offline text, removal/embed-denial errors, visibility pause and return. Timing estimates from a new source remain disabled until confirmed against a fingerprint.
- Explicit preparation task: existing import → existing translator/chunk journal → deterministic-ID save → package preparation. The journal retains completed results; cancel waits for the current result; resume skips completed stages. A lost save acknowledgement reuses the committed card. No automatic public publication or repeated provider fallback.
- Publication sanitizes runtime/private metadata, validates playback history and preserves it in immutable snapshots. The My Texts bridge now converts text-card payloads to the library bundle required by the public reader. A YouTube-only publication requires zero original-video assets.

## Evidence so far

- Red regressions reproduced source loss during portable export/import and premature YouTube fragment stop.
- Focused source/package/security/import tests: 55/55 PASS; player/package subset: 63/63 PASS. Added task failure/cancel and publication regressions pass.
- `study-video-browser-smoke.cjs`: ordinary top-level isolation, frame denial, RU 380 px, HE RTL 380 px, reload and offline text PASS; zero page errors. Screenshots visually inspected.
- `youtube-learning-browser-smoke.cjs`: actual browser SQLite/OPFS, caption import → one mocked translation request → save/package; reload after simulated lost save acknowledgement creates no duplicate and makes no second translation request. Source offset survives clean-profile v3 import, with exact timing and unchanged rows/review_log. Source-dialog RU/HE screenshots inspected.
- `study-video-live-smoke.cjs`, Chrome, real YouTube `iG9CE55wbtY`: clock advances; replay 24–26 s, backwards 2–4 s, then 12–14 s; pauses at 26.003 / 4.007 / 14.010 seconds, zero highlighted rows in the gap, zero page errors. These are clock fixtures, not a transcript-quality oracle.
- User pilot video `djzKaEoqka8` (726 seconds): the real iframe returned YouTube error 150. The publisher's embed restriction is respected; the table remains available and the user can open YouTube separately.
- Production 3.11.498 / `0931ce46` verified on 2026-09-09. Physical iPhone acceptance remains pending. Baseline was 3.11.497 / `02124fb1`.

## Gemini pilot and conditional P5 gate

The owner authorized only `https://www.youtube.com/watch?v=djzKaEoqka8`, up to **USD 5 total**, including retries. The pilot uses the existing local Gemini key without printing or copying it, pinned `gemini-3.8-flash`, actual structured video input and `videoMetadata` clipping. No server download/upload path is involved.

- 0–45 seconds: one successful response, 9 transcript segments, `STOP`, 4,200 input + 564 candidate + 776 thinking tokens. Estimated current-standard fee: **USD 0.008175**, not a billing statement. Raw response retained locally with timing explicitly unverified.
- 340–385 seconds: two generation attempts returned HTTP 503 (high demand).
- 0–726 seconds: countTokens preflight 74,882; generation returned HTTP 503. No complete transcript was produced.
- The local budget ledger conservatively retains unknown-charge reservations for all three failed calls. Accounted/reserved ceiling is USD 4.71635; no further paid generation fits the runner's whole-model reservation. The user limit was not increased.
- **P5 NOT QUALIFIED**: first-sample success is not independent text/timing evaluation or long-video coverage. No direct Gemini URL preparation route is enabled in production. This conditional failure does not block the approved caption/existing-ASR routes. Resume qualification only when provider availability and budget accounting permit, followed by independent anchors.

Official sources checked on 2026-09-09: [video inputs and clipping](https://ai.google.dev/gemini-api/docs/video-understanding), [standard pricing](https://ai.google.dev/gemini-api/docs/pricing). Current standard prices used are USD 0.75/M input and USD 3.75/M output including thinking; the runner checks the model input limit and pricing date before its reservation.

## Final local release gates

- Full unit suite: 1427/1427 PASS (final run recorded in evidence.json).
- Actual public-reader browser fixture: publication bridge → sanitized immutable snapshot → clean Room profile → video screen, exact source and derived timing retained; no original video asset required.
- Plain text → task → card → ZIP download; source UI save/preview/detach PASS. Preparation history belongs to Library, preserving current-text composer actions.
- Explicit lifecycle pause cancels pending seek intent, so a late seek completion cannot resume playback after backgrounding; red→green regression recorded.
- `smoke:reader-parity`, `smoke:studio-chunks`, `smoke:room-media`, `smoke:captions-parse`, `smoke:media-karaoke`, `smoke:studio-karaoke`, `smoke:memory-canon` (89), `smoke:train-queue` (321), `test:api-smoke`, log-hygiene PASS. Package/import-center unit tests are included in the full suite.
- Extra legacy harness failures reproduced identically in a separate clean `02124fb1` checkout: portable browser missing old global button; import-center browser omits required material selection; text-card roundtrip 31/35 (pre-adoption media probe). No changes to those unrelated harnesses or production behavior were made.
- [Stable evidence and usage guide](../research/youtube-learning/2026-09-09/README.md). Raw paid-provider responses and keys are excluded from Git.

Do not infer physical-device or independent transcript-quality acceptance from these engineering tests.


## Production acceptance — 2026-09-09

Follow-up owner workflow correction: [full-table inline player](YOUTUBE_INLINE_PLAYER_FIX_2026_09_09.md). The first list records the earlier 3.11.498 release; the final paragraph records the accepted 3.11.503 correction.

- Runtime commit `0931ce463e38b87be9df51d991b13ddd2ce32bdb` pushed to main; Coolify webhook deployment served 3.11.498 by 12:54:25 UTC.
- 65/65 shell assets match both the served integrity manifest and Git bytes. Service worker v3.11.498; study page has no COEP, COOP same-origin and X-Frame-Options DENY.
- Five consecutive no-cache config probes: HTTP 200 / 3.11.498.
- Production fresh-profile task/source/package/public-reader fixtures, plain-text ZIP, source form preview/save/detach and service-worker offline reload PASS; zero page errors. Translation responses in this engineering gate were mocked (two requests for two distinct tasks), not provider-quality evidence.
- Separate real YouTube playback on production: advancing clock, forwards/backwards row replay; stops at 26.010 / 4.014 / 14.020 seconds, paused and no highlighted gap rows. No transcript-quality claim.
- Existing Chrome/Kapture successfully loaded the new screen; original owner working tab was not reloaded or modified. No owner profile acceptance claim and no owner content publication.
- P5 direct Gemini URL route is disabled after the bounded pilot's 503 failures. No additional paid generation was run. Physical Safari/PWA/VoiceOver remain owner-device checks.
- Machine-readable evidence: [production-verification.json](../research/youtube-learning/2026-09-09/production-verification.json).

The final 3.11.503 image matches `83f38afbf1955b3877a4804a9c94cf4dbe394169`. Two consecutive fresh Chrome runs on owner video `PngchpnAS5E` passed native playback start, row replay, word morphology pause/resume and rapid compatible-shell restoration in both Studio and Room with zero page errors. Fresh service-worker acceptance passed 71/71 paths plus Studio/Room offline reopen; eight no-cache pairs returned 200 / 3.11.503. Production's Traefik compression label was changed from `br,gzip` to `gzip` after an on-host A/B isolated Brotli as the source of large proxy allocations and simultaneous 502s. Proxy cgroup memory ended at 160.6 MiB after two full gzip-only runs versus about 578 MiB after one Brotli-enabled run. Physical Safari/PWA/VoiceOver remains pending. Machine evidence: [production-verification.json](../research/youtube-inline/2026-09-09/production-verification.json).
