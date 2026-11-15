import { clear, el } from '../core/dom.js';
import { iconNode, presetGroups, presetIconNode } from '../deck/icons.js';
import { iconWords } from './icon-words.js';
import { makeCustomIcon } from './image-tools.js';

const colors = ['', '#3569c8', '#00827d', '#287d43', '#a65b00', '#b53846', '#a63783', '#714bc4', '#4d5665', '#15181e'];

export class IconPicker {
  constructor(options) { Object.assign(this, options); this.color = ''; this.build(); }
  build() {
    this.dialog = el('dialog', 'icon-picker'); this.dialog.addEventListener('click', (event) => { if (event.target === this.dialog) this.close(); });
    this.dialog.addEventListener('cancel', (event) => { event.preventDefault(); this.close(); });
    this.panel = el('section', 'icon-picker-panel'); this.dialog.appendChild(this.panel); this.documentObject.body.appendChild(this.dialog);
  }
  open(address) { this.address = address; const item = this.editor.item(address); if (!item) return; this.color = item.iconColor || ''; this.render(item); this.dialog.showModal(); }
  close() { this.dialog.close(); this.address = null; }
  render(item) {
    clear(this.panel); this.panel.append(el('h2', '', this.i18n.t('icon.title')));
    const current = el('div', 'icon-current'); current.append(iconNode(item), el('span', '', item.name)); this.panel.appendChild(current);
    this.search = el('input', 'icon-search'); this.search.type = 'search'; this.search.placeholder = this.i18n.t('icon.search'); this.search.addEventListener('input', () => this.filter()); this.panel.appendChild(this.search);
    const colorRow = el('div', 'icon-colors'); colors.forEach((value, index) => { const button = el('button', `icon-color${value === this.color ? ' is-active' : ''}`, value === this.color ? '✓' : ''); button.type = 'button'; button.title = this.i18n.t(`icon.color.${index}`); button.style.background = value || 'linear-gradient(135deg,#3569c8,#a63783)'; button.addEventListener('click', () => { this.color = value; this.render(item); }); colorRow.appendChild(button); }); this.panel.appendChild(colorRow);
    const automatic = el('button', 'icon-choice automatic', this.i18n.t('icon.automatic')); automatic.type = 'button'; automatic.dataset.search = this.i18n.t('icon.automatic'); automatic.addEventListener('click', () => this.choose({ iconKey: '', iconColor: '', customIcon: '', iconPack: null, iconPackItem: null })); this.panel.appendChild(automatic);
    this.groups = el('div', 'icon-groups'); presetGroups.forEach(([group, values]) => this.groups.appendChild(this.group(group, values))); this.panel.appendChild(this.groups);
    const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true; file.addEventListener('change', () => this.custom(file.files[0]));
    const image = el('button', 'icon-image-button', this.i18n.t('icon.fromImage')); image.type = 'button'; image.addEventListener('click', () => file.click()); this.panel.append(image, file);
  }
  group(name, values) {
    const section = el('section', 'icon-group'); section.appendChild(el('h3', '', this.i18n.t(`icon.group.${name}`)));
    const grid = el('div', 'icon-grid'); values.forEach(([key]) => { const label = this.i18n.t(`icon.name.${key}`), button = el('button', 'icon-choice'); button.type = 'button'; button.dataset.search = `${label} ${this.i18n.t(`icon.group.${name}`)} ${iconWords[key] || ''}`.toLowerCase(); button.append(presetIconNode(key, this.color), el('span', '', label)); button.addEventListener('click', () => this.choose({ iconKey: key, iconColor: this.color, customIcon: '', iconPack: null, iconPackItem: null })); grid.appendChild(button); }); section.appendChild(grid); return section;
  }
  filter() { const words = this.search.value.trim().toLowerCase().split(/\s+/).filter(Boolean); this.groups.querySelectorAll('.icon-choice').forEach((button) => { button.hidden = !words.every((word) => button.dataset.search.includes(word)); }); this.groups.querySelectorAll('.icon-group').forEach((group) => { group.hidden = !group.querySelector('.icon-choice:not([hidden])'); }); }
  choose(values) { if (this.address) this.editor.updateItem(this.address, values); this.close(); }
  async custom(file) { try { this.choose({ iconKey: '', iconColor: '', customIcon: await makeCustomIcon(file), iconPack: null, iconPackItem: null }); } catch (error) { this.onError(this.i18n.t(error.message === 'size' ? 'icon.imageTooLarge' : 'icon.imageFailed')); } }
}
