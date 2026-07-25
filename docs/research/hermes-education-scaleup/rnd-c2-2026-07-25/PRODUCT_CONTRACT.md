# C2 experimental product contract

Date: 2026-07-25. Surface: Hermes WebUI on desktop and iPhone Safari over HTTPS.

## Product decision

The owner accepted the temporary two-surface smoke after successful RT1 desktop and RT2 iPhone
conversations and authorized conversion of the research selector into a mature experimental
practice surface. This product decision does not rewrite the frozen research result: the matched
3 async + 3 realtime benchmark remains incomplete and no numerical C2 research GO is claimed.

## Learner contract

- All predefined topics are available on every supported device. `Free conversation` is selected
  by default.
- A topic is a conversational starting point, not a constraint. Gemini is explicitly instructed
  to follow a natural topic change instead of forcing the learner back.
- The selected predefined topic is included in the ephemeral Live setup. No custom or personal
  text field is provided.
- Input/output transcription is visible only during the session. Audio and transcript are not
  written to local storage, the sidecar, benchmark results, LinguistPro, FSRS or `review_log`.
- Session completion shows only an ephemeral completed-turn count. Product sessions are not sent
  to the frozen benchmark result endpoint.
- The feature remains opt-in, experimental and advisory-only. It does not grade pronunciation,
  comprehension, cards, reviews or progress.
- Gemini Live Free Tier remains the only realtime provider in this deployment. Paid fallback is
  forbidden; quota exhaustion explicitly returns the learner to H2.6 async voice practice.

## Preserved research evidence

The content-free RT1 and RT2 JSON records remain untouched in the owner-controlled Hermes volume.
The product client uses `purpose=practice` for one-use token issuance and does not reuse RT1–RT3
identifiers.
