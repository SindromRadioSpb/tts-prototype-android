# Studio Ingest Local ASR — Windows invite-only beta enablement packet

> **Date:** 2026-07-31
> **Source revision:** `77c48d139fef665b67c941ded731dd7175efca8e` (`main == origin/main`)
> **Decision scope:** Windows Local ASR Companion + product onboarding, local implementation only.
> **Permanent integration:** `NO-GO`.
> **Distribution status:** owner-approved unsigned distribution to the owner and a bounded trusted
> cohort only; public/general distribution remains blocked.

## 1. Owner decision and non-negotiable policy

The owner authorized a separate **invite-only Windows beta**. This is not a general-availability
or permanent product-quality claim.

Owner follow-up decision, quoted verbatim on 2026-07-31:

> «1. Выпускаем установщик без подписи. им будут пользоваться сейчас только я и мои доверенные
> пользователи. 2. программа некоммерческая. вопрос лицензирования снят. 3. human-gold проверку
> проведу по факту на проде. 4. готов Проверить работу с настоящего production-origin»

Operational interpretation: unsigned out-of-band distribution is `GO` only for the owner and
people the owner personally trusts; real production-origin browser verification is authorized. This does
not authorize push, deploy, installer hosting, production flags, public distribution, or permanent
integration. The owner's noncommercial/license decision removes the internal product-policy review
gate for this cohort; it is recorded as owner risk acceptance, not an independent legal opinion.

Owner quality-gate reclassification, quoted verbatim on 2026-07-31:

> «Утверждаю: из блокеров перемещаем в рекомендованные а не обязательные десять listen/read-
> фрагментов, четырёхдикторный human-gold beta gate, постоянный gate 60 минут/12 дикторов.»

Operational interpretation: all three are recommended evidence, not blockers for invite beta,
deploy, or a future permanent-integration decision. They remain uncompleted and must not be called
PASS. Permanent integration itself remains `NO-GO` until a separate explicit owner authorization;
the reason is decision authority, not the missing 60-minute/12-speaker study.

Owner browser/deployment directive, quoted verbatim on 2026-07-31:

> «production Edge исключаем из списка. deployment нового onboarding можно стартовать.»

Operational interpretation: the advertised first beta is Chrome-only; Edge production ceremony is
removed. Scoped push/deployment of the default-off onboarding is authorized. This does
not authorize public installer hosting, general distribution, provider-default changes, schema/data
mutation, cleanup, or permanent integration.

- Local ASR remains hidden and off by default.
- Gemini remains the product default.
- Local is selected only by an explicit user action.
- A Local failure never uploads media to Gemini and never selects Gemini automatically.
- The first advertised support matrix is Windows 11 + compatible NVIDIA/CUDA hardware + Chrome.
- Edge was tested on the local product origin but is excluded from the first production beta claim
  by owner decision on 2026-07-31.
- Firefox is not advertised for this beta until a separate stock-Firefox ceremony passes.
- The only allowed ASR candidate is
  `ivrit-ai/whisper-large-v3-turbo-ct2@72ad623a37947395efcc3933132353790e5a12f5`.
- `model.bin` must be exactly 1,617,884,968 bytes with SHA-256
  `db2a2265aa012c16c7db9edda3d699c99f984efdd3f2e22a72a8ce7e9720f3a2`.
- Compute/decode policy remains CUDA/float16, Hebrew, beam 5,
  `condition_on_previous_text=false`, `vad_filter=false`, `word_timestamps=false`.
- Full large-v3, CPU/int8 downgrade, VAD/timestamp repair, and cloud fallback are forbidden.

## 2. Grounded preflight

### Repository

- `HEAD == origin/main == 77c48d139fef665b67c941ded731dd7175efca8e`.
- Existing unrelated dirty/untracked files are outside this packet's allowlist and must be preserved.
- Production code already contains the default-off L1 client, pairing, job lifecycle, independent
  S12.5/S12.6/S12.7 normalization, and explicit Local-to-Gemini consent.
- Current user gaps are installation and onboarding: `ai-local/README.md` still requires a venv,
  dependencies, a pre-fetched snapshot, an environment flag, and Uvicorn; enrollment still
  requires a DevTools `localStorage` command.

