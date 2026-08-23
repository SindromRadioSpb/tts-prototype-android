// Pure Reading Room presentation adapters.
//
// These functions normalize three different source contracts into one learner-facing
// view model. They deliberately have no storage, network, DOM, or mutation authority:
// callers supply already-authorized catalog rows and canonical progress snapshots.

const CONFIDENCE = new Set(["asserted", "derived-high", "derived-soft", "unknown"]);

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const text = (value) => value == null || String(value).trim() === "" ? null : String(value).trim();
const pct = (value) => {
  if (value == null || String(value).trim() === "") return null;
  const n = finite(value);
  return n != null && n >= 0 && n <= 100 ? Math.round(n) : null;
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
  const confidence = CONFIDENCE.has(readiness.confidence) ? readiness.confidence : "unknown";
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
    signals: Array.isArray(value.signals) ? value.signals.slice() : [],
    primaryReason: text(value.primaryReason),
  };
}

function typedSignal(kind, value, type, source, revision, caveats) {
  return {
    kind, value,
    provenance: { type: type || "unknown", source: text(source), revision: text(revision) },
    caveats: Array.isArray(caveats) ? caveats.filter(Boolean).map(String) : [],
  };
}

function compassSignals(context, levelSignal, audioSignal) {
  const signals = [];
  const fit = context && context.compass;
  if (fit) {
    const status = fit.status || "UNAVAILABLE";
    const hasCurrentValue = status === "AVAILABLE" || status === "AVAILABLE_LIMITED";
    const signal = typedSignal("familiarity", {
    status,
    lower_bound_pct: finite(fit.recorded_familiar_pct_lower_bound),
    uncertainty_pp: finite(fit.unresolved_uncertainty_pp),
    counts: fit.counts || null,
    rank_eligible: !!fit.rank_eligible,
    reason_code: fit.reason_code || null,
    action_label: status === "NOT_PREPARED" && context.prepareOnOpen
      ? copyValue(context.copy, "groupNotPreparedAction", "Open to analyze") : null,
  }, hasCurrentValue ? "derived" : "unknown", hasCurrentValue ? "recorded-familiarity-v2" : null,
  hasCurrentValue ? fit.learner_projection_version || fit.resolver_version : null,
  status === "AVAILABLE_LIMITED" ? ["unresolved-above-rank-limit"]
    : status === "NOT_PREPARED" && context.prepareOnOpen ? ["prepare-on-open"] : []);
    signal.detail_labels = status === "AVAILABLE_LIMITED"
      ? [copyValue(context.copy, "limitedFamiliarityDetail", "Ambiguity is too high for ranking; only the lower bound is shown.")]
      : status === "NOT_PREPARED" && context.prepareOnOpen
        ? [copyValue(context.copy, "groupNotPreparedDetail", "Analysis runs locally after the text is first opened.")]
        : [];
    signals.push(signal);
  }
  const readingTime = context && context.readingTime;
  if (readingTime) signals.push(typedSignal("reading-time", {
    status: readingTime.status || "UNAVAILABLE",
    min_minutes: finite(readingTime.min_minutes), max_minutes: finite(readingTime.max_minutes),
    observation_count: finite(readingTime.observation_count),
  }, readingTime.status === "AVAILABLE" ? "derived" : "unknown", "local-completed-readings-v2", null, []));
  if (levelSignal) signals.push(levelSignal);
  if (audioSignal) signals.push(audioSignal);
  return signals;
}

