import { el } from '../core/dom.js';
import { catalogItem } from './catalog-items.js';

const sameText = (left, right) => String(left || '').toLocaleLowerCase() === String(right || '').toLocaleLowerCase();

// Only the fields an imported app or URL can carry are taken from the PC's answer.
export function importedItem(source) {
  const url = source.type === 'url';
  const item = catalogItem('custom-url', String(source.name || ''));
  item.type = url ? 'url' : 'app';
  item.category = url ? 'custom' : 'app';
  item.path = String(source.path || '');
  item.args = String(source.args || '');
  item.url = String(source.url || '');
  item.icon = source.icon || null;
  if (item.icon || !url) item.iconKey = '';
  return item;
}

export class AppImport {
  constructor(options) {
    Object.assign(this, options);
    this.button = el('button', 'settings-import', this.i18n.t('import.open'));
    this.button.type = 'button';
    this.button.addEventListener('click', () => this.start());
    this.root.prepend(this.button);
    this.documentObject.defaultView.addEventListener('pagehide', () => clearTimeout(this.timer));
  }

  async start() {
    this.button.disabled = true;
    this.onNotice(this.i18n.t('import.instructions'));
    try {
      const response = await this.api.post('/api/import', {});
      this.ticket = response.id;
      this.poll();
    } catch (error) {
      this.finish(error.message);
    }
  }

  async poll() {
    try {
      const response = await this.api.get('/api/import');
      if (response.id !== this.ticket) {
        this.finish(this.i18n.t('import.replaced'));
        return;
      }
      if (!response.result) {
        this.timer = setTimeout(() => this.poll(), 1000);
        return;
      }
      if (response.result.cancelled) {
        this.finish(this.i18n.t('import.cancelled'));
        return;
      }
      const counts = this.add(response.result.apps || []);
      const parts = [this.i18n.t(counts.added ? 'import.added' : 'import.noneAdded', { count: counts.added })];
      if (counts.skipped) parts.push(this.i18n.t('import.skipped', { count: counts.skipped }));
      if (counts.full) parts.push(this.i18n.t('import.full', { count: counts.full }));
      this.finish(parts.join(' '));
    } catch (error) {
      this.finish(error.message);
    }
  }

  add(apps) {
    const counts = { added: 0, skipped: 0, full: 0 };
    const orientationName = this.preview.orientation;
    const pageIndex = this.preview.page();
    this.editor.change((deck) => {
      const orientation = deck[orientationName];
      const existing = orientation.pages.flatMap((page) => page.items);
      apps.forEach((source) => {
        if (existing.some((item) => this.duplicate(item, source))) {
          counts.skipped += 1;
          return;
        }
        const item = importedItem(source);
        const space = this.editor.firstSpace(orientation, pageIndex, item);
        if (!space || this.editor.countItems(orientation) >= 40) {
          counts.full += 1;
          return;
        }
        Object.assign(item, space);
        orientation.pages[pageIndex].items.push(item);
        existing.push(item);
        counts.added += 1;
      });
      if (!counts.added) return false;
    });
    return counts;
  }

  duplicate(item, source) {
    if (source.url) return sameText(item.url, source.url);
    if (source.path) return sameText(item.path, source.path);
    return false;
  }

  finish(message) {
    clearTimeout(this.timer);
    this.button.disabled = false;
    this.onNotice(message);
  }
}
