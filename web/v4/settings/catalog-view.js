import { clear, el } from '../core/dom.js';

export class CatalogView {
  constructor(options) {
    Object.assign(this, options);
  }

  showCards(values, open) {
    clear(this.root);
    values.forEach((value) => {
      const button = el('button', 'catalog-card');
      button.type = 'button';
      button.append(el('strong', '', this.i18n.t(value.title)), el('small', '', this.i18n.t(value.note)));
      button.addEventListener('click', () => open(value));
      this.root.appendChild(button);
    });
  }

  showGroups(top, back, open, extra) {
    clear(this.root);
    this.root.appendChild(this.header(this.i18n.t(top.title), back));
    top.groups.forEach((group) => {
      const button = el('button', 'catalog-card');
      button.type = 'button';
      button.append(el('strong', '', this.i18n.t(group.title)), el('small', '', this.i18n.t(group.note)));
      button.appendChild(el('span', 'catalog-count', this.i18n.t('catalog.count', { count: group.items.length })));
      button.addEventListener('click', () => open(group));
      this.root.appendChild(button);
    });
    if (extra) this.root.appendChild(extra);
  }

  showItems(title, items, back, row, groupLabel) {
    clear(this.root);
    if (back) this.root.appendChild(this.header(title, back));
    items.forEach((item) => this.root.appendChild(row(item, groupLabel && groupLabel(item))));
    if (!items.length) this.root.appendChild(el('p', 'settings-catalog-empty', this.i18n.t('catalog.noResults')));
  }

  header(title, back) {
    const header = el('div', 'catalog-path');
    const button = el('button', 'catalog-back', this.i18n.t('catalog.back'));
    button.type = 'button';
    button.addEventListener('click', back);
    header.append(button, el('strong', '', title));
    return header;
  }
}
