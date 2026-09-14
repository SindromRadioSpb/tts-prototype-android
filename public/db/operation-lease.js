// Serialized statement/transaction lifetime per worker. OPFS additionally
// leases one physical connection per origin; IDB uses SQLite's native VFS
// transaction locks. No tab-owner election, proxy, lock stealing or reload.
export class OperationLease {
  constructor({ locks, lockName, open, close, inTransaction, rollback, onCommit,
    waitMs = 30000, transactionIdleMs = 30000, now = () => Date.now(), requiresExternalLock = () => true,
    keepConnectionOpen = () => false }) {
    Object.assign(this, { locks, lockName, openConnection: open, closeConnection: close,
      inTransaction, rollback, onCommit, waitMs, transactionIdleMs, now, requiresExternalLock, keepConnectionOpen });
    this.queue = Promise.resolve();
    this.release = null;
    this.opened = false;
    this.changed = false;
    this.poisoned = false;
    this.timer = null;
    this.lastTransactionActivity = 0;
    this.openFailure = null;
  }
  error(code) { return Object.assign(new Error(code), { code }); }
  async ensureOpen() {
    if (this.openFailure) throw this.openFailure;
    if (this.opened) return;
    if (!this.locks?.request) throw this.error('DB_COORDINATION_UNSUPPORTED');
    // IndexedDB VFS serializes complete SQLite transactions with its own
    // xLock/xUnlock protocol. OPFS sync handles (and first backend selection)
    // still require exclusive physical ownership outside SQLite.
    if (!this.requiresExternalLock()) {
      try { await this.openConnection(); this.opened = true; }
      catch (error) { this.openFailure = error; await this.close(); throw error; }
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.waitMs);
    try {
      await new Promise((resolve, reject) => {
        this.locks.request(this.lockName, { signal: abort.signal }, () => {
          clearTimeout(timer);
          return new Promise(release => { this.release = release; resolve(); });
        }).catch(error => {
          // A browser/API rejection is not evidence that another client held
          // the lock for 30 seconds. Only our deadline can classify a timeout.
          const code = abort.signal.aborted ? 'DB_LOCK_WAIT_TIMEOUT' : 'DB_LOCK_REQUEST_FAILED';
          const failure = this.error(code);
          failure.cause = error;
          failure.browserError = error?.name || 'Error';
          reject(failure);
        });
      });
      await this.openConnection();
      this.opened = true;
    } catch (e) {
      this.openFailure = e;
      await this.close();
      throw e;
    } finally { clearTimeout(timer); }
  }
  async close() {
    clearTimeout(this.timer);
    // Closing SQLite rolls back an unfinished transaction. Release exclusion
    // only AFTER VFS.close has closed every physical handle.
    try { await this.closeConnection(); }
    catch (error) {
      this.poisoned = true;
      // Keep exclusion when physical closure is unproven. A later explicit
      // close can retry cleanup; queued writes cannot use the half-closed DB.
      throw Object.assign(error, { code: 'DB_STORAGE_CLOSE_FAILED' });
    }
    this.opened = false;
    this.changed = false;
    if (this.release) { this.release(); this.release = null; }
  }
  async abortExpiredTransaction() {
    if (!this.opened || !this.inTransaction() || this.now() - this.lastTransactionActivity < this.transactionIdleMs) return;
    this.poisoned = true;
    await this.rollback();
    await this.close();
  }
  run(operation, { reset = false, retryOpen = false, sql = '' } = {}) {
    const result = this.queue.then(async () => {
      clearTimeout(this.timer);
      if (reset) this.poisoned = false;
      if (this.poisoned) throw this.error('DB_TRANSACTION_ABORTED');
      // Only an explicit init may retry a failed physical open. A lifecycle
      // close must remain possible, but must not revive queued background SQL.
      if (retryOpen) this.openFailure = null;
      if (!reset && this.openFailure) throw this.openFailure;
      if (!reset) await this.abortExpiredTransaction();
      if (this.poisoned) throw this.error('DB_TRANSACTION_ABORTED');
      let value;
      try {
        value = await operation();
        // Conservative invalidation includes DDL and WITH ... writes. False
        // positives refresh catalogues only, never editors or learner state.
        if (sql && !/^\s*(SELECT|PRAGMA|EXPLAIN|BEGIN|SAVEPOINT|RELEASE|COMMIT|END|ROLLBACK)\b/i.test(sql)) this.changed = true;
      } finally {
        if (this.opened && this.inTransaction()) {
          this.lastTransactionActivity = this.now();
          this.timer = setTimeout(() => {
            this.queue = this.queue.then(() => this.abortExpiredTransaction()).catch(() => { this.poisoned = true; });
          }, this.transactionIdleMs);
        } else {
          const committed = this.changed && !/^\s*ROLLBACK\b/i.test(sql);
          // IDB owns no OPFS sync handles: SQLite xUnlock already released its
          // transaction lock. Keep its connection alive instead of reopening
          // the database for every catalogue/SRS statement. OPFS still closes
          // physical handles before releasing its external lease.
          if (!this.opened || !this.keepConnectionOpen()) await this.close();
          else if (this.release) { this.release(); this.release = null; }
          this.changed = false;
          if (committed) this.onCommit?.();
        }
      }
      return value;
    });
    // An async onmessage handler alone does NOT serialize requests.
    this.queue = result.catch(() => {});
    return result;
  }
}
