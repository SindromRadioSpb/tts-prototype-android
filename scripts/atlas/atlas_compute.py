"""Compute grammar for atlas formulas (linguistpro.atlas-content-pack 1.0.0).

A small, safe expression language: numbers, variables, + - * / ^, unary minus,
parentheses, constants pi and e, and a fixed list of functions. No eval().
Trigonometry needs an explicit angle unit ("deg" or "rad").
"""
import math
import re

__all__ = ['ComputeError', 'parse', 'variables', 'uses_trig', 'evaluate', 'matches_printed']

CONSTANTS = {'pi': math.pi, 'e': math.e}
FORWARD_TRIG = {'sin': math.sin, 'cos': math.cos, 'tan': math.tan}
INVERSE_TRIG = {'asin': math.asin, 'acos': math.acos, 'atan': math.atan, 'atan2': math.atan2}
PLAIN = {'sqrt': math.sqrt, 'abs': abs, 'exp': math.exp, 'ln': math.log, 'log10': math.log10,
         'pow': math.pow, 'min': min, 'max': max}
ARITY = {'sqrt': 1, 'abs': 1, 'exp': 1, 'ln': 1, 'log10': 1, 'pow': 2, 'min': (2, None), 'max': (2, None),
         'sin': 1, 'cos': 1, 'tan': 1, 'asin': 1, 'acos': 1, 'atan': 1, 'atan2': 2}
FUNCTIONS = set(ARITY)

TOKEN = re.compile(r'\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(.))')


class ComputeError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _tokens(expr):
    out = []
    pos = 0
    expr = expr.strip()
    while pos < len(expr):
        m = TOKEN.match(expr, pos)
        if not m or m.end() == pos:
            raise ComputeError('SYNTAX', f'cannot read at {pos}')
        num, name, op = m.groups()
        if num is not None:
            out.append(('num', float(num)))
        elif name is not None:
            out.append(('name', name))
        elif op in '+-*/^(),':
            out.append(('op', op))
        elif op.strip():
            raise ComputeError('SYNTAX', f'unexpected character {op!r}')
        pos = m.end()
    out.append(('end', None))
    return out


class _Parser:
    """Recursive descent: sum := term (('+'|'-') term)*; term := unary (('*'|'/') unary)*;
    unary := '-' unary | power; power := atom ('^' unary)?  (right-assoc, binds tighter than unary minus)."""

    def __init__(self, expr):
        self.toks = _tokens(expr)
        self.i = 0

    def peek(self):
        return self.toks[self.i]

    def take(self, kind=None, value=None):
        tok = self.toks[self.i]
        if (kind and tok[0] != kind) or (value is not None and tok[1] != value):
            raise ComputeError('SYNTAX', f'expected {value or kind}, got {tok[1]!r}')
        self.i += 1
        return tok

    def parse(self):
        node = self.sum()
        if self.peek()[0] != 'end':
            raise ComputeError('SYNTAX', f'unexpected {self.peek()[1]!r}')
        return node

    def sum(self):
        node = self.term()
        while self.peek() in (('op', '+'), ('op', '-')):
            op = self.take()[1]
            node = ('bin', op, node, self.term())
        return node

    def term(self):
        node = self.unary()
        while self.peek() in (('op', '*'), ('op', '/')):
            op = self.take()[1]
            node = ('bin', op, node, self.unary())
        return node

    def unary(self):
        if self.peek() == ('op', '-'):
            self.take()
            return ('neg', self.unary())
        if self.peek() == ('op', '+'):
            self.take()
            return self.unary()
        return self.power()

    def power(self):
        base = self.atom()
        if self.peek() == ('op', '^'):
            self.take()
            return ('bin', '^', base, self.unary())
        return base

    def atom(self):
        kind, value = self.peek()
        if kind == 'num':
            self.take()
            return ('num', value)
        if kind == 'name':
            self.take()
            if self.peek() == ('op', '('):
                if value not in FUNCTIONS:
                    raise ComputeError('UNKNOWN_FUNCTION', f'function {value!r} is not in the grammar')
                self.take()
                args = [] if self.peek() == ('op', ')') else [self.sum()]
                while self.peek() == ('op', ','):
                    self.take()
                    args.append(self.sum())
                self.take('op', ')')
                _check_arity(value, len(args))
                return ('call', value, tuple(args))
            if value in FUNCTIONS:
                raise ComputeError('SYNTAX', f'function {value!r} needs arguments')
            if value.startswith('_'):
                raise ComputeError('SYNTAX', f'bad identifier {value!r}')
            return ('const', value) if value in CONSTANTS else ('var', value)
        if (kind, value) == ('op', '('):
            self.take()
            node = self.sum()
            self.take('op', ')')
            return node
        raise ComputeError('SYNTAX', f'unexpected {value!r}')


