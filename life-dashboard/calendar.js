// Reads a calendar's private iCal (.ics) address and returns the events on one day.
// Read-only, no sign-in, no dependencies. Handles time zones, all-day events,
// common repeat rules (daily, weekly, monthly, yearly), skipped dates and moved occurrences.

const DAY = 864e5;
const cache = new Map(); // url -> { at, text }
const CACHE_MS = 5 * 60 * 1000;

async function loadIcs(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`The calendar address returned an error (${r.status}).`);
  const text = await r.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error("That address isn't an iCal calendar feed.");
  cache.set(url, { at: Date.now(), text });
  return text;
}

// ---------- parsing ----------
function parseIcs(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const m = /^([^:;]+)((?:;[^:;=]+=(?:"[^"]*"|[^:;]*))*):(.*)$/.exec(line);
    if (!m) continue;
    const params = {};
    for (const p of m[2].split(';').slice(1)) {
      const j = p.indexOf('=');
      params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, '');
    }
    const name = m[1].toUpperCase();
    (cur[name] = cur[name] || []).push({ value: m[3], params });
  }
  return events;
}

const first = (ev, name) => (ev[name] && ev[name][0]) || null;
const unescape = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

function parseDate(value, params) {
  const v = value.trim();
  const y = +v.slice(0, 4), m = +v.slice(4, 6), d = +v.slice(6, 8);
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) return { allDay: true, y, m, d };
  return {
    allDay: false, y, m, d,
    hh: +v.slice(9, 11) || 0, mi: +v.slice(11, 13) || 0, ss: +v.slice(13, 15) || 0,
    tz: v.endsWith('Z') ? 'UTC' : (params.TZID || null)
  };
}

function parseDuration(s) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec((s || '').trim());
  if (!m) return null;
  const ms = ((+m[2] || 0) * 7 * DAY) + ((+m[3] || 0) * DAY) + ((+m[4] || 0) * 36e5) + ((+m[5] || 0) * 6e4) + ((+m[6] || 0) * 1e3);
  return m[1] === '-' ? -ms : ms;
}

// ---------- time zones ----------
const fmtCache = new Map();
function tzFormatter(tz) {
  if (!fmtCache.has(tz)) {
    let f = null;
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { f = null; } // Unknown zone name (e.g. Outlook's "Pacific Standard Time"): treat as local time
    fmtCache.set(tz, f);
  }
  return fmtCache.get(tz);
}
function tzOffset(f, ms) {
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms;
}
// Wall-clock time in a zone -> instant (ms)
function toInstant(c) {
  if (c.tz === 'UTC') return Date.UTC(c.y, c.m - 1, c.d, c.hh, c.mi, c.ss);
  const f = c.tz ? tzFormatter(c.tz) : null;
  if (!f) return new Date(c.y, c.m - 1, c.d, c.hh, c.mi, c.ss).getTime();
  const guess = Date.UTC(c.y, c.m - 1, c.d, c.hh, c.mi, c.ss);
  let t = guess - tzOffset(f, guess);
  const again = guess - tzOffset(f, t);
  if (again !== t) t = again;
  return t;
}

// ---------- civil dates (pure calendar days, no time zone) ----------
const civ = (y, m, d) => Date.UTC(y, m - 1, d) / DAY; // day number
const fromCiv = (n) => { const x = new Date(n * DAY); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), dow: x.getUTCDay() }; };
const DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const key8 = (c) => `${c.y}${String(c.m).padStart(2, '0')}${String(c.d).padStart(2, '0')}`;

function parseRule(s) {
  const r = {};
  for (const part of s.split(';')) { const [k, v] = part.split('='); if (k) r[k.toUpperCase()] = v; }
  return {
    freq: r.FREQ, interval: Math.max(1, +r.INTERVAL || 1), count: r.COUNT ? +r.COUNT : null,
    until: r.UNTIL ? parseDate(r.UNTIL, {}) : null,
    byday: r.BYDAY ? r.BYDAY.split(',').map((x) => { const mm = /^([+-]?\d+)?([A-Z]{2})$/.exec(x); return mm ? { n: mm[1] ? +mm[1] : null, dow: DOW[mm[2]] } : null; }).filter(Boolean) : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map(Number) : null
  };
}

function nthMatches(c, n) {
  if (n === null) return true;
  if (n > 0) return Math.ceil(c.d / 7) === n;
  return Math.ceil((daysInMonth(c.y, c.m) - c.d + 1) / 7) === -n;
}

// Does the rule produce an occurrence on civil day n (ignoring COUNT/UNTIL)?
function ruleHits(rule, s, n) {
  const c = fromCiv(n);
  const sn = civ(s.y, s.m, s.d);
  if (n < sn) return false;
  const months = (c.y - s.y) * 12 + (c.m - s.m);
  const bydayOk = () => !rule.byday || rule.byday.some((b) => b.dow === c.dow && nthMatches(c, b.n));
  const monthdayOk = () => !rule.bymonthday || rule.bymonthday.some((md) => (md > 0 ? md : daysInMonth(c.y, c.m) + md + 1) === c.d);
  switch (rule.freq) {
    case 'DAILY':
      return (n - sn) % rule.interval === 0 && bydayOk() && monthdayOk() && (!rule.bymonth || rule.bymonth.includes(c.m));
    case 'WEEKLY': {
      const days = rule.byday ? rule.byday.map((b) => b.dow) : [fromCiv(sn).dow];
      const week = (x) => Math.floor((x - 4) / 7); // day 0 (1970-01-01) is a Thursday; weeks start Monday
      return days.includes(c.dow) && (week(n) - week(sn)) % rule.interval === 0;
    }
    case 'MONTHLY':
      if (months % rule.interval !== 0) return false;
      if (rule.bymonthday) return monthdayOk() && bydayOk();
      if (rule.byday) return bydayOk();
      return c.d === s.d;
    case 'YEARLY':
      if ((c.y - s.y) % rule.interval !== 0) return false;
      if (!(rule.bymonth || [s.m]).includes(c.m)) return false;
      if (rule.bymonthday) return monthdayOk();
      if (rule.byday) return bydayOk();
      return c.d === s.d;
    default:
      return false;
  }
}

