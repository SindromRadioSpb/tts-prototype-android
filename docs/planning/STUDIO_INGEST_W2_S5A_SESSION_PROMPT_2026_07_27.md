# Промт для новой сессии: Wave 2 продолжение — слайс S5a

> **Что это.** Готовый стартовый промт следующей сессии программы мульти-модального инжеста
> (паттерн W2-S4: brainstorm → дизайн на утверждение → writing-plans → subagent-driven-development
> с ревью каждой задачи и финальным whole-branch ревью до пуша). Скопировать целиком в новую сессию.
>
> **Статус-контекст на момент написания (2026-07-27):** W1 (v3.11.242) + W2-S4 (v3.11.246) +
> S4.1 (v3.11.247) + S4.2 видео-файлы (v3.11.248-249) — SHIPPED, owner-accepted.

---

```
Продолжаем Wave 2 программы мульти-модального инжеста. Канон:
docs/planning/STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md
(§2 сценарии, §4 волны, §3 архитектура A browser-first BYOK, §5 CLG-доктрина,
§7 живой статус: W1 + W2-S4/S4.1/S4.2 SHIPPED+owner-accepted).
Паттерн исполнения — docs/planning/STUDIO_INGEST_W2_S4_IMPLEMENTATION_PLAN_2026_07_26.md
(SDD: транспорт-спайк GO/NO-GO первой задачей, имплементер-на-задачу, ревью каждой
задачи, финальное whole-branch ревью ДО пуша) + дизайн-док S4 как образец.

Следующий слайс W2 = S5a: видео-URL С субтитрами → таблица + сегмент-караоке из
VTT-тайминга (карооке-инфраструктура S4 переиспользуется: формат [{o,t}] unit:'row',
studio-media-karaoke.js, seg-режим /api/translate-table). После S5a — S10 (PWA
share_target) и S11 (graded-пересказ) отдельными слайсами.

Инварианты: browser-first BYOK (серверного Gemini-ключа НЕТ); любой новый серверный
fetch — только через ssrfGuard-класс защиты (R14); честный сегмент-уровень, НИКАКОГО
word-level (R11); бейдж провенанса «авто-субтитры» + derived≠asserted (R9); лимиты и
смета в UI до запуска (R16); he-ru путь, renderTable и Зал byte-parity НЕ трогать;
ключи AIza|AQ.; новые UI-строки → все три локали ru/en/he + SW bump.

Новые факты для развилок S5a:
(а) S5b-lite УЖЕ работает — видео-ФАЙЛ транскрибируется через Files API
    (v3.11.248: mediaResolution LOW, честная смета ×2,5) — ценность S5a именно в
    БЕСПЛАТНОМ и точном VTT-тайминге + удобстве «вставил ссылку»;
(б) главный риск слайса — добыча субтитров БЕЗ yt-dlp (анти-приоритет пакета):
    YouTube timedtext/innertube хрупок; caption-fetch = новая серверная поверхность
    (R14) — это ключевая развилка, начни с её разведки-спайка (GO/NO-GO как в S4);
(в) честный тупик-fallback уже жив: «субтитров нет → загрузите файл» (S5b-lite путь).

Начни со скилла brainstorming: сними живой код (ingest/routes.js + ssrfGuard.js,
public/js/studio-import.js, studio-media-karaoke.js, seg-режим translate-table в
server.js + ingest/segTable.js), разведай caption-источники, реши развилки S5a
(транспорт субтитров и платформы v1; парсер VTT→сегменты; маппинг VTT-кьюв в
[{o,t}]; auto-caption качество → бейдж), покажи дизайн на утверждение, потом
writing-plans → subagent-driven-development. Работай на main, коммить+пуш,
прод-верифай (linguistpro.kolosei.com).
```

---

Примечания владельцу: (1) деплой-ловушка disk-full рецидивирует ~раз в месяц — если пуш
не деплоится >5 мин, см. память feedback_coolify_deploy_ops (диагноз df -h, prune, ретриггер);
(2) прод-ключ AGENT_GEMINI_API_KEY без prepay-кредитов — агентские LLM-фичи лежат до пополнения
(на BYOK-инжест не влияет).
