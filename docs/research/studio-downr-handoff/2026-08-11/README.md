# Studio Downr external handoff — implementation evidence

Date: 2026-08-11
Target web/SW version: `3.11.344`

## Product contract

- The primary Video action mounts the YouTube preview through `StudioImport.mountVideoFromField()`.
- Preview, transcript paste, and VTT/SRT import do not call acquisition-worker.
- Downr is opened only by an explicit user action as an external site. Studio copies a canonical
  YouTube watch URL and does not call Downr's private API, iframe it, or process its signed URLs.
- After returning, `Я скачал — выбрать файл` switches to `С устройства` and opens the existing
  media picker. The existing Media Readiness and ASR path owns the selected file.

## Repeatable gates

```text
npm run smoke:i18n
npm run smoke:ingest
npm run smoke:media-acquisition
npm run smoke:media-acquisition:browser
```

Browser smoke result: `27/27 PASS` for RU 380x844, HE/RTL 380x844, and RU 1280x900. The test uses
the real Studio shell and controller with a deterministic player adapter; it performs no upstream
media request and is not owner-live iPhone/Android evidence.

## Screenshots

- `screenshots/downr-380-ru.png`
- `screenshots/downr-380-he.png`
- `screenshots/downr-desktop-ru.png`
