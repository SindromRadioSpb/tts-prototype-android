"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const SI = require("../public/js/studio-import.js"); // node-ветка dual-export
const A = require("../public/js/asr-transcript.js");

function fakeParse(raw) { return JSON.parse(raw); }
function seg(start, text) { return { start, text }; }
const R = (o) => JSON.stringify(Object.assign({ language: "he", warnings: [] }, o));

test("короткий файл (одно окно): transcribe вызывается с null-диапазоном, plain-путь", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 150,
    transcribe: async (a, b) => { calls.push([a, b]); return R({ segments: [seg(1, "א"), seg(5, "ב")] }); },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[null, null]]); // без range — байт-в-байт прежний промт
  assert.equal(res.segments.length, 2);
  assert.deepEqual(res.coverageGaps, []);
});

test("два окна: последовательность, merge, прогресс, язык/warnings агрегируются", async () => {
  const calls = [], progress = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000,
    transcribe: async (a, b) => {
      calls.push([a, b]);
      return a === 0 ? R({ segments: [seg(820, "א"), seg(890, "ב")], warnings: ["PARTIALLY_UNCLEAR"] })
                     : R({ segments: [seg(905, "ג"), seg(975, "ד")] });
    },
    parse: fakeParse, onProgress: (k, m) => progress.push([k, m]),
  });
  assert.deepEqual(calls, [[0, 900], [900, 1000]]);
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
  assert.deepEqual(res.segments.map((s) => s.start), [820, 890, 905, 975]);
  assert.deepEqual(res.warnings, ["PARTIALLY_UNCLEAR"]);
  assert.equal(res.language, "he");
});

test("BAD_JSON окна: retry ×1 и успех; счётчик retries в windows", async () => {
  let first = true;
  const res = await SI.runWindowedAsr({
    durationSec: 150,
    transcribe: async () => {
      if (first) { first = false; return "мусор"; }
      return R({ segments: [seg(1, "א"), seg(2, "ב")] });
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.equal(res.windows[0].retries, 1);
  assert.equal(res.segments.length, 2);
});

// S12.2 (владелец 2026-07-28): окно 2/8 четырежды подряд вернуло битый JSON и заблокировало ВЕСЬ
// полуторачасовой транскрипт — нарушение project-нормы «per-item best-effort». Семантика меняется:
// ASR_BAD_JSON после retry ×1 больше НЕ throw — вместо этого бисекция окна. Этот тест (бывший
// «BAD_JSON дважды: throw…») ПЕРЕПИСАН под новую семантику: окно, обе половины которого ТОЖЕ дают
// BAD_JSON (итого 6 вызовов на окно: [a,b]×2, [a,mid]×2, [mid,b]×2), теряется ЦЕЛИКОМ и честно —
// bisected:true + skippedRanges на ОБЕ половины — но прогон НЕ падает и доходит до конца. Дыра
// (window0 last=850 → duration=1100, tail-gap >180с) естественно ловится существующим
// findCoverageGaps → heal-добор (единственный вызов, [850,1100]), который здесь тоже неудачен →
// coverageGaps+ASR_COVERAGE_GAP — тот же каскад, что и для дыр из честного ответа модели, без
// какого-либо специального кода под бисекцию. Числа проверены прямым прогоном runWindowedAsr
// (методика файла) ДО фиксации фикстуры.
test("BAD_JSON дважды (обе половины бисекции тоже BAD_JSON): окно теряется целиком, НЕ throw, дыра уходит в coverageGaps через штатный heal-каскад", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1100, // windows [0,900) [900,1100)
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: [seg(850, "a0")] });
      if (a === 900 && b === 1100) return "мусор"; // окно1 primary ×2
      if (a === 900 && b === 1000) return "мусор"; // половина A (900,1000) ×2
      if (a === 1000 && b === 1100) return "мусор"; // половина B (1000,1100) ×2
      if (a === 850 && b === 1100) return R({ segments: [], warnings: ["NO_SPEECH"] }); // heal-добор дыры — неудачен
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(calls, [
    [0, 900], [900, 1100], [900, 1100], [900, 1000], [900, 1000], [1000, 1100], [1000, 1100], [850, 1100],
  ]);
  assert.deepEqual(res.segments.map((s) => s.text), ["a0"]); // окно0 цело, окно1 честно потеряно целиком
  assert.equal(res.windows[1].bisected, true);
  assert.deepEqual(res.windows[1].skippedRanges, [{ startSec: 900, endSec: 1000 }, { startSec: 1000, endSec: 1100 }]);
  assert.deepEqual(res.coverageGaps, [{ fromSec: 850, toSec: 1100 }]);
  assert.ok(res.warnings.includes("ASR_COVERAGE_GAP"));
});

