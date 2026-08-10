# Studio Remote Media Acquisition — decision packet

> **Date:** 2026-08-11
> **Status:** **PROPOSAL / TECHNICALLY VALIDATED / OWNER PRODUCT-AND-TERMS DECISION REQUIRED**
> **Scope:** URL -> local media acquisition, import-dialog information architecture, saved-material
> surfacing and mobile boundary
> **Research:**
> `docs/research/studio-remote-media-acquisition/2026-08-11/README.md`
> **Prerequisite canon:**
> `docs/planning/STUDIO_MEDIA_READINESS_GATE_DECISION_PACKET_2026_08_08.md` and
> `docs/planning/STUDIO_INGEST_P4_IMPORT_CENTER_IMPLEMENTATION_PACKET_2026_08_02.md`
> **Current baseline:** local `main` at `75d0e446`, `origin/main` at `65e43715`, web client
> `3.11.342`, Companion `0.3.0-beta.5`; re-verify before implementation
> **Authority:** this document authorises no implementation, installer build, push, deploy, schema
> change, media download or owner-data mutation.

## 0. Decision in one screen

The missing feature should be implemented as a narrow extension of the existing local Companion,
not as browser scraping, a production server downloader or a second media/library system.

```text
paste one permitted media URL
  -> metadata-only local resolve
  -> title / duration / captions / target-compatible plan / size estimate
  -> explicit rights acknowledgement and explicit user choice
  -> local download + merge in Companion
  -> existing Media Readiness and final canonical SHA
  -> explicit captions import or explicit ASR
  -> existing Media Package / Import Center / Library continuity
```

Recommended core: exact-pinned `yt-dlp` PyPI source package + matching `yt-dlp-ejs` + pinned Deno
runtime, composed with the FFmpeg already bundled in Companion. Do not bundle upstream
`yt-dlp.exe`, expose arbitrary yt-dlp flags, read browser cookies, enable playlists or permit the
generic extractor in v1.

The user-facing feature is named **`Получить медиа по ссылке`**, not `YouTube downloader`.
YouTube enablement remains default-off and owner/trusted-user only until the owner explicitly
accepts the Terms/distribution risk. Public visibility is never presented as proof of permission.

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
6. external-copy state, OPFS material state and Companion temp state remain distinct;
7. every failure names the next action;
8. direct phone-only support is described honestly and not inferred from desktop Companion PASS.

## 2. Architecture decision

### A. Browser-only extraction — reject

It cannot provide a durable cross-platform contract. Current YouTube support needs EJS plus an
external JS runtime; signed media requests may require headers, IP continuity or protocols that a
PWA cannot reproduce reliably. A JavaScript extractor in the page would also expose a rapidly
changing security and supply-chain surface to every client.

### B. Production server yt-dlp/cobalt/MeTube — reject

This reopens the prior server yt-dlp NO-GO: anti-bot/geography drift, arbitrary outbound URL risk,
large temporary media, abuse/rate limiting, copyright complaints, 1536 MB container budget and a
second operational media plane. Cobalt and MeTube are useful references, not deployable
LinguistPro components.

### C. Existing Windows Companion — recommend for v1

The Companion already owns authenticated loopback jobs, FFmpeg/ffprobe, media readiness,
progress/cancel, TTL, delete receipts and a frozen installer. Adding one pinned extractor is the
smallest coherent implementation and keeps media bytes off production.

### D. Native Android/iOS — do not mix into v1

Seal/YTDLnis/youtubedl-android prove Android feasibility, but they are GPL and imply a native app.
YoutubeDL-iOS and SW-DLT prove technical iOS paths, but neither is a PWA solution and the former
explicitly warns of App Store rejection risk. A first-party native mobile product requires its own
licence, distribution and security decision.

### E. Phone -> desktop Companion -> phone bridge — strategic follow-up

A real first-party phone-only experience needs either a native runtime or a secure media-transfer
bridge. URL-only cloud control is insufficient because the resulting media bytes must still reach
the phone. LAN/Tailscale serving breaks the current loopback-only boundary; encrypted cloud relay
reopens P6 media transport/E2EE. Do not hide this scope inside the URL-acquisition slice.

