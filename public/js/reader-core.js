// public/js/reader-core.js
// BRR-P0-002b · Stage 1 — framework-free reader primitives extracted from
// index.html's renderTable cluster. Stage 1: imported by library.html's embedded
// (warm-worker) reader; index.html keeps its own copies until Stage 2 migrates it
// onto this module. Byte-for-byte parity vs index.html renderTable is gated by
// scripts/premium/reader-parity-smoke.js (smoke:reader-parity).
//
// Slice 1: pure leaves + column geometry. buildBilingualTableHtml lands in slice 2.

// Canonical column order — source of truth (the action col holds the ▶📝 buttons).
// baseWidths arrays are 5-element and POSITIONALLY index-aligned to this order.
export const TABLE_COL_ORDER = ["action", "he", "niqqud", "translit", "ru"];
export const RESIZE_MIN_COL_PERCENT = 6;
export const RESIZE_SNAP_EPS = 0.00001;

// HTML-entity escaper — byte-identical to index.html escapeHtml.
export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// FNV-1a 32-bit → 8-hex. Backs the client-side row-audio cache key.
export function fnv1aHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

// Client-side per-row TTS cache key — byte-identical to index.html buildRowTtsCacheKey.
export function buildRowTtsCacheKey(text, lang, cfg) {
  const providerId = cfg && typeof cfg.providerId === "string" ? cfg.providerId : "online_tts";
  const voiceId = cfg && typeof cfg.voiceId === "string" ? cfg.voiceId : "";
  const rate = cfg && typeof cfg.rate === "number" ? cfg.rate : 1.0;
  const pitch = cfg && typeof cfg.pitch === "number" ? cfg.pitch : 0.0;
  const payload = ["v1", providerId, lang || "", voiceId, String(rate), String(pitch), (text || "").trim()].join("|");
  return fnv1aHash(payload);
}

// Row TTS text by visibility rule: vocalized (niqqud) wins, else consonantal he.
// This is the exact string fed to both the cache key and the server — keeping it
// here guarantees audio parity across the SBL↔ru-phonetic translit switch.
export function getRowTtsTextForRow(row) {
  if (!row || typeof row !== "object") return "";
  const niqqud = String(row.he_niqqud || "").trim();
  if (niqqud) return niqqud;
  const he = String(row.he || "").trim();
  if (he) return he;
  return "";
}

// BRR-P1-008 karaoke — next row index (> fromIdx) that has speakable Hebrew text, or -1 at
// end. PURE (Node-testable) so the continuous-playback advance is gate-covered. Skips rows
// with no he/he_niqqud (separators, blanks) so karaoke never stalls on a silent row.
export function nextPlayableIndex(rows, fromIdx) {
  if (!Array.isArray(rows)) return -1;
  let from = Number(fromIdx);
  if (!Number.isFinite(from)) from = -1;   // undefined/NaN ⇒ start from the top (i=0)
  for (let i = from + 1; i < rows.length; i++) {
    if (getRowTtsTextForRow(rows[i])) return i;
  }
  return -1;
}

// BRR-P1-008b word-level karaoke — given a row's word timings (sorted [{o,t}] from the
// <assetKey>.timing.json sidecar) and the audio currentTime, return the WORD OFFSET (.o)
// being spoken now, or -1 before the first word. PURE (Node-testable). Tolerates partial
// timing (only the words GCP returned timepoints for are tracked → honest, no fake highlight).
export function activeWordIndex(words, currentTime) {
  if (!Array.isArray(words) || !words.length) return -1;
  const t = Number(currentTime) || 0;
  let active = -1;
  for (let i = 0; i < words.length; i++) {
    if (t >= (Number(words[i].t) || 0)) active = (Number.isInteger(words[i].o) ? words[i].o : -1);
    else break;
  }
  return active;
}