### Local build/test machine

| Item | Observed |
|---|---|
| OS | Windows 11 Enterprise, build 26200, x64 |
| GPU | NVIDIA GeForce RTX 3070, 8192 MiB |
| Free VRAM at preflight | 5260 MiB (required: 3866 MiB) |
| Driver / reported CUDA | 595.79 / 13.2 |
| FFmpeg / ffprobe | 8.1 / 8.1 |
| Port 8799 | free |
| Exact pinned snapshot | present locally on `F:`; research source only, not product storage |
| Product model store | not installed in the user-local managed root |
| Packaging/signing | no PyInstaller, Inno Setup, SignTool, or code-signing certificate found |
| Disk | user-local `C:` has sufficient space for the declared activation reserve |

The locally produced installer remains visibly marked `UNSIGNED INTERNAL`. The follow-up owner
decision permits it to be given out-of-band only to the owner and personally trusted beta users.
It must not be publicly hosted, broadly advertised, or distributed beyond that cohort without a
new owner decision.

## 3. Architecture

```text
Windows per-user installer (unsigned internal in this slice)
  -> %LOCALAPPDATA%/Programs/LinguistPro Local ASR/
       Companion supervisor + frozen Python runtime + pinned runtime deps + ffmpeg/ffprobe
  -> %LOCALAPPDATA%/LinguistPro/LocalASR/
       models/       exact activated snapshot only
       state/        pairing + supervisor state + redacted receipts
       jobs/         Class-C ephemeral media/results, max 24h
       downloads/    partial exact-revision download, deleted on cancel/failure

Companion supervisor
  -> hardware/disk/port preflight
  -> explicit exact-revision model download -> SHA-256 -> atomic activation
  -> start/stop/restart ASR service on 127.0.0.1:8799 only
  -> copy pairing token only after explicit user action
  -> redacted diagnostic export (no media, transcript, token, or raw job output)

LinguistPro production-origin browser
  -> runtime beta flag (default false)
  -> explicit same-browser invite enrollment (localStorage experiment seam)
  -> token held in sessionStorage only
  -> loopback PNA/CORS/Origin/bearer boundary
  -> explicit Local selection; Gemini remains default
```

The Companion is a supervisor, not a new product database or remote service. OPFS remains the
product canon. The job spool remains a bounded execution artifact.

## 4. Invite-only mechanism

The beta uses the smallest existing feature-flag seam and deliberately does **not** pretend to be
an entitlement system:

1. server runtime flag `LOCAL_ASR_BETA_ENABLED` defaults to false;
2. when enabled for a staged environment, an invite deep link opens an explicit enrollment
   confirmation and writes the existing same-browser experiment key;
3. the settings entry stays hidden unless both gates are true;
4. the installer download URL is runtime-configured and empty by default;
5. installer distribution remains owner-controlled outside the application until separately
   authorized.

The deep link is not a secret and does not prove user identity. It is an exposure/enrollment seam,
appropriate only because the capability has no server authority and installer distribution is the
real invite boundary. Identity-grade authorization would require a separate owner decision and is
out of scope.

## 5. Companion lifecycle

### Install

- Per-user, no administrator rights and no manual venv.
- The installer includes the frozen application runtime and FFmpeg/ffprobe.
- Startup is optional and explicit; default-on for the beta installer.
- It displays Apache-2.0 and third-party notices.
- It never bundles a model, token, media, transcript, or research cache.

### Model download and activation

- User must confirm model ID, full revision, size (~1.62 GB repository `model.bin`), license,
  destination class, and disk requirement before download.
- URLs contain the full revision SHA; mutable aliases are forbidden.
- Only the five runtime-critical files in the committed hash manifest are accepted.
- Each file downloads to a partial user-local directory, is hashed, then enters existing atomic
  activation. A mismatch deletes the partial activation and reports `MODEL_INTEGRITY_FAILED`.
- Cancel deletes partial files. Retry starts from a clean partial directory; it does not change
  model, compute, provider, VAD, or timestamps.

### Run/update/restart