def _check_arity(name, count):
    want = ARITY[name]
    ok = count >= want[0] if isinstance(want, tuple) else count == want
    if not ok:
        raise ComputeError('ARITY', f'{name} takes {want} arguments, got {count}')


def parse(expr):
    if not isinstance(expr, str) or not expr.strip():
        raise ComputeError('SYNTAX', 'empty expression')
    return _Parser(expr).parse()


def _walk(node):
    yield node
    if node[0] == 'bin':
        yield from _walk(node[2])
        yield from _walk(node[3])
    elif node[0] == 'neg':
        yield from _walk(node[1])
    elif node[0] == 'call':
        for arg in node[2]:
            yield from _walk(arg)


def variables(expr):
    return {n[1] for n in _walk(parse(expr)) if n[0] == 'var'}


def uses_trig(expr):
    return any(n[0] == 'call' and (n[1] in FORWARD_TRIG or n[1] in INVERSE_TRIG) for n in _walk(parse(expr)))


def _eval(node, env, unit):
    kind = node[0]
    if kind == 'num':
        return node[1]
    if kind == 'const':
        return CONSTANTS[node[1]]
    if kind == 'var':
        if node[1] not in env:
            raise ComputeError('UNKNOWN_VARIABLE', f'no value for {node[1]!r}')
        return float(env[node[1]])
    if kind == 'neg':
        return -_eval(node[1], env, unit)
    if kind == 'bin':
        a, b = _eval(node[2], env, unit), _eval(node[3], env, unit)
        op = node[1]
        try:
            if op == '+':
                return a + b
            if op == '-':
                return a - b
            if op == '*':
                return a * b
            if op == '/':
                return a / b
            return math.pow(a, b)
        except (ZeroDivisionError, ValueError, OverflowError) as exc:
            raise ComputeError('DOMAIN', f'{op}: {exc}') from exc
    name, args = node[1], [_eval(a, env, unit) for a in node[2]]
    try:
        if name in FORWARD_TRIG:
            return FORWARD_TRIG[name](math.radians(args[0]) if unit == 'deg' else args[0])
        if name in INVERSE_TRIG:
            value = INVERSE_TRIG[name](*args)
            return math.degrees(value) if unit == 'deg' else value
        if name in ('ln', 'log10') and args[0] <= 0:
            raise ValueError('logarithm of a non-positive number')
        return float(PLAIN[name](*args))
    except (ValueError, OverflowError, ZeroDivisionError) as exc:
        raise ComputeError('DOMAIN', f'{name}: {exc}') from exc


def evaluate(expr, bindings, angle_unit=None):
    tree = parse(expr)
    if uses_trig(expr) and angle_unit not in ('deg', 'rad'):
        raise ComputeError('ANGLE_UNIT_REQUIRED', 'trigonometry needs angle_unit "deg" or "rad"')
    return _eval(tree, bindings or {}, angle_unit)


PRINTED = re.compile(r'^[+-]?(\d+)(?:[.,](\d+))?$')


def matches_printed(value, printed):
    """True when value rounds to the printed number at the printed precision."""
    text = str(printed).strip().replace('−', '-').replace(' ', '').replace(' ', '')
    m = PRINTED.match(text)
    if not m:
        raise ComputeError('SYNTAX', f'not a printed number: {printed!r}')
    target = float(text.replace(',', '.'))
    decimals = len(m.group(2) or '')
    tolerance = 0.5 * 10 ** (-decimals) + 1e-9 * abs(value)
    return abs(value - target) <= tolerance
