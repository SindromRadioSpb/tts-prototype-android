# Chapter 4 — Privacy-Preserving Opt-in Research-Mode: A Design Contribution

> **Status.** DRAFTING (section-by-section, Role 1).
> **Target length.** ~15 pages.
> **Bilingual workflow.** EN canonical for thesis submission; RU mirror at `thesis/04_privacy_contribution.ru.md` for author comprehension. Sync invariant per `docs/THESIS_BILINGUAL_WORKFLOW.md` — any edit to one paired file requires immediate corresponding edit in the partner.
> **Glossary.** `thesis/GLOSSARY.md` — canonical RU↔EN mappings of key terms.
> **Sources.** `docs/ULPAN_RESEARCH_PLAN_v3_2.md` §4-§5, `docs/RESEARCH_METRICS_SCHEMA.md`, `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`, `docs/RESEARCH_CONSENT_RULE.md`, `docs/RESEARCHER_GUIDE.md`, `docs/THESIS_VALIDITY_AUDIT_2026_05_21.md §8` + §11.4, `thesis/IRB_FRAMEWORK_DRAFT.md`, implementation evidence in `research/validate.js`, `research/storage.js`, `public/js/research.js`, `public/index.html` (heartbeat).
> **Stylistic conventions.** Academic plural ("we") even for single-author thesis (standard for EN MSc; mirror keeps the same convention with "мы" in RU); switchable to "I" / "я" if supervisor prefers. APA 7 citations. `[TODO: cite X]` markers for unresolved references — to be filled in Role 2 literature pass.
> **Last updated.** 2026-05-22 (draft complete: §§4.1–4.10 drafted; user reviewing full chapter file as agreed cadence).

---

## 4.1 Introduction: A Twofold Contribution

This thesis advances two contributions of unequal weight and unequal
dependency on empirical findings.

The first is **empirical**: a correlational analysis of digital
learning activity against learning outcomes in a single Hebrew ulpan
cohort, pre-registered on OSF [TODO: cite our OSF preregistration —
DOI 10.17605/OSF.IO/ZDV9J]. As Chapter 5 will make explicit, this
component is **exploratory by design**: the natural cohort size of an
ulpan group (N ≈ 8–15) is below the conventional power threshold for
detecting medium effect sizes in pairwise correlation (Cohen, [TODO:
cite Cohen 1988 power for correlation r=0.5]; the conventional
detectable r at our linked-subsample size ≈ 10 is r ≥ 0.78, i.e. only
large effects). The empirical chapter therefore reports point estimates
with explicit 95% confidence intervals and frames null findings as
"absence of evidence", not as "evidence of absence" — a framing
borrowed from Lakens et al.'s equivalence-testing pedagogy [TODO: cite
Lakens 2018 equivalence test pedagogy] and from the wider Open Science
turn against p-value-centric inference [TODO: cite Nuzzo 2014 or
Wasserstein & Lazar 2016 ASA statement on p-values].

The second contribution is **methodological** and is the primary
defendable artifact of this thesis: the **design of a
privacy-preserving opt-in research-mode** for language-learning
applications, embodied in the LinguistPro codebase and externalized as
an open-source schema + consent template + decision rules. This
contribution is **independent of the empirical study's outcome**. Even
if the correlation analysis returns uniformly null findings — an
outcome the underpowered design makes statistically likely for
small-to-medium effects — the architecture, the threat model, the
material-change consent decision tree, and the open-source artifacts
remain reusable by future Computer-Assisted Language Learning (CALL)
researchers, institutional repositories, and educational technology
evaluators. The deliverable, in other words, is not a finding; the
deliverable is **infrastructure for finding things ethically and
reproducibly**.

We motivate this asymmetric weighting deliberately. The educational
technology literature has documented for over a decade that the data
infrastructure of digital learning tools is **the** bottleneck for
defensible educational research [TODO: cite Siemens 2013 or other
foundational learning-analytics work on data-infrastructure
bottlenecks]. Closed vendor analytics — Duolingo, Memrise, LingQ, and
similar commercial language platforms — collect comprehensive
behavioral telemetry, but their data is inaccessible to independent
researchers, internally inconsistent across versions, and bound to the
vendor's product roadmap rather than to scientific questions. Open
alternatives, in turn, have historically relied on post-hoc
anonymization of dataset releases (a paradigm Sweeney's foundational
work [TODO: cite Sweeney 2002 k-anonymity] showed to be repeatedly
vulnerable to re-identification by quasi-identifier combination)
rather than on architectural privacy guarantees enforced at the
collection point. The space between "vendor-controlled telemetry" and
"post-hoc anonymized dataset" remains, to our knowledge, sparsely
populated [TODO: literature search — is there a privacy-preserving
CALL platform precedent we can cite or contrast against? See
Chapter 2.].

The contribution this chapter advances is to populate that space with
a working, code-anchored, ethically-formalized exemplar. The design
locks in seven architectural decisions (§4.3); is implemented in
production-grade code with companion smoke-test enforcement (§4.4);
defends against a documented threat model with explicit
acknowledgement of what is **not** defended (§4.5); compares
favorably with established alternatives — differential privacy,
federated learning, vendor analytics, open anonymized datasets, and
local-only analytic tools — along axes relevant to small-cohort
educational research (§4.6); operationalizes a multi-source ethical
framework (Helsinki Declaration §22–32, GDPR Article 6(1)(a), and
supervisor-as-ethics-oversight) without claiming formal IRB approval
where none exists (§4.7); is positioned for reusability by other
researchers via permissive open-source licensing of the entire
codebase, schema, and consent template (§4.8); and acknowledges its
own limitations honestly (§4.9). A summary and a transition to the
empirical methodology (Chapter 5) close the chapter (§4.10).

A reader of this chapter who is uninterested in the empirical
correlation analysis — or who concludes that the underpowered
empirical results, whether positive or null, are uninterpretable —
can still read the chapter as a stand-alone design-research artifact.
That standalone defensibility is the point.

---

