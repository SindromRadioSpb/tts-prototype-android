# Studio mobile media acquisition without Companion — GitHub and feasibility research

> **Date:** 2026-08-11
> **Status:** research complete; no runtime, infrastructure or production change made
> **Decision output:**
> `docs/planning/STUDIO_MOBILE_MEDIA_ACQUISITION_NO_COMPANION_DECISION_PACKET_2026_08_11.md`
> **Supersedes:** only the acquisition-runtime recommendation in
> `STUDIO_REMOTE_MEDIA_ACQUISITION_DECISION_PACKET_2026_08_11.md`; its OPFS, readiness,
> provenance, Import Center and UI decisions remain valid.

## Executive finding

There is a premium mobile-only path without a per-user Companion or home node, but there is no
credible **pure PWA** path for arbitrary YouTube URLs.

The missing boundary is not another downloader UI. It is a **sticky outbound egress lease** used by
the existing isolated acquisition worker for both resolve and byte acquisition:

```text
iPhone / Android PWA
        |
        v
LinguistPro acquisition broker (session, rights, limits, plan, receipt)
        |
        v
one sticky egress lease (region + IP/proxy session; secret never reaches browser)
        |
        v
pinned yt-dlp + browser PO-token provider + FFmpeg
        |
        v
resumable first-party stream -> OPFS partial -> SHA verify -> Studio
```

The recommended order is:

1. validate a dedicated, isolated IPv6 egress node using the server's routed `/64`, a job-sticky
   source address and the maintained `yt-dlp-getpot-wpc` provider after its transitive AGPL gate;
2. keep an explicitly permitted, sticky Israel ISP/residential egress as the production fallback
   if datacenter IPv6 fails the reliability gate;
3. preserve the current Companion as an optional private/zero-provider-cost fallback, not a mobile
   prerequisite;
4. do not iframe, scrape or silently depend on a public Cobalt/SaveFrom/SSYouTube instance.

This is less product complexity than the per-user home-node scheme: all users keep the same
`paste -> choose -> Add to Studio` interaction and LinguistPro operates one bounded acquisition
plane. It does introduce a real operations/cost responsibility; no open-source package can make
YouTube accept a blocked datacenter IP by itself.

## 1. Evidence from the live product

The shipped `3.11.343` path already has the hard downstream pieces:

- canonical URL and deterministic complete-format planning;
- an isolated worker with no product-database media path;
- transient preparation, FFmpeg merge, worker SHA and deletion receipt;
- streamed OPFS `.partial` write with incremental device SHA and verified promotion;
- Media Readiness, subtitles/ASR and Import Center continuity.

The current boundary is in `media-acquisition/acquisition_service/jobs.py`: `YtDlpBackend` has one
implicit network route for both `resolve()` and `prepare()`. There is no provider or egress lease in
the plan/job contract, no `proxy`/`source_address`, and no resumable Range handoff. The code is
therefore correct for a healthy network but cannot route around geography or a blocked server IP.

Earlier production research already measured the same transport boundary: browser requests could
not obtain the Innertube track list because of CORS; the Hetzner DE host hit login/bot checks on four
of five probes and geo-blocks on the Israeli set, while the same probes passed on a home IP. The
2026-08-11 deployed RMA then reproduced the two distinct failures:

- owner item `nNQhzD-T85M`: unavailable from the German region;
- public control `jNQXAC9IVRw`: `Sign in to confirm you're not a bot` from the datacenter IP;
- adding `bgutil-ytdlp-pot-provider` did not turn the already-blocked egress into a working route.

These are egress failures, not evidence that OPFS, the format planner or the Import Center model is
wrong.

## 2. Browser-direct spike

Because current YouTube.js documentation says it runs in modern browsers, this research tested the
strongest possible no-server hypothesis rather than rejecting it by assumption.

### Procedure

A temporary same-origin page loaded the official browser bundle
`youtubei.js@17.2.0/bundle/browser.js`, created a local guest session and requested basic info for
`jNQXAC9IVRw` using the `IOS` client without cookies. The temporary page and local server were
removed after the probe.

### Observed result

```text
POST https://www.youtube.com/youtubei/v1/player?prettyPrint=false&alt=json
net::ERR_FAILED

Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present.
```

The official YouTube.js browser example independently states that browser requests must be sent
through a developer-controlled proxy and implements that proxy for both Innertube and
`googlevideo.com` traffic. `fetch(..., {mode: "no-cors"})` cannot repair the path: an opaque response
has a null body, so JavaScript cannot hash or write it to OPFS.

### Verdict

