// Checks the iCal reader against a sample feed. Runs in Los Angeles time.
process.env.TZ = 'America/Los_Angeles';
const assert = require('assert');
const { eventsOn } = require('../calendar.js');

const ics = [
  'BEGIN:VCALENDAR',
  // One-off, time zone given
  'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Pinnacle Fertility',
  'DTSTART;TZID=America/Los_Angeles:20261125T080000', 'DTEND;TZID=America/Los_Angeles:20261125T090000', 'END:VEVENT',
  // One-off in UTC (Nov 26 04:00Z = Nov 25 8 PM LA)
  'BEGIN:VEVENT', 'UID:b', 'SUMMARY:Book review', 'DTSTART:20261126T040000Z', 'DTEND:20261126T060000Z', 'END:VEVENT',
  // Weekly Mon/Wed, one Wednesday skipped, one moved
  'BEGIN:VEVENT', 'UID:c', 'SUMMARY:TRUFF standup', 'DTSTART;TZID=America/Los_Angeles:20261102T100000',
  'DTEND;TZID=America/Los_Angeles:20261102T103000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
  'EXDATE;TZID=America/Los_Angeles:20261118T100000', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:c', 'SUMMARY:TRUFF standup (moved)', 'RECURRENCE-ID;TZID=America/Los_Angeles:20261202T100000',
  'DTSTART;TZID=America/Los_Angeles:20261203T140000', 'DTEND;TZID=America/Los_Angeles:20261203T143000', 'END:VEVENT',
  // All-day, two days long
  'BEGIN:VEVENT', 'UID:d', 'SUMMARY:Thanksgiving trip', 'DTSTART;VALUE=DATE:20261125', 'DTEND;VALUE=DATE:20261127', 'END:VEVENT',
  // Daily, ended by COUNT before today
  'BEGIN:VEVENT', 'UID:e', 'SUMMARY:Old daily', 'DTSTART:20261101T170000Z', 'DTEND:20261101T173000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'END:VEVENT',
  // Cancelled
  'BEGIN:VEVENT', 'UID:f', 'SUMMARY:Cancelled call', 'STATUS:CANCELLED', 'DTSTART:20261125T200000Z', 'END:VEVENT',
  // Monthly on the last Wednesday, with a folded long title
  'BEGIN:VEVENT', 'UID:g', 'SUMMARY:Monthly review\\, Quinn and', ' freelance', 'DTSTART;TZID=America/Los_Angeles:20261028T160000',
  'DTEND;TZID=America/Los_Angeles:20261028T170000', 'RRULE:FREQ=MONTHLY;BYDAY=-1WE', 'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

const titles = (day) => eventsOn(ics, day).map((e) => e.title);

assert.deepStrictEqual(titles('2026-11-25'), [
  'Thanksgiving trip', 'Pinnacle Fertility', 'TRUFF standup', 'Monthly review, Quinn andfreelance', 'Book review'
]);
assert.deepStrictEqual(titles('2026-11-26'), ['Thanksgiving trip']);
assert.deepStrictEqual(titles('2026-11-18'), []); // skipped Wednesday
assert.deepStrictEqual(titles('2026-11-23'), ['TRUFF standup']);
assert.deepStrictEqual(titles('2026-12-02'), []); // moved to Thursday
assert.deepStrictEqual(titles('2026-12-03'), ['TRUFF standup (moved)']);
assert.deepStrictEqual(titles('2026-11-02'), ['Old daily', 'TRUFF standup']);
assert.deepStrictEqual(titles('2026-11-05'), []); // COUNT=3 ended
assert.deepStrictEqual(titles('2026-12-30'), ['TRUFF standup', 'Monthly review, Quinn andfreelance']);

const ev = eventsOn(ics, '2026-11-25').find((e) => e.title === 'Pinnacle Fertility');
assert.strictEqual(new Date(ev.start).getHours(), 8);

console.log('All calendar tests passed.');
