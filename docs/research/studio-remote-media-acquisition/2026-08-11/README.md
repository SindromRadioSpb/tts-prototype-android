# Studio remote media acquisition — GitHub and feasibility research

> **Date:** 2026-08-11
> **Status:** research complete; owner mobile-first direction recorded; RMA-0–RMA-3 local code and
> browser evidence added; no production deployment and no media bytes downloaded
> **Decision output:**
> `docs/planning/STUDIO_REMOTE_MEDIA_ACQUISITION_DECISION_PACKET_2026_08_11.md`

## What this artifact is

This report evaluates open-source components for the missing Studio flow:

```text
video URL -> local media file -> Media Readiness -> captions or ASR -> learning material
```

The investigation used repository metadata, upstream README/licence material, the current
LinguistPro code and production UI, and a metadata-only probe of the owner's public example URL.
It did not download the video or audio. Temporary Python packages were installed under the Windows
temporary directory, not in the repository or Companion runtime.

## Current product evidence

Production `3.11.342` at 380 px currently exposes:

- `Видео`: a YouTube URL can mount the player, then the user must paste the YouTube transcript or
  choose a VTT/SRT file;
- `Файл`: photo/PDF/Word, media ASR, subtitles and the full `Сохранённые транскрипты` shelf share
  one long panel;
- the media control still says `Аудио (иврит) -> транскрипт` although the picker accepts audio and
  video;
- Media Readiness and the local Companion already provide the correct local, authenticated,
  FFmpeg-backed boundary after bytes exist.

This means the missing component is acquisition, not a new ASR, media, library or package system.

## GitHub candidate matrix

Repository state was read on 2026-08-11. Activity dates are observations, not future maintenance
guarantees.

