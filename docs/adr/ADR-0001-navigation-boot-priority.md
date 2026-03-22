# ADR-0001 — Navigation boot priority: hash > query > session

Статус: Accepted  
Дата: 2026-01-18  
Patch ID: ADR-NAV-BOOT-PRIORITY-01  
Владелец: Navigation / Premium PRO

---

## 1) Контекст и проблема

Приложение имеет несколько источников “куда открыть” при загрузке/рефреше:

1) Deep link в hash: `/#/t/<base64url(json_target)>` (shareable, детерминируемый):contentReference[oaicite:7]{index=7}  
2) Legacy query params (переходный формат совместимости):contentReference[oaicite:8]{index=8}  
3) Session restore (локальный контекст пользователя из sessionStorage), напр. `v3SearchSession`:contentReference[oaicite:9]{index=9}  
4) Default landing (Dashboard/Library)

Без явного приоритета возникают дефекты:
- “Открыл ссылку, а попал в старый экран из прошлой сессии”
- “Ссылка битая — но UI молча открыл что-то другое”
- “Legacy параметры конфликтуют с hash/session — поведение непредсказуемо для агентов и smoke”

Нужно решение, которое:
- предсказуемо (deterministic)
- согласуется с контрактом deep link decode/validate/resolveTarget
- сохраняет backward compatibility, но не подрывает истинность deep link

---

## 2) Решение (Decision)

При boot (и при обработке навигационного входа) используется строгий порядок:

1) **Hash deep link `/#/t/<...>`**, если hash присутствует и payload валиден  
2) **Legacy query params**, если hash отсутствует  
3) **Session restore** (например `v3SearchSession`)  
4) **Default** (Dashboard/Library)

Это прямо соответствует контракту в `CONTRACTS_NAVIGATION.md`:contentReference[oaicite:10]{index=10}.

---

## 3) Детализация поведения (Normative behavior)

### 3.1. Hash deep link (приоритет №1)
Формат:
- `/#/t/<base64url(utf8(json_target))>`, base64url без `=`:contentReference[oaicite:11]{index=11}
- `json_target` — объект Target v1:contentReference[oaicite:12]{index=12}

Обработка:
1) decode target
2) validate schema (v/type/id)
3) вызвать `resolveTarget(target)`:contentReference[oaicite:13]{index=13}

Ошибка:
- Если decode/validate не прошёл → **CORRUPT UI** (не молчать, не “откатываться” автоматически):contentReference[oaicite:14]{index=14}
- Если target валиден, но сущность не найдена → **NOT_FOUND UI** + CTA “Back to results” (если контекст восстановим), иначе “Открыть Dashboard”:contentReference[oaicite:15]{index=15}

Причина запрета “silent fallback”:
- Пользователь открыл конкретную ссылку и должен получить правду о её состоянии (битая/устаревшая/не найдено), иначе теряется доверие и ломается воспроизводимость smoke.

### 3.2. Legacy query (приоритет №2)
Используется только если hash отсутствует (или пустой).
Это переходный формат, поддерживаемый до полной миграции на `/#/t/<...>`:contentReference[oaicite:16]{index=16}.

Требование:
- любые изменения legacy формата должны иметь явный backward compatibility план (governance):contentReference[oaicite:17]{index=17}

### 3.3. Session restore (приоритет №3)
Используется только если нет hash и нет legacy query.

Истина: у нас есть реальный механизм session restore для навигации:
- ключ `V3_SEARCH_SESSION_KEY = "v3_search_session_v1"`
- загрузка из `sessionStorage`, sanitize, persist:contentReference[oaicite:18]{index=18}

Session restore предназначен для UX “вернуться туда же после F5”, но не должен перебивать явный deeplink.

### 3.4. Default (приоритет №4)
Если нет валидных источников входа — открываем дефолтный экран (Dashboard/Library).

---

## 4) Обоснование (Rationale)

Почему именно так:

- **Явное > неявного**: deep link — явное намерение пользователя/агента открыть конкретную сущность; session — побочный локальный контекст.
- **Shareability**: hash deeplink воспроизводим и переносим между устройствами; session нет.
- **Детерминизм для smoke/агентов**: одинаковый URL → одинаковый результат (или контролируемая ошибка):contentReference[oaicite:19]{index=19}
- **Back-compat без хаоса**: legacy query допускается, но только когда нет hash, иначе возникают двусмысленности.

---

## 5) Рассмотренные альтернативы

### A) session-first
Плохо: может “затмить” deeplink и сломать ожидания “открыл ссылку — увидел то, что в ссылке”.

### B) query-first над hash
Плохо: query чаще является переходной/вспомогательной формой и не так надёжна, как канонический Target.

### C) silent fallback при CORRUPT
Плохо: скрывает проблему, ломает воспроизводимость и отладку (пользователь не узнаёт, что ссылка битая):contentReference[oaicite:20]{index=20}.

---

## 6) Последствия и риски

### Положительные
- Детерминированный вход: URL определяет результат.
- Агентам проще: строгий приоритет + явные статусы CORRUPT/NOT_FOUND/UNSUPPORTED.

### Риски / Mitigations
- Риск: пользователь открыл битую ссылку и “не попал в приложение”.  
  Митигация: CORRUPT UI обязан давать CTA “Открыть Dashboa
