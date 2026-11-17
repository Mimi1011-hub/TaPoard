import { clear, el } from '../core/dom.js';

export class Pages {
  constructor(options) {
    Object.assign(this, options);
    this.menu = null;
    this.list = null;
    this.editor.subscribe(() => this.render());
    this.render();
  }

  orientation() { return this.preview.orientation; }
  pages() { return this.editor.deck[this.orientation()].pages; }
  current() { return this.preview.page(); }

  render() {
    clear(this.root);
    const tabs = el('div', 'settings-page-tabs');
    this.pages().forEach((page, index) => {
      const wrap = el('div', `settings-page-tab${index === this.current() ? ' is-active' : ''}`);
      const label = page.name ? `${index + 1} ${page.name}` : String(index + 1);
      const button = el('button', 'settings-page-name', label);
      button.type = 'button'; button.draggable = true;
      button.addEventListener('click', () => this.choose(index));
      button.addEventListener('dblclick', () => this.rename(wrap, index));
      button.addEventListener('contextmenu', (event) => { event.preventDefault(); this.openMenu(wrap, index); });
      button.addEventListener('dragstart', (event) => { event.dataTransfer.setData('text/x-tapoard-page', String(index)); });
      button.addEventListener('dragover', (event) => event.preventDefault());
      button.addEventListener('drop', (event) => this.drop(event, index));
      const more = el('button', 'settings-page-more', '⋮');
      more.type = 'button'; more.setAttribute('aria-label', this.i18n.t('settings.page.menu'));
      more.title = this.i18n.t('settings.page.menu');
      more.addEventListener('click', () => this.openMenu(wrap, index));
      wrap.append(button, more); tabs.appendChild(wrap);
    });
    this.root.appendChild(tabs);
    const add = el('button', 'settings-page-add', '+');
    add.type = 'button'; add.setAttribute('aria-label', this.i18n.t('settings.page.add'));
    add.addEventListener('click', () => this.add());
    const list = el('button', 'settings-page-list-button', '☰');
    list.type = 'button'; list.setAttribute('aria-label', this.i18n.t('settings.page.list'));
    list.addEventListener('click', () => this.openList());
    this.root.append(add, list);
    const active = tabs.querySelector('.is-active');
    if (active) tabs.scrollLeft = Math.max(0, active.offsetLeft - (tabs.clientWidth - active.offsetWidth) / 2);
  }

  choose(index) {
    this.closeMenu();
    this.closeList();
    this.preview.setPage(index);
    Array.from(this.root.querySelectorAll('.settings-page-tab')).forEach((node, page) => node.classList.toggle('is-active', page === index));
  }

  add() {
    const after = this.current();
    if (!this.editor.addPage(this.orientation(), after)) return this.onError(this.i18n.t('settings.page.limit'));
    this.preview.setPage(after + 1);
    this.render();
  }

  rename(wrap, index) {
    this.closeMenu();
    const input = el('input', 'settings-page-input');
    input.type = 'text'; input.maxLength = 20; input.value = this.pages()[index].name || '';
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save && !this.editor.renamePage(this.orientation(), index, input.value)) this.onError(this.i18n.t('settings.page.invalidName'));
      this.render();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(true);
      else if (event.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true), { once: true });
    clear(wrap); wrap.appendChild(input); input.focus(); input.select();
  }

  drop(event, to) {
    event.preventDefault();
    const from = Number(event.dataTransfer.getData('text/x-tapoard-page'));
    if (!Number.isInteger(from) || from === to) return;
    if (this.editor.movePage(this.orientation(), from, to)) {
      this.preview.setPage(to);
      this.render();
    }
  }

  openMenu(wrap, index) {
    const again = this.menu && this.menuIndex === index;
    this.closeMenu();
    if (again) return;
    this.menuIndex = index;
    const menu = el('div', 'settings-page-menu');
    const action = (key, run, disabled) => {
      const button = el('button', '', this.i18n.t(key)); button.type = 'button'; button.disabled = !!disabled;
      button.addEventListener('click', () => { this.closeMenu(); run(); }); menu.appendChild(button);
    };
    action('settings.page.rename', () => this.rename(wrap, index));
    action('settings.page.previous', () => this.move(index, index - 1), index === 0);
    action('settings.page.next', () => this.move(index, index + 1), index === this.pages().length - 1);
    action('settings.page.addPreset', () => this.onPreset(this.orientation(), index));
    action('settings.page.delete', () => this.remove(index), this.pages().length === 1);
    // The tab strip scrolls (and clips), so the menu hangs from the page area, under the tab's right edge.
    this.root.appendChild(menu); this.menu = menu;
    const left = wrap.getBoundingClientRect().right - this.root.getBoundingClientRect().left - menu.offsetWidth;
    menu.style.left = `${Math.max(0, left)}px`;
  }

  openList() {
    if (this.list) return this.closeList();
    this.closeMenu();
    const panel = el('div', 'settings-page-list');
    this.pages().forEach((page, index) => {
      const row = el('div', 'settings-page-list-row');
      const label = page.name ? `${index + 1} ${page.name}` : String(index + 1);
      const choose = el('button', 'settings-page-list-name', `${label} · ${page.items.length}`);
      choose.type = 'button'; choose.addEventListener('click', () => this.choose(index));
      const action = (key, run, disabled) => {
        const button = el('button', '', this.i18n.t(key));
        button.type = 'button'; button.disabled = !!disabled;
        button.addEventListener('click', () => { this.closeList(); run(); });
        row.appendChild(button);
      };
      row.appendChild(choose);
      const wrap = this.root.querySelectorAll('.settings-page-tab')[index];
      action('settings.page.rename', () => this.rename(wrap, index));
      action('settings.page.previous', () => this.move(index, index - 1), index === 0);
      action('settings.page.next', () => this.move(index, index + 1), index === this.pages().length - 1);
      action('settings.page.addPreset', () => this.onPreset(this.orientation(), index));
      action('settings.page.delete', () => this.remove(index), this.pages().length === 1);
      panel.appendChild(row);
    });
    this.root.appendChild(panel);
    this.list = panel;
  }

  closeMenu() { if (this.menu) this.menu.remove(); this.menu = null; }
  closeList() { if (this.list) this.list.remove(); this.list = null; }
  move(from, to) { if (this.editor.movePage(this.orientation(), from, to)) { this.preview.setPage(to); this.render(); } }
  remove(index) {
    if (!this.confirmFn(this.i18n.t('settings.page.confirmDelete'))) return;
    if (this.editor.removePage(this.orientation(), index)) this.preview.setPage(Math.min(index, this.pages().length - 1));
  }
}