// API/DB sentence row → UI row shape (snake_case + camelCase tolerant).
// = index.html v3MapSentenceApiRowToUiRow, verbatim. Carries BOTH Hebrew forms
// (he, he_niqqud) and BOTH translit profiles (translit, translit_ru) separately so
// the render layer can switch profile without a re-fetch.
export function mapSentenceRowToUiRow(r, textId) {
  const sid = r && (r.id ?? r.sentence_id ?? r.sentenceId);
  return {
    he: String(r.he_plain ?? r.he ?? ""),
    he_niqqud: String(r.he_niqqud ?? r.heNiqqud ?? ""),
    translit: String(r.translit ?? ""),
    translit_ru: String(r.translit_ru ?? ""),
    ru: String(r.ru ?? ""),
    edit_meta_json: r.edit_meta_json ?? null,
    _v3_audioAssetKey: String(r.audio_asset_key ?? r.audioAssetKey ?? ""),
    _v3_audioTtsProfileJson: String(r.audio_tts_profile_json ?? r.audioTtsProfileJson ?? ""),
    _v3_sentenceId: sid ? String(sid) : null,
    _v3_textId: textId ? String(textId) : null,
    _v3_orderIndex: r.order_index ?? null,
  };
}

// ── Column geometry ──────────────────────────────────────────────────────────
// index.html reads module globals (tableVisibleColumns/tableBaseWidths); reader-core
// takes them as explicit params so the embedded reader owns its own state. Behaviour
// is byte-identical for identical inputs. The mutating fns mutate baseWidths in place
// (preserving the index.html side-effect contract).

export function countVisibleColumns(visibleColumns) {
  let n = 0;
  TABLE_COL_ORDER.forEach(function (k) { if (visibleColumns[k]) n++; });
  return n;
}

export function computeEffectiveWidths(visibleColumns, baseWidths) {
  const weights = {};
  let sum = 0;
  TABLE_COL_ORDER.forEach(function (k, idx) {
    if (visibleColumns[k]) {
      const w = Number(baseWidths[idx]);
      const safe = Number.isFinite(w) && w > 0 ? w : 1;
      weights[k] = safe;
      sum += safe;
    } else {
      weights[k] = 0;
    }
  });
  if (sum <= 0) {
    TABLE_COL_ORDER.forEach(function (k) {
      weights[k] = visibleColumns[k] ? (100 / countVisibleColumns(visibleColumns)) : 0;
    });
    return weights;
  }
  TABLE_COL_ORDER.forEach(function (k) {
    if (weights[k] > 0) weights[k] = (weights[k] / sum) * 100;
  });
  const visibleKeys = TABLE_COL_ORDER.filter(function (k) { return visibleColumns[k]; });
  if (visibleKeys.length > 0) {
    let total = 0;
    visibleKeys.forEach(function (k) { total += weights[k]; });
    weights[visibleKeys[visibleKeys.length - 1]] += (100 - total);
  }
  return weights;
}

export function enforceMinWidthsWithLocalAdjust(visibleColumns, baseWidths) {
  const visibleKeys = TABLE_COL_ORDER.filter(function (k) { return visibleColumns[k]; });
  if (visibleKeys.length < 1) return;
  if (visibleKeys.length === 1) {
    baseWidths[TABLE_COL_ORDER.indexOf(visibleKeys[0])] = 100;
    return;
  }
  let changed = false;
  for (let i = 0; i < visibleKeys.length; i++) {
    const k = visibleKeys[i];
    const idx = TABLE_COL_ORDER.indexOf(k);
    const v = Number(baseWidths[idx]) || 0;
    if (v < RESIZE_MIN_COL_PERCENT) {
      const deficit = RESIZE_MIN_COL_PERCENT - v;
      baseWidths[idx] = RESIZE_MIN_COL_PERCENT;
      changed = true;
      let maxKey = null, maxVal = -1;
      for (let j = 0; j < visibleKeys.length; j++) {
        const kk = visibleKeys[j];
        if (kk === k) continue;
        const ii = TABLE_COL_ORDER.indexOf(kk);
        const vv = Number(baseWidths[ii]) || 0;
        if (vv > maxVal) { maxVal = vv; maxKey = kk; }
      }
      if (maxKey) {
        const mi = TABLE_COL_ORDER.indexOf(maxKey);
        baseWidths[mi] = Math.max(RESIZE_MIN_COL_PERCENT, (Number(baseWidths[mi]) || 0) - deficit);
      }
    }
  }
  if (changed) {
    const keys = TABLE_COL_ORDER.filter(function (k) { return visibleColumns[k]; });
    let sum = 0;
    keys.forEach(function (k) { sum += Number(baseWidths[TABLE_COL_ORDER.indexOf(k)]) || 0; });
    if (sum !== 100) {
      const li = TABLE_COL_ORDER.indexOf(keys[keys.length - 1]);
      baseWidths[li] = (Number(baseWidths[li]) || 0) + (100 - sum);
    }
  }
}

