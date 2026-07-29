// public/js/mp3-slice.js
// S12.5 · Нарезка mp3 по фрейм-границам: чанк = ФИЗИЧЕСКИЙ диапазон байт, и модель не имеет
// возможности видеть чужой звук. Range-промт по одному fileUri на глубоких офсетах возвращал
// чужой контент с подделанными in-range метками (диагноз DIAGNOSIS_S12_LIVE_DEFECT_2026_07_29);
// здесь абсолютное время сегмента = chunk-relative метка + детерминированный офсет чанка —
// наш, неподделываемый.
// Pure-ядро, dual-export (browser window.Mp3Slice + Node module.exports) по образцу asr-transcript.js.
// Канон: docs/planning/STUDIO_INGEST_S12_5_AUDIO_SLICING_DESIGN_2026_07_29.md §1.
// Эталон (проба R10, файл владельца 160МБ): 268646 фреймов, 116.96 мин, badResync 0, парс <2с.
(function () {
  "use strict";

  // Таблицы MPEG Layer III (единственный поддержанный layer — это .mp3; Layer I/II и reserved
  // отвергаются у заголовка). Индексация: [v1][bitrateIdx], v1 = 1 для MPEG1, 0 для MPEG2/2.5.
  var BITRATE_KBPS = {
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    0: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  };
  // По verBits заголовка: 3=MPEG1, 2=MPEG2, 0=MPEG2.5 (1=reserved — невалиден).
  var SAMPLERATE_BY_VER = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

  // Ниже физически осмысленного минимума (8kbps MPEG2.5 даёт 52 байта) — заведомый мусор.
  var MIN_FRAME_SIZE = 24;

  // Заголовок фрейма по смещению i (4 байта): null — не фрейм. Валидируются ТОЛЬКО поля,
  // влияющие на размер и длительность; CRC/каналы/emphasis для нарезки безразличны.
  function frameAt(u8, i) {
    if (i + 4 > u8.length) return null;
    if (u8[i] !== 0xff || (u8[i + 1] & 0xe0) !== 0xe0) return null;
    var verBits = (u8[i + 1] >> 3) & 3;   // 3=MPEG1, 2=MPEG2, 0=MPEG2.5, 1=reserved
    var layerBits = (u8[i + 1] >> 1) & 3; // 1=Layer III
    if (verBits === 1 || layerBits !== 1) return null;
    var brIdx = (u8[i + 2] >> 4) & 15;
    var srIdx = (u8[i + 2] >> 2) & 3;
    if (brIdx === 0 || brIdx === 15 || srIdx === 3) return null; // free-form / bad / reserved
    var v1 = verBits === 3 ? 1 : 0;
    var bitrate = BITRATE_KBPS[v1][brIdx] * 1000;
    var samplerate = SAMPLERATE_BY_VER[verBits][srIdx];
    var padding = (u8[i + 2] >> 1) & 1;
    var samples = v1 ? 1152 : 576;
    var size = Math.floor((samples / 8) * bitrate / samplerate) + padding;
    if (size < MIN_FRAME_SIZE) return null;
    return { size: size, durSec: samples / samplerate };
  }

  // Карта byte↔time всего файла: {offsets:[{t,byte}], totalSec, frames, badResync}.
  // offsets — ОДНА запись на каждую новую целую секунду (для 3ч это ≈10.8К записей, а не сотни
  // тысяч по-фреймовых); t записи — фактическое время НАЧАЛА фрейма, byte — его первый байт.
  // badResync — число просканированных байт, не вошедших ни в один принятый фрейм (мера
  // здоровья файла: у нормального CBR-mp3 он 0).
  function buildFrameMap(u8) {
    var i = 0;
    // ID3v2: "ID3" + версия(2) + флаги(1) + synchsafe-размер тела (7 значащих бит на байт,
    // байты 6-9). Скип обязателен: тег может содержать 0xFF (обложка) → ложные sync.
    if (u8.length >= 10 && u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) {
      var sz = ((u8[6] & 0x7f) << 21) | ((u8[7] & 0x7f) << 14) | ((u8[8] & 0x7f) << 7) | (u8[9] & 0x7f);
      i = 10 + sz;
    }
    var offsets = [], t = 0, lastMark = -1, frames = 0, badResync = 0;
    while (i < u8.length - 4) {
      var f = frameAt(u8, i);
      if (!f) { i++; badResync++; continue; }
      // Анти-false-sync: 0xFF + валидные биты случаются в произвольных данных; настоящий фрейм
      // доказывается тем, что РОВНО через size байт стоит следующий валидный заголовок (или конец
      // файла ближе 4 байт — хвостовому фрейму соседа взять неоткуда). Осознанный побочный
      // эффект: фрейм непосредственно ПЕРЕД мусором приносится в жертву — его сосед невалиден,
      // от ложного sync его не отличить, и его байты уходят в badResync вместе с мусором.
      var nx = i + f.size;
      if (nx < u8.length - 4 && !frameAt(u8, nx)) { i++; badResync++; continue; }
      if (Math.floor(t) > lastMark) { lastMark = Math.floor(t); offsets.push({ t: t, byte: i }); }
      t += f.durSec; i = nx; frames++;
    }
    return { offsets: offsets, totalSec: t, frames: frames, badResync: badResync };
  }

  // Последний offset с t <= sec; sec раньше первой записи → первая (раньше начала звука резать
  // нечего). Пустая карта → null. Запись возвращается как есть ({t, byte}), t — фактическое
  // время фрейма (оно ≤ sec, кроме случая «раньше первого»).
  function byteForTime(map, sec) {
    var offs = (map && map.offsets) || [];
    if (!offs.length) return null;
    var best = offs[0];
    for (var k = 0; k < offs.length; k++) {
      if (offs[k].t <= sec) best = offs[k]; else break;
    }
    return best;
  }

  // windows = [{startSec,endSec}] (обычно AsrTranscript.asrWindows: 15 мин, перекрытие 30с у k>0).
  // Возврат: [{k, startSec, endSec, bytes, byteFrom, byteTo}].
  //   • startSec/endSec — ФАКТИЧЕСКОЕ время граничных фреймов (≤ запрошенного, до ~1с раньше):
  //     абсолютная метка сегмента = chunk-relative метка + startSec, поэтому офсетом обязано
  //     быть время ПЕРВОГО БАЙТА чанка, а не номинальная граница окна — иначе весь чанк
  //     систематически сдвинут. Ранний срез безвреден: он лишь чуть расширяет перекрытие,
  //     которое шов по тексту (stitchWindowSegments) снимает.
  //   • bytes — subarray БЕЗ копии (нарезка 160МБ не удваивает память; копию под тело запроса
  //     делает транспорт в момент аплоада).
  //   • последний чанк — ДО КОНЦА БУФЕРА, endSec = map.totalSec: хвост за последней целой
  //     секундой (и любые байты после последнего offset-марка) не должны потеряться.
  // map можно передать готовым третьим аргументом: buildFrameMap на большом файле стоит ~1-2с,
  // а вызывающий уже построил карту для isSliceable.
  function sliceChunks(u8, windows, map) {
    var m = map || buildFrameMap(u8);
    var wins = Array.isArray(windows) ? windows : [];
    var out = [];
    if (!m.offsets.length) return out; // фреймов нет — резать нечего (isSliceable уже отказал)
    for (var k = 0; k < wins.length; k++) {
      var a = byteForTime(m, wins[k].startSec);
      var last = k === wins.length - 1;
      var b = last ? { t: m.totalSec, byte: u8.length } : byteForTime(m, wins[k].endSec);
      out.push({
        k: k,
        startSec: a.t,
        endSec: b.t,
        bytes: u8.subarray(a.byte, b.byte),
        byteFrom: a.byte,
        byteTo: b.byte,
      });
    }
    return out;
  }

  // Гейт транспорта sliced-mp3: карта обязана быть содержательной (≥ MIN_SLICE_FRAMES фреймов)
  // И согласной с НЕЗАВИСИМО измеренной длительностью (probe через <audio> metadata) в пределах
  // SLICE_DURATION_TOL. Расхождение = экзотика (нестандартный VBR, битые заголовки, не-mp3 под
  // mp3-расширением) → честный fallback на ranged-file, а не тихо кривые офсеты чанков (R11).
  var MIN_SLICE_FRAMES = 100;
  var SLICE_DURATION_TOL = 0.05;

  function isSliceable(map, probedDurationSec) {
    var probed = Number(probedDurationSec);
    if (!map || !(map.frames >= MIN_SLICE_FRAMES)) return false;
    if (!(probed > 0) || !isFinite(probed)) return false;
    return Math.abs(map.totalSec - probed) <= SLICE_DURATION_TOL * probed;
  }

  var API = {
    buildFrameMap: buildFrameMap,
    byteForTime: byteForTime,
    sliceChunks: sliceChunks,
    isSliceable: isSliceable,
    MIN_SLICE_FRAMES: MIN_SLICE_FRAMES,
    SLICE_DURATION_TOL: SLICE_DURATION_TOL,
  };
  if (typeof window !== "undefined") window.Mp3Slice = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
