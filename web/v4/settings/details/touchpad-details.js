import { checkField, rangeField, selectField } from './fields.js';

export function touchpadDetails(context) {
  context.defaults({ speed: 5, acceleration: true, tapToClick: true, twoFingerScroll: true, reverseScroll: false, longPress: 'rightClick' });
  rangeField(context, context.t('details.speed'), 'speed', 1, 10);
  ['acceleration', 'tapToClick', 'twoFingerScroll', 'reverseScroll'].forEach((name) => checkField(context, context.t(`details.${name}`), name));
  selectField(context, context.t('details.longPress'), 'longPress', [
    ['none', context.t('details.none')], ['rightClick', context.t('details.rightClick')], ['drag', context.t('details.drag')],
  ]);
}
