# Аудит предпосылок зрелого наставника

Дата: 2026-09-29. Код: `390486d3`; `HEAD...origin/main = 0/0` после fetch.
Метод: целевой просмотр исходников/канона, read-only Docker-диагностика, публичный браузер, официальные внешние источники. Новые модельные вызовы, обучение на owner data, нагрузочный benchmark и изменения runtime не выполнялись.
Выводы использованы в [продуктовом плане](../../../planning/MENTOR_BYOA_PRODUCT_PLAN_2026_09_29.md) и [очереди реализации](../../../planning/MENTOR_BYOA_EXECUTION_2026_09_29.md).

## 1. Что подтверждено

| ID | Свидетельство | Вывод и граница |
| --- | --- | --- |
| E01 | `public/js/studio-agent.js:967–1120`: notes queue, `KnowledgeMapQuizLoader.open({mode:'frontier'})`, `/api/agent/study-summary` | Первые два пункта «Материала» используют локальные детерминированные механизмы; только summary здесь LLM. Одинаковая AI-обёртка скрывает различие сценариев |
| E02 | `studio-agent.js`, `library-ui.js`: explain/comprehension/draft-retell/talk | Это реальные API-пути; считать всё отсутствующей заглушкой технически неверно. Пользовательская незрелость и низкая полезность не опровергаются наличием кода |
| E03 | `agent/llm.js`, `agent/llmGate.js` | Текущий agent provider path содержит Gemini/OpenRouter/mock/неполный Claude, per-request BYOK и quota gate. Подключения Hermes/Codex OAuth в этом пути нет |
| E04 | `server.js:3081–3217` | Часть недоступности LLM маппится в 503, ошибки BYOK — 502. Сообщённая владельцем 402 не воспроизведена в его авторизованной сессии; по числу 402 нельзя установить отсутствующий ключ или провайдера |
| E05 | `mentor-connection-core.js`: `ORDER`, `linked`, `aiGranted`; публичный `#mentor` | В мастере AI_CONSENT заблокирован до Telegram, Telegram — до sync. Это доказанная UX-зависимость, а не вывод о запрете всех AI backend-вызовов |
| E06 | `mentor-home.js`: render функций плана, истории, constructs, nextText, writing, lesson builder, memory, evidence, settings | Экран объединяет много разных функций; требуется учебная иерархия, а не ещё одна карточка чата |
| E07 | `agent/memory/contracts.js` | F1 имеет два типа: goal/thread; lifecycle и provenance есть. Полноценная learner model из пяти измерений не реализована этим модулем |
| E08 | `agent/evidence/contracts.js`, `agent/constructs.js` | F2 — shadow B1/B2; constructs — channel gaps и распознавание биньянов. Это начало, не полный грамматический syllabus/mastery graph |
| E09 | `agent/grader.js`, `docs/PROJECT_ROLES.md` R17 | Детерминированное оценивание и канонический review writer — существующий инвариант; LLM feedback не получает право самостоятельно выставлять mastery |
| E10 | `agent/access/capabilities.js` | 31 объявленная capability, включая morphology, coverage, due, personal/group/publication, proposals. Это статический inventory, не число tools действующего авторизованного сеанса |
| E11 | `agent/access/productionHandlers.js:421–428` | `get_learner_profile` возвращает mode/language/depth/generated_at. CEFR, native language и грамматическая компетентность этим контрактом не подтверждаются |
| E12 | Docker `hermes version` | `Hermes Agent v0.18.2 (2026.7.7.2)`, upstream `bd37ff91`, install method docker |
| E13 | Docker ps/image inspect | Agent image `nousresearch/hermes-agent:latest`, local image created 2026-07-16; WebUI `linguistpro/hermes-webui-c2:20260725-1`, healthy. Тег latest не означает обновлённый образ |
| E14 | Mount inventory | Общий home volume `hermes_agent_hermex-hermes-home`; отдельный source volume `hermes_agent_hermex-agent-src`, read-only у WebUI. Обновление Agent без обновления source boundary может оставить несовместимый код |
| E15 | Только несекретные поля config | Основной provider `openrouter`, model `openrouter/free`, fallback_configured=false. Сам факт auth.json не доказывает активный Codex OAuth |
| E16 | Gateway-side `hermes mcp test linguistpro` от пользователя hermes с правильным HERMES_HOME | Connection failed: требуется browser authorization в non-interactive context. После ошибки CLI также вывел `RuntimeError: Event loop is closed`. Живого успешного tools/list и нового owner-chat PASS в этой сессии нет |
| E17 | Stat token file без чтения значений | MCP token file присутствует, uid/gid 1000:1000, mode 0600. Не нужно чинить права вслепую; требуется отдельно восстановить авторизацию |
| E18 | Windows HTTP `http://127.0.0.1:8787/health` | WebUI health OK, active streams/runs 0 в момент проверки; это не доказательство работоспособности модели/MCP |
| E19 | Исторический Hermes STATUS и compose | «◉ Разговор» — C2, Gemini Live experimental product, frozen educational/realtime research UNDERPOWERED. Сохранить extension/proxy/sidecar и источник результата при обновлении |
| E20 | Публичный браузер Зала | Нажатие «Наставник» открывает journey ACCOUNT→SYNC→TELEGRAM→AI. Браузер был гостевым, показывал v3.11.689 и ожидающее обновление; это не owner acceptance и не no-cache production audit |

