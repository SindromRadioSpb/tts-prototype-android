# STATUS — живой леджер программы hermes-education-scaleup

Единственный канонический источник статусов. Каждая Codex-сессия ОБЯЗАНА обновить свою строку
(11_HANDOFF §2.7). Статусы: PLANNED → IN_PROGRESS → ENGINEERING_COMPLETE → OWNER_LIVE → CLOSED;
отдельно BLOCKED / NO-GO / SKIPPED (с причиной). Вердикт владельца: 1–5 + комментарий.

Обновлено: 2026-07-22 (H1.6 LRCLIB acceptance 3/3; field coverage 2/5; ENGINEERING_COMPLETE).

## Горизонт 1 — статус: IN_PROGRESS (H1.0/H1.4 CLOSED; H1.1–H1.3/H1.5–H1.6 engineering complete; owner-live pending)

| Слайс | Промт | Статус | Гейты | Вердикт владельца | Ссылки/заметки |
|---|---|---|---|---|---|
| H1.0 Trainer policy | prompts/H1_01_TRAINER_POLICY_AND_GUARDRAILS.md | CLOSED | global SOUL reproduction PASS; ordinary new-chat S1–S5 5/5; owner-live 3 scenarios PASS | 5/5 — все ответы соответствовали ожиданиям | automatic activation PASS with `personality:null`; `hermes-side/h1.0/` |
| H1.1 Разговорная сессия | prompts/H1_02_CONVERSATION_SKILL.md | ENGINEERING_COMPLETE | gemini-3.6-flash A–C 3/3; live body ACTIVE/GRANTED/OK; personal-first smoke PASS | — | B is simulation only; owner-live: ≥2 real sessions + verdict 1–5; `hermes-side/h1.1/` |
| H1.2 Письмо WCF | prompts/H1_03_WRITING_WCF_SKILL.md | ENGINEERING_COMPLETE | reproduction PASS; gemini-3.6-flash A–C 3/3; EPHEMERAL PASS; installed hash matches canon | — | owner-live: ≥2 real cycles with revision + verdict 1–5; `hermes-side/h1.2/` |
| H1.3 Ретроспектива SRL | prompts/H1_04_WEEKLY_SRL_SKILL.md | ENGINEERING_COMPLETE | reproduction PASS; gemini-3.6-flash A–C 3/3; pending proposal visible; installed hash matches canon | — | owner-live: 2 weekly cycles over ≥2 calendar weeks + verdict 1–5; `hermes-side/h1.3/` |
| H1.4 Sefaria MCP | prompts/H1_05_SEFARIA_MCP.md | CLOSED | official hosted SSE connected; 15 tools visible; A–C 3/3; owner-live successful | H1.4 завершено успешно (числовая оценка не указана) | `hermes-side/h1.4/` |
| H1.5 YouTube-transcript | prompts/H1_06_YOUTUBE_TRANSCRIPT_MCP.md | ENGINEERING_COMPLETE | `@nadimtuhin/ytranscript@1.3.0`; 2 tools allowlisted; gemini-3.6-flash A–C 3/3; auto-caption warning PASS | — | owner-live: 1 real user-selected video fragment + verdict; `hermes-side/h1.5/` |
| H1.6 LRCLIB | prompts/H1_07_LRCLIB_INTEGRATION.md | ENGINEERING_COMPLETE | 2 tools allowlisted; gemini-3.5-flash-lite A–C 3/3; typed errors PASS; field coverage 2/5 | — | owner-live: 1 real song timestamp analysis + verdict 1–5; `hermes-side/h1.6/` |
| H1.7 kaikki+wordfreq | prompts/H1_08_KAIKKI_WORDFREQ_DATASETS.md | PLANNED | — | — | ∥ |
| H1.8 Owner-live+closure | prompts/H1_09_OWNER_LIVE_AND_CLOSURE.md | PLANNED | — | — | строго последний |

**G-H1-CLOSURE: не пройден.**

## Горизонт 2 — статус: BLOCKED UNTIL H1 CLOSURE + owner go (Д5)

