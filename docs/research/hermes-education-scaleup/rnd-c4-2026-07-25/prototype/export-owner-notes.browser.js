// OWNER-SIDE ONLY. Paste/run as a DevTools Snippet on the authenticated LinguistPro origin.
// It reads OPFS locally, selects exactly 20 notes by the frozen preregistration rule and downloads
// one private JSON file. No fetch/network call, no console dump of note content.
(async () => {
  "use strict";
  const ldb = await import("/db/local-db.js");
  if (!ldb || typeof ldb.dbQuery !== "function") throw new Error("C4_LOCAL_DB_UNAVAILABLE");
  const rows = await ldb.dbQuery(
    `SELECT n.id, n.body_json, n.user_touched,
            s.he_niqqud AS context_he_niqqud, s.he_plain AS context_he, s.ru AS context_ru
       FROM notes_v2 n
       LEFT JOIN note_occurrences o
         ON o.id = (SELECT MIN(o2.id) FROM note_occurrences o2 WHERE o2.note_id=n.id)
       LEFT JOIN sentences s ON s.id=o.sentence_id
      WHERE n.note_type='word_study' AND COALESCE(n.user_touched,0)=1
      ORDER BY n.id`, []);
  const asText = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  const digest = async (s) => {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const eligible = [];
  for (const row of rows || []) {
    let b = {}; try { b = JSON.parse(row.body_json || "{}"); } catch (_) { continue; }
    const personal = {
      meaning: String(b.meaning_source || "") === "user" ? asText(b.meaning, 1000) : "",
      mnemonic: asText(b.mnemonic, 2000),
      explanation: asText(b.explanation || b.semantic_note || b.my_note, 3000),
      example_sentence: asText(b.example_sentence, 2000),
    };
    const filled = Object.values(personal).filter(Boolean);
    if (!filled.length) continue;
    const contextHe = asText(row.context_he_niqqud || row.context_he, 2000);
    const contextRu = asText(row.context_ru, 1000);
    const note = {
      source_note_id: String(row.id),
      word: asText(b.word || b.lemma || b.niqqud, 100),
      query_context: contextHe ? (contextRu ? `${contextHe} — ${contextRu}` : contextHe) : asText(b.example_sentence, 3000),
      dictionary_facts: {
        niqqud: asText(b.niqqud, 200), root: asText(b.root, 100), pos: asText(b.pos, 100),
        binyan: asText(b.binyan, 100),
        gloss: String(b.meaning_source || "") === "user" ? asText(b.reference_meaning, 500) : asText(b.meaning, 500),
      },
      personal_note: personal,
    };
    if (!note.word) continue;
    note._rich = filled.length >= 2 || filled.join(" ").length >= 120;
    note._order = await digest(`C4-2026-07-25:${note.source_note_id}`);
    eligible.push(note);
  }
  const rich = eligible.filter((n) => n._rich).sort((a, b) => a._order.localeCompare(b._order));
  const ordinary = eligible.filter((n) => !n._rich).sort((a, b) => a._order.localeCompare(b._order));
  let selected = [...rich.slice(0, 10), ...ordinary.slice(0, 10)];
  if (selected.length < 20) {
    const used = new Set(selected.map((n) => n.source_note_id));
    selected.push(...eligible.filter((n) => !used.has(n.source_note_id)).sort((a, b) => a._order.localeCompare(b._order)).slice(0, 20 - selected.length));
  }
  if (selected.length !== 20) throw new Error(`C4_NOT_ENOUGH_ELIGIBLE_NOTES eligible=${eligible.length}`);
  selected = selected.sort((a, b) => a._order.localeCompare(b._order)).map(({ _rich, _order, ...n }) => n);
  const payload = { schema_version: "c4.notes.1", dataset_class: "owner-private", notes: selected };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = "c4-owner-private-notes.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  alert(`C4 private dataset downloaded: 20 notes (eligible ${eligible.length}; rich ${rich.length}; ordinary ${ordinary.length}). Keep it outside git.`);
})().catch((error) => alert(`C4 export stopped: ${error.message || error}`));
