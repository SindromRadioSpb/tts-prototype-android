"use strict";

// AA2-CP1 — owner control-plane logic behind the admin endpoints.
// The HTTP layer authenticates (boundary -> requireUser -> owner -> CSRF) and
// then delegates here; this module owns everything after authentication:
// control-plane-enabled gate, step-up for enabling transitions, env-pin
// detection, journal writes, cache invalidation.
//
// Step-up rule (R14): any transition that WIDENS access (flag 0->1, window
// open, permanent mode, client -> ACTIVE) requires re-presenting
// AUTH_BOOTSTRAP_SECRET in the request body. Narrowing transitions (close,
// suspend) never require step-up: the fail-safe direction stays one click.
//
// window_close is FLAGS-ONLY by design (R11): suspending a client cascades a
// terminal revoke of its token families, forcing a fresh consent ceremony on
// every reopen. Closing the flags makes every endpoint 404 while credentials
// stay intact for resume; killing credentials is the separate, explicitly
// destructive client_status_set SUSPENDED action.

const crypto = require("crypto");

const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 1440;
const MIN_SECRET_LEN = 22;
const FLAGS = new Set(["clients", "mcp"]);
const FLAG_ENV = { clients: "AGENT_ACCESS_OAUTH_CLIENTS_ENABLED", mcp: "AGENT_ACCESS_MCP_ENABLED" };

