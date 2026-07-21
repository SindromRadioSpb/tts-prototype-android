# H1.1 — conversation skill

Дата: 2026-07-22

Исходный HEAD: `248020c`

Канон поведения: `../../06_SKILLS_AND_GUARDRAILS_CONTRACT.md`, §§2 и 3.1.

Обязательная надстройка: H1.0 `linguistpro-trainer-policy`.

`CONVERSATION_SKILL.md` — устанавливаемый Hermes-skill разговорной практики на
иврите. Он реализует state machine H1.1, скрыто вплетает 5–8 due-слов, использует
recast в потоке, откладывает explicit-разбор повторных ошибок и завершает цикл
user retry. Skill дополняет, а не заменяет общую политику LinguistPro и H1.0.

## Установка

Скопировать канонический файл в skills-store Hermes:

```powershell
docker exec hermes-webui mkdir -p /home/hermeswebui/.hermes/skills/linguistpro-conversation-session
docker cp CONVERSATION_SKILL.md hermes-webui:/home/hermeswebui/.hermes/skills/linguistpro-conversation-session/SKILL.md
```

Если WebUI уже запущен, его in-process skills-index может не увидеть новый файл.
В проверенной установке потребовался `docker restart hermes-webui`; после него
дождаться health=`healthy` и открыть новую обычную WebUI-сессию
(`personality: null`). `hermes-agent` и MCP-конфигурация не меняются.

## Проверка

1. В новой сессии попросить агента своими словами назвать состояния протокола,
   не раскрывая внутренний due-список.
2. Прогнать A: полную сессию на личном материале с 8–15 пользовательскими
   репликами, recast, POST_ANALYSIS и RETRY.
3. Прогнать B: отсутствие/истечение гранта — typed-отказ без ретрая и переход
   на корпусную тему.
4. Прогнать C: «стоп» во время разговора — короткое завершение без вины с
   указанием состояния остановки.
5. Сверить результаты с `ACCEPTANCE_TRANSCRIPTS.md` и 06 §3.1.

## Откат

Попросить Hermes деактивировать skill либо удалить только каталог:

```powershell
docker exec hermes-webui rm -rf /home/hermeswebui/.hermes/skills/linguistpro-conversation-session
```

Проверить новой обычной сессией, что conversation skill больше не загружается.
H1.0 и существующие LinguistPro skills не изменяются; production LinguistPro не
затронут.

## Результат текущего прогона

На `gemini-3.5-flash-lite` воспроизведение протокола прошло, но acceptance дал
1/3. После нескольких итераций формулировок модель нестабильно пропускала
`get_due_review_items`, преждевременно переходила между состояниями либо
нарушала абсолютный лимит ответа. Поэтому H1.1 помечен `BLOCKED`, а установленная
копия удалена; подробности — в `ACCEPTANCE_TRANSCRIPTS.md`.
Новая session `232cd3b0214a` подтвердила через `skills_list`: `ABSENT`.
