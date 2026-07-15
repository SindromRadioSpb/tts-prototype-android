# LinguistPro Wave 2 C3a — voice-to-editable-text specification

**Date:** 2026-07-15

**Status:** accepted implementation contract

**Scope:** existing Room and Studio role-play only

## Decision and observed problem

- **FACT:** both role-play surfaces accept a Hebrew text turn and send it only after the learner presses the existing Send control (or Enter).
- **FACT:** neither surface currently offers speech input.
- **DECISION:** add a browser-owned press-to-talk affordance that produces an editable text draft in the existing input. It never sends a turn.
- **DECISION:** C3a is advisory input assistance, not assessment, pronunciation practice, learner memory, or a new role-play channel.
- **DECISION:** `he-IL` is the recognition language in v1 because the existing activity asks for a Hebrew learner turn. The application locale (ru/en/he) changes UI copy and direction, not the recognition language.

The pedagogical mechanism is reduced production friction: a learner can rehearse a spoken Hebrew reply, inspect the recognized text, correct it, and then make the same deliberate send decision as a typing learner. No learning claim is inferred from recognition success or failure.

## Visible behavior

1. A microphone button appears beside the existing role-play text input when the C3a flag is on and the browser exposes Speech Recognition.
2. Pressing it starts one final-result recognition attempt. Pressing it again cancels.
3. A final result is appended to any existing draft, capped by the input's existing 400-character limit, and remains fully editable.
4. Only the existing Send button or Enter invokes the existing text role-play turn.
5. Unsupported capability, permission denial/revocation, cancel, no-speech, recognition error, or a 15-second timeout returns to the ordinary enabled text input without a request to LinguistPro.
6. Closing or ending the sheet cancels an active recognition attempt.

The privacy copy must say that the **application** does not receive or store audio. It must not claim that recognition is offline: Web Speech implementation and processing location belong to the browser and may depend on a browser service.

## Typed boundary and authority

```text
VoiceDraftInput = {
  language: "he-IL",
  priorDraft: string[0..400],
  browserRecognitionResult?: string
}

VoiceDraftOutput = {
  state: "idle" | "listening" | "ready" | "unavailable" | "error",
  editableDraft: string[0..400]
}
```

- **Deterministic application boundary:** capability/flag checks, state transitions, timeout, append/cap logic, cancellation, accessible status, and the invariant that recognition never calls Send.
- **Browser-owned nondeterministic boundary:** microphone permission and speech recognition.
- **Existing LLM boundary:** unchanged `/api/agent/roleplay/turn`, reached only through explicit text send.
- **Evaluator boundary:** none. C3a writes no grade, review event, FSRS/mastery state, or learner-truth artifact.
- **Authority/autonomy:** A0 tool under direct learner initiation; no autonomous action and no publication authority.

## Consent, privacy, retention, rights, trust, and cost

- Microphone consent and revocation are browser/OS-owned. Denial or revocation is a normal recoverable state.
- LinguistPro creates no MediaRecorder, audio Blob, upload, database row, analytics event, stdout/stderr content log, export item, operational-log field, or `review_log` write for recognition.
- The recognized draft exists only in the current DOM input. It follows the existing role-play rule only after explicit send; before send it is not transmitted to the LinguistPro server.
- C3a introduces no new content rights or corpus ingestion path.
- Trust copy distinguishes browser processing from application storage and preserves the existing AI-generated-Hebrew warning.
- Server cost class is C0 before explicit Send. Browser/vendor recognition availability or vendor cost is outside LinguistPro's server budget and is not promised.

## Dependencies, flag, rollback, and telemetry

- Dependency: browser `SpeechRecognition` or `webkitSpeechRecognition`; no polyfill and no cloud-ASR fallback.
- Runtime flag: `C3A_VOICE_ENABLED`, exposed as `flags.c3aVoiceEnabled`; default on. Flag off removes the affordance and leaves text role-play intact.
- Rollback: disable the flag first; code rollback removes the shared client module and two attachments. No data migration or cleanup is required.
- Telemetry: intentionally none in C3a. Acceptance is established by hermetic state-machine fixtures, structural no-log/no-write checks, and UI evidence rather than learner-content instrumentation.

