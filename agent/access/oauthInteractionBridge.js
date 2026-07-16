"use strict";

const C = require("./oauthContracts");

function error(code) { const e = new Error(code); e.code = code; throw e; }

function createOAuthInteractionBridge({ consentCeremony, now = () => Date.now(), maxOpen = 100, perUser = 3 } = {}) {
  if (!consentCeremony || typeof consentCeremony.stageTrustedRequest !== "function") error("AA_OAUTH_BRIDGE_BAD_DEPENDENCY");
  const records = new Map();
  function prune() {
    const at = now();
    for (const [id, row] of records) if (row.expires_at_ms <= at || row.status === "FINISHED") records.delete(id);
  }
  async function stage(userId, input) {
    prune();
    const bridgeInput = C.closed(input, ["request_id", "interaction_uid", "pair_key", "consent_request"]);
    const uid = C.safeId(userId);
    const requestId = C.safeId(bridgeInput.request_id, 96);
    const interactionUid = C.safeId(bridgeInput.interaction_uid, 96);
    const pairKey = C.safeId(bridgeInput.pair_key, 128);
    if (records.has(requestId)) error("AA_OAUTH_BRIDGE_REPLAY");
    if (records.size >= maxOpen) error("AA_OAUTH_BRIDGE_CAPACITY");
    let userOpen = 0;
    let pairOpen = 0;
    for (const row of records.values()) {
      if (row.user_id === uid && row.status === "OPEN") userOpen += 1;
      if (row.pair_key === pairKey && row.status === "OPEN") pairOpen += 1;
    }
    if (userOpen >= perUser) error("AA_OAUTH_BRIDGE_USER_CAPACITY");
    if (pairOpen >= 10) error("AA_OAUTH_BRIDGE_PAIR_CAPACITY");
    const expires = Date.parse(bridgeInput.consent_request.expires_at);
    if (!Number.isFinite(expires) || expires <= now() || expires - now() > 600000) error("AA_OAUTH_BRIDGE_BAD_TTL");
    await consentCeremony.stageTrustedRequest(uid, bridgeInput.consent_request);
    records.set(requestId, Object.freeze({
      request_id: requestId, interaction_uid: interactionUid, user_id: uid, pair_key: pairKey,
      oauth_client_id: C.safeId(bridgeInput.consent_request.oauth_client_id),
      connection_id: C.connectionId(bridgeInput.consent_request.connection_id),
      requested_scopes: C.scopes(bridgeInput.consent_request.requested_scopes),
      status: "OPEN", expires_at_ms: expires,
    }));
    return Object.freeze({ request_id: requestId, consent_path: `/agent-access.html?request_id=${encodeURIComponent(requestId)}` });
  }
  function complete(userId, requestId, decision) {
    prune();
    const row = records.get(C.safeId(requestId, 96));
    if (!row || row.user_id !== C.safeId(userId)) error("AA_OAUTH_BRIDGE_NOT_FOUND");
    if (row.status !== "OPEN") error("AA_OAUTH_BRIDGE_REPLAY");
    if (!new Set(["approved", "denied"]).has(decision)) error("AA_OAUTH_BRIDGE_BAD_DECISION");
    records.set(row.request_id, Object.freeze({ ...row, status: "DECIDED", decision }));
    return Object.freeze({ interaction_uid: row.interaction_uid, decision });
  }
  function findOpen(userId, interactionUid) {
    prune();
    const uid = C.safeId(userId), iid = C.safeId(interactionUid, 96);
    for (const row of records.values()) if (row.user_id === uid && row.interaction_uid === iid && row.status === "OPEN") return Object.freeze({ request_id: row.request_id, consent_path: `/agent-access.html?request_id=${encodeURIComponent(row.request_id)}` });
    return null;
  }
  function takeDecision(userId, requestId, interactionUid) {
    prune();
    const id = C.safeId(requestId, 96), row = records.get(id);
    if (!row || row.user_id !== C.safeId(userId) || row.interaction_uid !== C.safeId(interactionUid, 96)) error("AA_OAUTH_BRIDGE_NOT_FOUND");
    if (row.status !== "DECIDED") error("AA_OAUTH_BRIDGE_NOT_DECIDED");
    records.delete(id);
    return Object.freeze({ interaction_uid: row.interaction_uid, decision: row.decision, oauth_client_id: row.oauth_client_id, connection_id: row.connection_id, requested_scopes: row.requested_scopes });
  }
  return Object.freeze({ stage, complete, findOpen, takeDecision, prune, size: () => records.size });
}

module.exports = { createOAuthInteractionBridge };
