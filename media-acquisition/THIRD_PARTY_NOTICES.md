# Media acquisition worker: third-party inventory

This worker is private, bounded infrastructure for owner-authorized media. It does not incorporate
or proxy SSYouTube, SaveFrom, their APIs, scripts, advertisements or signed links.

| Component | Frozen version | Licence | Role |
|---|---:|---|---|
| yt-dlp | 2026.7.4 | Unlicense | allowlisted YouTube metadata and byte acquisition |
| yt-dlp-ejs | resolved by the hashed Python lock | Unlicense | external JavaScript challenge scripts |
| Deno | 2.7.5 development baseline; image hash required before provisioning | MIT | sandboxed EJS runtime |
| FFmpeg | 8.1 development baseline; image hash required before provisioning | LGPL/GPL build-dependent | fixed H.264/AAC merge and explicit conversions |
| hash-wasm | 4.12.0 | MIT | incremental device-side SHA-256 |

`requirements.lock` is the Python package authority. `package-lock.json` is the browser hashing
authority. Container image digests and exact Deno/FFmpeg binary hashes remain a provisioning gate;
development-machine versions are evidence, not a production image claim.