**Synthesis:** ship C as owner/trusted-user v1 if the owner accepts the Terms risk; keep E as a
separate measured program. V1 materially removes third-party services on the PC and preserves the
existing manual media move/relink ceremony for phones, but it is not direct iPhone/Android URL
download.

## 3. GitHub component contract

Pinned build inputs:

| Component | V1 baseline | Rule |
|---|---:|---|
| `yt-dlp` | `2026.07.04` research baseline | PyPI/source package, exact version+hash |
| `yt-dlp-ejs` | `0.8.0` research baseline | exact compatible version; upgrade with yt-dlp |
| Deno | re-resolve exact release at implementation freeze | pinned binary+hash+licence; no updater |
| FFmpeg/ffprobe | existing Companion 8.1 build | reuse exact detected binaries and licence report |

The implementation freeze must verify current versions rather than blindly reuse this dated table.

Rules:

- no upstream `yt-dlp.exe` in the installer;
- no `latest`, nightly, runtime GitHub/npm component fetch or silent self-update;
- `--no-config`, no user/global yt-dlp config files;
- local EJS only; remote components disabled;
- fixed option allowlist built by our code; no arbitrary CLI/API option from the browser;
- `--no-playlist`, no channel/feed/subscription/batch path;
- no cookies, OAuth, PO-token UI, proxy or impersonation settings in v1;
- exact component versions and SHA-256 in Companion capability report and acquisition receipt;
- stale/broken extractor -> `EXTRACTOR_UPDATE_REQUIRED`, not generic failure or fallback;
- installer licence inventory and frozen-tree hash gate must include every new component.

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

The UI offers at most three intent-level choices, only when available:

1. **`Получить видео для обучения`** — H.264/AVC + AAC in MP4, maximum 720p in v1, under the
   existing 300 MiB and three-hour bounds; then Media Readiness.
2. **`Только звук для расшифровки`** — AAC/M4A when available, otherwise an explicitly previewed
   local audio conversion; no video-ready claim.
3. **`Использовать ивритские субтитры`** — exact VTT from the resolved source; manual versus auto
   provenance is visible; ASR is skipped only by explicit choice.

Never expose a codec/format dump in the primary UI. Technical details may show selected format IDs,
codecs, resolution, estimated bytes and extractor version.

### Format-selection invariant

`best` is forbidden. The owner's example proves why:

- upstream default: 1080p AV1 + Opus, about 316.6 MB — outside size and mobile target;
- LinguistPro selector: formats `136+140`, H.264 720p + AAC-LC MP4, about 246.3 MB.

Selection preference:

```text
H.264/AVC <=720p + AAC/M4A -> combined MP4 <=300 MiB
  -> lower compatible resolution
  -> honest no-compatible-format result
```

Do not silently select AV1/VP9/HEVC/Opus and rely on a later expensive transcode. If only a
non-compatible source is available, show a separate transcode preview and reuse current
`TRANSCODE_REQUIRED` consent.

## 5. Job and API contract

Extend the existing media-job family rather than create a second registry.

Proposed endpoints:

