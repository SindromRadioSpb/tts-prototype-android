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
    action: { title: "▶📝", headerClass: "", cellClass: "col-action-cell" },
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
