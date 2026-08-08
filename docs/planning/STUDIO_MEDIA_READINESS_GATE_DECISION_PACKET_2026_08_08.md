# Studio Media Readiness Gate — decision packet

> **Date:** 2026-08-08
> **Status:** **OWNER APPROVED / LOCAL IMPLEMENTATION COMPLETE / ACTUAL-DEVICE ACCEPTANCE PENDING**
> **Owner direction:** `Утверждаю. Стартуй.` — authorises this docs-only contract slice. It does
> not yet authorise the implementation allowlist in §15, a push, deployment, schema change or data
> mutation. The exact implementation sentence is in §19.
> **Baseline:** `main/origin 91dce80b`, served client `3.11.341`, browser
> `MIGRATIONS.length=48`; production health/DB/migrations PASS at handoff.
> **Predecessors:** `STUDIO_HONEST_IMPORT_TO_CARD_DECISION_PACKET_2026_08_06.md`,
> `STUDIO_LONG_JOB_HONESTY_REAL_SERIES_ACCEPTANCE_PACKET_2026_08_07.md`,
> `STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md`,
> `STUDIO_INGEST_P2_PORTABLE_LEARNING_PACKAGE_V2_IMPLEMENTATION_PACKET_2026_08_02.md`.

## 0. Decision in one screen

LinguistPro currently proves that the selected file has a decodable audio duration before ASR. It
does **not** prove that the video track can play on iPhone or Android. The package then binds its
identity to the media SHA, so discovering a video problem after ASR/table/save forces a new SHA and
therefore a new package/archive ceremony.

The approved product direction is one mandatory, local, read-only-first gate before ASR:

```text
select source media
  -> Media Readiness preflight
  -> READY | LOSSLESS_REPAIR | TRANSCODE_REQUIRED | BLOCKED
  -> explicit owner action when bytes would change
  -> canonical playback media + final SHA
  -> ASR -> table -> binding -> .lplp
  -> exact-file playback proof on the target iPhone/Android after relink
```

The simple premium surface has one primary action at a time. Codec jargon stays under
`Technical details`; every refusal names the next action. No ASR, provider call, conversion,
binding change or package creation starts implicitly.

## 1. Trigger and owner evidence

The owner completed the targeted full deletion fix on production `3.11.341`, re-imported the
aligned package and reported:

> Заработало! Тестирование пройдено успешно.

That recovery proved the deletion contract, not a general media-readiness contract. The immediate
incident was `В сокрытии - 5`: the original video was accepted for ASR because its audio track was
decodable, while iPhone video playback later failed. A separately generated Level 3.2 copy and an
archive rebuilt around its new SHA passed the owner-iPhone flow.

## 2. Empirical file matrix

Read-only `ffprobe` on the owner's actual files produced:

| File | Size MiB | Video | Profile | Level | Pixel format | Geometry | Audio |
|---|---:|---|---|---:|---|---|---|
| `В сокрытии - 1.mp4` | 130.5 | H.264 | Main | 3.2 | yuv420p | 1280x720 @ 50 | AAC |
| `В сокрытии - 2.mp4` | 119.5 | H.264 | Main | 3.2 | yuv420p | 1280x720 @ 50 | AAC |
| `В сокрытии - 3.mp4` | 151.9 | H.264 | Main | 3.2 | yuv420p | 1280x720 @ 50 | AAC |
| episode 4 MP4 | 127.6 | H.264 | Main | 3.0 | yuv420p | 854x480 @ 25 | AAC |
| `В сокрытии - 5.mp4` | 142.2 | H.264 | Main | **6.2** | yuv420p | 1280x720 @ 50 | AAC |
| `В сокрытии - 5 - iPhone Level 3.2.mp4` | 142.2 | H.264 | Main | **3.2** | yuv420p | 1280x720 @ 50 | AAC |

The two episode-5 files differ by one byte in file size and by SHA because the H.264 metadata was
changed. Frames and audio were not re-encoded. This is the reference `LOSSLESS_REPAIR` case: the
declared Level is incompatible with the intended mobile contract while the actual stream
constraints fit a lower Level.

## 3. Grounded gap in current code

1. `public/js/studio-import.js::probeAudioDuration` instantiates `new Audio()` and proves only that
   the browser can read a duration. A video with playable audio and rejected video passes.
