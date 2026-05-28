# Thesis Glossary — RU ↔ EN Term Mappings

> **Назначение.** Canonical mappings ключевых терминов между EN
> canonical и RU mirror файлами `thesis/0N_*.md` / `thesis/0N_*.ru.md`.
> Используется для предотвращения terminology drift между секциями.
>
> **Workflow.** См. `docs/THESIS_BILINGUAL_WORKFLOW.md` §6.
>
> **Convention.** Append-only. Каждый новый term фиксируется при
> первом появлении. Existing entries меняются только при grounded
> reason (consistency, supervisor feedback). При изменении entry —
> ВСЕ occurrences в обеих языках обновляются same-session.

---

## Core methodological terms

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| privacy-preserving research-mode | режим исследования с защитой приватности | §4.1 | Главный термин thesis title; держим консистентно везде |
| opt-in consent | opt-in согласие | §4.1 | «opt-in» оставляем как loan word — established в RU CALL / EdTech literature; при первом появлении в RU тексте — explainer в скобках («добровольное явное согласие») |
| opt-in only | opt-in только | §4.1 | См. opt-in consent |
| anonymous student_id | анонимный student_id | §4.1 | `student_id` как code identifier не переводится |
| schema-strict server-side validation | строгая серверная валидация по схеме | §4.1 | |
| k-anonymity | k-анонимность | §4.1 | Established term, прямая транслитерация |
| k-anonymity threshold | порог k-анонимности | §4.3.4 (anticipated) | |
| two-key split-knowledge | разделение знания на два ключа | §4.1 | Также допустимо «two-key split-knowledge» как loan если предложение слишком громоздкое |
| one-click withdrawal | one-click отзыв согласия | §4.1 | «one-click» как loan word; «отзыв согласия» — verbose RU equivalent |
| material-change decision tree | дерево принятия решений по существенным изменениям | §4.1 | |
| threat model | модель угроз | §4.5 (anticipated) | Established term in RU security literature |

## Research design terms

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| twofold contribution | двойной вклад | §4.1 | |
| empirical contribution | эмпирический вклад | §4.1 | |
| methodological contribution | методологический вклад | §4.1 | |
| design contribution | проектный вклад | §4.1 | Также допустимо «дизайн-вклад» — более colloquial |
| exploratory study | эксплораторное исследование | §4.1 | Также «разведывательное» в более RU-academic тоне |
| confirmatory study | конфирматорное исследование | §4.1 (implicit) | |
| correlational analysis | корреляционный анализ | §4.1 | |
| growth from pre-test to post-test | прирост от pre-test к post-test | §4.1 | `pre-test` / `post-test` — established loan words |
| linked subsample | связанная подвыборка | §4.1 | (Те участники чей UUID связан с экзаменом) |
| pre-registered on OSF | предварительно зарегистрировано на OSF | §4.1 | |
| pre-registration | предварительная регистрация | §4.1 | Также допустимо «pre-registration» как loan |
| power threshold | порог мощности | §4.1 | Statistical power concept |
| confidence interval (CI) | доверительный интервал (ДИ) | §4.1 | |
| point estimate | точечная оценка | §4.1 | |
| effect size | размер эффекта | §4.1 | |
| medium effect size | средний размер эффекта | §4.1 | |
| large effect size | крупный размер эффекта | §4.1 | |
| null findings | нулевые результаты | §4.1 | |
| absence of evidence (≠ evidence of absence) | отсутствие свидетельств (≠ свидетельство отсутствия) | §4.1 | Established epistemic distinction |
| equivalence-testing pedagogy | педагогика тестирования эквивалентности | §4.1 | Lakens et al. context |
| p-value-centric inference | инференция с фокусом на p-значениях | §4.1 | |
| Open Science | Открытая Наука | §4.1 | Capitalize в RU — устоявшаяся convention в academic RU |
| HARKing | HARKing | §4.1 (anticipated) | Hypothesizing After Results are Known — loan term, не переводим |

## CALL / EdTech context

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| Computer-Assisted Language Learning (CALL) | компьютерно-ассистированное изучение языка (CALL) | §4.1 | Первое появление с EN abbreviation в скобках; далее CALL без раскрытия |
| ulpan | ульпан | §4.1 | Hebrew loan word, established in RU |
| ulpan group | ульпан-группа | §4.1 | |
| ulpan cohort | ульпан-когорта | §4.1 | |
| language-learning application | приложение для изучения языка | §4.1 | |
| learning analytics | учебная аналитика | §4.1 | |
| educational technology | образовательные технологии | §4.1 | |
| digital learning tools | цифровые учебные инструменты | §4.1 | |
| vendor analytics | вендор-аналитика | §4.1 | Также «коммерческая аналитика» в более RU-academic тоне |
| closed vendor analytics | закрытая вендор-аналитика | §4.1 | |
| behavioral telemetry | поведенческая телеметрия | §4.1 | |
| post-hoc anonymization | постхок-анонимизация | §4.1 | Также «ретроспективная анонимизация» |
| quasi-identifier | квази-идентификатор | §4.1 | Sweeney terminology |
| re-identification | реидентификация | §4.1 | Privacy/security term |
| open anonymized dataset | открытый анонимизированный датасет | §4.1 | |
| open-source | открытый исходный код | §4.1 | Также «open-source» допустимо как loan adjective |

## Code / implementation references

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| codebase | кодовая база | §4.1 | |
| open-source codebase | открытая кодовая база | §4.1 | |
| LinguistPro | LinguistPro | §4.1 | Product name, не переводится |
| smoke test | smoke-тест | §4.1 (anticipated) | Established RU developer slang |
| forbidden-fields list | список запрещённых полей | §4.4 (anticipated) | |
| schema validator | валидатор схемы | §4.4 (anticipated) | |
| audit log | журнал аудита | §4.1 (anticipated) | |
| storage layer | слой хранения | §4.4 (anticipated) | |

## Ethics framework terms

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| Helsinki Declaration | Хельсинкская декларация | §4.7 (anticipated) | |
| informed consent | информированное согласие | §4.1 (anticipated) | |
| GDPR | GDPR (Общий регламент по защите данных ЕС) | §4.7 (anticipated) | Abbreviation kept, RU expansion в скобках первое появление |
| legal basis for data processing | правовое основание для обработки данных | §4.7 (anticipated) | |
| supervisor-as-ethics-oversight | научный руководитель как этический надзор | §4.7 (anticipated) | |
| non-clinical research | неклиническое исследование | §4.7 (anticipated) | |
| low-risk research | малорискованное исследование | §4.7 (anticipated) | |
| right to erasure | право на удаление данных | §4.1 (anticipated) | GDPR Art. 17 «right to be forgotten» |
| right to withdraw | право на отзыв согласия | §4.1 (anticipated) | |
| IRB approval | одобрение IRB | §4.7 (anticipated) | IRB abbreviation kept |

