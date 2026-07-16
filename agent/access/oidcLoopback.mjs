import { randomBytes } from 'node:crypto';
import { parse as parseQueryString } from 'node:querystring';
import { PassThrough } from 'node:stream';

import { exportJWK, generateKeyPair } from 'jose';
import { errors, Provider } from 'oidc-provider';

import { createFixtureAdapter } from './oidcFixtureAdapter.mjs';

export const LOOPBACK_CLIENT_ID = 'linguistpro-aa2-loopback-client';
export const LOOPBACK_SUBJECT = 'fixture-user-aa2';
export const LOOPBACK_CONNECTION_ID = 'fixture-connection-aa2';
export const LOOPBACK_RESOURCE = 'https://resource.fixture.invalid/agent-access';
export const LOOPBACK_SCOPE = 'learning.brief.read';

function assertLoopbackUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
    throw new TypeError(`${label} must be an http://127.0.0.1 loopback URL`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError(`${label} must not contain credentials, query, or fragment`);
  }
  return url;
}

export async function createOidcLoopback({ issuer, redirectUri }) {
  const issuerUrl = assertLoopbackUrl(issuer, 'issuer');
  assertLoopbackUrl(redirectUri, 'redirectUri');

  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const signingJwk = await exportJWK(privateKey);
  Object.assign(signingJwk, {
    alg: 'ES256',
    kid: 'aa2-loopback-ephemeral',
    use: 'sig',
  });

  const fixtureStore = createFixtureAdapter();
  const interactionPath = `${issuerUrl.pathname.replace(/\/$/, '')}/interaction`;

  const provider = new Provider(issuerUrl.href.replace(/\/$/, ''), {
    adapter: fixtureStore.Adapter,
    clients: [{
      client_id: LOOPBACK_CLIENT_ID,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      id_token_signed_response_alg: 'ES256',
      response_types: ['code'],
      redirect_uris: [redirectUri],
    }],
    cookies: {
      keys: [randomBytes(32).toString('base64url')],
    },
    features: {
      devInteractions: { enabled: false },
      deviceFlow: { enabled: false },
      introspection: { enabled: false },
      registration: { enabled: false },
      revocation: { enabled: false },
      rpInitiatedLogout: { enabled: false },
      userinfo: { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource: async () => {
          throw new errors.InvalidTarget('resource parameter is required');
        },
        useGrantedResource: async () => false,
        getResourceServerInfo: async (ctx, resource, client) => {
          if (resource !== LOOPBACK_RESOURCE || client.clientId !== LOOPBACK_CLIENT_ID) {
            throw new errors.InvalidTarget('resource is not registered for this client');
          }
          const requestedScopes = new Set((ctx.oidc.params.scope || '').split(' ').filter(Boolean));
          if (requestedScopes.size > 0
            && (requestedScopes.size !== 1 || !requestedScopes.has(LOOPBACK_SCOPE))) {
            throw new errors.InvalidScope('scope is not allowed for this resource');
          }
          return {
            scope: LOOPBACK_SCOPE,
            audience: LOOPBACK_RESOURCE,
            accessTokenTTL: 600,
            accessTokenFormat: 'jwt',
            jwt: { sign: { alg: 'ES256', kid: signingJwk.kid } },
          };
        },
      },
    },
    findAccount: async (ctx, accountId) => {
      if (accountId !== LOOPBACK_SUBJECT) return undefined;
      return {
        accountId,
        async claims() {
          return { sub: accountId };
        },
      };
    },
    interactions: {
      url: (ctx, interaction) => `${interactionPath}/${interaction.uid}`,
    },
    extraTokenClaims: async (ctx, token) => {
      if (ctx.oidc.body?.resource !== LOOPBACK_RESOURCE) {
        throw new errors.InvalidTarget('resource parameter is required at the token endpoint');
      }
      if (token.clientId !== LOOPBACK_CLIENT_ID || token.accountId !== LOOPBACK_SUBJECT) {
        throw new errors.InvalidGrant('fixture principal binding failed');
      }
      return { connection_id: LOOPBACK_CONNECTION_ID };
    },
    jwks: { keys: [signingJwk] },
    pkce: { required: () => true },
    responseTypes: ['code'],
    renderError: async (ctx, out) => {
      ctx.status = 400;
      ctx.type = 'application/json';
      ctx.body = { error: out.error || 'invalid_request' };
    },
    scopes: [],
    ttl: {
      AccessToken: 600,
      AuthorizationCode: 300,
      Interaction: 300,
      Grant: 3600,
      Session: 300,
    },
  });

  async function finishInteraction(req, res) {
    const details = await provider.interactionDetails(req, res);
    if (details.prompt?.name === 'login') {
      await provider.interactionFinished(req, res, {
        login: { accountId: LOOPBACK_SUBJECT },
      }, { mergeWithLastSubmission: false });
      return 'login';
    }

    if (details.prompt?.name !== 'consent') {
      throw new errors.InvalidRequest('unexpected fixture interaction prompt');
    }
    const expectedResourceScopes = details.prompt?.details?.missingResourceScopes;
    const requested = expectedResourceScopes?.[LOOPBACK_RESOURCE];
    if (!Array.isArray(requested) || !requested.includes(LOOPBACK_SCOPE)) {
      throw new errors.InvalidScope('fixture interaction received an unexpected scope');
    }

    const grant = new provider.Grant({
      accountId: LOOPBACK_SUBJECT,
      clientId: LOOPBACK_CLIENT_ID,
    });
    grant.addResourceScope(LOOPBACK_RESOURCE, LOOPBACK_SCOPE);

    await provider.interactionFinished(req, res, {
      consent: { grantId: await grant.save() },
    }, { mergeWithLastSubmission: true });
    return 'consent';
  }

  const providerHandler = provider.callback();
  async function nodeHandler(req, res) {
    if (req.method === 'POST' && new URL(req.url, issuerUrl).pathname === '/token') {
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
      const body = parseQueryString(Buffer.concat(chunks).toString('utf8'));
      if (body.resource !== LOOPBACK_RESOURCE) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_target' }));
        return;
      }
      const replay = new PassThrough();
      replay.method = req.method;
      replay.url = req.url;
      replay.headers = req.headers;
      replay.rawHeaders = req.rawHeaders;
      replay.httpVersion = req.httpVersion;
      replay.httpVersionMajor = req.httpVersionMajor;
      replay.httpVersionMinor = req.httpVersionMinor;
      replay.socket = req.socket;
      replay.connection = req.connection;
      replay.push(Buffer.concat(chunks));
      replay.push(null);
      providerHandler(replay, res);
      return;
    }
    providerHandler(req, res);
  }

  return {
    provider,
    finishInteraction,
    fixtureStore,
    interactionPath,
    nodeHandler,
  };
}
