import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { GeminiLiveProvider } from './gemini-live-provider.mjs';
import { assertProviderShape } from './provider-contract.mjs';
import { SCENARIOS, validateSession } from './benchmark-core.mjs';
import { writeResult } from './result-store.mjs';

const FIXED_INSTRUCTION = `Ты дружелюбный собеседник для короткой практики современного иврита.
Говори преимущественно на простом современном иврите, короткими репликами, и задавай только один
вопрос за раз. Следуй названной бытовой ситуации. Не запрашивай личные сведения или личные тексты.
Не оценивай произношение, уровень, память или прогресс. Исправляй мягко только тогда, когда ошибка
мешает понять смысл. Не начинай говорить до первой реплики ученика.`;

const args = parseArgs(process.argv.slice(2));
if (args['list-devices'] === true) {
  const child = spawn('ffmpeg', ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { stdio: 'inherit' });
  child.on('exit', () => process.exit(0));
} else {
  await main();
}

async function main() {
  if (!SCENARIOS.includes(args.scenario)) throw new Error('SCENARIO_MUST_BE_cafe_directions_or_plans');
  if (!args.device) throw new Error('MICROPHONE_DEVICE_REQUIRED');
  if (args['confirm-free-tier'] !== 'YES_I_CONFIRMED_FREE_TIER') throw new Error('FREE_TIER_CONFIRMATION_REQUIRED');
  if (!process.env.C2_GEMINI_API_KEY) throw new Error('C2_GEMINI_API_KEY_MISSING');

  const provider = assertProviderShape(new GeminiLiveProvider({
    apiKey: process.env.C2_GEMINI_API_KEY,
    systemInstruction: `${FIXED_INSTRUCTION}\nСитуация: ${scenarioPrompt(args.scenario)}`,
  }));
  let startedAt = 0;
  const usage = { promptTokenCount: 0, responseTokenCount: 0, totalTokenCount: 0 };
  let turns = 0;
  let incidents = 0;
  let quota = false;
  let finishing = false;
  let mic;
  let player;

  provider.on('audio', (pcm) => player?.stdin?.writable && player.stdin.write(pcm));
  provider.on('turn_complete', () => { turns += 1; output.write(`\nРеплика ${turns} завершена.\n`); });
  provider.on('usage', (value) => Object.assign(usage, value));
  provider.on('quota_exhausted', () => { quota = true; incidents += 1; void finish('QUOTA_EXHAUSTED'); });
  provider.on('error', (event) => { if (!event.nonfatal) incidents += 1; });

  output.write('Подключение к Gemini Live…\n');
  try {
    await provider.connect();
  } catch (error) {
    if (!quota) throw error;
    await delay(300);
    return;
  }
  player = spawn('ffplay', ['-nodisp', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0'], { stdio: ['pipe', 'ignore', 'inherit'] });
  mic = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'dshow', '-i', `audio=${args.device}`, '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'], { stdio: ['ignore', 'pipe', 'inherit'] });
  mic.stdout.on('data', (chunk) => provider.sendAudioChunk(chunk, 16000));
  mic.on('exit', (code) => { if (!finishing && code !== 0) void finish('MICROPHONE_FAILED'); });
  startedAt = Date.now();
  process.on('SIGINT', () => void finish('OWNER_STOP'));
  setTimeout(() => void finish('TIME_LIMIT'), 8 * 60 * 1000).unref();
  output.write('Сессия началась. Говорите на иврите; автоматическая остановка через 8 минут. Ctrl+C — закончить раньше.\n');

  async function finish(reason) {
    if (finishing) return;
    finishing = true;
    mic?.kill('SIGTERM');
    provider.endAudioStream();
    await delay(1200);
    provider.close();
    player?.stdin?.end();
    player?.kill('SIGTERM');
    const durationSec = Math.max(1, startedAt ? (Date.now() - startedAt) / 1000 : 1);
    if (quota) {
      const target = await writeResult({
        id: `realtime-${args.scenario}-${randomUUID()}`,
        mode: 'realtime', scenario: args.scenario, status: 'INTERRUPTED', reason,
        durationSec, turns, incidents, usage, actualCostUsd: null, containsContent: false,
        createdAt: new Date().toISOString(),
      });
      output.write(`\nFree Tier недоступен (429/quota). Платный fallback запрещён. Используйте H2.6 async. Инцидент: ${target}\n`);
      process.exitCode = 2;
      return;
    }
    const rl = readline.createInterface({ input, output });
    try {
      const anxiety = Number(await rl.question('Тревожность 1–5: '));
      const quality = Number(await rl.question('Качество диалога 1–5: '));
      const actualCostUsd = Number(await rl.question('Проверенная фактическая стоимость USD (должна быть 0): '));
      const candidate = {
        id: `realtime-${args.scenario}-${randomUUID()}`,
        mode: 'realtime', scenario: args.scenario,
        status: durationSec >= 450 ? 'COMPLETE' : 'INTERRUPTED', reason,
        durationSec, turns, anxiety, quality, actualCostUsd, incidents, usage,
        containsContent: false, createdAt: new Date().toISOString(),
      };
      if (actualCostUsd !== 0) {
        const target = await writeResult({ ...candidate, status: 'INTERRUPTED', reason: 'ZERO_COST_CAP_VIOLATED' });
        output.write(`Ненулевая стоимость остановила C2. Инцидент сохранён: ${target}\n`);
        process.exitCode = 3;
        return;
      }
      if (candidate.status !== 'COMPLETE') {
        const target = await writeResult(candidate);
        output.write(`Сессия короче 7:30 и не засчитана в benchmark: ${target}\n`);
        return;
      }
      const row = validateSession(candidate);
      const target = await writeResult(row);
      output.write(`Content-free результат сохранён: ${target}\n`);
    } finally {
      rl.close();
    }
  }
}

function scenarioPrompt(name) {
  return {
    cafe: 'Разыграйте заказ в кафе: ученик заказывает, задаёт два вопроса и исправляет одно недоразумение.',
    directions: 'Разыграйте поиск дороги: ученик спрашивает маршрут, уточняет два ориентира и пересказывает путь.',
    plans: 'Договоритесь о встрече: выберите время и место и обсудите одно изменение плана.',
  }[name];
}
function parseArgs(values) {
  const out = {};
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!value.startsWith('--')) throw new Error(`UNEXPECTED_ARGUMENT_${value}`);
    const key = value.slice(2);
    if (key === 'list-devices') out[key] = true;
    else {
      if (values[i + 1] === undefined) throw new Error(`MISSING_VALUE_${key}`);
      out[key] = values[++i];
    }
  }
  return out;
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
