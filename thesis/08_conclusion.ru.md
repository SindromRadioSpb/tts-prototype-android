# Глава 8 — Заключение и Future Work

> **Статус.** ЧЕРНОВИК ЗАВЕРШЁН (sequential drafting по согласованной cadence 2026-05-22).
> **Целевая длина.** ~3-5 страниц (BRIEF §3).
> **Bilingual workflow.** RU mirror EN-канонического `thesis/08_conclusion.md`. Sync invariant по `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Источники.** Глава 4 §4.10, Глава 5 §5.10, `ULPAN_RESEARCH_PLAN §5` (scaling), audit closure plan.
> **Последнее обновление.** 2026-05-22.

---

## 8.1 Резюме вкладов

Этот диплом advances два вклада неравного веса и неравной зависимости от эмпирических findings.

**Первичный вклад** — методологический дизайн privacy-preserving opt-in research-mode для Hebrew language learning application, воплощённый в working LinguistPro кодовой базе и оформленный как open-source артефакты: wire-format schema, informed-consent template, material-change consent decision tree, pre-registered analysis plan, locked на Open Science Framework до сбора каких-либо данных участников, и полный source code под permissive лицензированием. Вклад независим от any specific empirical outcome.

**Вторичный вклад** — само эмпирическое корреляционное исследование — явно эксплораторный single-cohort анализ цифровой учебной активности против прироста экзаменационных баллов в иврит-ульпане. Исследование reported как effect-size estimates с 95% confidence intervals, а не как significance-test verdicts, в deference к структурным constraints single-cohort diploma-scale research.

**Третий вклад**, менее central, но worth recording, — более широкий open-source release самого приложения LinguistPro — typed-graph notes подсистема, локальный Smart Learning Graph, Hebrew morphological dictionary integration, dual-mode UX, и teacher dashboard — которые вместе constitute privacy-preserving CALL workspace для иврита, structurally compatible с future research-mode extensions.

## 8.2 Что было выучено

**Методологически**, диплом демонстрирует, что:

- Privacy-preserving research-mode можно спроектировать и реализовать при modest engineering cost (~2 000 строк кода в research-mode подсистеме), оставаясь auditable прямым осмотром, а не доверием к policy.
- Pre-registration валуэбла при малом N. Effect-size-with-CI inference framing защищает против seductive but misleading p-value verdicts, которые small-cohort design не может honestly поддержать.
- Two-key split-knowledge linking архитектура практична для small-cohort образовательного исследования; linking-subsample bias visible и может быть probed через sensitivity analysis, а не denied.
- Честное признание design limitations strengthens методологический вклад, а не weakens. Privacy-preserving framework, который overclaims, сам является threat для участников.

**Эмпирически**, `[TODO: заполнить из Chapter 6 findings]` диплом contribute'ит small-N data point к CALL engagement-outcome литературе: в одной ulpan-когорте приблизительно N = `[TODO]` linked участников, четыре pre-registered engagement метрик (active minutes, SRS cards added, notes created, SRS error rate) yield Pearson r estimates `[TODO: list]` против `growth_delta` outcome. Эти estimates carry wide confidence intervals, reflecting small sample; их value — contributive evidence в under-studied population, не подтверждение large-N CALL claims.

## 8.3 Архитектура масштабирования

Архитектурные выборы Главы 3 откалиброваны к одной ulpan-когорте, но не preclude scaling. `ULPAN_RESEARCH_PLAN §5` документирует пять stages архитектурного scope:

- **Stage 1** (single user, no research): offline-first приложение LinguistPro как personal study workspace.
- **Stage 2** (single cohort, opt-in research): diploma-scale arrangement, описанный в этом дипломе.
- **Stage 3** (multi-cohort comparative): cohort isolation уже encoded в per-cohort directory layout; cross-cohort analytic пути — open work, но не требуют schema migration.
- **Stage 4** (institutional adoption): одно образовательное учреждение деploys LinguistPro across multiple ulpan teachers / classes; cohort code становится class identifier в учреждении; per-class teacher dashboards roll up к institutional-level view.
- **Stage 5** (federated public research platform): любой qualified исследователь может run opt-in study против LinguistPro архитектуры, с cross-platform federation, enabling shared anonymized datasets без compromising per-cohort privacy инвариантов.

Stages 3 через 5 — out of scope для present диплома. Архитектурные обязательства Главы 3 — schema versioning, cohort-isolated storage, schema-strict validation, default-OFF opt-in, two-key split-knowledge — были выбраны, чтобы делать эти future stages reachable без core архитектурных rewrite'ов. Scaling path therefore — research roadmap, не roadmap breaking changes.

## 8.4 Open questions и research-agenda

Несколько open questions worth flagging для future research, за пределы specific future-work items, перечисленных в Главе 7 §7.8:

**Масштабируется ли архитектура за пределы Russian-L1 / Hebrew?** Текущий дизайн tested в Russian-L1 → Hebrew контексте. Replication в разных L1 → L2 pairings (Arabic, English, Spanish к Hebrew; или Russian к другим L2) тестировала бы generalizability педагогических предположений дизайна. Архитектурные обязательства (offline-first, schema-strict aggregation, two-key linking) language-agnostic; педагогические предположения (row-by-row text editor, niqqud-and-translit affordances, morphological lookup) Hebrew-shaped. Distinguishing two informed бы future ports.

**Каков empirical effect transparency UIs на participation retention?** Transparency-first дизайн hypothesizes (но не measures), что visible-to-participant data flows contribute'ят к trust и opt-in retention. Это сам researchable question — controlled study, comparing opt-in retention rates между transparency-UI condition и minimal-disclosure condition, informed бы future research-mode архитектуры.

**Как pre-registration при малом N изменяет publishability нулевых findings?** Meta-research question, поднятый этим дипломом: does pre-registering an underpowered correlational study на diploma scale produce publishable contributions, или publication bias против null findings всё ещё dominates? Empirically tracking citation trajectory OSF pre-registration over time был бы informative.

**Где l-разнообразие, t-близость или differential-privacy техники становятся net beneficial?** Наша k = 5 anonymity baseline консервативна для small cohorts. При каком размере когорты, и для каких видов sensitive attribute distributions, более сильные formal frameworks становятся net-beneficial relative to их utility costs? Это open методологический question для future privacy-preserving research-mode designers.

**Можно ли портировать методологический дизайн к другим educational research контекстам за пределы CALL?** Privacy-preserving research-mode архитектура, in principle, agnostic к learning domain. Natural extension — тестировать дизайн в adjacent educational-research контекстах: mathematics learning analytics, programming-skill acquisition, music-instrument practice. Каждый бы adapted engagement-taxonomy layer (метрики specific к этому domain), preserving архитектурные обязательства (k-anonymity, two-key, schema-strict, withdrawal completeness, consent versioning).

## 8.5 Заключение

Диплом began с наблюдения, что ulpan-студенты — adult Hebrew learners на small-cohort scale — sit на пересечении трёх sparsely-populated research literatures: Hebrew CALL педагогика, small-cohort образовательная research-методология, и privacy-preserving research-архитектура. Contribution, offered здесь, — working exemplar на этом пересечении: приложение LinguistPro как Hebrew CALL workspace, opt-in research-mode подсистема как privacy-preserving архитектура, и pre-registered correlational исследование как small-cohort empirical demonstration, что архитектура produces interpretable output даже при N ≈ 10.

Диплом не claim, что это — единственный путь к ethical CALL research; он claim только, что это — **один defendable path**, demonstrated end-to-end, с code-anchored evidence и open materials, которые future researchers могут fork, modify, criticize, или supersede. Contribution open by construction. Whatever specific empirical findings turn out to be когда когорта runs, дизайн outlive их.

---

**Конец Главы 8.**

---

## Благодарности (placeholder)

`[TODO: заполнить]` Научный руководитель `[имя руководителя]` acknowledged за ethics oversight и методологическое руководство. Ulpan-учитель(я) recruiting cohort acknowledged за hosting research within their curriculum. OSF (Open Science Framework) acknowledged за hosting pre-registration как free public service. Hspell-проект (Хар-Эль и Кенигсберг) acknowledged как источник Hebrew morphological dictionary, embedded в LinguistPro.

Участники research cohort не named (per privacy architecture); их добровольный contribution acknowledged collectively как эмпирический фундамент вторичного contribution.

---

**Конец основного текста диплома.** Bibliography и any appendices следуют.
