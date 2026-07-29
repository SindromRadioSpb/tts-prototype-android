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

// S12.4: окна перекрываются (asrWindows: [0,900], [870,1000]) — второе окно запрашивается с
// НОМИНАЛЬНОЙ границы минус 30с. Замысел теста прежний (последовательность вызовов, merge,
// прогресс, агрегация языка/warnings); изменились ТОЛЬКО запрошенные границы окна 2. Тексты
// фикстуры («א»/«ב»/«ג»/«ד») общего куска не образуют → шов честно уходит в noAnchor-фолбэк, а
// он на этих метках (все ≤902 у окна 1 и ≥898 у окна 2) ничего не срезает — набор сегментов
// байт-в-байт прежний. Числа — прямой прогон asrWindows/runWindowedAsr (см. отчёт S12.4).
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
  assert.deepEqual(calls, [[0, 900], [870, 1000]]);
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
// S12.4-пересчёт: окна [0,900] и [870,1100] (перекрытие 30с); mid окна1 = (870+1100)/2 = 985,
// половины получают собственное перекрытие ±15с вокруг mid → [870,1000] и [970,1100]. Замысел
// теста НЕ изменился: окно, у которого битым оказался и primary, и обе половины, теряется целиком
// и честно (bisected + skippedRanges на обе половины), прогон НЕ падает, дыра уходит в штатный
// heal-каскад. Числа проверены прямым прогоном ДО фиксации фикстуры.
test("BAD_JSON дважды (обе половины бисекции тоже BAD_JSON): окно теряется целиком, НЕ throw, дыра уходит в coverageGaps через штатный heal-каскад", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1100, // windows [0,900] [870,1100]
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: [seg(850, "a0")] });
      if (a === 870 && b === 1100) return "мусор"; // окно1 primary ×2
      if (a === 870 && b === 1000) return "мусор"; // половина A (870,mid+15) ×2
      if (a === 970 && b === 1100) return "мусор"; // половина B (mid-15,1100) ×2
      if (a === 850 && b === 1100) return R({ segments: [], warnings: ["NO_SPEECH"] }); // heal-добор дыры — неудачен
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(calls, [
    [0, 900], [870, 1100], [870, 1100], [870, 1000], [870, 1000], [970, 1100], [970, 1100], [850, 1100],
  ]);
  assert.deepEqual(res.segments.map((s) => s.text), ["a0"]); // окно0 цело, окно1 честно потеряно целиком
  assert.equal(res.windows[1].bisected, true);
  assert.deepEqual(res.windows[1].skippedRanges, [{ startSec: 870, endSec: 1000 }, { startSec: 970, endSec: 1100 }]);
  assert.deepEqual(res.coverageGaps, [{ fromSec: 850, toSec: 1100 }]);
  assert.ok(res.warnings.includes("ASR_COVERAGE_GAP"));
});

// (a) Обе половины бисекции УСПЕШНЫ (на первой же попытке — retry внутри половины не нужен).
// Проверяет: порядок вызовов ([a,b]×2 для BAD_JSON-провала окна, затем [a,mid], затем [mid,b]),
// сегменты обеих половин на месте и упорядочены по времени, windows[k].bisected===true,
// skippedRanges отсутствует (успех — поле отсутствует). Фикстура подобрана БЕЗ дыр (все хопы
// <90с, хвост <180с) — проверено прямым прогоном, чтобы heal-каскад не добавлял посторонних
// вызовов в calls и не размывал фокус теста на самой бисекции.
// S12.4-пересчёт: окна [0,900] и [870,950]; mid окна1 = 910, перекрытие половин ограничено
// четвертью окна ((950-870)/4 = 20 > 15 → ±15) → половины [870,925] и [895,950]. Замысел прежний.
test("бисекция: обе половины успешны → сегменты на месте, bisected:true, порядок вызовов [a,b]×2→[a,mid+15]→[mid-15,b]", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 950, // windows [0,900] [870,950], mid окна1 = 910
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: [seg(880, "a0")] });
      if (a === 870 && b === 950) return "мусор"; // окно1 primary ×2 → бисекция
      if (a === 870 && b === 925) return R({ segments: [seg(910, "h1")] }); // половина A — успех с 1-й попытки
      if (a === 895 && b === 950) return R({ segments: [seg(935, "h2")] }); // половина B — успех с 1-й попытки
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 950], [870, 950], [870, 925], [895, 950]]);
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
// S12.4-пересчёт: окна [0,900] и [870,1000]; mid окна1 = 935 → половины [870,950] и [920,1000].
test("(b-i) половина A пропущена (BAD_JSON×2), половина B успешна → дыра добрана heal-каскадом полностью", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, // windows [0,900] [870,1000], mid окна1 = 935
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: [seg(850, "a0")] });
      if (a === 870 && b === 1000) return "мусор"; // окно1 primary ×2 → бисекция
      if (a === 870 && b === 950) return "мусор"; // половина A ×2 → skip
      if (a === 920 && b === 1000) return R({ segments: [seg(980, "h1")] }); // половина B — успех
      if (a === 850 && b === 980) return R({ segments: [seg(910, "heal1")] }); // heal-добор дыры — успешен, закрывает целиком
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 1000], [870, 1000], [870, 950], [870, 950], [920, 1000], [850, 980]]);
  assert.deepEqual(res.windows[1].skippedRanges, [{ startSec: 870, endSec: 950 }]);
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
      if (a === 870 && b === 1000) return "мусор";
      if (a === 870 && b === 950) return "мусор"; // skip половины A
      if (a === 920 && b === 1000) return R({ segments: [seg(980, "h1")] });
      if (a === 850 && b === 980) return R({ segments: [], warnings: ["NO_SPEECH"] }); // heal-добор неудачен
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(res.windows[1].skippedRanges, [{ startSec: 870, endSec: 950 }]);
  assert.deepEqual(res.segments.map((s) => s.text), ["a0", "h1"]); // сегменты половины A честно отсутствуют
  assert.deepEqual(res.healedGaps, []);
  assert.deepEqual(res.coverageGaps, [{ fromSec: 850, toSec: 980 }]);
  assert.ok(res.warnings.includes("ASR_COVERAGE_GAP"));
});

// (c) Единственное окно (короткий файл): обычный путь передаёт transcribe(null,null) — без
// range-промта. При BAD_JSON×2 бисекция ОБЯЗАНА построить ЯВНЫЕ числовые границы 0/dur/2/dur —
// это первый случай range-промта для короткого файла (честно, задокументировано в комментарии
// исходника), а не молчаливая деградация обратно на null.
// S12.4-пересчёт: половины по-прежнему строятся вокруг mid=75, но с перекрытием ±15с
// (min(15, (150-0)/4)=15) → [0,90] и [60,150]. Замысел прежний: явные ЧИСЛОВЫЕ границы, не null.
test("(c) single-файл: BAD_JSON×2 → бисекция явными диапазонами вокруг dur/2 (не null)", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 150,
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === null) return "мусор"; // primary ×2 (single всегда шлёт null,null)
      if (a === 0 && b === 90) return R({ segments: [seg(10, "s1")] });
      if (a === 60 && b === 150) return R({ segments: [seg(100, "s2")] });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(calls, [[null, null], [null, null], [0, 90], [60, 150]]);
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
  assert.deepEqual(calls, [[0, 900], [870, 1400]]); // S12.4: окно1 стартует на 30с раньше границы
});

