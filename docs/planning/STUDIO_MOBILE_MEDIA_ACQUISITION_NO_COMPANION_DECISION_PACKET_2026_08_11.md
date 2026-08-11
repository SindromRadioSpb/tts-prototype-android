# Studio mobile media acquisition without Companion — decision packet

> **Date:** 2026-08-11
> **Status:** **PROPOSAL / RESEARCH COMPLETE / NO IMPLEMENTATION AUTHORITY**
> **Research:**
> `docs/research/studio-mobile-media-acquisition-no-companion/2026-08-11/README.md`
> **Live baseline:** `fd496fb4`, web/SW `3.11.343`; deployed acquisition routing is healthy but
> actual YouTube acquisition is blocked by German-datacenter reputation and owner-item geography
> **Scope:** mobile acquisition from a public authorised YouTube URL without a per-user Companion,
> home PC or Tailscale node

## 0. Decision in one screen

**Yes, the user can have a one-surface iPhone/Android flow without Companion.** The PWA cannot
perform YouTube extraction directly because the browser cannot read Innertube/googlevideo responses
through CORS. A remote execution boundary therefore remains mandatory, but it can be entirely
operated by LinguistPro and invisible to the user.

Recommended revision:

```text
PWA -> acquisition broker -> sticky Israel egress lease
    -> pinned yt-dlp + WPC browser attestation + FFmpeg
    -> resumable first-party stream -> OPFS -> Studio
```

Keep the current product/evidence chain. Replace `one worker = one fixed datacenter IP` with an
explicit provider/egress seam.

1. First validate a dedicated low-volume IPv6 `/64` egress node, one random address held for the
   complete job. This requires no per-user node, no browser secret and potentially no new vendor.
2. If the 24-hour gate is not fully green, use an AUP-approved sticky Israel ISP/residential egress
   as the managed production route.
3. Evaluate the maintained `yt-dlp-getpot-wpc` provider in the isolated lab. Its plugin is MIT but
   pins AGPL-3.0 `nodriver==0.50.3`, so the complete image/source-offer licence gate precedes any
   adoption. It is an attestation component, not a substitute for a healthy/appropriate-region IP.
4. Keep Cobalt/Invidious as implementation references or an isolated fallback after a separate
   AGPL/API contract gate; do not replace the existing planner/receipt system wholesale.
5. Make Range/ETag OPFS resume part of this revision so iPhone suspension does not turn a correct
   acquisition into a restart loop.

## 1. What remains canonical

The following approved RMA-0–RMA-3 decisions are unchanged:

- one Add Material surface and one resolved-source card;
- exact complete-format choices, recommended H.264/AAC MP4 and honest byte estimate;
- explicit rights basis and no claim that public/non-commercial means permitted;
- isolated ephemeral worker; no media in Node, product DB, backups or analytics;
- first-party streaming to OPFS `.partial`, worker/device SHA equality and verified promotion;
- separate `Добавить в Studio` and owner-saved device copy receipts;
- Media Readiness before captions/ASR/binding;
- `С устройства`, `Медиа на иврите -> транскрипт` and full material list in Import Center;
- no automatic ASR, translation, transcode, playlist/channel/bulk or cookie/account flow.

This packet revises only the network/provider boundary and mobile interruption recovery.

## 2. Why the current method is not a premium release

The current worker is operationally healthy but binds extraction to one German datacenter IP.
Actual source tests then fail before the user can benefit from the polished UI:

- a geo-sensitive Israeli item is unavailable from Germany;
- a global control gets YouTube's bot/login challenge from the datacenter IP;
- the tested BgUtils PO provider did not repair that blocked route;
- a pure browser attempt is stopped by CORS and cannot expose readable bytes to OPFS.

The UI currently promises a deterministic path that the runtime cannot fulfil. A premium product
must gate source resolution on a route with measured capability, keep the job recoverable through
mobile suspension and return a specific next action instead of a generic 502.

## 3. Chosen component strategy

### Adopt

