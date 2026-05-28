# Глава 7 — Discussion

> **Статус.** ЧАСТИЧНЫЙ ЧЕРНОВИК — структура + secции limitations / threats / future-work полностью drafted; result-interpretation секции placeholder в ожидании Chapter 6 data.
> **Bilingual workflow.** RU mirror EN-канонического `thesis/07_discussion.md`. Sync invariant по `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Источники.** Глава 5 §5.9 (limitations preview), Глава 4 §4.5 (threat model), `docs/THESIS_VALIDITY_AUDIT_2026_05_21.md`, OSF preregistration.
> **Последнее обновление.** 2026-05-22.

---

## 7.1 Обзор

Эта глава интерпретирует obtained empirical results, представленные в Главе 6, в контексте related work Главы 2 и методологических обязательств Главы 5. Также адресует threats to validity, которые structural constraints дизайна делают неизбежными, draws implications для CALL педагогической практики и для privacy-preserving research design более широко, и proposes directions для future confirmatory studies.

Discussion proceeds в трёх movements. Первое (§7.2–§7.3) интерпретирует empirical findings против четырёх pre-registered гипотез и против related-work литературы, с явным framing как effect-size estimates с confidence intervals, а не как significance-test verdicts. Второе (§7.4–§7.5) адресует threats to validity и методологические ограничения, made visible structural constraints дизайна. Третье (§7.6–§7.8) draws implications для CALL педагогической практики и для privacy-preserving research design более широко, и proposes research-agenda для future confirmatory studies и архитектурных расширений.

## 7.2 Интерпретация primary findings

`[TODO: заполнить post-pilot — pending Chapter 6 results]` Эта секция интерпретирует каждое из четырёх primary hypothesis-test outcomes:

- **H1 (`active_minutes_real` ↑ → `growth_delta` ↑).** Outcome из Главы 6 §6.3.1: `[TODO]`. Интерпретация: `[TODO]`.
- **H2 (`cards_added_to_srs` ↑ → `growth_delta` ↑).** Outcome из Главы 6 §6.3.2: `[TODO]`. Интерпретация: `[TODO]`.
- **H3 (`notes_created` ↑ → `growth_delta` ↑).** Outcome из Главы 6 §6.3.3: `[TODO]`. Интерпретация: `[TODO]`.
- **H4 (`srs_error_rate` ↑ → `growth_delta` ↓).** Outcome из Главы 6 §6.3.4: `[TODO]`. Интерпретация: `[TODO]`.

Независимо от specific outcomes, интерпретация будет следовать decision-rule категориям Главы 5 §5.5.3: **directionally-supported** outcome интерпретируется как «effect-size estimate, consistent с literature predictions, с wide confidence interval, который не следует over-claim'ить»; **directionally-consistent-but-underpowered** outcome интерпретируется как «нет inferential verdict; effect-size estimate informative как point estimate»; **no-evidence-of-large-effect** outcome интерпретируется как «нет свидетельств при данном размере выборки, не как подтверждение нулевой гипотезы». Confirmatory multiple regression (Глава 6 §6.4) reported как joint-model evidence, supplementary к bivariate tests, не как пятый confirmatory test.

## 7.3 Сравнение с related work

`[TODO: частичное заполнение — сравнение с related-work findings зависит от Chapter 6 data]` Мы сравниваем obtained effect-size estimates против более широкой CALL литературы об engagement-outcome relationships:

- Time-on-task как predictor учебных outcomes хорошо устоявшийся при large N [TODO: процитировать Hattie 2009 meta-analysis effect sizes; Cepeda et al. distributed practice]; наша small-N estimate для H1 интерпретируется против этого anchor.
- Metacognitive-engagement framing active SRS-card creation (отличного от passive review) появляется в литературе [TODO: процитировать metacognitive-engagement литературу]; наша H2 estimate contribute'ит small-N data point.
- Note-taking effect на encoding документирован в Mueller & Oppenheimer 2014 и follow-ups [TODO: процитировать Mueller & Oppenheimer 2014 longhand vs laptop]; наша H3 estimate интерпретируется против этого anchor.
- SRS error rate как inverse predictor retention — less-studied direction в литературе; наша H4 estimate contribute'ит novel small-N data point.

Центральный interpretive frame: наше исследование не может adjudicate claims литературы при large N; что оно **может** — это reportировать effect-size estimates **из population (small-cohort adult ulpan), для которой литература provides sparse evidence**. Contribution — contributive evidence в under-represented population, не подтверждение mainstream large-N CALL claims.

## 7.4 Threats to Validity

Pre-registered threats из Главы 5 §5.9 recap'аются здесь с их post-data assessment:

**Selection bias (opt-in cohort).** Участники, которые chose to opt-in в research, systematically more app-friendly, чем non-participants в той же ulpan-группе. Sensitivity analysis Главы 6 §6.6 (linked-vs-opt-in Kolmogorov-Smirnov distribution comparison) `[TODO: процитировать specific KS test outcome]` — empirical check на то, materially ли этот bias distort'ит conclusions. Если linked subsample статистически distinguishable от opt-in cohort на engagement distributions, conclusions scoped к linked subsample only.

**Hawthorne effect от transparency-first design.** Участники знали, что их поведение измеряется; transparency UI делал observation visible в любой момент. Это inherent cost privacy-transparent research-mode и fundamentally не отделим от privacy commitment дизайна. Мы не claim Hawthorne-free measurement [TODO: процитировать Adair 1984 Hawthorne re-examination]. Transparency-first дизайн accepts этот trade-off в обмен на participant trust и consent legibility.

**Construct validity `active_minutes_real`.** Метрика captures interactive engagement (heartbeats during visible-tab + recent-interaction state), не total exposure time. Passive listening — meaningful study mode для ulpan-студентов — systematically under-counted. Соответствующие effect-size estimates на H1 следует интерпретировать как «**interactive** engagement × growth», не как «total exposure × growth». Где stopwatch validation был performed (Глава 6 §6.8) `[TODO: процитировать stopwatch result]`, его результат bounds construct claim.

**Construct validity reframed через V3 multitrait-multimethod (V3 supplementary).** В соответствии с pre-registered supplementary analysis, объявленным в OSF deviation log §9.4 (Construct-Validity Pluralism), construct gap operationalized как empirically-testable вопрос, а не как unmeasured caveat. V3 layer reports две новые derived метрики — `audio_exposure_minutes` (passive listening proxy из `play_audio` событий) и `text_exposure_minutes` (passive reading proxy из `text_open`/`text_close` событий с 5-min imputation для orphan opens) — наряду с OSF-locked primary `active_minutes_real`. Campbell & Fiske (1959) multitrait-multimethod intercorrelation matrix (Глава 6 §6.7.1) [TODO: процитировать Campbell & Fiske 1959] provides **эмпирический якорь** для construct gap: если три метрики intercorrelate при r > 0,85, gap узок и H1 conclusions распространяются на total exposure тоже; если r < 0,5, gap широк и H1 conclusions остаются scoped к *interactive* engagement only. V3 alternative specifications (growth ~ audio_exposure_minutes, growth ~ text_exposure_minutes, growth ~ z-composite) reported как exploratory parallel regressions в §6.7.1; они **НЕ** заменяют OSF-locked H1 primary test. Критически: operational definition `active_minutes_real` unchanged от pre-registration — никакого mid-study construct drift, никакого pre-registration violation.

**SRS-метрики как proxy для retention.** `srs_error_rate` измеряет secondary in-app stub Trainer, не primary Anki review path. Proxy framing задокументирован в Главе 5 §5.6.2 и Главе 3 §3.4.6; fuller retention-validation study deferred к future v3.4+ Anki Connect sync (`docs/PRODUCT_COHESION_PLAN_v3_4.md`).

**Sample size underpower.** Обсуждается в Главе 5 §5.5.6. Bonferroni-corrected detectable effect при нашем expected linked subsample — r ≥ 0.78 — large effects only. Medium effects статистически не detectable при этом масштабе. Мы accept это как structural feature diploma-scale single-cohort research и report effect-size estimates с явными confidence intervals, а не как significance verdicts.

**Underpower reframed через TOST equivalence (V5 supplementary).** В соответствии с pre-registered supplementary confirmatory analysis, объявленным в OSF deviation log §9.1, каждая primary гипотеза дополнительно тестируется на эквивалентность против Smallest Effect Size Of Interest (SESOI_r = 0,5) через Lakens 2017 TOST [TODO: процитировать Lakens 2017]. Reframing честен относительно своего scope: SESOI = 0,5 — максимальная граница, тестируемая при N = 10 с строгим Bonferroni α = 0,00625. Нулевой primary-finding paired с equivalent TOST outcome (90% CI на r целиком в ±0,5) reported как позитивное bounded-effect утверждение — «данные исключают эффекты больше r = 0,5» — а не как пустой verdict «нет свидетельств». Нулевой primary-finding paired с *not-equivalent* TOST outcome остаётся честным признанием того, что данные одновременно совместимы и с large effects, и с zero — exactly как Wasserstein и Lazar (2016) рекомендуют («отсутствие свидетельств — не свидетельство отсутствия»). Меньшие SESOI (r = 0,3, r = 0,2) явно deferred к V2 MCREMA multi-cohort framework, где pooled N может их поддержать.

**Bayesian prior sensitivity (V1 supplementary).** Pre-registered Bayesian sensitivity layer, объявленный в OSF deviation log §9.2, reports posterior summaries под тремя locked priors — flat JZS, weak-informative skeptical N(0, 0,3²), и literature-anchored N(0,3, 0,2²). При N ≈ 10 credible intervals по ширине близки к Fisher-z confidence intervals; ценность layer — в **prior-sensitivity transparency**: любое заключение, переживающее все три prior'а, prior-robust; любое заключение, зависящее от единственного prior'а, appropriately weakened в discussion. **Никакой Bayes factor или posterior probability не promoted в confirmatory decision rule**; это descriptive supplementary evidence only.

**Multiple-comparisons inflation.** Mitigated через pre-registration: только четыре гипотезы — confirmatory; все остальные findings явно framed как exploratory descriptive evidence без significance claims (Глава 5 §5.5.4). HARKing prohibition binding throughout analysis.

**Confounding variables.** Motivation, prior Hebrew exposure, hours-per-week available для study, family support, и age не captured server-side per data-minimization принципу privacy архитектуры. Если учитель administered pre-cohort survey, partial regression с covariates reported в Главе 6 §6.4; иначе соответствующий interpretive caveat invoked throughout.

**Single-cohort generalizability.** Глава 5 §5.7 scopes generalization claims к linked subsample одной teacher's cohort, преимущественно русскоязычные L1-носители на уровнях CEFR A2–B2. Generalization за пределы этого scope не claimed; future replication studies в разных L1 populations и ulpan settings proposed в §7.8.

**Insider threat от исследователя.** Глава 4 §4.5.3 признаёт, что insider threat от самого исследователя not technically defended — only mitigated open-source кодом и open replication package, которые make collusion auditable in principle. Single-researcher diploma context (исследователь = data analyst) magnifies этот risk; мы accept его как structural constraint diploma-scale setting'а.

## 7.5 Методологические ограничения, made visible

Ключевое методологическое обязательство этого диплома — **честное признание неустранённых threats**. Мы не papered over ограничения (a) underpowered statistical design, (b) construct restrictions `active_minutes_real` и `srs_error_rate`, (c) selection bias opt-in linking, или (d) отсутствие formal IRB oversight. Эти ограничения — не failures дизайна; они — explicit boundaries его scope применимости, документированные up-front в pre-registration и methodology chapter.

Диплом, который overclaims strength своих evidence, damages future researchers, которые attempt replication on the basis of mis-stated effect sizes. Мы предпочитаем дискомфорт явного underpower acknowledgement над false comfort significance-test verdicts, которые data не поддерживает. Методологический вклад Главы 4 unaffected by — и indeed strengthened by — honest acknowledgement этих empirical limitations.

## 7.6 Implications для CALL педагогической практики

`[TODO: частичное заполнение — зависит от Chapter 6 findings]` Subject to caveats §7.4, наши findings имеют следующие potential implications для CALL педагогической практики:

- Если **H1** (active engagement → growth) directionally supported, это contribute'ит small-cohort data point к хорошо устоявшейся large-N литературе; contribution — replication-grade evidence в under-represented population (adult ulpan students на A2–B2 CEFR).
- Если **H2** (SRS-card-creation → growth) directionally supported, это consistent с metacognitive-engagement framing литературы; implication для учителей — что prompting студентов toward active card creation (а не passive review) может matter педагогически.
- Если **H3** (notes → growth) directionally supported, это consistent с Mueller & Oppenheimer 2014 effects в CALL-контексте — что effortful note-taking activities support encoding.
- Если **H4** (SRS error rate → growth) directionally negative (lower errors → better growth), это поддерживает стандартную retention-practice интерпретацию; если **не** directionally negative, это поднимает вопросы о калибровке in-app stub Trainer, которые warrant follow-up investigation.

Мы эмфазируем, что любая из этих implications contingent на specific effect-size estimates и их confidence intervals; wide CIs при малом N mean, что ни один single result не будет «deciding answer» — исследование contribute'ит evidence, не verdicts.

## 7.7 Implications для privacy-preserving research design

Методологический вклад диплома (Глава 4) имеет несколько implications для future researchers, designing privacy-preserving research-modes в образовательной технологии:

**Two-key split-knowledge архитектура практична при small cohort sizes.** Наш размер когорты делает linking-subsample bias visible, но сама архитектура — исследователь знает UUID + метрики; учитель знает имя + балл; участник initiates linking — implementable с manageable engineering investment (~2 000 строк кода total). Не требует federated infrastructure или differential-privacy noise calibration.

**Schema-strict server-side валидация — practical lower-bound enforcement mechanism.** Recursive `FORBIDDEN_FIELDS` allow-list approach (Глава 4 §4.4.1) — thin layer кода, который catches наиболее частые privacy-leak vectors на trust boundary, complementary к (не replacement of) higher-formal techniques like differential privacy или federated learning.

**Transparency UIs operationalize consent contract at runtime.** Preview-as-separate-section паттерн (Глава 4 §4.4.4) делает consent contract visible участникам throughout исследование, не только на consent-screen момент. Мы hypothesize, что это contribute'ит к trust и retention opted-in участников, хотя мы не measured это empirically в present study; §7.8 proposes это как future research.

**Pre-registration при малом N всё ещё валуэбл.** Даже при ожидаемом linked-subsample N = 5–12, pre-registration защищает против HARKing и multiple-comparisons inflation, оба из которых — нетривиальные риски независимо от статистической мощности. OSF артефакт (DOI 10.17605/OSF.IO/ZDV9J) сам является contribution к литературе pre-registration-at-small-N как defendable методологический выбор [TODO: процитировать small-N pre-registration литературу если существует].

**Open-source release amplifies методологический вклад.** Privacy-preserving research-mode за closed source был бы unverifiable независимыми исследователями; open-source кодовая база делает design contribution falsifiable в sense'е, что любой privacy claim имеет соответствующий code-артефакт, который можно examine directly. Future researchers могут fork, modify, criticize, или supersede архитектуру без зависимости от нашего self-report её свойств.

## 7.8 Future Work

Несколько directions следуют из этого диплома:

**Multi-cohort random-effects meta-analysis — MCREMA (V2 supplementary; protocol-only на момент защиты).** В соответствии с pre-registered V2 protocol, объявленным в OSF deviation log §9.3 и детализированным в `thesis/META_ANALYSIS_PROTOCOL.md`, эмпирически существенный путь закрытия (a) underpower ограничения §7.5 — random-effects meta-analysis по K ≥ 3 future LinguistPro ulpan-когортам. Pre-registered estimator — REML через `metafor::rma()`; pre-registered cumulative-evidence rule запрещает selective reporting pooled-only или per-cohort-only результатов; pre-registered deidentification policy (cohort_001/002/... labels) предотвращает indirect ulpan-class identification из published meta-analytic CSV. На момент защиты K = 1, поэтому это **протокольный вклад**, не выполненный анализ. Supporting infrastructure отгружена в v3.3.2 (cross-cohort CSV) плюс additions этого диплома (`exportMetaAnalysisCsv()` в `public/js/teacher.js`, `scripts/research/meta_analysis.R`, simulation-verification `scripts/research/meta_analysis_smoke.R`). K-curve симуляция в smoke fixture verifies, что pooled 95% CI half-width сужается с ≈ 0,45 (K=3) до ≈ 0,28 (K=8) при истинном ρ = 0,4 — эта curve **и есть** MCREMA contribution. Subsequent researchers, running cohort_002, cohort_003, ..., могут pool против cohort_001 этого диплома напрямую через pre-registered protocol; primary H1-H4 results диплома entered в meta-analysis как K = 1 anchor без selective re-analysis.

**Anki Connect bidirectional sync (v3.4+).** Закрытие in-app retention measurement gap, motivating proxy framing Главы 5 §5.6.2, требует bidirectional sync с Anki; это на deferred v3.4 roadmap (`docs/PRODUCT_COHESION_PLAN_v3_4.md`).

**Empirical IRT recalibration диагностического квиза.** `ulpan_diagnostic_v1` instrument использует expert-judgement difficulty parameters на момент написания. Как только ≥ 30 cohort responses накопятся, empirical Rasch recalibration может заменить expert-judgement parameters (`docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md §6`).

**External ulpan-teacher review item bank.** Pre-launch checklist item (§7 `docs/V3_3_5_PREDEPLOYMENT_GATE_STATUS.md`) — внешний review calibrated quiz items native Hebrew-speaking ulpan-учителем. Это gating constraint для full production-readiness quiz outcome.

**Transparency-UI retention study.** Controlled study, comparing opt-in retention rates между transparency-UI condition и minimal-disclosure condition, empirically тестировал бы hypothesized trust-contribution preview-as-separate-section паттерна. Это researchable question on its own merits.

**Replication across L1 populations и ulpan types.** Текущая когорта — преимущественно русскоязычная L1; replication в Arabic-L1, English-L1, Spanish-L1 cohorts тестировала бы generalizability claims §5.7.

**Cryptographic-hash-chain audit logging.** `deletions.log` сейчас полагается на hosting-infrastructure trust (`docs/THESIS_VALIDITY_AUDIT_2026_05_21.md §8.2 D6.6`). Merkle-tree-style audit chain укрепил бы это против compromised-admin tampering; это PhD-tier работа, deferred как future research.

**Federated multi-platform research infrastructure (Stage 5).** Public research platform vision — любой исследователь может run opt-in study против той же opt-in архитектуры, с cross-platform federation, enabling shared anonymized datasets без compromising per-cohort privacy инвариантов — sketched в `ULPAN_RESEARCH_PLAN §5`. Это open-ended future work.

## 7.9 Заключительное заявление

Эта глава интерпретировала empirical findings Главы 6 против литературы Главы 2, адресовала threats to validity, которые structural constraints дизайна делают неизбежными, drew implications для CALL педагогической практики и для privacy-preserving research design, и proposed agenda для future research. Эмпирический вклад — contributive — small-N data point в under-represented population — и методологический вклад — open-sourced инфраструктура для future researchers на пересечении privacy-preserving design и small-cohort образовательного исследования. Глава 8 синтезирует два вклада и projects их forward.

---

**Конец Главы 7.**
