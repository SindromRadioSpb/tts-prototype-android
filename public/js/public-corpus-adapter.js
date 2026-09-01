(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PublicCorpusAdapter = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ID = /^[A-Za-z0-9_.:-]{1,160}$/;
  const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const HASH = /^[0-9a-f]{64}$/;
  const yes = value => value === true || Number(value) === 1;
  function invalid() { const error = new Error("PUBLIC_CORPUS_PAYLOAD_INVALID"); error.code = "PUBLIC_CORPUS_PAYLOAD_INVALID"; throw error; }
  function text(value, max, pattern) { const clean = String(value == null ? "" : value).trim(); if (!clean || clean.length > max || (pattern && !pattern.test(clean))) invalid(); return clean; }
  function count(value) { const number = Number(value); if (!Number.isInteger(number) || number < 0) invalid(); return number; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function parseMeta(value) { if (!value) return {}; if (typeof value === "object") return clone(value); try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch (_) { return {}; } }

  function normalizeItem(raw, edition) {
    const item = raw || {};
    const capabilities = { read: yes(item.public_read_allowed), stream: yes(item.public_stream_allowed), download: yes(item.package_download_allowed) };
    if (!capabilities.read) invalid();
    return Object.freeze({
      id: text(item.public_work_id, 160, ID), public_work_id: text(item.public_work_id, 160, ID),
      position_no: count(item.position_no), title: text(item.title || "Untitled", 500), creator: String(item.creator || "").slice(0, 500),
      snapshot_sha256: text(item.snapshot_sha256, 64, HASH), capabilities,
      expected_audio_count: count(item.expected_audio_count), included_audio_count: count(item.included_audio_count),
      asset_missing: count(item.asset_missing), package_complete: yes(item.package_complete),
      edition_id: edition.edition_id, manifest_sha256: edition.manifest_sha256,
    });
  }
  function normalizeCorpus(payload) {
    const value = payload || {}, rawCorpus = value.corpus || {}, rawEdition = value.edition || {};
    const edition = Object.freeze({
      edition_id: text(rawEdition.edition_id, 160, ID), edition_number: count(rawEdition.edition_number == null ? 1 : rawEdition.edition_number),
      manifest_sha256: text(rawEdition.manifest_sha256, 64, HASH), item_count: count(rawEdition.item_count), asset_count: count(rawEdition.asset_count),
      asset_missing: count(rawEdition.asset_missing), package_complete: yes(rawEdition.package_complete), published_at: String(rawEdition.published_at || ""),
    });
    const items = Array.isArray(value.items) ? value.items.map(item => normalizeItem(item, edition)) : invalid();
    if (items.length !== edition.item_count) invalid();
    return Object.freeze({ corpus_id: text(rawCorpus.corpus_id, 160, ID), slug: text(rawCorpus.slug, 80, SLUG), title: text(rawCorpus.title, 500), description: String(rawCorpus.description || "").slice(0, 4000), edition, items: Object.freeze(items) });
  }
  function normalizeWork(payload) {
    const raw = payload.item || {}, snapshot = raw.snapshot;
    if (!snapshot || typeof snapshot !== "object" || !snapshot.library || !Array.isArray(snapshot.library.texts) || !snapshot.library.texts.length) invalid();
    const rawAssets = Array.isArray(payload.assets) ? payload.assets : [];
    const corpus = normalizeCorpus({ corpus: payload && payload.corpus, edition: {
      ...(payload && payload.edition || {}), item_count: 1,
      asset_count: payload && payload.edition && payload.edition.asset_count != null ? payload.edition.asset_count : rawAssets.length,
      asset_missing: payload && payload.edition && payload.edition.asset_missing != null ? payload.edition.asset_missing : Number(raw.asset_missing) || 0,
      package_complete: payload && payload.edition && payload.edition.package_complete != null ? payload.edition.package_complete : raw.package_complete,
    }, items: [raw] });
    const assets = rawAssets.map(asset => Object.freeze({
      asset_key: text(asset.asset_key, 64, HASH), bytes: count(asset.bytes), sha256: text(asset.sha256, 64, HASH), mime: String(asset.mime || "audio/mpeg"),
      stream: yes(asset.public_stream_allowed), download: yes(asset.package_download_allowed),
    }));
    return Object.freeze({ corpus, item: corpus.items[0], snapshot: clone(snapshot), assets: Object.freeze(assets) });
  }
  function prepareImportBundle(payload) {
    const work = normalizeWork(payload), bundle = clone(work.snapshot);
    const streamable = new Set(work.assets.filter(asset => asset.stream).map(asset => asset.asset_key));
    for (const [index, sourceText] of bundle.library.texts.entries()) {
      const meta = parseMeta(sourceText.source_meta || sourceText.source_meta_json);
      delete meta.group_corpus;
      meta.public_corpus = {
        slug: work.corpus.slug, corpus_id: work.corpus.corpus_id, edition_id: work.corpus.edition.edition_id,
        public_work_id: work.item.public_work_id, manifest_sha256: work.corpus.edition.manifest_sha256,
        snapshot_sha256: work.item.snapshot_sha256,
      };
      sourceText.source_meta = meta;
      delete sourceText.source_meta_json;
      sourceText.text_key = "public:" + work.corpus.slug + ":" + work.item.public_work_id + ":" + work.item.snapshot_sha256.slice(0, 12) + (index ? ":" + index : "");
      for (const row of (Array.isArray(sourceText.rows) ? sourceText.rows : [])) {
        const key = String(row && row.audio_asset_key || "").toLowerCase();
        if (key && !streamable.has(key)) delete row.audio_asset_key;
      }
    }
    return bundle;
  }
  function deepLink(slug, workId) {
    return "/library.html?public_corpus=" + encodeURIComponent(text(slug, 80, SLUG)) + (workId ? "&public_work=" + encodeURIComponent(text(workId, 160, ID)) : "");
  }
  function localTextKey(slug, workId, snapshotHash, index) {
    return "public:" + text(slug, 80, SLUG) + ":" + text(workId, 160, ID) + ":" + text(snapshotHash, 64, HASH).slice(0, 12) + (Number(index) ? ":" + count(index) : "");
  }
  function normalizePhysicsSections(payload, catalog) {
    if (!payload || payload.schema_version !== "physics_sections.1.0.0" || payload.slug !== catalog.slug || !Array.isArray(payload.sections)) invalid();
    const catalogItems = new Map(catalog.items.map(item => [item.public_work_id, item]));
    const seen = new Set();
    const sections = payload.sections.map(raw => {
      const sectionNo = count(raw.section_no);
      if (sectionNo < 1 || sectionNo > 99 || !Array.isArray(raw.tasks) || count(raw.task_count) !== raw.tasks.length) invalid();
      const tasks = raw.tasks.map(task => {
        const publicWorkId = text(task.public_work_id, 160, ID), item = catalogItems.get(publicWorkId);
        if (!item || seen.has(publicWorkId) || text(task.snapshot_sha256, 64, HASH) !== item.snapshot_sha256) invalid();
        seen.add(publicWorkId);
        return Object.freeze({ public_work_id: publicWorkId, position_no: count(task.position_no), task_number: text(task.task_number, 30, /^\d+\.\d+$/), title: text(task.title, 500), snapshot_sha256: item.snapshot_sha256 });
      });
      return Object.freeze({ section_no: sectionNo, title_ru: text(raw.title_ru, 500), title_en: text(raw.title_en, 500), title_he: text(raw.title_he, 500), task_count: tasks.length, tasks: Object.freeze(tasks) });
    });
    if (seen.size !== catalog.items.length || sections.some((section, index) => index && sections[index - 1].section_no >= section.section_no)) invalid();
    return Object.freeze(sections);
  }
  function normalizePhysicsResourceIndex(payload, catalog) {
    if (!payload || payload.schema_version !== "physics_task_resource_index.1.0.0" || payload.slug !== catalog.slug || !Array.isArray(payload.resources)) invalid();
    const catalogItems = new Map(catalog.items.map(item => [item.public_work_id, item]));
    return Object.freeze(payload.resources.map(raw => {
      const workId = text(raw.public_work_id, 160, ID), item = catalogItems.get(workId);
      if (!item || text(raw.edition_id, 160, ID) !== catalog.edition.edition_id || text(raw.work_snapshot_sha256, 64, HASH) !== item.snapshot_sha256) invalid();
      const revisionId = text(raw.revision_id, 160, ID);
      const fileUrl = text(raw.file_url, 500);
      if (fileUrl !== "/api/public-corpora/" + encodeURIComponent(catalog.slug) + "/resources/" + encodeURIComponent(revisionId) + "/file") invalid();
      if (raw.resource_kind !== "PDF" || raw.mime !== "application/pdf" || !yes(raw.public_read_allowed)) invalid();
      return Object.freeze({ resource_id: text(raw.resource_id, 160, ID), revision_id: revisionId, revision_no: count(raw.revision_no), edition_id: catalog.edition.edition_id,
        public_work_id: workId, work_snapshot_sha256: item.snapshot_sha256, content_kind: text(raw.content_kind, 60), title: text(raw.title, 500), language: text(raw.language, 16),
        bytes: count(raw.bytes), sha256: text(raw.sha256, 64, HASH), mime: "application/pdf", quality_status: text(raw.quality_status, 40),
        public_read_allowed: true, agent_read_allowed: yes(raw.agent_read_allowed), file_url: fileUrl });
    }));
  }
  function normalizePhysicsLearningSupport(payload, catalog, item) {
    if (!payload || payload.schema_version !== "physics_learning_support.1.0.0" || payload.corpus_slug !== catalog.slug
      || payload.edition_id !== catalog.edition.edition_id || Number(payload.edition_number) !== Number(catalog.edition.edition_number)
      || payload.edition_manifest_sha256 !== catalog.edition.manifest_sha256 || payload.public_work_id !== item.public_work_id
      || payload.snapshot_sha256 !== item.snapshot_sha256 || !/^\d+\.\d+$/.test(String(payload.task_number || ""))
      || payload.review?.open_mismatch !== false || payload.rights?.public_read_allowed !== true) invalid();
    if (!HASH.test(String(payload.derivative_sha256 || ""))) invalid();
    const stringArray = (value, maxItems = 20, maxLength = 4000) => {
      if (!Array.isArray(value) || !value.length || value.length > maxItems) invalid();
      return Object.freeze(value.map(row => text(row, maxLength)));
    };
    const beginner = payload.beginner || {}, exam = payload.exam_solution || {}, source = payload.source || {};
    const normalized = {
      ...clone(payload),
      source: { ...clone(source), condition_ru: stringArray(source.condition_ru, 20), condition_he: stringArray(source.condition_he, 20) },
      beginner: { ...clone(beginner), prerequisites: stringArray(beginner.prerequisites), application_conditions: stringArray(beginner.application_conditions),
        roadmap: stringArray(beginner.roadmap), common_mistakes: stringArray(beginner.common_mistakes), self_check: stringArray(beginner.self_check) },
      exam_solution: { ...clone(exam), given: stringArray(exam.given), find: stringArray(exam.find), si: stringArray(exam.si), laws: stringArray(exam.laws),
        symbolic: stringArray(exam.symbolic), construction: Object.freeze(Array.isArray(exam.construction) ? exam.construction.map(row => text(row, 4000)) : invalid()),
        calculation: stringArray(exam.calculation), check: stringArray(exam.check) },
    };
    text(normalized.beginner.physical_picture, 6000); text(normalized.beginner.profile_title, 1000); text(normalized.beginner.deep_principle, 6000);
    text(normalized.beginner.task_trap, 4000); text(normalized.beginner.hint_model, 4000); text(normalized.answer?.result, 4000);
    return Object.freeze(normalized);
  }
  function normalizeMaterialsLearningSupport(payload, catalog, item) {
    const fullTts = payload && payload.audio_boundary && payload.audio_boundary.full_tts_generated;
    if (!payload || payload.schema_version !== "materials_pb2_learning_support.1.0.0" || payload.corpus_slug !== catalog.slug
      || catalog.slug !== "materials-science-year1-problem-book-2" || payload.edition_id !== catalog.edition.edition_id
      || Number(payload.edition_number) !== Number(catalog.edition.edition_number)
      || payload.edition_manifest_sha256 !== catalog.edition.manifest_sha256 || payload.public_work_id !== item.public_work_id
      || payload.snapshot_sha256 !== item.snapshot_sha256 || !/^materials-science-y1-pb2-/.test(String(payload.task_id || ""))
      || payload.review?.state !== "REVIEWED_PASS" || payload.review?.publication_blocking !== false
      || payload.rights?.public_read_allowed !== true || payload.rights?.public_solution_display_and_print_allowed !== true
      || (fullTts !== false && fullTts !== true) || !HASH.test(String(payload.derivative_sha256 || ""))) invalid();
    if (fullTts && (payload.rights?.full_tts_audio_and_timings_allowed !== true
      || !String(payload.audio_boundary.profile_id || ""))) invalid();
    const rows = Array.isArray(payload.solution_rows) ? payload.solution_rows : invalid();
    if (rows.length < 4 || rows.length > 160) invalid();
    const normalizedRows = rows.map((row, index) => {
      if (!row || count(row.order) !== index + 1 || !/^materials-science-y1-pb2-.+-sol-r\d{3}$/.test(String(row.row_id || ""))
        || !Array.isArray(row.source_refs) || !row.source_refs.length || !row.text || !row.audio_plan
        || (!fullTts && (row.audio_plan.state !== "DEFERRED_UNTIL_OWNER_CARD_REVIEW" || row.audio_plan.timings_present !== false))
        || (fullTts && (row.audio_plan.state !== "READY" || row.audio_plan.timings_present !== true
          || !HASH.test(String(row.audio_plan.audio_asset_key || "")) || !String(row.audio_plan.spoken_he_niqqud || "").trim()))
        || !Array.isArray(row.audio_plan.karaoke_tokens) || !row.audio_plan.karaoke_tokens.length) invalid();
      const parallel = {};
      for (const field of ["he", "he_niqqud", "transliteration", "ru"]) parallel[field] = text(row.text[field], 12000);
      for (const [tokenIndex, token] of row.audio_plan.karaoke_tokens.entries()) {
        if (!token || count(token.index) !== tokenIndex || !String(token.surface || "").trim() || !String(token.normalized || "").trim()) invalid();
      }
      return Object.freeze({ ...clone(row), text: Object.freeze(parallel) });
    });
    const condition = payload.condition || {};
    if (!Array.isArray(condition.rows) || !condition.rows.length || !Array.isArray(condition.source_pages)) invalid();
    if (fullTts && condition.rows.some(row => !HASH.test(String(row.audio_asset_key || ""))
      || row.audio_plan?.state !== "READY" || row.audio_plan?.timings_present !== true)) invalid();
    return Object.freeze({ ...clone(payload), solution_rows: Object.freeze(normalizedRows), condition: clone(condition) });
  }
  function materialsHonestSolutionRows(rows) {
    if (!Array.isArray(rows)) return Object.freeze([]);
    return Object.freeze(rows.filter(row => row && String(row.section || "") !== "answer_first"));
  }
  function materialsSolutionTextKey(support) {
    const value = support || {};
    const parts = [
      "reviewed-solution-v1", text(value.corpus_slug, 80, SLUG), text(value.edition_id, 160, ID),
      text(value.edition_manifest_sha256, 64, HASH), text(value.public_work_id, 160, ID),
      text(value.snapshot_sha256, 64, HASH), text(value.derivative_sha256, 64, HASH),
      text(value.task_id, 160, ID),
    ];
    return parts.map(part => encodeURIComponent(part)).join(":");
  }
  function materialsHebrewWords(value) {
    return String(value || "").match(/[֑-ׇֽֿׁׂׅׄא-ת׳״]+/g) || [];
  }
  function materialsAudioTokenForWord(tokens, surface) {
    const strip = value => String(value || "").replace(/[֑-ׇ]/g, "").trim();
    const word = strip(surface);
    const matches = (tokens || []).filter(token => {
      const tokenSurface = strip(token && token.surface), normalized = strip(token && token.normalized);
      return tokenSurface === word || normalized === word || tokenSurface.includes(word) || normalized.includes(word);
    });
    return matches.length === 1 ? matches[0] : null;
  }
  function materialsSolutionOccurrence(support, row, wordOffset, surface) {
    const value = support || {}, rows = Array.isArray(value.solution_rows) ? value.solution_rows : invalid();
    const exact = rows.find(candidate => candidate && String(candidate.row_id) === String(row && row.row_id));
    const offset = Number(wordOffset), cleanSurface = String(surface || "").trim();
    if (!exact || exact !== row || !Number.isInteger(offset) || offset < 0 || !cleanSurface) invalid();
    const rowWords = materialsHebrewWords(exact.text && exact.text.he);
    const strip = value => String(value || "").replace(/[֑-ׇ]/g, "").trim();
    if (!rowWords[offset] || strip(rowWords[offset]) !== strip(cleanSurface)) invalid();
    const tokens = exact.audio_plan && Array.isArray(exact.audio_plan.karaoke_tokens) ? exact.audio_plan.karaoke_tokens : [];
    const audioToken = materialsAudioTokenForWord(tokens, cleanSurface);
    const textKey = materialsSolutionTextKey(value);
    return Object.freeze({
      source_kind: "reviewed_solution", corpus_slug: value.corpus_slug,
      edition_id: value.edition_id, edition_number: Number(value.edition_number),
      edition_manifest_sha256: value.edition_manifest_sha256, public_work_id: value.public_work_id,
      snapshot_sha256: value.snapshot_sha256, derivative_sha256: value.derivative_sha256,
      task_id: value.task_id, row_id: exact.row_id, row_order: Number(exact.order),
      text_key: textKey, text_id: textKey, sentence_id: exact.row_id,
      order_index: Number(exact.order), word_offset: offset,
      audio_token_index: audioToken ? Number(audioToken.index) : null, surface: cleanSurface,
    });
  }
  function verifyMaterialsSolutionOccurrence(occ, support) {
    if (!occ || occ.source_kind !== "reviewed_solution" || !support) return null;
    try {
      const textKey = materialsSolutionTextKey(support);
      if (occ.text_key !== textKey || occ.text_id !== textKey
        || occ.corpus_slug !== support.corpus_slug || occ.edition_id !== support.edition_id
        || Number(occ.edition_number) !== Number(support.edition_number)
        || occ.edition_manifest_sha256 !== support.edition_manifest_sha256
        || occ.public_work_id !== support.public_work_id || occ.snapshot_sha256 !== support.snapshot_sha256
        || occ.derivative_sha256 !== support.derivative_sha256 || occ.task_id !== support.task_id) return null;
      const row = (support.solution_rows || []).find(candidate => candidate && candidate.row_id === occ.sentence_id);
      if (!row || row.row_id !== occ.row_id || Number(row.order) !== Number(occ.order_index)
        || Number(row.order) !== Number(occ.row_order)) return null;
      const offset = Number(occ.word_offset), tokens = row.audio_plan && row.audio_plan.karaoke_tokens;
      if (!Number.isInteger(offset) || offset < 0 || !Array.isArray(tokens)) return null;
      const strip = value => String(value || "").replace(/[֑-ׇ]/g, "").trim();
      const rowWords = materialsHebrewWords(row.text && row.text.he);
      if (!rowWords[offset] || strip(rowWords[offset]) !== strip(occ.surface)) return null;
      const audioToken = materialsAudioTokenForWord(tokens, occ.surface);
      const expectedAudioIndex = audioToken ? Number(audioToken.index) : null;
      if (occ.audio_token_index !== expectedAudioIndex) return null;
      return { textKey, sentenceId: row.row_id, orderIndex: Number(row.order), surface: String(occ.surface) };
    } catch (_) { return null; }
  }
  return Object.freeze({ normalizeCorpus, normalizeWork, prepareImportBundle, deepLink, localTextKey, normalizePhysicsSections, normalizePhysicsResourceIndex, normalizePhysicsLearningSupport, normalizeMaterialsLearningSupport, materialsHonestSolutionRows, materialsSolutionTextKey, materialsSolutionOccurrence, verifyMaterialsSolutionOccurrence });
});
