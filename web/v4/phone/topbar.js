import { clear, el, i18n as markI18n } from '../core/dom.js';

export class TopBar {
  constructor(container, api, i18n, onPage, onMenu, onError) {
    this.container = container;
    this.api = api;
    this.i18n = i18n;
    this.onPage = onPage;
    this.onMenu = onMenu;
    this.onError = onError;
    this.page = 0;
    this.total = 1;
    this.orientation = 'landscape';
    this.build();
  }

  build() {
    clear(this.container);
    this.previous = markI18n(el('button', 'topbar-button page-button', '‹'), 'topbar.previous', true);
    this.previous.type = 'button';
    this.next = markI18n(el('button', 'topbar-button page-button', '›'), 'topbar.next', true);
    this.next.type = 'button';
    this.label = el('span', 'page-label');
    this.menu = markI18n(el('button', 'topbar-button menu-button', '☰'), 'topbar.menu', true);
    this.menu.type = 'button';
    this.previous.addEventListener('click', () => this.move(-1));
    this.next.addEventListener('click', () => this.move(1));
    this.menu.addEventListener('click', this.onMenu);
    const pages = el('div', 'page-controls');
    pages.append(this.previous, this.next, this.label);
    this.container.append(pages, this.menu);
  }

  update(page, total, orientation, name) {
    this.page = Math.max(0, page || 0);
    this.total = Math.max(1, total || 1);
    this.orientation = orientation;
    this.name = name || '';
    const pages = this.i18n.t('deck.page', { current: this.page + 1, total: this.total });
    this.label.textContent = this.name ? `${this.name}　${pages}` : pages;
    this.previous.disabled = this.page <= 0;
    this.next.disabled = this.page >= this.total - 1;
  }

  async move(delta) {
    const page = Math.max(0, Math.min(this.total - 1, this.page + delta));
    if (page === this.page) return;
    try {
      await this.api.post('/api/page', { page, orientation: this.orientation }, 5000);
      this.page = page;
      this.update(this.page, this.total, this.orientation, '');
      this.onPage(page, this.orientation);
    } catch (error) {
      this.onError(error);
    }
  }
}