- Supervisor starts only the ASR-enabled sidecar, with legacy eager models disabled.
- Bind is fixed to `127.0.0.1:8799`; a foreign listener is a visible `PORT_CONFLICT`, never killed.
- A private user-local control token coordinates graceful stop/restart without a browser endpoint.
- A stale PID/control record is removed only after process identity and port state are checked.
- Application update is an in-place per-user installer operation: it stops the owned existing
  service before replacement, aborts if that safe stop fails, and restarts only when the service
  was running. Model updates are not automatic; any new revision is a new measured candidate and
  separate decision.

### Delete/uninstall

- Job delete removes source, physical chunks, raw/normalized results, and manifests, then records a
  non-content receipt.
- Model delete is explicit, refuses while a job/worker is active, and is confined to the exact
  managed model root.
- Uninstall stops the service and removes the program, model, jobs, partial downloads, pairing
  material, and supervisor state from the exact per-user roots.
- Cleanup never follows symlinks/junctions outside a managed root.

## 6. Product onboarding UX

The flow is:

`Settings -> Experimental Local ASR -> Download Companion -> Check device -> Connect -> Choose Local`.

Design direction: a quiet **local processing console** inside the existing LinguistPro visual
system. The signature element is a privacy-boundary strip showing `media -> this computer ->
127.0.0.1`, with the cloud path explicitly closed. Existing theme typography remains the body
voice; exact revision/hash/status use `ui-monospace`. Local-ready uses deep teal, pending uses
amber, and failures use the existing danger token. This avoids a generic dashboard and gives one
subject-specific visual anchor without restyling the application.

The surface must show:

- Windows/NVIDIA/Chrome+Edge requirements and the model size before install;
- Companion/service/device/model states separately;
- download/install/hash/warmup progress, cancel, retry, model delete, and job cleanup actions;
- pairing input without durable product storage;
- explicit `media stays on this computer` copy;
- actionable sidecar-down, CUDA/VRAM, disk, port, and integrity errors;
- a separate manual Gemini choice after Local failure, with the existing byte/model/cost consent;
- 380x844 and RTL without horizontal overflow.

Gemini remains selected whenever the import modal opens. Enrollment or successful pairing never
changes it.

## 7. Threat model

| Threat | Required control |
|---|---|
| Web page probes localhost | Origin allowlist + PNA/CORS + bearer token |
| Token leaks into product state/logs | sessionStorage only; no URL/log/diagnostic output |
| Companion exposed to LAN | literal loopback bind; preflight rejects other host config |
| Mutable/poisoned model | full revision URL + size + SHA-256 for every runtime file |
| Partial/corrupt activation | partial directory + hash gate + atomic activation |
| Arbitrary file deletion | resolved-path containment; reject links/junctions; exact roots only |
| Foreign process on 8799 | report conflict; never terminate an unowned process |
| Hidden cloud egress | no Gemini call in Companion; browser test asserts zero cloud requests |
| Diagnostic privacy leak | structured allowlist; no filenames, media, transcript, job payload, token |
| Unsigned binary social-engineering risk | visible warning + owner/trusted cohort only; no public hosting |

## 8. Adversarial review before code

- **R4 Premium UX — FIX-FIRST:** a raw admin dashboard would create a dead end at every failure.
  Use a six-step stateful flow with one next action, plain-language errors, visible privacy boundary,
  keyboard focus, 380px, and RTL. Do not present a download button when no authorized URL exists.
- **R5 Product/market — FIX-FIRST:** “invite-only” cannot be a cosmetic label. Runtime default-off,
  explicit enrollment, and controlled installer distribution are required. The seam is staged
  exposure, not identity authorization, and must be described honestly.
- **R9 Authority/provenance — FIX-FIRST:** “installed” is insufficient. UI and diagnostics must
  distinguish download, exact revision, verified runtime hashes, warmed model, unsigned installer,
  and browser/provider selection.
- **R11 Do-no-harm — SHIP ONLY WITH REGRESSION GATES:** onboarding must not weaken the existing
  default/reset behavior. A config fetch failure fails closed. Local errors remain Local errors;
  they cannot mutate provider selection or reuse cloud consent.
