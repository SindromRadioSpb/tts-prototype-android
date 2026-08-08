# Studio Media Readiness — implementation and release evidence (2026-08-08)

Scope: the approved bounded implementation plus its separately authorised web deployment and
Companion beta.5 owner/trusted-user out-of-band release. No media upload to production, schema
migration, card/package/binding rewrite, automatic conversion, public installer hosting, or media
bytes in `.lplp`.

Release evidence:

- web client `3.11.342`, source commit `9824938e75186288eb60904b34689b9991933618`, deployed with
  production health PASS and browser schema 48;
- Companion `0.3.0-beta.5`, source commit `cd6d15e49cc98dcdcc736d016d9ed0eabe16ede5`;
- installer `LinguistProLocalAsrCompanion-0.3.0-beta.5-unsigned-internal.exe`, 1,867,132,293 bytes,
  SHA-256 `811391ece49acfb0fd47755b394b10fc91500674c342e66c209196c3ad5ceae0`;
- Authenticode `NotSigned`; release scope `OWNER_AND_TRUSTED_USERS_OUT_OF_BAND`;
  `public_hosting=false`;
- Companion pytest 77/77, frozen media-readiness job PASS, in-place beta.4 -> beta.5 upgrade PASS,
  installed authenticated media-readiness job PASS, installed tree 5304/5304 files verified;
- release manifest and checksum are recorded in `installer-beta5-release.json`; the distributable
  folder contains the installer, `SHA256SUMS.txt`, `README.txt`, and `release-manifest.json` only.

Actual-file read-only evidence:

- original episode 5: H.264 Main, declared Level 6.2, `yuv420p`, 1280x720@50, HE-AAC;
  classifier result `LOSSLESS_REPAIR`;
- repaired episode 5: the same visible codec state with declared Level 3.2; classifier result `READY`;
- both files completed bounded decode at the start and near 75%; the original was not fast-start;
- the concrete packet acceptance for episode 5 is more specific than its generic AAC-LC row. The
  classifier therefore retains and displays the actual `HE-AAC` profile and admits this owner-proven
  stream; it does not relabel it AAC-LC.

Episodes 1–4 also have `moov` after `mdat`, while the packet's concrete §16 acceptance requires
`READY` for those actual files. The classifier therefore reports `faststart: false` honestly but
does not make that fact alone a blocking repair. Every generated repair/transcode output still
uses `+faststart`. This follows the packet's concrete actual-file gate and avoids manufacturing
work for four files already accepted by the owner devices.

The committed fixture is normalized evidence only. It contains no local path, media bytes, token,
device identifier, or transcript content.

Owner-device acceptance is separate: the exact canonical file must still pass the in-product
play/seek action independently on an actual iPhone and an actual Android device.
