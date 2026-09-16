// Writing and reading the transport container against real files. The format lives in
// media-bundle-core.js; this file only moves bytes, and it moves them in chunks on purpose:
// the media payload is never held as one buffer, on the sending or the receiving device.
(function () {
  "use strict";

  var TAIL_BYTES = 66 * 1024;            // EOCD is at most 65557 bytes from the end, plus slack
  var COPY_CHUNK_BYTES = 4 * 1024 * 1024;

  function core(options) {
    if (options && options.core) return options.core;
    if (typeof window !== "undefined" && window.MediaBundleCore) return window.MediaBundleCore;
    if (typeof require === "function") { try { return require("./media-bundle-core.js"); } catch (_) {} }
    throw fail("BUNDLE_CORE_UNAVAILABLE");
  }

  function fail(code, detail, extra) {
    var error = new Error(detail || code);
    error.code = code;
    if (extra) Object.keys(extra).forEach(function (key) { error[key] = extra[key]; });
    return error;
  }

  async function eachChunk(blob, onChunk) {
    if (blob && typeof blob.stream === "function") {
      var reader = blob.stream().getReader();
      while (true) {
        var next = await reader.read();
        if (next.done) break;
        await onChunk(next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value));
      }
      return;
    }
    // Environments without Blob.stream still never see the whole payload at once.
    for (var offset = 0; offset < blob.size; offset += COPY_CHUNK_BYTES) {
      var slice = blob.slice(offset, Math.min(blob.size, offset + COPY_CHUNK_BYTES));
      await onChunk(new Uint8Array(await slice.arrayBuffer()));
    }
  }

  async function crc32OfBlob(blob, options) {
    var digest = core(options).createCrc32();
    await eachChunk(blob, function (chunk) { digest.update(chunk); });
    return digest.value();
  }

  // Writes one archive: verbatim header blocks from the layout, payloads streamed from their
  // sources. The CRC of every payload is computed in a separate streaming pass first, so the
  // archive carries real checksums without a data descriptor and stays maximally compatible.
  async function writeBundle(options) {
    var opts = options || {};
    var C = core(opts);
    var manifest = opts.manifest;
    var sources = opts.sources || {};
    var writable = opts.writable;
    if (!manifest || manifest.schema !== C.SCHEMA) throw fail("BUNDLE_MANIFEST_UNKNOWN_SCHEMA");
    if (!writable || typeof writable.write !== "function") throw fail("BUNDLE_WRITABLE_REQUIRED");
    var manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    var entries = [{ name: "manifest.json", size: manifestBytes.length, crc32: C.crc32(manifestBytes) }];
    var payloads = { "manifest.json": new Blob([manifestBytes]) };
    for (var index = 1; index < manifest.entries.length; index++) {
      var name = manifest.entries[index];
      var source = sources[name];
      if (!source) throw fail("BUNDLE_SOURCE_MISSING", name);
      entries.push({ name: name, size: Number(source.size), crc32: await crc32OfBlob(source, opts) });
      payloads[name] = source;
    }
    var layout = C.storedZipLayout(entries);
    var written = 0;
    for (var part = 0; part < layout.parts.length; part++) {
      var item = layout.parts[part];
      if (item.kind === "bytes") {
        await writable.write(item.bytes);
        written += item.bytes.length;
      } else {
        await eachChunk(payloads[item.name], async function (chunk) {
          await writable.write(chunk);
          written += chunk.length;
        });
      }
      if (typeof opts.onProgress === "function") opts.onProgress({ written: written, total: layout.total_size });
    }
    if (typeof writable.close === "function") await writable.close();
    return { total_size: layout.total_size, entries: entries, manifest: manifest };
  }

  async function sliceBytes(file, start, end) {
    return new Uint8Array(await file.slice(start, end).arrayBuffer());
  }

  // Reads only the tail and the header bytes it needs; the media payload is never touched here.
  async function readBundle(options) {
    var opts = options || {};
    var C = core(opts);
    var file = opts.file;
    if (!file || typeof file.slice !== "function") throw fail("BUNDLE_FILE_REQUIRED");
    var size = Number(file.size);
    var tail = await sliceBytes(file, Math.max(0, size - TAIL_BYTES), size);
    var eocd = C.locateEndOfCentralDirectory(tail, { fileSize: size });
    var central = await sliceBytes(file, eocd.central_offset, eocd.central_offset + eocd.central_size);
    var entries = C.parseCentralDirectory(central, { central_offset: eocd.central_offset, file_size: size });
    var manifestEntry = entries.filter(function (entry) { return entry.name === "manifest.json"; })[0];
    if (!manifestEntry) throw fail("BUNDLE_MANIFEST_ENTRY_MISSING");
    var manifest = JSON.parse(new TextDecoder().decode(await entryBytes(file, manifestEntry, C)));
    var checked = C.verifyBundleManifest(manifest, { entries: entries });
    return {
      manifest: manifest,
      entries: entries,
      package: Object.assign({}, checked.package, { data_offset: await resolveDataOffset(file, checked.package, C) }),
      media: Object.assign({}, checked.media, { data_offset: await resolveDataOffset(file, checked.media, C) }),
    };
  }

  async function resolveDataOffset(file, entry, C) {
    var header = await sliceBytes(file, entry.local_header_offset, entry.local_header_offset + 128);
    return C.dataOffset(header, entry.local_header_offset);
  }

  async function entryBytes(file, entry, C) {
    var start = await resolveDataOffset(file, entry, C || core(null));
    return sliceBytes(file, start, start + entry.size);
  }

  async function bundleEntryBlob(options) {
    var opts = options || {};
    var C = core(opts);
    var entry = opts.entry;
    if (!entry) throw fail("BUNDLE_ENTRY_REQUIRED");
    var start = entry.data_offset == null ? await resolveDataOffset(opts.file, entry, C) : entry.data_offset;
    return opts.file.slice(start, start + entry.size);
  }

  // The media entry travels from the archive into OPFS as a stream over its byte range, verified
  // against the hash the manifest recorded while it arrives.
  async function importBundleMedia(options) {
    var opts = options || {};
    var C = core(opts);
    var read = opts.read;
    var store = opts.store || (typeof window !== "undefined" ? window.MediaStreamStore : null);
    if (!read || !read.media || !read.manifest) throw fail("BUNDLE_READ_REQUIRED");
    if (!store || typeof store.streamToOpfs !== "function") throw fail("MEDIA_STREAM_STORE_UNAVAILABLE");
    var media = read.manifest.media;
    var blob = await bundleEntryBlob({ file: opts.file, entry: read.media, core: C });
    var stored = await store.streamToOpfs({
      response: new Response(blob.stream ? blob.stream() : blob),
      fileName: media.sha256 + "." + String(media.entry).split(".").pop(),
      expectedSha256: media.sha256,
      expectedSize: media.size_bytes,
      maxBytes: opts.maxBytes,
      mimeType: media.mime,
      onProgress: opts.onProgress,
      signal: opts.signal,
    });
    return {
      opfsPath: stored.opfsPath,
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
      mimeType: media.mime,
      rendition: media.rendition || "full",
      name: media.name || null,
    };
  }

  var API = {
    TAIL_BYTES: TAIL_BYTES,
    crc32OfBlob: crc32OfBlob,
    writeBundle: writeBundle,
    readBundle: readBundle,
    bundleEntryBlob: bundleEntryBlob,
    importBundleMedia: importBundleMedia,
  };
  if (typeof window !== "undefined") window.MediaBundleIo = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
