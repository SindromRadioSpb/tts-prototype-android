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
