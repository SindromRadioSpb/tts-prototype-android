// public/js/notes-autogen.js — pure, DOM-free resolver CORE for ②-note autogen.
//
// This is the quality-critical core of the auto-②-note engine (Stage 1.2). It is a
// FAITHFUL PORT of the offline pipeline `scripts/premium/build-notes-from-bundle.js`
// (loadOfflineMeaning / formFirstResolve / unitFormVariants / resolveTrueRoot /
// offlineMeaningLookup / checkUnit). Keeping the two in lock-step is the whole point:
// the Stage-1.3 `audit:autogen-quality` gate + the parity smoke run THIS module in
// Node against the shipped bundle and diff it against build-notes → "diffs = bugs".
//
// It has NO DOM / window / OPFS / network dependencies. The browser orchestrator
// (`v3NotesAutoGenForText` in index.html) owns all I/O: it loads the inflection
// dataset (InflectionDict.ensureReady), reads sentence_morph (ldb.getSentenceMorphForText),
// runs Dicta-token → result (v3MorphTokenToResult), resolves the base paradigm
// (getLemmaInflection — the client substitute for the offline `inflect()` gateway),
// and layers the function-word premium profile (PealimFunctionLinks). It then calls
// the pure functions here per distinct unit and groups the canonical candidates.
//
// Dual export: window.NotesAutoGen (browser) + module.exports (Node require).

