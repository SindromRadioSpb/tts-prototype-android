# TTS Hebrew Decision

Дата: 2026-04-22

## Decision

`DECISION_B_ADD_RESEARCH_ONLY_SIDECAR`

Одновременно:

- keep online default for Hebrew
- do not start Hebrew `web_wasm` staging now
- do not ship Hebrew local TTS in premium/commercial product

## Answers

1. Is there working Hebrew local TTS audio?
   Yes. The PoC generated WAV for 8 Hebrew smoke phrases.

2. Is quality acceptable?
   Acceptable only for experimental research at this stage. Manual listening review is still required.

3. Is the license acceptable for premium/commercial use?
   No. The checkpoint/model path used in the PoC is non-commercial.

4. Can it be integrated into the premium app now?
   No.

5. Can it be moved to browser `web_wasm` now?
   No practical path was proven in this spike.

6. Should we continue?
   Continue only as research:
   - sidecar experiments
   - author/license clarification
   - manual listening review

7. What is the next patch?
   Either:
   - `DECISION_C_CONTACT_AUTHOR_FOR_LICENSE`, or
   - stop and keep online-only Hebrew

## Stop Criteria Met

- commercial use is blocked by current licensing
- browser/mobile transfer path is unproven

## Product Rule Preserved

Hebrew default remains online TTS.
