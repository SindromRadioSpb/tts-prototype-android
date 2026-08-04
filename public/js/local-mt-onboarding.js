// Invite-beta UX for the shared Companion's independently gated local MT capability.
(function () {
  "use strict";

  var client = null;
  var config = { beta: false };
  var pollTimer = null;

  function el(id) { return document.getElementById(id); }
  function T(key, fallback) {
    var value = typeof window.t === "function" ? window.t(key) : key;
    return value && value !== key ? value : fallback;
  }
  function setStatus(value, bad) {
    var node = el("localMtBetaStatus");
    if (node) { node.textContent = value || ""; node.dataset.error = bad ? "true" : "false"; }
  }
  function errorText(error) {
    var raw = String(error && (error.message || error.code) || "LOCAL_MT_ERROR");
    var code = raw.split(":", 1)[0];
    var known = {
      MODEL_DISK_LOW: T("studio.localMt.errDisk", "Not enough free disk space for exact download/conversion/activation."),
      MODEL_RUNTIME_FILE_HASH_MISMATCH: T("studio.localMt.errIntegrity", "The local runtime snapshot failed its exact SHA-256 gate."),
      MODEL_SOURCE_INTEGRITY_FAILED: T("studio.localMt.errIntegrity", "The exact upstream download failed its SHA-256 gate."),
      MODEL_CONVERSION_FAILED: T("studio.localMt.errConversion", "Pinned conversion failed; the model was not activated."),
      LOCAL_MT_ABSENT: T("studio.localMt.errDown", "Start the Companion. No cloud provider was called."),
      LOCAL_MT_CONSENT_REQUIRED: T("studio.localMt.errConsent", "Accept the license, resource, privacy, and draft-quality statement first."),
    };
    return known[code] || code;
  }
  function ensureClient() {
    if (!window.LocalMtClient) throw new Error("LOCAL_MT_CLIENT_UNAVAILABLE");
    if (!client) client = new window.LocalMtClient.Client();
    return client;
  }

  function ensureModal() {
    if (el("localMtBetaModal")) return;
    var modal = document.createElement("div");
    modal.id = "localMtBetaModal";
    modal.className = "local-asr-beta-modal";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = [
      '<div class="local-asr-beta-panel">',
      '<button id="localMtClose" class="local-asr-beta-close" type="button" aria-label="Close">×</button>',
      '<div class="local-asr-beta-eyebrow">WINDOWS INVITE-ONLY BETA</div>',
      '<h2 id="localMtTitle"></h2>',
      '<p id="localMtIntro" class="local-asr-beta-intro"></p>',
      '<div class="local-asr-privacy"><span>TEXT</span><b>→</b><code>127.0.0.1:8799</code><b>→</b><span>MADLAD</span><em>CLOUD OFF</em></div>',
      '<div id="localMtRequirements" class="local-asr-requirements"></div>',
      '<ol class="local-asr-steps">',
      '<li><div><b id="localMtPairTitle"></b><span id="localMtPairNote"></span></div><div class="local-asr-inline"><input id="localMtToken" type="password" autocomplete="off" spellcheck="false"><button id="localMtPair" class="btn-secondary" type="button"></button></div></li>',
      '<li><div><b id="localMtModelTitle"></b><span id="localMtModelState"></span><progress id="localMtProgress" max="100" value="0"></progress></div><div class="local-asr-actions"><button id="localMtInstall" class="btn-primary" type="button"></button><button id="localMtInstallCancel" class="btn-secondary" type="button"></button><button id="localMtDelete" class="btn-secondary" type="button"></button></div></li>',
      '<li><label><input id="localMtConsent" type="checkbox"> <span id="localMtConsentText"></span></label></li>',
      '<li><div><b id="localMtRuntimeTitle"></b><span id="localMtRuntimeNote"></span></div><div class="local-asr-actions"><button id="localMtWarmup" class="btn-secondary" type="button"></button><button id="localMtUnload" class="btn-secondary" type="button"></button></div></li>',
      '</ol>',
      '<div id="localMtBetaStatus" class="local-asr-beta-status" aria-live="polite"></div>',
      '</div>',
    ].join("");
    document.body.appendChild(modal);
    bind();
    localize();
  }

  function localize() {
    var values = {
      localMtTitle: ["studio.localMt.title", "MADLAD local translation"],
      localMtIntro: ["studio.localMt.intro", "Translation stays on this computer. A local error never calls Gemini or Google automatically. Results are correctable machine drafts."],
      localMtRequirements: ["studio.localMt.requirements", "Windows 11 · NVIDIA CUDA · 8 GB VRAM · Chrome · model 10.74 GB · up to 60 GB free for exact-revision download, conversion, and verified activation"],
      localMtPairTitle: ["studio.localMt.pairTitle", "Pair this browser session"],
      localMtPairNote: ["studio.localMt.pairNote", "Use the same Companion token as Local ASR. It remains in session storage only."],
      localMtModelTitle: ["studio.localMt.modelTitle", "Pinned MADLAD model"],
      localMtConsentText: ["studio.localMt.consent", "I accept Apache-2.0, the resource requirements, local text processing, and LIMITED EVIDENCE / NO BILINGUAL HUMAN VALIDATION draft positioning."],
      localMtRuntimeTitle: ["studio.localMt.runtimeTitle", "GPU residency"],
      localMtRuntimeNote: ["studio.localMt.runtimeNote", "ASR and MADLAD are serialized; switching unloads the other heavy model."],
    };
    Object.keys(values).forEach(function (id) { var node = el(id); if (node) node.textContent = T(values[id][0], values[id][1]); });
    var token = el("localMtToken"); if (token) token.placeholder = T("studio.localMt.tokenPlaceholder", "Pairing token");
    var buttons = {
      localMtPair: ["studio.localMt.pair", "Pair and check"],
      localMtInstall: ["studio.localMt.install", "Verify and activate"],
      localMtInstallCancel: ["studio.localMt.cancelInstall", "Cancel"],
      localMtDelete: ["studio.localMt.delete", "Delete model"],
      localMtWarmup: ["studio.localMt.warmup", "Warm up"],
      localMtUnload: ["studio.localMt.unload", "Unload GPU"],
    };
    Object.keys(buttons).forEach(function (id) { var node = el(id); if (node) node.textContent = T(buttons[id][0], buttons[id][1]); });
  }

  async function refresh() {
    var readiness = await ensureClient().readiness();
    var state = readiness.state;
    var providerStatus = el("localMtProviderStatus");
    if (providerStatus) providerStatus.textContent = T("studio.localMt.state." + state, state);
    if (el("localMtModelState")) el("localMtModelState").textContent = T("studio.localMt.state." + state, state);
    var install = readiness.install;
    if (install && el("localMtProgress")) {
      el("localMtProgress").value = install.total_bytes ? Math.min(100, install.processed_bytes * 100 / install.total_bytes) : 0;
    }
    if (state === "installing") startPoll(); else stopPoll();
    if (typeof window.refreshLocalMtReadiness === "function") window.refreshLocalMtReadiness(readiness);
    return readiness;
  }

  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(function () { refresh().catch(function () {}); }, 1000);
  }
  function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  async function pair() {
    try {
      var token = String(el("localMtToken").value || window.LocalAsrClient.getPairingToken() || "").trim();
      window.LocalAsrClient.setPairingToken(token);
      window.LocalMtClient.enroll();
      var readiness = await refresh();
      setStatus(T("studio.localMt.paired", "Companion authenticated: ") + readiness.state, false);
    } catch (error) { setStatus(errorText(error), true); }
  }
  async function install() {
    try {
      if (!el("localMtConsent").checked) throw new Error("LOCAL_MT_CONSENT_REQUIRED");
      await ensureClient().installModel(true);
      setStatus(T("studio.localMt.installStarted", "Exact snapshot verification and activation started."), false);
      startPoll();
      await refresh();
    } catch (error) { setStatus(errorText(error), true); }
  }
  async function action(name) {
    try { await ensureClient()[name](); setStatus(T("studio.localMt.actionDone", "Action completed."), false); await refresh(); }
    catch (error) { setStatus(errorText(error), true); }
  }
  function close() { stopPoll(); if (el("localMtBetaModal")) el("localMtBetaModal").hidden = true; }
  function open() {
    ensureModal();
    if (!config.beta) { setStatus(T("studio.localMt.notInvited", "This browser is not enrolled in the invite beta."), true); }
    el("localMtBetaModal").hidden = false;
    refresh().catch(function (error) { setStatus(error.code || error.message, true); });
  }
  function bind() {
    el("localMtClose").addEventListener("click", close);
    el("localMtPair").addEventListener("click", pair);
    el("localMtInstall").addEventListener("click", install);
    el("localMtInstallCancel").addEventListener("click", function () { action("cancelModelInstall"); });
    el("localMtDelete").addEventListener("click", function () { action("deleteModel"); });
    el("localMtWarmup").addEventListener("click", function () { action("warmup"); });
    el("localMtUnload").addEventListener("click", function () { action("unload"); });
  }
  function configure(payload) {
    config = window.LocalMtClient.setRuntimeConfig(payload && payload.localMt ? payload.localMt : { beta: false });
    var button = el("btnLocalMtSettings");
    if (button) button.hidden = !config.beta;
    if (config.beta && window.LocalMtClient.isExperimentalEnabled()) refresh().catch(function () {});
    return config;
  }

  window.LocalMtOnboarding = { configure: configure, open: open, close: close, refresh: refresh };
  document.addEventListener("i18n:changed", localize);
})();
