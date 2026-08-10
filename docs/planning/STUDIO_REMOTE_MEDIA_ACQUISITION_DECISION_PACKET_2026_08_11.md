# Studio Remote Media Acquisition — decision packet

> **Date:** 2026-08-11
> **Status:** **OWNER DIRECTION RECORDED / MOBILE-FIRST ARCHITECTURE PROPOSED / IMPLEMENTATION AUTHORITY REQUIRED**
> **Scope:** URL -> local media acquisition, import-dialog information architecture, saved-material
> surfacing and mobile boundary
> **Research:**
> `docs/research/studio-remote-media-acquisition/2026-08-11/README.md`
> **Prerequisite canon:**
> `docs/planning/STUDIO_MEDIA_READINESS_GATE_DECISION_PACKET_2026_08_08.md` and
> `docs/planning/STUDIO_INGEST_P4_IMPORT_CENTER_IMPLEMENTATION_PACKET_2026_08_02.md`
> **Current baseline:** local `main` at `75d0e446`, `origin/main` at `65e43715`, web client
> `3.11.342`, Companion `0.3.0-beta.5`; re-verify before implementation
> **Owner direction recorded 2026-08-11:** rights-holder permission exists; YouTube Terms risk is
> accepted; direct iPhone/Android acquisition is P0; format/quality choice is required; the complete
> saved-transcript shelf moves to Import Center.
> **Authority:** these product decisions authorise this planning update, not implementation,
> infrastructure mutation, push, deploy, installer build, media download or owner-data mutation.

## 0. Decision in one screen

The missing feature should use LinguistPro's own narrow acquisition worker and one Studio flow, not
browser scraping, a third-party downloader iframe/API, the existing application container or a
second media/library system. Direct iPhone/Android use changes the former desktop-only
recommendation: the acquisition runtime must be reachable from the phone and stream into that
phone's Studio OPFS.

```text
paste one permitted media URL
  -> metadata-only resolve in isolated acquisition worker
  -> title / duration / captions / compatible quality matrix / size estimates
  -> explicit rights basis and explicit output choice
  -> bounded download + optional merge in worker
  -> streamed write + incremental SHA verification in device OPFS
  -> existing Media Readiness contract
  -> explicit captions import or explicit ASR
  -> existing Media Package / Import Center / Library continuity
```

Recommended core: exact-pinned `yt-dlp` PyPI source package + matching `yt-dlp-ejs` + pinned Deno
runtime, composed with a pinned FFmpeg build in a separate acquisition container. The Windows
Companion may reuse the same pure planner later, but it is not the P0 mobile runtime. Do not bundle
upstream `yt-dlp.exe`, expose arbitrary yt-dlp flags, read browser cookies, enable playlists or
permit the generic extractor in v1.

The user-facing feature is named **`Получить медиа по ссылке`**, not `YouTube downloader`.
YouTube enablement remains authenticated and owner/trusted-user only. The owner has confirmed
rights-holder permission and accepted the Terms risk; the product still records the declared
rights basis and never treats public visibility as permission.

## 1. Problem and success definition

The current `Видео` tab embeds YouTube and accepts transcript text/VTT/SRT but cannot produce a
local media file. The current `Файл` tab can process media once the user has obtained it elsewhere.
This forces the user out of LinguistPro precisely before its strongest pipeline begins.

Success is not “a command ran”. Success is:

1. one pasted URL yields one bounded, target-compatible local file;
2. the user sees title, duration, expected size and available Hebrew captions before downloading;
3. no download, ASR, translation, conversion or provider call starts implicitly;
4. the same final bytes and SHA flow through Media Readiness, ASR, package binding and relink;
5. the result is available to the Studio pipeline without another file-picker ceremony;
6. external-copy state, OPFS material state and worker temp state remain distinct;
7. every failure names the next action;
8. the same first-party flow is actually exercised with a real file on iPhone and Android before a
   mobile claim is made.

## 2. Architecture decision

### A. Browser-only extraction — reject

It cannot provide a durable cross-platform contract. Current YouTube support needs EJS plus an
external JS runtime; signed media requests may require headers, IP continuity or protocols that a
PWA cannot reproduce reliably. A JavaScript extractor in the page would also expose a rapidly
changing security and supply-chain surface to every client.