`YouTube.js + BgUtils + Mediabunny in the PWA` is **not** a standalone acquisition architecture.
Those components can process a stream after a same-origin gateway exposes it, but they cannot make
cross-origin YouTube media readable to Studio JavaScript.

## 3. GitHub candidate matrix

Repository state and upstream documentation were read on 2026-08-11. Activity is an observation,
not a future maintenance promise.

| Candidate | Licence / observed state | Useful ready-made capability | Product verdict |
|---|---|---|---|
| [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) | Unlicense source; active, pushed 2026-08-04 | broad extractor, exact formats, captions, progress, fixed proxy/source address support | **Keep as primary engine**; the current planner and receipts already depend on its richer contract |
| [coletdjnz/yt-dlp-getpot-wpc](https://github.com/coletdjnz/yt-dlp-getpot-wpc) | MIT plugin, but exact dependency `nodriver==0.50.3` is AGPL-3.0; `v1.1.2`, 2026-08-08 | uses real Chromium WebPoClient to mint guest/account PO tokens for yt-dlp | **Best ready no-cookie staging candidate after a transitive-licence gate**; it may improve attestation but cannot repair geo or an IP already blocked |
| [Brainicism/bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider) | GPL-3.0; active | lightweight BotGuard PO-token service/plugin | Keep only as a measured fallback; upstream cautions that a PO token does not guarantee bypass and the production trial failed |
| [imputnet/cobalt](https://github.com/imputnet/cobalt) API | AGPL-3.0; active, pushed 2026-04-06 | YouTube.js, tunnel/remux, API-key/JWT/rate limits, HTTP proxy and `FREEBIND_CIDR` with one random IPv6 held for a download | **Architecture and egress reference**; optional isolated fallback only after licence gate. Its hosted API is explicitly not for third-party projects without permission |
| Cobalt web | CC-BY-NC-SA-4.0 plus protected branding | excellent paste/save UX, OPFS-backed local processing, iOS save fallbacks | UX/implementation reference only; do not copy the frontend or branding into LinguistPro |
| [iv-org/invidious-companion](https://github.com/iv-org/invidious-companion) | AGPL-3.0; active, pushed 2026-08-10 | YouTube.js, automatic sessions/PO tokens, video proxy, HTTP proxy and IPv6-block support | Narrow **network adapter reference**; not a replacement product because it lacks our complete-format plan, merge and evidence contract |
| [iv-org/smart-ipv6-rotator](https://github.com/iv-org/smart-ipv6-rotator) | AGPL-3.0; active | one-shot Linux route/source IPv6 rotation for Google ranges, rollback/cleanup | Safe only on a dedicated egress node; useful staging/ops reference, not inside the product host |
| [imputnet/freebind.js](https://github.com/imputnet/freebind.js) | AGPL-3.0; active but upstream calls it experimental | Linux AnyIP/freebind and random per-request IPv6 dispatcher; used by Cobalt | Reference or Cobalt-contained use; do not import an experimental AGPL socket layer into the Python worker |
| [LuanRT/YouTube.js](https://github.com/LuanRT/YouTube.js) | MIT; active, pushed 2026-08-07 | modern Innertube client and streams in Node/Deno/browser runtimes | Server/reference candidate; **not browser-direct**, because the official browser example requires a proxy |
| [Vanilagy/Mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0; active, `v1.53.0`, 2026-08-08 | memory-efficient streaming I/O and `WritableStream`/File System targets, transmux/remux | Best later client-remux candidate if measured; it does not solve extraction/egress and is unnecessary for the first recovery slice |
| [alexta69/MeTube](https://github.com/alexta69/metube) | AGPL-3.0; active | queue/progress, iOS Shortcut, yt-dlp UI | Reject as runtime: server download library, cookie upload and generic options are broader than our security/canon contract |
| [JunkFood02/Seal](https://github.com/JunkFood02/Seal), [deniscerri/ytdlnis](https://github.com/deniscerri/ytdlnis), [yausername/youtubedl-android](https://github.com/yausername/youtubedl-android) | GPL-3.0; active Android projects | proven on-device yt-dlp/FFmpeg, Android share sheet/background jobs | Optional separately licensed Android enhancer, not the universal PWA answer |
| [net00-1/SW-DLT](https://github.com/net00-1/SW-DLT) | MIT; `4.2.2`, 2026-07-27 | iOS Shortcut + a-Shell, share-sheet local acquisition | Honest external workaround/R&D control; requires two installs and export handoff, below the premium primary bar |
| [kewlbear/YoutubeDL-iOS](https://github.com/kewlbear/YoutubeDL-iOS) | MIT; last push 2024-01 | bundled yt-dlp in an iOS app | Reject as primary distribution path: upstream explicitly warns it is not App-Store-safe |

### Why Cobalt is not the whole answer

Cobalt is the strongest open-source reference and validates several choices LinguistPro should
adopt: job-sticky IPv6, proxy support, a tunnel instead of durable media, rate limits, OPFS-backed
local work, and human format choices. But a wholesale switch would lose or require rebuilding:

- metadata-only resolve before acquisition;
- exact per-item complete-format matrix with grounded sizes;
- immutable format-ID plan;
- worker/device SHA equality and deletion receipt;
- Media Readiness and source provenance continuity;
- our session/CSRF/tenant boundary.

The public Cobalt API also cannot be silently used: upstream says hosted instances are not intended
for other projects without explicit permission. Self-hosting still uses the server's own IP unless
`FREEBIND_CIDR` or an external proxy is configured, so it would reproduce the present failure on the
same blocked IPv4.

### Why Invidious Companion is not the whole answer

Invidious Companion is a valuable, narrower demonstration that current PO-token generation,
playback proxying, external proxy support and IPv6 rotation belong in an isolated adapter. It is
designed around Invidious playback, however, not a deterministic prepare/hash/delete job. Adopting
it wholesale would add Invidious-shaped APIs while LinguistPro would still need yt-dlp/FFmpeg or a
new mux planner.

## 4. Architecture alternatives

| Alternative | iPhone/Android without user node | Reliability for owner examples | Privacy/security | Complexity | Verdict |
|---|---:|---:|---|---|---|
| Pure PWA direct to YouTube | No | No: CORS before extraction | Phone-local in theory | deceptively high | **NO-GO** |
| Public Cobalt/SaveFrom/SSYouTube API or iframe | Superficially | Uncontrolled | third party sees URLs/media; no receipt/SLA | low initially, brittle later | **NO-GO** |
| Same German IPv4 + newer extractor/PO token | Yes | Cannot solve Israel geo; token may not repair blocked IP | good | low | diagnostic fallback only |
| Multi-region ordinary VPS | Yes | fixes geography, not datacenter reputation | good | medium | insufficient as sole GA route |
| Dedicated IPv6 `/64`, one sticky random address per job | Yes | plausible for low-volume private use; must be measured | first-party, no new vendor | medium ops; low marginal cost | **recommended first spike/beta**, not assumed GA |
| Sticky Israel ISP/residential proxy permitted by vendor AUP | Yes | highest web-path probability | vendor sees target hosts/traffic volume; credentials central | low code, recurring cost/procurement | **recommended production fallback/primary if IPv6 gate fails** |
| Android native local engine | Android only | high, uses handset network | strongest local privacy | second app/distribution/licence | optional Android enhancement |
| iOS native yt-dlp/Shortcut | Technically | uses handset network | local, but install/runtime friction | high distribution risk | optional R&D/workaround only |
| Official YouTube Studio/Takeout + Files/Drive import | Only uploader-owned source | reliable within official scope | strongest | extra user steps; not arbitrary permission | add later as a safe owned-content source, not URL replacement |

The YouTube Data API exposes metadata/manage/upload methods, not a transferable binary download
method. YouTube's official download path is for the uploader's own videos; offline Premium copies
remain encrypted in the YouTube app. Therefore OAuth/Data API is not a hidden general solution.

## 5. Recommended runtime boundary

Keep the existing isolated worker as the **acquisition broker and evidence owner**, but replace its
implicit network with two explicit interfaces:

```text
AcquisitionProvider
  resolve(canonical_url, egress_lease) -> source + exact options + provider evidence
  prepare(plan, option, egress_lease) -> verified ephemeral artifact

EgressLease
  lease_id                 opaque, non-secret
  class                    ipv6_prefix | managed_proxy
  region                   IL (initial approved route)
  continuity_key           resolve and prepare must match
  expires_at
  secret_ref               worker-only; never API/log/plan/DOM
```

### Provider implementation

The first provider remains pinned yt-dlp because it already supplies the exact data our product
needs. The WPC candidate must be frozen as the complete dependency set, not called “MIT” from its
top-level licence alone: it pins AGPL-3.0 `nodriver`. Before use outside the lab, decide whether the
complete acquisition image/source offer will be AGPL-compatible. If approved, run it **inside the
isolated acquisition image**, non-root, with no account cookies, browser profile persistence or
remote debugging port.

`resolve` and all source/merge requests must use the same lease. If the lease fails or changes,
invalidate the old plan and resolve again; never append bytes or silently claim the old format IDs.

### Egress implementation

1. **No-new-secret spike:** a separate acquisition-egress VM/node with a routed IPv6 `/64`. Hetzner
   documents that Cloud servers receive a `/64`; actual routing on the current resource must be
   verified, not inferred. Use Cobalt/Invidious's proven AnyIP/sticky-address pattern, not
   round-robin DNS. The address is chosen once per job and held through resolve+prepare.
2. **Production fallback:** an outbound HTTP CONNECT/SOCKS lease from a vendor that explicitly
   permits this authorised media use, supports Israel, session stickiness and sufficient file
   bandwidth. Vendor credentials live only in the worker secret store. Do not buy or enable a
   provider before AUP, privacy/DPA, retention, breach, bandwidth-price and revocation review.

The egress node must be a separate failure/security domain with no product DB, backups, app volumes,
SSH key reuse or inbound public proxy. Any host-network/`NET_ADMIN` requirement is unacceptable on
the main LinguistPro app host.

## 6. Security, privacy and cost contract

- Browser authenticates only to LinguistPro; no proxy/API key is shipped to JavaScript.
- Exact HTTPS origin, session-bound five-minute capabilities and CSRF stay.
- YouTube watch/short URLs only; no generic extractor, redirects to private/link-local addresses,
  playlists, channels, live, DRM, login-required or user-supplied yt-dlp options.
- No YouTube account cookies or OAuth in this program. WPC runs a disposable logged-out browser.
- One active plus one waiting job per trusted user; per-user/day byte and duration budgets.
- Resolve is metadata-only. It does not start a tunnel, reserve 300 MiB or call ASR.
- Egress IP/session is operational personal/security data: report only class+region+lease ID, never
  raw proxy credentials, signed CDN URLs, visitor tokens or raw extractor JSON.
- Prepared bytes remain ephemeral; no product DB/backups/analytics. Existing SHA and deletion
  receipts remain mandatory.
- Vendor path requires an explicit privacy notice because the provider can observe destinations and
  traffic size even if TLS CONNECT hides the URL path.
- Cost ledger records prepared/streamed bytes by provider and user, but not the source URL/title.
- Circuit breaker disables an unhealthy provider after bounded failures; it does not spin through
  IPs indefinitely or convert a block into abusive retry traffic.

## 7. Premium mobile interaction

The user should never choose `IPv6`, `proxy`, `Cobalt`, `worker` or `region`. Those are operational
details.

```text
Добавить видео по ссылке
[ https://youtube.com/...              ]
[ Проверить ссылку ]

thumbnail  title
55:04 · YouTube · иврит

● 720p MP4 · видео + звук · ~235 МБ
  M4A · только звук · ~34 МБ
  Другие варианты

У меня есть разрешение использовать этот материал
[ Добавить в Studio · 720p ]

Источник -> Подготовка -> На устройство -> Проверка -> Готово
```

Rules:

- one recommended complete MP4; advanced variants stay progressive;
- the first network action is still `Проверить ссылку`, never paste;
- region/route recovery is automatic and bounded. Copy says `Проверяем доступность`, not
  `Переключаем residential proxy`;
- a geo result says `Видео недоступно в регионе подготовки` and offers a grounded retry only when
  an approved alternate route exists;
- bot/attestation failure says `YouTube временно не выдаёт файл этому каналу подготовки`; it never
  blames the URL or tells the user to re-paste it;
- preparation may continue while the PWA is backgrounded. Returning to Studio restores the job;
- device handoff must support immutable ETag/Range resume. Reopen re-hashes the existing OPFS
  partial, resumes from its exact byte offset and promotes only after final SHA equality;
- `Добавлено в Studio на этом устройстве` remains primary; browser Files/Downloads copy remains a
  separate action and receipt;
- saved materials remain in Import Center with one recent-draft shortcut in Add Material.

The current 30-minute output TTL and restart-from-zero stream are below this bar for iPhone. A
bounded resumable handoff (recommended 2-hour maximum after preparation, immediate deletion after
verified receipt) is part of the architecture revision, not polish.

## 8. Red-before-build validation

### RMA-M0 — egress lab, no production routing

1. Inventory actual IPv6 routing on an isolated node; do not assume the documented `/64` is usable
   from the worker/container.
2. Exact-pin yt-dlp, EJS, WPC, `nodriver`, Chromium, Deno and FFmpeg with licences/SBOM; WPC is a
   stop until the transitive AGPL boundary/source-offer is approved.
3. Probe metadata and a bounded byte range for:
   - owner geo-sensitive item `nNQhzD-T85M` through an Israel route;
   - global control `jNQXAC9IVRw`;
   - one Hebrew-caption item;
   - one expected geo/login/DRM failure fixture.
4. Demonstrate resolve and prepare use one egress lease; a forced lease change invalidates the plan.
5. Repeat a low-volume schedule across 24 hours. No infinite rotation/retry and no cookies.
6. Compare IPv6 route with one approved managed-egress trial. Record success, latency, bytes and
   cost without URLs/titles.

Passing once is not enough. Proposed beta floor: 20/20 bounded resolves and 10/10 bounded prepares
across both owner/control classes, zero raw-secret/log leaks, correct failure taxonomy and no route
change inside a job.

### RMA-M1 — provider/egress seam

- introduce the two interfaces and pure fake-lease tests;
- keep user-controlled values out of proxy/source-address/extractor arguments;
- plan signature includes lease class+region+provider versions, never secret/raw IP;
- content-free capability/runtime report and per-provider circuit breaker;
- current direct backend remains an explicit `direct_datacenter` test provider, not a silent
  fallback.

### RMA-M2 — resumable OPFS handoff

- immutable ETag, Content-Length, Accept-Ranges and exact SHA;
- an allowlisted HMAC-protected temp manifest (job ID, subject hash, plan SHA, size, SHA, MIME,
  expiry only) restores a completed handoff after worker restart without creating product
  persistence or retaining URL/title/signed-source/proxy data;
- `.partial` lookup by job+plan identity, byte-offset validation, re-hash then Range continuation;
- suspension/network/capability expiry does not create a second prepared artifact;
- mismatch cancels, deletes partial and requires a fresh plan;
- real iPhone Safari and Android Chrome 300 MiB, background/reopen, seek and ASR handoff gates.

### RMA-M3 — owner-only production window

- feature remains owner/trusted-user and one-item only;
- provider/AUP/privacy/cost decision recorded before any managed secret;
- deployed component/digest read-back and content-free health;
- owner example on desktop, iPhone and Android; device gates are separate;
- only after evidence may Companion cease to be offered as the normal mobile explanation.

## 9. Rejected shortcuts

- **“Just use Cobalt's public API.”** Upstream forbids unapproved project use; no SLA, receipt or
  tenant/privacy boundary.
- **“Run Cobalt on the current host.”** Same blocked IP, same geo; different code does not change
  the network fact.
- **“Generate a PO token in the browser.”** The token may be local, but the readable media still
  crosses a CORS-protected origin or a proxy.
- **“Put proxy credentials in PWA/BYOK.”** Mobile-simple becomes key management and exposes a
  reusable abuse credential to every browser.
- **“Use YouTube cookies.”** Account restriction, secret lifecycle and cross-user isolation risks;
  not authorised and not required for the stated public-source scope.
- **“Ship an iOS downloader app.”** Apple guideline 5.2.3 requires explicit authorisation from the
  source platform, not merely the content rightsholder; the available iOS wrapper itself warns of
  rejection risk.
- **“Use serverless/multi-region VPS.”** It may fix geography but remains datacenter egress and does
  not by itself fix reputation/attestation.

## 10. Primary references

- <https://github.com/yt-dlp/yt-dlp>
- <https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide>
- <https://github.com/yt-dlp/yt-dlp/wiki/FAQ>
- <https://github.com/coletdjnz/yt-dlp-getpot-wpc>
- <https://github.com/ultrafunkamsterdam/nodriver>
- <https://github.com/Brainicism/bgutil-ytdlp-pot-provider>
- <https://github.com/imputnet/cobalt>
- <https://github.com/imputnet/cobalt/blob/main/docs/api.md>
- <https://github.com/imputnet/cobalt/blob/main/docs/api-env-variables.md>
- <https://github.com/iv-org/invidious-companion>
- <https://github.com/iv-org/smart-ipv6-rotator>
- <https://github.com/LuanRT/YouTube.js/tree/main/examples/browser>
- <https://github.com/Vanilagy/mediabunny>
- <https://mediabunny.dev/api/StreamTarget>
- <https://github.com/JunkFood02/Seal>
- <https://github.com/deniscerri/ytdlnis>
- <https://github.com/yausername/youtubedl-android>
- <https://github.com/net00-1/SW-DLT>
- <https://github.com/kewlbear/YoutubeDL-iOS>
- <https://developer.apple.com/app-store/review/guidelines/>
- <https://developer.mozilla.org/en-US/docs/Web/API/Response/type>
- <https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/>
- <https://docs.hetzner.com/cloud/servers/faq/>
- <https://developers.google.com/youtube/v3/docs/videos>
- <https://support.google.com/youtube/answer/56100>
