# H1.1 — conversation skill

Дата: 2026-07-22

Исходный HEAD: `248020c`

Канон поведения: `../../06_SKILLS_AND_GUARDRAILS_CONTRACT.md`, §§2 и 3.1.

Обязательная надстройка: H1.0 `linguistpro-trainer-policy`.

`CONVERSATION_SKILL.md` — устанавливаемый Hermes-skill разговорной практики на
иврите. Он реализует state machine H1.1, скрыто вплетает 5–8 due-слов, использует
recast в потоке, откладывает explicit-разбор повторных ошибок и завершает цикл
user retry. Skill дополняет, а не заменяет общую политику LinguistPro и H1.0.

## Личные тексты — основной режим

Личные тексты и песни не заблокированы и являются предпочтительным материалом
разговорной сессии. В обычном диалоге Hermes сначала вызывает
`list_personal_texts`, затем `get_personal_text_content` минимального окна и при
успехе продолжает на личном материале. Корпус — выбор пользователя или fallback
только после фактического typed-отказа body-инструмента в текущей сессии.

Живая перепроверка 2026-07-22, session `a7eb91b273aa`:
`connection=ACTIVE`, scope `personal.texts.content.read=GRANTED`,
`get_personal_text_content(rows=1)=BODY_ACCESS: OK`. Содержимое строки в git не
сохранялось.

После уточнения skill personal-first smoke в новой ordinary-session
`d060a46058bb` вызвал `list_personal_texts`, `get_due_review_items` и
`get_personal_text_content`, затем начал разговор по личной песне. Корпусные
инструменты не вызывались.

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
   на корпусную тему. Если реальный grant активен, это только контролируемая
   симуляция; она не меняет и не описывает текущее состояние доступа.
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

На `gemini-3.6-flash` новая ordinary-session подтвердила модель в metadata,
воспроизведение протокола прошло, acceptance A–C дал 3/3. Для B потребовалась
одна точечная формулировочная итерация: typed fallback теперь предлагает один
корпусный материал ровно двумя предложениями. Skill установлен; SHA-256 канона
и skills-store:
`f2051fe37eab684af8d7e48afb0ba8568716d9595b1896791f8443feb0b694d5`.

H1.1 имеет статус `ENGINEERING_COMPLETE`. Для owner-live остаются две реальные
разговорные сессии с фиксацией числа иврит-реплик, полезности разбора и вердикта
1–5. Первый неуспешный прогон на `gemini-3.5-flash-lite` и его rollback сохранены
в `ACCEPTANCE_TRANSCRIPTS.md` как историческое evidence.