## Privacy / security architecture

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| differential privacy (DP) | дифференциальная приватность (DP) | §4.6 (anticipated) | |
| federated learning | федеративное обучение | §4.6 (anticipated) | |
| ε-DP (epsilon-DP) | ε-DP | §4.6 (anticipated) | |
| local-first | local-first | §4.6 (anticipated) | Often kept as loan; «локально-приоритетный» also acceptable |
| offline-first | offline-first | §4.6 (anticipated) | |
| trust boundary | граница доверия | §4.5 (anticipated) | |
| attack surface | поверхность атаки | §4.5 (anticipated) | Established RU security term |
| audit trail | аудит-след | §4.1 (anticipated) | Также «след аудита» |

## §4.2 design requirements & constraints

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| vendor-analytics model | модель вендор-аналитики | §4.2.1 | |
| post-hoc anonymization release model | модель постхок-анонимизации релиза | §4.2.1 | |
| opt-out terms-of-service framework | opt-out пользовательское соглашение | §4.2.1 | |
| comprehensive telemetry | исчерпывающая телеметрия | §4.2.1 | |
| quasi-identifier combination | комбинация квази-идентификаторов | §4.2.1 | |
| age band | возрастная группа | §4.2.1 | |
| native language | родной язык | §4.2.1 | |
| study schedule | расписание занятий | §4.2.1 | |
| recent immigrants | недавние иммигранты | §4.2.1 | |
| heightened sensitivity to surveillance | повышенная чувствительность к слежке | §4.2.1 | |
| research-ethics norms | нормы исследовательской этики | §4.2.1 | |
| privacy invariant | инвариант приватности | §4.2.1 | |
| outcome-linking step | шаг linking исходов | §4.2.1 | «linking» оставляем как loan word — established в research methodology context |
| participant-initiated | инициированный участником | §4.2.1 | |
| outcome score / exam score | outcome-балл / экзаменационный балл | §4.2.1 | |
| structural constraint | структурное ограничение | §4.2.2 | |
| access layer | уровень доступа | §4.2.1 | |
| runtime gate | runtime-врата | §4.2.1 | Также «врата времени выполнения» |
| individual breakdown | индивидуальная разбивка | §4.2.1 | |
| conservative default | консервативный default | §4.2.1 | «default» как loan |
| right to erasure | право на удаление данных | §4.2.1 | GDPR Art. 17 |
| complete server-side deletion | полное серверное удаление | §4.2.1 | |
| complete local cleanup | полная локальная очистка | §4.2.1 | |
| audit metadata | метаданные аудита | §4.2.1 | |
| audit copies | аудит-копии | §4.2.1 | |
| anonymized analytics summaries | анонимизированные аналитические summary | §4.2.1 | «summary» как loan; «сводки» допустимо в альтернативе |
| disabled by default | отключён по умолчанию | §4.2.2 | |
| reversibility of participation status | обратимость статуса участия | §4.2.2 | |
| separable choice from app usage | выбор, отделимый от использования приложения | §4.2.2 | |
| Origin Private File System (OPFS) | Origin Private File System (OPFS) | §4.2.2 | Technical term, не переводим; при первом появлении — full form + abbreviation в скобках |
| SQLite WebAssembly | SQLite WebAssembly | §4.2.2 | Не переводим |
| cloud-only resources | cloud-only ресурсы | §4.2.2 | |
| daily aggregates | daily aggregates | §4.2.2 | Также «ежедневные агрегаты» допустимо в alternation |
| data steward | data steward | §4.2.2 | Role term, kept as loan; «куратор данных» допустимо в alternation |
| auditable by inspection | поддающийся аудиту путём осмотра | §4.2.2 | |
| compliance bureaucracy | compliance-бюрократия | §4.2.2 | |
| institutional review process | институциональный ревью-процесс | §4.2.2 | |
| mechanism-level transparency | прозрачность на уровне механизмов | §4.2.2 | Парная с policy-level assurance |
| policy-level assurance | гарантия на уровне политик | §4.2.2 | Парная с mechanism-level transparency |
| enforcement mechanism | механизм enforcement'а | §4.2.2 | «enforcement» как loan; «принудительного исполнения» допустимо |
| design space | пространство дизайна | §4.2.2 | |
| forced moves | вынужденные ходы | §4.2.2 | Chess metaphor preserved |
| privacy guarantee | гарантия приватности | §4.2.2 | |
| liability footprint | liability footprint | §4.2.1 | Privacy law term — оставляем как loan; «след юридической ответственности» в альтернативе если supervisor предпочтёт |
| data minimization | минимизация данных | §4.2.1 | GDPR Art. 5(1)(c) principle |

## §4.3 architectural decisions

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| architectural decision | архитектурное решение | §4.3 | |
| forced moves (chess metaphor) | вынужденные ходы | §4.2.2, §4.3 | Already in glossary above |
| falsifiable by inspection | фальсифицируемый путём осмотра | §4.3 | Punchy framing — design contribution defensibility |
| boot hook | boot-хук | §4.3.1 | |
| no-op (verb) | no-op'ить | §4.3.1 | Developer slang; «делать no-op» в alternation |
| pre-checked consent boxes | предзаполненные чекбоксы согласия | §4.3.1 | Dark-pattern term |
| soft opt-in patterns | «soft opt-in» паттерны | §4.3.1 | |
| de-facto authentication token | де-факто аутентификационный токен | §4.3.2 | |
| personally identifiable information (PII) | персонально идентифицируемая информация (PII) | §4.3.2 | Loan abbreviation kept |
| PII-shaped fields | PII-подобные поля | §4.3.2 | |
| payload tree | дерево payload'а | §4.3.2 | |
| server-side mapping table | серверная таблица соответствия | §4.3.2 | |
| identity-linked telemetry | идентичность-привязанная телеметрия | §4.3.2 | |
| allow-list | allow-list | §4.3.3 | Established security term, loan |
| deny-list | deny-list | §4.3.3 | Parallel to allow-list |
| recursive validation | рекурсивная валидация | §4.3.3 | |
| nesting depth | глубина вложенности | §4.3.3 | |
| deep-check | глубокая проверка | §4.3.3 | |
| field path context | field path context | §4.3.3 | Debugging context for HTTP 400 |
| empty-state indicator | empty-state индикатор | §4.3.4 | UX pattern |
| individual breakdown | индивидуальная разбивка | §4.3.4 | Already in glossary above |
| breakdown UI | breakdown UI | §4.3.4 | |
| l-diversity | l-разнообразие | §4.3.4 | k-anonymity extension; Machanavajjhala et al. context |
| t-closeness | t-близость | §4.3.4 | k-anonymity extension; Li et al. context |
| small-cell suppression | подавление малых ячеек | §4.3.4 | Statistical-disclosure-control technique |
| release-time-only filter | release-time-only фильтр | §4.3.4 | |
| participant-initiated linking | инициированное участником связывание | §4.3.5 | |
| voluntary linking | добровольное связывание | §4.3.5 | |
| self-selection mechanism | механизм самовыбора | §4.3.5 | Statistical-bias term |
| linked subsample | связанная подвыборка | §4.3.5 | Already in glossary above |
| outcomes.csv | outcomes.csv | §4.3.5 | Filename, kept literal |
| cascading delete | каскадное удаление | §4.3.6 | |
| atomic rewrite | атомарная перезапись | §4.3.6 | |
| queue for retry | очередь для повтора | §4.3.6 | |
| soft-delete pattern | soft-delete паттерн | §4.3.6 | Database anti-pattern term |
| audit copy | audit-копия | §4.3.6 | |
| material edit | существенная правка | §4.3.7 | Per RESEARCH_CONSENT_RULE taxonomy |
| cosmetic edit | косметическая правка | §4.3.7 | Per RESEARCH_CONSENT_RULE taxonomy |
| semantic version | semantic version | §4.3.7 | Technical term, loan |
| semver comparison | semver-сравнение | §4.3.7 | |
| consent contract | consent-контракт | §4.3.7 | |
| meta-mechanism | мета-механизм | §4.3.7 | |
| version bump | bump версии | §4.3.7 | |
| diagnostic code | диагностический код | §4.3.7 | |
| worked example | проработанный пример | §4.3.7 | |
| five-question decision tree | дерево принятия решений из пяти вопросов | §4.3.7 | |
| reinforcement among decisions | взаимное усиление решений | §4.3.8 | |
| documentation alone (not sufficient) | только через документацию (не достаточно) | §4.3.8 | |

