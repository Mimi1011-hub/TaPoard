import { checkField, rangeField, selectField } from './fields.js';

export function wheelDetails(context) {
  context.defaults({ style: 'vertical', sensitivity: 24, multiplier: 3, reverse: false, middleClick: false, ctrl: false, shift: false, alt: false });
  selectField(context, context.t('details.style'), 'style', [['vertical', context.t('details.vertical')], ['rotary', context.t('details.rotary')]]);
  rangeField(context, context.t('details.sensitivity'), 'sensitivity', 6, 120);
  selectField(context, context.t('details.multiplier'), 'multiplier', Array.from({ length: 10 }, (_, index) => [String(index + 1), String(index + 1)]));
  ['reverse', 'middleClick', 'ctrl', 'shift', 'alt'].forEach((name) => checkField(context, context.t(`details.${name}`), name));
}