```text
POST   /v1/media/jobs/remote/resolve       {url} -> metadata-only job + plan
GET    /v1/media/jobs/{id}                 existing status surface
POST   /v1/media/jobs/{id}/acquire         {mode, plan_sha256, rights_confirmed:true}
POST   /v1/media/jobs/{id}/cancel          existing cancellation
GET    /v1/media/jobs/{id}/file            existing verified output handoff
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

- same bearer token, exact production Origin allowlist and loopback-only boundary;
- reuse the current one-active-plus-one-waiting media-job budget;
- resolve is metadata-only; signed CDN URLs and request headers never leave Companion;
- immutable `plan_sha256` covers canonical URL, remote ID, mode, format IDs, codecs, expected size,
  subtitle track, component versions and post-processing steps;
- duration/size enforced before download when known and during transfer regardless;
- output and partial paths are fixed inside the job directory; browser supplies no path/template;
- subprocess argument arrays or fixed Python API options only; `exec`, postprocessor args, config,
  output templates and external downloader selection are not user-controlled;
- cancel/failure removes partial outputs; complete output is hash-verified before exposure;
- 24-hour TTL and explicit delete receipt remain;
- no production API, media upload, provider call or schema migration.

## 6. Provenance and canon

Add `remote-source-receipt-v1` to the existing media job report, not a new database table:

```json
{
  "schema": "remote-source-receipt-v1",
  "source_platform": "youtube",
  "source_id": "nNQhzD-T85M",
  "canonical_public_url": "https://www.youtube.com/watch?v=nNQhzD-T85M",
  "title": "...",
  "duration_ms": 0,
  "caption": {"language": "he", "provider_language": "iw", "kind": "auto|manual"},
  "selection": {"mode": "video", "format_ids": ["136", "140"]},
  "extractor": {"name": "yt-dlp", "version": "...", "ejs_version": "..."},
  "output_sha256": "...",
  "output_size_bytes": 0
}
```

Never store signed CDN URLs, cookies, auth headers, visitor data, filesystem paths or a full raw
yt-dlp info JSON. The existing Media Package may store only the allowlisted public-source summary
and final canonical media SHA. The final SHA, not remote URL/ID, remains package/relink authority.

Ordering remains:

```text
remote source receipt -> actual local bytes -> Media Readiness -> final SHA
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
│ 55:04 · YouTube · иврит            │
│ Субтитры: иврит · авто             │
│                                    │
│ ○ Видео 720p MP4 · ~235 MB         │
│ ○ Только звук · ~50 MB             │
│ ○ Только субтитры                   │
│                                    │
│ □ У меня есть право сохранить      │
│   и обработать этот материал       │
│ [ Получить видео для обучения ]    │
│ Технические детали                 │
└────────────────────────────────────┘

Источник -> Загрузка -> Проверка -> Готово
```

Rules:

- paste does not start resolution; `Проверить ссылку` is the first explicit network action;
- resolved metadata replaces the current vague `Показать видео` action; embedded playback remains
  a secondary preview;
- the primary action names the selected outcome and includes estimate;
- progress shows bytes, percent, speed/ETA when grounded, current phase and Cancel;
- completion says `Медиа подготовлено для Студии`, not `Сохранено в Загрузки`;
- `Сохранить отдельную копию` is a separate browser action and existing owner-saved receipt;
- when captions exist, “skip ASR” is presented as a choice with provenance, never an automatic
  optimisation;
- failure examples: `Нужна новая версия Companion`, `Этот ролик требует входа — v1 его не
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

The v1 Companion flow is Windows Chrome/desktop. At 380 px on a phone, if no compatible local
runtime is reachable, the UI must say:

> `Получение файла по ссылке пока работает через Local Companion на компьютере. На этом телефоне
> можно импортировать уже сохранённый файл.`

Next actions: `Открыть инструкцию Companion`, `Выбрать файл на устройстве`, `Скопировать ссылку`.
Do not show a dead Download button and do not label desktop automation as iPhone/Android PASS.

The next mobile decision must choose one coherent route:

1. native Android companion (fastest Android, GPL/licence and distribution decision);
2. private/sideloaded native iOS+Android clients (high maintenance and App Store risk);
3. secure encrypted desktop-to-phone transfer (cross-platform but reopens P6/E2EE and storage);
4. remain manual media transfer after desktop acquisition.

Recommendation: validate v1 use first, then design option 3 only if phone-only acquisition remains
a frequent blocker. Do not build two native products and a relay simultaneously.

## 10. Terms, rights and privacy controls

- the UI never says that non-commercial, educational or public content is automatically permitted;
- first acquisition requires a short rights acknowledgement; later runs keep it visible but do not
  turn it into a legal guarantee;
- YouTube support is default-off, owner/trusted-user out-of-band and not publicly marketed;
- no cookies/account access in v1;
- no playlist/channel/bulk acquisition;
- source URL may be personal data for unlisted material; v1 excludes private/unlisted/account-only
  flows and logs only redacted public identity;
- source/output/temp retention and terminal deletion remain explicit;
- no media or extracted captions go to LinguistPro production;
- choosing Gemini ASR later remains the existing separate consent/upload boundary.