export function adaptBenYehudaItem(card, context = {}) {
  const source = card || {};
  const copy = context.copy || {};
  const fitPct = context.compass && (context.compass.status === "AVAILABLE" || context.compass.status === "AVAILABLE_LIMITED")
    ? context.compass.recorded_familiar_pct_lower_bound : context.familiarityPct;
  const familiarityPct = pct(fitPct);
  const levelLabel = text(context.difficultyLabel);
  const state = learnerState(context.progress, { copy, totalRows: source.segments, allowPercentage: true, newProgressZero: true });
  const audio = text(source.audio_status) || text(source.coverage && source.coverage.audio) || "none";
  const humanOrTts = audio === "tts" || audio === "human" ? audio : null;
  const rows = Math.max(0, finite(source.segments) || 0);
  const audioRows = humanOrTts ? rows : 0;
  const coverage = humanOrTts ? "full" : "none";
  const reason = familiarityPct != null
    ? copyValue(copy, "familiarityReason", "Fits your familiar-word profile")
    : levelLabel ? copyValue(copy, "intrinsicReason", "Approximate lexical-frequency estimate") : null;
  const levelSignal = levelLabel ? typedSignal("level", levelLabel, "derived", "benyehuda-vocab-v7", context.catalogRevision || null, context.caveats) : null;
  const audioSignal = typedSignal("audio", { coverage, kind: humanOrTts }, "asserted", "benyehuda-catalog", context.catalogRevision || null, []);
  return baseItem({
    corpusId: "benyehuda", itemId: source.id, textKey: source.text_key,
    title: source.title || copyValue(copy, "untitled", "Untitled"), creator: source.author,
    secondaryIdentity: source.era, languageDirection: "rtl", kind: "literary-work", artwork: null,
    learnerState: state,
    readiness: {
      levelLabel, familiarityPct, confidence: familiarityPct != null ? "derived-high" : "derived-soft",
      caveats: context.caveats, reason, zone: context.familiarityZone, band: context.difficultyBand,
    },
    media: { kind: "audio", coverage, humanOrTts, countLabel: audioRows > 0 && rows > 0 ? `${audioRows}/${rows}` : null },
    savedState: context.savedState || null, tags: context.tags || [],
    primaryAction: state.state === "reading" ? "continue" : state.state === "finished" ? "reread" : "start",
    secondaryActions: ["author", "reading-list", "details"],
    provenanceSummary: copyValue(copy, "benProvenance", "Difficulty by lexical frequency · familiar words by your profile"),
    signals: compassSignals(context, levelSignal, audioSignal),
    primaryReason: context.primaryReason,
  });
}

export function adaptMyTextItem(item, context = {}) {
  const source = item || {};
  const copy = context.copy || {};
  const state = learnerState(source, { copy, allowPercentage: false, newProgressZero: false });
  const level = text(source.level);
  const media = context.media || { kind: "audio", coverage: "none", humanOrTts: null, countLabel: null, videoAvailable: false };
  const levelSignal = level ? typedSignal("level", level, "asserted", "studio", source.updated_at || null, []) : null;
  const audioSignal = typedSignal("audio", { coverage: media.coverage || "none", kind: media.humanOrTts },
    context.mediaProvenance && context.mediaProvenance.type, context.mediaProvenance && context.mediaProvenance.source,
    context.mediaProvenance && context.mediaProvenance.revision, []);
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
    provenanceSummary: level
      ? copyValue(copy, "personalProvenance", "Your text · level set in Studio")
      : copyValue(copy, "personalProvenanceUnknown", "Your text · level not asserted"),
    signals: compassSignals(context, levelSignal, audioSignal),
    primaryReason: context.primaryReason,
  });
}

