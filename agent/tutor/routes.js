"use strict";
const { closed, fail } = require("./response");
const STATUS = { not_available:404, slow_down:429, practice_unavailable: 409, attempt_closed: 409, invalid_request: 400, invalid_context: 400, context_too_large: 413, invalid_output: 422,
  context_unavailable: 404, context_expired: 410, connection_required: 401, lease_invalid: 403,
  pairing_expired: 410, agent_offline: 409, session_busy: 409, request_conflict: 409, result_rejected: 409, session_limit: 429 };
function installRoutes(app, { store, enabled, requireUser, requireCsrf, limiter, capability = enabled, enrollmentLimiter = (_q,_s,n)=>n() }) {
  const base = "/api/tutor";
  app.get(base + "/capabilities", async (req, res) => {
    let on=false;try{on=!!await capability(req);}catch(_){}
    res.set("Cache-Control", "no-store"); res.json({ ok: true, enabled: on, version: "lp-tutor-transport.1" });
  });
  app.use(base, async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    let on=false;try{on=!!await enabled();}catch(_){}
    if (!on) return res.status(404).json({ ok: false, error: "not_available" });
    next();
  }, limiter);
  const route = (method, path, owner, fn) => app[method](base + path, async (req, res) => {
    try {
      let auth;
      if (owner) {
        auth = await requireUser(req, res); if (!auth) return;
        if (method !== "get" && !requireCsrf(req, res, auth)) return;
      }
      if (method !== "get" && (!req.is("application/json") || Buffer.byteLength(JSON.stringify(req.body || {})) > 40000)) fail("invalid_request");
      const out = await fn(req, auth);
      return res.json({ ok: true, ...out });
    } catch (e) { return res.status(STATUS[e.code] || 500).json({ ok: false, error: STATUS[e.code] ? e.code : "service_unavailable" }); }
  });
  const token = req => {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get("Authorization") || "");
    if (!match) fail("connection_required"); return match[1];
  };
  route("get", "/connection", true, (_req, auth) => store.status(auth.user.id));
  route("post", "/pair", true, (req, auth) => { closed(req.body, []); return store.pair(auth.user.id); });
  route("post", "/revoke", true, (req, auth) => { closed(req.body, []); return store.revoke(auth.user.id); });
  route("post", "/sessions", true, (req, auth) => store.create(auth.user.id, req.body));
  route("get", "/sessions/:id", true, async (req, auth) => {
    const out = await store.read(auth.user.id, req.params.id);
    return req.query.since === String(out.version) ? { id: out.id, version: out.version, unchanged: true } : out;
  });
  route("post", "/sessions/:id/cancel", true, (req, auth) => { closed(req.body, []); return store.cancel(auth.user.id, req.params.id); });
  route("post", "/sessions/:id/practice", true, (req,auth)=>{closed(req.body,[]);return store.practice(auth.user.id,req.params.id);});
  route("post", "/sessions/:id/practice/hint", true, (req,auth)=>{closed(req.body,[]);return store.practiceHint(auth.user.id,req.params.id);});
  route("post", "/sessions/:id/practice/attempt", true, (req,auth)=>store.practiceAttempt(auth.user.id,req.params.id,req.body));
  app.use(base+"/connector/enroll",enrollmentLimiter);
  route("post", "/connector/enroll", false, req=>store.enroll(req.body));
  route("post", "/connector/enrollment-poll", false, req=>store.enrollmentPoll(req.body));
  route("post", "/enrollment", true, (req,auth)=>store.enrollment(auth.user.id,req.body));
  route("post", "/enrollment/approve", true, (req,auth)=>store.enrollment(auth.user.id,req.body,true));
  route("post", "/connector/pair", false, req => store.claim(req.body));
  route("post", "/connector/revoke", false, req=>{closed(req.body,[]);return store.revokeConnector(token(req));});
  route("post", "/connector/next", false, req => { closed(req.body, []); return store.next(token(req)); });
  for (const action of ["heartbeat", "complete"]) route("post", `/connector/:id/${action}`, false, req => {
    closed(req.body, action === "complete" ? ["lease", "response"] : ["lease"]);
    if (typeof req.body.lease !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(req.body.lease)) fail("lease_invalid");
    return store[action](token(req), req.params.id, req.body.lease, req.body.response);
  });
}
module.exports = { installRoutes };
