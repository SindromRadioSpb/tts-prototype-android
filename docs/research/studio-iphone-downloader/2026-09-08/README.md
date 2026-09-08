# iPhone downloader delivery evidence

**Current correction:** see [native-ui-fix/README.md](native-ui-fix/README.md).
The owner rejected the 3.11.491 native route with a concrete compatibility error.
The original engineering evidence below is historical, not native acceptance.

Owner request: production Chrome/iPhone video downloading with the already
accepted a-Shell mini, without terminal commands and without touching ASR.
Source base: `97dee98f1dbe145eef8a5a7bfa31c283b22793b5`; target app 3.11.491.
Release commit and production checks are recorded in `RELEASE_VERIFIED.md`.

## Owner check

1. In ordinary Chrome on iPhone open
   https://linguistpro.kolosei.com/download-media.html . Keep a-Shell mini installed;
   no repeat installation, ZIP extraction, pickFolder or pasted command is needed.
2. Paste a YouTube link, state your right to download it and tap Continue in helper.
   Accept the iOS prompt to open a-Shell mini. First-time local dependencies are
   installed automatically into the isolated LinguistPro folder.
3. A LinguistPro screen should appear, then the actual title and available
   compatible quality choices. Select video and tap Download. Keep the helper
   foreground until it finishes; background downloading is not promised.
4. Tap Open / Share. Confirm the video plays with sound. The iOS preview share
   button can save another copy or send the file. The retained original is in
   Files / On My iPhone / a-Shell mini / LinguistPro / Downloads.
5. Close preview, tap Return to Chrome. The history should show the helper's
   saved-file report. Open file again from this history; bytes are rechecked in
   the helper before opening. No transcription is involved in this check.

If the helper returns an error or no LinguistPro screen appears, report the
screen and technical code. Do not paste terminal commands to bypass this gate.
New native bridge, iOS app switching, preview/share and history reopen:
NOT_TESTED until the owner performs this exact route. The predecessor's download
and Chrome exact-file play/seek remain separately OWNER_REPORTED_PASS.

## Reproduction and provenance

- `python scripts/premium/build-iphone-downloader.py`: deterministic archive plus
  hash-pinned browser bootstrap. Build inputs are the helper source, three
  product locales, CSS, and unchanged frozen owner-qualified probe ZIP.
- `python -m unittest discover -s scripts/premium/tests -p test_iphone_downloader.py`:
  22 offline protocol/storage tests, synthetic media explicitly TEST_FIXTURE_ONLY.
- `node --test tests/iphoneDownloader.test.js`: 6 focused checks.
- `npm test`: 1377/1377 PASS; `npm run test:api-smoke`: PASS;
  `npm run smoke:ingest`: 22/22 PASS.
- `node scripts/premium/iphone-downloader-browser-smoke.js`: isolated server and
  disposable browser profile, 12 grouped checks. `LP_IPHONE_DOWNLOAD_BASE` selects
  production for the same read-only browser gate. Test-created journal rows and
  native rendered states are TEST_FIXTURE_ONLY, not physical-iPhone evidence.

`local/` and `production/` contain generated reports and visually inspected
screenshots. These are QA artifacts, not source inputs or annotation worksheets.
Do not edit generated files. Review this README and the planning canon instead.
The archive is immutable; SHA256:
`e1e5906d9803b052899ed729e05fdc02b38284ddaaa6f55758c0dd54eec22000`, 40433 bytes.

The downloader uses no media acquisition server, proxy, ASR provider or new
infrastructure. App code/isolated dependencies are small downloads; source media
travels directly to the iPhone. Saved files remain local until the owner shares
them. Removing a browser history entry does not remove media. Interrupted
downloads can be retried; this release does not claim byte-range resume.
