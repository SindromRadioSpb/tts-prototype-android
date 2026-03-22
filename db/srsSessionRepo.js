"use strict";

const crypto = require("crypto");

const { getDb } = require("./sqlite");
const {
  getCardSnapshotById,
  reviewSentenceCard,
  listTodayCards,
} = require("./srsRepo");

function uuidv4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function nowIso() {
  return new Date().toISOString();
}

function parseJsonSafe(value, fallback) {
  if (value == null || value === "") return fallback;
  try {
    const parsed = JSON.parse(String(value));
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function normalizeStats(stats) {
  const src = (stats && typeof stats === "object") ? stats : {};
  return {
    again: Number(src.again || 0),
    hard: Number(src.hard || 0),
    good: Number(src.good || 0),
    easy: Number(src.easy || 0),
  };
}

function ratingKey(rating) {
  if (Number(rating) === 1) return "again";
  if (Number(rating) === 2) return "hard";
  if (Number(rating) === 3) return "good";
  if (Number(rating) === 4) return "easy";
  return null;
}

function mapSessionRow(row) {
  if (!row) return null;
  const queue = parseJsonSafe(row.queue_json, []);
  const stats = normalizeStats(parseJsonSafe(row.stats_json, {}));
  const total = Number(row.cards_total || queue.length || 0);
  const currentIndex = Math.max(0, Number(row.current_index || 0));
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    source: row.source || null,
    queue,
    currentIndex,
    cardsTotal: total,
    cardsSeen: Number(row.cards_seen || 0),
    reviewsDone: Number(row.reviews_done || 0),
    stats,
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
  };
}

function buildProgress(session) {
  const total = Number(session.cardsTotal || session.queue.length || 0);
  const currentIndex = Math.max(0, Number(session.currentIndex || 0));
  const remaining = Math.max(0, total - currentIndex);
  return {
    index: currentIndex,
    total,
    remaining,
    completed: Math.min(total, currentIndex),
  };
}

async function getSessionById(sessionId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const row = await dbGet(
    db,
    `
    SELECT
      id,
      status,
      mode,
      source,
      queue_json,
      current_index,
      cards_total,
      cards_seen,
      reviews_done,
      stats_json,
      started_at,
      finished_at
    FROM srs_session_runs
    WHERE id = ?
    LIMIT 1;
    `,
    [String(sessionId)]
  );

  return mapSessionRow(row);
}

async function getTodaySummary({ limit = 200, templateCode = "" } = {}) {
  const cards = await listTodayCards({ limit, templateCode });
  const summary = {
    dueCount: cards.length,
    byState: {
      new: 0,
      learning: 0,
      review: 0,
      relearning: 0,
    },
  };

  for (const item of cards) {
    const state = String(item && item.card && item.card.state || "new").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(summary.byState, state)) {
      summary.byState[state] += 1;
    }
  }

  return summary;
}

async function createTodaySession({ limit = 50, source = "ui", mode = "reveal", templateCode = "" } = {}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const todayCards = await listTodayCards({ limit, templateCode });
  const queue = todayCards
    .map((item) => item && item.card && item.card.id)
    .filter(Boolean);

  const id = uuidv4();
  const ts = nowIso();
  const cardsTotal = queue.length;
  const status = cardsTotal > 0 ? "active" : "finished";
  const finishedAt = cardsTotal > 0 ? null : ts;
  const stats = normalizeStats({});

  await dbRun(
    db,
    `
    INSERT INTO srs_session_runs (
      id, status, mode, source,
      queue_json, current_index, cards_total, cards_seen, reviews_done, stats_json,
      started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, 0, 0, ?, ?, ?);
    `,
    [
      id,
      status,
      String(mode || "reveal").slice(0, 24) || "reveal",
      source || "ui",
      JSON.stringify(queue),
      cardsTotal,
      JSON.stringify(stats),
      ts,
      finishedAt,
    ]
  );

  return getSessionById(id);
}

