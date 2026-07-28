# W2-S5a.1: диалог «Импорт» — три вкладки и выход из тупика субтитров

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** убрать из диалога «Импорт» пять плоских входных точек и главный тупик слайса S5a —
Студия сообщает, что у ролика есть ручные субтитры, и не даёт ни одного способа их получить.

**Статус:** дизайн УТВЕРЖДЁН ВЛАДЕЛЬЦЕМ 2026-07-28 (структура: три явные вкладки).
База: прод v3.11.250. Канон слайса: `STUDIO_INGEST_W2_S5A_CAPTIONS_KARAOKE_DESIGN_2026_07_27.md`.

## 1. Что нашла owner-приёмка (живой прогон на проде 2026-07-28)

| # | Находка | Класс |
|---|---|---|
| A | **Подсказка прячет единственный нужный язык.** У ролика `iG9CE55wbtY` **64 дорожки**, ивритская среди них ЕСТЬ (`iw`, ручная). Подсказка вывела «Азербайджанский, Албанский, Английский, Арабский» — первые четыре по алфавиту. Формально правда, практически бесполезно | дефект (R2/R4) |
| B | **Тупик после подсказки.** «У ролика есть ручные субтитры» — и ни одного способа их взять. Нигде не сказано, что источник это штатная панель «Показать текст видео» на YouTube. Плейсхолдер «Вставьте расшифровку с таймкодами…» предполагает знание, которого у пользователя нет. Владелец дошёл до этой стены и остановился | дефект (R4) |
| C | Блок «Субтитры видео» с кнопкой файла и полем вставки **виден всегда**, даже когда диалог открыт ради PDF | UX |
| D | Названия врут об охвате: «Ссылка на статью / страницу» принимает видео; «Извлечь» для видео = «показать плеер»; «Разобрать вставку» не говорит, чего | UX |
| E | Пять входных точек подряд, плоско, без порядка и без подсказки «что дальше» | UX |

**Механизм при этом исправен:** вставка ивритской расшифровки в обход интерфейса дала
20 реплик → 7 сегментов, названия глав отброшены, иврит цел, провенанс честный. Сломан путь
пользователя к работающему движку, а не движок.

**Отдельно проверено и подтверждено владельцу:** вставлять надо ВСЮ панель. Для 20-минутного
ролика это ~427 реплик → ~220 сегментов после слияния, с запасом под капом 400. Предел наступает
на ~36–40 минутах и даёт честное `CAPTIONS_TOO_MANY`.

## 2. Решение владельца

**Три явные вкладки** — «Статья / страница» · «Видео» · «Файл». Внутри «Файла» — фото/PDF/Word,
аудио-или-видео-файл, файл субтитров.

Осознанная цена (владелец её принял): лишний клик на каждом импорте и решение до первого действия.
Компенсируем автопереключением — YouTube-ссылка, вставленная во вкладку «Статья», уводит на
вкладку «Видео» сама, с явной пометкой почему.

## 3. Целевой поток вкладки «Видео» (ядро задачи)

```
[ Ссылка на видео (YouTube) ............. ] [Показать видео]
        ↓
[            плеер (credentialless)            ]
        ↓  плеер сообщил дорожки
✓ Есть ручные субтитры на иврите          ← ЯЗЫК ТАБЛИЦЫ ПЕРВЫМ, не алфавит
  и ещё 63 языка                          ← мелко, вторично

Как перенести их сюда:
 1. [Открыть ролик на YouTube ↗]
 2. «…» → «Показать текст видео» → выберите Иврит
 3. Выделите панель целиком, скопируйте, вернитесь сюда

Вставьте расшифровку из панели YouTube
[ ...................................... ]
[Использовать расшифровку]
или [Файл субтитров (.vtt / .srt)]
```

### Приоритет языка в подсказке (закрывает находку A)

Целевой язык — иврит: seg-режим работает только для `he-ru`, и продукт про иврит. Порядок проверок:

1. ручная дорожка на иврите (`iw`/`he`, `kind !== 'asr'`) → «Есть ручные субтитры на иврите»
   + вторая строка «и ещё N языков» (без перечисления);
