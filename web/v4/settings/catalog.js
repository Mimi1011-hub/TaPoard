import { clear, el } from '../core/dom.js';
import { catalogGroups, catalogTops } from './catalog-data/index.js';
import { catalogItem, controlFromAction } from './catalog-items.js';
import { CatalogRecent } from './catalog-recent.js';
import { CatalogView } from './catalog-view.js';
import { CatalogInputDialog } from './catalog-input-dialog.js';

export class Catalog {
  constructor(options) {
    Object.assign(this, options);
    this.level = 'top';
    this.shortcutPacks = [];
    this.recent = new CatalogRecent(this.documentObject.defaultView.localStorage);
    this.search = el('input', 'settings-catalog-search');
    this.search.type = 'search'; this.search.placeholder = this.i18n.t('catalog.search');
    this.search.addEventListener('input', () => this.render());
    this.list = el('div', 'settings-catalog-list');
    this.recentRoot = el('div', 'catalog-recent');
    this.view = new CatalogView({ root: this.list, i18n: this.i18n });
    this.inputDialog = new CatalogInputDialog(this);
    clear(this.root);
    this.root.append(el('h2', '', this.i18n.t('settings.catalog.title')), this.search, this.list, this.recentRoot);
    this.preview.overlay.addEventListener('dragover', (event) => this.dragOver(event));
    this.preview.overlay.addEventListener('drop', (event) => this.drop(event));
    // Esc goes back one level, but only from inside the catalog, so dialogs and text fields keep their own Esc.
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.back()) event.preventDefault();
    });
    this.render();
  }

  text(value) { return value.indexOf('catalog.') === 0 ? this.i18n.t(value) : value; }

  // Built-in names are dictionary keys; names from a pack are shown as they are.
  label(value) { return value.plain ? value.name : this.i18n.t(value.name); }

  render() {
    const query = this.search.value.trim().toLocaleLowerCase();
    if (query) {
      const items = this.allGroups().flatMap((group) => group.items).filter((value) => {
        return `${this.label(value)} ${this.text(value.description)}`.toLocaleLowerCase().includes(query);
      });
      this.view.showItems('', items, null, (item, label) => this.row(item, label), (item) => this.view.title(this.groupFor(item)));
      this.renderRecent(false);
      return;
    }
    if (this.level === 'top') this.view.showCards(catalogTops, (top) => this.openTop(top));
    else if (this.level === 'groups') {
      const top = Object.assign({}, this.top, { groups: this.groupsFor(this.top) });
      const extra = this.top.id === 'apps' && this.appsExtra ? this.appsExtra() : null;
      this.view.showGroups(top, () => this.showTop(), (group) => this.openGroup(group), extra);
    }
    else {
      this.view.showItems(this.path(), this.group.items, () => this.back(), (item) => this.row(item));
      if (this.top.id === 'launch' && this.launchExtra) this.list.appendChild(this.launchExtra());
    }
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
    return `${this.i18n.t(this.top.title)} › ${this.view.title(this.group)}`;
  }

  row(value, groupLabel) {
    const row = el('button', 'settings-catalog-item');
    row.type = 'button';
    row.draggable = true;
    row.dataset.action = value.id || value.action;
    row.append(el('strong', '', this.label(value)), el('small', '', this.text(value.description)));
    if (groupLabel) row.appendChild(el('small', 'catalog-item-group', groupLabel));
    row.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/x-tapoard-catalog', value.id || value.action);
    });
    row.addEventListener('dblclick', () => this.add(value.id || value.action));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.add(value.id || value.action);
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
    return this.allGroups().find((group) => group.items.indexOf(item) >= 0);
  }

  allGroups() { return catalogGroups.concat(this.shortcutPacks); }
  groupsFor(top) { return top.id === 'apps' ? top.groups.concat(this.shortcutPacks) : top.groups; }

  setShortcutPacks(packs, remove) {
    this.shortcutPacks = packs.map((pack) => ({
      id: `pack:${pack.id}`,
      plain: true,
      title: pack.name,
      note: [pack.app, pack.author].filter(Boolean).join(this.i18n.t('common.listSeparator')),
      pack,
      remove,
      items: (pack.shortcuts || []).map((item, index) => {
        const iconId = item.icon ? `i${index + 1}` : '';
        const icon = iconId && pack.iconItems ? pack.iconItems.find((value) => value.id === iconId) : null;
        return {
          id: `pack:${pack.id}:${index}`,
          plain: true,
          name: item.name,
          description: item.description || item.keys,
          keys: item.keys,
          category: 'common',
          iconKey: 'keyboard',
          iconPack: pack.iconPack || '',
          iconPackItem: iconId,
          customIcon: icon ? icon.data : '',
        };
      }),
    }));
    this.render();
  }

  value(action) {
    for (const group of this.allGroups()) {
      const found = group.items.find((item) => (item.id || item.action) === action);
      if (found) return found;
    }
    return null;
  }

  create(action) {
    const data = this.value(action);
    if (!data) return null;
    if (data.keys) {
      const value = catalogItem('key-custom', this.label(data), data.category);
      value.hotkey = data.keys;
      value.iconKey = data.iconKey || 'keyboard';
      if (data.iconPack && data.iconPackItem) {
        value.iconPack = data.iconPack;
        value.iconPackItem = data.iconPackItem;
        value.customIcon = data.customIcon || '';
      }
      return value;
    }
    return catalogItem(action, this.i18n.t(data.name), data.category);
  }

  async add(action, cell) {
    const target = controlFromAction(action), orientation = this.preview.current(), page = this.preview.page();
    if (target) {
      const item = Object.assign({}, orientation.faders[target], { width: orientation.faders[target].width, height: orientation.faders[target].height });
      const space = cell || this.editor.firstSpace(orientation, page, item);
      if (space && this.editor.moveFader(this.preview.orientation, page, target, space.row, space.column)) {
        this.used(action);
        return true;
      }
    } else {
      let item = this.create(action);
      item = await this.inputDialog.ask(action, item);
      if (!item) return false;
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