### B. Third-party SSYouTube/SaveFrom integration — reject

The live Kapture audit found a good five-step interaction, not a reusable product API. SSYouTube
calls an origin-bound conversion API and returns opaque conversion jobs plus source streams.
SaveFrom submits through its own origin and exposes short-lived signed links; it also denies
cross-origin framing. Neither service can hand verified bytes into LinguistPro OPFS or issue our
canonical SHA receipt. An iframe preserves ads/tracking and a second file picker; a server proxy or
scraper preserves all fragility while hiding the dependency. Adopt the UX grammar only.

### C. Existing application container — reject as the media worker

The current 1536 MB application container must not run extraction or FFmpeg. Large temporary media,
anti-bot/geography drift, arbitrary outbound URL risk, abuse/rate limiting and disk pressure would
share a failure domain with the learning product. No media bytes or yt-dlp process enter `server.js`
or its existing container.

### D. Existing Windows Companion — retain as desktop/local option

The Companion already owns authenticated loopback jobs, FFmpeg/ffprobe, progress/cancel, TTL,
delete receipts and Media Readiness. It remains a good desktop path and a useful pure-core test
oracle, but cannot satisfy direct iPhone/Android acquisition and is no longer the primary v1
boundary.

### E. Native Android/iOS — defer

Seal/YTDLnis/youtubedl-android prove Android feasibility, but they are GPL and imply a separate
native application. YoutubeDL-iOS and SW-DLT prove technical iOS paths, but neither is a PWA answer
and the former warns of App Store rejection risk. Two native clients would be substantially more
work than the cross-platform PWA path and would fragment MediaPackage/Import Center UX.

### F. Isolated first-party acquisition worker — recommend for mobile-first v1

Run exact-pinned yt-dlp/EJS/Deno/FFmpeg in a separate, authenticated, ephemeral container with its
own CPU/RAM/disk/concurrency limits. Route a first-party acquisition path to it without proxying
media bytes through the Node application process. The worker resolves metadata, prepares a chosen
compatible result, computes SHA-256 and streams the result to the browser. It keeps no durable
library and deletes job bytes on completion/TTL.

The PWA writes response chunks directly into OPFS rather than first constructing a 100–300 MiB
Blob. An incremental hash is calculated over the same chunks and compared with the worker's final
receipt before MediaPackage promotion. The primary mobile action is **`Добавить в Studio`**; an
explicit secondary action **`Сохранить копию на устройство`** downloads the same verified result
through the browser/Files surface.

Origin-private storage is available in current Safari/iOS and Chromium-class browsers, but OPFS is
not the user's visible Downloads folder. The two receipts must remain distinct:

- `stored_in_studio_opfs` — verified bytes are usable by Studio without another picker;
- `owner_saved_copy` — the browser/device download was separately initiated and acknowledged.

### G. Phone -> desktop -> phone bridge — reject for P0

LAN/Tailscale or cloud relay through the desktop still depends on the computer being online and
does not satisfy the owner's direct-phone requirement. It may remain a private fallback but is not
the product architecture.

**Synthesis:** choose F. It preserves one cross-platform Studio flow, solves the actual iPhone and
Android gap, keeps the main application container and durable data plane free of media, and avoids
an undocumented dependency on SSYouTube/SaveFrom. The cost is one deliberately bounded operational
worker and real owner-device acceptance before release.

## 3. GitHub component contract

Pinned build inputs:

| Component | V1 baseline | Rule |
|---|---:|---|
| `yt-dlp` | `2026.07.04` research baseline | PyPI/source package, exact version+hash |
| `yt-dlp-ejs` | `0.8.0` research baseline | exact compatible version; upgrade with yt-dlp |
| Deno | re-resolve exact release at implementation freeze | pinned binary+hash+licence; no updater |
| FFmpeg/ffprobe | exact worker build, initially matched to Companion 8.1 | pinned binary+hash+licence report |
| incremental SHA-256 | freeze after mobile spike | audited streaming implementation; no full-file `arrayBuffer()` |