## 11. Red-before-fix gates

1. Paste and metadata resolve perform no download, ASR, translation or conversion.
2. The owner example resolves one video despite playlist parameters.
3. The owner example rejects upstream default AV1+Opus/316.6 MB and selects H.264 720p + AAC-LC
   under 300 MiB.
4. A no-compatible-format fixture fails with a named lower-quality/transcode/other-source action.
5. Hebrew `iw` captions normalize to language `he` while provider code and auto/manual kind remain.
6. Caption import can skip ASR only after the explicit caption choice.
7. Download cannot start without rights confirmation and matching immutable plan hash.
8. URL text cannot become a CLI option, path, output template, extractor argument or command.
9. Non-HTTPS, generic extractor, redirect to private/link-local/loopback, playlist/channel/live/DRM
   and login-required fixtures fail closed.
10. Unknown expected size is enforced during transfer; crossing 300 MiB cancels and deletes partials.
11. Cancel, network loss, merge failure, readiness failure and hash mismatch expose no
    complete-looking file and produce cleanup evidence.
12. Cookies, signed CDN URLs, auth headers and raw info JSON never appear in API/report/log/DOM.
13. `yt-dlp`, EJS, Deno and FFmpeg version/hash drift fail the frozen build/runtime gate.
14. Final output SHA equals the SHA consumed by Media Readiness, ASR and Media Package.
15. No provider request and no production media request occurs during resolve/download.
16. `С устройства` uses `Медиа на иврите -> транскрипт` in RU/EN/HE.
17. Add Material shows at most one recent draft and routes the complete list to Import Center.
18. RU/LTR and HE/RTL 380x844 at 100%/200% text have no horizontal overflow, clipped action or
    focus loss; 48 px primary targets.
19. Desktop Companion PASS, production web PASS, actual-file iPhone PASS and Android PASS remain
    separate evidence.

## 12. Implementation slices

### RMA-0 — freeze owner decision and licences

- owner chooses whether default-off YouTube support is accepted despite Terms risk;
- freeze exact component versions/checksums and licence inventory;
- freeze source/format/error/receipt contracts and red tests.

### RMA-1 — metadata-only resolve

- pinned components in Companion;
- pure URL/extractor/format planner;
- authenticated resolve endpoint, plan hash, content-free report;
- live metadata smoke on allowlisted public fixtures; no bytes downloaded.

### RMA-2 — bounded acquisition and Media Readiness composition

- fixed target selector, progress/cancel/size/duration/disk gates;
- download/merge into job-private paths;
- post-probe, final SHA, existing file/report/delete handoff;
- exact owner example actual-byte run only after owner confirms rights/use authority.

### RMA-3 — Studio premium UX

- resolved source card and one primary action;
- captions/audio/video intent choices;
- automatic in-session handoff without re-picker;
- copy corrections, recent-draft compaction, Import Center route;
- RU/EN/HE 380 px browser evidence.

### RMA-4 — release evidence

- frozen Companion tests and installed-tree read-back;
- local owner-like flow, explicit deletion receipt and no provider/server calls;
- separate installer, production and owner-device gates;
- no direct mobile claim unless a real mobile runtime/transfer slice exists.

## 13. Proposed implementation allowlist

The exact allowlist must be re-verified at implementation freeze. Proposed maximum:

```text
ai-local/pyproject.toml
ai-local/THIRD_PARTY_NOTICES.md
ai-local/README.md
ai-local/ai_local/main.py
ai-local/ai_local/media_jobs.py
ai-local/ai_local/remote_media.py                 # new pure resolver/planner adapter
ai-local/tests/test_remote_media.py               # new
ai-local/tests/test_media_jobs.py
ai-local/scripts/build_companion.ps1

public/index.html
public/js/local-asr-client.js
public/js/studio-import.js
public/js/studio-media-package.js
public/js/remote-media-acquisition.js             # new controller/presentation
public/js/studio-portable-learning-package.js
public/i18n/locales/ru.js
public/i18n/locales/en.js
public/i18n/locales/he.js
public/sw.js

tests/remoteMediaAcquisition.test.js               # new
tests/i18n.locale-version.lock.json
scripts/premium/remote-media-browser-smoke.js      # new
package.json

docs/planning/STUDIO_REMOTE_MEDIA_ACQUISITION_DECISION_PACKET_2026_08_11.md
docs/research/studio-remote-media-acquisition/2026-08-11/README.md
```

