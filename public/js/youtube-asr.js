// P5 · Транскрипт учебного материала прямо из ссылки YouTube (Gemini, BYOK, браузер→провайдер).
// Ни байта медиа и ни одного вызова через наш сервер: ссылка уходит как file_data.file_uri, ролик
// достаёт сам провайдер. Канон: docs/planning/YOUTUBE_GEMINI_URL_P5_IMPLEMENTATION_PACKET_2026_09_11.md,
// замеры: docs/research/youtube-gemini-url-asr/2026-09-11/.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.YoutubeAsr = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const AT = () => (typeof require === 'function' ? require('./asr-transcript.js') : globalThis.AsrTranscript);
  const PS = () => (typeof require === 'function' ? require('./playback-source.js') : globalThis.PlaybackSource);
  const YT = () => (typeof require === 'function' ? require('./youtube-timing.js') : globalThis.YoutubeTiming);

  // Кадры для расшифровки речи не нужны, но совсем отключить их API не даёт. Замер 2026-09-11:
  // fps 0.2 стоит 72 073 токена против 160 681 на том же ролике, метки при этом остаются честными
  // (медиана ошибки 0 с). fps 0.1 дешевле ещё на 7 %, но на качестве меток НЕ мерен — не берём.
  const FPS = 0.2;
  // Аудио-модальность тарифицируется ровно 32 ток/с (49 919 токенов у ролика 1560 с). Это даёт
  // длительность из бесплатного countTokens — не надо ни скачивать ролик, ни верить модели.
  const AUDIO_TOKENS_PER_SEC = 32;
  // Единственный измеренный чистый одновызовный прогон — 1560 с (полное покрытие, метки честные).
  // Дальше не экстраполируем: длиннее режем окнами файлового пути, чей шов и гейты уже доказаны.
  const SINGLE_CALL_MAX_SEC = 1560;

  function canonicalize(url) {
    const id = PS().parseVideoId(url);
    return id ? { video_id: id, url: PS().canonicalUrl(id) } : null;
  }

  function durationFromTokens(details) {
    const audio = (details || []).find((d) => d && d.modality === 'AUDIO');
    const tokens = audio && Number(audio.tokenCount);
    return Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens / AUDIO_TOKENS_PER_SEC) : null;
  }

  function planWindows(durationSec) {
    const d = Math.max(0, Number(durationSec) || 0);
    return d > SINGLE_CALL_MAX_SEC ? AT().asrWindows(d) : [];
  }

  function buildRequest(url, win) {
    const meta = { fps: FPS };
    if (win) {
      meta.start_offset = Math.round(win.startSec) + 's';
      meta.end_offset = Math.round(win.endSec) + 's';
    }
    return {
      contents: [{ role: 'user', parts: [
        // ДИАПАЗОН РЕЖЕТ ВХОД, А НЕ ПРОМТ. S12.5 убил range-промт как класс: модель, которой
        // «просили» диапазон, подделывала метки внутри него. Здесь окно вырезает сам провайдер
        // (замер: окно 120 с = 10 921 видео-токен против 141 962 на полном ролике), поэтому
        // промт остаётся каноническим, а метки приходят абсолютными by construction.
        { file_data: { file_uri: String(url) }, video_metadata: meta },
        { text: AT().ASR_PROMPT },
      ] }],
      generationConfig: { temperature: 0 },
    };
  }

  function classifyFailure(status) {
    const code = Number(status);
    if (code === 400) return 'YT_URL_REJECTED';   // API не сообщает причину: приватное, битый id, чужой хост
    // 429 на ПЛАТНОМ аккаунте — это лимит частоты (RPM/TPM на модель), а не исчерпанный
    // бесплатный tier: владелец на постоплате, и «квота кончилась» было бы неверным диагнозом.
    if (code === 403 || code === 429) return 'YT_QUOTA';
    if (code === 503) return 'YT_OVERLOADED';
    return 'YT_FAILED';
  }

  const RETRYABLE = ['YT_OVERLOADED', 'YT_QUOTA'];
  function retryable(code) { return RETRYABLE.includes(String(code)); }

  const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
  // Стандартный прайс, сверенный 2026-09-09 (см. youtube-gemini-pilot.cjs): выход включает thinking.
  // Смета, а не выписка по счёту. Пересматривать вместе с моделью.
  const USD_PER_MTOK_IN = 0.75, USD_PER_MTOK_OUT = 3.75;
  const OUT_TOKENS_PER_SEC = 7.5;   // замер: 11 754 выходных токена на 1560 с речи
  const RETRY_DELAYS_MS = [4000, 12000, 30000];

  function fail(code, status, detail, raw) {
    const e = new Error(code); e.code = code;
    if (status) e.status = status;
    if (detail) e.provider_detail = detail;
    if (raw) e.raw_response = raw;
    throw e;
  }

  function providerDetail(data) {
    const cand = ((data && data.candidates) || [])[0] || {};
    const feedback = data && data.promptFeedback || {};
    return {
      block_reason: feedback.blockReason || null,
      finish_reason: cand.finishReason || null,
      finish_message: cand.finishMessage ? String(cand.finishMessage).slice(0, 1000) : null,
      safety_ratings: cand.safetyRatings || feedback.safetyRatings || null,
      provider_status: data && data.error && data.error.status || null,
    };
  }

  async function post(deps, method, body, modelOverride) {
    const model = modelOverride || AT().ASR_MODEL;
    const resp = await deps.fetch(ENDPOINT + model + ':' + method, {
      method: 'POST',
      headers: { 'x-goog-api-key': String(deps.apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) {
      let data = {};
      try { data = JSON.parse(text || '{}'); } catch (_) {}
      fail(classifyFailure(resp.status), resp.status, providerDetail(data));
    }
    return JSON.parse(text || '{}');
  }

  async function estimate(deps, url) {
    const target = canonicalize(url);
    if (!target) fail('YT_URL_REJECTED');
    const probe = buildRequest(target.url, null);
    const data = await post(deps, 'countTokens', { contents: probe.contents });
    const durationSec = durationFromTokens(data.promptTokensDetails);
    const wins = planWindows(durationSec);
    const inputTokens = Number(data.totalTokens) || 0;
    // Окна перекрываются, поэтому платного входа больше, чем у одного прохода ровно на перекрытие.
    const spanSec = wins.reduce((sum, w) => sum + (w.endSec - w.startSec), 0);
    const billedTokens = wins.length && durationSec ? Math.round(inputTokens * (spanSec / durationSec)) : inputTokens;
    const timingQuote = verificationQuote({video_id:target.video_id,url:target.url,durationSec,inputTokens});
    return {
      video_id: target.video_id, url: target.url, durationSec,
      windows: wins.length || 1, inputTokens, billedTokens,
      timingQuote,
      estimatedUsd: billedTokens * USD_PER_MTOK_IN / 1e6 +
        (durationSec || 0) * OUT_TOKENS_PER_SEC * USD_PER_MTOK_OUT / 1e6 + timingQuote.estimatedUsd,
    };
  }

  function verificationQuote(source){
    const windows=YT().windows(source.durationSec),seconds=windows.reduce((n,w)=>n+w.endSec-w.startSec,0);
    const tokens=source.durationSec?source.inputTokens*seconds/source.durationSec:0;
    return {schema:'youtube-timing-quote-v1',video_id:source.video_id,url:source.url,
      durationSec:source.durationSec,windows,maxCalls:windows.length,
      estimatedUsd:(tokens*USD_PER_MTOK_IN+seconds*OUT_TOKENS_PER_SEC*USD_PER_MTOK_OUT)/1e6};
  }

  async function verifySavedTiming(deps,source,timeline,quote,onProgress,onEvidence){
    const target=canonicalize(source.url),plan=YT().windows(source.durationSec);
    if(!target||!quote||quote.schema!=='youtube-timing-quote-v1'||quote.video_id!==target.video_id||
       quote.durationSec!==source.durationSec||quote.maxCalls!==plan.length||JSON.stringify(quote.windows)!==JSON.stringify(plan))fail('TIMING_QUOTE_REQUIRED');
    const evidence={schema:'youtube-asr-timing-evidence-v2',source:{...target,durationSec:source.durationSec},
      timeline:timeline.map(s=>({...s})),raw_timeline:deps.rawTimelineEvidence||null,probes:[]};
    if(deps.savedTimingEvidence){
      const old=deps.savedTimingEvidence;
      if(JSON.stringify(old.source)!==JSON.stringify(evidence.source)||JSON.stringify(old.timeline)!==JSON.stringify(evidence.timeline))fail('TIMING_EVIDENCE_MISMATCH');
      evidence.probes=JSON.parse(JSON.stringify(old.probes||[]));
      evidence.raw_timeline=old.raw_timeline||null;
    }
    if(onEvidence)await onEvidence(evidence);
    // Each quoted probe has one attempt. A failed/unknown-charge call is retained and never
    // retried automatically. The caller durably records each completed response.
    for(let i=0;i<plan.length;i++){
      if(deps.shouldStop&&await deps.shouldStop())break;
      const window=plan[i];if(onProgress)onProgress('verifying',{index:i,total:plan.length});
      if(evidence.probes.some(p=>p.window.startSec===window.startSec&&p.window.endSec===window.endSec))continue;
      const rec={window,segments:[],state:'pending-charge-unknown'};
      evidence.probes.push(rec);if(onEvidence)await onEvidence(evidence);
      const attemptState={attempts:0};
      try{const result=await callWindow({...deps,noRetry:true},target.url,window,attemptState,onProgress);
        rec.segments=result.segments.map(s=>({startSec:s.start,text:s.text}));rec.raw=result.raw;rec.state='complete';
      }catch(e){rec.error=String(e.code||e.message).slice(0,80);rec.state='failed-charge-unknown';if(attemptState.responses)rec.responses=attemptState.responses;}
      if(onEvidence)await onEvidence(evidence);
      if(rec.error)break;
    }
    return {evidence,diagnosis:YT().diagnose(evidence)};
  }

  // HTTP 200 ещё не значит «есть транскрипт» (живой прогон владельца 2026-09-11 встал на
  // ASR_BAD_JSON). Ответ бывает пустым, обрезанным по бюджету вывода или заблокированным — это
  // РАЗНЫЕ беды с разным лечением, и валить их в «плохой JSON» значит скрыть от пользователя
  // причину и лишить прогон восстановления.
  const SPLIT_MIN_SEC = 120;   // делить короче нечего: половина уже меньше одной реплики-другой
  function classifyResponse(data) {
    const cand = ((data && data.candidates) || [])[0];
    if (!cand) {
      const reason = data && data.promptFeedback && data.promptFeedback.blockReason;
      return reason === 'OTHER' ? 'ASR_OTHER' : reason ? 'ASR_BLOCKED' : 'ASR_EMPTY';
    }
    const parts = ((cand.content || {}).parts) || [];
    const text = parts.map((p) => p.text || '').join('').trim();
    if (cand.finishReason && cand.finishReason !== 'STOP') {
      if (cand.finishReason === 'MAX_TOKENS') return 'ASR_TRUNCATED';
      if (cand.finishReason === 'OTHER') return 'ASR_OTHER';
      return 'ASR_BLOCKED';
    }
    if (!text) return 'ASR_EMPTY';
    return null;
  }

  // ── Единая смета (обещание «одна кнопка») ──
  // Стоимость таблицы зависит от числа реплик, а его до распознавания никто не знает. Общая
  // константа проекта (SEGS_PER_MIN_ASR = 6) откалибрована на монолог-подкаст; замер пилота
  // 2026-09-11 дал 11.5 реплик/мин на многоголосом интервью — точка вместо диапазона занизила бы
  // цену вдвое. Поэтому вилка по двум плотностям, а арифметика — ЕДИНСТВЕННАЯ, из estimateLongJob.
  const SEGS_PER_MIN_DENSE = 12;
  // Спрашивать повторно только когда счёт заметно перерос показанный потолок: мелкое превышение
  // внутри вилки — это и есть вилка, а не сюрприз.
  const QUOTE_OVERRUN_TOLERANCE = 1.5;

  function estimateTableRange(durationSec, chunkSize) {
    const d = Math.max(0, Number(durationSec) || 0);
    if (!d || !Number.isInteger(chunkSize) || chunkSize <= 0) return null;
    const low = AT().estimateLongJob(d, { chunkSize: chunkSize });
    const high = AT().estimateLongJob(d, { chunkSize: chunkSize,
      segmentsKnown: Math.ceil((d / 60) * SEGS_PER_MIN_DENSE) });
    return { lowUsd: low.tableUsd, highUsd: high.tableUsd,
      lowRows: low.expRows, highRows: high.expRows, chunks: high.chunks };
  }

  // Принимает либо доллары (Gemini-таблица), либо {usd, rows} — премиум-провайдер долларов не
  // считает вовсе, там согласуется ОБЪЁМ. Отсутствующая котировка всегда значит «не согласовано»:
  // молча тратить без показанной цены нельзя.
  function tableCostWithinQuote(actual, quote) {
    if (!quote) return false;
    const asked = (actual !== null && typeof actual === 'object') ? actual : { usd: actual };
    const within = (value, ceiling) => {
      if (value == null) return true;                       // об этом измерении не спрашивали
      if (!Number.isFinite(Number(ceiling))) return false;   // котировка о нём молчит — не ручаемся
      return Number(value) <= Number(ceiling) * QUOTE_OVERRUN_TOLERANCE;
    };
    if (asked.usd == null && asked.rows == null) return false;
    return within(asked.usd, quote.highUsd) && within(asked.rows, quote.highRows);
  }

  async function callWindow(deps, url, win, state, report, modelOverride) {
    for (let attempt = 0; ; attempt++) {
      if (deps.shouldStop && await deps.shouldStop()) fail('TASK_CANCELLED');
      state.attempts++;
      try {
        const data = await post(deps, 'generateContent', buildRequest(url, win), modelOverride);
        if(!state.responses)state.responses=[];state.responses.push({window:win,raw:data});
        const unusable = classifyResponse(data);
        if (unusable) fail(unusable, null, providerDetail(data), data);
        const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
        const parsed = AT().parseAsrResponse(parts.map((p) => p.text || '').join(''));
        return { segments: parsed.segments, warnings: parsed.warnings, language: parsed.language,
          usage: data.usageMetadata || null, raw:data, model: modelOverride || AT().ASR_MODEL };
      } catch (error) {
        // «Перегружен» — это продолжаемое состояние, а не провал прогона: измерено 5×503 и 1×429
        // за одну сессию. Отвергнутая ссылка не ретраится никогда — ответ не изменится.
        // Сдаёмся ПОСЛЕ того, как израсходованы все объявленные задержки: прежнее условие
        // обрывало цикл на шаг раньше, и самая длинная пауза — самая полезная при перегрузке —
        // не использовалась никогда (наблюдение 2026-09-11).
        if (error.code === 'TASK_CANCELLED') throw error;
        if (deps.noRetry || !retryable(error.code) || attempt >= RETRY_DELAYS_MS.length) throw error;
        // Пауза перед повтором — это состояние прогона, а не тишина: без неё пользователь видит
        // замерший экран и не знает, ждать ему или всё сломалось (наблюдение 2026-09-11).
        if (report) report('retrying', { code: error.code, attempt: attempt + 1,
          attempts: RETRY_DELAYS_MS.length + 1, waitMs: RETRY_DELAYS_MS[attempt] });
        await (deps.sleep || defaultSleep)(RETRY_DELAYS_MS[attempt]);
        // Просьбу остановиться слушаем СРАЗУ после ожидания и до следующего платного вызова:
        // иначе кнопка «Остановить» во время паузы выглядит неработающей, а деньги всё равно уходят.
        if (deps.shouldStop && await deps.shouldStop()) fail('TASK_CANCELLED');
      }
    }
  }

  function defaultSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // OTHER означает неизвестную причину завершения, не подтверждённую блокировку. Делим только
  // проблемный отрезок; настоящие SAFETY/PROHIBITED_CONTENT остаются терминальными.
  const SPLITTABLE = ['ASR_TRUNCATED', 'ASR_EMPTY', 'ASR_BAD_JSON', 'ASR_OTHER'];
  const OTHER_FALLBACK_MODEL = 'gemini-2.5-flash';

  async function transcribeRange(deps, url, win, state, durationSec, report, recovery, skipDirect) {
    const cached = recovery && recovery.get(win);
    if (cached) return cached;
    try {
      if (skipDirect || (recovery && (recovery.isSplit(win) || recovery.failedOther(win)))) fail('ASR_OTHER', null, { finish_reason: 'OTHER' });
      const result = await callWindow(deps, url, win, state, report);
      if (recovery) await recovery.save(win, result);
      return result;
    }
    catch (error) {
      const startSec = win ? win.startSec : 0;
      const endSec = win ? win.endSec : (durationSec || 0);
      if (!SPLITTABLE.includes(error.code) || (endSec - startSec) < SPLIT_MIN_SEC) {
        if (error.code === 'ASR_OTHER' && deps.allowAlternateModel && recovery && !recovery.alternateAttempted(win)) {
          // Durable pending receipt precedes the paid call: an interrupted/unknown-charge call
          // is never retried automatically. The explicit model is cheaper on output than Flash latest.
          await recovery.markAlternate(win);
          try {
            const alternate = await callWindow({ ...deps, noRetry: true }, url, win, state, report, OTHER_FALLBACK_MODEL);
            alternate.warnings = (alternate.warnings || []).concat('ALTERNATE_ASR_MODEL_USED');
            await recovery.save(win, alternate);
            await recovery.recordAlternate(win, 'complete');
            return alternate;
          } catch (alternateError) {
            await recovery.recordAlternate(win, 'failed-charge-unknown');
            if (alternateError.code !== 'ASR_BLOCKED') {
              alternateError.alternate_error_code = alternateError.code;
              alternateError.code = 'ASR_OTHER_EXHAUSTED';
            }
            alternateError.failed_window = win;
            throw alternateError;
          }
        }
        if (error.code === 'ASR_OTHER') error.code = 'ASR_OTHER_EXHAUSTED';
        if (!error.failed_window) error.failed_window = win;
        throw error;
      }
      const mid = Math.round((startSec + endSec) / 2);
      state.recovered = 'split';
      if (recovery && recovery.markSplit) await recovery.markSplit(win);
      if (report) report('splitting', { fromSec: startSec, toSec: endSec });
      const a = await transcribeRange(deps, url, { startSec: startSec, endSec: mid }, state, durationSec, report, recovery);
      const b = await transcribeRange(deps, url,
        { startSec: Math.max(startSec, mid - AT().ASR_WINDOW_OVERLAP_SEC), endSec: endSec }, state, durationSec, report, recovery);
      return {
        segments: AT().stitchWindowSegments([a.segments, b.segments], [mid]).segments,
        warnings: (a.warnings || []).concat(b.warnings || []),
        language: a.language || b.language,
        usage: a.usage,
      };
    }
  }

  // ── Независимая проверка часов (R17: кто генерирует метки, тот их не сертифицирует) ──
  // Существующий gate по окнам (classifyClockCompression) СОЗНАТЕЛЬНО молчит, когда окно одно:
  // база из самого подсудимого дала бы отношение 1.0 по построению. У URL-пути есть то, чего у
  // файлового не было: короткое окно вырезается провайдером даром для нас (без скачивания), то
  // есть вторая выборка ФИЗИЧЕСКИ независима от первой. Зонд повторяет метод, которым маршрут
  // квалифицирован 2026-09-11: текст независимо вырезанного окна обязан лежать в таймлайне на
  // своём абсолютном времени.
  const PROBE_SEC = 90, ANCHOR_WORDS = 4;
  const ANCHOR_MAX_ERROR_SEC = 5;      // замер: медиана 0 с, худший якорь −6 с на честном прогоне
  const ANCHORS_TO_CERTIFY = 3, ANCHORS_TO_DISPROVE = 2;

  function anchorKey(words) { return words.slice(0, ANCHOR_WORDS).join(' '); }

  function matchAnchors(timeline, probeSegments) {
    const norm = AT().stitchNormalizeWords;
    const rows = (timeline || []).map((s) => ({ startSec: s.startSec, words: norm(s.text) }));
    const errors = [];
    let checked = 0;
    for (const seg of probeSegments || []) {
      const words = norm(seg && seg.text);
      if (words.length < ANCHOR_WORDS || typeof seg.startSec !== 'number') continue;
      checked++;
      const need = anchorKey(words);
      for (const row of rows) {
        let hit = false;
        for (let i = 0; i + ANCHOR_WORDS <= row.words.length; i++) {
          if (row.words.slice(i, i + ANCHOR_WORDS).join(' ') === need) { hit = true; break; }
        }
        if (hit && typeof row.startSec === 'number') { errors.push(row.startSec - seg.startSec); break; }
      }
    }
    errors.sort((a, b) => a - b);
    return { checked, matched: errors.length,
      medianErrorSec: errors.length ? Math.round(errors[Math.floor(errors.length / 2)] * 10) / 10 : null };
  }

  // Асимметрия намеренная: опровергнуть часы можно меньшим числом якорей, чем заверить их. Ошибка
  // сдвигает подсветку у пользователя, поэтому сомнение отзывает тайминг, а сертификация требует
  // большего (R11 do-no-harm).
  function judgeTiming(m) {
    const matched = (m && m.matched) || 0, err = m && m.medianErrorSec;
    if (matched >= ANCHORS_TO_DISPROVE && typeof err === 'number' && Math.abs(err) > ANCHOR_MAX_ERROR_SEC) return 'suspect';
    if (matched >= ANCHORS_TO_CERTIFY) return 'verified';
    return 'inconclusive';
  }

  // Транскрипт по ссылке входит В ТУ ЖЕ ДВЕРЬ, что и субтитры YouTube: «текст с метками, привязанный
  // к ролику, без локального файла» — уже отгруженный и проверенный случай. Второго пути тайминга в
  // проекте не заводим (R12), провенанс при этом называет настоящего автора текста (R9).
  function buildImportMeta(result, model) {
    const r = result || {};
    const at = new Date().toISOString();
    return {
      kind: 'captions', method: 'gemini-url-asr', model: model || null, at,
      warnings: (r.warnings || []).slice(),
      textSnapshot: (r.segments || []).map((s) => s.text).join('\n'),
      captions: {
        v: 1,
        captions: { origin: 'gemini-url-asr', format: 'asr', language: r.language || 'he', at,
                    asr: { provider: 'gemini-url', model: model || null, windows: r.windows || 1 },
                    timing: r.timing || null,
                    timing_evidence: r.timing_evidence || null },
        video: { platform: 'youtube', videoId: r.video_id, url: r.url },
        media: { durationSec: r.durationSec == null ? null : r.durationSec },
        segments: (r.segments || []).map((s, i) => ({ i, start: s.startSec, text: s.text,
          ...(Object.prototype.hasOwnProperty.call(s,'endSec')?{end:s.endSec}:{} ) })),
        timing: null,
        // Отозванные часы названы по имени, а не спрятаны за молчаливым null.
        timingDropReason: r.blind ? 'ASR_CLOCK_UNVERIFIED' : null,
      },
    };
  }

  function probeWindow(durationSec) {
    const d = Number(durationSec) || 0;
    if (d <= PROBE_SEC) return null;
    const start = Math.max(0, Math.round(d / 2 - PROBE_SEC / 2));
    return { startSec: start, endSec: Math.min(d, start + PROBE_SEC) };
  }

  async function transcribe(deps, url, onPhase, opts) {
    if(opts&&opts.savedTimingEvidence){
      const old=opts.savedTimingEvidence,target=canonicalize(url);
      if(!target||old.source.video_id!==target.video_id)fail('TIMING_EVIDENCE_MISMATCH');
      const checked=await verifySavedTiming({...deps,savedTimingEvidence:old},old.source,old.timeline,opts.timingQuote,onPhase,opts.onTimingEvidence);
      return verifiedResult(old.source,old.timeline,checked,0,1,[],[]);
    }
    const est = await estimate(deps, url);
    if(opts?.timingQuote&&(opts.timingQuote.video_id!==est.video_id||opts.timingQuote.durationSec!==est.durationSec))fail('TIMING_QUOTE_REQUIRED');
    const wins = planWindows(est.durationSec);
    const state = { attempts: 0 };
    // Payload передаётся КАК ЕСТЬ: прежняя сигнатура заворачивала любой объект в поле index,
    // и структурные отчёты (повтор, дробление) приходили слушателю пустыми.
    const total = wins.length || 1;
    const report = (phase, at) => { if (onPhase) onPhase(phase, at || {}); };
    const checkpointPlan = wins.length ? wins : [null];
    const checkpointSource = { video_id: est.video_id, url: est.url, durationSec: est.durationSec };
    let checkpoint = opts && opts.savedAsrCheckpoint;
    const checkpointMatches = checkpoint && checkpoint.schema === 'youtube-asr-checkpoint-v1'
      && JSON.stringify(checkpoint.source) === JSON.stringify(checkpointSource)
      && JSON.stringify(checkpoint.windows) === JSON.stringify(checkpointPlan);
    checkpoint = checkpointMatches ? JSON.parse(JSON.stringify(checkpoint)) : {
      schema: 'youtube-asr-checkpoint-v1', source: checkpointSource,
      windows: checkpointPlan, completed: [], partial_completed: [], split_ranges: [], alternate_attempts: [], failure: null,
    };
    if (!Array.isArray(checkpoint.partial_completed)) checkpoint.partial_completed = [];
    if (!Array.isArray(checkpoint.split_ranges)) checkpoint.split_ranges = [];
    if (!Array.isArray(checkpoint.alternate_attempts)) checkpoint.alternate_attempts = [];
    const saveCheckpoint = async () => {
      if (opts && opts.onAsrCheckpoint) await opts.onAsrCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
    };
    const runWindow = async (win, index) => {
      const saved = checkpoint.completed.find((entry) => entry.index === index);
      if (saved) {
        if (saved.result.raw) {
          if (!state.responses) state.responses = [];
          state.responses.push({ window: win, raw: saved.result.raw });
        }
        return saved.result;
      }
      try {
        const windowKey = (part) => JSON.stringify(part);
        const recovery = {
          get: (part) => {
            const entry = checkpoint.partial_completed.find((item) => item.index === index && windowKey(item.window) === windowKey(part));
            return entry && entry.result;
          },
          save: async (part, result) => {
            checkpoint.partial_completed.push({ index, window: part, result: {
              segments: result.segments, warnings: result.warnings || [], language: result.language || null,
              usage: result.usage || null, raw: result.raw || null,
            }});
            await saveCheckpoint();
          },
          isSplit: (part) => checkpoint.split_ranges.some((item) => item.index === index && windowKey(item.window) === windowKey(part)),
          failedOther: (part) => checkpoint.failure && checkpoint.failure.index === index
            && checkpoint.failure.code === 'ASR_OTHER_EXHAUSTED'
            && windowKey(checkpoint.failure.failed_window) === windowKey(part),
          alternateAttempted: (part) => checkpoint.alternate_attempts.some((item) => item.index === index && windowKey(item.window) === windowKey(part)),
          markAlternate: async (part) => {
            checkpoint.alternate_attempts.push({ index, window: part, model: OTHER_FALLBACK_MODEL, state: 'pending-charge-unknown' });
            await saveCheckpoint();
          },
          recordAlternate: async (part, state) => {
            const entry = checkpoint.alternate_attempts.find((item) => item.index === index && windowKey(item.window) === windowKey(part));
            if (entry) { entry.state = state; await saveCheckpoint(); }
          },
          markSplit: async (part) => {
            if (recovery.isSplit(part)) return;
            checkpoint.split_ranges.push({ index, window: part });
            await saveCheckpoint();
          },
        };
        const prior = checkpoint.failure;
        const skipDirect = prior && prior.index === index
          && (prior.code === 'ASR_OTHER' || prior.code === 'ASR_OTHER_EXHAUSTED' || (prior.code === 'ASR_BLOCKED'
            && prior.provider_detail
            && (prior.provider_detail.finish_reason === 'OTHER' || prior.provider_detail.block_reason === 'OTHER')
            && !['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(prior.provider_detail.finish_reason)
            && !['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(prior.provider_detail.block_reason)));
        const result = await transcribeRange(deps, est.url, win, state, est.durationSec, report, recovery, skipDirect);
        checkpoint.completed.push({ index, window: win, result: {
          segments: result.segments, warnings: result.warnings || [],
          language: result.language || null, usage: result.usage || null, raw: result.raw || null,
        }});
        checkpoint.partial_completed = checkpoint.partial_completed.filter((entry) => entry.index !== index);
        checkpoint.split_ranges = checkpoint.split_ranges.filter((entry) => entry.index !== index);
        checkpoint.failure = null;
        await saveCheckpoint();
        return result;
      } catch (error) {
        checkpoint.failure = { index, window: win, code: String(error.code || error.message).slice(0, 80),
          status: error.status || null, provider_detail: error.provider_detail || null,
          alternate_error_code: error.alternate_error_code || null,
          failed_window: error.failed_window || null, raw_response: error.raw_response || null,
          recorded_at: new Date().toISOString() };
        await saveCheckpoint();
        throw error;
      }
    };
    let segments, warnings = [], usage = [];
    if (!wins.length) {
      report('transcribing', { index: 0, total });
      const one = await runWindow(null, 0);
      segments = one.segments;
      warnings = one.warnings;
      usage = [one.usage];
    } else {
      const perWindow = [];
      for (let i = 0; i < wins.length; i++) {
        report('transcribing', { index: i, total });
        const part = await runWindow(wins[i], i);
        perWindow.push(part.segments);
        warnings = warnings.concat(part.warnings || []);
        usage.push(part.usage);
      }
      // Шов режется по ТЕКСТУ, не по меткам — то же правило, что у файлового пути (S12.4).
      segments = AT().stitchWindowSegments(perWindow, AT().asrSeams(wins)).segments;
    }
    let rows = segments.map((s) => ({ startSec: s.start, text: s.text }));
    let timing = { verdict: 'inconclusive', medianErrorSec: null, checked: 0, matched: 0 };
    if(opts&&opts.timingQuote){
      const checked=await verifySavedTiming({...deps,rawTimelineEvidence:state.responses},{...est},rows,opts.timingQuote,report,opts.onTimingEvidence);
      return verifiedResult(est,rows,checked,state.attempts,wins.length||1,usage,warnings);
    }
    const win = (!opts || opts.verifyTiming !== false) ? probeWindow(est.durationSec) : null;
    // Evidence is diagnostic only. It must never be consumed as playable timing.
    const timingEvidence = { schema: 'youtube-asr-timing-evidence-v1',
      source: { video_id: est.video_id, url: est.url, durationSec: est.durationSec },
      timeline: rows.map(r => ({ ...r })), probeWindow: win, probe: null };
    if (win) {
      report('verifying', { index: null, total });
      try {
        const probe = await callWindow(deps, est.url, win, state, report);
        timingEvidence.probe = probe.segments.map((s) => ({ startSec: s.start, text: s.text }));
        const measured = matchAnchors(rows, timingEvidence.probe);
        timing = Object.assign({ verdict: judgeTiming(measured) }, measured);
      } catch (error) {
        // Провал зонда — это НЕ приговор часам: транскрипт уже добыт и остаётся целым.
        timing.probeError = String(error.code || error.message).slice(0, 60);
      }
    }
    // Отозванные часы забирают ТОЛЬКО метки. Текст не виноват и остаётся полностью (R11).
    const blind = timing.verdict === 'suspect';
    if (blind) rows = rows.map((r) => ({ startSec: null, text: r.text }));
    return {
      video_id: est.video_id, url: est.url, durationSec: est.durationSec, timing, blind,
      timing_evidence: timingEvidence,
      segments: rows,
      text: segments.map((s) => s.text).join('\n'),
      attempts: state.attempts, windows: wins.length || 1, usage, recovered: state.recovered || null,
      warnings: Array.from(new Set(warnings)),
    };
  }

  function verifiedResult(source,rows,checked,attempts,windows,usage,warnings){
    const diagnosis=checked.diagnosis;
    return {video_id:source.video_id,url:source.url,durationSec:source.durationSec,
      timing:{verdict:diagnosis.status==='verified'?'verified':diagnosis.status==='partial'?'partial':'suspect',diagnosis},
      blind:diagnosis.status==='unavailable',segments:diagnosis.segments,text:rows.map(s=>s.text).join('\n'),
      timing_evidence:checked.evidence,attempts:attempts+checked.evidence.probes.length,
      windows,usage,warnings:Array.from(new Set(warnings))};
  }

  return {
    FPS, AUDIO_TOKENS_PER_SEC, SINGLE_CALL_MAX_SEC, RETRY_DELAYS_MS,
    PROBE_SEC, ANCHOR_MAX_ERROR_SEC,
    canonicalize, durationFromTokens, planWindows, buildRequest, classifyFailure, retryable,
    matchAnchors, judgeTiming, probeWindow, buildImportMeta, classifyResponse,
    estimateTableRange, tableCostWithinQuote, QUOTE_OVERRUN_TOLERANCE, estimate, transcribe,
    verificationQuote,verifySavedTiming,
  };
});
