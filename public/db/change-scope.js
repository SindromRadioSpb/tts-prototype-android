// Content-free committed change scopes, shared by the worker and UI consumers.
const empty = () => ({ schema: 1, all: false, tables: [] });
const all = () => ({ schema: 1, all: true, tables: [] });
const validName = value => typeof value === 'string' && /^[a-z_][a-z_0-9]{0,127}$/.test(value);
export function normalizeChanges(value) {
  if (!value || value.schema !== 1 || typeof value.all !== 'boolean' || !Array.isArray(value.tables) ||
      value.tables.length > 256 || value.tables.some(name => !validName(name))) return all();
  return value.all ? all() : { schema: 1, all: false, tables: [...new Set(value.tables)].sort() };
}
export function mergeChanges(a, b) {
  const left = normalizeChanges(a), right = normalizeChanges(b);
  return left.all || right.all ? all() : normalizeChanges({ schema: 1, all: false, tables: [...new Set([...left.tables, ...right.tables])] });
}
// Parent-table changes include projections that can be affected by FK cascades.
const domains = {
  catalog: ['texts', 'sentences', 'shelves', 'shelf_members', 'shelf_texts', 'text_user_meta', 'notes_v2', 'note_occurrences', 'sentence_notes'],
  catalogData: ['texts', 'shelves', 'shelf_members', 'shelf_texts'],
  personalSets: ['texts', 'sentences', 'text_user_meta', 'word_status', 'srs_cards', 'review_log', 'notes_v2', 'note_occurrences', 'sentence_notes'],
  progress: ['texts', 'sentences', 'text_progress'],
  words: ['texts', 'sentences', 'word_status', 'review_log', 'srs_cards', 'srs_reviews', 'sentence_morphology', 'sentence_notes', 'notes_v2', 'note_occurrences'],
  readable: ['texts', 'sentences', 'audio_assets', 'sentence_audio', 'text_audio', 'tts_cache_index'],
  mediathequeItems: ['texts', 'sentences'],
  mediathequeStructure: ['mediatheque_personal'],
};
const knownTables = new Set(Object.values(domains).flat());
export function changesAffect(value, domain) {
  const scope = normalizeChanges(value), tables = domains[domain];
  return scope.all || !tables || scope.tables.some(table => !knownTables.has(table) || tables.includes(table));
}
// Retain quoted identifiers but omit literals/comments. Only depth-zero tokens
// can identify a statement/target; a CTE's nested SELECT is never its main verb.
function statements(sql) {
  const tokens = String(sql || '').match(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[A-Za-z_][A-Za-z_0-9]*|[().;]/g) || [];
  let depth = 0, current = [], malformed = false; const result = [];
  for (const token of tokens) {
    if (/^(--|\/\*|')/.test(token)) continue;
    if (token === '(') { depth++; continue; }
    if (token === ')') { if (--depth < 0) malformed = true; continue; }
    if (depth) continue;
    if (token === ';') { if (current.length) result.push(current); current = []; }
    else current.push(token);
  }
  if (current.length) result.push(current);
  if (depth !== 0 || malformed) result.push(['UNKNOWN']);
  return result;
}
const identifier = token => String(token || '').replace(/^(["`\[])|(["`\]])$/g, '').toLowerCase();
function command(tokens) {
  const words = tokens.map(token => token.toUpperCase());
  let offset = 0;
  if (words[0] === 'WITH') offset = words.findIndex((word, index) => index > 0 && /^(SELECT|INSERT|UPDATE|DELETE|REPLACE)$/.test(word));
  if (offset < 0) return { kind: 'unknown' };
  const kind = words[offset];
  if (/^(SELECT|PRAGMA|EXPLAIN)$/.test(kind)) return { kind: 'read' };
  if (/^(BEGIN|COMMIT|END)$/.test(kind)) return { kind: kind === 'BEGIN' ? 'begin' : 'commit' };
  if (kind === 'SAVEPOINT' || kind === 'RELEASE') return { kind: kind.toLowerCase(), name: identifier(tokens[offset + (kind === 'RELEASE' && words[offset + 1] === 'SAVEPOINT' ? 2 : 1)]) };
  if (kind === 'ROLLBACK') {
    const to = words.indexOf('TO', offset + 1);
    return to < 0 ? { kind: 'rollback' } : { kind: 'rollbackTo', name: identifier(tokens[to + (words[to + 1] === 'SAVEPOINT' ? 2 : 1)]) };
  }
  let at = -1;
  if (kind === 'INSERT' || kind === 'REPLACE') at = words.indexOf('INTO', offset + 1) + 1;
  if (kind === 'DELETE') at = words.indexOf('FROM', offset + 1) + 1;
  if (kind === 'UPDATE') at = offset + (words[offset + 1] === 'OR' ? 3 : 1);
  if (at <= 0) return { kind: 'unknown' };
  if (tokens[at + 1] === '.') at += 2;
  const table = identifier(tokens[at]);
  return validName(table) ? { kind: 'write', table } : { kind: 'unknown' };
}
export function sqlMayWrite(sql) { return statements(sql).map(command).some(item => item.kind === 'write' || item.kind === 'unknown'); }
export function createChangeTracker() {
  let committed = empty(), pending = empty(), active = false, savepointTransaction = false, savepoints = [];
  const commit = () => { committed = mergeChanges(committed, pending); pending = empty(); active = false; savepointTransaction = false; savepoints = []; };
  return {
    record(sql) {
      for (const item of statements(sql).map(command)) {
        if (item.kind === 'write' || item.kind === 'unknown') {
          const change = item.kind === 'unknown' ? all() : { schema: 1, all: false, tables: [item.table] };
          if (active) pending = mergeChanges(pending, change); else committed = mergeChanges(committed, change);
        }
        if (item.kind === 'begin') { pending = empty(); active = true; savepointTransaction = false; savepoints = []; }
        if (item.kind === 'rollback') { pending = empty(); active = false; savepointTransaction = false; savepoints = []; }
        if (item.kind === 'commit') commit();
        if (item.kind === 'savepoint') {
          if (!active) { active = true; savepointTransaction = true; }
          savepoints.push({ name: item.name, scope: normalizeChanges(pending) });
        }
        if (item.kind === 'release' || item.kind === 'rollbackTo') {
          let at = savepoints.length - 1;
          while (at >= 0 && savepoints[at].name !== item.name) at--;
          if (at < 0) { pending = all(); continue; }
          if (item.kind === 'rollbackTo') { pending = savepoints[at].scope; savepoints.splice(at + 1); }
          else { savepoints.splice(at); if (at === 0 && savepointTransaction) commit(); }
        }
      }
    },
    uncertain(inTransaction = active) {
      if (inTransaction) { active = true; pending = all(); } else committed = all();
    },
    snapshot() { return mergeChanges(committed, pending); },
    clear() { committed = empty(); pending = empty(); active = false; savepointTransaction = false; savepoints = []; },
  };
}
export function createChangeBatcher(dispatch, { delay = 50, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let pending = empty(), timer = null;
  function flush() {
    if (timer !== null) cancel(timer);
    timer = null; const value = pending; pending = empty();
    if (value.all || value.tables.length) dispatch(value);
  }
  return { add(value) { pending = mergeChanges(pending, value); if (timer === null) timer = schedule(flush, delay); }, flush };
}
