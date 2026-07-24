# H2.6 — async voice loop

Дата: 2026-07-24. Статус: **ENGINEERING_COMPLETE; owner-live pending**.

H2.6 is a Hermes skill-only overlay on the already closed H2.5 local ASR and H1.1
conversation skill. It adds no LinguistPro code, storage, realtime voice, pronunciation scoring,
cloud STT or arbitrary-chat TTS.

## Protocol

Every voice message moves only forward:

`VOICE_INTAKE → LOCAL_ASR → TRANSCRIPT_PREVIEW → WAIT_CONFIRMATION → CONFIRMED_UTTERANCE → H1.1_STATE`

- Exactly one explicitly named file is accepted from `/workspace/voice-inbox` per message.
- Owner-verified format is WAV. H2.5 also decodes m4a/mp3/ogg/flac/webm, but those formats are not
  claimed as owner-device verified.
- Only a successful real `mcp__ivrit_asr__transcribe_audio` result with the H2.5 schema and
  hypothesis marker can produce a transcript. Shell, ffmpeg, file reading, mocks and cloud STT are
  forbidden substitutes.
- The full hypothesis and LOW spans are shown before any teaching response. Confirmation or the
  complete user correction becomes the sole `confirmed_utterance`.
- The first confirmed voice turn must load `linguistpro-conversation-session` through an actual
  `skill_view` result before profile/due calls and before a content response.
- POST_ANALYSIS keeps an ephemeral source ledger. Typed turns can never be relabelled as ASR.
  ASR uncertainty comes only from LOW spans or a user correction to a voice preview.
- Transcript state remains in the current chat only. Nothing is written to memory, notes, files,
  profile or LinguistPro. `propose_track_word` remains explicit-consent only.
- H2.5 deletes raw after success. On failure the skill requires manual inbox deletion before the
  same utterance is supplied as text.

Canonical skill: `VOICE_SESSION_SKILL.md`. Installed path:
`/home/hermeswebui/.hermes/skills/linguistpro-voice-session/SKILL.md`.
Canonical and installed SHA-256 at the final gate:
`2cf14dbf35ced53c888a96dcf6efacd498e5f6bdc9b21f0c5941a812d517745c`.

## Inbox convention

1. Put one recording in `G:\HERMES_AGENT\voice-inbox\`.
2. Prefer a content-free name such as `voice-YYYYMMDD-HHMMSS.wav`.
3. In a fresh ordinary Hermes chat, name exactly that `/workspace/voice-inbox/...` path and ask to
   use `linguistpro-voice-session`.
4. Confirm the shown transcript or type the complete corrected version.
5. After success the file must be absent. After a typed ASR failure, delete that exact file
   manually before continuing in text.

## Acceptance and rollback

Scenarios A–C are **3/3 PASS** in `ACCEPTANCE_TRANSCRIPTS.md`. The final health check returned
localhost OK, Tailscale OK and exactly one ready `ivrit_asr` tool; inbox count was zero.

Rollback only deactivates/removes `linguistpro-voice-session`. H1.1 and the H2.5 wrapper remain
installed and enabled. Do not delete `voice-inbox`, because it may contain a failed owner recording.

Closure still requires at least two real owner voice sessions, total speech minutes, ASR correction
rate, usefulness/readability verdict and the STATUS entry. Until then H2.6 is not CLOSED.