export function normalizeVisibleBaseWidthsTo100(visibleColumns, baseWidths) {
  const visibleKeys = TABLE_COL_ORDER.filter(function (k) { return visibleColumns[k]; });
  if (visibleKeys.length < 1) return;
  let sum = 0;
  const idxMap = {};
  visibleKeys.forEach(function (k) {
    const idx = TABLE_COL_ORDER.indexOf(k);
    idxMap[k] = idx;
    const v = Number(baseWidths[idx]);
    const safe = Number.isFinite(v) && v > RESIZE_SNAP_EPS ? v : 1;
    sum += safe;
  });
  if (sum <= 0) {
    const each = 100 / visibleKeys.length;
    visibleKeys.forEach(function (k) { baseWidths[idxMap[k]] = each; });
    return;
  }
  const factor = 100 / sum;
  visibleKeys.forEach(function (k) { baseWidths[idxMap[k]] = baseWidths[idxMap[k]] * factor; });
  let total = 0;
  visibleKeys.forEach(function (k) { total += Number(baseWidths[idxMap[k]]) || 0; });
  const lastKey = visibleKeys[visibleKeys.length - 1];
  baseWidths[idxMap[lastKey]] = (Number(baseWidths[idxMap[lastKey]]) || 0) + (100 - total);
  enforceMinWidthsWithLocalAdjust(visibleColumns, baseWidths);
}

