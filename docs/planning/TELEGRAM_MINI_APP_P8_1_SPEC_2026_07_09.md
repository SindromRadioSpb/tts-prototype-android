# CLG-P8.1 — Auth Exchange + Telegram Shell — SPEC (design)

**Date:** 2026-07-09 · **Status:** design/spec (owner-approval gate before code) · **Parents:** `TELEGRAM_MINI_APP_P8_RECON_2026_07_09.md`, `TELEGRAM_MINI_APP_P8_SECURITY_2026_07_09.md`
**Scope:** the **first** P8 slice — initData → scoped session, the Telegram host shell, read-only `/me`, and pairing/consent states. **No review, no challenge, no writes to `review_log`.** Does not depend on the §2.3 anchor-coverage probe (that gates P8.3, not auth).

> **Design only.** This doc contains the migration-034 DDL and endpoint/middleware pseudocode as the *design*. The actual migration file is **not** created here (it would alter prod schema on deploy). Code begins only after owner approval of this spec + the security spec.

---

## 1. Migration 034 (design — `034_miniapp_session.sql`)

**Scope 034 = session model only.** Pure additive `ADD COLUMN` (SQLite-safe with `NOT NULL DEFAULT`). The `agent_challenges.surface` generalization is deferred to **035 at P8.3** because making `telegram_chat_id`/`telegram_prompt_message_id` nullable needs a table rebuild (not a plain ALTER) and P8.1 has no challenge.

```sql
-- CLG-P8.1 scoped Mini App session. Additive only; no rebuild.
ALTER TABLE user_sessions ADD COLUMN session_kind         TEXT NOT NULL DEFAULT 'pwa';
     -- enum: pwa | telegram_miniapp | future_mobile | future_teacher  (validated in code, not a CHECK, to stay additive)
ALTER TABLE user_sessions ADD COLUMN auth_method          TEXT;
     -- 'password_bootstrap' | 'telegram_init_data'
ALTER TABLE user_sessions ADD COLUMN channel_link_id      TEXT REFERENCES channel_links(id) ON DELETE SET NULL;
ALTER TABLE user_sessions ADD COLUMN auth_context_version INTEGER NOT NULL DEFAULT 0;   -- snapshot at mint
ALTER TABLE user_sessions ADD COLUMN absolute_expires_at  TEXT;                          -- hard cap; NULL = none (PWA)
     -- existing `expires_at` continues to serve as the IDLE expiry (slid via last_used_at bump).

ALTER TABLE users ADD COLUMN auth_context_version INTEGER NOT NULL DEFAULT 0;            -- current; bump to mass-invalidate

CREATE INDEX IF NOT EXISTS ix_user_sessions_kind ON user_sessions(user_id, session_kind);

-- Optional short-TTL replay ledger (fork: yes). Stores sha256 of the initData `hash`, NOT the raw hash.
CREATE TABLE IF NOT EXISTS miniapp_initdata_seen (
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_hash  TEXT    NOT NULL,                    -- sha256(initData.hash) — not a secret, dedup key only
  auth_date  INTEGER NOT NULL,
  seen_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, auth_hash)
);
```

**Single-writer invariant (CLAUDE.md):** `034` = the real array index (next after `033`). Verify `listMigrationFiles` orders it after `033_nudge_state_snooze.sql`.

**GDPR:** `miniapp_initdata_seen` and the new `user_sessions` columns carry `user_id` (directly or via the existing row) → auto-covered by the structural sweep (`db/identityRepo.js:135`). `users.auth_context_version` is removed with the users row on delete. **No new `exportUserData` strip needed** — no raw secret in the new columns (`token_hash` is already stripped; `auth_hash` is a hash of a hash, not a session secret). Add a cleanup for expired `miniapp_initdata_seen` rows to the existing session/challenge cleanup job.

---

## 2. Auth exchange — `POST /api/miniapp/session`

Implements security spec §8.1. New module `agent/telegram/miniappAuth.js`.

```
POST /api/miniapp/session   { init_data: "<raw Telegram.WebApp.initData>" }
```

