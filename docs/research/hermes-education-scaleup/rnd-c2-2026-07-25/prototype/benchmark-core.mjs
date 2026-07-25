export const SCENARIOS = Object.freeze(['cafe', 'directions', 'plans']);
export const MODES = Object.freeze(['async', 'realtime']);

export function validateSession(row) {
  if (!MODES.includes(row.mode)) throw new Error('INVALID_MODE');
  if (!SCENARIOS.includes(row.scenario)) throw new Error('INVALID_SCENARIO');
  for (const field of ['turns', 'durationSec', 'breakdowns', 'transportIncidents']) {
    if (!Number.isFinite(row[field])) throw new Error(`INVALID_${field}`);
  }
  if (!Number.isInteger(row.turns) || row.turns < 0) throw new Error('INVALID_turns');
  if (row.durationSec <= 0 || row.durationSec > 600) throw new Error('INVALID_durationSec');
  if (!Number.isInteger(row.breakdowns) || row.breakdowns < 0) throw new Error('INVALID_breakdowns');
  if (!Number.isInteger(row.transportIncidents) || row.transportIncidents < 0) throw new Error('INVALID_transportIncidents');
  if (row.actualCostUsd !== 0) throw new Error('ZERO_COST_CAP_VIOLATED');
  if (row.containsContent !== false) throw new Error('CONTENT_RETENTION_FORBIDDEN');
  return { ...row, turnsPerMinute: row.turns / (row.durationSec / 60) };
}

export function scoreBenchmark(rows) {
  const valid = rows.filter((row) => row.status === 'COMPLETE').map(validateSession);
  const cells = new Map();
  for (const row of valid) {
    const key = `${row.mode}:${row.scenario}`;
    if (cells.has(key)) throw new Error(`DUPLICATE_CELL_${key}`);
    cells.set(key, row);
  }
  const required = MODES.flatMap((mode) => SCENARIOS.map((scenario) => `${mode}:${scenario}`));
  const missing = required.filter((key) => !cells.has(key));
  if (missing.length) return { status: 'INCOMPLETE', missing, completeCells: cells.size };
  const byMode = Object.fromEntries(MODES.map((mode) => {
    const group = valid.filter((row) => row.mode === mode);
    const mean = (field) => group.reduce((sum, row) => sum + row[field], 0) / group.length;
    return [mode, {
      turnsPerMinute: mean('turnsPerMinute'),
      breakdowns: mean('breakdowns'),
      transportIncidents: mean('transportIncidents'),
      sessions: group.length,
    }];
  }));
  const ratio = byMode.realtime.turnsPerMinute / byMode.async.turnsPerMinute;
  const brokenRealtime = valid.filter((row) => row.mode === 'realtime' && row.turns === 0).length;
  return {
    status: ratio >= 1.5 && brokenRealtime < 2 ? 'DONE_GO_UNDERPOWERED' : 'DONE_NO_GO_UNDERPOWERED',
    ratio,
    byMode,
    zeroCost: true,
    brokenRealtime,
  };
}