// ── Bilingual reader-table builder ───────────────────────────────────────────
// Pure HTML-string builder reproducing index.html renderTable's table markup
// (l.32796-32960), parameterised by an explicit config — no Studio globals, no DOM
// writes, no side effects (toast/selector-sync/audio/sticky-state are the caller's
// job). Returns the <table id="proTable"> string; the caller assigns innerHTML.
//
//   config = {
//     visibleColumns,   // {action,he,niqqud,translit,ru: bool}
//     baseWidths,       // 5-element % array, index-aligned to TABLE_COL_ORDER
//                       //   (mutated in place by the width normaliser, as renderTable does)
//     translitProfile,  // 'sbl' | 'ru-phonetic' — the user's selection
//     ideMode,          // bool — show the resize grip on the last column too
//     t,                // (i18n key) => string, for column titles
//     hasNote,          // optional (sentenceId) => bool, drives row-note-active
//   }
//
// Emits a CORRECT </th> closing tag. index.html drops it via an ASI bug (the '</th>'
// string literal has no '+' before it, so it parses as a dead expression statement);
// the browser auto-closes the cell on parse, so the live DOM is identical. The parity
// gate compares whitespace-normalised DOM, so the bug-fix does not break parity.
export function buildBilingualTableHtml(rows, config) {
  rows = Array.isArray(rows) ? rows : [];
  const cfg = config || {};
  const visibleColumns = cfg.visibleColumns || { action: true, he: true, niqqud: true, translit: true, ru: true };
  const baseWidths = cfg.baseWidths || [15, 20, 20, 21, 24];
  const t = typeof cfg.t === "function" ? cfg.t : (k) => k;
  const hasNoteFn = typeof cfg.hasNote === "function" ? cfg.hasNote : () => false;
  const ideMode = !!cfg.ideMode;

  normalizeVisibleBaseWidthsTo100(visibleColumns, baseWidths);
  const eff = computeEffectiveWidths(visibleColumns, baseWidths);
  let cols = TABLE_COL_ORDER.filter((k) => !!visibleColumns[k]);
  if (!cols.length) cols = TABLE_COL_ORDER.slice(); // renderTable: applyPreset('full')+recurse → full set

  const hasRuTranslit = rows.some((r) => r && r.translit_ru);
  const selectedProfile = cfg.translitProfile === "ru-phonetic" ? "ru-phonetic" : "sbl";
  const tProfile = hasRuTranslit && selectedProfile === "ru-phonetic" ? "ru-phonetic" : "sbl";
  const tTitle = hasRuTranslit
    ? (tProfile === "ru-phonetic" ? t("table.colTranslitRu") : t("table.colTranslitSbl"))
    : (selectedProfile === "ru-phonetic" ? t("table.colTranslitRu") + " (нет данных)" : t("table.colTranslitSbl"));

  const colMeta = {
    // actionTitle defaults to "▶📝" (index.html parity); the Room passes "▶" since
    // its note/edit affordances are hidden — no header advertising a hidden feature.
    action: { title: (typeof cfg.actionTitle === "string" ? cfg.actionTitle : "▶📝"), headerClass: "", cellClass: "col-action-cell" },
    he: { title: t("table.colHebrew"), headerClass: "rtl", cellClass: "rtl rtl-he" },
    niqqud: { title: t("table.colNiqqud"), headerClass: "rtl", cellClass: "rtl rtl-he-niqqud" },
    translit: { title: tTitle, headerClass: "", cellClass: "" },
    ru: { title: t("table.colTranslation"), headerClass: "", cellClass: "" },
  };

  let html = "" +
    '<table id="proTable" data-cols="' + cols.join(",") + '">' +
    "  <colgroup>";
  cols.forEach((k) => {
    const w = eff[k] || 0;
    html += '<col data-col="' + k + '" style="width:' + Number(w).toFixed(6) + '%;">';
  });
  html += "" +
    "  </colgroup>" +
    "  <thead>" +
    "    <tr>";
  cols.forEach((k, idx) => {
    const meta = colMeta[k] || { title: k };
    const cls = meta.headerClass ? ' class="' + meta.headerClass + '"' : "";
    const isLast = idx === cols.length - 1;
    const gripClass = isLast && !ideMode ? "col-resizer hidden" : "col-resizer";
    html += '<th data-col="' + k + '"' + cls + ">" +
      escapeHtml(meta.title) +
      '<div class="' + gripClass + '" data-resize="1" title="Потяните для изменения ширины."></div>' +
      "</th>";
  });
  html += "" +
    "    </tr>" +
    "  </thead>" +
    "  <tbody>";
  rows.forEach((row, rowIdx) => {
    const he = row.he || "";
    const heNiqqud = row.he_niqqud || "";
    const translit = tProfile === "ru-phonetic" ? (row.translit_ru || row.translit || "") : (row.translit || "");
    const ru = row.ru || "";
    const hasSid = !!(row && row._v3_sentenceId);
    html += '<tr data-row-idx="' + rowIdx + '" tabindex="-1"' + (hasSid ? ' draggable="false" data-draggable="1"' : "") + ">";
    cols.forEach((k) => {
      const meta = colMeta[k] || {};
      const tdClass = meta.cellClass ? ' class="' + meta.cellClass + '"' : "";
      if (k === "action") {
        const sid = row && row._v3_sentenceId ? String(row._v3_sentenceId) : "";
        const tid = row && row._v3_textId ? String(row._v3_textId) : "";
        let noteBtnHtml = "";
        if (sid && tid) {
          const hasNote = !!hasNoteFn(sid);
          noteBtnHtml =
            '<div class="col-action-row col-action-row-bot">' +
            '<button type="button" class="row-note-btn' + (hasNote ? " row-note-active" : "") + '" ' +
            'data-row-idx="' + rowIdx + '" ' +
            'data-sentence-id="' + escapeHtml(sid) + '" ' +
            'title="' + (hasNote ? "Заметка (есть)" : "Добавить заметку") + '" ' +
            'aria-label="Заметка">📝</button>' +
            "</div>";
        }
        const isFirst = rowIdx === 0;
        const isLast = rowIdx === rows.length - 1;
        const hasLibData = !!(sid && tid);
        const editActionsHtml = hasLibData
          ? '<div class="row-edit-actions">' +
            '<button type="button" class="row-edit-btn btn-up" data-edit-action="up" data-row-idx="' + rowIdx + '" title="Выше" aria-label="Выше"' + (isFirst ? " disabled" : "") + ">↑</button>" +
            '<button type="button" class="row-edit-btn btn-down" data-edit-action="down" data-row-idx="' + rowIdx + '" title="Ниже" aria-label="Ниже"' + (isLast ? " disabled" : "") + ">↓</button>" +
            '<button type="button" class="row-edit-btn btn-reset" data-edit-action="reset" data-row-idx="' + rowIdx + '" title="Сбросить правки строки" aria-label="Сбросить правки строки">↺</button>' +
            '<button type="button" class="row-edit-btn btn-del" data-edit-action="del" data-row-idx="' + rowIdx + '" title="Удалить строку" aria-label="Удалить строку">✕</button>' +
            "</div>"
          : "";
        html += '<td data-col="action" class="col-action-cell">' +
          '<div class="col-action-row col-action-row-top">' +
          '<span class="row-audio-ind" data-row-idx="' + rowIdx + '" aria-hidden="true"></span>' +
          '<button type="button" class="row-tts-btn" data-row-idx="' + rowIdx + '" ' +
          'title="Озвучить эту строку" aria-label="Озвучить строку">▶</button>' +
          "</div>" +
          noteBtnHtml +
          editActionsHtml +
          "</td>";
        return;
      }
      let value = "";
      if (k === "he") value = he;
      else if (k === "niqqud") value = heNiqqud;
      else if (k === "translit") value = translit;
      else if (k === "ru") value = ru;
      html += '<td data-col="' + k + '"' + tdClass + ">" + escapeHtml(value) + "</td>";
    });
    html += "</tr>";
  });
  html += "  </tbody></table>";
  return html;
}

