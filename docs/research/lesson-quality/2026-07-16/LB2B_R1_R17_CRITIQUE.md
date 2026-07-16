# LB2-B R1-R17 adversarial critique

**Decision:** no blocker changes the approved offline-evidence boundary.

| Lens | Failure pressure | Resolution in this run |
| --- | --- | --- |
| R1 | Fluent Hebrew is mistaken for resolver truth. | Only frozen asserted facts may support morphology; ambiguous forms are explicitly excluded. Human correctness remains independent. |
| R2 | A structurally neat lesson is not usable on mobile. | Human rubric retains cognitive load and answerability; production UI is unchanged. |
| R3 | A long literary source is judged from one convenient excerpt. | Large cases expose deterministic start/middle/end anchor windows and declare whole-scope limitations. |
| R4 | Generated explanations become an accessibility wall. | The engineered prompt limits each exercise to one primary action; the reviewer scores load independently. |
| R5 | Russian explanation quality hides Hebrew errors. | Hebrew correctness, naturalness and grounding are separate dimensions and critical errors override averages. |
| R6 | Modern-level rules are imposed on literary Hebrew. | Register is declared per case and stability is reported by register. |
| R7 | Public-domain provenance is lost in copied candidates. | Every source packet carries locator, license and content hash where available. |
| R8 | Review order reveals the model and biases scoring. | Candidate IDs are seeded and blind; the identity key is withheld until worksheet lock. |
| R9 | Machine translation is treated as human ground truth. | Russian rows are context aids; they are not promoted to asserted Hebrew facts. |
| R10 | The composer invents a construct that the validator cannot name. | The invented-construct control is rejected before publication; no new validator code is silently added. |
| R11 | BYOK leaks into artifacts or falls back to a managed key. | Dedicated environment variables are presence-only in manifests; missing keys skip their cell. |
| R12 | Prompt/schema/fixture contracts drift. | The shipped composition contract supplies instructions, schema and post-validation; hashes freeze each run. |
| R13 | A single reviewer is presented as consensus. | Results are labeled pilot evidence; adjudication is recorded separately and inter-rater statistics are prohibited. |
| R14 | Raw learner/source content enters operational logs. | Only synthetic/public-domain raw artifacts are committed; stdout is content-free and operational telemetry is untouched. |
| R15 | Provider retention or training policy is ignored. | The run uses only owner-approved public/synthetic inputs and records provider/model/provenance. |
| R16 | Quality search spends without bound or times out indefinitely. | USD 5 hard ceiling, per-call cost preflight, existing 30-second timeout, one repair and no repetitions. |
| R17 | The critic certifies its own composer or optimizes acceptance by weakening gates. | Exact same-model self-review is blocked; the Pro critic is still family-correlated with Flash composers, so it is advisory and ineligible for authority; hard validation remains unchanged. |

## Specific attack controls

- `adversarial_foreign_anchor`: mutate an otherwise generated first candidate with a foreign anchor, then test code-directed repair.
- `adversarial_missing_answer`: remove the vocabulary expected answer, then test repair.
- `adversarial_generic_instruction`: replace one instruction with a generic action, then test repair.
- `adversarial_invented_construct`: simulate deterministic controller rejection before the composer can publish it.
- `provider_absent_safe_plan`: simulate provider absence without spending a call.
- `double_reject_safe_plan`: mutate both first and repair candidates so fallback remains mandatory.

These controls are reported separately from organic model failures. They cannot be counted as evidence that a model naturally produced the injected defect.