| Candidate | Licence / state | What it proves | Decision |
|---|---|---|---|
| [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) | source/PyPI wheel: Unlicense; active; latest inspected release `2026.07.04` | mature extraction core, structured metadata, format selection, subtitles, progress and cancellation substrate | **Adopt as pinned core** inside the isolated acquisition worker |
| [yt-dlp/ejs](https://github.com/yt-dlp/ejs) | Unlicense; active; inspected `0.8.0` | current YouTube extraction requires external JS challenge solving | **Adopt pinned with yt-dlp**; versions move together |
| [denoland/deno](https://github.com/denoland/deno) | MIT; active | upstream-recommended JS runtime; solver code runs with restricted permissions | **Bundle a pinned runtime** after licence/build review |
| [NickvisionApps/Parabolic](https://github.com/NickvisionApps/Parabolic) | MIT; active desktop frontend | restrained URL -> preview -> format -> progress interaction | UX/lifecycle reference only |
| [alexta69/MeTube](https://github.com/alexta69/metube) | AGPL-3.0; active self-hosted server | queue/progress/cancel/download patterns; explicit warning that arbitrary yt-dlp options can enable command execution | Reference only; do not embed or deploy its server |
| [JunkFood02/Seal](https://github.com/JunkFood02/Seal), [deniscerri/ytdlnis](https://github.com/deniscerri/ytdlnis) | GPL-3.0; Android apps | native Android execution and mobile-friendly selection are feasible | Reference only in the PWA/Companion slice |
| [yausername/youtubedl-android](https://github.com/yausername/youtubedl-android) | GPL-3.0 Android library | bundles Python/yt-dlp and FFmpeg, exposes progress/cancel/info | Candidate only for a separately licensed native Android product |
| [kewlbear/YoutubeDL-iOS](https://github.com/kewlbear/YoutubeDL-iOS) | MIT; last push observed 2024-01; README warns it is not App-Store-safe | native iOS execution is technically possible | R&D evidence only; not a PWA or public distribution answer |
| [net00-1/SW-DLT](https://github.com/net00-1/SW-DLT) | MIT; active iOS Shortcut wrapper | a user-installed Shortcut can bridge share-sheet URLs to yt-dlp | Optional external workaround only; not the requested first-party UX |
| [imputnet/cobalt](https://github.com/imputnet/cobalt) | AGPL-3.0; server/proxy architecture | polished paste-link UX | Reject: production media proxy, licensing and operations contradict current canon |
| [distubejs/ytdl-core](https://github.com/distubejs/ytdl-core) | MIT but archived | Node-only extraction alternative | Reject: archived and narrower than yt-dlp |

Important licensing nuance: the yt-dlp repository and PyPI wheel contain Unlicense code, while the
upstream PyInstaller standalone executables include other components and upstream describes the
combined executable as GPLv3+. LinguistPro should therefore freeze the source/PyPI package in its
own worker build, not copy the upstream `yt-dlp.exe`. Every transitive component and the
exact FFmpeg build still require the existing third-party inventory gate. The LinguistPro root
currently has no root `LICENSE`, so any wider distribution model is a separate owner decision.

## Live reference-service audit: SSYouTube and SaveFrom

The owner supplied two reference flows and authorised a read-only Kapture audit on 2026-08-11.
The audit resolved metadata but did not click a media-download link and did not download media
bytes.

### What is worth adopting

Both products validate a useful interaction model:

1. paste a URL;
2. resolve title, thumbnail and duration;
3. show only formats actually available for that item;
4. let the user choose video quality or audio;
5. keep the download action beside the selected variant.

This is materially better than making the user understand yt-dlp format IDs. LinguistPro should
adopt the interaction grammar, not either site's branding, ads or implementation.

### What Kapture observed

- SSYouTube sends the pasted URL to a separate `POST /api/convert` service. The JSON response
  contains source metadata, Hebrew subtitle availability, individual video/audio streams, byte
  sizes and opaque server conversion jobs. Its CORS response allows its own web origin, not
  LinguistPro.
- SSYouTube labels 1080p variants without audio as such. Combined MP4 qualities are represented as
  conversion jobs over separate video and audio streams.
- SaveFrom submits through its own same-origin form/iframe, then renders short-lived signed media
  URLs. Its 360p MP4 is a progressive file with audio; higher-resolution entries may be video-only,
  while OPUS/M4A are separate audio tracks.
- SaveFrom sends `X-Frame-Options: sameorigin`. Even where a third-party page can technically be
  framed, cross-origin isolation prevents LinguistPro from receiving its selected bytes directly
  into Studio OPFS.
- Both surfaces include promotions, third-party scripts and/or external helper installation. That
  conflicts with the requested first-party, no-ad, continuous Studio pipeline.

### Integration verdict

Do not call, scrape or iframe either service from LinguistPro. There is no inspected stable public
API contract, SSYouTube's browser API is origin-bound, SaveFrom's result path is same-origin and
short-lived, and neither can produce a trustworthy Studio SHA/OPFS receipt. A proxy around either
site would merely turn an undocumented third-party frontend into a hidden critical dependency.

Use their five-step UX pattern over LinguistPro's own bounded yt-dlp acquisition worker.

## Exact metadata-only probe

Source supplied by the owner:

```text
https://www.youtube.com/watch?v=nNQhzD-T85M&list=PLACmvHcJM5hc&index=2
```

Scratch setup and probe:

```powershell
$probeRoot = Join-Path $env:TEMP 'lp-yt-dlp-research-20260811'
py -3.11 -m pip install --target $probeRoot 'yt-dlp==2026.7.4' 'yt-dlp-ejs==0.8.0'
$env:PYTHONPATH = $probeRoot
py -3.11 -m yt_dlp --simulate --no-playlist --no-cookies --no-config `
  --js-runtimes deno --print-json '<owner URL>'
```

Observed facts:

- extractor version `2026.07.04` and EJS `0.8.0` resolved the public item without cookies;
- title: `אויבים עונה 5 | פרק 4 - אחמד א-שרע (אל ג'ולאני)`;
- duration: `55:04`;
- the playlist parameters were ignored by `--no-playlist`;
- the default selection was 1080p AV1 + Opus, approximately `316,609,918` bytes;
- Hebrew automatic captions were exposed under the legacy provider language code `iw`;
- no media bytes were downloaded.

The LinguistPro-compatible selector probe was:

```text
bv*[vcodec^=avc1][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]
```

It selected format IDs `136+140`: H.264/AVC 1280x720 + AAC-LC in MP4, approximately
`246,274,392` bytes. This is below the existing 300 MiB limit and aligns with Media Readiness target
v1. It is not yet an actual-file playback proof because no bytes were downloaded and no target
device was tested.

A second metadata-only probe used the owner's SSYouTube/SaveFrom example
`wJgtBgZvQnU` (37:40). It demonstrated why a resolved format matrix is better than a fixed quality:

| User-visible result | Source tracks | Approximate bytes before MP4 container overhead |
|---|---|---:|
| Compact MP4 with sound, 360p | progressive format `18` | 96.98 MiB |
| MP4 with sound, 480p | AVC `135` + M4A `140` | 68.39 MiB |
| MP4 with sound, 720p | AVC `136` + M4A `140` | 85.13 MiB |
| MP4 with sound, 1080p | AVC `137` + M4A `140` | 250.33 MiB |
| Original audio, M4A medium | format `140` | 34.87 MiB |
| Compact audio, M4A low | format `139` | 13.14 MiB |

For this item, the compatible merged 720p result is smaller than the old progressive 360p file.
Therefore quality, codec, sound presence and predicted size must all be resolved per item; neither
resolution alone nor upstream `best` is an adequate product rule.

## Technical findings

1. A browser-only extractor is not a dependable architecture. YouTube extraction currently needs
   external JavaScript challenge solving; media requests may also require extractor-specific
   headers, cookies, IP continuity or protocols the browser cannot reproduce.
2. The existing 1536 MB application container remains the wrong boundary. Acquisition must not
   share its process, disk budget, queue or failure domain.
3. The Windows Companion remains the smallest desktop boundary, but it cannot satisfy the owner's
   new P0 requirement for direct iPhone/Android acquisition. The coherent cross-device boundary is
   a separate authenticated, ephemeral acquisition worker that streams a first-party result into
   Studio OPFS and optionally exposes the same prepared file as an explicit device download.
4. `best` is an invalid product default. Format selection must be deterministic and feed the
   existing iPhone+Android Media Readiness contract before ASR.
5. Captions are a first-class acquisition output. When an exact Hebrew VTT is available, the user
   may explicitly import it and skip ASR; auto captions remain labelled auto/derived.
6. Cookies are not required for the owner's public example and should be excluded from v1. Upstream
   warns that account-backed extraction can cause account restrictions; cookie support would need
   a separate secret-lifecycle and owner-risk decision.
7. A pinned extractor will eventually age. Silent self-update is incompatible with reproducible
   worker releases. V1 should fail as `EXTRACTOR_UPDATE_REQUIRED`; verified component update and
   rollback are a later bounded release mechanism.

## Terms and distribution boundary

Non-commercial use does not itself grant permission to download. Current YouTube Terms restrict
downloading and automated access except where the service expressly authorises it or prior written
permission exists. Official YouTube Help allows creators to download their own uploads and offers
offline viewing through YouTube/Premium, but those encrypted offline copies are not transferable
media files for LinguistPro.

The owner has confirmed rights-holder permission for the intended material and accepted the
bounded Terms risk. The technical recommendation remains an authenticated owner/trusted-user
acquisition worker, not a public `YouTube downloader`: explicit recorded rights basis, no cookies,
one item at a time, no playlists/channels and no marketing claim that public visibility equals
permission. This is a product-risk control, not a general legal determination.

Primary references:

- <https://github.com/yt-dlp/yt-dlp>
- <https://github.com/yt-dlp/yt-dlp/wiki/EJS>
- <https://github.com/yt-dlp/yt-dlp/wiki/FAQ>
- <https://github.com/yt-dlp/yt-dlp/wiki/Extractors>
- <https://github.com/Daninet/hash-wasm>
- <https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/>
- <https://ru.ssyoutube.com/>
- <https://ru.savefrom.net/247hU/>
- <https://yt-terms.static.usercontent.goog/pdf/terms/20231215/en_us_20231215.pdf>
- <https://support.google.com/youtube/answer/56100>

## Local implementation read-back — 2026-08-11

The approved local slice now uses an isolated Python worker (`media-acquisition/`) and an exact
hashed dependency lock. A fresh metadata-only execution through `yt-dlp 2026.7.4` resolved the
second owner fixture as:

```json
{"id":"wJgtBgZvQnU","duration":2260,"options":[["video-360",59730365],["video-480",71717839],["video-720",89268628],["video-1080",262494249],["audio-m4a",36568492],["captions-he-auto",null]],"signed_url_leaked":false}
```

Browser evidence uses the real Studio shell and fixture-only worker responses, so it validates UI
composition without pretending that a mobile media transfer occurred:

- `screenshots/rma3-380-ru.png` — RU/LTR, resolved complete-format matrix;
- `screenshots/rma3-380-he.png` — HE/RTL, mirrored rail and controls;
- 16/16 automated viewport/tap-target/localization/hash-runtime checks PASS;
- Chrome DevTools read-back confirms `window.APP_VERSION=3.11.343`, `scrollWidth=innerWidth=380`,
  the accessible dialog/checkbox/radio names and a loaded `hashwasm.createSHA256` runtime.

Production container/image digests, deployed routing and actual-byte iPhone/Android gates remain
separate. Deno 2.7.5 and FFmpeg 8.1 are development-machine observations only, not frozen image
claims.