async function advancePastMissingCards(session) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  let currentIndex = Number(session.currentIndex || 0);
  while (currentIndex < session.queue.length) {
    const cardId = session.queue[currentIndex];
    const snapshot = await getCardSnapshotById(cardId);
    if (snapshot && snapshot.sentence && snapshot.card) {
      if (currentIndex !== session.currentIndex) {
        await dbRun(
          db,
          `UPDATE srs_session_runs SET current_index = ?, cards_seen = ? WHERE id = ?`,
          [currentIndex, currentIndex, session.id]
        );
        session.currentIndex = currentIndex;
        session.cardsSeen = currentIndex;
      }
      return { session, current: snapshot };
    }
    currentIndex += 1;
  }

  const finishedAt = nowIso();
  await dbRun(
    db,
    `UPDATE srs_session_runs SET status = 'finished', current_index = ?, cards_seen = ?, finished_at = COALESCE(finished_at, ?) WHERE id = ?`,
    [session.queue.length, session.queue.length, finishedAt, session.id]
  );
  return {
    session: {
      ...session,
      status: "finished",
      currentIndex: session.queue.length,
      cardsSeen: session.queue.length,
      finishedAt,
    },
    current: null,
  };
}

async function getSessionNext(sessionId) {
  const session = await getSessionById(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");

  if (session.status !== "active") {
    return {
      session,
      done: true,
      current: null,
      progress: buildProgress(session),
    };
  }

  const { session: advancedSession, current } = await advancePastMissingCards(session);
  return {
    session: advancedSession,
    done: !current,
    current,
    progress: buildProgress(advancedSession),
  };
}

async function reviewSessionNext({ sessionId, rating, reviewTimeMs = null }) {
  const session = await getSessionById(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status !== "active") throw new Error("SESSION_NOT_ACTIVE");

  const nextState = await getSessionNext(sessionId);
  if (nextState.done || !nextState.current || !nextState.current.sentence) {
    throw new Error("SESSION_EMPTY");
  }

  const cardId = nextState.current.card && nextState.current.card.id;
  if (!cardId) throw new Error("SESSION_EMPTY");
  const reviewed = await reviewSentenceCard({ cardId, rating, reviewTimeMs });

  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const activeSession = nextState.session || session;
  const stats = normalizeStats(activeSession.stats);
  const key = ratingKey(rating);
  if (!key) throw new Error("BAD_RATING");
  stats[key] += 1;

  const nextIndex = Math.min(activeSession.queue.length, Number(activeSession.currentIndex || 0) + 1);
  const finished = nextIndex >= activeSession.queue.length;
  const finishedAt = finished ? nowIso() : null;

  await dbRun(
    db,
    `
    UPDATE srs_session_runs
    SET current_index = ?,
        cards_seen = ?,
        reviews_done = ?,
        stats_json = ?,
        status = ?,
        finished_at = CASE WHEN ? IS NOT NULL THEN ? ELSE finished_at END
    WHERE id = ?;
    `,
    [
      nextIndex,
      nextIndex,
      Number(activeSession.reviewsDone || 0) + 1,
      JSON.stringify(stats),
      finished ? "finished" : "active",
      finishedAt,
      finishedAt,
      activeSession.id,
    ]
  );

  const updatedSession = await getSessionById(activeSession.id);
  const next = await getSessionNext(activeSession.id);
  return {
    session: updatedSession,
    reviewed,
    done: next.done,
    next: next.current,
    progress: next.progress,
  };
}

async function finishSession(sessionId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const session = await getSessionById(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status !== "active") return session;

  const finishedAt = nowIso();
  await dbRun(
    db,
    `
    UPDATE srs_session_runs
    SET status = 'finished',
        finished_at = COALESCE(finished_at, ?)
    WHERE id = ?;
    `,
    [finishedAt, session.id]
  );

  return getSessionById(session.id);
}

module.exports = {
  getTodaySummary,
  createTodaySession,
  getSessionById,
  getSessionNext,
  reviewSessionNext,
  finishSession,
};