## 4.2 Design Requirements and Ulpan-Research Constraints

The architecture presented in §4.3 is not arbitrary: it follows from
requirements that emerge directly from the ulpan-research diploma
context. We separate these requirements into two layers: privacy
invariants that any architecture in this space must satisfy (§4.2.1)
and structural constraints imposed by the ulpan context that narrow
the design choices further (§4.2.2).

### 4.2.1 Privacy Invariants

Two well-established privacy models for educational research are
inadequate for our setting, motivating the search for a third.

The first is the **vendor-analytics model**, in which a commercial
provider (e.g., Duolingo, Memrise) collects comprehensive telemetry
under an opt-out terms-of-service framework. This model fails at small
cohort sizes: with N ≈ 10, any combination of three or four
quasi-identifiers (cohort code, age band, native language, study
schedule) is likely unique to a single participant [TODO: cite Sweeney
2002 k-anonymity foundational result]. Beyond technical
re-identifiability, ulpan students are frequently recent immigrants
with heightened sensitivity to surveillance from any party — vendor or
otherwise — and the opt-out default itself violates contemporary
research-ethics norms (Helsinki §22-32; GDPR Art. 6(1)(a)).

The second is the **post-hoc anonymization release model**, in which
raw data is collected during the study and then anonymized before
public release. This model fails for the same Sweeney-style reasons
amplified by the smallness of the cohort: the more granular the
behavioral data, the more its anonymity erodes under quasi-identifier
combination. It also fails operationally: anonymization happens only
at the release step, which means raw data with full identifiability
exists throughout the study duration — a liability footprint
inconsistent with the GDPR data-minimization principle (Art. 5(1)(c)).

Three privacy invariants therefore emerge that any acceptable
architecture in this space must satisfy:

- **(I1) Anonymity must survive small cohort size.** The architecture
  must enforce a k-anonymity threshold at the access layer — not as a
  post-hoc filter on a release, but as a runtime gate that hides
  individual breakdowns when `cohort_size < k`. Sweeney's threshold
  k = 5 [TODO: cite Sweeney 2002] is the conservative default; we
  adopt it.

- **(I2) Anonymity must survive the outcome-linking step.**
  Correlational research on engagement × outcome requires linking app
  metrics to exam scores. Naively, this requires either vendor-side
  knowledge of student identity (we collect identity to merge tables)
  or teacher-side knowledge of metrics (we hand the teacher a
  student-by-student dashboard). Both undermine the privacy guarantee.
  The architecture must instead support a **participant-initiated**
  linking step in which the participant — and only the participant —
  chooses whether their anonymous identifier connects to their named
  exam score.

- **(I3) Anonymity must survive a withdrawal request.** The right to
  erasure is meaningless if it deletes data from one location while
  leaving copies in another. A one-click withdrawal must result in
  complete server-side deletion of all records associated with the
  participant's anonymous identifier — engagement uploads, outcome
  scores, audit metadata — and complete local cleanup on the
  participant's device. An architecture that retains "audit copies"
  or "anonymized analytics summaries" of withdrawn data fails this
  invariant.

### 4.2.2 Structural Constraints

Beyond the invariants above, the operational context of an
ulpan-research diploma imposes four structural constraints:

- **(C1) Small cohort — N ≈ 8–15.** This single fact reshapes nearly
  every architectural decision. Schema designs trivially safe at
  N = 1,000 become precarious at N = 10, and statistical analyses
  robust at N = 100 are at the edge of meaningfulness at N = 10. The
  architecture must be sized for small N as the *primary* case, not
  as an edge case.

- **(C2) Opt-in default, not opt-out.** Research participation is a
  separable choice from app usage. Students who use LinguistPro as a
  study tool must not be enrolled in research by virtue of their tool
  choice. This requires the research-mode feature to be disabled by
  default, an explicit informed-consent step before any data leaves
  the device, and reversibility of participation status at any time
  without consequence to app usage.

- **(C3) Offline-first product architecture.** LinguistPro is
  offline-first by design: the user's library, audio cache, notes,
  and SRS state all live in the browser's Origin Private File System
  (OPFS) and SQLite WebAssembly. Server interaction is the exception,
  used only for cloud-only resources (Google TTS, Gemini translation).
  The research-mode must respect this invariant: the participant's
  raw events live on the participant's device, not on the server.
  Only daily aggregates leave the device, and only with consent.

- **(C4) Single-researcher diploma without institutional IRB.** The
  author conducts the study without a team, without a dedicated data
  steward, and without formal IRB pre-approval (per §4.7). This
  constrains the architecture to be **auditable by inspection**
  rather than by compliance bureaucracy: a single researcher must be
  able to verify the privacy guarantees by reading the codebase and
  running smoke tests, not by trusting an institutional review
  process. The architecture therefore privileges **mechanism-level
  transparency** (every privacy claim has a corresponding code
  artifact) over **policy-level assurance** (a signed compliance
  document with no enforcement mechanism).

Together, the three privacy invariants (I1–I3) and four structural
constraints (C1–C4) form the design space within which §4.3 must
operate. The seven architectural decisions that follow are not chosen
from a menu of possibilities; they are forced moves given these
constraints.

---

## 4.3 Architectural Decisions

The architecture answers the design space established in §4.2 with
seven decisions. Each is described below in terms of (a) the decision
itself, (b) the constraints from §4.2 that motivate it, (c) the
mechanism through which it is enforced (full implementation detail
follows in §4.4), and (d) what alternatives the decision rejects.
Throughout, the goal is to make every privacy claim **falsifiable by
inspection**: each decision corresponds to specific code artifacts
and smoke tests that can be examined directly.

### 4.3.1 Default OFF: Opt-In Only

**Decision.** Research-mode is disabled by default. Activation requires
an explicit consent click after the participant has read the
five-checkbox informed-consent screen.

**Motivated by.** C2 (opt-in default), I1 (small-N anonymity requires
consent to precede any data collection), Helsinki §22-32 (informed
consent norms), GDPR Art. 6(1)(a) (consent as legal basis).

