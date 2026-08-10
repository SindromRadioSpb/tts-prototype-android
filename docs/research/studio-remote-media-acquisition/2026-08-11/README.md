# Studio remote media acquisition — GitHub and feasibility research

> **Date:** 2026-08-11
> **Status:** research complete; no production code changed; no media bytes downloaded
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
| [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) | source/PyPI wheel: Unlicense; active; latest inspected release `2026.07.04` | mature extraction core, structured metadata, format selection, subtitles, progress and cancellation substrate | **Adopt as pinned core** inside Companion |
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
existing Companion build, not copy the upstream `yt-dlp.exe`. Every transitive component and the
exact FFmpeg build still require the existing third-party inventory gate. The LinguistPro root
currently has no root `LICENSE`, so any wider distribution model is a separate owner decision.

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

## Technical findings

1. A browser-only extractor is not a dependable architecture. YouTube extraction currently needs
   external JavaScript challenge solving; media requests may also require extractor-specific
   headers, cookies, IP continuity or protocols the browser cannot reproduce.
2. The production server remains the wrong boundary. It would reintroduce the already rejected
   server egress, anti-bot, storage, copyright, privacy and 1536 MB container risks.
3. The existing Windows Companion is the smallest correct boundary: authenticated loopback,
   pinned Python, FFmpeg/ffprobe, bounded jobs, progress/cancel, TTL and delete receipts already
   exist.
4. `best` is an invalid product default. Format selection must be deterministic and feed the
   existing iPhone+Android Media Readiness contract before ASR.
5. Captions are a first-class acquisition output. When an exact Hebrew VTT is available, the user
   may explicitly import it and skip ASR; auto captions remain labelled auto/derived.
6. Cookies are not required for the owner's public example and should be excluded from v1. Upstream
   warns that account-backed extraction can cause account restrictions; cookie support would need
   a separate secret-lifecycle and owner-risk decision.
7. A pinned extractor will eventually age. Silent self-update is incompatible with reproducible
   Companion releases. V1 should fail as `EXTRACTOR_UPDATE_REQUIRED`; verified component update and
   rollback are a later bounded release mechanism.

## Terms and distribution boundary

Non-commercial use does not itself grant permission to download. Current YouTube Terms restrict
downloading and automated access except where the service expressly authorises it or prior written
permission exists. Official YouTube Help allows creators to download their own uploads and offers
offline viewing through YouTube/Premium, but those encrypted offline copies are not transferable
media files for LinguistPro.

Therefore the technical recommendation is not a public `YouTube downloader`. If the owner chooses
to proceed, it should remain a default-off, owner/trusted-user, local Companion capability with an
explicit rights acknowledgement, no cookies, one item at a time, no playlists/channels and no
marketing claim that public visibility equals permission. This is a product-risk control, not a
legal determination; owner/legal review remains required.

Primary references:

- <https://github.com/yt-dlp/yt-dlp>
- <https://github.com/yt-dlp/yt-dlp/wiki/EJS>
- <https://github.com/yt-dlp/yt-dlp/wiki/FAQ>
- <https://github.com/yt-dlp/yt-dlp/wiki/Extractors>
- <https://yt-terms.static.usercontent.goog/pdf/terms/20231215/en_us_20231215.pdf>
- <https://support.google.com/youtube/answer/56100>
