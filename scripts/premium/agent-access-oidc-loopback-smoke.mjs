import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';

import {
  createLocalJWKSet,
  createRemoteJWKSet,
  exportJWK,
  generateKeyPair,
  jwtVerify,
} from 'jose';

import {
  createOidcLoopback,
  LOOPBACK_CLIENT_ID,
  LOOPBACK_CONNECTION_ID,
  LOOPBACK_RESOURCE,
  LOOPBACK_SCOPE,
  LOOPBACK_SUBJECT,
} from '../../agent/access/oidcLoopback.mjs';

const redirect = 'manual';
const state = 'fixture-state-aa2';
const defaultResource = Symbol('default-resource');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

class CookieJar {
  #cookies = new Map();

  absorb(response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';', 1);
      const separator = pair.indexOf('=');
      this.#cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  header() {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

function challengeFor(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function authorizationUrl(metadata, redirectUri, verifier, overrides = {}) {
  const url = new URL(metadata.authorization_endpoint);
  const params = {
    client_id: LOOPBACK_CLIENT_ID,
    code_challenge: challengeFor(verifier),
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    resource: LOOPBACK_RESOURCE,
    response_type: 'code',
    scope: LOOPBACK_SCOPE,
    state,
    ...overrides,
  };
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }
  return url;
}

async function request(url, jar, init = {}) {
  const headers = new Headers(init.headers);
  const cookie = jar?.header();
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(url, { ...init, headers, redirect });
  jar?.absorb(response);
  return response;
}

function redirectedError(response, expected) {
  assert.ok([302, 303].includes(response.status), `expected redirect, got ${response.status}`);
  const location = new URL(response.headers.get('location'));
  const fragment = new URLSearchParams(location.hash.slice(1));
  assert.equal(
    location.searchParams.get('error') || fragment.get('error'),
    expected,
    `unexpected redirect: ${location.pathname}`,
  );
  return location;
}

async function authorize(metadata, redirectUri, verifier, overrides = {}) {
  const jar = new CookieJar();
  let response = await request(authorizationUrl(metadata, redirectUri, verifier, overrides), jar);

  for (let step = 0; step < 6; step += 1) {
    if (![302, 303].includes(response.status)) {
      const body = (await response.text()).replace(/\s+/g, ' ').slice(-800);
      throw new Error(`authorization step ${step} returned ${response.status}: ${body}`);
    }
    const location = new URL(response.headers.get('location'), metadata.issuer);
    if (location.href.startsWith(redirectUri)) {
      assert.equal(location.searchParams.get('state'), state);
      const code = location.searchParams.get('code');
      assert.ok(code, 'callback did not contain an authorization code');
      return code;
    }
    response = await request(location, jar);
  }
  throw new Error('authorization interaction did not reach the loopback callback');
}

async function redeem(metadata, redirectUri, code, verifier, resource = defaultResource) {
  const body = new URLSearchParams({
    client_id: LOOPBACK_CLIENT_ID,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  if (resource === defaultResource) body.set('resource', LOOPBACK_RESOURCE);
  else if (resource !== null) body.set('resource', resource);
  return fetch(metadata.token_endpoint, {
    method: 'POST',
    redirect,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
}

let dispatch = (req, res) => {
  res.writeHead(503).end();
};
const server = http.createServer((req, res) => dispatch(req, res));
const address = await listen(server);
assert.equal(address.address, '127.0.0.1');
const origin = `http://127.0.0.1:${address.port}`;
const issuer = `${origin}/oidc`;
const clientServer = http.createServer((req, res) => res.writeHead(204).end());
const clientAddress = await listen(clientServer);
assert.equal(clientAddress.address, '127.0.0.1');
const redirectUri = `http://127.0.0.1:${clientAddress.port}/callback`;

try {
  const loopback = await createOidcLoopback({ issuer, redirectUri });
  dispatch = async (req, res) => {
    try {
      const requestUrl = new URL(req.url, origin);
      if (requestUrl.pathname.startsWith(`${loopback.interactionPath}/`)) {
        await loopback.finishInteraction(req, res);
        return;
      }
      if (!requestUrl.pathname.startsWith('/oidc/')) {
        res.writeHead(404).end();
        return;
      }
      req.originalUrl = req.url;
      req.url = req.url.slice('/oidc'.length) || '/';
      loopback.nodeHandler(req, res);
    } catch (error) {
      res.writeHead(error.statusCode || 500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error.error || 'fixture_failure' }));
    }
  };

  const metadataResponse = await fetch(`${issuer}/.well-known/oauth-authorization-server`);
  assert.equal(metadataResponse.status, 200);
  const metadata = await metadataResponse.json();
  assert.equal(metadata.issuer, issuer);
  assert.equal(metadata.authorization_endpoint, `${issuer}/auth`);
  assert.equal(metadata.token_endpoint, `${issuer}/token`);
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  assert.ok(metadata.grant_types_supported.includes('authorization_code'));
  assert.deepEqual(metadata.response_types_supported, ['code']);
  for (const prohibited of ['implicit', 'password', 'client_credentials', 'refresh_token']) {
    assert.equal(
      metadata.grant_types_supported.includes(prohibited),
      false,
      `unexpected advertised grant: ${prohibited}; ${metadata.grant_types_supported.join(',')}`,
    );
  }

  const verifier = randomBytes(48).toString('base64url');
  const code = await authorize(metadata, redirectUri, verifier);
  const tokenResponse = await redeem(metadata, redirectUri, code, verifier);
  assert.equal(tokenResponse.status, 200);
  const token = await tokenResponse.json();
  assert.equal(token.token_type, 'Bearer');
  assert.equal(token.scope, LOOPBACK_SCOPE);
  assert.equal(token.expires_in, 600);
  assert.equal(token.refresh_token, undefined);

  const verified = await jwtVerify(
    token.access_token,
    createRemoteJWKSet(new URL(metadata.jwks_uri)),
    { issuer, audience: LOOPBACK_RESOURCE, algorithms: ['ES256'] },
  );
  assert.equal(verified.payload.sub, LOOPBACK_SUBJECT);
  assert.equal(verified.payload.client_id, LOOPBACK_CLIENT_ID);
  assert.equal(verified.payload.connection_id, LOOPBACK_CONNECTION_ID);
  assert.equal(verified.payload.scope, LOOPBACK_SCOPE);
  assert.equal(typeof verified.payload.jti, 'string');
  assert.equal(typeof verified.payload.iat, 'number');
  assert.equal(typeof verified.payload.exp, 'number');
  assert.ok(verified.payload.exp - verified.payload.iat <= 600);

  await assert.rejects(
    jwtVerify(token.access_token, createRemoteJWKSet(new URL(metadata.jwks_uri)), {
      issuer: `${issuer}/wrong`,
      audience: LOOPBACK_RESOURCE,
      algorithms: ['ES256'],
    }),
  );
  await assert.rejects(
    jwtVerify(token.access_token, createRemoteJWKSet(new URL(metadata.jwks_uri)), {
      issuer,
      audience: 'https://wrong.fixture.invalid/audience',
      algorithms: ['ES256'],
    }),
  );
  const { publicKey: wrongPublicKey } = await generateKeyPair('ES256', { extractable: true });
  const wrongJwk = await exportJWK(wrongPublicKey);
  Object.assign(wrongJwk, { alg: 'ES256', kid: 'wrong-fixture-key', use: 'sig' });
  await assert.rejects(
    jwtVerify(token.access_token, createLocalJWKSet({ keys: [wrongJwk] }), {
      issuer,
      audience: LOOPBACK_RESOURCE,
      algorithms: ['ES256'],
    }),
  );

  const replay = await redeem(metadata, redirectUri, code, verifier);
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).error, 'invalid_grant');

  const wrongVerifier = randomBytes(48).toString('base64url');
  const verifierBoundCode = await authorize(metadata, redirectUri, verifier);
  const wrongVerifierResponse = await redeem(metadata, redirectUri, verifierBoundCode, wrongVerifier);
  assert.equal(wrongVerifierResponse.status, 400);
  assert.equal((await wrongVerifierResponse.json()).error, 'invalid_grant');

  const wrongResourceCode = await authorize(metadata, redirectUri, verifier);
  const wrongResource = await redeem(
    metadata,
    redirectUri,
    wrongResourceCode,
    verifier,
    'https://wrong.fixture.invalid/resource',
  );
  assert.equal(wrongResource.status, 400);
  assert.equal((await wrongResource.json()).error, 'invalid_target');

  const omittedTokenResourceCode = await authorize(metadata, redirectUri, verifier);
  const omittedTokenResource = await redeem(
    metadata,
    redirectUri,
    omittedTokenResourceCode,
    verifier,
    null,
  );
  assert.equal(omittedTokenResource.status, 400);
  assert.equal((await omittedTokenResource.json()).error, 'invalid_target');

  const missingPkce = authorizationUrl(metadata, redirectUri, verifier, {
    code_challenge: undefined,
    code_challenge_method: undefined,
  });
  redirectedError(await request(missingPkce, new CookieJar()), 'invalid_request');

  const plainPkce = authorizationUrl(metadata, redirectUri, verifier, {
    code_challenge: verifier,
    code_challenge_method: 'plain',
  });
  redirectedError(await request(plainPkce, new CookieJar()), 'invalid_request');

  const unknownScope = authorizationUrl(metadata, redirectUri, verifier, {
    scope: 'mastery.write',
  });
  redirectedError(await request(unknownScope, new CookieJar()), 'invalid_scope');

  const missingResource = authorizationUrl(metadata, redirectUri, verifier, { resource: undefined });
  redirectedError(await request(missingResource, new CookieJar()), 'invalid_target');

  const wrongRedirect = authorizationUrl(metadata, redirectUri, verifier, {
    redirect_uri: `${origin}/not-registered`,
  });
  const wrongRedirectResponse = await request(wrongRedirect, new CookieJar());
  assert.equal(wrongRedirectResponse.status, 400);
  assert.equal(wrongRedirectResponse.headers.get('location'), null);

  const unknownClient = authorizationUrl(metadata, redirectUri, verifier, {
    client_id: 'unregistered-fixture-client',
  });
  const unknownClientResponse = await request(unknownClient, new CookieJar());
  assert.equal(unknownClientResponse.status, 400);
  assert.equal((await unknownClientResponse.json()).error, 'invalid_client');

  const unsupportedResponse = authorizationUrl(metadata, redirectUri, verifier, {
    response_type: 'token',
  });
  redirectedError(await request(unsupportedResponse, new CookieJar()), 'unsupported_response_type');

  const unsupportedGrant = await fetch(metadata.token_endpoint, {
    method: 'POST',
    redirect,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: LOOPBACK_CLIENT_ID,
      grant_type: 'client_credentials',
      resource: LOOPBACK_RESOURCE,
    }),
  });
  assert.equal(unsupportedGrant.status, 400);
  assert.equal((await unsupportedGrant.json()).error, 'unsupported_grant_type');

  await assert.rejects(
    authorize(metadata, redirectUri, verifier, { state: 'unexpected-fixture-state' }),
    /Expected values to be strictly equal/,
  );

  const contracts = (await import('../../agent/access/contracts.js')).default;
  assert.throws(
    () => contracts.validateInput('get_learning_brief', { access_token: 'fixture-token' }),
    (error) => error.code === 'UNKNOWN_FIELD',
  );

  const inventory = loopback.fixtureStore.snapshot();
  assert.deepEqual(inventory.models, [
    'AccessToken',
    'AuthorizationCode',
    'Client',
    'Grant',
    'Interaction',
    'Session',
  ]);

  console.log(JSON.stringify({
    status: 'PASS',
    flow: 'authorization_code_pkce_s256',
    issuer: 'http://127.0.0.1:<ephemeral>/oidc',
    resource: LOOPBACK_RESOURCE,
    signing: 'ES256/JWKS verified',
    refreshTokenIssued: false,
    negativeCases: 17,
    adapterModels: inventory.models,
  }));
  loopback.fixtureStore.clear();
  assert.deepEqual(loopback.fixtureStore.snapshot(), { models: [], counts: {} });
} finally {
  await close(clientServer);
  await close(server);
  assert.equal(clientServer.listening, false);
  assert.equal(server.listening, false);
}
