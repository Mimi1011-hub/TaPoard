import { el } from '../core/dom.js';
import { showInputNotice } from '../input/notice.js';
import { appendWidgetName } from './common.js';
import { RotaryWheelGesture, VerticalWheelGesture } from './wheel-gestures.js';

function wheelOptions(item) {
  const source = item.options || {};
  const rotary = source.style === 'rotary';
  const number = (name, fallback, minimum, maximum) => {
    const value = Number(source[name]);
    return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.round(value))) : fallback;
  };
  return {
    style: rotary ? 'rotary' : 'vertical', sensitivity: number('sensitivity', rotary ? 18 : 24, 1, 200),
    multiplier: number('multiplier', 1, 1, 10), reverse: source.reverse === true,
    ctrl: source.ctrl === true, shift: source.shift === true, alt: source.alt === true, middleClick: source.middleClick === true,
  };
}

function caption(options, i18n) {
  const keys = ['ctrl', 'shift', 'alt'].filter((name) => options[name]).map((name) => name === 'ctrl' ? 'Ctrl' : name === 'shift' ? 'Shift' : 'Alt');
  const wheel = i18n.t('wheel.caption');
  return `${keys.length ? `${keys.join('+')} + ` : ''}${wheel}${options.multiplier > 1 ? ` ×${options.multiplier}` : ''}`;
}

export class WheelWidget {
  constructor(context) { this.context = context; }

  mount(node, item) {
    this.node = node; this.item = item; this.options = wheelOptions(item);
    node.classList.add('wheel-widget', `wheel-${this.options.style}`);
    if (this.options.style === 'rotary') {
      const dial = el('span', 'wheel-dial'); dial.appendChild(el('span', 'wheel-notch'));
      node.append(dial, el('span', 'wheel-center', this.options.middleClick ? this.context.i18n.t('wheel.middle') : ''));
    } else node.appendChild(el('span', 'wheel-ridges'));
    const text = caption(this.options, this.context.i18n);
    node.appendChild(el('span', 'wheel-caption', text)); appendWidgetName(node, item);
    node.appendChild(el('span', 'input-notice', this.context.i18n.t('input.busy')));
    node.setAttribute('aria-label', this.context.i18n.t('wheel.ariaLabel', {
      name: item.name || this.context.i18n.t('wheel.name'), detail: text,
    }));
    this.sender = this.context.senders.get(item.id);
    this.sender.listen((state) => showInputNotice(node, state, this.context.i18n));
    const Gesture = this.options.style === 'rotary' ? RotaryWheelGesture : VerticalWheelGesture;
    this.gesture = new Gesture(node, this.sender, this.options, this.context.feedback);
    if (this.context.pcWindow) this.bindPcWheel();
  }

  bindPcWheel() {
    this.wheelRest = 0;
    this.wheel = (event) => {
      event.preventDefault(); event.stopPropagation();
      this.wheelRest += event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
      let notches = this.wheelRest > 0 ? Math.floor(this.wheelRest / 100) : Math.ceil(this.wheelRest / 100);
      if (!notches && Math.abs(event.deltaY) >= 1 && event.deltaMode !== 0) notches = event.deltaY > 0 ? 1 : -1;
      if (!notches) return;
      this.wheelRest -= notches * 100; this.sender.steps(-notches); this.sender.release();
    };
    this.node.addEventListener('wheel', this.wheel, { passive: false });
  }

  update() {}
  destroy() {
    this.gesture.destroy(); clearTimeout(this.node.inputNoticeTimer);
    if (this.wheel) this.node.removeEventListener('wheel', this.wheel);
  }
}