// ---------- main ----------
function eventsOn(text, dayKey) {
  const [ty, tm, td] = dayKey.split('-').map(Number);
  const target = civ(ty, tm, td);
  const dayStart = new Date(ty, tm - 1, td).getTime();
  const dayEnd = new Date(ty, tm - 1, td + 1).getTime();
  const raw = parseIcs(text);

  // Occurrences that were moved or cancelled individually (RECURRENCE-ID), by UID
  const overridden = new Map();
  for (const ev of raw) {
    const rid = first(ev, 'RECURRENCE-ID'); const uid = first(ev, 'UID');
    if (!rid || !uid) continue;
    const p = parseDate(rid.value, rid.params);
    const set = overridden.get(uid.value) || new Set();
    set.add(p.allDay ? key8(p) : toInstant(p));
    overridden.set(uid.value, set);
  }

  const out = [];
  for (const ev of raw) {
    const ds = first(ev, 'DTSTART');
    if (!ds) continue;
    const status = first(ev, 'STATUS');
    if (status && status.value.toUpperCase() === 'CANCELLED') continue;
    const title = first(ev, 'SUMMARY') ? unescape(first(ev, 'SUMMARY').value) : '(No title)';
    const s = parseDate(ds.value, ds.params);
    const de = first(ev, 'DTEND');
    const e = de ? parseDate(de.value, de.params) : null;
    const dur = first(ev, 'DURATION') ? parseDuration(first(ev, 'DURATION').value) : null;
    const rr = first(ev, 'RRULE');
    const isOverride = !!first(ev, 'RECURRENCE-ID');

    if (s.allDay) {
      const sn = civ(s.y, s.m, s.d);
      const len = Math.max(1, e ? civ(e.y, e.m, e.d) - sn : (dur ? Math.round(dur / DAY) : 1));
      const push = (startN) => { if (startN <= target && target < startN + len) out.push({ title, allDay: true, start: fmtCivDay(startN), end: fmtCivDay(startN + len) }); };
      if (!rr || isOverride) { push(sn); continue; }
      const rule = parseRule(rr.value);
      const skip = exdates(ev, true);
      const moved = overridden.get(first(ev, 'UID') && first(ev, 'UID').value) || new Set();
      for (let n = target - len + 1; n <= target; n++) {
        const c = fromCiv(n);
        if (!occurs(rule, s, n, () => civ(c.y, c.m, c.d) * DAY, true)) continue;
        if (skip.has(key8(c)) || moved.has(key8(c))) continue;
        push(n);
      }
      continue;
    }

    const startMs = toInstant(s);
    const length = e ? (e.allDay ? 0 : toInstant(e) - startMs) : (dur || 0);
    const pushTimed = (st) => { const en = st + Math.max(0, length); if (st < dayEnd && (en > dayStart || st >= dayStart)) out.push({ title, allDay: false, start: new Date(st).toISOString(), end: new Date(en).toISOString() }); };
    if (!rr || isOverride) { pushTimed(startMs); continue; }

    const rule = parseRule(rr.value);
    const skip = exdates(ev, false);
    const moved = overridden.get(first(ev, 'UID') && first(ev, 'UID').value) || new Set();
    // Check event-zone dates around the target so time-zone shifts can't hide an occurrence.
    for (let n = target - 1; n <= target + 1; n++) {
      const c = fromCiv(n);
      const at = () => toInstant({ ...s, y: c.y, m: c.m, d: c.d });
      if (!occurs(rule, s, n, at, false)) continue;
      const st = at();
      if (skip.has(st) || moved.has(st)) continue;
      pushTimed(st);
    }
  }

  out.sort((a, b) => (b.allDay - a.allDay) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  return out;
}

function fmtCivDay(n) { const c = fromCiv(n); return `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`; }

function exdates(ev, allDay) {
  const set = new Set();
  for (const ex of ev.EXDATE || []) {
    for (const v of ex.value.split(',')) {
      const p = parseDate(v, ex.params);
      set.add(allDay || p.allDay ? key8(p) : toInstant(p));
    }
  }
  return set;
}

// Rule hit plus UNTIL and COUNT limits.
function occurs(rule, s, n, instantOf, allDay) {
  if (!ruleHits(rule, s, n)) return false;
  if (rule.until) {
    if (allDay || rule.until.allDay) { if (n > civ(rule.until.y, rule.until.m, rule.until.d)) return false; }
    else if (instantOf() > toInstant(rule.until)) return false;
  }
  if (rule.count) {
    let k = 0;
    const sn = civ(s.y, s.m, s.d);
    for (let x = sn; x <= n && k <= rule.count; x++) if (ruleHits(rule, s, x)) k++;
    if (k > rule.count) return false;
  }
  return true;
}

async function getDayEvents(url, dayKey) {
  return eventsOn(await loadIcs(url), dayKey);
}

module.exports = { getDayEvents, eventsOn };
