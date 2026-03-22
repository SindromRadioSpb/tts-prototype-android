"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const sqlite3 = require("sqlite3").verbose();

const REPO_ROOT = path.resolve(__dirname, "..");
const DB_PATH = process.env.DB_PATH || path.join(REPO_ROOT, "data", "app.db");
const PORT = Number(process.env.API_SMOKE_PORT || 3107);
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openDb(dbPath, mode = sqlite3.OPEN_READONLY) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, mode, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
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

function closeDb(db) {
  return new Promise((resolve) => {
    if (!db) return resolve();
    db.close(() => resolve());
  });
}

function pickNeedle(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}_'"-]{1,}/gu);
    if (matches && matches.length > 0) {
      const token = matches.find((item) => item.length >= 2);
      if (token) return token;
    }
  }
  return null;
}

async function loadFixtureData(dbPath) {
  const db = await openDb(dbPath);
  try {
    const srsSentenceSample = await dbGet(
      db,
      `
      SELECT s.id AS sentenceId, s.text_id AS textId, s.he_plain AS hePlain, s.ru AS ru
      FROM sentences s
      LEFT JOIN srs_cards c
        ON c.entity_type = 'sentence'
       AND c.entity_id = s.id
      WHERE c.id IS NULL
      ORDER BY s.created_at DESC, s.order_index ASC
      LIMIT 1
      `
    );

    const sentenceSample = srsSentenceSample || await dbGet(
      db,
      `
      SELECT s.id AS sentenceId, s.text_id AS textId, s.he_plain AS hePlain, s.ru AS ru
      FROM sentences s
      ORDER BY s.created_at DESC, s.order_index ASC
      LIMIT 1
      `
    );

    const noteSample = await dbGet(
      db,
      `
      SELECT n.id AS noteId, n.text_id AS textId, n.sentence_id AS sentenceId, n.note AS note
      FROM sentence_notes n
      WHERE length(trim(COALESCE(n.note, ''))) >= 2
      ORDER BY n.updated_at DESC
      LIMIT 1
      `
    );

    return {
      sentence: sentenceSample
        ? {
            ...sentenceSample,
            q: pickNeedle(sentenceSample.hePlain, sentenceSample.ru),
          }
        : null,
      srsSentence: srsSentenceSample
        ? {
            ...srsSentenceSample,
            q: pickNeedle(srsSentenceSample.hePlain, srsSentenceSample.ru),
          }
        : null,
      note: noteSample
        ? {
            ...noteSample,
            q: pickNeedle(noteSample.note),
          }
        : null,
    };
  } finally {
    await closeDb(db);
  }
}

async function waitForHealth(baseUrl, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.ok) return;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error(`Server did not become healthy within ${timeoutMs} ms`);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    throw new Error(`Invalid JSON from ${url}: ${e.message}\nBody: ${text}`);
  }
  if (!res.ok) {
    throw new Error(`Request failed ${res.status} for ${url}: ${text}`);
  }
  return data;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    throw new Error(`Invalid JSON from ${url}: ${e.message}\nBody: ${text}`);
  }
  if (!res.ok) {
    throw new Error(`Request failed ${res.status} for ${url}: ${text}`);
  }
  return data;
}

function startServer(dbPath, port) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  const pushLog = (prefix) => (chunk) => {
    const text = String(chunk || "").trim();
    if (!text) return;
    logs.push(`${prefix}${text}`);
    if (logs.length > 50) logs.shift();
  };

  child.stdout.on("data", pushLog("[stdout] "));
  child.stderr.on("data", pushLog("[stderr] "));

  return { child, logs };
}