DevTools-попытка открыть `127.0.0.1:8787` показала старую страницу LinguistPro, в то время как прямой Windows HTTP вернул Hermes health. Различие браузерного окружения/кэша не разрешено; этот браузерный loopback не используется как доказательство UI Hermes. Пользовательские browser storage и service workers не очищались.

## 2. Предшественники, которые нужно использовать

- [AI strategy 2026-07-11](../../../planning/ai_agent_education_strategy_2026_07_11/15_EXECUTIVE_RECOMMENDATION.md): reading-led цикл, bounded AI, независимый transfer. Это датированное предложение, не автоматическое разрешение всех работ.
- [F1/F2 preparation packet](../../../planning/LINGUISTPRO_WAVE2_BOUNDED_PREPARATION_DECISION_PACKET_2026_07_17.md): существующие F1/F2, handoff flags/consent, отсутствие права превращать shadow в learner truth.
- [Hermes scaleup STATUS](../../../planning/hermes-education-scaleup/2026-07-21/STATUS.md): owner-live skills/мorphology/coverage/proposals, C1/C2 и незавершённые longitudinal gates. Исторические мониторинги июля–августа не считаются завершёнными автоматически.
- [I5 connection implementation](../../../planning/LINGUISTPRO_MASS_ACCESS_I5_MENTOR_CONNECTION_IMPLEMENTATION_2026_08_19.md): уже сделанный progressive journey. Новый продукт меняет зависимость Telegram, а не создаёт второй account/sync writer.
- [Материальные ссылки](../../../planning/LINK_ARCHITECTURE_2026_09_29.md): использовать существующие идентичности/deep links.
- Локальный `G:/HERMES_AGENT/HERMEX_SETUP.md`: deployment и ограниченный PKCE recovery, запрет flood reconnect во время login, порядок рестартов, защита skills.

## 3. Проверка утверждений из исходного обсуждения

| Утверждение | Оценка |
| --- | --- |
| Hermes поддерживает ChatGPT/Codex OAuth | Подтверждено документацией Hermes [S2]; OpenAI подтверждает subscription login в Codex [S1]. Локально пока выбран OpenRouter |
| Достаточно включить OAuth, чтобы заработали кнопки LinguistPro | Нет: существующие кнопки используют другой LLM path [E03]. Нужен транспорт UI→личный runtime |
| Можно всем пользователям дать кнопку ChatGPT и использовать одну подписку сервера | Не основа этого проекта. Владелец выбрал индивидуальный доступ. Проверенные документы не устанавливают универсальное право публичного SaaS на пользовательский Codex inference |
| Подписка покрывает голос, TTS и любые инструменты | Не подтверждено. ASR/TTS имеют отдельные provider settings [S5]; доступ и расходы проверять отдельно |
| F1 уже представляет полную модель ученика | Нет [E07/E11]. Цели/нити полезны, но не mastery |
| NLP даёт безусловно верные языковые факты | Нет: сохранять resolver provenance и ambiguity. Например, неогласованное היה без контекста и ошибочные ASR-субтитры требуют осторожной интерпретации |
| Пять открытий перевода означают слабое знание | Гипотеза, не оценка. Клик может означать интерес, проверку оттенка или случайность; подтверждать попыткой |
| Один Hermes profile на каждого пользователя автоматически масштабирует SaaS | Profiles изолируют состояние [S4], но не доказывают нагрузочную модель. В BYOA runtime принадлежит пользователю; сервер масштабирует transport/control/data |
| Нужны несколько независимых наставников | Пользовательские роли полезны; несколько автономных memories/graders создают противоречия. Сначала один согласованный tutor и role contracts |
| Обновлённый voice mode заменит «◉ Разговор» | Не установлено. README WebUI описывает voice input; C2 реализует отдельный live-диалог и педагогические ограничения [E19/S6] |

## 4. Внешние источники

Проверены 2026-09-29; документация меняется. В продуктовый контракт не переносить «latest» и списки моделей без capability check.

