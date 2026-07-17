#!/usr/bin/env node
"use strict";

// Local visual fixture only. It serves the production HTML/CSS/JS with inert,
// synthetic API responses; it never opens the project DB or an external socket.
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const PORT = Number(process.env.PORT || 3350);
const SCOPES = [
  ["learning.brief.read", "CURRENT_LEARNING_PRIORITY", "BOUNDED_AGGREGATE", "NO_WORDS_ITEMS_ANSWERS_OR_PRIVATE_EVIDENCE"],
  ["review.summary.read", "REVIEW_AVAILABILITY_AND_HANDOFF_ELIGIBILITY", "COUNTS_DURATION_ELIGIBILITY", "NO_REVIEW_ITEMS_ANSWERS_GRADES_OR_FSRS"],
  ["reading.public.search", "PUBLIC_READING_DISCOVERY", "PUBLIC_CORPUS_METADATA", "NO_PRIVATE_TEXT_OR_CORPUS_BODY"],
  ["explanations.metadata.read", "EXPLANATION_REVISIT", "IDS_DATES_KINDS_CONSTRUCT_IDS_PURGE_STATE", "NO_EXPLANATION_BODY_OR_SOURCE_BODY"],
  ["agent.connection.read", "CONNECTION_SELF_INSPECTION", "CONNECTION_AND_GRANT_METADATA", "NO_TOKEN_COOKIE_CSRF_SUBJECT_OR_PRIVATE_DATA"],
];
function json(res, body) {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
function asset(res, relative, type) {
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  fs.createReadStream(path.join(ROOT, relative)).pipe(res);
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/agent-access.html") return asset(res, "public/agent-access.html", "text/html; charset=utf-8");
  if (url.pathname === "/css/agent-access.css") return asset(res, "public/css/agent-access.css", "text/css; charset=utf-8");
  if (url.pathname === "/js/agent-access.js") return asset(res, "public/js/agent-access.js", "application/javascript; charset=utf-8");
  if (url.pathname === "/api/auth/me") return json(res, { ok: true, csrf: "fixture-only" });
  if (url.pathname === "/api/agent-access/connections") return json(res, { ok: true, connections: [{ connection_id: "fixture-connection", client_display_name: "Hermes · личный профиль", display_label: "Telegram learning companion", status: "ACTIVE", grants: [{ scope: "learning.brief.read", status: "ACTIVE" }, { scope: "reading.public.search", status: "ACTIVE" }] }] });
  if (url.pathname === "/api/agent-access/consent/fixture-request") return json(res, { ok: true, preview: { schema_version: "aa.consent.preview.1.0.0", request_id: "fixture-request", client_display_name: "Hermes · новый профиль", connection_label: "Personal learning agent", requested_scopes: SCOPES.map(([scope, purpose, data_class, excludes]) => ({ scope, purpose, data_class, excludes, downstream_retention: "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO" })), consent_version: "agent-access-consent-v1", capability_version: "aa-v0.1", retention_notice_version: "downstream-retention-v1", expires_at: "2099-01-01T00:00:00.000Z", canonical_authority: "LINGUISTPRO_ONLY", external_memory_is_learner_truth: false } });
  if (url.pathname === "/api/agent-access/admin/state") return json(res, { ok: true, schema_version: "aa.control.1.0.0", control_plane_enabled: true, emergency_off: false, journal_ok: true, flags: { clients: { effective: "1", source: "db_window", expires_at: "2026-07-18T21:30:00.000Z", env_pinned: false }, mcp: { effective: "0", source: "off", expires_at: null, env_pinned: false } }, effective: { ui: "1", oauth: "1", clients: "1", mcp: "0" }, clients: [{ oauth_client_id: "linguistpro-hermes-owner-v0", display_name: "Hermes (owner)", software_version: "0.18.2", status: "SUSPENDED" }, { oauth_client_id: "linguistpro-mcp-inspector-v0", display_name: "MCP Inspector", software_version: "0.22.0", status: "ACTIVE" }], events: [{ event_id: 3, created_at: "2026-07-18T12:10:00.000Z", actor_user_id: "u_fixture", action: "WINDOW_OPEN", subject: "clients", value: "1", expires_at: "2026-07-18T21:30:00.000Z", reason: "owner ui: window 60m" }, { event_id: 2, created_at: "2026-07-18T11:00:00.000Z", actor_user_id: "u_fixture", action: "WINDOW_CLOSE", subject: "mcp", value: "0", expires_at: null, reason: "owner ui: close" }] });
  if (req.method === "POST" || req.method === "DELETE") return json(res, { ok: true });
  res.writeHead(404); res.end("not found");
}).listen(PORT, "127.0.0.1", () => console.log(`Agent Access visual fixture on ${PORT}`));