## §4.4 implementation

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| implementation layer | implementation layer | §4.4 | Loan acceptable; «слой реализации» в alternation |
| code as artifact | код как артефакт | §4.4 | |
| direct inspection of running code | прямой осмотр работающего кода | §4.4 | Strong claim — design contribution defensibility |
| trust boundary | граница доверия | §4.4.1 | Already in earlier glossary section |
| format identifier | format-идентификатор | §4.4.1 | |
| top-level keys | top-level ключи | §4.4.1 | |
| identifier shape constraints | ограничения формы идентификаторов | §4.4.1 | |
| violation class | класс нарушений | §4.4.1 | |
| route handler | route handler | §4.4.1 | Web framework term, loan |
| oversized payload | oversized payload | §4.4.1 | |
| file-system layout | файловая раскладка | §4.4.2 | |
| token hash | хэш токена | §4.4.2 | |
| append-only | append-only | §4.4.2 | Established loan |
| atomic file rewrite | атомарная перезапись файла | §4.4.2 | |
| `.tmp` + rename pattern | паттерн `.tmp` + rename | §4.4.2 | Filesystem atomicity convention |
| global UUID search | глобальный поиск UUID | §4.4.2 | |
| cross-cohort withdrawal | межкогортный отзыв | §4.4.2 | |
| companion function | companion-функция | §4.4.2 | |
| OPFS-resident SQLite | OPFS-резидентная SQLite | §4.4.3 | OPFS + SQLite kept as technical terms |
| events table | таблица `events` | §4.4.3 | Schema element |
| failure mode | режим отказа | §4.4.3 | |
| hard fail | hard fail | §4.4.3 | Established loan |
| escalating backoff | возрастающий backoff | §4.4.3 | «backoff» loan; «отступление» допустимо |
| retry queue | очередь повтора | §4.4.3 | |
| diagnostic code | диагностический код | §4.4.3 | Already in earlier glossary section |
| transparency UI | UI прозрачности | §4.4.4 | |
| iterative testing | итеративное тестирование | §4.4.4 | |
| pinned by user feedback | закреплённый user feedback'ом | §4.4.4 | |
| live aggregate | live aggregate | §4.4.4 | Loan; «живой агрегат» допустимо |
| amber-bordered | с амбер-обводкой | §4.4.4 | UI visual element |
| visually distinct | визуально различный | §4.4.4 | |
| load-bearing | несущий | §4.4.4 | Architectural metaphor preserved («load-bearing» = «несущий» в строительной метафоре) |
| preview-as-separate-section pattern | паттерн preview-as-separate-section | §4.4.4 | UX design pattern; kept English in technical glossary |
| reusable design pattern | переиспользуемый дизайн-паттерн | §4.4.4 | |
| purity test | purity-тест | §4.4.4 | |
| `fetch` call | `fetch`-вызов | §4.4.4 | Web API term |
| state mutation | мутация состояния | §4.4.4 | |
| trust-by-demonstration | trust-by-demonstration | §4.4.4 | Punchy paired with falsifiability-by-code |
| falsifiability-by-code | falsifiability-by-code | §4.4.4 | Punchy paired with trust-by-demonstration |
| right to transparency | право на прозрачность | §4.4.4 | Consent-contract aspect |

## §4.5 threat model

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| assets | активы | §4.5.1 | Security/privacy term |
| actors | акторы | §4.5.1 | Также «действующие лица» в alternation |
| data subject | субъект данных | §4.5.1 | GDPR term |
| biographical details | биографические детали | §4.5.1 | |
| infrastructure operator | оператор инфраструктуры | §4.5.1 | |
| actor model | модель акторов | §4.5.1 | |
| overclaim protection | переобещать защиту | §4.5 | |
| acknowledgement of unaddressed threats | признание неустранённых угроз | §4.5 | |
| vendor-side data exfiltration | vendor-стороннее извлечение данных | §4.5.2 | |
| commercial misuse | коммерческое злоупотребление | §4.5.2 | |
| server compromise | компрометация сервера | §4.5.2 | |
| Sweeney 2002-style attack | атака в стиле Sweeney 2002 | §4.5.2 | |
| coarse data fields | грубые поля данных | §4.5.2 | «coarse» в смысле coarse-grained |
| replay attack | replay-атака | §4.5.2 | Также «атака повторного воспроизведения» |
| idempotent dedupe | идемпотентная дедупликация | §4.5.2 | Already in §4.4 glossary |
| withdrawal incompletion | неполнота отзыва согласия | §4.5.2 | |
| consent drift | drift согласия | §4.5.2 | |
| stale contract | устаревший контракт | §4.5.2 | |
| out-of-scope | out-of-scope | §4.5.3 | Loan; «вне скоупа» допустимо |
| paper over | заметать под ковёр | §4.5.3 | Idiomatic |
| insider threat | insider-угроза | §4.5.3 | «внутренняя угроза» допустимо в alternation |
| collusion | сговор | §4.5.3 | |
| out-of-band knowledge | out-of-band знание | §4.5.3 | Loan; «знание вне сетевого канала» в alternation |
| auditable in principle | аудитируемый в принципе | §4.5.3 | |
| compromised device | скомпрометированное устройство | §4.5.3 | |
| log tampering | подделка журнала | §4.5.3 | |
| compromised admin | скомпрометированный админ | §4.5.3 | |
| append-only plaintext | append-only plaintext | §4.5.3 | Already in glossary |
| filesystem access | filesystem-доступ | §4.5.3 | |
| cryptographic hash chain | криптографическая цепочка хэшей | §4.5.3 | |
| Merkle-tree-style audit trail | Merkle-tree-style audit trail | §4.5.3 | Loan; «audit trail в стиле дерева Меркле» в alternation |
| statistical disclosure attack | атака статистического раскрытия | §4.5.3 | |
| l-diversity | l-разнообразие | §4.5.3 | Already in §4.3 glossary |
| t-closeness | t-близость | §4.5.3 | Already in §4.3 glossary |
| attribute disclosure | раскрытие атрибута | §4.5.3 | |
| homogeneous cohort | однородная когорта | §4.5.3 | |
| sensitive attribute | чувствительный атрибут | §4.5.3 | |
| aggregate-only collection | сбор только агрегатов | §4.5.3 | |
| STRIDE methodology | методология STRIDE | §4.5.4 | Microsoft framework, name kept |
| LINDDUN methodology | методология LINDDUN | §4.5.4 | Deng et al. framework, name kept |
| first-principles | first-principles | §4.5.4 | Loan; «от первых принципов» допустимо |
| retrospective mapping | ретроспективное отображение | §4.5.4 | |
| Spoofing (STRIDE) | Spoofing | §4.5.4 | STRIDE category names kept in English (international convention) |
| Tampering (STRIDE) | Tampering | §4.5.4 | |
| Repudiation (STRIDE) | Repudiation | §4.5.4 | |
| Information disclosure (STRIDE) | Information disclosure | §4.5.4 | |
| Denial of service (STRIDE) | Denial of service | §4.5.4 | |
| Elevation of privilege (STRIDE) | Elevation of privilege | §4.5.4 | |
| Linkability (LINDDUN) | Linkability | §4.5.4 | LINDDUN category names kept in English |
| Identifiability (LINDDUN) | Identifiability | §4.5.4 | |
| Non-repudiation (LINDDUN) | Non-repudiation | §4.5.4 | |
| Detectability (LINDDUN) | Detectability | §4.5.4 | |
| Disclosure (LINDDUN) | Disclosure | §4.5.4 | |
| Unawareness (LINDDUN) | Unawareness | §4.5.4 | |
| Non-compliance (LINDDUN) | Non-compliance | §4.5.4 | |
| adversarial-resistant | устойчивый к атакам | §4.5.4 | |
| institutional deployment | институциональное развёртывание | §4.5.4 | |

