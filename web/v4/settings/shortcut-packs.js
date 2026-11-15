import { el } from '../core/dom.js';
import { makePackIcon } from './image-tools.js';
import { readShortcutPack } from './shortcut-pack-reader.js';

export class ShortcutPacks {
  constructor(options) {
    Object.assign(this, options);
    this.packs = [];
    this.input = el('input', '');
    this.input.type = 'file';
    this.input.accept = '.tpshortcuts,.json';
    this.input.hidden = true;
    this.input.addEventListener('change', () => this.importSelected());
    this.documentObject.body.appendChild(this.input);
  }

  async load() {
    const response = await this.api.get('/api/shortcut-packs', 10000);
    this.packs = response.packs || [];
    for (const pack of this.packs) {
      if (!pack.iconPack) continue;
      try {
        const icons = await this.api.get(`/api/icon-packs/get?id=${encodeURIComponent(pack.iconPack)}`, 15000);
        pack.iconItems = icons.icons || [];
      } catch (error) {
        pack.iconItems = [];
      }
    }
    this.catalog.setShortcutPacks(this.packs, (pack) => this.remove(pack));
  }

  importButton() {
    const button = el('button', 'catalog-import-pack', this.i18n.t('shortcuts.import'));
    button.type = 'button';
    button.addEventListener('click', () => this.input.click());
    return button;
  }

  async importSelected() {
    const file = this.input.files[0];
    this.input.value = '';
    if (!file) return;
    let iconPack = '';
    try {
      const source = await readShortcutPack(file);
      iconPack = await this.createIcons(source);
      const response = await this.api.post('/api/shortcut-packs/save', {
        name: source.name,
        author: source.author,
        app: source.app,
        iconPack,
        shortcuts: source.shortcuts,
      }, 15000);
      if (!response.id) throw new Error('save');
      this.onNotice(this.i18n.t('shortcuts.imported', { count: source.shortcuts.length, skipped: source.skipped }));
      await this.load();
    } catch (error) {
      if (iconPack) await this.api.post('/api/icon-packs/delete', { id: iconPack }).catch(() => {});
      this.onError(error.serverError || this.i18n.t(`shortcuts.error.${error.message}`));
    }
  }

  async createIcons(source) {
    const used = source.shortcuts.filter((item) => item.icon);
    if (!used.length) return '';
    let id = '';
    try {
      id = (await this.api.post('/api/icon-packs/create', { name: source.name, author: source.author }, 10000)).id;
      const icons = [];
      for (let index = 0; index < used.length; index += 1) {
        const item = used[index];
        const read = source.icons.get(item.icon);
        const shortcutIndex = source.shortcuts.indexOf(item);
        icons.push({ id: `i${shortcutIndex + 1}`, name: item.icon, key: '', group: '', tags: '', data: await makePackIcon(await read()) });
      }
      if (icons.length) await this.api.post('/api/icon-packs/add', { id, icons }, 30000);
      return id;
    } catch (error) {
      if (id) await this.api.post('/api/icon-packs/delete', { id }).catch(() => {});
      this.onNotice(this.i18n.t('shortcuts.iconsSkipped'));
      return '';
    }
  }

  async remove(pack) {
    if (!await this.confirmDialog.ask(this.i18n.t('shortcuts.deleteConfirm'))) return;
    try {
      await this.api.post('/api/shortcut-packs/delete', { id: pack.id });
      await this.load();
    } catch (error) {
      this.onError(error.serverError || error.message);
    }
  }
}
