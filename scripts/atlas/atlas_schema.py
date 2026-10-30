"""Pack schemas and a small JSON Schema checker (the subset the atlas contract uses).

Supported keywords: type (incl. lists), required, properties, additionalProperties
(false or a schema), enum, const, pattern, minLength, items, minItems, maxItems,
minimum, maximum, $defs with local $ref, and oneOf whose branches are told apart by
properties.type.const (dispatch on the object's "type").
"""
import json
import os
import re

__all__ = ['load_schema', 'check', 'read_jsonl']

_HERE = os.path.dirname(os.path.abspath(__file__))
# repository: scripts/atlas/schemas; supplier archive: tools/../schemas
SCHEMA_DIR = next((d for d in (os.path.join(_HERE, 'schemas'), os.path.join(_HERE, '..', 'schemas'))
                   if os.path.isdir(d)), os.path.join(_HERE, 'schemas'))
_cache = {}


def load_schema(name):
    if name not in ('source-pack', 'content-pack'):
        raise ValueError(f'unknown schema {name!r}')
    if name not in _cache:
        with open(os.path.join(SCHEMA_DIR, name + '.schema.json'), encoding='utf-8') as fh:
            _cache[name] = json.load(fh)
    return _cache[name]


def _type_ok(value, name):
    if name == 'object':
        return isinstance(value, dict)
    if name == 'array':
        return isinstance(value, list)
    if name == 'string':
        return isinstance(value, str)
    if name == 'boolean':
        return isinstance(value, bool)
    if name == 'null':
        return value is None
    if name == 'integer':
        return isinstance(value, int) and not isinstance(value, bool)
    if name == 'number':
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    raise ValueError(f'unsupported type {name!r}')


def _resolve(schema, root):
    while isinstance(schema, dict) and '$ref' in schema:
        ref = schema['$ref']
        if not ref.startswith('#/'):
            raise ValueError(f'only local $ref supported: {ref}')
        node = root
        for part in ref[2:].split('/'):
            node = node[part]
        schema = node
    return schema


def _dispatch(branches, obj, root, path):
    by_type = {}
    for branch in branches:
        resolved = _resolve(branch, root)
        const = resolved.get('properties', {}).get('type', {}).get('const')
        if const is None:
            return None
        by_type[const] = resolved
    if not isinstance(obj, dict):
        return [f'{path}: expected object']
    kind = obj.get('type')
    if kind not in by_type:
        return [f"{path}.type: unknown type {kind!r}"]
    return _check(by_type[kind], obj, root, path)


def _check(schema, value, root, path):
    schema = _resolve(schema, root)
    errors = []
    if 'oneOf' in schema:
        dispatched = _dispatch(schema['oneOf'], value, root, path)
        if dispatched is None:
            raise ValueError('oneOf without type const dispatch is not supported')
        return dispatched
    if 'type' in schema:
        names = schema['type'] if isinstance(schema['type'], list) else [schema['type']]
        if not any(_type_ok(value, n) for n in names):
            return [f'{path}: expected {"/".join(names)}']
    if 'const' in schema and value != schema['const']:
        errors.append(f'{path}: must equal {schema["const"]!r}')
    if 'enum' in schema and value not in schema['enum']:
        errors.append(f'{path}: not in enum {schema["enum"]}')
    if isinstance(value, str):
        if 'minLength' in schema and len(value) < schema['minLength']:
            errors.append(f'{path}: shorter than {schema["minLength"]}')
        if 'pattern' in schema and not re.search(schema['pattern'], value):
            errors.append(f'{path}: does not match {schema["pattern"]}')
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if 'minimum' in schema and value < schema['minimum']:
            errors.append(f'{path}: below minimum {schema["minimum"]}')
        if 'maximum' in schema and value > schema['maximum']:
            errors.append(f'{path}: above maximum {schema["maximum"]}')
    if isinstance(value, list):
        if 'minItems' in schema and len(value) < schema['minItems']:
            errors.append(f'{path}: fewer than {schema["minItems"]} items')
        if 'maxItems' in schema and len(value) > schema['maxItems']:
            errors.append(f'{path}: more than {schema["maxItems"]} items')
        if 'items' in schema:
            for i, item in enumerate(value):
                errors.extend(_check(schema['items'], item, root, f'{path}[{i}]'))
    if isinstance(value, dict):
        for key in schema.get('required', []):
            if key not in value:
                errors.append(f'{path}: missing required property {key}')
        props = schema.get('properties', {})
        extra = schema.get('additionalProperties', True)
        for key, item in value.items():
            if key in props:
                errors.extend(_check(props[key], item, root, f'{path}.{key}'))
            elif extra is False:
                errors.append(f'{path}: unexpected property {key}')
            elif isinstance(extra, dict):
                errors.extend(_check(extra, item, root, f'{path}.{key}'))
    return errors


def check(schema, obj, path='$', root=None):
    """Errors for obj against schema; root resolves $ref when schema is a sub-schema."""
    return _check(schema, obj, root if root is not None else schema, path)


def read_jsonl(path):
    """Read a JSONL file. Tolerates a UTF-8 BOM, CRLF and blank lines.

    Returns ([(line_number, object), ...], ['line N: message', ...]).
    """
    rows, errors = [], []
    with open(path, 'rb') as fh:
        data = fh.read()
    if data[:2] in (b'\xff\xfe', b'\xfe\xff'):
        return [], ['line 1: файл в кодировке UTF-16 — сохраните его как UTF-8']
    if data[:3] == b'\xef\xbb\xbf':
        data = data[3:]
    for number, raw in enumerate(data.split(b'\n'), 1):
        try:
            text = raw.decode('utf-8').strip()
        except UnicodeDecodeError:
            errors.append(f'line {number}: строка не в кодировке UTF-8')
            continue
        if not text:
            continue
        try:
            obj = json.loads(text)
        except json.JSONDecodeError as exc:
            errors.append(f'line {number}: invalid JSON ({exc.msg} at column {exc.colno})')
            continue
        if not isinstance(obj, dict):
            errors.append(f'line {number}: each line must be a JSON object')
            continue
        rows.append((number, obj))
    return rows, errors
