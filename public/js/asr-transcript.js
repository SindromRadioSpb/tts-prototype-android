// public/js/asr-transcript.js
// W2-S4 · ASR-контракт (Gemini аудио) + валидация сегмент-тайминга (R11: honest) + смета (R16).
// Pure-ядро, dual-export (browser window.AsrTranscript + Node module.exports) по образцу studio-karaoke.js.
// Канон: docs/planning/STUDIO_INGEST_W2_S4_AUDIO_KARAOKE_DESIGN_2026_07_26.md §3.1-3.2.
(function () {
  "use strict";

  var ASR_MODEL = "gemini-flash-latest";

  var ASR_PROMPT = [
    "You are a strict JSON generator performing SPEECH TRANSCRIPTION of the attached audio or video (Hebrew speech expected; for video use ONLY the audio track).",
    "Rules:",
    "- Split the transcript into natural sentence/phrase segments of at most ~15 seconds each.",
    '- Each segment gets "start" — the timestamp where the segment begins, format "M:SS" or "H:MM:SS" (from audio start).',
    "- Timestamps MUST be non-decreasing and within the audio duration.",
    "- Transcribe Hebrew WITHOUT niqqud (do not add vocalization).",
    "- Do NOT translate, summarize, correct or invent anything.",
    '- If a region is unintelligible, insert "[…]" there and add "PARTIALLY_UNCLEAR" to warnings.',
    '- If the dominant language is not Hebrew, still transcribe and add "NOT_HEBREW" to warnings.',
    '- If there is no speech at all, return {"language":null,"segments":[],"warnings":["NO_SPEECH"]}.',
    "Output ONLY JSON, no markdown fences:",
    '{"language":"he|mixed|other","segments":[{"start":"M:SS","text":"..."}],"warnings":[]}',
  ].join("\n");

  // R16: константы сметы — ЕДИНСТВЕННОЕ место цен ASR. Gemini Flash: аудио-вход ≈32 ток/сек
  // ($1.00/1M ток), выход-транскрипт ≈4 ток/сек речи ($2.50/1M). Пересмотреть при смене модели.
  var ASR_TOKENS_PER_SEC = 32;
  var USD_PER_MTOK_AUDIO_IN = 1.0;
  var OUT_TOKENS_PER_SEC = 4;
  var USD_PER_MTOK_OUT = 2.5;
  // Gemini video input at generationConfig.mediaResolution=MEDIA_RESOLUTION_LOW ≈66 tokens/frame
  // @1fps (default MEDIUM ≈258/frame ≈ ~9× audio — мы всегда шлём LOW для видео, кадры нам не
  // нужны, API не даёт отключить их совсем). Проверено live-smoke S4.2.
  // blended cost ratio vs audio ≈2.57× (see videoNote locale strings — keep in sync)
  var VIDEO_FRAME_TOKENS_PER_SEC_LOW = 66;

  function estimateAsrCostUsd(durationSec, opts) {
    var d = Math.max(0, Number(durationSec) || 0);
    var inRate = ASR_TOKENS_PER_SEC + ((opts && opts.video) ? VIDEO_FRAME_TOKENS_PER_SEC_LOW : 0);
    return (d * inRate / 1e6) * USD_PER_MTOK_AUDIO_IN +
           (d * OUT_TOKENS_PER_SEC / 1e6) * USD_PER_MTOK_OUT;
  }

  // ── W2-S12: окна ASR + покрытие + смета длинного прогона ──
  // Все числа — замер 2026-07-28 (docs/research/studio-ingest-longmedia/2026-07-28/):
  // одновызовный ASR длинных файлов молча теряет куски и упирается в 65,536 ток. вывода
  // (thinking делит бюджет с ответом); range-промт по одному fileUri работает точно.
  var ASR_WINDOW_SEC = 900;    // 15 мин — внутри доказанного прод-режима ≤20 мин
  var ASR_GAP_MAX_SEC = 90;    // дыра покрытия внутри записи, требующая добора
  var ASR_TAIL_GAP_SEC = 180;  // молчание хвоста, считающееся дырой

  // S12.4: окна СОСЕДЕЙ ПЕРЕКРЫВАЮТСЯ. Шов по МЕТКАМ (S12.3) слеп к «легально врущим» меткам:
  // модель начинает с начала ФРАЗЫ, а не с секунды a, и, послушная прежнему «within a-b», ставила
  // захваченному куску метку ВНУТРИ диапазона — обе копии реплики выглядели легальными, дубль
  // переживал клиппинг. Лечение: сознательно транскрибировать шовную зону ДВАЖДЫ и резать шов по
  // ТЕКСТУ (stitchWindowSegments) — общая последовательность слов = доказательство, что речь одна.
  var ASR_WINDOW_OVERLAP_SEC = 30;
  // Клип ranged-окна ослаблен ровно настолько, чтобы ближняя (шовная) зона дожила до stitch;
  // «далеко вне» (заезд на минуты, как в живой приёмке) по-прежнему отбрасывается у источника.
  var ASR_STITCH_CLIP_TOL_SEC = ASR_WINDOW_OVERLAP_SEC + 30;

  // Номинальные границы окон — 0, 900, 1800…; окно k>0 стартует на OVERLAP РАНЬШЕ своей границы,
  // окно k заканчивается РОВНО на ней. Зона перекрытия соседей = [seam-OVERLAP, seam].
  function asrWindows(durationSec) {
    var d = Math.max(0, Number(durationSec) || 0);
    var out = [];
    for (var k = 0; k * ASR_WINDOW_SEC < d; k++) {
      var nominal = k * ASR_WINDOW_SEC;
      out.push({ startSec: k === 0 ? 0 : nominal - ASR_WINDOW_OVERLAP_SEC,
                 endSec: Math.min(d, nominal + ASR_WINDOW_SEC) });
    }
    if (!out.length) out.push({ startSec: 0, endSec: 0 });
    return out;
  }

  // Номинальные швы между окнами (900, 1800…) — то, вокруг чего ищется якорь. wins[k].startSec
  // окна k>0 = seam-OVERLAP по построению asrWindows, поэтому шов восстанавливается однозначно.
  function asrSeams(windows) {
    var out = [];
    for (var k = 1; k < (windows || []).length; k++) out.push(windows[k].startSec + ASR_WINDOW_OVERLAP_SEC);
    return out;
  }

  function fmtClock(sec) { // форматы, которые secondsFromTimestamp умеет парсить
    var s = Math.max(0, Math.round(sec));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
    return h ? h + ":" + String(m).padStart(2, "0") + ":" + ss : m + ":" + ss;
  }

  // S12.4 (владелец, живая 117-мин приёмка 2026-07-29 — дубли-блоки пережили клиппинг S12.3).
  // ПРАВИЛО ПЕРЕПИСАНО ЦЕЛИКОМ, не подправлено. Прежняя формулировка требовала «Timestamps must
  // remain ABSOLUTE … i.e. within a-b» — два несовместимых требования сразу: модель начинает
  // транскрипт с начала ФРАЗЫ (а не с секунды a) и доводит фразу за b, и, будучи послушной,
  // штамповала захваченному куску метку ВНУТРИ диапазона. Клип по меткам такую «легально врущую»
  // метку не отличает от честной → дубль на каждом шве. Теперь диапазон ограничивает ЗВУК, а метка
  // обязана быть честной ВСЕГДА — даже когда она выпадает за диапазон; шов режется по тексту
  // (stitchWindowSegments), а не по меткам, поэтому честная метка вне a-b ничего не ломает.
  // Базовый ASR_PROMPT не тронут (research m3, фаза range258).
  function ASR_RANGE_PROMPT(startSec, endSec) {
    var a = fmtClock(startSec), b = fmtClock(endSec);
    return ASR_PROMPT +
      "\nIMPORTANT SCOPE: transcribe ONLY the speech of the region from " + a + " to " + b +
      " (minutes:seconds from the very beginning of the file); transcribe nothing from any other" +
      " part of the recording." +
      "\nTIMESTAMPS ARE ABSOLUTE AND HONEST: every \"start\" is measured from the very beginning of" +
      " the FILE, never from the start of this region. If a phrase you transcribe begins slightly" +
      " before " + a + ", or ends slightly after " + b + ", report its REAL absolute timestamp," +
      " EVEN IF that timestamp falls outside " + a + "-" + b + "." +
      " NEVER shift, round or stretch a timestamp to make it fall inside " + a + "-" + b + ".";
  }

  function mergeWindowSegments(perWindow) {
    var out = [], lastT = -Infinity;
    for (var w = 0; w < (perWindow || []).length; w++) {
      var segs = perWindow[w] || [];
      for (var k = 0; k < segs.length; k++) {
        var t = (typeof segs[k].start === "number" && isFinite(segs[k].start)) ? segs[k].start : null;
        if (t !== null && t < lastT) t = null; // немонотонный стык окон → честный null (R11)
        if (t !== null) lastT = t;
        out.push({ start: t, text: segs[k].text });
      }
    }
    return out;
  }

  // ── S12.4: ШОВ ОКОН ПО ТЕКСТУ (якорь в зоне перекрытия) ─────────────────────────────────────
  // Окна соседей перекрываются на ASR_WINDOW_OVERLAP_SEC (asrWindows), значит речь шовной зоны
  // транскрибируется ДВАЖДЫ — намеренно. ЯКОРЬ = самая длинная общая последовательность слов
  // (≥ STITCH_ANCHOR_MIN_WORDS) между ХВОСТОМ окна k и ГОЛОВОЙ окна k+1. Якорь — это
  // ДОКАЗАТЕЛЬСТВО, что перед нами одна и та же речь; без него мы НИЧЕГО не выбрасываем сверх
  // старого клипа по номинальной границе.
  //
  // ПРАВИЛО РЕЗА (по СЕГМЕНТАМ, границы определяются вкладом normalized-слов сегмента в якорь):
  //   cutK  = ПЕРВЫЙ сегмент окна k, чьи слова попадают в якорную зону хвоста → окно k отдаёт
  //           сегменты [0, cutK) (всё ДО него);
  //   cutK1 = сегмент окна k+1, СОДЕРЖАЩИЙ первое слово якоря в своей голове → окно k+1 отдаёт
  //           сегменты [cutK1, …) (начиная С него).
  // Якорный текст остаётся РОВНО ОДИН раз — из окна k+1: якорь лежит в НАЧАЛЕ его запрошенного
  // региона (метки честнее), а для окна k — в самом хвосте, куда модель доезжает с накопленным
  // дрейфом.
  //
  // Пример (seam=900, перекрытие 30с):
  //   окно k  : s0 "מאמר על חינוך" | s1 "אבא אמא ילד ילדה" | s2 "הילד אכל תפוח" | s3 "הילד רץ אל הבית"
  //   окно k+1: t0 "הילד אכל תפוח" | t1 "הילד רץ אל הבית" | t2 "שלום עולם טוב"
  //   якорь = «הילד אכל תפוח הילד רץ אל הבית» (7 слов). Его первое слово в хвосте принадлежит s2,
  //   в голове — t0 → cutK=2, cutK1=0. Результат: s0, s1, t0, t1, t2 — якорная речь одна копия
  //   (из окна k+1), s2/s3 (её дубль из окна k) отброшены, ничего сверх зоны перекрытия не потеряно.
  //
  // ГРАНИЦА СЕГМЕНТА cutK — СЛОВЕСНЫЙ ТРИМ (fix1 I1). Якорь может начинаться НЕ с первого слова
  // сегмента cutK: слова этого сегмента ДО якоря — реальная речь, и выбрасывать их вместе с
  // сегментом нельзя. Правило целиком:
  //   • якорь начинается с ПЕРВОГО слова сегмента cutK1 у соседа (headTokIdx===0) ⇒ сосед не даёт
  //     НИЧЕГО до якоря ⇒ префикс cutK сохраняется УСЕЧЁННЫМ сегментом (текст обрезается по
  //     границе последнего до-якорного слова, метка start сохраняется);
  //   • якорь начинается ПОЗЖЕ первого слова сегмента cutK1 (headTokIdx>0) ⇒ у соседа есть СВОЯ
  //     редакция тех же до-якорных слов, и она остаётся ⇒ сегмент cutK отбрасывается целиком,
  //     иначе та же речь попала бы в транскрипт дважды в двух редакциях.
  // Провенанс усечения — cutSegTrimmedK (число сохранённых слов).
  //
  // R11: максимум потерь на шов — сегменты ВНУТРИ зоны перекрытия, и только когда та же речь
  // ДОКАЗАНО осталась у соседа. Три предохранителя:
  //   1. stitchAnchorInZone() — если рез задел бы сегмент с честной меткой ВНЕ зоны
  //      [seam-overlap-TOL, seam+TOL] (ложный якорь на повторяющейся фразе далеко от шва), якорь
  //      отклоняется, шов уходит в noAnchor-фолбэк (anchorOutOfZone в провенансе);
  //   2. словесный трим выше — граница сегмента не съедает до-якорные слова;
  //   3. fix1 C1: в noAnchor-фолбэке рез окна k+1 («всё < seam-2») применяется ТОЛЬКО при
  //      ДОКАЗАТЕЛЬСТВЕ покрытия у окна k — см. stitchKCoversSeamZone().
  var STITCH_TAIL_WORDS = 80;       // сколько слов хвоста/головы вообще участвуют в поиске якоря
  var STITCH_ANCHOR_MIN_WORDS = 5;  // короче — не доказательство, а совпадение частотных слов
  var STITCH_ZONE_TOL_SEC = 15;     // метки модели плавают; фраза может лежать поперёк шва
  var STITCH_SEAM_TOL_SEC = 2;      // фолбэк без якоря = прежний рез по номинальной границе ±2с

  // Токен = слово + его КОНЕЦ в исходном тексте (граница нужна словесному триму выше).
  // fix1 C2: слово = буквы/цифры ЛЮБОГО письма (\p{L}\p{N}), не только иврит. Не-ивритское аудио —
  // поддержанный путь (ASR_PROMPT: транскрибируем и помечаем NOT_HEBREW); при иврит-only
  // нормализации якорь на таком материале не образовывался НИКОГДА, каждый шов шёл лоссовым
  // noAnchor-путём, а провенанс при этом «сообщал», что модель не повторяет речь на шве — ложь.
  // Огласовки/теамим снимаются ВНУТРИ токена (не разрывают слово), регистр — вниз (иврит без
  // регистра, кириллица/латиница — с ним).
  function stitchTokens(text) {
    var s = String(text == null ? "" : text), re = /[\p{L}\p{N}֑-ׇ]+/gu, out = [], m;
    while ((m = re.exec(s)) !== null) {
      var w = m[0].replace(/[֑-ׇ]/g, "").toLowerCase();
      if (w) out.push({ w: w, to: m.index + m[0].length });
    }
    return out;
  }

  function stitchNormalizeWords(text) {
    return stitchTokens(text).map(function (t) { return t.w; });
  }

  // words[] + owners[] (индекс сегмента-владельца слова) + tokIdx[] (номер слова ВНУТРИ своего
  // сегмента — для словесного трима). Набираем до ~maxWords, целыми сегментами (сегмент не рвём).
  function stitchTailWords(segments, maxWords) {
    var words = [], owners = [], tokIdx = [];
    for (var i = segments.length - 1; i >= 0 && words.length < maxWords; i--) {
      var w = stitchNormalizeWords(segments[i].text);
      for (var j = w.length - 1; j >= 0; j--) { words.unshift(w[j]); owners.unshift(i); tokIdx.unshift(j); }
    }
    return { words: words, owners: owners, tokIdx: tokIdx };
  }

  function stitchHeadWords(segments, maxWords) {
    var words = [], owners = [], tokIdx = [];
    for (var i = 0; i < segments.length && words.length < maxWords; i++) {
      var w = stitchNormalizeWords(segments[i].text);
      for (var j = 0; j < w.length; j++) { words.push(w[j]); owners.push(i); tokIdx.push(j); }
    }
    return { words: words, owners: owners, tokIdx: tokIdx };
  }

  // Самая длинная общая ПОДСТРОКА слов (скользящее окно = классический DP по суффиксам).
  // При равной длине побеждает КАНДИДАТ БЛИЖЕ К ШВУ: хвост окна k упирается в номинальную границу,
  // поэтому «ближе к шву» = больший индекс в хвосте → сравнение `>=` при возрастающем i.
  function stitchFindAnchor(tailWords, headWords, minWords) {
    var n = tailWords.length, m = headWords.length;
    if (!n || !m) return null;
    var prev = new Array(m + 1).fill(0), best = null;
    for (var i = 1; i <= n; i++) {
      var cur = new Array(m + 1).fill(0);
      for (var j = 1; j <= m; j++) {
        if (tailWords[i - 1] !== headWords[j - 1]) continue;
        cur[j] = prev[j - 1] + 1;
        if (cur[j] >= minWords && (!best || cur[j] >= best.len)) {
          best = { len: cur[j], tailStart: i - cur[j], headStart: j - cur[j] };
        }
      }
      prev = cur;
    }
    return best;
  }

  // R11-предохранитель (см. блок выше): рез легитимен, только если ВСЁ отбрасываемое лежит в зоне
  // перекрытия ±STITCH_ZONE_TOL_SEC. null-метки не опровергают якорь (нет свидетельства) —
  // текстовое доказательство остаётся в силе. overlapSec — ФАКТИЧЕСКАЯ ширина перекрытия этого
  // шва (fix1 M4: у половин бисекции она ±15с, а не 30с окон).
  function stitchAnchorInZone(A, B, cutK, cutK1, seam, overlapSec) {
    var lo = seam - overlapSec - STITCH_ZONE_TOL_SEC, hi = seam + STITCH_ZONE_TOL_SEC;
    for (var i = cutK; i < A.length; i++) {
      var t = A[i].start;
      if (typeof t === "number" && isFinite(t) && t < lo) return false;
    }
    for (var j = 0; j < cutK1; j++) {
      var u = B[j].start;
      if (typeof u === "number" && isFinite(u) && u > hi) return false;
    }
    return true;
  }

  // fix1 C1 + fix2 D1 (БЛОКЕР ревью, R11): noAnchor-фолбэк режет у окна k+1 «всё < seam-2», МОЛЧА
  // полагая, что зону [seam-overlap, seam-2] покрывает окно k. Это ПРЕДПОЛОЖЕНИЕ, а не факт: окно
  // k могло оборваться раньше (пропущенная половина бисекции, обрезанный ответ модели, тишина в
  // конце ответа). Тогда рез уничтожал честную речь НАСОВСЕМ и незаметно: дыра ≤90с не попадает ни
  // в coverageGaps, ни в warning, ни в добор.
  //
  // fix1 давал ОДНО доказательство на весь шов («у k есть метка в зоне») — и этого мало: k=[…,855]
  // при seam=900 «доказывало» покрытие сегментов k+1 на 870…894, которых окно k никогда не
  // касалось (≈24с речи исчезали, и флага при этом не было — от легитимного полного реза случай
  // не отличался). Обрыв окна k ГДЕ УГОДНО в полосе [seam-45, seam-2] давал тихую потерю.
  //
  // ПРАВИЛО (fix2, посегментное): сегмент окна k+1 с ЧИСЛОВОЙ меткой t режется ТОЛЬКО если у окна
  // k ПОСЛЕ его собственного реза осталась числовая метка m >= t - STITCH_COVER_TOL_SEC. Формально
  // это ВСЁ, что проверяется: m может быть и ПОЗЖЕ t (обычный случай — окно k договорило свою
  // половину шва), а критично лишь то, что окно k не оборвалось РАНЬШЕ чем за TOL до t; проверка
  // сводится к сравнению с последней сохранённой меткой (stitchLastKeptMark). Сегменты k+1 без
  // такого свидетеля ОСТАЮТСЯ (лучше микро-дубль, чем потеря — декларация слайса). null-метки не
  // режутся никогда.
  // Провенанс: k1CutKept — сколько сегментов оставлено без доказательства; k1CutPartial — рез
  // применён частично; k1CutSkipped — числовых свидетелей у окна k нет ВООБЩЕ (рез не применялся).
  //
  // STITCH_COVER_TOL_SEC = 10с: ASR_PROMPT ограничивает сегмент ~15с, поэтому сегмент окна k,
  // начавшийся не раньше чем за 10с до t, с запасом ещё звучит в момент t. Брать 15с нельзя — это
  // значило бы предполагать МАКСИМАЛЬНУЮ длину сегмента в каждом случае; 10с оставляет 5с запаса.
  var STITCH_COVER_TOL_SEC = 10;

  // Самая поздняя ЧИСЛОВАЯ метка окна k среди СОХРАНЁННЫХ сегментов (null — таких нет).
  // «Существует сохранённая метка >= t-TOL» ⟺ «kMaxKept >= t-TOL» — поэтому максимума достаточно.
  function stitchLastKeptMark(A, keepA) {
    var best = null;
    for (var i = 0; i < A.length; i++) {
      if (!keepA[i]) continue;
      var t = A[i].start;
      if (typeof t === "number" && isFinite(t) && (best === null || t > best)) best = t;
    }
    return best;
  }

  // perWindow = [[{start,text}…]…], seams = номинальные границы (900, 1800…), длиной
  // perWindow.length-1; opts.overlapSec — фактическая ширина перекрытия соседей (по умолчанию
  // ASR_WINDOW_OVERLAP_SEC; бисекция передаёт свои ±15с). Возврат: { segments, seamsMeta } —
  // seamsMeta уходит в провенанс (R9).
  function stitchWindowSegments(perWindow, seams, opts) {
    var wins = (perWindow || []).map(function (s) { return Array.isArray(s) ? s : []; });
    var keep = wins.map(function (s) { return s.map(function () { return true; }); });
    var repl = wins.map(function (s) { return s.map(function () { return null; }); }); // усечённые сегменты
    var overlapSec = (opts && typeof opts.overlapSec === "number" && isFinite(opts.overlapSec))
      ? opts.overlapSec : ASR_WINDOW_OVERLAP_SEC;
    var seamList = Array.isArray(seams) ? seams : [];
    var count = Math.min(seamList.length, Math.max(0, wins.length - 1));
    var meta = [];
    for (var s = 0; s < count; s++) {
      var seam = Number(seamList[s]);
      var A = wins[s], B = wins[s + 1];
      var tail = stitchTailWords(A, STITCH_TAIL_WORDS);
      var head = stitchHeadWords(B, STITCH_TAIL_WORDS);
      var anchor = stitchFindAnchor(tail.words, head.words, STITCH_ANCHOR_MIN_WORDS);
      var cutK = anchor ? tail.owners[anchor.tailStart] : -1;
      var cutK1 = anchor ? head.owners[anchor.headStart] : -1;
      var outOfZone = !!anchor && !stitchAnchorInZone(A, B, cutK, cutK1, seam, overlapSec);
      if (anchor && !outOfZone) {
        // fix2 D2: состояние cutK ДО реза. Сегмент мог быть уже отброшен ПРЕДЫДУЩИМ швом (окно s —
        // это k+1 для шва s-1), и тогда трим ниже его ВОСКРЕСИЛ БЫ: в транскрипте появлялась вторая
        // копия текста, законно снятого прошлым швом. Тримить можно только живой сегмент.
        var cutKWasKept = keep[s][cutK];
        // Счётчик стороны k считает ПЕРЕХОДЫ true→false, а не «сколько сегментов правее cutK»:
        // окно s могло уже потерять часть хвоста на шве s-1, и без этого провенанс приписывал бы
        // текущему шву чужие резы. Для стороны k+1 такой разницы НЕТ по построению: швы идут по
        // возрастанию, и к моменту шва s голова окна s+1 ещё никем не тронута — dropK1 там всегда
        // равен cutK1, форма условия оставлена ради симметрии, а не потому что различает переходы.
        var dropK = 0, dropK1 = 0;
        for (var i = cutK; i < A.length; i++) { if (keep[s][i]) { keep[s][i] = false; dropK++; } }
        for (var j = 0; j < cutK1; j++) { if (keep[s + 1][j]) { keep[s + 1][j] = false; dropK1++; } }
        // Словесный трим границы (правило целиком — в блоке комментария выше).
        var prefixWords = tail.tokIdx[anchor.tailStart];       // сколько слов cutK стоит ДО якоря
        var headTokIdx = head.tokIdx[anchor.headStart];        // с какого слова cutK1 начинается якорь
        var trimmedWords = 0;
        if (cutKWasKept && prefixWords > 0 && headTokIdx === 0) {
          var toks = stitchTokens(A[cutK].text);
          var prefixText = String(A[cutK].text).slice(0, toks[prefixWords - 1].to).replace(/\s+$/, "");
          if (prefixText) {
            keep[s][cutK] = true;
            repl[s][cutK] = { start: A[cutK].start, text: prefixText };
            trimmedWords = prefixWords;
            dropK--; // сегмент не отброшен, а усечён
          }
        }
        var m1 = { seam: seam, anchored: true, anchorWords: anchor.len,
                   cutSegDroppedK: dropK, cutSegDroppedK1: dropK1 };
        if (trimmedWords) m1.cutSegTrimmedK = trimmedWords; // R9: сегмент не отброшен, а усечён
        meta.push(m1);
        continue;
      }
      // Фолбэк без якоря — прежний честный рез по номинальной границе (тот же ±2с допуск, что и у
      // клиппинга): окно k до seam+2, окно k+1 от seam-2. null-метки НЕ трогаем (нет свидетельства
      // ни за, ни против — текст сохраняется, R11).
      var dK = 0, dK1 = 0, k1Left = 0;
      for (var p = 0; p < A.length; p++) {
        var ta = A[p].start;
        if (typeof ta === "number" && isFinite(ta) && ta > seam + STITCH_SEAM_TOL_SEC && keep[s][p]) {
          keep[s][p] = false; dK++;
        }
      }
      // fix2 D1: рез каждого сегмента окна k+1 — ТОЛЬКО при ПОСЕГМЕНТНОМ доказательстве покрытия.
      var kMark = stitchLastKeptMark(A, keep[s]);
      for (var q = 0; q < B.length; q++) {
        var tb = B[q].start;
        if (!(typeof tb === "number" && isFinite(tb))) continue;   // null — свидетельств нет, не режем
        if (tb >= seam - STITCH_SEAM_TOL_SEC) continue;            // не в шовной полосе — не наш случай
        if (kMark !== null && tb <= kMark + STITCH_COVER_TOL_SEC) {
          if (keep[s + 1][q]) { keep[s + 1][q] = false; dK1++; }
        } else k1Left++;                                           // покрытия не доказано — ОСТАВЛЯЕМ
      }
      var m2 = { seam: seam, anchored: false, noAnchor: true, cutSegDroppedK: dK, cutSegDroppedK1: dK1 };
      if (k1Left) {                                               // R9/R11: почему сосед срезан не весь
        m2.k1CutKept = k1Left;
        if (kMark === null) m2.k1CutSkipped = true;               // свидетелей нет вообще
        else m2.k1CutPartial = true;                              // свидетель есть, но не на всю полосу
      }
      if (outOfZone) { m2.anchorOutOfZone = true; m2.anchorWords = anchor.len; } // R9: почему якорь отклонён
      meta.push(m2);
    }
    var out = [];
    for (var w = 0; w < wins.length; w++) {
      for (var r = 0; r < wins[w].length; r++) if (keep[w][r]) out.push(repl[w][r] || wins[w][r]);
    }
    return { segments: out, seamsMeta: meta };
  }

  // ── S12.5 T3: АНТИ-РЕПЛЕЙ ТЕКСТ-ГЕЙТ (последняя линия обороны) ───────────────────────────────
  // Диагноз DIAGNOSIS_S12_LIVE_DEFECT_2026_07_29 §7: `gemini-flash-latest` на глубоких офсетах
  // одного длинного fileUri возвращает контент ЧУЖОГО диапазона с правдоподобными метками
  // «внутри своего» — то есть ПОДДЕЛАННЫМИ. Все гейты покрытия конвейера (клип, шов, поиск дыр,
  // добор) ключуются на этих метках, поэтому подделка проходит их РАЗОМ и маскирует потерю
  // (живой прогон владельца: потеря 47% таймлайна отчиталась `coverageGaps: []`).
  //
  // ПОЧЕМУ ТЕКСТ, А НЕ МЕТКА. Метка — часть ВЫХОДА модели, она подделываема и потому не может
  // быть оракулом самой себя (independent-oracle). Текст — независимый сигнал: если материал уже
  // встречался в прогоне, он и есть тот же материал, чем бы его ни пометили. Тот же принцип, что
  // у шва S12.4 (якорь по словам), но применённый к ТЕЛУ окна/добора, а не к зоне ±30с.
  // Транспорт sliced-mp3 (T2) убивает класс подделки ПО ПОСТРОЕНИЮ (модель не видит чужого звука);
  // этот гейт — последняя линия для транспорта ranged-file (видео/не-mp3/не-sliceable mp3, где
  // range-промт остаётся) и страховка для slice-пути.
  //
  // ПОЧЕМУ 40%. Живая речь даёт рефрены («кен, кен», формульные обороты) — на 6-словных шинглах
  // это 1–3%; шовное перекрытие соседних окон (30с из 900с) добавляет ~3%. Бракованные окна
  // прогона-образца 2026-07-29 давали 60–95%. Порог 40% лежит с запасом по обе стороны: честное
  // окно до него не дотягивает даже с рефренами и швом, реплей — перескакивает.
  //
  // ПОЧЕМУ K=6. Короче — частотные сочетания служебных слов дают ложные совпадения (по той же
  // причине STITCH_ANCHOR_MIN_WORDS=5 не берёт 4 слова за доказательство); длиннее — гейт слепнет
  // к реплею, транскрибированному ВТОРОЙ РАЗ НЕЗАВИСИМО: копии расходятся текстуально после
  // дословного начала (§2 диагноза), и общими у них остаются короткие куски.
  //
  // ПОЧЕМУ null ПРИ КОРОТКОМ ТЕКСТЕ (R11). Меньше REPLAY_MIN_SHINGLES шинглов — это не «окно
  // честное» и не «окно бракованное», это ОТСУТСТВИЕ ДОКАЗАТЕЛЬСТВ. Обвинять окно, по которому
  // доказательств нет, значит выбрасывать, возможно, единственную честную транскрипцию тихого
  // куска. null = «суждение не выносится», вызывающий обязан трактовать его как «принять».
  //
  // Нормализация слов — ТА ЖЕ, что у шва (stitchNormalizeWords): unicode-слова любого письма,
  // огласовки сняты, регистр вниз. Своей нормализации здесь нет НАМЕРЕННО: два разных правила
  // «что такое слово» разошлись бы, и гейты начали бы спорить друг с другом.
  var REPLAY_SHINGLE_K = 6;
  var REPLAY_REJECT_RATIO = 0.4;
  var REPLAY_MIN_SHINGLES = 20;

  // Шинглы строятся по СКВОЗНОМУ потоку слов всех сегментов (границы сегментов не разрывают
  // поток): нарезка речи на сегменты — решение модели, у двух копий одной речи она разная, и
  // сравнение «по сегментам» пропускало бы реплей с иной разбивкой.
  // skipWords — сколько слов ГОЛОВЫ не участвует в суждении (шовное перекрытие, см.
  // replaySeamSkipWords); накопитель (collectShingles) вызывает БЕЗ него: в базу прогона материал
  // окна идёт целиком, иначе шовная речь стала бы невидимой для проверки следующих окон.
  function replayWords(segments) {
    var list = Array.isArray(segments) ? segments : [];
    var words = [];
    for (var i = 0; i < list.length; i++) {
      var w = stitchNormalizeWords(list[i] && list[i].text);
      for (var j = 0; j < w.length; j++) words.push(w[j]);
    }
    return words;
  }

  function replayShingles(segments, skipWords) {
    var words = replayWords(segments);
    var from = (typeof skipWords === "number" && isFinite(skipWords) && skipWords > 0) ? Math.floor(skipWords) : 0;
    var out = [];
    for (var s = from; s + REPLAY_SHINGLE_K <= words.length; s++) {
      out.push(words.slice(s, s + REPLAY_SHINGLE_K).join(" "));
    }
    return out;
  }

  // ── ШОВНОЕ ИСКЛЮЧЕНИЕ (whole-branch ревью S12.5, 2026-07-29) ────────────────────────────────
  // Соседние окна ПЕРЕКРЫВАЮТСЯ на ASR_WINDOW_OVERLAP_SEC (asrWindows) — шовная зона
  // транскрибируется дважды НАМЕРЕННО (S12.4), то есть часть повторов у честного окна создана
  // НАМИ, а не моделью. У полного окна (930с) это ≈3% шинглов и порог 40% недосягаем, но есть два
  // ЖИВЫХ класса, где шов доминирует над содержимым окна и честное окно объявлялось реплеем:
  //   (1) хвостовое окно короче ~65с — файл длиннее кратного 15 мин на 0–60с (≈каждый 15-й);
  //   (2) окно, оборвавшее вывод сразу после шовной зоны (класс пробы R10: чанк 3 оборвался на
  //       rel 727/930) — своей речи почти нет, шовная есть.
  // Цена ошибки не симметрична обычному ложному срабатыванию: забракованное окно НЕ идёт в добор
  // (см. overlapsRejected), поэтому ложный брак ещё и ЗАПРЕЩАЛ спасение настоящей дыры.
  //
  // Сколько именно слов объяснено швом — МЕРЯЕТСЯ, а не предполагается: это ровно тот якорь, по
  // которому S12.4 режет шов (самая длинная общая последовательность слов между ХВОСТОМ
  // предыдущего окна и ГОЛОВОЙ текущего). Ни одной метки: гейт остаётся независимым от подделки.
  // Возврат — число слов ГОЛОВЫ текущего окна, не подлежащих суждению (0 — якоря нет, шов ничего
  // не объясняет).
  //
  // ГРАНИЦЫ ПОИСКА — РОВНО STITCH_TAIL_WORDS СЛОВ, срез ПОСЛОВНЫЙ (не по целым сегментам, как у
  // stitchTailWords/stitchHeadWords). Разница принципиальна: сегменты — это решение модели, и
  // окно, отданное ОДНИМ сегментом на 1300 слов, растянуло бы «хвост» на всё окно, а с ним и
  // исключение — гейт ослеп бы ровно там, где модель ведёт себя аномально. Пословный срез даёт
  // ЖЁСТКУЮ верхнюю границу: исключить можно не больше 80 слов, значит у живого окна (822–1331
  // слово, замер §6) судится минимум «всё минус 80» и реплей ЦЕЛОГО окна ловится по-прежнему.
  // 80 слов покрывают 30-секундный шов при темпе до ~2.7 сл/с — вдвое выше живого замера
  // (8903 слова / 7017 с = 1.27 сл/с). Осознанный остаток: у ОЧЕНЬ быстрой речи в коротком
  // хвостовом окне часть шва останется неисключённой; это ложный брак, а не пропуск реплея.
  // Окно, где после исключения осталось меньше REPLAY_MIN_SHINGLES, честно уходит в «суждения
  // нет» (null) — отсутствие доказательств не есть доказательство брака.
  function replaySeamSkipWords(prevSegments, segments) {
    var pw = replayWords(prevSegments), cw = replayWords(segments);
    var tail = pw.slice(Math.max(0, pw.length - STITCH_TAIL_WORDS));
    var head = cw.slice(0, STITCH_TAIL_WORDS);
    var anchor = stitchFindAnchor(tail, head, STITCH_ANCHOR_MIN_WORDS);
    return anchor ? anchor.headStart + anchor.len : 0; // ≤ STITCH_TAIL_WORDS по построению
  }

  // Мутирует и возвращает переданный Set (накопитель принятого материала прогона).
  function collectShingles(segments, seenShingles) {
    var set = (seenShingles && typeof seenShingles.add === "function") ? seenShingles : new Set();
    var sh = replayShingles(segments);
    for (var i = 0; i < sh.length; i++) set.add(sh[i]);
    return set;
  }

  // Доля шинглов segments, УЖЕ встречавшихся в прогоне (seenShingles). 0..1; null — материала
  // слишком мало для суждения (см. выше). Знаменатель — ВСЕ шингловые позиции (с повторами):
  // окно, целиком состоящее из повторов одной фразы, обязано считаться реплеем, а не «одним
  // уникальным шинглом». skipWords — шовное исключение (replaySeamSkipWords); материала после
  // исключения может не хватить на суждение — тогда так же честный null.
  function replayRatio(segments, seenShingles, skipWords) {
    var sh = replayShingles(segments, skipWords);
    if (sh.length < REPLAY_MIN_SHINGLES) return null;
    if (!seenShingles || typeof seenShingles.has !== "function") return 0;
    var hit = 0;
    for (var i = 0; i < sh.length; i++) if (seenShingles.has(sh[i])) hit++;
    return hit / sh.length;
  }

  // Интро-дыра НЕ считается: поздний первый сегмент легитимен (музыка) и уже флагуется
  // LATE_FIRST_SEGMENT в validateSegments. null-старты прозрачны (не рвут отрезок).
  function findCoverageGaps(segments, durationSec) {
    var dur = Math.max(0, Number(durationSec) || 0);
    var gaps = [], prev = null;
    for (var k = 0; k < (segments || []).length; k++) {
      var t = segments[k] && typeof segments[k].start === "number" ? segments[k].start : null;
      if (t === null) continue;
      if (prev !== null && t - prev > ASR_GAP_MAX_SEC) gaps.push({ fromSec: prev, toSec: t });
      prev = t;
    }
    if (prev !== null && dur > 0 && dur - prev > ASR_TAIL_GAP_SEC) gaps.push({ fromSec: prev, toSec: dur });
    return gaps;
  }

  // ── S12.6: ПЛОТНОСТЬ РЕЧИ ОКНА — НЕЗАВИСИМЫЙ СИГНАЛ ПРОТИВ ЛОЖНОЙ ДЫРЫ ────────────────────────
  // Живая приёмка владельца 2026-07-29 (117 мин, v3.11.265; тикет
  // docs/planning/STUDIO_INGEST_S12_6_FALSE_GAP_COMPRESSED_MARKS_2026_07_30.md): окно 5
  // [3570,4500] выдало ПОЛНЫЙ текст своих 15 минут — 1218 слов при 1093–1354 у соседей, — но
  // проставило метки только на первые ~9.3 минуты, сжав их вдвое (1218 слов на 561с меток =
  // 2.17 сл/с против живых 1.3). Внутри окна образовался ровно один разрыв меток 4139→4469
  // (330с), и findCoverageGaps — который судит ТОЛЬКО по расстоянию между `start` соседних
  // сегментов — объявил его дырой. Три следствия, все реальные: сводка сообщила «потеряно 4.7%»
  // и владелец подтверждал НЕСУЩЕСТВУЮЩУЮ потерю; добор был оплачен впустую (R16) и вернул текст,
  // который уже был в транскрипте (его поймал анти-реплей гейт S12.5 — сработал правильно);
  // тайминг караоке в этом окне уехал, и НИ ОДНА метрика этого не видела (validateSegments
  // проверяет монотонность и диапазон, но не ПЛОТНОСТЬ).
  //
  // ЭТО ТОТ ЖЕ КОРНЕВОЙ КЛАСС, ЧТО ЧИНИЛ S12.5, С ОБРАТНЫМ ЗНАКОМ: самоотчётная метка модели не
  // может быть оракулом целостности — раньше она СКРЫВАЛА потерю, теперь ВЫДУМЫВАЕТ её. Оракул
  // берётся тот же, что у шва (S12.4) и у анти-реплей гейта (S12.5) — ТЕКСТ:
  //
  //     ЕСЛИ ОКНО ВЫДАЛО ОЖИДАЕМЫЙ ПО СВОЕЙ ДЛИТЕЛЬНОСТИ ОБЪЁМ ТЕКСТА, РАЗРЫВ МЕТОК ВНУТРИ НЕГО
  //     НЕ МОЖЕТ БЫТЬ ПОТЕРЕЙ РЕЧИ: речь на месте, недостоверны МЕТКИ.
  //
  // Доказательство «текст на месте» на живом прогоне независимо от нас: обратный матчинг эталонных
  // субтитров дал внутри «дыры» найденность 37.9% против медианы 33.1% по всей записи.
  //
  // ОЖИДАЕМЫЙ ОБЪЁМ МЕРЯЕТСЯ, А НЕ ЗАДАЁТСЯ КОНСТАНТОЙ: темп речи у интервью, лекции и подкаста
  // разный, и зашитая «1.3 сл/с» лгала бы на первом же другом материале. База прогона = МЕДИАНА
  // слов/сек по окнам без внутренних разрывов (медиана, а не среднее: одно аномальное окно —
  // ровно тот случай, ради которого всё это пишется, и оно не имеет права двигать базу).
  //
  // СЛОВА СЧИТАЕТ stitchNormalizeWords — тот же нормализатор, что у шва и у анти-реплей гейта.
  // Второго правила «что такое слово» в файле не заводим намеренно: два правила однажды разъедутся,
  // и гейты начнут спорить друг с другом.
  //
  // ОСОЗНАННЫЙ ОСТАТОК: слова считаются по СЫРЫМ сегментам окна (до stitch), поэтому шовная зона
  // (30с из 900) считается дважды — ≈3% завышения. Оно одинаково у базы и у подсудимого окна и
  // сокращается в их отношении.
  var DENSITY_BASELINE_MIN_WINDOW_SEC = 300;

  // Порог «объём на месте». Живой замер: окно 5 дало 1218 слов на 930с = 1.31 сл/с при базе
  // 1.29 → 1.02 от ожидания; самое бедное ЧЕСТНОЕ окно того же прогона — 1093 слова = 1.18 сл/с →
  // 0.91. Известный класс реальной потери — обрыв вывода чанка (проба R10: чанк оборвался на
  // rel 727 из 930 ≈ 0.78 объёма) — обязан остаться потерей. 0.85 лежит между ними с запасом по
  // обе стороны: ни одно честное окно живого прогона его не задевает, обрыв вывода — не проходит.
  var DENSITY_TEXT_PRESENT_RATIO = 0.85;

  // Пол доверия к САМОЙ базе (R11: «объём» — доказательство только там, где есть что мерить).
  // Живой замер темпа — 1.27–1.46 сл/с; даже медленная диктовка даёт около 1 сл/с. База ниже
  // 0.5 сл/с (30 слов в минуту) означает не «медленную речь», а материал, по которому ожидаемый
  // объём не определён вовсе (тишина, музыка, единичные реплики, синтетическая фикстура). Там
  // суждение НЕ выносится, и разрыв остаётся честной дырой — консервативная сторона ошибки.
  var DENSITY_MIN_BASELINE_WPS = 0.5;

  // Запас над ГИПОТЕЗОЙ ПОТЕРИ (адверсариальный ревью 2026-07-30, R11 — см. classifyGap).
  // Одного порога «объём на месте» НЕ хватает: окно 930с, реально потерявшее в середине 95–139с
  // речи, выдаёт объём 0.85–0.90 от базы — ВЫШЕ порога, — и без второго условия его дыра
  // объявлялась бы «сжатыми метками». Второе условие сравнивает наблюдаемый объём не с нормой, а
  // с тем, что дала бы САМА ГИПОТЕЗА ПОТЕРИ: (windowSec − gapSec)/windowSec. Запас нужен потому,
  // что объём честного окна и сам гуляет: на живом прогоне окна легли в 0.91–1.02 от медианы
  // (максимальное отклонение вверх ≈+0.02, вниз ≈−0.09). Чтобы РЕАЛЬНАЯ потеря g просочилась
  // сквозь запас m, окно должно быть многословнее медианы в 1 + m/(1−g/W) раз: при m=0.15 и
  // потере 15% окна это ×1.18 — вдвое дальше наблюдаемого разброса. Плата за запас — честная и
  // консервативная: ложная дыра короче ≈15% окна (для 930с это ≈140с) остаётся «потерей», её
  // по-прежнему добирают и показывают; живой дефект владельца (330с из 930) лечится с запасом
  // 0.375 против требуемых 0.15.
  var DENSITY_GAP_VOLUME_MARGIN = 0.15;

  // ── S12.7: СЖАТЫЕ ЧАСЫ ЧАНКА ────────────────────────────────────────────────────────────
  // Живой замер 2026-07-30 (docs/research/studio-karaoke-clock-drift/2026-07-30/FINDINGS.md):
  // сломанные прогоны кроют метками 0.69–0.71 окна при объёме текста 0.99; здоровые — 0.90–0.99
  // при том же объёме. Запас 0.15 лежит между ними (ближайший здоровый — 0.094) и заодно
  // покрывает СИСТЕМАТИЧЕСКОЕ занижение покрытия: markToSec — это НАЧАЛО последнего сегмента,
  // его собственная длительность (ASR_PROMPT ограничивает её ~15с) в размах не входит. Для
  // 900-секундного окна это ≈1.7%, для минимально судимого 120-секундного — ≈12%, поэтому ниже
  // CLOCK_MIN_WINDOW_SEC вердикт не выносится вовсе: там смещение съело бы весь запас.
  var CLOCK_SPAN_MARGIN = 0.15;
  // На горстке сегментов размах меток — не статистика: одна длинная реплика в хвосте двигает его
  // на десятки процентов. Живые чанки дают 34–138 сегментов; 8 — заведомо ниже любого реального.
  var CLOCK_MIN_SEGMENTS = 8;
  var CLOCK_MIN_WINDOW_SEC = 120;

  // Сжатые часы ЧАНКА — факт, независимый от разрывов (classifyGap судит НАЙДЕННЫЙ разрыв, а
  // сжатие на 15% разрыва не даёт вовсе: hop между соседними метками остаётся мелким, хвост —
  // короче ASR_TAIL_GAP_SEC, и тайминг уезжает на минуты молча). Здесь судится САМ РАЗМАХ
  // МЕТОК против объёма текста окна.
  //
  // Ожидание — не «метки обязаны покрыть всё окно» (окно имеет право честно молчать), а «метки
  // обязаны покрыть ту долю окна, которую занимает речь». Единственная имеющаяся у нас оценка
  // этой доли, НЕ зависящая от меток, — объём текста относительно базы прогона (densityRatio).
  // Обрезка единицей обязательна с обеих сторон честности: покрытие физически не может превысить
  // 100% окна, поэтому окно РЕЧИСТЕЕ базы (densityRatio 1.25) при полном покрытии иначе давало бы
  // diff 0.25 и объявлялось сжатым — ложное обвинение здорового окна (тест S12.7-R11).
  //
  // Судить окно можно, только если базу образует КТО-ТО КРОМЕ НЕГО: иначе медиана равна его же
  // плотности, densityRatio выходит ровно 1.0 ПО ПОСТРОЕНИЮ, и оракул судит сам себя (та же
  // причина, по которой classifyGap не доверяет базе из подсудимого). Условие именно «есть другое
  // окно В БАЗЕ», а не «в базе ≥2 окна»: сжатый чанк, вдобавок получивший внутренний разрыв,
  // из базы исключён — и правило «≥2» тогда молча снимало бы с него обвинение (поймано тестом
  // «дробление улучшило, но не вылечило»: после дробления у окна появляются швы-разрывы).
  // Осознанный остаток: файл ≤15 мин = одно окно, и сжатие его часов этот детектор не увидит;
  // его ловит только прежний путь (разрыв ≥ ASR_TAIL_GAP_SEC → classifyGap → marks-unreliable).
  //
  // density — результат runSpeechDensity. Возврат — [] либо по записи на сжатый чанк:
  //   {windowIdx, fromSec, toSec, coverageRatio, expectedRatio, densityRatio, marginRequired}.
  function classifyClockCompression(density) {
    var d = density || {};
    var stats = Array.isArray(d.windows) ? d.windows : [];
    var out = [];
    if (!d.usable) return out;
    for (var i = 0; i < stats.length; i++) {
      var s = stats[i];
      if (s.densityRatio === null || s.markFromSec === null || s.markToSec === null) continue;
      if (s.segments < CLOCK_MIN_SEGMENTS || s.windowSec < CLOCK_MIN_WINDOW_SEC) continue;
      var independent = false;
      for (var j = 0; j < stats.length; j++) { if (j !== i && stats[j].inBaseline) { independent = true; break; } }
      if (!independent) continue;
      var coverage = (s.markToSec - s.markFromSec) / s.windowSec;
      var expected = Math.min(1, s.densityRatio);
      if (expected - coverage < CLOCK_SPAN_MARGIN) continue;
      out.push({
        windowIdx: s.windowIdx, fromSec: s.startSec, toSec: s.endSec,
        coverageRatio: Math.round(coverage * 100) / 100,
        expectedRatio: Math.round(expected * 100) / 100,
        densityRatio: Math.round(s.densityRatio * 100) / 100,
        marginRequired: CLOCK_SPAN_MARGIN,
      });
    }
    return out;
  }

  function densityMedian(nums) {
    var v = nums.slice().sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  // perWindowSegments = [[{start,text}…]…] СЫРЫХ сегментов окон (runWindowedAsr.windowSegments),
  // windows = [{startSec,endSec}] (asrWindows). Возврат — паспорт плотности прогона:
  //   { baselineWordsPerSec, baselineWindows, usable, windows: [{windowIdx,startSec,endSec,
  //     windowSec,words,segments,markFromSec,markToSec,maxMarkHopSec,internalGap,wordsPerSec,
  //     densityRatio}] }.
  // Лишние элементы любой из сторон игнорируются (судим ровно по парам «окно ↔ его сегменты»).
  function runSpeechDensity(perWindowSegments, windows) {
    var wins = Array.isArray(windows) ? windows : [];
    var per = Array.isArray(perWindowSegments) ? perWindowSegments : [];
    var n = Math.min(wins.length, per.length);
    var stats = [], i, k;
    for (i = 0; i < n; i++) {
      var segs = Array.isArray(per[i]) ? per[i] : [];
      var words = 0, marks = [];
      for (k = 0; k < segs.length; k++) {
        words += stitchNormalizeWords(segs[k] && segs[k].text).length;
        var t = segs[k] && segs[k].start;
        if (typeof t === "number" && isFinite(t)) marks.push(t);
      }
      var a = wins[i] && wins[i].startSec, b = wins[i] && wins[i].endSec;
      var okRange = typeof a === "number" && isFinite(a) && typeof b === "number" && isFinite(b) && b > a;
      var windowSec = okRange ? b - a : 0;
      // Собственный разрыв меток окна — тем же порогом, которым findCoverageGaps судит транскрипт
      // (второй «что такое разрыв» здесь был бы третьим мнением на ровном месте). Метки берутся в
      // порядке сегментов: их немонотонность — это и есть брак тайминга, а не повод сортировать.
      var maxHop = 0;
      for (k = 1; k < marks.length; k++) { if (marks[k] - marks[k - 1] > maxHop) maxHop = marks[k] - marks[k - 1]; }
      stats.push({
        windowIdx: i, startSec: okRange ? a : null, endSec: okRange ? b : null,
        windowSec: windowSec, words: words, segments: segs.length,
        markFromSec: marks.length ? marks[0] : null,
        markToSec: marks.length ? marks[marks.length - 1] : null,
        maxMarkHopSec: maxHop, internalGap: maxHop > ASR_GAP_MAX_SEC,
        wordsPerSec: windowSec > 0 ? words / windowSec : null, densityRatio: null,
      });
    }
    // База — ТОЛЬКО по окнам БЕЗ внутренних разрывов (independent-oracle, R11). Это не
    // косметика, а несущее условие: окно с разрывом — ПОДСУДИМЫЙ, и если пустить его в базу,
    // то в вырожденном случае (единственное окно прогона) медиана станет равна его же плотности,
    // отношение выйдет ровно 1.0 ПО ПОСТРОЕНИЮ, и любой разрыв объявился бы «текст на месте» —
    // оракул, судящий сам себя. Окно, оборвавшее вывод (реальная потеря), из базы исключается по
    // той же причине. Короткие окна (хвост файла) в базу не идут тоже: у 40-секундного окна
    // «слов/сек» пляшет от одной фразы. Не осталось НИ ОДНОГО подходящего окна ⇒ базы нет ⇒
    // суждение не выносится, все разрывы остаются честными дырами.
    // Принадлежность окна базе — ФАКТ прогона, а не внутренняя деталь: S12.7 обязан знать, что
    // конкретно ЭТО окно судится не самим собой (см. classifyClockCompression). Восстанавливать
    // предикат пула снаружи было бы вторым мнением о том, что такое база.
    for (i = 0; i < stats.length; i++) {
      stats[i].inBaseline = stats[i].wordsPerSec !== null && stats[i].words > 0 &&
                            !stats[i].internalGap && stats[i].windowSec >= DENSITY_BASELINE_MIN_WINDOW_SEC;
    }
    var pool = stats.filter(function (s) { return s.inBaseline; });
    var base = densityMedian(pool.map(function (s) { return s.wordsPerSec; }));
    for (i = 0; i < stats.length; i++) {
      if (base !== null && base > 0 && stats[i].wordsPerSec !== null) stats[i].densityRatio = stats[i].wordsPerSec / base;
    }
    return { baselineWordsPerSec: base, baselineWindows: pool.length,
             usable: base !== null && base >= DENSITY_MIN_BASELINE_WPS, windows: stats };
  }

  // Вердикт по ОДНОМУ разрыву (density — результат runSpeechDensity):
  //   "lost"             — реальная потеря речи (по умолчанию: R11 — вердикт «текст на месте»
  //                        надо ДОКАЗАТЬ, а не предположить);
  //   "marks-unreliable" — текст своего окна на месте, недостоверны метки.
  // Правило — ДВА условия, и оба обязательны:
  //   (1) разрыв лежит ЦЕЛИКОМ внутри окна, и КАЖДОЕ целиком содержащее его окно выдало
  //       ≥ DENSITY_TEXT_PRESENT_RATIO ожидаемого объёма (судим по САМОМУ БЕДНОМУ из них);
  //   (2) наблюдаемый объём ПРЕВОСХОДИТ ГИПОТЕЗУ ПОТЕРИ на DENSITY_GAP_VOLUME_MARGIN.
  // Разрыв НА ГРАНИЦЕ двух окон не лежит целиком ни в одном — он остаётся потерей: объём окна
  // говорит про окно ЦЕЛИКОМ, и переносить это утверждение на речь, за которую окно не отвечало,
  // нельзя (именно так выглядит настоящая потеря на стыке — оборванный хвост одного окна плюс
  // поздний старт другого).
  //
  // ЗАЧЕМ (2) — ОПАСНАЯ СТОРОНА ДЕТЕКТОРА (адверсариальный ревью 2026-07-30, R11). Первая
  // редакция S12.6 проверяла только (1), и этого НЕ ХВАТАЛО: окно 930с, реально потерявшее в
  // середине 95–139с речи (модель пропустила кусок и добила концом), выдаёт объём 0.85–0.90 от
  // базы — ВЫШЕ порога, — и его честная дыра объявлялась «сжатыми метками». Последствия ровно
  // обратны замыслу слайса: добор не вызывался, потеря не входила ни в lostPct, ни в
  // подтверждение владельца, а сводка писала «текст на месте». До 15% КАЖДОГО окна (≈2.3 мин из
  // 15) уходило молча — тот самый класс, ради которого писался S12.5.
  //
  // Дыра была в том, что «объём выше порога» сравнивался с НОРМОЙ, а не с КОНКУРИРУЮЩЕЙ
  // ГИПОТЕЗОЙ. Если бы разрыв был настоящей потерей, окно выдало бы примерно
  // (windowSec − gapSec)/windowSec ожидаемого объёма — это и есть гипотеза потери. Вердикт
  // «метки сжаты» имеет право выноситься, только когда факт объясняется ею ЗАМЕТНО ХУЖЕ, чем
  // «речь на месте»: живой дефект владельца — 1.02 против гипотезы 0.645, разрыв в 0.375;
  // выдуманный выше «потерял 139с» — 0.85 против гипотезы 0.850, разрыв 0.000.
  //
  // gapSec — длина ИМЕННО ЭТОГО разрыва в транскрипте (to − from), и никаких «на всякий случай
  // возьмём скачок побольше»: гипотеза потери тем ЛЕГЧЕ опровергается объёмом, чем БОЛЬШЕ
  // предполагаемая потеря (потеряв 330с из 930, окно физически не выдаст полный объём; потеряв
  // 100с — выдаст 0.89 и будет неотличимо от честного). Завысив gapSec, мы ослабили бы проверку,
  // а не усилили. По той же причине разрыв, частично закрытый добором, судится по ОСТАТКУ: он и
  // есть то, что ещё может быть потеряно.
  function classifyGap(gap, density) {
    var d = density || {};
    var stats = Array.isArray(d.windows) ? d.windows : [];
    var from = gap && gap.fromSec, to = gap && gap.toSec;
    var out = { verdict: "lost", windowIdx: null, densityRatio: null, requiredRatio: null };
    if (typeof from !== "number" || typeof to !== "number" || !isFinite(from) || !isFinite(to)) return out;
    if (!d.usable) return out;
    var host = null;
    for (var i = 0; i < stats.length; i++) {
      var s = stats[i];
      if (s.startSec === null || s.endSec === null) continue;
      if (from < s.startSec || to > s.endSec) continue;              // не лежит целиком в этом окне
      if (host === null || (s.densityRatio || 0) < (host.densityRatio || 0)) host = s;
    }
    if (!host) return out;
    var lossHypothesis = host.windowSec > 0 ? Math.max(0, host.windowSec - (to - from)) / host.windowSec : 1;
    var required = Math.max(DENSITY_TEXT_PRESENT_RATIO, lossHypothesis + DENSITY_GAP_VOLUME_MARGIN);
    out.windowIdx = host.windowIdx;
    out.densityRatio = host.densityRatio === null ? null : Math.round(host.densityRatio * 100) / 100;
    out.requiredRatio = Math.round(required * 100) / 100;
    if (host.densityRatio !== null && host.densityRatio >= required) out.verdict = "marks-unreliable";
    return out;
  }

  // ОБЁРТКА над findCoverageGaps (её контракт не тронут — она остаётся отдельно экспортированным
  // «сырым» детектором разрывов и точкой сравнения в юнитах: тест, который считает разрывы тем же
  // кодом, что и продукт, ничего не доказывает): те же разрывы, разложенные на ДВА РАЗНЫХ ФАКТА.
  //   gaps                — честный список РЕАЛЬНЫХ потерь (идут в добор и в потерю сводки);
  //   unreliableMarkRanges— диапазоны, где текст на месте, а тайминг недостоверен (в добор НЕ
  //                         идут — платить не за что, терять нечего; в потерю НЕ идут — это не
  //                         потеря; но пользователю показываются отдельно: караоке там уедет).
  // Списки не пересекаются по построению: у каждого разрыва ровно один вердикт.
  function classifyCoverageGaps(segments, durationSec, perWindowSegments, windows) {
    var all = findCoverageGaps(segments, durationSec);
    var density = runSpeechDensity(perWindowSegments, windows);
    var gaps = [], unreliable = [];
    for (var i = 0; i < all.length; i++) {
      var v = classifyGap(all[i], density);
      if (v.verdict === "marks-unreliable") {
        unreliable.push({ fromSec: all[i].fromSec, toSec: all[i].toSec,
                          // requiredRatio — планка, которую объём окна обязан был взять, чтобы
                          // вердикт вынесся (R9: следующая живая приёмка судит по числам, а не
                          // по нашему слову, ПОЧЕМУ этот диапазон признан ненадёжным).
                          windowIdx: v.windowIdx, densityRatio: v.densityRatio,
                          requiredRatio: v.requiredRatio });
      } else gaps.push(all[i]);
    }
    return { gaps: gaps, unreliableMarkRanges: unreliable, density: density };
  }

  // ── S12.5 T4: ЧЕСТНАЯ СВОДКА ПРОГОНА (R11) ───────────────────────────────────────────────────
  // Живой брак владельца 2026-07-29: прогон, потерявший 47% таймлайна, отчитался
  // `coverageGaps: []` и выглядел УСПЕХОМ — единственным, что видел владелец, был текст в превью.
  // Сводка отвечает на вопрос «сколько записи РЕАЛЬНО попало в транскрипт» ДО того, как владелец
  // нажмёт «→ В поле ввода», и считает его НЕ по тексту модели (подделываем), а по нашим
  // структурным записям прогона: окна, дыры покрытия, забракованные анти-реплей гейтом диапазоны.
  //
  // ПОТЕРЯ = ОБЪЕДИНЕНИЕ, А НЕ СУММА. coverageGaps и rejectedRanges ПЕРЕСЕКАЮТСЯ по построению:
  // забракованное окно не отдаёт сегментов, поэтому его диапазон немедленно всплывает ЕЩЁ И в
  // coverageGaps. Наивная сумма длительностей насчитала бы двойную потерю (одно окно из восьми →
  // «потеряно 25%» вместо 12.5%) — число, которому владелец перестанет верить в первый же раз,
  // когда пересчитает сам, а недоверие к сводке возвращает нас ровно в исходный дефект. Поэтому
  // интервалы сначала СЛИВАЮТСЯ, и только потом суммируются.
  var SUMMARY_WARN_PCT = 5; // потеря сверх этого — «bad» (владелец подтверждает явно, см. useText)

  // Нормализация одного диапазона к {fromSec,toSec} + клип по длительности. Невалидный/пустой/
  // обратный интервал → null (в сумму не идёт): «не доказательство потери» ≠ «потеря нулевой
  // длины», а тихо прибавлять к потере мусор нельзя (R11 в обе стороны).
  function normRange(from, to, durationSec) {
    // Строгая проверка ТИПА, не Number(): Number(null)===0 и Number("")===0 превратили бы
    // «поля нет» в честный ноль и породили дыру 0–toSec из ничего.
    if (typeof from !== "number" || typeof to !== "number") return null;
    var a = from, b = to;
    if (!isFinite(a) || !isFinite(b)) return null;
    if (a < 0) a = 0;
    if (b < 0) b = 0;
    if (durationSec > 0) { if (a > durationSec) a = durationSec; if (b > durationSec) b = durationSec; }
    return b > a ? { fromSec: a, toSec: b } : null;
  }

  // Слияние пересекающихся И стыкующихся встык интервалов (стык — тоже одна дыра: показывать
  // владельцу «41:36–44:29, 44:29–47:10» вместо «41:36–47:10» значит врать о числе дыр).
  function mergeRanges(ranges) {
    var list = (ranges || []).slice().sort(function (x, y) { return x.fromSec - y.fromSec; });
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var last = out.length ? out[out.length - 1] : null;
      if (last && list[i].fromSec <= last.toSec) {
        if (list[i].toSec > last.toSec) last.toSec = list[i].toSec;
      } else out.push({ fromSec: list[i].fromSec, toSec: list[i].toSec });
    }
    return out;
  }

  // Вход — ровно то, что оркестратор уже кладёт в паспорт (runWindowedAsr → audioMetaForImport.asr).
  // Выход — то, что рисует превью импорта (studio-import.js renderAsrSummary) и что уходит в
  // паспорт полем asr.summary.
  //
  // windowsOk — окна, отдавшие материал НА ВЕСЬ свой диапазон: без брака анти-реплей гейта
  // (rejectedReplay) и без честно пропущенной половины бисекции (skippedRanges). Ретрай и сама
  // бисекция окно «не-ok» НЕ делают: они закончились результатом, потери таймлайна там нет.
  //
  // S12.6: «ТЕКСТ ОТСУТСТВУЕТ» И «ТАЙМИНГ НЕНАДЁЖЕН» — ДВА РАЗНЫХ ФАКТА, А НЕ ОДИН ПРОЦЕНТ.
  // До S12.6 разрыв меток внутри окна, выдавшего полный текст, схлопывался в тот же «потеряно N%»,
  // и владелец подтверждал несуществующую потерю (живая приёмка 2026-07-29, см. classifyGap).
  // Теперь unreliableMarkRanges НЕ входят в lostSec/lostPct и сами по себе не делают уровень
  // «bad» (подтверждение не требуется — терять нечего), но и молчать о них нельзя: караоке в этих
  // диапазонах уезжает относительно звука. Поэтому они дают «warn» и ОТДЕЛЬНУЮ формулировку в UI.
  //
  // level (R11 — «ok» обязан означать «претензий нет ВООБЩЕ»):
  //   ok   — нулевая потеря, ни одного забракованного диапазона, ни одного ненадёжного диапазона,
  //          все окна целы и конвейер не поднял ни ASR_COVERAGE_GAP, ни ASR_WINDOW_REPLAY.
  //          Расхождение между нашим счётом интервалов и предупреждениями конвейера само по себе
  //          снимает «ok»: два независимых источника не сошлись — это не повод рисовать зелёное.
  //   warn  — потеря есть, но ≤ SUMMARY_WARN_PCT (либо пострадала целостность окон/предупреждения,
  //          либо тайминг части записи недостоверен — текст при этом на месте).
  //   bad   — потеря > SUMMARY_WARN_PCT ЛИБО есть забракованные диапазоны (реплей-подделка —
  //          всегда «bad» независимо от длительности: это класс дефекта, а не объём).
  function summarizeAsrRun(run) {
    var r = run || {};
    var dur = Math.max(0, Number(r.durationSec) || 0);
    var wins = Array.isArray(r.windows) ? r.windows : [];
    var gapsIn = Array.isArray(r.coverageGaps) ? r.coverageGaps : [];
    var rejIn = Array.isArray(r.rejectedRanges) ? r.rejectedRanges : [];
    var warnings = Array.isArray(r.warnings) ? r.warnings : [];
    var healed = Array.isArray(r.healedGaps) ? r.healedGaps.length : 0;
    var unrelIn = Array.isArray(r.unreliableMarkRanges) ? r.unreliableMarkRanges : [];
    // S12.7 — ТРЕТИЙ факт, не сливаемый ни с потерей, ни с «ненадёжным таймингом». Разница с
    // S12.6 не косметическая: там метки ОТСУТСТВУЮТ на куске и караоке «может уезжать», здесь
    // часы чанка сжаты, переспрос и дробление не помогли, и караоке на этих минутах ВЫКЛЮЧЕНО
    // (buildRowTiming помечает записи blind). Одна строка на два факта вернула бы ровно ту
    // неразличимость, которую чинил S12.6.
    var clockIn = Array.isArray(r.clockCompressedRanges) ? r.clockCompressedRanges : [];

    var ranges = [], nr, i;
    for (i = 0; i < gapsIn.length; i++) {
      nr = normRange(gapsIn[i] && gapsIn[i].fromSec, gapsIn[i] && gapsIn[i].toSec, dur);
      if (nr) ranges.push(nr);
    }
    for (i = 0; i < rejIn.length; i++) { // у забракованных диапазонов свои имена полей (startSec/endSec)
      nr = normRange(rejIn[i] && rejIn[i].startSec, rejIn[i] && rejIn[i].endSec, dur);
      if (nr) ranges.push(nr);
    }
    var gaps = mergeRanges(ranges);
    var lostSec = 0;
    for (i = 0; i < gaps.length; i++) lostSec += gaps[i].toSec - gaps[i].fromSec;
    if (dur > 0 && lostSec > dur) lostSec = dur;
    var coveredSec = dur > 0 ? Math.max(0, dur - lostSec) : 0;
    // Округление ДО расчёта level: показанный процент и цвет блока обязаны согласовываться —
    // «потеряно 5%» рядом с красным «bad» владелец прочитает как ещё один сбой доверия.
    var lostPct = dur > 0 ? Math.round((lostSec / dur) * 1000) / 10 : (lostSec > 0 ? 100 : 0);

    // Ненадёжный тайминг считается ОТДЕЛЬНОЙ суммой и НЕ трогает lostSec: то же слияние
    // интервалов (два соседних окна со сжатыми метками показать как один диапазон честнее, чем
    // как два), тот же клип по длительности, но своя строка в сводке.
    var unrelRanges = [];
    for (i = 0; i < unrelIn.length; i++) {
      nr = normRange(unrelIn[i] && unrelIn[i].fromSec, unrelIn[i] && unrelIn[i].toSec, dur);
      if (nr) unrelRanges.push(nr);
    }
    unrelRanges = mergeRanges(unrelRanges);
    var unreliableSec = 0;
    for (i = 0; i < unrelRanges.length; i++) unreliableSec += unrelRanges[i].toSec - unrelRanges[i].fromSec;

    var clockRanges = [];
    for (i = 0; i < clockIn.length; i++) {
      nr = normRange(clockIn[i] && clockIn[i].fromSec, clockIn[i] && clockIn[i].toSec, dur);
      if (nr) clockRanges.push(nr);
    }
    clockRanges = mergeRanges(clockRanges);
    var clockCompressedSec = 0;
    for (i = 0; i < clockRanges.length; i++) clockCompressedSec += clockRanges[i].toSec - clockRanges[i].fromSec;

    var windowsOk = 0;
    for (i = 0; i < wins.length; i++) {
      var w = wins[i] || {};
      var skipped = Array.isArray(w.skippedRanges) && w.skippedRanges.length > 0;
      if (w.rejectedReplay == null && !skipped) windowsOk++;
    }
    var rejected = rejIn.length;
    var flagged = warnings.indexOf("ASR_COVERAGE_GAP") >= 0 || warnings.indexOf("ASR_WINDOW_REPLAY") >= 0;
    var level;
    if (rejected > 0 || lostPct > SUMMARY_WARN_PCT) level = "bad";
    else if (lostSec > 0 || unrelRanges.length || clockRanges.length || windowsOk < wins.length || flagged) level = "warn";
    else level = "ok";

    return { windowsTotal: wins.length, windowsOk: windowsOk,
             coveredSec: coveredSec, lostSec: lostSec, lostPct: lostPct,
             gaps: gaps, healed: healed, rejected: rejected,
             // S12.6: «тайминг ненадёжен» — свой счётчик и свой список, НЕ часть потери.
             unreliable: unrelRanges.length, unreliableRanges: unrelRanges, unreliableSec: unreliableSec,
             // S12.7: чанки, чьи часы не удалось вылечить — караоке на них выключено.
             clockCompressed: clockRanges.length, clockCompressedRanges: clockRanges,
             clockCompressedSec: clockCompressedSec,
             level: level };
  }

  // R16: ЕДИНСТВЕННОЕ место цен длинного прогона (вместе с ASR-константами выше).
  // Замер: строка таблицы ≈205–219 out-ток (берём 220); ASR-выход с thinking ≈8 ток/с;
  // кусок таблицы 147–224 с (берём 140 с консервативно на 120 сегм); окно ASR 21–139 с (берём 45).
  var TABLE_OUT_TOKENS_PER_ROW = 220;
  var TABLE_IN_TOKENS_PER_SEG = 40;
  var USD_PER_MTOK_TEXT_IN = 0.30;
  var ASR_OUT_TOKENS_PER_SEC_TOTAL = 8; // candidates+thinking, замер 75-мин прогона
  var TABLE_SEC_PER_CHUNK = 140;
  var ASR_SEC_PER_WINDOW = 45;
  var SEGS_PER_MIN_ASR = 6; // подкаст-монолог 4.8–8/мин

  function estimateLongJob(durationSec, opts) {
    if (!opts || !Number.isInteger(opts.chunkSize) || opts.chunkSize <= 0) {
      throw new Error("estimateLongJob: chunkSize обязателен (TableChunks.CHUNK_SIZE)");
    }
    var d = Math.max(0, Number(durationSec) || 0);
    var inRate = ASR_TOKENS_PER_SEC + ((opts.video) ? VIDEO_FRAME_TOKENS_PER_SEC_LOW : 0);
    var windows = asrWindows(d).length;
    // S12.4 fix1 (I3, R16): окна перекрываются, поэтому шовная зона отправляется в модель ДВАЖДЫ —
    // вход оплачивается за d + OVERLAP*(окон-1), а не за d (2ч → +210с ≈ +3% аудио-входа).
    // Выход считается по d: шовный дубль снимается stitch и в транскрипт не попадает.
    var billedInSec = d + ASR_WINDOW_OVERLAP_SEC * Math.max(0, windows - 1);
    var asrUsd = (billedInSec * inRate / 1e6) * USD_PER_MTOK_AUDIO_IN +
                 (d * ASR_OUT_TOKENS_PER_SEC_TOTAL / 1e6) * USD_PER_MTOK_OUT;
    var segs = Number.isInteger(opts.segmentsKnown) ? opts.segmentsKnown
             : Math.ceil((d / 60) * SEGS_PER_MIN_ASR);
    var expRows = Math.ceil(segs * 1.05); // модель может дробить сегмент на строки
    var chunks = Math.max(1, Math.ceil(segs / opts.chunkSize));
    var tableUsd = (expRows * TABLE_OUT_TOKENS_PER_ROW / 1e6) * USD_PER_MTOK_OUT +
                   (segs * TABLE_IN_TOKENS_PER_SEG / 1e6) * USD_PER_MTOK_TEXT_IN;
    var minutes = Math.ceil((windows * ASR_SEC_PER_WINDOW + chunks * TABLE_SEC_PER_CHUNK) / 60) + 1;
    return { asrUsd: asrUsd, tableUsd: tableUsd, totalUsd: asrUsd + tableUsd,
             minutes: minutes, expRows: expRows, chunks: chunks, windows: windows };
  }

  function secondsFromTimestamp(s) {
    if (typeof s !== "string") return null;
    var m = /^(\d+):([0-5]?\d)(?:\.(\d+))?$/.exec(s.trim());
    if (m) return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number("0." + m[3]) : 0);
    var h = /^(\d+):([0-5]?\d):([0-5]?\d)(?:\.(\d+))?$/.exec(s.trim());
    if (h) return Number(h[1]) * 3600 + Number(h[2]) * 60 + Number(h[3]) + (h[4] ? Number("0." + h[4]) : 0);
    return null;
  }

  // Ответ модели → нормализованный объект. Фенсы срезаем тем же приёмом, что ingest/routes.js.
  function parseAsrResponse(raw) {
    var cleaned = String(raw == null ? "" : raw)
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    var parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (_) { var e = new Error("ASR returned non-JSON"); e.code = "ASR_BAD_JSON"; throw e; }
    var segs = Array.isArray(parsed.segments) ? parsed.segments : [];
    var out = [];
    for (var k = 0; k < segs.length; k++) {
      var text = String((segs[k] && segs[k].text) || "").trim();
      if (!text) continue; // пустой сегмент бесполезен и для текста, и для тайминга
      out.push({ start: secondsFromTimestamp(segs[k].start), text: text });
    }
    return {
      language: parsed.language || null,
      segments: out,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter(function (w) { return typeof w === "string"; }) : [],
    };
  }

  // R11: тексты сохраняются ВСЕГДА; тайминг — только честный. Невалидный/немонотонный start → null.
  // timingOk = валидных ≥2 И ≥80% сегментов. Поздний первый сегмент (>60с) — warning, не провал
  // (легитимно: музыкальное интро).
  function validateSegments(segments, durationSec) {
    var input = Array.isArray(segments) ? segments : [];
    var dur = Math.max(0, Number(durationSec) || 0);
    var out = [], warnings = [], lastT = -Infinity, valid = 0;
    for (var k = 0; k < input.length; k++) {
      var text = String((input[k] && input[k].text) || "").trim();
      var t = input[k] && typeof input[k].start === "number" && isFinite(input[k].start) ? input[k].start : null;
      if (t !== null) {
        if (t < 0) t = 0;
        if (dur > 0 && t > dur + 2) t = null;        // за пределами аудио — фейк
        else if (t < lastT) t = null;                // немонотонность — фейк
      }
      if (t !== null) { lastT = t; valid++; }
      out.push({ i: k, start: t, text: text });
    }
    var firstValid = null;
    for (var j = 0; j < out.length; j++) { if (out[j].start !== null) { firstValid = out[j].start; break; } }
    if (firstValid !== null && firstValid > 60) warnings.push("LATE_FIRST_SEGMENT");
    var timingOk = valid >= 2 && (input.length === 0 ? false : valid / input.length >= 0.8);
    return {
      segments: out,
      timingOk: timingOk,
      dropReason: timingOk ? null : "ASR_TIMING_INVALID",
      warnings: warnings,
    };
  }

  // ── ОСМЫСЛЕННОСТЬ МАППИНГА строка→сегмент (фикс 2026-07-30, R11) ─────────────────────────────
  // Живой брак владельца (117-мин интервью, STUDIO_KARAOKE_ROW_TIMING_MISMAP_2026_07_30):
  // караоке уверенно подсвечивало не ту строку, медиана ошибки 9 мин. Причина — не арифметика
  // тайминга, а ДОВЕРИЕ К ЧУЖОМУ ПОЛЮ С ТЕМ ЖЕ ИМЕНЕМ: премиум-ответ /api/translate-table-v2
  // (db/premium/pipeline.js) тоже несёт `segment_index`, но это ПОРЯДКОВЫЙ НОМЕР предложения
  // собственного сегментатора премиум-конвейера (1-based, своё пространство имён), а не индекс
  // ASR-сегмента. Прежний гейт проверял ЛИШЬ «есть целые числа» — и вырожденный 1:1 проезжал.
  //
  // Проверяем то, что маппинг ОБЯЗАН выполнять по построению seg-режима
  // (ingest/segTable.js HE_RU_SEG_PROMPT: «1 входной сегмент → ≥1 строк, порядок сохранён»):
  //   • каждый индекс — целое в [0, segCount);
  //   • индексы неубывающие;
  //   • строки одного сегмента идут ПОДРЯД (индекс, к которому вернулись через строки без
  //     индекса, — разорванный блок: чанк не может распилить сегмент, границы чанков проходят
  //     ТОЛЬКО по сегментам, см. TableChunks.buildChunks);
  //   • строк больше, чем сегментов ⇒ хотя бы один сегмент раздроблен ⇒ ПЕРФЕКТНЫЙ 1:1
  //     (уникальных индексов ровно столько же, сколько индексированных строк) невозможен.
  // Осознанный остаток: если индексы несёт единственный чанк, который модель не дробила, а
  // раздробленные строки пришли из чанков с потерянным маппингом, 1:1-правило отклонит честный,
  // но покрывающий проценты таблицы маппинг. Цена ошибки несимметрична (R11): подсветка не той
  // строки хуже её отсутствия, а караоке по <10% строк всё равно выглядит зависшим.
  // Диагноз возвращается строкой reason (R9-провенанс), решение принимает вызывающий.
  function validateRowSegMapping(rowSegIdx, segCount) {
    var rows = Array.isArray(rowSegIdx) ? rowSegIdx : [];
    var total = rows.length;
    var S = Number.isInteger(segCount) ? segCount : 0;
    var res = function (ok, reason, indexed, unique) {
      return { ok: ok, reason: reason, rows: total, segCount: S,
               indexed: indexed || 0, unique: unique || 0 };
    };
    if (S <= 0) return res(false, "NO_SEGMENTS", 0, 0);
    var indexed = 0, unique = 0, last = -1, gapSinceLast = false;
    for (var r = 0; r < total; r++) {
      var si = rows[r];
      if (si === null || si === undefined) { gapSinceLast = true; continue; }
      if (!Number.isInteger(si)) return res(false, "NOT_INTEGER", indexed, unique);
      if (si < 0 || si >= S) return res(false, "OUT_OF_RANGE", indexed, unique);
      if (si < last) return res(false, "DECREASING", indexed, unique);
      if (si === last && gapSinceLast) return res(false, "SPLIT_SEGMENT", indexed, unique);
      if (si !== last) unique++;
      last = si; gapSinceLast = false; indexed++;
    }
    if (!indexed) return res(false, "NO_INDEX", indexed, unique);
    if (total > S && unique === indexed) return res(false, "DEGENERATE_1_TO_1", indexed, unique);
    return res(true, null, indexed, unique);
  }

  // ── ТОТ ЖЕ ВЕРДИКТ ДЛЯ УЖЕ СОХРАНЁННОГО ТАЙМИНГА (ревью фикса, 2026-07-30) ──────────────────
  // validateRowSegMapping защищает только НОВЫЕ ответы. Карточки, сохранённые ДО фикса, несут
  // вырожденный тайминг прямо в table_model_meta_json — включая ту, на которой владелец увидел
  // брак; пересборка таблицы стоит денег (ASR уже оплачен, но перевод — нет), а подсветка не той
  // строки хуже её отсутствия (R11). Поэтому паспорт судим и при ОТКРЫТИИ текста.
  //
  // Отпечаток берём ТОЧНЫЙ, а не пороговый: entries не хранят индекс сегмента, но хранят его
  // start (t) — по нему сегмент восстанавливается однозначно. Вырождение = «строка = свой
  // сегмент»: у КАЖДОЙ записи o равен индексу её собственного сегмента, при том что строк
  // больше, чем сегментов (значит, минимум один сегмент раздроблен и такое равенство
  // невозможно). Живой паспорт владельца: 1651 строка, 1074 сегмента, o = 0…1072 (пропуски
  // 259/260/800 — они отпечаток НЕ ломают, судим только по фактически имеющимся записям).
  // Честная 1:N-таблица проваливает это условие с первого же раздробленного сегмента, честная
  // 1:1 (строк == сегментов) — на rowCount > segCount, поэтому ложных срабатываний нет.
  //
  // K3-уточнение (замер ЖИВОЙ карточки владельца 2026-07-30 через kapture): равенство o === segIdx
  // — не тот отпечаток, который там лежит. У ВСЕХ 1070 записей o === segIdx − 1: премиум-строки
  // несли 1-BASED `segment_index` (о чём K1 и написал выше), поэтому «первой строкой» сегмента k
  // оказывалась строка k−1, а сегмент 0 не получал записи вовсе. Прежняя формулировка выходила
  // с false на ПЕРВОЙ же записи — карточка, ради которой карантин писался, под него НЕ ПОПАДАЛА.
  // Поэтому судим ЛОКСТЕП: разность o − segIdx одинакова у всех сопоставленных записей И равна 0
  // или −1 (два наблюдаемых способа принять номер строки за номер сегмента: 0-based и 1-based).
  // Честная 1:N-таблица такой константы не даёт — на каждом раздробленном сегменте разность растёт.
  function timingLooksDegenerate(timing, segments, rowCount) {
    var e = timing && Array.isArray(timing.entries) ? timing.entries : null;
    var segs = Array.isArray(segments) ? segments : [];
    if (!e || e.length < 2 || !segs.length) return false;
    if (!Number.isInteger(rowCount) || rowCount <= segs.length) return false; // дробления не было
    var byStart = new Map();
    for (var k = 0; k < segs.length; k++) {
      var st = segs[k] && segs[k].start;
      var idx = segs[k] && segs[k].i != null ? segs[k].i : k;
      if (typeof st === "number" && isFinite(st) && !byStart.has(st)) byStart.set(st, idx);
    }
    var judged = 0, off = null;
    for (var j = 0; j < e.length; j++) {
      var segIdx = byStart.get(e[j] && e[j].t);
      if (segIdx === undefined) continue;            // запись не сопоставляется — не судим по ней
      var d = e[j].o - segIdx;
      if (d !== 0 && d !== -1) return false;          // хоть одна честная запись → маппинг не вырожден
      if (off === null) off = d;
      else if (d !== off) return false;               // сдвиг «плавает» — это не локстеп
      judged++;
    }
    return judged >= 2;
  }

  // ── ПРЕМИУМ-ВЕТКА: rows[].source_line_index → индексы ASR-сегментов (K2, 2026-07-30) ─────────
  // K1 честно отключил караоке на /api/translate-table-v2, потому что доверять там было нечему.
  // Теперь премиум-конвейер публикует ЧЕСТНЫЙ мост: `source_line_index` — 0-базовый номер
  // ИСХОДНОЙ СТРОКИ, из которой получена строка таблицы (db/premium/segmenter.js line_index).
  // А для импортированного медиа одна исходная строка = один ASR-сегмент (studio-import.js
  // useText кладёт превью как «одна строка = один сегмент»), поэтому line_index И ЕСТЬ индекс
  // сегмента — при условии, что текст с момента импорта не переразбивали (это проверяет
  // вызывающий: v3MediaLineIdentity сверяет число строк с числом сегментов).
  //
  // Но «поле называется правильно» — ровно та ошибка, из которой вырос весь баг. Поэтому здесь
  // маппинг не принимается на слово, а ПРОВЕРЯЕТСЯ ПО ТЕКСТУ (независимый оракул): каждая
  // строка ответа обязана быть подстрокой ТОЙ СТРОКИ, на которую ссылается. По построению
  // сегментатора это так всегда (предложение — непрерывный кусок своей строки), а вот при любом
  // расхождении — разъехавшаяся нормализация, коллизия doc-кэша по ключу, будущая правка
  // сегментатора — проверка падает и караоке честно выключается (R11), вместо подсветки не той
  // строки. Стоимость: один indexOf на строку таблицы.
  //
  // lines — строки ТЕКУЩЕГО текста по правилу клиента (split("\n")+trim+filter(Boolean)).
  // Возвращает { idx: [индекс сегмента | null на строку], reason } — reason только при отказе.
  var CMP_BIDI_RE = /[\u200E\u200F\u202A-\u202E\uFEFF]/g;  // тот же список, что BIDI_RE сегментатора
  function cmpNorm(s) {
    // NFKC — потому что сервер сегментирует normalizeForDisplay(text) (db/premium/normalize.js),
    // а `lines` берутся из сырого поля ввода: без NFKC «…» и « » разошлись бы на ровном месте.
    return String(s == null ? "" : s).normalize("NFKC").replace(CMP_BIDI_RE, "").trim();
  }
  function premiumRowLineIdx(rows, lines) {
    var R = Array.isArray(rows) ? rows : [];
    var L = Array.isArray(lines) ? lines : [];
    if (!L.length) return { idx: [], reason: "NO_LINES" };
    var idx = [], any = false, normCache = [];
    for (var r = 0; r < R.length; r++) {
      var li = R[r] && R[r].source_line_index;
      if (!Number.isInteger(li)) { idx.push(null); continue; }  // старый кэш/чужой ответ — не гадаем
      if (li < 0 || li >= L.length) return { idx: [], reason: "LINE_OUT_OF_RANGE" };
      if (normCache[li] === undefined) normCache[li] = cmpNorm(L[li]);
      var he = cmpNorm(R[r].he);
      if (he && normCache[li].indexOf(he) === -1) return { idx: [], reason: "LINE_TEXT_MISMATCH" };
      idx.push(li); any = true;
    }
    if (!any) return { idx: [], reason: "NO_INDEX" };
    return { idx: idx, reason: null };
  }

  // ── K3: ОФЛАЙН-ВЫРАВНИВАНИЕ СОХРАНЁННОЙ ТАБЛИЦЫ НА СЕГМЕНТЫ (2026-07-30) ─────────────────────
  // K1 честно погасил вырожденное караоке, K2 вернул его премиум-ветке — но оба работают ТОЛЬКО
  // в сессии импорта. У уже сохранённой карточки: строки восстанавливаются из Библиотеки вообще
  // без запроса (v3RestoreSavedTableIfUnchanged), а v3MediaLineIdentity читает
  // window.v3LastImportMeta, который при открытии текста из Библиотеки обнуляется (R9 — смена
  // сущности). Для 117-минутной карточки владельца это означало бы повторный импорт = повторную
  // оплату ASR за уже оплаченный транскрипт.
  //
  // В карточке уже лежит ВСЁ, что нужно: сегменты с метками (паспорт .segments) и строки таблицы
  // (sentences). Нет только связи «строка → сегмент»: `segment_index` строки НЕ хранится нигде —
  // такого поля в схеме sentences нет, meta_json пуст. Поэтому связь ВОССТАНАВЛИВАЕТСЯ ПО ТЕКСТУ:
  // детерминированно, офлайн, без единого сетевого запроса и без трат.
  //
  // ПРАВИЛО (никаких «примерно совпало»):
  //   • обе стороны нормализуются ОДНИМ И ТЕМ ЖЕ правилом — NFKC, затем stitchNormalizeWords
  //     (слова любого письма, огласовки/теамим сняты ВНУТРИ слова, регистр вниз; BIDI-марки и
  //     пунктуация словами не являются и отпадают сами). Второго нормализатора не заводим
  //     намеренно: два правила «что такое слово» однажды разъедутся, и гейты начнут спорить
  //     друг с другом (тот же довод, что у шва S12.4 и анти-реплей гейта S12.5);
  //   • строки идут в порядке order_index, сегменты — в порядке i; указатель (номер сегмента si,
  //     номер слова wi ВНУТРИ него) двигается ТОЛЬКО ВПЕРЁД;
  //   • очередная строка обязана совпасть со словами текущего сегмента, начиная РОВНО с wi.
  //     Сравнение ПОСЛОВНОЕ, а не indexOf по склеенной строке: indexOf нашёл бы «שלום» внутри
  //     «שלומי» и разрешил бы перепрыгнуть непокрытый кусок сегмента — то есть ровно ту тихую
  //     неточность, ради которой всё это и делается;
  //   • не совпала — текущий сегмент закрывается, пробуем следующий с wi=0. Сегмент, не получивший
  //     ни одной строки, просто не даёт записи тайминга (буквально: этой речи в таблице нет);
  //     соврать он не может, потому что каждая строка привязана к сегменту, который она покрывает;
  //   • строка без слов (только пунктуация, «[…]») индекса НЕ получает: доказать её принадлежность
  //     нечем. ЕДИНСТВЕННОЕ исключение — строка, зажатая МЕЖДУ двумя строками ОДНОГО сегмента: её
  //     принадлежность доказана порядком (строки одного сегмента идут подряд), и без этого
  //     дозаполнения гейт непрерывности (validateRowSegMapping → SPLIT_SEGMENT) отверг бы честное
  //     выравнивание из-за одной строки со скобками. Осознанный остаток: строка без слов на СТЫКЕ
  //     сегментов индекса не получает, и если из-за неё у каждого сегмента остаётся ровно по
  //     одной индексированной строке при строках > сегментов, гейт K1 назовёт маппинг вырожденным
  //     (DEGENERATE_1_TO_1). Это отказ, а не ложное караоке, и ослаблять ради него правило K1 мы
  //     не станем.
  //
  // ОРАКУЛ (до возврата ok:true, независим от бухгалтерии указателя — пересчёт из СЫРЫХ входов):
  //   (а) тот же validateRowSegMapping, что судит ответы seg-режима и премиума (диапазон,
  //       неубывание, непрерывность блока строк сегмента, невозможность 1:1 при строках>сегментов);
  //   (б) КАЖДЫЙ сегмент, получивший строки, покрыт ими ЦЕЛИКОМ: конкатенация нормализованных слов
  //       ЕГО строк === нормализованные слова самого сегмента. Одно сравнение ловит сразу два
  //       класса брака — «строка попала не в свой сегмент» и «часть сегмента осталась непокрытой»
  //       (а значит, и любой сдвиг границы, который указатель мог бы допустить).
  // Любой сбой → ok:false с причиной; караоке остаётся выключенным (R11: лучше отказ, чем догадка).
  //
  // Возврат: { ok, rowSegIdx, reason, alignedSegments, alignedRows }. rowSegIdx отдаётся ТОЛЬКО
  // при ok (частичный маппинг никому не нужен — на нём построили бы кривой тайминг);
  // alignedSegments/alignedRows при отказе показывают, докуда дошли (диагностика, R9).
  var ALIGN_VERSION = "align-rows-v1";

  function alignWords(text) {
    // NFKC — потому что премиум-строки получены из normalizeForDisplay(text) (db/premium/
    // normalize.js), а сегменты паспорта хранят СЫРОЙ текст ASR: без NFKC презентационные формы
    // и «…»/«..» разошлись бы на ровном месте. Дальше — общий словесный нормализатор файла.
    return stitchNormalizeWords(String(text == null ? "" : text).normalize("NFKC"));
  }

  // Индекс сегмента в пространстве имён, которым оперируют buildRowTiming/validateRowSegMapping:
  // поле i (его проставляет validateSegments), иначе — позиция в массиве.
  function alignSegIndex(segments, k) {
    var v = segments[k] && segments[k].i;
    return Number.isInteger(v) ? v : k;
  }

  function alignRowsToSegments(rowTexts, segments) {
    var R = Array.isArray(rowTexts) ? rowTexts : [];
    var S = Array.isArray(segments) ? segments : [];
    var res = function (ok, reason, rowSegIdx, segs, rows) {
      return { ok: ok, reason: reason, rowSegIdx: ok ? rowSegIdx : [],
               alignedSegments: segs || 0, alignedRows: rows || 0 };
    };
    if (!R.length || !S.length) return res(false, "EMPTY_INPUT", [], 0, 0);

    var segW = [], k;
    for (k = 0; k < S.length; k++) segW.push(alignWords(S[k] && S[k].text));

    var idx = new Array(R.length).fill(null);
    var si = 0, wi = 0, placed = 0;
    for (var r = 0; r < R.length; r++) {
      var w = alignWords(R[r]);
      if (!w.length) continue;                       // строка без слов — см. дозаполнение ниже
      var fromSi = si, fromWi = wi, hit = false;
      while (si < S.length) {
        var seg = segW[si];
        if (wi + w.length <= seg.length) {
          var same = true;
          for (var j = 0; j < w.length; j++) { if (seg[wi + j] !== w[j]) { same = false; break; } }
          if (same) { idx[r] = alignSegIndex(S, si); wi += w.length; placed++; hit = true; break; }
        }
        si++; wi = 0;                                // остаток сегмента этой строкой не начинается
      }
      if (!hit) {
        // Осталось ли ВООБЩЕ непокрытое слово там, куда мы смотрели? Нет — строка лишняя (хвост
        // таблицы за пределами транскрипта); да — она не принадлежит своему месту.
        var left = fromSi < S.length ? segW[fromSi].length - fromWi : 0;
        for (k = fromSi + 1; k < S.length; k++) left += segW[k].length;
        return res(false, left > 0 ? "ROW_NOT_IN_SEGMENT" : "TRAILING_ROWS", [], 0, placed);
      }
    }

    // Дозаполнение строк без слов, зажатых между строками ОДНОГО сегмента (доказано порядком —
    // единственное место, где индекс проставляется не по текстовому совпадению).
    var a = 0;
    while (a < idx.length) {
      if (idx[a] !== null) { a++; continue; }
      var b = a;
      while (b < idx.length && idx[b] === null) b++;
      if (a > 0 && b < idx.length && idx[a - 1] !== null && idx[a - 1] === idx[b]) {
        for (var m = a; m < b; m++) idx[m] = idx[b];
      }
      a = b;
    }

    // ── ОРАКУЛ ───────────────────────────────────────────────────────────────────────────────
    var check = validateRowSegMapping(idx, S.length);
    if (!check.ok) return res(false, check.reason || "MAPPING_INVALID", [], 0, placed);

    var pos = new Map();                             // индекс сегмента → его позиция в массиве
    for (k = 0; k < S.length; k++) {
      var key = alignSegIndex(S, k);
      if (pos.has(key)) return res(false, "SEGMENT_INDEX_DUP", [], 0, placed); // два сегмента с одним i
      pos.set(key, k);
    }
    var acc = new Map(), assigned = 0;               // позиция сегмента → слова ЕГО строк
    for (var q = 0; q < idx.length; q++) {
      if (idx[q] === null) continue;
      assigned++;
      var p = pos.get(idx[q]);
      if (p === undefined) return res(false, "UNKNOWN_SEGMENT", [], 0, placed);
      var bucket = acc.get(p);
      if (!bucket) { bucket = []; acc.set(p, bucket); }
      var rw = alignWords(R[q]);                     // пересчёт из СЫРОГО входа, а не из кэша прохода
      for (var z = 0; z < rw.length; z++) bucket.push(rw[z]);
    }
    var covered = 0, bad = null;
    acc.forEach(function (words, p2) {
      if (bad) return;
      var seg2 = alignWords(S[p2] && S[p2].text);    // тоже заново из сырого текста сегмента
      if (words.length !== seg2.length) { bad = "SEGMENT_UNCOVERED"; return; }
      for (var z2 = 0; z2 < seg2.length; z2++) {
        if (words[z2] !== seg2[z2]) { bad = "SEGMENT_UNCOVERED"; return; }
      }
      covered++;
    });
    if (bad) return res(false, bad, [], 0, placed);
    return res(true, null, idx, covered, assigned);
  }

  // segments (после validateSegments) + segment_index каждой строки таблицы → [{o,t}]:
  // o = ПЕРВАЯ строка сегмента, t = его start. <2 записей → null (караоке честно выключено).
  // ⚠ Вызывать ТОЛЬКО после validateRowSegMapping().ok — сама функция осмысленность НЕ проверяет.
  //
  // S12.7 blindRanges = [{fromSec,toSec}] (classifyClockCompression): чанки, чьи часы остались
  // сжатыми после починки. Их записи не выбрасываются (тогда караоке молча держало бы последнюю
  // честную строку весь чанк — «уверенно показывает не ту строку» другим способом), а помечаются
  // `blind:true`: StudioMediaKaraoke на них не подсвечивает НИЧЕГО и отказывает в повторе строки.
  // Честными считаются только записи ВНЕ диапазонов — если их меньше двух, караоке нет вовсе.
  function buildRowTiming(segments, rowSegIdx, blindRanges) {
    var firstRow = new Map();
    var rows = Array.isArray(rowSegIdx) ? rowSegIdx : [];
    for (var r = 0; r < rows.length; r++) {
      var si = rows[r];
      if (Number.isInteger(si) && !firstRow.has(si)) firstRow.set(si, r);
    }
    var blind = [];
    var rawBlind = Array.isArray(blindRanges) ? blindRanges : [];
    for (var b = 0; b < rawBlind.length; b++) {
      var f = rawBlind[b] && rawBlind[b].fromSec, tt = rawBlind[b] && rawBlind[b].toSec;
      if (typeof f === "number" && isFinite(f) && typeof tt === "number" && isFinite(tt) && tt > f) {
        blind.push({ fromSec: f, toSec: tt });
      }
    }
    function isBlind(t) {
      for (var i = 0; i < blind.length; i++) { if (t >= blind[i].fromSec && t <= blind[i].toSec) return true; }
      return false;
    }
    var entries = [], lastT = -Infinity, honest = 0;
    var segs = Array.isArray(segments) ? segments : [];
    for (var k = 0; k < segs.length; k++) {
      var st = segs[k] && segs[k].start;
      if (typeof st !== "number" || !isFinite(st)) continue;
      var row = firstRow.get(segs[k].i != null ? segs[k].i : k);
      if (row == null) continue;
      if (st < lastT) continue; // страховка (validateSegments уже отфильтровал)
      var e = { o: row, t: st };
      if (isBlind(st)) e.blind = true; else honest++;
      entries.push(e);
      lastT = st;
    }
    if (honest < 2) return null;
    var out = { v: 1, unit: "row", entries: entries };
    if (blind.length) out.blindRanges = blind; // R9: почему часть записей слепа
    return out;
  }

  var API = {
    ASR_MODEL: ASR_MODEL, ASR_PROMPT: ASR_PROMPT,
    secondsFromTimestamp: secondsFromTimestamp, parseAsrResponse: parseAsrResponse,
    validateSegments: validateSegments, buildRowTiming: buildRowTiming,
    validateRowSegMapping: validateRowSegMapping, timingLooksDegenerate: timingLooksDegenerate,
    premiumRowLineIdx: premiumRowLineIdx,
    // K3: офлайн-оживление караоке у уже сохранённой карточки (ни одного запроса, ни цента).
    alignRowsToSegments: alignRowsToSegments, ALIGN_VERSION: ALIGN_VERSION,
    estimateAsrCostUsd: estimateAsrCostUsd,
    VIDEO_FRAME_TOKENS_PER_SEC_LOW: VIDEO_FRAME_TOKENS_PER_SEC_LOW,
    ASR_WINDOW_SEC: ASR_WINDOW_SEC, ASR_GAP_MAX_SEC: ASR_GAP_MAX_SEC, ASR_TAIL_GAP_SEC: ASR_TAIL_GAP_SEC,
    ASR_WINDOW_OVERLAP_SEC: ASR_WINDOW_OVERLAP_SEC, ASR_STITCH_CLIP_TOL_SEC: ASR_STITCH_CLIP_TOL_SEC,
    STITCH_TAIL_WORDS: STITCH_TAIL_WORDS, STITCH_ANCHOR_MIN_WORDS: STITCH_ANCHOR_MIN_WORDS,
    STITCH_ZONE_TOL_SEC: STITCH_ZONE_TOL_SEC, STITCH_SEAM_TOL_SEC: STITCH_SEAM_TOL_SEC,
    STITCH_COVER_TOL_SEC: STITCH_COVER_TOL_SEC,
    REPLAY_SHINGLE_K: REPLAY_SHINGLE_K, REPLAY_REJECT_RATIO: REPLAY_REJECT_RATIO,
    REPLAY_MIN_SHINGLES: REPLAY_MIN_SHINGLES,
    replayRatio: replayRatio, collectShingles: collectShingles,
    // Одно правило «что такое слово» на весь проект: им считает объём runSpeechDensity, им же
    // обязана считать починка S12.7, иначе её порог «текста не стало меньше» мерил бы другое.
    stitchNormalizeWords: stitchNormalizeWords,
    replaySeamSkipWords: replaySeamSkipWords, // шовное исключение (whole-branch ревью S12.5)
    asrWindows: asrWindows, asrSeams: asrSeams, ASR_RANGE_PROMPT: ASR_RANGE_PROMPT,
    mergeWindowSegments: mergeWindowSegments, stitchWindowSegments: stitchWindowSegments,
    findCoverageGaps: findCoverageGaps,
    // S12.6: плотность речи окна как независимый (от меток) сигнал + вердикт по каждому разрыву.
    runSpeechDensity: runSpeechDensity, classifyGap: classifyGap,
    classifyCoverageGaps: classifyCoverageGaps,
    DENSITY_TEXT_PRESENT_RATIO: DENSITY_TEXT_PRESENT_RATIO,
    DENSITY_GAP_VOLUME_MARGIN: DENSITY_GAP_VOLUME_MARGIN,
    DENSITY_MIN_BASELINE_WPS: DENSITY_MIN_BASELINE_WPS,
    DENSITY_BASELINE_MIN_WINDOW_SEC: DENSITY_BASELINE_MIN_WINDOW_SEC,
    // S12.7: сжатые часы чанка — размах меток против объёма текста (разрыв для этого не нужен).
    classifyClockCompression: classifyClockCompression,
    CLOCK_SPAN_MARGIN: CLOCK_SPAN_MARGIN, CLOCK_MIN_SEGMENTS: CLOCK_MIN_SEGMENTS,
    CLOCK_MIN_WINDOW_SEC: CLOCK_MIN_WINDOW_SEC,
    // S12.5 T4: сводка прогона + её форматтер времени (UI обязан печатать те же мм:сс/ч:мм:сс,
    // что парсит secondsFromTimestamp — второй формат времени в проекте не заводим).
    summarizeAsrRun: summarizeAsrRun, fmtClock: fmtClock, SUMMARY_WARN_PCT: SUMMARY_WARN_PCT,
    estimateLongJob: estimateLongJob,
  };
  if (typeof window !== "undefined") window.AsrTranscript = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