## §4.6 comparison with alternatives

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| comparison table | таблица сравнения | §4.6 | |
| design space | пространство дизайна | §4.6 | Already in glossary above |
| winner-take-all dominance | доминирование «победитель забирает всё» | §4.6 | |
| context-specific fit | контекст-специфичное соответствие | §4.6 | |
| sparsely populated niche | малозаполненная ниша | §4.6 | |
| privacy-guarantee strength | сила гарантии приватности | §4.6 | |
| research utility | исследовательская польза | §4.6 | Также «research-utility» как loan |
| implementation cost | стоимость реализации | §4.6 | |
| withdrawal mechanism | механизм отзыва | §4.6 | |
| LoC (lines of code) | LoC | §4.6 | Loan abbreviation |
| vendor-private (data) | vendor-private | §4.6 | |
| vendor TOS-dependent | vendor TOS-зависимый | §4.6 | |
| structurally anti-research | структурно anti-research | §4.6 | Punchy framing |
| ε-DP (epsilon differential privacy) | ε-DP | §4.6 | Already in glossary |
| calibrated noise | калиброванный шум | §4.6 | |
| composition tracking | tracking композиции | §4.6 | DP terminology |
| privacy-utility trade-off curve | кривая trade-off приватности и utility | §4.6 | |
| statistically indistinguishable from noise | статистически неотличим от шума | §4.6 | |
| large-N aggregations | large-N агрегации | §4.6 | |
| U.S. Census Bureau OnTheMap | U.S. Census Bureau OnTheMap | §4.6 | Proper name, kept |
| diploma-cohort scale | диплом-когортный масштаб | §4.6 | |
| central coordinator | центральный координатор | §4.6 | Federated learning context |
| gradient update | gradient-апдейт | §4.6 | ML term, loan |
| gradient leakage | утечка градиентов | §4.6 | |
| gradient inversion | инверсия градиентов | §4.6 | |
| predictive-model training | предсказательное обучение моделей | §4.6 | |
| exploratory analytics | exploratory analytics | §4.6 | Loan; «exploratory-аналитика» допустимо |
| client-side machine-learning runtime | client-side ML runtime | §4.6 | Compact form preferred |
| secure-aggregation protocols | протоколы secure-aggregation | §4.6 | Federated learning component |
| realistic threat models | реалистичные модели угроз | §4.6 | |
| MOOC datasets | MOOC-датасеты | §4.6 | Loan abbreviation kept |
| research-data agreements | research-data соглашения | §4.6 | |
| post-hoc anonymization | постхок-анонимизация | §4.6 | Already in §4.2 glossary |
| irreversible release | необратимый release | §4.6 | |
| privacy harm | приватный вред | §4.6 | |
| auxiliary information | вспомогательная информация | §4.6 | Privacy attack literature |
| re-identification attack | атака реидентификации | §4.6 | |
| future adversaries | будущие противники | §4.6 | |
| privacy-maximalist | privacy-максималистский | §4.6 | |
| aggregation capability | способность к агрегации | §4.6 | |
| cohort-level patterns | cohort-level паттерны | §4.6 | |
| structurally incompatible | структурно несовместимый | §4.6 | |
| context-specific niche | контекст-специфичная ниша | §4.6 | |
| absolute sense | абсолютный смысл | §4.6 | |
| larger-N studies | larger-N исследования | §4.6 | |
| institutional deployment | институциональное развёртывание | §4.6 | Already in §4.5 glossary |
| amortize (verb) | амортизироваться | §4.6 | |
| local-only model | local-only модель | §4.6 | |

