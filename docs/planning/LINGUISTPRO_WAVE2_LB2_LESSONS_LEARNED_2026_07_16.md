# LinguistPro Wave 2 — LB2 lessons-learned journal

**Date locked:** 2026-07-16
**Scope:** LB0–LB2 lesson composition, validation, evidence and production activation.
**Use:** mandatory input when lesson quality, evaluator authority or managed LLM quotas are reopened.

| ID | Evidence-backed lesson | Consequence for future work |
|---|---|---|
| LB2-L01 | Provider/schema compliance proves JSON shape, not Hebrew correctness, grounding, level fit or pedagogical value. | Keep strict post-parse validation and independent human Hebrew/pedagogy evidence as separate gates. |
| LB2-L02 | A structurally accepted lesson can still have weak progression. The pre-review's weakest dimension was pedagogical value, 2.769/5. | Optimize progression and learning sequence only against a declared rubric; never relax hard gates to improve acceptance. |
| LB2-L03 | A composer or the same AI in a second pass is not an independent adjudicator. | Preserve reviewer identity and independence metadata; do not label same-assessor work as human or independent evidence. |
| LB2-L04 | Stable content-free error codes make one-shot repair diagnosable and effective for local contract defects. | Prefer code-directed local correction; keep exactly one bounded repair unless later evidence and budget approval change the contract. |
| LB2-L05 | Silent filtering can turn a broken partial lesson into an apparently valid one. | Reject the whole candidate when a selected focus, controlled answer, source or anchor is invalid. |
| LB2-L06 | `undefined` grammar targets, excluded ambiguous morphology, false anchors and answer leakage are recurring model failure families. | Keep deterministic tripwires and independent fixtures for each; resolver exclusions remain above model prose. |
| LB2-L07 | Raw prompts/responses are unnecessary for operational diagnosis and create privacy/logging risk. | Operational telemetry stays content-free; raw synthetic/public-domain candidates belong only in declared research packets. |
| LB2-L08 | Honest UI provenance prevents a safe fallback from masquerading as AI and prevents an AI draft from masquerading as expert certification. | Render origin from typed `quality.tier`/diagnostics, not prose style; retain localized disclosure. |
| LB2-L09 | Managed quota is the minimum of per-user, global and provider limits. A legacy per-user value of 50 silently overrode the intended 300 RPD envelope. | Verify all quota layers through the live status endpoint after every provider activation. |
| LB2-L10 | A Coolify environment-variable edit is not active in an existing container, and a simple container restart may preserve the old environment. | Use redeploy/recreate, then inspect the running container and status response in masked form. |
| LB2-L11 | A valid key/model canary is necessary but insufficient. | Verify both a minimal provider call and one isolated end-to-end lesson build from a public/synthetic source. |
| LB2-L12 | Free-tier availability and Terms/data use are part of the product boundary, not merely billing details. | Current approval is owner-only adult testing with explicit owner consent; revisit Terms, disclosure and data policy before any other user gets access. |
| LB2-L13 | BYOK and managed routes have different authority and budget semantics. | BYOK remains fail-closed with no managed-key fallback; managed calls remain ledger-governed. |
| LB2-L14 | A single 26-candidate run is useful engineering evidence but cannot establish production pedagogical reliability. | Repeat from the then-current implementation and obtain blind human review before any quality-promotion claim. |
| LB2-L15 | Keeping raw evidence, blind views, hashes, worksheets and analysis in stable repository paths made defects and a duplicated blind slot recoverable. | Preserve artifact hashes and exact blind-ID coverage; never leave decision artifacts only in `.tmp`. |

## Deferred hypotheses, not learned facts

- A progression rule engine may improve pedagogical value.
- A local exercise-only repair may outperform whole-composition repair.
- External Hebrew oracles may reduce unsupported linguistic claims.
- A provider-independent shadow critic may add incremental detection value.

These remain hypotheses until measured against a current frozen run and independent human judgments.