| Слайс | Промт | Статус |
|---|---|---|
| H2.1 get_word_morphology | prompts/H2_01_GET_WORD_MORPHOLOGY.md | BLOCKED |
| H2.2 get_text_coverage | prompts/H2_02_GET_TEXT_COVERAGE.md | BLOCKED |
| H2.3 W1-семейство + goal-store | prompts/H2_03_W1_PROPOSE_FAMILY.md | BLOCKED |
| H2.4 Dicta Nakdan | prompts/H2_04_DICTA_NAKDAN.md | BLOCKED |
| H2.5 ivrit.ai ASR MCP | prompts/H2_05_IVRIT_AI_ASR.md | BLOCKED |
| H2.6 Async voice loop | prompts/H2_06_ASYNC_VOICE_LOOP.md | BLOCKED |
| H2.7 Owner-live+closure | prompts/H2_07_OWNER_LIVE_AND_CLOSURE.md | BLOCKED |

**G-H2-START: не запрошен. G-H2-CLOSURE: не пройден.**

## Горизонт 3 — статус: R&D-чартеры, каждый ждёт owner go (Д6) после G-H2-CLOSURE

| Чартер | Статус |
|---|---|
| C1 Pronunciation scoring | NOT_STARTED |
| C2 Realtime voice | NOT_STARTED |
| C3 MC-glosses в Зале | NOT_STARTED |
| C4 S4 агент+②-заметки | NOT_STARTED |
| C5 Phase-2 exposure weighting | NOT_STARTED |

## P11 Платформенный трек — статус: ОТДЕЛЬНАЯ ОПЦИЯ, не запущен (Д3)

## Открытые owner decisions

См. 00 §2: Д1 (хранение продукции), Д2 (Spotify), Д3 (P11), Д4 (платные ресурсы),
Д5 (go H2 — после H1 closure), Д6 (per-charter H3), Д7 (raw audio — default не хранить).

## Журнал решений

| Дата | Решение | Кто |
|---|---|---|
| 2026-07-21 | Направление утверждено (OWNER-APPROVED DIRECTION/PLANNING); пакет создан | владелец / Claude |
| 2026-07-22 | H1.0 owner-live: 3 сценария пройдены, verdict 5/5; слайс CLOSED | владелец |
| 2026-07-22 | H1.1: reproduction PASS, acceptance 1/3; после нескольких skill-text итераций BLOCKED, установленный skill откатан | Codex |
| 2026-07-22 | H1.1 rerun на gemini-3.6-flash: reproduction PASS, A–C 3/3; ENGINEERING_COMPLETE, owner-live pending | Codex |
| 2026-07-22 | H1.1 clarification: B typed denial was simulation only; live personal-text connection ACTIVE, scope GRANTED, body read OK; skill made explicit personal-first | Codex |
| 2026-07-22 | H1.2 writing WCF: reproduction PASS, A–C 3/3, EPHEMERAL PASS; ENGINEERING_COMPLETE, owner-live pending | Codex |
| 2026-07-22 | H1.3 weekly SRL: reproduction PASS, A–C 3/3, propose-then-confirm PASS; ENGINEERING_COMPLETE, owner-live pending | Codex |
| 2026-07-22 | H1.4 official Sefaria MCP: 15 tools visible, A–C 3/3, privacy/provenance PASS; ENGINEERING_COMPLETE, owner-live pending | Codex |
| 2026-07-22 | H1.4 owner-live: владелец сообщил «H1.4 завершено успешно»; CLOSED без выдуманной числовой оценки | владелец / Codex |
| 2026-07-22 | H1.5 YouTube transcript MCP: local stdio server, 2-tool allowlist, A–C 3/3, auto-caption warning PASS; ENGINEERING_COMPLETE, owner-live pending | Codex |
| 2026-07-22 | H1.6 LRCLIB: preflight PASS; engineering started | Codex |
| 2026-07-22 | H1.6 LRCLIB: local FastMCP wrapper, A–C 3/3, real-playlist coverage 2/5; ENGINEERING_COMPLETE, owner-live pending | Codex |
