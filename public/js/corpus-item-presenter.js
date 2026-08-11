// Pure Reading Room presentation adapters.
//
// These functions normalize three different source contracts into one learner-facing
// view model. They deliberately have no storage, network, DOM, or mutation authority:
// callers supply already-authorized catalog rows and canonical progress snapshots.

const CONFIDENCE = new Set(["asserted", "derived-high", "derived-soft"]);

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const text = (value) => value == null || String(value).trim() === "" ? null : String(value).trim();
const pct = (value) => {
  const n = finite(value);
  return n != null && n > 0 && n <= 100 ? Math.round(n) : null;
};
const clampProgress = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const copyValue = (copy, key, fallback, value) => {
  const candidate = copy && copy[key];
  if (typeof candidate === "function") return candidate(value);
  return text(candidate) || fallback;
};
const normalizedTags = (raw) => {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  try {
    const parsed = raw ? JSON.parse(String(raw)) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (_) { return []; }
};

function learnerState(progress, options = {}) {
  const copy = options.copy || {};
  const finished = !!(progress && progress.finished_at);
  const rowIndex = progress && finite(progress.last_row_idx);
  const started = !finished && rowIndex != null && rowIndex > 0;
  const total = finite(options.totalRows != null ? options.totalRows : progress && progress.n_rows);
  if (finished) {
    return {
      state: "finished",
      resumeLabel: copyValue(copy, "finished", "Finished"),
      progressValue: 100,
      lastOpenedAt: text(progress && progress.last_opened_at),
    };
  }
  if (started) {
    if (options.allowPercentage && total && total > 0) {
      const value = clampProgress(((rowIndex + 1) * 100) / total);
      return {
        state: "reading",
        resumeLabel: copyValue(copy, "continuePercent", `Continue · ${value}%`, value),
        progressValue: value,
        lastOpenedAt: text(progress && progress.last_opened_at),
      };
    }
    const row = Math.max(1, Math.round(rowIndex) + 1);
    return {
      state: "reading",
      resumeLabel: copyValue(copy, "continueRow", `Continue · line ${row}`, row),
      progressValue: null,
      lastOpenedAt: text(progress && progress.last_opened_at),
    };
  }
  return {
    state: "new", resumeLabel: null, progressValue: options.newProgressZero ? 0 : null,
    lastOpenedAt: text(progress && progress.last_opened_at),
  };
}

function baseItem(value) {
  const readiness = value.readiness || {};
  const confidence = CONFIDENCE.has(readiness.confidence) ? readiness.confidence : "derived-soft";
  return {
    corpusId: String(value.corpusId || ""), itemId: String(value.itemId || ""),
    textKey: value.textKey == null ? null : String(value.textKey),
    title: text(value.title) || "Untitled", creator: text(value.creator),
    secondaryIdentity: text(value.secondaryIdentity), languageDirection: value.languageDirection || "rtl",
    kind: value.kind || "text", artwork: value.artwork || null,
    learnerState: value.learnerState,
    readiness: {
      levelLabel: text(readiness.levelLabel), familiarityPct: pct(readiness.familiarityPct),
      confidence, caveats: Array.isArray(readiness.caveats) ? readiness.caveats.filter(Boolean).map(String) : [],
      reason: text(readiness.reason), zone: text(readiness.zone), band: text(readiness.band),
    },
    media: value.media || { kind: null, coverage: null, humanOrTts: null },
    savedState: value.savedState || null, tags: normalizedTags(value.tags),
    primaryAction: value.primaryAction || "start",
    secondaryActions: Array.isArray(value.secondaryActions) ? value.secondaryActions.slice() : [],
    provenanceSummary: text(value.provenanceSummary),
  };
}

export function adaptBenYehudaItem(card, context = {}) {
  const source = card || {};
  const copy = context.copy || {};
  const familiarityPct = pct(context.familiarityPct);
  const levelLabel = text(context.difficultyLabel);
  const state = learnerState(context.progress, { copy, totalRows: source.segments, allowPercentage: true, newProgressZero: true });
  const audio = text(source.audio_status) || text(source.coverage && source.coverage.audio) || "none";
  const humanOrTts = audio === "tts" || audio === "human" ? audio : null;
  const reason = familiarityPct != null
    ? copyValue(copy, "familiarityReason", "Fits your familiar-word profile")
    : levelLabel ? copyValue(copy, "intrinsicReason", "Approximate lexical-frequency estimate") : null;
  return baseItem({
    corpusId: "benyehuda", itemId: source.id, textKey: source.text_key,
    title: source.title || copyValue(copy, "untitled", "Untitled"), creator: source.author,
    secondaryIdentity: source.era, languageDirection: "rtl", kind: "literary-work", artwork: null,
    learnerState: state,
    readiness: {
      levelLabel, familiarityPct, confidence: familiarityPct != null ? "derived-high" : "derived-soft",
      caveats: context.caveats, reason, zone: context.familiarityZone, band: context.difficultyBand,
    },
    media: { kind: humanOrTts ? "audio" : null, coverage: humanOrTts ? "full" : "none", humanOrTts },
    savedState: context.savedState || null, tags: context.tags || [],
    primaryAction: state.state === "reading" ? "continue" : state.state === "finished" ? "reread" : "start",
    secondaryActions: ["author", "reading-list", "details"],
    provenanceSummary: copyValue(copy, "benProvenance", "Difficulty by lexical frequency · familiar words by your profile"),
  });
}

export function adaptMyTextItem(item, context = {}) {
  const source = item || {};
  const copy = context.copy || {};
  const state = learnerState(source, { copy, allowPercentage: false, newProgressZero: false });
  const level = text(source.level);
  const media = context.media || { kind: null, coverage: null, humanOrTts: null };
  return baseItem({
    corpusId: "mytexts", itemId: source.id, textKey: source.text_key || source.id,
    title: source.title || copyValue(copy, "untitled", "Untitled"), creator: null,
    secondaryIdentity: text(source.topic) || copyValue(copy, "ownText", "Your text"),
    languageDirection: "rtl", kind: "personal-text", artwork: null,
    learnerState: state,
    readiness: {
      levelLabel: level, familiarityPct: null, confidence: "asserted", caveats: [],
      reason: level ? copyValue(copy, "studioLevelReason", "Level set in Studio") : null,
    },
    media, savedState: null, tags: normalizedTags(source.tags_json || source.tags),
    primaryAction: state.state === "reading" ? "continue" : state.state === "finished" ? "reread" : "start",
    secondaryActions: ["niqqud", "studio", "details"],
    provenanceSummary: copyValue(copy, "personalProvenance", "Your text · level set in Studio"),
  });
}

export function adaptGroupCorpusItem(work, context = {}) {
  const source = work || {};
  const copy = context.copy || {};
  const rows = Math.max(0, finite(source.rows_count) || 0);
  const audioRows = Math.max(0, finite(source.audio_count) || 0);
  const coverage = audioRows <= 0 ? "none" : rows > 0 && audioRows >= rows ? "full" : "partial";
  const revision = Math.max(1, finite(source.audio_revision) || 1);
  const state = learnerState(context.progress, { copy, totalRows: rows, allowPercentage: true, newProgressZero: true });
  const level = text(source.level);
  const position = source.position_no == null ? null : String(source.position_no);
  return baseItem({
    corpusId: `group:${String(context.corpusId || "")}`, itemId: source.work_id, textKey: source.text_key,
    title: source.title || copyValue(copy, "untitled", "Untitled"), creator: source.artist,
    secondaryIdentity: position ? `№${position} · ${copyValue(copy, "assigned", "assigned to group")}` : copyValue(copy, "assigned", "assigned to group"),
    languageDirection: "rtl", kind: "assigned-song", artwork: null,
    learnerState: state,
    readiness: {
      levelLabel: level, familiarityPct: null, confidence: "asserted",
      caveats: coverage === "partial" ? [copyValue(copy, "partialAudio", "Audio is partial")] : [],
      reason: level ? copyValue(copy, "groupLevelReason", "Level set by the corpus owner") : copyValue(copy, "assignedReason", "Assigned to your group"),
    },
    media: {
      kind: "audio", coverage, humanOrTts: audioRows > 0 ? (context.humanOrTts || "tts") : null,
      countLabel: `${audioRows}/${rows}`, revision,
    },
    savedState: null, tags: normalizedTags(source.tags),
    primaryAction: state.state === "reading" ? "continue" : state.state === "finished" ? "reread" : "start",
    secondaryActions: ["share", "details"],
    provenanceSummary: copyValue(copy, "groupProvenance", `Study group · TTS r${revision}`, revision),
  });
}

export function learningSignals(item) {
  const readiness = item && item.readiness || {};
  const signals = [];
  if (text(readiness.levelLabel)) signals.push({
    kind: "level", label: readiness.levelLabel, confidence: readiness.confidence, reason: readiness.reason,
  });
  const familiarity = pct(readiness.familiarityPct);
  if (familiarity != null) signals.push({
    kind: "familiarity", value: familiarity, confidence: readiness.confidence,
    reason: readiness.reason, zone: readiness.zone,
  });
  return signals.slice(0, 2);
}
