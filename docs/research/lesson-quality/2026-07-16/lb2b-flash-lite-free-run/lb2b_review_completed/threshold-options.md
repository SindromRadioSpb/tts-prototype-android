# LB2-B threshold options

**Status:** `ENGINEERING_PRE_REVIEW_COMPLETE`; no production decision.

## Review-quality options

- **strict:** no critical error; every dimension >= 4; mean >= 4.5; accepted 4/26 (15%).
- **balanced:** no critical error; every dimension >= 3; mean >= 4; accepted 15/26 (58%).
- **exploratory:** no critical error; every dimension >= 3; mean >= 3.7; accepted 16/26 (62%).

A critical error vetoes every option. These are comparison scenarios, not approved promotion gates.

## Latency options

- **measured_p90:** candidate-generation p90 <= 3477 ms — Measured service target, not a hard kill threshold.
- **measured_p95:** candidate-generation p95 <= 3520 ms — More tolerant offline target.
- **existing_timeout:** each provider attempt <= 30000 ms — Existing fail-closed adapter timeout; one repair remains separate.

## Shadow boundary

- No paired human-shadow evidence; critic remains advisory.
- This packet is AI engineering pre-review; independent human reviewer and adjudicator evidence is still pending.
- No critic may edit, repair, select or publish a learner-visible lesson in LB2-B.