## §§4.7–4.10 ethics operationalization / reusability / limitations / summary

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| free-floating claims | свободно парящие claim'ы | §4.7 | |
| multi-source ethical framework | многосоставная этическая рамка | §4.7.1 | |
| World Medical Association | Всемирная медицинская ассоциация | §4.7.1 | |
| WMA Helsinki Declaration §22-32 | Хельсинкская декларация ВМА §22-32 | §4.7.1 | Already in earlier glossary; reaffirmed |
| consequential classification | консеквентная классификация | §4.7.1 | |
| IRB-protocol overhead | IRB-протокол-overhead | §4.7.1 | |
| writeback (acceptConsent) | writeback | §4.7.2 | Code-flow term, loan |
| falsifiable ethics enforcement | фальсифицируемое этическое обеспечение | §4.7.2 | Punchy framing — design contribution claim |
| runtime behavior | runtime behavior | §4.7.2 | Loan; «поведение времени выполнения» допустимо |
| permissive open-source licensing | permissive open-source лицензирование | §4.8 | |
| MIT License | MIT License | §4.8 | License name, not translated |
| CC-BY 4.0 | CC-BY 4.0 | §4.8 | License name, not translated |
| wire-format schema | wire-format схема | §4.8 | |
| portable specification | переносимая спецификация | §4.8 | |
| starting point | отправная точка | §4.8 | |
| governance pattern | governance-паттерн | §4.8 | |
| longitudinal opt-in research | longitudinal opt-in исследование | §4.8 | |
| consent contract evolves | consent-контракт эволюционирует | §4.8 | |
| citable example | цитируемый пример | §4.8 | |
| analysis-plan locking | analysis-plan locking | §4.8 | Pre-registration term, loan |
| underpowered single-cohort study | underpowered single-cohort исследование | §4.8 | |
| fork the codebase | форкнуть кодовую базу | §4.8 | |
| broader framework | более широкая рамка | §4.8 | |
| process limitations | процессуальные ограничения | §4.9 | |
| architectural limitations | архитектурные ограничения | §4.9 | |
| methodological limitations | методологические ограничения | §4.9 | |
| scope limitations | ограничения скоупа | §4.9 | |
| independent ethics-review committee | независимый ethics-review committee | §4.9 | |
| supervisor oversight | надзор руководителя | §4.9 | |
| out-of-architecture-scope | out-of-architecture-scope | §4.9 | |
| append-only plaintext | append-only plaintext | §4.9 | Already in earlier glossary |
| cryptographic hash chain | криптографическая цепочка хэшей | §4.9 | Already in earlier glossary |
| compromised admin | компрометированный админ | §4.9 | Already in earlier glossary |
| retention enforcement | retention enforcement | §4.9 | |
| major-version release | major-version релиз | §4.9 | |
| out-of-band confirmation | out-of-band подтверждение | §4.9 | Already in earlier glossary |
| language-level guarantee | language-level гарантия | §4.9 | |
| test drift | drift тестов | §4.9 | |
| privacy impact assessment (PIA) | privacy impact assessment (PIA) | §4.9 | Loan abbreviation kept |
| external scrutiny | внешнее scrutiny | §4.9 | |
| cohort isolation (in schema) | изоляция когорт (в схеме) | §4.9 | |
| cross-cohort analytic paths | cross-cohort analytic пути | §4.9 | |
| federated multi-platform research | federated multi-platform research | §4.9 | |
| open-ended future work | open-ended future work | §4.9 | |
| explicit boundaries | явные границы | §4.9 | |
| scope of applicability | скоуп применимости | §4.9 | |
| methodological contribution (recap) | методологический вклад (recap) | §4.10 | |
| working code | работающий код | §4.10 | |
| externalized as open-source artifacts | оформленный как open-source артефакты | §4.10 | |
| mechanism-level guarantees | mechanism-level гарантии | §4.10 | Punchy phrase, paired with policy-level assurance from §4.2 |
| documented ethical and privacy invariants | задокументированные этические и privacy-инварианты | §4.10 | |

## Chapter 5 methodology terminology

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| empirical methodology | эмпирическая методология | §5 | |
| operationalize architectural commitments | операционализировать архитектурные обязательства | §5.1 | |
| single-cohort correlational study | single-cohort correlational исследование | §5.1 | |
| exploratory by construction | эксплораторен по самой конструкции | §5.1 | |
| power threshold | порог мощности | §5.1, §5.2.3 | Already in earlier glossary; reaffirmed |
| medium-effect correlations | корреляции средних эффектов | §5.1 | |
| effect-size estimate | оценка размера эффекта | §5.1, §5.5.3 | |
| 95% confidence interval | 95% доверительный интервал | §5.1, §5.5.2 | Already in glossary above |
| significance-test ritual | significance-test ритуал | §5.1 | Punchy framing |
| target population | целевая популяция | §5.2.1 | |
| indirect referral | непрямой referral | §5.2.1 | «referral» loan acceptable |
| inclusion criteria | критерии включения | §5.2.2 | |
| exclusion criteria | критерии исключения | §5.2.2 | |
| self-attested | self-attested | §5.2.2 | |
| modern web browser | современный веб-браузер | §5.2.2 | |
| no signal | нет сигнала | §5.2.2 | |
| in attrition | в attrition | §5.2.2 | |
| dogfood UUID | dogfood UUID | §5.2.2 | |
| analysis notebook | analysis notebook | §5.2.2 | |
| opportunistic sampling | opportunistic sampling | §5.2.3 | |
| target enrollment | target enrollment | §5.2.3 | |
| engagement instrument | инструмент измерения вовлечённости | §5.3.1 | |
| six-layer engagement taxonomy | шестислойная engagement-таксономия | §5.3.1 | |
| daily aggregated summary | daily aggregated summary | §5.3.1 | |
| primary outcome variable | primary outcome переменная | §5.3.2 | |
| outcome-CSV interface | outcomes-CSV интерфейс | §5.3.2 | |
| secondary outcome | secondary outcome | §5.3.2 | Already in glossary |
| one-parameter logistic (Rasch) model | one-parameter logistic (Rasch) модель | §5.3.3 | |
| latent ability θ | latent ability θ | §5.3.3 | Theta kept |
| measurement precision | measurement precision | §5.3.3 | |
| expert_judgement_v1 calibration | калибровка expert_judgement_v1 | §5.3.3 | |
| IRT recalibration | IRT recalibration | §5.3.3 | |
| tertiary outcome | tertiary outcome | §5.3.3 | |
| lowest-authority outcome source | outcome source с наименьшей authority | §5.3.4 | |
| cohort provisioning | provisioning когорты | §5.4.1 | |
| non-secret group identifier | non-secret group identifier | §5.4.1 | |
| five-checkbox consent screen | five-checkbox consent screen | §5.4.2 | |
| daily aggregator | daily aggregator | §5.4.3 | |
| minimum-usage requirement | требование minimum-usage | §5.4.3 | |
| participation reminder | participation reminder | §5.4.3 | |
| voluntary disclosure | добровольное раскрытие | §5.4.4 | |
| settling window | settling window | §5.4.5 | |
| frozen analytic dataset | замороженный analytic dataset | §5.4.5 | |
| post-freeze events | post-freeze events | §5.4.5 | |
| narrative form | narrative форма | §5.5 | |
| deviation from preregistration | deviation from preregistration | §5.5 | |
| Pearson product-moment correlation | Pearson product-moment correlation | §5.5.2 | |
| Fisher z-transformation | Fisher z-трансформация | §5.5.2 | |
| confirmatory regression | confirmatory regression | §5.5.2 | |
| standardized β coefficient | стандартизированный β коэффициент | §5.5.2 | |
| omnibus R² | omnibus R² | §5.5.2 | |
| variance-inflation factor (VIF) | variance-inflation factor (VIF) | §5.5.2 | |
| collinearity diagnosis | collinearity diagnosis | §5.5.2 | |
| directionally supported | directionally supported | §5.5.3 | Decision-rule label |
| directionally consistent but underpowered | directionally consistent but underpowered | §5.5.3 | Decision-rule label |
| no evidence of large effect | no evidence of large effect | §5.5.3 | Decision-rule label |
| confirmatory regime | confirmatory режим | §5.5.4 | |
| high-dimensional screening | high-dimensional screening | §5.5.4 | |
| HARKing prohibition | HARKing prohibition | §5.5.4, §5.5.10 | |
| post-fit diagnostics | post-fit diagnostics | §5.5.5 | |
| inferential gate | inferential gate | §5.5.5 | |
| Shapiro-Wilk test | Shapiro-Wilk test | §5.5.5 | |
| Q-Q plot | Q-Q plot | §5.5.5 | |
| residuals-vs-fitted scatter | residuals-vs-fitted scatter | §5.5.5 | |
| loess smoothing | loess smoothing | §5.5.5 | |
| Breusch-Pagan test | Breusch-Pagan test | §5.5.5 | |
| Cook's distance | Cook's distance | §5.5.5 | |
| Spearman ρ | Spearman ρ | §5.5.5, §5.5.9 | |
| Huber-White heteroscedasticity-consistent (HC3) | Huber-White heteroscedasticity-consistent (HC3) | §5.5.5 | |
| sensitivity check | sensitivity check | §5.5.5 | |
| underpower as design constraint | underpower как design constraint | §5.5.6 | |
| structural constraint | структурное ограничение | §5.5.6 | Already in earlier glossary |
| effect-size estimation framing | effect-size estimation framing | §5.5.6 | |
| Missing-Not-At-Random (MNAR) | Missing-Not-At-Random (MNAR) | §5.5.8 | Statistical-missingness terminology |
| listwise deletion | listwise deletion | §5.5.8 | |
| mean substitution | mean substitution | §5.5.8 | |
| multiple imputation | multiple imputation | §5.5.8 | |
| missingness rate | missingness rate | §5.5.8 | |
| Kolmogorov-Smirnov test | Kolmogorov-Smirnov test | §5.5.9 | |
| forgetting-curve effects | forgetting-curve effects | §5.5.9 | |
| outlier-resistant | outlier-resistant | §5.5.9 | |
| operational definition | operational definition | §5.6 | |
| interactive engagement | interactive engagement | §5.6.1 | Punchy framing |
| total exposure time | total exposure time | §5.6.1 | |
| passive listening | passive listening | §5.6.1 | |
| under-counting | under-counting | §5.6.1 | |
| stub Trainer | stub Trainer | §5.6.2 | |
| recommended review layer | recommended review layer | §5.6.2 | |
| proxy framing | proxy framing | §5.6.2 | |
| Anki Connect bidirectional sync | Anki Connect bidirectional sync | §5.6.2 | |
| derived metric | derived metric | §5.6.3 | |
| canonical formula | canonical formula | §5.6.3 | |
| per-device privacy architecture | per-device privacy архитектура | §5.6.4 | |
| server-side identity mapping | server-side identity mapping | §5.6.4 | |
| verification method | verification method | §5.6.4 | |
| day boundary | day boundary | §5.6.5 | |
| daylight savings | daylight savings | §5.6.5 | |
| acknowledged minor distortion | acknowledged minor distortion | §5.6.5 | |
| sampling unit | sampling unit | §5.7 | |
| over-claiming generalization | over-claiming generalization | §5.7 | |
| methodological framework | методологическая рамка | §5.7 | |
| empirical generalization | empirical generalization | §5.7 | |
| ethics framework declared | объявленная этическая рамка | §5.8 | |
| consent timestamp and version | consent timestamp и version | §5.8 | |
| auditable artifact | auditable артефакт | §5.8 | Already in glossary |
| methodological limitations | методологические ограничения | §5.9 | Already in glossary |
| over-claiming the strength | over-claiming strength | §5.9 | |
| intellectually dishonest | intellectually dishonest | §5.9 | |
| methodological lens | methodological lens | §5.10 | |
| significance-test verdict | significance-test verdict | §5.10 | |

