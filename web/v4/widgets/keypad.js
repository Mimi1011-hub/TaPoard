import { el } from '../core/dom.js';
import { showInputNotice } from '../input/notice.js';

const compact = [
  ['7', 'numpad-7'], ['8', 'numpad-8'], ['9', 'numpad-9'], ['÷', 'numpad-divide'],
  ['4', 'numpad-4'], ['5', 'numpad-5'], ['6', 'numpad-6'], ['×', 'numpad-multiply'],
  ['1', 'numpad-1'], ['2', 'numpad-2'], ['3', 'numpad-3'], ['−', 'numpad-subtract'],
  ['0', 'numpad-0'], ['.', 'numpad-decimal'], ['Enter', 'numpad-enter'], ['＋', 'numpad-add'],
];

const tall = [
  ['C', 'numpad-clear', 1, 1, 1, 1, 'keypad.clear'], ['÷', 'numpad-divide', 2, 1], ['×', 'numpad-multiply', 3, 1], ['−', 'numpad-subtract', 4, 1],
  ['7', 'numpad-7', 1, 2], ['8', 'numpad-8', 2, 2], ['9', 'numpad-9', 3, 2], ['＋', 'numpad-add', 4, 2, 1, 2],
  ['4', 'numpad-4', 1, 3], ['5', 'numpad-5', 2, 3], ['6', 'numpad-6', 3, 3],
  ['1', 'numpad-1', 1, 4], ['2', 'numpad-2', 2, 4], ['3', 'numpad-3', 3, 4], ['Enter', 'numpad-enter', 4, 4, 1, 2],
  ['0', 'numpad-0', 1, 5, 2, 1], ['.', 'numpad-decimal', 3, 5],
];

export class KeypadWidget {
  constructor(context) { this.context = context; this.listeners = []; }
  mount(node, item) {
    this.node = node; this.item = item; node.classList.add('keypad-widget');
    const isTall = (item.height || 4) === 5;
    if (isTall) node.classList.add('keypad-tall');
    this.sender = this.context.senders.get(item.id);
    (isTall ? tall : compact).forEach((definition) => this.addKey(definition));
    node.appendChild(el('span', 'input-notice', this.context.i18n.t('input.busy')));
    node.setAttribute('aria-label', item.name || this.context.i18n.t('keypad.name'));
    this.sender.listen((state) => showInputNotice(node, state, this.context.i18n));
  }

  addKey(definition) {
    const key = el('button', 'keypad-key', definition[0]); key.type = 'button';
    key.setAttribute('aria-label', definition[6] ? this.context.i18n.t(definition[6]) : definition[0]); key.dataset.control = definition[1];
    if (definition[2]) {
      key.style.gridColumn = `${definition[2]} / span ${definition[4] || 1}`;
      key.style.gridRow = `${definition[3]} / span ${definition[5] || 1}`;
    }
    const press = (event) => { event.preventDefault(); key.classList.add('is-pressed'); this.context.feedback.tap(true); };
    const release = (event) => { event.preventDefault(); key.classList.remove('is-pressed'); this.sender.keyTap(definition[1]); this.sender.release(); };
    const cancel = () => key.classList.remove('is-pressed');
    key.addEventListener('pointerdown', press); key.addEventListener('pointerup', release); key.addEventListener('pointercancel', cancel);
    this.listeners.push([key, press, release, cancel]); this.node.appendChild(key);
  }
  update() {}
  destroy() {
    clearTimeout(this.node.inputNoticeTimer);
    this.listeners.forEach(([key, press, release, cancel]) => {
      key.removeEventListener('pointerdown', press); key.removeEventListener('pointerup', release); key.removeEventListener('pointercancel', cancel);
    });
  }
}