Any server route, schema migration, production media storage, cookie support, generic extractor,
mobile-native code, LAN/Tailscale listener, cloud relay, existing material mutation or file outside
the final allowlist is a stop and new owner decision.

## 14. Role-lens synthesis

- **R2/R17:** subtitles-first can avoid paid/noisy ASR, but only explicitly; the next action returns
  the user to a learning material, not a downloader queue.
- **R4:** one source card, one primary action, honest estimates, no format jargon, no dead mobile
  control; recent work is one shortcut, not an eight-card wall.
- **R5:** local acquisition removes third-party services and feeds the existing offline-first moat;
  public YouTube marketing or a desktop-only claim presented as mobile would fail the product bar.
- **R9:** public URL, extractor prediction, downloaded bytes, final SHA, captions provenance and
  device playback are separate facts.
- **R11:** explicit H.264/AAC selection and independent post-probe beat upstream `best`; no automatic
  transcode or caption trust upgrade.
- **R12:** existing media job/package/Import Center remain canon; acquisition receipt is evidence.
- **R13:** no retrofit/rebind of existing materials; a new URL run produces a new explicit source.
- **R14:** fixed origin/token, extractor/domain/option allowlists, no cookies, no arbitrary paths or
  commands, bounded one-item job.
- **R15:** no production media, named TTL/delete receipt, no signed URLs/secrets in reports.
- **R16:** local network+disk cost is estimated; subtitles-first and audio-only are explicit cheaper
  choices; no hidden provider cost.

## 15. Owner decisions needed before code

1. **YouTube Terms risk:** approve or reject default-off owner/trusted-user yt-dlp support. The
   recommendation is approve only for this bounded private channel with the controls above; do not
   publish or market it as a general downloader.
2. **V1 device boundary:** accept Windows Companion first, with existing manual transfer/relink to
   phones, or require a separate secure phone-transfer packet before any implementation. The
   recommendation is Windows v1 first, while explicitly not calling the mobile problem closed.
3. **Output default:** approve `video 720p MP4` as primary, with `audio only` and `Hebrew captions`
   as explicit secondary choices. Recommended: approve.
4. **Saved materials:** approve moving the complete shelf to Import Center and keeping only one
   recent-draft shortcut in Add Material. Recommended: approve.

## 16. Paste-ready implementation authority

The following is a proposal and grants no authority merely by appearing here:

> **ОДОБРЯЮ RMA-0–RMA-4 по decision packet 2026-08-11: default-off owner/trusted-user получение
> одного публичного видео по ссылке через существующий Windows Local Companion; exact-pinned
> yt-dlp source/PyPI package + matching yt-dlp-ejs + pinned Deno, без upstream yt-dlp.exe;
> metadata-only resolve до явного действия; `--no-playlist`, без cookies/login/PO-token/proxy,
> generic extractor и arbitrary options; primary H.264 720p + AAC MP4 <=300 MiB, explicit audio-only
> и Hebrew captions choices; rights acknowledgement; bounded progress/cancel/TTL/delete receipt;
> existing Media Readiness и final SHA до ASR/package; no automatic ASR/translation/transcode;
> rename to `Добавить материал` / `С устройства` / `Медиа на иврите -> транскрипт`; complete saved
> material list in Import Center with one recent shortcut. Разрешаю только финальный allowlist,
> red-before-fix gates и локальный scoped implementation commit. Не разрешаю push/deploy/installer
> publication, production server downloader/media storage, cookies/accounts, playlist/channel/batch,
> schema migration, LAN/Tailscale/cloud relay, native mobile app, existing card/package/binding
> mutation или утверждение iPhone/Android PASS. Остановись перед push/deploy/installer release и
> перед любым выходом за allowlist.**
