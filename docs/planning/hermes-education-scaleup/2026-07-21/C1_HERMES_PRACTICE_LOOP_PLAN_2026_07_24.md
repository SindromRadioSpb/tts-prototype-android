# C1-P Hermes practice loop — approved implementation amendment

Date: 2026-07-24. Status: **ENGINEERING_COMPLETE / OWNER-LIVE pending**.

## 1. Owner authorization and unchanged research truth

The owner explicitly requested implementation of the complete C1 Hermes↔LinguistPro educational
loop for primary use through the native Hermex iPhone app and secondary use through Hermes WebUI.
This amendment extends the already approved C1-X experimental product path; it does not change the
frozen C1 research result.

Research truth remains `DONE_NO_GO / UNDERPOWERED`: 60% sensitivity, 30% false positives, vowel
13/15 and stress 2/10. Every result is opt-in, advisory-only and visibly carries these limits.

## 2. Product outcome

The main surface is a normal Hermes learning conversation, not a detached diagnostic page.

1. The learner asks Hermes for pronunciation practice.
2. Hermes loads the C1-P skill, reads the LinguistPro learner profile and due items, and intersects
   due vocabulary with the frozen allowlist of 25 C1 words. If the intersection is empty, Hermes
   honestly offers an allowlisted exercise without pretending that it is due.
3. Hermes shows one short sentence, its Russian meaning, the target word with vocalization and
   stable Latin transliteration. The measured limitations are explained once in human language,
   without internal ids or laboratory terminology.
4. On iPhone the learner presses and holds the Hermex microphone to send a voice note. In WebUI the
   learner enables raw-audio mode and records through the microphone over HTTPS.
5. One local Hermes tool validates the current-session attachment, decodes it, computes ivrit.ai
   ASR and the frozen C1 advisory result, and unconditionally deletes the uploaded raw attachment
   and all scratch audio.
6. Hermes initially shows only the ASR hypothesis and asks the learner to confirm or correct it.
7. Only after confirmation does Hermes reveal the already computed C1 advisory result. A corrected
   transcript that does not match the prompted sentence invalidates/discards that C1 result.
8. Hermes gives one actionable suggestion and offers a retry. It never grades, certifies mastery or
   writes the attempt to LinguistPro.

## 3. Architecture and trust boundary

```text
Hermex iPhone voice note OR HTTPS Hermes WebUI raw audio
  -> password-protected Hermes WebUI over the owner's tailnet
  -> session-scoped attachment
  -> local stdio MCP c1_pronunciation (same Hermes host)
       |- strict session/path/type/size/duration validation
       |- pinned ivrit.ai faster-whisper ASR
       |- frozen MMS_FA + Phonikud C1 scorer and local owner profile
       `- finally-delete source attachment and every scratch WAV
  -> one ephemeral tool result: ASR hypothesis + C1 advisory candidate
  -> Hermes transcript preview/confirmation gate
  -> advisory feedback in the same learning conversation
