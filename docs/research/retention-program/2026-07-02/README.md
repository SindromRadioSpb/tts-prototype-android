# Retention-программа — адверсариальная роль-критика recon-дизайна (сырьё)

**Что это:** полные отчёты 4 агентов-рефутаторов (по одному на роль R2/R9/R10/R11), прогнанных по
`docs/planning/RETENTION_PROGRAM_RECON_2026_07_02.md` (черновик ДО внесения фиксов) с мандатом
«адверсариально опровергнуть дизайн». Итог: 7 BLOCKER + 15 MAJOR + ~9 MINOR; все внесены в §3–§8
recon-дока, сводка — в его §10.

**Как сгенерировано:** сессия Claude Code (Fable 5) 2026-07-02, 4 параллельных Agent-вызова; каждому
критику даны определение роли (docs/PROJECT_ROLES.md), recon-док и точечные line-refs живого кода
(reader-morph.js / library-ui.js / local-db.js / migrations.js / anki-identity.js). Кандидаты-находки,
не выдержавшие проверку по коду, отброшены самими критиками (отмечено в их преамбулах).

**Статус файлов:** сырые вердикты, НЕ редактировались. Канон решений — recon-док; эти файлы —
провенанс (полные обоснования и line-refs, на которые §10 ссылается).

| Файл | Роль | Итог |
|---|---|---|
| `CRITIQUE_R2.md` | R2 методист SLA | 1 BLOCKER, 4 MAJOR, 2 MINOR |
| `CRITIQUE_R9.md` | R9 authority-control/LOD | 4 BLOCKER, 3 MAJOR, 2 MINOR |
| `CRITIQUE_R10.md` | R10 выч. морфолог / measure-before-code | 2 BLOCKER, 8 MAJOR, 4 MINOR |
| `CRITIQUE_R11.md` | R11 регрессолог do-no-harm | 3 BLOCKER, 5 MAJOR, 3 MINOR |

(Пересечения между ролями дедуплицированы в §10 recon-дока: итоговых уникальных BLOCKER — 7.)