The implementation freeze must verify current versions rather than blindly reuse this dated table.

Rules:

- no upstream `yt-dlp.exe` in the installer;
- no `latest`, nightly, runtime GitHub/npm component fetch or silent self-update;
- `--no-config`, no user/global yt-dlp config files;
- local EJS only; remote components disabled;
- fixed option allowlist built by our code; no arbitrary CLI/API option from the browser;
- `--no-playlist`, no channel/feed/subscription/batch path;
- no cookies, OAuth, PO-token UI, proxy or impersonation settings in v1;
- exact component versions and SHA-256 in worker capability report and acquisition receipt;
- stale/broken extractor -> `EXTRACTOR_UPDATE_REQUIRED`, not generic failure or fallback;
- worker image SBOM/licence inventory and frozen-image hash gate must include every new component;
- the worker has no self-update, shell, arbitrary postprocessor or user-selected executable path.

## 4. Deterministic source and format policy

### Source policy v1

- HTTPS only;
- explicit extractor allowlist; `Youtube` may be enabled only by the owner-only feature flag;
- generic/direct URL extractor deferred until redirect/DNS SSRF controls are independently proven;
- one item only; playlist query parameters resolve the selected video and never fan out;
- public, no-login content only;
- live streams, premieres still in progress, DRM, paid/member/private/age-gated content and ambiguous
  multiple-video pages fail closed;
- no filename-based identity; remote platform ID plus final local SHA are distinct facts.

### Output choices

The result card exposes a compact intent-first matrix. The first view shows at most four useful
rows; **`Другие варианты`** holds advanced/raw choices:

1. **`MP4 с видео и звуком`** — compatible H.264/AVC + AAC, with the best available bounded
   quality preselected and labelled `Рекомендуется`;
2. **`Компактный MP4`** — a smaller compatible result for mobile storage/data constraints;
3. **`Только звук для расшифровки`** — M4A original/low where available; MP3 appears only as an
   explicit conversion useful for the existing long-media slicing path;
4. **`Ивритские субтитры`** — exact VTT, with manual/automatic provenance.

Within `MP4 с видео и звуком`, the user may choose 360p/480p/720p/1080p when the resolved item
offers a compatible result under the 300 MiB and three-hour bounds. Each row states:

```text
720p · MP4 · видео + звук · ~85 MiB · нужно объединить
360p · MP4 · видео + звук · ~97 MiB · готовый поток
1080p · MP4 · видео + звук · ~250 MiB · нужно объединить
M4A · только звук · ~35 MiB
```

Video-only rows never masquerade as a complete video. They are hidden under technical details by
default and say `без звука`. OPUS/WebM/AV1/VP9 are not primary mobile outputs.

Never expose a raw codec/itag dump in the primary UI. Technical details may show selected format
IDs, codecs, resolution, sound presence, preparation step, estimated bytes and extractor version.

### Format-selection invariant

`best` is forbidden. The first owner's example proves why:

- upstream default: 1080p AV1 + Opus, about 316.6 MB — outside size and mobile target;
- LinguistPro selector: formats `136+140`, H.264 720p + AAC-LC MP4, about 246.3 MB.

Selection preference:

```text
recommended: H.264/AVC 720p + AAC/M4A -> combined MP4 <=300 MiB
  -> nearest lower compatible complete result
other choices: compatible complete 360p/480p/1080p results <=300 MiB
  -> honest no-compatible-format result
```

Do not silently select AV1/VP9/HEVC/Opus and rely on a later expensive transcode. If only a
non-compatible source is available, show a separate transcode preview and reuse current
`TRANSCODE_REQUIRED` consent.

The second owner's example (`wJgtBgZvQnU`, 37:40) proves that resolution is not a size proxy:

- progressive 360p with sound: about 96.98 MiB;
- merged AVC+M4A 480p: about 68.39 MiB;
- merged AVC+M4A 720p: about 85.13 MiB;
- merged AVC+M4A 1080p: about 250.33 MiB.

The planner therefore recommends from the complete tuple
`container + codecs + sound + resolution + exact/estimated bytes + preparation`, not resolution
alone.

## 5. Job and API contract