2. иначе авто-дорожка на иврите → «Есть только авто-субтитры на иврите — качество не гарантировано»;
3. иначе есть ручные, но не на иврите → «Ивритских субтитров нет. Есть ручные на: X, Y, Z»
   (до трёх + «и ещё N»);
4. иначе пусто и не подтверждено → текущий «pending»-текст;
5. иначе подтверждено и пусто → текущий «none»-текст.

Формулировки остаются свидетельством, не утверждением (R9): «есть ручные субтитры» — это то, что
сообщил плеер, а не наше суждение о качестве текста, который пользователь принесёт.

## 4. Файлы

```
public/index.html          MOD  разметка модала (вкладки + три панели), CSS вкладок и блока инструкции
public/js/studio-import.js MOD  switchTab/активная вкладка, автопереключение на видео,
                                describeTracks с приоритетом иврита, кнопка «Открыть на YouTube»,
                                общий скрытый input для файла субтитров
public/i18n/locales/{ru,en,he}.js  MOD  новые строки + переименованные
tests/                     MOD  unit на выбор языка подсказки (pure-функция)
public/sw.js               MOD  CACHE_VERSION (релиз-задача)
```

Порядок: pure-логика подсказки (1) → вкладки и разметка (2) → инструкция и переименования (3) →
релиз (4) → owner-приёмка (5).

## Global Constraints

- Zero server changes: `server.js` и `ingest/**` не трогать.
- COEP/COOP не трогать; плеер только через `<iframe credentialless>`.
- Каждая новая/переименованная строка → **все три локали**; `npm run smoke:i18n` — гейт.
- Мобильная ловушка `button { width: 100% }`: у каждого нового контейнера с кнопками — явное
  исключение (id — без `!important`, класс — с `!important`).
- Скриншот @380×844 перед каждым UI-коммитом, смотреть глазами.
- `renderTable` и Зал не трогать; `npm run smoke:reader-parity` зелёный.
- Пуш только в релиз-задаче; стейджить явными путями, никогда `git add -A` и никогда каталогом.
- Trailers: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` и
  `Claude-Session: https://claude.ai/code/session_01FTRJHvKHrnFRPoCbgGgaD5`.

---

### Task 1: приоритет языка в подсказке о дорожках (pure + unit)

**Files:** Modify `public/js/studio-import.js`; Test `tests/importTrackHint.test.js` (создать)

**Interfaces:** Produces `StudioImport.chooseTrackHint(list, confirmed) → {key, args}` — чистая,
без DOM, экспортируется для теста через `window.StudioImport` и `module.exports` в Node.
`key` — ключ локали, `args` — `{langs?: string, more?: number}` для подстановки.

- [ ] **Step 1: Write the failing test**

```js
// tests/importTrackHint.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const SI = require("../public/js/studio-import.js");

const T = (lang, kind, name) => ({ languageCode: lang, kind: kind, languageName: name });

test("manual Hebrew wins over everything, alphabet is irrelevant", () => {
  const list = [T("az", "", "Азербайджанский"), T("sq", "", "Албанский"),
                T("en", "", "Английский"), T("iw", "", "Иврит")];
  const r = SI.chooseTrackHint(list, true);
  assert.equal(r.key, "studio.import.captionsTracksHeManual");
  assert.equal(r.more, 3);
});

test("he code variant is recognised too", () => {
  assert.equal(SI.chooseTrackHint([T("he", "", "Hebrew")], true).key,
               "studio.import.captionsTracksHeManual");
});

test("auto Hebrew is named as auto, not as manual", () => {
  const r = SI.chooseTrackHint([T("en", "", "Английский"), T("iw", "asr", "Иврит")], true);
  assert.equal(r.key, "studio.import.captionsTracksHeAuto");
});

test("manual Hebrew beats auto Hebrew when both exist", () => {
  const r = SI.chooseTrackHint([T("iw", "asr", "Иврит"), T("iw", "", "Иврит")], true);
  assert.equal(r.key, "studio.import.captionsTracksHeManual");
});

test("no Hebrew: says so and lists at most three others", () => {
  const list = [T("en", "", "Английский"), T("de", "", "Немецкий"),
                T("fr", "", "Французский"), T("es", "", "Испанский")];
  const r = SI.chooseTrackHint(list, true);
  assert.equal(r.key, "studio.import.captionsTracksNoHe");
  assert.equal(r.langs.split(", ").length, 3);
  assert.equal(r.more, 1);
});

test("empty list: pending before confirmation, none after", () => {
  assert.equal(SI.chooseTrackHint([], false).key, "studio.import.captionsTracksPending");
  assert.equal(SI.chooseTrackHint([], true).key, "studio.import.captionsTracksNone");
  assert.equal(SI.chooseTrackHint(null, false).key, "studio.import.captionsTracksPending");
});

test("a track without name or code never renders as undefined", () => {
  const r = SI.chooseTrackHint([{ kind: "" }, T("en", "", "Английский")], true);
  assert.equal(r.key, "studio.import.captionsTracksNoHe");
  assert.ok(!/undefined/.test(r.langs || ""));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test tests/importTrackHint.test.js` → FAIL (`chooseTrackHint` не существует;
модуль в Node сейчас возвращается раньше, чем что-то экспортирует).

