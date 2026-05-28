# Глава 2 — Related Work

> **Статус.** ЧЕРНОВИК ЗАВЕРШЁН (Role 2 — research librarian — через sub-agent dispatch 2026-05-22; все 22 + 22 дополнительных citations verified).
> **Целевая длина.** ~12-18 страниц (BRIEF §3); фактически ~16 страниц основного текста + ~3 страницы bibliography.
> **Bilingual workflow.** RU mirror EN-канонического `thesis/02_related_work.md`. Sync invariant по `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Bibliography.** Consolidated в `thesis/BIBLIOGRAPHY.md` (master APA 7 list для всего диплома).
> **Последнее обновление.** 2026-05-22 (черновик завершён из Role 2 agent dispatch).

---

## 2.1 Введение

Эта глава situates настоящий диплом на пересечении трёх research traditions: (a) computer-assisted language learning (CALL) для иврита как второго языка, включая mobile-assisted language learning (MALL) sub-tradition, которая inherited desktop-era CALL programme; (b) learning analytics (LA) — data-driven изучение учащихся и учебных контекстов, которое за последнее десятилетие produced и methodological литературу об engagement measurement, и parallel литературу об ethical и privacy consequences этого measurement; и (c) technical privacy-preserving research литература, originating в computer science и operationalised data-protection regulation, notably k-anonymity (Sweeney, 2002), differential privacy (Dwork & Roth, 2014) и federated learning (McMahan et al., 2017), вместе с LINDDUN (Deng et al., 2011) и STRIDE (Howard & LeBlanc, 2003) threat-modeling frameworks. Четвёртое, narrower body работ — calibrated diagnostic measurement под item response theory (Rasch, 1960/1980; Bond & Fox, 2015) и statistical-methodology литература по small-N research (Cohen, 1988; Cumming, 2014; Wasserstein & Lazar, 2016; Lakens, 2017) — frames эмпирический design.

Глава — не comprehensive survey ни одного из этих полей; каждое individually — subject своей собственной multi-thousand-citation review литературы. Цель более modest: identify, для каждого design decision, defended в Главах 3–5, prior work, который informs decision, и gap, оставленный unfilled этим prior work. Synthesis в §2.8 names этот gap явно: while ethical-framework литература на learning analytics produced principled checklists (Pardo & Siemens, 2014; Slade & Prinsloo, 2013; Drachsler & Greller, 2016), и privacy-preserving computation литература produced rigorous mathematical guarantees (Sweeney, 2002; Dwork & Roth, 2014), neither tradition produced deployable open-source артефакт для small-cohort diploma-scale L2 research в одном приложении — и это методологический вклад, защищаемый в Главе 4.

## 2.2 Hebrew Computer-Assisted Language Learning

### 2.2.1 CALL tradition и её frameworks

Computer-assisted language learning как поле получил его modern theoretical framing от Chapelle (2001), чьи evaluation criteria — *language learning potential, learner fit, meaning focus, authenticity, positive impact, and practicality* — остаются canonical checklist'ом, by which CALL-software judged против second-language-acquisition (SLA) литературы, а не против software-engineering critera alone. Framework Chapelle adopted как de facto evaluation lens в последующие два десятилетия CALL research и informs design heuristics за pedagogy layer настоящего приложения (bilingual cards, morphology pop-ups, calibrated quiz feedback), даже хотя само приложение — не subject этого диплома.

### 2.2.2 Mobile-assisted language learning (MALL)

Сдвиг от desktop CALL к mobile-assisted language learning был characterised наиболее clearly Kukulska-Hulme и Shield (2008), которые organised поле along continuum от passive content-delivery applications к learner-driven collaborative-interaction applications. Stockwell (2010) provided одно из первых empirical comparisons mobile-vs-desktop vocabulary practice и demonstrated small but consistent platform effect на completion time и accuracy — learners на small screens take longer и score marginally lower на identical tasks, эффект attributable к interface friction, а не к pedagogical fundamentals. Настоящее приложение — Progressive Web App (PWA) — ни pure mobile native, ни desktop-only — и design tension между двумя regimes visible throughout UI литературы проекта, но не сам по себе research contribution.

Commercial MALL sector dominated Duolingo, Memrise, Drops, LingQ, и similar applications. Duolingo research programme particularly well-documented: Vesselinov и Grego (2012), в vendor-funded but methodologically transparent study, estimated, что приблизительно 34 часа Duolingo practice produces gains, equivalent к одному semester'у college Spanish на WebCAPE placement test. Settles и Meeder (2016), на ACL, introduced half-life-regression (HLR) trainable spaced-repetition model, derived из 13 миллионов Duolingo learning traces, и demonstrated 45% error-reduction over fixed-interval baselines plus 12% lift в daily engagement в operational A/B testing. Duolingo paper — closest analogue в литературе к kind of operational engagement-prediction work, который становится possible at scale once LA pipeline exists; он также, instructively, study, которая depends на centralised raw-event data — posture, который этот диплом explicitly rejects в favour of opt-in transparent aggregation (Глава 4).

### 2.2.3 Hebrew computational морфология

Иврит presents particular challenges для CALL: abjad script, root-pattern (*shoresh-binyan*) морфология, agglutinative clitic attachment, и optional niqqud diacritic system — все complicate naive string matching, что sufficies для большинства European languages. De facto open-source baseline для Hebrew morphological analysis remains hspell, originally written Har'El и Kenigsberg и released под GNU AGPL v3 (hspell project; Har'El & Kenigsberg, 2004–present). Hspell strictly compliant с official niqqud-less spelling rules (*Ha-ktiv Khasar Ha-niqqud*, colloquially *Ktiv Male*) и provides и spell-checking, и morphological analysis engine over inflected lexicon roughly half a million surface forms. HebMorph (Syn-Hershko, 2010–2015), released под той же licence, wraps hspell с Lucene/Solr-compatible analyzer, suitable для information-retrieval applications. More recently, YAP parser из Open University Israel ONLP Lab (Tsarfaty и коллеги; см. также More et al., 2019) provided research-grade morpho-syntactic parser, although lexical coverage rests ultimately на BGU Lexicon и на hspell. Настоящее приложение использует locally-precomputed dictionary, derived из hspell, shipped через service-worker cache; это решение treated как engineering, а не research, но choice constrained reviewed здесь литературой.

## 2.3 Learning Analytics и его ethics

### 2.3.1 LA как дисциплина

Siemens (2013) provided canonical framing learning analytics как emerging discipline, distinguishing её от earlier educational-data-mining work через её tighter coupling к instructional design и её commitment к closed-loop intervention. Engagement-taxonomy литература, grew от этого framing — across SoLAR conference proceedings и *Journal of Learning Analytics* — converged на six-to-eight-layer hierarchy метрик: time-on-task, item-level interactions, content navigation, social-graph signals, self-regulation indicators, и persistence/retention measures. Таксономия, adopted в `RESEARCH_METRICS_SCHEMA.md` настоящего диплома (Глава 5 §5.3), — six-layer simplification этой canonical structure, scoped к тому, что privacy-safe для сбора из opt-in single-cohort study на diploma scale.

### 2.3.2 Empirical case для engagement measures

Empirical justification для engagement metrics как predictors учебного outcome rests на multi-decade литературе в educational psychology. Synthesis Hattie (2009) over 800 meta-analyses placed time-on-task и deliberate practice среди наиболее consistent moderate-to-large effects в school-aged-learner литературе, с effect sizes (Cohen's *d*) reliably above 0.4 — порог, выше которого Hattie argues, что effect «is worth attending to». *Peak* Ericsson и Pool (2016), trade-press synthesis Ericsson's deliberate-practice research programme, provides popular framing *purposeful-practice* construct, который motivates active engagement signals (cards-added, notes-created) over raw exposure-time signals в hypothesis structure диплома (§5.5.1). Widely cited *Psychological Science* paper Mueller и Oppenheimer (2014) на note-taking — longhand outperforms laptop на conceptual-test items because longhand forces in-the-moment summarisation — provides cited rationale для treating `total_notes_created` (H3) как effortful-elaboration signal, distinct от raw time-on-task (H1). Диплом does not propose реплицировать эти effects; он inherits их plausibility как prior литература, против которой directional one-tailed predictions pre-registered.

### 2.3.3 Caveats self-report validity

Persistent threat для studies в этом regime — использование self-reported outcome data. Meta-analysis Kuncel, Credé, и Thomas (2005) в *Review of Educational Research* found, что self-reported grade-point averages и standardised-test scores show very high correlations с verified records on average (*r* ≈ 0.84 across N = 60,926), but с strong moderating effects: self-report validity materially lower среди lower-performing students и lower-cognitive-ability subgroups. Outcome layer диплома (Глава 5 §5.3) accommodates это, preferring teacher-CSV records over self-report wherever available, с self-report как fallback, explicitly flagged в analysis plan.

### 2.3.4 Observer effects (Hawthorne cost of transparency)

Сам act of measurement, even с full participant consent, alters поведение being measured. Re-examination Adair (1984) в *Journal of Applied Psychology* Hawthorne studies established term как methodological-artefact category, а не substantive psychological phenomenon, но underlying observation — что participant knowledge of being observed shifts поведение — remains intact. В opt-in transparent research-mode applications такого как present, где transparency UI §4.4.4 делает каждый uploaded byte visible участнику, Hawthorne effects — не bug, но structural feature дизайна. Глава 5 §5.6 documents это acceptance explicitly.

### 2.3.5 LA-ethics литература

Distinct литература, largely overlapping в personnel с LA-methodology литературой, addresses ethics. Slade и Prinsloo (2013), в *American Behavioral Scientist*, gave first systematic treatment ethical-issues map для learning analytics: location и interpretation of data; informed consent, privacy, и de-identification; classification и management of data; и asymmetry между institution и learner в analytics relationship. Pardo и Siemens (2014), в *British Journal of Educational Technology*, distilled set операционных принципов — transparency, learner agency над их собственными данными, accountability for processing, и assessment of risk vs. benefit — которые map closely onto subsequent regulatory frames (GDPR Articles 5, 6, и 17). Drachsler и Greller (2016), на LAK '16, operationalised эти principles в eight-point DELICATE checklist (Determination, Explain, Legitimate, Involve, Consent, Anonymise, Technical, External), intended для использования practitioners, deploying LA в higher-education settings. Privacy архитектура диплома (Глава 4) — в conscious dialogue с DELICATE checklist: §4.4.1 (schema-strict server validator) operationalises *Anonymise* и *Technical*; §4.4.4 (transparency UI) operationalises *Explain*; consent template (§4.4.5; `RESEARCH_ETHICS_CONSENT_TEMPLATE.md`) operationalises *Consent* и *Legitimate*. Методологический вклад, защищаемый в Главе 4, может read'аться как one possible deployable implementation DELICATE programme на single-cohort diploma scale.

## 2.4 Spaced repetition и retention research

Pedagogy приложения включает SRS (spaced repetition system) Trainer; operational метрика `total_cards_added_to_srs` — один из четырёх pre-registered primary predictors (H2, §5.5.1). Relevant prior литература falls в трёх layers.

### 2.4.1 Foundational forgetting-curve и spacing effects

Ebbinghaus (1885/1913) inaugurated experimental study of memory с self-experimentation на nonsense syllables, producing canonical forgetting curve — approximately exponential retention decay over hours-to-days — и identifying spacing effect как systematic retention advantage distributed practice over massed practice. Cepeda, Pashler, Vul, Wixted, и Rohrer (2006), в *Psychological Bulletin*, conducted definitive meta-analytic synthesis distributed-practice effects на verbal recall (839 effect-size estimates across 184 articles) и established joint dependence optimal inter-study interval (ISI) на to-be-tested retention interval — longer retention intervals require longer optimal ISI. Roediger и Karpicke (2006), в *Psychological Science*, established testing-effect / retrieval-practice литературу: retrieval — more potent retention modifier than re-exposure on delayed tests, even when total time held constant.

### 2.4.2 Algorithmic spaced-repetition systems

Master's thesis Wozniak (1990) Adam Mickiewicz University («Optimization of Learning») introduced SM-2 algorithm — easiness-factor + interval-multiplier scheduler, который стал open-source SRS baseline, shipped в Anki и many derivative applications. SM-2 dominated open-source SRS implementations для трёх десятилетий. More recently, FSRS (Free Spaced Repetition Scheduler) algorithm, developed Jarrett Ye и open-spaced-repetition collective, который replaced SM-2 как Anki's default в version 23.10, applies DSR (difficulty-stability-retrievability) model, trained на user-review traces, и reportedly reduces review burden на 20–30% для same retention target. Half-life-regression model Settles и Meeder (2016), introduced в §2.2.2, represents alternative trainable-SRS branch, который fits half-life predictor directly on operational data; model — open-source и был deployed на Duolingo scale. Настоящий диплом treats SRS Trainer как functional stub, providing engagement signals only — full FSRS integration deferred к v3.4 — и поэтому SRS algorithmic литература reviewed здесь как context, а не как что-то extended.

## 2.5 Privacy-preserving research frameworks

Эта секция reviews литературу, against which privacy contribution Главы 4 (§4.6 comparison-with-alternatives table) is positioned.

### 2.5.1 k-anonymity, l-diversity, t-closeness

Sweeney (2002), в *International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems*, introduced k-anonymity model для privacy-preserving data release: release satisfies k-anonymity если каждая запись indistinguishable от как минимум *k* − 1 других записей с respect к quasi-identifier attributes, которые could be linked к external data. Earlier work Sweeney (Sweeney, 1997, on William Weld's medical records) demonstrated empirically, что small combinations квази-идентификаторов (ZIP + birth date + sex) uniquely identify majority of US population, motivating formal anonymity threshold. Default k = 5, adopted в Главе 4 §4.3.4 present диплома, follows canonical formulation directly.

Machanavajjhala, Kifer, Gehrke, и Venkitasubramaniam (2007), в *ACM Transactions on Knowledge Discovery from Data*, introduced l-diversity для addressing attribute-disclosure attacks, которые k-anonymity alone does not prevent: даже когда k records share quasi-identifier values, если все share sensitive attribute value, sensitive disclosure occurs. Li, Li, и Venkatasubramanian (2007), на ICDE, introduced t-closeness как further refinement, requiring distribution sensitive attributes within каждого equivalence class быть close (within *t*) к overall distribution.

Диплом acknowledges (Глава 4 §4.5 T-not-4), что deployed архитектура implements k-anonymity, но does not implement l-diversity или t-closeness — documented gap, который scope-bounded small-N research regime и absence of high-cardinality sensitive attributes в metrics schema.

### 2.5.2 Differential privacy

Monograph Dwork и Roth (2014) *The Algorithmic Foundations of Differential Privacy* (в *Foundations and Trends in Theoretical Computer Science*, vol. 9, pp. 211–407) consolidates decade theoretical work (originating в Dwork, 2006) на formal-mathematical privacy guarantee — randomised algorithm *M* — ε-differentially private, если presence или absence любой single record changes output distribution at most factor exp(ε). Differential privacy provides strongest known formal guarantee в этом space и modern gold standard для large-scale data release (US Census 2020, Apple, Google).

Диплом (Глава 4 §4.6) rejects formal differential privacy at deployment layer не на theoretical grounds — DP theoretically superior — но на operational grounds: при N ≈ 10–20 (linked subsample size), noise required для achieving meaningful ε destroys signal, который — entire purpose dataset'а. DP — right answer at population scale; не right answer at single-ulpan-cohort diploma scale. Этот аргумент consistent с broader critique, что DP parameter-sensitive и что choice of ε сам по себе policy decision, а не mathematical one.

### 2.5.3 Federated learning и его limits

McMahan, Moore, Ramage, Hampson, и Agüera y Arcas (2017), в *Proceedings of AISTATS*, introduced federated learning (FedAvg) — training global model из local gradient updates, а не centralised data — и established его как practical alternative centralised ML at consumer scale (Google Keyboard, Apple Siri). Federated learning widely positioned как privacy-preserving training paradigm. However, Geiping, Bauermeister, Dröge, и Moeller (2020), на NeurIPS, demonstrated, что gradient updates leak — sometimes catastrophically — by reconstructing input images из publicly transmitted gradients в standard FL settings. Их result establishes, что gradient transmission alone не privacy guarantee и что любой production FL deployment must compose FL с secure aggregation, differential privacy, или both.

Диплом (Глава 4 §4.6) treats federated learning как architecturally overkill для described research regime: FL excels at training predictive models across many devices; он не produces kind of descriptive engagement statistics, required single-cohort correlational study. Architecture chosen — daily aggregate upload fixed schema after schema-strict validation, с k-anonymity gating на access boundary — functionally simpler и operationally sufficient.

### 2.5.4 Re-identification empirics

Narayanan и Shmatikov (2008), в IEEE Symposium on Security and Privacy, established de-anonymisation литературу с Netflix Prize attack: «anonymised» dataset 500K subscribers' movie ratings был successfully linked к public IMDb profiles, recovering individual identities и apparent political preferences. Это canonical empirical demonstration, что release-time anonymisation без formal guarantees — brittle against linkage attacks с external auxiliary data — threat model, который motivates access-time k-anonymity gate Главы 4 §4.3.4.

### 2.5.5 STRIDE и LINDDUN threat-modeling frameworks

Howard и LeBlanc (2003), *Writing Secure Code* (2nd ed., Microsoft Press), formalised STRIDE taxonomy (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege) для security threat modeling — six categories systematically applied к data-flow-diagram elements для surface candidate threats. STRIDE был internal methodology Microsoft перед public release и remains наиболее widely cited security-threat taxonomy в industry practice.

Deng, Wuyts, Scandariato, Preneel, и Joosen (2011), в *Requirements Engineering*, introduced LINDDUN (Linkability, Identifiability, Non-repudiation, Detectability, Information disclosure, Content Unawareness, Non-compliance) как privacy analogue — explicitly modeled на STRIDE, but reorienting от confidentiality threats к privacy threats. LINDDUN methodology applies seven categories systematically к data-flow-diagram elements, following defined elicitation procedure.

Диплом (Глава 4 §4.5) does not apply ни STRIDE ни LINDDUN formally — архитектура была спроектирована из privacy-by-design intuitions и GDPR/Helsinki ethical primitives — but documents (§4.5), что implemented controls cover most of STRIDE's *Spoofing*, *Tampering*, *Information disclosure*, и *Repudiation* категорий и most of LINDDUN's *Linkability*, *Identifiability*, и *Information disclosure* категорий. Documented gaps (STRIDE *Denial of service*; LINDDUN *Detectability* via traffic analysis) — scope-acknowledged limitations.

## 2.6 Calibrated diagnostic instruments

Tertiary outcome диплома (Глава 5 §5.3.3) — 20-item one-parameter logistic (1PL) Rasch diagnostic — `ulpan_diagnostic_v1` instrument — scored для producing learner-ability estimate (theta) с standard error и CEFR band assignment.

### 2.6.1 Rasch model

Rasch (1960/1980), в *Probabilistic Models for Some Intelligence and Attainment Tests* (originally published Danish Institute for Educational Research, Copenhagen; reprinted University of Chicago Press, 1980), introduced one-parameter logistic measurement model, который bears его name: probability of correct response on item *i* by person *n* depends only on difference между person ability θ_n и item difficulty β_i, с no item-discrimination или guessing parameter. Rasch model occupies distinctive position в psychometrics: он mathematically simplest item-response-theory (IRT) model, и proponents argue, что он only IRT model, который satisfies *specific objectivity* property — person comparisons should not depend на which items used, и item comparisons should not depend на which persons used.

### 2.6.2 Applied Rasch measurement

Bond и Fox (2007/2015), *Applying the Rasch Model: Fundamental Measurement in the Human Sciences* (2nd ed., Lawrence Erlbaum; 3rd ed., 2015, Routledge), — standard applied-Rasch textbook, covering operational toolkit (Winsteps, Facets, R package eRm), diagnostic indicators (infit/outfit MSQ, point-measure correlations, Wright maps), и standard reporting conventions, adopted в calibrated-quiz литературе. Диплом uses Bond и Fox как methodological reference для calibration procedure `ulpan_diagnostic_v1` (Глава 5 §5.3.3).

### 2.6.3 CEFR framework

Common European Framework of Reference for Languages (Council of Europe, 2001, 2020) defines six reference levels (A1, A2, B1, B2, C1, C2 — extended в 2020 Companion Volume с Pre-A1) along action-oriented can-do-statement axis. CEFR became de facto vocabulary для second-language proficiency в European и Israeli contexts; настоящий диплом adopts CEFR как band system, reported alongside Rasch theta estimate. Mapping от theta к CEFR band в `ulpan_diagnostic_v1` rests на expert-judgement difficulty parameters на момент написания — external ulpan-teacher review acknowledged в §5.6 как pending. Consequently calibrated quiz treated в дипломе как tertiary, secondary-strength outcome — не primary one.

## 2.7 Statistical methodology для small-N research

Empirical study, described в Главе 5, operates at structural lower bound single-cohort diploma-scale research — N ≈ 10–20 в linked subsample. Этот regime requires methodological care beyond what undergraduate statistics textbooks typically address.

### 2.7.1 Power analysis

Cohen (1988), *Statistical Power Analysis for the Behavioral Sciences* (2nd ed., Lawrence Erlbaum), — canonical power-analysis reference. Tables Cohen и effect-size conventions (r = 0.1 / 0.3 / 0.5 для small/medium/large correlation; *d* = 0.2 / 0.5 / 0.8 для small/medium/large standardised mean difference) remain default. Глава 5 §5.5.6 reports Cohen-derived sample-size requirements at Bonferroni-corrected α = 0.0125: N = 28 для detect r = 0.5 at 80% power; N = 14 для detect r = 0.7; at expected N ≈ 10 study has 80% power только для r ≥ 0.78. Эта underpower treated как structural constraint, не deficiency.

### 2.7.2 p-value crisis и estimation framing

Wasserstein и Lazar (2016), в *The American Statistician*, issued American Statistical Association's official statement on p-values, articulating six principles against bright-line use of *p* < 0.05 и в favour of effect-size reporting с uncertainty intervals. Cumming (2014), в *Psychological Science* («The new statistics: Why and how»), — leading articulation estimation-with-confidence-intervals paradigm как replacement для null-hypothesis significance testing: report *r* с его 95% CI как primary inferential statistic; *p*-value — at most secondary. Глава 5 §5.5.3 implements recommendation Cumming directly — 95% CI на *r*, not *p*-value, — primary inferential statistic.

### 2.7.3 Equivalence testing

Lakens (2017), в *Social Psychological and Personality Science*, introduced equivalence-testing framework (TOST — two one-sided tests) для applied behavioural-science audiences как practical procedure для testing whether effect — *too small to matter*, complementary к standard NHST procedure для testing whether effect — *too large to be chance*. Диплом acknowledges (Глава 5; OSF preregistration §H1–H4), что equivalence-test framing был бы ideal для null findings, но сам по себе underpowered at N ≈ 10; framing-of-record therefore — «отсутствие свидетельств — не свидетельство отсутствия» (Wasserstein & Lazar, 2016, principle 5).

### 2.7.4 Multiple-comparisons control

Bonferroni correction applied к четырём pre-registered primary гипотезам (α = 0.05 / 4 = 0.0125 per test). Benjamini и Hochberg (1995), в *Journal of the Royal Statistical Society Series B*, introduced false-discovery-rate (FDR) control как more powerful alternative для high-dimensional screening. Диплом (Глава 5 §5.5.4) explicitly chooses Bonferroni over FDR on grounds, что regime confirmatory (four pre-registered tests с directional priors), not exploratory; FDR appropriate когда number of tests в dozens-to-thousands range. ≈20 exploratory metrics not significance-tested at all — они reported as descriptive effect-size estimates с CIs.

### 2.7.5 Replication и pre-registration culture

Broader meta-science context настоящего диплома — post-Ioannidis (2005) и post-replication-crisis recognition (Open Science Collaboration, 2015; Munafò et al., 2017), что pre-registration of analysis plans — low-cost, high-value intervention against HARKing (Hypothesising After Results are Known) и p-hacking. OSF preregistration диплома (DOI 10.17605/OSF.IO/ZDV9J) — operational implementation этого stance: every primary-hypothesis test, inclusion criterion, exclusion rule, и missing-data policy locked before any data are seen.

## 2.8 Synthesis: gap, который этот диплом addresses

Литература, reviewed выше, provides, separately, все conceptual ingredients required для privacy-preserving research-mode для CALL/MALL application at diploma scale:

- **Из CALL/MALL (§2.2):** evaluation vocabulary (Chapelle, 2001), empirical литература по engagement-as-predictor (Hattie, 2009; Mueller & Oppenheimer, 2014), industrial proof, что это работает at scale (Settles & Meeder, 2016; Vesselinov & Grego, 2012), и Hebrew-language morphological infrastructure (hspell; HebMorph; YAP).
- **Из LA ethics (§2.3.5):** principle catalogues (Slade & Prinsloo, 2013; Pardo & Siemens, 2014) и operational checklists (Drachsler & Greller, 2016) для deploying analytics ethically.
- **Из technical privacy (§2.5):** formal anonymity (Sweeney, 2002; Machanavajjhala et al., 2007; Li et al., 2007), formal mathematical privacy (Dwork & Roth, 2014), и architectural alternatives (McMahan et al., 2017; Geiping et al., 2020).
- **Из psychometrics (§2.6):** calibrated diagnostic framework (Rasch, 1960/1980; Bond & Fox, 2015) и reporting framework (CEFR, Council of Europe, 2020).
- **Из statistical methodology (§2.7):** power-analytic framework (Cohen, 1988), estimation paradigm (Cumming, 2014), и inference-discipline framework (Wasserstein & Lazar, 2016; Lakens, 2017).

Что *missing* — и что этот диплом contributes — это working, open-source, deployable артефакт, который integrates все эти layers в одном CALL application, с k-anonymity gating, schema-strict server validation, cascading-delete-on-withdrawal, opt-in transparent UI, и OSF-pre-registered correlational analysis, scoped к single-cohort diploma research. Existing systems either too heavy (formal differential privacy at N ≈ 10), too narrow (Anki-only, no analytics layer), or too closed (commercial MALL applications с centralised opaque event logs). Методологический вклад, защищаемый в Главе 4, fills этот gap; эмпирическое исследование, described в Главе 5, demonstrates, что архитектура может быть deployed и produces interpretable output at lower bound of viable sample size. Neither contribution requires другой быть valuable.

---

**Конец Главы 2.** Полная APA 7 bibliography для всего диплома consolidated в `thesis/BIBLIOGRAPHY.md`.
