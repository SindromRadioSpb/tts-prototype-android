const EXACT_FIELDS = Object.freeze({
  AccessToken: null,
  Client: new Set(['clientId', 'clientName', 'redirectUris', 'tokenEndpointAuthMethod', 'grantTypes', 'responseTypes', 'idTokenSignedResponseAlg']),
  Grant: new Set(['accountId', 'clientId', 'resources', 'exp', 'iat', 'jti', 'kind']),
  AuthorizationCode: new Set(['accountId', 'authTime', 'clientId', 'codeChallenge', 'codeChallengeMethod', 'exp', 'expiresWithSession', 'grantId', 'iat', 'jti', 'kind', 'redirectUri', 'resource', 'scope', 'sessionUid']),
  RefreshToken: new Set(['accountId', 'authTime', 'clientId', 'exp', 'expiresWithSession', 'grantId', 'gty', 'iat', 'iiat', 'jti', 'kind', 'resource', 'rotations', 'scope', 'sessionUid']),
  Interaction: null,
  Session: null,
});

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function clone(value) { return value === undefined ? undefined : structuredClone(value); }

function closedModelPayload(model, payload) {
  const allowed = EXACT_FIELDS[model];
  if (!allowed) return;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('AA_OAUTH_PROVIDER_PAYLOAD_INVALID');
  if (Object.keys(payload).some((key) => !allowed.has(key))) fail('AA_OAUTH_PROVIDER_MODEL_DRIFT');
}

export function createB0ProviderAdapter({ repo, now = () => new Date().toISOString(), maxEphemeral = 100 } = {}) {
  const required = ['providerClientMetadata', 'providerGrant', 'validateProviderGrant', 'revokeProviderGrant', 'storeProviderAuthorizationCode', 'findProviderAuthorizationCode', 'consumeProviderAuthorizationCode', 'destroyProviderAuthorizationCode', 'storeInitialProviderRefreshToken', 'prepareProviderRefreshRotation', 'completeProviderRefreshRotation', 'findProviderRefreshToken', 'revokeProviderRefreshByGrant', 'revokeProviderRefreshToken'];
  if (!repo || required.some((name) => typeof repo[name] !== 'function')) fail('AA_OAUTH_PROVIDER_REPO_INVALID');
  const ephemeral = new Map();
  const pendingRotations = new Map();

  function prune() {
    const at = Date.now();
    for (const [key, row] of ephemeral) if (row.expires_at <= at) ephemeral.delete(key);
    for (const [key, row] of pendingRotations) if (row.expires_at <= at) pendingRotations.delete(key);
  }
  function ephemeralKey(model, id) { return `${model}:${id}`; }

  class B0ProviderAdapter {
    constructor(model) {
      if (!Object.prototype.hasOwnProperty.call(EXACT_FIELDS, model)) fail('AA_OAUTH_PROVIDER_MODEL_UNAPPROVED');
      this.model = model;
    }

    async upsert(id, payload, expiresIn) {
      if (this.model === 'AccessToken') fail('AA_OAUTH_ACCESS_TOKEN_PERSISTENCE_FORBIDDEN');
      closedModelPayload(this.model, payload);
      if (this.model === 'Client') {
        const stored = await repo.providerClientMetadata(id);
        if (JSON.stringify(stored) !== JSON.stringify(payload)) fail('AA_OAUTH_PROVIDER_CLIENT_DRIFT');
        return;
      }
      if (this.model === 'Grant') {
        if (id !== payload.jti || id.length > 24) fail('AA_OAUTH_PROVIDER_GRANT_ID');
        await repo.validateProviderGrant(id, payload);
        return;
      }
      if (this.model === 'AuthorizationCode') return repo.storeProviderAuthorizationCode(id, payload);
      if (this.model === 'RefreshToken') {
        prune();
        const pending = pendingRotations.get(payload.grantId);
        if (pending) {
          pendingRotations.delete(payload.grantId);
          return repo.completeProviderRefreshRotation(pending.previous, id, payload, now());
        }
        return repo.storeInitialProviderRefreshToken(id, payload);
      }
      prune();
      const key = ephemeralKey(this.model, id);
      if (!ephemeral.has(key) && ephemeral.size >= maxEphemeral) fail('AA_OAUTH_PROVIDER_EPHEMERAL_CAPACITY');
      ephemeral.set(key, { payload: clone(payload), expires_at: Date.now() + Math.min(Number(expiresIn) || 600, 600) * 1000 });
    }

    async find(id) {
      if (this.model === 'AccessToken') return undefined;
      if (this.model === 'Client') return repo.providerClientMetadata(id).catch(() => undefined);
      if (this.model === 'Grant') return (await repo.providerGrant(id)) || undefined;
      if (this.model === 'AuthorizationCode') return (await repo.findProviderAuthorizationCode(id)) || undefined;
      if (this.model === 'RefreshToken') return (await repo.findProviderRefreshToken(id)) || undefined;
      prune();
      return clone(ephemeral.get(ephemeralKey(this.model, id))?.payload);
    }

    async findByUid(uid) {
      if (this.model !== 'Session') return undefined;
      prune();
      for (const row of ephemeral.values()) if (row.payload?.uid === uid) return clone(row.payload);
      return undefined;
    }

    async destroy(id) {
      if (this.model === 'AccessToken') return;
      if (this.model === 'Grant') return repo.revokeProviderGrant(id, 'PROVIDER_GRANT_DESTROY', now());
      if (this.model === 'AuthorizationCode') return repo.destroyProviderAuthorizationCode(id, now());
      if (this.model === 'RefreshToken') return repo.revokeProviderRefreshToken(id, now());
      if (this.model === 'Client') return;
      ephemeral.delete(ephemeralKey(this.model, id));
    }

    async consume(id) {
      if (this.model === 'AuthorizationCode') return repo.consumeProviderAuthorizationCode(id, now());
      if (this.model === 'RefreshToken') {
        prune();
        if (pendingRotations.size >= maxEphemeral) fail('AA_OAUTH_PROVIDER_ROTATION_CONFLICT');
        const previous = await repo.prepareProviderRefreshRotation(id, now());
        if (pendingRotations.has(previous.connection_id)) fail('AA_OAUTH_PROVIDER_ROTATION_CONFLICT');
        pendingRotations.set(previous.connection_id, { previous, expires_at: Date.now() + 600000 });
        return;
      }
      const row = ephemeral.get(ephemeralKey(this.model, id));
      if (row) row.payload.consumed = Math.floor(Date.now() / 1000);
    }

    async revokeByGrantId(grantId) {
      if (this.model === 'AccessToken') return;
      if (this.model === 'RefreshToken') return repo.revokeProviderRefreshByGrant(grantId, 'PROVIDER_GRANT_REVOKE', now());
      if (this.model === 'Grant') return repo.revokeProviderGrant(grantId, 'PROVIDER_GRANT_REVOKE', now());
      if (this.model === 'AuthorizationCode') return;
      for (const [key, row] of ephemeral) if (row.payload?.grantId === grantId) ephemeral.delete(key);
    }
  }

  return Object.freeze({ Adapter: B0ProviderAdapter, ephemeralSize: () => { prune(); return ephemeral.size; }, pendingRotationCount: () => { prune(); return pendingRotations.size; } });
}
