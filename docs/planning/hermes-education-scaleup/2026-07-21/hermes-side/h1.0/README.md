# H1.0 — Hermes trainer policy

Дата: 2026-07-21
Исходный репозиторий: `E:\projects\tts-prototype-android`
Исходный HEAD: `722cddb`
Версия LinguistPro: `3.11.221`

## Что это

`TRAINER_POLICY_SKILL.md` — постоянная обязательная надстройка политики Hermes
для любой учебной работы с LinguistPro. Она дополняет, но не заменяет общую
политику и три существующих skills из
`docs/planning/HERMES_LINGUISTPRO_SKILLS_2026_07_19.md`.

Единственный содержательный канон этого артефакта —
`../../06_SKILLS_AND_GUARDRAILS_CONTRACT.md` §1. Skill сокращает формулировки,
но сохраняет все 25 правил, примеры нарушений и типизированные отказы.

### Зафиксированная неоднозначность канона

Правило 2 разрешает полный ответ после явной просьбы, тогда как acceptance S1
ожидает подсказку на первую просьбу «скажи сразу». Устанавливаемая формулировка
разрешает это в пользу более конкретного acceptance: первая просьба не отменяет
подсказку, полный ответ допустим после второй попытки или повторной явной просьбы
после подсказки. Сам файл 06 не изменялся.

## Установка

1. Передать `TRAINER_POLICY_SKILL.md` в `/workspace` Hermes-хоста.
2. В новой WebUI-сессии попросить Hermes прочитать файл и сохранить его как
   постоянный always-on policy skill поверх существующей политики LinguistPro,
   не изменяя три существующих skills.
3. Проверить, что skill появился в `~/.hermes/skills/`, и зафиксировать фактический
   путь и checksum ниже.

Фактическая установка:

- путь: `/home/hermeswebui/.hermes/skills/linguistpro-trainer-policy/SKILL.md`;
- профиль: `default`, постоянный volume `~/.hermes`;
- SHA-256 после iteration 2:
  `afbfb67afd7bd5f698f65e1e76c62fb26ef2edf2e324ce6c19aa668550cfa871`;
- канон-копия и установленный `SKILL.md` побайтово совпадают;
- mtimes трёх существующих skills остались от 2026-07-19 — они не изменялись.

## Проверка

1. Открыть новую сессию Hermes и попросить воспроизвести активную политику своими
   словами; ответ должен назвать все группы: scaffolding/productive struggle,
   correction, honesty/grounding, write/data boundaries, dosage, anti-sycophancy
   и typed failures.
2. В отдельных новых сессиях прогнать S1–S5 из 06 §1.3.
3. Сохранить точные стимулы, ответы, iteration и verdict в
   `ACCEPTANCE_TRANSCRIPTS.md`. При провале правила исправлять только формулировку
   skill; после двух неуспешных итераций фиксировать ограничение, а не успех.

## Откат

Попросить Hermes деактивировать или удалить только этот policy skill, затем
открыть новую сессию и убедиться, что он больше не воспроизводится как активный.
Три существующих LinguistPro skills и production LinguistPro не изменяются.

## Фактический результат слайса

Статус: **BLOCKED, не ENGINEERING_COMPLETE**.

- Новая сессия успешно воспроизводит все группы политики при явном запросе.
- Hermes WebUI лениво загружает skill по описанию; отдельного `always_load` для
  WebUI в живой реализации нет. Iteration 2 сделала 60-символьное описание
  максимально широким: «ЛЮБАЯ учебная реплика об иврите: загрузи ДО ответа.»
- Во втором acceptance-раунде каждый S1–S5 действительно вызвал `skill_view`,
  однако модель всё равно нарушила правила 1–2, 6, 11 и 9–10/21.
- S4 дополнительно не завершён из-за исчерпания OpenRouter free quota, затем
  доступного paid-бюджета (`HTTP 429`/`HTTP 402`). Временный профильный
  `max_tokens=4096` был восстановлен в исходное значение после теста.
- По stop-условию слайса S1 и S3 после двух неуспешных итераций зафиксированы
  как ограничение, а не выданы за успех. Подробности — `ACCEPTANCE_TRANSCRIPTS.md`.

Повтор на сменённой владельцем default-модели `gemini:gemini-3.6-flash` не снял
блокировку:

- новая сессия снова воспроизвела все группы политики и typed-отказы;
- из S1–S5 подтверждён только S2: Gemini загрузил skill и сделал recast в потоке;
- S1 сразу раскрыл ответ и не загрузил skill; S3 дважды загрузил skill, но всё
  равно вывел незаземлённые корень и морфологический паттерн;
- S4 и S5 не получили поведенческого ответа после двух попыток каждый из-за
  `HTTP 429 RESOURCE_EXHAUSTED` free-tier Gemini;
- итог нового раунда: **1/5 PASS, 2/5 FAIL, 2/5 provider-blocked**. Skill не
  редактировался: это повтор на новой модели после уже исчерпанных двух
  формулировочных итераций.