- current pinned yt-dlp/EJS/FFmpeg engine and deterministic planner;
- exact-pinned `coletdjnz/yt-dlp-getpot-wpc` with disposable guest Chromium **only after** its
  transitive `nodriver` AGPL/source-offer gate;
- Cobalt's proven **one IPv6 per complete download** and proxy-session pattern;
- Invidious Companion/smart-ipv6-rotator operational guidance for isolated IPv6 routing;
- current OPFS stream/hash implementation, extended with immutable resume.

### Evaluate later

- Mediabunny streaming remux only if server merge cost or latency is measured to be the bottleneck;
- a separately deployed Cobalt API fallback only if AGPL/source-offer, logical-vs-exact plan and
  receipt gaps are explicitly resolved;
- Android native share-sheet enhancement after the universal web route passes.

### Reject as primary

- browser-only YouTube.js/BgUtils;
- public Cobalt/SaveFrom/SSYouTube dependency or iframe;
- MeTube as a second download library;
- iOS Shortcut/a-Shell or non-App-Store-safe yt-dlp wrapper;
- cookies/account OAuth;
- ordinary multi-region VPS with no ISP/IPv6 reliability evidence;
- per-user proxy BYOK or proxy credentials in browser storage.

## 4. Required contracts

### `EgressLease`

```json
{
  "lease_id": "egl_opaque",
  "class": "ipv6_prefix|managed_proxy",
  "region": "IL",
  "continuity_key": "opaque",
  "expires_at": 0,
  "provider_revision": "exact"
}
```

Raw IP, proxy URL/user/password, visitor/session tokens and signed CDN URLs never enter this object,
the plan, browser, product DB or content-free report.

### Plan binding

- resolve and prepare use one lease and provider revision;
- plan signature includes non-secret lease class/region/revision;
- changed/expired lease invalidates the plan and requires a fresh metadata resolve;
- failover never appends to an old partial or silently substitutes format IDs;
- direct-datacenter is a named provider for diagnostics, never an implicit fallback.

### Mobile handoff

- immutable ETag = plan/output identity, exact length and SHA, `Accept-Ranges: bytes`;
- partial is keyed by job+plan identity and stores received length;
- resume re-hashes the existing partial before requesting the next byte;
- capability refresh does not create a new artifact;
- prepared output maximum lifetime: two hours; delete immediately after matching device receipt;
- a minimal HMAC-protected temp manifest (job ID, subject hash, plan SHA, size, SHA, MIME, expiry)
  restores a completed handoff after worker restart without URL/title/signed-source/proxy data;
- mismatch/cancel explicitly deletes both worker output and device partial.

## 5. Security and lifecycle boundary

- egress runs on an isolated node/VM with no DB, product volumes, app network trust or shared SSH
  credentials;
- any host-network/`NET_ADMIN`/AnyIP route is forbidden on the main application host;
- Chromium is non-root, sandboxed, disposable, has no persistent profile/cookies and no public
  DevTools port;
- only allowlisted YouTube hosts/redirects and fixed worker options;
- one active+one waiting job, 300 MiB/output, bounded duration/retries and daily byte budget;
- provider circuit breaker; no uncontrolled IP cycling;
- managed-egress approval requires AUP permitting the use, Israel availability, sticky sessions,
  bandwidth/cost disclosure, DPA/privacy/retention and credential revocation;
- content-free cost ledger by provider/user/bytes; no URL/title.

## 6. User experience target

There is no `Companion`, `домашний узел`, `proxy`, `IPv6` or provider selector in the normal UI.

1. Paste URL.
2. `Проверить ссылку` resolves metadata through an approved route; no bytes or ASR yet.
3. Source card recommends one complete MP4 and progressively reveals audio/other qualities.
4. `Добавить в Studio` prepares once, continues server-side during a short app suspension, then
   streams/resumes into OPFS.
5. On return, the same job resumes from the device partial and ends as
   `Добавлено в Studio на этом устройстве`.

Error taxonomy:

