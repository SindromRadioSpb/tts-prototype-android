// OWNER-SIDE ONLY. Run as a DevTools Snippet on the authenticated LinguistPro origin.
// Builds 19 editable C4 drafts in page memory. It writes nothing until the owner clicks
// the explicit approval button. No fetch/network call and no note content is logged.
(async () => {
  "use strict";
  const COUNT = 19;
  const ldb = await import("/db/local-db.js");
  if (!ldb || typeof ldb.dbQuery !== "function" || typeof ldb.updateNote !== "function") {
    throw new Error("C4_LOCAL_DB_UNAVAILABLE");
  }
  const rows = await ldb.dbQuery(
    `WITH eligible AS (
       SELECT id,
              COALESCE(json_extract(body_json,'$.word'),json_extract(body_json,'$.lemma'),json_extract(body_json,'$.niqqud')) AS word_key
         FROM notes_v2
        WHERE note_type='word_study' AND COALESCE(user_touched,0)=0
          AND LENGTH(TRIM(COALESCE(json_extract(body_json,'$.meaning'),''))) > 0
          AND LENGTH(TRIM(COALESCE(json_extract(body_json,'$.word'),json_extract(body_json,'$.lemma'),json_extract(body_json,'$.niqqud'),''))) > 0
     ), candidate_ids AS (
       SELECT MIN(id) AS id
         FROM eligible
        GROUP BY word_key
        ORDER BY MIN(id)
        LIMIT 2000
     ), candidates AS (
       SELECT n.id, n.body_json, n.user_touched
         FROM notes_v2 n JOIN candidate_ids c ON c.id=n.id
     )
     SELECT n.id, n.body_json, n.user_touched
       FROM candidates n
      ORDER BY n.id`, []);
  const text = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  const drafts = [];
  const seenWords = new Set();
  for (const row of rows || []) {
    let body = {}; try { body = JSON.parse(row.body_json || "{}"); } catch (_) { continue; }
    const hasPersonal = (String(body.meaning_source || "") === "user" && text(body.meaning, 1000)) ||
      String(body.personal_note_provenance || "").startsWith("owner_");
    if (hasPersonal) continue;
    const word = text(body.word || body.lemma || body.niqqud, 100);
    const niqqud = text(body.niqqud || body.niqqud_variant, 120);
    const meaning = text(body.meaning, 500);
    const root = text(body.root, 100);
    const storedExample = text(body.example_sentence, 1200);
    const wordKey = word.normalize("NFKD").replace(/[\u0591-\u05C7]/g, "");
    if (!word || !meaning || seenWords.has(wordKey)) continue;
    seenWords.add(wordKey);
    const display = niqqud || word;
    drafts.push({
      id: String(row.id), word, niqqud, root,
      meaning,
      mnemonic: root
        ? `Свяжите ${display} с корнем ${root}; опорный перевод — «${meaning}».`
        : `Свяжите форму ${display} с опорным переводом «${meaning}».`,
      example: storedExample || `אני לומד את המילה ${display}.`,
      exampleSource: storedExample ? "сохранённый" : "шаблонный",
    });
    if (drafts.length === COUNT) break;
  }
  if (drafts.length !== COUNT) throw new Error(`C4_NOT_ENOUGH_DRAFT_CANDIDATES candidates=${drafts.length}`);

  document.getElementById("c4-draft-review")?.remove();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const overlay = document.createElement("section");
  overlay.id = "c4-draft-review";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="c4-panel">
      <header><div><strong>C4 · 19 черновиков</strong><p>До вашего подтверждения в заметки ничего не записано.</p></div><button type="button" data-c4-cancel aria-label="Закрыть">×</button></header>
      <div class="c4-warning">Перевод взят из существующей словарной карточки. Мнемоника создана агентом. Пример помечен как сохранённый или шаблонный; исправьте любые поля перед утверждением.</div>
      <div class="c4-list">${drafts.map((d, i) => `
        <article class="c4-card" data-c4-id="${esc(d.id)}">
          <h3><span>${i + 1}.</span> <b dir="rtl">${esc(d.niqqud || d.word)}</b></h3>
          <label>Перевод<input data-c4-meaning maxlength="500" value="${esc(d.meaning)}"></label>
          <label>Мнемоника<textarea data-c4-mnemonic maxlength="2000" rows="2">${esc(d.mnemonic)}</textarea></label>
          <label>Пример · ${esc(d.exampleSource)}<textarea data-c4-example maxlength="2000" rows="2" dir="rtl">${esc(d.example)}</textarea></label>
        </article>`).join("")}</div>
      <footer><button type="button" data-c4-cancel>Отмена — ничего не записывать</button><button type="button" data-c4-approve>Утвердить 19 заметок</button></footer>
    </div>`;
  const style = document.createElement("style");
  style.textContent = `
    #c4-draft-review{position:fixed;inset:0;z-index:2147483647;background:rgba(12,18,28,.72);padding:24px;overflow:auto;font:15px/1.4 system-ui;color:#18202a}
    #c4-draft-review .c4-panel{max-width:900px;margin:auto;background:#f8fafc;border-radius:18px;box-shadow:0 24px 80px #0008;overflow:hidden}
    #c4-draft-review header,#c4-draft-review footer{position:sticky;z-index:2;background:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}
    #c4-draft-review header{top:0;border-bottom:1px solid #dce3ea} #c4-draft-review footer{bottom:0;border-top:1px solid #dce3ea;justify-content:flex-end}
    #c4-draft-review header strong{font-size:22px} #c4-draft-review header p{margin:3px 0 0;color:#536171} #c4-draft-review header button{font-size:28px;border:0;background:none;cursor:pointer}
    #c4-draft-review .c4-warning{margin:18px 20px;padding:12px 14px;border-radius:10px;background:#fff4d6;color:#654b00}
    #c4-draft-review .c4-list{padding:0 20px 20px;display:grid;gap:14px}
    #c4-draft-review .c4-card{background:#fff;border:1px solid #dce3ea;border-radius:12px;padding:14px} #c4-draft-review h3{margin:0 0 10px;font-size:20px}
    #c4-draft-review label{display:block;margin:8px 0;color:#536171;font-size:13px} #c4-draft-review input,#c4-draft-review textarea{box-sizing:border-box;width:100%;margin-top:4px;padding:9px 10px;border:1px solid #b9c4d0;border-radius:8px;background:#fff;color:#18202a;font:15px/1.35 system-ui}
    #c4-draft-review button{padding:10px 15px;border:1px solid #b9c4d0;border-radius:9px;background:#fff;cursor:pointer} #c4-draft-review [data-c4-approve]{background:#1769e0;color:#fff;border-color:#1769e0;font-weight:700}
    #c4-draft-review button:disabled{opacity:.55;cursor:wait}`;
  overlay.prepend(style);
  document.body.appendChild(overlay);
  overlay.querySelectorAll("[data-c4-cancel]").forEach((button) => button.addEventListener("click", () => overlay.remove()));
  overlay.querySelector("[data-c4-approve]").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const approved = [...overlay.querySelectorAll(".c4-card")].map((card) => ({
      id: card.dataset.c4Id,
      meaning: text(card.querySelector("[data-c4-meaning]").value, 500),
      mnemonic: text(card.querySelector("[data-c4-mnemonic]").value, 2000),
      example: text(card.querySelector("[data-c4-example]").value, 2000),
    }));
    if (approved.length !== COUNT || approved.some((d) => !d.meaning || !d.mnemonic || !d.example)) {
      alert("C4 approval stopped: all 19 drafts need translation, mnemonic and example."); return;
    }
    button.disabled = true; button.textContent = "Сохраняю…";
    const originals = [];
    try {
      for (const draft of approved) {
        const current = (await ldb.dbQuery("SELECT body_json, user_touched FROM notes_v2 WHERE id=?", [draft.id]))[0];
        if (!current || Number(current.user_touched) === 1) throw new Error(`C4_NOTE_CHANGED id=${draft.id}`);
        const body = JSON.parse(current.body_json || "{}");
        originals.push({ id: draft.id, body, user_touched: Number(current.user_touched) === 1 });
        body.meaning = draft.meaning; body.meaning_source = "user";
        body.mnemonic = draft.mnemonic; body.example_sentence = draft.example;
        body.personal_note_provenance = "owner_approved_agent_draft";
        body.personal_note_approved_at = new Date().toISOString();
        await ldb.updateNote(draft.id, { body, user_touched: 1 });
      }
      overlay.remove();
      alert("C4: 19 заметок утверждены и сохранены. Теперь можно запускать frozen selector.");
    } catch (error) {
      for (const original of originals.reverse()) {
        try { await ldb.updateNote(original.id, { body: original.body, user_touched: original.user_touched }); } catch (_) {}
      }
      button.disabled = false; button.textContent = "Утвердить 19 заметок";
      alert(`C4 approval rolled back: ${error.message || error}`);
    }
  });
})().catch((error) => {
  const message = String(error && error.message || error);
  try { console.error(`[C4_DRAFT_REVIEW_STOPPED] ${message}`); } catch (_) {}
  alert(`C4 draft review stopped: ${message}`);
});
