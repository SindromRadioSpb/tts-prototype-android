"use strict";

// Gate: smoke:miniapp-rollback — P8.6 §19 rollback-drill С MA-происхождёнными review-событиями
// (TELEGRAM_MINI_APP_P8_RECON §19 + R7; до этого гейта cloud-sync-smoke гонял только PWA-события).
// Контракт kill-switch (MINI_APP_ENABLED=0): (1) новые сессии/challenge НЕ создаются (все
// /api/miniapp/* → 503 FEATURE_DISABLED, включая валидный initData); (2) уже записанные
// review-события СОХРАНЕНЫ (прямой SQL row-count до/после — независимый оракул); (3) PWA-нога
// down-sync жива и отдаёт MA-события (superset-verify /api/learner/log старой PWA-сессией);
// (4) выданный в ON handoff-токен redeem'ится в OFF (capability by-design, single-use цел);
// (5) healthz 200 — бот/PWA не задеты. Плюс ops-sweep-лег (P8.6 §19 session-purge/challenge-
// cleanup) на BACKDATED-фикстурах с survival-ассертами (критика wf_2e4d3fe5: без backdating
// sweep-ассерт вакуумно-зелёный) и burst-ассерты rate-limit (последними в фазе ON — общие
// in-memory лимитеры; XFF: ротация ЛЕВЫХ спуф-элементов при константном правом — 429 обязан
// сработать, критика r14 про trust proxy=1).
// Дисциплина герметичности (критика r11): child получает ЯВНЫЙ словарь всех флагов, читаемых
// miniapp/agent/identity-путями (dotenv не может долить, наследование хоста перекрыто);
// родительские SQL — только при ОСТАНОВЛЕННОМ child (busy_timeout в коннекте сервера нет).
// Exits non-zero on any failure.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const PORT = 3319, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "drill-bootstrap-secret-0123456789abcdef";
const TEST_TOKEN = "123456:TEST_BOT_TOKEN_drill_only";
const TG_ID = "424242424242";
const ITEM = "לכתוב#verb", SURFACE = "כּוֹתֵב";
const BLANKED = "הַיֶּלֶד ――――― מִכְתָּב", SENT_RU = "мальчик пишет письмо";
const FULL_SENT = BLANKED.replace("―――――", SURFACE);
const DAY = 86400e3;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── независимый initData-оракул (та же spec-faithful конструкция, что в miniapp-auth-smoke) ──
function signInitData(fields, token) {
  const data = {};
  for (const k of Object.keys(fields)) if (k !== "hash") data[k] = fields[k];
  const dcs = Object.keys(data).sort().map((k) => k + "=" + data[k]).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dcs).digest("hex");
  const usp = new URLSearchParams();
  for (const k of Object.keys(data)) usp.set(k, data[k]);
  usp.set("hash", hash);
  return usp.toString();
}
function freshInitData() {
  return signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAA",
    user: JSON.stringify({ id: TG_ID, first_name: "Owner" }),
    signature: "fakeEd25519_payload-drill",
  }, TEST_TOKEN);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-ma-rollback-"));
const dbPath = path.join(scratch, "app.db");