// (a) Обе половины бисекции УСПЕШНЫ (на первой же попытке — retry внутри половины не нужен).
// Проверяет: порядок вызовов ([a,b]×2 для BAD_JSON-провала окна, затем [a,mid], затем [mid,b]),
// сегменты обеих половин на месте и упорядочены по времени, windows[k].bisected===true,
// skippedRanges отсутствует (успех — поле отсутствует). Фикстура подобрана БЕЗ дыр (все хопы
// <90с, хвост <180с) — проверено прямым прогоном, чтобы heal-каскад не добавлял посторонних
// вызовов в calls и не размывал фокус теста на самой бисекции.
test("бисекция: обе половины успешны → сегменты на месте, bisected:true, порядок вызовов [a,b]×2→[a,mid]→[mid,b]", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 950, // windows [0,900) [900,950), mid окна1 = 925
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: [seg(880, "a0")] });
      if (a === 900 && b === 950) return "мусор"; // окно1 primary ×2 → бисекция
      if (a === 900 && b === 925) return R({ segments: [seg(910, "h1")] }); // половина A — успех с 1-й попытки
      if (a === 925 && b === 950) return R({ segments: [seg(935, "h2")] }); // половина B — успех с 1-й попытки
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [900, 950], [900, 950], [900, 925], [925, 950]]);
  assert.deepEqual(res.segments.map((s) => s.text), ["a0", "h1", "h2"]);
  assert.equal(res.windows[1].bisected, true);
  assert.equal(res.windows[1].skippedRanges, undefined); // обе половины успешны — пропусков нет
  assert.deepEqual(res.coverageGaps, []);
  assert.deepEqual(res.warnings, []);
});

// (b) Одна половина падает дважды (BAD_JSON×2) → честно пропускается (skippedRanges), вторая
// половина успешна. Образовавшуюся дыру ЛОВИТ УЖЕ РЕАЛИЗОВАННЫЙ findCoverageGaps→heal-каскад —
// никакого нового кода под дыру здесь нет. Оба исхода добора: (i) успешен — дыра закрывается
// полностью, никакого ASR_COVERAGE_GAP; (ii) неудачен — дыра остаётся честной, coverageGaps+warning.
test("(b-i) половина A пропущена (BAD_JSON×2), половина B успешна → дыра добрана heal-каскадом полностью", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, // windows [0,900) [900,1000), mid окна1 = 950
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: [seg(850, "a0")] });
      if (a === 900 && b === 1000) return "мусор"; // окно1 primary ×2 → бисекция
      if (a === 900 && b === 950) return "мусор"; // половина A ×2 → skip
      if (a === 950 && b === 1000) return R({ segments: [seg(980, "h1")] }); // половина B — успех
      if (a === 850 && b === 980) return R({ segments: [seg(910, "heal1")] }); // heal-добор дыры — успешен, закрывает целиком
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [900, 1000], [900, 1000], [900, 950], [900, 950], [950, 1000], [850, 980]]);
  assert.deepEqual(res.windows[1].skippedRanges, [{ startSec: 900, endSec: 950 }]);
  assert.equal(res.windows[1].bisected, true);
  assert.deepEqual(res.segments.map((s) => s.text), ["a0", "heal1", "h1"]); // heal-сегмент встал МЕЖДУ границами дыры
  assert.deepEqual(res.healedGaps, [{ fromSec: 850, toSec: 980 }]);
  assert.deepEqual(res.coverageGaps, []);
  assert.ok(!res.warnings.includes("ASR_COVERAGE_GAP"));
});

