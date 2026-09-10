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

  function fail(code, status) { const e = new Error(code); e.code = code; if (status) e.status = status; throw e; }

  async function post(deps, method, body) {
    const model = AT().ASR_MODEL;
    const resp = await deps.fetch(ENDPOINT + model + ':' + method, {
      method: 'POST',
      headers: { 'x-goog-api-key': String(deps.apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) fail(classifyFailure(resp.status), resp.status);
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
    return {
      video_id: target.video_id, url: target.url, durationSec,
      windows: wins.length || 1, inputTokens, billedTokens,
      estimatedUsd: billedTokens * USD_PER_MTOK_IN / 1e6 +
        (durationSec || 0) * OUT_TOKENS_PER_SEC * USD_PER_MTOK_OUT / 1e6,
    };
  }

  // HTTP 200 ещё не значит «есть транскрипт» (живой прогон владельца 2026-09-11 встал на
  // ASR_BAD_JSON). Ответ бывает пустым, обрезанным по бюджету вывода или заблокированным — это
  // РАЗНЫЕ беды с разным лечением, и валить их в «плохой JSON» значит скрыть от пользователя
  // причину и лишить прогон восстановления.
  const SPLIT_MIN_SEC = 120;   // делить короче нечего: половина уже меньше одной реплики-другой
  function classifyResponse(data) {
    const cand = ((data && data.candidates) || [])[0];
    if (!cand) return (data && data.promptFeedback && data.promptFeedback.blockReason) ? 'ASR_BLOCKED' : 'ASR_EMPTY';
    const parts = ((cand.content || {}).parts) || [];
    const text = parts.map((p) => p.text || '').join('').trim();
    if (cand.finishReason && cand.finishReason !== 'STOP') return cand.finishReason === 'MAX_TOKENS' ? 'ASR_TRUNCATED' : 'ASR_BLOCKED';
    if (!text) return 'ASR_EMPTY';
    return null;
  }

  async function callWindow(deps, url, win, state) {
    for (let attempt = 0; ; attempt++) {
      state.attempts++;
      try {
        const data = await post(deps, 'generateContent', buildRequest(url, win));
        const unusable = classifyResponse(data);
        if (unusable) fail(unusable);
        const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
        const parsed = AT().parseAsrResponse(parts.map((p) => p.text || '').join(''));
        return { segments: parsed.segments, warnings: parsed.warnings, language: parsed.language, usage: data.usageMetadata || null };
      } catch (error) {
        // «Перегружен» — это продолжаемое состояние, а не провал прогона: измерено 5×503 и 1×429
        // за одну сессию. Отвергнутая ссылка не ретраится никогда — ответ не изменится.
        if (!retryable(error.code) || attempt >= RETRY_DELAYS_MS.length - 1) throw error;
        await (deps.sleep || defaultSleep)(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  function defaultSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // Лечение непригодного ответа — тем же приёмом, что у файлового пути: делим ЗВУК пополам и
  // режем шов по ТЕКСТУ. Блокировку делением не вылечить, поэтому её не переспрашиваем.
  const SPLITTABLE = ['ASR_TRUNCATED', 'ASR_EMPTY', 'ASR_BAD_JSON'];

  async function transcribeRange(deps, url, win, state, durationSec, report) {
    try { return await callWindow(deps, url, win, state); }
    catch (error) {
      const startSec = win ? win.startSec : 0;
      const endSec = win ? win.endSec : (durationSec || 0);
      if (!SPLITTABLE.includes(error.code) || (endSec - startSec) < SPLIT_MIN_SEC) throw error;
      const mid = Math.round((startSec + endSec) / 2);
      state.recovered = 'split';
      if (report) report('splitting', { fromSec: startSec, toSec: endSec });
      const a = await transcribeRange(deps, url, { startSec: startSec, endSec: mid }, state, durationSec, report);
      const b = await transcribeRange(deps, url,
        { startSec: Math.max(startSec, mid - AT().ASR_WINDOW_OVERLAP_SEC), endSec: endSec }, state, durationSec, report);
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
                    timing: r.timing || null },
        video: { platform: 'youtube', videoId: r.video_id, url: r.url },
        media: { durationSec: r.durationSec == null ? null : r.durationSec },
        segments: (r.segments || []).map((s, i) => ({ i, start: s.startSec, text: s.text })),
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
    const est = await estimate(deps, url);
    const wins = planWindows(est.durationSec);
    const state = { attempts: 0 };
    const report = (phase, index) => { if (onPhase) onPhase(phase, { index, total: wins.length || 1 }); };
    let segments, warnings = [], usage = [];
    if (!wins.length) {
      report('transcribing', 0);
      const one = await transcribeRange(deps, est.url, null, state, est.durationSec, report);
      segments = one.segments;
      warnings = one.warnings;
      usage = [one.usage];
    } else {
      const perWindow = [];
      for (let i = 0; i < wins.length; i++) {
        report('transcribing', i);
        const part = await transcribeRange(deps, est.url, wins[i], state, est.durationSec, report);
        perWindow.push(part.segments);
        warnings = warnings.concat(part.warnings || []);
        usage.push(part.usage);
      }
      // Шов режется по ТЕКСТУ, не по меткам — то же правило, что у файлового пути (S12.4).
      segments = AT().stitchWindowSegments(perWindow, AT().asrSeams(wins)).segments;
    }
    let rows = segments.map((s) => ({ startSec: s.start, text: s.text }));
    let timing = { verdict: 'inconclusive', medianErrorSec: null, checked: 0, matched: 0 };
    const win = (!opts || opts.verifyTiming !== false) ? probeWindow(est.durationSec) : null;
    if (win) {
      report('verifying', null);
      try {
        const probe = await callWindow(deps, est.url, win, state);
        const measured = matchAnchors(rows, probe.segments.map((s) => ({ startSec: s.start, text: s.text })));
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
      segments: rows,
      text: segments.map((s) => s.text).join('\n'),
      attempts: state.attempts, windows: wins.length || 1, usage, recovered: state.recovered || null,
      warnings: Array.from(new Set(warnings)),
    };
  }

  return {
    FPS, AUDIO_TOKENS_PER_SEC, SINGLE_CALL_MAX_SEC, RETRY_DELAYS_MS,
    PROBE_SEC, ANCHOR_MAX_ERROR_SEC,
    canonicalize, durationFromTokens, planWindows, buildRequest, classifyFailure, retryable,
    matchAnchors, judgeTiming, probeWindow, buildImportMeta, classifyResponse, estimate, transcribe,
  };
});