```

LinguistPro production receives no audio, transcript, features or attempt result. The local Hermes
host temporarily receives the audio because it is the owner's private compute plane. Nothing is
sent to an external STT, LLM, analytics or storage provider. The existing production
`pronunciation.html` loopback companion remains a diagnostic/fallback surface and is not the main
learning loop.

## 4. Tool contract

New local MCP server: `c1_pronunciation`; additive tools only.

### `list_pronunciation_exercises`

No input. Returns exactly the 25 frozen exercise ids, sentences, target words, vocalized targets
and the immutable quality disclosure. Each item also carries its reviewed Russian sentence meaning
and stable Latin target transliteration. It reads no learner data.

### `evaluate_pronunciation_attempt`

Input:

```json
{
  "session_id": "current Hermes session id",
  "file_path": "absolute attachment path reported by Hermes WebUI",
  "exercise_id": "one frozen C1 exercise id",
  "language": "he"
}
```

Output schema `c1.practice_attempt.1.0.0` contains:

- ASR hypothesis text and timestamped confidence segments;
- frozen C1 `SCORABLE|UNSCORABLE`, possible issue codes and coarse alignment quality;
- `must_confirm_transcript_before_feedback:true`;
- immutable quality disclosure and `advisory_only:true`;
- `raw_deleted:true` only after verified deletion.

The tool accepts only a regular non-symlink file inside the exact sanitized directory for
`session_id` under the configured WebUI attachment root. It caps input at 10 MiB and decoded audio
at 12 seconds, runs with concurrency one, logs no path/transcript/features and deletes raw input in
`finally` on success or failure. A deletion failure changes the call to a typed privacy error.

### `discard_pronunciation_attachment`

Input is the current `session_id` plus the exact new attachment path. This narrow privacy tool is
used only when an iPhone voice note intended to start practice arrives before Hermes has selected
an exercise. It applies the same session/path/type/size/symlink checks, performs no ASR or scoring,
deletes the raw attachment and returns `c1.practice_discard.1.0.0` with `raw_deleted:true` and
`evaluated:false`. A cross-session path is rejected and preserved.

## 5. Educational state machine

`SETUP -> TARGET_SELECTION -> PROMPT -> VOICE_INTAKE -> LOCAL_EVALUATION -> TRANSCRIPT_PREVIEW -> WAIT_CONFIRMATION -> ADVISORY_FEEDBACK -> RETRY|CLOSURE`

- `SETUP`: load trainer policy and learner profile.
- `TARGET_SELECTION`: prefer the due∩allowlist intersection; maximum one active exercise.
- `VOICE_INTAKE`: accept one newly attached voice note for the current prompt.
- `TRANSCRIPT_PREVIEW`: show ASR as a hypothesis; no C1 feedback yet.
- `WAIT_CONFIRMATION`: confirmation or complete correction is mandatory.
- `ADVISORY_FEEDBACK`: reveal at most one primary possible issue plus the measured limitations.
- `RETRY`: new audio is a new ephemeral attempt. Never compare attempts as a grade or progress.
- `CLOSURE`: one concrete observation; no proposal/write unless the owner separately asks for an
  existing W1 action unrelated to the C1 score.

## 6. UX design plan and critique

The product uses the existing native Hermex and Hermes WebUI composers rather than introducing a
third visual shell. The interaction hierarchy is: one friendly invitation, one Hebrew prompt with
meaning, one target word with vocalization/transliteration, one voice action, one confirmation
question, one advisory suggestion. The recognition hypothesis is always confirmed before any
pronunciation observation.

Copy is specific, calm and learner-facing. `C1`, exercise ids, schema/status codes, due-list details,
timestamps and tool names stay hidden unless diagnostics are explicitly requested. The measured
60%/30%/2-of-10 limits remain visible but are phrased as an honest explanation rather than a lab
report. No generic score, percentage badge, red/green pass state, celebratory animation or
dashboard is introduced. Hebrew remains RTL; Russian is used for metacognitive copy.
Existing system typography, focus states, reduced-motion behavior and mobile composer affordances
are retained. The detached pronunciation page remains available for diagnostics but is no longer
linked as the recommended practice entry point.

Adversarial critique before build:

- A combined ASR/C1 label would turn recognition mistakes into learner mistakes: rejected; axes
  and confirmation are structurally separate.
- Keeping the uploaded voice note as a normal attachment would violate the raw-audio policy:
  rejected; the local tool must own unconditional source deletion.
- Direct iPhone-to-loopback access is impossible and would create setup fiction: rejected; Hermex
  already transports voice notes to the private owner-controlled Hermes host.
- A public/Tailscale scoring HTTP service would expand the attack surface: rejected; scoring is a
  stdio MCP child with no listening port.
- Selecting only generic frozen exercises would remain detached from learning: rejected; target
  selection is grounded in existing LinguistPro profile/due read tools when possible.

## 7. Privacy, authority and retention

- Audio crosses only the owner's tailnet from client to the owner's Hermes host.
- Raw audio exists only for the bounded request and is then deleted; no attachment history remains.
- Transcript and detailed result live only in the current chat/tool trace. No LinguistPro write,
  Hermes memory write, note, analytics event or attempt history is permitted.
- C1 never influences FSRS, `review_log`, word status, grades, mastery, progress or due selection.
- Due items are read-only grounding; the C1 result cannot modify them.
- MMS_FA remains authorized only while the product is noncommercial. Monetization disables this
  path or requires a license-compatible replacement.

## 8. Secure access and operations

Hermes WebUI remains bound to the local host port but is additionally exposed inside the tailnet
through Tailscale Serve HTTPS. On the Windows host itself Chrome uses
`http://localhost:8787`: localhost is the supported secure-context route and avoids browser
Secure-DNS/MagicDNS incompatibility. Other tailnet browser clients use the HTTPS MagicDNS URL.
The existing plain HTTP tailnet URL may remain for native Hermex compatibility. No Funnel/public
exposure is allowed.

Runtime rollback is additive and independent:

1. disable/remove only `mcp_servers.c1_pronunciation` and restart Hermes containers;
2. deactivate/remove only the C1-P skill;
3. `tailscale serve reset` removes the HTTPS proxy if required;
4. existing H1/H2 skills, H2.5 ASR and C1-X loopback page remain operational.

## 9. Acceptance gates

- Tool unit tests: path/session/symlink/type/size/duration, 25-item allowlist, axis separation,
  source and scratch deletion on success/error, typed deletion failure and no-write scan.
- Real local runtime: pinned model/profile hashes, one synthetic fixture, one real Hermex/WebUI
  attachment, zero raw files afterward.
