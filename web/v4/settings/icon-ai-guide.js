import { clear, el } from '../core/dom.js';
import { presetGroups } from '../deck/icons.js';

export function iconTemplate(i18n) {
  const icons = presetGroups.flatMap((group) => group[1]).map(([key]) => ({
    key,
    name: i18n.t(`icon.name.${key}`),
    file: `icons/${key}.png`,
  }));
  return { format: 'tapoard-icons', version: 1, name: i18n.t('iconAi.packName'), author: '', icons };
}

export function iconPrompt(i18n, manifest) {
  const names = manifest.icons.map((icon) => icon.name).join(i18n.t('iconAi.separator'));
  return i18n.t('iconAi.prompt', { names });
}

export class IconAiGuide {
  constructor(options) { Object.assign(this, options); }

  render() {
    clear(this.root);
    const manifest = iconTemplate(this.i18n);
    const prompt = iconPrompt(this.i18n, manifest);
    const list = el('ol', 'icon-ai-steps');
    list.append(
      this.step('iconAi.step1', this.button('iconAi.download', () => this.download(manifest))),
      this.step('iconAi.step2', el('pre', 'icon-ai-prompt', prompt), this.button('iconAi.copy', () => this.copy(prompt))),
      this.step('iconAi.step3'),
      this.step('iconAi.step4'),
      this.step('iconAi.step5'),
    );
    this.root.append(el('p', 'saved-note', this.i18n.t('iconAi.intro')), list);
  }

  step(key, ...children) {
    const item = el('li');
    item.appendChild(el('p', '', this.i18n.t(key)));
    children.forEach((child) => item.appendChild(child));
    return item;
  }

  button(key, run) {
    const button = el('button', '', this.i18n.t(key));
    button.type = 'button';
    button.addEventListener('click', run);
    return button;
  }

  download(manifest) {
    const link = this.documentObject.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    link.download = 'icons.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    this.onNotice(this.i18n.t('iconAi.downloaded'));
  }

  async copy(text) {
    try {
      await this.documentObject.defaultView.navigator.clipboard.writeText(text);
      this.onNotice(this.i18n.t('iconAi.copied'));
    } catch (error) { this.onNotice(this.i18n.t('iconAi.copyFailed')); }
  }
}
