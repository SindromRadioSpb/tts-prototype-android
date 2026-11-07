/* Code-pinned editions. Never select mutable "latest", mix roots or fall back to the legacy edition. */
(function(root,factory){'use strict';var api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.AtlasEdition=api;})(typeof globalThis==='undefined'?null:globalThis,function(root){
  'use strict';
  var NATIVE_PIN={"atlas_id":"a97001","revision":"cea369d48494fcf58e78e0567fb82477abe7bb21ba02112707c3d7ba31fc4fd7","manifest_sha256":"0211488a36ef6a03c6f277c6c913fb18165ab19430d13a4e623c95fc640ba332"};
  var PIN={atlas_id:'a97001',revision:'50253381cb255822678b07e0ed41a608a3a701a661527eb796837b2f3ee64edc',manifest_sha256:'085d33fddbd04a1eaaa4a9e625273591683cdcf9ff19d0b16899d503132ada7a'};
  var CONTEXT_PIN='ca40870e123fd81e1388918f8bf3babc3c1acbe1ef1daca6fb5059b3ad9384f4';
  var NATIVE_ID='a97001rc32';
  function pinFor(id){return id===NATIVE_ID?NATIVE_PIN:id===PIN.atlas_id?PIN:null;}
  var clients=new Map();
  var CONTRACT='atlas-97001-structure-4';
  function componentsReady(scope){return ['AtlasReader','AtlasWords','AtlasTrain','AtlasSearch'].every(k=>scope[k]&&scope[k].editionContract===CONTRACT);}
  function fail(code){var e=new Error(code);e.code=code;throw e;}
  function base(id){var pin=pinFor(id);return pin?'/data/atlas-editions/'+pin.atlas_id+'/'+pin.revision+'/':'/data/atlas/'+encodeURIComponent(id)+'/';}
  function assetUrl(url){var prefix='/data/atlas/a97001/assets/';return typeof url==='string'&&url.startsWith(prefix)&&/^[A-Za-z0-9_.-]+\.(png|jpg|webp)$/.test(url.slice(prefix.length))?base('a97001')+'assets/'+url.slice(prefix.length):url;}
  // Supplier bytes stay immutable. Only application identities are projected after SHA verification.
  // Every projected object ID retains its original source_id for PDF provenance and comparison.
  function projectCorpus(value,prefix){
    function identity(text){
      if(text.startsWith('/data/atlas/a97001/assets/'))return prefix+'assets/'+text.slice('/data/atlas/a97001/assets/'.length);
      return text.replace(/a97001(?=[:/]|$)/g,NATIVE_ID);
    }
    function walk(v){
      if(typeof v==='string')return identity(v);
      if(Array.isArray(v))return v.map(walk);
      if(!v||typeof v!=='object')return v;
      var out={};Object.keys(v).forEach(function(k){out[identity(k)]=walk(v[k]);});
      if(typeof v.id==='string'&&v.id.startsWith('a97001:'))out.source_id=v.id;
      if(v.atlas_id==='a97001')out.source_atlas_id='a97001';
      return out;
    }
    return walk(value);
  }
  function createClient(id,options){
    options=options||{};var pin=Object.hasOwn(options,'pin')?options.pin:pinFor(id);
    var contextPin=Object.hasOwn(options,'contextPin')?options.contextPin:id===NATIVE_ID?null:CONTEXT_PIN;
    var prefix=pin?'/data/atlas-editions/'+pin.atlas_id+'/'+pin.revision+'/':'/data/atlas/'+encodeURIComponent(id)+'/',fetcher=options.fetch||root.fetch.bind(root),cryptoApi=options.crypto||root.crypto,manifestPromise,contextManifestPromise;
    async function hash(bytes){if(!cryptoApi||!cryptoApi.subtle)fail('ATLAS_EDITION_CRYPTO');return Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
    async function bytes(file){var r=await fetcher(prefix+file,{cache:'no-cache'});if(!r.ok)fail('ATLAS_EDITION_UNAVAILABLE');return new Uint8Array(await r.arrayBuffer());}
    function manifest(){
      if(!pin)return Promise.resolve(null);
      if(!manifestPromise)manifestPromise=(async()=>{var b=await bytes('manifest.json');if(await hash(b)!==pin.manifest_sha256)fail('ATLAS_EDITION_MANIFEST_HASH');var m=JSON.parse(new TextDecoder().decode(b));
        if(m.schema!=='linguistpro.atlas-edition.1'||m.atlas_id!==pin.atlas_id||m.structure_revision!==pin.revision||!m.files)fail('ATLAS_EDITION_MANIFEST');return m;
      })().catch(e=>{manifestPromise=null;throw e;});
      return manifestPromise;
    }
    async function json(file){
      if(typeof file!=='string'||!file.endsWith('.json')||file.startsWith('/')||file.includes('..')||/[?#\\]/.test(file))fail('ATLAS_EDITION_PATH');
      var m=await manifest(),entry=m&&m.files[file];if(m&&!entry)fail('ATLAS_EDITION_FILE_NOT_PUBLISHED');
      var b=await bytes(file);if(entry&&(b.length!==entry.bytes||await hash(b)!==entry.sha256))fail('ATLAS_EDITION_FILE_HASH');
      var result=JSON.parse(new TextDecoder().decode(b));
      if(pin&&file.startsWith('sections/')&&result.structure_revision!==pin.revision)fail('ATLAS_EDITION_SECTION');
      return id===NATIVE_ID?projectCorpus(result,prefix):result;
    }
    async function contextJson(file){
      if(id===NATIVE_ID)fail('ATLAS_CONTEXT_NOT_PUBLISHED');
      if(!pin||id!=='a97001')return json('context-ai/'+file);
      if(!/^s[0-9]{2}-[a-z0-9-]+\.json$/.test(file))fail('ATLAS_CONTEXT_PATH');
      if(!contextPin)fail('ATLAS_CONTEXT_NOT_PUBLISHED');
      var contextBase='/data/atlas-context/a97001/'+contextPin+'/';
      async function get(name){var response=await fetcher(contextBase+name,{cache:'no-cache'});if(!response.ok)fail('ATLAS_CONTEXT_UNAVAILABLE');return new Uint8Array(await response.arrayBuffer());}
      if(!contextManifestPromise)contextManifestPromise=(async()=>{
        var bytes=await get('manifest.json');if(await hash(bytes)!==contextPin)fail('ATLAS_CONTEXT_MANIFEST_HASH');
        var m=JSON.parse(new TextDecoder().decode(bytes));
        if(m.schema!=='linguistpro.atlas-context.1'||m.atlas_id!==id||m.edition_revision!==pin.revision||m.edition_manifest_sha256!==pin.manifest_sha256||!m.files)fail('ATLAS_CONTEXT_MANIFEST');
        return m;
      })().catch(e=>{contextManifestPromise=null;throw e;});
      var entry=(await contextManifestPromise).files[file];if(!entry)fail('ATLAS_CONTEXT_FILE_NOT_PUBLISHED');
      var bytes=await get(file);if(bytes.length!==entry.bytes||await hash(bytes)!==entry.sha256)fail('ATLAS_CONTEXT_FILE_HASH');
      var layer=JSON.parse(new TextDecoder().decode(bytes));
      if(layer.atlas!==id||layer.section!==file.slice(0,-5)||layer.source_revision!==entry.source_revision)fail('ATLAS_CONTEXT_SOURCE');
      return layer;
    }
    // json() verifies the original bytes before projection. Cross-file references
    // must still equal the signed source manifest, never a hash of rewritten IDs.
    async function checkLink(file,expected){
      var m=await manifest();if(!m||!m.files[file]||m.files[file].sha256!==expected)fail('ATLAS_EDITION_LINK_HASH');
    }
    function url(value){if(typeof value!=='string'||!value.startsWith(prefix))return Promise.reject(new Error('ATLAS_EDITION_ROOT'));return json(value.slice(prefix.length));}
    return {base:prefix,json:json,contextJson:contextJson,url:url,manifest:manifest,checkLink:checkLink,revision:pin&&pin.revision};
  }
  function client(id){if(!clients.has(id))clients.set(id,createClient(id));return clients.get(id);}
  return {base:base,assetUrl:assetUrl,client:client,createClient:createClient,componentsReady:componentsReady,contract:CONTRACT,pin:Object.freeze(Object.assign({},PIN)),contextPin:CONTEXT_PIN};
});
