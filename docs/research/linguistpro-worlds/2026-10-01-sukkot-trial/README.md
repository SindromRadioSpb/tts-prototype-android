# Sukkot trial defaults and Mediatheque journey

Source: origin/main `4e84d72e`; implementation `b3ee2b42`, app version `3.11.715`, Sukkot pack `0.1.1`.
Status: automated and local browser evidence; production publication pending owner confirmation.

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