- **R14 Security — FIX-FIRST:** localhost is untrusted. Preserve Origin/PNA/token/body caps, reject
  foreign port owners, never expose the supervisor control token, and allow only HTTPS or
  same-origin installer URLs. No arbitrary filesystem paths cross the browser boundary.
- **R15 Lifecycle — FIX-FIRST:** a 1.62 GB model and Class-C jobs require exact ownership,
  cancellation cleanup, 24h TTL, explicit delete, uninstall cleanup, and receipts. A successful UI
  message must follow a post-delete absence check.
- **R16 Cost/resource — SHIP ONLY WITH ADMISSION:** no background model download, hidden retry,
  compute downgrade, or cloud request. Enforce disk reserve, 8 GB support floor, measured free-VRAM
  gate, queue bounds, and one same-pin OOM retry already defined by L1.

**Synthesis:** implement a per-user supervisor plus exact model downloader; extend the existing
loopback API only with management status/actions needed by the paired browser; gate the product
surface through runtime default-off plus explicit enrollment; keep installer distribution and
permanent provider policy outside this slice.

## 9. Implementation allowlist

- `ai-local/ai_local/{companion,companion_model,companion_preflight,companion_diagnostics}.py`
- `ai-local/ai_local/{main,config,model_store,asr_constants,asr_jobs}.py`
- `ai-local/tests/{test_companion*,test_asr_l1a}.py`
- `ai-local/installer/*`, `ai-local/scripts/build_companion.ps1`
- `ai-local/THIRD_PARTY_NOTICES.md`, `ai-local/README.md`, `ai-local/pyproject.toml`
- `public/js/{local-asr-client,local-asr-onboarding,studio-import}.js`
- `public/index.html`, `public/i18n/locales/{ru,en,he}.js`, `public/sw.js`
- focused Node/browser/i18n tests and the stable beta evidence/acceptance directory
- this packet, L1 evidence JSON/README, local-processing roadmap, owner worksheet
- `server.js` only for default-off runtime flag and installer URL exposure

No database, migration, production data, provider default, external service, deploy configuration,
or production/private-ops file is in the allowlist.

## 10. Verification gates

1. Companion unit: managed-path containment, redaction, preflight, pinned URLs, partial/corrupt
   download, cancel/retry, model/job delete receipts, stale process, port conflict.
2. Package: frozen executable starts without Python/venv, bundles ffmpeg/ffprobe, binds loopback,
   and exposes exact version/notices.
3. Installer: per-user install/start/restart/update/uninstall; post-uninstall absence checks.
4. API: pairing/Origin/PNA/CORS/body cap unchanged; management endpoints require pairing.
5. Browser: default-off, runtime-off fail-closed, invite enrollment, connect/install/progress/
   cancel/retry/delete, explicit Local selection, sidecar-down/OOM/disk/integrity errors.
6. No-fallback: zero Gemini/upload requests after every Local failure scenario.
7. Visual: Chrome at 380x844 in LTR and RTL; no horizontal overflow. Prior Edge local-origin
   evidence is retained but is not part of the advertised support matrix.
8. Cleanup: no raw media/transcript/job/model partials after delete/uninstall.

## 11. Recommended quality evidence and separate release authority

The optional beta owner packet targets 12–15 minutes, at least four independent speakers, with clean read
speech, conversation, moderate noise, and names/numbers. Gold must be human-authored independently
of both evaluated models, frozen before inference, and stored only as hashes/manifests in git.

No suitable 12–15 minute/four-speaker human-gold set is currently proven in the repository. The
existing batch-20 is only 113.6 seconds of owner-recorded prompts; the Mia comparison uses Gemini
ASR rather than independent human gold. The implementation may prepare the randomized worksheet,
manifest schema, and key, but must not fabricate the missing corpus or call this recommendation PASS.

The former permanent 60-minute/12-speaker paired-Gemini gate is now recommended rather than
mandatory. A future permanent release still requires a separate owner decision on integration,
provider/default policy, supported browsers, distribution, rollback, and support/privacy claims.

## 12. Rollback and stop conditions