- [ ] **Step 3: Implement**

`studio-import.js` начинается с `if (typeof window === "undefined") return;` — из-за этого модуль
в Node пуст. Вынести `chooseTrackHint` ВЫШЕ этого выхода и добавить Node-экспорт по образцу
`public/js/studio-media-karaoke.js:22-25` (там ровно такой приём: pure-часть экспортируется,
DOM-часть не инициализируется).

```js
  var HE_RE = /^(iw|he)\b/i;

  // Целевой язык продукта — иврит (seg-режим работает только he-ru). Алфавитный список дорожек
  // бесполезен: у одного ролика их бывает 64, и нужная тонет. Поэтому иврит проверяется первым.
  function chooseTrackHint(list, confirmed) {
    var tracks = Array.isArray(list) ? list : [];
    if (!tracks.length) {
      return { key: confirmed ? "studio.import.captionsTracksNone" : "studio.import.captionsTracksPending" };
    }
    var he = tracks.filter(function (t) { return t && HE_RE.test(String(t.languageCode || "")); });
    var heManual = he.filter(function (t) { return t.kind !== "asr"; });
    if (heManual.length) {
      return { key: "studio.import.captionsTracksHeManual", more: Math.max(0, tracks.length - heManual.length) };
    }
    if (he.length) {
      return { key: "studio.import.captionsTracksHeAuto", more: Math.max(0, tracks.length - he.length) };
    }
    var manual = tracks.filter(function (t) { return t.kind !== "asr"; });
    var pool = manual.length ? manual : tracks;
    var names = pool.map(function (t) { return t.languageName || t.languageCode; }).filter(Boolean);
    var uniq = names.filter(function (v, i) { return names.indexOf(v) === i; });
    return { key: "studio.import.captionsTracksNoHe", langs: uniq.slice(0, 3).join(", "),
             more: Math.max(0, uniq.length - 3) };
  }
```

`describeTracks` переписать поверх этого: взять `{key, langs, more}`, подставить `langs` в строку и
добавить вторую строку «и ещё N языков» только когда `more > 0`.

- [ ] **Step 4: Locale keys ×3**

Новые ключи в `ru.js`/`en.js`/`he.js` (значения на языке файла; русские ниже):
`captionsTracksHeManual` «✓ Есть ручные субтитры на иврите», `captionsTracksHeAuto`
«Есть только авто-субтитры на иврите — качество не гарантировано», `captionsTracksNoHe`
«Ивритских субтитров нет. Есть ручные на: {langs}», `captionsTracksMore` «и ещё {n} языков».