**Mechanism.** Client-side state `localStorage.researchEnabled_v1` is
initialized empty. The boot hook `LinguistProResearch.init()` no-ops
when the flag is unset; the daily aggregator never runs, no UUID is
generated, no network call is made. Activation requires `acceptConsent
(version)`, which validates the consent version and writes the flag.
Server-side endpoints reject payloads from clients lacking a valid
`consent_version`.

**Rejects.** The opt-out vendor-analytics default, in which data
collection begins automatically upon app usage. Also rejects "soft
opt-in" patterns (pre-checked consent boxes, opt-in inferred from
continued usage) common in early-2010s educational telemetry.

### 4.3.2 Anonymous student_id (UUID v4, Client-Generated)

**Decision.** Each participant is identified by a UUID v4 generated
client-side via `crypto.randomUUID()` and stored in
`localStorage.researchStudentId_v1`. The server never sees a name,
email, IP, or other personally identifiable information; the UUID is
the de-facto authentication token for that participant's data.

**Motivated by.** I2 (anonymity surviving outcome-linking), C2 (opt-in
identity separated from app identity), GDPR data minimization
(Art. 5(1)(c)).

**Mechanism.** `ensureStudentId()` in `public/js/research.js` generates
a UUID on first opt-in; the same UUID accompanies every daily aggregate
upload. The schema validator (`research/validate.js`) requires UUID
format on the `student_id` field and recursively rejects payloads with
PII-shaped fields (`username`, `email`, `name`, `phone`, `ip`,
`geolocation`, `user_agent`, `device_id`) anywhere in the payload tree.
No server-side mapping table from UUID to real identity exists.

**Rejects.** Server-side identity provisioning (the vendor knows who
you are by virtue of account creation); identity-linked telemetry; any
architecture where the server can map a UUID back to a real-world
identity through its own records.

### 4.3.3 Schema-Strict Server-Side Aggregation

**Decision.** Only daily aggregates leave the participant's device —
never raw events, never text content, never note bodies, never search
query strings, never audio. The server-side validator enforces this
with an allow-list of metric fields and a deny-list of explicitly
forbidden fields, with recursive validation through arbitrary nesting
depth.

**Motivated by.** I3 (withdrawal completeness — fewer raw events
server-side means less to delete), C3 (offline-first invariant
preserves raw events on device), GDPR data minimization.

**Mechanism.** `validatePayload()` in `research/validate.js` checks:
(a) payload size ≤ 64 KB; (b) all required top-level keys present with
no unexpected extras; (c) recursive deep-check that no
`FORBIDDEN_FIELDS` (currently 16 entries including `text_content`,
`note_body`, `search_query`, `audio_bytes`, `username`, `email`,
`name`, `phone`, `ip`, `geolocation`, `latitude`, `longitude`,
`user_agent`, `device_id`, `device_serial`, sub-day `timestamp`)
appear at any nesting depth; (d) per-field type, range, and format
constraints. Any violation returns HTTP 400 with `field` path context
for client debugging — but without echoing forbidden content back to
the client logs.

**Rejects.** The "we anonymize at release" pattern (raw events stored
during the study, anonymized later); the "we send everything and
filter server-side" pattern of common vendor SDKs; architectures where
field-level privacy depends on developer discipline rather than
automatic schema enforcement.

### 4.3.4 k-Anonymity Threshold k = 5

**Decision.** When a cohort contains fewer than 5 opted-in
participants, individual-level breakdowns in the researcher dashboard
and CSV exports are hidden; only cohort-wide aggregates remain visible.

**Motivated by.** I1 (anonymity surviving small N).

**Mechanism.** `aggregateCohort()` in `research/storage.js` computes
`k_anonymity_met = (cohort_size >= cohort_meta.k_anonymity_threshold)`,
where the threshold defaults to 5 and is per-cohort configurable. When
`k_anonymity_met === false`, the returned `students: []` and
`per_student_daily: []` arrays are empty — daily cohort-wide
aggregates remain visible (they do not identify individuals), but the
per-student table, correlation analysis, and per-student CSV export
are gated. The dashboard renders an empty-state indicator instead of
the breakdown UI.

The k = 5 default follows the foundational k-anonymity formulation of
Sweeney (2002) [TODO: cite Sweeney 2002 fully], with k = 5 adopted as
the conservative convention established in subsequent
privacy-preserving educational data publication practice [TODO: cite
NCES Statistical Standards or equivalent for k = 5 as educational-data
convention]. We acknowledge that k = 5 is conservative for some
research contexts (where k = 3 might suffice) and inadequate for
others (where l-diversity or t-closeness would be required); within
the diploma-scale ulpan-research context, k = 5 strikes a defensible
balance.

**Rejects.** Release-time-only k-anonymity (filter applied at CSV
export but not at runtime UI); flexible thresholds by user role
(researcher sees more than teacher sees more than student); ad-hoc
small-cell suppression.

### 4.3.5 Two-Key Split-Knowledge Linking

**Decision.** Linking app metrics to exam scores is
**participant-initiated** through a manual disclosure step. The
researcher holds the anonymous UUID and aggregated metrics; the
teacher holds the named student and exam score. Linking requires the
participant to voluntarily disclose their UUID to the teacher (for
example, by writing it on the exam paper).

**Motivated by.** I2 (anonymity surviving outcome-linking).

**Mechanism.** The consent template (§3.2 item 4) declares this as an
**optional separate consent**, distinct from research participation
itself. Participants who opt in to research can decline to share their
UUID with the teacher; their engagement metrics remain in the cohort
dataset, but their outcome scores are not linked to their UUID, and
the regression-style "engagement × outcome" analyses on that
participant are unavailable. The teacher uploads outcomes via
`outcomes.csv` keyed by `student_id` (the UUID); without UUID
disclosure, no row exists in `outcomes.csv` for that participant.