Reuse the existing job semantics and receipt vocabulary, but keep acquisition jobs in the isolated
worker's ephemeral registry rather than the Companion or durable product database.

Proposed endpoints:

```text
POST   /v1/media/jobs/remote/resolve       {url} -> metadata-only job + plan
GET    /v1/media/jobs/{id}                 existing status surface
POST   /v1/media/jobs/{id}/acquire         {mode, plan_sha256, rights_confirmed:true}
POST   /v1/media/jobs/{id}/cancel          existing cancellation
GET    /v1/media/jobs/{id}/file            bounded first-party streaming handoff
GET    /v1/media/jobs/{id}/report          extended content-free report
DELETE /v1/media/jobs/{id}                 existing terminal delete receipt
```

States:

```text
RESOLVING -> WAITING_FOR_ACQUISITION
  -> DOWNLOADING -> MERGING -> PROBING
  -> COMPLETE | WAITING_FOR_DECISION | FAILED
  -> CANCEL_REQUESTED -> CANCELED
```

`WAITING_FOR_DECISION` is the existing readiness decision when lossless repair or transcode remains.
The acquisition click may authorise the named download+merge plan, but never a surprise transcode.

Constraints:

- cookie/session authentication plus CSRF and exact production Origin checks; no public bearer in
  a download URL;
- one active plus one waiting acquisition job for the private owner/trusted-user cohort;
- resolve is metadata-only; signed CDN URLs and request headers never leave the worker;
- immutable `plan_sha256` covers canonical URL, remote ID, mode, format IDs, codecs, expected size,
  subtitle track, component versions and post-processing steps;
- duration/size enforced before download when known and during transfer regardless;
- output and partial paths are fixed inside the job directory; browser supplies no path/template;
- subprocess argument arrays or fixed Python API options only; `exec`, postprocessor args, config,
  output templates and external downloader selection are not user-controlled;
- cancel/failure removes partial outputs; complete output is hash-verified before exposure;
- file handoff uses a short-lived same-session token in an HTTP-only cookie/header path, supports
  cancellation and byte progress, and never redirects the browser to a signed upstream URL;
- the PWA writes streaming chunks to a `.partial` OPFS entry, hashes incrementally, atomically
  promotes only on SHA/size equality, and deletes the partial on abort/mismatch;
- worker output TTL is 30 minutes after completion or immediate deletion after verified handoff;
- no durable production media, provider call or product schema migration;
- range/retry support is a gated follow-up: v1 must either resume with immutable ETag/plan identity
  or restart honestly and delete the partial; never append bytes from a different plan.

## 6. Provenance and canon

Emit `remote-source-receipt-v1` from the worker and attach its allowlisted summary to the existing
MediaPackage only after device verification; do not create a second durable job/database table:

```json
{
  "schema": "remote-source-receipt-v1",
  "source_platform": "youtube",
  "source_id": "nNQhzD-T85M",
  "canonical_public_url": "https://www.youtube.com/watch?v=nNQhzD-T85M",
  "title": "...",
  "duration_ms": 0,
  "caption": {"language": "he", "provider_language": "iw", "kind": "auto|manual"},
  "selection": {"mode": "video", "quality": 720, "has_audio": true, "format_ids": ["136", "140"]},
  "rights_basis": {"kind": "rights_holder_permission", "confirmed_at": "..."},
  "extractor": {"name": "yt-dlp", "version": "...", "ejs_version": "..."},
  "output_sha256": "...",
  "output_size_bytes": 0,
  "device_receipt": {"stored_in_studio_opfs": true, "owner_saved_copy": false}
}
```

Never store signed CDN URLs, cookies, auth headers, visitor data, filesystem paths or a full raw
yt-dlp info JSON. The existing Media Package may store only the allowlisted public-source summary
and final canonical media SHA. Worker SHA and device incremental SHA must match before promotion.
The final verified SHA, not remote URL/ID, remains package/relink authority.

Ordering remains:

```text
remote source receipt -> worker-verified bytes -> device-streamed OPFS bytes -> matching final SHA
-> Media Readiness
-> explicit captions or ASR -> transcript/table -> binding/package
```