2. `ai-local/ai_local/media_slicer.py::probe_source` asks `ffprobe` for audio stream index, codec and
   duration only. The bundled FFmpeg/ffprobe runtime is already present but video properties are
   discarded.
3. `public/js/portable-learning-package-repository.js::listLifecycleMaterials` emits
   `media_codec_supported:null`; `unsupported-codec` exists in Import Center core/UI but has no
   real producer.
4. Portable packages already expose `codec_hint`, but it is optional and currently does not carry
   a verified readiness verdict.
5. Media Package identity is content-addressed. Any repair changes SHA; doing it after ASR/save is
   structurally late even when the repair is lossless.

## 4. Product boundary

### In scope

- uploaded local audio/video files used by Studio ASR;
- browser fast probe plus Companion deep probe;
- explicit lossless repair and explicit target-compatible transcode;
- one bounded media-preparation job, progress/cancel and output receipt;
- prepared-file download and immediate handoff back to the same import session;
- final SHA before ASR/package promotion;
- real Import Center codec state;
- exact-file playback test on the target phone after relink;
- RU/EN/HE mobile-first UI and accessibility.

### Out of scope

- automatic ASR, translation, conversion or cloud fallback;
- server-side FFmpeg, upload of source bytes to LinguistPro production or a conversion service;
- remote YouTube acquisition/yt-dlp;
- batch conversion or a general L2 queue;
- background folder watching;
- silent rewrite of an existing package, card or binding;
- archive/delete/rebind of any owner card;
- media bytes inside `.lplp.zip`;
- interpolated/neighbor/voted timing or derived timing canon;
- provider-default changes;
- browser or server schema migration;
- claiming Android PASS from an emulator or iPhone PASS from a 380 px viewport.

## 5. Compatibility target v1

The badge must say **`LinguistPro iPhone + Android target v1`**, never universal compatibility
with every historical device.

Prepared video contract:

- ISO-BMFF MP4 with `video/mp4` and fast-start metadata;
- one selected default video stream;
- H.264 Main, 8-bit `yuv420p`, progressive SDR;
- minimal truthful H.264 Level, never above 4.1 for the v1 target;
- no upscale; maximum 1920x1080 @ 30 fps or 1280x720 @ 60 fps;
- AAC-LC, at most 48 kHz, at most stereo for the selected playback audio stream;
- finite positive duration within the existing three-hour boundary;
- total source/output size within the existing 300 MiB boundary;
- no DRM/encryption and no unresolved multiple-audio selection;
- probe and decode test complete without malformed-stream warnings that affect playback.

Audio-only sources keep the existing audio path and are labelled `AUDIO_READY`; video readiness is
not invented for them.

The target is intentionally conservative. Apple recommends H.264 MP4 for static Safari video;
Android specifies H.264 AVC in MP4 and Main Profile decoding on supported modern releases. The
actual target-device proof in §12 remains required because a static matrix cannot prove a specific
device/browser/file combination.

## 6. Deterministic classifier

The pure classifier accepts normalized ffprobe evidence and returns exactly one outcome:

### `READY`

All target-v1 constraints pass, the container can be demuxed, a bounded decode sample succeeds and
the declared H.264 Level is not below the calculated requirement.

Primary UI: `Совместимо по контракту iPhone + Android` -> `Начать ASR`.

### `LOSSLESS_REPAIR`

Encoded essence is already target-compatible and only metadata/container repair is required:

- declared H.264 Level is higher than necessary and calculated stream constraints fit target v1;
- MP4 fast-start/remux is required;
- container metadata/tag is wrong while selected streams are directly copyable.

Primary UI: `Исправить без потери качества`.

The plan must list every proposed FFmpeg operation. `h264_metadata=level=auto` is allowed only when
the independently calculated required Level agrees with the post-output probe. No frame/audio
re-encode is permitted in this branch.

### `TRANSCODE_REQUIRED`

At least one selected playback stream is outside target v1 but can be converted locally, for
example HEVC/AV1/VP9, 10-bit/HDR, non-yuv420p chroma, excessive resolution/fps, unsupported audio or
an interlaced source.

Primary UI: `Создать совместимую MP4-копию`.

The preview must name quality impact, estimated output size, required/free disk, estimated time,
selected streams and the fact that SHA/package identity will change.

### `BLOCKED`

Probe corruption, DRM, no audio for ASR, ambiguous required stream, resource boundary or a failed
post-output verification prevents a safe plan.