## Chapter 3 system-design terminology

| EN | RU | Зафиксирован § | Notes |
|---|---|---|---|
| privacy-preserving workspace | privacy-preserving workspace | §3.1 | Product positioning |
| Progressive Web Application (PWA) | Progressive Web Application (PWA) | §3.1, §3.3.2 | Already in glossary; reaffirmed |
| data sovereignty | суверенитет данных | §3.1 | Architectural philosophy |
| Hebrew-as-first-language | иврит-как-первый-язык | §3.1 | Punchy framing |
| localization afterthought | локализационная пристройка | §3.1 | |
| iterative refinement | итеративное уточнение | §3.1 | |
| pedagogical observations | педагогические наблюдения | §3.1 | |
| friction points | точки трения | §3.1 | |
| up-front specification | up-front спецификация | §3.1 | |
| major version cycle | major-version цикл | §3.2 | |
| server-mediated storage model | server-mediated storage model | §3.2 | |
| stateful server endpoints | stateful серверные endpoint'ы | §3.2 | |
| 410 Gone | 410 Gone | §3.2 | HTTP status, kept |
| premium polish | premium polish | §3.2 | |
| self-hosted fonts | self-hosted шрифты | §3.2 | |
| RTL stability | RTL stability | §3.2 | |
| mixed-content rows | mixed-content rows | §3.2 | |
| CSS surface | CSS surface | §3.2, §3.6.4 | |
| mega-release | mega-release | §3.2 | |
| polymorphic typed-graph notes | полиморфные typed-graph notes | §3.2, §3.4.4 | Already in earlier glossary; reaffirmed |
| three-mode text-card sharing | three-mode система text-card sharing | §3.2 | |
| bulk builder | bulk-builder | §3.2, §3.4.5 | |
| peer-share via lightweight JSON | peer-share через lightweight JSON | §3.2, §3.4.5 | |
| curator request | curator request | §3.2, §3.4.5 | |
| Standard-vs-Curated split | Standard-vs-Curated split | §3.4.5 | |
| morphological dictionary | морфологический словарь | §3.2, §3.4.2 | |
| hspell-derived | hspell-derived | §3.3, §3.4.2 | |
| Service Worker bucket | Service Worker bucket | §3.3.2, §3.4.2 | |
| MORPH_CACHE | MORPH_CACHE | §3.3.2 | Cache bucket name, kept |
| multicohort teacher dashboard | multicohort teacher dashboard | §3.3 | |
| cross-text "Where occurs" hub | cross-text «Где встречается» hub | §3.3, §3.4.8 | |
| calibrated diagnostic quiz | calibrated диагностический квиз | §3.2 | Already in earlier glossary; reaffirmed |
| provisional sign-off | provisional sign-off | §3.2 | |
| Anki Connect bidirectional sync | Anki Connect bidirectional sync | §3.2 | Already in glossary |
| premium SRS Trainer | premium SRS Trainer | §3.2 | |
| FSRS algorithm | FSRS algorithm | §3.2 | Spaced-repetition algorithm name, kept |
| audio-anchored review | audio-anchored review | §3.2 | |
| dogfood prototype | dogfood прототип | §3.2 | |
| auto-text backbone | auto-text backbone | §3.2 | |
| render-don't-blank | render-don't-blank | §3.2 | UX invariant |
| quick-link opening flow | quick-link opening flow | §3.2 | |
| cohort lockstep | cohort lockstep | §3.2 | |
| WebAssembly | WebAssembly | §3.3.1 | Kept as is |
| wa-sqlite | wa-sqlite | §3.3.1 | Library name, kept |
| relational query capability | relational query capability | §3.3.1 | |
| server hop | серверный hop | §3.3.1 | |
| credentials-protecting proxy | credentials-protecting прокси | §3.3.3 | |
| API key | API key | §3.3.3 | |
| pre-checked consent boxes | предзаполненные чекбоксы согласия | §3 | (Already in earlier glossary) |
| iterative process | итеративный процесс | §3.3.4 | |
| concise polished documentation | concise polished документация | §3.3.4 | |
| domain architecture | доменная архитектура | §3.4 | |
| affordance | affordance | §3.4 | Loan from HCI / Norman; «возможность» в alternation |
| ulpan-style row-by-row work | ульпан-style row-by-row работа | §3.4.1 | |
| niqqud (vowel marks) | никуд (vowel marks) | §3.4.1 | |
| mixed-content bdi isolation | mixed-content `bdi` isolation | §3.4.1 | Web typography term |
| bidi-bugs | bidi-bags | §3.4.1 | Bidirectional text bugs |
| computationally non-trivial | computationally нетривиально | §3.4.2 | |
| binyan / root / person / number / gender / tense | биньян / корень / лицо / число / род / время | §3.4.2 | Hebrew grammar terminology |
| local-first pre-computed | local-first pre-computed | §3.4.2 | |
| MorphProvider provider abstraction | MorphProvider provider abstraction | §3.4.2 | Already in earlier glossary |
| consumer-side API | consumer-side API | §3.4.2 | |
| probabilistic disambiguation | probabilistic disambiguation | §3.4.2 | |
| WaveNet voice family | WaveNet voice family | §3.4.3 | Google Cloud TTS voice family |
| daily quota | daily quota | §3.4.3 | |
| daily reset | daily reset | §3.4.3 | |
| neural translation | neural translation | §3.4.3 | |
| below-acceptable | ниже-acceptable | §3.4.3 | |
| adult-learner pedagogical use | adult-learner pedagogical use | §3.4.3 | |
| audio-anchored | audio-anchored | §3.4.4 | |
| edit history retained | история редактирования retained | §3.4.4 | |
| destructive overwrite | destructive overwrite | §3.4.4 | |
| `[[note]]` cross-reference | `[[note]]` cross-reference | §3.4.4 | |
| autocomplete resolution | autocomplete resolution | §3.4.4 | |
| SRS micro-card | SRS micro-card | §3.4.4 | |
| identical study materials | идентичные учебные материалы | §3.4.5 | |
| scientific comparability | научная сопоставимость | §3.4.5 | |
| creation and linkage layer | слой creation и linkage | §3.4.6 | |
| minimum-viable stub | minimum-viable стаб | §3.4.6 | |
| recommended review layer | recommended review слой | §3.4.6 | Already in earlier glossary |
| `srs_cards` polymorphic with card_kind | `srs_cards` полиморфный с `card_kind` | §3.4.6 | |
| `source_note_id` back-pointer | `source_note_id` back-pointer | §3.4.6 | |
| local read-only visualization | локальная read-only визуализация | §3.4.7 | |
| `note_link_suggestions` | `note_link_suggestions` | §3.4.7 | Table name |
| retrieval-practice instrument | retrieval-practice instrument | §3.4.7 | Punchy framing |
| shared-root / shared-lemma / shared-binyan candidates | shared-root / shared-lemma / shared-binyan candidates | §3.4.7 | |
| confirm / defer / reject | confirm / defer / reject | §3.4.7 | Confirm-panel actions |
| privacy-quiet by design | privacy-quiet by design | §3.4.7 | Punchy framing |
| inverted index | inverted index | §3.4.8 | |
| lazy build | lazy build | §3.4.8 | |
| architectural exception | архитектурное исключение | §3.5 | |
| `/api/research/v1/*` namespace | namespace `/api/research/v1/*` | §3.5 | Already in glossary |
| categorically different | категориально отличный | §3.5 | |
| transparently replicated | transparently реплицируемый | §3.5 | |
| module boundary | module boundary | §3.5 | |
| explicit imports | explicit imports | §3.5 | |
| scaling architecture | архитектура масштабирования | §3.5 | |
| Stages 1–5 | Stages 1–5 | §3.5 | |
| dual-mode UX | dual-mode UX | §3.6.1 | |
| accordion-cards layout | accordion-cards layout | §3.6.1 | |
| row-by-row navigation | row-by-row navigation | §3.6.1 | |
| Live State preview | Live State preview | §3.6.1 | |
| multi-pane layout | multi-pane layout | §3.6.1 | |
| playlist queue | playlist queue | §3.6.1 | |
| search-anywhere | search-anywhere | §3.6.1 | |
| keyboard-driven workflow | keyboard-driven workflow | §3.6.1 | |
| presentational distinction | presentational различие | §3.6.1 | |
| mobile-first refactor | mobile-first refactor | §3.6.2 | |
| chip-based filter selectors | chip-based filter selectors | §3.6.2 | |
| grid layout | grid layout | §3.6.2 | |
| modal scrollability | modal scrollability | §3.6.2 | |
| dark theme refinement | dark theme refinement | §3.6.2 | |
| bottom tab bar | bottom tab bar | §3.6.2 | |
| commutes or breaks | commutes или breaks | §3.6.2 | |
| component-framework decomposition | component-framework decomposition | §3.6.4 | |
| single Service Worker entry | single Service Worker entry | §3.6.4 | |
| paired-edit conventions | paired-edit conventions | §3.6.4 | |
| named regions | named regions | §3.6.4 | |
| schema migrations | schema migrations | §3.7.1 | |
| migration runner | migration runner | §3.7.1 | |
| risky migrations | risky migrations | §3.7.1 | |
| append-only file | append-only file | §3.7.2 | |
| restart-recovery | restart-recovery | §3.7.2 | |
| replay (in restart) | replay | §3.7.2 | |
| `(text, voice, params)` cache key | `(text, voice, params)` ключ кэша | §3.7.3 | |
| zero recurring server cost | нулевая recurring серверная цена | §3.7.3 | |
| storage management UI | storage management UI | §3.7.3 | |
| smoke runner | smoke runner | §3.8 | |
| tag-pinning | tag-pinning | §3.8 | |
| hotfix branch | hotfix branch | §3.8 | |
| frozen tag | frozen tag | §3.8 | |

