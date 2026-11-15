import { el } from '../core/dom.js';
import { showInputNotice } from '../input/notice.js';
import { appendWidgetName } from './common.js';
import { TouchpadGesture } from './touchpad-gestures.js';

function options(item) {
  const source = item.options || {};
  const speed = Number(source.speed);
  return {
    speed: Number.isFinite(speed) ? Math.max(1, Math.min(10, Math.round(speed))) : 5,
    acceleration: source.acceleration !== false, tapToClick: source.tapToClick !== false,
    twoFingerScroll: source.twoFingerScroll !== false, reverseScroll: source.reverseScroll === true,
    longPress: source.longPress === 'rightClick' || source.longPress === 'drag' ? source.longPress : 'none',
  };
}

export class TouchpadWidget {
  constructor(context) { this.context = context; }
  mount(node, item) {
    this.node = node; this.item = item; this.options = options(item); node.classList.add('touchpad-widget');
    const hints = [];
    if (this.options.tapToClick) hints.push(this.context.i18n.t('touchpad.tapHint'));
    if (this.options.twoFingerScroll) hints.push(this.context.i18n.t('touchpad.scrollHint'));
    node.appendChild(el('span', 'touchpad-hint', hints.join('\n'))); appendWidgetName(node, item);
    node.appendChild(el('span', 'input-notice', this.context.i18n.t('input.busy')));
    node.setAttribute('aria-label', item.name || this.context.i18n.t('touchpad.name'));
    this.sender = this.context.senders.get(item.id);
    this.sender.listen((state) => showInputNotice(node, state, this.context.i18n));
    this.gesture = new TouchpadGesture(node, this.sender, this.options, this.context);
  }
  update() {}
  destroy() { this.gesture.destroy(); clearTimeout(this.node.inputNoticeTimer); }
}
