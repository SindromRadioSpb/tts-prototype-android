# M4 account data route — local candidate 3.11.698

Date: 2026-09-29. Base: released 3.11.697 / `9fcd2705`.
Evidence: isolated browser/API fixtures and source review. This is not owner-live
archive acceptance or production release proof.

The Reading Room sync dialog now has **My data** for a signed-in, browser-bound
account. Its server JSON download calls `/api/account/export`; the separate
local archive action opens the existing per-account explanation notebook with
JSON download/restore/delete controls. The server response is `private, no-store`.
After an explicit `DELETE` prompt, account deletion checks fresh identity and
CSRF, calls `/api/account/delete`, then removes this account's local explanation
archive in the current browser. A local cleanup failure is reported separately
from a completed server deletion. Other local materials and browser copies on
other devices remain; the interface says so before deletion. No canonical
review writer or model provider is called by these actions.

The isolated four-surface browser smoke also exercised the new route on a
fixture account: server JSON download, notebook opening, changed-account
denial, cancelled/wrong confirmation, server deletion failure preserving the
local archive, successful deletion and local notebook
cleanup. Page errors were empty. The UI was inspected at desktop, 380 px and
Hebrew RTL: [desktop](m4-screenshots/account-data-desktop.png),
[mobile](m4-screenshots/account-data-mobile.png),
[RTL mobile](m4-screenshots/account-data-he-mobile.png).
`auth-smoke` passed 29/29 including `no-store`; two-account tutor lifecycle
smoke, API smoke, 233 i18n checks and 321 shell-integrity checks passed.

A first fresh authenticated Chrome tab on production 697 stalled in the Room
loader. A second tab loaded the video reader and tutor panel, but Kapture input
did not reliably open the archive while tab visibility changed between calls.
Windows Computer Use then stopped the UI session because it could not confirm
the Chrome window URL. No owner data was changed. This is an unresolved
owner-live check, not a failed fixture result. Destructive account deletion was
exercised only on the isolated fixture, never on the owner's account.