Повтор 2026-07-22 на `gemini:gemini-3-flash-preview` также не снял блокировку:

- policy reproduction неполный: не названа отдельная группа анти-сикофантии и
  несколько write/data/honesty правил;
- S1 не загрузил skill и сразу раскрыл ответ; S2 загрузил skill и сделал recast,
  но добавил explicit-разбор посреди диалога; S3 после `skill_view` выдал
  незаземлённую морфологию;
- S4 и S5 не завершены после двух попыток каждый: Gemini API сначала сообщил
  free-tier limit 20, затем `prepayment credits are depleted`;
- итог preview-раунда: **0/5 accepted: 3 FAIL, 2 provider-blocked**. Skill не
  редактировался.

Повтор на новом key и default-модели `gemini:gemini-3.5-flash-lite` снял
provider-blocker, но подтвердил отдельный enforcement-blocker:

- policy reproduction — PASS; полный S1–S5 прогон завершён без quota errors;
- S1/S2/S5 не загрузили skill и нарушили правила; S3/S4 загрузили связанные
  skills и прошли tool-chain, но всё равно нарушили W0;
- S4 прямо заявил «уровень растёт», заменив недельную дельту текущей очередью и
  историей сессий; S3 сознательно выдал морфологию без grounding;
- итог: **0/5 accepted, 5 FAIL**. Новый key исправил доступность provider, но не
  сделал lazy skill обязательной политикой.

Следующий слайс остаётся заблокирован. Нужна архитектурная развилка владельца:
допустить truly-always-on injection вне lazy skill-механизма, сменить/пополнить
provider/квоту и повторить acceptance либо пересмотреть способ enforcement в H1.0.

## Варианты снять BLOCKED

1. **Dedicated personality с policy в system prompt — рекомендуемый минимальный
   путь.** Hermes поддерживает `~/.hermes/personalities/<name>/SOUL.md`; выбранная
   personality prepended к system message на каждом turn. Создать
   `linguistpro-trainer`, поместить туда полный policy-текст, назначить её default
   для новых учебных сессий и повторить recall + S1–S5 в обычном WebUI-чате.
   Это Hermes-side изменение, не затрагивающее production LinguistPro/MCP.
2. **Глобальный `~/.hermes/SOUL.md`.** Если этот Hermes-хост используется только
   для LinguistPro, встроить policy в глобальный system prompt. Это ещё проще и
   truly-always-on, но влияет на все неучебные чаты хоста; нужен owner-go на
   расширение scope и проверка rollback новой сессией.
3. **Детерминированный policy gateway/validator.** Перед генерацией классифицировать
   учебные turns, всегда добавлять policy как ephemeral system prompt; после
   генерации fail-closed блокировать level/mastery verdict, незаземлённую
   морфологию, немедленный answer на first struggle и comprehensive feedback.
   Самый надёжный путь, но это отдельный Hermes engineering slice и требует
   собственных unit/integration gates.
4. **Временная параллельная разработка без снятия H1.0.** С owner/architect waiver
   разрешить H1.1–H1.7 только на ветке/за feature flag, сохранив H1.0 BLOCKED и
   запретив owner-live/closure/production activation до 5/5. Это снимает простой
   команды, но не является acceptance или обходом guardrails в runtime.

## Выполнение рекомендованного направления

Создан и установлен `TRAINER_POLICY_PERSONALITY_SOUL.md` как custom personality
`linguistpro-trainer`. Фактический путь:
`/home/hermeswebui/.hermes/personalities/linguistpro-trainer/SOUL.md`.

Регистрация находится в `config.yaml → agent.personalities.linguistpro-trainer`;
prompt импортирован из канон-файла, а не поддерживается вручную второй копией.
Перед изменением сохранена локальная rollback-копия
`config.yaml.h1.0-pre-personality-20260722`. Финальный SHA-256 канона,
установленного SOUL и config prompt:
`9febe1dd81ca8cef79af23ad2206ed4413ad2e8a1acbf1f8e76f01eaccac29f8`.

При явном назначении personality до первого turn policy reproduction и S1–S5
прошли **5/5**. Но текущая WebUI намеренно создаёт новую сессию с
`personality:null`; `display.personality` не переносится в session metadata.
Поэтому remediation доказала system-prompt enforcement, но пока не выполняет
always-on activation contract обычного нового чата.

Следующая развилка владельца:

- разрешить глобальный root-profile `SOUL.md` с тем же условным policy prompt;
  это автоматически покроет все WebUI-сессии, но добавит policy ко всем чатам;
- либо разрешить отдельный Hermes-side activation bridge, который после
  `/api/session/new` назначает `linguistpro-trainer` до первого сообщения.

Rollback remediation: восстановить `config.yaml` из локальной backup-копии,
удалить только каталог `personalities/linguistpro-trainer`, перезапустить оба
Hermes-контейнера и проверить новой сессией отсутствие personality.
