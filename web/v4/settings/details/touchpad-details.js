import { checkField, heading, note, rangeField, selectField } from './fields.js';

export function touchpadDetails(context) {
  context.defaults({
    speed: 5,
    acceleration: true,
    tapToClick: true,
    twoFingerScroll: true,
    reverseScroll: false,
    longPress: 'none',
  });
  heading(context, 'details.touchpadTitle');
  rangeField(context, context.t('details.speed'), 'speed', 1, 10);
  checkField(context, context.t('details.acceleration'), 'acceleration');
  checkField(context, context.t('details.tapToClick'), 'tapToClick');
  checkField(context, context.t('details.twoFingerScroll'), 'twoFingerScroll');
  checkField(context, context.t('details.reverseScroll'), 'reverseScroll');
  selectField(context, context.t('details.longPress'), 'longPress', [
    ['none', context.t('details.none')],
    ['rightClick', context.t('details.rightClick')],
    ['drag', context.t('details.drag')],
  ]);
  note(context, 'details.touchpadNote');
}