(function () {
  "use strict";

  // ── niqqud / vowel normalization (mirror of build-notes) ──────────────────
  var NIQQUD_RE = /[֑-ׇ]/g;
  function stripNiqqud(s) { return String(s == null ? "" : s).replace(NIQQUD_RE, "").trim(); }
  function normVowels(s) { return String(s == null ? "" : s).normalize("NFC").replace(/[֑-֯]/g, "").replace(/ֽ/g, "").trim(); }
  function formVariants(s) {
    var a = normVowels(s);
    var b = normVowels(String(s == null ? "" : s).replace(/^[והשכלבמ][֑-ׇ]*/, ""));
    return b && b !== a ? [a, b] : (a ? [a] : []);
  }

  // Function / closed-class POS bear NO triliteral root and never get a content gloss.
  var FUNCTION_POS = new Set(["adverb", "pronoun", "conjunction", "interjection", "negation", "numeral", "other", "particle"]);
  // POS that legitimately inflect (content + preposition) — selects the query alias.
  var CONTENT_INFLECTS = new Set(["", "verb", "noun", "adjective", "preposition"]);
  // noun↔adjective kinship: Dicta cross-tags participles/nominals; treat as one family.
  var NOUN_KIN = function (a, b) { return (a === b) || ((a === "noun" || a === "adjective") && (b === "noun" || b === "adjective")); };
  // piel↔pual / hifil↔hufal share ONE Pealim page (two voices).
  var VOICE_PARTNER = { pual: "piel", piel: "pual", hufal: "hifil", hifil: "hufal" };
  var REQUIRED = {
    verb: ["AP-ms", "PERF-3ms", "IMPF-3ms", "INF-L"],
    adjective: ["ms-a", "fs-a", "mp-a", "fp-a"],
    preposition: ["P-1s", "P-3ms"],
  };

  // The query alias fed to the base-paradigm lookup (== build-notes queryLemma).
  function queryLemma(pos, root, lemma, stem) {
    return CONTENT_INFLECTS.has(pos || "") ? (root || lemma || stem) : (stem || lemma);
  }

  // Dicta sentence_morph token → resolution unit (== build-notes §2 inline mapping,
  // lines 317–341). Pure: classifies by Dicta's own posDicta (+ binyan→verb inference),
  // R1-guards root for function words / proper nouns. Returns the `unit` shape the
  // resolver consumes, or null (skip). Mirrors build-notes EXACTLY so the Node parity
  // smoke reproduces its unit derivation by shared code. NOTE: the browser orchestrator
  // intentionally uses the richer `v3MorphTokenToResult` (adds a Hebrew function-word
  // stoplist + MorphProvider POS fallback) — a superset; converging the two via
  // delegation is a Stage-1.3 task.
  function dictaTokenToUnit(tk) {
    if (!tk) return null;
    var word = stripNiqqud(tk.word || "");
    if (!word || word.length < 2) return null;
    var lemma = stripNiqqud(tk.lemma || tk.stem || "");
    var stem = stripNiqqud(tk.stem || "");
    var binyan = tk.binyan || "";
    var pos = tk.posDicta || tk.pos || "";
    if (!pos && binyan && lemma) pos = "verb";
    var kind = tk.kind;
    var root = (FUNCTION_POS.has(pos) || kind === "propernoun") ? null
      : ((pos === "verb" || pos === "noun") ? lemma : null);
    return { pos: pos, binyan: binyan, root: root, lemma: lemma, stem: stem, niqqud: tk.niqqud || "", sampleWord: word, kind: kind };
  }

  // ── reverse maps over the dataset (== build-notes loadOfflineMeaning) ──────
  // Builds: alias (root/lemma/form → glosses), cell (inflected consonantal surface →
  // glosses), formIdx (VOCALIZED cell form → {pealim_id, root, …}; the decisive
  // homograph signal), rootAlias (base key → Pealim-asserted TRUE root). Pure; the
  // caller passes InflectionDict.ensureReady().paradigms.
  function buildResolverMaps(paradigms) {
    var alias = new Map(), cell = new Map(), formIdx = new Map(), rootAlias = new Map();
    var push = function (map, kk, par) {
      if (!kk) return; if (!map.has(kk)) map.set(kk, []);
      var list = map.get(kk);
      if (!list.some(function (x) { return x.binyan === (par.binyan || "") && x.meaning === par.meaning; })) list.push({ binyan: par.binyan || "", pos: par.pos || "", meaning: par.meaning });
    };
    var pushForm = function (kk, par) {
      if (!kk) return; if (!formIdx.has(kk)) formIdx.set(kk, []);
      var list = formIdx.get(kk);
      if (!list.some(function (x) { return x.pealim_id === par.pealim_id; })) list.push({ binyan: par.binyan || "", pos: par.pos || "", meaning: par.meaning || "", pealim_id: par.pealim_id || null, root: stripNiqqud(par.root) });
    };
    var pushRoot = function (kk, par) {
      var r = stripNiqqud(par.root); if (!kk || !r) return;
      if (!rootAlias.has(kk)) rootAlias.set(kk, []);
      var list = rootAlias.get(kk);
      if (!list.some(function (x) { return x.root === r && x.pos === (par.pos || ""); })) list.push({ pos: par.pos || "", binyan: par.binyan || "", root: r });
    };
    var arr = paradigms || [];
    for (var i = 0; i < arr.length; i++) {
      var par = arr[i];
      if (!par) continue;
      if (par.meaning) { [par.root, par.lemma, par.form].forEach(function (k) { push(alias, stripNiqqud(k), par); }); }
      if (/noun|adjective|verb/.test(par.pos || "") && par.root) {
        [par.lemma, par.root, par.form].forEach(function (k) { pushRoot(stripNiqqud(k), par); });
      }
      if (par.cells) {
        var keys = Object.keys(par.cells);
        for (var j = 0; j < keys.length; j++) {
          var c = par.cells[keys[j]]; if (!c || !c.he) continue;
          if (par.meaning) push(cell, stripNiqqud(c.he), par);
          pushForm(normVowels(c.he), par);
        }
      }
    }
    return { alias: alias, cell: cell, formIdx: formIdx, rootAlias: rootAlias };
  }

  // The unit's decisive vocalized form(s): prefer the BASE (== Dicta stem skeleton)
  // when a proclitic prefix is present, else all variants (== build-notes unitFormVariants).
  function unitFormVariants(u) {
    var vs = formVariants(u.niqqud);
    var stem = stripNiqqud(u && u.stem);
    var surf = stripNiqqud(u && u.niqqud);
    if (stem && surf && stem !== surf) {
      var base = vs.filter(function (v) { return stripNiqqud(v) === stem; });
      if (base.length) return base;
    }
    return vs;
  }

  // Form-first paradigm pick: the unit's vocalized form is a cell of a POS-compatible
  // paradigm → that paradigm is the truth. Returns { meaning, pealim_id } | null.
  function formFirstResolve(maps, u) {
    if (!maps || !maps.formIdx || !u || !u.niqqud) return null;
    var pos = u.pos || "";
    if (!(pos === "verb" || pos === "noun" || pos === "adjective" || pos === "")) return null;
    var vs = unitFormVariants(u);
    for (var i = 0; i < vs.length; i++) {
      var arr = maps.formIdx.get(vs[i]); if (!arr || !arr.length) continue;
      if (pos) { var f = arr.filter(function (x) { return NOUN_KIN(x.pos, pos); }); if (f.length) arr = f; else continue; }
      if (u.binyan) { var fb = arr.filter(function (x) { return x.binyan === u.binyan; }); if (fb.length) arr = fb; }
      var ids = Array.from(new Set(arr.map(function (x) { return x.pealim_id; })));
      var pick = (ids.length === 1) ? arr[0] : (arr.find(function (x) { return x.pos === pos; }) || arr[0]);
      if (pick && pick.pealim_id) {
        // ids.length === 1 → the vocalized form is a UNIQUE paradigm cell: decisive.
        if (ids.length === 1) return { meaning: pick.meaning || null, pealim_id: pick.pealim_id, ambiguous: false, alts: [] };
        // ids.length > 1 → an homograph cell: `pick` is a best-effort guess, NOT decisive.
        // Flag it (so the badge can't claim «точно») and carry the rivals for «возможно также».
        var pickId = String(pick.pealim_id), seen = {}, alts = [];
        for (var a = 0; a < arr.length && alts.length < 3; a++) {
          var x = arr[a], key = String(x.pealim_id);
          if (!x.pealim_id || key === pickId || seen[key]) continue; seen[key] = 1;
          alts.push({ pealim_id: x.pealim_id, pos: x.pos || "", meaning: x.meaning || null, root: x.root || null });
        }
        return { meaning: pick.meaning || null, pealim_id: pick.pealim_id, ambiguous: true, alts: alts };
      }
    }
    return null;
  }

  // Offline gloss fallback: base-form alias, then unambiguous inflected-cell reverse
  // lookup (content/unclassified only; ambiguous → null). R1-honest (== build-notes).
  function offlineMeaningLookup(maps, u) {
    if (!maps) return null;
    var aKeys = [stripNiqqud(u.root), stripNiqqud(u.lemma), stripNiqqud(u.stem), stripNiqqud(u.sampleWord), stripNiqqud(u.niqqud)].filter(Boolean);
    for (var i = 0; i < aKeys.length; i++) {
      var arr = maps.alias.get(aKeys[i]); if (!arr || !arr.length) continue;
      if (u.binyan) { var m = arr.find(function (x) { return x.binyan === u.binyan; }); if (m) return m.meaning; }
      if (u.pos) { var m2 = arr.find(function (x) { return x.pos === u.pos; }); if (m2) return m2.meaning; }
      return arr[0].meaning;
    }
    if (u.pos && FUNCTION_POS.has(u.pos)) return null;
    var cKeys = [stripNiqqud(u.sampleWord), stripNiqqud(u.niqqud)].filter(Boolean);
    for (var k = 0; k < cKeys.length; k++) {
      var carr = maps.cell.get(cKeys[k]); if (!carr || !carr.length) continue;
      if (u.binyan) { var cf = carr.filter(function (x) { return x.binyan === u.binyan; }); if (cf.length) carr = cf; }
      var meanings = Array.from(new Set(carr.map(function (x) { return x.meaning; })));
      if (meanings.length === 1) return meanings[0];
      return null;
    }
    return null;
  }

  // Pealim-asserted TRUE triliteral root for a content unit (== build-notes
  // resolveTrueRoot). `verbParadigm` is the client substitute for the offline
  // gateway's resolved paradigm (step 2): the OPFS getLemmaInflection result for
  // verbs. Returns a root string or null (honest empty for ambiguous/nominal).
  function resolveTrueRoot(maps, u, verbParadigm) {
    if (!maps || !u) return null;
    var pos = u.pos || "";
    if (FUNCTION_POS.has(pos) || u.kind === "propernoun") return null;
    var compat = function (p) { return NOUN_KIN(p, pos) || p === "verb" || pos === "verb" || pos === "" || p === ""; };
    // 1) form-first (decisive)
    if (u.niqqud && maps.formIdx) {
      var vs = unitFormVariants(u);
      for (var i = 0; i < vs.length; i++) {
        var arr = maps.formIdx.get(vs[i]); if (!arr || !arr.length) continue;
        var f = arr.filter(function (x) { return x.root && compat(x.pos); });
        if (u.binyan) { var fb = f.filter(function (x) { return x.binyan === u.binyan; }); if (fb.length) f = fb; }
        var roots = Array.from(new Set(f.map(function (x) { return x.root; })));
        if (roots.length === 1) return roots[0];
        if (roots.length > 1) return null;
      }
    }
    // 2) verbs only: trust the resolved (OPFS) paradigm's root.
    if (pos === "verb" && verbParadigm && verbParadigm.root && (verbParadigm.pos || "verb") === "verb") {
      return stripNiqqud(verbParadigm.root);
    }
    // 3) base-form alias by lemma / surface — single unambiguous root only.
    if (maps.rootAlias) {
      var bKeys = [stripNiqqud(u.lemma), stripNiqqud(u.sampleWord), stripNiqqud(u.stem)].filter(Boolean);
      for (var b = 0; b < bKeys.length; b++) {
        var rarr = maps.rootAlias.get(bKeys[b]); if (!rarr || !rarr.length) continue;
        var rf = rarr.filter(function (x) { return compat(x.pos); });
        if (u.binyan) { var rfb = rf.filter(function (x) { return x.binyan === u.binyan; }); if (rfb.length) rf = rfb; }
        var rroots = Array.from(new Set(rf.map(function (x) { return x.root; })));
        if (rroots.length === 1) return rroots[0];
        if (rroots.length > 1) return null;
      }
    }
    return null;
  }

  // Whether the unit's vocalized form appears as a cell of the resolved paradigm.
  function formMatches(u, paradigm) {
    if (!u.niqqud || !paradigm || !paradigm.cells) return false;
    var vs = formVariants(u.niqqud);
    return Object.keys(paradigm.cells).some(function (k) {
      var c = paradigm.cells[k]; return c && c.he && vs.indexOf(normVowels(c.he)) >= 0;
    });
  }

  // Classify the resolution of one unit (== build-notes checkUnit). `paradigm` is the
  // resolved (OPFS) base paradigm for the unit. Returns {status, cls, reason}.
  function checkUnit(u, paradigm) {
    var pos = u.pos || "";
    var isFunction = FUNCTION_POS.has(pos);
    if (!paradigm) {
      if (isFunction) return { status: "PASS", cls: "function-no-table", reason: "no_result" };
      if (u.kind === "propernoun") return { status: "PASS", cls: "propernoun-no-table", reason: "no_result" };
      if (pos === "verb" || pos === "noun" || pos === "adjective") return { status: "FAIL", cls: "content-no-table", reason: "no_result" };
      return { status: "SUSPECT", cls: "unresolved", reason: "no_result" };
    }
    var p = paradigm, cells = p.cells || {};
    if (pos === "verb" && u.binyan && p.binyan && p.binyan !== u.binyan) {
      var twoVoice = VOICE_PARTNER[u.binyan] === p.binyan && Object.keys(cells).some(function (k) { return /^passive-/.test(k); });
      if (!twoVoice) return { status: "FAIL", cls: "wrong-binyan", reason: "got " + p.binyan + " want " + u.binyan };
    }
    if (pos === "verb" && p.kind !== "invariant") { var miss = REQUIRED.verb.filter(function (k) { return !(cells[k] && cells[k].he); }); if (miss.length) return { status: "FAIL", cls: "missing-slots", reason: "verb missing " + miss.join(",") }; }
    var rpos = p.pos || pos;
    if ((rpos === "noun" || rpos === "adjective") && p.kind !== "verb" && p.kind !== "invariant") {
      var hasNoun = (cells.s && cells.s.he) || (cells.p && cells.p.he);
      var hasAdj = REQUIRED.adjective.some(function (k) { return cells[k] && cells[k].he; });
      var hasPrep = cells["P-1s"] && cells["P-1s"].he;
      if (!hasNoun && !hasAdj && !hasPrep) return { status: "SUSPECT", cls: "nominal-thin", reason: "no nominal forms" };
    }
    if (u.niqqud && p.cells && !formMatches(u, p) && pos === "verb") return { status: "SUSPECT", cls: "form-unmatched", reason: "form " + u.niqqud + " not in paradigm" };
    if (!p.meaning && (pos === "verb" || pos === "noun" || pos === "adjective")) return { status: "SUSPECT", cls: "no-meaning", reason: "content word w/o Pealim gloss" };
    return { status: "PASS", cls: p.disambig === "best-effort" ? "best-effort" : "ok", reason: "" };
  }

  // Client base-paradigm resolver. The OFFLINE pipeline calls the inflect() gateway
  // (a multi-candidate scorer); the client has only the multi-alias index behind
  // getLemmaInflection — a SINGLE (key, binyan) read misses paradigms reachable under
  // a different alias (Dicta's defective lemma מפיה vs the dict key מאפיה; a construct
  // stem; the surface). This approaches inflect()'s COVERAGE without its scorer by
  // trying every alias the index already supports and picking the most defensible
  // POS-compatible paradigm: a vocalized FORM match (the unit literally inflects to a
  // cell — decisive, == the resolver's +20 form signal) beats an exact-binyan match
  // beats the first compatible hit. NOT homograph disambiguation by guessing — an
  // ambiguous defective key (מלה→filler vs the full מילה/מלל) is left for formFirstResolve
  // / honest-empty. `lookup(key, binyan)` may be sync or async (await-safe).
  function baseCompat(pos, p) {
    if (!p) return false;
    var pp = p.pos || "";
    if (pos === "verb") return pp === "verb" || p.kind === "verb";
    if (pos === "noun" || pos === "adjective") return NOUN_KIN(pp, pos) || pp === "verb"; // participle cross-tag
    if (pos === "preposition") return true;
    return pp === pos || pp === "" || p.kind === "invariant";
  }
  async function pickBaseParadigm(unit, lookup) {
    if (typeof lookup !== "function") return null;
    var pos = unit.pos || "";
    var isContent = pos === "verb" || pos === "noun" || pos === "adjective";
    var raw = isContent ? [unit.root, unit.lemma, unit.stem, unit.sampleWord]
      : [unit.stem, unit.lemma, unit.sampleWord];
    var keys = [];
    for (var i = 0; i < raw.length; i++) { var kk = stripNiqqud(raw[i]); if (kk && keys.indexOf(kk) < 0) keys.push(kk); }
    var binyans = unit.binyan ? [unit.binyan, ""] : [""];
    var hits = [];
    for (var k = 0; k < keys.length; k++) {
      for (var b = 0; b < binyans.length; b++) {
        var p = null; try { p = await lookup(keys[k], binyans[b]); } catch (_) { p = null; }
        if (p && baseCompat(pos, p) && hits.indexOf(p) < 0) hits.push(p);
      }
    }
    if (!hits.length) return null;
    var fm = hits.find(function (p) { return formMatches(unit, p); });
    if (fm) return fm;
    if (unit.binyan) { var bm = hits.find(function (p) { return p.binyan === unit.binyan; }); if (bm) return bm; }
    return hits[0];
  }

  // ── per-unit resolution (content) — the parity surface ─────────────────────
  // `baseParadigm` = the OPFS getLemmaInflection result (client substitute for the
  // offline inflect() gateway). Returns the resolved fields + a deterministic
  // confidence/status. Function-word premium enrichment (pealim_id via function-links)
  // is layered by the orchestrator AFTER this — kept out of the parity core.
  function resolveContentUnit(maps, u, baseParadigm) {
    var meaning = (baseParadigm && baseParadigm.meaning) || null;
    var pid = (baseParadigm && baseParadigm.pealim_id) || null;
    var channel = baseParadigm ? "paradigm" : "none";
    // form-first override (decisive homograph fix). A MULTI-ID (ambiguous) form-first cell
    // is a best-effort guess, NOT decisive — captured here so it cannot earn «точно» (F2).
    var ff = formFirstResolve(maps, u);
    var ffAmbiguous = false, ffAlts = [];
    if (ff && ff.pealim_id) {
      ffAmbiguous = !!ff.ambiguous; ffAlts = ff.alts || [];
      if (String(ff.pealim_id) !== String(pid || "")) { pid = ff.pealim_id; if (ff.meaning) meaning = ff.meaning; channel = "form-first"; }
      else { channel = "form-first"; if (!meaning && ff.meaning) meaning = ff.meaning; }
    }
    // gloss fallback (real glosses only, never fabricated).
    if (!meaning) { var fb = offlineMeaningLookup(maps, u); if (fb) { meaning = fb; if (channel === "none") channel = "meaning-fallback"; } }
    // true root (or honest empty for nouns/adj).
    var trueRoot = resolveTrueRoot(maps, u, baseParadigm);
    var check = checkUnit(u, baseParadigm);
    // deterministic confidence/status from the winning channel.
    var formHit = formMatches(u, baseParadigm) || (channel === "form-first");
    // ambiguous form-first → 0.65 (a real-but-undisambiguated gloss = «вероятно», not «точно»).
    var ambiguous = (channel === "form-first") && ffAmbiguous;
    var conf, status;
    if (channel === "form-first") { conf = ambiguous ? 0.65 : 0.92; status = "ok"; }
    else if (baseParadigm && meaning && formHit) { conf = 0.85; status = "ok"; }
    else if (baseParadigm && meaning) { conf = 0.65; status = "ok"; }
    else if (meaning) { conf = 0.6; status = "ok"; }
    else if (FUNCTION_POS.has(u.pos || "") || u.kind === "propernoun") { conf = 0.5; status = "ok"; }
    else { conf = check.status === "FAIL" ? 0.15 : 0.3; status = "review"; }
    // A form-first cell match is its OWN evidence — a thin/absent BASE paradigm (SUSPECT)
    // must not downgrade an ambiguous form-first below «вероятно» (D3). Clean form-first
    // (0.92) is already immune (conf≥0.85); this keeps the ambiguous one (0.65) at «likely».
    if (check.status === "SUSPECT" && status === "ok" && conf < 0.85 && channel !== "form-first") status = "review";
    return { meaning: meaning, pealim_id: pid ? String(pid) : null, trueRoot: trueRoot, channel: channel, check: check, confidence: conf, status: status, ambiguous: ambiguous, alts: ambiguous ? ffAlts : [] };
  }

  // Assemble the word_study body_json (== build-notes lines 388–400). `resolved`
  // from resolveContentUnit (+ optional orchestrator-set function-word fields).
  function assembleBody(u, resolved) {
    var pos = u.pos || "";
    var isContent = (pos === "verb" || pos === "noun" || pos === "adjective");
    var rootField = (pos === "verb") ? (resolved.trueRoot || u.root || "")
      : ((pos === "noun" || pos === "adjective") ? (resolved.trueRoot || "") : (u.root || ""));
    var lemmaField = isContent ? (u.lemma || u.sampleWord || "") : "";
    var body = {
      word: u.sampleWord, niqqud_variant: u.niqqud || "", root: rootField, lemma: lemmaField,
      pos: pos, part_of_speech: pos, binyan: u.binyan || "", meaning: resolved.meaning || "",
    };
    if (resolved.pealim_id) body.pealim_id = String(resolved.pealim_id);
    return body;
  }

  // Canonical dedup key: pid:<pealim_id> (homograph-safe) else norm(lemma)#pos.
  function dedupKey(body, opts) {
    // Per-form mode (opt-in): one note per SURFACE form (ff:norm(word)#pos),
    // ignoring pealim_id/lemma so inflected forms don't re-collapse.
    if (opts && opts.perForm) {
      return "ff:" + stripNiqqud(body.word || body.lemma || "") + "#" + (body.pos || "");
    }
    if (body.pealim_id) return "pid:" + body.pealim_id;
    var lem = stripNiqqud(body.lemma || body.word || "");
    return stripNiqqud(lem) + "#" + (body.pos || "");
  }

  // The per-LEMMA key for a body (pid:<pealim_id> else norm(lemma)#pos),
  // INDEPENDENT of per-form mode. Downstream consumers (Anki export, i+1
  // frontier, knowledge-map graph) group per-form notes back to one lemma with
  // this so per-form mode never bloats them.
  function lemmaKey(body) {
    if (body && body.pealim_id) return "pid:" + body.pealim_id;
    var lem = stripNiqqud((body && (body.lemma || body.word)) || "");
    return stripNiqqud(lem) + "#" + ((body && body.pos) || "");
  }

  // Group resolved units into canonical-lemma candidates. `items`: array of
  // { unit, resolved, occurrences:[{text_id,sentence_id,word_offset,surface}] }.
  // One candidate per dedup_key; occurrences unioned; best (highest-confidence)
  // resolution wins the body. NO DB writes.
  function buildCandidates(items, opts) {
    var byKey = new Map();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var body = assembleBody(it.unit, it.resolved);
      var key = dedupKey(body, opts);
      var cand = byKey.get(key);
      if (!cand) {
        cand = { dedup_key: key, body: body, confidence: it.resolved.confidence, status: it.resolved.status, occurrences: [] };
        byKey.set(key, cand);
      } else if (it.resolved.confidence > cand.confidence) {
        cand.body = body; cand.confidence = it.resolved.confidence; cand.status = it.resolved.status;
      }
      var occ = it.occurrences || [];
      for (var o = 0; o < occ.length; o++) cand.occurrences.push(occ[o]);
    }
    // stable order: review-first by lowest confidence? leave insertion order; ranking is Stage 2.
    return Array.from(byKey.values());
  }

  // Stats over a built candidate set (used by audit:autogen-quality + smoke).
  function summarize(candidates) {
    var n = candidates.length, withMeaning = 0, withRoot = 0, byStatus = {};
    for (var i = 0; i < n; i++) {
      var c = candidates[i];
      if (c.body.meaning) withMeaning++;
      if (c.body.root) withRoot++;
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    }
    return {
      candidates: n,
      meaning_rate: n ? Math.round(100 * withMeaning / n) : 0,
      root_rate: n ? Math.round(100 * withRoot / n) : 0,
      by_status: byStatus,
    };
  }

  var API = {
    // helpers
    stripNiqqud: stripNiqqud, normVowels: normVowels, formVariants: formVariants,
    FUNCTION_POS: FUNCTION_POS, CONTENT_INFLECTS: CONTENT_INFLECTS, NOUN_KIN: NOUN_KIN,
    queryLemma: queryLemma, unitFormVariants: unitFormVariants, formMatches: formMatches,
    dictaTokenToUnit: dictaTokenToUnit, pickBaseParadigm: pickBaseParadigm,
    // resolver
    buildResolverMaps: buildResolverMaps, formFirstResolve: formFirstResolve,
    offlineMeaningLookup: offlineMeaningLookup, resolveTrueRoot: resolveTrueRoot,
    checkUnit: checkUnit, resolveContentUnit: resolveContentUnit,
    // assembly
    assembleBody: assembleBody, dedupKey: dedupKey, lemmaKey: lemmaKey, buildCandidates: buildCandidates, summarize: summarize,
  };

  if (typeof window !== "undefined") window.NotesAutoGen = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
