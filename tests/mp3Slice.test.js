"use strict";
// S12.5 T1 · Юниты mp3-slice: синтетические MPEG-фреймы, без сети и без реальных файлов.
// Генератор ниже — НЕЗАВИСИМЫЙ ОРАКУЛ: строит фреймы по спецификации MPEG (свои таблицы),
// а не по таблицам модуля. Тело фрейма — нули: 0x00 не содержит 0xFF, значит ложных sync
// внутри тела не бывает by construction.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../public/js/mp3-slice.js");

const MPEG1_FRAME_SEC = 1152 / 44100; // ≈0.0261с
const MPEG2_FRAME_SEC = 576 / 22050;
const FR1 = 417; // floor(144 * 128000 / 44100) — MPEG1 Layer III 128kbps@44100 без padding

// Валидный фрейм Layer III: MPEG1 128kbps@44100 (по умолчанию) или MPEG2 80kbps@22050.
function makeFrame(opts) {
  const o = opts || {};
  const mpeg2 = !!o.mpeg2;
  const brIdx = o.bitrateIdx != null ? o.bitrateIdx : 9; // MPEG1→128kbps, MPEG2→80kbps
  const srIdx = o.srIdx != null ? o.srIdx : 0;           // 44100 / 22050
  const padding = o.padding ? 1 : 0;
  const kbps = mpeg2
    ? [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0][brIdx]
    : [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0][brIdx];
  const samplerate = (mpeg2 ? [22050, 24000, 16000] : [44100, 48000, 32000])[srIdx];
  const samples = mpeg2 ? 576 : 1152;
  const size = Math.floor((samples / 8) * (kbps * 1000) / samplerate) + padding;
  const f = new Uint8Array(size); // тело — нули
  f[0] = 0xff;
  f[1] = 0xe0 | ((mpeg2 ? 2 : 3) << 3) | (1 << 1) | 1; // sync + version + Layer III + no-CRC
  f[2] = (brIdx << 4) | (srIdx << 2) | (padding << 1);
  f[3] = 0x44; // каналы/emphasis — парсер их не читает
  return f;
}

function frameList(n, opts) {
  const f = makeFrame(opts);
  const out = [];
  for (let k = 0; k < n; k++) out.push(f);
  return out;
}