// ЯВНЫЙ словарь env: каждый флаг, читаемый miniapp/agent/identity-путями, задан литералом.
function childEnv(over) {
  return {
    ...process.env,
    DATA_DIR: scratch, DB_PATH: dbPath, PORT: String(PORT), BIND_HOST: "127.0.0.1",
    MINI_APP_ENABLED: "0", MINI_APP_REVIEW_WRITE: "1", AGENT_REVIEW_WRITE: "1",
    MINI_APP_OWNER_USER_IDS: "",
    MINIAPP_INITDATA_MAX_AGE_SECONDS: "3600", MINIAPP_SESSION_IDLE_SECONDS: "7200",
    MINIAPP_SESSION_ABSOLUTE_SECONDS: "86400",
    AGENT_NUDGE_ENABLED: "0", PUBLIC_BASE_URL: "", TELEGRAM_WEBHOOK_SECRET: "",
    TELEGRAM_BOT_TOKEN: TEST_TOKEN, TELEGRAM_API_BASE: "http://127.0.0.1:9",
    AUTH_BOOTSTRAP_SECRET: SECRET, AGENT_LLM_DISABLED: "1", AGENT_GEMINI_API_KEY: "",
    AGENT_OPENROUTER_API_KEY: "", AGENT_LLM_PROVIDER: "mock",
    AUDIO_UPLOAD_TOKEN: "drill-audio-upload-token-0123456789abcdef",
    ...over,
  };
}
function startServer(over) {
  const c = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: childEnv(over), stdio: ["ignore", "pipe", "pipe"] });
  const logs = [];
  c.stdout.on("data", (x) => logs.push(String(x)));
  c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return;
  c.kill("SIGTERM");
  const done = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!done && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
  await sleep(300);   // дать OS отпустить файловые локи -wal/-shm
}
async function ready(ms = 30000) {
  const s = Date.now();
  while (Date.now() - s < ms) {
    try {
      const r = await fetch(BASE + "/healthz");
      if (r.status === 200) { const j = await r.json(); if (j && j.db && j.db.ready && j.migrations && j.migrations.ready) return true; }
    } catch (_) {}
    await sleep(200);
  }
  return false;
}
function cookieOf(res, name) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  const line = (sc || []).find((x) => String(x).startsWith(name + "="));
  return line ? String(line).split(";")[0] : "";
}
async function api(method, p, { cookie, csrf, headers, body } = {}) {
  const h = { "Content-Type": "application/json", ...(headers || {}) };
  if (cookie) h["Cookie"] = cookie;
  if (csrf) h["X-LP-CSRF"] = csrf;
  const res = await fetch(BASE + p, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json, res };
}

