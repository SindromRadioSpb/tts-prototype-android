-- M3: narrow rollout and browser-approved outbound device enrollment.
CREATE TABLE IF NOT EXISTS tutor_rollout (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,
 reason TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tutor_enrollments (
 device_hash TEXT PRIMARY KEY,
 code_hash TEXT NOT NULL UNIQUE,
 client_nonce TEXT NOT NULL,
 device_name TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
 approved_at INTEGER,
 poll_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tutor_enrollment_expiry ON tutor_enrollments(expires_at);
