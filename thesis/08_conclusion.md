# Chapter 8 — Conclusion and Future Work

> **Status.** DRAFT COMPLETE (sequential drafting per established cadence 2026-05-22).
> **Target length.** ~3-5 pages (BRIEF §3).
> **Bilingual workflow.** EN canonical; RU mirror at `thesis/08_conclusion.ru.md`. Sync invariant per `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Sources.** Chapter 4 §4.10, Chapter 5 §5.10, `ULPAN_RESEARCH_PLAN §5` (scaling), audit closure plan.
> **Last updated.** 2026-05-22.

---

## 8.1 Summary of Contributions

This thesis has advanced two contributions of unequal weight and unequal dependency on empirical findings.

The **primary contribution** is the methodological design of a privacy-preserving opt-in research-mode for a Hebrew language learning application, embodied in the working LinguistPro codebase and externalized as open-source artifacts: a wire-format schema, an informed-consent template, a material-change consent decision tree, a pre-registered analysis plan locked on the Open Science Framework before any participant data was collected, and the full source code under permissive licensing. The contribution is independent of any specific empirical outcome.

The **secondary contribution** is the empirical correlational study itself — an explicitly exploratory single-cohort analysis of digital learning activity against growth in Hebrew ulpan exam scores. The study is reported as effect-size estimates with 95% confidence intervals rather than as significance-test verdicts, in deference to the structural constraints of single-cohort diploma-scale research.

A **third contribution**, less central but worth recording, is the broader open-source release of the LinguistPro application itself — the typed-graph notes subsystem, the local Smart Learning Graph, the Hebrew morphological dictionary integration, the dual-mode UX, and the teacher dashboard — which together constitute a privacy-preserving CALL workspace for Hebrew that is structurally compatible with future research-mode extensions.

## 8.2 What Was Learned

**Methodologically**, the thesis demonstrates that:

- A privacy-preserving research-mode can be designed and implemented at modest engineering cost (~2,000 lines of code at the research-mode subsystem) while remaining auditable by direct inspection rather than by trust in policy.
- Pre-registration is valuable at small N. Effect-size-with-CI inference framing protects against the seductive but misleading p-value verdicts that a small-cohort design cannot honestly support.
- The two-key split-knowledge linking architecture is practical for small-cohort educational research; the linking-subsample bias is visible and can be probed via sensitivity analysis rather than denied.
- Honest acknowledgement of design limitations strengthens the methodological contribution rather than weakening it. A privacy-preserving framework that overclaims is itself a threat to participants.

**Empirically**, `[TODO: fill from Chapter 6 findings]` the thesis contributes a small-N data point to the CALL engagement-outcome literature: in a single ulpan cohort of approximately N = `[TODO]` linked participants, the four pre-registered engagement metrics (active minutes, SRS cards added, notes created, SRS error rate) yield Pearson r estimates of `[TODO: list]` against the `growth_delta` outcome. These estimates carry wide confidence intervals reflecting the small sample; their value is contributive evidence in an under-studied population, not confirmation of large-N CALL claims.

## 8.3 Scaling Architecture

The architectural choices of Chapter 3 are calibrated to a single ulpan cohort but do not preclude scaling. `ULPAN_RESEARCH_PLAN §5` documents five stages of architectural scope:

- **Stage 1** (single user, no research): the offline-first LinguistPro application as a personal study workspace.
- **Stage 2** (single cohort, opt-in research): the diploma-scale arrangement described in this thesis.
- **Stage 3** (multi-cohort comparative): cohort isolation is already encoded in the per-cohort directory layout; cross-cohort analytic paths are open work but require no schema migration.
- **Stage 4** (institutional adoption): a single educational institution deploys LinguistPro across multiple ulpan teachers / classes; the cohort code becomes a class identifier within an institution; per-class teacher dashboards roll up to an institutional-level view.
- **Stage 5** (federated public research platform): any qualified researcher can run an opt-in study against the LinguistPro architecture, with cross-platform federation enabling shared anonymized datasets without compromising the per-cohort privacy invariants.

Stages 3 through 5 are out of scope for the present diploma. The architectural commitments of Chapter 3 — schema versioning, cohort-isolated storage, schema-strict validation, default-OFF opt-in, two-key split-knowledge — were chosen to make these future stages reachable without core architectural rewrites. The scaling path is therefore a research roadmap, not a roadmap of breaking changes.

## 8.4 Open Questions and Research Agenda

Several open questions are worth flagging for future research, beyond the specific future-work items enumerated in Chapter 7 §7.8:

**Does the architecture scale beyond Russian-L1 / Hebrew?** The current design is tested in a Russian-L1 → Hebrew context. Replication in different L1 → L2 pairings (Arabic, English, Spanish to Hebrew; or Russian to other L2s) would test the generalizability of the design's pedagogical assumptions. The architectural commitments (offline-first, schema-strict aggregation, two-key linking) are language-agnostic; the pedagogical assumptions (row-by-row text editor, niqqud-and-translit affordances, morphological lookup) are Hebrew-shaped. Distinguishing the two would inform future ports.

**What is the empirical effect of transparency UIs on participation retention?** The transparency-first design hypothesizes (but does not measure) that visible-to-participant data flows contribute to trust and to opt-in retention. This is itself a researchable question — a controlled study comparing opt-in retention rates between a transparency-UI condition and a minimal-disclosure condition would inform future research-mode architectures.

**How does pre-registration at small N change the publishability of null findings?** A meta-research question raised by this thesis: does pre-registering an underpowered correlational study at the diploma scale produce publishable contributions, or does the publication bias against null findings still dominate? Empirically tracking the citation trajectory of the OSF pre-registration over time would be informative.

**Where do l-diversity, t-closeness, or differential-privacy techniques become net beneficial?** Our k = 5 anonymity baseline is conservative for small cohorts. At what cohort size, and for what kinds of sensitive attribute distributions, do stronger formal frameworks become net-beneficial relative to their utility costs? This is an open methodological question for future privacy-preserving research-mode designers.

**Can the methodological design be ported to other educational research contexts beyond CALL?** The privacy-preserving research-mode architecture is, in principle, agnostic to the learning domain. A natural extension is to test the design in adjacent educational-research contexts: mathematics learning analytics, programming-skill acquisition, music-instrument practice. Each would adapt the engagement-taxonomy layer (the metrics specific to that domain) while preserving the architectural commitments (k-anonymity, two-key, schema-strict, withdrawal completeness, consent versioning).

## 8.5 Closing

The thesis began with the observation that ulpan students — adult Hebrew learners at small-cohort scale — sit at the intersection of three sparsely-populated research literatures: Hebrew CALL pedagogy, small-cohort educational research methodology, and privacy-preserving research architecture. The contribution offered here is a working exemplar at that intersection: the LinguistPro application as the Hebrew CALL workspace, the opt-in research-mode subsystem as the privacy-preserving architecture, and the pre-registered correlational study as the small-cohort empirical demonstration that the architecture produces interpretable output even at N ≈ 10.

The thesis does not claim that this is the only path to ethical CALL research; it claims only that this is **one defendable path**, demonstrated end-to-end, with code-anchored evidence and open materials that future researchers can fork, modify, criticize, or supersede. The contribution is open by construction. Whatever the specific empirical findings turn out to be when the cohort runs, the design will outlive them.

---

**End of Chapter 8.**

---

## Acknowledgements (placeholder)

`[TODO: fill]` Supervisor `[имя руководителя]` is acknowledged for ethics oversight and methodological guidance. The ulpan teacher(s) of the recruiting cohort are acknowledged for hosting the research within their curriculum. OSF (Open Science Framework) is acknowledged for hosting the pre-registration as a free public service. The hspell project (Har'El and Kenigsberg) is acknowledged as the source of the Hebrew morphological dictionary embedded in LinguistPro.

The participants of the research cohort are not named (per the privacy architecture); their voluntary contribution is acknowledged collectively as the empirical foundation of the secondary contribution.

---

**End of thesis main body.** A bibliography and any appendices follow.
