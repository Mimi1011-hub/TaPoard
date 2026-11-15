import { clear, el } from '../core/dom.js';

export class WeatherPlace {
  constructor(options) {
    Object.assign(this, options);
  }

  mount(root) {
    this.current = el('p', 'weather-current');
    this.query = el('input', '');
    this.query.type = 'search';
    this.query.placeholder = this.i18n.t('general.weatherQuery');
    const search = el('button', '', this.i18n.t('general.weatherSearch'));
    search.type = 'button';
    search.addEventListener('click', () => this.search().catch((error) => this.onError(error.message)));
    this.query.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') search.click();
    });
    this.results = el('div', 'weather-results');
    root.append(el('h3', '', this.i18n.t('general.weather')), this.current, this.query, search, this.results);
  }

  update(weather) {
    const location = weather && weather.location;
    this.current.textContent = location || this.i18n.t('general.weatherUnset');
  }

  async search() {
    const query = this.query.value.trim();
    if (query.length < 2) {
      this.onError(this.i18n.t('general.weatherShort'));
      return;
    }
    const response = await this.api.post('/api/weather/search', { query });
    clear(this.results);
    (response.results || []).forEach((result) => {
      const name = [result.name, result.region, result.country].filter(Boolean).join('、');
      const button = el('button', 'weather-result', name);
      button.type = 'button';
      button.addEventListener('click', () => this.choose(result).catch((error) => this.onError(error.message)));
      this.results.appendChild(button);
    });
  }

  async choose(result) {
    const body = {
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      timezone: result.timezone,
    };
    const response = await this.api.post('/api/weather/location', body);
    const location = response.weatherLocation || response;
    this.current.textContent = location.name || body.name;
    clear(this.results);
  }
}
