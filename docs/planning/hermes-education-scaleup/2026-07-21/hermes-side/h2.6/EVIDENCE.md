# H2.6 stable evidence

Дата: 2026-07-24.

## Engineering verdict

- Canonical prompt: `prompts/H2_06_ASYNC_VOICE_LOOP.md`.
- Starting HEAD: `39179c9`.
- Implementation boundary: one Hermes skill; no LinguistPro application/code/schema change.
- Canonical/live skill SHA-256:
  `2cf14dbf35ced53c888a96dcf6efacd498e5f6bdc9b21f0c5941a812d517745c` (match).
- Scenario A: PASS after source-ledger hardening; session `a27fdc03cad1`.
- Scenario B: PASS; session `f3169763cdd2`.
- Scenario C: PASS; session `d6e96f754d83`.
- Final H2.5 restoration: config SHA-256 returned to
  `000fdef0a55255d6c569e74700ac5f3e659c1c363f1a0089576014b96595337d`.
- Final host health: localhost OK; Tailscale OK; `ivrit_asr` exactly one tool and ready.
- Final `G:\HERMES_AGENT\voice-inbox`: 0 files.

Engineering acceptance: **3/3 PASS**. Synthetic speech totals are 0.091 minutes and correction
rate 1/2 = 50%; they are explicitly excluded from owner-live metrics.

## Owner-live closure gate

Status: **OWNER_LIVE 2/2, final verdict pending**. H2.6 is not CLOSED.

Owner session 1, reported 2026-07-24:

- confirmed previews: 1;
- corrected previews: 0;
- speech duration: 15.61 seconds = 0.260 minutes;
- ASR correction rate: 0 / 1 = 0%;
- transcript content: intentionally not retained here.

This satisfies the first-session metric record. Evidence has not yet been supplied that this
session reached H1.1 POST_ANALYSIS and RETRY.

Owner session 2, reported 2026-07-24:

- confirmed previews: 1;
- corrected previews: 1;
- speech duration: 189.67 seconds = 3.161 minutes;
- ASR correction rate: 1 / 1 = 100%;
- transcript content and source filename: intentionally not retained here.

Aggregate owner-live metrics:

- confirmed previews: 2;
- corrected previews: 1;
- speech duration: 205.28 seconds = 3.421 minutes;
- ASR correction rate: 1 / 2 = 50%.

Required in a fresh ordinary Hermes chat:

1. Confirm that at least one owner session reached H1.1 POST_ANALYSIS and RETRY.
2. Owner gives a 1–5 usefulness/readability verdict and confirms that ASR differences were not
   presented as learner errors.
3. Record the confirmations and verdict here and in STATUS before declaring H2.6 CLOSED.

No transcript or raw owner audio is to be copied into this evidence. Only counts, minutes, rate,
verdict and a content-free incident note are durable.

## Incidents and recovery

- A synchronous `/api/chat` probe did not expose the actual local ASR surface and once fabricated a
  transcript; it was rejected, the fixture was removed, and final acceptance used frontend
  `/api/chat/start` only.
- A LinguistPro SSE disconnect left one morphology call hanging. The stream was cancelled and the
  already owner-approved two-container restart restored OAuth/MCP access.
- Provider 429/402/404 failures occurred before behavioral work. Raw fixtures were manually removed
  whenever ASR had not succeeded; no cloud fallback was introduced.
- The first complete A analysis confused a typed phrase with ASR. This became a failing test and
  directly produced the final source-ledger guard; the repaired replay passed.