Rollback is: set `LOCAL_ASR_BETA_ENABLED=false`; no new enrollment is possible and the Local UI
fails closed while Gemini remains default. Installed Companions remain locally removable and do not
gain server authority.

Stop and return to the owner if implementation requires a schema/migration, production mutation,
provider-default change, remote service, LAN bind, weakened pairing/Origin/PNA/body cap, a different
model/runtime/decode policy, full large-v3, cloud media upload/spend, distribution beyond the
  owner-approved trusted cohort, public installer hosting, or work in L2–L6.

## 13. Local implementation closure

Status on 2026-07-31:

- Companion/onboarding engineering: **PASS**.
- Unsigned invite distribution: **GO — OWNER + TRUSTED COHORT ONLY**, out-of-band.
- Permanent integration: **NO-GO**, unchanged.

The current reproducible build produces
`LinguistProLocalAsrCompanion-0.2.0-beta.2-unsigned-internal.exe`, 1,766,474,350 bytes,
SHA-256 `32ac13e03417c358dfcc04f10a50132fd9c7ad7f308076b6f75d82661f68c7ba`, Authenticode
`NotSigned`. Beta.1 (`1079fc4e…`) is superseded. Beta.2 bundles FFmpeg/ffprobe 8.1 and pinned
Windows cuDNN/cuBLAS redistributables, but
does not bundle the 1,621,665,181-byte model snapshot. NVIDIA proprietary license files and the
runtime notice ship with the installed tree. For this noncommercial trusted cohort, the owner has
explicitly accepted unsigned distribution and removed license review as an internal product gate;
the notices remain bundled. Public/general distribution remains a separate decision.

Local Windows 11/RTX 3070 ceremonies passed: install, live same-version update with owned stop and
restart (`exit 0`, changed PID), start, restart, exact
model activation, nine-check preflight, real CUDA decode (`COMPLETE`, 7.23s), per-job/model delete
receipts, redacted diagnostics, stop and uninstall. Post-uninstall program and managed roots were
absent and port 8799 was free. The first frozen decode exposed a missing `cudnn_ops64_9.dll`; that
invalid 135 MB artifact was superseded and is not a candidate. The hardened builder deletes old
artifacts first, isolates its frozen smoke from the user profile, and fails on any native compiler
error, preventing stale-package success.

Installed system Chrome 150 and Edge 150 passed the local product-origin onboarding matrix at
380×844 in LTR and RTL: runtime flag, explicit enrollment, session pairing, device and exact-model
readiness, privacy boundary, explicit Local selection, no horizontal overflow, and zero Gemini
requests. On the actually served production `v3.11.272`, Chrome then passed the existing default-off
experimental seam, explicit Local selection, session pairing, and pinned-model readiness against
`127.0.0.1:8799`; Gemini remained the reset/default provider. The visible token field and browser/
system clipboards were cleared after pairing. The owner subsequently completed the native Chrome
file chooser, explicit Local run, transfer to the input field, Library card save, and export. Edge
is excluded from the first production beta by owner decision. The normal non-DevTools onboarding
was deployed and verified as production `v3.11.276` from
`d445c7e89c85dcc889b973f838870bb0d13a3ba4`: runtime gate on, explicit browser-local enrollment,
Gemini default unchanged, Chrome-only advertised matrix, no public installer URL, and healthy
cache-busted client config. Production Chrome narrow LTR and RTL measurements showed no page,
dialog, or child horizontal overflow. No schema or production-data mutation occurred.
Firefox remains unsupported for this first beta.

The owner then selected a 30:05.82 MP3 for a long production-origin run. Chrome's native file
chooser could not be exercised through the extension, so the media job was submitted to the same
loopback API with `Origin: https://linguistpro.kolosei.com`; it never reached the production server.
The job completed `3/3` chunks in 66.54 seconds of model time (`RTF 0.03685`), with S12.5/S12.6/
S12.7 PASS, no gaps/warnings/OOM, maximum 62 C, and minimum 3,636 MiB free VRAM. A bounded comparison
with the Library card `Заложница Миа. Интервью v2` found all 13 defined story anchors. The exact
export later proved that this is Gemini ASR of the same MP3, not independent human gold. The raw
managed job is retained for owner listen/read review.

