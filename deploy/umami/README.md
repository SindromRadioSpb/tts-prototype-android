# LinguistPro Product Pulse — Umami

Umami is the sole analytics backend for the privacy-first Product Pulse. The
application sends only events accepted by `product-pulse/contract.js`; it does
not load the generic Umami browser tracker.

## Required secrets for the Umami stack

- `UMAMI_DB_PASSWORD`: unique database password.
- `UMAMI_APP_SECRET`: unique high-entropy application secret.

Do not commit either value. Back up the `umami-db-data` volume before upgrades.
Change Umami's default administrator password immediately after first login.

## LinguistPro environment

Keep collection disabled until Umami, its TLS endpoint and backups are ready:

```text
PRODUCT_PULSE_ENABLED=1
UMAMI_BASE_URL=https://analytics.example.com
UMAMI_WEBSITE_ID=<website UUID>
UMAMI_USERNAME=<read-only dashboard user>
UMAMI_PASSWORD=<password>
PRODUCT_PULSE_HOSTNAME=linguistpro.kolosei.com
```

`UMAMI_API_TOKEN` may replace username/password if the installed Umami version
supports a suitable read-only token. Secrets stay server-side. A missing or
unavailable backend never blocks LinguistPro; `/pulse.html` reports the source
as unavailable instead of displaying invented zeroes.

## Metric contract

- `visits`: Umami aggregate for the requested period.
- `events`: accepted Product Pulse events, not Cloudflare HTTP requests.
- Session identity lives only in `sessionStorage`; it is not a cross-device or
  D30 identity. Do not label it as a person count.
- No raw study content, notes, filenames, full URLs, email or stable device
  fingerprint is accepted.
