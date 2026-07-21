# 07 — Данные, consent, провенанс, безопасность (единая модель доверия)

Опирается на живую механику: классы данных A–D + PERSONAL-tier, per-scope церемония согласия,
standing text-grant (мигр. 051), exposure-леджер (мигр. 053, TTL 45д), tombstone-delete
(sync-hardening P1), proposals-леджер. Ничто ниже не заменяет существующее — только расширяет.

## 1. Категории данных

| Категория | Owner | Source of truth | Класс | Consent/scope | Write-path | Retention | Export/Delete | Revoke/Tombstone | Audit |
|---|---|---|---|---|---|---|---|---|---|
| Canonical learner truth (review_log, FSRS state, word_status) | владелец | append-only review_log; state=производный кэш | A | агент: только проекции (review.items.read и др.) | ТОЛЬКО первопартийные детерминированные пути; агент — никогда (W0) | вечно | общий экспорт/удаление | синк-механика c tombstones | oracle replay==stored |
| Agent-visible projections (brief, due-items, profile, delta, coverage†) | владелец | серверные проекции | A | per-scope read | производные, не пишутся | эфемерны (генерация на запрос) | n/a | revoke scope → мгновенно | rate-limiter + access-лог |
| Личные тексты (каталог+тела) | владелец | OPFS→artifact-sync | C/PERSONAL | standing grant (мигр. 051) + scopes S1/S2 | владелец в Студии | по владельцу | да (существующий) | grant revoke; residual-знание метится exposure-провенансом | exposure-леджер 053 |
| Agent-generated suggestions (proposals всех kind†) | владелец | proposals-леджер | B | intent.*-scopes | агент создаёт PENDING; исполняет ТОЛЬКО сервер после owner confirm | TTL 14д (PENDING→EXPIRED) | да | reject/expire; исполненное — по правилам целевой категории | полный (id, время, вердикт) |
| Produced-output: черновики письма, реплики речи | владелец | — (EPHEMERAL, Д1) | C† | нет хранения → нет scope; при будущем Д1-решении: новый scope `personal.production.*` + церемония | нет | чат-история Hermes (вне LinguistPro) | n/a до Д1 | n/a | n/a |
| Raw voice audio | владелец | — (НЕ хранится, Д7) | — | — | voice-inbox → ASR → удаление файла | минуты | n/a | n/a | факт транскрипции в логе ASR-обёртки (без контента) |
| Transcripts (ASR) | владелец | чат-сессия (ephemeral) | C† | внутри Hermes; в LinguistPro не попадают без W1 | — | сессия | n/a | n/a | caveat POSSIBLE_ASR_ERROR в propose |
| WCF-аннотации (разборы ошибок) | владелец | чат (ephemeral) | C† | — | — | сессия | n/a | n/a | — |
| Weekly goals (goal-store, H2.3†) | владелец | таблица weekly_goals | A | goal.read; создание — propose+confirm | сервер после confirm; правка/закрытие — только владелец в UI | пока владелец не удалил | да (класс A общий механизм) | удаление строки; tombstone в общем синке не требуется (server-only таблица) | source+proposal_id в строке |
| External content (LRCLIB/YouTube/Sefaria/kaikki) | третьи стороны | внешние сервисы | — | не learner-данные | импорт в Библиотеку ТОЛЬКО через propose_import_text | кеш Hermes-side | n/a | R11: не перезаписывает канон | origin+url в proposal |
| Exposure events | владелец | agent_text_exposures (053) | A-мета | — (служебные) | единственная точка экстракции | TTL 45д (ops-sweep) | — | живут независимо от гранта (residual-честность) | сам леджер и есть аудит |

† — появляется в H2; до того категория пуста. Coverage помечен PERSONAL: раскрывает состояние знания.

## 2. Провенанс: семь различений (инвариант промта) — где что фиксируется

| Различение | Механизм |
|---|---|
| Что прочитал пользователь | review_log/study_day + reading-статистика (первопартийные) |
| Что показал Hermes | exposure-леджер (тексты, окна); H2+: evidence:"AGENT_SHOWN_ONLY" в propose_track_word |
| Что произвёл пользователь | H1: только чат; H2: evidence:"USER_PRODUCED_*" в proposals |
| Что исправил агент | чат (ephemeral); в канон не попадает |
| Что подтверждено владельцем | proposals-леджер: status CONFIRMED + время |
| Что попало в канон | целевые записи с провенанс-полями (imported_via_agent_proposal, source:"AGENT_PROPOSED_OWNER_CONFIRMED", niqqud_provenance) |
| Что осталось ephemeral | всё остальное — by default, не by exception |

## 3. Scopes: новые vs переиспользуемые (сводно для H2)

| Инструмент | Scope | Новый? | Tier |
|---|---|---|---|
| get_word_morphology | morphology.read | новый | STANDARD (словарь, не learner-данные) |
| get_text_coverage | learner.coverage.read | новый | PERSONAL |
| propose_import_text | intent.import_text.propose | новый | PERSONAL |
| propose_track_word | intent.track_word.propose | новый | PERSONAL |
| propose_goal | intent.goal.propose | новый | STANDARD |
| get_current_goal | goal.read | новый | STANDARD |
| (существующие 15 scopes) | — | переиспользуются как есть | — |

Принцип: granular revoke — по одному scope на способность; intent.propose существующего
propose_action НЕ расширяется новыми kind (Ф2: не мутировать живые контракты).

## 4. Consent-церемонии H2

Каждый новый scope — отдельная карточка согласия (существующий механизм), с честной формулировкой
что именно открывается и что НЕ открывается (образец: consent-карта S2 «помечаются только
предложения, которые агент реально читал»). Обязательные тексты карточек — deliverable слайса
H2.3 (i18n: ru/en/he + SW bump). Отзыв любого scope мгновенно закрывает инструмент
(типизированный отказ), не трогая остальные.

## 5. Security-инварианты (без изменений, перечислены для Codex)

- OAuth MCP-мост: существующий (token-exchange, loopback 8765); новые инструменты не открывают
  новых сетевых поверхностей LinguistPro.
- Hermes-side: gateway 127.0.0.1-only; WebUI за паролем через Tailscale; секреты — в env/volume,
  не в git и не в skills-текстах.
- ASR-обёртка: path-валидация voice-inbox, никакого доступа к произвольным путям.
- Внешние MCP: только поисковые термины наружу (правило 19 политики 06); ключей LinguistPro у
  внешних обёрток нет by construction.
- Prod-координаты — только в .claude/PROD_OPS_PRIVATE.md (gitignored); Codex-промты ссылаются на
  файл, не на значения.