Run: `npm run smoke:i18n` → PASS.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/importTrackHint.test.js && npm run smoke:i18n`

```bash
git add public/js/studio-import.js tests/importTrackHint.test.js public/i18n/locales/ru.js public/i18n/locales/en.js public/i18n/locales/he.js
git commit -m "fix(ingest): W2-S5a.1 T1 — track hint names Hebrew first, not the alphabet"
```

---

### Task 2: три вкладки

**Files:** Modify `public/index.html` (разметка модала + CSS), `public/js/studio-import.js`,
локали ×3

**Interfaces:** Consumes ничего нового. Produces `StudioImport.switchTab(name)` где
`name ∈ {"url","video","file"}`; активная вкладка запоминается в модуле (НЕ в localStorage —
диалог всегда открывается на «Статья», чтобы поведение было предсказуемым).

- [ ] **Step 1: Разметка**

Заменить тело `.v3-modal-body` (`index.html:46492`+) на: полоса из трёх кнопок-вкладок
(`id="v3ImportTabUrl|Video|File"`, `role="tab"`, `aria-selected`) и три панели
(`id="v3ImportPaneUrl|Video|File"`, `role="tabpanel"`), из которых видна одна. Существующие
элементы РАЗНЕСТИ по панелям, **не пересоздавая их id** — на них висят обработчики и тесты:

- панель «url»: `v3ImportUrl` + `v3ImportUrlBtn`;
- панель «video»: новое поле `v3ImportVideoUrl` + кнопка `v3ImportVideoBtn`, затем `v3ImportYtMount`,
  `v3ImportYtHint`, блок инструкции (Task 3), `v3ImportCaptionsPaste`, `v3ImportCaptionsPasteBtn`,
  кнопка-обёртка для общего input файла субтитров;
- панель «file»: `v3ImportFile` (фото/PDF/Word), `v3ImportAudio` + `v3ImportAudioInfo`, и вторая
  кнопка, открывающая тот же `v3ImportCaptionsFile`.

`v3ImportCaptionsFile` — ОДИН скрытый input, две кнопки его открывают
(`document.getElementById('v3ImportCaptionsFile').click()`).

`v3ImportStatus` и `v3ImportPreviewWrap` остаются ОБЩИМИ, ниже панелей: превью и статус относятся
к любому сценарию.

- [ ] **Step 2: CSS + мобильная ловушка**

Полоса вкладок: `display:flex; gap:4px;` активная — рамкой/фоном, не только цветом текста
(доступность). Обязательные исключения:

```css
#v3ImportTabs button { width: auto; }
#v3ImportPaneVideo button, #v3ImportPaneFile button, #v3ImportPaneUrl button { width: auto; }
```

- [ ] **Step 3: Переключение и автопереход**

`switchTab(name)` прячет/показывает панели, ставит `aria-selected`, чистит `v3ImportStatus`.
`open()` всегда ставит `"url"` и чистит поле вставки (уже делает).

Автопереход (компенсация цены вкладок): в обработчике вкладки «Статья» — если введённая строка
распознаётся `StudioYtPlayer.parseVideoId`, то НЕ звать `fetch-url`, а перенести значение в
`v3ImportVideoUrl`, переключиться на «Видео», показать статус
`studio.import.switchedToVideo` («Похоже на видео — открыл вкладку «Видео»») и смонтировать плеер.
Это сохраняет уже работающее поведение `fetchUrlOrVideo`, но делает его объяснённым.

Кнопка вкладки «Видео» зовёт монтирование напрямую по `v3ImportVideoUrl`; если строка не
распознана как видео — честная ошибка `studio.import.errNotVideoUrl`, а не молчание.

- [ ] **Step 4: Переименования (все три локали)**

`urlLabel` → «Ссылка на статью или страницу»; `fetchBtn` → «Извлечь текст»;
новые: `tabUrl` «Статья / страница», `tabVideo` «Видео», `tabFile» «Файл»,
`videoUrlLabel` «Ссылка на видео (YouTube)», `videoUrlBtn` «Показать видео»,
`errNotVideoUrl` «Это не похоже на ссылку YouTube», `switchedToVideo` «Похоже на видео — открыл вкладку «Видео»»,
`fileLabelPhoto` «Фото, PDF или Word (до 6 МБ)», `fileLabelAv` «Аудио или видео-файл (иврит)»,
`fileLabelCaptions` «Файл субтитров (.vtt / .srt)».

