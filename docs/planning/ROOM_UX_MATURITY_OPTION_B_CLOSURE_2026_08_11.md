# Reading Room UX maturity — Option B closure

Дата закрытия: 2026-08-11

Статус: **CLOSED / OWNER ACCEPTED**

Production baseline: `3.11.359`

Git baseline: `main@940148f663f2861dc8d94e617e4034619937b4b1`

## Решение владельца

После production-публикации владелец явно подтвердил в рабочей сессии:

> B0–B5 проверил. Считаем закрытой и фиксируем документально.

Эта запись закрывает Option B как продуктовую программу. Она не приписывает подтверждению
конкретную модель устройства, VoiceOver/TalkBack или сетевой режим, которые не были названы.
Такие проверки могут стать отдельным evidence slice следующей программы, но не остаются скрытым
blocker уже закрытых B0–B5.

## Закрытые этапы

| Этап | Результат | Commit | Production |
|---|---|---|---|
| B0 | red gates и визуальный контракт | `518f7d31` | baseline only |
| B1 | плотность, семантика, performance safety | `1d394868` | `3.11.355` |
| B2 | Learning Home | `4a4733bd` | `3.11.356` |
| B3 | общий corpus shell и progressive disclosure | `3f88c6d4` | `3.11.357` |
| B4 | readiness и нормализованные corpus adapters | `61e06d30` | `3.11.358` |
| B5 | continuity, finish handoff и release hardening | `940148f6` | `3.11.359` |

Каждый этап завершён отдельным allowlist commit/push и соответствующими gates до перехода к
следующему этапу.

## Итоговый evidence ledger

- maturity unit: `16/16`;
- continuity/keyboard/finish/reduced-motion: `34/34`;
- responsive/locale/theme matrix: `838/838` на `320–1280px`, RU/HE, LTR/RTL, light/dark;
- i18n: `233/233`; canon-version: `18/18`; memory-canon: `79/79`;
- production APP/Room/SW exact version: `3.11.359`;
- production clean profiles: 380 RU/light exact Reader return, 360 HE/RTL/dark, 320 RU/dark;
- production clean-profile page errors/HTTP 5xx: `0/0`;
- три последовательных health readback: app/DB/migrations green;
- owner acceptance: explicit closure statement above.

Подробные воспроизводимые артефакты находятся в
`docs/research/room-ux-maturity/2026-08-11/`, включая системный benchmark и `b5-evidence/`.

## Зафиксированный продуктовый контракт

- Learning Home — главный next-action surface, а не полный каталог.
- Все корпуса используют общий shell, компактную строку и честную readiness grammar.
- Asserted, derived, curated и missing truth не смешиваются.
- Reader возвращает пользователя в точный corpus context без второго progress writer.
- LocalDb/FSRS/Studio/Trainer/notes/bookmarks остаются каноническими источниками истины.
- RU/HE/RTL/light/dark/a11y/mobile/performance являются release gates.
- Management и расширенные фильтры не конкурируют с первым учебным действием.

## Freeze boundary

B0–B5 не должны переоткрываться ради нового общего редизайна. Допустимы только:

1. подтверждённый regression к зафиксированному контракту;
2. обязательное исправление безопасности, данных или доступности;
3. отдельно утверждённая следующая программа, сохраняющая этот baseline.

B6–B9 + Visual finishing являются новой программой с собственными recon, owner decisions,
allowlists, gates и релизами. Её handoff:
`docs/planning/ROOM_UX_B6_B9_VISUAL_FINISHING_HANDOFF_2026_08_11.md`.
