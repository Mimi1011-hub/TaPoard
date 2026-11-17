import { el } from '../../core/dom.js';
import { field, heading, selectField } from './fields.js';

export function calendarDetails(context) {
  context.defaults({ weekStart: 'sunday', holidays: 'japan' });
  heading(context, 'details.calendarTitle');
  selectField(context, context.t('details.calendarWeekStart'), 'weekStart', [
    ['sunday', context.t('details.calendarSunday')],
    ['monday', context.t('details.calendarMonday')],
  ]);
  const holidays = el('input', '');
  holidays.type = 'checkbox';
  holidays.checked = context.options.holidays !== 'none';
  holidays.dataset.option = 'holidays';
  holidays.addEventListener('change', () => context.change('holidays', holidays.checked ? 'japan' : 'none'));
  field(context.root, context.t('details.calendarHolidays'), holidays);
}