export function adaptGroupCorpusItem(work, context = {}) {
  const source = work || {};
  const copy = context.copy || {};
  const rows = Math.max(0, finite(source.rows_count) || 0);
  const audioRows = Math.max(0, finite(source.audio_count) || 0);
  const coverage = audioRows <= 0 ? "none" : rows > 0 && audioRows >= rows ? "full" : "partial";
  const revision = finite(source.audio_revision) != null && finite(source.audio_revision) >= 1 ? Math.floor(finite(source.audio_revision)) : null;
  const state = learnerState(context.progress, { copy, totalRows: rows, allowPercentage: true, newProgressZero: true });
  const level = text(source.level);
  const position = source.position_no == null ? null : String(source.position_no);
  const assertedAudioKind = audioRows > 0 && (context.humanOrTts === "tts" || context.humanOrTts === "human") ? context.humanOrTts : null;
  const levelSignal = level ? typedSignal("level", level, "asserted", "group-corpus-owner", context.catalogRevision || null, []) : null;
  const audioSignal = typedSignal("audio", { coverage, kind: assertedAudioKind },
    context.audioProvenance && context.audioProvenance.type, context.audioProvenance && context.audioProvenance.source,
    context.audioProvenance && context.audioProvenance.revision || revision, coverage === "partial" ? ["partial"] : []);
  return baseItem({
    corpusId: `group:${String(context.corpusId || "")}`, itemId: source.work_id, textKey: source.text_key,
    title: source.title || copyValue(copy, "untitled", "Untitled"), creator: source.artist,
    secondaryIdentity: position ? `№${position} · ${copyValue(copy, "assigned", "assigned to group")}` : copyValue(copy, "assigned", "assigned to group"),
    languageDirection: "rtl", kind: "assigned-song", artwork: null,
    learnerState: state,
    readiness: {
      levelLabel: level, familiarityPct: null, confidence: "asserted",
      caveats: [],
      reason: level ? copyValue(copy, "groupLevelReason", "Level set by the corpus owner") : copyValue(copy, "assignedReason", "Assigned to your group"),
    },
    media: {
      kind: "audio", coverage, humanOrTts: assertedAudioKind,
      countLabel: audioRows > 0 && rows > 0 ? `${Math.min(audioRows, rows)}/${rows}` : null, revision,
    },
    savedState: null, tags: normalizedTags(source.tags),
    primaryAction: state.state === "reading" ? "continue" : state.state === "finished" ? "reread" : "start",
    secondaryActions: ["share", "details"],
    provenanceSummary: assertedAudioKind && revision
      ? copyValue(copy, "groupProvenance", `Study group · ${assertedAudioKind.toUpperCase()} r${revision}`, revision)
      : copyValue(copy, "groupProvenanceUnknown", "Study group · audio source/revision not asserted"),
    signals: compassSignals({ ...context, prepareOnOpen: true }, levelSignal, audioSignal),
    primaryReason: context.primaryReason,
  });
}

export function adaptPublicCorpusItem(work, context = {}) {
  const source = work || {};
  const copy = context.copy || {};
  const expected = Math.max(0, finite(source.expected_audio_count) || 0);
  const included = Math.max(0, finite(source.included_audio_count) || 0);
  const missing = Math.max(0, finite(source.asset_missing) || 0);
  const coverage = included <= 0 ? "none" : expected > 0 && included >= expected && missing === 0 ? "full" : "partial";
  const state = learnerState(context.progress, { copy, allowPercentage: false, newProgressZero: true });
  const audioSignal = typedSignal("audio", { coverage, kind: null },
    "asserted", "public-immutable-edition", source.manifest_sha256 || context.manifestSha256 || null,
    coverage === "partial" ? ["partial"] : []);
  return baseItem({
    corpusId: `public:${String(context.slug || "")}`, itemId: source.public_work_id, textKey: context.textKey,
    title: source.title || copyValue(copy, "untitled", "Untitled"), creator: source.creator,
    secondaryIdentity: copyValue(copy, "publicEdition", "Public immutable edition"),
    languageDirection: "rtl", kind: "public-study-song", artwork: null,
    learnerState: state,
    readiness: { levelLabel: null, familiarityPct: null, confidence: "unknown", caveats: [], reason: null },
    media: { kind: "audio", coverage, humanOrTts: null, countLabel: expected > 0 ? `${included}/${expected}` : null, revision: null },
    savedState: null, tags: [], primaryAction: state.state === "reading" ? "continue" : state.state === "finished" ? "reread" : "start",
    secondaryActions: ["share", "details"],
    provenanceSummary: copyValue(copy, "publicProvenance", "Public immutable edition"),
    signals: compassSignals(context, null, audioSignal), primaryReason: context.primaryReason,
  });
}

export function learningSignals(item) {
  if (item && Array.isArray(item.signals) && item.signals.length) {
    const priority = { familiarity: 1, "reading-time": 2, level: 3, audio: 4 };
    return item.signals.slice().sort((a, b) => (priority[a.kind] || 9) - (priority[b.kind] || 9)).slice(0, 2);
  }
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