**Rejects.** Vendor-side linking (the platform knows both the metrics
and the identity); teacher-side metric visibility (the teacher sees
the per-student behavioral dashboard); automatic linking via account
creation. The trade-off is statistical power: voluntary linking is a
self-selection mechanism, and the linked subsample is likely
systematically different from the full opted-in cohort — a sensitivity
analysis addressed in Chapter 5 Methodology.

### 4.3.6 One-Click Withdrawal With Audit Log

**Decision.** A participant can withdraw at any moment via a single
button in the application. The action triggers a server-side cascading
delete of all `.jsonl` rows and `outcomes.csv` rows associated with
the UUID, an append to `deletions.log` for audit, and full local
cleanup of `localStorage`. If the server is unreachable, the DELETE is
queued for retry; local cleanup happens unconditionally.

**Motivated by.** I3 (anonymity surviving withdrawal); GDPR right to
erasure (Art. 17); Helsinki §22-32 right to withdraw without
consequence.

**Mechanism.** `deleteStudentFromCohort()` in `research/storage.js`
scans every `.jsonl` file in the cohort directory, rewrites each
atomically (`.tmp` + rename) without rows matching the UUID, and
counts removed records. It also rewrites `outcomes.csv` without the
UUID's row if present. An audit line is appended to `deletions.log`
capturing timestamp, UUID prefix, reason, and counts. Client-side,
`withdraw()` in `public/js/research.js` issues the DELETE, queues for
retry on network failure, and unconditionally clears
`researchEnabled_v1`, `researchStudentId_v1`, `researchCohortCode_v1`,
`researchUploadLog_v1`, and `researchLastUploadDate_v1`.

**Rejects.** Soft-delete patterns (mark as withdrawn, retain data);
incomplete withdrawal (delete from primary table, leave in audit
copy); withdrawal requiring researcher approval or a business-day
delay; withdrawal that requires the participant to remember their
UUID after losing the device (we accept this trade-off as a known
limitation discussed in §4.9).

### 4.3.7 Consent Versioning With Material-Change Decision Tree

**Decision.** The consent template carries a `CONSENT_VERSION`
semantic version constant. Any **material** edit to the consent
template (new metric collected, expanded retention, new access scope,
changed withdrawal mechanism, changed k-anonymity threshold) requires
a version bump, which forces re-consent from all opted-in participants
on their next session. **Cosmetic** edits (typo fixes, clarification
of phrasing, format adjustments) do not bump the version. A formal
five-question decision tree in `docs/RESEARCH_CONSENT_RULE.md`
classifies each edit before merge.

**Motivated by.** Helsinki §22-32 (informed consent is binding to
specific terms — material changes require re-affirmation); GDPR Art. 7
(conditions for consent — the participant must be informed about the
specific data processing); audit-trail need for ethics defensibility.

**Mechanism.** `CONSENT_VERSION = '1.0'` constant in
`public/js/research.js`. The function `needsReconsent()` compares
`localStorage.researchConsentVersion_v1` against `CONSENT_VERSION` via
semantic-version comparison; if stored is lower, the daily aggregator
no-ops with the diagnostic code `RECONSENT_NEEDED`, and the
application prompts re-consent at the next research-mode entry. The
decision tree in `RESEARCH_CONSENT_RULE.md` provides five worked
examples covering material changes (new metric, retention extension)
and cosmetic changes (wording polish, formatting).

**Rejects.** Consent buried in general terms-of-service updates;
consent that survives substantive changes silently (the participant
agreed to "X" and the platform now collects "Y" without prompting);
ambiguous decision-making about what triggers re-consent.

### 4.3.8 Reinforcement Among Decisions

These seven decisions are not independent: each reinforces the others.
Default-OFF (§4.3.1) ensures the UUID (§4.3.2) is never generated
without consent. Schema-strict aggregation (§4.3.3) ensures the
k-anonymity gate (§4.3.4) operates on inherently lower-risk data. The
two-key linking (§4.3.5) is meaningful only because the UUID is
anonymous (§4.3.2). One-click withdrawal (§4.3.6) is complete only
because no raw events exist on the server (§4.3.3). Consent versioning
(§4.3.7) is the meta-mechanism that ensures the other six decisions
remain valid as the consent contract evolves over time. Section §4.4
traces each of these decisions to its concrete code artifact and
accompanying smoke test, making each privacy claim falsifiable by
direct inspection rather than by documentation alone.

---

## 4.4 Implementation: Code as Artifact

The seven architectural decisions of §4.3 are each grounded in specific
code artifacts. This section traces the implementation layer — what
files implement which decisions, and what smoke tests pin which
invariants — so that the claims of §4.3 are verifiable by **direct
inspection of running code**, not by trust in documentation alone. The
implementation spans four primary modules: a server-side validator
(§4.4.1) that enforces schema-strict aggregation; a storage layer
(§4.4.2) that implements the k-anonymity gate and the cascading
deletion mechanism; a client-side opt-in flow (§4.4.3) that implements
default-OFF, UUID generation, and consent versioning; and a
transparency UI (§4.4.4) that operationalizes the participant's right
to see what was collected.

### 4.4.1 Server-Side Validator — `research/validate.js`

The validator (approximately 400 lines) is the trust boundary between
client payloads and server storage. It enforces decision 4.3.3
(schema-strict aggregation) and contributes to decisions 4.3.2 (UUID
shape check) and 4.3.7 (consent-version semantic check). Its
responsibilities, executed in sequence on every `POST /api/research/v1/
metrics` request, are: (i) format identifier check
(`payload.format === "linguistpro-research-v1"`); (ii) presence of all
required top-level keys with rejection of unexpected extras;
(iii) identifier shape constraints (UUID v4 for `student_id`, regex
`[A-Z0-9-]{4,16}` for `cohort_code`, ISO-day for `upload_ts` and
`since_ts`); (iv) `recurseForbidden(payload, "$")` — a depth-unlimited
walk of the payload tree that rejects any occurrence of 16 forbidden
field names; (v) per-field range, type, and format constraints for
each metric layer; and (vi) size cap at 64 KB to prevent abuse via
large blobs.