- Skill scenarios: due intersection, no-intersection fallback, transcript correction discards C1,
  ASR/C1 failure, retry, stop and no-write.
- HTTPS: valid secure-context URL, `/health`, password login, microphone availability on PC.
- Fresh ordinary Hermes chat: both tools visible and actual tool call succeeds; SDK-only discovery
  is insufficient.
- Owner-live: one iPhone Hermex attempt and one PC WebUI attempt, with transcript confirmation,
  advisory disclosure, actionable feedback and verified deletion.
- Documentation/STATUS, scoped commit/push and live runtime hashes are recorded before closure.

## 10. Engineering evidence — 2026-07-24

- Tailnet-only HTTPS is live at `https://win-5v7taj132kn.tail86152d.ts.net/`; `/health` returned
  `200`, Tailscale Funnel is disabled, and the former browser secure-context blocker is removed.
- A fresh ordinary Hermes chat (`76d2b51afed3`) loaded the installed skill, called
  `mcp__c1_pronunciation__list_pronunciation_exercises` and returned an actual count of 25.
- A natural fresh-chat request, `Потренируем произношение на иврите` (`fb0933ac55a9`), called the
  C1 list tool plus LinguistPro `get_learner_profile` and `get_due_review_items`. With no
  due/allowlist intersection it honestly offered frozen exercise `c1-xd01`; no write tool ran.
- An ordinary attachment/chat E2E (`4835edce9d4b`) used the authorized owner benchmark D01 fixture.
  Local ASR returned `אני אומר שלום לשכן.`, C1 returned
  `POSSIBLE_VOWEL_SUBSTITUTION`, and `raw_deleted:true`; both the source attachment and scratch
  directory were empty afterward. The first deployment attempt exposed a remapped-uid scratch
  permission defect; the dedicated sticky directory and installer now correct it.
- Before confirmation, Hermes showed only the ASR hypothesis and the confirmation question. After
  `Да, распознано верно`, Hermes revealed one possible issue, one retry instruction and the frozen
  60% / 30% / 2-of-10 limitations.
- A fresh-process run with `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1` and deliberately dead HTTP
  proxies completed without a network request, proving that ASR, tokenizer, Phonikud and MMS_FA
  execute locally.
- Remaining gate: the owner must perform one new microphone attempt in native Hermex on iPhone and
  one through the HTTPS WebUI on PC. C1-P stays `ENGINEERING_COMPLETE / OWNER-LIVE pending` until
  both surfaces are observed; the research verdict remains `DONE_NO_GO / UNDERPOWERED`.

### First owner-live attempt and clarified recovery

The first owner attempt did not exercise either raw-audio path. On PC the WebUI was still opened at
the legacy `http://100.107.242.111:8787` URL; the saved server setting already showed
`raw_audio_mode:true`, but the browser correctly rejected microphone access outside a secure
context. On iPhone, WebUI access logs at `2026-07-24T11:01:01Z` recorded `POST /api/transcribe`
and no contemporaneous `POST /api/upload`, proving that the short-tap dictation path ran rather
than the hold-to-record voice-note path. This is neither stale C1 configuration nor a missing raw
audio feature. The installed skill now explicitly requires holding the mic for at least 0.5 s
until the red recording bar/timer appears, and gives the exact tailnet-only HTTPS WebUI URL.

### Second owner-live attempt and UX/routing correction

- PC session `c570e8be0650` reached the correct flow: the pronunciation skill loaded, the frozen
  exercise list and LinguistPro due items were read, `evaluate_pronunciation_attempt` processed the
  new WebUI raw-audio attachment, returned separate ASR/C1 axes and confirmed `raw_deleted:true`.
  The source WebM and C1 scratch directory were empty afterward. The UI correctly stopped at the
  transcript-confirmation question; post-confirmation owner evidence is still pending.
- iPhone session `a6d0dd0b348d` proved native voice-note transport but did not enter C1. Preliminary
  dictation distorted the spoken request, so Hermes handled it as a generic conversation and called
  only LinguistPro morphology. This is a routing/UX failure, not a cache or microphone failure.
- Remediation adds the stable typed shortcut `/ivrit-practice начнём`, fuzzy ASR-noise triggers,
  learner-facing prompt meaning/transliteration, a shorter confirmation step and friendly advisory
  copy. Internal ids and engineering terminology are hidden in normal learning conversation.
- A new discard-only tool closes the privacy gap for a C1-intended voice note received before target
  selection. It removed the two exact raw attachments from the failed iPhone routing attempt with
  `raw_deleted:true`; the session directory is now empty and no other attachment was touched.
- Firefox reached tailnet HTTPS. Chrome on the Hermes host could not resolve the private MagicDNS
  URL, so the supported same-host Chrome route is now `http://localhost:8787`; remote tailnet
  browsers keep the HTTPS URL.
