// Windows invite-only Local ASR beta enrollment and onboarding.
(function () {
  "use strict";

  var REVISION = "72ad623a37947395efcc3933132353790e5a12f5";
  var client = null;
  var connected = false;
  var pollTimer = null;
  var config = { beta: false, companionDownloadUrl: "" };

  function T(key, fallback, params) {
    var value = typeof window.t === "function" ? window.t(key, params) : key;
    return value && value !== key ? value : fallback;
  }

  function el(id) { return document.getElementById(id); }
  function text(id, value) { var node = el(id); if (node) node.textContent = value; }
  function show(id, visible) { var node = el(id); if (node) node.hidden = !visible; }
  function renderConnectionState() {
    var button = el("localAsrConnect");
    if (!button) return;
    button.textContent = connected
      ? T("studio.localAsrBeta.connectedLabel", "Connected")
      : T("studio.localAsrBeta.connect", "Connect");
    button.dataset.connected = connected ? "true" : "false";
    button.setAttribute("aria-pressed", connected ? "true" : "false");
  }
  function setConnectionState(value) {
    connected = value === true;
    renderConnectionState();
  }
  function guideUrl() {
    var locale = typeof window.appGetLocale === "function" ? window.appGetLocale() : "ru";
    var suffix = locale === "en" ? ".en" : locale === "he" ? ".he" : "";
    return "/docs/LOCAL_ASR_COMPANION_GUIDE" + suffix + ".md";
  }

  function ensureModal() {
    if (el("localAsrBetaModal")) return;
    var modal = document.createElement("div");
    modal.id = "localAsrBetaModal";
    modal.className = "local-asr-beta-modal";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "localAsrBetaTitle");
    modal.innerHTML = [
      '<div class="local-asr-beta-panel">',
      '  <button type="button" id="localAsrBetaClose" class="local-asr-beta-close" aria-label="Close">×</button>',
      '  <div class="local-asr-beta-eyebrow">WINDOWS INVITE-ONLY BETA</div>',
      '  <h2 id="localAsrBetaTitle"></h2>',
      '  <p id="localAsrBetaIntro" class="local-asr-beta-intro"></p>',
      '  <div class="local-asr-privacy"><span>MEDIA</span><b>→</b><span>THIS COMPUTER</span><b>→</b><code>127.0.0.1</code><em>CLOUD OFF</em></div>',
      '  <div class="local-asr-requirements" id="localAsrRequirements"></div>',
      '  <ol class="local-asr-steps">',
      '    <li><div><b id="localAsrDownloadTitle"></b><span id="localAsrDownloadNote"></span></div><a id="localAsrDownload" class="btn-secondary" rel="noopener"></a></li>',
      '    <li><div><b id="localAsrConnectTitle"></b><span id="localAsrConnectNote"></span><details class="local-asr-token-help"><summary id="localAsrTokenHelpTitle"></summary><ol><li id="localAsrTokenStep1"></li><li id="localAsrTokenStep2"></li><li id="localAsrTokenStep3"></li></ol><p id="localAsrTokenSecurity"></p></details></div><div class="local-asr-inline"><input id="localAsrToken" type="password" autocomplete="off" spellcheck="false"><button id="localAsrConnect" type="button" class="btn-secondary"></button></div></li>',
      '    <li><div><b id="localAsrDeviceTitle"></b><span id="localAsrDeviceState"></span></div><button id="localAsrDeviceCheck" type="button" class="btn-secondary"></button></li>',
      '    <li><div><b id="localAsrModelTitle"></b><span id="localAsrModelState"></span><progress id="localAsrModelProgress" max="100" value="0"></progress></div><div class="local-asr-actions"><button id="localAsrInstall" type="button" class="btn-primary"></button><button id="localAsrInstallCancel" type="button" class="btn-secondary"></button><button id="localAsrModelDelete" type="button" class="btn-secondary"></button></div></li>',
      '    <li><div><b id="localAsrWarmTitle"></b><span id="localAsrWarmState"></span></div><button id="localAsrWarm" type="button" class="btn-secondary"></button></li>',
      '    <li><div><b id="localAsrChooseTitle"></b><span id="localAsrChooseNote"></span></div><button id="localAsrChoose" type="button" class="btn-primary"></button></li>',
      '  </ol>',
      '  <div id="localAsrBetaStatus" class="local-asr-beta-status" aria-live="polite"></div>',
      '  <div class="local-asr-support"><a id="localAsrHelp" target="_blank" rel="noopener"></a><button id="localAsrLeaveBeta" type="button" class="local-asr-leave"></button></div>',
      '</div>',
    ].join("");
    document.body.appendChild(modal);
    bind();
    localize();
  }

  function localize() {
    text("localAsrBetaTitle", T("studio.localAsrBeta.title", "Experimental Local ASR"));
    text("localAsrBetaIntro", T("studio.localAsrBeta.intro", "Transcribe Hebrew audio on this Windows computer. Gemini stays the default and is never called after a Local error."));
    text("localAsrRequirements", T("studio.localAsrBeta.requirements", "Windows 11 · NVIDIA/CUDA · at least 8 GB VRAM · Chrome · model download about 1.62 GB"));
    text("localAsrDownloadTitle", T("studio.localAsrBeta.downloadTitle", "Download Companion"));
    text("localAsrDownloadNote", config.companionDownloadUrl
      ? T("studio.localAsrBeta.downloadReady", "Use the installer supplied for this beta.")
      : T("studio.localAsrBeta.downloadInvite", "The installer is supplied separately with your invitation."));
    text("localAsrDownload", T("studio.localAsrBeta.download", "Download Companion"));
    text("localAsrConnectTitle", T("studio.localAsrBeta.connectTitle", "Connect this browser session"));
    text("localAsrConnectNote", T("studio.localAsrBeta.connectNote", "The Companion creates the token automatically. Copy it from the connection section and paste it here."));
    text("localAsrTokenHelpTitle", T("studio.localAsrBeta.tokenHelpTitle", "Where do I get the token?"));
    text("localAsrTokenStep1", T("studio.localAsrBeta.tokenStep1", "Open Windows Start → LinguistPro → LinguistPro Local ASR Companion."));
    text("localAsrTokenStep2", T("studio.localAsrBeta.tokenStep2", "Wait for RUNNING, then click Copy token for browser in Connect LinguistPro in Chrome."));
    text("localAsrTokenStep3", T("studio.localAsrBeta.tokenStep3", "Return to this tab, paste the token, and click Connect."));
    text("localAsrTokenSecurity", T("studio.localAsrBeta.tokenSecurity", "The token stays only in this browser session. Repeat after closing the tab; do not share it."));
    el("localAsrToken").placeholder = T("studio.localAsrBeta.tokenPlaceholder", "Pairing token");
    renderConnectionState();
    text("localAsrDeviceTitle", T("studio.localAsrBeta.deviceTitle", "Check device"));
    text("localAsrDeviceCheck", T("studio.localAsrBeta.check", "Run preflight"));
    text("localAsrModelTitle", T("studio.localAsrBeta.modelTitle", "Install and verify the pinned model"));
    text("localAsrInstall", T("studio.localAsrBeta.install", "Install model"));
    text("localAsrInstallCancel", T("studio.localAsrBeta.cancel", "Cancel"));
    text("localAsrModelDelete", T("studio.localAsrBeta.deleteModel", "Delete model"));
    text("localAsrWarmTitle", T("studio.localAsrBeta.warmTitle", "Warm up Local ASR"));
    text("localAsrWarm", T("studio.localAsrBeta.warm", "Warm up"));
    text("localAsrChooseTitle", T("studio.localAsrBeta.chooseTitle", "Choose Local for one import"));
    text("localAsrChooseNote", T("studio.localAsrBeta.chooseNote", "The import dialog still opens on Gemini. Select Local explicitly for each Local job."));
    text("localAsrChoose", T("studio.localAsrBeta.choose", "Open audio import"));
    text("localAsrHelp", T("studio.localAsrBeta.help", "Open the complete install and usage guide"));
    el("localAsrHelp").href = guideUrl();
    text("localAsrLeaveBeta", T("studio.localAsrBeta.leave", "Leave this beta on this browser"));
  }

  function bind() {
    el("localAsrBetaClose").addEventListener("click", close);
    el("localAsrConnect").addEventListener("click", connect);
    el("localAsrToken").addEventListener("input", function () { setConnectionState(false); });
    el("localAsrDeviceCheck").addEventListener("click", checkDevice);
    el("localAsrInstall").addEventListener("click", installModel);
    el("localAsrInstallCancel").addEventListener("click", function () { action(function () { return client.cancelModelInstall(); }); });
    el("localAsrModelDelete").addEventListener("click", deleteModel);
    el("localAsrWarm").addEventListener("click", warmup);
    el("localAsrChoose").addEventListener("click", chooseLocal);
    el("localAsrLeaveBeta").addEventListener("click", leaveBeta);
    el("localAsrBetaModal").addEventListener("click", function (event) { if (event.target === el("localAsrBetaModal")) close(); });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !el("localAsrBetaModal").hidden) close(); });
    document.addEventListener("i18n:changed", localize);
  }

  function setStatus(message, kind) {
    var node = el("localAsrBetaStatus");
    node.textContent = message || "";
    node.dataset.kind = kind || "info";
  }

  async function action(work) {
    try { return await work(); }
    catch (error) {
      var detail = String((error && error.message) || error || "");
      var message = /MODEL_DISK_LOW|DISK_SPACE/i.test(detail)
        ? T("studio.localAsrBeta.errDisk", "Not enough disk space for the verified model activation.")
        : /PORT_CONFLICT/i.test(detail)
          ? T("studio.localAsrBeta.errPort", "Port 8799 is used by another program. Stop that program and restart the Companion.")
          : /INTEGRITY|HASH|CHECKSUM/i.test(detail)
            ? T("studio.localAsrBeta.errIntegrity", "Model verification failed. Delete the partial/model files and retry the same pinned revision.")
            : /PAIRING|HTTP_401/i.test(detail)
              ? T("studio.localAsrBeta.errPairing", "Pairing failed. Copy the current token from the Companion, replace this field, and try again.")
              : T("studio.localAsrBeta.errDown", "The Companion is unavailable. Start it on this computer; Gemini was not called.");
      setStatus(message, "error");
      throw error;
    }
  }

  async function connect() {
    setConnectionState(false);
    try {
      window.LocalAsrClient.setPairingToken(el("localAsrToken").value);
      client = new window.LocalAsrClient.Client();
      await action(function () { return client.modelStatus(); });
      setConnectionState(true);
      setStatus(T("studio.localAsrBeta.connected", "Connected for this browser session."), "ok");
      await refresh();
    } catch (_) { setConnectionState(false); }
  }

  async function checkDevice() {
    if (!client) return setStatus(T("studio.localAsrBeta.connectFirst", "Connect the Companion first."), "warn");
    try {
      var report = await action(function () { return client.preflight(); });
      var failed = (report.checks || []).filter(function (item) { return !item.ok; }).map(function (item) { return item.code; });
      text("localAsrDeviceState", failed.length ? failed.join(", ") : T("studio.localAsrBeta.deviceReady", "Device ready"));
      setStatus(failed.length ? T("studio.localAsrBeta.deviceFailed", "Resolve the listed device checks before installing or running Local ASR.") : T("studio.localAsrBeta.deviceReady", "Device ready"), failed.length ? "error" : "ok");
    } catch (_) {}
  }

  async function installModel() {
    if (!client) return setStatus(T("studio.localAsrBeta.connectFirst", "Connect the Companion first."), "warn");
    var confirmed = window.confirm(T("studio.localAsrBeta.installConfirm", "Download about 1.62 GB under Apache-2.0 and activate exactly revision 72ad623a… after SHA-256 verification?"));
    if (!confirmed) return;
    try {
      await action(function () { return client.installModel(REVISION); });
      setStatus(T("studio.localAsrBeta.installStarted", "Pinned model download started. You can cancel without leaving partial files."), "info");
      schedulePoll();
    } catch (_) {}
  }

  async function deleteModel() {
    if (!client || !window.confirm(T("studio.localAsrBeta.deleteConfirm", "Delete the managed Local ASR model from this Windows account?"))) return;
    try {
      await action(function () { return client.deleteModel(); });
      setStatus(T("studio.localAsrBeta.modelDeleted", "The managed model was deleted and absence was verified."), "ok");
      await refresh();
    } catch (_) {}
  }

  async function warmup() {
    if (!client) return setStatus(T("studio.localAsrBeta.connectFirst", "Connect the Companion first."), "warn");
    text("localAsrWarmState", T("studio.localAsrBeta.warming", "Loading the pinned model…"));
    try {
      await action(function () { return client.warmup(); });
      text("localAsrWarmState", T("studio.localAsrBeta.warmReady", "Ready"));
      setStatus(T("studio.localAsrBeta.ready", "Local ASR is ready. Media remains on this computer."), "ok");
    } catch (_) { text("localAsrWarmState", T("studio.localAsrBeta.warmFailed", "Warmup failed")); }
  }

  function chooseLocal() {
    close();
    if (window.StudioImport) {
      window.StudioImport.open();
      window.StudioImport.switchTab("file");
      var select = el("v3ImportAudioProvider");
      if (select) {
        select.value = "local";
        window.StudioImport.onAudioProviderChanged();
      }
    }
  }

  function leaveBeta() {
    window.LocalAsrClient.unenroll();
    client = null;
    setConnectionState(false);
    close();
    revealEntry();
    window.dispatchEvent(new CustomEvent("local-asr-beta-change"));
  }

  async function refresh() {
    if (!client) return;
    try {
      var states = await Promise.all([client.modelStatus(), client.installStatus()]);
      var model = states[0], install = states[1];
      var total = Math.max(1, Number(install.total_bytes || 1));
      el("localAsrModelProgress").value = Math.min(100, 100 * Number(install.downloaded_bytes || 0) / total);
      text("localAsrModelState", model.verified
        ? T("studio.localAsrBeta.modelReady", "Exact revision and runtime SHA-256 verified")
        : String(install.state || model.reason || T("studio.localAsrBeta.modelMissing", "Not installed")));
      show("localAsrInstallCancel", ["QUEUED", "DOWNLOADING", "VERIFYING"].indexOf(install.state) >= 0);
      show("localAsrInstall", !model.verified && ["QUEUED", "DOWNLOADING", "VERIFYING"].indexOf(install.state) < 0);
      show("localAsrModelDelete", model.installed || model.verified);
      setConnectionState(true);
      if (["QUEUED", "DOWNLOADING", "VERIFYING"].indexOf(install.state) >= 0) schedulePoll();
    } catch (_) { setConnectionState(false); }
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async function () { await refresh(); }, 1000);
  }

  function revealEntry() {
    var entry = el("btnLocalAsrSettings");
    if (entry) entry.hidden = !window.LocalAsrClient.isExperimentalEnabled();
  }

  function open() {
    ensureModal();
    if (!window.LocalAsrClient.isExperimentalEnabled()) return;
    localize();
    var download = el("localAsrDownload");
    if (config.companionDownloadUrl) {
      download.href = config.companionDownloadUrl;
      download.removeAttribute("aria-disabled");
    } else {
      download.removeAttribute("href");
      download.setAttribute("aria-disabled", "true");
    }
    var remembered = window.LocalAsrClient.getPairingToken();
    if (remembered) el("localAsrToken").value = remembered;
    setConnectionState(false);
    el("localAsrBetaModal").hidden = false;
    el("localAsrBetaClose").focus();
    if (remembered) { client = new window.LocalAsrClient.Client(); refresh(); }
  }

  function close() {
    clearTimeout(pollTimer);
    var modal = el("localAsrBetaModal");
    if (modal) modal.hidden = true;
  }

  async function boot() {
    ensureModal();
    try {
      var response = await fetch("/api/client-config", { cache: "no-store", credentials: "same-origin" });
      var payload = response.ok ? await response.json() : null;
      config = window.LocalAsrClient.setRuntimeConfig(payload && payload.localAsr ? payload.localAsr : { beta: false });
    } catch (_) {
      config = window.LocalAsrClient.setRuntimeConfig({ beta: false });
    }
    revealEntry();
    window.dispatchEvent(new CustomEvent("local-asr-beta-change"));
    if (location.hash === "#local-asr-beta" && config.beta && !window.LocalAsrClient.isExperimentalEnabled()) {
      var accepted = window.confirm(T("studio.localAsrBeta.enrollConfirm", "Join the invite-only Local ASR beta on this browser? Local remains off by default and Gemini remains the default provider."));
      history.replaceState(null, "", location.pathname + location.search);
      if (accepted) {
        window.LocalAsrClient.enroll();
        revealEntry();
        window.dispatchEvent(new CustomEvent("local-asr-beta-change"));
        open();
      }
    }
  }

  window.LocalAsrOnboarding = { open: open, close: close, boot: boot };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
