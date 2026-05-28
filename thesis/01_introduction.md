# Chapter 1 — Introduction

> **Status.** DRAFT COMPLETE (sequential drafting per established cadence 2026-05-22).
> **Target length.** ~5-8 pages (BRIEF §3).
> **Bilingual workflow.** EN canonical for thesis submission; RU mirror at `thesis/01_introduction.ru.md`. Sync invariant per `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Glossary.** `thesis/GLOSSARY.md`.
> **Sources.** `docs/ULPAN_RESEARCH_PLAN_v3_2.md §1 + §2`, `docs/PRE_PILOT_MATURITY_REVIEW_2026_05_21.md §1`, `README.md`, OSF pre-registration `osf.io/zdv9j`.
> **Stylistic conventions.** Academic "we"; APA 7 citations; `[TODO: cite X]` markers.
> **Last updated.** 2026-05-22.

---

## 1.1 Background and Motivation

Hebrew is among the most morphologically rich languages of contemporary instruction, with a non-trivial computational footprint (root-pattern morphology, fully-pointed vs unpointed text, right-to-left script with mixed-content bidirectional handling), and an unusually structured pedagogical tradition: the **ulpan** — an intensive, often immersive Hebrew course designed primarily for adult immigrants to Israel and for diaspora learners pursuing immigration, religious study, or professional purposes [TODO: cite source on ulpan tradition]. Adult ulpan students typically learn Hebrew at CEFR levels A2 through B2 over 6 to 12 weeks of compressed instruction.

Digital tools for Hebrew learning are widely available — commercial platforms (Duolingo, Memrise, LingQ, Drops) cover Hebrew in their broader portfolios — but their pedagogical fit for the ulpan context is inconsistent. Most are designed for the casual self-study path, not for the structured intensive course; their analytics are vendor-private and inaccessible to independent researchers; and their privacy postures default to comprehensive opt-out behavioral telemetry, a model increasingly difficult to reconcile with contemporary research-ethics norms (Helsinki Declaration §22-32; GDPR Article 6(1)(a)) [TODO: cite Helsinki, GDPR].

This thesis is shaped by three observations of the gap between ulpan students and existing digital tools. **First**, ulpan students often want to study real texts (articles, songs, conversations, literary passages) row-by-row with niqqud, transliteration, translation, and audio — a workflow that current commercial platforms support partially at best. **Second**, ulpan teachers and program coordinators lack visibility into how their students engage with whatever digital tools they happen to use, making the relationship between digital learning activity and exam outcomes invisible. **Third**, the small-cohort scale of an ulpan group (typically N ≈ 8–15 enrolled students) is statistically inhospitable to formal experimental designs at the scale common in commercial-platform research — yet this is precisely the population most in need of rigorous evidence about which study activities matter.

The project of this thesis — the LinguistPro application together with its research-mode subsystem and pre-registered correlational study — addresses all three observations within the same artifact.

## 1.2 Problem Statement and Research Gap

The literature on Computer-Assisted Language Learning (CALL) documents extensive engagement-based predictors of learning outcomes — time on task, retention curves, vocabulary growth, distributed practice [TODO: cite Hattie 2009; Ericsson; Cepeda et al.] — but those findings typically derive from either large-N commercial-platform datasets (where researchers do not control the instrument) or laboratory experiments (where the population is undergraduates rather than ulpan-style adult learners). The methodological tooling for **ethical, transparent, small-cohort educational research with a researcher-controlled instrument** is thinly populated.

Privacy-preserving research frameworks exist (k-anonymity, differential privacy, federated learning) but were designed for contexts at very different scales. k-anonymity works well at thousands; differential privacy requires noise calibrations that overwhelm signal at small N; federated learning is engineered for predictive-model training rather than exploratory descriptive analytics. CALL-specific privacy-preserving research-mode designs — opt-in research aggregation built into an open-source learning application — are, to our knowledge, sparsely populated in the literature; Chapter 2 surveys the adjacent territory.

The research gap addressed by this thesis is therefore at the intersection of three fields: (i) Hebrew CALL pedagogy, (ii) small-cohort educational research methodology, and (iii) privacy-preserving research architecture. None of the three fields individually addresses the combination; this thesis contributes a working exemplar at the intersection.

## 1.3 Research Questions and Hypotheses

The thesis is structured around two research questions, operationalized in the pre-registered analysis plan at OSF ([doi:10.17605/OSF.IO/ZDV9J](https://doi.org/10.17605/OSF.IO/ZDV9J)):

**RQ1 (empirical, exploratory).** *What digital learning activity — in particular, time spent actively engaged with Hebrew texts, the creation of spaced-repetition cards, the creation of notes, and the rate of recall error — correlates with growth in learning outcomes (the difference between pre- and post-test exam scores) in a single Hebrew ulpan cohort?*

This question is operationalized in the four pre-registered primary hypotheses (Chapter 5 §5.5.1): **H1** (active minutes ↑ → growth ↑), **H2** (cards added to SRS ↑ → growth ↑), **H3** (notes created ↑ → growth ↑), and **H4** (SRS error rate ↑ → growth ↓). The RQ is **exploratory by construction** because the natural cohort size (N ≈ 8–15) is below the conventional power threshold for medium-effect detection; the diploma's empirical claims are correspondingly modest and framed as effect-size estimates with explicit confidence intervals.

**RQ2 (methodological, design-research).** *Can a privacy-preserving opt-in research-mode for a CALL application be designed and implemented in such a way that:*
(a) the privacy guarantees hold at small cohort sizes (k-anonymity, two-key split-knowledge, complete withdrawal);
(b) the architecture is reusable by future CALL researchers via permissive open-source licensing;
(c) the implementation is auditable by direct inspection of the codebase rather than by trust in policy statements; and
(d) the design operationalizes a defensible ethical framework (Helsinki + GDPR + supervisor oversight) without claiming formal IRB pre-approval where it does not exist?

This question is answered constructively in Chapters 3–4 by the design and implementation of the LinguistPro research-mode subsystem. The answer takes the form of a working artifact (the codebase, the schema, the consent template, the OSF pre-registration) rather than a hypothesis test; the contribution is **design-research** [TODO: cite Cross 2006 designerly ways of knowing or equivalent design-research methodology], in the established sense that the design itself is the contribution and is evaluated by inspection of its components and threat-model coverage rather than by an effect-size measurement.

## 1.4 Contributions

This thesis advances **two contributions of unequal weight and unequal dependency on empirical findings**.

The **primary contribution** is the methodological design of the privacy-preserving opt-in research-mode (RQ2). The design embodies seven architectural decisions (Chapter 4 §4.3) — default-OFF opt-in, anonymous client-side UUID, schema-strict server-side aggregation, k = 5 anonymity gate, two-key split-knowledge linking, one-click withdrawal with audit log, and consent versioning with material-change decision tree — each anchored to concrete code artifacts (Chapter 4 §4.4) and tested for adherence by smoke-test enforcement. The architecture is released under permissive open-source licensing and pre-registered as an analysis-plan-locking artifact on OSF. **This contribution is independent of the empirical study's outcome.** Even if the explicitly underpowered correlation analysis returns uniformly null findings, the design remains reusable by future CALL researchers and educational-technology evaluators.

The **secondary contribution** is the empirical correlational study itself (RQ1). The study is exploratory by construction — the cohort size makes confirmatory inference of medium effects statistically infeasible — and is reported as effect-size estimates with 95% confidence intervals rather than as significance-test verdicts. The role of the empirical study is to demonstrate that the methodological architecture of the primary contribution can be deployed on a real ulpan cohort and produce interpretable output even at small N.

A **third contribution**, less central but worth noting, is the open-source release of supporting artifacts: the wire-format schema (`docs/RESEARCH_METRICS_SCHEMA.md`), the informed-consent template in two languages (RU + EN), the consent material-change decision tree, the open OSF pre-registration, and the broader LinguistPro codebase. These are positioned for reuse by other CALL researchers in their own studies.

## 1.5 Thesis Structure

The remainder of the thesis is structured as follows.

**Chapter 2 (Related Work)** situates the contribution within the existing literature: Hebrew CALL platforms, learning analytics in CALL, privacy-preserving research frameworks (k-anonymity, differential privacy, federated learning), spaced-repetition retention research, calibrated diagnostic instruments based on item response theory, and statistical methodology for small-N research.

**Chapter 3 (System Design)** describes the LinguistPro application — its architectural philosophy (offline-first, Hebrew-as-first-language, iterative refinement), its evolution across versions 3.0 through 3.7, and its domain architecture (text editor, morphology, TTS / translation, polymorphic typed-graph notes, text-card sharing, SRS layer, Smart Learning Graph). The chapter establishes the broader system within which the research-mode subsystem (Chapter 4) sits.

**Chapter 4 (Privacy-Preserving Opt-in Research-Mode)** is the primary methodological contribution. It documents the design requirements and ulpan-research constraints, the seven architectural decisions, the implementation as code-anchored artifacts, the threat model (defended and not-defended threats), the comparison with alternative privacy-preserving designs (vendor analytics, differential privacy, federated learning, open anonymized datasets, Anki-only), the ethical-framework operationalization, the reusability artifacts, and the acknowledged limitations.

**Chapter 5 (Empirical Methodology)** operationalizes the architectural commitments of Chapter 4 into a concrete research design. It documents participants (recruitment, inclusion / exclusion, sample size), instruments (the LinguistPro application, teacher CSV outcome, calibrated diagnostic quiz, self-report fallback), procedure (cohort lifecycle from provisioning through data freeze), analysis plan (four primary hypotheses, Bonferroni-corrected α = 0.0125, effect-size-with-confidence-interval inference, assumption tests, missing-data policy, sensitivity analyses), operational definitions of the constructs (active minutes, SRS metrics, growth delta, multi-device handling, timezone), the scope of generalization, ethics operationalization, and methodological limitations.

**Chapter 6 (Results)** reports the obtained findings, both confirmatory (the four pre-registered primary hypotheses with effect sizes and confidence intervals) and exploratory (descriptive cohort engagement patterns and their relationships to outcome). At the time of writing, the cohort has not been recruited; the chapter exists as a structured placeholder to be filled post-pilot.

**Chapter 7 (Discussion)** interprets the obtained results in the context of the related work of Chapter 2, addresses threats to validity, discusses the implications for CALL pedagogical practice and for privacy-preserving research design, and proposes directions for future confirmatory studies.

**Chapter 8 (Conclusion and Future Work)** synthesizes the dual contributions, summarizes what was learned (methodologically and empirically), and outlines the scaling architecture for future deployments (multi-cohort comparative studies, institutional rollouts, federated research-platform vision).

## 1.6 A Note on Ethical Framework and Pre-Registration

The thesis is conducted under a multi-source ethical framework (Helsinki Declaration §22-32, GDPR Article 6(1)(a), supervisor `[имя руководителя]` ethics oversight) detailed in Chapter 4 §4.7 and operationalized in Chapter 5 §5.8. The analysis plan was pre-registered on the Open Science Framework before any participant data was collected (DOI 10.17605/OSF.IO/ZDV9J); any deviation from the pre-registered plan in Chapter 6 will be explicitly flagged as a deviation from pre-registration with full justification. The LinguistPro codebase is released under permissive open-source licensing (MIT for code, CC-BY 4.0 for documentation), making the thesis's claims auditable in principle by direct inspection of the codebase rather than by trust in narrative summary alone.

The remainder of the thesis proceeds from Chapter 2's literature review through to Chapter 8's conclusion under these commitments.

---

**End of Chapter 1.**
