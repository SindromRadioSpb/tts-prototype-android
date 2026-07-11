# 04 — Content, research and operations agents

**Status:** PROPOSAL · **Date:** 2026-07-11

## Agent portfolio matrix

| Agent/workflow | User/JTBD/trigger | Inputs/tools → output artifact | Writes/autonomy/approval | Fallback/evaluation | Cost/risk/maturity/dependency/horizon |
|---|---|---|---|---|---|
| Corpus curator | curator; find usable works; new source | catalog, rights, dedupe → candidate queue | candidate only; human collection approval | deterministic filters; licence/provenance audit | L–M; rights; partial; manifest; NOW |
| Difficulty/comprehensibility analyst | curator/learner; choose readable text | coverage, morphology, genre/register → multidimensional work card | no level truth; human calibration | existing `ez` + manual labels; learner gold | M; false level; prototype; rubric; NOW/NEXT |
| Graded path builder | learner/curator; next path | approved work cards/goals → 3–7-work proposal | recommend only; learner/curator selects | curated shelf | M; filter bubble; missing construct graph; NEXT |
| Exercise/cloze/distractor factory | curator; approved unit | source anchors, resolver → candidate items | candidate only; independent validation + human approval | templates | M; ambiguous Hebrew; partial components; NEXT |
| Translation/morph conflict reviewer | curator/R1; disagreement | providers/resolver → conflict queue | read-only; cannot overwrite truth | authoritative precedence/abstain | L–M; circular oracle; partial; NOW |
| Editorial authoring copilot | R6/R7; missing annotation | source/citations → draft intro/context | curated namespace only after approval | manual authoring | L; unsupported culture; namespace exists; NOW |
| Accessibility/localization adapter | learner/curator; approved content | source + locale/a11y contract → candidate alternative | separate derived artifact; human review | manual transcript/chunking | M; semantic drift; NEXT |
| Gold-fixture candidate generator | evaluator; coverage gap | errors/corpus strata → immutable worksheet candidate | never writes gold label | deterministic sampling + human double review | L–M; leakage; partial; NOW |
| Research/experiment agent | product/research; decision gap | literature, registry, cohort-safe aggregates → proposal/report | read-only, no learner state | manual analysis | M; causal overclaim; NEXT |
| Cohort/transfer/calibration agent | evaluator; completed window/drift | deidentified events/gold → alert/report | read-only; minimum-N suppression | prespecified scripts | M; privacy/MNAR; platform missing; NEXT |
| Privacy/bias/cost auditor | governor; release/anomaly | metadata traces/policies → finding/queue | issue/task only | deterministic policy checks | L–M; false assurance; NEXT |
| Incident/log investigator | ops; alert | redacted logs/metrics → hypothesis/runbook step | read-only; remediation requires approval | manual runbook | M; sensitive logs; later |
| Migration/release/adversarial reviewer | engineering; diff/release | diff/tests/contracts → verdict | no prod write; may open task | deterministic gates | L; overtrust; partial smoke base; NOW |
| Provider outage router | runtime; circuit opens | route registry/health → deterministic route decision | bounded config-selected route, no state truth | LLM-less core | L–M; policy mismatch; gateway gap; NEXT |
| Content release worker | curator/ops; approved manifest | immutable allowlist/checksums → staged release | deterministic approved publish only | current manual pipeline | M; rights/rollback; partial; LATER |

## Safe content pipeline

```text
candidate generation
 → deterministic identity/licence/schema/morphology/uniqueness checks
 → independent critic from a different trust path
 → human approval bound to immutable hash/version
 → deterministic canary publisher
 → verify / rollback
```

Fully automatic publishing is allowed only for non-semantic mechanics such as stable-ID joins, checksums and missing-field reports. Work-level difficulty, cultural notes, curriculum edges, translations and learner-facing exercises require human ownership.

**FACT:** the corpus has 26K+ discoverable works but only a much smaller ready/baked subset; `ez` is a derived proxy, not CEFR. **PROPOSAL:** begin with three curator-owned starter paths and a versioned `work learning card` (rights, genre/register/period, coverage, ambiguity, manual comprehensibility, modalities, target constructs, provenance and limitations). Preserve originals; adaptations are visibly derived separate artifacts.

Research/product/ops agents never mutate learner state. Their outputs are reports, alerts, experiment proposals, candidates or review queues. Production remediation always needs a narrow deterministic tool and explicit approval.

## Tests

Calibrate 60–100 stratified works against blinded A2/B1/B2 human ratings; compare curator path vs existing rail vs AI proposal; review 300 stratified cloze/distractor candidates for alternative-correct answers; test simplification on delayed authentic transfer; measure editor time/error with and without copilot; execute idempotent canary/rollback from an approved manifest.