test("(b-ii) половина A пропущена, heal-добор дыры тоже неудачен → coverageGaps + ASR_COVERAGE_GAP (дыра честная, не маскируется)", async () => {
  const res = await SI.runWindowedAsr({
    durationSec: 1000,
    transcribe: async (a, b) => {
      if (a === 0) return R({ segments: [seg(850, "a0")] });
      if (a === 900 && b === 1000) return "мусор";
      if (a === 900 && b === 950) return "мусор"; // skip половины A
      if (a === 950 && b === 1000) return R({ segments: [seg(980, "h1")] });
      if (a === 850 && b === 980) return R({ segments: [], warnings: ["NO_SPEECH"] }); // heal-добор неудачен
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(res.windows[1].skippedRanges, [{ startSec: 900, endSec: 950 }]);
  assert.deepEqual(res.segments.map((s) => s.text), ["a0", "h1"]); // сегменты половины A честно отсутствуют
  assert.deepEqual(res.healedGaps, []);
  assert.deepEqual(res.coverageGaps, [{ fromSec: 850, toSec: 980 }]);
  assert.ok(res.warnings.includes("ASR_COVERAGE_GAP"));
});

// (c) Единственное окно (короткий файл): обычный путь передаёт transcribe(null,null) — без
// range-промта. При BAD_JSON×2 бисекция ОБЯЗАНА построить ЯВНЫЕ числовые границы 0/dur/2/dur —
// это первый случай range-промта для короткого файла (честно, задокументировано в комментарии
// исходника), а не молчаливая деградация обратно на null.
test("(c) single-файл: BAD_JSON×2 → бисекция явными диапазонами 0/dur/2/dur (не null)", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 150,
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === null) return "мусор"; // primary ×2 (single всегда шлёт null,null)
      if (a === 0 && b === 75) return R({ segments: [seg(10, "s1")] });
      if (a === 75 && b === 150) return R({ segments: [seg(100, "s2")] });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(calls, [[null, null], [null, null], [0, 75], [75, 150]]);
  assert.deepEqual(res.segments.map((s) => s.text), ["s1", "s2"]);
  assert.equal(res.windows[0].bisected, true);
  assert.deepEqual(res.coverageGaps, []);
});

// (d) Семантика резюма НЕ сломана: любая ошибка КРОМЕ ASR_BAD_JSON (429/квота/сеть/HTTP)
// по-прежнему throw с windowIndex/windowSegments — бисекция срабатывает ТОЛЬКО на ASR_BAD_JSON.
// Ревью (R16): проверка ТОЛЬКО формы ошибки не ловит мутацию «пустить 429 тоже через
// bisectWindow» — та мутация всё ещё кидала бы с тем же code/windowIndex/windowSegments, просто
// после нескольких лишних вызовов transcribe (2-4 сверх нормы = лишние оплаченные Gemini-запросы
// на КАЖДОЕ 429-окно длинного файла). Счётчик вызовов делает разницу видимой.
test("(d) 429/квота — по-прежнему throw c windowIndex, бисекция не запускается (счётчик вызовов, R16)", async () => {
  const calls = [];
  await assert.rejects(
    SI.runWindowedAsr({
      durationSec: 1400,
      transcribe: async (a, b) => {
        calls.push([a, b]);
        if (a === 0) return R({ segments: [seg(1, "a0")] });
        const e = new Error("rate limited"); e.code = "GEMINI_QUOTA"; e.status = 429; throw e;
      },
      parse: fakeParse, onProgress: () => {},
    }),
    (e) => e.code === "GEMINI_QUOTA" && e.windowIndex === 1 && e.windowSegments.length === 1 &&
           e.windowSegments[0][0].text === "a0");
  // Ровно 2 вызова: окно0 успех (1 вызов) + окно1 429 (1 вызов, немедленный throw). НЕ 3 (был бы
  // retry внутри oneCall — но oneCall ретраит ТОЛЬКО ASR_BAD_JSON, 429 кидает без retry) и НЕ
  // 3-6 (была бы бисекция окна1 — bisectWindow срабатывает ТОЛЬКО когда пойманный e.code ===
  // "ASR_BAD_JSON"; здесь код "GEMINI_QUOTA", условие ложно, bisectWindow не вызывается вообще).
  assert.deepEqual(calls, [[0, 900], [900, 1400]]);
});

test("резюм: startWindow/priorWindows продолжают без повторного вызова готовых окон", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, startWindow: 1,
    priorWindows: [[seg(850, "א"), seg(870, "б")]],
    transcribe: async (a, b) => { calls.push([a, b]); return R({ segments: [seg(905, "ג")] }); },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[900, 1000]]);
  assert.deepEqual(res.segments.map((s) => s.text), ["א", "б", "ג"]);
});

