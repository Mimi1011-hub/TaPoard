import { clear, el } from '../core/dom.js';
import { monthWeeks, sameDay, weekDays, weekdayOrder } from './calendar-days.js';
import { holidaysFor } from './holidays/index.js';

const dateKey = (day) => `${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;

export class CalendarWidget {
  constructor(context) {
    this.context = context;
    this.timer = null;
    this.visibility = () => this.tick();
  }

  mount(node, item) {
    this.node = node;
    this.item = item;
    const options = item.options || {};
    this.weekStart = options.weekStart === 'monday' ? 'monday' : 'sunday';
    this.country = options.holidays === 'none' ? 'none' : 'japan';
    this.shape = `${item.width || 1}x${item.height || 1}`;
    node.classList.add('calendar-widget', `calendar-${this.shape}`);
    this.context.documentObject.addEventListener('visibilitychange', this.visibility);
    this.tick();
  }

  holiday(day) {
    if (this.country === 'none') return '';
    this.holidayCache = this.holidayCache || {};
    this.holidayCache[day.year] = this.holidayCache[day.year] || holidaysFor(this.country, day.year);
    return this.holidayCache[day.year][dateKey(day)] || '';
  }

  monthName(month, longName) {
    const prefix = longName && this.context.i18n.language === 'en' ? 'calendar.monthLong' : 'clock.month';
    return this.context.i18n.t(`${prefix}.${month - 1}`);
  }

  tick() {
    const now = new Date();
    this.today = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
    clear(this.node);
    if (this.shape === '1x1') this.renderToday();
    else if (this.shape === '2x1') this.renderWeek(now);
    else this.renderMonth();
    this.schedule(now);
  }

  renderToday() {
    const weekday = new Date(this.today.year, this.today.month - 1, this.today.day).getDay();
    this.node.appendChild(el('span', 'calendar-today-month', this.monthName(this.today.month, false)));
    this.node.appendChild(el('strong', 'calendar-today-date', this.today.day));
    this.node.appendChild(el('span', 'calendar-today-weekday', this.context.i18n.t(`clock.weekdayShort.${weekday}`)));
    const holiday = this.holiday(this.today);
    if (holiday) this.node.appendChild(el('small', 'calendar-holiday-name', this.context.i18n.t(holiday)));
  }

  renderWeek(now) {
    const days = weekDays(now, this.weekStart);
    const first = days[0];
    const last = days[6];
    const months = first.month === last.month
      ? this.monthName(first.month, false)
      : `${this.monthName(first.month, false)}–${this.monthName(last.month, false)}`;
    this.node.appendChild(el('span', 'calendar-week-month', months));
    const row = el('div', 'calendar-week-row');
    days.forEach((day) => row.appendChild(this.dayCell(day, true)));
    this.node.appendChild(row);
  }

  renderMonth() {
    const language = this.context.i18n.language;
    const heading = language === 'en'
      ? `${this.monthName(this.today.month, true)} ${this.today.year}`
      : `${this.today.year}${this.context.i18n.t('calendar.yearSuffix')}${this.monthName(this.today.month, false)}`;
    this.node.appendChild(el('strong', 'calendar-month-heading', heading));
    const weekdays = el('div', 'calendar-month-weekdays');
    weekdayOrder(this.weekStart).forEach((day) => {
      weekdays.appendChild(el('span', this.dayClass({ weekday: day }, false), this.context.i18n.t(`clock.weekdayShort.${day}`)));
    });
    this.node.appendChild(weekdays);
    const grid = el('div', 'calendar-month-grid');
    monthWeeks(this.today.year, this.today.month, this.weekStart).flat().forEach((day) => grid.appendChild(this.dayCell(day, false)));
    this.node.appendChild(grid);
  }

  dayClass(day, includeHoliday) {
    const names = ['calendar-day'];
    const red = day.weekday === 0 || includeHoliday && this.holiday(day);
    if (red) names.push('is-red');
    else if (day.weekday === 6) names.push('is-blue');
    if (day.inMonth === false) names.push('is-outside');
    if (day.year && sameDay(day, this.today)) names.push('is-today');
    return names.join(' ');
  }

  dayCell(day, showWeekday) {
    const cell = el('span', this.dayClass(day, true));
    if (showWeekday) cell.appendChild(el('small', '', this.context.i18n.t(`clock.weekdayShort.${day.weekday}`)));
    cell.appendChild(el('b', '', day.day));
    return cell;
  }

  schedule(now) {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.context.documentObject.hidden) return;
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    this.timer = setTimeout(() => this.tick(), Math.max(100, next.getTime() - now.getTime() + 100));
  }

  update() {}

  destroy() {
    clearTimeout(this.timer);
    this.context.documentObject.removeEventListener('visibilitychange', this.visibility);
  }
}
