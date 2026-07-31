# Windows Local ASR invite-only beta — blinded owner worksheet

Status: `BLOCKED_SOURCE_SET_NOT_FROZEN`. This worksheet does not close the beta acceptance gate.

## Frozen-set requirements

- 12–15 minutes total; at least four independent speakers.
- Clean read speech, conversational speech, moderate noise, and names/numbers.
- Human-authored gold independent of Local ASR and Gemini, frozen before inference.
- Ten opaque tasks below; order is fixed only after source hashes and the private key are complete.
- No new Gemini request or cloud upload is authorized in this slice. The owner-provided Mia Gemini
  export may be compared offline, but it is not human-authored gold and cannot score these tasks.

## Blinded tasks

| ID | Listen/read verdict | Material omissions/additions | Names/numbers | Usability note | Accept for beta? |
|---|---|---|---|---|---|
| Q7M4 |  |  |  |  |  |
| K2R9 |  |  |  |  |  |
| V8C3 |  |  |  |  |  |
| H5T1 |  |  |  |  |  |
| N4P7 |  |  |  |  |  |
| D9L2 |  |  |  |  |  |
| W3F8 |  |  |  |  |  |
| B6J5 |  |  |  |  |  |
| R1X6 |  |  |  |  |  |
| M7A3 |  |  |  |  |  |

## Owner decision (complete after review)

- Beta threshold:
- Tasks accepted / 10:
- Hard-stop error classes:
- Decision: `GO INVITE-ONLY BETA` / `NO-GO` / `REVISE AND REPEAT`
- Date and owner signature:

This decision applies only to the invite-only Windows beta. It neither closes nor revises the
permanent 60-minute/12-speaker paired-Gemini gate.