The refusal must name a next action: choose an audio stream, choose another file, free disk,
re-export the source, retry the bounded local operation, or intentionally choose transcript-only.

## 7. One simple premium interaction

After file selection the existing import panel becomes:

```text
Проверка медиа
  [checking] Контейнер -> видео -> звук -> iPhone/Android target

  result badge
  one-sentence explanation
  [primary next action]
  [Technical details]
```

Rules:

1. Read-only browser checks may begin immediately.
2. Sending bytes to the paired loopback Companion for deep probe requires the existing explicit
   Companion enrollment/pairing state; bytes remain on the owner's machine.
3. Any byte-changing action requires a separate click after a complete preview.
4. ASR remains disabled while the material outcome is unresolved.
5. `Только расшифровать` is an explicit secondary route. It creates a transcript draft with a
   persistent `not_bound / playback not prepared` note; it does not pretend to be a media-ready
   learning material.
6. The prepared output is automatically selected in the current import session after download;
   the user does not have to rediscover/reselect it.
7. The original file is never overwritten or deleted.

## 8. Companion contract

Use the existing authenticated loopback Companion at `127.0.0.1:8799`. Do not add a production
server endpoint.

One bounded non-batch resource:

```text
POST   /v1/media/jobs                    stream source bytes; create probe job
GET    /v1/media/jobs/{id}               state/progress/plan/verdict
POST   /v1/media/jobs/{id}/prepare       explicit repair|transcode approval + plan hash
POST   /v1/media/jobs/{id}/cancel        bounded cancellation
GET    /v1/media/jobs/{id}/file          stream verified prepared output
GET    /v1/media/jobs/{id}/report        media-compat-report-v1
DELETE /v1/media/jobs/{id}               delete source/output/temp + receipt
```

States:

```text
UPLOADING -> PROBING -> WAITING_FOR_DECISION
  -> REPAIRING | TRANSCODING -> VERIFYING -> COMPLETE
  -> FAILED | CANCEL_REQUESTED -> CANCELED
```

Constraints:

- same bearer token, Origin allowlist and loopback-only boundary as ASR;
- one active plus one waiting media job; this is not L2b batch;
- content-addressed source/output and an immutable plan hash;
- explicit action is rejected if the source/plan hash changed;
- 24-hour TTL, explicit delete receipt and cleanup after successful handoff;
- no GPU residency requirement in v1; deterministic software encode is the correctness baseline;
- no shell string composition: subprocess argument arrays only;
- no arbitrary output path from the browser;
- output download uses a safe Content-Disposition filename and exact content length/hash.

## 9. `media-compat-report-v1`

The report is evidence, not a second media canon:

```json
{
  "schema": "media-compat-report-v1",
  "target": "lp-ios-android-v1",
  "source_sha256": "...",
  "source_size_bytes": 0,
  "source_name": "...",
  "probe": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "duration_ms": 0,
    "video": {
      "index": 0,
      "codec": "h264",
      "profile": "Main",
      "level": "3.2",
      "pixel_format": "yuv420p",
      "bit_depth": 8,
      "width": 1280,
      "height": 720,
      "fps": "50/1",
      "progressive": true
    },
    "audio": {
      "index": 1,
      "codec": "aac",
      "profile": "LC",
      "sample_rate": 48000,
      "channels": 2
    }
  },
  "verdict": "READY|LOSSLESS_REPAIR|TRANSCODE_REQUIRED|BLOCKED",
  "reasons": [],
  "plan": null,
  "plan_sha256": null,
  "output_sha256": null,
  "output_size_bytes": null,
  "timeline_verdict": null,
  "ffmpeg_version": "...",
  "ffprobe_version": "...",
  "code_version": "..."
}
```

No local path, bearer token, device identifier or user content text is exported. The Media Package
stores only the final canonical media SHA plus an allowlisted compatibility summary in its existing
JSON metadata. The existing portable `codec_hint` becomes a normalized RFC-6381-style hint derived
from the verified output, never free text from the browser.

## 10. Canon and identity ordering

1. `source_sha256` identifies the untouched owner file.
2. `output_sha256` identifies a generated compatible copy; it is absent for unchanged `READY`.
3. `canonical_media_sha256 = output_sha256 || source_sha256` is chosen **before ASR**.
4. ASR consumes that canonical file. Transcript duration/timing and Media Package identity refer to
   the same bytes.