test("резюм: startWindow/priorWindows продолжают без повторного вызова готовых окон", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, startWindow: 1,
    priorWindows: [[seg(850, "א"), seg(870, "б")]],
    transcribe: async (a, b) => { calls.push([a, b]); return R({ segments: [seg(905, "ג")] }); },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[870, 1000]]); // S12.4: перекрытие 30с; готовое окно0 не перевызывается
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
// немонотонность у merge; после клиппинга (T2) числовой start вне допуска окна1 отбрасывался
// БЫ клиппингом ещё ДО merge, и "d" исчезал бы целиком (не оставался null-start), ломая фокус
// этого теста (позиционная вставка ПРИ heal, а не клиппинг).
// S12.4-пересчёт: окно1 теперь [870,1000] (перекрытие 30с), и к клиппингу добавился ещё один
// механизм — noAnchor-фолбэк шва, который срезает у окна1 всё с меткой < seam-2 = 898. Значение
// "d" поднято 900 → 905: оно заведомо переживает И ослабленный клип окна1 ([810,1060]), И рез шва
// (905 ≥ 898), но всё ещё < 950 ("c"), поэтому merge по-прежнему честно нулит его start из-за
// немонотонности СВОЕГО ЖЕ окна. Клиппинг, рез шва и merge-null — ТРИ разных механизма на разных
// стадиях; фокус теста остаётся на позиционной вставке добора.
test("null-start сегмент ПОСЛЕ дыры не переезжает при доборе (позиционная вставка, не по start)", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, // 2 окна: [0,900] и [870,1000]
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: [seg(10, "a"), seg(890, "b")] }); // окно0: дыра 10→890
      if (a === 870) return R({ segments: [seg(950, "c"), seg(905, "d")] }); // окно1: 905<950(lastT) → "d" немонотонен → start:null после merge (905 переживает и клип окна1, и рез шва)
      return R({ segments: [seg(100, "h1"), seg(400, "h2")] }); // добор дыры (10,890)
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 1000], [10, 890]]);
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
// S12.4-пересчёт: окно2 запрашивается как [870,1800] (перекрытие 30с), клип окна ослаблен до
// ±60с. Замысел фикстуры прежний и теперь проверяет ОБА рубежа сразу: далёкий заезд (1150/1400)
// режет КЛИП у источника (допуск окна1 → [-60,960]), а ближний (950, внутри ослабленного клипа —
// ровно тот случай, ради которого клип ослаблен) режет ШОВ: тексты фикстуры латинские, общей
// последовательности ивритских слов нет → якорь не строится → честный noAnchor-фолбэк по
// номинальной границе 900±2 отбрасывает копию окна1 на 950. Числа — прямой прогон.
function overlapFixture(calls) {
  // окно1 [0,900]: честная плотная часть 10..850 (шаг 70с) + "заезд" за границу (950,1150,1400) —
  // включая OVERLAP_CONTENT на 950, дублирующий то, что окно2 легитимно транскрибирует на 905
  // (та же реальная реплика, две попытки её транскрибировать).
  const win1 = denseSegs(10, 850, 70, "w1-").concat(
    [seg(950, "OVERLAP_CONTENT"), seg(1150, "w1-over-b"), seg(1400, "w1-over-c")]);
  // окно2 [870,1800]: честная плотная часть, начинающаяся с ЕГО СОБСТВЕННОЙ (легитимной) версии
  // той же реплики на 905, затем покрытие до 1793 (≈1795, допуск задачи).
  const win2 = [seg(905, "OVERLAP_CONTENT")].concat(denseSegs(975, 1745, 70, "w2-"))
    .concat([seg(1793, "w2-last")]);
  return async (a, b) => {
    calls.push([a, b]);
    if (a === 0) return R({ segments: win1 });
    if (a === 870) return R({ segments: win2 });
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
  assert.deepEqual(calls, [[0, 900], [870, 1800]]);
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
  assert.deepEqual(calls, [[0, 900], [870, 1800]]);
  assert.deepEqual(res.coverageGaps, []);
  assert.ok(!res.warnings.includes("ASR_COVERAGE_GAP"));
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// S12.4 (владелец 2026-07-29, второй прогон живой 117-мин приёмки): дубли-блоки на швах ПЕРЕЖИЛИ
// клиппинг S12.3, потому что range-промт ТРЕБОВАЛ метки «within a-b» — модель, захватив реплику
// целиком (она начинает с начала ФРАЗЫ, а не с секунды a), честно ставила ей метку ВНУТРИ своего
// диапазона. Обе копии «легальны» по меткам → клип по меткам бессилен. Фикс: соседние окна
// перекрываются на 30с, а шов режется по ТЕКСТУ (stitchWindowSegments). Тесты ниже — тот же
// сценарий «в бою», через полный runWindowedAsr.
// ══════════════════════════════════════════════════════════════════════════════════════════

// Ивритские фикстуры из реальных фраз репо (tests/segTable.test.js); нумерация сегментов —
// ивритскими буквами, чтобы плотное покрытие не порождало ЛОЖНЫХ якорей из повторов filler-текста.
const HE_AN1 = "הילד אכל תפוח";
const HE_AN2 = "הילד רץ אל הבית";
const HE_LETTERS = "אבגדהוזחטיכלמנסעפצקרשת".split("");
function heFill(fromSec, toSec, stepSec, letterFrom) {
  const out = [];
  let i = 0;
  for (let t = fromSec; t <= toSec; t += stepSec, i++) out.push(seg(t, "משפט " + HE_LETTERS[letterFrom + i]));
  return out;
}

test("(S12.4) шов окон: обе копии реплики ЛЕГАЛЬНЫ по меткам — клип их не трогает, дубль снимает якорь", async () => {
  const calls = [];
  // окно0 [0,900] отдаёт шовную реплику с метками 875/890 (легальны для [0,900]);
  // окно1 [870,1800] — ТУ ЖЕ реплику с метками 876/891 (легальны для [870,1800]).
  const win0 = heFill(20, 820, 80, 0).concat([seg(875, HE_AN1), seg(890, HE_AN2)]);
  const win1 = [seg(876, HE_AN1), seg(891, HE_AN2)].concat(heFill(960, 1760, 80, 11));
  const res = await SI.runWindowedAsr({
    durationSec: 1800,
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: win0 });
      if (a === 870) return R({ segments: win1 });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 1800]]); // ни доборов, ни бисекций — чистый двухоконный путь
  // (1) КЛИППИНГ НЕ СРАБОТАЛ ВООБЩЕ: обе копии внутри своих диапазонов (поле clippedCount
  // появляется только при >0). Именно поэтому S12.3 дубль не ловил.
  assert.equal(res.windows[0].clippedCount, undefined);
  assert.equal(res.windows[1].clippedCount, undefined);
  // (2) дубль снят швом по тексту: якорь = 7 слов (HE_AN1+HE_AN2), срезаны 2 сегмента окна0.
  assert.deepEqual(res.seams, [{ seam: 900, anchored: true, anchorWords: 7,
                                 cutSegDroppedK: 2, cutSegDroppedK1: 0 }]);
  assert.equal(res.segments.filter((s) => s.text === HE_AN1).length, 1);
  assert.equal(res.segments.filter((s) => s.text === HE_AN2).length, 1);
  // (3) уцелела копия ОКНА1 (её метки честнее для своего диапазона), метки окна0 ушли с дублем
  assert.ok(res.segments.some((s) => s.start === 876 && s.text === HE_AN1));
  assert.ok(!res.segments.some((s) => s.start === 875 || s.start === 890));
  // (4) R11: ничего вне зоны перекрытия не потеряно — весь filler обоих окон на месте, по разу
  assert.equal(res.segments.length, win0.length - 2 + win1.length);
  assert.deepEqual(res.coverageGaps, []);
  assert.deepEqual(res.warnings, []);
});