- [ ] **Step 5: Скриншоты и проверка**

`npm start`, открыть диалог, снять @380×844 КАЖДУЮ вкладку, посмотреть глазами: кнопки не тянутся
на всю ширину, полоса вкладок не переносится в две строки, панели не прыгают по высоте.
Run: `npm run smoke:i18n && npm run smoke:reader-parity && node --test`

- [ ] **Step 6: Commit** (пути явно; сообщение
`feat(ingest): W2-S5a.1 T2 — import dialog split into three explicit tabs`)

---

### Task 3: выход из тупика — инструкция «как забрать субтитры»

**Files:** Modify `public/index.html`, `public/js/studio-import.js`, локали ×3

Это ядро находки B: сейчас Студия сообщает о существовании субтитров и молчит о том, как их взять.

- [ ] **Step 1: Разметка блока**

Внутри панели «video», между `v3ImportYtHint` и полем вставки — блок `id="v3ImportCaptionsHow"`,
`hidden` по умолчанию: заголовок «Как перенести их сюда», нумерованный список из трёх шагов и
кнопка-ссылка `id="v3ImportOpenYt"` («Открыть ролик на YouTube ↗»).

Кнопка — настоящая `<a target="_blank" rel="noopener noreferrer">`, `href` ставится из
распознанного videoId как `https://www.youtube.com/watch?v=<id>`. **Собирать href из videoId, а не
из введённой пользователем строки** — id уже провалидирован `parseVideoId` по `^[A-Za-z0-9_-]{11}$`,
а сырая строка пользователя в `href` не попадает.

Поле вставки получает видимый заголовок `captionsPasteLabel` («Вставьте расшифровку из панели
YouTube»), а не только плейсхолдер.

- [ ] **Step 2: Показ блока**

Блок показывается, когда плеер смонтирован (независимо от того, сообщил ли он дорожки) — потому что
инструкция полезна и до подтверждения. Скрывается при закрытии диалога и при смене вкладки.

- [ ] **Step 3: Тексты шагов ×3 локали**

`howTitle` «Как перенести их сюда», `howStep1` «Откройте ролик на YouTube», `howStep2`
««…» → «Показать текст видео» → выберите Иврит», `howStep3` «Выделите панель целиком, скопируйте и
вернитесь сюда», `openYtBtn` «Открыть ролик на YouTube ↗», `captionsPasteLabel` «Вставьте
расшифровку из панели YouTube», `captionsPasteBtn` → «Использовать расшифровку».

Дописать в подсказку про объём: `captionsPasteHint` «Копируйте панель целиком: для 20-минутного
ролика это ~220 строк таблицы». (Проверено на приёмке: ~427 реплик → ~220 сегментов.)

- [ ] **Step 4: Живая проверка end-to-end**

В реальном браузере: вставить ссылку на ролик с ручными ивритскими субтитрами → плеер → запустить →
подсказка называет иврит → нажать «Открыть ролик на YouTube» (открылась новая вкладка на этом же
ролике) → скопировать панель → вставить → «Использовать расшифровку» → превью показывает сегменты →
«→ В поле ввода». Приложить в отчёт, что именно показала подсказка и сколько получилось сегментов.

- [ ] **Step 5: Скриншот @380×844 + commit**

---

### Task 4: релиз

- [ ] **Step 1:** bump `CACHE_VERSION` в `public/sw.js` (v3.11.250 → v3.11.251); новых файлов в
  precache не появилось — проверить grep-ом, что версия больше нигде не рассинхронизирована.
- [ ] **Step 2:** полный прогон: `node --test`, `smoke:captions-parse`, `smoke:media-karaoke`,
  `smoke:ingest`, `smoke:reader-parity`, `smoke:studio-karaoke`, `smoke:i18n`, `test:api-smoke`,
  `smoke:yt-player`. Любой красный — СТОП.
- [ ] **Step 3:** whole-branch ревью ДО пуша (контроллер).
- [ ] **Step 4:** единственный пуш + прод-верификация: `/healthz` 200, SW-версия на проде,
  `smoke:yt-player -- --url=https://linguistpro.kolosei.com`.