(async () => {
  // ── SEED (сервер НЕ запущен): singleton живёт весь drill (initDb не ре-энтерабелен) ──
  const { initDb, getDb, closeDb } = require(path.join(ROOT, "db", "sqlite"));
  const { runMigrations } = require(path.join(ROOT, "db", "migrate"));
  const identity = require(path.join(ROOT, "db", "identityRepo"));
  const agentChallengeRepo = require(path.join(ROOT, "db", "agentChallengeRepo"));
  const handoffRepo = require(path.join(ROOT, "db", "handoffRepo"));
  const dbRun = (sql, p = []) => new Promise((res, rej) => getDb().run(sql, p, function (e) { e ? rej(e) : res(this); }));
  const dbGet = (sql, p = []) => new Promise((res, rej) => getDb().get(sql, p, (e, r) => e ? rej(e) : res(r)));
  const reviewCount = () => dbGet(`SELECT COUNT(*) c FROM review_log WHERE kind IN ('review','skip','annul')`).then((r) => r.c);

  await initDb(dbPath);
  await runMigrations({ migrationsDir: path.join(ROOT, "migrations") });
  const owner = await identity.ensureOwnerUser();
  const userId = owner.id;
  const past = "2026-06-01T08:00:00.000Z";
  for (const [k, v] of [["cloud_texts", "v1"], ["agent_read_texts", "v1"], ["telegram_delivery", "tg-v1"]])
    await dbRun(`INSERT INTO consent_records (id,user_id,consent_key,granted,consent_version) VALUES (?,?,?,1,?)`, ["cr_" + k, userId, k, v]);
  await dbRun(`INSERT INTO channel_links (id,user_id,channel,telegram_user_id,telegram_chat_id,status,consent_version,confirmed_at)
               VALUES ('cl_drill',?,'telegram',?,?,'active','tg-v1',?)`, [userId, TG_ID, TG_ID, past]);
  await dbRun(`INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json) VALUES (?,?,?,'seed',?,NULL,'seed-sm2',NULL,'{}')`, [userId, "seed:" + ITEM, ITEM, past]);
  await dbRun(`INSERT INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine) VALUES (?,?,?,1,1,0,12.0,5.0,?,'fsrs','fsrs6')`, [userId, ITEM, past, past]);
  const payload = JSON.stringify({ texts: [{ text_key: "t1", title: "т", rows: [{ order_index: 0, hebrew_niqqud: FULL_SENT, hebrew_plain: FULL_SENT, russian: SENT_RU }] }] });
  await dbRun(`INSERT INTO learner_artifacts (user_id,kind,artifact_key,updated_at,payload_json) VALUES (?,'text_bundle','t1',?,?)`, [userId, past, payload]);
  // детерминированный challenge A (route-семантика — предмет drill'а; селектор гейтится своими наборами)
  const { challenge: chalA } = await agentChallengeRepo.createChallenge({
    userId, surface: "telegram_miniapp", tgUserId: TG_ID, tgChatId: TG_ID,
    item_key: ITEM, review_mode: "cloze:ma", prompt_kind: "cloze", evidence_scope: "cloze",
    expected_form_id: ITEM, expected_surface: SURFACE,
    anchor_text_key: "t1", anchor_order_index: 0,
    shown_stimulus: BLANKED + "\n" + SENT_RU, stimulus_source: "synced-sentence",
    stimulus_privacy_class: "C", stimulus_hash: "h", accepted_alts: [],
  });
  const chId = chalA.challenge_id;
  const c0 = await reviewCount();

  let srv = null, handoffToken = null, cookieP = "", csrfP = "", cookieM = "", csrfM = "";
  try {
    // ── PHASE ON (MINI_APP_ENABLED=1) ──────────────────────────────────────────
    srv = startServer({ MINI_APP_ENABLED: "1" });
    ok("ON: server ready", await ready());

    const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "drill-pwa" } });
    ok("ON: PWA bootstrap-login attaches to seeded owner", li.status === 200 && li.json.user.id === userId);
    cookieP = cookieOf(li.res, "lp_session"); csrfP = li.json.csrf;

    const ms = await api("POST", "/api/miniapp/session", { body: { init_data: freshInitData() } });
    ok("ON: miniapp session minted from valid initData", ms.status === 200 && ms.json.ok === true && !!ms.json.csrf);
    cookieM = cookieOf(ms.res, "lp_miniapp_session"); csrfM = ms.json.csrf;

    const home = await api("GET", "/api/miniapp/home", { cookie: cookieM });
    ok("ON: /home 200", home.status === 200 && home.json.ok === true);

    const st = await api("POST", "/api/miniapp/review-sessions", { cookie: cookieM, csrf: csrfM, body: { mode: "manual", modality: "cloze" } });
    ok("ON: start resumes the seeded challenge (deterministic)", st.status === 200 && st.json.ok === true && st.json.challenge_id === chId);

    const ans = await api("POST", `/api/miniapp/review-sessions/${chId}/answer`, {
      cookie: cookieM, csrf: csrfM, body: { nonce: "drillnonce1", answer: "כותב", input_mode: "tiles" },
    });
    ok("ON: answer recorded (MA-происхождённое review-событие)", ans.status === 200 && ans.json.ok === true && ans.json.recorded === true && ans.json.decision === "correct");

    const ho = await api("POST", "/api/miniapp/reading-handoffs", { cookie: cookieM, csrf: csrfM, body: { challenge_id: chId } });
    ok("ON: handoff token issued", ho.status === 200 && ho.json.ok === true && !!ho.json.token);
    handoffToken = ho.json && ho.json.token;

    // ── BURSTS — строго ПОСЛЕДНИМИ в фазе ON (общие in-memory лимитеры) ──────────
    // rlMiniapp 120/мин: константный ПРАВЫЙ XFF-элемент (ключ) + ротация ЛЕВЫХ спуфов —
    // 429 обязан сработать несмотря на инъекцию (trust proxy=1 берёт правый элемент).
    let got429 = false, first429At = -1;
    for (let i = 0; i < 135; i++) {
      const r = await api("GET", "/api/miniapp/home", { cookie: cookieM, headers: { "X-Forwarded-For": `10.66.${i % 250}.7, 10.1.2.3` } });
      if (r.status === 429) { got429 = true; first429At = i; break; }
    }
    ok("ON: BFF burst → 429 при ротации левых XFF-спуфов (ключ = правый элемент)", got429 && first429At >= 100);
    // auth-fail limiter: серия невалидных initData (другой правый IP — независимый bucket)
    let auth429 = null;
    for (let i = 0; i < 14; i++) {
      const r = await api("POST", "/api/miniapp/session", { headers: { "X-Forwarded-For": `10.77.${i}.9, 10.4.5.6` }, body: { init_data: "auth_date=1&user=%7B%7D&hash=deadbeef" } });
      auth429 = r;
      if (r.status === 429) break;
    }
    ok("ON: invalid-initData burst → 429 TOO_MANY_AUTH_FAILURES", auth429 && auth429.status === 429 && auth429.json.error === "TOO_MANY_AUTH_FAILURES");

    await stop(srv.c); srv = null;

    // ── SNAPSHOT + OPS-SWEEP-ЛЕГ (сервер остановлен; прямой SQL = независимый оракул) ──
    const c1 = await reviewCount();
    ok("snapshot: ровно одна новая review-строка от MA-цикла", c1 === c0 + 1);
    const rowMA = await dbGet(`SELECT * FROM review_log WHERE user_id=? AND kind='review' AND channel='cloze:ma'`, [userId]);
    ok("snapshot: строка несёт cloze:ma канал-провенанс", !!rowMA);
    const chA1 = await dbGet(`SELECT status, result_decision, result_grade FROM agent_challenges WHERE challenge_id=?`, [chId]);
    ok("snapshot: challenge completed + вердикт персистирован", chA1 && chA1.status === "completed" && chA1.result_decision === "correct");

    // backdated-фикстуры РЯДОМ со свежими (survival-ассерты)
    const old8 = new Date(Date.now() - 8 * DAY).toISOString();
    const old9 = new Date(Date.now() - 9 * DAY).toISOString();
    await dbRun(`INSERT INTO user_sessions (id,user_id,token_hash,csrf_token,expires_at,revoked_at) VALUES ('s_stale_rev',?,'x','x',?,?)`, [userId, old8, old8]);
    await dbRun(`INSERT INTO user_sessions (id,user_id,token_hash,csrf_token,expires_at,session_kind,absolute_expires_at) VALUES ('s_stale_exp',?,'x','x',?,'telegram_miniapp',?)`, [userId, old9, old8]);
    await dbRun(`INSERT INTO miniapp_initdata_seen (user_id,auth_hash,auth_date,seen_at) VALUES (?,?,0,?)`, [userId, "oldhash", old8]);
    await dbRun(`INSERT INTO devices (id,user_id,label,last_seen_at) VALUES ('d_orph',?,'orphan',?)`, [userId, old8]);
    await dbRun(`INSERT INTO handoff_tokens (token_hash,user_id,text_key,order_index,action,expires_at) VALUES ('deadhash',?,'t1',0,'open_reader',?)`, [userId, new Date(Date.now() - 2 * 3600e3).toISOString()]);
    const { challenge: chalB } = await agentChallengeRepo.createChallenge({
      userId, surface: "telegram_miniapp", tgUserId: TG_ID, tgChatId: TG_ID,
      item_key: ITEM, review_mode: "cloze:ma", prompt_kind: "cloze", evidence_scope: "cloze",
      expected_form_id: ITEM, expected_surface: SURFACE, anchor_text_key: "t1", anchor_order_index: 0,
      shown_stimulus: "x", stimulus_source: "synced-sentence", stimulus_privacy_class: "C", stimulus_hash: "h", accepted_alts: [],
    });
    await dbRun(`UPDATE agent_challenges SET status='expired', created_at=?, expires_at=? WHERE challenge_id=?`, [old9, old9, chalB.challenge_id]);

    const sessBefore = (await dbGet(`SELECT COUNT(*) c FROM user_sessions`)).c;
    const purgedSessions = await identity.purgeStaleSessions();
    const purgedSeen = await identity.purgeStaleInitDataSeen();
    const purgedDevices = await identity.purgeOrphanDevices();
    const pr = await agentChallengeRepo.pruneOld();
    await handoffRepo.pruneOld();
    ok("sweep: удалены РОВНО 2 stale-сессии (revoked>7d + expired>7d)", purgedSessions === 2);
    ok("sweep: живые сессии выжили", (await dbGet(`SELECT COUNT(*) c FROM user_sessions`)).c === sessBefore - 2);
    ok("sweep: удалена РОВНО 1 старая initdata_seen (свежая от минта выжила)",
      purgedSeen === 1 && (await dbGet(`SELECT COUNT(*) c FROM miniapp_initdata_seen WHERE user_id=?`, [userId])).c >= 1);
    ok("sweep: удалён РОВНО 1 orphan-device (живые выжили)",
      purgedDevices === 1 && !(await dbGet(`SELECT 1 x FROM devices WHERE id='d_orph'`)));
    ok("sweep: терминальный challenge старше 7d удалён", pr.purgedTerminal >= 1 && !(await dbGet(`SELECT 1 x FROM agent_challenges WHERE challenge_id=?`, [chalB.challenge_id])));
    const chA2 = await dbGet(`SELECT status, result_decision FROM agent_challenges WHERE challenge_id=?`, [chId]);
    ok("sweep: свежий completed-challenge ВЫЖИЛ с вердиктом (survival)", chA2 && chA2.status === "completed" && chA2.result_decision === "correct");
    ok("sweep: протухший handoff удалён, свежий (single-use, unused) выжил",
      !(await dbGet(`SELECT 1 x FROM handoff_tokens WHERE token_hash='deadhash'`)) &&
      (await dbGet(`SELECT COUNT(*) c FROM handoff_tokens WHERE user_id=? AND used_at IS NULL`, [userId])).c === 1);
    ok("sweep: review_log НЕ тронут sweep'ом", (await reviewCount()) === c1);

    // ── PHASE OFF (MINI_APP_ENABLED=0, та же DB) — rollback-контракт §19 ──────────
    srv = startServer({ MINI_APP_ENABLED: "0" });
    ok("OFF: server ready", await ready());

    const offMint = await api("POST", "/api/miniapp/session", { body: { init_data: freshInitData() } });
    ok("OFF: валидный initData → 503 FEATURE_DISABLED (новые сессии не создаются)", offMint.status === 503 && offMint.json.error === "FEATURE_DISABLED");
    const offHome = await api("GET", "/api/miniapp/home", { cookie: cookieM });
    ok("OFF: старая miniapp-кука → 503 (флаг раньше валидации)", offHome.status === 503 && offHome.json.error === "FEATURE_DISABLED");
    const offStart = await api("POST", "/api/miniapp/review-sessions", { cookie: cookieM, csrf: csrfM, body: { mode: "all_due" } });
    ok("OFF: новые challenge не создаются (503)", offStart.status === 503);

    const dl = await api("GET", "/api/learner/log?after_rid=0&limit=500", { cookie: cookieP });
    ok("OFF: PWA down-sync жив и отдаёт MA-событие (superset-verify)",
      dl.status === 200 && dl.json.ok === true && JSON.stringify(dl.json.rows).includes('"cloze:ma"'));

    const rd = await api("GET", "/api/reading-handoffs/redeem?t=" + encodeURIComponent(handoffToken || ""));
    ok("OFF: handoff redeem = 200 (capability переживает kill-switch — норма §19)",
      rd.status === 200 && rd.json.ok === true && rd.json.text_key === "t1" && rd.json.order_index === 0);
    const rd2 = await api("GET", "/api/reading-handoffs/redeem?t=" + encodeURIComponent(handoffToken || ""));
    ok("OFF: повторный redeem → 404 (single-use цел)", rd2.status === 404);

    const hz = await api("GET", "/healthz");
    ok("OFF: healthz 200 (PWA/бот не задеты)", hz.status === 200 && hz.json.ok === true);

    await stop(srv.c); srv = null;

    // финальный независимый оракул: события сохранены, OFF ничего не дописал
    ok("FINAL: review_log row-count неизменен после OFF-фазы", (await reviewCount()) === c1);
    const rowMA2 = await dbGet(`SELECT id FROM review_log WHERE user_id=? AND kind='review' AND channel='cloze:ma'`, [userId]);
    ok("FINAL: MA-событие живо в каноне", !!rowMA2);
  } catch (e) {
    fail++;
    console.error("  ✗ CRASH: " + (e && e.stack || e));
    if (srv) console.error((srv.logs || []).slice(-15).join(""));
  } finally {
    if (srv) await stop(srv.c).catch(() => {});
    await closeDb().catch(() => {});
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }
  const total = pass + fail;
  if (fail) { console.error(`smoke:miniapp-rollback FAIL (${pass}/${total})`); process.exit(1); }
  console.log(`smoke:miniapp-rollback OK (${pass}/${total}) — §19 rollback-контракт: 503-стена · события сохранены · PWA down-sync superset · handoff-capability + single-use · ops-sweep на backdated-фикстурах с survival · XFF-стойкий burst-429`);
  process.exit(0);
})();
