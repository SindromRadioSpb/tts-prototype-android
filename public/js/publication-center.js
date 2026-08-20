(function (root) {
  "use strict";

  const state = { me: null, corpora: [], detail: null, groups: [], selectedId: "", creating: false, validation: null, receipt: null, busy: false, publishArmed: false, pendingMyTextIds: [] };
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  function tt(key, fallback, vars) {
    let value = fallback;
    try { const translated = typeof root.t === "function" ? root.t(key) : ""; if (translated && translated !== key) value = translated; } catch (_) {}
    for (const [name, replacement] of Object.entries(vars || {})) value = String(value).replaceAll("{" + name + "}", String(replacement));
    return value;
  }
  function key() {
    try { return crypto.randomUUID(); } catch (_) { return "pc-" + Date.now() + "-" + Math.random().toString(16).slice(2); }
  }
  function csrf() { try { return localStorage.getItem("cloud.csrf") || ""; } catch (_) { return ""; } }
  async function api(path, options) {
    const opts = options || {};
    const headers = { Accept: "application/json", ...(opts.headers || {}) };
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["X-LP-CSRF"] = csrf();
      headers["X-Idempotency-Key"] = opts.idempotencyKey || key();
    }
    const response = await fetch(path, { method: opts.method || "GET", credentials: "same-origin", cache: "no-store", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) { const error = new Error(json.error || "HTTP_" + response.status); error.code = json.error || "HTTP_" + response.status; throw error; }
    return json;
  }
  function announce(message, tone) {
    const node = $("pcStatus");
    if (!node) return;
    node.textContent = message || "";
    node.dataset.tone = tone || "";
  }
  function errorText(error) {
    const code = String(error && (error.code || error.message) || "PUBLICATION_FAILED");
    return tt("publication.errors." + code, tt("publication.errorGeneric", "The action could not be completed.")) + " [" + code + "]";
  }
  async function run(action, success) {
    if (state.busy) return;
    state.busy = true; render(); announce(tt("publication.working", "Working…"));
    try { await action(); if (success) announce(success, "success"); }
    catch (error) { announce(errorText(error), "error"); }
    finally { state.busy = false; render(); }
  }
  function currentCorpus() { return state.corpora.find(corpus => corpus.corpus_id === state.selectedId) || null; }
  function publicUrl(corpus) { return location.origin + "/library.html#public=" + encodeURIComponent(corpus.slug); }

  async function refreshList(preferredId) {
    const payload = await api("/api/publication/corpora");
    state.corpora = payload.corpora || [];
    if (preferredId) state.selectedId = preferredId;
    if (!state.selectedId || !state.corpora.some(corpus => corpus.corpus_id === state.selectedId)) state.selectedId = state.corpora[0] && state.corpora[0].corpus_id || "";
    await refreshDetail();
  }
  async function refreshDetail() {
    state.validation = null;
    if (!state.selectedId) { state.detail = null; return; }
    const payload = await api("/api/publication/corpora/" + encodeURIComponent(state.selectedId));
    state.detail = payload.corpus;
  }
  async function refreshGroups() {
    try { const payload = await api("/api/group-corpora"); state.groups = (payload.corpora || []).filter(corpus => String(corpus.role || "").toUpperCase() === "OWNER"); }
    catch (_) { state.groups = []; }
  }
  async function checkOwner() {
    let session = null;
    try {
      session = root.CloudSync && root.CloudSync.me ? await root.CloudSync.me() : await api("/api/auth/me");
    } catch (_) {}
    state.me = session && session.user ? session.user : null;
    const owner = !!(state.me && String(state.me.role || "").toLowerCase() === "owner");
    const entry = $("publicationCenterEntry"); if (entry) entry.hidden = !owner;
    return owner;
  }
  async function open(options) {
    state.pendingMyTextIds = Array.isArray(options && options.myTextIds) ? options.myTextIds.map(String) : [];
    const dialog = $("publicationCenterDialog"); if (!dialog) return;
    if (!await checkOwner()) { if (typeof root.showToast === "function") root.showToast(tt("publication.ownerOnly", "Publication Center is available to the owner."), "warning"); return; }
    state.creating = false; state.receipt = null; state.publishArmed = false;
    dialog.showModal();
    announce(tt("publication.loading", "Loading publication records…"));
    try { await Promise.all([refreshList(), refreshGroups()]); render(); announce(""); }
    catch (error) { render(); announce(errorText(error), "error"); }
    setTimeout(() => { const focus = dialog.querySelector("button, input"); if (focus) focus.focus(); }, 0);
  }
  function close() { const dialog = $("publicationCenterDialog"); if (dialog && dialog.open) dialog.close(); }
  function renderSpine() {
    const host = $("pcCorpusList"); if (!host) return;
    host.innerHTML = state.corpora.map(corpus => `<button type="button" class="pc-corpus-tab" data-corpus-id="${esc(corpus.corpus_id)}" aria-current="${corpus.corpus_id === state.selectedId}"><span>${esc(corpus.title)}</span><small>${esc(corpus.status)}</small></button>`).join("");
    host.querySelectorAll("[data-corpus-id]").forEach(button => button.addEventListener("click", () => run(async () => { state.creating = false; state.selectedId = button.dataset.corpusId; await refreshDetail(); }, "")));
  }
  function renderCreate() {
    return `<form id="pcCreateForm" class="pc-form">
      <label>${esc(tt("publication.fields.title", "Corpus title"))}<input name="title" required maxlength="500" value="${esc(tt("publication.studySongsTitle", "Study Songs"))}"></label>
      <label>${esc(tt("publication.fields.slug", "Public address"))}<input name="slug" required maxlength="80" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value="study-songs" dir="ltr"></label>
      <label>${esc(tt("publication.fields.description", "Description"))}<textarea name="description" maxlength="4000">${esc(tt("publication.studySongsDescription", "Songs for language study with text, translation and original audio."))}</textarea></label>
      <div class="pc-actions"><button class="pc-btn pc-btn-primary" type="submit">${esc(tt("publication.create", "Create corpus"))}</button></div>
    </form>`;
  }
  function rightsReady(item) {
    return ["PUBLIC_READ", "PUBLIC_STREAM", "PACKAGE_DOWNLOAD"].every(permission => item.rights && item.rights[permission] && Number(item.rights[permission].allowed) === 1);
  }
  function renderItems(detail) {
    const items = detail.items || [];
    if (!items.length) return `<div class="pc-empty">${esc(tt("publication.emptyDraft", "Copy materials into this edition to begin."))}</div>`;
    return `<div class="pc-item-list">${items.map((item, index) => `<div class="pc-item">
      <span class="pc-item-position">${String(index + 1).padStart(2, "0")}</span>
      <div><div class="pc-item-title" title="${esc(item.title)}">${esc(item.title)}</div><div class="pc-item-meta">${esc(item.source_domain)} · ${rightsReady(item) ? esc(tt("publication.rightsReady", "rights ready")) : esc(tt("publication.rightsPending", "rights pending"))}</div></div>
      <div class="pc-move"><button type="button" data-move="up" data-item="${esc(item.item_id)}" aria-label="${esc(tt("publication.moveUp", "Move up"))}" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-move="down" data-item="${esc(item.item_id)}" aria-label="${esc(tt("publication.moveDown", "Move down"))}" ${index === items.length - 1 ? "disabled" : ""}>↓</button></div>
    </div>`).join("")}</div>`;
  }
  function renderValidation() {
    const value = state.validation; if (!value) return "";
    const issues = (value.blockers || []).map(issue => `<div class="pc-issue">${esc(issue.code)}${issue.permission ? " · " + esc(issue.permission) : ""}</div>`).join("");
    return `<div class="pc-metrics"><div class="pc-metric"><b>${value.item_count}</b><span>${esc(tt("publication.metrics.materials", "materials"))}</span></div><div class="pc-metric"><b>${value.included_assets}</b><span>${esc(tt("publication.metrics.audio", "audio files"))}</span></div><div class="pc-metric"><b>${value.asset_missing}</b><span>${esc(tt("publication.metrics.missing", "technical exceptions"))}</span></div></div>${issues ? `<div class="pc-section">${issues}</div>` : ""}`;
  }
  function renderReceipt() {
    if (!state.receipt) return "";
    const r = state.receipt;
    return `<div class="pc-receipt"><strong>${esc(tt("publication.receiptTitle", "Publication committed"))}</strong><br>${esc(tt("publication.edition", "Edition"))} ${esc(r.edition_number)} · ${esc(r.item_count)} ${esc(tt("publication.metrics.materials", "materials"))} · ${esc(r.asset_count)} ${esc(tt("publication.metrics.audio", "audio files"))}<br><code>${esc(r.manifest_sha256)}</code><br><a href="${esc(publicUrl(state.detail))}" target="_blank" rel="noopener">${esc(publicUrl(state.detail))}</a></div>`;
  }
  function renderDetail(detail) {
    const draft = detail.draft;
    const groupOptions = state.groups.map(group => `<option value="${esc(group.corpus_id)}">${esc(group.title)}</option>`).join("");
    const canPublish = draft && detail.items && detail.items.length && state.validation && state.validation.ready;
    const published = detail.current_edition_id;
    const withdrawn = detail.status === "WITHDRAWN";
    return `<div class="pc-grid"><div>
      <section class="pc-section"><div class="pc-section-title"><h4>${esc(tt("publication.draftTitle", "Edition draft"))}</h4><span class="pc-section-note">${draft ? "v" + esc(draft.version) : esc(tt("publication.noActiveDraft", "no active draft"))}</span></div>${draft ? renderItems(detail) : `<div class="pc-empty">${esc(tt("publication.publishedImmutable", "The published edition is immutable. Create a new edition to make changes."))}</div>`}</section>
      ${draft ? `<section class="pc-section"><div class="pc-section-title"><h4>${esc(tt("publication.copyTitle", "Copy source materials"))}</h4><span class="pc-section-note">${esc(tt("publication.copyNotMove", "copy, never move"))}</span></div>
        <div class="pc-form"><label>${esc(tt("publication.studySongsSource", "Study Songs source"))}<select id="pcGroupSource" ${groupOptions ? "" : "disabled"}>${groupOptions || `<option>${esc(tt("publication.noGroupSource", "No owner corpus available"))}</option>`}</select></label></div>
        <div class="pc-actions"><button id="pcCopyGroup" class="pc-btn" type="button" ${groupOptions ? "" : "disabled"}>${esc(tt("publication.copyAllSongs", "Copy all Study Songs"))}</button><button id="pcCopyMine" class="pc-btn" type="button" ${state.pendingMyTextIds.length ? "" : "disabled"}>${esc(tt("publication.copySelectedMine", "Copy selected My Texts"))} (${state.pendingMyTextIds.length})</button></div>
      </section>` : ""}
      <section class="pc-section"><div class="pc-section-title"><h4>${esc(tt("publication.previewTitle", "Readiness and preview"))}</h4><span class="pc-section-note">${esc(tt("publication.readbackNote", "canonical read-back before pointer switch"))}</span></div>${renderValidation()}${renderReceipt()}</section>
    </div><aside>
      ${draft ? `<section class="pc-section"><div class="pc-section-title"><h4>${esc(tt("publication.rightsTitle", "Rights facts"))}</h4></div><div class="pc-rights"><strong>OWNER_ATTESTATION_2026_08_20</strong><br>${esc(tt("publication.rightsBody", "Creates separate public read, stream and package-download facts for every selected material."))}</div><div class="pc-actions"><button id="pcApplyRights" class="pc-btn" type="button" ${detail.items.length ? "" : "disabled"}>${esc(tt("publication.applyPreset", "Apply Study Songs preset"))}</button></div></section>` : ""}
      <section class="pc-section"><div class="pc-section-title"><h4>${esc(tt("publication.releaseTitle", "Release"))}</h4></div><div class="pc-actions">
        ${draft ? `<button id="pcValidate" class="pc-btn" type="button">${esc(tt("publication.validate", "Check edition"))}</button><button id="pcPublish" class="pc-btn pc-btn-seal" type="button" ${canPublish ? "" : "disabled"}>${esc(state.publishArmed ? tt("publication.confirmPublish", "Confirm publish") : tt("publication.publish", "Publish edition"))}</button>` : ""}
        ${published ? `<button id="pcWithdraw" class="pc-btn pc-btn-danger" type="button">${esc(tt("publication.withdraw", "Withdraw public pointer"))}</button>` : ""}
        ${withdrawn && detail.editions && detail.editions.length ? `<button id="pcRestore" class="pc-btn" type="button">${esc(tt("publication.restore", "Restore latest edition"))}</button>` : ""}
        ${!draft && detail.editions && detail.editions.length ? `<button id="pcRevision" class="pc-btn" type="button">${esc(tt("publication.newEdition", "Prepare new edition"))}</button>` : ""}
        ${detail.editions && detail.editions.length > 1 ? `<button id="pcRollback" class="pc-btn" type="button">${esc(tt("publication.rollback", "Point to previous edition"))}</button>` : ""}
      </div>${published ? `<p class="pc-section-note"><a href="${esc(publicUrl(detail))}" target="_blank" rel="noopener">${esc(tt("publication.openPublic", "Open public corpus"))}</a></p>` : ""}</section>
      <section class="pc-section"><div class="pc-section-title"><h4>${esc(tt("publication.auditTitle", "Immutable history"))}</h4><span class="pc-section-note">${(detail.events || []).length}</span></div><div class="pc-item-list">${(detail.events || []).slice(0, 8).map(event => `<div class="pc-item"><span class="pc-item-position">${esc(event.event_type.slice(0,2))}</span><div><div class="pc-item-title">${esc(event.event_type)}</div><div class="pc-item-meta">${esc(event.occurred_at)}</div></div></div>`).join("") || `<div class="pc-empty">${esc(tt("publication.noEvents", "No events yet."))}</div>`}</div></section>
    </aside></div>`;
  }
  function render() {
    renderSpine();
    const body = $("pcBody"); if (!body) return;
    const corpus = state.detail || currentCorpus();
    $("pcContextTitle").textContent = state.creating || !corpus ? tt("publication.newCorpus", "New public corpus") : corpus.title;
    $("pcContextSubtitle").textContent = state.creating || !corpus ? tt("publication.createHelp", "Create the public address and its first private draft.") : corpus.slug + " · " + corpus.status;
    body.innerHTML = state.creating || !corpus ? renderCreate() : renderDetail(corpus);
    wire();
    body.querySelectorAll("button, input, textarea, select").forEach(node => { if (state.busy) node.disabled = true; });
  }
  function mutation(path, body, success) {
    return run(async () => { await api(path, { method: "POST", body }); state.publishArmed = false; await refreshList(state.selectedId); }, success);
  }
  function wire() {
    const form = $("pcCreateForm"); if (form) form.addEventListener("submit", event => { event.preventDefault(); const data = new FormData(form); run(async () => { const out = await api("/api/publication/corpora", { method: "POST", body: { title: data.get("title"), slug: data.get("slug"), description: data.get("description") } }); state.creating = false; await refreshList(out.corpus_id); }, tt("publication.created", "Corpus created.")); });
    const copyGroup = $("pcCopyGroup"); if (copyGroup) copyGroup.addEventListener("click", () => run(async () => { const source = $("pcGroupSource").value; const catalog = await api("/api/group-corpora/" + encodeURIComponent(source) + "/works"); const workIds = (catalog.works || []).map(work => work.work_id); if (!workIds.length) throw Object.assign(new Error("SOURCE_SNAPSHOT_INVALID"), { code: "SOURCE_SNAPSHOT_INVALID" }); await api("/api/publication/corpora/" + encodeURIComponent(state.selectedId) + "/draft/items:copy", { method: "POST", body: { sourceDomain: "GROUP_CORPUS", sourceCorpusId: source, workIds, expectedVersion: state.detail.draft.version } }); await refreshList(state.selectedId); }, tt("publication.copiedSongs", "Study Songs were copied into the draft.")));
    const copyMine = $("pcCopyMine"); if (copyMine) copyMine.addEventListener("click", () => run(async () => { const bridge = root.v3PublicationBuildSelectedItems; if (typeof bridge !== "function") throw new Error("SOURCE_SNAPSHOT_INVALID"); const items = await bridge(state.pendingMyTextIds); await api("/api/publication/corpora/" + encodeURIComponent(state.selectedId) + "/draft/items:copy", { method: "POST", body: { sourceDomain: "MY_TEXTS", items, expectedVersion: state.detail.draft.version } }); state.pendingMyTextIds = []; await refreshList(state.selectedId); }, tt("publication.copiedMine", "Selected texts were copied into the draft.")));
    const rights = $("pcApplyRights"); if (rights) rights.addEventListener("click", () => mutation("/api/publication/corpora/" + encodeURIComponent(state.selectedId) + "/draft/rights:apply-study-songs-preset", { itemIds: state.detail.items.map(item => item.item_id), expectedVersion: state.detail.draft.version, preset: { public_read_allowed: true, public_stream_allowed: true, package_download_allowed: true, basis: "OWNER_ATTESTATION_2026_08_20", asserted_at: "2026-08-20" } }, tt("publication.rightsApplied", "Per-material rights facts were recorded.")));
    const validate = $("pcValidate"); if (validate) validate.addEventListener("click", () => run(async () => { state.validation = await api("/api/publication/corpora/" + encodeURIComponent(state.selectedId) + "/draft:validate", { method: "POST", body: { expectedVersion: state.detail.draft.version } }); }, tt("publication.validated", "Edition check completed.")));
    const publish = $("pcPublish"); if (publish) publish.addEventListener("click", () => { if (!state.publishArmed) { state.publishArmed = true; render(); announce(tt("publication.publishWarning", "This creates an immutable edition and switches the public pointer. Review once more, then confirm.")); return; } run(async () => { state.receipt = await api("/api/publication/corpora/" + encodeURIComponent(state.selectedId) + ":publish", { method: "POST", body: { expectedVersion: state.detail.draft.version } }); state.publishArmed = false; await refreshList(state.selectedId); }, tt("publication.published", "Edition published.")); });
    const withdraw = $("pcWithdraw"); if (withdraw) withdraw.addEventListener("click", () => mutation("/api/publication/corpora/" + encodeURIComponent(state.selectedId) + ":withdraw", { reasonCode: "OWNER_WITHDRAWAL" }, tt("publication.withdrawn", "Public pointer withdrawn; history retained.")));
    const restore = $("pcRestore"); if (restore) restore.addEventListener("click", () => mutation("/api/publication/corpora/" + encodeURIComponent(state.selectedId) + ":restore", { editionId: state.detail.editions[0].edition_id, reasonCode: "OWNER_RESTORE" }, tt("publication.restored", "Edition restored.")));
    const revision = $("pcRevision"); if (revision) revision.addEventListener("click", () => mutation("/api/publication/corpora/" + encodeURIComponent(state.selectedId) + "/draft:new-revision", {}, tt("publication.revisionCreated", "A new editable draft was created from the published edition.")));
    const rollback = $("pcRollback"); if (rollback) rollback.addEventListener("click", () => mutation("/api/publication/corpora/" + encodeURIComponent(state.selectedId) + ":rollback", { editionId: state.detail.editions[1].edition_id, reasonCode: "OWNER_POINTER_ROLLBACK" }, tt("publication.rolledBack", "Public pointer moved to the previous immutable edition.")));
    document.querySelectorAll("#pcBody [data-move]").forEach(button => button.addEventListener("click", () => { const ids = state.detail.items.map(item => item.item_id); const from = ids.indexOf(button.dataset.item); const to = button.dataset.move === "up" ? from - 1 : from + 1; if (from < 0 || to < 0 || to >= ids.length) return; [ids[from], ids[to]] = [ids[to], ids[from]]; mutation("/api/publication/corpora/" + encodeURIComponent(state.selectedId) + "/draft/items:reorder", { itemIds: ids, expectedVersion: state.detail.draft.version }, tt("publication.reordered", "Material order updated.")); }));
  }

  function init() {
    const dialog = $("publicationCenterDialog"); if (!dialog) return;
    $("publicationCenterClose").addEventListener("click", close);
    $("publicationCenterEntry")?.addEventListener("click", () => open());
    $("pcNewCorpus")?.addEventListener("click", () => { state.creating = true; state.detail = null; render(); });
    dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
    checkOwner().then(owner => { if (owner && location.hash === "#publication-center") open(); });
  }
  root.PublicationCenter = { open, close, refresh: () => refreshList(state.selectedId) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})(window);
