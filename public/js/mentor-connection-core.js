/* mentor-connection-core.js — pure MASS-ACCESS I5 progressive capability journey. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.MentorConnection = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ORDER = Object.freeze(["ACCOUNT", "SYNC", "TELEGRAM", "AI_CONSENT"]);

  function step(code, state, action, optional) {
    return Object.freeze({ code: code, state: state, action: action || null, optional: optional === true });
  }

  function deriveJourney(input) {
    input = input && typeof input === "object" ? input : {};
    var account = input.account && typeof input.account === "object" ? input.account : {};
    var sync = input.sync && typeof input.sync === "object" ? input.sync : {};
    var telegram = input.telegram && typeof input.telegram === "object" ? input.telegram : {};
    var ai = input.ai && typeof input.ai === "object" ? input.ai : {};

    var mismatch = account.profileMismatch === true;
    var connected = account.connected === true && !mismatch;
    var synced = connected && sync.ready === true;
    var linked = synced && telegram.linked === true;
    var pending = synced && !linked && telegram.pending === true;
    var aiGranted = linked && ai.granted === true;

    var steps = [
      mismatch ? step("ACCOUNT", "ERROR", "OPEN_ACCOUNT")
        : connected ? step("ACCOUNT", "COMPLETE") : step("ACCOUNT", "CURRENT", "OPEN_ACCOUNT"),
      !connected ? step("SYNC", "LOCKED")
        : synced ? step("SYNC", "COMPLETE") : step("SYNC", "CURRENT", "RUN_SYNC"),
      !synced ? step("TELEGRAM", "LOCKED")
        : linked ? step("TELEGRAM", "COMPLETE")
          : pending ? step("TELEGRAM", "PENDING", "OPEN_TELEGRAM")
            : step("TELEGRAM", "CURRENT", "CONNECT_TELEGRAM"),
      !linked ? step("AI_CONSENT", "LOCKED", null, true)
        : aiGranted ? step("AI_CONSENT", "COMPLETE", null, true)
          : step("AI_CONSENT", "OPTIONAL", "REVIEW_AI_CONSENT", true),
    ];

    var current = steps.find(function (item) {
      return item.state === "CURRENT" || item.state === "PENDING" || item.state === "OPTIONAL" || item.state === "ERROR";
    });
    return Object.freeze({ steps: Object.freeze(steps), current: current ? current.code : null });
  }

  return Object.freeze({ ORDER: ORDER, deriveJourney: deriveJourney });
});
