# C1 Experimental Local Companion — approved implementation plan

Date: 2026-07-24. Status: **ENGINEERING_COMPLETE / DEPLOY PENDING**.

## 1. Decision and truth boundary

Frozen C1 research remains `DONE_NO_GO / UNDERPOWERED`: sensitivity 15/25 (60%), false positives
15/50 (30%), vowel 13/15, stress 2/10, target localization failures 0/75. The result is not tuned,
rerun or relabelled.

Owner authorization (verbatim):

> Утверждаю C1 Experimental Local Companion: production-интерфейс с локальным MMS_FA/Phonikud
> companion, локальным калибровочным профилем, первоначальным набором из 25 исследованных слов,
> opt-in/advisory-only контрактом и явными измеренными ограничениями качества.

The owner also authorized code, production deployment and enabling the function as experimental.
This is a product-risk acceptance, not a positive scientific verdict.

## 2. User contract

The product surface is **«Лаборатория произношения · эксперимент»**.

1. Before activation it shows the measured limits: 60% detection, 30% false positives, stress 2/10.
2. The user explicitly opts in on this device. Opt-in is local UI preference, not research consent
   and not a learner-state event.
3. The initial allowlist is exactly the 25 curated C1 target words. Each exercise uses the frozen
   written sentence and expected vocalized target; arbitrary text is out of scope.
4. The user records one prompted sentence. The page encodes a mono PCM WAV and sends it only to a
   loopback companion on the same device.
5. Output is `SCORABLE`, `UNSCORABLE`, or one or more **possible** issue types. It never says that a
   learner is definitively wrong.
6. Attempts disappear on page change. No history, analytics, transcript, grade or progress write.
7. A stopped/missing companion produces a typed setup/unavailable state and no score.

## 3. Architecture

```text
production pronunciation.html
  ├─ local opt-in + token (browser localStorage)
  ├─ microphone → mono WAV in memory
  └─ CORS/token request → http://127.0.0.1:8766
                           └─ local companion
                              ├─ fixed 25-exercise allowlist
                              ├─ local calibration profile
                              ├─ pinned Phonikud + MMS_FA + Praat
                              ├─ transient temp WAV (finally-delete)
                              └─ advisory JSON result

LinguistPro production server receives no audio, profile, features or attempt result.
```

Why not a production sidecar: live preflight found a 4 GB host and a 1.5 GB main-container limit;
the pinned checkpoints occupy about 1.57 GB before runtime allocations. Local companion preserves
privacy and avoids an OOM-prone shared service.

## 4. Companion contracts

- Bind: `127.0.0.1:8766` only; startup fails if asked to bind a non-loopback address. Port 8765 is
  deliberately avoided because the owner's Hermes Agent already publishes that loopback port.
- Auth: random 256-bit token in gitignored local scratch; every API request requires
  `X-C1-Token` with constant-time comparison.
- Origins: exact allowlist for production plus explicit localhost development origins. No wildcard.
- Private-network CORS: explicit preflight, allowed headers/methods and
  `Access-Control-Allow-Private-Network: true`; no credentials/cookies.
- `GET /v1/health`: runtime/model/profile state and schema versions, no personal values.
- `GET /v1/exercises`: the 25 content-safe curated prompts.
- `POST /v1/score?exercise_id=…`: `audio/wav`, maximum 10 MiB and 12 seconds, one request at a time.
- Output allowlist: exercise id/word, `SCORABLE|UNSCORABLE`, possible issue codes, coarse alignment
  quality, immutable quality disclosure and advisory copy. No raw formants or calibration values.
- Lifecycle: request bytes → named temp file → inference → unconditional delete in `finally`.

## 5. Local calibration profile

For the owner, the existing frozen `details.json` supplies the 50 normal measurements; raw audio is
not rescored. A local build command derives only vowel centroids/scales, frozen normal quantile and
stress threshold plus source hashes/counts. The profile remains under `.tmp/c1-experimental/` and
is never committed or uploaded.

Another user must create their own 50-normal profile in a later onboarding slice. Until that exists,
the companion returns `PROFILE_REQUIRED`; it must not reuse the owner's voice profile.

## 6. Role-lens adversarial synthesis

- **R1/R10:** only curated target vocalizations; alignment, vowel and stress remain separate; no ASR
  transcript is treated as pronunciation truth.
- **R2/R17:** one actionable advisory result; no grade, scheduling or mastery authority.
- **R4:** limitations are visible before opt-in and beside results; mobile RTL and typed recovery
  state are release gates.
- **R5:** local-first path remains useful without a provider account; initial 25-word scope is
  explicit rather than falsely claiming general Hebrew coverage.
- **R11:** frozen result is independent evidence and cannot be overwritten; `UNSCORABLE` is not an
  error; missing companion/profile never silently becomes success.
- **R12/R13:** no second learner-state writer and no migration/canon transition.
- **R14:** loopback bind, origin allowlist, token, body/time caps and single-flight inference.
- **R15:** audio/profile are device-local; no attempt history; token/profile deletion is local and
  complete.
- **R16:** zero provider calls; production Node container carries no model and no inference load.

## 7. License and operations

The owner declares LinguistPro noncommercial and authorizes MMS_FA under CC BY-NC 4.0. UI and docs
must attribute MMS_FA/Meta and Phonikud, identify the pinned versions and link their licenses.
Monetization is a hard stop: disable C1-X or replace/relicense MMS_FA before commercial operation.
TorchAudio 2.8 forced alignment is deprecated; the pin is deliberate operational debt.

Runtime rollback: `C1_EXPERIMENTAL_ENABLED=0` removes both Studio entry points and makes the lab
unavailable. Stopping the local companion disables scoring independently. No data rollback exists
because no learner-state write exists.

## 8. Acceptance and deployment

The release must pass `10_ACCEPTANCE_GATES_AND_CLOSURE.md` §5.1, focused Python/Node/browser tests,
`smoke:i18n`, `test:api-smoke`, static no-write scans and a visual review at 380×844. Commit/push to
`main` triggers Coolify. Live verification must prove the new version/config/assets, health, visible
disclosure and honest missing-companion state. A real local score is owner-device verification; the
production server cannot certify a loopback service running on the owner's Windows machine.

## 9. Out of scope

- General free-form pronunciation scoring.
- Quality claims above the frozen benchmark.
- Threshold tuning or rescoring the frozen owner set.
- Cloud audio upload or server-side MMS_FA.
- Any FSRS, `review_log`, grade, progress, agent-memory or analytics integration.
- Production deployment of a new quality algorithm without a new preregistration and fresh set.
