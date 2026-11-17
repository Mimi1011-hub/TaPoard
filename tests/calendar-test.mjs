import assert from 'node:assert/strict';
import { holidays } from '../web/v4/widgets/holidays/japan.js';
import { holidaysFor, holidayCountries } from '../web/v4/widgets/holidays/index.js';
import { monthWeeks, sameDay, weekDays, weekdayOrder } from '../web/v4/widgets/calendar-days.js';

const expected = {
  2019: ['01-01', '01-14', '02-11', '03-21', '04-29', '04-30', '05-01', '05-02', '05-03', '05-04', '05-05', '05-06', '07-15', '08-11', '08-12',
    '09-16', '09-23', '10-14', '10-22', '11-03', '11-04', '11-23'],
  2020: ['01-01', '01-13', '02-11', '02-23', '02-24', '03-20', '04-29', '05-03', '05-04', '05-05', '05-06', '07-23', '07-24', '08-10',
    '09-21', '09-22', '11-03', '11-23'],
  2021: ['01-01', '01-11', '02-11', '02-23', '03-20', '04-29', '05-03', '05-04', '05-05', '07-22', '07-23', '08-08', '08-09',
    '09-20', '09-23', '11-03', '11-23'],
  2026: ['01-01', '01-12', '02-11', '02-23', '03-20', '04-29', '05-03', '05-04', '05-05', '05-06', '07-20', '08-11',
    '09-21', '09-22', '09-23', '10-12', '11-03', '11-23'],
  2027: ['01-01', '01-11', '02-11', '02-23', '03-21', '03-22', '04-29', '05-03', '05-04', '05-05', '07-19', '08-11',
    '09-20', '09-23', '10-11', '11-03', '11-23'],
};
for (const [year, list] of Object.entries(expected)) assert.deepEqual(Object.keys(holidays(Number(year))).sort(), list, `holidays ${year}`);
assert.equal(holidays(2026)['05-06'], 'holiday.jp.substitute');
assert.equal(holidays(2026)['09-22'], 'holiday.jp.citizens');
assert.equal(holidays(2019)['04-30'], 'holiday.jp.citizens');
assert.equal(holidays(2019)['10-22'], 'holiday.jp.enthronementCeremony');
assert.equal(holidays(2018)['12-23'], 'holiday.jp.emperorBirthday');
assert.equal(holidays(2018)['10-08'], 'holiday.jp.health');
assert.equal(holidays(2026)['10-12'], 'holiday.jp.sports');
assert.deepEqual(holidays(1999), {});
assert.deepEqual(holidaysFor('none', 2026), {});
assert.deepEqual(holidayCountries(), ['japan']);
assert.equal(holidaysFor('japan', 2026)['11-03'], 'holiday.jp.culture');

assert.deepEqual(weekdayOrder('sunday'), [0, 1, 2, 3, 4, 5, 6]);
assert.deepEqual(weekdayOrder('monday'), [1, 2, 3, 4, 5, 6, 0]);
const sunday = weekDays(new Date(2026, 10, 17), 'sunday');
assert.deepEqual(sunday.map((day) => day.day), [15, 16, 17, 18, 19, 20, 21]);
const monday = weekDays(new Date(2026, 10, 15), 'monday');
assert.deepEqual(monday.map((day) => day.day), [9, 10, 11, 12, 13, 14, 15]);
const across = weekDays(new Date(2026, 11, 31), 'sunday');
assert.deepEqual(across.map((day) => `${day.month}/${day.day}`), ['12/27', '12/28', '12/29', '12/30', '12/31', '1/1', '1/2']);
assert.equal(across[5].year, 2027);
assert.ok(sameDay(sunday[2], { year: 2026, month: 11, day: 17 }));

const feb2024 = monthWeeks(2024, 2, 'sunday');
assert.equal(feb2024.length, 5);
assert.equal(feb2024.flat().filter((day) => day.inMonth).length, 29);
const feb2026 = monthWeeks(2026, 2, 'sunday');
assert.equal(feb2026.length, 4);
assert.equal(feb2026[0][0].day, 1);
assert.equal(monthWeeks(2026, 2, 'monday').length, 5);
assert.equal(monthWeeks(2026, 3, 'sunday')[0][0].day, 1);
assert.equal(monthWeeks(2026, 11, 'sunday').length, 5);
assert.equal(monthWeeks(2026, 8, 'sunday').length, 6);
assert.equal(monthWeeks(2026, 8, 'sunday')[0][0].inMonth, false);
assert.equal(monthWeeks(2026, 1, 'sunday')[0][0].year, 2025);
console.log('PASS calendar-test');