test("дыра >90с внутри → добор range-вызовом ровно дыры; merge упорядочен; healedGaps в провенанс", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 300, // одно окно
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === null) return R({ segments: [seg(10, "א"), seg(200, "ב"), seg(230, "ג")] }); // дыра 10→200
      return R({ segments: [seg(90, "д1"), seg(150, "д2")] }); // добор
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[null, null], [10, 200]]);
  assert.deepEqual(res.segments.map((s) => s.start), [10, 90, 150, 200, 230]);
  assert.deepEqual(res.healedGaps, [{ fromSec: 10, toSec: 200 }]);
  assert.deepEqual(res.coverageGaps, []); // после добора дыр нет
});

test("остаточная дыра после добора → coverageGaps + warning ASR_COVERAGE_GAP, максимум 3 добора", async () => {
  let healCalls = 0;
  const res = await SI.runWindowedAsr({
    durationSec: 300,
    transcribe: async (a) => {
      if (a === null) return R({ segments: [seg(10, "א"), seg(200, "ב"), seg(230, "ג")] });
      healCalls++;
      return R({ segments: [], warnings: ["NO_SPEECH"] }); // добор ничего не нашёл
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.equal(healCalls, 1); // на одну дыру — один добор, не цикл
  assert.deepEqual(res.coverageGaps, [{ fromSec: 10, toSec: 200 }]);
  assert.ok(res.warnings.includes("ASR_COVERAGE_GAP"));
});

test("все окна пустые → NO_SPEECH в warnings, segments []", async () => {
  const res = await SI.runWindowedAsr({
    durationSec: 1200,
    transcribe: async () => R({ language: null, segments: [], warnings: ["NO_SPEECH"] }),
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(res.segments, []);
  assert.ok(res.warnings.includes("NO_SPEECH"));
});

// fix1 (ревью после T3, R11-порядок): null-start сегмент возникает у немонотонного стыка окон
// (mergeWindowSegments честно обнуляет start, когда следующий сегмент раньше предыдущего по
// времени) — и такой сегмент может структурно стоять ПОСЛЕ дыры, которую добираем. Позиционная
// (по индексу) вставка добора обязана оставить его там же, а не тянуть перед heal-вставкой
// только из-за null-значения start. Арифметика дыр здесь проверена прямыми вызовами
// mergeWindowSegments/findCoverageGaps ДО фиксации фикстуры (см. журнал сессии) — тем же
// приёмом, что и при перемасштабировании остальных тестов файла.
// S12.3 (2026-07-29): "d" был start:5 в оригинальной фикстуре — чисто чтобы триггернуть
// немонотонность у merge; после клиппинга (T2) числовой start вне [898,1002] окна1 отбрасывался
// БЫ клиппингом ещё ДО merge, и "d" исчезал бы целиком (не оставался null-start), ломая фокус
// этого теста (позиционная вставка ПРИ heal, а не клиппинг). Значение заменено на 900 — внутри
// clip-допуска окна1 ([898,1002]), но всё ещё < 950 ("c"), поэтому merge по-прежнему честно
// нулит его start из-за немонотонности СВОЕГО ЖЕ окна. Клиппинг и merge-null — РАЗНЫЕ механизмы
// на разных стадиях; это подтверждено отдельным тестом ниже (см. "клиппинг окна…").
test("null-start сегмент ПОСЛЕ дыры не переезжает при доборе (позиционная вставка, не по start)", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, // 2 окна: [0,900) и [900,1000)
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: [seg(10, "a"), seg(890, "b")] }); // окно0: дыра 10→890
      if (a === 900) return R({ segments: [seg(950, "c"), seg(900, "d")] }); // окно1: 900<950(lastT) → "d" немонотонен → start:null после merge (900 внутри clip-допуска окна1, клиппинг его не трогает)
      return R({ segments: [seg(100, "h1"), seg(400, "h2")] }); // добор дыры (10,890)
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [900, 1000], [10, 890]]);
  // (а) порядок текстов: heal-сегменты встают СРАЗУ ПОСЛЕ границы дыры (10), "d" остаётся на
  // своей структурной позиции — последним, после "c", а не перед heal-вставкой.
  assert.deepEqual(res.segments.map((s) => s.text), ["a", "h1", "h2", "b", "c", "d"]);
  // (б) null-start сегмент физически последний и после heal-сегментов, не между "a" и heal.
  const dIdx = res.segments.findIndex((s) => s.text === "d");
  assert.equal(dIdx, res.segments.length - 1);
  assert.equal(res.segments[dIdx].start, null);
  assert.deepEqual(res.healedGaps, [{ fromSec: 10, toSec: 890 }]);
});

