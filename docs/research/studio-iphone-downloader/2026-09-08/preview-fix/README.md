# iPhone saved-file preview correction — 3.11.493

Status: DEPLOYED_TECHNICAL_PASS, commit `756555be6a89f7a9013bf7c647d433b4a00bd87a`.
Live assets and two independent 14-group production browser runs passed.
See [RELEASE_VERIFIED.md](RELEASE_VERIFIED.md) for evidence and remaining gates.
Source baseline: production `70b779d7` (3.11.492), evidence predecessor `38114f82`.
Owner explicitly approved correcting both defects and publishing to production.

## Owner evidence (2026-09-08)

For source `RXasnfAF3SE`, the owner reported successful download on the physical
iPhone through a-Shell mini, working quality selection, a saved video and SHA-256
shown in the helper, and successful exact-file compatibility/play-seek checking
in Chrome/Studio. These checks are OWNER_REPORTED_PASS, not automated iPhone tests.
Open/Share was OWNER_REPORTED_FAIL: `NATIVE_ACTION_FAILED`. The file remained in
Files and could be selected and checked in Studio. No ASR execution is asserted.

The owner supplied `IMG_7266.MP4`; two local diagnostic frames were inspected,
showing the source title and the erroneous download-failure screen. The private
recording is not copied into Git or uploaded to a provider.

## Cause and bounded correction

`shlex.quote` emits POSIX concatenated quote fragments for `Eichmann's`. a-Shell's
ios_system removes only the outer quote pair; it does not implement that POSIX
concatenation. The supplied log shows the resulting truncated/literal-quote path.
The new boundary passes one fully double-quoted literal path and rejects embedded
double quotes, backslashes and control characters. Existing readable filenames
are not renamed or sanitized again. Quoted ios_system arguments skip variable
and glob expansion; adversarial names are covered alongside apostrophes/Unicode.

Primary parser source inspected: [ios_system.m at 7658fcf](https://github.com/holzschu/ios_system/blob/7658fcf551935b42d6bb5bedc9315d8f53f760c4/ios_system.m),
`strstrquoted`, `unquoteArgument`, and the `dontExpand` argument branch.
This is source-level evidence, not execution of the installed native binary.

The preview exception boundary now follows successful file verification. An
opening failure preserves READY, filename, size and SHA-256, shows a separate
action warning and keeps Open/Share and Return to Chrome available. Retry and
reopening an existing job do not redownload. The Chrome return callback still
carries the successful download result. Missing/changed files continue to fail
closed; a native action failure never bypasses file verification. A failed
Chrome launch likewise does not rewrite the download result.

R4: truthful completion and actionable recovery, 380px screenshot inspected.
R11: red tests reproduced the old failure; source/file verification stays strict.
R14: native shell boundary rejects paths outside the saved-name contract.
R15: no media deletion, renaming, duplicate download or global helper reset.
R12/R16: no ASR, media-server, provider, database or infrastructure changes.

## Verification and artifacts

- `python -m unittest discover -s scripts/premium/tests -p 'test_iphone*.py'`:
  30 PASS. Includes failed preview/retry/reopen, preserved SHA/result, changed-file
  rejection, literal native argument, and failed Chrome-return recovery.
- `npm test`: 1377 PASS; API smoke PASS; ingest 22 PASS; i18n 233 PASS.
  Initial full run failed four stale locale-version locks; exact locks were
  updated to 211, then the full suite passed without weakened assertions.
- `node scripts/premium/iphone-downloader-browser-smoke.js`: 14 groups PASS.
  Real loopback HTTP UI with TEST_FIXTURE_ONLY media/native command results;
  preview warning preserves READY/name/SHA across reload, retry clears warning,
  and no additional download command is sent. Includes 380px, desktop, RU/EN/HE,
  repeated reloads, archive hash, and no provider/ASR calls on the download page.
- `node scripts/premium/iphone-downloader-upgrade-smoke.js`: start before the
  492-to-493 production deployment to test the ordinary Update prompt with an
  actual service worker; `--fixture` uses exact Git releases instead. Evidence
  classes are reported separately and never relabeled as physical iPhone PASS.

Build command: `python scripts/premium/build-iphone-downloader.py`.
Frozen owner-qualified download engine unchanged. Immutable helper:
`iphone-downloader-bfd5524471de702d.pyz`, 43756 bytes, SHA-256
`bfd5524471de702d2b280d8d3761340c3b2c3013e0f695a6bb20cf67de114512`.
Old published packages are retained. The update fetches the new pinned helper
automatically; no reinstall or terminal commands are required.

Read this README and RELEASE_VERIFIED.md for the handoff. Generated `local/`,
`production/`, and upgrade reports/screenshots are evidence, not editable source.
Scratch files are not user deliverables. Corrected native preview/share-sheet
acceptance remains pending a new owner test on the physical iPhone.

## Owner check

Update Studio normally, open `/download-media.html` and confirm footer 3.11.493.
Open the helper for the existing history entry: it verifies the saved file
without downloading it again. Tap Open/Share if the viewer does not open
automatically. Check Open/Share for the same title with its
apostrophe, then return to Chrome. If the native viewer still fails, the helper
must retain the saved result/SHA and show an opening-specific warning, not
"Could not download". The file remains accessible in Files at its existing path.
