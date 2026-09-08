# Production verification — 2026-09-08

**Published and technically verified: v3.11.490. Physical iPhone acceptance pending.**

Entry: <https://linguistpro.kolosei.com/iphone-media-check.html>.
Code/main/deployed image commit: `97dee98f1dbe145eef8a5a7bfa31c283b22793b5`.
Deployed application container observed running this exact image; acquisition worker
remains on `fd496fb4`, unchanged and healthy. No worker/proxy/API provisioning.
Before deployment production was `f9b8eb95` / 3.11.488.

## Live results

- `/healthz`, `/index.html`, `/library.html`: HTTP 200.
- `/api/client-config`: 3.11.490, repeatedly observed.
- HTML/CSS/JS/archive fetched from production match exact `git show 97dee98f:<path>` bytes.
- Two fresh isolated browser runs, each with two reloads: all 11 grouped checks PASS.
- Actual browser ZIP download and actual clipboard copy PASS.
- 380px, desktop and dark-mode screenshots inspected; no horizontal overflow, 44px controls.
- No page errors and no API/provider calls from the qualification page.
- Rights/source inputs do not persist; invalid input clears previously generated commands.

| Production asset | Bytes | SHA-256 |
|---|---:|---|
| `/iphone-media-check.html` | 10,980 | `d5ac54ee1e89cea0462b6d5426c4db2265372d65b580cb1ee633ba68875ebe22` |
| `/css/iphone-media-check.css` | 4,652 | `2f57b6a1ecac5b3005182aed6b529212c017f60abff6355b9f19ae3bc56059e1` |
| `/js/iphone-media-check.js` | 4,112 | `d36ba51654fa888c942df80d142fa7d3b4b7c4acb8a56ae53dfbdeb0c8f4340f` |
| `/downloads/linguistpro-iphone-probe-0744253a.zip` | 24,165 | `0744253ad45912fd53f641b10f9832e68511641f211d1bf82ae8151d6f7e4282` |

## Evidence boundaries

`browser-report.json` and screenshots are generated desktop-browser evidence, not native
iPhone execution. This release hosts an explicitly experimental test package and
instructions; it does not finish or enable the five-step local downloader in Studio.
The owner accepted the helper installation, but has not yet reported native preflight,
real source acquisition, Chrome return, local file import or playback.

The final evidence-only commit is kept on `release/iphone-media-check-2026-09-08`; main
and the deployed application stay at code commit `97dee98f` to avoid an unnecessary
second production rebuild. The separate feature branch retains the unqualified server
downloader and native-probe source; it was not merged into production.

Next: owner follows the page, stops on any preflight failure, then checks audio/video
download, return to Chrome, device selection and playback. Never label a URL callback
or desktop test as `OWNER_REPORTED_PASS`. No automatic ASR is needed for this test.
