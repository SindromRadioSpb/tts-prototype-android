# PWA — LinguistPro

LinguistPro ships as a Progressive Web App since v3.1.0 (Direction 7). This
document explains how the install + offline + update lifecycle works, and
how to troubleshoot when something goes sideways.

## Install

The app surfaces a native browser install prompt on Chrome desktop, Edge,
and Android Chrome. On iOS, install via Safari → Share → "Add to Home
Screen".

After install:
- Standalone window (no browser chrome) on supported platforms.
- Home-screen icon (LP monogram on slate-900 with a blue accent bar).
- Three home-screen shortcuts: Library, SRS Trainer, Dashboard.

## Offline behaviour

After the **first** online visit, the Service Worker (`/sw.js`) precaches
the entire app shell into a versioned cache (`linguistpro-precache-…`).
Subsequent cold starts work fully offline:

- Index page, all CSS, all i18n locales, the OPFS+wa-sqlite layer, the
  TTS layer, all Hebrew woff2 fonts, all PWA icons — served from cache.
- Lazy modules (`jszip.min.js`, `qrcode.js`) cached on first use via
  stale-while-revalidate.

What still **requires network**:
- TTS synthesis (`/api/tts*`, `/api/audio/prefetch/*`)
- Translation (`/api/translate-table*`)
- Transliteration (`/api/transliterate`)
- DOCX export (`/api/export-docx`)
- Feedback submission (`/api/feedback*`)
- Library export-bundle download (`/api/library/export*`)

These are deliberately **not cached** because they either change state,
depend on quotas, or upload data — caching would mask correctness.

`/api/client-config` uses network-first with a 2.5s timeout and a cache
fallback, so the app boots even if the config endpoint is briefly down.

## Update lifecycle

When a new version of the app is deployed:

1. The browser fetches the new `sw.js` (it's served with `Cache-Control:
   no-cache` so it's always revalidated).
2. The new SW installs into the `waiting` state. It does **not**
   auto-activate — the existing controller stays in charge.
3. The app detects the waiting SW and shows a premium toast in the
   bottom-center: **"Доступно обновление приложения"** with two buttons,
   **"Обновить"** and **"Позже"**.
4. Clicking **Обновить** posts `{type:'SKIP_WAITING'}` to the waiting
   SW. The waiting SW skips waiting, becomes active, and the page
   reloads automatically (via `controllerchange` listener).
5. Clicking **Позже** dismisses the toast. The next visit re-surfaces
   it until the user accepts.

This is the classic premium PWA pattern — the user is in control of
when the update applies. We never silently swap the SW under live use.

## Troubleshooting

### Force-refresh assets

- DevTools → Application → Storage → "Clear site data" (clears caches,
  OPFS, localStorage in one click).

### Unregister the Service Worker

- DevTools → Application → Service Workers → "Unregister" next to
  `LinguistPro` SW. Reload the page; the app will work without the SW
  until it re-registers on the next `load` event.

### Bypass cache for a single request

- DevTools → Network tab → check "Disable cache" → reload.

### See what's precached

- DevTools → Application → Cache Storage → expand
  `linguistpro-precache-vX.Y.Z-…`. Each URL precached at install lands
  here; if an asset is missing, check `[sw] precache miss:` warnings
  in the console.

## Cache versioning

The SW uses three named caches:

- `linguistpro-precache-<CACHE_VERSION>` — app shell (install).
- `linguistpro-runtime-<CACHE_VERSION>` — runtime SWR (lazy modules,
  test pages, mockups).
- `linguistpro-config-<CACHE_VERSION>` — `/api/client-config` fallback.

`CACHE_VERSION` lives at the top of `public/sw.js`. Bump it whenever
the shell changes shape (added/removed/renamed precached files). On
activate, the SW purges any cache whose name doesn't match the current
version, then claims clients so the new SW controls the page
immediately.

## Regenerating icons

The PWA icons (`public/icons/*.png`) are produced by a pure-Node
generator script — no external dependencies, hand-drawn LP monogram
geometric primitives encoded into PNG via built-in `zlib`.

Regenerate after editing the script:

```bash
npm run pwa:icons
```

Output: `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`,
`apple-touch-icon-180.png`, `favicon-32.png`. Commit the resulting PNGs.

## What's deferred to v3.2

- **Functional code-split.** `public/index.html` is still a 30k-line
  monolith with most JS inline. Splitting into separate ES modules per
  view (Dashboard, SRS, IDE) would unlock dynamic-import boundaries,
  smaller initial parse cost, and finer SW cache invalidation. It's a
  full rewrite-pass on the inline `<script>` blocks and was scoped out
  of v3.1.0 to keep the release stable. v3.1.0 ships PWA as a
  *product* (install, offline, fast), not as an architectural refactor.
- **Push notifications** (would need backend infra for VAPID + a use
  case beyond marketing).
- **Background sync** (deferred until we have a clear queue-on-failure
  use case — currently every mutation is local-first via OPFS).
- **Sherpa adapter lazy-load** (~13.7 KB; sits in a tight TTS startup
  sequence — small win, not worth the regression risk in v3.1.0).
