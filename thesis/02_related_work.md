# Chapter 2 — Related Work

> **Status.** DRAFT COMPLETE (Role 2 — research librarian — via sub-agent dispatch 2026-05-22; all 22 + 22 additional citations verified).
> **Target length.** ~12-18 pages (BRIEF §3); actual ~16 pages main body + ~3 pages bibliography.
> **Bilingual workflow.** EN canonical for thesis submission; RU mirror at `thesis/02_related_work.ru.md`. Sync invariant per `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Bibliography.** Consolidated at `thesis/BIBLIOGRAPHY.md` (master APA 7 list for the whole thesis).
> **Last updated.** 2026-05-22 (draft complete from Role 2 agent dispatch).

---

## 2.1 Introduction

This chapter situates the present thesis at the intersection of three research traditions: (a) computer-assisted language learning (CALL) for Hebrew as a second language, including the mobile-assisted language learning (MALL) sub-tradition that inherited the desktop-era CALL programme; (b) learning analytics (LA) — the data-driven study of learners and learning contexts that has, over the last decade, produced both a methodological literature on engagement measurement and a parallel literature on the ethical and privacy consequences of that measurement; and (c) the technical privacy-preserving research literature originating in computer science and operationalised by data-protection regulation, notably k-anonymity (Sweeney, 2002), differential privacy (Dwork & Roth, 2014), and federated learning (McMahan et al., 2017), together with the LINDDUN (Deng et al., 2011) and STRIDE (Howard & LeBlanc, 2003) threat-modeling frameworks. A fourth, narrower body of work — calibrated diagnostic measurement under item response theory (Rasch, 1960/1980; Bond & Fox, 2015) and the statistical-methodology literature on small-N research (Cohen, 1988; Cumming, 2014; Wasserstein & Lazar, 2016; Lakens, 2017) — frames the empirical design.

The chapter is not a comprehensive survey of any of these fields; each individually is the subject of its own multi-thousand-citation review literature. The objective is more modest: to identify, for each design decision defended in Chapters 3–5, the prior work that informs the decision and the gap left unfilled by that prior work. The synthesis in §2.8 names that gap explicitly: while ethical-framework literature on learning analytics has produced principled checklists (Pardo & Siemens, 2014; Slade & Prinsloo, 2013; Drachsler & Greller, 2016) and the privacy-preserving computation literature has produced rigorous mathematical guarantees (Sweeney, 2002; Dwork & Roth, 2014), neither tradition has produced a deployable open-source artefact for small-cohort diploma-scale L2 research in a single application — and that is the methodological contribution defended in Chapter 4.

## 2.2 Hebrew Computer-Assisted Language Learning

### 2.2.1 The CALL tradition and its frameworks

Computer-assisted language learning as a field was given its modern theoretical framing by Chapelle (2001), whose evaluation criteria — *language learning potential, learner fit, meaning focus, authenticity, positive impact, and practicality* — remain the canonical checklist by which CALL software is judged against second-language-acquisition (SLA) literature rather than against software-engineering criteria alone. Chapelle's framework has been adopted as the de facto evaluation lens in the subsequent two decades of CALL research, and informs the design heuristics behind the present application's pedagogy layer (bilingual cards, morphology pop-ups, calibrated quiz feedback) even though the application itself is not the subject of this thesis.

### 2.2.2 Mobile-assisted language learning (MALL)

The shift from desktop CALL to mobile-assisted language learning was characterised most clearly by Kukulska-Hulme and Shield (2008), who organised the field along a continuum from passive content-delivery applications to learner-driven collaborative-interaction applications. Stockwell (2010) provided one of the first empirical comparisons of mobile-vs-desktop vocabulary practice and demonstrated a small but consistent platform effect on completion time and accuracy — learners on small screens take longer and score marginally lower on identical tasks, an effect attributable to interface friction rather than to pedagogical fundamentals. The present application is a Progressive Web App (PWA) — neither pure mobile native nor desktop-only — and the design tension between the two regimes is visible throughout the UI literature in the project, but is not itself a research contribution.

The commercial MALL sector is dominated by Duolingo, Memrise, Drops, LingQ, and similar applications. The Duolingo research programme is particularly well-documented: Vesselinov and Grego (2012), in a vendor-funded but methodologically transparent study, estimated that approximately 34 hours of Duolingo practice produces gains equivalent to one semester of college Spanish on the WebCAPE placement test. Settles and Meeder (2016), at ACL, introduced the half-life-regression (HLR) trainable spaced-repetition model derived from 13 million Duolingo learning traces and demonstrated a 45% error-reduction over fixed-interval baselines plus a 12% lift in daily engagement in operational A/B testing. The Duolingo paper is the closest analogue in the literature to the kind of operational engagement-prediction work that becomes possible at scale once an LA pipeline exists; it is also, instructively, a study that depends on centralised raw-event data — a posture this thesis explicitly rejects in favour of opt-in transparent aggregation (Chapter 4).

### 2.2.3 Hebrew computational morphology

Hebrew presents particular challenges for CALL: the abjad script, root-pattern (*shoresh-binyan*) morphology, agglutinative clitic attachment, and the optional niqqud diacritic system all complicate naive string matching that suffices for most European languages. The de facto open-source baseline for Hebrew morphological analysis remains hspell, originally written by Har'El and Kenigsberg and released under the GNU AGPL v3 (hspell project; Har'El & Kenigsberg, 2004–present). Hspell is strictly compliant with the official niqqud-less spelling rules (*Ha-ktiv Khasar Ha-niqqud*, colloquially *Ktiv Male*) and provides both spell-checking and a morphological analysis engine over an inflected lexicon of roughly half a million surface forms. HebMorph (Syn-Hershko, 2010–2015), released under the same licence, wraps hspell with a Lucene/Solr-compatible analyzer suitable for information-retrieval applications. More recently, the YAP parser from the Open University Israel ONLP Lab (Tsarfaty and colleagues; see also More et al., 2019) has provided a research-grade morpho-syntactic parser, although the lexical coverage rests ultimately on the BGU Lexicon and on hspell. The present application uses a locally-precomputed dictionary derived from hspell, shipped via service-worker cache; this decision is treated as engineering, not research, but the choice is constrained by the literature reviewed here.

## 2.3 Learning Analytics and Its Ethics

### 2.3.1 LA as a discipline

Siemens (2013) provided the canonical framing of learning analytics as an emerging discipline, distinguishing it from earlier educational-data-mining work by its tighter coupling to instructional design and its commitment to closed-loop intervention. The engagement-taxonomy literature that grew from this framing — across SoLAR conference proceedings and the *Journal of Learning Analytics* — converged on a six-to-eight-layer hierarchy of metrics: time-on-task, item-level interactions, content navigation, social-graph signals, self-regulation indicators, and persistence/retention measures. The taxonomy adopted in the present thesis's `RESEARCH_METRICS_SCHEMA.md` (Chapter 5 §5.3) is a six-layer simplification of this canonical structure, scoped to what is privacy-safe to collect from an opt-in single-cohort study at diploma scale.

### 2.3.2 The empirical case for engagement measures

The empirical justification for engagement metrics as predictors of learning outcome rests on a multi-decade literature in educational psychology. Hattie's (2009) synthesis of over 800 meta-analyses placed time-on-task and deliberate practice among the most consistent moderate-to-large effects in school-aged-learner literature, with effect sizes (Cohen's *d*) reliably above 0.4 — the threshold above which Hattie argues an effect "is worth attending to." Ericsson and Pool's (2016) *Peak*, the trade-press synthesis of Ericsson's deliberate-practice research programme, provides the popular framing of the *purposeful-practice* construct that motivates active engagement signals (cards-added, notes-created) over raw exposure-time signals in the thesis's hypothesis structure (§5.5.1). Mueller and Oppenheimer's (2014) widely cited *Psychological Science* paper on note-taking — longhand outperforms laptop on conceptual-test items because longhand forces in-the-moment summarisation — provides the cited rationale for treating `total_notes_created` (H3) as an effortful-elaboration signal distinct from raw time-on-task (H1). The thesis does not propose to replicate these effects; it inherits their plausibility as the prior literature against which directional one-tailed predictions are pre-registered.

### 2.3.3 Self-report validity caveats

A persistent threat to studies in this regime is the use of self-reported outcome data. Kuncel, Credé, and Thomas's (2005) meta-analysis in *Review of Educational Research* found that self-reported grade-point averages and standardised-test scores show very high correlations with verified records on average (*r* ≈ 0.84 across N = 60,926), but with strong moderating effects: self-report validity is materially lower among lower-performing students and lower-cognitive-ability subgroups. The thesis's outcome layer (Chapter 5 §5.3) accommodates this by preferring teacher-CSV records over self-report wherever available, with self-report as a fallback explicitly flagged in the analysis plan.

### 2.3.4 Observer effects (the "Hawthorne" cost of transparency)

The act of measurement, even with full participant consent, alters the behaviour being measured. Adair's (1984) *Journal of Applied Psychology* re-examination of the Hawthorne studies established the term as a methodological-artefact category rather than a substantive psychological phenomenon, but the underlying observation — that participant knowledge of being observed shifts behaviour — remains intact. In opt-in transparent research-mode applications such as the present one, where the transparency UI of §4.4.4 makes every uploaded byte visible to the participant, Hawthorne effects are not a bug but a structural feature of the design. Chapter 5 §5.6 documents this acceptance explicitly.

### 2.3.5 The LA-ethics literature

A distinct literature, largely overlapping in personnel with the LA-methodology literature, addresses ethics. Slade and Prinsloo (2013), in *American Behavioral Scientist*, gave the first systematic treatment of the ethical-issues map for learning analytics: location and interpretation of data; informed consent, privacy, and de-identification; classification and management of data; and the asymmetry between institution and learner in the analytics relationship. Pardo and Siemens (2014), in *British Journal of Educational Technology*, distilled a set of operational principles — transparency, learner agency over their own data, accountability for processing, and assessment of risk vs. benefit — that map closely onto subsequent regulatory frames (GDPR Articles 5, 6, and 17). Drachsler and Greller (2016), at LAK '16, operationalised these principles into an eight-point DELICATE checklist (Determination, Explain, Legitimate, Involve, Consent, Anonymise, Technical, External) intended for use by practitioners deploying LA in higher-education settings. The thesis's privacy architecture (Chapter 4) is in conscious dialogue with the DELICATE checklist: §4.4.1 (schema-strict server validator) operationalises *Anonymise* and *Technical*; §4.4.4 (transparency UI) operationalises *Explain*; the consent template (§4.4.5; `RESEARCH_ETHICS_CONSENT_TEMPLATE.md`) operationalises *Consent* and *Legitimate*. The methodological contribution defended in Chapter 4 may be read as one possible deployable implementation of the DELICATE programme at single-cohort diploma scale.

## 2.4 Spaced Repetition and Retention Research

The application's pedagogy includes an SRS (spaced repetition system) Trainer; the operational metric `total_cards_added_to_srs` is one of the four pre-registered primary predictors (H2, §5.5.1). The relevant prior literature falls in three layers.

### 2.4.1 Foundational forgetting-curve and spacing effects

Ebbinghaus (1885/1913) inaugurated the experimental study of memory with self-experimentation on nonsense syllables, producing the canonical forgetting curve — approximately exponential retention decay over hours-to-days — and identifying the spacing effect as the systematic retention advantage of distributed practice over massed practice. Cepeda, Pashler, Vul, Wixted, and Rohrer (2006), in *Psychological Bulletin*, conducted the definitive meta-analytic synthesis of distributed-practice effects on verbal recall (839 effect-size estimates across 184 articles) and established the joint dependence of optimal inter-study interval (ISI) on the to-be-tested retention interval — longer retention intervals require longer optimal ISI. Roediger and Karpicke (2006), in *Psychological Science*, established the testing-effect / retrieval-practice literature: retrieval is a more potent retention modifier than re-exposure on delayed tests, even when total time is held constant.

### 2.4.2 Algorithmic spaced-repetition systems

Wozniak's (1990) Adam Mickiewicz University master's thesis ("Optimization of Learning") introduced the SM-2 algorithm — the easiness-factor + interval-multiplier scheduler that became the open-source SRS baseline shipped in Anki and many derivative applications. SM-2 dominated open-source SRS implementations for three decades. More recently, the FSRS (Free Spaced Repetition Scheduler) algorithm developed by Jarrett Ye and the open-spaced-repetition collective, which replaced SM-2 as Anki's default in version 23.10, applies a DSR (difficulty-stability-retrievability) model trained on user-review traces and reportedly reduces review burden by 20–30% for the same retention target. Settles and Meeder's (2016) half-life-regression model, introduced in §2.2.2, represents an alternative trainable-SRS branch that fits a half-life predictor directly on operational data; the model is open-source and was deployed at Duolingo scale. The present thesis treats the SRS Trainer as a functional stub providing engagement signals only — full FSRS integration is deferred to v3.4 — and so the SRS algorithmic literature is reviewed here as context, not as something extended.

## 2.5 Privacy-Preserving Research Frameworks

This section reviews the literature against which the privacy contribution of Chapter 4 (§4.6 comparison-with-alternatives table) is positioned.

### 2.5.1 k-anonymity, l-diversity, t-closeness

Sweeney (2002), in *International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems*, introduced the k-anonymity model for privacy-preserving data release: a release satisfies k-anonymity if every record is indistinguishable from at least *k* − 1 other records with respect to the quasi-identifier attributes that could be linked to external data. Sweeney's earlier work (Sweeney, 1997, on William Weld's medical records) demonstrated empirically that small combinations of quasi-identifiers (ZIP + birth date + sex) uniquely identify the majority of the US population, motivating the formal anonymity threshold. The k = 5 default adopted in Chapter 4 §4.3.4 of the present thesis follows the canonical formulation directly.

Machanavajjhala, Kifer, Gehrke, and Venkitasubramaniam (2007), in *ACM Transactions on Knowledge Discovery from Data*, introduced l-diversity to address attribute-disclosure attacks that k-anonymity alone does not prevent: even when k records share quasi-identifier values, if all share the sensitive attribute value, sensitive disclosure occurs. Li, Li, and Venkatasubramanian (2007), at ICDE, introduced t-closeness as a further refinement requiring the distribution of sensitive attributes within each equivalence class to be close (within *t*) to the overall distribution.

The thesis acknowledges (Chapter 4 §4.5 T-not-4) that the deployed architecture implements k-anonymity but does not implement l-diversity or t-closeness — a documented gap that is scope-bounded by the small-N research regime and the absence of high-cardinality sensitive attributes in the metrics schema.

### 2.5.2 Differential privacy

Dwork and Roth's (2014) monograph *The Algorithmic Foundations of Differential Privacy* (in *Foundations and Trends in Theoretical Computer Science*, vol. 9, pp. 211–407) consolidates a decade of theoretical work (originating in Dwork, 2006) on the formal-mathematical privacy guarantee — a randomised algorithm *M* is ε-differentially private if the presence or absence of any single record changes the output distribution by at most a factor of exp(ε). Differential privacy provides the strongest known formal guarantee in this space and is the modern gold standard for large-scale data release (US Census 2020, Apple, Google).

The thesis (Chapter 4 §4.6) rejects formal differential privacy at the deployment layer not on theoretical grounds — DP is theoretically superior — but on operational grounds: at N ≈ 10–20 (the linked subsample size), the noise required to achieve a meaningful ε destroys the signal that is the entire purpose of the dataset. DP is the right answer at population scale; it is not the right answer at single-ulpan-cohort diploma scale. This argument is consistent with the broader critique that DP is parameter-sensitive and that the choice of ε is itself a policy decision rather than a mathematical one.

### 2.5.3 Federated learning and its limits

McMahan, Moore, Ramage, Hampson, and Agüera y Arcas (2017), in *Proceedings of AISTATS*, introduced federated learning (FedAvg) — training a global model from local gradient updates rather than centralised data — and established it as a practical alternative to centralised ML at consumer scale (Google Keyboard, Apple Siri). Federated learning is widely positioned as a privacy-preserving training paradigm. However, Geiping, Bauermeister, Dröge, and Moeller (2020), at NeurIPS, demonstrated that gradient updates leak — sometimes catastrophically — by reconstructing input images from publicly transmitted gradients in standard FL settings. Their result establishes that gradient transmission alone is not a privacy guarantee and that any production FL deployment must compose FL with secure aggregation, differential privacy, or both.

The thesis (Chapter 4 §4.6) treats federated learning as architecturally overkill for the described research regime: FL excels at training predictive models across many devices; it does not produce the kind of descriptive engagement statistics required by a single-cohort correlational study. The architecture chosen — daily aggregate upload of a fixed schema after schema-strict validation, with k-anonymity gating at the access boundary — is functionally simpler and operationally sufficient.

### 2.5.4 Re-identification empirics

Narayanan and Shmatikov (2008), in the IEEE Symposium on Security and Privacy, established the de-anonymisation literature with the Netflix Prize attack: an "anonymised" dataset of 500K subscribers' movie ratings was successfully linked to public IMDb profiles, recovering individual identities and apparent political preferences. This is the canonical empirical demonstration that release-time anonymisation without formal guarantees is brittle against linkage attacks with external auxiliary data — the threat model that motivates the access-time k-anonymity gate of Chapter 4 §4.3.4.

### 2.5.5 STRIDE and LINDDUN threat-modeling frameworks

Howard and LeBlanc (2003), *Writing Secure Code* (2nd ed., Microsoft Press), formalised the STRIDE taxonomy (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege) for security threat modeling — six categories systematically applied to data-flow-diagram elements to surface candidate threats. STRIDE was Microsoft's internal methodology before public release and remains the most widely cited security-threat taxonomy in industry practice.

Deng, Wuyts, Scandariato, Preneel, and Joosen (2011), in *Requirements Engineering*, introduced LINDDUN (Linkability, Identifiability, Non-repudiation, Detectability, Information disclosure, Content Unawareness, Non-compliance) as the privacy analogue — explicitly modeled on STRIDE but reorienting from confidentiality threats to privacy threats. The LINDDUN methodology applies the seven categories systematically to data-flow-diagram elements following a defined elicitation procedure.

The thesis (Chapter 4 §4.5) does not apply either STRIDE or LINDDUN formally — the architecture was designed from privacy-by-design intuitions and the GDPR/Helsinki ethical primitives — but documents (§4.5) that the implemented controls cover most of STRIDE's *Spoofing*, *Tampering*, *Information disclosure*, and *Repudiation* categories and most of LINDDUN's *Linkability*, *Identifiability*, and *Information disclosure* categories. Documented gaps (STRIDE *Denial of service*; LINDDUN *Detectability* via traffic analysis) are scope-acknowledged limitations.

## 2.6 Calibrated Diagnostic Instruments

The thesis's tertiary outcome (Chapter 5 §5.3.3) is a 20-item one-parameter logistic (1PL) Rasch diagnostic — the `ulpan_diagnostic_v1` instrument — scored to produce a learner-ability estimate (theta) with standard error and a CEFR band assignment.

### 2.6.1 The Rasch model

Rasch (1960/1980), in *Probabilistic Models for Some Intelligence and Attainment Tests* (originally published by the Danish Institute for Educational Research, Copenhagen; reprinted by University of Chicago Press, 1980), introduced the one-parameter logistic measurement model that bears his name: the probability of a correct response on item *i* by person *n* depends only on the difference between person ability θ_n and item difficulty β_i, with no item-discrimination or guessing parameter. The Rasch model occupies a distinctive position in psychometrics: it is mathematically the simplest item-response-theory (IRT) model, and proponents argue it is the only IRT model that satisfies the *specific objectivity* property — person comparisons should not depend on which items are used, and item comparisons should not depend on which persons are used.

### 2.6.2 Applied Rasch measurement

Bond and Fox (2007/2015), *Applying the Rasch Model: Fundamental Measurement in the Human Sciences* (2nd ed., Lawrence Erlbaum; 3rd ed., 2015, Routledge), is the standard applied-Rasch textbook covering the operational toolkit (Winsteps, Facets, R package eRm), the diagnostic indicators (infit/outfit MSQ, point-measure correlations, Wright maps), and the standard reporting conventions adopted in the calibrated-quiz literature. The thesis uses Bond and Fox as the methodological reference for the calibration procedure of `ulpan_diagnostic_v1` (Chapter 5 §5.3.3).

### 2.6.3 The CEFR framework

The Common European Framework of Reference for Languages (Council of Europe, 2001, 2020) defines six reference levels (A1, A2, B1, B2, C1, C2 — extended in the 2020 Companion Volume with Pre-A1) along an action-oriented can-do-statement axis. CEFR has become the de facto vocabulary for second-language proficiency in European and Israeli contexts; the present thesis adopts CEFR as the band system reported alongside the Rasch theta estimate. The mapping from theta to CEFR band in `ulpan_diagnostic_v1` rests on expert-judgement difficulty parameters at the time of writing — external ulpan-teacher review is acknowledged in §5.6 as pending. Consequently the calibrated quiz is treated in the thesis as a tertiary, secondary-strength outcome — not a primary one.

## 2.7 Statistical Methodology for Small-N Research

The empirical study described in Chapter 5 operates at the structural lower bound of single-cohort diploma-scale research — N ≈ 10–20 in the linked subsample. This regime requires methodological care beyond what undergraduate statistics textbooks typically address.

### 2.7.1 Power analysis

Cohen (1988), *Statistical Power Analysis for the Behavioral Sciences* (2nd ed., Lawrence Erlbaum), is the canonical power-analysis reference. Cohen's tables and effect-size conventions (r = 0.1 / 0.3 / 0.5 for small/medium/large correlation; *d* = 0.2 / 0.5 / 0.8 for small/medium/large standardised mean difference) remain the default. Chapter 5 §5.5.6 reports the Cohen-derived sample-size requirements at Bonferroni-corrected α = 0.0125: N = 28 to detect r = 0.5 at 80% power; N = 14 to detect r = 0.7; at the expected N ≈ 10 the study has 80% power only for r ≥ 0.78. This underpower is treated as a structural constraint, not a deficiency.

### 2.7.2 The p-value crisis and estimation framing

Wasserstein and Lazar (2016), in *The American Statistician*, issued the American Statistical Association's official statement on p-values, articulating six principles against the bright-line use of *p* < 0.05 and in favour of effect-size reporting with uncertainty intervals. Cumming (2014), in *Psychological Science* ("The new statistics: Why and how"), is the leading articulation of the estimation-with-confidence-intervals paradigm as a replacement for null-hypothesis significance testing: report *r* with its 95% CI as the primary inferential statistic; the *p*-value is at most secondary. Chapter 5 §5.5.3 implements Cumming's recommendation directly — the 95% CI on *r*, not the *p*-value, is the primary inferential statistic.

### 2.7.3 Equivalence testing

Lakens (2017), in *Social Psychological and Personality Science*, introduced the equivalence-testing framework (TOST — two one-sided tests) to applied behavioural-science audiences as a practical procedure for testing whether an effect is *too small to matter*, complementary to the standard NHST procedure for testing whether an effect is *too large to be chance*. The thesis acknowledges (Chapter 5; OSF preregistration §H1–H4) that equivalence-test framing would be ideal for null findings but is itself underpowered at N ≈ 10; the framing-of-record is therefore "absence of evidence is not evidence of absence" (Wasserstein & Lazar, 2016, principle 5).

### 2.7.4 Multiple-comparisons control

Bonferroni correction is applied to the four pre-registered primary hypotheses (α = 0.05 / 4 = 0.0125 per test). Benjamini and Hochberg (1995), in *Journal of the Royal Statistical Society Series B*, introduced false-discovery-rate (FDR) control as a more powerful alternative for high-dimensional screening. The thesis (Chapter 5 §5.5.4) explicitly chooses Bonferroni over FDR on the grounds that the regime is confirmatory (four pre-registered tests with directional priors), not exploratory; FDR is appropriate when the number of tests is in the dozens-to-thousands range. The ≈20 exploratory metrics are not significance-tested at all — they are reported as descriptive effect-size estimates with CIs.

### 2.7.5 Replication and pre-registration culture

The broader meta-science context of the present thesis is the post-Ioannidis (2005) and post-replication-crisis recognition (Open Science Collaboration, 2015; Munafò et al., 2017) that pre-registration of analysis plans is a low-cost, high-value intervention against HARKing (Hypothesising After Results are Known) and p-hacking. The thesis's OSF preregistration (DOI 10.17605/OSF.IO/ZDV9J) is the operational implementation of this stance: every primary-hypothesis test, inclusion criterion, exclusion rule, and missing-data policy is locked before any data are seen.

## 2.8 Synthesis: The Gap This Thesis Addresses

The literature reviewed above provides, separately, all the conceptual ingredients required for a privacy-preserving research-mode for a CALL/MALL application at diploma scale:

- **From CALL/MALL (§2.2):** an evaluation vocabulary (Chapelle, 2001), an empirical literature on engagement-as-predictor (Hattie, 2009; Mueller & Oppenheimer, 2014), an industrial proof that this works at scale (Settles & Meeder, 2016; Vesselinov & Grego, 2012), and a Hebrew-language morphological infrastructure (hspell; HebMorph; YAP).
- **From LA ethics (§2.3.5):** principle catalogues (Slade & Prinsloo, 2013; Pardo & Siemens, 2014) and operational checklists (Drachsler & Greller, 2016) for deploying analytics ethically.
- **From technical privacy (§2.5):** formal anonymity (Sweeney, 2002; Machanavajjhala et al., 2007; Li et al., 2007), formal mathematical privacy (Dwork & Roth, 2014), and architectural alternatives (McMahan et al., 2017; Geiping et al., 2020).
- **From psychometrics (§2.6):** a calibrated diagnostic framework (Rasch, 1960/1980; Bond & Fox, 2015) and a reporting framework (CEFR, Council of Europe, 2020).
- **From statistical methodology (§2.7):** a power-analytic framework (Cohen, 1988), an estimation paradigm (Cumming, 2014), and an inference-discipline framework (Wasserstein & Lazar, 2016; Lakens, 2017).

What is *missing* — and what this thesis contributes — is a working, open-source, deployable artefact that integrates all of these layers in a single CALL application, with k-anonymity gating, schema-strict server validation, cascading-delete-on-withdrawal, opt-in transparent UI, and OSF-pre-registered correlational analysis, scoped to single-cohort diploma research. Existing systems are either too heavy (formal differential privacy at N ≈ 10), too narrow (Anki-only, no analytics layer), or too closed (commercial MALL applications with centralised opaque event logs). The methodological contribution defended in Chapter 4 fills this gap; the empirical study described in Chapter 5 demonstrates that the architecture can be deployed and produces interpretable output at the lower bound of viable sample size. Neither contribution requires the other to be valuable.

---

**End of Chapter 2.** Full APA 7 bibliography for the entire thesis is consolidated in `thesis/BIBLIOGRAPHY.md`.
