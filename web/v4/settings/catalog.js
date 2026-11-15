import { clear, el } from '../core/dom.js';
import { catalogGroups } from './catalog-data.js';
import { catalogItem, controlFromAction } from './catalog-items.js';

export class Catalog {
  constructor(options) {
    Object.assign(this, options);
    this.search = el('input', 'settings-catalog-search');
    this.search.type = 'search'; this.search.placeholder = this.i18n.t('catalog.search');
    this.search.addEventListener('input', () => this.renderGroups());
    this.list = el('div', 'settings-catalog-list');
    clear(this.root); this.root.append(el('h2', '', this.i18n.t('settings.catalog.title')), this.search, this.list);
    this.preview.overlay.addEventListener('dragover', (event) => this.dragOver(event));
    this.preview.overlay.addEventListener('drop', (event) => this.drop(event));
    this.renderGroups();
  }

  text(value) { return value.indexOf('catalog.') === 0 ? this.i18n.t(value) : value; }

  renderGroups() {
    clear(this.list);
    const query = this.search.value.trim().toLocaleLowerCase();
    catalogGroups.forEach((group) => {
      const items = group.items.filter((value) => `${this.i18n.t(value.name)} ${this.text(value.description)}`.toLocaleLowerCase().includes(query));
      if (!items.length) return;
      const details = el('details', 'settings-catalog-group'); details.open = !query;
      const summary = el('summary'); summary.append(el('strong', '', this.i18n.t(group.title)), el('small', '', this.i18n.t(group.note)));
      details.appendChild(summary);
      items.forEach((value) => details.appendChild(this.row(value)));
      this.list.appendChild(details);
    });
    if (!this.list.childNodes.length) this.list.appendChild(el('p', 'settings-catalog-empty', this.i18n.t('catalog.noResults')));
  }

  row(value) {
    const row = el('div', 'settings-catalog-item'); row.draggable = true; row.dataset.action = value.action;
    row.append(el('strong', '', this.i18n.t(value.name)), el('small', '', this.text(value.description)));
    row.addEventListener('dragstart', (event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('text/x-tapoard-catalog', value.action); });
    row.addEventListener('dblclick', () => this.add(value.action));
    return row;
  }

  value(action) {
    for (const group of catalogGroups) {
      const found = group.items.find((item) => item.action === action);
      if (found) return found;
    }
    return null;
  }

  create(action) {
    const data = this.value(action);
    return data ? catalogItem(action, this.i18n.t(data.name)) : null;
  }

  add(action, cell) {
    const target = controlFromAction(action), orientation = this.preview.current(), page = this.preview.page();
    if (target) {
      const item = Object.assign({}, orientation.faders[target], { width: orientation.faders[target].width, height: orientation.faders[target].height });
      const space = cell || this.editor.firstSpace(orientation, page, item);
      if (space && this.editor.moveFader(this.preview.orientation, page, target, space.row, space.column)) return true;
    } else {
      const item = this.create(action);
      if (item && this.editor.addItem(this.preview.orientation, page, item, cell && cell.row, cell && cell.column)) return true;
    }
    this.onError(this.i18n.t('catalog.noSpace'));
    return false;
  }

  dragOver(event) {
    if (event.dataTransfer.types.indexOf('text/x-tapoard-catalog') < 0) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
  }

  drop(event) {
    const action = event.dataTransfer.getData('text/x-tapoard-catalog');
    if (!action) return;
    event.preventDefault(); this.add(action, this.preview.cellFromPoint(event.clientX, event.clientY));
  }
}