5. Table, binding, portable export and exact relink use only the canonical SHA.
6. The report never authorises a binding by itself; normal SHA-only relink remains load-bearing.
7. No existing material is silently migrated when the same original source later produces a new
   canonical SHA.

This ordering is the main prevention: a future conversion no longer forces an archive rewrite
because conversion happens before the first package/archive exists.

## 11. Existing-material remediation boundary

The first implementation slice does **not** rewrite already prepared materials. Import Center may
offer `Проверить и подготовить медиа`, but after producing a new SHA it must stop with a named next
action.

A later single-material `Create compatible material version` path requires a separate packet that
proves:

- exact selected-audio essence or independently verified audio timeline parity;
- caption/timing applicability to the prepared file;
- new package/material identity and explicit owner confirmation;
- no overwrite/archive/delete of the prior card;
- new `.lplp` receipt and cold-reload read-back.

No bulk retrofit exists. Episode 5's already completed manual recovery is evidence, not authority
to generalise mutations across cards 5–9.

## 12. Target-device playback proof

Static checks are necessary but insufficient. `canPlayType()` returns empty/`maybe`/`probably`,
and Media Capabilities predicts support/smoothness/power efficiency. Neither proves that a complete
specific file plays on a specific phone.

After transfer and exact-SHA relink, the user explicitly taps `Проверить видео на этом устройстве`.
The current device test requires:

1. selected file SHA equals the package SHA;
2. `loadedmetadata` and `loadeddata` without `HTMLMediaElement.error`;
3. user-gesture `play()` succeeds and `currentTime` advances;
4. seek near 25% and 75% emits `seeked`, followed by advancing playback;
5. audio track is present/decodable when the material expects audio;
6. no `stalled/error/abort` terminal failure during the bounded test;
7. result is labelled `Verified on this iPhone` or `Verified on this Android`, with browser/OS
   family and test time; no persistent hardware fingerprint is required.

The test is read-only and local. A 380 px browser, desktop mobile emulation or Android emulator does
not satisfy owner-device acceptance.

## 13. Lossless and transcode verification

### Lossless repair gate

- source/output selected audio packets are byte-identical;
- decoded video frame hashes at deterministic sample positions are identical;
- width/height/fps/duration/timebase remain equivalent;
- output probe meets target v1;
- FFmpeg command contains stream copy only;
- episode 5 produces H.264 Main Level 3.2 and passes post-output decode.

### Transcode gate

- output meets target v1 and bounded decode/seek succeeds;
- no upscale or aspect-ratio distortion;
- duration/timeline report is explicit;
- quality parameters and encoder are recorded;
- disk preflight leaves both source and complete output plus safety margin;
- partial output is never presented as complete and is deleted on cancel/failure;
- original stays byte-identical.

No claim that transcoding is lossless is permitted.

## 14. Adversarial role synthesis

- **R4 premium UX:** one primary action, no terminal codec dump, 48 px actions, RU/LTR and HE/RTL,
  progress/cancel, original-preserved receipt and no re-selection ceremony.
- **R5 product:** compatibility is solved inside the normal import path, locally and before paid or
  time-consuming work; the user does not need HandBrake/CLI knowledge.
- **R9 provenance:** source, prepared output, predicted compatibility and actual device proof remain
  distinct; `compatible by contract` is not `verified on this phone`.
- **R11 do-no-harm:** lossless repair precedes transcode; post-output independent probe/decode is the
  oracle; browser hints cannot certify playback.
- **R12 single canon:** one final media SHA is selected before ASR; the report is evidence, not a
  competing registry.
- **R13 migration:** existing packages are not rewritten; any future compatible-version flow is
  previewed, single-item, reversible and receipt-backed.
- **R15 lifecycle:** original/generated/temp files have named retention and explicit deletion;
  `.lplp` still contains no media bytes.
- **R16 cost:** no Gemini/server expense; one bounded local job; estimates and disk budget shown
  before transcode.
- **R2/R17:** users do not spend hours creating an unusable learning material; transcript-only is
  honest and cannot masquerade as media-ready.

## 15. Exact implementation allowlist

The implementation may touch only:

```text
ai-local/ai_local/main.py
ai-local/ai_local/media_slicer.py
ai-local/ai_local/media_compat.py                 # new pure probe/classifier/planner
ai-local/ai_local/media_jobs.py                   # new bounded single-job lifecycle
ai-local/tests/test_media_compat.py                # new
ai-local/tests/test_media_jobs.py                  # new
ai-local/README.md

public/index.html
public/js/local-asr-client.js
public/js/media-readiness.js                       # new browser controller/pure presentation
public/js/studio-import.js
public/js/studio-media-package.js
public/js/media-package-repository.js
public/js/portable-learning-package-core.js
public/js/portable-learning-package-repository.js
public/js/import-center-core.js
public/js/studio-portable-learning-package.js
public/i18n/locales/ru.js
public/i18n/locales/en.js
public/i18n/locales/he.js
public/sw.js

tests/mediaReadiness.test.js                       # new
tests/mediaPackageRepository.test.js
tests/portableLearningPackageCore.test.js
tests/portableLearningPackageRepository.test.js
tests/importCenterCore.test.js
tests/i18n.locale-version.lock.json
scripts/premium/media-readiness-browser-smoke.js    # new
scripts/premium/import-center-browser-smoke.js

docs/planning/STUDIO_MEDIA_READINESS_GATE_DECISION_PACKET_2026_08_08.md
docs/planning/STUDIO_MEDIA_READINESS_GATE_NEXT_SESSION_PROMPT_2026_08_08.md
docs/research/studio-media-readiness/2026-08-08/README.md
docs/research/studio-media-readiness/2026-08-08/fixtures/*.json
```

Any need for a migration, `server.js`, Dockerfile/installer rebuild, provider/default change,
existing card mutation, or a file outside this list is a stop and new owner decision. Companion
installer publication is a separate release slice after source tests pass.

## 16. Red-before-fix gates

1. Episodes 1–3 classify `READY`; episode 4 classifies `READY` without upscale; original episode 5
   classifies `LOSSLESS_REPAIR`; repaired episode 5 classifies `READY`.
2. Original episode 5 plan is stream-copy `h264_metadata`/remux only; a test fails if a video/audio
   encoder is present.
3. HEVC 10-bit/HDR fixture classifies `TRANSCODE_REQUIRED`; corrupted/DRM/ambiguous fixtures fail
   closed with named actions.
4. Audio-decodable/video-rejected fixture fails the current audio-duration-only assumption.
5. No ASR client call occurs before `READY` or a verified prepared output.
6. `Только расшифровать` records `not_bound` and cannot promote a media-ready material silently.
7. Plan-hash mismatch, disk shortage, cancel and ffmpeg failure leave no complete-looking output.
8. Lossless output proves selected-audio packet identity and deterministic decoded-frame parity.
9. A new SHA is propagated to Media Package and `.lplp`; old SHA exact relink is refused.
10. Import Center's `unsupported-codec` comes from a real classifier result, not a fixture-only flag.
11. RU/HE 380x844 at 100% and 200% text: no horizontal overflow, 48 px controls, progress and
    refusal are accessible, focus returns correctly.
12. Browser/device probe distinguishes `compatible by contract` from `verified on this device`.
13. No provider request, production upload or automatic conversion occurs in any browser smoke.

## 17. Regression and acceptance gates

```text
pytest ai-local/tests/test_media_compat.py ai-local/tests/test_media_jobs.py
pytest ai-local/tests
node --test tests/mediaReadiness.test.js
npm run smoke:media-package
npm run smoke:media-package:browser
npm run smoke:portable-learning-package
npm run smoke:portable-learning-package:browser
npm run smoke:import-center
npm run smoke:import-center:browser
npm run smoke:studio-chunks
npm run smoke:room-media
npm run smoke:i18n
npm test
```

Real acceptance, separately recorded:

1. Windows Chrome + paired Companion: episodes 1–4 pass without writes.
2. Original episode 5: lossless preview -> prepared copy -> post-probe Level 3.2 -> ASR starts
   against prepared SHA -> save/export/reload retains exact package identity.
3. Actual owner iPhone: transfer -> dry-run -> exact relink -> target-device play/seek PASS -> card
   playback/cue/row PASS -> cold reload PASS.
4. Actual supported Android device: same exact ceremony. Emulator does not substitute.
5. Target-compatible conversion fixture: preview/progress/cancel/retry/output verification PASS; original
   SHA unchanged.

Production PASS is served version + health/DB/migrations + fresh-browser evidence. Owner-device
PASS is separate and cannot be inferred from automation.

## 18. Stop conditions

