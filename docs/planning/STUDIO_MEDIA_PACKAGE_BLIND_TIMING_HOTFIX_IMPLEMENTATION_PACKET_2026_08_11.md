# Studio Media Package blind-timing hotfix — implementation packet

Date: 2026-08-11

Source commit: `5604b444bdbbc723c7e152673a0d7983f674c904`

Target app/cache version: `3.11.348`

Scope: bounded P1 recovery fix after approved Studio UX option B; no P2/P3/P4 schema or lifecycle redesign.

## Incident and evidence

An owner-live Gemini ASR run completed all four windows for a 56:23 MP4 and returned 604 text segments, but promotion to the canonical Media Package failed with `SEGMENT_TIMING_INVALID`. The same failure reproduced on desktop, so it was not an iPhone codec or audio-only extraction failure.

The captured, content-preserving import boundary proved:

- the original video bytes and exact local media binding were present;
- two provider segments had no usable start mark after window stitching;
- one adjacent pair had an equal start mark;
- the previous promotion path coerced a missing mark toward zero or inferred an invalid boundary;
- the transcript itself was complete and recoverable.

The owner-live session was recovered in place before application code was changed. Recovery copies were written outside the repository; no owner transcript or media bytes are committed.

## Decision

Missing or contradictory provider timing is retained as an explicit `blind` fact. Text is never discarded and timing is never interpolated merely to satisfy validation.

- Canonical JSON keeps every segment, including `start_ms: null, end_ms: null`.
- Untimed segments remain text-editable but cannot seek, replay, split, or participate in exact row/media binding until the owner supplies timing.
- Timed segments continue to provide exact seek/karaoke behavior.
- VTT, which cannot represent untimed cues, is an explicitly declared bounded projection. The signed manifest records source count, exported count, and omitted indexes; verification recomputes the same projection.

## Invariants preserved

- OPFS media bytes and SHA binding remain canonical.
- Raw transcript history remains immutable; corrected history remains additive.
- No synthetic timestamp, interpolation, mass rebinding, implicit ASR retry, or cloud fallback is introduced.
- Import Center and `.lplp.zip` remain the single lifecycle/export surface.
- Reading Room receives only proven exact timing and ignores blind cues instead of replaying them from `00:00`.

## Allowlist

- `public/js/media-package-core.js`
- `public/js/studio-media-package.js`
- `public/js/studio-media-editor.js`
- `public/index.html`
- `public/sw.js`
- `tests/mediaPackageCore.test.js`
- `tests/studioMediaPackage.test.js`
- `tests/studioMediaEditor.test.js`
- `tests/mediaPackageExport.test.js`
- `scripts/premium/media-package-browser-smoke.js`
- this packet

## Regression evidence

- Media Package core/editor/package focused tests: 41/41 PASS.
- Media Package export/repository/security smoke: 77/77 PASS.
- Media Package browser 380 px RU + HE/RTL, save, reopen, table/media sync: PASS; zero page errors.
- Reading Room media, row replay, exact binding, audio/video, no-timing honesty: PASS; zero page errors.
- Studio UX maturity B1–B5 unit and browser gates: 92/92 PASS.
- Import Center desktop, 380 px RU, 200%, HE/RTL, focus and integrity: PASS; zero page errors.
- i18n structural tests: 233/233 PASS.
- Exact owner-shaped fixture: 604/604 raw and corrected segments retained; two null starts and three blind timing records remain explicit.

The broad historical portable-package suite has one pre-existing stale DOM-source assertion (`studio-exact-binding` expected in `index.html` although the live implementation resides in `library-ui.js`); 54 other tests pass. Its historical browser smoke also enters through the pre-B3 global modal route and is stale against the current Import Center routing. Neither failure exercises the changed Media Package code. The current Import Center browser gate and Media Package slim-export verifier are green.

## Production and owner-live acceptance

1. A fresh `3.11.348` load can promote the same ASR shape without losing text.
2. Corrected text can proceed to table creation and canonical save.
3. Timed rows keep original-media replay in Studio and Reading Room; blind rows do not claim a false timestamp.
4. Export produces a `.lplp.zip` learning package; recovery `.json`/`.txt` copies are not presented as the final package.
5. On iPhone, the owner verifies a fresh Gemini-only media choice, ASR-to-table continuation, save, reopen, original-media replay on timed rows, and `.lplp.zip` export/import.

## Rollback

Revert this allowlisted commit and restore the previous app/cache version together. Existing recovered packages remain readable because the database schema is unchanged; rollback only restores the previous stricter promotion behavior.
