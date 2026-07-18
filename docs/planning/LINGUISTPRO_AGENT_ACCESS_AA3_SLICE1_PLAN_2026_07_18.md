# AA3 Slice-1 — plan snapshot (mirrored from plan mode)

> **Статус: ИСТОРИЧЕСКИЙ СНИМОК ПЛАНА (plan mode), не текущее состояние.**
> Оригинал был создан plan mode ВНЕ репозитория (`~/.claude/plans/…`) — зеркалирую сюда, т.к. источник истины должен быть один и в репо (над ним работают разные агенты).
> **Канон as-shipped:** `docs/planning/LINGUISTPRO_AGENT_ACCESS_AA3_RICH_READ_PROPOSE_HANDOFF_2026_07_18.md` (§5a критика, §5b/5c/5d что реально отгружено). Остаток: `…_AA3_COMMIT_3C_SESSION_PROMPT_2026_07_18.md`.
>
> **AS-BUILT расхождения с этим планом (важно — не следуй плану дословно):**
> - `CAPABILITY_VERSION` НЕ бампался (остался `aa-v0.1`): scope-грант — реальный гейт доступа; бамп ломал бы live-подключение Hermes на resource-валидаторе. `connection_persistence` вынесен в ОТДЕЛЬНЫЙ инструмент `get_access_window` (не поле в `get_agent_connection`), т.к. мутация выходной схемы существующего инструмента ломает клиентов с закешированной схемой.
> - Стадии по факту: commit 1 (read foundation) → commit 2 (schema-stability fix + get_access_window) → commit 3a (пагинация due-items + get_explanation_body) → commit 3b (get_reading_content + cursor-fix). Осталось commit 3c.
> - `publicReadingCatalog.resolveWork` → заменён на `corpusSentenceRepo.listWorkTexts(work_id)` (каталог не несёт text_key; резолв через works-том).
> - `create_reading_handoff` — **придержан** (dormant): redeem-путь library-ui открывает только личные OPFS-тексты, токен без work_id → корпусная ссылка = dead-end. Ждёт work_id в handoff_tokens + open_corpus в library-ui.
> - struggle-band = `none/some/high` (не weak/medium/strong); due-items cap поднят до 100 + курсорная пагинация (не cap-20+truncated); `handoff_scope_available` (R14-m8) не активирован (review_summary поля остались forced-false).

---

## Context

Hermes (owner's personal NousResearch agent) is now permanently connected to LinguistPro over the AA2 OAuth MCP and reads 5 bounded aggregate/metadata tools. The owner wants to **significantly expand** what the agent can do — see real learning content, become actionable — so it can reason (owner's cost model: deterministic reads feed a "compressed state" to the LLM), drive tool discovery, and act as an idea engine.

Three role-critiques (R17 grader-independence, R15 GDPR/data-class, R14 security) initially flagged 2 BLOCKERs, both about exposing learning **content/answer-key** to an external agent. The owner's reframe resolves the doctrinal half: **AA is single-tenant (only the owner is a principal — `AGENT_ACCESS_OWNER_IDS` = one id)**, so the consent/GDPR machinery and the A×10 doctrine exist to protect *future product users*, not the owner reading their own data via their own chosen provider; and the owner's architecture keeps **grading deterministic/first-party**, so reading content does not make the agent a grader. The critiques' remaining findings therefore downgrade from doctrinal blockers to **engineering requirements** (typed outputs, caps, DoS mitigation, corpus-only enforcement, consent-class hygiene), plus **one hard line kept even for the owner: W0 — the agent never writes canonical learning truth** (review_log/grade/fsrs/mastery/word_status).

**Owner-approved (this session) slice-1:** broad read (program-wide + server-side learning artifacts, typed/capped/DoS-safe) + **W1 propose-then-confirm** + handoff + connection fix. **Deferred:** personal OPFS corpus (needs a sync decision — document it; possibly offer opt-in server sync later, at least for the owner-as-developer) and **W2** (agent-authored non-canonical artifacts). **W0 stays permanently prohibited.** Content read at `hy3:free` provider: open it (owner informed the free tier may train on data).

