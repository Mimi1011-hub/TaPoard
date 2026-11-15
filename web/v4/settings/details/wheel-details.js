import { checkField, heading, note, rangeField, selectField } from './fields.js';

// The style (vertical or rotary) is fixed by the item that was placed, because each style has its own sizes.
export function wheelDetails(context) {
  const rotary = context.item.options && context.item.options.style === 'rotary';
  context.defaults({
    style: rotary ? 'rotary' : 'vertical',
    sensitivity: rotary ? 18 : 24,
    multiplier: 1,
    reverse: false,
    ctrl: false,
    shift: false,
    alt: false,
    middleClick: false,
  });
  heading(context, rotary ? 'details.wheelRotaryTitle' : 'details.wheelVerticalTitle');
  const label = context.t(rotary ? 'details.wheelAngle' : 'details.wheelDistance');
  const unit = context.t(rotary ? 'details.wheelAngleUnit' : 'details.wheelDistanceUnit');
  rangeField(context, label, 'sensitivity', rotary ? 6 : 8, rotary ? 90 : 120, unit);
  const steps = Array.from({ length: 10 }, (_, index) => [index + 1, context.t('details.wheelSteps', { count: index + 1 })]);
  selectField(context, context.t('details.multiplier'), 'multiplier', steps, true);
  checkField(context, context.t('details.reverse'), 'reverse');
  checkField(context, context.t('details.ctrl'), 'ctrl');
  checkField(context, context.t('details.shift'), 'shift');
  checkField(context, context.t('details.alt'), 'alt');
  checkField(context, context.t(rotary ? 'details.middleClickCenter' : 'details.middleClick'), 'middleClick');
  note(context, rotary ? 'details.wheelRotaryNote' : 'details.wheelVerticalNote');
}