**Ordered, fail-closed:**
1. `MINI_APP_ENABLED==='1'` else 503; principal on `MINI_APP_OWNER_USER_IDS` allowlist else 503 (owner-pilot gate).
2. `TELEGRAM_BOT_TOKEN` present else 503.
3. parse `init_data` (urlencoded), size ≤ cap.
4. split `hash`; build data-check-string (fields sorted, `\n`-joined).
5. `secret = HMAC_SHA256("WebAppData", TELEGRAM_BOT_TOKEN)`; `HMAC_SHA256(secret, dcs)` **constant-time** vs `hash` → else `MINIAPP_BAD_HASH`.
6. `auth_date`: `now-auth_date ≤ MINIAPP_INITDATA_MAX_AGE_SECONDS` (default 3600) and not future → else `MINIAPP_AUTH_STALE`/`_FUTURE`.
7. parse `user.id` (string, no truncation) → else `MINIAPP_NO_USER`.
8. `getActiveLinkByTg(String(user.id),'telegram')` → none = `MINIAPP_NOT_PAIRED` (→ §4 not-paired state).
9. `telegramConsentActive(user_id)` (`tg-v1`) → else `MINIAPP_CONSENT_REVOKED`.
10. replay dedup: `INSERT OR IGNORE INTO miniapp_initdata_seen (user_id, sha256(hash), auth_date)`; if row already present → return the *existing* live session (idempotent), do not mint a second.
11. mint `user_sessions` row: `session_kind='telegram_miniapp'`, `auth_method='telegram_init_data'`, `channel_link_id=<link.id>`, `auth_context_version=<users.auth_context_version>`, `expires_at=now+IDLE`, `absolute_expires_at=now+ABSOLUTE`, fresh `csrf`. Set cookie **`lp_miniapp_session`** (`Secure; HttpOnly; SameSite=Lax`, no `Domain`).
12. rate-limit by Telegram principal + IP (reuse `server.js:1379` shape).
13. log only `{error_code, masked_tg_id}` — never raw initData/user/hash.

Response: `200 { ok:true, csrf, user:{masked}, consents }`.

**Config (env, all configurable — no hardcoded TTLs):**
```
MINI_APP_ENABLED=0
MINI_APP_OWNER_USER_IDS=<owner telegram id>
MINIAPP_INITDATA_MAX_AGE_SECONDS=3600
MINIAPP_SESSION_IDLE_SECONDS=7200          # 2h
MINIAPP_SESSION_ABSOLUTE_SECONDS=86400     # 24h first launch (raise to 7d later)
```

---

## 3. Session middleware — `requireSessionKind('telegram_miniapp')`

Guards every `/api/miniapp/*` route (the BFF audience guard, security §8.2). New helper alongside `requireUser`/`requireCsrf`.

```
validateMiniappSession(req):
  row = validateSession(cookie 'lp_miniapp_session')            # reuse db/identityRepo.js:63
  if !row: 401 MINIAPP_SESSION_INVALID
  if row.session_kind !== 'telegram_miniapp': 403 WRONG_SESSION_KIND
  if now > row.absolute_expires_at: 401 MINIAPP_SESSION_EXPIRED_ABSOLUTE
  # (validateSession already checks expires_at [idle] + revoked_at)
  if row.auth_context_version !== users.auth_context_version(row.user_id): 401 MINIAPP_SESSION_REVOKED
  link = getActiveLink(row.channel_link_id)
  if !link || link.status !== 'active': 401 MINIAPP_LINK_INACTIVE
  if !telegramConsentActive(row.user_id): 401 MINIAPP_CONSENT_REVOKED     # live, fail-closed
  bump last_used_at (slide idle)
  req.user = { id: row.user_id }; req.miniapp = { link_id: row.channel_link_id }
```

Mutations additionally require `X-LP-CSRF` (`requireCsrf`, `server.js:1430`). **`user_id` always from `req.user`, never body** — a body `user_id` mismatch → 403 (mirror `server.js:1622`).

**`auth_context_version` bump triggers** (structural revoke, no row sweep): `/unlink`, `telegram_delivery` revoke, consent-version bump, channel-link deactivation, manual security logout, account delete, (optional) bot-token change. Increment `users.auth_context_version` in the existing cascades (`channelLinkRepo.revokeTelegramCascade` `db/channelLinkRepo.js:196`, consent handler `server.js:1510`).

---

## 4. Telegram shell — `public/miniapp.html` + `public/js/miniapp-host.js`

