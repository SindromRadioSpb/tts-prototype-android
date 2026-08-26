# External protocol and client research

Date: 2026-08-26
Source commit: `e51e17ab8e88a378c221a9548a555539b6e18c2a`; branch `main`; dirty tree preserved
Production basis: `3.11.440`; no external client was connected in this session
Method: `EXTERNAL_PRIMARY` dated 2026-08-26, `CODE`, `INFERENCE`

## Source fact, inference and recommendation

### MCP protocol era

`EXTERNAL_PRIMARY`: the official [MCP Streamable HTTP 2026-07-28 specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx) defines a sessionless, single-POST modern transport, removes the legacy initialize handshake/GET stream and requires modern routing/version metadata. The [2026-07-28 authorization specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/index.mdx) retains OAuth 2.1 protected-resource discovery, exact resource indicators/audience validation, authorization on every request, scope minimization and the token-passthrough prohibition.

`CODE`: LinguistPro accepts exactly `2025-11-25`, initializes per legacy request flow and advertises tools only.

`INFERENCE`: changing the version string is not an upgrade. It would break both wire behavior and the owner-verified Hermes connection.

`RECOMMENDATION`: upgrade only through the official TypeScript SDK v2 dual-era pattern. The [v2 upgrade guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md) and [2026-07-28 support guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md) describe separate modern and legacy packages/handlers and simultaneous modern plus legacy stateless serving. Pin exact packages and keep `2025-11-25` until both legs pass.

### Tools and Resources

`EXTERNAL_PRIMARY`: the official [MCP Resources guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/resources.md) supports fixed resources and URI templates. The reference [MCP Inspector](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/docs/2026-07-28/tools/inspector.mdx) tests tools, resources and prompts and negotiates legacy versus modern protocol eras.

`EXTERNAL_PRIMARY`: OpenAI's [MCP and Connectors guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) connects a remote server through the Responses API, exposes allowed tools, supports approval policy and warns that remote MCP output is untrusted and may leak data through prompt injection. The product integration is tool-centric.

`INFERENCE`: a Resources-only design would be elegant in the protocol but would exclude or degrade common hosted-agent integrations. A tool-only design would work broadly but discard useful URI semantics in clients that understand Resources.

`RECOMMENDATION`: typed tools are normative; Resources and `ResourceLink` are additive projections over the same descriptor service and IDs. Never maintain separate resource content.

## Representative client contracts

| Client / verifier | Primary evidence | Portable contract required | Pilot evidence |
|---|---|---|---|
| Hermes Agent | Official [Hermes MCP guide](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md) | Remote HTTP OAuth, tool discovery/filtering; resource/prompt wrappers only when server and config support them; parallel calls explicitly opt-in | Preserve current 2025-11-25 owner-live path; tools first; parallel false |
| OpenAI Responses API | [OpenAI MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) | Publicly reachable remote MCP, OAuth bearer, explicit allowed tools/approval, bounded untrusted output | Tool list/call and read-only annotations; no reliance on Resources UI |
| Claude remote connector | Anthropic [custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) | Server reachable from Anthropic cloud, OAuth, per-conversation enablement, minimal permissions, prompt-injection awareness | Discovery/auth/tool calls; no assumption that a local-only endpoint is sufficient |
| MCP Inspector v2 | Official [Inspector docs](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/docs/2026-07-28/tools/inspector.mdx) | Legacy/modern negotiation, OAuth, tools/resources inspection, machine-readable CLI | CI acceptance for both eras and exact schemas/errors |

The minimum compatibility matrix is Hermes + OpenAI Responses API + Inspector. Claude is the second hosted-agent confirmation before wider availability. Client acceptance is separately version-pinned; “MCP compliant” alone is not evidence.

## Security transfer contracts

The primary sources converge on the following portable rules:

- the server is the OAuth resource server and validates exact audience/resource indicators; it never forwards a client token to a downstream service;
- tools/results/resource text are untrusted model context, not instructions;
- permissions are scope- and object-bounded, revocable and reviewed at connect time;
- clients may retry or parallelize reads; server idempotence and rate limits cannot rely on polite client behavior;
- tool annotations such as read-only are metadata, never authorization;
- server URLs and output destinations must be first-party allowlisted; no arbitrary fetch/redirect tool;
- protocol/client upgrades are pinned and re-run against the compatibility matrix.

## Explicitly rejected client-dependent features

- Resources-only discovery;
- embedded binary blobs/base64 in tool or resource results;
- sampling, elicitation, prompts, tasks, Apps or server-initiated notifications in the first pilot;
- client-provided arbitrary URLs for server fetching;
- write tools or “agent notes” hidden inside a read capability;
- auto-enabling parallel tool calls before read isolation/load tests.

## Freshness gate

Repeat this source review if implementation begins more than 30 days after 2026-08-26, a relevant SDK/client version changes, a security advisory lands or MCP publishes another protocol revision. Compatibility failure keeps the new feature flag off; it does not authorize fallback to cookies, query tokens or widened scopes.
