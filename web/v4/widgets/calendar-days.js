export function weekdayOrder(weekStart) {
  const first = weekStart === 'monday' ? 1 : 0;
  return [0, 1, 2, 3, 4, 5, 6].map((index) => (first + index) % 7);
}

function cell(date, inMonth) {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), weekday: date.getDay(), inMonth };
}

export function weekDays(today, weekStart) {
  const first = weekStart === 'monday' ? 1 : 0;
  const offset = (today.getDay() - first + 7) % 7;
  const days = [];
  for (let index = 0; index < 7; index += 1) {
    days.push(cell(new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset + index), true));
  }
  return days;
}

export function monthWeeks(year, month, weekStart) {
  const first = weekStart === 'monday' ? 1 : 0;
  const start = new Date(year, month - 1, 1);
  const lead = (start.getDay() - first + 7) % 7;
  const total = new Date(year, month, 0).getDate();
  const rows = Math.ceil((lead + total) / 7);
  const weeks = [];
  for (let row = 0; row < rows; row += 1) {
    const week = [];
    for (let column = 0; column < 7; column += 1) {
      const date = new Date(year, month - 1, 1 - lead + row * 7 + column);
      week.push(cell(date, date.getMonth() === month - 1 && date.getFullYear() === year));
    }
    weeks.push(week);
  }
  return weeks;
}

export function sameDay(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