No ASR result may bind to a different download or pre-readiness SHA.

## 7. Premium interaction and information architecture

The visual direction stays inside the current Studio system. Use the existing ink/teal/slate/amber
tokens and font stack; add no decorative gradient, font download or generic dashboard cards. The
single signature interaction is a **source handoff rail** that changes from URL evidence to local
file evidence without making the user reselect the file.

### `Видео` tab at 380 px

```text
Видео по ссылке
[ https://...                         ]
[ Проверить ссылку ]

┌ resolved source ───────────────────┐
│ thumbnail  title                   │
│ 37:40 · YouTube · иврит            │
│ Субтитры: иврит · авто             │
│                                    │
│ ● 720p MP4 · звук · ~85 MiB        │
│ ○ 360p MP4 · звук · ~97 MiB        │
│ ○ M4A · только звук · ~35 MiB      │
│   Другие варианты                  │
│                                    │
│ ✓ Разрешение правообладателя       │
│ [ Добавить в Studio · 720p ]       │
│ Технические детали                 │
└────────────────────────────────────┘

Источник -> Подготовка -> На устройство -> Проверка -> Готово
```

Rules:

- paste does not start resolution; `Проверить ссылку` is the first explicit network action;
- resolved metadata replaces the current vague `Показать видео` action; embedded playback remains
  a secondary preview;
- the primary action names the selected outcome and includes quality/estimate;
- video choices state `видео + звук`; a video-only source states `без звука` and is never primary;
- `Другие варианты` progressively reveals 480p/1080p/raw tracks only when they add a real choice;
- progress shows bytes, percent, speed/ETA when grounded, current phase and Cancel;
- the device handoff writes to OPFS as a stream and never constructs the full file in JS memory;
- completion says `Добавлено в Studio на этом устройстве`, not `Сохранено в Загрузки`;
- `Сохранить копию на устройство` is a separate browser action and owner-saved receipt;
- when captions exist, “skip ASR” is presented as a choice with provenance, never an automatic
  optimisation;
- failure examples: `Сервису подготовки нужна проверенная новая версия`, `Этот ролик требует входа — v1 его не
  поддерживает`, `Совместимая копия превысит 300 MiB`, each with a next action.

### `Файл` tab vocabulary

Immediate copy corrections in the implementation slice:

- tab: `Файл` -> **`С устройства`**;
- section: `Аудио или видео-файл (иврит)` -> **`Медиа на иврите`**;
- action: `Аудио (иврит) -> транскрипт` -> **`Медиа на иврите -> транскрипт`**;
- modal title: `Импорт текста` -> **`Добавить материал`**;
- entry button may become `Добавить материал` with secondary description `ссылка, файл или фото`.

Do not collapse the three source tabs in this slice. The prior owner decision introduced them to
remove URL/video ambiguity. Re-evaluate a two-tab auto-classifier only after the new acquisition
flow has real use evidence.

## 8. Saved-material placement

`Сохранённые транскрипты` is not an input-file type and must stop dominating `С устройства`.

Canonical placement:

- **Import Center -> Materials** owns the complete list and lifecycle filters;
- Library owns promoted learning cards, not a duplicate transcript registry;
- the Add Material dialog may show one compact `Продолжить работу` row for the most recent draft,
  plus `Все материалы` -> Import Center;
- no eight-card shelf inside the file picker;
- `Редактировать материал` remains the action name across shelf, Import Center and Library;
- empty state in Add Material does not mention saved transcripts at all.

Recommended compact row:

```text
Продолжить работу
Враг 5 · черновик · 57:17              [Открыть]
                                           Все материалы ->
```

This preserves one-tap continuation while restoring the modal's single job: add a new source.

## 9. Mobile truth

Direct phone acquisition is now P0 and part of v1, not a follow-up claim. The supported path is:

```text
iPhone/Android PWA -> authenticated metadata resolve -> explicit format choice
-> isolated worker prepare -> first-party response stream
-> device OPFS `.partial` write + incremental SHA -> atomic promotion
-> immediate Studio import without a file picker
```

The same verified worker output may be downloaded separately to Files/Downloads, but that action
does not replace OPFS promotion and is not inferred from it.