// I1 (whole-branch review 2026-07-28, R11): ДВЕ дыры в одном окне. Добор ПЕРВОЙ дыры (10,300)
// перелетает (overshoot) через границу ВТОРОЙ дыры (300) — возвращает сегмент start:301 > 300.
// Ре-merge внутри цикла честно обнуляет start пограничного сегмента b (300 < 301 →
// немонотонность), поэтому на втором проходе поиск insertAt (start === gap.fromSec === 300)
// НИЧЕГО не находит: insertAt=-1. Без guard'а `merged.slice(0, insertAt+1)` = `merged.slice(0, 0)`
// вставляет добор второй дыры ПРЕФИКСОМ перед "a" — молчаливая перестановка всего транскрипта.
// Числа проверены прямыми вызовами mergeWindowSegments/findCoverageGaps И полным прогоном
// runWindowedAsr (методика T3, см. журнал сессии) ДО фиксации фикстуры — включая сам баг
// (воспроизведён до фикса insertAt<0 continue).
// S12.3 (2026-07-29): h2 был start:350 в оригинальной фикстуре — after T2 клиппинг добора
// (диапазон [10,300], допуск → [8,302]) отбросил бы 350 целиком, и cascade (insertAt<0) больше
// НЕ воспроизводился бы этой фикстурой — клиппинг убирает переезд У ИСТОЧНИКА, до того как он
// успевает испортить merge. Значение заменено на 301 — внутри clip-допуска добора ([8,302]), но
// всё ещё > 300 (граница b/gap2), поэтому cascade (insertAt<0 guard) по-прежнему воспроизводится
// и проверяется этим тестом; клиппинг и insertAt<0-guard — независимые, дополняющие друг друга
// защиты на разных стадиях (проверено отдельно тестом "клиппинг добора…" ниже).
test("I1: overshoot добора первой дыры стирает границу второй дыры → insertAt<0 не префикс-вставка", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 650, // одно окно [0,650)
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === null) return R({ segments: [seg(10, "a"), seg(300, "b"), seg(600, "c")] }); // дыры 10→300 и 300→600
      if (a === 10 && b === 300) return R({ segments: [seg(50, "h1"), seg(301, "h2")] }); // overshoot: h2.start=301 > gap2.fromSec(300), внутри clip-допуска [8,302]
      if (a === 300 && b === 600) return R({ segments: [seg(400, "h3")] }); // добор дыры 2 — граница (300) уже стёрта
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[null, null], [10, 300], [300, 600]]);
  // (а) порядок НЕ нарушен: первый сегмент результата — исходный первый сегмент "a", а не
  // h3 (добор второй дыры), который до фикса молча вставлялся ПЕРЕД ним.
  assert.equal(res.segments[0].text, "a");
  assert.deepEqual(res.segments.map((s) => s.text), ["a", "h1", "h2", "b", "c"]);
  // (б) вторая дыра НЕ была обработана вслепую: добор гарантированно не вставлен (текста "h3"
  // нет в результате), она честно осталась непокрытой и всплывает через coverageGaps/warning —
  // никакого молчаливого маскирования.
  assert.ok(!res.segments.some((s) => s.text === "h3"));
  assert.deepEqual(res.healedGaps, [{ fromSec: 10, toSec: 300 }]); // только первая дыра реально добрана
  assert.ok(res.coverageGaps.length > 0);
  assert.ok(res.warnings.includes("ASR_COVERAGE_GAP"));
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// S12.3 (владелец 2026-07-29, живая 117-мин/8-окон приёмка): транскрипт содержал КРУПНЫЕ
// ДУБЛИ-БЛОКИ — модель «заезжает» за запрошенный range-диапазон окна/половины/добора; следующий
// вызов честно транскрибирует тот же звук заново, а немонотонные метки заехавших сегментов
// каскадом порождают ложную «дыру» → ещё один добор того же участка → ещё одна копия. Фикс:
// clipSegmentsToRange() — клиппинг результата КАЖДОГО ranged-вызова к его СОБСТВЕННОМУ диапазону
// сразу после parse, до merge/findCoverageGaps. Тесты ниже: (a) юнит самого хелпера в изоляции,
// (b)/(c) перехлёст окна «в бою» через полный runWindowedAsr (функциональный + control-регресс),
// (d) клиппинг добора.
// ══════════════════════════════════════════════════════════════════════════════════════════

