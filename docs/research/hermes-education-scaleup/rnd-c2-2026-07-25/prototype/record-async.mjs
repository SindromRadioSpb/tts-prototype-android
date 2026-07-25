import { randomUUID } from 'node:crypto';
import { writeResult } from './result-store.mjs';
import { validateSession } from './benchmark-core.mjs';

const args = parseArgs(process.argv.slice(2));
const row = validateSession({
  id: `async-${args.scenario}-${randomUUID()}`,
  mode: 'async',
  scenario: args.scenario,
  turns: number(args.turns, 'turns'),
  durationSec: number(args['duration-sec'], 'duration-sec'),
  anxiety: number(args.anxiety, 'anxiety'),
  quality: number(args.quality, 'quality'),
  actualCostUsd: number(args['actual-cost-usd'], 'actual-cost-usd'),
  status: 'COMPLETE',
  incidents: 0,
  containsContent: false,
  createdAt: new Date().toISOString(),
});
const target = await writeResult(row);
console.log(`Recorded content-free async metrics: ${target}`);

function parseArgs(values) {
  const out = {};
  for (let i = 0; i < values.length; i += 2) {
    if (!values[i]?.startsWith('--') || values[i + 1] === undefined) throw new Error('ARGUMENTS_MUST_BE_FLAG_VALUE_PAIRS');
    out[values[i].slice(2)] = values[i + 1];
  }
  return out;
}
function number(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`INVALID_${name}`);
  return parsed;
}
