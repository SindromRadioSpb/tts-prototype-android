# Hermex current-turn audio bridge

Hermex 1.4 build 3 deliberately sends a hold-to-record voice note as a server-generated transcript
plus a display-only audio attachment. Hermes WebUI 0.52.41 persists the attachment but omits
non-image attachment metadata from the message given to the agent. As a result, C1 sees the
auto-caption and cannot call its local audio tool.

This pinned derivative image changes only the ephemeral agent input built by
`_build_native_multimodal_message`:

- an audio path must already resolve to a regular file inside the existing workspace or WebUI
  attachment root;
- only known audio MIME types/extensions are included;
- the persisted/displayed user message remains the Hermex transcript;
- audio bytes are not embedded or sent to the LLM;
- the C1 MCP tool remains responsible for session/path/symlink/type/size validation and deletion.

The build fails if the pinned base image's `streaming.py` hash changes. The deployed derivative is
`linguistpro/hermes-webui-c1:20260724-1`; its manifest id is
`sha256:559002df230d9df8b40ef87f19a269ceaee1838a988920da068afa45d5d67aae` and the patched
`streaming.py` hash is `fbcbc4bd59f540eb30151cb747b43f560319e3377079fccd82a7584cb98f6c1c`.
Rollback is switching only `hermes-webui` back to
`ghcr.io/nesquena/hermes-webui@sha256:10eaa2d43efbdd01833e7ff64aaaa5557beb15e2a34d32a489af4fd4ed5fbff5`
and restarting that container; volumes and sessions are unchanged.
