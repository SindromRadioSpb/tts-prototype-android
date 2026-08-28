# PHYSICS-YEAR1-R12 — implementation evidence

Дата: 2026-08-28
Production target: `3.11.444`
Authority: `OWNER_APPROVAL_PHYSICS_YEAR1_R12_2026_08_28`

## Content and identity

- Задач: 74/74.
- Edition: `ed_c345975244ff7bd33d86fcb9`, №2.
- Manifest SHA-256: `6926876557b93e984180a27a6cda01076b64a4649ff7287d4edd7ab35cbdde1b`.
- Production anchor: `production-publication-anchor.json` — 74 exact work/snapshot/source-image bindings.
- Runtime manifest: `physics/year1-support/manifest.json`; каждый shard проверяется по bytes + SHA-256 до парсинга.
- План прав агента: 74 факта, SHA-256 `43cedcf8be2b31cbbcfa65eb45d0d7266d39a8e6f54023294141719f9bc8f451`.

## Verified gates

- `tests/physicsLearningSupport.test.js`: 3/3 — полнота, bounded output, fail-closed drift.
- `tests/physicsLearningSupportUi.test.js`: 2/2 — actions в карточке и Reader, RU/EN/HE, version lockstep.
- `tests/publicationAgentAccess.test.js`: migration 066, exact rights, Agent projection и output contract.
- `tests/publicCorpusAdapter.test.js`: exact UI payload validation и snapshot drift rejection.
- `tests/i18n.smoke.js --write-lock`: 233/233; locale cache rev 185.
- `agent-access-domain-smoke.js`: 56 checks, 31 capabilities, 0 network/provider/live reads.
- `agent-access-mcp-smoke.mjs`: 76 checks, 31 tools, both supported MCP protocols, stateless.
- `agent-access-publication-consent-browser-smoke.mjs`: RU/EN/HE, 380 px, RTL, keyboard focus, 0 owner writes.
- `physics-learning-support-smoke.js`: temporary DB, flag-off 404, flag-on 200, immutable ETag/304, unknown work 404, rights dry-run 0 + apply/read-back 74, 74 task anchors, anonymous browser.
- Browser: answer-first, full walkthrough, 380 px no overflow, 380 px full-screen, Hebrew RTL.

## Visual evidence

- `implementation/screenshots/physics-learning-card-answer-desktop-ru.png`
- `implementation/screenshots/physics-learning-solution-desktop-ru.png`
- `implementation/screenshots/physics-learning-exam-desktop-ru.png`
- `implementation/screenshots/physics-learning-solution-380-ru.png`
- `implementation/screenshots/physics-learning-solution-380-he-rtl.png`

These are isolated-browser fixtures, not production or owner-profile evidence.

## Data boundary

The new public GET route is anonymous, immutable and read-only. The MCP tool returns reviewed Russian Markdown only. Neither path reads or writes learner progress, review log, grades, notes, personal texts, group corpora, proposals, or external provider state.

## Production status

Публичный пользовательский путь закрыт живой production-приёмкой; подробный журнал, backup/restore, DB read-back, 74/74 API-сверка и production screenshots находятся в `PHYSICS_YEAR1_LEARNING_SUPPORT_R12_PRODUCTION_EVIDENCE_2026_08_28.md`.

Агентский код, scope, migration 066 и 74 exact `DERIVATIVE_TEXT=true` facts находятся в production. Глобальные production flags `AGENT_ACCESS_OAUTH_CLIENTS_ENABLED` и `AGENT_ACCESS_MCP_ENABLED` остаются default-off: их включение активировало бы весь 31-tool Agent Access, а не только Physics, и относится к отдельным gate 5+ программы `LINGUISTPRO_ALL_CORPORA_AGENT_ACCESS_MCP_DECISION_PACKET_2026_08_26.md`. Поэтому Hermes owner-live acceptance не заявлена; она требует отдельного разрешённого включения owner-only MCP, нового consent и реального вызова инструмента.

## Addendum 2026-08-29 — owner-only runtime closure

The paragraph above records the release-time state and remains historical. After explicit owner approval, the two global production gates were enabled and Hermes re-consented to all 27 scopes. Release `3.11.447` (`c2ae0fd6`) also corrected the 81-character Physics consent-key rejection and added an exact regression.

Server-layer checks discovered all 31 tools. A completely new ordinary Hermes WebUI session `aedb86a4562d` then recorded `tool.started` and `tool.completed` for `mcp__linguistpro__read_published_learning_support`; the completion had `is_error=false` for the exact Physics task 1.1 edition item. Classification: `OWNER_REPORTED_PASS` for the owner's Hermes profile only. No Inspector/OpenAI/Claude/community readiness is inferred.
