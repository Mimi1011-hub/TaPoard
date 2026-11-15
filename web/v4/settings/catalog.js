import { clear, el } from '../core/dom.js';
import { catalogGroups, catalogTops } from './catalog-data/index.js';
import { catalogItem, controlFromAction } from './catalog-items.js';
import { CatalogRecent } from './catalog-recent.js';
import { CatalogView } from './catalog-view.js';

export class Catalog {
  constructor(options) {
    Object.assign(this, options);
    this.level = 'top';
    this.recent = new CatalogRecent(this.documentObject.defaultView.localStorage);
    this.search = el('input', 'settings-catalog-search');
    this.search.type = 'search'; this.search.placeholder = this.i18n.t('catalog.search');
    this.search.addEventListener('input', () => this.render());
    this.list = el('div', 'settings-catalog-list');
    this.recentRoot = el('div', 'catalog-recent');
    this.view = new CatalogView({ root: this.list, i18n: this.i18n });
    clear(this.root);
    this.root.append(el('h2', '', this.i18n.t('settings.catalog.title')), this.search, this.list, this.recentRoot);
    this.preview.overlay.addEventListener('dragover', (event) => this.dragOver(event));
    this.preview.overlay.addEventListener('drop', (event) => this.drop(event));
    this.documentObject.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.back()) event.preventDefault();
    });
    this.render();
  }

  text(value) { return value.indexOf('catalog.') === 0 ? this.i18n.t(value) : value; }

  render() {
    const query = this.search.value.trim().toLocaleLowerCase();
    if (query) {
      const items = catalogGroups.flatMap((group) => group.items).filter((value) => {
        return `${this.i18n.t(value.name)} ${this.text(value.description)}`.toLocaleLowerCase().includes(query);
      });
      this.view.showItems('', items, null, (item, label) => this.row(item, label), (item) => this.i18n.t(this.groupFor(item).title));
      this.renderRecent(false);
      return;
    }
    if (this.level === 'top') this.view.showCards(catalogTops, (top) => this.openTop(top));
    else if (this.level === 'groups') this.view.showGroups(this.top, () => this.showTop(), (group) => this.openGroup(group));
    else this.view.showItems(this.path(), this.group.items, () => this.openTop(this.top), (item) => this.row(item));
    this.renderRecent(this.level === 'top');
  }

  openTop(top) {
    this.top = top;
    if (top.flat) {
      this.group = top.groups[0];
      this.level = 'items';
    } else this.level = 'groups';
    this.render();
  }

  openGroup(group) {
    this.group = group;
    this.level = 'items';
    this.render();
  }
  showTop() {
    this.level = 'top';
    this.top = null;
    this.group = null;
    this.render();
  }
  back() {
    if (this.search.value) {
      this.search.value = '';
      this.render();
      return true;
    }
    if (this.level === 'top') return false;
    if (this.level === 'items' && !this.top.flat) this.level = 'groups';
    else this.level = 'top';
    this.render();
    return true;
  }
  path() {
    return `${this.i18n.t(this.top.title)} › ${this.i18n.t(this.group.title)}`;
  }

  row(value, groupLabel) {
    const row = el('button', 'settings-catalog-item');
    row.type = 'button';
    row.draggable = true;
    row.dataset.action = value.action;
    row.append(el('strong', '', this.i18n.t(value.name)), el('small', '', this.text(value.description)));
    if (groupLabel) row.appendChild(el('small', 'catalog-item-group', groupLabel));
    row.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/x-tapoard-catalog', value.action);
    });
    row.addEventListener('dblclick', () => this.add(value.action));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.add(value.action);
    });
    return row;
  }

  renderRecent(show) {
    clear(this.recentRoot);
    if (!show) return;
    const ids = this.recent.read((id) => Boolean(this.value(id)));
    if (!ids.length) return;
    this.recentRoot.appendChild(el('h3', '', this.i18n.t('catalog.recent')));
    ids.forEach((id) => this.recentRoot.appendChild(this.row(this.value(id))));
  }

  groupFor(item) {
    return catalogGroups.find((group) => group.items.indexOf(item) >= 0);
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
    return data ? catalogItem(action, this.i18n.t(data.name), data.category) : null;
  }

  add(action, cell) {
    const target = controlFromAction(action), orientation = this.preview.current(), page = this.preview.page();
    if (target) {
      const item = Object.assign({}, orientation.faders[target], { width: orientation.faders[target].width, height: orientation.faders[target].height });
      const space = cell || this.editor.firstSpace(orientation, page, item);
      if (space && this.editor.moveFader(this.preview.orientation, page, target, space.row, space.column)) {
        this.used(action);
        return true;
      }
    } else {
      const item = this.create(action);
      if (item && this.editor.addItem(this.preview.orientation, page, item, cell && cell.row, cell && cell.column)) {
        this.used(action);
        return true;
      }
    }
    this.onError(this.i18n.t('catalog.noSpace'));
    return false;
  }

  used(action) {
    this.recent.add(action);
    this.renderRecent(this.level === 'top' && !this.search.value);
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
