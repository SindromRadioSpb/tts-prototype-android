# C2 adversarial design review

Completed before prototype code and before any Live audio call.

- **R2 / R17:** raw model response count is not automatically a pedagogical turn. The protocol
  defines one valid learner turn as a Hebrew utterance followed by a completed assistant response;
  noise-only activity and assistant openings are excluded. Realtime remains a bounded role-play,
  not unrestricted chat or pronunciation grading.
- **R4:** a realtime interface that hides 429, silently hangs or asks the learner to diagnose API
  errors would be a dead end. The prototype emits typed, human-readable quota and transport
  outcomes and points to H2.6 async.
- **R12:** Gemini-specific messages must not become the session/domain contract. The adapter emits
  normalized `ready`, `audio`, `turn_complete`, `usage`, `quota_exhausted`, `error`, `closed` events.
- **R15:** input/output transcription is unnecessary for the primary metric and creates retention
  risk. It is disabled. Audio is streamed from ffmpeg to Gemini and never written to a file.
- **R16:** an API key does not prove that its project is Free Tier. Every run requires the explicit
  `YES_I_CONFIRMED_FREE_TIER` switch, paid fallback is absent from code, actual billed cost remains
  a mandatory owner observation, and any positive cost stops the charter.
- **R11:** the two historical H2.6 sessions lack turns/min and cannot be retrofitted into the
  primary comparison. Three new matched async sessions are required.

Accepted design: a Windows-local, non-production CLI using a provider-neutral contract, a fixed
public scenario prompt, direct PCM streaming, content-free metrics and a separate scorer that
refuses incomplete or duplicate cells.
