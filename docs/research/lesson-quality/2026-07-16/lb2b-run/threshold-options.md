# LB2-B threshold options

**Status:** `HUMAN_REVIEW_PENDING`; no production decision.

## Human-quality options

- **strict:** no critical error; every dimension >= 4; mean >= 4.5; accepted 0/0.
- **balanced:** no critical error; every dimension >= 3; mean >= 4; accepted 0/0.
- **exploratory:** no critical error; every dimension >= 3; mean >= 3.7; accepted 0/0.

A critical error vetoes every option. These are comparison scenarios, not approved promotion gates.

## Latency options

- **measured_p90:** candidate-generation p90 <= 9181 ms — Measured service target, not a hard kill threshold.
- **measured_p95:** candidate-generation p95 <= 11314 ms — More tolerant offline target.
- **existing_timeout:** each provider attempt <= 30000 ms — Existing fail-closed adapter timeout; one repair remains separate.

## Shadow boundary

- No paired human-shadow evidence; critic remains advisory.
- One reviewer plus one adjudicator is pilot evidence; it cannot establish inter-rater reliability.
- No critic may edit, repair, select or publish a learner-visible lesson in LB2-B.
