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
  // Synchronous SHA-256 avoids thousands of sequential WebCrypto awaits while
  // preserving the preregistered UTF-8 SHA-256 ordering exactly.
  const digest = (s) => {
    const input = new TextEncoder().encode(s);
    const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(input); padded[input.length] = 0x80;
    const view = new DataView(padded.buffer);
    const bitLength = input.length * 8;
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
    view.setUint32(paddedLength - 4, bitLength >>> 0);
    const k = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
    ];
    const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    const w = new Uint32Array(64);
    for (let offset = 0; offset < paddedLength; offset += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a,b,c,d,e,f,g,hh] = h;
      for (let i = 0; i < 64; i++) {
        const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + s1 + ch + k[i] + w[i]) >>> 0;
        const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (s0 + maj) >>> 0;
        hh=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
      }
      h[0]=(h[0]+a)>>>0; h[1]=(h[1]+b)>>>0; h[2]=(h[2]+c)>>>0; h[3]=(h[3]+d)>>>0;
      h[4]=(h[4]+e)>>>0; h[5]=(h[5]+f)>>>0; h[6]=(h[6]+g)>>>0; h[7]=(h[7]+hh)>>>0;
    }
    return h.map((n) => n.toString(16).padStart(8, "0")).join("");
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
    note._order = digest(`C4-2026-07-25:${note.source_note_id}`);
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