Each violation raises a `SchemaViolationError` carrying a `field` path
(e.g. `$.metrics.outcome.quiz_score_normalized`), which the route
handler translates to an HTTP 400 response with `{ error:
"SCHEMA_VIOLATION", field, message }`. The error path is propagated
without echoing forbidden content back to client logs. Smoke tests in
`scripts/research/smoke.js` (15+ cases) pin each violation class
explicitly: missing field, forbidden field at depth, oversized
payload, bad UUID format, sub-day timestamp, and so on.

### 4.4.2 Storage Layer — `research/storage.js`

The storage layer (approximately 600 lines) implements the file-system
layout defined in `docs/RESEARCH_METRICS_SCHEMA.md §10`: a per-cohort
directory containing `cohort_meta.json` (token hash, k threshold,
retention date), per-day `.jsonl` files (one upload payload per line),
`outcomes.csv` (teacher-uploaded scores), and `deletions.log` (audit
append-only). It enforces decisions 4.3.4 (k-anonymity gate) and 4.3.6
(cascading deletion).

The k-anonymity gate is realized in `aggregateCohort()`: the function
computes `k_anonymity_met = (cohort_size >= cohort_meta.k_anonymity_
threshold)` and returns empty `students: []` and `per_student_daily:
[]` arrays when the threshold is unmet. Because `aggregateCohort()` is
the **only** function through which the researcher dashboard and CSV
exports read cohort data, the gate is enforced uniformly — there is no
alternative code path that bypasses it.

The cascading deletion is realized in `deleteStudentFromCohort()`,
which scans every `.jsonl` file in the cohort directory, rewrites each
atomically (`.tmp` write + rename) with rows matching the UUID removed,
counts removed records, and rewrites `outcomes.csv` similarly. An audit
line is appended to `deletions.log` with timestamp, UUID, reason, and
counts. Companion function `findCohortsForStudent()` performs a global
UUID search across all cohort directories, enabling cross-cohort
withdrawal for participants who do not remember which cohort code they
joined. Atomicity of file rewrites (`.tmp` + rename) ensures that a
crash mid-deletion leaves the original file intact rather than
half-modified.

### 4.4.3 Client Opt-In Flow — `public/js/research.js`

The client module (approximately 970 lines) implements decisions 4.3.1,
4.3.2, 4.3.6, and 4.3.7 from the participant's perspective. The boot
hook `init()` no-ops when `localStorage.researchEnabled_v1` is unset —
no UUID is generated, no network call is made, no aggregator schedule
is created. Activation requires `acceptConsent(version)`, which
validates the consent version string and writes the flag.
`ensureStudentId()` generates a UUID v4 via `crypto.randomUUID()` on
first opt-in and stores it in `localStorage.researchStudentId_v1`.
`joinCohort(code)` validates the cohort code regex and writes
`localStorage.researchCohortCode_v1`.

The daily aggregator (`runDailyAggregator()`) is intentionally
opportunistic: a 1-hour interval timer attempts an aggregation cycle,
which no-ops unless `lastUploadDate < yesterday`. Each cycle aggregates
events from the OPFS-resident SQLite `events` table over the window
[since_ts, upload_ts], assembles a payload conforming to the schema,
posts it, and either logs success or schedules a retry. Failure modes
are explicit: HTTP 400 (schema violation) → hard fail with log; HTTP
404 (cohort not found) → log and clear retry; HTTP 429 (rate limit) →
back off 30 minutes; HTTP 5xx or network error → queue payload and
schedule escalating backoff (1 min → 5 min → 30 min → 2 h).
`needsReconsent()` compares `localStorage.researchConsentVersion_v1`
against the `CONSENT_VERSION` constant via semantic-version comparison;
when the stored version is lower, the aggregator no-ops with diagnostic
code `RECONSENT_NEEDED` until the participant re-affirms the updated
consent template. The withdrawal function `withdraw()` issues the
server-side DELETE, queues for retry on network failure, and
unconditionally clears all `research*_v1` localStorage keys.

### 4.4.4 Transparency UI — the Preview-as-Separate-Section Pattern

The "👁 What was collected from you" modal — refined through iterative
testing and pinned by user feedback — implements two visually distinct
sections that the participant can browse at any time. The first is the
**preview of next upload** (live aggregate of today's activity,
amber-bordered, status `⏳ preview`), computed by `previewToday()` on
each modal open and **never** uploaded. The second is the **upload
history** (last 30 sent entries from `localStorage.researchUploadLog_
v1`, statuses `✓ stored` / `↻ dedupe` / `⚠ <error>`), append-only.

The visual separation is load-bearing: a participant reading the modal
must not confuse "what would be sent tomorrow" with "what was sent
yesterday". The preview-as-separate-section pattern — amber-bordered,
`⏳ preview` badge, explicit "not on server yet" textual marker, never
intermixed with the sent-log table — is documented as a reusable
transparency-UI design pattern (see project memory
`feedback_transparency_preview_pattern`). Purity tests in
`public/research-client-test.html` pin two invariants: `previewToday()`
makes no `fetch` call, and `previewToday()` does not mutate any
`localStorage` key.

This pattern operationalizes the right-to-transparency aspect of the
consent contract: the participant is not asked to trust that "we only
collect aggregated metrics"; they can open the modal at any point in
the cohort term and see, in their own browser, exactly what was sent
and exactly what would be sent next. The trust-by-demonstration
posture is the practical complement to the falsifiability-by-code
posture of §4.4.1–§4.4.3.

---

## 4.5 Threat Model

This section enumerates the assets the architecture protects, the
actors interacting with them, the threats actively defended against,
and — critically — the threats NOT defended against. Honest
acknowledgement of unaddressed threats is part of the design
contribution: a privacy architecture that overclaims protection is
itself a threat to the participants whose trust it solicits.

### 4.5.1 Assets and Actors

Five assets warrant protection:

- **A1.** Participant real-world identity (name, contact, biographical
  details).
- **A2.** Per-participant engagement patterns (the metric time series
  emitted by the application).
- **A3.** Outcome scores when linked to a UUID (the joined
  `engagement × outcome` view).