Mobile implementation constraints:

- feature probe `navigator.storage.getDirectory`, `createWritable`, response streaming and available
  quota before starting;
- reserve estimated OPFS space plus safety margin before the worker downloads source streams;
- never hold the entire result in `ArrayBuffer`, `Blob`, JSZip or a DOM object URL;
- survive foreground/background interruption honestly: cancel and clean partial, or resume only
  against immutable plan/ETag identity;
- keep screen-awake/background expectations honest; iOS may suspend a foreground PWA download;
- explicit low-storage, lost-network, expired-job and app-suspended recovery actions;
- exact real-file owner gates on Safari/iPhone and Chrome/Android include 300 MiB boundary,
  cancel, retry, OPFS playback/seek, ASR handoff and optional Files/Downloads copy.

If a target browser fails the streaming/OPFS capability probe, the UI offers
`Сохранить файл браузером` and then `Выбрать сохранённый файл`; this is a named compatibility
fallback, not the primary experience or a mobile PASS.

## 10. Terms, rights and privacy controls

- owner decision: rights-holder permission exists and the YouTube Terms risk is accepted for this
  bounded private feature;
- the UI never says that non-commercial, educational or public content is automatically permitted;
- first acquisition records `rights_holder_permission`; later runs show the active rights basis and
  allow changing it, but do not turn it into a universal legal guarantee;
- YouTube support is authenticated, owner/trusted-user and not publicly marketed;
- no cookies/account access in v1;
- no playlist/channel/bulk acquisition;
- source URL may be personal data for unlisted material; v1 excludes private/unlisted/account-only
  flows and logs only redacted public identity;
- source/output/temp retention and terminal deletion remain explicit;
- media passes through the isolated worker only for preparation and streaming; it is never written
  to the product database, backups, analytics or durable application storage;
- choosing Gemini ASR later remains the existing separate consent/upload boundary.

## 11. Red-before-fix gates

1. Paste and metadata resolve perform no download, ASR, translation or conversion.
2. The owner example resolves one video despite playlist parameters.
3. The owner example rejects upstream default AV1+Opus/316.6 MB and selects H.264 720p + AAC-LC
   under 300 MiB.
4. The second owner example exposes complete 360p/480p/720p/1080p-with-sound choices and predicts
   their different sizes; no video-only row is labelled as complete.
5. A no-compatible-format fixture fails with a named lower-quality/transcode/other-source action.
6. Hebrew `iw` captions normalize to language `he` while provider code and auto/manual kind remain.
7. Caption import can skip ASR only after the explicit caption choice.
8. Download cannot start without recorded rights basis and matching immutable plan hash.
9. URL text cannot become a CLI option, path, output template, extractor argument or command.
10. Non-HTTPS, generic extractor, redirect to private/link-local/loopback, playlist/channel/live/DRM
   and login-required fixtures fail closed.
11. Unknown expected size is enforced during transfer; crossing 300 MiB cancels and deletes partials.
12. Cancel, network loss, merge failure, readiness failure and hash mismatch expose no
    complete-looking file and produce cleanup evidence.
13. Cookies, signed CDN URLs, auth headers and raw info JSON never appear in API/report/log/DOM.
14. `yt-dlp`, EJS, Deno, FFmpeg and streaming-hash version/hash drift fail the frozen worker gate.
15. Worker output SHA equals device incremental SHA and the SHA consumed by Media Readiness, ASR
    and Media Package.
16. No provider request and no media byte enters the Node application process/database/backups.
17. A 300 MiB handoff is streamed into OPFS without a full-file `arrayBuffer()`/`Blob`; cancel and
    suspension leave no promoted file.
18. `С устройства` uses `Медиа на иврите -> транскрипт` in RU/EN/HE.
19. Add Material shows at most one recent draft and routes the complete list to Import Center.
20. RU/LTR and HE/RTL 380x844 at 100%/200% text have no horizontal overflow, clipped action or
    focus loss; 48 px primary targets.
21. Worker/runtime PASS, production web PASS, actual-file iPhone PASS and Android PASS remain
    separate evidence; mobile release requires both device gates.

## 12. Implementation slices