- **S1 — OpenAI, [Authentication](https://developers.openai.com/codex/auth/)** (редирект в ChatGPT Learn). Подтверждает раздельные subscription/API-key способы входа; для programmatic workflows рекомендует API-key path и предупреждает о публичном/untrusted исполнении. Не устанавливает право универсального SaaS-проксирования через личную подписку. Это ограничение доказательной базы, а не выдуманное юридическое заключение.
- **S2 — Hermes, [LLM and Model Providers](https://hermes-agent.nousresearch.com/docs/integrations/providers/)**. Документирует provider `openai-codex`, browser/device OAuth и отдельное хранилище авторизации. В таблице subscription semantics детали учёта плана отмечены not currently documented. Поэтому подтверждать отсутствие paid fallback и фактический entitlement отдельно; не обещать безлимитность.
- **S3 — Hermes, [Releases](https://github.com/NousResearch/hermes-agent/releases)**. На проверенной странице последний release — 0.21.5 / `v2026.9.24`, commit `f97608f`. Docker tag опубликован в release notes. Наличие локального старого `latest` не проверяет registry update.
- **S4 — Hermes, [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles/)**. Профили разделяют конфигурацию/память/сессии; OAuth refresh нельзя размножать независимым копированием. Это важно для staging: не запускать копии реального auth-store конкурентно.
- **S5 — Hermes, [Voice Mode](https://hermes-agent.nousresearch.com/docs/user-guide/features/voice-mode/)**. STT и TTS имеют собственные провайдеры, включая локальные и API; текстовый OAuth не является доказательством бесплатного realtime.
- **S6 — Hermes WebUI, [README: compatibility and voice](https://github.com/nesquena/hermes-webui)**. Описывает voice input и тесную связь WebUI с внутренними модулями Agent. Рекомендует согласованный upgrade/pinning; общий agent-src volume — отдельный migration concern. Не утверждает, что C2 LinguistPro перенесён upstream.
- **S7 — Hermes, [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/)**. Подтверждает программный доступ к runtime и сессиям. Возможный адаптер; не доказательство готового безопасного multi-tenant relay или совместимости установленного 0.18.2.
- **S8 — Karpicke & Roediger, [The Critical Importance of Retrieval for Learning](https://learninglab.psych.purdue.edu/downloads/2008/2008_Karpicke_Roediger_Science.pdf), Science 2008, DOI 10.1126/science.1152408.** В эксперименте с иностранной лексикой повторное извлечение улучшало отсроченное воспроизведение. Основание включить самостоятельные попытки; не доказательство эффективности конкретного AI-наставника иврита.
- **S9 — Bastani et al., [Generative AI without guardrails can harm learning](https://doi.org/10.1073/pnas.2422633122), PNAS 2025.** Проверена индексированная аннотация издателя; полное открытие упёрлось в cookie gate. Исследование школьной математики предупреждает о разнице между выполнением с AI и последующей самостоятельной работой. Не переносить размеры эффекта на иврит; полная статья в этой сессии не прочитана.

Из S8/S9 следует проектная гипотеза: измерять отсроченную самостоятельную работу, дозировать помощь и не считать сгенерированный ответ учебным успехом. Для утверждения образовательного преимущества LinguistPro нужен собственный эксперимент.

## 5. Непроверенное и следующий способ проверки

| Вопрос | Как проверить |
| --- | --- |
| Точная причина owner 402 | Один исходный запрос в авторизованном браузере: endpoint/status/typed error/provider route; без сохранения ключа/тела личного текста |
| Какая Codex-модель доступна владельцу и как учитывается лимит | Явный OAuth в личном runtime, capability/usage read, один ограниченный тест после входа |
| Работает ли MCP после обновления | Правильный runtime user, scopes/tools/list, новая обычная сессия и реальный read-only tool call; отдельная owner приёмка |
| Замена C2 upstream | Сравнить обе реализации по duplex/interrupt/HE+RU/mobile/audio routing/consent и учебному поведению, сохранить при отсутствии эквивалентности |
| Массовая готовность OAuth LP | Revoke/expiry/isolation/multi-user pilot; текущий owner allowlist не объявлять общим доступом |
| Качество грамматики и оценок | Независимая Hebrew gold-редактура, benchmark, затем отсроченная практика пользователей |
| Реальная стоимость BYOA | Замер relay/support/traffic/storage и готовности пользовательских runtime; не оценивать только цену токена |

**Итог аудита:** основания для зрелого продукта есть; главные недостающие мосты — единая учебная сессия/контекст, обратный канал к личному runtime, понятное подключение, грамматические контракты и доказательство учебного результата. Подмена этих мостов ещё одним свободным чатом не завершает задачу.