function concatU8(parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// ID3v2-тег: "ID3" + версия(2)/флаги(1) + synchsafe-размер тела (7 бит на байт), тело — нули.
function id3(bodyLen) {
  const h = new Uint8Array(10 + bodyLen);
  h[0] = 0x49; h[1] = 0x44; h[2] = 0x33; h[3] = 4; h[4] = 0; h[5] = 0;
  h[6] = (bodyLen >>> 21) & 0x7f;
  h[7] = (bodyLen >>> 14) & 0x7f;
  h[8] = (bodyLen >>> 7) & 0x7f;
  h[9] = bodyLen & 0x7f;
  return h;
}

test("buildFrameMap: CBR MPEG1 — все фреймы, точная длительность, offsets на каждую секунду", () => {
  const u8 = concatU8(frameList(200)); // 200 фреймов ≈ 5.22с
  const m = M.buildFrameMap(u8);
  assert.equal(m.frames, 200);
  assert.equal(m.badResync, 0);
  assert.ok(Math.abs(m.totalSec - 200 * MPEG1_FRAME_SEC) < 1e-6);
  // одна запись на каждую НОВУЮ целую секунду: 0..5 без пропусков и дублей
  assert.deepEqual(m.offsets.map((o) => Math.floor(o.t)), [0, 1, 2, 3, 4, 5]);
  assert.equal(m.offsets[0].t, 0);
  assert.equal(m.offsets[0].byte, 0);
  // байтовые позиции лежат на фрейм-сетке
  for (const o of m.offsets) assert.equal(o.byte % FR1, 0);
});

test("buildFrameMap: ID3v2 скипается по synchsafe-размеру (фреймы целы, badResync 0)", () => {
  const u8 = concatU8([id3(1000), ...frameList(50)]);
  const m = M.buildFrameMap(u8);
  assert.equal(m.frames, 50);
  assert.equal(m.badResync, 0);
  assert.equal(m.offsets[0].byte, 10 + 1000);
  // единственное окно на весь файл → чанк стартует с первого ФРЕЙМА, не с байта 0
  const chunks = M.sliceChunks(u8, [{ startSec: 0, endSec: m.totalSec }], m);
  assert.equal(chunks[0].byteFrom, 1010);
  assert.equal(chunks[0].bytes.byteOffset, 1010);
});

test("buildFrameMap: мусор между фреймами → badResync>0, фреймы после мусора находятся", () => {
  const junk = new Uint8Array(100).fill(0x55);
  const u8 = concatU8([...frameList(50), junk, ...frameList(50)]);
  const m = M.buildFrameMap(u8);
  // Фрейм непосредственно ПЕРЕД мусором осознанно приносится в жертву анти-false-sync правилу:
  // его «сосед через size байт» невалиден, от ложного sync его не отличить — его байты честно
  // уходят в badResync вместе с самим мусором.
  assert.equal(m.frames, 99);
  assert.equal(m.badResync, FR1 + 100);
  assert.ok(Math.abs(m.totalSec - 99 * MPEG1_FRAME_SEC) < 1e-6);
});

test("buildFrameMap: false-sync (заголовок без валидного соседа) — не фрейм", () => {
  // валидный заголовок + 500 нулей: через size байт фрейма нет, конец файла не ближе 4 байт
  const buf = new Uint8Array(4 + 500);
  buf.set(makeFrame().subarray(0, 4), 0);
  const m = M.buildFrameMap(buf);
  assert.equal(m.frames, 0);
  assert.equal(m.totalSec, 0);
  assert.ok(m.badResync > 0);
  // 0xFF 0xE0-паттерны с reserved-версией / bad-bitrateIdx — вообще не заголовок
  const junk = new Uint8Array(64);
  junk.set([0xff, 0xeb, 0x90, 0x00], 10); // verBits=1 (reserved)
  junk.set([0xff, 0xfb, 0xf0, 0x00], 30); // bitrateIdx=15 (bad)
  assert.equal(M.buildFrameMap(junk).frames, 0);
});

test("buildFrameMap: MPEG2 (576 сэмплов) — длительность по своей сетке", () => {
  const u8 = concatU8(frameList(200, { mpeg2: true }));
  const m = M.buildFrameMap(u8);
  assert.equal(m.frames, 200);
  assert.equal(m.badResync, 0);
  assert.ok(Math.abs(m.totalSec - 200 * MPEG2_FRAME_SEC) < 1e-6);
});

test("buildFrameMap: VBR — битрейт (и размер) меняется от фрейма к фрейму", () => {
  // Цикл битрейтов 32..320kbps + padding на каждом третьем фрейме: размеры фреймов РАЗНЫЕ,
  // скан обязан шагать по фактическому size каждого фрейма, а не по константе первого (CBR).
  const brCycle = [1, 9, 14, 5, 11, 2, 13, 7];
  const parts = [];
  for (let k = 0; k < 240; k++) {
    parts.push(makeFrame({ bitrateIdx: brCycle[k % brCycle.length], padding: k % 3 === 0 }));
  }
  const sizes = parts.map((p) => p.length);
  assert.ok(new Set(sizes).size > 5); // генератор действительно дал разные размеры
  const u8 = concatU8(parts);
  const m = M.buildFrameMap(u8);
  assert.equal(m.frames, 240);
  assert.equal(m.badResync, 0);
  // Длительность фрейма от битрейта НЕ зависит (та же сэмплрейт-сетка) — сумма точна
  assert.ok(Math.abs(m.totalSec - 240 * MPEG1_FRAME_SEC) < 1e-6);
  // Независимый оракул офсетов: кумулятивные суммы фактических длин фреймов ГЕНЕРАТОРА
  const starts = [];
  let off = 0;
  for (const s of sizes) { starts.push(off); off += s; }
  const expected = [];
  let t = 0, lastMark = -1;
  for (let k = 0; k < 240; k++) {
    if (Math.floor(t) > lastMark) { lastMark = Math.floor(t); expected.push({ t: t, byte: starts[k] }); }
    t += MPEG1_FRAME_SEC;
  }
  assert.deepEqual(m.offsets, expected);
});

test("buildFrameMap: free-format (bitrateIdx 0) — невалиден, фрейм не принимается", () => {
  // Free-format: размер фрейма в заголовке не выражен — парсер обязан отвергнуть у заголовка.
  const buf = new Uint8Array(600);
  buf.set([0xff, 0xfb, 0x02, 0x44], 0); // MPEG1 L3, bitrateIdx=0 (free), srIdx=0, padding=1
  const m = M.buildFrameMap(buf);
  assert.equal(m.frames, 0);
  assert.equal(m.totalSec, 0);
  // и в середине потока между валидными соседями — тоже не фрейм
  const freeHdr = new Uint8Array([0xff, 0xfb, 0x02, 0x44]);
  const m2 = M.buildFrameMap(concatU8([...frameList(50), freeHdr, ...frameList(50)]));
  assert.equal(m2.frames, 99); // сосед-жертва анти-false-sync + free-заголовок в badResync
  assert.equal(m2.badResync, FR1 + 4);
});

test("края: ID3-без-фреймов, windows=[] / не-массив, единственное окно — до конца буфера", () => {
  // Файл из одного ID3-тега без единого фрейма
  const only = concatU8([id3(500)]);
  const m0 = M.buildFrameMap(only);
  assert.equal(m0.frames, 0);
  assert.equal(m0.totalSec, 0);
  assert.deepEqual(m0.offsets, []);
  assert.equal(m0.badResync, 0); // скан стартует ЗА тегом — тело тега не считается мусором
  assert.equal(M.byteForTime(m0, 0), null);
  assert.deepEqual(M.sliceChunks(only, [{ startSec: 0, endSec: 60 }], m0), []);
  assert.equal(M.isSliceable(m0, 60), false);
  // windows=[] и windows=не-массив → пустой список чанков, без исключений
  const u8 = concatU8(frameList(150));
  const m = M.buildFrameMap(u8);
  assert.deepEqual(M.sliceChunks(u8, [], m), []);
  assert.deepEqual(M.sliceChunks(u8, undefined, m), []);
  // Единственное окно = последний чанк: от первого фрейма до КОНЦА буфера, endSec=totalSec
  const one = M.sliceChunks(u8, [{ startSec: 0, endSec: 2 }], m);
  assert.equal(one.length, 1);
  assert.equal(one[0].byteFrom, 0);
  assert.equal(one[0].byteTo, u8.length);
  assert.equal(one[0].endSec, m.totalSec);
  assert.equal(one[0].bytes.length, u8.length);
});

test("buildFrameMap: padding-бит удлиняет фрейм ровно на 1 байт", () => {
  const p = makeFrame({ padding: true });
  assert.equal(p.length, FR1 + 1); // сам генератор следует формуле
  const u8 = concatU8([p, makeFrame(), makeFrame()]);
  const m = M.buildFrameMap(u8);
  // Если бы парсер игнорировал padding, «сосед через size» первого фрейма попал бы в тело
  // второго → первый фрейм отвергся бы как false-sync и badResync стал бы > 0.
  assert.equal(m.frames, 3);
  assert.equal(m.badResync, 0);
});

test("buildFrameMap: обрезанный последний фрейм не ломает парс", () => {
  // Обрыв посреди ТЕЛА: заголовок валиден, «сосед» за концом файла не требуется (грация ближе
  // 4 байт) → хвостовой фрейм принимается; счётчик и длительность его включают, скан не виснет.
  const cut = makeFrame().subarray(0, 200);
  const m = M.buildFrameMap(concatU8([...frameList(100), cut]));
  assert.equal(m.frames, 101);
  assert.equal(m.badResync, 0);
  assert.ok(Math.abs(m.totalSec - 101 * MPEG1_FRAME_SEC) < 1e-6);
  // Обрыв посреди ЗАГОЛОВКА (3 байта) — скан до него не доходит (нужны 4 байта).
  const m2 = M.buildFrameMap(concatU8([...frameList(100), makeFrame().subarray(0, 3)]));
  assert.equal(m2.frames, 100);
  assert.equal(m2.badResync, 0);
});

test("byteForTime: последний offset с t <= sec; раньше первого → первый; пустая карта → null", () => {
  const m = M.buildFrameMap(concatU8(frameList(300))); // ≈7.84с
  assert.equal(M.byteForTime(m, -1), m.offsets[0]);
  assert.equal(M.byteForTime(m, 0), m.offsets[0]);
  const b = M.byteForTime(m, 3.7);
  assert.ok(b.t <= 3.7);
  const i = m.offsets.indexOf(b);
  assert.ok(i === m.offsets.length - 1 || m.offsets[i + 1].t > 3.7); // именно ПОСЛЕДНИЙ подходящий
  assert.equal(M.byteForTime(m, 1e9), m.offsets[m.offsets.length - 1]);
  assert.equal(M.byteForTime({ offsets: [] }, 5), null);
});

test("sliceChunks: границы по byteForTime, subarray без копии, последний чанк до конца буфера", () => {
  const u8 = concatU8(frameList(300)); // ≈7.84с
  const m = M.buildFrameMap(u8);
  const wins = [
    { startSec: 0, endSec: 3.2 },
    { startSec: 2.5, endSec: 5.5 }, // перекрытие с соседом — как у asrWindows
    { startSec: 5, endSec: 7.9 },
  ];
  const chunks = M.sliceChunks(u8, wins, m);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map((c) => c.k), [0, 1, 2]);

  // границы = byteForTime по запрошенным секундам
  assert.equal(chunks[0].byteFrom, M.byteForTime(m, 0).byte);
  assert.equal(chunks[0].byteTo, M.byteForTime(m, 3.2).byte);
  assert.equal(chunks[1].byteFrom, M.byteForTime(m, 2.5).byte);

  // startSec — ФАКТИЧЕСКОЕ время фрейма-начала чанка, а не запрошенные 2.5
  const a1 = M.byteForTime(m, 2.5);
  assert.equal(chunks[1].startSec, a1.t);
  assert.notEqual(chunks[1].startSec, 2.5);
  assert.ok(chunks[1].startSec < 2.5);
  // endSec не-последнего — фактическое время граничного фрейма (≤ запрошенного)
  assert.equal(chunks[0].endSec, M.byteForTime(m, 3.2).t);
  assert.ok(chunks[0].endSec <= 3.2);

  // bytes: subarray над ТЕМ ЖЕ буфером, без копий
  assert.equal(chunks[0].bytes.byteOffset, 0);
  assert.ok(chunks[1].bytes.byteOffset !== 0);
  for (const c of chunks) {
    assert.equal(c.bytes.buffer, u8.buffer);
    assert.equal(c.bytes.length, c.byteTo - c.byteFrom);
  }
  // перекрытие окон = физическое перекрытие байтов (шовную зону транскрибируют ОБА чанка)
  assert.ok(chunks[1].byteFrom < chunks[0].byteTo);
  assert.ok(chunks[2].byteFrom < chunks[1].byteTo);

  // последний чанк — до конца буфера, endSec = totalSec
  assert.equal(chunks[2].byteTo, u8.length);
  assert.equal(chunks[2].endSec, m.totalSec);

  // без третьего аргумента карта строится внутри — результат байт-в-байт тот же
  const rebuilt = M.sliceChunks(u8, wins);
  assert.deepEqual(rebuilt.map((c) => [c.k, c.byteFrom, c.byteTo, c.startSec, c.endSec]),
                   chunks.map((c) => [c.k, c.byteFrom, c.byteTo, c.startSec, c.endSec]));
});