// fix1 I2(б): новый промт РАЗРЕШАЕТ честную метку ВНЕ запрошенного диапазона (реплика началась
// чуть раньше `a`). Окно [870,1800] отдаёт шовную копию с меткой 862 — вне своего диапазона, но
// честной. Ослабленный клип (±60) её сохраняет, якорь срабатывает, копия одна. Мутация «вернуть
// клип ±2» отбросила бы 862 у источника: clippedCount стал бы 1, anchored — false, а уцелела бы
// копия окна0 (875) — все три ассерта ниже упали бы.
test("(S12.4-I2б) честная метка соседа ВНЕ его диапазона доживает до шва и выигрывает якорь", async () => {
  const calls = [];
  const win0 = [seg(700, "מאמר על חינוך"), seg(780, "אבא אמא"), seg(860, "ילד ילדה"), seg(875, HE_AN1 + " " + HE_AN2)];
  const win1 = [seg(862, HE_AN1 + " " + HE_AN2)].concat(heFill(940, 1740, 80, 0));
  const res = await SI.runWindowedAsr({
    durationSec: 1800,
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: win0 });
      if (a === 870) return R({ segments: win1 });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 1800]]);            // ни клип, ни дыры не добавили вызовов
  assert.equal(res.windows[1].clippedCount, undefined);        // 862 НЕ отброшена клипом окна1
  assert.equal(res.seams[0].anchored, true);
  assert.ok(res.segments.some((s) => s.start === 862));        // уцелела честная метка соседа
  assert.ok(!res.segments.some((s) => s.start === 875));       // копия окна0 срезана швом
  assert.equal(res.segments.filter((s) => s.text === HE_AN1 + " " + HE_AN2).length, 1);
  assert.deepEqual(res.coverageGaps, []);
});

// fix1 C1(б): пропущенная (BAD_JSON×2) половина A бисекции — у половины B зона mid-15..mid-2
// НЕ имеет соседа-покрытия, и старый безусловный рез уничтожал её в чистую потерю (дыра 55с < 90с
// не всплывала нигде). Теперь рез шва бисекции требует доказательства покрытия.
test("(S12.4-C1б) бисекция с пропущенной половиной A: зона mid-15..mid-2 у половины B цела", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, // окна [0,900] [870,1000]; mid окна1 = 935, половины [870,950] и [920,1000]
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: [seg(850, "a0")] });
      if (a === 870 && b === 1000) return "мусор";
      if (a === 870 && b === 950) return "мусор";              // половина A пропущена целиком
      if (a === 920 && b === 1000) return R({ segments: [seg(925, "zone-mid"), seg(980, "h1")] });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 1000], [870, 1000], [870, 950], [870, 950], [920, 1000]]);
  // 925 лежит в mid-15..mid-2 (920..933) — ровно та зона, которую резал старый безусловный рез
  assert.deepEqual(res.segments.map((s) => s.text), ["a0", "zone-mid", "h1"]);
  assert.equal(res.windows[1].bisectSeams[0].k1CutSkipped, true); // R9: покрытия не было — не резали
  assert.deepEqual(res.windows[1].skippedRanges, [{ startSec: 870, endSec: 950 }]);
  assert.deepEqual(res.coverageGaps, []);
});

// fix2 D3 — пин параметра overlapSec (M4). Шов бисекции узкий (±15с вокруг mid), поэтому его
// zone-предохранитель обязан считать зону по mid±15, а не по 30с окон. Половина A даёт метку 895
// = mid-40: при ov=15 (правильно) якорь ОТКЛОНЯЕТСЯ (895 < mid-30 = 905) и уникальный для A
// сегмент 895 остаётся жив; при мутации «убрать {overlapSec: ov}» зона считалась бы по 30с
// (lo = mid-45 = 890 ≤ 895) — якорь приняли бы, и сегмент 895 исчез бы, хотя половина B его
// никогда не транскрибировала (она начинается с 920).
test("(S12.4-D3) шов бисекции считает зону по СВОЕЙ ширине перекрытия (±15с), а не по 30с окон", async () => {
  const AN = HE_AN1 + " " + HE_AN2;
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, // окно1 [870,1000]; mid = 935; половины [870,950] и [920,1000]
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: [seg(860, "a0")] });
      if (a === 870 && b === 1000) return "мусор";
      if (a === 870 && b === 950) return R({ segments: [seg(895, AN), seg(940, "אחת שתיים")] });
      if (a === 920 && b === 1000) return R({ segments: [seg(925, AN), seg(980, "h1")] });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 1000], [870, 1000], [870, 950], [920, 1000]]);
  const bs = res.windows[1].bisectSeams[0];
  assert.equal(bs.seam, 935);
  assert.equal(bs.anchored, false);         // при мутации стало бы true
  assert.equal(bs.anchorOutOfZone, true);   // R9: якорь отклонён именно зоной
  assert.ok(res.segments.some((s) => s.start === 895)); // уникальный для половины A сегмент ЖИВ
});

