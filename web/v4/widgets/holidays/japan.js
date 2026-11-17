const pad = (value) => String(value).padStart(2, '0');
const key = (month, day) => `${pad(month)}-${pad(day)}`;

function nthMonday(year, month, nth) {
  const first = new Date(year, month - 1, 1).getDay();
  return 1 + ((8 - first) % 7) + (nth - 1) * 7;
}

function equinox(year, base) {
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

export function holidays(year) {
  if (!Number.isInteger(year) || year < 2000 || year > 2099) return {};
  const found = {};
  const add = (month, day, name) => { found[key(month, day)] = `holiday.jp.${name}`; };
  add(1, 1, 'newYear');
  add(1, nthMonday(year, 1, 2), 'comingOfAge');
  add(2, 11, 'foundation');
  if (year !== 2019) {
    if (year >= 2020) add(2, 23, 'emperorBirthday');
    else add(12, 23, 'emperorBirthday');
  }
  add(3, equinox(year, 20.8431), 'springEquinox');
  add(4, 29, year >= 2007 ? 'showa' : 'greenery');
  add(5, 3, 'constitution');
  if (year >= 2007) add(5, 4, 'greenery');
  add(5, 5, 'children');
  if (year === 2019) {
    add(5, 1, 'enthronement');
    add(10, 22, 'enthronementCeremony');
  }
  if (year === 2020) add(7, 23, 'marine');
  else if (year === 2021) add(7, 22, 'marine');
  else add(7, year >= 2003 ? nthMonday(year, 7, 3) : 20, 'marine');
  if (year === 2020) add(8, 10, 'mountain');
  else if (year === 2021) add(8, 8, 'mountain');
  else if (year >= 2016) add(8, 11, 'mountain');
  add(9, year >= 2003 ? nthMonday(year, 9, 3) : 15, 'respect');
  add(9, equinox(year, 23.2488), 'autumnEquinox');
  if (year === 2020) add(7, 24, 'sports');
  else if (year === 2021) add(7, 23, 'sports');
  else add(10, nthMonday(year, 10, 2), year >= 2020 ? 'sports' : 'health');
  add(11, 3, 'culture');
  add(11, 23, 'labor');

  const base = Object.assign({}, found);
  const weekday = (month, day) => new Date(year, month - 1, day).getDay();
  const step = (month, day, by) => {
    const date = new Date(year, month - 1, day + by);
    return [date.getMonth() + 1, date.getDate()];
  };
  const isHoliday = (month, day) => Object.prototype.hasOwnProperty.call(found, key(month, day));
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= new Date(year, month, 0).getDate(); day += 1) {
      const [pm, pd] = step(month, day, -1);
      const [nm, nd] = step(month, day, 1);
      if (!isHoliday(month, day) && weekday(month, day) !== 0 && base[key(pm, pd)] && base[key(nm, nd)]) {
        found[key(month, day)] = 'holiday.jp.citizens';
      }
    }
  }
  Object.keys(base).sort().forEach((name) => {
    const [month, day] = name.split('-').map(Number);
    if (weekday(month, day) !== 0) return;
    let [nextMonth, nextDay] = step(month, day, 1);
    while (isHoliday(nextMonth, nextDay)) [nextMonth, nextDay] = step(nextMonth, nextDay, 1);
    found[key(nextMonth, nextDay)] = 'holiday.jp.substitute';
  });
  return found;
}