## Premium-stack supplementary analyses (V5 + V3 + V1 + V2)

Terminology introduced by the 2026-05-22 premium-stack roadmap (TOST equivalence, multitrait-multimethod construct, Bayesian sensitivity, and multi-cohort meta-analysis). All entries pre-registered on OSF deviation log §§9.1–9.4.

| EN | RU | § | Notes |
|---|---|---|---|
| TOST (two one-sided tests) | TOST (два односторонних теста) | V5 §6.3.5, §7.4 | Lakens 2017 equivalence-test framework |
| equivalence test | тест эквивалентности | V5 §6.3.5 | Tests whether effect is bounded within ±SESOI |
| SESOI (smallest effect size of interest) | SESOI (наименьший интересующий размер эффекта) | V5 §6.3.5 | Pre-registered SESOI = 0.5 for diploma |
| equivalence bound | граница эквивалентности | V5 §6.3.5 | ±SESOI in r-space |
| bounded-effect statement | утверждение об ограниченном эффекте | V5 §7.4 | Positive reframing of null finding |
| Lakens 2017 | Lakens 2017 | V5 | Foundational TOST paper |
| Bayesian posterior | байесовский апостериор | V1 §6.3.6 | Posterior distribution on ρ |
| credible interval (CrI) | credible interval (доверительный интервал в байесовской интерпретации) | V1 §6.3.6 | Bayesian analogue of frequentist CI |
| Bayes factor (BF₁₀) | Bayes factor (BF₁₀) | V1 §6.3.6 | Evidence ratio vs null ρ = 0 |
| JZS prior | JZS prior (Jeffreys-Zellner-Siow Cauchy) | V1 §6.3.6 | Default `BayesFactor::correlationBF` prior |
| weak-informative skeptical prior | weak-informative скептический приор | V1 §6.3.6 | N(0, 0.3²) — locked Prior B |
| literature-anchored prior | literature-anchored приор | V1 §6.3.6 | N(0.3, 0.2²) — locked Prior C |
| prior-sensitivity transparency | прозрачность чувствительности к приорам | V1 §6.3.6 | Three-prior reporting framework |
| posterior probability of direction | posterior probability of direction (вероятность направления) | V1 §6.3.6 | P(ρ > 0 \| data, prior) |
| HARKing | HARKing (Hypothesising After Results are Known) | V1, V2 | Locked-prior / locked-protocol prevention |
| multitrait-multimethod | multitrait-multimethod (мультипризнак-мультиметод) | V3 §6.7.1 | Campbell & Fiske 1959 framework |
| construct pluralism | плюрализм мер конструкта | V3 §6.7.1, §7.4 | Three operational definitions of engagement |
| audio_exposure_minutes | audio_exposure_minutes | V3 §6.7.1 | Passive listening proxy (derived from audio_play_ms_total) |
| text_exposure_minutes | text_exposure_minutes | V3 §6.7.1 | Passive reading proxy (text_open/text_close pairs + imputation) |
| orphan opens (text exposure) | orphan opens (открытия без закрытия) | V3 §6.7.1 | text_open without matching text_close → 5-min imputation |
| intercorrelation matrix | intercorrelation matrix | V3 §6.7.1 | Multitrait-multimethod construct-validity artifact |
| Campbell & Fiske 1959 | Campbell & Fiske 1959 | V3 | Foundational multitrait-multimethod paper |
| MCREMA | MCREMA (Multi-Cohort Random-Effects Meta-Analysis) | V2 §7.8 | Pooled effect estimate across K cohorts |
| random-effects meta-analysis | мета-анализ со случайными эффектами | V2 §7.8 | Acknowledges between-cohort heterogeneity |
| REML | REML (Restricted Maximum Likelihood) | V2 protocol §2 | Locked estimator for `metafor::rma()` |
| DerSimonian-Laird | DerSimonian-Laird | V2 protocol §2 | Sensitivity-check estimator |
| τ² (tau-squared) | τ² (тау-квадрат) | V2 protocol §3 | Between-cohort variance of true effects |
| I² (I-squared) | I² (I-квадрат) | V2 protocol §3 | % variance from heterogeneity (Higgins et al. 2003) |
| Cochran Q | Q-тест Cochran | V2 protocol §3 | Homogeneity test |
| forest plot | forest plot | V2 protocol §7 | Per-cohort + pooled visual artifact |
| funnel plot | funnel plot | V2 protocol §7 | Publication-bias diagnostic (relevant K ≥ 4) |
| pooled effect estimate | объединённая оценка эффекта | V2 §7.8 | Random-effects pooled r with back-transform from Fisher z |
| Fisher z transformation | Fisher z (трансформация) | V1, V2 | `atanh(r)` for inference on Pearson r |
| cumulative-evidence rule | cumulative-evidence rule (правило накопительных свидетельств) | V2 protocol §5 | Anti-HARKing: report per-cohort AND pooled |
| deidentified cohort label | деидентифицированный cohort label | V2 protocol §6 | `cohort_001/002/...` non-reversible from cohort_code |
| minimum K rule | minimum K rule | V2 protocol §4 | K ≥ 3 cohorts for valid pooled inference |
| K-curve | K-curve (K-кривая) | V2 protocol §7 | Pooled CI half-width vs K — verification artifact |
| protocol contribution | протокольный вклад | V2 §7.8 | Diploma ships protocol + infrastructure; execution future |
| OSF deviation log | OSF deviation log | §9 | Timestamped supplementary-analysis registrations |
| supplementary confirmatory | supplementary confirmatory | V5, OSF §9.1 | Pre-registered alongside primary; can confirm |
| supplementary exploratory | supplementary exploratory | V1, V3, OSF §9.2/§9.4 | Pre-registered alongside primary; descriptive only |