test("(S12.4) clipSegmentsToRange: tolSec — ближняя зона остаётся шву, дальний заезд отброшен", () => {
  const input = [seg(880, "near-lo"), seg(910, "in"), seg(1855, "near-hi"), seg(2000, "far")];
  // допуск окна (ASR_STITCH_CLIP_TOL_SEC=60) сохраняет ближнюю зону по обе стороны [870,1800]
  assert.equal(A.ASR_STITCH_CLIP_TOL_SEC, 60);
  assert.deepEqual(SI.clipSegmentsToRange(input, 870, 1800, A.ASR_STITCH_CLIP_TOL_SEC).map((s) => s.text),
                   ["near-lo", "in", "near-hi"]);
  // строгий допуск добора (по умолчанию, 2с) — как было: ближнюю зону тоже режет
  assert.deepEqual(SI.clipSegmentsToRange(input, 870, 1800).map((s) => s.text), ["near-lo", "in"]);
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

// ══════════════════════════════════════════════════════════════════════════════════════════
// S12.5 (диагноз DIAGNOSIS_S12_LIVE_DEFECT_2026_07_29): range-промт по одному длинному fileUri
// на глубоких офсетах возвращает ЧУЖОЙ контент с подделанными in-range метками — все
// метко-ключёванные гейты (клип/швы/дыры/добор) слепы. Транспорт sliced-mp3: КАЖДЫЙ вызов
// транскрипции получает ОТДЕЛЬНО вырезанный кусок звука + plain ASR_PROMPT; метки
// чанк-относительные, абсолютное время = метка + наш детерминированный offsetSec (из
// фрейм-карты Mp3Slice). Контракт deps.transcribe расширен: строка (legacy) ЛИБО
// {raw, offsetSec}; сдвиг — в ОДНОЙ точке (oneCall), поэтому окна, обе половины бисекции
// (у каждой СВОЙ offsetSec) и heal-добор наследуют его автоматически. Тесты ниже — фейки
// slice-транспорта; все числа проверены прямым прогоном runWindowedAsr ДО фиксации фикстур
// (методика файла).
// ══════════════════════════════════════════════════════════════════════════════════════════

// Объектная форма ответа slice-транспорта: chunk-relative сегменты + офсет чанка.
const RS = (segments, offsetSec, extra) => ({ raw: R(Object.assign({ segments }, extra)), offsetSec });
// Относительный плотный филлер: те же значения, что denseSegs, но семантика — метки ВНУТРИ чанка.
const denseRel = denseSegs;

// (S12.5-a) oneCall-сдвиг: transcribe возвращает {raw, offsetSec} с чанк-относительными метками
// → в merged метки АБСОЛЮТНЫЕ (rel + offsetSec); null-метка (модель не проставила) НЕ сдвигается
// и остаётся честным null на своей структурной позиции.
test("(S12.5-a) offsetSec сдвигает числовые метки в абсолютные; null-метки не сдвинуты", async () => {
  const calls = [];
  // окно1 rel 5..905 шаг 75 (abs 875..1775) + null-сегмент между rel 80 и rel 155
  const win1rel = denseRel(5, 905, 75, "w2-");
  win1rel.splice(2, 0, seg(null, "w2-null"));
  const res = await SI.runWindowedAsr({
    durationSec: 1800, // окна [0,900] [870,1800]
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return RS(denseSegs(10, 810, 80, "w1-"), 0);
      if (a === 870) return RS(win1rel, 870);
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 1800]]); // дыр нет — доборов нет
  // числовые метки окна1 абсолютны: rel 5 + 870 = 875, rel 905 + 870 = 1775
  assert.ok(res.segments.some((s) => s.text === "w2-0" && s.start === 875));
  assert.ok(res.segments.some((s) => s.text === "w2-12" && s.start === 1775));
  // окно0 (offsetSec 0) не искажено
  assert.ok(res.segments.some((s) => s.text === "w1-0" && s.start === 10));
  // null-метка не сдвинута и стоит на своей структурной позиции (между w2-1 и w2-2)
  const nulIdx = res.segments.findIndex((s) => s.text === "w2-null");
  assert.equal(res.segments[nulIdx].start, null);
  assert.equal(res.segments[nulIdx - 1].text, "w2-1");
  assert.equal(res.segments[nulIdx + 1].text, "w2-2");
  assert.deepEqual(res.coverageGaps, []);
});

// (S12.5-b) Полный slice-сценарий: 3 чанка, offsetSec = фактический старт окна, шовные зоны
// транскрибированы дважды (перекрытие) → stitch срезает дубль по ТЕКСТУ, покрытие сплошное.
// Ключевое отличие от range-мира: модель физически не может дать «чужой» материал — каждая
// метка лежит внутри своего чанка by construction, findCoverageGaps снова доказателен.
const HE_ANC2 = "הכלב שתה מים קרים מן הכד"; // 6 слов — якорь второго шва, не пересекается с HE_AN*
test("(S12.5-b) 3 чанка: у каждого свой offsetSec, дубли шовных зон срезаны швом, coverageGaps пуст", async () => {
  const calls = [];
  // чанк0 (offset 0): филлер 20..820 + шовная реплика (875/890) — rel == abs
  const win0rel = heFill(20, 820, 80, 0).concat([seg(875, HE_AN1), seg(890, HE_AN2)]);
  // чанк1 (offset 870): ТА ЖЕ реплика в своей голове (rel 6/21 → abs 876/891), филлер
  // rel 90..810 (abs 960..1680), хвост rel 880 (abs 1750) + реплика второго шва rel 905 (abs 1775)
  const win1rel = [seg(6, HE_AN1), seg(21, HE_AN2)]
    .concat(heFill(90, 810, 80, 11))
    .concat([seg(880, "עוד משפט כאן"), seg(905, HE_ANC2)]);
  // чанк2 (offset 1770): та же реплика второго шва (rel 5 → abs 1775) + хвост до конца
  const win2rel = [seg(5, HE_ANC2), seg(60, "משפט סיום ראשון"), seg(140, "משפט סיום שני"), seg(220, "משפט סיום שלישי")];
  const res = await SI.runWindowedAsr({
    durationSec: 2000, // окна [0,900] [870,1800] [1770,2000]; швы 900, 1800
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return RS(win0rel, 0);
      if (a === 870) return RS(win1rel, 870);
      if (a === 1770) return RS(win2rel, 1770);
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 1800], [1770, 2000]]); // ни доборов, ни бисекций
  // оба шва срезаны ЯКОРЕМ (по тексту), дубль каждой шовной реплики — ровно одна копия
  assert.deepEqual(res.seams, [
    { seam: 900, anchored: true, anchorWords: 7, cutSegDroppedK: 2, cutSegDroppedK1: 0 },
    { seam: 1800, anchored: true, anchorWords: 6, cutSegDroppedK: 1, cutSegDroppedK1: 0 },
  ]);
  assert.equal(res.segments.filter((s) => s.text === HE_AN1).length, 1);
  assert.equal(res.segments.filter((s) => s.text === HE_ANC2).length, 1);
  // уцелели копии СОСЕДА (окно k+1 — его метки честнее в начале своего чанка)
  assert.ok(res.segments.some((s) => s.text === HE_AN1 && s.start === 876));
  assert.ok(res.segments.some((s) => s.text === HE_ANC2 && s.start === 1775));
  assert.ok(!res.segments.some((s) => s.start === 875 || s.start === 890));
  assert.deepEqual(res.coverageGaps, []);
  assert.deepEqual(res.warnings, []);
});

// (S12.5-c) Бисекция в slice-мире: окно падает ASR_BAD_JSON ×2 → бисекция вызывает transcribe с
// (a, mid+ov) и (mid-ov, b); КАЖДАЯ половина — свой чанк со СВОИМ offsetSec. Склейка половин
// (stitch по mid) работает в абсолютном времени: сдвиг обеих половин уже сделан в oneCall.
test("(S12.5-c) бисекция: у половин РАЗНЫЕ offsetSec, склейка в абсолютном времени корректна", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, // окна [0,900] [870,1000]; mid окна1 = 935, половины [870,950] и [920,1000]
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return RS([seg(850, "a0")], 0);
      if (a === 870 && b === 1000) return { raw: "мусор", offsetSec: 870 }; // primary ×2 → бисекция
      if (a === 870 && b === 950) return RS([seg(10, "h1")], 870);  // rel 10 → abs 880
      if (a === 920 && b === 1000) return RS([seg(15, "h2")], 920); // rel 15 → abs 935 (СВОЙ офсет)
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 1000], [870, 1000], [870, 950], [920, 1000]]);
  // абсолютные метки обеих половин: 870+10=880 < 920+15=935 — порядок правильный, без null-ений
  assert.deepEqual(res.segments.map((s) => [s.start, s.text]), [[850, "a0"], [880, "h1"], [935, "h2"]]);
  assert.equal(res.windows[1].bisected, true);
  assert.deepEqual(res.coverageGaps, []);
});

// (S12.5-d) Heal в slice-мире: дыра → transcribe(gap.from, gap.to), чанк дыры со своим
// offsetSec = gap.from; строгий клип добора ±2с работает по АБСОЛЮТНЫМ меткам (после сдвига):
// заезд rel 885 → abs 895 > gap.to+2 = 892 → отброшен клипом.
test("(S12.5-d) heal-чанк дыры: offsetSec=gap.from, строгий клип ±2с по абсолютным меткам", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, // окна [0,900] [870,1000]
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return RS([seg(10, "a"), seg(890, "b")], 0); // дыра 10→890
      if (a === 870) return RS([seg(35, "c")], 870);            // abs 905
      if (a === 10 && b === 890) // heal-чанк дыры: rel 30..830 (abs 40..840) + заезд rel 885 (abs 895)
        return RS(denseRel(30, 830, 80, "h").concat([seg(885, "h-over")]), 10);
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 1000], [10, 890]]); // добор вызван АБСОЛЮТНЫМИ границами дыры
  // сдвиг добора — его СВОИМ офсетом (10): rel 110 → abs 120
  assert.ok(res.segments.some((s) => s.text === "h1" && s.start === 120));
  // строгий клип добора по абсолютным меткам: abs 895 > 892 → отброшен
  assert.ok(!res.segments.some((s) => s.text === "h-over"));
  assert.deepEqual(res.healedGaps, [{ fromSec: 10, toSec: 890 }]);
  assert.deepEqual(res.coverageGaps, []);
});

