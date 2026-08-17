# ROOM-UX-VF5 — approved bounded regression correction

```text
DATE=2026-08-17
MODE=REGRESSION_CORRECTION_ONLY
STATUS=IMPLEMENTED_LOCAL_DEPLOYMENT_PENDING
TARGET_RELEASE=3.11.401
```

The owner’s `2026-08-17` production screenshots and explicit request to fix the
Room behavior authorize one bounded successor to the `2026-08-16` VF5 research
NO-GO. They do not reopen the rest of Visual Finishing.

## Approval values

```text
F1=REGRESSION_CORRECTION_ONLY
F2=ROOM_RESTORE_PERSISTED_STUDIO_ROW_MEDIA_IDENTITY
F3=MEDIA_HOST_PROJECTION_AND_RELEASE_LOCK_ONLY
F4=NO_NEW_ICON_TYPOGRAPHY_LOCALE_OR_RTL_SEMANTICS
F5=RESTORE_EXISTING_ROW_REPLAY_AND_EXACT_ROW_SEEK
F6=SHARED_MEDIA_HOST_BEHAVIOR_OWNER
F7=3.11.401_CACHE_BUST_AND_STATIC_ROLLBACK
F8=SERIALIZED_IMPLEMENT_TEST_DEPLOY_OWNER_READBACK
SCOPE=ONE_ROOM_STUDIO_MEDIA_IDENTITY_PROJECTION
```

## Success contract

For a Studio-saved media table whose visible text no longer aligns strongly with
the transcript, Reading Room must use the already persisted, SHA-bound row/source
identity to expose only the proven media rows and seek the player to the selected
row. The owner case must recover `510/544`, not the false `176/544`, while all
unbound/blind rows remain without a replay action.

## Frozen boundaries

- No row/text/media/progress writer.
- No timing inference or interpolation.
- No provider call, schema or migration.
- No CSS/a11y/icon/locale/theme/navigation expansion.
- No broad media-package repair or historical rebinding.
- No owner-data mutation during automated verification.

Implementation evidence and rollback:

[REGRESSION_CORRECTION_IMPLEMENTATION_EVIDENCE.md](../research/room-ux-visual-finishing-vf5/2026-08-17/REGRESSION_CORRECTION_IMPLEMENTATION_EVIDENCE.md)
