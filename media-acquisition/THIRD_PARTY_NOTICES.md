# Media acquisition worker: third-party inventory

This worker is private, bounded infrastructure for owner-authorized media. It does not incorporate
or proxy SSYouTube, SaveFrom, their APIs, scripts, advertisements or signed links.

| Component | Frozen version | Licence | Role |
|---|---:|---|---|
| yt-dlp | 2026.7.4 | Unlicense | allowlisted YouTube metadata and byte acquisition |
| yt-dlp-ejs | resolved by the hashed Python lock | Unlicense | external JavaScript challenge scripts |
| Deno | 2.7.5 (`deno-x86_64-unknown-linux-gnu.zip`, SHA-256 `fd0a9e6cf085acb861b67577a13bfd0b1829e1c6d6a6dcfd35bcb8f05c973a47`) | MIT | sandboxed EJS runtime |
| FFmpeg | 8.1.2 source (`ffmpeg-8.1.2.tar.xz`, SHA-256 `464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`) | LGPL build | fixed H.264/AAC merge |
| hash-wasm | 4.12.0 | MIT | incremental device-side SHA-256 |

`requirements.lock` is the Python package authority. `package-lock.json` is the browser hashing
authority. The production build base is
`python@sha256:adafcc17694d715c905b4c7bebd96907a1fd5cf183395f0ebc4d3428bd22d92d`.
The Docker build verifies both upstream archives before installation and builds FFmpeg without GPL
or non-free external libraries. The deployed image digest remains a separate read-back value.