The owner-completed UI job independently passed `3/3`, all integrity gates, and no-fallback
provenance in 71.987 seconds wall time (`model RTF 0.03446`). Offline comparison of the exact Local
and Gemini card exports found a `22.98%` normalized token disagreement rate. This is not WER: Gemini
is not independent gold and marks 239.997 seconds unreliable. Nevertheless, repeated entity and
meaning-changing errors plus 552-row over-fragmentation limit the Local output to a first draft with
mandatory human review. Audio ASR remained Local; the saved card separately records downstream
`google-free` translation and `dicta-cloud` niqqud, which must not be described as a fully local
text-enrichment path.

The optional beta acceptance worksheet/key/manifest exist. The source set is still honestly
`NOT_FROZEN`: no repository set currently proves 12–15 minutes from four independent speakers with
independent human gold. By owner decision this and the ten Mia listen/read checkpoints are
recommended evidence rather than prerequisites. The former permanent 60-minute/12-speaker paired-
Gemini gate is also recommended, not mandatory. None is claimed PASS.

Production operational stop: the deployment builds left the host at 90% disk use with 3.7 GB
free. Cleanup was neither authorized nor performed. Do not start another build/deploy until the
owner separately authorizes cleanup or another capacity remedy. This is an operational gate, not
a Local ASR quality or permanent-integration criterion.

## 14. Pairing discoverability and durable help follow-up

Owner finding on 2026-07-31: obtaining the pairing token was not self-explanatory and the beta had
no durable end-user guide. Beta.2 closes the local Companion half of that gap:

- `Copy token for browser` is now a primary action in a dedicated **Connect LinguistPro in Chrome**
  block with the exact return-to-browser sequence;
- the Companion opens the bundled Russian guide through **Help / Справка**, and the installer adds
  a Start-menu help shortcut; EN and HE guides are bundled alongside it;
- the supervisor no longer accepts a protocol-compatible listener as `RUNNING` unless the PID and
  executable are owned by its per-user control state;
- an in-place beta.1 → beta.2 update preserved the exact model and both completed jobs, restarted
  the owned service as beta.2, and left it healthy on `127.0.0.1:8799`;
- frozen beta.2 start/health/stop passed and the installer remains `NotSigned`, trusted cohort only.

The matching web follow-up is locally ready as app version `3.11.277`: the pairing step contains an
inline three-action explanation, a locale-aware RU/EN/HE full-guide link, current-token recovery
wording, mobile wrapping and RTL-safe styles. Gemini remains default, token storage remains session-
only, and no implicit fallback was added. It is **not deployed**: production remains `v3.11.276`,
and the recorded 90% disk stop boundary still requires a separate capacity/cleanup decision before
another production build/deploy.

## 15. Pairing-help production deployment closure

Section 14 records the pre-authorization stop state. The owner subsequently authorized bounded
cleanup and deployment. Unused Docker builder cache and three exact unreferenced old LinguistPro
images were removed in two inventory-backed passes; the active image, two recent rollback images,
all ten running containers and all three active volumes were retained. Host root disk moved from
90% used / 3.7 GB free before cleanup to 78% / 8.0 GB free after the `v3.11.277` build. No
production data, schema, migration or provider default changed.

Commit `381233e04c017246d9dbf106581983ad9f3b618e` is served as `v3.11.277`. Cache-busted client
config, SW, health, DB/migrations, and RU/EN/HE guide routes passed. The runtime flag remains on,
the advertised browser list remains Chrome only, no installer URL is public, and Gemini remains the
audio-import default. Production served-UI measurements at 380x844 passed RU/LTR and HE/RTL with
no page or dialog horizontal overflow; inline token steps and locale-aware guide links were present.
Native Chrome automation timed out while accepting the browser confirm, so the final v3.11.277
Chrome click-through is an owner manual ceremony and is not falsely recorded as automated PASS.

Canonical evidence:
`docs/research/studio-local-processing/2026-07-31/windows-beta/evidence-report.json` and its
adjacent README/browser/owner artifacts.
