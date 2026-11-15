import { el } from '../core/dom.js';
import { WeatherPlace } from './weather-place.js';
import { LanguageSetting } from './language-setting.js';

export class General {
  constructor(options) {
    Object.assign(this, options);
  }

  start() {
    this.root.appendChild(el('h2', '', this.i18n.t('settings.nav.general')));
    this.language = new LanguageSetting(this);
    this.language.mount(this.root);
    const label = el('label', 'settings-field', this.i18n.t('general.keepAwake'));
    this.keepAwake = el('input', '');
    this.keepAwake.type = 'checkbox';
    this.keepAwake.checked = Boolean(this.editor.deck.keepAwake);
    this.keepAwake.addEventListener('change', () => this.editor.setKeepAwake(this.keepAwake.checked));
    label.appendChild(this.keepAwake);
    this.root.appendChild(label);
    this.weather = new WeatherPlace({ api: this.api, i18n: this.i18n, onError: this.onError });
    this.weather.mount(this.root);
    this.about = el('p', 'general-about');
    this.root.append(el('h3', '', this.i18n.t('general.about')), this.about);
    this.editor.subscribe(() => { this.keepAwake.checked = Boolean(this.editor.deck.keepAwake); });
  }

  update(state) {
    this.weather.update(state.weather);
    this.about.textContent = this.i18n.t('general.versionComputer', {
      version: state.appVersion || '-',
      computer: state.computer || '-',
    });
  }
}
