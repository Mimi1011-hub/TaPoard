import { checkField, heading, note } from './fields.js';

// The style (digital or analog) is fixed by the item that was placed, because each style has its own sizes.
export function clockDetails(context) {
  context.defaults({ style: 'digital', showSeconds: true, showDate: true, showWeekday: true, hour12: false });
  heading(context, 'details.clockTitle');
  checkField(context, context.t('details.seconds'), 'showSeconds');
  if (context.options.style === 'digital') {
    checkField(context, context.t('details.date'), 'showDate');
    checkField(context, context.t('details.weekday'), 'showWeekday');
    checkField(context, context.t('details.hour12'), 'hour12');
  }
  note(context, 'details.clockNote');
}
