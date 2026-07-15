#!/usr/bin/env node
"use strict";

// Wave 2 C3a hermetic oracle: a fake browser recognizer proves that speech can
// only mutate the editable draft. No server, microphone, LLM, DB, or send hook
// participates in these fixtures.
const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const VoiceDraft = require(path.join(REPO, "public", "js", "voice-draft.js"));

const failures = [];
let checks = 0;
function eq(condition, message) { checks++; if (!condition) failures.push(message); }

class FakeElement {
  constructor() { this.hidden = false; this.disabled = false; this.textContent = ""; this.title = ""; this.attrs = {}; this.listeners = {}; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  removeEventListener(k, fn) { this.listeners[k] = (this.listeners[k] || []).filter((x) => x !== fn); }
  click() { for (const fn of this.listeners.click || []) fn({ target: this }); }
}
class FakeInput extends FakeElement {
  constructor(value = "") { super(); this.value = value; this.maxLength = 400; this.focused = false; this.inputEvents = 0; }
  focus() { this.focused = true; }
  dispatchEvent() { this.inputEvents++; return true; }
}
class FakeRecognition {
  static instances = [];
  constructor() { this.started = 0; this.stopped = 0; this.aborted = 0; FakeRecognition.instances.push(this); }
  start() { this.started++; }
  stop() { this.stopped++; if (this.onend) this.onend(); }
  abort() { this.aborted++; if (this.onend) this.onend(); }
  result(text) { if (this.onresult) this.onresult({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: true, length: 1 }] }); }
  error(code) { if (this.onerror) this.onerror({ error: code }); }
}
function fixture(value = "", extra = {}) {
  const input = new FakeInput(value);
  const button = new FakeElement();
  const status = new FakeElement();
  const controller = VoiceDraft.create({ input, button, status, Recognition: FakeRecognition, enabled: true, ...extra });
  return { input, button, status, controller };
}