// (a) юнит clipSegmentsToRange — без runWindowedAsr, напрямую.
test("(S12.3-a) clipSegmentsToRange: in-range сегменты остаются как есть", () => {
  const input = [seg(10, "a"), seg(50, "b"), seg(90, "c")];
  assert.deepEqual(SI.clipSegmentsToRange(input, 0, 100), input);
});

test("(S12.3-a) clipSegmentsToRange: числовой start за пределами допуска — отброшен", () => {
  // допуск ASR_CLIP_TOLERANCE_SEC=2 → диапазон [0,100] допускает [-2,102]; 103 уже снаружи.
  assert.equal(SI.ASR_CLIP_TOLERANCE_SEC, 2);
  const out = SI.clipSegmentsToRange([seg(10, "a"), seg(103, "tooFar")], 0, 100);
  assert.deepEqual(out.map((s) => s.text), ["a"]);
});

test("(S12.3-a) clipSegmentsToRange: в допуске ±2с (граница включительно) остаётся", () => {
  const out = SI.clipSegmentsToRange(
    [seg(-2, "loEdge"), seg(102, "hiEdge"), seg(-3, "belowLo"), seg(103, "aboveHi")], 0, 100);
  assert.deepEqual(out.map((s) => s.text), ["loEdge", "hiEdge"]); // ровно на границе — сохранены
});

