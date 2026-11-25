// Checks the date logic against the seeded plan. Run with: npm test
const assert = require('assert');
const D = require('../public/dates.js');
const plan = require('../data.seed.json').config.plan;
const at = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

// Quarter lookup
assert.strictEqual(D.period(plan, at('2026-11-25')).label, 'Y1 Q1 Set up');
assert.strictEqual(D.period(plan, at('2026-11-25')).monthOf, 1);
assert.strictEqual(D.period(plan, at('2027-01-10')).monthOf, 3);
assert.strictEqual(D.period(plan, at('2027-02-01')).short, 'Y1 Q2');
assert.strictEqual(D.period(plan, at('2027-11-15')).label, 'Y1 Q4 Hit it');
assert.strictEqual(D.period(plan, at('2027-11-15')).monthsIn, 4);

// After Year 1 quarters: falls back to the plan year
const p28 = D.period(plan, at('2027-12-05'));
assert.strictEqual(p28.kind, 'year');
assert.strictEqual(p28.short, '2028');
assert.strictEqual(p28.monthOf, 1);
assert.strictEqual(p28.monthsIn, 12);

// Weeks: Nov 1 2026 is a Sunday, so Mon Oct 26 starts week 1; Nov 23 is week 5
assert.strictEqual(D.weekKey(at('2026-11-25')), '2026-11-23');
assert.strictEqual(D.weekOfPeriod(D.period(plan, at('2026-11-25')), at('2026-11-25')), 5);

// Targets
assert.strictEqual(D.monthlyTarget(plan, at('2026-11-25'), 'revenue'), 9000);
assert.strictEqual(D.monthlyTarget(plan, at('2028-03-01'), 'revenue'), 11250);
assert.strictEqual(D.monthlyTarget(plan, at('2030-03-01'), 'revenue'), null); // 2030 has no monthly revenue target
assert.strictEqual(D.annualTarget(plan, at('2026-11-25'), 'ownerPayAnnual'), null);
assert.strictEqual(D.annualTarget(plan, at('2028-03-01'), 'ownerPayAnnual'), 100000);

// Year to date and exit runway
const months = { '2027-12': { ownerPay: 8000, revenue: 11000 }, '2028-01': { ownerPay: 9000, revenue: 11250 }, '2028-02': { revenue: 12000 } };
assert.strictEqual(D.yearToDate(months, plan, at('2028-02-10'), 'ownerPay').sum, 17000);
assert.strictEqual(D.exitRunway(months, at('2028-02-10'), 11250), 2);
assert.strictEqual(D.exitRunway(months, at('2028-03-10'), 11250), 2); // March not entered yet, counts back from Feb
assert.strictEqual(D.exitRunway({ ...months, '2028-03': { revenue: 9000 } }, at('2028-03-10'), 11250), 0);

console.log('All date tests passed.');
