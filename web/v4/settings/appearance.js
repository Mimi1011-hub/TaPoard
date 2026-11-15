import { clear, el } from '../core/dom.js';
import { IconPacks } from './icon-packs.js';

export class Appearance {
  constructor(options) { Object.assign(this, options); this.build(); }
  async start() { try { await this.iconPacks.load(); } catch (error) { this.onError(error.serverError || error.message); } this.renderBulk(); this.iconPicker.setPacks(this.iconPacks); }
  build() {
    clear(this.root); this.root.appendChild(el('h2', '', this.i18n.t('appearance.title')));
    this.backgroundRoot = el('section', 'appearance-block'); this.root.appendChild(this.backgroundRoot);
    this.packRoot = el('section', 'appearance-block'); this.root.appendChild(this.packRoot);
    this.bulkRoot = el('section', 'appearance-block'); this.root.appendChild(this.bulkRoot);
    this.iconPacks = new IconPacks({ api: this.api, editor: this.editor, i18n: this.i18n, root: this.packRoot, confirmFn: this.confirmFn, promptFn: this.promptFn, onError: this.onError });
  }
  renderBulk() {
    clear(this.bulkRoot); this.bulkRoot.appendChild(el('h3', '', this.i18n.t('bulk.title')));
    this.pack = el('select'); const standard = el('option', '', this.i18n.t('packs.standard')); standard.value = ''; this.pack.appendChild(standard);
    this.iconPacks.packs.filter((pack) => pack.mapped > 0).forEach((pack) => { const option = el('option', '', `${pack.name} (${pack.mapped})`); option.value = pack.id; this.pack.appendChild(option); });
    this.scope = el('select'); [['page', 'bulk.page'], ['all', 'bulk.all']].forEach(([value, key]) => { const option = el('option', '', this.i18n.t(key)); option.value = value; this.scope.appendChild(option); });
    const apply = el('button', '', this.i18n.t('bulk.apply')); apply.type = 'button'; apply.addEventListener('click', async () => { await this.iconPacks.bulk(this.pack.value, this.scope.value, this.preview.orientation, this.preview.page()); });
    this.bulkRoot.append(this.pack, this.scope, apply);
  }
}
