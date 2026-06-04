# Состояние ②-заметок / Pealim-ссылок — снимок 2026-06-04 (handoff)

Консолидированный статус работ по полям ②-заметок и ссылкам/таблицам Pealim. Применяй
роли **R1–R5** (`docs/PROJECT_ROLES.md`) для любых решений. Норма владельца: **бескомпромиссное
качество без выдуманных форм; всегда проверять на проде** `https://linguistpro.kolosei.com`.

## Что внедрено в этой серии (всё SHIPPED + prod-verified)

| Тема | Коммит | SW | Суть |
|---|---|---|---|
| Полевая конформность бандла | `83426b8` | — | цели `docs/NOTE_FIELDS_GOALS.md` + `npm run audit:note-fields` (R1-gate); meaning 89.1%→96.2% (alias + cell-reverse + pos-инференция); 0 R1-нарушений |
| Deep-link self-heal | `a8b22da` | v3.7.4 | открытие заметки по бэклинку теряло sentenceId → поля не самоисцелялись; восстановление sid из `target_id`=`<sid>:<offset>` в `v3NotesLoadFullNoteIntoModal` |
| Adverb→no root | `ca2839b` | v3.7.5 | наречия/служебные (`V3_NON_ROOT_DICTA_POS`) не наследуют корень глагола-омографа в `v3MorphTokenToResult` |
| Pealim-ссылки POS-guard | `1ea4745` | v3.7.6 | офлайн-словарь обходил POS-штраф резолвера → служебное/причастие/имя ссылалось на омограф; `v3ConjHitCompatible` на 3 шагах `v3WordCardLoadInflection` → честный search |
| Function-links (точность) | `5bda857` | v3.7.7 | карта `pealim-function-links.v1.json` (invariant-сироты) → прямая ссылка для служебных слов вместо поиска |
| Same-POS form-disambig | `a370082` | v3.7.8 | build-notes form-first резолв сохраняет верный `pealim_id`+`meaning` в `body_json`; рантайм линкует по сохранённому id, чужую таблицу скрывает (`seePealim`). 234 ссылки + 47 переводов исправлены |
| Инвентаризация ссылок | (этот) | — | `npm run audit:pealim-inventory` → `docs/PEALIM_LINK_INVENTORY_2026_06.md` |
| **Phase 5-R1 настоящие корни** | (этот) | v3.7.9 | имена/прил./глаголы получают настоящий корень Pealim (chip `root`); новое поле `lemma` развязывает запрос таблицы (`data-conj-lemma`); proclitic-form fix (`unitFormVariants`) чинит омограф בַּדָּם. 2366 корней, 0 ошибок, 0 R1. Смоук `smoke:conj:trueroot` 8/8 |
| **Pealim-ссылки: единый источник + премиум служебных** | (этот) | v3.8.0 | футер карточки вёл на ПОИСК (90% заметок) ≠ аккордеон (прямая). Помощник `v3WordCardBestPealimUrl` (pealim_id→function-links→поиск) → одна прямая ссылка везде. Служебные слова (наречия/местоим.) получили инвариант-профиль (огласов. форма + tap-озвучка + прямая ссылка) через `forms` в function-links (чинит омограф-тень בטח→3600). Баг `[object Object]` в function-links исправлен. Честные метки «страница Pealim»/«поиск на Pealim». Гейты `audit:pealim-footer` (0 desync, 90.1% direct) + `smoke:conj:funcword` 7/7 |

## Текущее состояние ссылок Pealim (бандл `Library/test-enriched.zip`, 8967 заметок)
- **Прямых ссылок 90.1%** (8045 form-disambig `pealim_id` + 37 function-links).
- **885 → честный поиск** (448 уникальных слов): 415 `in-pealim-no-target` (омограф/редкая форма),
  268 `not-in-pealim` (loanword/имя/сленг), 202 `function-no-invariant`. **Неверных страниц 0.**
- Полный перечень: `docs/PEALIM_LINK_INVENTORY_2026_06.md` + `.tmp/pealim-link-inventory.json`.

## Поля ②-заметок
word 100% · niqqud ~100% · pos/part_of_speech 94.7% (синхронны) · binyan(глаголы) 99.9% ·
**meaning 96.2%** · root **58.5%** (0 R1-нарушений; **Phase 5-R1 закрыл noun `root==lemma`**:
2366 настоящих корней, остаток 564 честно пусты, 303 root==слово — легитимные Pealim-корни) ·
**lemma** (новое поле — запрос таблицы) · sentence_morph 3457. **R1 hard violations: 0.**

## Постоянные аудиты/смоуки (метрики, не заглушки)
`npm run audit:note-fields` · `audit:pealim-links` · `audit:pealim-samepos` · `audit:pealim-inventory` · `audit:pealim-footer` (0 desync gate)
· `smoke:conj` (17/17) · `smoke:conj:audit` (175/175) · `smoke:conj:link-guard` (12/12) ·
`smoke:conj:sentence-morph` (7/7) · `smoke:conj:deeplink-selfheal` (5/5) · `smoke:conj:pos-hydrate` (4/4)
· `smoke:conj:trueroot` (8/8 — Phase 5-R1 chip=root / table=lemma decouple gate)
· `smoke:conj:funcword` (7/7 — служебное слово: инвариант-профиль форма+озвучка + футер==аккордеон).

## Извлечённые уроки (применять впредь)
1. **«Нет корня/нет таблицы» для служебных слов — по Dicta-POS, а не по маленькому стоп-листу.**
   Стоп-лист `V3_HEB_FUNCTION_WORDS` неполон; гейтить по `posDicta`/`V3_NON_ROOT_DICTA_POS`.
