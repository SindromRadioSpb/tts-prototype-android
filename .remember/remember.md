# Handoff

## State
CLG-P9 «дом наставника» SHIPPED v3.11.114 (2026-07-06) по decision-доку
docs/planning/MENTOR_HOME_P9_DECISION_2026_07_06.md (статус реализации — в конце дока).
- Сервер: GET /api/agent/explanations (purge-aware list, rowid-курсор newest-first,
  tombstone честный) + GET /api/agent/constructs/summary (facts_used kind='constructs'
  + plan-task construct_ids — добавлены в planner-payload; ⊆ реестра, серверные титулы).
- Клиент: public/js/mentor-home.js — API-only модуль (UMD, textContent-only, dir=auto,
  tap-ⓘ) + host-adapter (runTrainer=startPlanSectionTraining · openReading ·
  openTextAt→scrollToOrderIdx; OPFS-резолв на стороне хоста) = скелет Mini App P8.
- Зал: 🤖 в шапке → #roomMentorView (roomContent↔roomReader-паттерн, [hidden]-guard,
  history.replaceState, hashchange + boot deep-link #mentor); ☁-модал вернулся к
  синку/пушу/аккаунту (план, consent агента, статус-строка переехали в дом);
  due-CTA скрыт поверх вида. i18n room.mentor.* ru/en/he; SW v3.11.114.

## Gates
mentor-home 25/25 (новый) · agent-plan 30/30 · agent-explain 42/42 · burst 19/19 ·
auth 26/26 · learner-graph 14/14 · reader-parity · room 14/14 · i18n 226 · api-smoke ·
cloud-sync (см. ниже). Скриншоты scripts/premium/mentor-home-shot.js →
.tmp/mentor-shots (Tier-1/light/dark/HE-RTL/deep-link ✓).

## Next
0. ✅ Owner live-verify P9 ПРОЙДЕН 2026-07-06 → CLG-P9 закрыта.
1. **Пред-P7 программа (грейдер-стек)** — readiness-анализ READ FIRST:
   docs/planning/TELEGRAM_P7_READINESS_2026_07_06.md. G-5 пройден; блокеры P7 /review:
   annul реплей-нейтрален (обратимость R17-B) · нет серверного детерминированного
   грейдера · нет gold-набора · record_review_answer skeleton. Стадирование:
   P7.0a annul → P7.0b грейдер+gold → P7.0c активация tool (web-smoke до Telegram)
   → P7.1 pairing+channel_links+webhook+read-only команды → P7.2 /review.
2. Развилки владельца ДО кода: топология webhook (реком. in-process роут) ·
   privacy-копия «доставка через серверы Telegram» (не покрыта agent_read_texts) ·
   журнал действий (agent_tasks vs threads/messages) · проактивность MVP.
3. Границы прежние: НЕ sentence_plus_neighbors без измерений; P7.0a трогает канон
   памяти → adversarial-critique перед кодом (feedback_adversarial_role_critique).

## Context
- cloud-sync гейт шёл долго (2 прогона убиты преждевременно по ложной CPU-диагностике —
  рендереры Chrome не дети smoke-процесса); третий прогон — вердикт в логе
  session-scratchpad/cloudsync.log. Проба «боевого» пути (boot+login+append+fullSync
  на library.html?canon=skip) — зелёная, приложение не виснет.
- Якорь ленты: sentence_id='<text_key>#<order_index>' парсится по ПОСЛЕДНЕМУ '#'.
- constructs/summary: purged-объяснения выпадают по построению (facts_used='[]'),
  plan-вхождения (класс A) переживают revoke — это гейт-ассерт.