test("(S12.3-a) clipSegmentsToRange: null-start МЕЖДУ двумя in-range — сохранён", () => {
  const out = SI.clipSegmentsToRange([seg(10, "a"), seg(null, "mid"), seg(50, "b")], 0, 100);
  assert.deepEqual(out.map((s) => s.text), ["a", "mid", "b"]);
});

test("(S12.3-a) clipSegmentsToRange: голова/хвост из null при отброшенных соседях — отброшены", () => {
  // голова: оба null упираются только в "faraway" (500, вне допуска) — отбрасываются вместе с ним.
  const head = SI.clipSegmentsToRange([seg(null, "h1"), seg(null, "h2"), seg(500, "faraway")], 0, 100);
  assert.deepEqual(head, []);
  // хвост: симметрично, faraway первым, null-хвост после него.
  const tail = SI.clipSegmentsToRange([seg(500, "faraway"), seg(null, "t1"), seg(null, "t2")], 0, 100);
  assert.deepEqual(tail, []);
  // смешанный случай в одном массиве: голова из null у отброшенного края ушла, null между
  // in-range остался, in-range остался, хвост из null у отброшенного края ушёл.
  const mixed = SI.clipSegmentsToRange(
    [seg(null, "head1"), seg(500, "outHead"), seg(10, "a"), seg(null, "mid"), seg(50, "b"),
     seg(-500, "outTail"), seg(null, "tail1")], 0, 100);
  assert.deepEqual(mixed.map((s) => s.text), ["a", "mid", "b"]);
});

test("(S12.3-a) clipSegmentsToRange: пустой вход → пустой выход", () => {
  assert.deepEqual(SI.clipSegmentsToRange([], 0, 100), []);
});

// (b)+(c) окно1 [0,900] «заезжает» вглубь окна2 (до 1400), окно2 [900,1800] честно покрывает
// свою территорию 900..~1795 целиком — включая ТУ ЖЕ самую реплику ("OVERLAP_CONTENT"), которую
// окно1 уже успело (неправомерно) продублировать за своей границей. Оба окна плотно покрыты
// (шаг ≤80с — все зазоры <ASR_GAP_MAX_SEC=90с), чтобы единственная причина возможной "дыры" в
// этом тесте — сам перехлёст/клиппинг, а не спарситость фикстуры.
function denseSegs(fromSec, toSec, stepSec, prefix) {
  const out = [];
  let i = 0;
  for (let t = fromSec; t <= toSec; t += stepSec, i++) out.push(seg(t, prefix + i));
  return out;
}
function overlapFixture(calls) {
  // окно1 [0,900): честная плотная часть 10..850 (шаг 70с, все <900+2 допуска) + "заезд" глубоко
  // за границу (950,1150,1400) — включая OVERLAP_CONTENT на 950, дублирующий то, что окно2
  // легитимно транскрибирует на 905 (та же реальная реплика, две попытки её транскрибировать).
  const win1 = denseSegs(10, 850, 70, "w1-").concat(
    [seg(950, "OVERLAP_CONTENT"), seg(1150, "w1-over-b"), seg(1400, "w1-over-c")]);
  // окно2 [900,1800): честная плотная часть, начинающаяся с ЕГО СОБСТВЕННОЙ (легитимной) версии
  // той же реплики на 905, затем покрытие до 1793 (≈1795, допуск задачи).
  const win2 = [seg(905, "OVERLAP_CONTENT")].concat(denseSegs(975, 1745, 70, "w2-"))
    .concat([seg(1793, "w2-last")]);
  return async (a, b) => {
    calls.push([a, b]);
    if (a === 0) return R({ segments: win1 });
    if (a === 900) return R({ segments: win2 });
    throw new Error("unexpected transcribe(" + a + "," + b + ")");
  };
}

