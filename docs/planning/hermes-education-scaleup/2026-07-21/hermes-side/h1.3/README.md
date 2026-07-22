# H1.3 — weekly SRL skill

Дата: 2026-07-22

Исходный HEAD: `c78a68c`

Канон поведения: `../../06_SKILLS_AND_GUARDRAILS_CONTRACT.md`, §§2 и 3.3.

`WEEKLY_SRL_SKILL.md` реализует недельный цикл
FACTS → PRIOR_GOAL → REFLECTION → GOAL_SELECTION → IMPLEMENTATION_INTENTION →
[PROPOSAL/RECORD] → CLOSURE. Факты берутся только из live MCP, цель выбирает
владелец, а запись остаётся propose-then-confirm.

## Установка

```powershell
docker exec hermes-webui mkdir -p /home/hermeswebui/.hermes/skills/linguistpro-weekly-srl
docker cp WEEKLY_SRL_SKILL.md hermes-webui:/home/hermeswebui/.hermes/skills/linguistpro-weekly-srl/SKILL.md
docker restart hermes-webui
```

Дождаться health=`healthy` и открыть новую ordinary-session
(`personality: null`). Рестарт сбрасывает in-process skills-index; MCP и
`hermes-agent` не меняются.

## Проверка

1. В новой сессии попросить воспроизвести state machine и границы H1.
2. A: первая ретроспектива без прошлой цели — live facts и честное отсутствие,
   без выдуманного обещания.
3. B: обычный цикл с controlled prior-goal fixture — сопоставление с фактами,
   ровно два reflection-вопроса, максимум три process-варианта, выбор владельца
   и реальный pending `propose_action` для заметки.
4. C: controlled fixture с 0–1 active days — без осуждения, компенсации и
   удвоения; предложен минимальный якорь.
5. Проверить, что агент не вызвал `propose_goal`, не подтвердил proposal и не
   заявил о записи до owner-confirmation.

Controlled fixtures B/C проверяют ветвление skill и всегда маркируются как
симуляция. Они не подменяют live facts; live preflight и A используют реальный
MCP. Поверхность H1 не предоставляет отдельного читаемого goal-store.

## Откат

Удалить только каталог:

```powershell
docker exec hermes-webui rm -rf /home/hermeswebui/.hermes/skills/linguistpro-weekly-srl
docker restart hermes-webui
```

В новой ordinary-session проверить через `skills_list`, что skill отсутствует.
H1.0–H1.2 и production LinguistPro не затрагиваются.

## Статус

На `gemini-3.6-flash` воспроизведение прошло, acceptance A–C дал 3/3. После
одной точечной итерации поиск прошлой цели не расширяется на personal texts или
explanation bodies. Skill установлен; SHA-256 канона и skills-store:
`f6db4b879cece54e004cfd920460945b3095da9bab880508aa33b171f6569534`.

Статус — `ENGINEERING_COMPLETE`. Для owner-live нужны два реальных недельных
цикла за две календарные недели и вердикт 1–5; до этого `CLOSED` запрещён.