// (S12.5-e) Пин обратной совместимости. ВСЕ существующие тесты этого файла возвращают из
// transcribe СТРОКУ — они и есть whole-suite пин legacy-транспорта (ranged-file). Здесь сверх
// того пинится ПО-ВЫЗОВНАЯ независимость форм: строка и {raw, offsetSec} сосуществуют в одном
// прогоне — legacy-окно не сдвигается, объектное сдвигается своим офсетом.
test("(S12.5-e) legacy-строка и {raw,offsetSec} в одном прогоне: строка не сдвигается", async () => {
  const res = await SI.runWindowedAsr({
    durationSec: 1800,
    transcribe: async (a, b) => {
      if (a === 0) return R({ segments: denseSegs(10, 810, 80, "L") });    // строка, метки абсолютные
      if (a === 870) return RS(denseRel(5, 905, 75, "S"), 870);            // объект, метки rel
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.ok(res.segments.some((s) => s.text === "L0" && s.start === 10));  // не сдвинуто
  assert.ok(res.segments.some((s) => s.text === "S0" && s.start === 875)); // сдвинуто (5+870)
  assert.deepEqual(res.coverageGaps, []);
});

// (S12.5-f) Обрыв вывода чанка — живой класс из пробы R10 (чанк 3 вернул rel 0..727с из 930):
// в slice-мире метки неподделываемы, поэтому дыра от обрыва ЧЕСТНО видна в coverageGaps
// (findCoverageGaps снова доказателен), а не маскируется чужим материалом, как в range-мире.
test("(S12.5-f) чанк оборвал вывод (rel 725 из 930) → дыра ЧЕСТНО в coverageGaps + warning", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1800, // окна [0,900] [870,1800]; чанк1 длиной 930с
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return RS(denseSegs(10, 810, 80, "w0-"), 0);
      if (a === 870) return RS(denseRel(5, 725, 80, "w1-"), 870); // обрыв: rel 725 < 930, abs до 1595
      if (a === 1595 && b === 1800) return RS([], 1595, { warnings: ["NO_SPEECH"] }); // heal неудачен
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 1800], [1595, 1800]]); // heal попытался — честно, best-effort
  assert.deepEqual(res.healedGaps, []);
  assert.deepEqual(res.coverageGaps, [{ fromSec: 1595, toSec: 1800 }]); // потеря ВИДИМА, не «успех»
  assert.ok(res.warnings.includes("ASR_COVERAGE_GAP"));
});

