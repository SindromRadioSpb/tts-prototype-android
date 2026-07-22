# STATUS — живой леджер программы hermes-education-scaleup

Единственный канонический источник статусов. Каждая Codex-сессия ОБЯЗАНА обновить свою строку
(11_HANDOFF §2.7). Статусы: PLANNED → IN_PROGRESS → ENGINEERING_COMPLETE → OWNER_LIVE → CLOSED;
отдельно BLOCKED / NO-GO / SKIPPED (с причиной). Вердикт владельца: 1–5 + комментарий.

Обновлено: 2026-07-23 (H1.8 closure-аудит: owner qualitative PASS принят, но ≥2-недельное окно и оценки 1–5 не доказаны; H1 не закрыт).

## Горизонт 1 — статус: IN_PROGRESS (H1.0 CLOSED; H1.1–H1.7 OWNER_LIVE; H1.8 BLOCKED ON OWNER WINDOW EVIDENCE)

| Слайс | Промт | Статус | Гейты | Вердикт владельца | Ссылки/заметки |
|---|---|---|---|---|---|
| H1.0 Trainer policy | prompts/H1_01_TRAINER_POLICY_AND_GUARDRAILS.md | CLOSED | global SOUL reproduction PASS; ordinary new-chat S1–S5 5/5; owner-live 3 scenarios PASS | 5/5 — все ответы соответствовали ожиданиям | automatic activation PASS with `personality:null`; `hermes-side/h1.0/` |
| H1.1 Разговорная сессия | prompts/H1_02_CONVERSATION_SKILL.md | OWNER_LIVE | gemini-3.6-flash A–C 3/3; live body ACTIVE/GRANTED/OK; owner qualitative PASS | «прошло успешно»; оценка 1–5/окно не записаны | ≥2 real sessions + metrics; `hermes-side/h1.1/` |
| H1.2 Письмо WCF | prompts/H1_03_WRITING_WCF_SKILL.md | OWNER_LIVE | reproduction PASS; A–C 3/3; EPHEMERAL PASS; owner qualitative PASS | «прошло успешно»; оценка 1–5/окно не записаны | ≥2 revised cycles + metrics; `hermes-side/h1.2/` |
| H1.3 Ретроспектива SRL | prompts/H1_04_WEEKLY_SRL_SKILL.md | OWNER_LIVE | reproduction PASS; A–C 3/3; owner qualitative PASS | «прошло успешно»; две календарные недели/оценка не доказаны | 2 dated weekly cycles + adherence; `hermes-side/h1.3/` |
| H1.4 Sefaria MCP | prompts/H1_05_SEFARIA_MCP.md | OWNER_LIVE | official hosted SSE; 15 tools; A–C 3/3; owner qualitative PASS | «H1.4 завершено успешно»; числовая оценка не указана | rating 1–5 required by closure; `hermes-side/h1.4/` |
| H1.5 YouTube-transcript | prompts/H1_06_YOUTUBE_TRANSCRIPT_MCP.md | OWNER_LIVE | 2 tools; A–C 3/3; auto-caption warning PASS; owner qualitative PASS | «прошло успешно»; видео/оценка 1–5 не записаны | real fragment evidence; `hermes-side/h1.5/` |
| H1.6 LRCLIB | prompts/H1_07_LRCLIB_INTEGRATION.md | OWNER_LIVE | 2 tools; A–C 3/3; coverage 2/5; owner qualitative PASS | «Протестировано успешно»; числовая оценка не указана | rating 1–5 required; `hermes-side/h1.6/` |
| H1.7 kaikki+wordfreq | prompts/H1_08_KAIKKI_WORDFREQ_DATASETS.md | OWNER_LIVE | offline A–C 3/3; repair PASS; bounded owner retest PASS | «готово»; `שקר`/`חלק`; числовая оценка не указана | rating 1–5 required; `hermes-side/h1.7/` |
| H1.8 Owner-live+closure | prompts/H1_09_OWNER_LIVE_AND_CLOSURE.md | BLOCKED | preflight audit complete; `hermes-side/h1.8/EVIDENCE.md` | — | ≥2-week metrics + numeric verdicts + combined integration analysis + cost confirmation |

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
| 2026-07-22 | H1.6 owner-live: владелец сообщил «Протестировано успешно»; CLOSED без выдуманной числовой оценки | владелец / Codex |
| 2026-07-22 | H1.7 kaikki+wordfreq: preflight PASS; engineering started | Codex |
| 2026-07-22 | H1.7 kaikki+wordfreq: offline mini-MCP, network-off PASS, A–C 3/3, manifest complete; ENGINEERING_COMPLETE, owner-live pending | Codex |
| 2026-07-23 | H1.7 owner-live found output truncation before Kaikki tool execution; compact payload + one-lookup-per-turn + ≤2-lookups free-tier repair installed; local/install PASS, gemini-3.6-flash E2E blocked by repeated external 429; owner retest pending | владелец / Codex |
| 2026-07-23 | H1.7 owner-live repair retest: two sequential due lemmas (`שקר`, `חלק`) completed with correct Zipf, Wiktionary attribution, non-canonical/exposure boundaries and no state mutation; owner reported «готово»; CLOSED without invented numeric score | владелец / Codex |
| 2026-07-23 | Owner confirmed earlier H1.1–H1.3/H1.5 tests were successful; qualitative verdicts recorded without invented numeric scores | владелец / Codex |
| 2026-07-23 | H1.8 closure audit: all engineering artifacts present, prod-code diff 0, consent/W1 evidence PASS; G-H1-CLOSURE blocked because installed window is <2 days, per-loop 1–5 ratings/metrics and combined integration analysis are absent; H1.1–H1.7 returned to OWNER_LIVE per gate 10 §1 | Codex |
