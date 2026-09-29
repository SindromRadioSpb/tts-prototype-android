# M4 · Four surfaces and accepted explanation archive

Date: 2026-09-29. Base: `e877e8ea` / production 3.11.694. Branch:
`feat/mentor-byoa-m4`. This is an owner-pilot increment, not full M4 acceptance.

## Implemented boundary

- Review offers a tutor after a real committed answer, with the exact sentence
  actually served. Opening/closing help keeps the same queue, index and existing
  review receipt. Word-only and skipped questions do not pretend to have context.
- Mediatheque cards open the existing reader and invite explicit sentence selection.
  No ingest, automatic model call or new material copy. Public imported materials
  use the tutor capability instead of the legacy Ben-Yehuda-only probe.
- The immutable source snapshot carries a media interval only when the existing
  passport asserts an exact caption binding, revision hash and finite start/end.
  Blind/unmapped/derived timing stays text-only. Opening tutor pauses playback;
  it does not seek, resume automatically or replace the active media source.
- Explicit “Save on this device” accepts the displayed explanation into a bounded
  local IndexedDB archive (50 records per signed-in account). No automatic saving,
  cloud sync, provider credentials, mastery, FSRS or canonical notes writes.
- The archive stores source/revision, question and answer; deduplicates identical
  content; supports reopening, download and deletion. Continuing uses the saved
  source version and requires fresh transmission consent. Opening the archive
  itself never requests model inference. A changed current source is labelled.
- This archive is a typed explanation record, not a parallel LessonArtifact lesson,
  word note, learner-memory claim, review challenge or automatically accepted plan.
  Existing cloud-text consent is not reused as consent to transmit/save tutor text.

## Verification

Commands (isolated fixtures, no model or owner learner-state writes):

```text
node --test tests/tutorContext.test.js tests/tutorSurfaces.test.js tests/tutorTransport.test.js tests/shellModuleWiring.test.js tests/shellIntegrityPrecacheParity.test.js
node scripts/premium/room-training-premium-smoke.js
node scripts/premium/tutor-m1-browser-smoke.js --surfaces
node scripts/premium/tutor-m1-browser-smoke.js --surfaces --practice
```

The browser harness serves the real shells and handlers; fixture-only module
instrumentation seeds a trainer session. Its submitted answer uses the real
canonical writer. Counts before and after tutor interactions must match; the
deliberately submitted training attempt is not described as zero writes.
Archive tests cover explicit save/dedup, reload, other-account read/delete denial,
download, continuation without inference/fresh consent, deletion, and escaped output.
Screenshots: `m4-screenshots/`, desktop/380px and Hebrew RTL. No physical-device or
assistive-technology acceptance is implied.

Results: [four-surface/archive browser](M4_BROWSER_RESULT.json),
[practice regression](M4_PRACTICE_BROWSER_RESULT.json). Both PASS, pageErrors empty.
The archive also enforces its limit transactionally and allows dedup at the limit.
The existing 23-check training guard and 233-check i18n gate passed.

## Remaining M4 work

- Reviewed lesson artifacts, goals/unfinished threads and proposal writer integration;
  the current archive continues a source discussion, not an entire multi-turn course.
- Canonical source navigation from archived records across devices, unified personal
  data export/delete/import, account-deletion lifecycle and archive restore policy.
  Browser storage clearing removes the archive; no cross-device durability claim.
- MCP context/session/artifact tools after corresponding scope/consent contracts.
- Live owner video timing/player acceptance; automated window tests do not claim it.
- Semantic exercise validation remains dependent on independent Hebrew review (O-046).
