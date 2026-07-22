# H2.1 — get_word_morphology

Canonical repo copy for the LinguistPro Agent Access tool and its Hermes-side policy addendum.

- `schema-before-sha256.json` is the 16-tool pre-change schema snapshot from HEAD
  `ee4a2cc2a00ffac4d35a6fce0c671526b0eeea0d`; the H2.1 smoke verifies every old schema hash.
- `MORPHOLOGY_GROUNDING_ADDENDUM.md` is the text to install in Hermes alongside the existing
  trainer policy/global SOUL. It requires a tool call before morphology and defines honest
  `AMBIGUOUS`, `UNRESOLVED`, invalid-input, and tool-failure behavior.
- `EVIDENCE.md` records engineering, deployment, live Hermes, consent, and owner-live evidence.

Rollback: disable/remove only `get_word_morphology` and `morphology.read`, revert the H2.1 code,
and remove this addendum from Hermes. Migration 054 is a harmless widened CHECK superset and may remain.