---

### Task 5: owner-приёмка

Владелец проходит тот же сценарий, что вскрыл находки: вставить ссылку на TED-ролик во вкладку
«Статья» (должно автопереключить на «Видео» с пометкой), запустить, убедиться, что подсказка
называет **иврит**, пройти по инструкции до вставки и получить таблицу. Плюс проверить, что вкладка
«Файл» не показывает ничего про субтитры-видео, пока не выбран файл.

---

## Итог (2026-07-28): SHIPPED v3.11.251, owner-приёмка pending

Прод: `linguistpro.kolosei.com`, SW `v3.11.251`, `COEP: require-corp` цел, живой смоук плеера
зелёный на Chrome 150 / Edge 150 / Chromium 148 (обе половины, включая караоке).

**Что закрыто из находок приёмки S5a:**

| # | Находка | Состояние |
|---|---|---|
| A | Подсказка прятала иврит за алфавитом | ✅ иврит называется первым; чистая функция `chooseTrackHint` под 12 тестами; на живом ролике «✓ Есть ручные субтитры на иврите / и ещё 63 языка» |
| B | Тупик: сказали «субтитры есть» и не дали способа их взять | ✅ блок «Как перенести их сюда» с тремя шагами и кнопкой «Открыть ролик на YouTube ↗» (href строится ТОЛЬКО из провалидированного videoId) |
| C | Блок субтитров висел всегда | ✅ живёт во вкладке «Видео»; уход с вкладки уничтожает плеер и чистит состояние |
| D | Названия врали об охвате | ✅ «Ссылка на видео (YouTube)» / «Показать видео» / «Использовать расшифровку» |
| E | Пять входов вразброс | ✅ три вкладки; ютуб-ссылка во вкладке «Статья» сама уходит на «Видео» с пометкой |

**Дополнительно найдено и починено по ходу:** ложное «у ролика нет субтитров» при пустом
tracklist (дважды — сначала в S5a, потом рецидивом через исчерпание опроса); утечка провенанса
(файл субтитров получал ссылку на ранее открытое видео); iframe продолжал звучать после ухода с
вкладки; русские склонения («и ещё 63 языков» → «языка», CLDR one/few/many); заглушка `{langs}`;
захардкоженный русский `aria-label`.

**Правило подсказки (канон, не переоткрывать частями):** повышать точность можно от ЛЮБОГО
триггера (монтирование, тик ограниченной лесенки, любая смена состояния плеера — включая
BUFFERING/CUED); утверждать отсутствие субтитров — ТОЛЬКО после реального PLAYING и пустого списка
после grace-окна; уже показанный настоящий ответ не откатывать никогда.

**Граница доказанного.** Апгрейд подсказки подтверждён двумя независимыми живыми наблюдениями в
настоящем Chrome. В автоматизированном браузере контроллера этот ролик стабильно виснет в
BUFFERING и до PLAYING не доходит; в этом состоянии tracklist наполняется (64), но апгрейд не
срабатывает. Пять попыток — тот же результат. Это артефакт среды, а не подтверждённый дефект;
разрешается одним живым кликом на приёмке (сценарий 1 ниже).

## Owner-приёмка

1. Ролик с ручными ивритскими субтитрами: ссылка → «Показать видео» → **нажать play** → подсказка
   обязана назвать иврит. Если осталась «Плеер пока не сообщил…» — это тот самый нерешённый случай,
   сообщить.
2. Пройти по инструкции: «Открыть ролик на YouTube» → «Показать текст видео» → Иврит → выделить
   панель ЦЕЛИКОМ → скопировать → вставить → «Использовать расшифровку» → таблица + караоке.
3. Мобильный Safari/iPhone: плеера нет, таблица и таймкоды есть, объяснение показано.
4. Вкладка «Файл»: ничего про субтитры видео, пока не выбран файл.
5. ⚠ После деплоя нужна ОДНА перезагрузка страницы, чтобы новый service worker вступил в силу.