- **A4.** Audit-log integrity (`deletions.log` records, consent
  timestamps).
- **A5.** Consent-contract integrity (which version each participant
  agreed to and when).

Four actor categories interact with these assets: the **participant**
(the data subject, in GDPR terminology); the **teacher** (knows A1 +
names + exam scores, does not know A2); the **researcher** (knows A2 +
UUIDs, does not know A1); and **infrastructure operators** (the
Railway hosting provider, OS-level admins if separable from the
researcher in larger deployments). In this single-researcher diploma
the researcher and the operator are the same person — an unusual but
documented simplification of the actor model.

### 4.5.2 Threats Defended Against

- **T1. Vendor-side data exfiltration or commercial misuse.** No
  vendor actor exists in the architecture; the researcher is
  participant-known, and the consent template binds use to academic
  purposes only (no commercialization, no third-party sharing, no
  advertising).

- **T2. Server compromise leading to re-identification of named
  participants.** Even an attacker with full server access sees UUIDs
  and aggregates but cannot map UUIDs to names — no such table exists
  server-side, and the schema validator rejects any payload containing
  PII-shaped fields (decision 4.3.3).

- **T3. Re-identification via quasi-identifier combination (Sweeney
  2002-style attack).** The k = 5 anonymity gate hides individual
  breakdowns when `cohort_size < k`; collected fields are intentionally
  coarse (day-level `upload_ts`, hour-bucket histograms, no IP, no
  geolocation, no fingerprint).

- **T4. Replay attack (resubmission of old payloads).** Idempotent
  server-side dedupe by `(student_id, since_ts, upload_ts)` returns
  silent `dedupe: true` rather than duplicating data.

- **T5. Withdrawal incompletion.** `deleteStudentFromCohort()` rewrites
  all `.jsonl` files and `outcomes.csv` atomically, appends to
  `deletions.log`, and the client clears local state unconditionally;
  the DELETE is queued for retry if the server is unreachable
  (decision 4.3.6).

- **T6. Mid-study consent drift.** A `CONSENT_VERSION` semver bump
  triggered by any material change to the consent template forces
  re-consent before further data collection; the `needsReconsent()`
  gate (decision 4.3.7) prevents collection under a stale contract.

### 4.5.3 Threats NOT Defended Against

The architecture deliberately scopes its protection. The following
threats are acknowledged as out-of-scope and discussed honestly rather
than papered over:

- **T-not-1. Insider threat from the researcher.** The architecture
  assumes the researcher is honest about not misusing UUID + metric
  data. A malicious researcher with both UUID-side and (out-of-band)
  identity-side knowledge could re-identify a participant. Mitigated
  only by open-source code + the open replication package that makes
  collusion auditable in principle, not by technical prevention.

- **T-not-2. Compromised participant device.** If the participant's
  device is compromised, `localStorage` contents (UUID, upload log,
  consent version) are visible to an attacker. This is a
  participant-device-security issue rather than a research-mode
  issue; the consent template explicitly notes that "we cannot protect
  your data on your own device".

- **T-not-3. `deletions.log` tampering by a compromised server admin.**
  The log is append-only plaintext; an admin with filesystem access can
  delete entries. A cryptographic hash chain (Merkle-tree-style audit
  trail) would mitigate this but is PhD-tier work, deferred as future
  work for Stage 4–5 institutional deployment.

- **T-not-4. Statistical disclosure attacks beyond k-anonymity
  (l-diversity, t-closeness).** k-anonymity alone does not protect
  against attribute disclosure within a homogeneous cohort — if all
  participants in a cohort share a sensitive attribute value, knowing
  someone is in the cohort reveals the attribute. Mitigated only by
  aggregate-only collection; in larger studies with sensitive
  per-participant attributes, l-diversity or t-closeness would be
  required.

### 4.5.4 Relationship to Formal Frameworks

The architecture was not constructed by applying STRIDE [TODO: cite
Microsoft STRIDE methodology] or LINDDUN [TODO: cite Deng et al.
LINDDUN privacy threat modeling] formally; it was built from the
first-principles privacy invariants of §4.2.1 and the structural
constraints of §4.2.2. Retrospective mapping confirms broad coverage
of STRIDE's *Spoofing*, *Tampering* (partial), *Information disclosure*,
and *Repudiation* (partial) categories, and of LINDDUN's
*Identifiability*, *Disclosure*, *Unawareness*, and *Non-compliance*
categories. Documented gaps include STRIDE's *Denial of service* (rate
limits exist but are not adversarial-resistant) and LINDDUN's
*Detectability* (the server can detect that *someone* uploaded, just
not who) — both out of diploma scope. Future work for Stage 4–5
institutional deployment (per `ULPAN_RESEARCH_PLAN_v3_2.md §5`) would
benefit from formal STRIDE / LINDDUN application with full
methodology.

---

## 4.6 Comparison with Alternatives

The choice of architecture for LinguistPro's research-mode was made
against the backdrop of five established alternatives in the
privacy-preserving research design space. We compare them along five
axes relevant to small-cohort educational research: privacy-guarantee
strength, research utility, implementation cost, withdrawal mechanism,
and suitability for k = 5 small cohorts. The comparison reveals not a
winner-take-all dominance but a context-specific fit: LinguistPro's
design occupies a niche where the established alternatives are either
too weak (vendor analytics, open datasets), too strong but impractical
(formal differential privacy at small N), or too narrow (Anki-only).

### 4.6.1 The Comparison Table