// ── Warm text-open orchestrator ──────────────────────────────────────────────
// Mirrors index.html v3LibraryOpenText's LOCAL_MODE fetch→map→render, minus every
// Studio concern (composer, notes editor, source_text backfill, sticky-state). It
// reuses the ALREADY-WARM db worker that library.html's boot() initialised — the
// whole point of the embedded reader: no cold worker page-in per open (the measured
// ~1s lever). Fetches text + sentences in PARALLEL (index.html awaits them serially).
//
//   opts = {
//     localDb,   // the /db/local-db.js module (getTextByIdLite + getSentences + isFollower)
//     mount,     // element whose innerHTML receives the <table>
//     config,    // buildBilingualTableHtml config (visibleColumns/translitProfile/t/hasNote…)
//     onState,   // optional (state)=>void — {kind:'loading'|'dbBusy'|'notFound'|'empty'|'ready'|'error', text?, rows?, error?}
//   }
// Returns { ok, text?, rows?, reason?, error? }. Per-row audio + on-tap are wired by
// the caller AFTER render (slice 4) — openText only paints the table.
export async function openText(textId, opts) {
  opts = opts || {};
  const localDb = opts.localDb, mount = opts.mount, config = opts.config || {};
  const emit = (s) => { try { if (opts.onState) opts.onState(s); } catch (_) {} };
  if (!localDb || !mount) return { ok: false, reason: "config" };
  if (typeof localDb.isFollower === "function" && localDb.isFollower()) { emit({ kind: "dbBusy" }); return { ok: false, reason: "dbBusy" }; }
  emit({ kind: "loading" });
  let text, sentences;
  try {
    [text, sentences] = await Promise.all([
      localDb.getTextByIdLite(textId),
      localDb.getSentences(textId),
    ]);
  } catch (error) {
    emit({ kind: "error", error: error });
    return { ok: false, reason: "fetch", error: error };
  }
  if (!text) { emit({ kind: "notFound" }); return { ok: false, reason: "notFound" }; }
  const rows = (sentences || []).slice()
    .sort((a, b) => ((a && a.order_index) || 0) - ((b && b.order_index) || 0))
    .map((r) => mapSentenceRowToUiRow(r, textId));
  mount.innerHTML = buildBilingualTableHtml(rows, config);
  emit({ kind: rows.length ? "ready" : "empty", text: text, rows: rows });
  return { ok: true, text: text, rows: rows };
}