function fail(code) { const e = new Error(code); e.code = code; throw e; }

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function createControlPlane({ controlRepo, oauthRepo, resolver, env = process.env, now = Date.now } = {}) {
  if (!controlRepo || !oauthRepo || !resolver) throw new TypeError("AA_CP_BAD_DEPS");

  const planeEnabled = () => String(env.AGENT_ACCESS_RUNTIME_FLAGS_ENABLED || "") === "1";
  const envPinned = (flag) => String(env[FLAG_ENV[flag]] || "") === "1";

  function requireStepUp(body) {
    const secret = String(env.AUTH_BOOTSTRAP_SECRET || "");
    if (!secret || secret.length < MIN_SECRET_LEN) fail("AA_CP_STEP_UP_UNAVAILABLE");
    if (!timingSafeStringEqual(String((body && body.step_up_secret) || ""), secret)) fail("AA_CP_STEP_UP_REQUIRED");
  }

  function ttlExpiry(ttlMinutes) {
    const ttl = Number(ttlMinutes);
    if (!Number.isInteger(ttl) || ttl < MIN_TTL_MINUTES || ttl > MAX_TTL_MINUTES) fail("AA_CP_BAD_TTL");
    return new Date(now() + ttl * 60_000).toISOString();
  }

  function cleanReason(body) {
    const reason = String((body && body.reason) || "").trim();
    if (!reason || reason.length > 240) fail("AA_CP_BAD_REASON");
    return reason;
  }

  async function setFlag(actor, action, flag, value, expiresAt, reason) {
    const row = await controlRepo.appendEvent({
      actor_user_id: actor, action, subject: flag, value, expires_at: expiresAt, reason,
    });
    resolver.invalidate();
    return row;
  }

  async function setClientStatus(actor, action, clientId, status, reason) {
    const clients = await controlRepo.listClients();
    const target = clients.find((c) => c.oauth_client_id === String(clientId));
    if (!target) fail("AA_CP_CLIENT_NOT_FOUND");
    if (target.status === "REVOKED") fail("AA_CP_CLIENT_REVOKED_TERMINAL");
    const out = await oauthRepo.setClientStatus(String(clientId), status, undefined, {
      controlEvent: { actor_user_id: actor, action, reason },
    });
    resolver.invalidate();
    return out;
  }

  async function state() {
    const resolved = await resolver.resolve(true);
    let clients = [];
    let events = [];
    let journalOk = true;
    try {
      clients = await controlRepo.listClients();
      events = await controlRepo.listRecentEvents(50);
    } catch (_) { journalOk = false; }
    return {
      ok: true,
      schema_version: "aa.control.1.0.0",
      control_plane_enabled: planeEnabled(),
      emergency_off: String(env.AGENT_ACCESS_EMERGENCY_OFF || "") === "1",
      journal_ok: journalOk,
      flags: { clients: resolved.detail ? resolved.detail.clients : null, mcp: resolved.detail ? resolved.detail.mcp : null },
      effective: { ui: resolved.ui, oauth: resolved.oauth, clients: resolved.clients, mcp: resolved.mcp },
      clients,
      events,
    };
  }

  async function transition(actorUserId, body) {
    const actor = String(actorUserId || "");
    if (!actor) fail("AA_CP_BAD_ACTOR");
    if (!planeEnabled()) fail("AA_CP_DISABLED");
    const type = String((body && body.type) || "");
    const reason = cleanReason(body);

    if (type === "flag_set") {
      const flag = String(body.flag || "");
      if (!FLAGS.has(flag)) fail("AA_CP_BAD_FLAG");
      const value = String(body.value || "");
      if (value === "1") {
        requireStepUp(body);
        const expiresAt = body.permanent === true ? null : ttlExpiry(body.ttl_minutes);
        return { ok: true, type, applied: await setFlag(actor, "FLAG_SET", flag, "1", expiresAt, reason) };
      }
      if (value === "0") {
        if (envPinned(flag)) fail("AA_CP_FLAG_ENV_PINNED");
        return { ok: true, type, applied: await setFlag(actor, "FLAG_SET", flag, "0", null, reason) };
      }
      fail("AA_CP_BAD_VALUE");
    }

    if (type === "client_status_set") {
      const status = String(body.status || "");
      if (!["ACTIVE", "SUSPENDED"].includes(status)) fail("AA_CP_BAD_STATUS");
      if (status === "ACTIVE") requireStepUp(body);
      return { ok: true, type, applied: await setClientStatus(actor, "CLIENT_STATUS_SET", body.client_id, status, reason) };
    }

    if (type === "window_open") {
      requireStepUp(body);
      const permanent = body.permanent === true;
      const expiresAt = permanent ? null : ttlExpiry(body.ttl_minutes);
      const clientIds = Array.isArray(body.client_ids) ? body.client_ids.map(String) : [];
      const steps = [];
      // Safety order: clients first, window flags last — a partial failure
      // leaves the window closed, never half-open with a dangling client.
      for (const clientId of clientIds) {
        try {
          const clients = await controlRepo.listClients();
          const target = clients.find((c) => c.oauth_client_id === clientId);
          if (!target) fail("AA_CP_CLIENT_NOT_FOUND");
          if (target.status === "ACTIVE") { steps.push({ step: `client:${clientId}`, ok: true, skipped: "already ACTIVE" }); continue; }
          await setClientStatus(actor, "WINDOW_OPEN", clientId, "ACTIVE", reason);
          steps.push({ step: `client:${clientId}`, ok: true });
        } catch (err) {
          steps.push({ step: `client:${clientId}`, ok: false, error: String(err.code || err.message) });
          return { ok: false, type, steps, error: "AA_CP_WINDOW_OPEN_CLIENT_FAILED" };
        }
      }
      for (const flag of ["clients", "mcp"]) {
        await setFlag(actor, "WINDOW_OPEN", flag, "1", expiresAt, reason);
        steps.push({ step: `flag:${flag}`, ok: true, expires_at: expiresAt });
      }
      return { ok: true, type, permanent, expires_at: expiresAt, steps };
    }

    if (type === "window_close") {
      const steps = [];
      for (const flag of ["clients", "mcp"]) {
        if (envPinned(flag)) { steps.push({ step: `flag:${flag}`, ok: false, error: "AA_CP_FLAG_ENV_PINNED" }); continue; }
        await setFlag(actor, "WINDOW_CLOSE", flag, "0", null, reason);
        steps.push({ step: `flag:${flag}`, ok: true });
      }
      const pinned = steps.some((s) => s.error === "AA_CP_FLAG_ENV_PINNED");
      if (pinned) fail("AA_CP_FLAG_ENV_PINNED");
      return { ok: true, type, steps };
    }

    fail("AA_CP_BAD_TYPE");
  }

  return Object.freeze({ state, transition, MIN_TTL_MINUTES, MAX_TTL_MINUTES });
}

module.exports = { createControlPlane, timingSafeStringEqual };