### RMA-0 — freeze owner decision and licences

- record accepted rights-holder permission, accepted Terms risk, mobile P0, format choice and saved
  shelf relocation;
- freeze exact component versions/checksums and licence inventory;
- freeze source/format/error/receipt contracts and red tests;
- provision no infrastructure yet; first complete an isolated-worker resource/abuse/security spike.

### RMA-1 — isolated metadata-only worker

- pinned components in a standalone container and shared pure planner tests with Companion;
- pure URL/extractor/format planner;
- authenticated/CSRF-protected resolve endpoint, plan hash, content-free report;
- live metadata smoke on allowlisted public fixtures; no bytes downloaded.

### RMA-2 — bounded prepare and mobile streaming handoff

- fixed target selector, progress/cancel/size/duration/disk gates;
- download/merge into job-private paths;
- post-probe, worker SHA, first-party stream/report/delete handoff;
- chunked OPFS `.partial` write plus incremental SHA and atomic promotion;
- separate `stored_in_studio_opfs` and `owner_saved_copy` receipts;
- exact owner examples actual-byte runs are now permitted by the recorded rights basis, but remain
  part of the later device acceptance window rather than planning research.

### RMA-3 — Studio premium UX

- resolved source card and one primary action;
- progressive quality matrix with complete-video/audio/caption intent choices;
- automatic in-session handoff without re-picker;
- copy corrections, recent-draft compaction, Import Center route;
- RU/EN/HE 380 px browser evidence.

### RMA-4 — release evidence

- frozen worker image/SBOM tests and deployed-image read-back;
- explicit deletion receipt and proof that the Node app/database/backups received no media;
- real Safari/iPhone and Chrome/Android OPFS stream, playback/seek, ASR and device-copy gates;
- desktop Companion remains separately gated and must not substitute for either mobile result.

## 13. Proposed implementation allowlist

The exact allowlist must be re-verified at implementation freeze. Proposed maximum:

```text
media-acquisition/pyproject.toml                   # new exact-pinned worker package
media-acquisition/THIRD_PARTY_NOTICES.md           # new
media-acquisition/acquisition_service/main.py      # new API/auth boundary
media-acquisition/acquisition_service/planner.py   # new pure resolver/format planner
media-acquisition/acquisition_service/jobs.py      # new bounded ephemeral jobs
media-acquisition/acquisition_service/receipts.py  # new allowlisted content-free receipts
media-acquisition/tests/                           # new red/security/job tests
Dockerfile.media-acquisition                       # new isolated image

server.js                                          # short-lived acquisition capability mint only;
                                                   # never proxy media bytes

public/index.html
public/js/studio-import.js
public/js/studio-media-package.js
public/js/remote-media-acquisition.js             # new controller/presentation
public/js/media-stream-store.js                    # new chunked OPFS writer/hash verifier
public/js/media-store.js
public/i18n/locales/ru.js
public/i18n/locales/en.js
public/i18n/locales/he.js
public/sw.js

tests/remoteMediaAcquisition.test.js               # new
tests/mediaStreamStore.test.js                     # new
tests/i18n.locale-version.lock.json
scripts/premium/remote-media-browser-smoke.js      # new
package.json
package-lock.json                                  # only if audited hash dependency is selected

docs/planning/STUDIO_REMOTE_MEDIA_ACQUISITION_DECISION_PACKET_2026_08_11.md
docs/research/studio-remote-media-acquisition/2026-08-11/README.md
```

Any product schema migration, durable/cloud media storage, media-byte proxy in `server.js`, browser
cookie extraction, generic extractor, mobile-native code, LAN/Tailscale listener, third-party
converter API/iframe, existing material mutation or file outside the final allowlist is a stop and
new owner decision. Deployment configuration for the separate worker is expected but must be
enumerated with exact resource/disk/route/rollback values after RMA-0 and before infrastructure
mutation.

## 14. Role-lens synthesis

- **R2/R17:** subtitles-first can avoid paid/noisy ASR, but only explicitly; the next action returns
  the user to a learning material, not a downloader queue.
- **R4:** one source card, one primary action, honest complete-video/audio labels, progressive
  format disclosure and no dead mobile control; recent work is one shortcut, not an eight-card wall.
