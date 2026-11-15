import { checkField, selectField } from './fields.js';

export function clockDetails(context) {
  context.defaults({ style: 'digital', showSeconds: false, showDate: true, showWeekday: true, hour12: false });
  selectField(context, context.t('details.style'), 'style', [['digital', context.t('details.digital')], ['analog', context.t('details.analog')]]);
  checkField(context, context.t('details.seconds'), 'showSeconds');
  checkField(context, context.t('details.date'), 'showDate');
  checkField(context, context.t('details.weekday'), 'showWeekday');
  checkField(context, context.t('details.hour12'), 'hour12');
}
