# H1.2 — writing WCF skill

Дата: 2026-07-22

Исходный HEAD: `d9ad7d1`

Канон поведения: `../../06_SKILLS_AND_GUARDRAILS_CONTRACT.md`, §§2 и 3.2.

`WRITING_WCF_SKILL.md` реализует письменный цикл
TASK → DRAFT → FOCUSED_FEEDBACK → REVISION → COMPARISON → CLOSURE. Он наследует
H1.0, ограничивает feedback двумя–тремя категориями и сохраняет черновики только
в текущем чате согласно owner-default Д1 `EPHEMERAL`.

## Установка

```powershell
docker exec hermes-webui mkdir -p /home/hermeswebui/.hermes/skills/linguistpro-writing-wcf
docker cp WRITING_WCF_SKILL.md hermes-webui:/home/hermeswebui/.hermes/skills/linguistpro-writing-wcf/SKILL.md
docker restart hermes-webui
```

Дождаться health=`healthy` и открыть новую ordinary-session
(`personality: null`). Рестарт нужен для сброса in-process skills-index; MCP и
`hermes-agent` не меняются.

## Проверка

1. Попросить новую сессию воспроизвести WCF state machine и ephemeral-границу.
2. A: черновик с ошибками минимум в трёх категориях; feedback выбирает ровно две,
   молчит о нецелевой; пользователь делает ревизию; COMPARISON только по целям.
3. B: до ревизии дважды попросить полный ответ; сначала подсказка без полного
   текста, после второго отказа — вариант с маркировкой без ложного comparison.
4. C: чистый текст в выбранных категориях; честное «чисто», без выдуманных
   ошибок, с предложением более сложного задания.
5. Убедиться, что ни один file/memory/write/propose-инструмент не вызван.

## Откат

Удалить только каталог:

```powershell
docker exec hermes-webui rm -rf /home/hermeswebui/.hermes/skills/linguistpro-writing-wcf
docker restart hermes-webui
```

В новой ordinary-session проверить через `skills_list`, что skill отсутствует.
H1.0, H1.1 и production LinguistPro не затрагиваются.

## Результат текущего прогона

На `gemini-3.6-flash` воспроизведение прошло, acceptance A–C дал 3/3, EPHEMERAL
подтверждён отсутствием file/memory/write/propose-вызовов. Для B потребовалась
одна точечная формулировочная итерация, запрещающая раскрывать любую готовую
форму на первом отказе. Skill установлен; SHA-256 канона и skills-store:
`6033701e525daa78e8329cdad4bf06dc076a46158770b674e95271c79859c17c`.

Статус — `ENGINEERING_COMPLETE`. Owner-live: два реальных WCF-цикла с ревизией и
вердиктом 1–5; до этого `CLOSED` запрещён.
