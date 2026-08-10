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
            async createWritable() {
              let chunks = [];
              return {
                async write(chunk) { chunks.push(Buffer.from(chunk)); },
                async close() { files.set(name, Buffer.concat(chunks)); },
                async abort() { chunks = []; },
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