**`miniapp-host.js`** (Telegram-native host adapter; capability-gated by `isVersionAtLeast`, never `platform`):
- `ready()`, `expand()` (guarded — don't pin CTA over unstable viewport);
- theme: apply `themeParams` CSS vars, subscribe `themeChanged` (live, no reload);
- safe-area: pad from `safeAreaInset` + `contentSafeAreaInset` CSS vars (**not** CSS `env()` — iOS-unreliable); subscribe `safeAreaChanged`/`contentSafeAreaChanged`; fallback constant if <8.0;
- `BackButton` show/onClick with teardown on view change;
- `isActive`/`activated`/`deactivated` (≥8.0) else `document.visibilitychange`;
- `enableClosingConfirmation` **only** when there's real unsaved input (none in P8.1);
- `start_param` read (validate server-side; treat as hint, never auto-act);
- all handlers cleaned up on teardown (no stale handler / double callback).

**`miniapp.html`** (P8.1 = shell + read-only home stub only):
- boots host adapter → `POST /api/miniapp/session` with raw `Telegram.WebApp.initData` → on 200, `GET /api/miniapp/home` (read-only: due count + consents), render a stub;
- **states (each honest copy + safe action, no generic "something went wrong"):** boot · SDK unavailable · raw initData missing · auth loading · invalid signature · expired auth_date · **not paired** · pending pairing · link revoked · delivery-consent revoked · home loading · home ready · feature-flag off / not-allowlisted;
- **not-paired (§5.3):** the Mini App cannot mint a PWA session; show an honest "link your LinguistPro account" state. For the owner-pilot the owner is already paired, so this is a stub message + a `openLink` to the PWA pairing screen (gesture-bound). Full reverse-pairing for external users is a later concern (out of P8.1).
- rendering via `textContent` only; `dir=auto`/`dir=rtl` (reuse mentor-home pattern); 320/360/380/430 widths; light/dark.

**`index.html` / `library.html` untouched.** `mentor-home.js` renderers are reused only from P8.2 onward (home secondary layer).

---

## 5. `GET /api/miniapp/home` (read-only)

BFF route (guarded by `requireSessionKind`). Internally calls `learnerGraphRepo.getAgentContext(user_id)` → returns `{ due_now, scheduled, last_review_at, recommendation:null (P8.2), consents }`. **No writes** (MNAR: opening the home is not a learning event). This is the P8.1 acceptance surface.

---

## 6. Gate — `smoke:miniapp-auth` (independent, not tautological)

Drives the real HTTP + session path with an independently-constructed initData:
- valid raw initData (freshly HMAC-signed with a test bot token) → session minted;
- tampered field / bad hash → `MINIAPP_BAD_HASH`, no session;
- expired / future `auth_date` → rejected;
- missing `user` → rejected;
- 64-bit Telegram id preserved as string (no truncation);
- unlinked / pending / revoked link → `MINIAPP_NOT_PAIRED` / not-active;
- revoked `telegram_delivery` → rejected;
- foreign `user_id` in a `/api/miniapp/*` body → 403;
- replay (same hash+auth_date) → same session, not a new row;
- idle expiry, absolute expiry → rejected after each;
- `auth_context_version` bump (simulate unlink) → session invalid on next request **without** a row sweep;
- wrong `session_kind` (a `pwa` cookie on `/api/miniapp/*`) → 403;
- **assert raw initData / hash absent from stdout + logs.**

Independence: the test builds the expected HMAC itself from a test token (not by calling the server's validator), and constructs expected session/lifetime state from first principles.

**Regression to keep green:** auth, telegram-pairing, telegram-review/selector/dictate/cloze, mentor-home, learner-graph, account export/delete, api-smoke.

---

## 7. Acceptance (P8.1, owner)
1. Owner taps the bot menu button → Mini App opens → authed **without a second login**.
2. Home stub shows the honest due count (matches `/api/learner/context`).
3. **Nothing** is written to `review_log` (MNAR).
4. Theme + safe-area correct on Android + iOS + Desktop (real clients, not desktop-Chrome-resized).
5. Revoking `telegram_delivery` (or `/unlink`) immediately blocks further `/api/miniapp/*` calls.
6. `export`/`delete` cover the new session rows + `miniapp_initdata_seen`.
7. Tier-1/PWA unaffected.

## 8. New files (P8.1)
- `migrations/034_miniapp_session.sql`
- `agent/telegram/miniappAuth.js` (initData validate + session mint)
- server: `/api/miniapp/session`, `/api/miniapp/home` + `requireSessionKind` helper
- `public/miniapp.html`, `public/js/miniapp-host.js`
- `scripts/premium/miniapp-auth-smoke.js` (gate) + `package.json` `smoke:miniapp-auth`

## 9. Not in P8.1 (deferred)
- Any challenge/review/write (`agent_challenges.surface` → migration 035, P8.3).
- `reviewSessionService` extraction (P8.3).
- `ReviewAllocationPolicy` module (P8.3).
- Handoff tokens (migration 035+, P8.5).
- Full reverse-pairing for unpaired external users (post-pilot).