(async () => {
  // Success appends rather than overwrites and never has access to a Send hook.
  FakeRecognition.instances.length = 0;
  const success = fixture("אני חושב");
  eq(await success.controller.ready === true, "supported fixture must become available");
  success.button.click();
  const successRec = FakeRecognition.instances.at(-1);
  eq(success.controller.state() === "listening" && successRec.lang === "he-IL", "press must start one he-IL recognition attempt");
  successRec.result(" שזה חשוב ");
  eq(success.input.value === "אני חושב שזה חשוב", "final result must append to the existing editable draft");
  eq(success.controller.state() === "ready" && success.input.focused && success.input.inputEvents === 1, "success must return an editable focused draft");

  // Character cap is deterministic and inherited from the existing input.
  eq(VoiceDraft.appendDraft("abc", "def", 5) === "abc d", "appendDraft must obey maxlength without hidden overflow");

  // Second press cancels, preserves typing, and restores ordinary text UI.
  const cancel = fixture("typed draft"); await cancel.controller.ready;
  cancel.button.click(); const cancelRec = FakeRecognition.instances.at(-1); cancel.button.click();
  eq(cancelRec.aborted === 1 && cancel.input.value === "typed draft" && cancel.controller.state() === "idle", "cancel must abort and preserve the prior draft");

  // Permission revocation/denial is recoverable and content-neutral.
  const denied = fixture("still here"); await denied.controller.ready;
  denied.button.click(); FakeRecognition.instances.at(-1).error("not-allowed");
  eq(denied.input.value === "still here" && denied.controller.state() === "error" && /typing|печат|להקליד/i.test(denied.status.textContent), "permission denial must preserve ordinary typing UI");

  // Timeout aborts; a short clock makes the fixture hermetic.
  const timeout = fixture("timeout draft", { timeoutMs: 5 }); await timeout.controller.ready;
  timeout.button.click(); const timeoutRec = FakeRecognition.instances.at(-1);
  await new Promise((resolve) => setTimeout(resolve, 20));
  eq(timeoutRec.aborted === 1 && timeout.input.value === "timeout draft" && timeout.controller.state() === "idle", "timeout must abort and preserve the draft");

  // Sheet close uses silent cancellation and cannot mutate the draft.
  const closed = fixture("close draft"); await closed.controller.ready;
  closed.button.click(); const closeRec = FakeRecognition.instances.at(-1); closed.controller.cancel(true);
  eq(closeRec.aborted === 1 && closed.input.value === "close draft" && closed.status.textContent === "", "close cancellation must be silent and content-neutral");

  // Unsupported and runtime-flag-off fail closed to the normal text UI.
  const unsupportedButton = new FakeElement();
  const unsupported = VoiceDraft.create({ input: new FakeInput(), button: unsupportedButton, status: new FakeElement(), Recognition: null, enabled: true, env: {} });
  eq(await unsupported.ready === false && unsupportedButton.hidden === true, "unsupported browser must hide the affordance");
  eq(await VoiceDraft.loadRuntimeFlag(async () => ({ ok: true, json: async () => ({ flags: { c3aVoiceEnabled: true } }) })) === true, "runtime flag true must enable C3a");
  eq(await VoiceDraft.loadRuntimeFlag(async () => ({ ok: true, json: async () => ({ flags: { c3aVoiceEnabled: false } }) })) === false, "runtime flag false must disable C3a");
  eq(await VoiceDraft.loadRuntimeFlag(async () => ({ ok: true, json: async () => ({ flags: {} }) })) === false, "missing runtime flag must fail closed");

  // Structural no-content-log/no-authority shield.
  const moduleJs = read("public/js/voice-draft.js");
  const roomJs = read("public/js/library-ui.js");
  const studioJs = read("public/js/studio-agent.js");
  const serverJs = read("server.js");
  const libraryHtml = read("public/library.html");
  const indexHtml = read("public/index.html");
  const swJs = read("public/sw.js");
  eq(!moduleJs.includes("/api/agent/") && !moduleJs.includes("MediaRecorder") && !moduleJs.includes("getUserMedia") && !moduleJs.includes("sendBeacon") && !moduleJs.includes("review_log"), "voice controller must have no role-play/media/log/review authority");
  const apiPaths = moduleJs.match(/\/api\/[a-z0-9/_-]+/gi) || [];
  eq(apiPaths.length === 1 && apiPaths[0] === "/api/client-config", "the only API surface must be the content-free runtime config");
  eq(roomJs.includes("LinguistProVoiceDraft") && studioJs.includes("LinguistProVoiceDraft"), "Room and Studio must share one controller");
  eq(roomJs.includes("_talkVoice.cancel(true)") && studioJs.includes("_talkVoice.cancel(true)"), "send/hide paths must cancel active recognition");
  eq(serverJs.includes("C3A_VOICE_ENABLED") && serverJs.includes("c3aVoiceEnabled"), "server must expose the C3a runtime rollback flag");
  eq(libraryHtml.includes('/js/voice-draft.js') && indexHtml.includes('/js/voice-draft.js') && swJs.includes('"/js/voice-draft.js"'), "both surfaces and the service worker must load/precache the controller");
  eq(!/offline speech|on-device speech|локальн[^\n]{0,20}распозна/i.test(moduleJs + roomJs + studioJs), "UI code must not overclaim offline/on-device recognition");
  for (const locale of ["ru", "en", "he"]) {
    const source = read(`public/i18n/locales/${locale}.js`);
    for (const key of ["voiceMic", "voiceStop", "voiceListening", "voiceReady", "voiceCancelled", "voiceTimeout", "voiceDenied", "voiceError", "voicePrivacy"]) {
      eq(source.includes(key + ":"), `${locale} locale must define room.talk.${key}`);
    }
  }

  if (failures.length) {
    console.error(`[voice-draft-smoke] FAIL ${checks - failures.length}/${checks}`);
    failures.forEach((f) => console.error(" - " + f));
    process.exit(1);
  }
  console.log(`[voice-draft-smoke] PASS ${checks}/${checks}`);
})().catch((error) => { console.error(error); process.exit(1); });