---

## Stylistic conventions

- **Quotation marks:** EN uses `"..."`; RU uses `«...»` (French quotes,
  Russian academic convention).
- **Dashes:** EN uses em-dash `—` for parenthetical insertion; RU also
  uses em-dash `—` with spaces around it.
- **Bullet points:** identical in both languages.
- **Code references:** identical in both languages (e.g.
  `research/validate.js`).
- **DOIs / URLs:** identical в both languages, no translation.
- **Numerical formats:** EN uses period for decimal (3.14); RU uses
  comma traditionally (3,14) — **но в thesis EN we keep period for
  consistency with EN canonical**. Document this in stylistic note.

---

## Append rules

При добавлении новой записи:

1. **EN column** — exact term как используется в EN file.
2. **RU column** — canonical RU equivalent.
3. **§ column** — section number где term first appears (для traceability).
4. **Notes column** — context, alternative translations, rationale если non-obvious.

Если term появляется в RU file BEFORE the matching EN — нарушение
workflow, нужно sync (см. `docs/THESIS_BILINGUAL_WORKFLOW.md` §8 drift
detection).

---

**Last updated.** 2026-05-22 (Chapter 3 drafting complete — added 100+
entries for system-design terminology: architectural philosophy /
v3.0-3.7 evolution / OPFS+SQLite-WASM / PWA / cloud-only resources /
domain architecture (text editor / morphology / TTS / notes / text-card /
SRS / smart graph / cross-text hub) / research-mode integration /
dual-mode UX / mobile redesign / teacher dashboard / data architecture /
build+deployment. **Chapters 3 + 4 + 5 drafts complete; total glossary
450+ canonical mappings.**).