test("isSliceable: согласие с независимо измеренной длительностью, минимум фреймов", () => {
  const m = M.buildFrameMap(concatU8(frameList(200)));
  assert.equal(M.isSliceable(m, m.totalSec), true);
  assert.equal(M.isSliceable(m, m.totalSec * 1.04), true);  // в пределах 5%
  assert.equal(M.isSliceable(m, m.totalSec * 1.06), false); // расхождение > 5% → fallback
  assert.equal(M.isSliceable(m, m.totalSec * 0.94), false);
  assert.equal(M.isSliceable(m, 0), false);  // probe длительность не дал — гейт закрыт
  assert.equal(M.isSliceable(m, -1), false);
  assert.equal(M.isSliceable(m, NaN), false);
  // порог ровно 5% ВКЛЮЧИТЕЛЬНО: |totalSec - probed| <= 0.05 * probed
  assert.equal(M.isSliceable({ frames: 1000, totalSec: 105 }, 100), true);
  assert.equal(M.isSliceable({ frames: 1000, totalSec: 105.01 }, 100), false);
  // мало фреймов — карта недоказательна
  const small = M.buildFrameMap(concatU8(frameList(99)));
  assert.equal(M.isSliceable(small, small.totalSec), false);
  assert.equal(M.MIN_SLICE_FRAMES, 100);
  // пустой буфер не роняет парсер и, разумеется, не sliceable
  const empty = M.buildFrameMap(new Uint8Array(0));
  assert.equal(empty.frames, 0);
  assert.equal(M.isSliceable(empty, 60), false);
});