2. **Офлайн-словарь обходит POS-доминантность онлайн-резолвера.** Любой офлайн-lookup для
   ссылки/таблицы должен иметь POS-гейт (`v3ConjHitCompatible`), иначе попадает на омограф.
3. **Омографы одного ключа `(plain,binyan)` рантайм развести НЕ может** (индекс хранит одну
   парадигму на ключ; OPFS — точечный по lemma). Разводит только **форма (огласовка)** или
   прямой **pealim_id**. → форму-дизамбигуацию делать на СБОРКЕ и сохранять `pealim_id` в заметку.
4. **Бандл = данные пользователя (OPFS).** Фиксы данных едут перегенерацией бандла + ре-импортом;
   фиксы кода — через SW-бамп. Всегда бампать `CACHE_VERSION` при изменении index/locale/asset.
5. **Self-heal при открытии заметки** требует `sentenceId`; на deep-link его нет — восстанавливать
   из `target_id`. Self-heal — только отображение, сохранённую заметку не мутирует, `userTouched` чтит.
6. **Проверка на проде — с ПРОГРЕТЫМ словарём.** Холодная загрузка 3.4МБ gz + bulk-import даёт
   ложные таймаут-фейлы в тестах; в смоуках поллить до settle, в прод-чеке прогревать `InflectionDict.ensureReady()`.
7. **Аудит сначала, фикс потом.** Form-match (огласовка ∈ ячейки) — надёжный сигнал, отделяющий
   реальную неверную ссылку от ошибки сохранённого перевода (ссылка верна).
8. **Агенты — для разведки/широких свипов; механику проверять чтением кода** (агенты путают
   line-numbers/idx vs pealim_id).

## Открытое / отложенное (бэклог)
- ~~**noun `root==lemma` (698)**~~ — **ЗАКРЫТО Phase 5-R1 (2026-06-04, SW v3.7.9).** Настоящие
  корни имён/прил./глаголов из Pealim; новое поле `lemma`; proclitic-form fix. 2366 корней, 0 R1.
- **885 missing-direct ссылок** — почти все внешний предел (нет в Pealim) или омограф без
  form-target; прямая ссылка невозможна без расширения датасета. Честный поиск корректен.
- **Полная ВЕРНАЯ таблица для same-POS омографа** (сейчас при омографе показываем «таблица на
  Pealim» + ссылка) — потребовала бы by-id хранилища парадигм; вне scope, низкий ROI.
- Knowledge Map Phase 4/5/7 (см. [[project_knowledge_map_redesign]] / памяти).

## Деплой/данные для пользователя
Прод авто-собирается из `main` (Coolify). Чтобы изменения дошли до айфона: **перезагрузить PWA**
(активирует SW v3.7.8) + **переимпортировать** `Library/test-enriched.zip`/`-lean.zip` (данные
meaning/pealim_id — в бандле; перед импортом удалить старую импортированную библиотеку).

---

## Промпт для старта новой сессии (копипаст)

> Ты продолжаешь работу над **tts-prototype-android** (Node.js PWA, иврит↔рус, ②-заметки,
> морфология Dicta + инфлекция Pealim офлайн). **Применяй ролевую систему R1–R5**
> (`docs/PROJECT_ROLES.md`) автоматически для всех решений по качеству/UX/данным: R1 ивритский
> лексикограф (реальные корни/биньяны, без выдуманных форм), R2 методист SLA, R3 архитектор
> графа, R4 премиум-UX (mobile-first RTL @380px, без тупиков), R5 рынок (планка Pealim/Reverso,
> offline-first). Инвариант владельца: **бескомпромиссное качество без заглушек; всегда
> проверять на ПРОДЕ** `https://linguistpro.kolosei.com` (не только локально).
>
> **Перед работой прочитай** `docs/SESSION_STATE_2026_06_04.md` (этот файл — актуальное
> состояние, внедрённое, уроки, бэклог) и память (`MEMORY.md` + `fix_pealim_link_posguard.md`,
> `fix_note_open_deeplink_selfheal.md`, `project_bundle_wordnote_test.md`).
>
> **Дисциплина (обязательно):** перед любым фиксом — разведка→понимание корневой причины→способ
> устранения без выдумывания→фикс→верификация. Исследование багов должно покрывать ВСЕ варианты,
> не быть заглушкой. Используй агентов для разведки/широких свипов, но механику (line:точки,
> pealim_id vs idx) проверяй чтением кода.
>
> **Рабочий цикл:** меняешь данные → перегенерируй бандл (`scripts/premium/build-notes-from-bundle.js`)
> + ре-аудит; меняешь код-оболочку → бампни `public/sw.js CACHE_VERSION`. Перед коммитом гоняй
> релевантные аудиты/смоуки (`audit:note-fields`, `audit:pealim-*`, `smoke:conj*`, `smoke:conj:audit`
> 175/175, link-guard, deeplink-selfheal, sentence-morph, pos-hydrate). Деплой: push в `main` →
> Coolify → дождись `CACHE_VERSION` на проде → прод-чек (с прогревом `InflectionDict.ensureReady()`).
> Тяжёлые/архитектурные изменения — сначала план (EnterPlanMode) с разбором по ролям + рекомендацией.
>
> **Открытые направления (бэклог, по приоритету владельца):** (а) Phase 5-R1 true lemmatization —
> настоящие именные корни (root==lemma 698); (б) при желании — расширение Pealim-датасета для
> оставшихся 885 missing-direct ссылок (большинство — внешний предел); (в) Knowledge Map Phase 4/5/7.
> Спроси владельца, с чего начать, если не задано.
