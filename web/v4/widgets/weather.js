import { el, clear } from '../core/dom.js';
import { appendWidgetName } from './common.js';

function symbol(code) {
  if (code <= 1) return '☀';
  if (code <= 3) return '☁';
  if (code === 45 || code === 48) return '≋';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄';
  if (code >= 95) return 'ϟ';
  return '☂';
}

function temperature(value) {
  return Number.isFinite(value) ? `${Math.round(value)}°` : '—';
}

export class WeatherWidget {
  constructor(context) { this.context = context; }

  mount(node, item, state) {
    this.node = node;
    this.item = item;
    node.classList.add('weather-widget');
    this.update(state);
  }

  update(state) {
    const weather = state.weather || {};
    clear(this.node);
    const large = (this.item.width || 1) >= 2 && (this.item.height || 1) >= 2;
    this.node.classList.toggle('weather-large', large);
    if (!weather.configured) {
      this.node.appendChild(el('strong', 'weather-message', this.context.i18n.t('weather.unconfigured')));
      appendWidgetName(this.node, this.item);
      return;
    }
    if (!weather.available) {
      this.node.appendChild(el('strong', 'weather-message', this.context.i18n.t('weather.loading')));
      appendWidgetName(this.node, this.item);
      return;
    }
    if (!large) {
      this.node.append(el('span', 'weather-icon', symbol(weather.code)), el('strong', 'weather-temperature', temperature(weather.temperature)),
        el('span', 'weather-rain', this.context.i18n.t('weather.rain', { value: Math.round(weather.precipitation || 0) })));
    } else {
      this.node.appendChild(el('strong', 'weather-heading', weather.location || ''));
      const days = el('div', 'weather-days');
      (weather.days || []).slice(0, 3).forEach((day, index) => {
        const date = new Date(`${day.date}T00:00:00`);
        const column = el('div');
        column.append(el('small', '', index === 0 ? this.context.i18n.t('weather.today') : `${date.getMonth() + 1}/${date.getDate()}`),
          el('b', '', symbol(day.code)), el('span', '', `${temperature(day.maximum)}/${temperature(day.minimum)}`),
          el('em', '', `☂ ${Math.round(day.precipitation || 0)}%`));
        days.appendChild(column);
      });
      this.node.appendChild(days);
      this.node.appendChild(el('small', 'weather-attribution', weather.attribution || 'Weather data by Open-Meteo.com'));
    }
    appendWidgetName(this.node, this.item);
  }

  destroy() {}
}