| Approach | Privacy guarantee | Research utility | Implementation cost | Withdrawal mechanism | Suitable for k = 5 cohorts? |
|---|---|---|---|---|---|
| **LinguistPro opt-in research-mode** | k = 5 anonymity + two-key + schema-strict validation | High (full 6-layer engagement taxonomy) | Medium (~2,000 LoC + smoke tests) | One-click complete | ✅ Designed for it |
| Vendor analytics (Duolingo / Memrise / LingQ) | None (raw + identified telemetry) | High but vendor-private | Low (vendor-built) | Vendor TOS-dependent | ✅ but structurally anti-research |
| Differential Privacy (ε-DP) | Strong (formal ε bounds) | Lower (noise dominates at small N) | High (calibrated noise + composition tracking) | N/A (aggregates only) | ⚠ Noise dominates signal at N ≈ 10 |
| Federated Learning | Strong (no central raw data) | Limited (gradient leakage; fits predictive models, not descriptive analytics) | Very high (model + secure aggregation) | Per-device | ⚠ Overkill for small cohorts |
| Open Anonymized Dataset | Variable (post-hoc re-identification attacks) | High but irreversible release | Low | None (once published, no recall) | ❌ k = 5 not architecturally enforced |
| Anki + manual logs | Total (nothing leaves device) | None (no cohort aggregation possible) | None | N/A | ❌ No research-mode capability |

### 4.6.2 Per-Alternative Narrative

**Vendor analytics** (Duolingo, Memrise, LingQ, Drops, and equivalents)
offers high research utility per data point because the telemetry is
comprehensive, but the data is vendor-private (inaccessible to
independent researchers), tied to a proprietary product roadmap, and
inconsistent across product versions. From the participant's
perspective, the privacy guarantee is effectively absent — there is no
opt-out for behavioral telemetry beyond declining to use the product
entirely. From the research-ethics perspective (Helsinki §22-32; GDPR
Art. 6(1)(a)), the opt-out-via-Terms-of-Service default fails the
informed-consent standard outright.

**Differential Privacy (ε-DP)** [TODO: cite Dwork & Roth 2014
foundational] offers the strongest formal privacy guarantee available —
provable bounds on what any adversary can learn from the released data
— but the formal noise calibration required to achieve meaningful ε at
N ≈ 10 dominates the signal we are trying to measure. At small cohort
sizes the privacy-utility trade-off curve of ε-DP runs steeply against
utility; the per-cohort engagement signals on which our four primary
hypotheses depend would be statistically indistinguishable from
injected noise. ε-DP is the right answer for large-N aggregations
(e.g., national education statistics, U.S. Census Bureau OnTheMap)
[TODO: cite OnTheMap example]; it is not the right answer at the
diploma-cohort scale.

**Federated Learning** keeps raw data on participant devices and
exchanges only gradient updates with a central coordinator. The privacy
guarantee is structurally strong (no central server ever sees raw data)
but limited in research utility for the kinds of descriptive
correlation analyses planned here — gradient updates fit
predictive-model training, not exploratory analytics. Implementation
cost is very high (model architecture + client-side machine-learning
runtime + secure-aggregation protocols), entirely disproportionate to
single-cohort diploma research. Recent work demonstrates that gradient
inversion can recover training data under realistic threat models
[TODO: cite Geiping et al. 2020 gradient inversion], complicating the
"no central data" guarantee in practice.

**Open Anonymized Datasets** (e.g., MOOC datasets released under
research-data agreements) achieve high research utility but, as Sweeney
(2002) and subsequent literature demonstrated repeatedly, post-hoc
anonymization is irreversibly broken at small N: quasi-identifier
combinations re-identify individuals within homogeneous cohorts. Once a
dataset is publicly released, the privacy harm is irreversible —
there is no withdrawal mechanism, and re-identification attacks can be
re-run by future adversaries with new auxiliary information.

**Anki + manual logs** is the privacy-maximalist alternative: nothing
leaves the participant's device, ever. The participant's data is theirs
alone. For research, however, this approach offers zero aggregation
capability — researchers cannot observe cohort-level patterns, cannot
run correlation analyses, and cannot validate engagement-outcome
hypotheses. Anki is excellent for *individual learning*; it is
structurally incompatible with research-mode aggregation.

### 4.6.3 Positioning

LinguistPro's design occupies a context-specific niche: it offers
stronger privacy than vendor analytics and open-dataset releases, more
research utility than ε-DP at small N, lower implementation cost than
federated learning, and more aggregation capability than Anki-style
local-only tools. The architecture is not "better" in any absolute
sense — it is calibrated to the small-cohort diploma-scale educational
research context. For larger-N studies, ε-DP becomes attractive; for
institutional deployments, federated learning's overhead amortizes;
for individual learning without research, Anki's local-only model
wins. Within the design space defined by the privacy invariants and
structural constraints of §4.2, LinguistPro fills a sparsely populated
niche.

---

## 4.7 Ethical Framework Operationalization

The architecture's privacy claims are not free-floating; they are
anchored in a multi-source ethical framework selected for non-clinical
low-risk educational research at the diploma scale (full rationale in
`thesis/IRB_FRAMEWORK_DRAFT.md`). This section traces how each
framework component maps to concrete architectural mechanisms.

### 4.7.1 Framework Choice

Three sources are invoked simultaneously: the **World Medical
Association Declaration of Helsinki, §22-32** (informed consent in
research involving human subjects) [TODO: cite WMA Helsinki
Declaration formally]; the **EU General Data Protection Regulation,
Article 6(1)(a)** (consent as legal basis for personal-data processing,
applicable because the research server is hosted in the EU at the
Railway EU region) [TODO: cite GDPR formally]; and **de-facto ethics
oversight by the diploma supervisor**, in lieu of formal institutional
IRB pre-approval (this university does not maintain an IRB process
applicable to software-mediated educational research at the diploma
scale, a limitation acknowledged in §4.9).

The study is classified as non-clinical, low-risk, voluntary
educational research with adult participants. This classification is
consequential: it justifies the multi-source framework rather than
formal IRB-protocol overhead, and it places the study within the
scope of the chosen Helsinki + GDPR + supervisor arrangement.

### 4.7.2 Concrete Operationalization

Each framework requirement maps to a specific architectural mechanism:

- **Helsinki §22-32 informed consent** → five-checkbox consent UI;
  `acceptConsent(version)` writeback; consent template
  (`docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`) in RU + EN.
