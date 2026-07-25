import fs from 'node:fs/promises';
import path from 'node:path';
import { readResults, RESULTS_DIR } from './result-store.mjs';
import { scoreBenchmark } from './benchmark-core.mjs';

const result = scoreBenchmark(await readResults());
await fs.mkdir(RESULTS_DIR, { recursive: true });
const target = path.join(RESULTS_DIR, 'aggregate.json');
await fs.writeFile(target, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
