# Studio Ingest Local ASR — next-session handoff

> **Date:** 2026-07-31
> **Production:** `381233e04c017246d9dbf106581983ad9f3b618e`, `v3.11.277`
> **Local UI fix:** `1046686694f76afdb4d53fa0766274d98607ca3a`, `v3.11.279`, not pushed/deployed
> **Permanent integration:** `NO-GO` until a separate explicit owner decision

## Durable state

- Windows 11 + NVIDIA/CUDA + Chrome is the only advertised beta matrix; Edge and Firefox are out.
- Unsigned Companion beta.2 is owner/trusted-cohort only and is not publicly hosted.
- Gemini remains the default; Local requires an explicit per-import choice and never falls back to
  Gemini automatically.
- The owner completed the native production Chrome `v3.11.277` ceremony successfully.
- Owner-only dogfood is in progress and is not a blocker. More trusted users are demand-driven.
- Listen/read, four-speaker human gold and 60-minute/12-speaker evidence are recommended, not
  mandatory, and are not claimed PASS.
- Local ASR output remains a first draft requiring human review; the Mia Gemini comparison is not
  independent human-gold WER.
- `v3.11.279` shows **Подключено / Connected / מחובר** after successful checks on both onboarding
  and Import → File. In Import → File, the companion/model status is now placed directly below
  the `127.0.0.1` privacy hint inside the Local setup block, rather than in the modal-wide footer.
  Real-Companion RU/LTR and HE/RTL 380×844 checks passed with no overflow.
- L2 is `DEFERRED / DEMAND-TRIGGERED`, not done or cancelled:
  - L2a recovery/reattach returns after a real reload/job-loss or stranded-job incident;
  - L2b batch returns after recurring demand for roughly 3–5+ files.

## Read first

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PROJECT_ROLES.md`
4. `docs/planning/STUDIO_INGEST_LOCAL_ASR_WINDOWS_BETA_ENABLEMENT_PACKET_2026_07_31.md`
5. `docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md`
6. `docs/research/studio-local-processing/2026-07-31/windows-beta/README.md`
7. `docs/research/studio-local-processing/2026-07-31/windows-beta/evidence-report.json`

Preserve all unrelated dirty/untracked work. Live code wins if a dated document has drifted.

## Next decision

There is no automatically authorized engineering slice. The nearest bounded decision is whether
to push/deploy the already-tested `v3.11.279` Local connection-feedback fix. Before any production action,
re-read `.claude/PROD_OPS_PRIVATE.md`, report current HEAD/origin/status, served version/health,
disk and exact mutation allowlist, and obtain exact push/deploy authority in the new session.

If no production deployment is requested, continue owner dogfood without engineering work and
return to L2 only when one of its recorded triggers occurs.

## Paste-ready next-session prompt

```text
Продолжаем Studio Ingest Local ASR по handoff
docs/planning/STUDIO_INGEST_LOCAL_ASR_NEXT_SESSION_HANDOFF_2026_07_31.md.

Сначала полностью прочитай AGENTS.md, CLAUDE.md, docs/PROJECT_ROLES.md, beta enablement packet,
local-processing roadmap и windows-beta evidence README/JSON; затем сними git status, HEAD/origin
и текущую production version/health/disk только если я разрешаю production preflight.

Подтверждённое состояние: production v3.11.277/381233e0; owner Chrome ceremony PASS; owner-only
dogfood IN PROGRESS и не блокирует; Local остаётся explicit/default-off, Gemini default, implicit
fallback запрещён. Локальный commit 10466866 содержит итоговый v3.11.279 UX-fix: после успешной
проверки обе поверхности показывают Подключено/Connected/מחובר, а в Import → File статус
companion/model расположен сразу под строкой о 127.0.0.1 внутри Local-блока; RU/HE 380x844
real-Companion smoke PASS. Он не pushed/deployed.

L2 не начинать автоматически: L2a recovery — только при реальной reload/job-loss боли; L2b batch
— только при устойчивой потребности 3–5+ файлов. Не объявлять L2 закрытым или отменённым.

Сохрани unrelated dirty/untracked изменения. Не менять schema/data/provider defaults; не тратить
Gemini quota; не начинать L3–L6; не push/deploy/cleanup/publish/distribute без моего нового точного
разрешения. Сначала дай короткий grounded status и предложи ближайшее разрешённое действие.
```
