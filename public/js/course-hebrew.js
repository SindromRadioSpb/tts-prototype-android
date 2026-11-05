(function (root) {
  'use strict';

  function stripMarks(s) {
    return s.normalize('NFC')
      .replace(/\u05BE/g, ' ')
      .replace(/[\u0591-\u05C7\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
  }

  function tokens(s) {
    return stripMarks(s).split(/[^\u05D0-\u05EA\p{Script=Latin}\p{Script=Cyrillic}0-9]+/u).filter(Boolean);
  }

  function skeleton(s) {
    return stripMarks(s).replace(/[^\u05D0-\u05EA]/g, '').replace(/[\u05D5\u05D9]/g, '');
  }

  function formKeys(he) {
    return [...new Set([tokens(he.niqqud).join(' '), tokens(he.plain).join(' ')])];
  }

  // A structural guard only; editorial validation still owns spelling accuracy.
  function pairConsistent(he) {
    return skeleton(he.niqqud) === skeleton(he.plain);
  }

  const api = { stripMarks, tokens, skeleton, formKeys, pairConsistent };
  root.CourseHebrew = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