## Acceptance fixtures and independent oracle

The independent oracle is a fake browser recognizer controlled by the smoke test; it has no network, database, role-play, or LLM dependency.

| Fixture | Event | Oracle |
|---|---|---|
| supported-success | final Hebrew result | draft changes; Send callback/network count remains zero |
| preserve-edit | existing typed draft + final result | recognized text is appended, prior text is not lost |
| cancel | second microphone press | recognizer aborts; original draft remains; text input enabled |
| timeout | no result for 15 seconds | recognizer aborts; ordinary text UI restored |
| permission-revoked | `not-allowed` error | localized failure status; text input remains usable |
| no-speech/error | browser error | no draft mutation and no send |
| unsupported/flag-off | missing capability or disabled flag | affordance absent; typed role-play unchanged |
| close-while-listening | sheet hide/end | recognition aborts and no send occurs |
| locale/RTL | ru/en/he at 380x844 | localized labels fit; Hebrew UI direction and input editing remain usable |
| no-content-log | sentinel recognized text | absent from DB, analytics, stdout/stderr, export, operational log, and `review_log` |

Required regression gates: shared controller smoke, Room/Studio structural parity, role-play API smoke, i18n parity, client-config flag, no-content-log/static forbidden-surface scan, and 380x844 screenshots for ru/en/he including Hebrew RTL.

## Five primary failure modes

1. **Accidental auto-send:** speech result invokes the role-play request. Shield: the shared controller knows only the input/status/button and has no send/fetch callback; hermetic request count stays zero.
2. **False privacy promise:** UI calls browser recognition “offline” or “on-device.” Shield: approved copy says browser-owned and only promises no audio handling/storage by the app.
3. **Draft loss:** cancel/error/result overwrites learner typing. Shield: snapshot prior text, append final text only, leave it unchanged on failure.
4. **Microphone survives navigation:** recognition continues after the sheet is hidden. Shield: both hide/end paths call controller cancellation.
5. **Mobile/RTL regression:** three controls overflow or reorder confusingly. Shield: compact mic/send controls, logical layout, localized accessible labels, and 380x844 visual gates.

## Adversarial R1-R17 critique

- **R1, R10, R11 — linguistic truth/evidence:** recognition is an editable hypothesis only. It cannot grade pronunciation, prove Hebrew correctness, update mastery, or become an evaluator oracle.
- **R2, R4, R5 — pedagogy/UX/accessibility:** speech reduces production friction but retains the productive act of reviewing and sending. Keyboard/text remains first-class; status is announced; cancel and failure never trap the learner. Mobile and RTL are explicit gates.
- **R3, R6 — architecture/data:** one shared controller prevents Room/Studio semantic drift. No schema, queue, storage, transcript artifact, or second learner-state writer is introduced.
- **R7, R8, R9 — operations/security/cost:** runtime kill switch, zero pre-send server calls, bounded timeout, no raw-content logging, no new endpoint, and no provider credential reduce blast radius.
- **R12, R13, R14 — consistency/product scope:** existing role-play remains the only message owner. C3a does not duplicate transcript canon, expand into media ingestion, or imply a persistent voice product.
- **R15, R16, R17 — privacy/rights/accountability:** browser permission is revocable; app retention is zero before send; processing-location claims stay honest; rollback owner is the product operator via the flag. Any cloud ASR, audio retention, speech grade, or voice-originated review event requires a separate owner decision.

## Owner decisions

The owner has approved the recommended C3a boundary in the Wave 2 decision packet and execution prompt: browser-owned voice to editable text, no auto-send, no speech grade, no audio/transcript persistence, and no review write. No additional product decision is required for this implementation. Cloud ASR/provider/region/retention, pronunciation evaluation, raw audio, or durable voice history remain explicitly unapproved.
