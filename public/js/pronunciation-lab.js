(function () {
  "use strict";

  var API = "http://127.0.0.1:8766";
  var OPT_IN_KEY = "linguistpro.c1.experimental.optin.v1";
  var TOKEN_KEY = "linguistpro.c1.companion.token.v1";
  var state = {
    enabled: false,
    connected: false,
    exercises: [],
    stream: null,
    context: null,
    source: null,
    processor: null,
    mute: null,
    chunks: [],
    startedAt: 0,
    timer: null,
  };

  function byId(id) { return document.getElementById(id); }
  function tr(key, fallback) {
    var value = typeof window.t === "function" ? window.t(key) : key;
    return value && value !== key ? value : fallback;
  }
  function status(id, text, tone) {
    var el = byId(id);
    if (!el) return;
    el.textContent = text || "";
    el.dataset.tone = tone || "";
  }
  function token() { return String(byId("c1Token").value || "").trim(); }
  function headers(extra) {
    var out = { "X-C1-Token": token() };
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }
  async function loopbackPermissionState() {
    if (!navigator.permissions || typeof navigator.permissions.query !== "function") return "unknown";
    for (var i = 0; i < 2; i++) {
      var name = i === 0 ? "loopback-network" : "local-network-access";
      try {
        var permission = await navigator.permissions.query({ name: name });
        if (permission && permission.state) return permission.state;
      } catch (_) {}
    }
    return "unknown";
  }
  function revealActivated() {
    byId("c1OptIn").hidden = true;
    byId("c1Connect").hidden = false;
  }
  function loadStored() {
    try {
      if (localStorage.getItem(OPT_IN_KEY) === "1") revealActivated();
      byId("c1Token").value = localStorage.getItem(TOKEN_KEY) || "";
    } catch (_) {}
  }
  function saveToken() {
    try { localStorage.setItem(TOKEN_KEY, token()); } catch (_) {}
  }

  async function loadFlag() {
    try {
      var response = await fetch("/api/client-config", { cache: "no-store", credentials: "same-origin" });
      var body = await response.json();
      state.enabled = !!(response.ok && body && body.flags && body.flags.c1ExperimentalEnabled === true);
    } catch (_) { state.enabled = false; }
    if (!state.enabled) {
      byId("c1Disabled").hidden = false;
      byId("c1OptIn").hidden = true;
      byId("c1Connect").hidden = true;
      byId("c1Lab").hidden = true;
    }
  }

  function renderExercise() {
    var select = byId("c1Exercise");
    var index = select.selectedIndex < 0 ? 0 : select.selectedIndex;
    var item = state.exercises[index];
    if (!item) return;
    byId("c1Word").textContent = item.expected_target_vocalized || item.target_word;
    byId("c1Sentence").textContent = item.sentence;
    byId("c1Counter").textContent = (index + 1) + " / " + state.exercises.length;
    byId("c1Result").hidden = true;
  }

  function fillExercises(items) {
    var select = byId("c1Exercise");
    select.textContent = "";
    state.exercises = items;
    items.forEach(function (item, index) {
      var option = document.createElement("option");
      option.value = item.id;
      option.textContent = (index + 1) + ". " + (item.expected_target_vocalized || item.target_word);
      select.appendChild(option);
    });
    renderExercise();
  }

  async function connect() {
    if (!token()) {
      status("c1ConnectStatus", tr("pronunciation.errorToken", "Введите token из окна companion."), "error");
      return;
    }
    status("c1ConnectStatus", tr("pronunciation.connecting", "Проверяем локальное подключение…"), "");
    byId("c1ConnectButton").disabled = true;
    try {
      if (await loopbackPermissionState() === "denied") throw new Error("LOCAL_NETWORK_DENIED");
      var healthResponse = await fetch(API + "/v1/health", {
        headers: headers(), cache: "no-store", targetAddressSpace: "loopback"
      });
      var health = await healthResponse.json();
      if (!healthResponse.ok || !health.ok) throw new Error(health.error || "HEALTH_FAILED");
      if (!health.profile_ready) throw new Error("PROFILE_REQUIRED");
      if (!health.phonikud_model_present || !health.mms_fa_checkpoint_present) throw new Error("MODEL_REQUIRED");
      var exercisesResponse = await fetch(API + "/v1/exercises", {
        headers: headers(), cache: "no-store", targetAddressSpace: "loopback"
      });
      var exerciseBody = await exercisesResponse.json();
      if (!exercisesResponse.ok || !exerciseBody.ok || !Array.isArray(exerciseBody.exercises) || exerciseBody.exercises.length !== 25) {
        throw new Error(exerciseBody.error || "EXERCISES_INVALID");
      }
      saveToken();
      fillExercises(exerciseBody.exercises);
      state.connected = true;
      byId("c1Lab").hidden = false;
      status("c1ConnectStatus", tr("pronunciation.connected", "Companion подключён. Аудио останется на этом устройстве."), "ok");
    } catch (error) {
      state.connected = false;
      byId("c1Lab").hidden = true;
      var code = String(error && error.message || "");
      if (code !== "LOCAL_NETWORK_DENIED" && await loopbackPermissionState() === "denied") {
        code = "LOCAL_NETWORK_DENIED";
      }
      var message = code === "PROFILE_REQUIRED"
        ? tr("pronunciation.errorProfile", "Companion запущен, но локальный профиль ещё не создан.")
        : code === "MODEL_REQUIRED"
          ? tr("pronunciation.errorModel", "Companion не видит одну из локальных моделей.")
          : code === "LOCAL_NETWORK_DENIED"
            ? tr("pronunciation.errorNetworkDenied", "Браузеру запрещён доступ к локальной сети. Откройте настройки сайта LinguistPro, разрешите «Доступ к локальной сети» и повторите.")
          : tr("pronunciation.errorConnect", "Не удалось подключиться. Запустите companion и проверьте token.");
      status("c1ConnectStatus", message, "error");
    } finally {
      byId("c1ConnectButton").disabled = false;
    }
  }

  function combine(chunks) {
    var length = chunks.reduce(function (sum, chunk) { return sum + chunk.length; }, 0);
    var out = new Float32Array(length);
    var offset = 0;
    chunks.forEach(function (chunk) { out.set(chunk, offset); offset += chunk.length; });
    return out;
  }

  function downsample(input, sourceRate, targetRate) {
    if (sourceRate === targetRate) return input;
    var ratio = sourceRate / targetRate;
    var length = Math.max(1, Math.round(input.length / ratio));
    var output = new Float32Array(length);
    for (var i = 0; i < length; i++) {
      var start = Math.floor(i * ratio);
      var end = Math.min(input.length, Math.floor((i + 1) * ratio));
      var total = 0;
      for (var j = start; j < end; j++) total += input[j];
      output[i] = total / Math.max(1, end - start);
    }
    return output;
  }

  function wavBlob(samples, sampleRate) {
    var buffer = new ArrayBuffer(44 + samples.length * 2);
    var view = new DataView(buffer);
    function ascii(offset, value) { for (var i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); }
    ascii(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); ascii(8, "WAVE");
    ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (var index = 0; index < samples.length; index++) {
      var value = Math.max(-1, Math.min(1, samples[index]));
      view.setInt16(44 + index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  async function startRecording() {
    if (!state.connected || state.stream) return;
    byId("c1Result").hidden = true;
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false
      }});
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      var context = new AudioCtor();
      var source = context.createMediaStreamSource(stream);
      var processor = context.createScriptProcessor(4096, 1, 1);
      var mute = context.createGain();
      mute.gain.value = 0;
      state.stream = stream;
      state.context = context;
      state.source = source;
      state.processor = processor;
      state.mute = mute;
      state.chunks = [];
      state.startedAt = Date.now();
      processor.onaudioprocess = function (event) {
        if (!state.stream) return;
        state.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor); processor.connect(mute); mute.connect(context.destination);
      byId("c1Record").disabled = true;
      byId("c1Record").dataset.recording = "1";
      byId("c1Stop").disabled = false;
      status("c1RecordStatus", tr("pronunciation.recording", "Запись идёт… произнесите всё предложение."), "");
      state.timer = setTimeout(stopRecording, 12000);
    } catch (_) {
      status("c1RecordStatus", tr("pronunciation.errorMic", "Микрофон недоступен. Разрешите доступ в настройках браузера."), "error");
    }
  }

  async function stopRecording() {
    if (!state.stream) return;
    clearTimeout(state.timer);
    state.timer = null;
    var context = state.context;
    var chunks = state.chunks.slice();
    try { state.processor.disconnect(); } catch (_) {}
    try { state.source.disconnect(); } catch (_) {}
    try { state.mute.disconnect(); } catch (_) {}
    state.stream.getTracks().forEach(function (track) { track.stop(); });
    state.stream = null;
    state.processor = null;
    state.source = null;
    state.mute = null;
    state.chunks = [];
    byId("c1Record").disabled = false;
    byId("c1Record").dataset.recording = "0";
    byId("c1Stop").disabled = true;
    var sourceRate = context.sampleRate;
    try { await context.close(); } catch (_) {}
    state.context = null;
    var captured = combine(chunks);
    var seconds = captured.length / sourceRate;
    if (seconds < .25) {
      status("c1RecordStatus", tr("pronunciation.errorShort", "Запись слишком короткая. Попробуйте ещё раз."), "error");
      return;
    }
    var wav = wavBlob(downsample(captured, sourceRate, 16000), 16000);
    await score(wav);
  }

  function result(title, body) {
    byId("c1ResultTitle").textContent = title;
    byId("c1ResultBody").textContent = body;
    byId("c1Result").hidden = false;
  }

  async function score(blob) {
    var exerciseId = byId("c1Exercise").value;
    status("c1RecordStatus", tr("pronunciation.analyzing", "Локальный анализ… это может занять несколько секунд."), "");
    byId("c1Record").disabled = true;
    try {
      var response = await fetch(API + "/v1/score?exercise_id=" + encodeURIComponent(exerciseId), {
        method: "POST", headers: headers({ "Content-Type": "audio/wav" }), body: blob, cache: "no-store",
        targetAddressSpace: "loopback"
      });
      var body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "SCORE_FAILED");
      status("c1RecordStatus", tr("pronunciation.analysisDone", "Локальный анализ завершён; запись удалена."), "ok");
      if (body.target_status !== "SCORABLE") {
        result(tr("pronunciation.resultUnscorableTitle", "Надёжной подсказки нет"), tr("pronunciation.resultUnscorableBody", "Companion не смог уверенно локализовать слово. Это не считается ошибкой произношения."));
      } else if (!body.possible_issues || body.possible_issues.length === 0) {
        result(tr("pronunciation.resultClearTitle", "Явное отклонение не обнаружено"), tr("pronunciation.resultClearBody", "Это не подтверждение правильности: экспериментальная система может пропускать ошибки."));
      } else {
        var labels = body.possible_issues.map(function (issue) {
          return issue === "POSSIBLE_STRESS_SHIFT"
            ? tr("pronunciation.issueStress", "возможное смещение ударения")
            : tr("pronunciation.issueVowel", "возможная замена гласной");
        });
        result(tr("pronunciation.resultIssueTitle", "Возможное отклонение"), labels.join(" · ") + ". " + tr("pronunciation.resultIssueBody", "Прослушайте эталон у преподавателя или носителя; не считайте этот сигнал оценкой."));
      }
    } catch (error) {
      var code = String(error && error.message || "");
      var message = code === "COMPANION_BUSY"
        ? tr("pronunciation.errorBusy", "Companion занят другой записью. Подождите и повторите.")
        : tr("pronunciation.errorScore", "Анализ не выполнен. Запустите companion и проверьте подключение.");
      status("c1RecordStatus", message, "error");
    } finally {
      byId("c1Record").disabled = false;
    }
  }

  function bind() {
    byId("c1Accept").addEventListener("change", function () { byId("c1Activate").disabled = !this.checked; });
    byId("c1Activate").addEventListener("click", function () {
      if (!byId("c1Accept").checked) return;
      try { localStorage.setItem(OPT_IN_KEY, "1"); } catch (_) {}
      revealActivated();
    });
    byId("c1ConnectButton").addEventListener("click", connect);
    byId("c1Forget").addEventListener("click", function () {
      try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
      byId("c1Token").value = "";
      state.connected = false;
      byId("c1Lab").hidden = true;
      status("c1ConnectStatus", tr("pronunciation.tokenForgotten", "Token удалён с этого устройства."), "");
    });
    byId("c1Exercise").addEventListener("change", renderExercise);
    byId("c1Record").addEventListener("click", startRecording);
    byId("c1Stop").addEventListener("click", stopRecording);
    byId("c1Language").addEventListener("change", function () { window.appSetLocale(this.value); });
    document.addEventListener("i18n:changed", renderExercise);
    window.addEventListener("beforeunload", function () {
      if (state.stream) {
        state.stream.getTracks().forEach(function (track) { track.stop(); });
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (typeof window.appGetLocale === "function") byId("c1Language").value = window.appGetLocale();
    bind();
    loadStored();
    await loadFlag();
  });
})();