// (S12.5-g) Дыра мутационного ревью T2 (мутант «сдвигать и null-метки»: null+off → off). Тест
// S12.5-a её НЕ ловит: null В СЕРЕДИНЕ чанка после подделки (start=870) немонотонен относительно
// соседей → mergeWindowSegments сам re-null-ит его, мутация маскируется нижним honesty-слоем.
// null в ГОЛОВЕ чанка — единственная позиция, где подделка (start = offsetSec) оказывается
// МОНОТОННОЙ (все свои метки чанка ≥ offsetSec, метки предыдущего окна < offsetSec) и пережила бы
// merge как ложно-«честная» метка. Пин: null головы чанка остаётся null (R11).
test("(S12.5-g) null-метка в ГОЛОВЕ чанка не превращается в offsetSec (мутант null+offset)", async () => {
  const res = await SI.runWindowedAsr({
    durationSec: 1800, // окна [0,900] [870,1800]
    transcribe: async (a, b) => {
      if (a === 0) return RS(denseSegs(10, 890, 80, "g0-"), 0);
      if (a === 870) return RS([seg(null, "g-head-null")].concat(denseRel(35, 905, 75, "g1-")), 870);
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  const head = res.segments.find((s) => s.text === "g-head-null");
  assert.ok(head, "null-головной сегмент должен пережить клип (числовой сосед справа in-range)");
  assert.equal(head.start, null); // НЕ offsetSec=870 — честный null
  assert.ok(res.segments.some((s) => s.text === "g1-0" && s.start === 905)); // числовые соседи сдвинуты честно
  assert.deepEqual(res.coverageGaps, []);
});

// (S12.5-h) Дыра мутационного ревью T2 (мутант «ретрай использует offsetSec ПЕРВОГО ответа»).
// Контракт: КАЖДЫЙ ответ transcribe несёт СВОЙ offsetSec, сдвиг делается офсетом того ответа,
// который парсится (oneCall: «ретрай — свой ответ, свой offsetSec»). В нынешнем транспорте офсет
// детерминирован диапазоном (a,b) и между попытками не меняется — существующие тесты мутацию не
// видят; но контракт обязан пережить транспорт, где границы ретрая пересчитываются (напр.,
// пере-слайс со сдвинутыми frame-границами). Пин: offsetSec бракованного ответа не протекает.
test("(S12.5-h) ретрай BAD_JSON: сдвиг офсетом ОТВЕТА ретрая, offsetSec первого ответа не протекает", async () => {
  let attempt = 0;
  const res = await SI.runWindowedAsr({
    durationSec: 1800, // окна [0,900] [870,1800]
    transcribe: async (a, b) => {
      if (a === 0) return RS(denseSegs(10, 890, 80, "h0-"), 0);
      if (a === 870) return (++attempt === 1)
        ? { raw: "мусор", offsetSec: 111 }             // бракованный ответ с ЧУЖИМ offsetSec
        : RS(denseRel(35, 905, 75, "h1-"), 870);       // ретрай — свой offsetSec
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.equal(res.windows[1].retries, 1);
  assert.ok(res.segments.some((s) => s.text === "h1-0" && s.start === 905)); // 35+870, НЕ 35+111
  assert.deepEqual(res.coverageGaps, []);
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// S12.5 T3 — АНТИ-РЕПЛЕЙ ГЕЙТ В ОРКЕСТРАТОРЕ (последняя линия обороны для транспорта
// ranged-file, где подделка меток по-прежнему возможна; страховка для slice-пути). Живой брак
// владельца (DIAGNOSIS §1, §6): окна 6–8 не дали своего контента НИ РАЗУ — только реплеи ранних
// минут с in-range штампами, а heal-добор дыры 55:53–59:30 вернул речь 35:39–39:37 с такими же
// «легальными» штампами. Клип/шов/findCoverageGaps ключуются на этих метках и пропускают всё
// разом → потеря 47% таймлайна отчиталась coverageGaps:[]. Гейт судит по ТЕКСТУ (6-словные
// шинглы против накопителя принятого материала). R11: брак окна = ЧЕСТНАЯ ДЫРА.
// Все числа фикстур проверены прямым прогоном runWindowedAsr ДО их фиксации (методика файла).
// ══════════════════════════════════════════════════════════════════════════════════════════

// Плотный «речевой» филлер: count сегментов по 6 УНИКАЛЬНЫХ слов (6*count слов → 6*count-5
// шинглов). Разные префиксы не пересекаются НИ ОДНИМ шинглом, поэтому совпадение в тесте всегда
// означает намеренное копирование фикстурой, а не частотность речи.
function talk(prefix, count, fromSec, stepSec) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const w = [];
    for (let j = 0; j < 6; j++) w.push("מילה" + prefix + (i * 6 + j));
    out.push(seg(fromSec + i * stepSec, w.join(" ")));
  }
  return out;
}
// Те же ТЕКСТЫ с другими (подделанными «внутрь своего диапазона») метками — ровно то, что делала
// модель в живом прогоне: чужой контент, чьи штампы проходят любой метковый гейт.
function retime(segments, fromSec, stepSec) {
  return segments.map((s, i) => seg(fromSec + i * stepSec, s.text));
}

// (a) Окно-реплей: окно1 = дословная копия окна0 с in-range метками. Метковые гейты (клип, шов)
// её пропускают — она «легальна». Гейт по тексту бракует окно: в результат уходит ПУСТОЙ массив,
// диапазон окна становится честной дырой (coverageGaps + ASR_COVERAGE_GAP), провенанс объясняет
// почему (rejectedReplay / rejectedRanges / ASR_WINDOW_REPLAY).
test("(S12.5-T3-a) окно-реплей бракуется: пусто в результате, ЧЕСТНАЯ дыра, провенанс полон", async () => {
  const calls = [];
  const w0 = talk("א", 21, 10, 40);          // 10..810, 126 слов → 121 шингл
  const w1 = retime(w0, 880, 40);            // 880..1680 — метки внутри [870,1800], клип слеп
  const res = await SI.runWindowedAsr({
    durationSec: 1800, // окна [0,900] [870,1800]
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: w0, language: null });
      // забракованное окно несёт СВОИ язык и warnings — но они описывают ЧУЖОЙ звук, который
      // модель подставила вместо запрошенного, и в сводку прогона попадать не имеют права.
      if (a === 870) return R({ segments: w1, language: "other", warnings: ["PARTIALLY_UNCLEAR"] });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  // (1) окно забраковано целиком: ни одной метки окна1, каждый текст ровно один раз (из окна0)
  assert.equal(res.segments.length, w0.length);
  assert.ok(!res.segments.some((s) => s.start >= 870));
  w0.forEach((s) => assert.equal(res.segments.filter((x) => x.text === s.text).length, 1));
  // (2) R9-провенанс: доля реплея у окна, диапазон в rejectedRanges
  assert.equal(res.windows[1].rejectedReplay, 1);
  assert.deepEqual(res.rejectedRanges, [{ startSec: 870, endSec: 1800, rejectedReplay: 1 }]);
  // (3) R11: потеря ВИДИМА — честная дыра + оба кода предупреждений; добор в брак не идёт (R16)
  assert.deepEqual(res.coverageGaps, [{ fromSec: 810, toSec: 1800 }]);
  assert.deepEqual(res.warnings, ["ASR_WINDOW_REPLAY", "ASR_COVERAGE_GAP"]); // без PARTIALLY_UNCLEAR
  assert.equal(res.language, null);                 // язык чужого звука не попадает в паспорт
  assert.deepEqual(res.healedGaps, []);
  assert.deepEqual(calls, [[0, 900], [870, 1800]]); // ровно 2 вызова — heal пропущен
});

// (b) АНТИ-ЛОЖНОПОЛОЖИТЕЛЬНЫЙ ПИН. Легитимное шовное перекрытие (S12.4: соседи НАМЕРЕННО
// транскрибируют шовную зону дважды) НЕ должно выглядеть реплеем. Здесь повторены 2 шовных
// сегмента (12 слов) — доля 7/133 ≈ 5.3%; на живом 15-мин окне зона 30с даёт ~3%, то есть в
// тесте доля ЗАВЫШЕНА, и пин строже реальности. Дубль снимает шов (якорь), а не гейт.
const SEAM_A = "מילהש0 מילהש1 מילהש2 מילהש3 מילהש4 מילהש5";
const SEAM_B = "מילהש6 מילהש7 מילהש8 מילהש9 מילהש10 מילהש11";
test("(S12.5-T3-b) честное шовное перекрытие 30с НЕ бракуется (доля ~5%, порог 40%)", async () => {
  const calls = [];
  const w0 = talk("א", 21, 20, 40).concat([seg(860, SEAM_A), seg(880, SEAM_B)]);
  const w1 = [seg(872, SEAM_A), seg(890, SEAM_B)].concat(talk("ב", 21, 960, 40));
  // независимый замер доли ДО прогона (тот же публичный API, что использует оркестратор)
  const ratio = A.replayRatio(w1, A.collectShingles(w0, new Set()));
  assert.equal(ratio, 7 / 133);
  assert.ok(ratio > 0 && ratio < A.REPLAY_REJECT_RATIO, "ratio=" + ratio);
  const res = await SI.runWindowedAsr({
    durationSec: 1800,
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: w0 });
      if (a === 870) return R({ segments: w1 });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [870, 1800]]);
  assert.deepEqual(res.rejectedRanges, []);              // окно принято
  assert.equal(res.windows[1].rejectedReplay, undefined);
  assert.deepEqual(res.warnings, []);                    // ни ASR_WINDOW_REPLAY, ни дыр
  assert.equal(res.seams[0].anchored, true);             // дубль снял ШОВ по тексту (S12.4)
  assert.equal(res.segments.filter((s) => s.text === SEAM_A).length, 1);
  assert.equal(res.segments.filter((s) => s.text === SEAM_B).length, 1);
  assert.ok(res.segments.some((s) => s.text === w1[w1.length - 1].text)); // материал окна1 на месте
  assert.deepEqual(res.coverageGaps, []);
});

// (c) Дыра, ПЕРЕСЕКАЮЩАЯСЯ с забракованным диапазоном, не хилится вовсе (тот же промт вернёт тот
// же реплей — доказано диагнозом), а дыра ВНЕ забракованного диапазона добирается как обычно:
// гейт не отключает добор целиком, а бьёт точечно. Пин — по СЧЁТЧИКУ вызовов transcribe.
// Фикстуры окон здесь ПЛОТНЫЕ (180 слов на окно) намеренно. Whole-branch ревью S12.5 ввело
// шовное исключение (replaySeamSkipWords): голова окна, ДОКАЗАННО совпадающая с хвостом
// предыдущего, уликой не считается — иначе честное короткое/оборвавшееся окно объявлялось
// реплеем (тесты S12.5-T3-h/i). Исключение ограничено STITCH_TAIL_WORDS=80 словами, поэтому у
// окна короче ~85 слов после него не остаётся материала на суждение и гейт честно молчит (null).
// Прежняя фикстура этого теста (72 слова на 930-секундное окно — в 18 раз реже живого замера
// §6: 822–1331 слово на чанк) попадала ровно в эту зону «нет доказательств»; предел пинится
// отдельным юнитом (S12.5-T3-k), а здесь окно приведено к живой плотности.
test("(S12.5-T3-c) дыра внутри забракованного диапазона не хилится; посторонняя дыра — хилится", async () => {
  const calls = [];
  const w0 = talk("א", 20, 10, 14).concat(talk("ג", 10, 700, 12)); // 10..276, дыра, 700..808
  const w1 = retime(w0, 880, 30);                                  // реплей окна0 → брак
  const w2 = talk("ד", 22, 1780, 40);                              // 1780..2620, честный хвост
  const res = await SI.runWindowedAsr({
    durationSec: 2700, // окна [0,900] [870,1800] [1770,2700]
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: w0 });
      if (a === 870) return R({ segments: w1 });
      if (a === 1770) return R({ segments: w2 });
      if (a === 276 && b === 700) return R({ segments: talk("ה", 12, 300, 32) }); // добор дыры вне брака
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  // добор вызван РОВНО для дыры [276,700]; вызова для дыры [808,1780] нет ВООБЩЕ
  assert.deepEqual(calls, [[0, 900], [870, 1800], [1770, 2700], [276, 700]]);
  assert.ok(!calls.some((c) => c[0] === 808));
  assert.deepEqual(res.healedGaps, [{ fromSec: 276, toSec: 700 }]);
  assert.deepEqual(res.coverageGaps, [{ fromSec: 808, toSec: 1780 }]); // остаётся ЧЕСТНОЙ
  assert.deepEqual(res.rejectedRanges, [{ startSec: 870, endSec: 1800, rejectedReplay: 1 }]);
  assert.ok(res.segments.some((s) => s.text === w2[0].text));  // окно2 не пострадало
  assert.ok(res.warnings.includes("ASR_WINDOW_REPLAY") && res.warnings.includes("ASR_COVERAGE_GAP"));
});

// (d) Добор-реплей (ТОТ САМЫЙ живой дефект: heal дыры 55:53–59:30 вернул речь 35:39–39:37 со
// штампами внутри дыры — строгий клип ±2с бессилен, штампы «легальны»). Добор отбрасывается
// целиком, дыра остаётся честной, провенанс объясняет почему.
test("(S12.5-T3-d) добор-реплей отбрасывается: дыра остаётся в coverageGaps, healRejectedReplay в провенансе", async () => {
  const calls = [];
  const head = talk("א", 8, 10, 40);                             // 10..290
  const w0 = head.concat(talk("ג", 3, 700, 40));                 // дыра 290→700, хвост 700..780
  const res = await SI.runWindowedAsr({
    durationSec: 800, // одно окно (single-путь, transcribe(null,null))
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === null) return R({ segments: w0 });
      // добор возвращает УЖЕ ТРАНСКРИБИРОВАННУЮ речь начала записи с метками внутри дыры
      if (a === 290 && b === 700) return R({ segments: retime(head, 330, 40) });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[null, null], [290, 700]]);
  assert.deepEqual(res.healedGaps, []);                          // добор НЕ засчитан
  assert.deepEqual(res.coverageGaps, [{ fromSec: 290, toSec: 700 }]);
  assert.deepEqual(res.rejectedRanges, [{ startSec: 290, endSec: 700, healRejectedReplay: 1 }]);
  assert.ok(res.warnings.includes("ASR_WINDOW_REPLAY") && res.warnings.includes("ASR_COVERAGE_GAP"));
  // ни один текст не удвоился — вставки не было
  assert.equal(res.segments.length, w0.length);
  head.forEach((s) => assert.equal(res.segments.filter((x) => x.text === s.text).length, 1));
});

// (e) Мало текста — суждения нет (R11). Окно из коротких сегментов даёт 17 шинглов (<20), и даже
// ДОСЛОВНЫЙ повтор не бракуется: обвинять окно, по которому нет доказательств, значит выбрасывать,
// возможно, единственную честную транскрипцию тихого куска. Дубль в этой зоне — забота шва/клипа,
// не анти-реплей гейта.
test("(S12.5-T3-e) короткое окно (<20 шинглов) НЕ бракуется даже при дословном повторе", async () => {
  const short0 = [];
  for (let i = 0; i < 11; i++) short0.push(seg(10 + i * 80, "מילהא" + (i * 2) + " מילהא" + (i * 2 + 1)));
  const short1 = retime(short0, 890, 80); // 890..1690, те же тексты
  assert.equal(A.replayRatio(short1, A.collectShingles(short0, new Set())), null); // 17 шинглов
  const res = await SI.runWindowedAsr({
    durationSec: 1800,
    transcribe: async (a, b) => {
      if (a === 0) return R({ segments: short0 });
      if (a === 870) return R({ segments: short1 });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(res.rejectedRanges, []);
  assert.equal(res.windows[1].rejectedReplay, undefined);
  assert.ok(!res.warnings.includes("ASR_WINDOW_REPLAY"));
  assert.equal(res.segments.length, short0.length + short1.length); // окно принято целиком
  assert.deepEqual(res.coverageGaps, []);
});

// (f) РЕЗЮМ. После сбоя прогон продолжается с priorWindows, и накопитель шинглов ОБЯЗАН быть
// заряжен уже принятыми окнами: иначе гейт «забывает» весь транскрипт, и реплей ранних минут
// проходит как новый материал — ровно тот сценарий живого брака, только после возобновления
// (длинный файл почти всегда доходит до конца с одним-двумя резюмами).
test("(S12.5-T3-f) резюм: накопитель заряжен priorWindows — реплей готового окна бракуется", async () => {
  const calls = [];
  const w0 = talk("א", 21, 10, 40);
  const res = await SI.runWindowedAsr({
    durationSec: 1800, startWindow: 1, priorWindows: [w0],
    transcribe: async (a, b) => { calls.push([a, b]); return R({ segments: retime(w0, 880, 40) }); },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[870, 1800]]);               // готовое окно0 не перевызывается
  assert.equal(res.windows[1].rejectedReplay, 1);       // реплей узнан по МАТЕРИАЛУ РЕЗЮМА
  assert.deepEqual(res.rejectedRanges, [{ startSec: 870, endSec: 1800, rejectedReplay: 1 }]);
  assert.equal(res.segments.length, w0.length);         // в транскрипте только честное окно0
  assert.deepEqual(res.coverageGaps, [{ fromSec: 810, toSec: 1800 }]);
  assert.ok(res.warnings.includes("ASR_WINDOW_REPLAY"));
});

// (g) ГРАНИЦА ПРАВИЛА ПРОПУСКА: пересечение дыры с забракованным диапазоном считается по
// ОТКРЫТЫМ интервалам. Дыра, которая лишь КАСАЕТСЯ брака (начинается ровно там, где забракованное
// окно кончилось), лежит в ДРУГОМ звуке — про него ничего не доказано, и отказывать ему в доборе
// значило бы наказывать честный участок за соседа (R11 в обратную сторону: не только «не
// маскируй потерю», но и «не выдумывай потерю»). Мутация «считать касание пересечением» съела бы
// добор этой дыры молча.
test("(S12.5-T3-g) дыра ВСТЫК к забракованному диапазону добирается (пересечение строгое)", async () => {
  const calls = [];
  const w0 = talk("א", 21, 10, 40);                                  // 10..810
  const w1 = retime(w0, 880, 40);                                    // реплей → брак [870,1800]
  const w2 = talk("ג", 1, 1800, 40).concat(talk("ד", 18, 2000, 40)); // 1800, затем 2000..2680
  const res = await SI.runWindowedAsr({
    durationSec: 2700, // окна [0,900] [870,1800] [1770,2700]
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: w0 });
      if (a === 870) return R({ segments: w1 });
      if (a === 1770) return R({ segments: w2 });
      if (a === 1800 && b === 2000) return R({ segments: talk("ה", 10, 1840, 15) });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  // дыра [810,1800] пересекает брак → пропущена; дыра [1800,2000] лишь касается → добрана
  assert.deepEqual(calls, [[0, 900], [870, 1800], [1770, 2700], [1800, 2000]]);
  assert.deepEqual(res.healedGaps, [{ fromSec: 1800, toSec: 2000 }]);
  assert.deepEqual(res.coverageGaps, [{ fromSec: 810, toSec: 1800 }]);
  assert.ok(res.segments.some((s) => s.start === 1840));
});

// ── S12.5 T4: STALE-TAB GUARD (чистое сравнение версий) ───────────────────────────────────────
// Сравниваются ЛИТЕРАЛ страницы (window.APP_VERSION из index.html) и версия сервера
// (/api/client-config → CACHE_VERSION из sw.js). Инвариант R11: устаревание — ФАКТ, который надо
// доказать; отсутствие любой из версий или сетевая ошибка = fail-open (прогон идёт), потому что
// заблокировать владельцу единственную рабочую кнопку по подозрению дороже, чем прогнать
// транскрипцию кодом, который, возможно, чуть отстал.
test("(S12.5-T4) isStaleTab: расхождение версий = стейл, совпадение = нет", () => {
  assert.equal(SI.isStaleTab("3.11.264", "3.11.265"), true);
  assert.equal(SI.isStaleTab("3.11.265", "3.11.265"), false);
  // «v» игнорируется: sw.js хранит "v3.11.265", server.js отдаёт "3.11.265" — расхождение
  // ФОРМАТА не является расхождением ВЕРСИИ, и путать их значит блокировать свежие вкладки.
  assert.equal(SI.isStaleTab("v3.11.265", "3.11.265"), false);
  assert.equal(SI.isStaleTab("3.11.265", "v3.11.265"), false);
  assert.equal(SI.isStaleTab(" 3.11.265 ", "3.11.265"), false);
});

test("(S12.5-T4) isStaleTab: нет доказательства → fail-open (R11: не выдумывать устаревание)", () => {
  for (const [p, s] of [[undefined, "3.11.265"], ["3.11.265", undefined], [null, null],
                        ["", "3.11.265"], ["3.11.265", ""], ["3.11.265", 3], [{}, "3.11.265"]]) {
    assert.equal(SI.isStaleTab(p, s), false, `pageVersion=${JSON.stringify(p)} serverVersion=${JSON.stringify(s)}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// WHOLE-BRANCH REVIEW S12.5 (2026-07-29) — СТЫК T3 × asrWindows: ЛОЖНЫЙ БРАК ПО ШВУ.
// Анти-реплей гейт (T3) судит окно по доле уже-виденного текста, а asrWindows (S12.4) даёт
// соседям ПЕРЕКРЫТИЕ 30с НАМЕРЕННО — шовная зона транскрибируется дважды по замыслу. У
// НОРМАЛЬНОГО окна (930с) этот легитимный дубль ≈3% и порога 40% не достигает; но есть два
// живых класса, где он ДОМИНИРУЕТ над содержимым окна:
//   (1) ХВОСТОВОЕ окно короче ~65с (длительность файла на 0–60с больше кратного 15 мин —
//       примерно каждый 15-й файл): 30с шва против 10–30с своей речи;
//   (2) окно, ОБОРВАВШЕЕ вывод сразу после шовной зоны (живой класс пробы R10 §6: чанк 3
//       оборвался на rel 727/930) — своей речи почти нет, шовная есть.
// В обоих случаях честное окно объявлялось реплеем: его речь УНИЧТОЖАЛАСЬ, прогон получал
// ASR_WINDOW_REPLAY и level=bad (владельцу предлагалось подтвердить несуществующую потерю), а в
// случае (2) правило «не хилить забракованный диапазон» ЕЩЁ И запрещало добор — и настоящая
// дыра в 14 минут оставалась незакрытой. Это тот же R11-дефект, против которого сделан слайс,
// только с обратным знаком: не «замаскировать потерю», а «выдумать её».
// Лечение: из суждения исключается материал, объяснённый ШВОМ — якорь S12.4 (общая
// последовательность слов между хвостом предыдущего окна и головой текущего) измеряет его без
// единой метки; см. replaySeamSkipWords в asr-transcript.js.
// Числа фикстур ниже проверены прямым прогоном (темп речи 2 слова/с — замер §6 дизайна).
// ══════════════════════════════════════════════════════════════════════════════════════════

// Шовный блок: 10 сегментов × 6 слов на 871..898 = 60 слов за 30с (2 сл/с — живой темп).
const SEAM_BLOCK = talk("ש", 10, 871, 3);
// Тело окна 0: 30 сегментов × 6 слов на 10..822 (шаг 28с < ASR_GAP_MAX_SEC — дыр нет).
const W0_BODY = talk("א", 30, 10, 28);

test("(S12.5-T3-h) короткое ХВОСТОВОЕ окно не бракуется по шву: его речь остаётся, брака нет", async () => {
  const w0 = W0_BODY.concat(SEAM_BLOCK);            // окно [0,900]
  const tailSpeech = talk("ח", 7, 901, 3);          // 42 слова СВОЕЙ речи окна [870,920]
  const w1 = retime(SEAM_BLOCK, 874, 3).concat(tailSpeech);
  // Без учёта шва доля «уже виденного» = 55/97 — гейт объявил бы честное окно реплеем.
  const naive = A.replayRatio(w1, A.collectShingles(w0, new Set()));
  assert.ok(naive >= A.REPLAY_REJECT_RATIO, "фикстура обязана быть ложноположительной без фикса: " + naive);
  const res = await SI.runWindowedAsr({
    durationSec: 920, // окна [0,900] и [870,920] — хвостовое окно 50с при шве 30с
    transcribe: async (a, b) => {
      if (a === 0) return R({ segments: w0 });
      if (a === 870) return R({ segments: w1 });
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(res.rejectedRanges, []);                 // брака нет
  assert.equal(res.windows[1].rejectedReplay, undefined);
  assert.ok(!res.warnings.includes("ASR_WINDOW_REPLAY"));
  // ГЛАВНОЕ: честная речь хвоста дожила до транскрипта (до фикса она исчезала целиком)
  tailSpeech.forEach((s) => assert.ok(res.segments.some((x) => x.text === s.text), "потеряна: " + s.text));
  // и сводка не пугает владельца несуществующей потерей
  const sum = A.summarizeAsrRun({ durationSec: 920, windows: res.windows, coverageGaps: res.coverageGaps,
    healedGaps: res.healedGaps, rejectedRanges: res.rejectedRanges, warnings: res.warnings });
  assert.equal(sum.level, "ok");
  assert.equal(sum.windowsOk, 2);
});

test("(S12.5-T3-i) окно, оборвавшее вывод после шовной зоны, не бракуется — и его дыра ДОБИРАЕТСЯ", async () => {
  const w0 = W0_BODY.concat(SEAM_BLOCK);
  // окно [870,1800] отдало шовную зону + 15с своей речи и оборвалось (живой класс пробы R10)
  const w1 = retime(SEAM_BLOCK, 874, 3).concat(talk("ח", 5, 905, 3));
  const w2 = talk("ד", 30, 1775, 28);
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 2700, // окна [0,900] [870,1800] [1770,2700]
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: w0 });
      if (a === 870) return R({ segments: w1 });
      if (a === 1770) return R({ segments: w2 });
      if (a === 917 && b === 1775) return R({ segments: talk("ה", 25, 950, 32) }); // добор дыры
      throw new Error("unexpected transcribe(" + a + "," + b + ")");
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(res.rejectedRanges, []);                 // обрыв вывода ≠ реплей
  assert.ok(!res.warnings.includes("ASR_WINDOW_REPLAY"));
  // добор ЧЕСТНОЙ дыры не подавлен правилом overlapsRejected — 14 минут записи спасены
  assert.ok(calls.some((c) => c[0] === 917 && c[1] === 1775), "добор дыры не вызван: " + JSON.stringify(calls));
  assert.deepEqual(res.healedGaps, [{ fromSec: 917, toSec: 1775 }]);
  assert.deepEqual(res.coverageGaps, []);
});

// ── СТЫК T3/T4 × РЕЗЮМ: провенанс брака обязан пережить возобновление ────────────────────────
// windowsMeta готовых окон пересобиралась «с нуля» ({startSec,endSec,retries:0}), поэтому после
// резюма исчезали ВСЕ структурные записи прошлого захода: rejectedReplay/skippedRanges/bisected/
// clippedCount. Последствия ровно на стыке задач: (T4) сводка считает windowsOk по
// w.rejectedReplay/w.skippedRanges — полей больше нет, и она рапортует «Чанков 8/8» о прогоне,
// где окно было подделкой; rejectedRanges пуст → «окон забраковано: 0»; (T3) забытый диапазон
// снова считается годным для добора — платим за заведомо тот же реплей (R16). Длинный файл почти
// всегда доходит до конца с одним-двумя резюмами, так что это не экзотика.
test("(S12.5-T3-j) резюм: брак окна и его провенанс переживают возобновление прогона", async () => {
  const w0 = talk("א", 40, 10, 22);          // 240 слов, 10..868
  const w1 = retime(w0, 880, 22);            // дословный реплей окна 0 с in-range метками
  let thrown = null;
  try {
    await SI.runWindowedAsr({
      durationSec: 2700, // окна [0,900] [870,1800] [1770,2700]
      transcribe: async (a, b) => {
        if (a === 0) return R({ segments: w0 });
        if (a === 870) return R({ segments: w1 });
        const e = new Error("net"); e.code = "NETWORK"; throw e; // падение на окне 2
      },
      parse: fakeParse, onProgress: () => {},
    });
  } catch (e) { thrown = e; }
  assert.ok(thrown && thrown.windowSegments, "прогон обязан отдать состояние для резюма");
  assert.ok(Array.isArray(thrown.windowsMeta) && thrown.windowsMeta.length === 2,
            "провенанс окон обязан уезжать в резюм вместе с сегментами");
  assert.equal(thrown.windowsMeta[1].rejectedReplay, 1);

  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 2700,
    startWindow: thrown.windowSegments.length,
    priorWindows: thrown.windowSegments,
    priorWindowsMeta: thrown.windowsMeta,
    transcribe: async (a, b) => { calls.push([a, b]); return R({ segments: talk("ד", 30, 1775, 28) }); },
    parse: fakeParse, onProgress: () => {},
  });
  assert.equal(res.windows[1].rejectedReplay, 1);                       // R9: почему окно пусто
  assert.deepEqual(res.rejectedRanges, [{ startSec: 870, endSec: 1800, rejectedReplay: 1 }]);
  assert.ok(res.warnings.includes("ASR_WINDOW_REPLAY"));
  assert.deepEqual(calls, [[1770, 2700]]);                              // добор брака не оплачиваем (R16)
  const sum = A.summarizeAsrRun({ durationSec: 2700, windows: res.windows, coverageGaps: res.coverageGaps,
    healedGaps: res.healedGaps, rejectedRanges: res.rejectedRanges, warnings: res.warnings });
  assert.equal(sum.windowsOk, 2);        // 2 из 3 — забракованное окно не «ok» и после резюма
  assert.equal(sum.rejected, 1);
  assert.equal(sum.level, "bad");
});