- **R5:** a first-party mobile acquisition worker removes ad-supported detours and feeds the
  existing offline-first device store; an embedded converter or desktop-only claim would fail the
  product bar.
- **R9:** public URL, extractor prediction, downloaded bytes, final SHA, captions provenance and
  device playback are separate facts.
- **R11:** explicit H.264/AAC selection and independent post-probe beat upstream `best`; no automatic
  transcode or caption trust upgrade.
- **R12:** worker job is ephemeral evidence; device MediaPackage/Import Center remain canon. The
  worker never becomes a second library.
- **R13:** no retrofit/rebind of existing materials; a new URL run produces a new explicit source.
- **R14:** session-bound capability, CSRF/origin checks, extractor/domain/option allowlists, no
  cookies, no arbitrary paths/commands, bounded one-item job and no public download token.
- **R15:** no durable server media, 30-minute maximum worker TTL, deletion receipt, no signed URLs
  or secrets in reports, and explicit OPFS-versus-device-copy receipts.
- **R16:** worker CPU/network/temp-disk and device quota are estimated before acquisition;
  subtitles/audio/compact video are explicit cheaper choices; one-active-plus-one-waiting caps cost.

## 15. Owner decisions recorded and remaining before code

Recorded as approved on 2026-08-11:

1. rights-holder permission exists for the intended material;
2. the bounded YouTube Terms risk is accepted;
3. direct iPhone/Android acquisition is P0, not a later desktop bridge;
4. users must be able to choose media form and quality;
5. the complete saved-transcript shelf moves to Import Center, with one recent shortcut in Add
   Material.

Remaining implementation decisions:

1. **Runtime boundary:** approve the recommended isolated first-party acquisition worker, including
   transient server-side source/merged bytes for at most 30 minutes, while forbidding media in the
   Node application process/database/backups.
2. **Exact presentation:** approve `720p MP4 · видео + звук` as the recommended row when available,
   with compact MP4, 480p/1080p, M4A/MP3 and captions exposed progressively from the resolved item.
3. **Two destinations:** approve `Добавить в Studio` (OPFS, primary) and `Сохранить копию на
   устройство` (Files/Downloads, secondary) as separate actions and receipts.
4. **Execution authority:** approve RMA-0 through RMA-3 as scoped local implementation; keep worker
   provisioning, push/deploy and RMA-4 owner-device window behind a later explicit gate.

## 16. Paste-ready implementation authority

The following is a proposal and grants no authority merely by appearing here:

> **ОДОБРЯЮ RMA-0–RMA-3 по mobile-first revision decision packet 2026-08-11: authenticated
> owner/trusted-user получение одного разрешённого публичного видео через отдельный ephemeral
> acquisition worker; exact-pinned yt-dlp source/PyPI + matching EJS + Deno + FFmpeg, без upstream
> yt-dlp.exe; metadata-only resolve; `--no-playlist`, без cookies/login/PO-token/proxy/generic
> extractor/arbitrary options; resolved choices complete H.264/AAC MP4 360p/480p/720p/1080p до
> 300 MiB, audio M4A/explicit MP3 conversion и Hebrew captions; 720p complete MP4 recommended when
> available; primary `Добавить в Studio` streams to OPFS `.partial`, incremental SHA equals worker
> SHA before atomic promotion; secondary `Сохранить копию на устройство` has a distinct receipt;
> 30-minute maximum worker TTL/delete receipt; no media bytes in Node process/database/backups;
> no automatic ASR/translation/transcode; rename Add Material/File/media-ASR copy and move complete
> saved list to Import Center with one recent shortcut. Разрешаю red-before-fix и scoped local
> implementation commit only. Не разрешаю infrastructure provisioning, push/deploy, production
> worker enablement, public access, durable media storage, third-party converter API/iframe,
> cookies/accounts, playlist/channel/batch, schema migration, LAN/Tailscale, native mobile app,
> existing card/package/binding mutation или утверждение iPhone/Android PASS. Остановись перед
> provisioning/push/deploy/RMA-4 и перед любым выходом за финальный allowlist.**
