// public/js/subtitle-text-decode.js
// Subtitle files are bytes, not text. Old Hebrew DVD rips are Windows-1255, Russian ones
// Windows-1251, some editors write UTF-16; reading every file as UTF-8 turned the owner's
// Hebrew film into "�� ���" (O-095, 2026-10-18). The decision is made from the bytes:
// a BOM first, then strict UTF-8, then UTF-16 by its zero bytes, then the legacy code page
// whose decoding is clean and lands in its own script. The person can still choose another.
(function () {
  "use strict";

  // Order matters only for the manual list; detection scores every legacy candidate.
  var ENCODINGS = ["utf-8", "windows-1255", "windows-1251", "windows-1256", "windows-1252", "utf-16le", "utf-16be"];
  var LEGACY = [
    { encoding: "windows-1255", script: /[֐-׿יִ-ﭏ]/ },
    { encoding: "windows-1251", script: /[Ѐ-ӿ]/ },
    { encoding: "windows-1256", script: /[؀-ۿ]/ },
    { encoding: "windows-1252", script: /[À-ɏ]/ },
  ];

  function decoder(encoding, fatal) {
    try { return new TextDecoder(encoding, fatal ? { fatal: true } : undefined); } catch (_) { return null; }
  }

  function stripBom(text) { return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text; }

  function bomEncoding(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return "utf-8";
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return "utf-16le";
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return "utf-16be";
    return null;
  }

  // Subtitle text is mostly ASCII digits, arrows and spaces: in UTF-16 every second byte of
  // those is zero, on the high side of each pair.
  function utf16Guess(bytes) {
    var n = Math.min(bytes.length, 4096) & ~1;
    if (n < 16) return null;
    var evenZero = 0, oddZero = 0;
    for (var i = 0; i < n; i += 2) { if (bytes[i] === 0) evenZero++; if (bytes[i + 1] === 0) oddZero++; }
    var pairs = n / 2;
    if (oddZero > pairs * 0.3 && evenZero < pairs * 0.05) return "utf-16le";
    if (evenZero > pairs * 0.3 && oddZero < pairs * 0.05) return "utf-16be";
    return null;
  }

  // Each candidate is judged by its own decoding: replacement marks mean bytes the code page
  // does not define, and the share of non-ASCII characters in the page's own script says the
  // text is that language and not another one read through the wrong table.
  function legacyScore(bytes, candidate) {
    var dec = decoder(candidate.encoding, false);
    if (!dec) return null;
    var text = dec.decode(bytes);
    var nonAscii = 0, script = 0, bad = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], code = text.charCodeAt(i);
      if (code < 0x80) continue;
      nonAscii++;
      if (code === 0xFFFD || (code >= 0x80 && code <= 0x9F)) bad++;
      else if (candidate.script.test(ch)) script++;
    }
    return { encoding: candidate.encoding, text: text, score: nonAscii ? (script - 4 * bad) / nonAscii : 0, bad: bad };
  }

  function isAsciiLetter(b) { return (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A); }
  function latinShaped(bytes) {
    var words = 0, mixed = 0, high = false, ascii = false;
    function flush() { if (high) { words++; if (ascii) mixed++; } high = false; ascii = false; }
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if (b >= 0x80) high = true;
      else if (isAsciiLetter(b)) ascii = true;
      else flush();
    }
    flush();
    return words > 0 && mixed / words > 0.5;
  }

  function decodeSubtitleBytes(input, options) {
    var bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
    var chosen = options && options.encoding;
    if (chosen) {
      var own = decoder(chosen, false);
      if (!own) throw Object.assign(new Error("SUBTITLE_ENCODING_UNSUPPORTED"), { code: "SUBTITLE_ENCODING_UNSUPPORTED" });
      return { text: stripBom(own.decode(bytes)), encoding: chosen, detected_by: "chosen" };
    }
    var bom = bomEncoding(bytes);
    if (bom) return { text: stripBom(decoder(bom, false).decode(bytes)), encoding: bom, detected_by: "bom" };
    var wide = utf16Guess(bytes);
    if (wide) return { text: decoder(wide, false).decode(bytes), encoding: wide, detected_by: "utf16-zeros" };
    try {
      return { text: decoder("utf-8", true).decode(bytes), encoding: "utf-8", detected_by: "utf8-valid" };
    } catch (_) { /* not UTF-8: a legacy code page */ }
    // Accented Latin keeps its high bytes inside ASCII words ("café"); Hebrew, Cyrillic and
    // Arabic words are made of high bytes only. Without this a French Windows-1252 file reads
    // "cleanly" as Hebrew, because é, à, è are Hebrew letters in Windows-1255.
    var latin = latinShaped(bytes);
    var best = null;
    LEGACY.forEach(function (candidate) {
      if ((candidate.encoding === "windows-1252") !== latin) return;
      var scored = legacyScore(bytes, candidate);
      if (scored && (!best || scored.score > best.score)) best = scored;
    });
    if (best && best.score > 0.5) return { text: best.text, encoding: best.encoding, detected_by: "legacy-score" };
    // Nothing reads cleanly: UTF-8 with replacement marks, said as such, so the screen can offer
    // the manual choice instead of pretending the text is right.
    return { text: decoder("utf-8", false).decode(bytes), encoding: "utf-8", detected_by: "unrecognized" };
  }

  async function readSubtitleFile(file, options) {
    var bytes = new Uint8Array(await file.arrayBuffer());
    var decoded = decodeSubtitleBytes(bytes, options);
    decoded.bytes = bytes;
    return decoded;
  }

  var API = { ENCODINGS: ENCODINGS, decodeSubtitleBytes: decodeSubtitleBytes, readSubtitleFile: readSubtitleFile };
  if (typeof window !== "undefined") window.SubtitleTextDecode = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
