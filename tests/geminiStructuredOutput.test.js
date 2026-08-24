'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('Gemini table route requests the existing row contract as structured JSON', () => {
  const { buildGeminiTableResponseSchema } = require('../ingest/geminiTableSchema.js');
  const Type = { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', INTEGER: 'INTEGER' };
  const schema = buildGeminiTableResponseSchema(Type);
  assert.equal(schema.type, 'OBJECT');
  assert.deepEqual(schema.required, ['rows']);
  assert.deepEqual(schema.properties.rows.items.required,
    ['segment_index', 'he', 'he_niqqud', 'translit', 'ru']);
  assert.match(server, /responseMimeType:\s*["']application\/json["']/);
  assert.match(server, /responseSchema:\s*buildGeminiTableResponseSchema\(Type\)/);
});

test('structured syntax keeps semantic validation and model-aware cache identity', () => {
  assert.match(server, /JSON\.parse\(cleaned\)/);
  assert.match(server, /buildRowsFromGeminiPayload\(parsed/);
  assert.ok(server.indexOf('buildRowsFromGeminiPayload(parsed') < server.indexOf('fs.writeFileSync(cacheFile'),
    'semantic validation must precede cache publication');
  assert.match(server, /getGeminiScenario\(scenarioName\)/);
  assert.match(server, /buildGeminiCacheKey\(/);
  assert.doesNotMatch(server, /model:\s*["']gemini-flash-latest["']/);
});