**Data-locality fact (measure-before-code, from source map):** the server holds the honest per-user substrate `review_log` + `srs_projections` (keyed by `item_key`); all human-readable word content is **derived on demand** from the shared public pealim dataset via `db/keyingService.js` — no OPFS needed. Corpus bodies are server-readable (public-domain, on the prod volume). Explanation bodies + profile/goals are server-side. **Free-text word notes and non-synced personal texts are OPFS-only → NOT server-readable → out of slice-1.**

## Scope — new scopes (6) + tools (6) + connection fix

| Tool | Scope | Source (reuse) | Notes |
|---|---|---|---|
| `get_due_review_items` | `review.items.read` | `learnerGraphRepo.getDue` + `keyingService.displayForItemKey`/`glossForItemKey` | due words + content; coarse struggle band, no raw FSRS floats; nullable display/gloss; cap + byte cap; DoS-mitigated |
| `get_learner_profile` | `profile.read` | `agentRepo.getProfile` | closed projection `{mode, language, depth}` only |
| `get_explanation_body` | `explanations.body.read` | `agentRepo.getExplanationById` | honor `purge_state`; byte cap |
| `get_reading_content` | `reading.corpus.read` | `corpusSentenceRepo.getCorpusWindow`/`getCorpusLessonWindow` | corpus (public-domain) only, bounded |
| `create_reading_handoff` | `reading.handoff.create` | `handoffRepo.mint` | corpus-only by construction, rate-limited |
| `propose_action` | `intent.propose` | new `db/agentProposalsRepo.js` (migration 045) | W1: PENDING → owner confirms → LinguistPro executes |
| (fix) `get_agent_connection` | `agent.connection.read` | control-plane resolver | connection persistence signal |

## Critique resolutions folded in as requirements

- **R17-B1 (answer-key):** owner-approved amendment for single-tenant personal use. `get_due_review_items` returns word + gloss + coarse struggle band but omits `alts` + `expected`; grading stays in LinguistPro.
- **R17-M2 / R14-M2 (corpus-only handoff):** resolve `work_id` server-side, reject non-catalog ids, force `action='open_corpus'`.
- **R17-M3 / R14-m7 (mint flood):** tight rate limit + per-user active-token cap.
- **R15-F1 (BLOCKER, consent-class):** content-tier retention notice; per-scope `retention_tier` + `data_class`; fail-closed `SCOPE_PRESENTATION`; independent-oracle smoke.
- **R15-F3 (per-scope granularity):** partial-approval in `decide()` (`selected ⊆ requested`) + per-scope revoke.
- **R15-F4 / R14-M4 (profile leak):** closed profile schema; never emit `goals_json`/`user_id`/timestamps.
- **R15-F6 / R14-M3 (minimization + bounds):** coarse struggle band, drop raw FSRS floats; explicit caps; honest truncation/pagination.
- **R14-M1 (keyingService 306 MB DoS):** tight per-tool rate limit; cold-degradation; deploy-time prewarm preferred.
- **R14-M5 (migration 044 rebuild):** explicit SQLite rebuild of `agent_connection_grants` widened CHECK.
- **R14-m6:** `mcpRateLimiter.TOOL_LIMITS` per new tool (else unreachable).

## Verification
- Full `smoke:agent-access:*` regression green + `node --check` + `db:migrate` on temp DB.
- Local MCP fixture-token call proves scope-gating + no-answer-key output.
- Prod deploy default-off; owner re-consent; live tool calls via cached Hermes token.
- 380px screenshot of consent + owner panel.

## Out of scope (slice-1)
Personal OPFS text bodies / free-text notes (needs sync decision); W2 agent-authored artifacts; W0 canonical writes (permanently prohibited); multi-user productization.