| Runtime fact | User copy | Action |
|---|---|---|
| approved route temporarily unhealthy | `Сервис подготовки временно недоступен` | `Повторить позже` |
| unavailable in approved region | `Видео недоступно в регионе подготовки` | approved alternate route if one exists; otherwise file/source fallback |
| bot/attestation block | `YouTube временно не выдаёт файл этому каналу подготовки` | one bounded alternate-provider retry |
| login/private/age account required | `Для этого видео требуется вход; такие видео пока не поддерживаются` | `Выбрать файл с устройства` |
| iOS background interruption | `Передача приостановлена — продолжим с сохранённого места` | `Продолжить` |
| worker artifact expired | `Подготовленный файл истёк и был удалён` | fresh resolve/prepare, no fake resume |

## 7. Execution slices and stop gates

### RMA-M0 — isolated egress proof

No product code or production routing.

- verify actual routed IPv6 prefix on a disposable/dedicated node;
- freeze WPC/`nodriver`/Chromium and updated yt-dlp/EJS/FFmpeg image/SBOM; stop on unresolved
  transitive AGPL obligations;
- compare direct IPv4, sticky IPv6 and one approved managed Israel lease;
- two owner/control URLs, captions and expected failure fixtures;
- 20/20 resolves and 10/10 bounded prepares over 24 hours;
- exact lease continuity, no cookie/account, no secret/log leakage;
- record bytes, latency, provider error and cost without source identity.

**Stop:** do not call a one-off success production-ready. If neither route passes, the universal
mobile URL promise remains unavailable and the product must show file/subtitle fallback honestly.

### RMA-M1 — provider and egress seam

- red tests first for lease binding, plan invalidation, SSRF/options, circuit breaker and redaction;
- refactor fixed `YtDlpBackend` behind `AcquisitionProvider`;
- worker-only `EgressLease` manager; no product schema migration;
- provider-specific classified errors, no raw yt-dlp 502;
- feature remains owner-only and disabled in production.

### RMA-M2 — resumable handoff

- worker Range/ETag and same-artifact capability refresh;
- allowlisted temp-manifest restart recovery; no product database/durable library row;
- OPFS partial discovery, re-hash, seek and continue;
- suspension, network-loss, stale plan, mismatch and 300 MiB tests;
- RU/EN/HE 380 px restored-job UI.

### RMA-M3 — production/owner-live

- separate infrastructure/deploy authority;
- disk/network/temp quotas and deletion receipt;
- desktop, real Safari/iPhone and Chrome/Android are separate evidence;
- measure success/latency/cost for the real authorised owner item;
- no GA/public marketing before the bounded trusted-user beta proves reliability.

## 8. Owner decisions requested before implementation

1. Approve the **managed acquisition plane** as the primary mobile route: no per-user Companion,
   but an isolated LinguistPro-operated egress node/service remains.
2. Approve RMA-M0 only: exact-pinned WPC + dedicated sticky IPv6 proof, with no production routing.
3. Decide whether one paid, AUP-approved Israel ISP/residential egress trial is permitted during
   RMA-M0 and define a monthly/GB ceiling before procurement.
4. Keep Companion available as an optional privacy/cost fallback, but remove it from the normal
   mobile happy path only after RMA-M3 passes.

No code, infrastructure, secret, vendor signup, production route, native app or owner-data mutation
is authorised by this proposal alone.

## 9. Role-lens synthesis

- **R4:** infrastructure disappears from the interface; one recoverable job and exact next actions
  replace brittle retries and setup instructions.
- **R5:** mobile-first means iPhone/Android work from the PWA without an always-on PC; optional local
  paths remain complements, not prerequisites.
- **R9/R11:** a route success, extractor prediction, prepared bytes, worker SHA, device SHA and
  readiness are different facts; failover cannot inherit old truth.
- **R12:** one acquisition broker owns job evidence; Cobalt/Invidious/egress are adapters, never a
  second library or product canon.
- **R14:** secrets and network privilege stay outside browser/main app; exact allowlists, bounded
  jobs, circuit breakers and no cookies.
- **R15:** explicit transient retention, delete-on-receipt, redacted operational evidence and
  managed-provider privacy disclosure.
- **R16:** provider bytes are a metered resource; cost caps and a free IPv6 proof precede recurring
  egress spend.
