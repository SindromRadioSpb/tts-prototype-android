"use strict";

// AA2-CP1 — effective-flag resolution for the Agent Access gates.
//
// Two resolvers share one output shape { ui, oauth, clients, mcp } of LITERAL
// "0"/"1" strings (validateOAuthHttpRequest does exact-"1" checks):
//
//  * createEnvFlagReader     — per-request, uncached process-env read. This is
//    the gates' DEFAULT, byte-equivalent to the historical direct env checks,
//    so every existing fixture/smoke that flips env between requests keeps
//    observing instant transitions.
//  * createRuntimeFlagResolver — env first, then the DB journal for the two
//    window flags (clients/mcp). Never rejects; every anomaly (control plane
//    disabled, missing table, DB error, expired/malformed TTL) yields "0".
//
// Precedence per window flag:
//   AGENT_ACCESS_EMERGENCY_OFF=1            -> "0"  (kill switch wins over all)
//   env flag === "1"                        -> "1"  (legacy env pin; runtime close impossible -> ENV_PINNED)
//   AGENT_ACCESS_RUNTIME_FLAGS_ENABLED!=="1"-> "0"  (control plane off: DB is inert, never touched)
//   latest journal row value "1", not expired -> "1"
//   anything else                           -> "0"

const FLAG_ENV = Object.freeze({
  ui: "AGENT_ACCESS_UI_ENABLED",
  oauth: "AGENT_ACCESS_OAUTH_ENABLED",
  clients: "AGENT_ACCESS_OAUTH_CLIENTS_ENABLED",
  mcp: "AGENT_ACCESS_MCP_ENABLED",
});

const one = (value) => (String(value || "") === "1" ? "1" : "0");

function createEnvFlagReader(env = process.env) {
  return async function readEnvFlags() {
    return Object.freeze({
      ui: one(env[FLAG_ENV.ui]),
      oauth: one(env[FLAG_ENV.oauth]),
      clients: one(env[FLAG_ENV.clients]),
      mcp: one(env[FLAG_ENV.mcp]),
    });
  };
}

// expires_at semantics: null => permanent; a valid future instant => window;
// empty string / unparseable / past => closed. NEVER truthiness.
function journalGrantsOn(row, nowMs) {
  if (!row || String(row.value) !== "1") return { on: false, source: "off", expires_at: null };
  if (row.expires_at === null || row.expires_at === undefined) {
    return { on: true, source: "db_permanent", expires_at: null };
  }
  const parsed = Date.parse(String(row.expires_at));
  if (Number.isNaN(parsed)) return { on: false, source: "off", expires_at: null };
  if (parsed > nowMs) return { on: true, source: "db_window", expires_at: String(row.expires_at) };
  return { on: false, source: "expired", expires_at: String(row.expires_at) };
}

function createRuntimeFlagResolver({ readLatest, env = process.env, now = Date.now, cacheMs = 2000 } = {}) {
  if (typeof readLatest !== "function") throw new TypeError("AA_CP_RESOLVER_BAD_READER");
  let cache = null; // { at, rows | null (=error) } — errors are cached too (probe storms)
  let inflight = null;

  async function readJournal() {
    const t = now();
    if (cache && t - cache.at < cacheMs) return cache;
    if (!inflight) {
      inflight = Promise.resolve()
        .then(() => readLatest())
        .then((rows) => ({ at: now(), rows: rows && typeof rows === "object" ? rows : null }))
        .catch(() => ({ at: now(), rows: null }))
        .then((entry) => { cache = entry; inflight = null; return entry; });
    }
    return inflight;
  }

  function invalidate() { cache = null; }

  // Never rejects. Optional detail=true adds per-flag source/expiry metadata
  // for the admin state endpoint.
  async function resolve(detail = false) {
    try {
      const ui = one(env[FLAG_ENV.ui]);
      const oauth = one(env[FLAG_ENV.oauth]);
      const emergency = String(env.AGENT_ACCESS_EMERGENCY_OFF || "") === "1";
      const planeOn = String(env.AGENT_ACCESS_RUNTIME_FLAGS_ENABLED || "") === "1";
      const meta = { clients: null, mcp: null };
      const flags = { ui, oauth, clients: "0", mcp: "0" };
      let journal = null;
      for (const key of ["clients", "mcp"]) {
        const envPinned = one(env[FLAG_ENV[key]]) === "1";
        if (emergency) { meta[key] = { effective: "0", source: "emergency_off", expires_at: null, env_pinned: envPinned }; continue; }
        if (envPinned) { flags[key] = "1"; meta[key] = { effective: "1", source: "env", expires_at: null, env_pinned: true }; continue; }
        if (!planeOn) { meta[key] = { effective: "0", source: "disabled", expires_at: null, env_pinned: false }; continue; }
        if (!journal) journal = await readJournal();
        if (!journal.rows) { meta[key] = { effective: "0", source: "error", expires_at: null, env_pinned: false }; continue; }
        const verdict = journalGrantsOn(journal.rows[key], now());
        flags[key] = verdict.on ? "1" : "0";
        meta[key] = { effective: flags[key], source: verdict.source, expires_at: verdict.expires_at, env_pinned: false };
      }
      const out = Object.freeze({ ui, oauth, clients: flags.clients, mcp: flags.mcp });
      if (!detail) return out;
      return Object.freeze({ ...out, detail: Object.freeze({ emergency_off: emergency, control_plane_enabled: planeOn, clients: meta.clients, mcp: meta.mcp }) });
    } catch (_) {
      return Object.freeze({ ui: "0", oauth: "0", clients: "0", mcp: "0" });
    }
  }

  return Object.freeze({ resolve, invalidate });
}

module.exports = { FLAG_ENV, createEnvFlagReader, createRuntimeFlagResolver, journalGrantsOn };
