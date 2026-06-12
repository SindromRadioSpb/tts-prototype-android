# Tier-3 «Точный режим» — контекстная морфология в Зале (client-side Dicta)

> **Дата:** 2026-06-11 · **Статус:** путь ДОКАЗАН в браузере + фундамент-провайдер отгружен;
> интеграция в резолв = фича, нужен owner-go (recon-first). Роли R10/R1/R4.

## TL;DR — egress РАБОТАЕТ (ошибка диагностики исправлена); два пути на выбор
⚠ **Коррекция (2026-06-11):** ранее Тир-3 считался заблокированным («прод не достаёт Dicta,
`/api/morphology`→`tokens:[]`»). **Это была ошибка теста** — Windows-`curl` калечил UTF-8-иврит в
«????», Dicta на мусор отдавала пусто. **С корректным UTF-8 (Node fetch/браузер) прод `/api/morphology`
ОТДАЁТ реальные токены** (הַיּוֹם→adverb «сегодня», עלינו→preposition). То есть **egress НЕ закрыт** —
оба пути Тир-3 рабочие:
- **(S) Сервер-сайд:** уже существующий `/api/morphology` (Dicta context) — РАБОТАЕТ. Минимум нового кода.
- **(C) Клиент-сайд:** браузер юзера ходит в Dicta напрямую. Dicta отдаёт **`Access-Control-Allow-Origin: *`**;
  подвох — CORS-preflight (OPTIONS) у Dicta = **500**, поэтому `application/json` (триггерит preflight) →
  «Failed to fetch». Решение: «простой» запрос `Content-Type: text/plain;charset=UTF-8` (без preflight).
  Проверено в реальном браузере → 4 токена, верная огласовка. Offline-first (R5): без серверного round-trip.
**Выбор (S vs C):** S проще (эндпоинт есть, работает); C ближе к offline-first Зала и не грузит сервер.
Оба требуют сети у клиента/сервера. Рекоменд.: для Зала — **C** (R5), но S — валидный fallback. Решает владелец.

## Отгружено (фундамент, поведение по умолчанию НЕ изменено)
- `public/js/reader-dicta.js` (`window.ReaderDicta`) — клиентский Dicta-провайдер:
  `analyzeSentence(text)` → `{ok, tokens:[{word,niqqud,lemma,lemmas,posDicta,binyan,confident}], degraded}`;
  `text/plain` CORS-bypass; honest-degradation (непустой иврит + 0 токенов → `degraded:true`);
  morphId POS/binyan decode (BigInt, зеркало `dictaMorphId.js`); `tokenForSurface(tokens,surface)`.
- Гейт `smoke:reader-dicta` (`npm run smoke:reader-dicta`) — реальный браузер→Dicta + проверка, что
  контекст-огласовка дизамбигует гомограф; **SKIP-честно**, если Dicta недоступна (сетевой гейт, не флейки).
- **НЕ подключён** к резолву/шеллу по умолчанию (фича ниже — на утверждение).

## Алгоритм интеграции (фича «точный режим», на owner-go)
**Идея (минимум нового кода):** Dicta даёт КОНТЕКСТ-верную огласовку слова → её скармливаем
существующему офлайн form-first резолверу → он матчит ПРАВИЛЬНУЮ парадигму гомографа. Reuse, не replace.
1. **UI:** тумблер reader-aids «🎯 Точный режим (контекст)» — opt-in, persist, дефолт OFF (онлайн-
   зависимость честно отмечена; офлайн → авто-выкл/деградация). R4.
2. **На тап (если ON):** взять строку (`row.hebrew_plain`/`hebrew_niqqud`) → `ReaderDicta.analyzeSentence(row)`
   (кэш на строку, чтобы тап по разным словам строки = 1 запрос) → `tokenForSurface(tokens, surface)`.
3. **Дизамбигуация:** если у токена есть контекст-niqqud → передать его в `resolveCore` как
   приоритетный вариант огласовки (новый параметр `contextNiqqud`), плюс POS-хинт (`posDicta`) для
   выбора между гомографами одной огласовки. Иначе — обычный офлайн-путь.
4. **R1-провенанс:** когда чтение получено из контекста — бейдж **«контекст (Dicta)»** (новый label),
   честно отличать от offline-exact. Машинная дизамбигуация ≠ человек; TTS ≠ носитель.
5. **Кэш + бюджет:** per-row кэш в сессии; не дёргать Dicta на каждый ре-рендер; backoff;
   при `degraded` — молча падать на офлайн (с уже честным офлайн-гейтом Тир-1).
6. **Гейты:** расширить `smoke:reader-dicta` на end-to-end (тап→контекст→верный гомограф);
   `reader-parity` (index.html не трогать); @380px скрин «точный режим» вкл/выкл.

