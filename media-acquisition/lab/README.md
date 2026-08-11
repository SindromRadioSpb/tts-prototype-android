# RMA-M0 isolated egress probe

> **Status:** lab-only tooling; it is not imported by the production worker package and does not
> change production routing.
>
> **Acceptance:** pending a dedicated/isolated egress node and a complete 24-hour campaign.

`egress_probe.py` compares the existing fixed acquisition backend over three explicitly named
routes: `direct_ipv4`, one sticky address from an `ipv6_prefix`, or an AUP-approved
`managed_proxy`. It runs the real resolver/planner and, for prepare samples, the real bounded
download path. Every prepare rechecks the public egress address before and after acquisition and
fails closed if it changed.

The JSONL evidence contains only the route class/region/revision, `owner|control` fixture class,
phase, timings, byte/hash result, a salted egress fingerprint and a classified error. It never
contains source URL/video ID/title, raw IP, proxy host/user/password, signed media URL or provider
exception text.

## Runtime and licence gate

Use the exact worker runtime from `Dockerfile.media-acquisition` and the hashed Python lock. The
current M0 harness intentionally does **not** install `yt-dlp-getpot-wpc`: its pinned `nodriver`
dependency is AGPL-3.0, so image/source-offer obligations must be resolved before that component
enters any frozen test image. A direct yt-dlp campaign can proceed independently, but cannot be
presented as WPC evidence.

## Secret environment file

Keep the following in a root-readable environment file outside Git and outside the evidence
directory:

```text
LP_MEDIA_M0_OWNER_URL=<authorised owner fixture>
LP_MEDIA_M0_CONTROL_URL=<public control fixture>
LP_MEDIA_M0_REPORT_SALT=<random value, at least 32 characters>
LP_MEDIA_M0_PROVIDER_REVISION=<exact non-secret route revision>
LP_MEDIA_M0_REGION=IL
```

For a dedicated IPv6 node, also set one exact address allocated from the routed prefix:

```text
LP_MEDIA_M0_SOURCE_ADDRESS=<one IPv6 held for the complete campaign>
```

For a managed route, set both values; `accepted` records that the provider/AUP review happened, it
does not replace that review:

```text
LP_MEDIA_M0_AUP_CONFIRMATION=accepted
LP_MEDIA_M0_PROXY_URL=<sticky HTTPS proxy URL with credentials>
```

Do not put any of these values on a command line, in a systemd unit body or in the JSONL output.

## Run the balanced 24-hour gate

Install the locked runtime in the disposable node/container, load the protected environment file,
then run:

```bash
python media-acquisition/lab/egress_probe.py campaign \
  --route ipv6_prefix \
  --output /var/lib/linguistpro-rma-m0/ipv6-campaign.jsonl \
  --temp-root /var/tmp/linguistpro-rma-m0
```

The default campaign schedules 20 balanced owner/control samples across a full 86,400 seconds.
The first ten samples perform resolve+prepare; the remaining ten perform resolve. A failed sample
is retained rather than retried away. The command exits `0` only when all of these are true:

- one exact route class/region/provider revision;
- 20 successful resolves, at least 10 per fixture;
- 10 successful prepares, at least 5 per fixture;
- no provider or continuity failure;
- first-to-last sample span is at least 24 hours.

Re-evaluate an existing content-free evidence file with:

```bash
python media-acquisition/lab/egress_probe.py evaluate \
  --input /var/lib/linguistpro-rma-m0/ipv6-campaign.jsonl
```

Never reuse an evidence file across route revisions. The campaign command refuses to overwrite an
existing file.

## What does not count

- a one-off success;
- a home-PC or phone egress, even if it is in Israel;
- resolve without prepare;
- a prepare whose egress fingerprint changed;
- a direct route result described as WPC or managed-provider evidence;
- a campaign from the main application host.
