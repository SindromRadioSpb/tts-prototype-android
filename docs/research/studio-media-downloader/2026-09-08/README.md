# Built-in downloader verification

Implementation baseline: `f9b8eb954d22c3c53f13e88e3e988045b3201320`; date: 2026-09-08.
Review the [implementation packet](../../../planning/STUDIO_MEDIA_DOWNLOADER_IMPLEMENTATION_2026_09_08.md).
These are engineering checks, not physical iPhone/Android or production acceptance.

## Reproduce

- `npm run smoke:media-acquisition:browser`: real Studio, isolated app database/browser profile,
  real worker HTTP/Range/receipts, real OPFS hashing and video/audio playback. Authentication and
  YouTube acquisition alone are replaced by deterministic fixtures. Requires Python with worker
  requirements, FFmpeg/ffprobe, Node dependencies and Playwright Chromium. Set
  `LP_MEDIA_TEST_PYTHON` when Python is not on PATH; this machine's disposable venv is autodetected.
- `python -m unittest discover -s media-acquisition/tests -t media-acquisition -v`.
- `node --test tests/mediaStreamStore.test.js tests/remoteMediaAcquisition.test.js`.
- `python scripts/premium/media-acquisition-live-probe.py --url <approved-url> --kind video --quality 360`;
  repeat with `--kind audio`. This command contacts the actual source and downloads real bytes.

## Screenshots

`screenshots/choices-*` shows title, duration, format choice and rights confirmation.
`screenshots/complete-*` shows decoded media and export/transcription controls.
380px RU/HE RTL and 1280px RU were inspected. The test-pattern media and bilingual title are
generated fixtures, not screenshots of a successfully downloaded production YouTube video.
Screenshots are automated UI evidence, not annotated linguistic/accessibility gold data.
Do not edit generated screenshots; rerun the browser test. Temporary media, application data,
and browser profiles are scratch; do not promote them to source artifacts.

## Limits

Browser suspension resumes only when the app is reopened and the owner selects Continue;
this is not an iOS background-download promise. Server READY/receipt recovery lasts two hours
on the same temporary volume and secret; an active preparation interrupted by worker restart
must be started again. Local completed copies remain in this browser profile until its data is
removed, independently of account sign-in. Browser download/share requests are not claimed as
OS-confirmed file saves. No ASR/provider call is triggered automatically.
