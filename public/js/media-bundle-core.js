// Transport container for a learning material that must travel with its media: an unchanged
// .lplp.zip package next to exactly one prepared media file, in a plain stored (uncompressed) ZIP.
//
// Stored entries are the whole point. Writing needs no compressor and, more importantly, reading
// needs no decompressor: the importer locates an entry from the archive tail and streams that byte
// range straight into OPFS, so a 400 MiB copy never exists as one buffer on a phone.
(function () {
  "use strict";

  var SCHEMA = "lplp-media-bundle-v1";
  var RENDITIONS = ["full", "lite"];
  var SHA_RE = /^[a-f0-9]{64}$/i;
  var MAX_NAME_BYTES = 240;
  var EOCD_SIGNATURE = 0x06054b50;
  var CENTRAL_SIGNATURE = 0x02014b50;
  var LOCAL_SIGNATURE = 0x04034b50;
  var UTF8_FLAG = 0x0800;
  var EXTENSION_BY_MIME = {
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
    "audio/mp4": "m4a", "audio/mpeg": "mp3",
  };

  var CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = new Int32Array(256);
    for (var index = 0; index < 256; index++) {
      var value = index;
      for (var bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      CRC_TABLE[index] = value;
    }
    return CRC_TABLE;
  }

  function createCrc32() {
    var table = crcTable();
    var state = -1;
    return {
      update: function (chunk) {
        var view = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        for (var index = 0; index < view.length; index++) {
          state = (state >>> 8) ^ table[(state ^ view[index]) & 0xff];
        }
        return this;
      },
      value: function () { return (state ^ -1) >>> 0; },
    };
  }
  function crc32(chunk) { return createCrc32().update(chunk).value(); }

  function fail(code, detail, extra) {
    var error = new Error(detail || code);
    error.code = code;
    if (extra) Object.keys(extra).forEach(function (key) { error[key] = extra[key]; });
    return error;
  }

  function utf8(text) { return new TextEncoder().encode(String(text == null ? "" : text)); }
  function decodeUtf8(view) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(view); }
    catch (_) { throw fail("BUNDLE_ENTRY_NAME_INVALID"); }
  }
  function u16(view, offset) { return view[offset] | (view[offset + 1] << 8); }
  function u32(view, offset) {
    return (view[offset] | (view[offset + 1] << 8) | (view[offset + 2] << 16) | (view[offset + 3] << 24)) >>> 0;
  }
  function writeU16(view, offset, value) {
    view[offset] = value & 0xff; view[offset + 1] = (value >>> 8) & 0xff;
  }
  function writeU32(view, offset, value) {
    view[offset] = value & 0xff; view[offset + 1] = (value >>> 8) & 0xff;
    view[offset + 2] = (value >>> 16) & 0xff; view[offset + 3] = (value >>> 24) & 0xff;
  }
  function size(value) {
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
  }
  function sha(value) {
    var text = String(value == null ? "" : value).toLowerCase();
    return SHA_RE.test(text) ? text : null;
  }

  function mediaExtension(media) {
    var byMime = EXTENSION_BY_MIME[String(media.mime || "").toLowerCase()];
    if (byMime) return byMime;
    var match = /\.([a-z0-9]{1,5})$/i.exec(String(media.name || ""));
    return match ? match[1].toLowerCase() : "bin";
  }

  function buildBundleManifest(input) {
    var source = input || {};
    var pkg = source.package || {};
    var media = source.media || {};
    var packageSha = sha(pkg.sha256), mediaSha = sha(media.sha256);
    var packageSize = size(pkg.size_bytes), mediaSize = size(media.size_bytes);
    var packageName = String(pkg.name || "").trim();
    var rendition = media.rendition == null ? "full" : String(media.rendition);
    if (!packageName || packageSha == null || packageSize == null) throw fail("BUNDLE_MANIFEST_INVALID", "package descriptor is incomplete");
    if (mediaSha == null || mediaSize == null || !String(media.mime || "").trim()) throw fail("BUNDLE_MANIFEST_INVALID", "media descriptor is incomplete");
    if (RENDITIONS.indexOf(rendition) < 0) throw fail("BUNDLE_MANIFEST_INVALID", "unknown rendition");
    var canonicalSha = sha(media.canonical_sha256);
    if (rendition === "lite" && (!canonicalSha || canonicalSha === mediaSha ||
        !Number.isFinite(Number(media.duration_seconds)) || Number(media.duration_seconds) <= 0)) {
      throw fail("BUNDLE_MANIFEST_INVALID", "lite parent or duration is missing");
    }
    if (utf8(packageName).byteLength > MAX_NAME_BYTES) throw fail("BUNDLE_MANIFEST_INVALID", "package name is too long");
    var packageEntry = "package/" + packageName;
    var mediaEntry = "media/" + mediaSha + "." + mediaExtension(media);
    return {
      schema: SCHEMA,
      created_at: source.created_at || new Date().toISOString(),
      app_version: source.app_version || null,
      package: {
        name: packageName, entry: packageEntry, size_bytes: packageSize, sha256: packageSha,
        content_root_sha256: sha(pkg.content_root_sha256),
      },
      media: {
        name: String(media.name || "").trim() || (mediaSha + "." + mediaExtension(media)),
        entry: mediaEntry, size_bytes: mediaSize, sha256: mediaSha,
        mime: String(media.mime), rendition: rendition,
        canonical_sha256: canonicalSha || (rendition === "full" ? mediaSha : null),
        derived_from_source_sha256: sha(media.derived_from_source_sha256),
        duration_seconds: media.duration_seconds == null ? null : Number(media.duration_seconds),
      },
      material: source.material || null,
      entries: ["manifest.json", packageEntry, mediaEntry],
    };
  }

  function localHeader(entry, nameBytes) {
    var header = new Uint8Array(30 + nameBytes.length);
    writeU32(header, 0, LOCAL_SIGNATURE);
    writeU16(header, 4, 20);            // version needed
    writeU16(header, 6, UTF8_FLAG);     // general purpose flags: UTF-8 names, never encrypted
    writeU16(header, 8, 0);             // stored
    writeU16(header, 10, 0);            // modification time (fixed: the archive is content-addressed)
    writeU16(header, 12, 0x21);         // modification date (1980-01-01)
    writeU32(header, 14, entry.crc32 >>> 0);
    writeU32(header, 18, entry.size);
    writeU32(header, 22, entry.size);
    writeU16(header, 26, nameBytes.length);
    writeU16(header, 28, 0);
    header.set(nameBytes, 30);
    return header;
  }

  function centralRecord(entry, nameBytes, offset) {
    var record = new Uint8Array(46 + nameBytes.length);
    writeU32(record, 0, CENTRAL_SIGNATURE);
    writeU16(record, 4, 20);
    writeU16(record, 6, 20);
    writeU16(record, 8, UTF8_FLAG);
    writeU16(record, 10, 0);
    writeU16(record, 12, 0);
    writeU16(record, 14, 0x21);
    writeU32(record, 16, entry.crc32 >>> 0);
    writeU32(record, 20, entry.size);
    writeU32(record, 24, entry.size);
    writeU16(record, 28, nameBytes.length);
    writeU16(record, 30, 0);
    writeU16(record, 32, 0);
    writeU16(record, 34, 0);
    writeU16(record, 36, 0);
    writeU32(record, 38, 0);
    writeU32(record, 42, offset);
    record.set(nameBytes, 46);
    return record;
  }

  // The caller writes `bytes` parts verbatim and streams the payload of every `data` part, so the
  // media file is never held in memory on either side of the transfer.
  function storedZipLayout(entries) {
    var list = Array.isArray(entries) ? entries : [];
    if (!list.length) throw fail("BUNDLE_NO_ENTRIES");
    var parts = [], central = [], offset = 0;
    list.forEach(function (raw) {
      var name = String(raw && raw.name || "").trim();
      var entrySize = size(raw && raw.size);
      if (!name || entrySize == null) throw fail("BUNDLE_ENTRY_INVALID", name || "entry");
      var nameBytes = utf8(name);
      if (nameBytes.byteLength > MAX_NAME_BYTES) throw fail("BUNDLE_ENTRY_INVALID", name);
      var entry = { name: name, size: entrySize, crc32: (raw.crc32 >>> 0) || 0 };
      var header = localHeader(entry, nameBytes);
      parts.push({ kind: "bytes", bytes: header });
      parts.push({ kind: "data", name: name, size: entrySize });
      central.push(centralRecord(entry, nameBytes, offset));
      offset += header.length + entrySize;
    });
    var centralSize = central.reduce(function (sum, record) { return sum + record.length; }, 0);
    var centralOffset = offset;
    central.forEach(function (record) { parts.push({ kind: "bytes", bytes: record }); });
    var eocd = new Uint8Array(22);
    writeU32(eocd, 0, EOCD_SIGNATURE);
    writeU16(eocd, 8, list.length);
    writeU16(eocd, 10, list.length);
    writeU32(eocd, 12, centralSize);
    writeU32(eocd, 16, centralOffset);
    parts.push({ kind: "bytes", bytes: eocd });
    return {
      parts: parts,
      total_size: centralOffset + centralSize + eocd.length,
      central_offset: centralOffset,
      central_size: centralSize,
    };
  }

  function locateEndOfCentralDirectory(tail, options) {
    var view = tail instanceof Uint8Array ? tail : new Uint8Array(tail);
    var opts = options || {};
    var fileSize = size(opts.fileSize);
    if (fileSize == null) throw fail("BUNDLE_EOCD_INVALID", "file size is required");
    var found = -1;
    for (var index = view.length - 22; index >= 0; index--) {
      if (u32(view, index) === EOCD_SIGNATURE) { found = index; break; }
    }
    if (found < 0) throw fail("BUNDLE_EOCD_MISSING");
    var entryCount = u16(view, found + 10);
    var centralSize = u32(view, found + 12);
    var centralOffset = u32(view, found + 16);
    var eocdOffset = fileSize - (view.length - found);
    if (eocdOffset < 0 || centralOffset + centralSize > eocdOffset) throw fail("BUNDLE_EOCD_INVALID");
    return {
      eocd_offset: eocdOffset, entry_count: entryCount,
      central_offset: centralOffset, central_size: centralSize,
    };
  }

  function parseCentralDirectory(central, options) {
    var view = central instanceof Uint8Array ? central : new Uint8Array(central);
    var opts = options || {};
    var fileSize = size(opts.file_size);
    var entries = [], position = 0, names = {};
    while (position + 46 <= view.length) {
      if (u32(view, position) !== CENTRAL_SIGNATURE) throw fail("BUNDLE_CENTRAL_ENTRY_INVALID");
      var flags = u16(view, position + 8);
      var method = u16(view, position + 10);
      if (flags & 1) throw fail("BUNDLE_ENTRY_ENCRYPTED");
      if (method !== 0) throw fail("BUNDLE_ENTRY_NOT_STORED");
      var entryCrc = u32(view, position + 16);
      var compressed = u32(view, position + 20);
      var uncompressed = u32(view, position + 24);
      var nameLength = u16(view, position + 28);
      var extraLength = u16(view, position + 30);
      var commentLength = u16(view, position + 32);
      var localOffset = u32(view, position + 42);
      var name = decodeUtf8(view.subarray(position + 46, position + 46 + nameLength));
      if (!name || name.indexOf("..") >= 0 || name.charAt(0) === "/" || name.indexOf("\\") >= 0) {
        throw fail("BUNDLE_ENTRY_NAME_INVALID", name);
      }
      if (names[name]) throw fail("BUNDLE_DUPLICATE_ENTRY", name);
      names[name] = true;
      if (compressed !== uncompressed) throw fail("BUNDLE_ENTRY_NOT_STORED", name);
      if (fileSize != null && localOffset + 30 > fileSize) throw fail("BUNDLE_LOCAL_ENTRY_INVALID", name);
      entries.push({
        name: name, method: method, crc32: entryCrc, size: uncompressed,
        compressed_size: compressed, local_header_offset: localOffset,
      });
      position += 46 + nameLength + extraLength + commentLength;
    }
    if (position !== view.length) throw fail("BUNDLE_CENTRAL_DIRECTORY_SIZE_MISMATCH");
    return entries;
  }

  function dataOffset(localHeaderBytes, localHeaderOffset) {
    var view = localHeaderBytes instanceof Uint8Array ? localHeaderBytes : new Uint8Array(localHeaderBytes);
    if (view.length < 30 || u32(view, 0) !== LOCAL_SIGNATURE) throw fail("BUNDLE_LOCAL_ENTRY_INVALID");
    return size(localHeaderOffset) + 30 + u16(view, 26) + u16(view, 28);
  }

  function verifyBundleManifest(manifest, options) {
    var source = manifest || {};
    if (source.schema !== SCHEMA) throw fail("BUNDLE_MANIFEST_UNKNOWN_SCHEMA", String(source.schema || ""));
    var entries = (options && Array.isArray(options.entries)) ? options.entries : [];
    var byName = {};
    entries.forEach(function (entry) { if (entry && entry.name) byName[entry.name] = entry; });
    var packageEntry = byName[source.package && source.package.entry];
    if (!packageEntry) throw fail("BUNDLE_PACKAGE_ENTRY_MISSING", source.package && source.package.entry);
    if (size(packageEntry.size) !== size(source.package.size_bytes)) throw fail("BUNDLE_PACKAGE_SIZE_MISMATCH");
    var mediaEntry = byName[source.media && source.media.entry];
    if (!mediaEntry) throw fail("BUNDLE_MEDIA_ENTRY_MISSING", source.media && source.media.entry);
    if (size(mediaEntry.size) !== size(source.media.size_bytes)) throw fail("BUNDLE_MEDIA_SIZE_MISMATCH");
    if (source.media.rendition === "lite" &&
        (!sha(source.media.canonical_sha256) || source.media.canonical_sha256 === source.media.sha256 ||
         !Number.isFinite(Number(source.media.duration_seconds)) || Number(source.media.duration_seconds) <= 0)) {
      throw fail("BUNDLE_MANIFEST_INVALID", "lite parent or duration is missing");
    }
    return { manifest: source, package: packageEntry, media: mediaEntry };
  }

  var API = {
    SCHEMA: SCHEMA,
    crc32: crc32,
    createCrc32: createCrc32,
    buildBundleManifest: buildBundleManifest,
    verifyBundleManifest: verifyBundleManifest,
    storedZipLayout: storedZipLayout,
    locateEndOfCentralDirectory: locateEndOfCentralDirectory,
    parseCentralDirectory: parseCentralDirectory,
    dataOffset: dataOffset,
  };
  if (typeof window !== "undefined") window.MediaBundleCore = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