Stop without improvisation if:

- output requires a target above v1 or the correct H.264 Level cannot be calculated independently;
- ffprobe and post-output decoder disagree;
- source/output audio or timeline evidence is ambiguous;
- output SHA is not the one consumed by ASR/package creation;
- Companion would expose a LAN/server route or accept unauthenticated browser calls;
- a partial file could be mistaken for complete;
- a new schema/migration or existing material rewrite becomes necessary;
- iPhone/Android actual test is unavailable: report the missing device gate honestly;
- full suite gains a new failure.

Every stop report must name the next action.

## 19. Exact implementation-authority sentence

This sentence is proposed and is **not** granted merely because it appears in this packet:

> **ОДОБРЯЮ реализацию Studio Media Readiness Gate строго по decision packet 2026-08-08:
> обязательный read-only preflight видео до ASR; четыре детерминированных исхода READY / LOSSLESS_REPAIR /
> TRANSCODE_REQUIRED / BLOCKED; один authenticated loopback media-job в существующем Companion;
> явный lossless H.264 metadata/remux repair и явная target-compatible MP4 conversion с preview,
> progress/cancel/disk estimate; оригинал никогда не перезаписывается; окончательный media SHA
> выбирается до ASR и становится единственной package/archive identity; реальный codec state в
> Import Center; отдельные actual-file iPhone и Android play/seek gates. Разрешаю только allowlist
> §15, red-before-fix §16 и локальный scoped implementation commit. Не разрешаю push/deploy,
> installer publication, schema migrations, server-side FFmpeg, media upload на production,
> automatic ASR/translation/conversion, provider-default changes, batch/L2 queue, silent fallback,
> существующие card/package/binding mutations, bulk retrofit, media bytes in `.lplp`,
> interpolated/neighbor/voted timing или derived timing canon. Остановись перед push/deploy и перед
> любым выходом за allowlist.**

## 20. Decision after this packet

The owner granted §19. The bounded implementation is complete locally at client version
`3.11.342`; it has not been pushed, deployed or published as a Companion installer.

Implemented gates:

- authenticated loopback probe/job/prepare/cancel/file/report/delete contract;
- one active plus one waiting job, 300 MiB/three-hour limits, 24-hour TTL and terminal delete receipt;
- immutable `plan_sha256`, partial output, original preservation, disk/time/quality preview;
- real FFmpeg lossless and transcode verification, bounded decode, target post-probe and lossless
  audio-packet/frame/timeline equality;
- browser pre-ASR blocking, explicit transcript-only, canonical SHA recheck immediately before
  ASR, metadata-only compatibility summary/RFC-6381-style hint and real Import Center codec state;
- current-device actual-file loaded/play/25% seek/75% seek gate both before ASR and after exact-SHA
  relink in Import Center; the post-relink gate uses only the selected browser file, requires a
  separate click, repeats SHA verification before playback, fails closed when audio presence is
  not exposed, reports browser/OS family and stores no device fingerprint; separate real owner
  iPhone and Android execution is still required.

Two actual-file facts refine the general matrix without hiding evidence:

1. Episodes 1–5 report `HE-AAC`, not AAC-LC. The specific §16 oracle requires episode 5 to remain
   stream-copy only and its repaired copy already passed owner iPhone playback. The classifier
   admits that proven profile and reports `HE-AAC` verbatim; it never relabels it LC.
2. Episodes 1–4 have `moov` after `mdat`, while §16 explicitly requires `READY`. `faststart:false`
   remains visible but does not alone force repair. Every generated output still uses fast-start.

Current automated evidence: Companion pytest 75/75; focused Node and fresh 380 px browser gates
PASS, including the Import Center exact-file handoff with zero provider calls and no persisted
device receipt; full Node 881 total / 877 pass / the same four pre-existing baseline failures. No
existing card, package, binding or production data was mutated.

## 21. Standards and tool references

- Apple WebKit, static Safari video: <https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari>
- Android supported media formats: <https://developer.android.com/media/platform/supported-formats>
- WHATWG `canPlayType()` confidence contract: <https://html.spec.whatwg.org/multipage/media.html>
- W3C Media Capabilities: <https://www.w3.org/TR/media-capabilities/>
- FFmpeg H.264 metadata bitstream filter: <https://www.ffmpeg.org/ffmpeg-bitstream-filters.html#h264_005fmetadata>
