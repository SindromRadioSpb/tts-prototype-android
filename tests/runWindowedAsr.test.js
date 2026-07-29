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
test("null-start сегмент ПОСЛЕ дыры не переезжает при доборе (позиционная вставка, не по start)", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, // 2 окна: [0,900) и [900,1000)
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: [seg(10, "a"), seg(890, "b")] }); // окно0: дыра 10→890
      if (a === 900) return R({ segments: [seg(950, "c"), seg(5, "d")] }); // окно1: 5<950 → "d" немонотонен → start:null после merge
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
// перелетает (overshoot) через границу ВТОРОЙ дыры (300) — возвращает сегмент start:350 > 300.
// Ре-merge внутри цикла честно обнуляет start пограничного сегмента b (300 < 350 →
// немонотонность), поэтому на втором проходе поиск insertAt (start === gap.fromSec === 300)
// НИЧЕГО не находит: insertAt=-1. Без guard'а `merged.slice(0, insertAt+1)` = `merged.slice(0, 0)`
// вставляет добор второй дыры ПРЕФИКСОМ перед "a" — молчаливая перестановка всего транскрипта.
// Числа проверены прямыми вызовами mergeWindowSegments/findCoverageGaps И полным прогоном
// runWindowedAsr (методика T3, см. журнал сессии) ДО фиксации фикстуры — включая сам баг
// (воспроизведён до фикса insertAt<0 continue).
test("I1: overshoot добора первой дыры стирает границу второй дыры → insertAt<0 не префикс-вставка", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 650, // одно окно [0,650)
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === null) return R({ segments: [seg(10, "a"), seg(300, "b"), seg(600, "c")] }); // дыры 10→300 и 300→600
      if (a === 10 && b === 300) return R({ segments: [seg(50, "h1"), seg(350, "h2")] }); // overshoot: h2.start=350 > gap2.fromSec(300)
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
