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

test('reimport verifies existing bytes and reuses them even without space for another copy', async () => {
  const root=memoryOpfs(), bytes=Buffer.from('verified video');
  const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  root.files.set('existing.mp4',bytes);
  let canceled=false;
  const response=new Response(new ReadableStream({cancel(){canceled=true;}}));
  const out=await Store.streamToOpfs({response,fileName:'existing.mp4',expectedSha256:sha,
    expectedSize:bytes.length,root,storageEstimate:{quota:bytes.length,usage:bytes.length},hasherFactory:async()=>hasher()});
  assert.equal(out.reused,true);
  assert.equal(canceled,true);
  assert.equal(root.files.size,1);
  assert.deepEqual(root.files.get('existing.mp4'),bytes);
});

test('quota preflight reports required and available bytes before creating partial media',async()=>{
 const root=memoryOpfs();
 await assert.rejects(()=>Store.streamToOpfs({response:new Response('abc'),fileName:'quota.mp4',expectedSize:3,
  expectedSha256:crypto.createHash('sha256').update('abc').digest('hex'),root,
  storageEstimate:{quota:100,usage:90},hasherFactory:async()=>hasher()}),error=>{
   assert.equal(error.code,'OPFS_QUOTA_LOW');assert.equal(error.availableBytes,10);
   assert.equal(error.requiredBytes,6+32*1024*1024);return true;
  });
 assert.equal(root.files.size,0);
});

test('same name and size never bypass hash verification; failed replacement preserves existing file', async () => {
  const root=memoryOpfs();root.files.set('existing.mp4',Buffer.from('bad'));
  await assert.rejects(()=>Store.streamToOpfs({response:new Response('bad'),fileName:'existing.mp4',
    expectedSha256:crypto.createHash('sha256').update('new').digest('hex'),expectedSize:3,
    root,hasherFactory:async()=>hasher()}),/HASH_MISMATCH/);
  assert.equal(root.files.get('existing.mp4').toString(),'bad');
  assert.equal(root.files.size,1);
});

test('real bundle reader imports a headerless local stream with size and SHA verification', async () => {
  const IO=require('../public/js/media-bundle-io.js'),Core=require('../public/js/media-bundle-core.js');
  const payload=Buffer.from('hebrew-video-fixture'),sha=crypto.createHash('sha256').update(payload).digest('hex');
  const manifest=Core.buildBundleManifest({package:{name:'learning.zip',size_bytes:2,sha256:'a'.repeat(64)},
    media:{sha256:sha,size_bytes:payload.length,mime:'video/mp4',rendition:'lite',canonical_sha256:'b'.repeat(64),duration_seconds:12}});
  const chunks=[];
  await IO.writeBundle({manifest,writable:{async write(chunk){chunks.push(chunk);},async close(){}},
    sources:{[manifest.package.entry]:new Blob(['PK']),[manifest.media.entry]:new Blob([payload])}});
  const file=new Blob(chunks),read=await IO.readBundle({file}),root=memoryOpfs();
  const store={streamToOpfs:options=>Store.streamToOpfs({...options,root,hasherFactory:async()=>hasher()})};
  const imported=await IO.importBundleMedia({file,read,store});
  assert.equal(imported.sha256,sha);
  assert.deepEqual(root.files.get(sha+'.mp4'),payload);
  assert.equal(root.files.size,1);
});

test('absent length is unknown but explicit zero and actual truncation still fail',async()=>{
  const bytes=Buffer.from('abc'),sha=crypto.createHash('sha256').update(bytes).digest('hex');
  for(const [headers,expectedSize,code] of [[{'content-length':'0'},3,'RESPONSE_SIZE_MISMATCH'],[{},4,'SIZE_MISMATCH']]){
    const root=memoryOpfs();
    await assert.rejects(()=>Store.streamToOpfs({response:new Response(new Blob([bytes]).stream(),{headers}),
      fileName:'fixture.mp4',expectedSha256:sha,expectedSize,root,hasherFactory:async()=>hasher()}),new RegExp(code));
    assert.equal(root.files.size,0);
  }
});

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
