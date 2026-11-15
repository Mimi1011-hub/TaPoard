import { el } from '../core/dom.js';
import { appendWidgetName } from './common.js';

export class ClockWidget {
  constructor(context) {
    this.context = context;
    this.timer = null;
    this.visibility = () => this.schedule();
  }

  mount(node, item) {
    this.node = node;
    this.item = item;
    const source = item.options || {};
    this.options = {
      style: source.style === 'analog' ? 'analog' : 'digital', showSeconds: source.showSeconds !== false,
      showDate: source.showDate !== false, showWeekday: source.showWeekday !== false, hour12: source.hour12 === true,
    };
    node.classList.add('clock-widget', `clock-${this.options.style}`);
    if (this.options.style === 'analog') this.buildAnalog();
    else {
      this.time = el('strong', 'clock-time');
      node.appendChild(this.time);
      if (this.options.showDate || this.options.showWeekday) {
        this.date = el('span', 'clock-date');
        node.appendChild(this.date);
      }
    }
    appendWidgetName(node, item);
    this.context.documentObject.addEventListener('visibilitychange', this.visibility);
    this.tick();
  }

  buildAnalog() {
    this.face = el('div', 'clock-face');
    [12, 3, 6, 9].forEach((number) => this.face.appendChild(el('span', `clock-marker marker-${number}`, number)));
    ['hour', 'minute'].concat(this.options.showSeconds ? ['second'] : []).forEach((name) => {
      const hand = el('span', `clock-hand clock-${name}`);
      this[name] = hand;
      this.face.appendChild(hand);
    });
    this.face.appendChild(el('span', 'clock-pin'));
    this.node.appendChild(this.face);
  }

  tick() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    if (this.options.style === 'analog') {
      this.hour.style.transform = `translateX(-50%) rotate(${(hours % 12) * 30 + minutes / 2}deg)`;
      this.minute.style.transform = `translateX(-50%) rotate(${minutes * 6 + seconds / 10}deg)`;
      if (this.second) this.second.style.transform = `translateX(-50%) rotate(${seconds * 6}deg)`;
    } else {
      let suffix = '';
      if (this.options.hour12) { suffix = hours < 12 ? ' AM' : ' PM'; hours = hours % 12 || 12; }
      const two = (value) => String(value).padStart(2, '0');
      this.time.textContent = `${two(hours)}:${two(minutes)}${this.options.showSeconds ? `:${two(seconds)}` : ''}${suffix}`;
      if (this.date) {
        const parts = [];
        if (this.options.showDate) parts.push(`${now.getFullYear()}/${two(now.getMonth() + 1)}/${two(now.getDate())}`);
        if (this.options.showWeekday) parts.push(this.context.i18n.t(`clock.weekday.${now.getDay()}`));
        this.date.textContent = parts.join(' ');
      }
    }
    this.schedule(now);
  }

  schedule(now) {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.context.documentObject.hidden) return;
    const date = now || new Date();
    const delay = this.options.showSeconds ? 1010 - date.getMilliseconds() : (60 - date.getSeconds()) * 1000 - date.getMilliseconds() + 10;
    this.timer = setTimeout(() => this.tick(), Math.max(50, delay));
  }

  update() {}

  destroy() {
    clearTimeout(this.timer);
    this.context.documentObject.removeEventListener('visibilitychange', this.visibility);
  }
}