// ── Per-row audio (Room) ─────────────────────────────────────────────────────
// Delegated ▶ playback on a mount, reproducing index.html's Library audio path,
// SLIMMED to three keyless-first tiers (owner decision D2+b):
//   1) cached /api/audio/:assetKey   — keyless, when the row carries an asset key
//      whose mp3 is already in the server cache (HEAD pre-flight, then stream);
//   2) BYOK GCP /api/tts             — fresh synth when a per-user GCP key exists
//      (Library row → assetKey → /api/audio; else base64 blob);
//   3) browser SpeechSynthesis       — keyless fallback (Web Speech API, he-IL),
//      best-effort & device-dependent, so canon has a voice with no key + no
//      pre-baked audio (until BRR-P0-007 ships cached audio).
// Toggling, single player, and honest ▶/■/…/! button states. Returns { detach }.
//
//   opts = {
//     getRow(rowIdx) => row,   // resolve the row model by index
//     profile,                 // {voiceId,rate,pitch} or () => same (TTS request profile)
//     gcpKey,                  // string or () => string (BYOK GCP TTS key; '' → skip tier 2)
//     t,                       // i18n (optional)
//     onError(err),            // optional
//     tapToHearExcludeCols,    // optional string[] of data-col values whose CELL tap must
//                              //   NOT play the row (the ▶ button still plays). The Room
//                              //   passes ['he','niqqud'] so those cells are free for the
//                              //   word-tap morphology layer (reader-morph.js).
//   }
export function attachRowAudio(mount, opts) {
  opts = opts || {};
  if (!mount) return { detach() {} };
  const getRow = typeof opts.getRow === "function" ? opts.getRow : () => null;
  const excludeTapCols = Array.isArray(opts.tapToHearExcludeCols) ? opts.tapToHearExcludeCols : [];
  const profileOf = () => (typeof opts.profile === "function" ? opts.profile() : opts.profile) || {};
  const gcpKeyOf = () => String((typeof opts.gcpKey === "function" ? opts.gcpKey() : opts.gcpKey) || "");
  const LANG = "he-IL";
  let player = null, playingIdx = null, objUrl = null, mode = null; // mode: 'audio' | 'speech'
  // BRR-P1-008 karaoke — continuous auto-advance. opts.rowCount()=>n and opts.onRowChange(idx)
  // (idx>=0 a row started; idx<0 karaoke ended/stopped) let the Room auto-scroll + reset its control.
  let continuous = false;
  const rowCountOf = () => { const v = typeof opts.rowCount === "function" ? opts.rowCount() : opts.rowCount; return Number.isFinite(v) ? v : 0; };
  const notifyRow = (i) => { if (typeof opts.onRowChange === "function") { try { opts.onRowChange(i); } catch (_) {} } };
  const advance = (fromIdx) => {
    if (!continuous) return;
    const n = rowCountOf();
    for (let i = fromIdx + 1; i < n; i++) { const r = getRow(i); if (r && getRowTtsTextForRow(r)) { play(i); return; } }
    continuous = false; notifyRow(-1);   // reached the end → karaoke done
  };

  // BRR-P1-008b word-level karaoke — per-clip word timing from <assetKey>.timing.json (lazy,
  // cached incl. null). Only tier-1/2 'audio' rows (real currentTime) get word highlight; tier-3
  // browser-speech has no timing → sentence-level only. No timing file ⇒ graceful sentence-level.
  let activeTiming = null, speakingWord = -1;
  const timingCache = new Map();
  async function ensureTiming(assetKey) {
    if (!assetKey) return null;
    if (timingCache.has(assetKey)) return timingCache.get(assetKey);
    let t = null;
    try {
      const r = await fetch("/api/audio/" + encodeURIComponent(assetKey) + "/timing", { cache: "force-cache" });
      if (r && r.ok) { const j = await r.json(); if (j && Array.isArray(j.words) && j.words.length) t = j; }
    } catch (_) { t = null; }
    timingCache.set(assetKey, t);
    return t;
  }

  const btnOf = (idx) => mount.querySelector('button.row-tts-btn[data-row-idx="' + idx + '"]');
  const trOf = (idx) => { const b = btnOf(idx); return b ? b.closest("tr") : null; };
  const clearSpeakingWord = () => {
    if (!mount) return;
    const prev = mount.querySelectorAll(".rm-w-speaking");
    for (let i = 0; i < prev.length; i++) prev[i].classList.remove("rm-w-speaking");
    speakingWord = -1;
  };
  // Highlight the spoken word (offset) in the playing row — both he + niqqud cells share the offset.
  const paintSpeakingWord = (rowIdx, off) => {
    const tr = trOf(rowIdx); if (!tr) return;
    const cur = tr.querySelectorAll(".rm-w-speaking");
    for (let i = 0; i < cur.length; i++) cur[i].classList.remove("rm-w-speaking");
    if (off < 0) return;
    const spans = tr.querySelectorAll('.rm-w[data-w-offset="' + off + '"]');
    for (let j = 0; j < spans.length; j++) spans[j].classList.add("rm-w-speaking");
  };
  const ensurePlayer = () => {
    if (player) return player;
    player = new Audio();
    player.addEventListener("ended", () => { if (mode === "audio") { const fin = playingIdx; clearPlaying(); if (continuous) advance(fin); } });
    // BRR-P1-008b — drive word-level highlight off audio position.
    player.addEventListener("timeupdate", () => {
      if (mode !== "audio" || !activeTiming || playingIdx == null) return;
      const off = activeWordIndex(activeTiming.words, player.currentTime);
      if (off === speakingWord) return;
      speakingWord = off; paintSpeakingWord(playingIdx, off);
    });
    return player;
  };
  const revoke = () => { if (objUrl) { try { URL.revokeObjectURL(objUrl); } catch (_) {} objUrl = null; } };
  const setLoading = (idx) => { const b = btnOf(idx); if (b) { b.setAttribute("aria-busy", "true"); b.disabled = true; b.textContent = "…"; } };
  const setPlaying = (idx) => {
    const b = btnOf(idx); if (b) { b.removeAttribute("aria-busy"); b.disabled = false; b.classList.add("row-tts-playing"); b.classList.remove("row-tts-error"); b.textContent = "■"; }
    const tr = trOf(idx); if (tr) tr.classList.add("row-playing");
  };
  const setError = (idx, msg) => {
    const b = btnOf(idx); if (b) { b.removeAttribute("aria-busy"); b.disabled = false; b.classList.add("row-tts-error"); b.classList.remove("row-tts-playing"); b.textContent = "!"; if (msg) b.title = msg; }
    const tr = trOf(idx); if (tr) { tr.classList.remove("row-playing"); tr.classList.add("row-error"); }
  };
  const clearError = (idx) => {
    const b = btnOf(idx); if (b) { b.classList.remove("row-tts-error"); if (!b.classList.contains("row-tts-playing")) b.textContent = "▶"; b.removeAttribute("title"); }
    const tr = trOf(idx); if (tr) tr.classList.remove("row-error");
  };
  const clearPlaying = () => {
    if (playingIdx != null) { const b = btnOf(playingIdx); if (b) { b.classList.remove("row-tts-playing"); if (!b.classList.contains("row-tts-error")) b.textContent = "▶"; } const tr = trOf(playingIdx); if (tr) tr.classList.remove("row-playing"); }
    clearSpeakingWord(); activeTiming = null;   // BRR-P1-008b
    playingIdx = null; mode = null;
  };
  const stopAll = () => {
    try { if (player && !player.paused) player.pause(); } catch (_) {}
    try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
  };
  const speakBrowser = (text, idx, prof) => {
    if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") throw new Error("speech unavailable");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG;
    try { const v = (window.speechSynthesis.getVoices() || []).find((x) => /^(he|iw)/i.test(x.lang || "")); if (v) u.voice = v; } catch (_) {}
    if (typeof prof.rate === "number") u.rate = Math.min(2, Math.max(0.5, prof.rate));
    u.onend = () => { if (playingIdx === idx && mode === "speech") { clearPlaying(); if (continuous) advance(idx); } };
    u.onerror = () => { if (playingIdx === idx) setError(idx, "speech"); };
    mode = "speech"; setPlaying(idx);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  async function postTts(text, prof, row) {
    const body = { text: text, language: LANG, voiceId: prof.voiceId || "", speakingRate: typeof prof.rate === "number" ? prof.rate : 1.0, pitch: typeof prof.pitch === "number" ? prof.pitch : 0.0, gcpTtsApiKey: gcpKeyOf() };
    if (row && row._v3_sentenceId && row._v3_textId) { body.sentenceId = String(row._v3_sentenceId); body.textId = String(row._v3_textId); body.assetType = "row"; }
    const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { let m = ""; try { const j = await r.json(); m = (j && (j.error || j.message)) || ""; } catch (_) {} throw new Error("tts " + r.status + (m ? ": " + m : "")); }
    return r.json();
  }

  async function play(idx) {
    const row = getRow(idx);
    if (!row) return;
    clearError(idx);
    const p = ensurePlayer();
    // toggle: tapping the playing row stops it.
    if (playingIdx === idx) { stopAll(); clearPlaying(); return; }
    stopAll(); clearPlaying();
    const text = getRowTtsTextForRow(row);
    if (!text) return;
    const prof = profileOf();
    setLoading(idx);
    playingIdx = idx;
    notifyRow(idx);   // karaoke: a row started → Room auto-scrolls it into view
    try {
      // tier 1 — keyless cached asset
      const assetKey = String(row._v3_audioAssetKey || "").trim();
      if (assetKey) {
        let ok = false;
        try { const h = await fetch("/api/audio/" + encodeURIComponent(assetKey), { method: "HEAD" }); ok = !!(h && h.ok); } catch (_) { ok = false; }
        if (ok) {
          revoke(); mode = "audio"; p.src = "/api/audio/" + encodeURIComponent(assetKey); setPlaying(idx);
          activeTiming = null; speakingWord = -1;   // BRR-P1-008b — load word timing in parallel
          ensureTiming(assetKey).then((tm) => { if (playingIdx === idx && mode === "audio") activeTiming = tm; });
          await p.play(); return;
        }
      }
      // tier 2 — BYOK GCP fresh synth (only if a key is present)
      if (gcpKeyOf()) {
        const res = await postTts(text, prof, row);
        const freshKey = res && typeof res.assetKey === "string" ? res.assetKey.trim() : "";
        if (freshKey) { revoke(); mode = "audio"; p.src = "/api/audio/" + encodeURIComponent(freshKey); row._v3_audioAssetKey = freshKey; setPlaying(idx); await p.play(); return; }
        const b64 = res && typeof res.audioContent === "string" ? res.audioContent : "";
        if (b64) {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          revoke(); objUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
          mode = "audio"; p.src = objUrl; setPlaying(idx); await p.play(); return;
        }
        // no usable audio from GCP → fall through to browser speech
      }
      // tier 3 — keyless browser SpeechSynthesis fallback
      speakBrowser(text, idx, prof);
    } catch (err) {
      // last-ditch: if a network/synth tier threw, still try browser speech once.
      try { if (mode !== "speech") { speakBrowser(text, idx, prof); return; } } catch (_) {}
      clearPlaying();
      setError(idx, (err && err.message) || "audio error");
      if (opts.onError) { try { opts.onError(err); } catch (_) {} }
      if (continuous) advance(idx);   // karaoke: skip a failed row, keep going
    } finally {
      const b = btnOf(idx);
      if (b && !b.classList.contains("row-tts-playing") && !b.classList.contains("row-tts-error")) { b.removeAttribute("aria-busy"); b.disabled = false; b.textContent = "▶"; }
    }
  }

  const onClick = (e) => {
    const target = e.target;
    const btn = target && target.closest ? target.closest("button.row-tts-btn") : null;
    if (btn && mount.contains(btn)) {
      const idx = Number(btn.getAttribute("data-row-idx"));
      if (continuous) { continuous = false; notifyRow(-1); }   // a manual tap ends karaoke
      if (Number.isFinite(idx) && idx >= 0) play(idx);
      return;
    }
    // tap-to-hear: tapping a content cell (not a button) plays that row — except for
    // columns the caller reserved for another interaction (Room: he/niqqud → word-tap).
    const td = target && target.closest ? target.closest('#proTable tbody td[data-col]') : null;
    if (td && mount.contains(td)) {
      const col = td.getAttribute("data-col");
      if (col !== "action" && excludeTapCols.indexOf(col) < 0) {
        const tr = td.closest("tr[data-row-idx]");
        const idx = tr ? Number(tr.getAttribute("data-row-idx")) : NaN;
        if (continuous) { continuous = false; notifyRow(-1); }   // a manual tap ends karaoke
        if (Number.isFinite(idx) && idx >= 0) play(idx);
      }
    }
  };
  mount.addEventListener("click", onClick);
  return {
    detach() { mount.removeEventListener("click", onClick); continuous = false; stopAll(); revoke(); playingIdx = null; mode = null; },
    // BRR-P1-008 — start continuous karaoke from the first speakable row at/after startIdx.
    playAll(startIdx) {
      const n = rowCountOf();
      for (let i = Math.max(0, Number(startIdx) || 0); i < n; i++) {
        const r = getRow(i);
        if (r && getRowTtsTextForRow(r)) { continuous = true; play(i); return; }
      }
      notifyRow(-1);   // nothing speakable
    },
    stop() { continuous = false; stopAll(); clearPlaying(); notifyRow(-1); },
  };
}
