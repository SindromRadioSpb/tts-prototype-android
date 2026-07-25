import fs from 'node:fs/promises';
import path from 'node:path';

export const RESULTS_DIR = path.resolve('.tmp/h3-c2-results');

export async function writeResult(result) {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const safeId = String(result.id).replace(/[^a-zA-Z0-9_-]/g, '');
  const target = path.join(RESULTS_DIR, `${safeId}.json`);
  await fs.writeFile(target, `${JSON.stringify({ ...result, containsContent: false }, null, 2)}\n`, { flag: 'wx' });
  return target;
}

export async function readResults() {
  try {
    const names = (await fs.readdir(RESULTS_DIR)).filter((name) => name.endsWith('.json'));
    return Promise.all(names.map(async (name) => JSON.parse(await fs.readFile(path.join(RESULTS_DIR, name), 'utf8'))));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