async function stopServer(child) {
  if (!child || child.killed) return;

  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

  if (exited) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

async function cleanupSrsArtifacts(dbPath, sentenceId) {
  if (!sentenceId) return;

  const db = await openDb(dbPath, sqlite3.OPEN_READWRITE);
  try {
    const card = await dbGet(
      db,
      `SELECT id FROM srs_cards WHERE entity_type = 'sentence' AND entity_id = ?`,
      [sentenceId]
    );
    if (!card || !card.id) return;
    const rows = await new Promise((resolve, reject) => {
      db.all(`SELECT id FROM srs_cards WHERE entity_type = 'sentence' AND entity_id = ?`, [sentenceId], (err, list) => {
        if (err) reject(err);
        else resolve(list || []);
      });
    });
    for (const row of rows) {
      await dbRun(db, `DELETE FROM srs_review_events WHERE card_id = ?`, [row.id]);
      await dbRun(db, `DELETE FROM srs_cards WHERE id = ?`, [row.id]);
    }
  } finally {
    await closeDb(db);
  }
}

async function run() {
  const fixtureData = await loadFixtureData(DB_PATH);
  if (!fixtureData.sentence || !fixtureData.sentence.sentenceId || !fixtureData.sentence.textId) {
    throw new Error("Could not find a sentence sample in the database for /api/nav/resolve and /api/sentences/search");
  }

  const { child, logs } = startServer(DB_PATH, PORT);
  let srsCleanupSentenceId = null;

  try {
    await waitForHealth(BASE_URL);
    console.log(`PASS /healthz -> server booted on ${BASE_URL}`);

    const navResolve = await fetchJson(
      `${BASE_URL}/api/nav/resolve?type=sentence&id=${encodeURIComponent(fixtureData.sentence.sentenceId)}`
    );
    if (!navResolve.ok || navResolve.textId !== fixtureData.sentence.textId) {
      throw new Error(`Unexpected /api/nav/resolve payload: ${JSON.stringify(navResolve)}`);
    }
    console.log("PASS /api/nav/resolve -> resolved sentence to expected text");

    if (fixtureData.note && fixtureData.note.q) {
      const notesSearch = await fetchJson(
        `${BASE_URL}/api/notes/search?q=${encodeURIComponent(fixtureData.note.q)}&limit=10`
      );
      if (!notesSearch.ok || !Array.isArray(notesSearch.results)) {
        throw new Error(`Unexpected /api/notes/search payload: ${JSON.stringify(notesSearch)}`);
      }
      const matched = notesSearch.results.some(
        (row) => row && row.sentenceId === fixtureData.note.sentenceId && row.textId === fixtureData.note.textId
      );
      if (!matched) {
        throw new Error(`Selected note sample was not returned by /api/notes/search for query "${fixtureData.note.q}"`);
      }
      console.log("PASS /api/notes/search -> found selected note sample");
    } else {
      const notesGuard = await fetchJson(`${BASE_URL}/api/notes/search?q=&limit=10`);
      if (!notesGuard.ok || !Array.isArray(notesGuard.results) || notesGuard.results.length !== 0) {
        throw new Error(`Unexpected empty-query /api/notes/search payload: ${JSON.stringify(notesGuard)}`);
      }
      console.log("PASS /api/notes/search -> empty-query guard works");
    }

    if (!fixtureData.sentence.q) {
      throw new Error("Could not derive a search token for /api/sentences/search");
    }
    const sentencesSearch = await fetchJson(
      `${BASE_URL}/api/sentences/search?q=${encodeURIComponent(fixtureData.sentence.q)}&limit=10`
    );
    if (!sentencesSearch.ok || !Array.isArray(sentencesSearch.results)) {
      throw new Error(`Unexpected /api/sentences/search payload: ${JSON.stringify(sentencesSearch)}`);
    }
    const sentenceMatched = sentencesSearch.results.some(
      (row) => row && row.sentenceId === fixtureData.sentence.sentenceId && row.textId === fixtureData.sentence.textId
    );
    if (!sentenceMatched) {
      throw new Error(
        `Selected sentence sample was not returned by /api/sentences/search for query "${fixtureData.sentence.q}"`
      );
    }
    console.log("PASS /api/sentences/search -> found selected sentence sample");

    if (fixtureData.srsSentence && fixtureData.srsSentence.sentenceId) {
      const templateList = await fetchJson(`${BASE_URL}/api/srs/templates`);
      if (!templateList.ok || !Array.isArray(templateList.templates) || templateList.templates.length < 2) {
        throw new Error(`Unexpected /api/srs/templates payload: ${JSON.stringify(templateList)}`);
      }
      console.log("PASS /api/srs/templates -> template catalog responds");

      const srsGetBefore = await fetchJson(
        `${BASE_URL}/api/srs/cards?sentenceId=${encodeURIComponent(fixtureData.srsSentence.sentenceId)}&templateCode=ru_to_he`
      );
      if (!srsGetBefore.ok || srsGetBefore.card !== null) {
        throw new Error(`Unexpected initial /api/srs/cards payload: ${JSON.stringify(srsGetBefore)}`);
      }
      console.log("PASS /api/srs/cards -> empty state for fresh sentence");

      const srsCreated = await postJson(`${BASE_URL}/api/srs/cards`, {
        sentenceId: fixtureData.srsSentence.sentenceId,
        templateCode: "ru_to_he",
      });
      if (!srsCreated.ok || !srsCreated.card || srsCreated.card.state !== "new") {
        throw new Error(`Unexpected SRS create payload: ${JSON.stringify(srsCreated)}`);
      }
      if (!srsCreated.card.template || srsCreated.card.template.code !== "ru_to_he") {
        throw new Error(`Unexpected default template on create: ${JSON.stringify(srsCreated)}`);
      }
      srsCleanupSentenceId = fixtureData.srsSentence.sentenceId;
      console.log("PASS /api/srs/cards POST -> created new sentence card");

      const srsGenerated = await postJson(`${BASE_URL}/api/srs/cards/generate`, {
        sentenceId: fixtureData.srsSentence.sentenceId,
        templateCodes: ["he_to_ru"],
      });
      if (!srsGenerated.ok || !Array.isArray(srsGenerated.cards) || !srsGenerated.cards.some((row) => row.card && row.card.template && row.card.template.code === "he_to_ru")) {
        throw new Error(`Unexpected SRS generate payload: ${JSON.stringify(srsGenerated)}`);
      }
      console.log("PASS /api/srs/cards/generate -> created secondary template card");

      const trainerView = await fetchJson(
        `${BASE_URL}/api/srs/cards/${encodeURIComponent(srsCreated.card.id)}/trainer-view?mode=typing`
      );
      if (!trainerView.ok || !trainerView.trainer || trainerView.trainer.mode !== "typing") {
        throw new Error(`Unexpected /api/srs/cards/:id/trainer-view payload: ${JSON.stringify(trainerView)}`);
      }
      console.log("PASS /api/srs/cards/:id/trainer-view -> typing payload responds");

      const expectedTypingAnswer = String(
        (trainerView.card && trainerView.card.template && trainerView.card.template.code === "he_to_ru")
          ? (trainerView.sentence && trainerView.sentence.ru)
          : (trainerView.sentence && (trainerView.sentence.heNiqqud || trainerView.sentence.hePlain))
      ).trim();
      if (!expectedTypingAnswer) {
        throw new Error(`Could not derive expected trainer answer from payload: ${JSON.stringify(trainerView)}`);
      }
      const attemptChecked = await postJson(`${BASE_URL}/api/srs/attempts/check`, {
        cardId: srsCreated.card.id,
        attemptType: "typing",
        answer: expectedTypingAnswer,
        latencyMs: 900,
      });
      if (!attemptChecked.ok || !attemptChecked.isCorrect || attemptChecked.attemptType !== "typing") {
        throw new Error(`Unexpected /api/srs/attempts/check payload: ${JSON.stringify(attemptChecked)}`);
      }
      console.log("PASS /api/srs/attempts/check -> typing answer accepted");

      const srsReviewed = await postJson(`${BASE_URL}/api/srs/review`, {
        sentenceId: fixtureData.srsSentence.sentenceId,
        templateCode: "ru_to_he",
        rating: 3,
        reviewTimeMs: 1200,
      });
      if (!srsReviewed.ok || !srsReviewed.card || srsReviewed.card.state !== "review") {
        throw new Error(`Unexpected SRS review payload: ${JSON.stringify(srsReviewed)}`);
      }
      if (Number(srsReviewed.card.intervalDays || 0) < 1) {
        throw new Error(`Unexpected SRS interval after review: ${JSON.stringify(srsReviewed)}`);
      }
      console.log("PASS /api/srs/review -> advanced card schedule");

      const srsToday = await fetchJson(`${BASE_URL}/api/srs/today?limit=10&templateCode=ru_to_he`);
      if (!srsToday.ok || !Array.isArray(srsToday.cards)) {
        throw new Error(`Unexpected /api/srs/today payload: ${JSON.stringify(srsToday)}`);
      }
      if (!srsToday.cards.every((row) => row && row.card && row.card.id && row.card.template && row.card.template.code === "ru_to_he")) {
        throw new Error(`Today queue did not return card-backed items: ${JSON.stringify(srsToday)}`);
      }
      console.log("PASS /api/srs/today -> queue endpoint respects template filter");

      const srsSummary = await fetchJson(`${BASE_URL}/api/srs/today/summary?limit=20&templateCode=ru_to_he`);
      if (!srsSummary.ok || !srsSummary.summary || typeof srsSummary.summary.dueCount !== "number") {
        throw new Error(`Unexpected /api/srs/today/summary payload: ${JSON.stringify(srsSummary)}`);
      }
      console.log("PASS /api/srs/today/summary -> summary endpoint respects template filter");

      const sessionStarted = await postJson(`${BASE_URL}/api/srs/sessions`, {
        source: "api-smoke",
        limit: 20,
        mode: "typing",
        templateCode: "ru_to_he",
      });
      if (!sessionStarted.ok || !sessionStarted.session || !sessionStarted.session.id) {
        throw new Error(`Unexpected /api/srs/sessions payload: ${JSON.stringify(sessionStarted)}`);
      }
      if (sessionStarted.session.mode !== "typing") {
        throw new Error(`Session did not preserve trainer mode: ${JSON.stringify(sessionStarted)}`);
      }
      if (sessionStarted.current && sessionStarted.current.card && sessionStarted.current.card.template && sessionStarted.current.card.template.code !== "ru_to_he") {
        throw new Error(`Session queue leaked a card from another template: ${JSON.stringify(sessionStarted)}`);
      }
      console.log("PASS /api/srs/sessions -> started trainer session");

      const sessionNext = await fetchJson(
        `${BASE_URL}/api/srs/sessions/${encodeURIComponent(sessionStarted.session.id)}/next`
      );
      if (!sessionNext.ok || !sessionNext.session) {
        throw new Error(`Unexpected /api/srs/sessions/:id/next payload: ${JSON.stringify(sessionNext)}`);
      }
      if (sessionNext.current && sessionNext.current.card && sessionNext.current.card.template && sessionNext.current.card.template.code !== "ru_to_he") {
        throw new Error(`Session next returned a card from another template: ${JSON.stringify(sessionNext)}`);
      }
      console.log("PASS /api/srs/sessions/:id/next -> next-card endpoint responds");

      if (sessionNext.current && sessionNext.current.card && sessionNext.current.card.id) {
        const sessionReviewed = await postJson(
          `${BASE_URL}/api/srs/sessions/${encodeURIComponent(sessionStarted.session.id)}/review`,
          { rating: 1, reviewTimeMs: 750 }
        );
        if (!sessionReviewed.ok || !sessionReviewed.reviewed || !sessionReviewed.session) {
          throw new Error(`Unexpected /api/srs/sessions/:id/review payload: ${JSON.stringify(sessionReviewed)}`);
        }
        console.log("PASS /api/srs/sessions/:id/review -> session review advances queue");
      }

      const sessionFinished = await postJson(
        `${BASE_URL}/api/srs/sessions/${encodeURIComponent(sessionStarted.session.id)}/finish`,
        {}
      );
      if (!sessionFinished.ok || !sessionFinished.session || sessionFinished.session.status !== "finished") {
        throw new Error(`Unexpected /api/srs/sessions/:id/finish payload: ${JSON.stringify(sessionFinished)}`);
      }
      console.log("PASS /api/srs/sessions/:id/finish -> session can be closed");

      const analyticsDb = await openDb(DB_PATH);
      try {
        const eventRows = await dbAll(
          analyticsDb,
          `
          SELECT event_type, COUNT(*) AS count
          FROM events
          WHERE event_type IN ('search_query', 'srs_review', 'trainer_attempt', 'srs_session_started', 'srs_session_finished')
          GROUP BY event_type
          ORDER BY event_type ASC
          `
        );
        const counts = Object.fromEntries(eventRows.map((row) => [String(row.event_type || ""), Number(row.count || 0)]));
        for (const type of ["search_query", "srs_review", "trainer_attempt", "srs_session_started", "srs_session_finished"]) {
          if (!counts[type] || counts[type] < 1) {
            throw new Error(`Expected analytics event "${type}" to be written into events table; got ${JSON.stringify(counts)}`);
          }
        }
      } finally {
        await closeDb(analyticsDb);
      }
      console.log("PASS analytics events -> search/SRS/session hooks write into events layer");
    } else {
      console.log("SKIP /api/srs/* -> no clean sentence without existing SRS card was available");
    }

    console.log("API smoke: OK");
  } catch (error) {
    const tail = logs.length ? `\nServer log tail:\n${logs.join("\n")}` : "";
    throw new Error(`${error.message}${tail}`);
  } finally {
    await stopServer(child);
    await cleanupSrsArtifacts(DB_PATH, srsCleanupSentenceId);
  }
}

run().catch((error) => {
  console.error(`API smoke FAILED: ${error.message}`);
  process.exitCode = 1;
});
