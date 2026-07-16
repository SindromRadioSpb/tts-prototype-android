const GRANTABLE_MODELS = new Set([
  'AccessToken',
  'AuthorizationCode',
  'RefreshToken',
  'DeviceCode',
  'BackchannelAuthenticationRequest',
]);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function createFixtureAdapter() {
  const records = new Map();
  const grantIndex = new Map();
  const sessionUidIndex = new Map();
  const userCodeIndex = new Map();
  const models = new Set();
  const fields = new Map();

  const keyFor = (model, id) => `${model}:${id}`;
  const liveRecord = (key) => {
    const record = records.get(key);
    if (!record) return undefined;
    if (record.expiresAt !== null && record.expiresAt <= Date.now()) {
      records.delete(key);
      return undefined;
    }
    return record;
  };

  class FixtureAdapter {
    constructor(model) {
      this.model = model;
      models.add(model);
    }

    async upsert(id, payload, expiresIn) {
      fields.set(this.model, new Set([...(fields.get(this.model) || []), ...Object.keys(payload || {})]));
      const key = keyFor(this.model, id);
      const expiresAt = Number.isFinite(expiresIn)
        ? Date.now() + (expiresIn * 1000)
        : null;

      records.set(key, { payload: clone(payload), expiresAt });

      if (this.model === 'Session' && payload.uid) {
        sessionUidIndex.set(payload.uid, id);
      }

      if (payload.userCode) userCodeIndex.set(payload.userCode, id);
      if (GRANTABLE_MODELS.has(this.model) && payload.grantId) {
        const keys = grantIndex.get(payload.grantId) || new Set();
        keys.add(key);
        grantIndex.set(payload.grantId, keys);
      }
    }

    async find(id) {
      return clone(liveRecord(keyFor(this.model, id))?.payload);
    }

    async findByUid(uid) {
      const id = sessionUidIndex.get(uid);
      return id ? this.find(id) : undefined;
    }

    async findByUserCode(userCode) {
      const id = userCodeIndex.get(userCode);
      return id ? this.find(id) : undefined;
    }

    async destroy(id) {
      records.delete(keyFor(this.model, id));
    }

    async consume(id) {
      const record = liveRecord(keyFor(this.model, id));
      if (record) record.payload.consumed = Math.floor(Date.now() / 1000);
    }

    async revokeByGrantId(grantId) {
      const keys = grantIndex.get(grantId);
      if (!keys) return;
      for (const key of keys) records.delete(key);
      grantIndex.delete(grantId);
    }
  }

  return {
    Adapter: FixtureAdapter,
    snapshot() {
      const counts = {};
      for (const key of records.keys()) {
        const model = key.slice(0, key.indexOf(':'));
        if (liveRecord(key)) counts[model] = (counts[model] || 0) + 1;
      }
      return {
        models: [...models].sort(),
        counts,
      };
    },
    schema() {
      return Object.fromEntries([...fields].sort(([a], [b]) => a.localeCompare(b)).map(([model, names]) => [model, [...names].sort()]));
    },
    clear() {
      records.clear();
      grantIndex.clear();
      sessionUidIndex.clear();
      userCodeIndex.clear();
      models.clear();
      fields.clear();
    },
  };
}
