import { clear, el } from '../core/dom.js';
import { IconPacks } from './icon-packs.js';

export class Appearance {
  constructor(options) {
    Object.assign(this, options);
    this.build();
  }
  async start() {
    try {
      await this.iconPacks.load();
    } catch (error) {
      this.onError(error.serverError || error.message);
    }
    this.renderBulk();
    this.iconPicker.setPacks(this.iconPacks);
  }
  build() {
    clear(this.root);
    this.packRoot = el('section', 'appearance-block');
    this.root.appendChild(this.packRoot);
    this.bulkRoot = el('section', 'appearance-block');
    this.root.appendChild(this.bulkRoot);
    this.iconPacks = new IconPacks({
      api: this.api,
      editor: this.editor,
      i18n: this.i18n,
      root: this.packRoot,
      confirmFn: this.confirmFn,
      promptFn: this.promptFn,
      onError: this.onError,
      onNotice: this.onNotice || this.onError,
      onChange: () => this.renderBulk(),
    });
  }
  renderBulk() {
    clear(this.bulkRoot);
    this.bulkRoot.appendChild(el('h3', '', this.i18n.t('bulk.title')));
    this.bulkRoot.appendChild(el('p', 'saved-note', this.i18n.t('bulk.note')));
    const before = this.pack ? this.pack.value : '';
    this.pack = el('select');
    const standard = el('option', '', this.i18n.t('packs.standard'));
    standard.value = '';
    this.pack.appendChild(standard);
    this.iconPacks.packs
      .filter((pack) => pack.mapped > 0)
      .forEach((pack) => {
        const option = el('option', '', `${pack.name} (${pack.mapped})`);
        option.value = pack.id;
        this.pack.appendChild(option);
      });
    if (Array.from(this.pack.options).some((option) => option.value === before)) this.pack.value = before;
    this.scope = el('select');
    [
      ['page', 'bulk.page'],
      ['all', 'bulk.all'],
    ].forEach(([value, key]) => {
      const option = el('option', '', this.i18n.t(key));
      option.value = value;
      this.scope.appendChild(option);
    });
    const apply = el('button', '', this.i18n.t('bulk.apply'));
    apply.type = 'button';
    apply.addEventListener('click', async () => {
      await this.iconPacks.bulk(this.pack.value, this.scope.value, this.preview.orientation, this.preview.page());
    });
    this.bulkRoot.append(this.pack, this.scope, apply);
    const guide = el('button', 'icon-ai-open', this.i18n.t('iconAi.open'));
    guide.type = 'button';
    guide.addEventListener('click', () => this.onGuide());
    this.bulkRoot.appendChild(guide);
  }
}
