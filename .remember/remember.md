# Handoff

## State
CLG-P6 слайс 2 (`/explain sentence`) SHIPPED v3.11.109. Приватность решена владельцем
ДО кода (норма соблюдена): consent = ОТДЕЛЬНЫЙ durable `agent_read_texts` (сервер
требует cloud_texts && agent_read_texts на каждый вызов, fail-closed 403, точные коды;
first-use confirm в модале; revoke → purge контентных полей agent_explanations до
tombstone) + scope СТРОГО `sentence_only` (явный enum; соседи/абзац → 400;
db/agentSentenceRepo.js физически извлекает одну строку — learnerArtifactsRepo остался
opaque). Полный контракт владельца: docs/planning/AGENT_EXPLAIN_PRIVACY_DECISION_2026_07_06.md.
Реализация: agent/explainer.js (детерминированное ядро → LLM только формулирует, R1;
LLM-less fallback) · facts_used-провенанс 4 факта · get_sentence_context_if_available
включён · POST /api/agent/explain · purge-hook в /api/auth/consent · UI: чекбокс 🤖 в
☁-модале + per-row 🤖 только на своих текстах + модал результата (textContent-only) ·
i18n +15×3 · PRIVACY.md-аддендум · SW v3.11.109.

## Gates (все зелёные)
smoke:agent-explain 33/33 (НОВЫЙ) · agent-plan 26/26 · agent-llm-provider 18/18 ·
auth 26/26 · learner-graph 14/14 · artifact-sync 11/11 · cloud-sync 32/32 · i18n 226 ·
api-smoke. Скриншоты 380px: ☁-модал с 🤖-чекбоксом + confirm + результат — чистые.

## Next
1. **Owner live-verify /explain на реальном профиле:** свой текст → синк → per-row 🤖 →
   first-use confirm → объяснение (llm_used:true); revoke-путь: снять галочку 🤖 в ☁ →
   «Сохранённые объяснения очищены». Per-row кнопка headless не проверялась (OPFS-трап) —
   только live.
2. Real-provider burst-verify на /explain (паттерн слайса 1).
3. Misconception construct-id субстрат (§7) — последний пункт P6.
4. Telegram (P7) — не раньше G-5.

## Context
- Ledger персистентен между бутами smoke (тот же DATA_DIR) — ассерты «до/после», не
  абсолютные нули.
- exportBundle-shape артефакта: texts[].rows[] {order_index, hebrew_plain, hebrew_niqqud,
  translit, russian}; agentSentenceRepo принимает и shape C (sentences[]/he_plain) защитно.
- Для /explain наружу уходит контент пользователя ⇒ при смене AGENT_OPENROUTER_MODEL
  перепроверять data-policy карточки (train-on-free-tier = недопустимо, прецедент Poolside).
