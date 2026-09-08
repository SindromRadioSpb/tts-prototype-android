'use strict';
// Explicit owner BYOK live gate. Key is read only in-process; never logged or
// persisted. Raw/repair files are private scratch, not committed fixtures.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Type } = require('@google/genai');
const { generateGeminiContent } = require('../../ingest/geminiClient');
const { recoverTableNiqqud, buildRepairSchema } = require('../../ingest/geminiTableRepair');
const { buildRowsFromGeminiPayload, prepareRowsFromGeminiPayload, validateNiqqudBase } = require('../../ingest/tableRows');
const { getGeminiScenario } = require('../../ingest/geminiPolicy');
const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }));
async function main() {
  if (!args['--raw'] || !args['--key-file'] || !args['--repair-cache']) throw new Error('Required: --raw --key-file --repair-cache');
  const rawFile = path.resolve(args['--raw']);
  const before = fs.readFileSync(rawFile);
  const cached = JSON.parse(before);
  const parsed = JSON.parse(cached.rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim());
  const scenario = getGeminiScenario('table-seg-he-ru');
  const prepared = prepareRowsFromGeminiPayload(parsed, { direction: 'he-ru' }, { keepSegmentIndex: true });
  const rejected = [];
  prepared.forEach((r, i) => { try { validateNiqqudBase([r]); } catch (_) { rejected.push(i); } });
  let calls = 0;
  const apiKey = fs.readFileSync(args['--key-file'], 'utf8').trim();
  const result = await recoverTableNiqqud({ parsed, rawText: cached.rawText, scenario,
    direction: 'he-ru', segMode: true, translitProfile: cached.translitProfile,
    cacheFile: path.resolve(args['--repair-cache']),
    generate: async ({ prompt }) => {
      calls++;
      return generateGeminiContent({ apiKey, scenario, contents: prompt,
        config: { temperature: 0, maxOutputTokens: 16384, responseMimeType: 'application/json', responseSchema: buildRepairSchema(Type) } });
    },
  });
  const rows = buildRowsFromGeminiPayload(result.parsed, { direction: 'he-ru' }, { keepSegmentIndex: true });
  const goodRowsUnchanged = parsed.rows.every((r, i) => rejected.includes(i) || JSON.stringify(r) === JSON.stringify(result.parsed.rows[i]));
  const sourceUnchanged = parsed.rows.every((r, i) => r.he === result.parsed.rows[i].he && r.segment_index === result.parsed.rows[i].segment_index);
  const rawUnchanged = before.equals(fs.readFileSync(rawFile));
  if (!goodRowsUnchanged || !sourceUnchanged || !rawUnchanged) throw new Error('Preservation gate');
  console.log(JSON.stringify({ status: 'TECHNICAL_PASS', rows: rows.length, rejectedRows: rejected,
    repair: result.repair, providerCalls: calls, sourceUnchanged, goodRowsUnchanged, rawUnchanged,
    rawSha256: crypto.createHash('sha256').update(before).digest('hex') }));
}
main().catch(e => {
  // Never echo SDK messages, request headers, payloads, paths or credentials.
  console.error(JSON.stringify({ status: 'FAIL', code: /^[A-Z_]+$/.test(e.code || '') ? e.code : 'LIVE_GATE_ERROR',
    httpStatus: Number(e.status || e.statusCode) || null, repair: e.repair || null }));
  process.exitCode = 1;
});