## Что чинит / остаточный охват
- Чинит **остаточные ~10% настоящих контент-гомографов**, которые офлайн-гейт Тир-1 НЕ берёт
  (הַיּוֹם «день/сегодня», מעט, מספיק, אף «нос/даже» в контексте). Дополняет, не заменяет Тир-1/2.
- Архаика: Dicta — современный иврит, на части корпуса может ошибаться → провенанс «контекст» честно
  сигналит неабсолютность; R7-валидация выборки до широкого включения.

## Сервер-egress — РАБОТАЕТ (миф развеян)
`/api/morphology` на проде отдаёт реальные токены при корректном UTF-8 (проверено Node fetch + Coolify
деплой `5a287a6` подтверждён). «Закрытый egress» был артефактом curl. honest-degradation (Тир-3a,
`morphologyGateway` → `degraded:true` при пустом ивр.-ответе) задеплоен и корректен (срабатывает лишь на
реально-пустой ответ Dicta). Никаких Coolify/firewall-правок не нужно.

## ✅ ОТГРУЖЕНО (2026-06-11, путь C, measurement-driven) — owner «делаем C, тест-петля, роли, go»
**Measure-first (R10) исправил наивный дизайн ДО кода** (`.tmp/context-mode-verify.js`, dictaMorph-silver):
наивное «скормить контекст-niqqud офлайн-резолверу» — НЕДОСТАТОЧНО и иногда ВРЕДНО:
- **тип A** (niqqud отличается, оба чтения в дикте): niqqud-feed чинит (סֵפֶר/שֵׁנִי/מֶלֶךְ/האף) ✅;
- **тип B** (POS-only: הַיּוֹם «день»=«сегодня» одинаковая огласовка; מְעַט/מספיק — наречие без офлайн-статьи):
  niqqud не помогает, а на היום даже РЕГРЕССИРОВАЛ («сегодня»→«день»).
**Итоговый дизайн (3 правила, `reader-morph.pickContextReading`, чистая+Node-тестируемая):**
(1) niqqud-feed принимается ТОЛЬКО если Dicta-POS контентный И совпадает с POS разрешённой парадигмы И
pealim_id отличается от офлайн (тип A, без регресса); (2) если Dicta-POS функц./наречие И есть курир.
`CONTEXT_GLOSS[surface]` (היום→«сегодня», מעט→«мало», מספיק→«достаточно», …) → показать его (тип B); (3)
иначе — офлайн без изменений (НИКОГДА не ухудшаем). **RETEST (end-to-end shipped-decision):** FP=0,
broke=0, починено 4–5 гомографов, gold-correct 10/12 (2 промаха — реально-двусмысленные היум). Hard-критерий
FP≈0 выполнен.
**Реализация:** `reader-morph.js` (хук `attach.opts.contextProvider` → `onActivate` берёт `row.he` →
provider → `resolveWordLight(surface,niqqud,ctx)` → `pickContextReading`; `context`-label) · `library-ui.js`
(тумблер «🎯 Точный режим (Dicta)» + хинт; `contextModeEnabled/Set` localStorage `room.contextMode`; провайдер
`makeContextProvider` с per-sentence promise-кэшем → `ReaderDicta.analyzeSentence`→`tokenForSurface`; degrade→null
молча) · `library.html` (CSS `.rm-prov-context` фиолет + `.reader-aids-hint` + статический `reader-dicta.js`) ·
locales ru/en/he (`room.morph.prov.context`/`contextToggle`/`contextHint`) · `sw.js` precache+bump
`v3.10.31-room-context-mode`. **index.html НЕ тронут; parity green; OFF-mode байт-идентичен.**
Гейты: NEW `smoke:reader-context` (тап→«контекст»-бейдж+«сегодня»; Dicta-abort→молчаливый офлайн-откол;
graceful-skip при 503/offline) · reader-morph/parity/corpus-room/room/notes зелёные · `.tmp/context-mode-verify`.

## Статус-лог
- 2026-06-11: путь доказан (браузер→Dicta text/plain, ACAO:*), `reader-dicta.js` + `smoke:reader-dicta`
  зелёный отгружены как фундамент. Интеграция «точного режима» — на owner-go (recon-first выше).
- 2026-06-11: **«точный режим» ОТГРУЖЕН** (путь C, measurement-driven, см. секцию ✅ выше). Тест-петля
  TEST→ANALYZE→CORRECT→RETEST сошлась (FP=0). NB: Dicta троттлит (HTTP 503) при массовом тесте — позитивный
  smoke graceful-skip; в проде тап-частота низкая. Owner-норма: prod-verify тапом после деплоя.