- **Helsinki §22-32 right to withdraw without consequence** →
  `withdraw()` one-click cascading delete; queued for retry on network
  failure; local cleanup unconditional.
- **Helsinki §22-32 right to be informed about what is collected** →
  "👁 What was collected" transparency modal + preview-as-separate-
  section pattern (§4.4.4).
- **GDPR Art. 5(1)(c) data minimization** → `FORBIDDEN_FIELDS`
  allow-list in `research/validate.js`; recursive deep-check rejection
  of any payload containing forbidden field names.
- **GDPR Art. 17 right to erasure** → `deleteStudentFromCohort()`
  cascading delete of `.jsonl` rows + `outcomes.csv` rows + audit
  append to `deletions.log`.
- **GDPR Art. 7 conditions for consent (binding to specific terms)** →
  `CONSENT_VERSION` semver + `needsReconsent()` gate; material-change
  decision tree formalized in `docs/RESEARCH_CONSENT_RULE.md`.

Each requirement therefore has a corresponding code artifact auditable
by direct inspection. This direct mapping between framework and
mechanism is the design contribution's claim to **falsifiable ethics
enforcement** — privacy and consent promises are not policy statements
only; they are runtime behaviors that can be tested.

## 4.8 Reusability as Open-Source Artifact

The design contribution is positioned for reuse beyond this diploma.
Five concrete artifacts are released under permissive open-source
licensing (MIT License for code, CC-BY 4.0 for documentation, schema,
and consent template):

1. **The LinguistPro codebase**, including `research/validate.js`,
   `research/storage.js`, `public/js/research.js`, the heartbeat
   session tracker, and the accompanying smoke-test suite
   (github.com/SindromRadioSpb/tts-prototype-android).
2. **The wire-format schema** (`docs/RESEARCH_METRICS_SCHEMA.md`) as a
   portable specification that any future CALL platform can adopt as
   a starting point.
3. **The informed-consent template**
   (`docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`) in RU + EN, with HE
   skeleton pending native review (review brief at
   `docs/HE_CONSENT_REVIEW_BRIEF.md`).
4. **The consent material-change decision tree**
   (`docs/RESEARCH_CONSENT_RULE.md`) — a reusable governance pattern
   applicable to any longitudinal opt-in research where the consent
   contract evolves over time.
5. **The OSF pre-registration**
   ([doi:10.17605/OSF.IO/ZDV9J](https://doi.org/10.17605/OSF.IO/ZDV9J))
   as a citable example of analysis-plan locking for explicitly
   underpowered single-cohort studies.

A future researcher conducting a CALL study on Hebrew, another L2, or
any small-cohort educational context can fork the codebase, adopt the
schema + consent template, and reuse the architectural decisions — or
argue with specific decisions while reusing the broader framework. The
transparency-UI preview-as-separate-section pattern (§4.4.4) is
documented as a reusable design pattern beyond the CALL context.

## 4.9 Limitations of the Privacy Architecture

Honest acknowledgement of limitations is structural to the design
contribution. We document the following along four categories:

**Process limitations.** No independent ethics-review committee (only
supervisor oversight) — institutional IRB recommended for Stage 4+
deployments. No formal HE native review of the consent template at the
time of writing — limits deployability to HE-primary cohorts until
external Hebrew review completes (tracked in
`docs/HE_CONSENT_REVIEW_BRIEF.md`). The single-researcher diploma
context means insider threats from the researcher themselves are
out-of-architecture-scope (§4.5.3 T-not-1).

**Architectural limitations.** `deletions.log` is append-only plaintext,
not a cryptographic hash chain — vulnerable to tampering by a
compromised admin (§4.5.3 T-not-3). Retention enforcement is manual
(the researcher deletes cohort directories at `retention_until`);
automated retention enforcement is deferred to a future major-version
release. Multi-device participants generate per-device UUIDs by
default; manual linking via `scripts/research/link_student_ids.js`
requires out-of-band confirmation between participant and researcher.
The `previewToday()` purity is enforced by unit tests, not by
language-level guarantees; a future code change could in principle
regress without test failure if the tests themselves drift.

**Methodological limitations.** k = 5 anonymity is conservative for
this context but does not protect against attribute disclosure
(l-diversity / t-closeness gap, §4.5.3 T-not-4). The architecture has
not been validated by formal external security audit or privacy impact
assessment — only by internal smoke tests and the openness of the
codebase to external scrutiny.

**Scope limitations.** The design is calibrated to small-cohort
single-ulpan deployment; scaling to multi-cohort comparative designs
(per `ULPAN_RESEARCH_PLAN_v3_2.md §5 Stage 3+`) requires additional
design work — cohort isolation is already encoded in the schema, but
cross-cohort analytic paths are not implemented. Federated
multi-platform research (Stage 5) is open-ended future work.

These limitations are not failures of the design but explicit
boundaries that delineate its scope of applicability and identify
directions for future work.

## 4.10 Summary and Transition to Methodology

Chapter 4 has advanced the methodological contribution of this thesis:
a privacy-preserving opt-in research-mode for small-cohort educational
research, embodied in working code and externalized as open-source
artifacts. The contribution is independent of the empirical findings
reported in Chapters 5-7. Even if the explicitly underpowered
correlation analysis returns uniformly null findings on the four
primary hypotheses, the architecture (§4.3), the implementation (§4.4),
the threat model (§4.5), the comparison with alternatives (§4.6), the
ethical-framework operationalization (§4.7), the reusability artifacts
(§4.8), and the acknowledged limitations (§4.9) remain reusable by
future CALL researchers, institutional repositories, and
educational-technology evaluators.

The privacy claims are not policy-level assertions; they are
falsifiable by direct inspection of the codebase, the smoke-test
suite, and the OSF pre-registration. Chapter 5 turns to the empirical
methodology that operationalizes these architectural commitments into
a correlational study design, with the architectural decisions of §4.3
implicitly entering the methodology as **mechanism-level guarantees**
that the empirical results — whatever their statistical outcome — were
collected under known and documented ethical and privacy invariants.

---

**End of Chapter 4.**
