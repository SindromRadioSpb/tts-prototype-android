# Глава 1 — Введение

> **Статус.** ЧЕРНОВИК ЗАВЕРШЁН (sequential drafting по согласованной cadence 2026-05-22).
> **Целевая длина.** ~5-8 страниц (BRIEF §3).
> **Bilingual workflow.** RU mirror EN-канонического `thesis/01_introduction.md`. Sync invariant по `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Glossary.** `thesis/GLOSSARY.md`.
> **Источники.** `docs/ULPAN_RESEARCH_PLAN_v3_2.md §1 + §2`, `docs/PRE_PILOT_MATURITY_REVIEW_2026_05_21.md §1`, `README.md`, OSF preregistration `osf.io/zdv9j`.
> **Стилистические соглашения.** Академическое «мы»; цитирование APA 7; маркеры `[TODO: процитировать X]`.
> **Последнее обновление.** 2026-05-22.

---

## 1.1 Контекст и мотивация

Иврит — один из самых морфологически богатых языков современного обучения, с нетривиальным вычислительным footprint'ом (root-pattern морфология, fully-pointed vs unpointed text, right-to-left script с mixed-content bidirectional handling), и необычно структурированной педагогической традицией: **ульпан** — интенсивный, часто иммерсивный курс иврита, спроектированный преимущественно для взрослых иммигрантов в Израиль и для диаспоры, преследующей иммиграцию, религиозное обучение или профессиональные цели [TODO: процитировать источник о традиции ульпана]. Взрослые ulpan-студенты обычно изучают иврит на уровнях CEFR от A2 до B2 в течение 6–12 недель компрессированного обучения.

Цифровые инструменты для изучения иврита широко доступны — коммерческие платформы (Duolingo, Memrise, LingQ, Drops) покрывают иврит в своих более широких portfolio — но их педагогическое соответствие ulpan-контексту inconsistent. Большинство спроектированы для casual self-study path, не для структурированного интенсивного курса; их analytics vendor-private и недоступны независимым исследователям; и их privacy postures default-уют к comprehensive opt-out поведенческой телеметрии, model, которую всё труднее reconcile с современными нормами research-этики (Хельсинкская декларация §22-32; GDPR Article 6(1)(a)) [TODO: процитировать Helsinki, GDPR].

Этот диплом сформирован тремя наблюдениями gap'а между ulpan-студентами и существующими цифровыми инструментами. **Первое**, ulpan-студенты часто хотят изучать реальные тексты (статьи, песни, разговоры, литературные отрывки) row-by-row с никудом, транслитерацией, переводом и аудио — workflow, который текущие коммерческие платформы поддерживают partially at best. **Второе**, ulpan-учителя и program coordinators недостаточно visibility в то, как их студенты engage с теми цифровыми инструментами, которые они happen использовать, делая отношение между цифровой учебной активностью и экзаменационными результатами невидимым. **Третье**, small-cohort масштаб ulpan-группы (обычно N ≈ 8–15 enrolled студентов) статистически неудобен для formal experimental designs того масштаба, который common в commercial-platform research — но это precisely population, наиболее нуждающаяся в rigorous evidence о том, какие study activities matter.

Проект этого диплома — приложение LinguistPro вместе с его research-mode подсистемой и pre-registered correlational исследованием — адресует все три наблюдения в одном артефакте.

## 1.2 Постановка проблемы и research gap

Литература по Computer-Assisted Language Learning (CALL) документирует extensive engagement-based predictors учебных outcomes — time on task, retention curves, vocabulary growth, distributed practice [TODO: процитировать Hattie 2009; Ericsson; Cepeda et al.] — но эти findings обычно derive либо из large-N commercial-platform datasets (где исследователи не контролируют instrument), либо из laboratory experiments (где population — undergraduates, а не ulpan-style взрослые учащиеся). Методологический tooling для **этического, прозрачного, small-cohort образовательного исследования с researcher-controlled instrument** thinly populated.

Privacy-preserving research frameworks существуют (k-anonymity, differential privacy, federated learning), но были спроектированы для контекстов очень разных масштабов. k-anonymity работает хорошо при тысячах; differential privacy требует калибровок шума, которые overwhelm сигнал при малом N; federated learning engineered для predictive-model training, а не для exploratory descriptive analytics. CALL-specific privacy-preserving research-mode дизайны — opt-in research-агрегация, built into open-source learning application — насколько нам известно, sparsely populated в литературе; Глава 2 surveys adjacent территорию.

Research gap, адресуемый этим дипломом, поэтому на пересечении трёх полей: (i) Hebrew CALL педагогика, (ii) small-cohort образовательная research-методология, и (iii) privacy-preserving research-архитектура. Ни одно из трёх полей по-отдельности не адресует комбинацию; этот диплом contribute'ит working exemplar на пересечении.

## 1.3 Research questions и гипотезы

Диплом структурирован вокруг двух research questions, operationalized в pre-registered analysis plan на OSF ([doi:10.17605/OSF.IO/ZDV9J](https://doi.org/10.17605/OSF.IO/ZDV9J)):

**RQ1 (эмпирический, эксплораторный).** *Какая цифровая учебная активность — в частности, время, проведённое active engagement с Hebrew текстами, создание spaced-repetition карточек, создание заметок, и rate of recall error — коррелирует с приростом учебных outcomes (разница между pre- и post-test экзаменационными баллами) в одной когорте иврит-ульпана?*

Этот вопрос operationalized в четырёх pre-registered primary гипотезах (Глава 5 §5.5.1): **H1** (active minutes ↑ → growth ↑), **H2** (cards added to SRS ↑ → growth ↑), **H3** (notes created ↑ → growth ↑), и **H4** (SRS error rate ↑ → growth ↓). RQ — **эксплораторен по самой конструкции**, потому что естественный размер когорты (N ≈ 8–15) ниже конвенционального порога мощности для medium-effect detection; empirical claims диплома correspondingly modest и framed как effect-size estimates с явными confidence intervals.

**RQ2 (методологический, design-research).** *Можно ли privacy-preserving opt-in research-mode для CALL-приложения спроектировать и реализовать таким образом, чтобы:*
(a) privacy-гарантии держались при small cohort sizes (k-anonymity, two-key split-knowledge, complete withdrawal);
(b) архитектура была переиспользуема будущими CALL-исследователями через permissive open-source лицензирование;
(c) реализация была аудитируема прямым осмотром кодовой базы, а не доверием к policy statement'ам; и
(d) дизайн operationalized defendable ethical framework (Helsinki + GDPR + supervisor oversight) без claim'а на formal IRB pre-approval там, где его нет?

Этот вопрос отвечается constructively в Главах 3–4 через дизайн и реализацию research-mode подсистемы LinguistPro. Ответ takes the form of working artifact (кодовая база, схема, consent template, OSF preregistration), а не hypothesis test; contribution — **design-research** [TODO: процитировать Cross 2006 designerly ways of knowing или эквивалент design-research методологии], в устоявшемся sense'е, что сам дизайн является contribution и evaluated через inspection его компонентов и threat-model покрытия, а не через effect-size measurement.

## 1.4 Вклады

Этот диплом advances **два вклада неравного веса и неравной зависимости от эмпирических findings**.

**Первичный вклад** — методологический дизайн privacy-preserving opt-in research-mode (RQ2). Дизайн embodies семь архитектурных решений (Глава 4 §4.3) — default-OFF opt-in, анонимный client-side UUID, schema-strict server-side агрегация, k = 5 anonymity gate, two-key split-knowledge linking, one-click withdrawal с audit log, и consent versioning с material-change decision tree — каждое anchored к конкретным code-артефактам (Глава 4 §4.4) и tested на adherence через smoke-test enforcement. Архитектура released под permissive open-source лицензированием и pre-registered как analysis-plan-locking артефакт на OSF. **Этот вклад независим от исхода эмпирического исследования.** Даже если явно underpowered correlation analysis возвращает равномерно нулевые findings, дизайн остаётся reusable будущими CALL-исследователями и educational-technology evaluators.

**Вторичный вклад** — само эмпирическое корреляционное исследование (RQ1). Исследование эксплораторно по конструкции — размер когорты делает confirmatory inference medium effects statistically infeasible — и reported как effect-size estimates с 95% confidence intervals, а не как significance-test verdicts. Роль эмпирического исследования — продемонстрировать, что методологическая архитектура primary contribution может быть развёрнута на реальной ulpan-когорте и produce interpretable output даже при малом N.

**Третий вклад**, менее central, но worth noting, — open-source release supporting артефактов: wire-format schema (`docs/RESEARCH_METRICS_SCHEMA.md`), informed-consent template на двух языках (RU + EN), consent material-change decision tree, open OSF preregistration, и более широкая LinguistPro кодовая база. Они positioned для переиспользования другими CALL-исследователями в их собственных исследованиях.

## 1.5 Структура диплома

Оставшаяся часть диплома структурирована следующим образом.

**Глава 2 (Related Work)** situates contribution в существующей литературе: Hebrew CALL платформы, learning analytics в CALL, privacy-preserving research frameworks (k-anonymity, differential privacy, federated learning), spaced-repetition retention research, calibrated диагностические инструменты, основанные на item response theory, и статистическая методология для small-N research.

**Глава 3 (System Design)** описывает приложение LinguistPro — его архитектурную философию (offline-first, иврит-как-первый-язык, итеративное уточнение), его эволюцию через версии 3.0 до 3.7, и его доменную архитектуру (text editor, морфология, TTS / translation, полиморфные typed-graph notes, text-card sharing, SRS-слой, Smart Learning Graph). Глава устанавливает более широкую систему, в которой research-mode подсистема (Глава 4) сидит.

**Глава 4 (Privacy-Preserving Opt-in Research-Mode)** — первичный методологический вклад. Документирует design requirements и ulpan-research constraints, семь архитектурных решений, реализацию как code-anchored артефакты, модель угроз (защищаемые и незащищаемые threats), сравнение с альтернативными privacy-preserving designs (vendor analytics, differential privacy, federated learning, open anonymized datasets, только-Anki), операционализацию этической рамки, артефакты переиспользуемости, и признанные ограничения.

**Глава 5 (Empirical Methodology)** операционализирует архитектурные обязательства Главы 4 в конкретный research design. Документирует участников (recruitment, inclusion / exclusion, sample size), instruments (приложение LinguistPro, teacher CSV outcome, calibrated диагностический квиз, self-report fallback), процедуру (cohort lifecycle от provisioning через data freeze), analysis plan (четыре primary гипотезы, Bonferroni-corrected α = 0.0125, effect-size-with-confidence-interval inference, тесты предположений, missing-data policy, sensitivity analyses), operational definitions конструктов (active minutes, SRS-метрики, growth delta, multi-device handling, timezone), скоуп generalization, операционализацию этики, и методологические ограничения.

**Глава 6 (Results)** reports obtained findings, и confirmatory (четыре pre-registered primary гипотезы с effect sizes и confidence intervals), и exploratory (descriptive cohort engagement patterns и их relationships к outcome). На момент написания когорта не была recruited; глава существует как structured placeholder для заполнения post-pilot.

**Глава 7 (Discussion)** интерпретирует obtained results в контексте related work Главы 2, адресует threats to validity, обсуждает implications для CALL педагогической практики и для privacy-preserving research design, и proposes directions для future confirmatory studies.

**Глава 8 (Conclusion and Future Work)** синтезирует dual contributions, summarizes что было выучено (методологически и эмпирически), и outlines scaling architecture для future deployments (multi-cohort comparative studies, institutional rollouts, federated research-platform vision).

## 1.6 Заметка об этической рамке и pre-registration

Диплом ведётся под multi-source ethical framework (Хельсинкская декларация §22-32, GDPR Article 6(1)(a), научный руководитель `[имя руководителя]` ethics oversight), детально описанной в Главе 4 §4.7 и operationalized в Главе 5 §5.8. Analysis plan был pre-registered на Open Science Framework до сбора каких-либо данных участников (DOI 10.17605/OSF.IO/ZDV9J); любое отклонение от pre-registered плана в Главе 6 будет явно flagged как deviation from preregistration с полным justification'ом. Кодовая база LinguistPro released под permissive open-source лицензированием (MIT для кода, CC-BY 4.0 для документации), making claim'ы диплома аудитируемыми in principle прямым осмотром кодовой базы, а не доверием к narrative summary alone.

Остальная часть диплома proceeds от literature review Главы 2 через conclusion Главы 8 под этими обязательствами.

---

**Конец Главы 1.**
