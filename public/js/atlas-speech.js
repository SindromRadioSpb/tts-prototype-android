// AtlasSpeech — what the atlas recordings say, shared by the bake (Node) and the reader (browser).
//
// The reader needs only sourceOf(item): the fingerprint of the text a recording was made from. It plays a recording
// only when the SHA-256 of that fingerprint matches the section manifest, so a text corrected after the bake stays
// silent instead of reading the old words (plan P3 §4.1).
// The bake also uses speak(item, lexicon): the Hebrew text sent to the voice. Formulas are read by a small parser of
// the book's LaTeX subset with the reviewed dictionary (atlas/a97002/speech-lexicon.json). Anything it does not know —
// a command, a word, an unbalanced bracket — makes the item «no recording» with a reason; there is no approximate
// reading and no language model (plan §4.3, §9).
(function (root) {
  'use strict';

  var CONTRACT = 'atlas-speech/1';
  var READ_KINDS = ['heading', 'prose', 'list_item', 'caption', 'example_heading', 'example_text', 'table_note'];

  function str(s) { return String(s == null ? '' : s); }
  function squash(s) { return str(s).normalize('NFC').replace(/\s+/g, ' ').trim(); }

  function readable(item) {
    if (!item) return false;
    if (item.type === 'formula') return !!str(item.latex).trim();
    return item.type === 'block' && READ_KINDS.indexOf(item.kind) >= 0 && !!str(item.he_niqqud).trim();
  }
  // The fields a recording depends on. Changing any of them changes the fingerprint.
  function sourceOf(item) {
    if (!item) return '';
    if (item.type === 'formula') {
      return JSON.stringify([CONTRACT, 'formula', str(item.latex), (item.vars || []).map(function (v) {
        return [str(v.latex), str(v.he), str(v.unit)];
      })]);
    }
    return JSON.stringify([CONTRACT, 'block', str(item.kind), squash(item.he_niqqud)]);
  }

  function fail(code, detail) { var e = new Error(code + (detail != null ? ':' + detail : '')); e.speech = true; throw e; }

  // ---------------------------------------------------------------- formula: LaTeX subset → nodes
  var SPACE_CMDS = { quad: 1, qquad: 1, ',': 1, ';': 1, ':': 1, '!': 1, ' ': 1, displaystyle: 1, textstyle: 1, limits: 1 };
  var REL = { '=': 'equals', '<': 'lt', '>': 'gt', '≤': 'le', '≥': 'ge', '≈': 'approx', '≅': 'approx', '≠': 'neq',
    le: 'le', leq: 'le', ge: 'ge', geq: 'ge', approx: 'approx', cong: 'approx', simeq: 'approx', neq: 'neq', ne: 'neq',
    to: 'gives', rightarrow: 'gives', longrightarrow: 'gives', Rightarrow: 'gives', '→': 'gives' };
  var BIN = { '+': 'plus', '-': 'minus', '−': 'minus', '–': 'minus', '·': 'times', '∙': 'times', '×': 'times', '*': 'times',
    '/': 'over', cdot: 'times', times: 'times', pm: 'plusminus', '±': 'plusminus', div: 'over', '÷': 'over' };
  var FUNCS = { sin: 1, cos: 1, tan: 1, ln: 1, log: 1, max: 1, min: 1, arctan: 1, arcsin: 1, arccos: 1 };

  function texTokens(src) {
    var out = [], i = 0, s = str(src);
    while (i < s.length) {
      var rest = s.slice(i), c = s[i], m;
      if (c === '\\') {
        if ((m = /^\\([A-Za-z]+)/.exec(rest))) { out.push({ t: 'cmd', v: m[1], r: m[0] }); i += m[0].length; continue; }
        var n = s[i + 1] || '';
        if (n === '\\') { out.push({ t: 'nl', r: '\\\\' }); i += 2; continue; }
        if (SPACE_CMDS[n] || n === '') { out.push({ t: 'sp', r: '\\' + n }); i += 2; continue; }
        if (n === '{' || n === '}' || n === '%' || n === '|') { out.push({ t: 'ch', v: n === '|' ? '‖' : n, r: '\\' + n }); i += 2; continue; }
        fail('UNKNOWN_COMMAND', '\\' + n);
      }
      if (/\s/.test(c)) { out.push({ t: 'ws', r: c }); i++; continue; }
      if ((m = /^(?:\d+(?:\.\d+)?|\.\d+)(?:\{,\}\d+)?/.exec(rest))) { out.push({ t: 'num', v: m[0].replace('{,}', '.'), r: m[0] }); i += m[0].length; continue; }
      if ((m = /^[א-ת][א-ת֑-ׇ"׳״']*/.exec(rest))) { out.push({ t: 'heb', v: m[0], r: m[0] }); i += m[0].length; continue; }
      if (c === '&') { out.push({ t: 'col', r: c }); i++; continue; }
      out.push({ t: 'ch', v: c, r: c }); i++;
    }
    return out;
  }

  function Parser(tokens, lex) { this.t = tokens; this.i = 0; this.lex = lex; }
  Parser.prototype.peek = function (skipSpace) {
    var j = this.i;
    if (skipSpace) while (j < this.t.length && (this.t[j].t === 'ws' || this.t[j].t === 'sp')) j++;
    return this.t[j];
  };
  Parser.prototype.skipSpace = function () { var n = 0; while (this.i < this.t.length && (this.t[this.i].t === 'ws' || this.t[this.i].t === 'sp')) { this.i++; n++; } return n; };
  Parser.prototype.next = function () { return this.t[this.i++]; };
  Parser.prototype.isClose = function (tok, close) {
    if (!tok) return false;
    if (close === '}') return tok.t === 'ch' && tok.v === '}';
    if (close === 'end') return tok.t === 'cmd' && tok.v === 'end';
    if (close === ']opt') return tok.t === 'ch' && tok.v === ']';
    return tok.t === 'ch' && tok.v === close;
  };
  // A raw text argument: \text{…}, \mathrm N, \operatorname{Shift\ tan}
  Parser.prototype.rawArg = function () {
    this.skipSpace();
    var tok = this.next();
    if (!tok) fail('PARSE', 'missing argument');
    if (!(tok.t === 'ch' && tok.v === '{')) return tok.t === 'cmd' ? '\\' + tok.v : str(tok.v != null ? tok.v : tok.r);
    var depth = 1, raw = '';
    while (this.i < this.t.length) {
      var x = this.next();
      if (x.t === 'ch' && x.v === '{') depth++;
      if (x.t === 'ch' && x.v === '}' && --depth === 0) break;
      raw += x.r;
    }
    if (depth) fail('PARSE', 'unclosed text');
    return raw.replace(/\\[ ,;:!]/g, ' ').replace(/\s*\\cdot\s*/g, '·').replace(/\\%/g, '%').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  };
  Parser.prototype.arg = function () {
    this.skipSpace();
    var tok = this.peek();
    if (!tok) fail('PARSE', 'missing argument');
    if (tok.t === 'ch' && tok.v === '{') { this.next(); var seq = this.seq('}'); this.next(); return seq; }
    // «\frac25»: an argument without braces is one digit
    if (tok.t === 'num' && tok.v.length > 1 && /^\d+$/.test(tok.v)) { this.t[this.i] = { t: 'num', v: tok.v.slice(1), r: tok.v.slice(1) }; return [{ k: 'num', v: tok.v[0] }]; }
    if (tok.t === 'num') { this.next(); return [{ k: 'num', v: tok.v }]; }
    // «X_d^u»: an argument without braces is one symbol; the next script belongs to X, not to d
    if (tok.t === 'ch' && /^[A-Za-z]$/.test(tok.v)) { this.next(); return [{ k: 'id', base: tok.v }]; }
    if (tok.t === 'cmd' && this.lex.greek && this.lex.greek[tok.v] != null) { this.next(); return [{ k: 'id', base: tok.v, greek: true }]; }
    var a = this.atom();
    return a ? [a] : [];
  };
  Parser.prototype.seq = function (close) {
    var out = [];
    while (this.i < this.t.length) {
      var tok = this.peek();
      if (close && this.isClose(tok, close)) return out;
      if (!close && tok.t === 'ch' && (tok.v === '}' || tok.v === ')' || tok.v === ']')) fail('PARSE', 'unbalanced ' + tok.v);
      var before = this.i, a = this.atom(close);
      if (a) {
        out.push(a);
        if (a.k === 'num' && !a.sup) { var u = this.unitAhead(); if (u) out.push(u); }
      } else if (this.i === before) this.i++;
    }
    if (close && close !== 'end') fail('PARSE', 'unclosed ' + close);
    return out;
  };
  // «10\ mm», «9167\ \mathrm N», «0.62\ mm» — a unit after a number needs a space or \mathrm/\text
  Parser.prototype.unitAhead = function () {
    var save = this.i, spaces = this.skipSpace(), tok = this.peek(), units = this.lex.units || {};
    if (tok && tok.t === 'cmd' && (tok.v === 'mathrm' || tok.v === 'text')) {
      this.next();
      var raw = this.rawArg(), sup = this.peek();
      // «\mathrm{mm}^2»
      if (sup && sup.t === 'ch' && sup.v === '^') {
        var save2 = this.i; this.next();
        var pw = flatText(this.arg());
        if (units[raw + '^' + pw] != null) return { k: 'unit', v: raw + '^' + pw };
        this.i = save2;
      }
      if (units[raw] != null) return { k: 'unit', v: raw };
      this.i = save; return null;
    }
    if (!spaces || !tok || tok.t !== 'ch' || !/[A-Za-z°%]/.test(tok.v)) { this.i = save; return null; }
    var raw2 = '', j = this.i, best = null, bestJ = j;
    while (j < this.t.length && this.t[j].t !== 'ws' && this.t[j].t !== 'sp' && /^[A-Za-z\/·*^0-9²³⁻¹°%{}-]$/.test(this.t[j].r || '')) {
      raw2 += this.t[j].r; j++;
      var key = raw2.replace(/[{}]/g, '');
      if (units[key] != null) { best = key; bestJ = j; }
    }
    if (best && !(this.t[bestJ] && this.t[bestJ].t === 'ch' && /[A-Za-z]/.test(this.t[bestJ].v))) { this.i = bestJ; return { k: 'unit', v: best }; }
    this.i = save; return null;
  };
  Parser.prototype.scripts = function (node) {
    for (;;) {
      var tok = this.peek();
      if (!tok) return node;
      if (tok.t === 'ch' && tok.v === '_') { this.next(); node.sub = this.arg(); continue; }
      if (tok.t === 'ch' && tok.v === '^') { this.next(); node.sup = this.arg(); continue; }
      if (tok.t === 'ch' && (tok.v === "'" || tok.v === '′')) { this.next(); node.prime = (node.prime || 0) + 1; continue; }
      if (tok.t === 'cmd' && tok.v === 'prime') { this.next(); node.prime = (node.prime || 0) + 1; continue; }
      return node;
    }
  };
  Parser.prototype.atom = function (close) {
    var tok = this.next(), lex = this.lex, greekChars = lex.greek_chars || {};
    if (!tok) return null;
    if (tok.t === 'ws' || tok.t === 'sp') return null;
    if (tok.t === 'nl') return { k: 'sep', v: 'line' };
    if (tok.t === 'col') return { k: 'sep', v: 'col' };
    if (tok.t === 'num') return this.scripts({ k: 'num', v: tok.v });
    if (tok.t === 'heb') return this.scripts({ k: 'text', v: tok.v });
    if (tok.t === 'ch') {
      var c = tok.v;
      if (c === '{') { var g = this.seq('}'); this.next(); return this.scripts({ k: 'grp', items: g }); }
      if (c === '(' || c === '[') {
        var closeCh = c === '(' ? ')' : ']', items = this.seq(closeCh); this.next();
        return this.scripts({ k: 'br', open: c, items: items });
      }
      if (c === '|' || c === '‖') {
        var bars = this.seq(c); this.next();
        return this.scripts({ k: 'br', open: '|', items: bars });
      }
      if (/[A-Za-z]/.test(c)) return this.scripts({ k: 'id', base: c });
      if (c === 'Σ' || c === '∑') return { k: 'sum' };
      if (greekChars[c]) return this.scripts({ k: 'id', base: greekChars[c], greek: true });
      if (REL[c]) return { k: 'rel', v: REL[c] };
      if (BIN[c]) return { k: 'bin', v: BIN[c] };
      if (c === ',' || c === ';' || c === ':' || c === '.') return { k: 'punct', v: c };
      if (c === '%') return { k: 'word', v: 'percent' };
      if (c === '°') return { k: 'word', v: 'degrees' };
      if (c === "'" || c === '′') return { k: 'prime' };
      if (c === '!' ) return null;
      fail('UNKNOWN_CHAR', c);
    }
    if (tok.t === 'cmd') {
      var v = tok.v;
      // «d=20\ \mathrm{mm}\quad p=2.5\ \mathrm{mm}»: a wide space separates two statements
      if (v === 'quad' || v === 'qquad') return { k: 'sep', v: 'col' };
      if (SPACE_CMDS[v]) return null;
      // «\Sigma r_i» is the sum sign, not the letter
      if (v === 'Sigma') return { k: 'sum' };
      if (v === 'frac' || v === 'dfrac' || v === 'tfrac') { var a = this.arg(), b = this.arg(); return this.scripts({ k: 'frac', a: a, b: b }); }
      if (v === 'sqrt') {
        this.skipSpace();
        var idx = null, p = this.peek();
        if (p && p.t === 'ch' && p.v === '[') { this.next(); idx = this.seq(']'); this.next(); }
        return this.scripts({ k: 'sqrt', idx: idx, arg: this.arg() });
      }
      if (v === 'text' || v === 'mathrm' || v === 'operatorname' || v === 'mathit' || v === 'mathbf' || v === 'textrm') {
        var raw = this.rawArg();
        return this.scripts({ k: 'text', v: raw });
      }
      if (v === 'left' || v === 'right' || v === 'bigl' || v === 'bigr' || v === 'Bigl' || v === 'Bigr' || v === 'big' || v === 'Big') {
        var d = this.peek();
        if (d && d.t === 'ch' && d.v === '.') this.next();
        return null;
      }
      if (v === 'begin') { this.rawArg(); var q = this.peek(); if (q && q.t === 'ch' && q.v === '{') this.rawArg(); var body = this.seq('end'); this.next(); this.rawArg(); return { k: 'env', items: body }; }
      if (v === 'end') fail('PARSE', 'stray end');
      if (lex.greek && lex.greek[v] != null) return this.scripts({ k: 'id', base: v, greek: true });
      if (FUNCS[v]) return this.scripts({ k: 'fn', v: v });
      if (REL[v]) return { k: 'rel', v: REL[v] };
      if (BIN[v]) return { k: 'bin', v: BIN[v] };
      if (v === 'cdots' || v === 'ldots' || v === 'dots') return { k: 'word', v: 'etc' };
      if (v === 'circ') return { k: 'word', v: 'degrees' };
      if (v === 'prime') return { k: 'prime' };
      if (v === 'sum') return this.scripts({ k: 'word', v: 'sum' });
      if (v === 'Sigma' && false) return null;
      fail('UNKNOWN_COMMAND', v);
    }
    fail('PARSE', tok.t);
  };

  function parseTex(latex, lex) {
    // «\mu\mathrm{m}» is the unit µm, not μ times m
    latex = str(latex).replace(/\\mu\s*\\mathrm\{(m|in)\}/g, '\\mathrm{µ$1}');
    var p = new Parser(texTokens(latex), lex);
    var nodes = p.seq(null);
    return nodes;
  }

  // ---------------------------------------------------------------- nodes → Hebrew words
  var END = { END_FRAC: 'end_fraction', END_ROOT: 'end_root', END_BR: 'close' };

  function Reader(lex, ctx) { this.lex = lex; this.ctx = ctx || {}; this.ids = {}; }
  Reader.prototype.w = function (key) { var x = (this.lex.words || {})[key]; if (x == null) fail('LEXICON_MISSING', 'words.' + key); return x; };
  Reader.prototype.latinName = function (ch) {
    var name = (this.lex.latin || {})[ch.toUpperCase()];
    if (!name) fail('UNKNOWN_LETTER', ch);
    if (this.ctx.bothCases && this.ctx.bothCases[ch.toUpperCase()]) name += ' ' + this.w(ch === ch.toUpperCase() ? 'upper' : 'lower');
    return name;
  };
  Reader.prototype.spellLatin = function (word) {
    var self = this;
    return word.split('').map(function (ch) {
      if (/\d/.test(ch)) return ch;
      var n = (self.lex.latin || {})[ch.toUpperCase()];
      if (!n) fail('UNKNOWN_LETTER', ch);
      return n;
    }).join(' ');
  };
  // plain text of a node list (subscripts: «in», «1N», «lc», «t,in»)
  function flatText(nodes) {
    return (nodes || []).map(function (n) {
      if (n.k === 'id') return (n.greek ? '\\' + n.base + ' ' : n.base) + (n.sub ? '_' + flatText(n.sub) : '');
      if (n.k === 'num') return n.v;
      if (n.k === 'text') return n.v;
      if (n.k === 'punct') return n.v;
      if (n.k === 'bin') return n.v === 'minus' ? '-' : n.v === 'plus' ? '+' : '?';
      if (n.k === 'fn') return n.v;
      if (n.k === 'grp') return flatText(n.items);
      return '?';
    }).join('');
  }
  Reader.prototype.subscript = function (nodes) {
    var raw = flatText(nodes).trim(), lex = this.lex, self = this;
    if (!raw) return '';
    if (lex.subscripts && lex.subscripts[raw] != null) return lex.subscripts[raw];
    if (/^\d+(\.\d+)?$/.test(raw)) return raw;
    if (/^-?\d+(\.\d+)?$/.test(raw)) return this.w('negative') + ' ' + raw.slice(1);
    if (lex.hebrew && lex.hebrew[raw] != null) return lex.hebrew[raw];
    if (/[?]/.test(raw) || /\\/.test(raw)) return this.seq(nodes, true);
    return raw.split(/([,\s]+)/).map(function (part) {
      if (!part.trim()) return '';
      if (/^,/.test(part.trim())) return ',';
      if (lex.subscripts && lex.subscripts[part] != null) return lex.subscripts[part];
      if (lex.hebrew && lex.hebrew[part] != null) return lex.hebrew[part];
      if (/^[א-ת]/.test(part)) fail('UNKNOWN_HEBREW', part);
      return part.match(/\d+|[A-Za-z]/g).map(function (x) { return /\d/.test(x) ? x : self.spellLatin(x); }).join(' ');
    }).join(' ').replace(/\s+,/g, ',');
  };
  Reader.prototype.idKey = function (n) { return (n.greek ? '\\' : '') + n.base + '_' + flatText(n.sub || []) + "'".repeat(n.prime || 0); };
  Reader.prototype.ident = function (n) {
    this.ids[this.idKey(n)] = true;
    var name = n.greek ? (this.lex.greek || {})[n.base] : this.latinName(n.base);
    if (!name) fail('UNKNOWN_GREEK', n.base);
    var out = [name];
    if (n.prime) out.push(this.w(n.prime > 1 ? 'double_prime' : 'prime'));
    if (n.sub && n.sub.length) out.push(this.subscript(n.sub));
    return out.join(' ');
  };
  Reader.prototype.signed = function (x) {
    x = str(x).trim();
    if (/^\+/.test(x)) return this.w('plus_sign') + ' ' + x.slice(1);
    if (/^[\-−]/.test(x)) return this.w('negative') + ' ' + x.slice(1);
    if (!/^\d+(\.\d+)?$/.test(x)) fail('PARSE', 'deviation ' + x);
    return x;
  };
  Reader.prototype.power = function (sup) {
    var raw = flatText(sup).trim();
    if (sup.length === 1 && sup[0].k === 'word' && sup[0].v === 'degrees') return this.w('degrees');
    if (sup.length === 1 && sup[0].k === 'prime') return this.w('prime');
    // «X_d^u», «X^l»: an upper/lower label, not a power
    if (/^[ul]$/.test(raw)) return this.latinName(raw);
    if (raw === '2') return this.w('squared');
    if (raw === '3') return this.w('cubed');
    if (/^-?\d+(\.\d+)?$/.test(raw)) return this.w('power') + ' ' + (raw[0] === '-' ? this.w('negative') + ' ' + raw.slice(1) : raw);
    return this.w('power') + ' ' + this.seq(sup);
  };
  function isDeviation(nodes) { return /^[+\-−]?\d+(\.\d+)?$/.test(flatText(nodes).trim()); }
  // «(\pi/4)», «(b/2)»: one ratio of two simple terms needs no bracket words
  function isPlainRatio(nodes) {
    var v = (nodes || []).filter(function (n) { return n.k !== 'sep'; });
    return v.length === 3 && v[1].k === 'bin' && v[1].v === 'over' && isSimple([v[0]]) && isSimple([v[2]]);
  }
  function isSimple(nodes) {
    var vals = (nodes || []).filter(function (n) { return n.k !== 'sep'; });
    if (vals.length !== 1) return false;
    var n = vals[0];
    if (n.k === 'grp') return isSimple(n.items);
    return (n.k === 'num' || n.k === 'id' || n.k === 'text') && !(n.sup && !(n.sup.length === 1 && (n.sup[0].k === 'word' || n.sup[0].k === 'prime')) && flatText(n.sup) !== '2');
  }
  Reader.prototype.text = function (n) {
    var v = n.v, lex = this.lex, self = this;
    if (lex.units && lex.units[v] != null && !/^[A-Za-z]$/.test(v)) return lex.units[v];
    if (/^[A-Za-z]$/.test(v)) return this.latinName(v);
    if (lex.hebrew && lex.hebrew[v] != null) return lex.hebrew[v];
    if (lex.acronyms && lex.acronyms[v] != null) return lex.acronyms[v];
    if (lex.english && lex.english[v] != null) return lex.english[v];
    if (lex.functions && lex.functions[v] != null) return lex.functions[v];
    if (/\s/.test(v)) return v.split(' ').map(function (part) { return self.text({ v: part }); }).join(' ');
    if (/^[א-ת]/.test(v)) fail('UNKNOWN_HEBREW', v);
    fail('UNKNOWN_TEXT', v);
  };
  Reader.prototype.isFnText = function (n) {
    if (n.k === 'fn') return true;
    if (n.k !== 'text') return false;
    var f = this.lex.functions || {};
    return n.v.split(' ').every(function (x) { return f[x] != null; });
  };
  // One value-like node.
  Reader.prototype.value = function (n, out) {
    var lex = this.lex, w = this.w.bind(this);
    switch (n.k) {
      case 'num':
        out.push(n.v);
        // «30_{-0.2}^{0}», «12^{+0.2}»: the deviations of a toleranced size, not a power
        // (a power is «10^{-6}»: a whole number; a deviation has a «+» or a decimal point)
        if ((n.sub && isDeviation(n.sub)) || (n.sup && isDeviation(n.sup) && (n.sub || /^\+|\./.test(flatText(n.sup))))) {
          if (n.sup) out.push(w('tol_upper') + ' ' + this.signed(flatText(n.sup)));
          if (n.sub) out.push(w('tol_lower') + ' ' + this.signed(flatText(n.sub)));
          return;
        }
        if (n.sub) out.push(this.subscript(n.sub));                     // «50_{max}» in a dimension chain
        break;
      case 'id': out.push(this.ident(n)); break;
      case 'text': out.push(this.text(n)); break;
      case 'unit': out.push(lex.units[n.v]); return;
      case 'word': out.push(w(n.v)); break;
      case 'grp': out.push(this.seq(n.items)); break;
      case 'env': out.push(this.seq(n.items)); return;
      case 'frac':
        if (isSimple(n.a) && isSimple(n.b)) out.push(this.seq(n.a) + ' ' + w('over') + ' ' + this.seq(n.b));
        else out.push(w('fraction') + ', ' + w('numerator') + ' ' + this.seq(n.a) + ', ' + w('denominator') + ' ' + this.seq(n.b), 'END_FRAC');
        break;
      case 'sqrt':
        var head = n.idx ? (flatText(n.idx) === '3' ? w('cbrt') : w('root_n') + ' ' + this.seq(n.idx) + ' ' + w('of')) : w('sqrt');
        out.push(head + ' ' + this.seq(n.arg));
        if (!isSimple(n.arg)) out.push('END_ROOT');
        break;
      case 'br':
        if (n.open === '[' && isSimple(n.items) && n.items[0].k === 'id') { out.push(this.ident(n.items[0]) + ' ' + w('allowed')); break; }
        if (n.open === '[' && isSimple(n.items) && n.items[0].k === 'text' && lex.units[n.items[0].v] != null) { out.push(lex.units[n.items[0].v]); break; }
        // «(b/2)^2» keeps the bracket words: without them it would be b over two squared
        if (isSimple(n.items) || (isPlainRatio(n.items) && !(n.sup && n.sup.length))) { out.push(this.seq(n.items)); break; }
        out.push(w('open') + ', ' + this.seq(n.items), 'END_BR');
        break;
      default: fail('PARSE', 'value ' + n.k);
    }
    if (n.sup && n.sup.length) out.push(this.power(n.sup));
    if (n.prime && n.k !== 'id') out.push(w('prime'));
  };
  function isValue(n) { return ['num', 'id', 'text', 'grp', 'frac', 'sqrt', 'br', 'fn', 'unit', 'env'].indexOf(n.k) >= 0 || (n.k === 'word' && n.v !== 'etc' && n.v !== 'percent' && n.v !== 'degrees'); }
  Reader.prototype.seq = function (nodes, inSub) {
    var out = [], prev = null, w = this.w.bind(this);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.k === 'sep') { out.push(n.v === 'line' ? '.' : ','); prev = null; continue; }
      if (n.k === 'punct') { out.push(n.v); prev = null; continue; }
      if (n.k === 'rel') { out.push(w(n.v)); prev = 'op'; continue; }
      if (n.k === 'bin') {
        if (n.v === 'minus' && (prev === null || prev === 'op')) out.push(w('negative'));
        else out.push(w(n.v));
        prev = 'op'; continue;
      }
      if (n.k === 'prime') { out.push(w('prime')); continue; }
      if (n.k === 'sum') { if (prev === 'value') out.push(w('times')); out.push(w('sum')); prev = null; continue; }
      if (n.k === 'word' && (n.v === 'etc' || n.v === 'percent' || n.v === 'degrees')) { out.push(w(n.v)); prev = 'value'; continue; }
      if (this.isFnText(n)) {
        var name = n.k === 'fn' ? this.lex.functions[n.v] : this.text(n);
        if (n.sup && flatText(n.sup) === '-1') {
          var arc = (this.lex.functions || {})['arc' + (n.k === 'fn' ? n.v : n.v.split(' ').pop())];
          if (!arc) fail('UNKNOWN_FUNCTION', 'inverse ' + n.v);
          name = arc;
        } else if (n.sup && n.sup.length) name += ' ' + this.power(n.sup);
        if (prev === 'value') out.push(w('times'));
        out.push(name);
        if (prev === 'fnname') prev = null;
        if (n.sub && n.sub.length) out.push(this.subscript(n.sub));
        var argNode = nodes[i + 1];
        // «Shift sin [ … ]»: a function name before another one is part of its name
        if (argNode && this.isFnText(argNode)) { prev = 'fnname'; continue; }
        if (argNode && argNode.k !== 'rel' && argNode.k !== 'bin' && argNode.k !== 'sep' && argNode.k !== 'punct') {
          i++;
          // «cos 30°»: the argument keeps its own degree mark
          this.value(argNode, out);
        }
        prev = 'value'; continue;
      }
      if (!isValue(n)) fail('PARSE', 'node ' + n.k);
      if (prev === 'value') {
        var last = nodes[i - 1];
        // «4Q», «1.4a», «0.4π» are read as said; «2 · 14.7/10.9» needs the word
        var unitBr = n.k === 'br' && n.open === '[' && isSimple(n.items) && n.items[0].k === 'text' && (this.lex.units || {})[n.items[0].v] != null;
        if (!(last && last.k === 'num' && !last.sup && !last.sub && n.k === 'id') && n.k !== 'unit' && !unitBr) out.push(w('times'));
      }
      this.value(n, out);
      prev = n.k === 'unit' ? 'value' : 'value';
    }
    // closing words are dropped when nothing but a relation, a separator or the end follows them
    var words = [];
    for (var j = 0; j < out.length; j++) {
      var x = out[j];
      if (END[x]) {
        var k = j + 1;
        while (k < out.length && END[out[k]]) k++;
        var after = out[k];
        var tail = after == null || after === '.' || after === ',' || after === ';' || after === ':' ||
          ['equals', 'approx', 'le', 'ge', 'lt', 'gt', 'neq', 'gives'].some(function (r) { return (this.lex.words || {})[r] === after; }, this);
        if (!tail) words.push(this.w(END[x]) + ',');
        continue;
      }
      words.push(x);
    }
    return tidy(words.join(' '));
  };
  function tidy(s) {
    return str(s).replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').replace(/([.,;:])(?=[.,;:])/g, '').replace(/^[\s.,;:]+/, '').replace(/[,;:\s]+$/, '').trim();
  }

  function walk(nodes, fn) {
    (nodes || []).forEach(function (n) {
      fn(n);
      ['items', 'a', 'b', 'arg', 'idx', 'sup'].forEach(function (k) { if (Array.isArray(n[k])) walk(n[k], fn); });
    });
  }
  function hasValue(nodes) {
    var found = false;
    walk(nodes, function (n) { if (['num', 'id', 'text', 'frac', 'sqrt', 'unit', 'fn'].indexOf(n.k) >= 0) found = true; });
    return found;
  }
  // «D גדולה / d קטנה» only when the formula has both as symbols (not inside a unit or an index)
  function bothCases(nodes) {
    var seen = {}, both = {};
    walk(nodes, function (n) { if (n.k === 'id' && !n.greek) seen[n.base] = true; });
    Object.keys(seen).forEach(function (c) { var u = c.toUpperCase(), l = c.toLowerCase(); if (u !== l && seen[u] && seen[l]) both[u] = true; });
    return both;
  }

  function formulaSpeech(item, lex) {
    var latex = str(item.latex).trim();
    if (!latex) fail('EMPTY');
    var nodes = parseTex(latex, lex);
    if (!hasValue(nodes)) fail('NOTHING_TO_READ');
    var ctx = { bothCases: bothCases(nodes) };
    var reader = new Reader(lex, ctx);
    var main = reader.seq(nodes);
    if (!/[א-ת]/.test(main)) fail('NO_HEBREW_OUTPUT');
    // «where …»: the symbols of this formula the book explains, with their units
    var where = [], said = {};
    (item.vars || []).forEach(function (v) {
      var desc = squash(v.he);
      if (!desc || !/[א-ת]/.test(desc)) return;
      try {
        var vn = parseTex(str(v.latex), lex).filter(function (n) { return n.k !== 'sep'; });
        if (vn.length === 1 && vn[0].k === 'br' && vn[0].items.length === 1) vn = vn[0].items;
        if (vn.length !== 1 || vn[0].k !== 'id') return;
        var r2 = new Reader(lex, ctx);
        var key = r2.idKey(vn[0]);
        if (!reader.ids[key] || said[key]) return;
        said[key] = true;
        var name = r2.ident(vn[0]);
        var text = proseSpeech(desc, lex);
        var unit = squash(v.unit);
        var unitWords = unit ? (lex.units || {})[unit] : '';
        if (unit && unitWords == null) return;
        where.push(name + ' – ' + text + (unitWords ? ', ' + unitWords : ''));
      } catch (e) { if (!e.speech) throw e; }
    });
    var text = main + '.';
    if (where.length) text += ' ' + reader.w('where') + ': ' + where.join('; ') + '.';
    return squash(text);
  }

  // ---------------------------------------------------------------- prose: Hebrew text with notation inside
  var CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  var SUBS = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    'ₐ': 'a', 'ₑ': 'e', 'ᵢ': 'i', 'ₙ': 'n', 'ᵣ': 'r', 'ᵧ': 'y', 'ₛ': 's', '꜀': 'c', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₚ': 'p', 'ₜ': 't' };
  var SUPS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', 'ˣ': 'x' };
  var DECOR = /[•▪✳✅💡📐📌📍○◦●■□▫◆◇★☆✔✓➤►▶◀️‍]/g;

  function isGloss(inner, lex) {
    // «(nin·Zin²·λ)», «(F/i)» are symbols; «(reducer)», «(Lead)», «(Hub)» are English names
    if (/[·∙=\/+−×*^²³_0-9α-ωΑ-Ω\[\]]/.test(inner)) return false;
    var words = inner.match(/[A-Za-z]+/g) || [];
    return words.some(function (wd) {
      if ((lex.units || {})[wd] != null || (lex.acronyms || {})[wd] != null || (lex.functions || {})[wd] != null || (lex.english || {})[wd] != null) return false;
      if ((lex.subscripts || {})[wd.slice(1)] != null) return false;          // «Ctot», «Hin», «vout»
      if (wd.length === 3) return /^[A-Z][a-z]{2}$/.test(wd);
      return wd.length >= 4 && /[a-z]{3}/.test(wd);
    });
  }

  // a run of notation inside Hebrew text: «σy», «Din», «d1=14.0», «N/mm²», «8÷12», «M16», «n_rot», «n⟦0⟧» (a Hebrew index)
  function inlineSpeech(run, lex, prevIsNumber, heb) {
    var units = lex.units || {}, subs = lex.subscripts || {}, out = [], i = 0, s = run, prev = prevIsNumber ? 'num' : null;
    var w = function (k) { var x = lex.words[k]; if (x == null) fail('LEXICON_MISSING', 'words.' + k); return x; };
    var reader = new Reader(lex, {});
    var opens = [];
    function unitAt(pos) {
      for (var len = Math.min(12, s.length - pos); len > 0; len--) {
        var cand = s.substr(pos, len);
        if (units[cand] != null) return /[A-Za-z]/.test(s[pos + len] || '') ? null : cand;
      }
      return null;
    }
    function subWord(x) {
      if (subs[x] != null) return subs[x];
      if (/^\d+$/.test(x)) return x;
      return x.match(/\d+|[A-Za-z]/g).map(function (y) { return /\d/.test(y) ? y : reader.spellLatin(y); }).join(' ');
    }
    // «_rot», «_1», «_⟦0⟧» after a symbol
    function underscore() {
      if (s[i] !== '_') return;
      var m2 = /^_(?:⟦(\d+)⟧|\{([A-Za-z0-9,]+)\}|([A-Za-z0-9]+))/.exec(s.slice(i));
      if (!m2) fail('INLINE_UNKNOWN', '_');
      i += m2[0].length;
      if (m2[1] != null) out.push(heb[Number(m2[1])]);
      else out.push(subWord(m2[2] || m2[3]));
    }
    function times() { if (prev === 'id' || prev === 'val' || prev === 'num') out.push(w('times')); }
    while (i < s.length) {
      var c = s[i], m, rest = s.slice(i);
      if (/\s/.test(c)) {
        i++;
        if (/^[-–—]\s/.test(s.slice(i))) { out.push('–'); i += 2; prev = 'op'; }
        continue;
      }
      if ((m = /^\d+(?:[.,]\d+)*/.exec(rest))) {
        if (prev === 'id' || prev === 'num' || prev === 'val') out.push(w('times'));
        out.push(m[0].replace(',', '.')); i += m[0].length; prev = 'num';
        var u0 = unitAt(i);
        if (u0) { out.push(units[u0]); i += u0.length; prev = 'val'; }
        continue;
      }
      if ((m = /^[A-Za-z]+(?:\.[A-Za-z](?:\.[A-Za-z])*)?/.exec(rest))) {
        var word = m[0];
        var u = unitAt(i);
        if (u && (prev === 'num' || (lex.unit_after_number_only || []).indexOf(u) < 0) && u.length >= word.length) { out.push(units[u]); i += u.length; prev = 'val'; continue; }
        i += word.length;
        times();
        if (lex.acronyms[word] != null) { out.push(lex.acronyms[word]); prev = 'val'; continue; }
        if (lex.english && lex.english[word] != null) { out.push(lex.english[word]); prev = 'val'; continue; }
        if (lex.functions[word] != null) { out.push(lex.functions[word]); prev = 'fn'; continue; }
        if (/\./.test(word)) fail('INLINE_UNKNOWN', word);
        if (word.length === 1) out.push(reader.latinName(word));
        else if (/^[A-Z]{2,}$/.test(word)) out.push(reader.spellLatin(word));
        else if (word.length <= 4 || subs[word.slice(1)] != null) out.push(reader.latinName(word[0]) + ' ' + subWord(word.slice(1)));
        else fail('INLINE_UNKNOWN', word);
        prev = 'id';
        // digits glued to a symbol are its index: «d1», «N10», «Z2»
        if ((m = /^\d+/.exec(s.slice(i)))) { out.push(m[0]); i += m[0].length; }
        underscore();
        continue;
      }
      var g = (lex.greek_chars || {})[c];
      if (g) {
        var ug = unitAt(i);
        if (ug) { out.push(units[ug]); i += ug.length; prev = "val"; continue; }
        i++;
        times();
        var name = lex.greek[g];
        if (g === 'Delta' && /^[A-Za-z]/.test(s.slice(i))) { out.push(name); prev = 'op'; continue; }
        var subm = /^[A-Za-z]{1,3}(?![A-Za-z])/.exec(s.slice(i));
        if (subm) { name += ' ' + subWord(subm[0]); i += subm[0].length; }
        out.push(name); prev = 'id';
        underscore();
        continue;
      }
      if (c === '⟦') { var hm = /^⟦(\d+)⟧/.exec(rest); out.push(heb[Number(hm[1])]); i += hm[0].length; continue; }
      if (c === '_') { underscore(); continue; }
      if (SUBS[c]) { var sb = ''; while (i < s.length && SUBS[s[i]]) sb += SUBS[s[i++]]; out.push(subWord(sb)); continue; }
      if (SUPS[c]) {
        var sp = ''; while (i < s.length && SUPS[s[i]]) sp += SUPS[s[i++]];
        if (prev === null || prev === 'op') continue;               // a footnote mark after a word
        if (sp === '2') out.push(w('squared')); else if (sp === '3') out.push(w('cubed'));
        else if (sp === 'x') out.push(w('power') + ' ' + reader.latinName('x'));
        else if (/^-?\d+$/.test(sp)) out.push(w('power') + ' ' + (sp[0] === '-' ? w('negative') + ' ' + sp.slice(1) : sp));
        else fail('INLINE_UNKNOWN', sp);
        continue;
      }
      if (units[c] != null && !/[A-Za-z]/.test(c)) { out.push(units[c]); i++; prev = 'val'; continue; }
      i++;
      if (c === "'" || c === '′') { out.push(w('prime')); continue; }
      if (c === '=') { out.push(w('equals')); prev = 'op'; continue; }
      if (c === '≈' || c === '≅') { out.push(w('approx')); prev = 'op'; continue; }
      if (c === '≤') { out.push(w('le')); prev = 'op'; continue; }
      if (c === '≥') { out.push(w('ge')); prev = 'op'; continue; }
      if (c === '<') { out.push(w('lt')); prev = 'op'; continue; }
      if (c === '>') { out.push(w('gt')); prev = 'op'; continue; }
      if (c === '±') { out.push(w('plusminus')); prev = 'op'; continue; }
      if (c === '+') { out.push(w('plus')); prev = 'op'; continue; }
      if (c === '−' || c === '-' || c === '–' || c === '—') { out.push(prev === null || prev === 'op' ? w('negative') : w('minus')); prev = 'op'; continue; }
      if (c === '·' || c === '∙' || c === '×' || c === '*') { out.push(w('times')); prev = 'op'; continue; }
      if (c === '/') { out.push(w('over')); prev = 'op'; continue; }
      if (c === '÷') { out.push(w('to')); prev = 'op'; continue; }
      if (c === '→') { out.push(w('gives')); prev = 'op'; continue; }
      if (c === '←') { out.push(w('comes_from')); prev = 'op'; continue; }
      if (c === '√') { times(); out.push(w('sqrt')); prev = 'op'; continue; }
      if (c === '∑' || c === 'Σ') { times(); out.push(w('sum')); prev = 'op'; continue; }
      if (c === '∅' || c === 'Ø') { out.push(w('diameter')); prev = 'op'; continue; }
      if (c === '(') { times(); opens.push(out.length); out.push('('); prev = 'op'; continue; }
      if (c === ')') {
        if (!opens.length) continue;                                 // its «(» stayed on the other side of a Hebrew word
        var at = opens.pop(); out.push(')');
        // a group with an operator inside is read with brackets; a bare symbol is not
        var inner = out.slice(at + 1, out.length - 1).join(' ');
        var ops = ['plus', 'minus', 'times', 'over', 'negative', 'equals'].reduce(function (sum, k) { return sum + inner.split(w(k)).length - 1; }, 0);
        // «(π/4)» is said without the bracket words, like a printed ratio
        var hasOp = ops > 1 || (ops === 1 && (inner.indexOf(w('over')) < 0 || !!SUPS[s[i]]));
        out[at] = hasOp ? w('open') + ',' : ''; out[out.length - 1] = hasOp ? ', ' + w('close') : '';
        prev = 'val'; continue;
      }
      if (c === '[') {
        var close = s.indexOf(']', i);
        if (close < 0) continue;                                     // «≤[τS» — closed after a Hebrew word
        times();
        out.push(inlineSpeech(s.slice(i, close), lex, false, heb) + ' ' + w('allowed'));
        i = close + 1; prev = 'val'; continue;
      }
      if (c === ']' || c === '"' || c === '“' || c === '”' || c === '«' || c === '»') continue;
      if (c === ',' || c === ';' || c === ':' || c === '.' || c === '!' || c === '?') { out.push(c); prev = 'op'; continue; }
      fail('INLINE_UNKNOWN', c);
    }
    opens.forEach(function (at) { out[at] = ''; });                // «(t» whose «)» is after a Hebrew word
    return tidy(out.join(' '));
  }

  // a stretch of Latin words with nothing to compute — «High-Speed Steel)», «(Lead)» — is the English name the book
  // gives after the Hebrew term; the Hebrew voice does not read it
  function isGlossStretch(s, lex) {
    if (/[\d=<>≤≥±·∙×√∑Σ_\[\]⟦]/.test(s) || /[α-ωΑ-Ω]/.test(s)) return false;
    if (!/^[A-Za-z\s.,:;'’\-–—\/&()]+$/.test(s)) return false;
    var words = s.match(/[A-Za-z]+/g) || [];
    if (!words.length) return false;
    var known = function (wd) { return (lex.english || {})[wd] != null || (lex.functions || {})[wd] != null || (lex.units || {})[wd] != null; };
    if (words.every(known)) return false;
    return isGloss(words.filter(function (wd) { return !known(wd); }).join(' '), lex) || words.length > 1 && words.some(function (wd) { return /[a-z]{3}/.test(wd) && !known(wd); });
  }

  function proseSpeech(text, lex) {
    var heb = [];
    var t = str(text).normalize('NFC')
      .replace(/[​-‏‪-‮⁦-⁩]/g, '')
      .replace(/[֑-֯]/g, '')                                   // cantillation
      .replace(/[\u{1D400}-\u{1D7FF}]/gu, function (c) { return c.normalize('NFKC'); })
      .replace(DECOR, ' ')
      .replace(/[①-⑳]/g, function (c) { return ' ' + (CIRCLED.indexOf(c) + 1) + ' '; })
      .replace(/[|]/g, ', ')
      .replace(/…/g, '...')
      // a Hebrew index glued to a symbol — «nגְּזִירָה» — is the symbol's subscript
      .replace(/([A-Za-zα-ω])_?([א-ת][֐-׿]*)/g, function (all, sym, word) { heb.push(word); return sym + '_⟦' + (heb.length - 1) + '⟧'; });
    // an English gloss in brackets after the Hebrew term — «(reducer)» — is not read
    t = t.replace(/\s*\(([^()֐-׿⟦]*)\)/g, function (all, inner) { return isGloss(inner, lex) ? '' : all; });
    var parts = t.match(/[֐-׿יִ-ﭏ]+(?:["'׳״][֐-׿]+)*|\s+|[^\s֐-׿יִ-ﭏ]+/g) || [];
    // notation interrupted only by spaces is one stretch: «dS = √(F/((π/4)·[τS]·n⟦0⟧·i))»
    var stretches = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (/^\s+$/.test(p) || /[֐-׿]/.test(p) || /^[—–]$/.test(p)) { stretches.push(p); continue; }
      var j = i, acc = p;
      while (j + 2 < parts.length && /^\s+$/.test(parts[j + 1]) && !/[֐-׿]/.test(parts[j + 2]) && !/^[—–]$/.test(parts[j + 2]) && !/^[(\[“"«„]+$/.test(parts[j + 2])) { acc += ' ' + parts[j + 2]; j += 2; }
      stretches.push({ n: acc });
      i = j;
    }
    var out = [], prevNum = false, prevHeb = false;
    for (var k = 0; k < stretches.length; k++) {
      var st = stretches[k];
      if (typeof st === 'string') {
        if (/^\s+$/.test(st)) { out.push(' '); continue; }
        if (/^[—–]$/.test(st)) { out.push('–'); prevNum = false; prevHeb = false; continue; }
        out.push(st); prevNum = false; prevHeb = true; continue;
      }
      var s = st.n;
      // «הניחו: η=0.8» — the colon belongs to the Hebrew words before it
      var lp = /^[.,:;!?]+/.exec(s);
      if (lp) { out.push(lp[0]); s = s.slice(lp[0].length); if (!s.trim()) continue; out.push(' '); s = s.trim(); }
      // «יוגדר "+" (חיובי)»: a sign in quotes is named
      if (/^["“”«»']?[+−-]["“”«»']?$/.test(s)) { out.push(/\+/.test(s) ? lex.words.plus_sign : lex.words.negative); prevHeb = false; continue; }
      var lead =/^[(\[“"«„]+/.exec(s), trail = /[)\]”"».,:;!?]+$/.exec(s);
      var core = s.slice(lead ? lead[0].length : 0, trail ? s.length - trail[0].length : s.length);
      var trailText = trail ? trail[0] : '';
      // «(Mt)» drops both brackets; «f(x)» keeps its own
      var opens = (core.match(/\(/g) || []).length, closes = (core.match(/\)/g) || []).length;
      while (opens > closes && /\)/.test(trailText)) { core += ')'; trailText = trailText.replace(')', ''); closes++; }
      var joiner = '';
      if (prevHeb && out[out.length - 1] !== ' ' && /^[-־]/.test(core)) { joiner = '-'; core = core.slice(1); }
      var punct = str(trailText).replace(/[)\]”"»]/g, '');
      if (!core || isGlossStretch(core, lex)) { if (punct) out.push(punct); continue; }
      if (/^[-−]?\d+(?:[.,]\d+)*$/.test(core)) { out.push(joiner + core.replace(/^[−-]/, lex.words.negative + ' ')); prevNum = true; }
      else { out.push(joiner + inlineSpeech(core, lex, prevNum, heb)); prevNum = false; }
      prevHeb = false;
      if (punct) out.push(punct);
    }
    var said = tidy(out.join('').replace(/\(\s*\)/g, ''));
    if (!/[א-ת]/.test(said)) fail('NOTHING_TO_READ');   // «1», «)», an English-only heading
    return said;
  }

  function blockSpeech(item, lex) {
    if (!str(item.he_niqqud).trim()) fail('NO_NIQQUD');
    return squash(proseSpeech(item.he_niqqud, lex));
  }

  // The text the voice reads, or the reason there is none. overrides: { items: { <id>: { exclude, text, reason } } }
  function speak(item, lex, overrides) {
    var o = overrides && overrides.items && overrides.items[item.id];
    if (o && o.exclude) return { ok: false, reason: 'EXCLUDED' + (o.reason ? ':' + o.reason : '') };
    if (o && o.text) return { ok: true, text: squash(o.text), override: true };
    if (!readable(item)) return { ok: false, reason: item.type === 'block' && READ_KINDS.indexOf(item.kind) >= 0 ? 'NO_NIQQUD' : 'NOT_READ' };
    try {
      return { ok: true, text: item.type === 'formula' ? formulaSpeech(item, lex) : blockSpeech(item, lex) };
    } catch (e) {
      if (!e.speech) throw e;
      // NOTHING_TO_READ is not a gap in the recordings: the reader shows nothing to listen to there either
      return { ok: false, reason: e.message, skip: /^NOTHING_TO_READ/.test(e.message) };
    }
  }

  var api = { CONTRACT: CONTRACT, READ_KINDS: READ_KINDS, readable: readable, sourceOf: sourceOf, speak: speak,
    formulaSpeech: formulaSpeech, blockSpeech: blockSpeech, proseSpeech: proseSpeech, parseTex: parseTex };
  root.AtlasSpeech = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
