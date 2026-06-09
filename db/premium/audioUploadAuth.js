// db/premium/audioUploadAuth.js
// BRR-P0-010 · Single source of truth for the /api/audio/cache/upload authorization
// DECISION. Pure (no req/res, no crypto, no env) so every branch is unit-testable
// without mocking Express — same extract-and-test pattern as db/premium/ttsAssetKey.js.
//
// The upload endpoint writes MP3s into the shared server audio cache, which
// reader-core tier-1 then serves KEYLESS to every reader (HEAD/GET /api/audio/:key).
// It must NOT be writable anonymously. The previous gate (v3AudioPrefetchIsAllowed)
// honoured an `X-Local-Mode: 1` header from ANY remote client, so anyone could
// pre-seed or disk-fill the prod cache. This decision requires an operator token.
//
// Decision table (inputs are primitives the server computes from the request):
//   secretSet | tokenMatches | isLoopback | result
//   ----------+--------------+------------+-------------------------------------
//   true      | true         | any        | 200 authorized
//   true      | false        | any        | 403 BAD_UPLOAD_TOKEN  (loopback does NOT
//             |              |            |   bypass when a secret is set — so no
//             |              |            |   X-Forwarded-For/Traefik assumption is
//             |              |            |   load-bearing; a spoofed XFF:127.0.0.1
//             |              |            |   still gets 403)
//   false     | —            | true       | 200 authorized (pure dev convenience)
//   false     | —            | false      | 503 UPLOAD_DISABLED (fail-closed)
//
// Note: `tokenMatches` is only ever true when a secret is set (the caller computes
// it as `secretSet && constantTimeEqual(...)`); the secretSet:false branch ignores
// it defensively. X-Local-Mode / ALLOW_REMOTE_AUDIO_PREFETCH are deliberately NOT
// inputs here — this write path no longer consults them (they still apply to the
// read-ish prefetch routes, which are out of scope for BRR-P0-010).

function decideAudioUploadAuth({ secretSet, tokenMatches, isLoopback } = {}) {
  if (secretSet) {
    if (tokenMatches) return { authorized: true };
    return {
      authorized: false,
      status: 403,
      error: "BAD_UPLOAD_TOKEN",
      message: "Invalid or missing audio upload token (X-Audio-Upload-Token).",
    };
  }
  // No token configured on the server.
  if (isLoopback) return { authorized: true };
  return {
    authorized: false,
    status: 503,
    error: "UPLOAD_DISABLED",
    message: "Audio upload requires AUDIO_UPLOAD_TOKEN to be set; X-Local-Mode no longer authorizes writes.",
  };
}

module.exports = { decideAudioUploadAuth };
