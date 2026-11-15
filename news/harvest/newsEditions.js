'use strict';
// The editions schedule (docs/superpowers/specs/2026-11-15-news-editions-design.md §4.1, §5.1).
// Times are Israel time; the day starts at the morning cut-off. Pure functions, no database.
const { israelIso } = require('./newsExtract');

const SLOTS = ['morning', 'midday', 'evening', 'late'];
const DEFAULT_SCHEDULE = Object.freeze({
  slots: {
    morning: { cutoff: '06:00', ready: '08:00', main: 22 },
    midday: { cutoff: '10:30', ready: '12:00', main: 8 },
    evening: { cutoff: '16:30', ready: '18:00', main: 8 },
    late: { cutoff: '20:30', ready: '22:00', main: 8 },
  },
  extras: 50, leaseHours: 4, maxAttempts: 2, // extras: dot's own articles per edition (owner 2026-11-16: up to 50)
});
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const invalid = () => { const e = new Error('SCHEDULE_INVALID'); e.code = 'SCHEDULE_INVALID'; return e; };

function normalizeSchedule(input) {
  const src = input && typeof input === 'object' ? input : {};
  const slots = {};
  for (const s of SLOTS) {
    const d = DEFAULT_SCHEDULE.slots[s], v = (src.slots && src.slots[s]) || {};
    const x = { cutoff: v.cutoff != null ? String(v.cutoff) : d.cutoff, ready: v.ready != null ? String(v.ready) : d.ready, main: v.main != null ? Number(v.main) : d.main };
    if (!HHMM.test(x.cutoff) || !HHMM.test(x.ready) || !Number.isInteger(x.main) || x.main < 1 || x.main > 40) throw invalid();
    if (minutes(x.ready) <= minutes(x.cutoff)) throw invalid();
    slots[s] = x;
  }
  for (let i = 1; i < SLOTS.length; i++) if (minutes(slots[SLOTS[i]].cutoff) <= minutes(slots[SLOTS[i - 1]].cutoff)) throw invalid();
  const num = (v, d, lo, hi) => { if (v == null) return d; const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw invalid(); return n; };
  return { slots, extras: num(src.extras, DEFAULT_SCHEDULE.extras, 0, 50), leaseHours: num(src.leaseHours, DEFAULT_SCHEDULE.leaseHours, 1, 24),
    maxAttempts: num(src.maxAttempts, DEFAULT_SCHEDULE.maxAttempts, 1, 5) };
}

// The moment «this day, this time in Israel» (the offset of that very moment: +02:00 or +03:00).
function israelAt(day, hhmm) {
  const naive = Date.parse(day + 'T' + hhmm + ':00Z');
  let t = naive - 2 * 3600e3;
  for (let i = 0; i < 2; i++) {
    const off = israelIso(t).slice(19), sign = off[0] === '-' ? -1 : 1;
    t = naive - sign * (Number(off.slice(1, 3)) * 60 + Number(off.slice(4, 6))) * 60e3;
  }
  return t;
}

function dayOf(ms, schedule = DEFAULT_SCHEDULE) {
  const local = israelIso(ms), date = local.slice(0, 10);
  if (minutes(local.slice(11, 16)) >= minutes(schedule.slots.morning.cutoff)) return date;
  return new Date(Date.parse(date + 'T00:00:00Z') - 86400e3).toISOString().slice(0, 10);
}

function slotTimes(day, schedule = DEFAULT_SCHEDULE) {
  return SLOTS.map(slot => ({ slot, cutoffMs: israelAt(day, schedule.slots[slot].cutoff), readyMs: israelAt(day, schedule.slots[slot].ready) }));
}

// The latest passed slot of the day that has no edition yet (a failed build is retried once); the
// earlier passed slots without an edition are skipped — never two archives in a row.
function dueSlot(ms, schedule, editionsOfDay) {
  const day = dayOf(ms, schedule), eds = editionsOfDay || [];
  const has = slot => { const mine = eds.filter(e => e.slot === slot); return mine.some(e => e.status !== 'failed') || mine.length >= 2; };
  const passed = slotTimes(day, schedule).filter(s => s.cutoffMs <= ms);
  if (!passed.length) return null;
  const last = passed[passed.length - 1];
  if (has(last.slot)) return null;
  return { day, slot: last.slot, cutoffMs: last.cutoffMs, readyMs: last.readyMs, skip: passed.slice(0, -1).filter(s => !has(s.slot)).map(s => s.slot) };
}

module.exports = { SLOTS, DEFAULT_SCHEDULE, normalizeSchedule, israelAt, dayOf, slotTimes, dueSlot };
