// Date and plan logic. Pure functions, no DOM, so it runs in the browser and in Node tests.
// Month keys are "YYYY-MM", day keys "YYYY-MM-DD", week keys are the Monday's day key.
(function (root) {
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKey = (d) => dayKey(d).slice(0, 7);
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const parseMonth = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1); };

  function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  const weekKey = (d) => dayKey(mondayOf(d));
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const addMonths = (mk, n) => { const d = parseMonth(mk); return monthKey(new Date(d.getFullYear(), d.getMonth() + n, 1)); };
  const monthsBetween = (a, b) => {
    const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
  };

  // "Y1 Q1 Set up" -> "Y1 Q1"; "2028 Go full-time" -> "2028"
  const quarterKey = (q) => q.label.split(' ').slice(0, 2).join(' ');
  const yearShort = (y) => y.label.split(' ')[0];

  const activeQuarter = (plan, mk) => (plan.quarters || []).find((q) => q.start <= mk && mk <= q.end) || null;
  const sortedYears = (plan) => (plan.years || []).slice().sort((a, b) => a.checkpoint.localeCompare(b.checkpoint));
  // A plan year runs up to and including its checkpoint month.
  const activeYear = (plan, mk) => sortedYears(plan).find((y) => mk <= y.checkpoint) || null;

  // First month of a plan year: the month after the previous checkpoint.
  // The first year starts at the first quarter (or the baseline month).
  function yearStart(plan, year) {
    const ys = sortedYears(plan);
    const i = ys.indexOf(year);
    if (i > 0) return addMonths(ys[i - 1].checkpoint, 1);
    const starts = (plan.quarters || []).map((q) => q.start).sort();
    return starts[0] || (plan.baseline && plan.baseline.month) || addMonths(year.checkpoint, -11);
  }

  // The period the app compares against: a Year 1 quarter if one covers this month,
  // otherwise the active plan year.
  function period(plan, date) {
    const mk = monthKey(date);
    const q = activeQuarter(plan, mk);
    const y = activeYear(plan, mk);
    if (q) {
      return {
        kind: 'quarter', quarter: q, year: y, key: quarterKey(q), label: q.label, short: quarterKey(q),
        start: q.start, end: q.end, monthOf: monthsBetween(q.start, mk) + 1, monthsIn: monthsBetween(q.start, q.end) + 1,
        onTrack: q.onTrack || ''
      };
    }
    if (y) {
      const s = yearStart(plan, y);
      return {
        kind: 'year', quarter: null, year: y, key: yearShort(y), label: y.label, short: yearShort(y),
        start: s, end: y.checkpoint, monthOf: monthsBetween(s, mk) + 1, monthsIn: monthsBetween(s, y.checkpoint) + 1,
        onTrack: y.onTrack || ''
      };
    }
    return null;
  }

  // Week number inside the period. The week holding the period's first day is week 1.
  function weekOfPeriod(p, date) {
    if (!p) return null;
    const first = mondayOf(parseMonth(p.start));
    const days = Math.round((mondayOf(date) - first) / 864e5);
    return Math.floor(days / 7) + 1;
  }

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  // Monthly target (revenue, quinnFollowers): from the active quarter, else the active plan year.
  // Returns null when the plan states no number for this period. Never interpolates.
  function monthlyTarget(plan, date, field) {
    const p = period(plan, date);
    if (!p) return null;
    const src = p.kind === 'quarter' ? p.quarter : p.year;
    return isNum(src[field]) ? src[field] : null;
  }

  // Annual target (ownerPayAnnual, quinnIncomeAnnual) from the active plan year.
  function annualTarget(plan, date, field) {
    const y = activeYear(plan, monthKey(date));
    return y && isNum(y[field]) ? y[field] : null;
  }

  // Year to date: sum of entered months from the plan year's first month through this month.
  function yearToDate(months, plan, date, field) {
    const mk = monthKey(date);
    const y = activeYear(plan, mk);
    if (!y) return { sum: null, count: 0, start: null };
    const start = yearStart(plan, y);
    let sum = 0, count = 0;
    for (let k = start; k <= mk; k = addMonths(k, 1)) {
      const v = months[k] && months[k][field];
      if (isNum(v)) { sum += v; count++; }
    }
    return { sum: count ? sum : null, count, start };
  }

  // Consecutive recent months with revenue at or above the trigger.
  // Starts at this month if entered, otherwise last month. Any month below, or missing, ends the run.
  function exitRunway(months, date, trigger) {
    const mk = monthKey(date);
    let k = months[mk] && isNum(months[mk].revenue) ? mk : addMonths(mk, -1);
    let n = 0;
    while (n < 600) {
      const v = months[k] && months[k].revenue;
      if (isNum(v) && v >= trigger) { n++; k = addMonths(k, -1); } else break;
    }
    return n;
  }

  // Most recent key in an object that sorts before `key` (works for day and week keys).
  function prevKey(obj, key) {
    let best = null;
    for (const k of Object.keys(obj || {})) if (k < key && (!best || k > best)) best = k;
    return best;
  }

  const api = {
    pad, dayKey, monthKey, weekKey, parseDay, parseMonth, mondayOf, addDays, addMonths, monthsBetween,
    quarterKey, yearShort, activeQuarter, activeYear, yearStart, period, weekOfPeriod,
    monthlyTarget, annualTarget, yearToDate, exitRunway, prevKey, isNum
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Dates = api;
})(this);
