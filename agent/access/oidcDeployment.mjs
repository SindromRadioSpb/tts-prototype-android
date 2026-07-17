import { parse as parseQueryString } from 'node:querystring';
import { PassThrough } from 'node:stream';

import { errors, Provider } from 'oidc-provider';

import deploymentContracts from './oauthDeploymentContracts.js';

const { RESOURCE, TTL } = deploymentContracts;

function fail(code) { const error = new Error(code); error.code = code; throw error; }

function exactScopes(value) {
  const scopes = String(value || '').split(' ').filter(Boolean).sort();
  if (!scopes.length || scopes.length > deploymentContracts.SCOPES?.length) fail('AA_OAUTH_BAD_SCOPES');
  const allowed = new Set((deploymentContracts.SCOPES || []).map(String));
  if (scopes.some((scope) => !allowed.has(scope)) || new Set(scopes).size !== scopes.length) fail('AA_OAUTH_BAD_SCOPES');
  return scopes;
}

function replayRequest(req, body) {
  const replay = new PassThrough();
  for (const key of ['method', 'url', 'headers', 'rawHeaders', 'httpVersion', 'httpVersionMajor', 'httpVersionMinor', 'socket', 'connection']) replay[key] = req[key];
  replay.push(body);
  replay.push(null);
  return replay;
}

export function createOidcDeployment({
  issuer,
  privateJwks,
  cookieKeys,
  Adapter,
  clients,
  findAccount,
  interactionUrl,
  principalForToken,
  protocolPreflight = async () => ({ ok: true }),
  trustProxy = false,
}) {
  if (typeof issuer !== 'string' || !issuer) fail('AA_OAUTH_ISSUER_REQUIRED');
  if (!privateJwks || !Array.isArray(privateJwks.keys) || !privateJwks.keys.length) fail('AA_OAUTH_KEYSET_INVALID');
  if (typeof Adapter !== 'function') fail('AA_OAUTH_ADAPTER_REQUIRED');
  if (!Array.isArray(cookieKeys) || cookieKeys.length < 1 || cookieKeys.some((key) => typeof key !== 'string' || key.length < 32)) fail('AA_OAUTH_COOKIE_KEYS_REQUIRED');
  if (!Array.isArray(clients) || !clients.length) fail('AA_OAUTH_CLIENTS_REQUIRED');
  if (typeof findAccount !== 'function' || typeof interactionUrl !== 'function' || typeof principalForToken !== 'function' || typeof protocolPreflight !== 'function') fail('AA_OAUTH_CALLBACK_REQUIRED');
  if (typeof trustProxy !== 'boolean') fail('AA_OAUTH_PROXY_CONFIG_INVALID');

  for (const client of clients) deploymentContracts.validateFixtureClient(client);
  const providerClients = clients.map((client) => ({
    client_id: client.client_id,
    client_name: client.client_name,
    id_token_signed_response_alg: 'ES256',
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    grant_types: [...client.grant_types],
    response_types: [...client.response_types],
    redirect_uris: [...client.redirect_uris],
  }));
  const provider = new Provider(issuer, {
    adapter: Adapter,
    clients: providerClients,
    clientAuthMethods: ['none'],
    cookies: { keys: cookieKeys },
    features: {
      devInteractions: { enabled: false },
      deviceFlow: { enabled: false },
      dPoP: { enabled: false },
      introspection: { enabled: false },
      pushedAuthorizationRequests: { enabled: false },
      registration: { enabled: false },
      revocation: {
        enabled: true,
        allowedPolicy: async (ctx, client, token) => client.clientId === token.clientId,
      },
      rpInitiatedLogout: { enabled: false },
      userinfo: { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource: async () => { throw new errors.InvalidTarget('resource parameter is required'); },
        useGrantedResource: async () => false,
        getResourceServerInfo: async (ctx, resource) => {
          if (resource !== RESOURCE) throw new errors.InvalidTarget('resource is not registered');
          if (ctx.oidc.params.scope) exactScopes(ctx.oidc.params.scope);
          return {
            scope: deploymentContracts.SCOPES.join(' '),
            audience: RESOURCE,
            accessTokenTTL: TTL.access_token_seconds,
            accessTokenFormat: 'jwt',
            jwt: { sign: { alg: 'ES256', kid: privateJwks.keys[0].kid } },
          };
        },
      },
    },
    findAccount,
    interactions: { url: interactionUrl },
    extraTokenClaims: async (ctx, token) => {
      if (ctx.oidc.body?.resource !== RESOURCE) throw new errors.InvalidTarget('resource parameter is required at the token endpoint');
      const principal = await principalForToken(token);
      if (!principal || principal.subject !== token.accountId || principal.client_id !== token.clientId) throw new errors.InvalidGrant('principal binding failed');
      return {
        connection_id: principal.connection_id,
        security_epoch: principal.security_epoch,
        subject_epoch: principal.subject_epoch,
      };
    },
    issueRefreshToken: async (ctx, client, code) => Boolean(code && client.grantTypeAllowed('refresh_token')),
    jwks: privateJwks,
    pkce: { required: () => true },
    responseTypes: ['code'],
    renderError: async (ctx, out) => {
      ctx.status = 400;
      ctx.type = 'application/json';
      ctx.body = { error: out.error || 'invalid_request' };
    },
    // Agent Access scopes are resource-indicator scopes, not global OIDC
    // scopes. Publishing is owned by the closed compatibility document.
    scopes: [],
    ttl: {
      AccessToken: TTL.access_token_seconds,
      AuthorizationCode: TTL.authorization_code_seconds,
      Interaction: TTL.interaction_seconds,
      Grant: TTL.refresh_absolute_seconds,
      Session: TTL.interaction_seconds,
      RefreshToken: (ctx, token) => {
        const now = Math.floor(Date.now() / 1000);
        const absoluteRemaining = (token.iiat || now) + TTL.refresh_absolute_seconds - now;
        return Math.max(1, Math.min(TTL.refresh_idle_seconds, absoluteRemaining));
      },
    },
  });
  // Forwarded Host/Proto reach Koa only after the outer OAuth gate has
  // validated the canonical host, a single value and the explicit trust flag.
  provider.proxy = trustProxy;

  const callback = provider.callback();
  async function nodeHandler(req, res) {
    const requestPath = new URL(req.url, issuer).pathname;
    const formRoute = requestPath.endsWith('/token/revocation') ? 'revocation' : requestPath.endsWith('/token') ? 'token' : null;
    if (req.method === 'POST' && formRoute) {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 56 * 1024) {
          res.writeHead(413, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_request' }));
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const form = parseQueryString(body.toString('utf8'));
      if (formRoute === 'token' && form.resource !== RESOURCE) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_target' }));
        return;
      }
      const quota = await protocolPreflight({ route_class: formRoute, form, req });
      if (!quota || quota.ok !== true) {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': String(Math.max(1, Math.ceil(Number(quota?.retry_after_ms || 1000) / 1000))) });
        res.end(JSON.stringify({ error: 'temporarily_unavailable' }));
        return;
      }
      callback(replayRequest(req, body), res);
      return;
    }
    callback(req, res);
  }

  return Object.freeze({ provider, nodeHandler });
}