test("(S12.3-b) перехлёст окна: заехавшие тексты окна1 отброшены, окно2 цел, дыр нет, доборов нет", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1800, // windows [0,900) [900,1800)
    transcribe: overlapFixture(calls),
    parse: fakeParse, onProgress: () => {},
  });
  // в merged нет НИ ОДНОГО текста окна1 с start>902 (допуск окна1: [-2,902]) — заезд вырезан.
  assert.ok(!res.segments.some((s) => typeof s.start === "number" && s.start > 902 &&
                                       String(s.text).indexOf("w1-over") === 0));
  assert.ok(!res.segments.some((s) => s.text === "w1-over-b" || s.text === "w1-over-c"));
  // тексты окна2 присутствуют — и ровно один раз каждый (проверяем несколько характерных).
  ["w2-0", "w2-last"].forEach((txt) => {
    assert.equal(res.segments.filter((s) => s.text === txt).length, 1);
  });
  // ложной дыры нет — плотное честное покрытие обоих окон достаточно.
  assert.deepEqual(res.coverageGaps, []);
  // доборов не было: ровно 2 вызова transcribe (по одному на окно), ложная дыра не появилась.
  assert.deepEqual(calls, [[0, 900], [900, 1800]]);
});

// (c) КОНТРОЛЬ КАСКАДА (регресс-тест бага владельца, R11): БЕЗ клиппинга "OVERLAP_CONTENT" от
// окна1 (start:950, заезд) выжила бы в merged РЯДОМ с легитимной копией окна2 (start:905) —
// видимый дубль реплики в транскрипте (ровно тот баг, о котором сообщил владелец). С клиппингом
// заехавшая копия отбрасывается У ИСТОЧНИКА, до merge, — характерный текст встречается РОВНО 1 раз,
// а не 2. Проверяем ТАКЖЕ, что каскад (немонотонность → ложная дыра → лишний добор) не наступает.
test("(S12.3-c) контроль каскада: 'OVERLAP_CONTENT' встречается РОВНО 1 раз, добор НЕ вызван", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1800,
    transcribe: overlapFixture(calls),
    parse: fakeParse, onProgress: () => {},
  });
  const occurrences = res.segments.filter((s) => s.text === "OVERLAP_CONTENT").length;
  assert.equal(occurrences, 1); // БЕЗ фикса было бы 2 (окно1 заезд + окно2 легитимная копия)
  // добор не вызывался вообще — только 2 window-вызова, никакого третьего (heal) вызова.
  assert.equal(calls.length, 2);
  assert.deepEqual(calls, [[0, 900], [900, 1800]]);
  assert.deepEqual(res.coverageGaps, []);
  assert.ok(!res.warnings.includes("ASR_COVERAGE_GAP"));
});

// (d) клиппинг добора: heal на [100,200] возвращает сегменты, простирающиеся до 350 (сам добор
// тоже «заезжает» за свой запрошенный диапазон) — в merged из добора должны попасть ТОЛЬКО
// сегменты ≤202 (допуск gap.toSec+2), 350 отброшен клиппингом до вставки в merged.
test("(S12.3-d) клиппинг добора: heal [100,200] заезжает до 350 → в merged из добора только ≤202", async () => {
  const res = await SI.runWindowedAsr({
    durationSec: 380, // одно окно [0,380) — tail-gap 380-200=180 не >180, чисто
    transcribe: async (a, b) => {
      if (a === null) return R({ segments: [seg(100, "a"), seg(200, "b")] }); // дыра ровно 100→200 (>90)
      if (a === 100 && b === 200) return R({ segments: [seg(120, "h1"), seg(180, "h2"), seg(350, "h3-overshoot")] });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(res.segments.map((s) => s.text), ["a", "h1", "h2", "b"]); // h3-overshoot отсутствует
  assert.ok(!res.segments.some((s) => s.text === "h3-overshoot"));
  res.segments.forEach((s) => { if (typeof s.start === "number") assert.ok(s.start <= 202); });
  assert.deepEqual(res.healedGaps, [{ fromSec: 100, toSec: 200 }]);
  assert.deepEqual(res.coverageGaps, []);
});
