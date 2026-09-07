const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const Store = require('../public/js/media-stream-store.js');

function memoryOpfs() {
  const files = new Map();
  return {
    files,
    async getDirectoryHandle() {
      return {
        async getFileHandle(name, options = {}) {
          if (!options.create && !files.has(name)) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
          if (!files.has(name)) files.set(name, Buffer.alloc(0));
          return {
            async createWritable(options = {}) {
              let bytes = options.keepExistingData ? Buffer.from(files.get(name)) : Buffer.alloc(0), position = 0;
              return {
                async write(chunk) {
                  chunk = Buffer.from(chunk);
                  const next = Buffer.alloc(Math.max(bytes.length, position + chunk.length));
                  bytes.copy(next); chunk.copy(next, position); bytes = next; position += chunk.length;
                },
                async seek(value) { position = value; },
                async close() { files.set(name, bytes); },
                async abort() { bytes = Buffer.alloc(0); },
              };
            },
            async getFile() {
              const bytes = files.get(name);
              return { size: bytes.length, stream: () => new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) };
            },
          };
        },
        async removeEntry(name) { files.delete(name); },
      };
    },
  };
}

function hasher() {
  const h = crypto.createHash('sha256');
  return { init() {}, update(value) { h.update(value); }, digest() { return h.digest('hex'); } };
}

test('streams chunks to partial, verifies worker SHA, then promotes without a full response buffer', async () => {
  const root = memoryOpfs();
  const chunks = [Buffer.from('abc'), Buffer.from('def'), Buffer.from('ghi')];
  const expected = crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
  const response = new Response(new ReadableStream({
    pull(controller) { const chunk = chunks.shift(); chunk ? controller.enqueue(chunk) : controller.close(); },
  }), { headers: { 'content-length': '9', 'content-type': 'video/mp4', 'x-lp-media-sha256': expected } });
  const out = await Store.streamToOpfs({ response, fileName: 'remote.mp4', expectedSha256: expected,
    expectedSize: 9, root, hasherFactory: async () => hasher() });
  assert.equal(out.sha256, expected);
  assert.equal(root.files.get('remote.mp4').toString(), 'abcdefghi');
  assert.equal([...root.files.keys()].some(name => name.endsWith('.partial')), false);
});

test('hash mismatch removes partial and never promotes a complete-looking file', async () => {
  const root = memoryOpfs();
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(Buffer.from('bad')); c.close(); } }),
    { headers: { 'content-length': '3' } });
  await assert.rejects(() => Store.streamToOpfs({ response, fileName: 'remote.mp4', expectedSha256: '0'.repeat(64),
    expectedSize: 3, root, hasherFactory: async () => hasher() }), /HASH_MISMATCH/);
  assert.equal(root.files.has('remote.mp4'), false);
  assert.equal(root.files.size, 0);
});

test('crossing the hard byte ceiling aborts and cleans partial data', async () => {
  const root = memoryOpfs();
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(Buffer.alloc(11)); c.close(); } }));
  await assert.rejects(() => Store.streamToOpfs({ response, fileName: 'remote.mp4', expectedSize: null,
    expectedSha256: crypto.createHash('sha256').update(Buffer.alloc(11)).digest('hex'),
    maxBytes: 10, root, hasherFactory: async () => hasher() }), /SIZE_LIMIT/);
  assert.equal(root.files.size, 0);
});

test('interrupted transfer resumes the committed prefix and hashes the complete file', async () => {
  const root = memoryOpfs(), bytes = Buffer.from('abcdefghij');
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const jobId = 'rma_' + 'a'.repeat(32), requestedOffsets = [];
  const options = { root, fileName: 'verified.mp4', jobId, expectedSize: bytes.length,
    expectedSha256: sha, mimeType: 'video/mp4', hasherFactory: async () => hasher(), checkpointBytes: 3 };
  await assert.rejects(() => Store.downloadToOpfs({ ...options, fetchResponse: async offset => {
    requestedOffsets.push(offset); let calls = 0;
    return new Response(new ReadableStream({ pull(controller) {
      if (!calls++) controller.enqueue(bytes.subarray(0, 4));
      else controller.error(new TypeError('network interrupted'));
    } }), { headers: { 'content-length': '10', etag: '"' + sha + '"', 'x-lp-media-sha256': sha } });
  } }), /network interrupted/);
  assert.equal(root.files.has('verified.mp4'), false);
  assert.equal([...root.files.values()][0].toString(), 'abcd');
  const result = await Store.downloadToOpfs({ ...options, fetchResponse: async offset => {
    requestedOffsets.push(offset);
    return new Response(bytes.subarray(offset), { status: 206, headers: { 'content-length': String(bytes.length - offset),
      'content-range': `bytes ${offset}-9/10`, etag: '"' + sha + '"', 'x-lp-media-sha256': sha } });
  } });
  assert.deepEqual(requestedOffsets, [0, 4]);
  assert.equal(result.sha256, sha);
  assert.deepEqual(root.files.get('verified.mp4'), bytes);
  assert.equal(root.files.size, 1);
  await Store.downloadToOpfs({ ...options, fetchResponse: async () => { throw new Error('must reuse verified local bytes'); } });
});

test('a changed server artifact cannot be appended to a partial and destroys only that partial', async () => {
  const root = memoryOpfs(), sha = 'a'.repeat(64), jobId = 'rma_' + 'b'.repeat(32);
  root.files.set(`.${jobId}.${sha}.partial`, Buffer.from('abc'));
  root.files.set('unrelated.mp4', Buffer.from('keep'));
  await assert.rejects(() => Store.downloadToOpfs({ root, jobId, fileName: 'target.mp4', expectedSize: 6,
    expectedSha256: sha, hasherFactory: async () => hasher(), fetchResponse: async () => new Response('def', {
      status: 206, headers: { 'content-length': '3', 'content-range': 'bytes 3-5/6', etag: '"changed"', 'x-lp-media-sha256': sha },
    }) }), /RANGE_IDENTITY_MISMATCH/);
  assert.deepEqual([...root.files.keys()], ['unrelated.mp4']);
});

test('tampered persisted prefix is rehashed and never promoted', async () => {
  const root = memoryOpfs(), sha = crypto.createHash('sha256').update('abcdef').digest('hex'), jobId = 'rma_' + 'c'.repeat(32);
  root.files.set(`.${jobId}.${sha}.partial`, Buffer.from('BAD'));
  await assert.rejects(() => Store.downloadToOpfs({ root, jobId, fileName: 'target.mp4', expectedSize: 6,
    expectedSha256: sha, hasherFactory: async () => hasher(), fetchResponse: async () => new Response('def', {
      status: 206, headers: { 'content-length': '3', 'content-range': 'bytes 3-5/6', etag: '"' + sha + '"', 'x-lp-media-sha256': sha },
    }) }), /HASH_MISMATCH/);
  assert.equal(root.files.size, 0);
});
