import { el } from '../core/dom.js';

export class ThemeSetting {
  constructor(options) {
    Object.assign(this, options);
  }

  mount(root) {
    this.documentObject.documentElement.dataset.theme = 'dark';
    const field = el('div', 'settings-field theme-setting');
    const switcher = el('div', 'orientation-switch theme-switch');
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', this.i18n.t('general.colorMode'));
    const dark = el('button', 'is-active', this.i18n.t('general.themeDark'));
    dark.type = 'button';
    dark.setAttribute('aria-pressed', 'true');
    const light = el('button', '', this.i18n.t('general.themeLight'));
    light.type = 'button';
    light.disabled = true;
    light.title = this.i18n.t('general.themeUnavailable');
    light.setAttribute('aria-pressed', 'false');
    switcher.append(dark, light);
    field.append(
      el('span', '', this.i18n.t('general.colorMode')),
      switcher,
      el('p', 'settings-note theme-note', this.i18n.t('general.themeUnavailable')),
    );
    root.appendChild(field);
  }
}
