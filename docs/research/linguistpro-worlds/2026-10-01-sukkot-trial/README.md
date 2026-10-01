# Sukkot trial defaults and Mediatheque journey

Source: origin/main `4e84d72e`; implementation `b3ee2b42`, app version `3.11.715`, Sukkot pack `0.1.1`.
Status: deployed to production as `f13d4aab` after owner confirmation; release assets verified. Final production browser verification is recorded separately below.

- Owner requested a one-time reset for all browser profiles to Sukkot / live / day. Later explicit choices persist, including Classic and Elections.
- The four Studio stops remain in Studio and are also available in Mediatheque. The fifth stop is cinema, always night through the ordinary lighting picker. Returning to a daytime stop restores the selected lighting.
- Mediatheque reuses Studio scenes and hero poses at the four ordinary stops; cinema keeps watching/laughing, its props and existing scenes. Hebrew sign controls and tap reactions remain available.
- Sukkot cat lane is 0 instead of the inherited Elections lane 6. Elections art, manifest and renderer are unchanged.

Validation:

```powershell
node --test tests/sukkotWorld.test.js tests/worldEngine.test.js tests/shellIntegrityPrecacheParity.test.js
$env:NODE_PATH='E:/projects/tts-prototype-android/node_modules'
node scripts/worlds/sukkot-browser-smoke.js
```

25/25 tests; 39/39 local browser scenarios. Browser coverage includes RU/EN/HE, 380/768/1280px, reduced motion, keyboard route controls, first-boot migration and persisted choices, five stops and lighting, live hero/tap reactions, cat lanes on all surfaces and Elections switching, lazy previews, pause/Classic and stale loads. Live actor checks accelerate only walker scheduling and observe the renderer pose; all ground geometry and sprites remain the shipped values. Browser run preceded the final pack-only version change from 0.1.0 to 0.1.1; contract and asset-key tests passed again after that metadata change.

The local server uses disposable fixtures, so the catalog in screenshots is empty. These images validate scenery and interaction layout; they do not represent the production holiday catalog or owner learner data.

Production release proof: Coolify deployment `f13d4aab` finished and the previous application container was retired. Three no-cache version/health probes passed with DB and migrations ready. All 43 checked public assets match the deployed Git commit, including all Sukkot PNGs, manifest/atlas and exact shell/engine/renderer/skin cache keys. See `production-assets.json`.

The first production browser attempts hit a page-load timeout and a test readiness race: `current().active` becomes true after the pack description loads, before the renderer has mounted. Early DOM-content-only navigation also captured an incomplete Studio initialization (`LearningMaterialTaskUI.configure` before the script was available). The final runner waits for full page load (production timeout 60 seconds) and the mounted stage; incomplete attempts do not count as browser PASS. Three independent no-cache fetches of the task UI script returned HTTP 200 and exact deployed Git hashes. No application change was made for the smoke timing issue.

Deployment filled the disk. With separate owner approval, only `docker builder prune -af` ran, reclaiming 2.482 GB of build cache. Active image `39c01df4` and rollback `ac465d68` remain; all 12 running containers and 4 volumes remain. No images, containers, data or backups were deleted. Host reserve is approximately 1.7 GB (96% full); fresh app health remains OK, DB/migrations ready, with disk_warn=true. Coolify and telemetry PostgreSQL recovered from temporary unhealthy checks after disk space was freed. O-047 records the remaining capacity risk.

Final production browser run after cache cleanup: **39/39 scenarios passed**, with full page load and mounted-stage readiness. `production-browser/results.json` records the actual production base URL and every scenario. World switching, all five Mediatheque stops, RU/EN/HE layouts, saved settings, tap reactions, cat lanes and lazy previews passed.
