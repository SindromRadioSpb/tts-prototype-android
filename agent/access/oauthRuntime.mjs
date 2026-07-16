import { createHash, randomBytes } from 'node:crypto';

import consentModule from './consentCeremony.js';
import capabilityModule from './capabilities.js';
import oauthContracts from './oauthContracts.js';
import deploymentContracts from './oauthDeploymentContracts.js';
import { createB0ProviderAdapter } from './oidcB0Adapter.mjs';
import { createOidcDeployment } from './oidcDeployment.mjs';
import { loadSigningJwksFromJson } from './oauthSigningKeys.mjs';

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function redirect(res, location) { res.statusCode = 303; res.setHeader('location', location); res.end(); }
function pairKey(clientId, req) { return `pair_${createHash('sha256').update(`${clientId}\0${String(req.socket?.remoteAddress || '')}`).digest('hex')}`; }

export async function createDefaultOffOAuthRuntime({
  repo,
  consentCeremony,
  interactionBridge,
  resolveUser,
  privateJwksJson,
  cookieKeys,
  audit,
  limiter,
  allowLoopbackFixture = false,
  fixtureIssuer,
}) {
  if (!repo || typeof repo.ensureSubjectForUser !== 'function' || typeof repo.providerPrincipal !== 'function') fail('AA_OAUTH_RUNTIME_REPO_INVALID');
  if (!consentCeremony || !interactionBridge || typeof resolveUser !== 'function' || !limiter || typeof limiter.take !== 'function') fail('AA_OAUTH_RUNTIME_DEPENDENCY_INVALID');
  if (!Array.isArray(cookieKeys) || cookieKeys.length < 1) fail('AA_OAUTH_COOKIE_KEYS_REQUIRED');
  const keyset = await loadSigningJwksFromJson(privateJwksJson);
  const b0 = createB0ProviderAdapter({ repo });
  let issuer = deploymentContracts.ISSUER;
  if (allowLoopbackFixture === true) {
    const candidate = new URL(String(fixtureIssuer || ''));
    if (candidate.protocol !== 'http:' || candidate.hostname !== '127.0.0.1' || candidate.username || candidate.password || candidate.search || candidate.hash) fail('AA_OAUTH_FIXTURE_ISSUER_INVALID');
    issuer = candidate.href.replace(/\/$/, '');
  }
  let deployment;

  async function findAccount(requestContext, accountId) {
    const subject = await repo.userForSubject(accountId);
    if (!subject) return undefined;
    return { accountId, async claims() { return { sub: accountId }; } };
  }

  async function principalForToken(token) {
    const scopes = String(token.scope || '').split(' ').filter(Boolean);
    const snapshot = await repo.providerPrincipal(token.accountId, token.clientId, token.grantId, scopes);
    return { subject: snapshot.subject_id, client_id: snapshot.oauth_client_id, connection_id: snapshot.connection_id, security_epoch: snapshot.security_epoch, subject_epoch: snapshot.subject_epoch };
  }

  deployment = createOidcDeployment({
    issuer,
    privateJwks: keyset.private_jwks,
    cookieKeys,
    Adapter: b0.Adapter,
    clients: deploymentContracts.FIXTURE_CLIENTS,
    findAccount,
    interactionUrl: (requestContext, interaction) => `${issuer}/interaction/${interaction.uid}`,
    principalForToken,
    protocolPreflight: async ({ route_class: routeClass, form }) => {
      const clientId = typeof form.client_id === 'string' ? form.client_id : '';
      const context = await repo.providerCredentialContext(form);
      const dimensions = {};
      if (clientId) dimensions.client = clientId;
      if (context?.connection_id && routeClass === 'token') dimensions.connection = context.connection_id;
      if (context?.user_id && routeClass === 'revocation') dimensions.user = context.user_id;
      if (!Object.keys(dimensions).length) dimensions.client = 'unknown-client';
      return limiter.take(routeClass, dimensions);
    },
  });

  async function initialInteraction(req, res, uid) {
    const user = await resolveUser(req, res);
    if (!user) return;
    const details = await deployment.provider.interactionDetails(req, res);
    if (details.uid !== uid) fail('AA_OAUTH_INTERACTION_BINDING_INVALID');
    const clientId = oauthContracts.safeId(details.params.client_id);
    const client = await repo.loadClientForAuthorization(clientId);
    const quota = limiter.take('interaction', { client: clientId, user: user.id });
    if (!quota.ok) {
      res.statusCode = 429;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'AA_OAUTH_RATE_LIMITED' }));
      return;
    }
    if (details.prompt.name === 'login') {
      const subject = await repo.ensureSubjectForUser(user.id);
      await deployment.provider.interactionFinished(req, res, { login: { accountId: subject.subject_id } }, { mergeWithLastSubmission: false });
      return;
    }
    if (details.prompt.name !== 'consent') fail('AA_OAUTH_INTERACTION_PROMPT_INVALID');
    const subject = await repo.ensureSubjectForUser(user.id);
    if (details.session?.accountId !== subject.subject_id) fail('AA_OAUTH_INTERACTION_USER_BINDING_INVALID');
    if (details.params.resource !== deploymentContracts.RESOURCE || details.params.code_challenge_method !== 'S256') fail('AA_OAUTH_INTERACTION_PROTOCOL_INVALID');
    const scopes = oauthContracts.scopes(String(details.params.scope || '').split(' ').filter(Boolean));
    const existing = interactionBridge.findOpen(user.id, uid);
    if (existing) { redirect(res, existing.consent_path); return; }
    const connectionId = `ac_${randomBytes(10).toString('hex')}`;
    await repo.createPendingConnection(user.id, {
      connection_id: connectionId,
      oauth_client_id: clientId,
      display_label: client.display_name,
      consent_version: consentModule.CONSENT_VERSION,
      capability_version: capabilityModule.CAPABILITY_VERSION,
      retention_notice_version: consentModule.RETENTION_NOTICE_VERSION,
    });
    const requestId = consentModule.opaqueRequestId();
    const expiresAt = new Date(Date.now() + deploymentContracts.TTL.interaction_seconds * 1000).toISOString();
    const staged = await interactionBridge.stage(user.id, {
      request_id: requestId,
      interaction_uid: uid,
      pair_key: pairKey(clientId, req),
      consent_request: {
        request_id: requestId,
        oauth_client_id: clientId,
        client_display_name: client.display_name,
        redirect_uri: details.params.redirect_uri,
        resource_uri: details.params.resource,
        requested_scopes: scopes,
        pkce_method: details.params.code_challenge_method,
        connection_id: connectionId,
        consent_version: consentModule.CONSENT_VERSION,
        capability_version: capabilityModule.CAPABILITY_VERSION,
        retention_notice_version: consentModule.RETENTION_NOTICE_VERSION,
        expires_at: expiresAt,
      },
    });
    audit?.record({ event_type: 'interaction_staged', route_class: 'interaction', result_code: 'consent_required', oauth_client_id: clientId, scopes, connection_id: connectionId, request_id: requestId, rate_dimension: 'none', kid: keyset.active_kid });
    redirect(res, staged.consent_path);
  }

  async function completeInteraction(req, res, uid, requestId) {
    const user = await resolveUser(req, res);
    if (!user) return;
    const details = await deployment.provider.interactionDetails(req, res);
    const decision = interactionBridge.takeDecision(user.id, requestId, uid);
    if (details.uid && details.uid !== uid) fail('AA_OAUTH_INTERACTION_UID_INVALID');
    if (details.params.client_id !== decision.oauth_client_id) fail('AA_OAUTH_INTERACTION_CLIENT_INVALID');
    if (decision.decision === 'denied') {
      await deployment.provider.interactionFinished(req, res, { error: 'access_denied', error_description: 'The resource owner denied the request' }, { mergeWithLastSubmission: false });
      return;
    }
    const subject = await repo.ensureSubjectForUser(user.id);
    const grant = new deployment.provider.Grant({ accountId: subject.subject_id, clientId: decision.oauth_client_id, jti: decision.connection_id });
    grant.addResourceScope(deploymentContracts.RESOURCE, decision.requested_scopes.join(' '));
    const grantId = await grant.save();
    await deployment.provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true });
  }

  async function nodeHandler(req, res) {
    const original = new URL(req.originalUrl || req.url, deploymentContracts.CANONICAL_ORIGIN);
    const match = original.pathname.match(/^\/oauth\/interaction\/([A-Za-z0-9_-]{1,96})(\/complete)?$/);
    if (match) {
      if (match[2]) {
        const requestId = original.searchParams.get('request_id');
        if (!requestId) fail('AA_OAUTH_BRIDGE_NOT_FOUND');
        return completeInteraction(req, res, match[1], requestId);
      }
      return initialInteraction(req, res, match[1]);
    }
    return deployment.nodeHandler(req, res);
  }

  return Object.freeze({ nodeHandler, provider: deployment.provider, keyset, bridge: interactionBridge, b0 });
}
