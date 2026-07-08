"use strict";

// db/localtime.js — CLG-P7.3a pure timezone helper для проактивного нуджа. DST-КОРРЕКТНО через
// Intl.DateTimeFormat({timeZone}) (числовой offset ломается на 2 перехода/год Asia/Jerusalem — критика
// wf_f60b0e58 MAJOR). Без DB/Date.now (принимает ms). Единый источник local_day для ОБОИХ каналов
// (push+бот) → общий кросс-канальный бюджет ключуется совместимо.

const DEFAULT_TZ = "Asia/Jerusalem";
// ОГРАНИЧЕННЫЕ окна доставки [start, end) (local час). Верхняя граница (критика wf_858259da MINOR):
// без неё «утренний» нудж после mid-day рестарта мог уйти в 21:59 (first-tick в открытом окне). С
// границей поздний first-tick откладывается на следующий день, а не доставляется не в то время.
const WINDOW_HOURS = { morning: [9, 12], evening: [19, 22] };

// tz валиден? (Intl бросает RangeError на неизвестном timeZone). Fallback на дефолт при write/чтении.
function validTz(tz) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: String(tz || "") }); return true; }
  catch (_) { return false; }
}
function safeTz(tz) { return validTz(tz) ? String(tz) : DEFAULT_TZ; }

// local-части момента ms в зоне tz: { day:'YYYY-MM-DD', hour:0..23 }. en-CA даёт ISO-день; hourCycle h23
// фиксит 24→0. Один формат-вызов — DST учитывается зоной автоматически.
function localParts(tz, ms) {
  const zone = safeTz(tz);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parts = {};
  for (const p of fmt.formatToParts(new Date(Number(ms)))) if (p.type !== "literal") parts[p.type] = p.value;
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;   // h23 обычно 0..23, но подстрахуемся
  return { day: parts.year + "-" + parts.month + "-" + parts.day, hour, minute: Number(parts.minute) };
}

function localDay(tz, ms) { return localParts(tz, ms).day; }
function localHour(tz, ms) { return localParts(tz, ms).hour; }

// quiet-hours КРУГОВОЙ (окно через полночь — самый частый ночной режим; критика MAJOR): 22→8 значит
// h>=22 ИЛИ h<8. Равные start==end → нет тишины (0 часов). start<end → обычный интервал.
function inQuietHours(hour, quietStart, quietEnd) {
  const h = Number(hour), s = Number(quietStart), e = Number(quietEnd);
  if (!(s >= 0 && s <= 23 && e >= 0 && e <= 23)) return false;   // невалидно → не считаем тишиной
  if (s === e) return false;
  return s < e ? (h >= s && h < e) : (h >= s || h < e);
}

// окно доставки открыто? local-час В [start, end) окна И вне тишины. Раз/день гарантирует claim-ledger.
// Неизвестное окно → morning.
function windowOpen(hour, window, quietStart, quietEnd) {
  const w = WINDOW_HOURS[String(window)] || WINDOW_HOURS.morning;
  const h = Number(hour);
  if (!(h >= w[0] && h < w[1])) return false;
  if (inQuietHours(hour, quietStart, quietEnd)) return false;
  return true;
}

// смещение зоны (мин) в момент utcMs: (local-стенные-часы как-если-UTC) − utcMs. Минутная гранулярность
// (offset'ы кратны минутам; Israel — часам) — достаточно для границы дня (00:00).
function _offsetMinutes(tz, utcMs) {
  const p = localParts(tz, utcMs);
  const [Y, Mo, D] = p.day.split("-").map(Number);
  const asIfUtc = Date.UTC(Y, Mo - 1, D, p.hour, p.minute);
  return Math.round((asIfUtc - utcMs) / 60000);
}
// UTC-Z instant НАЧАЛА (00:00 local) дня (today+addDays) в зоне tz — DST-safe (2 итерации коррекции
// смещения ловят DST-границу). Для muted_until (/notoday=+1 → тишина до конца сегодня; /mute N=+N).
function startOfLocalDay(tz, ms, addDays) {
  const zone = safeTz(tz);
  const [Y, Mo, D] = localDay(zone, ms).split("-").map(Number);
  const add = Number(addDays) || 0;
  let guess = Date.UTC(Y, Mo - 1, D + add, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    const off = _offsetMinutes(zone, guess);
    guess = Date.UTC(Y, Mo - 1, D + add, 0, 0, 0) - off * 60000;
  }
  return new Date(guess).toISOString();
}

module.exports = {
  DEFAULT_TZ, WINDOW_HOURS,
  validTz, safeTz, localParts, localDay, localHour, inQuietHours, windowOpen, startOfLocalDay,
};
