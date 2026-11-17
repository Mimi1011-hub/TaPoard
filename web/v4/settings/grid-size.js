import { clear, el } from '../core/dom.js';

export function overflowText(pages, orientation, i18n) {
  const shown = pages.slice(0, 5).map((number) => {
    const page = orientation.pages[number - 1];
    return page && page.name ? i18n.t('settings.grid.pageNamed', { number, name: page.name }) : String(number);
  });
  const remaining = pages.length - shown.length;
  let values = shown.join(i18n.t('settings.grid.pageSeparator'));
  if (remaining > 0) values += i18n.t('settings.grid.morePages', { count: remaining });
  return i18n.t(pages.length === 1 ? 'settings.grid.overflowOne' : 'settings.grid.overflowMany', { pages: values });
}

export class GridSize {
  constructor(options) {
    Object.assign(this, options);
    this.build();
    this.editor.subscribe(() => this.render());
    this.render();
  }

  build() {
    clear(this.root);
    this.root.appendChild(el('span', '', this.i18n.t('settings.grid.title')));
    this.columns = this.select('settings.grid.columns');
    this.rows = this.select('settings.grid.rows');
    this.columns.addEventListener('change', () => this.change());
    this.rows.addEventListener('change', () => this.change());
  }

  select(labelKey) {
    const label = el('label', 'settings-grid-field');
    label.appendChild(el('span', '', this.i18n.t(labelKey)));
    const select = el('select');
    for (let value = 2; value <= 8; value += 1) {
      const option = el('option', '', value); option.value = String(value); select.appendChild(option);
    }
    label.appendChild(select); this.root.appendChild(label); return select;
  }

  render() {
    const orientation = this.editor.deck[this.orientation()];
    this.columns.value = String(orientation.columns);
    this.rows.value = String(orientation.rows);
  }

  change() {
    this.set(Number(this.columns.value), Number(this.rows.value));
  }

  set(columns, rows) {
    const orientation = this.orientation();
    let result = this.editor.setGrid(orientation, columns, rows, false);
    if (!result.ok && result.faderPages && result.faderPages.length) {
      this.render();
      const warning = overflowText(result.faderPages, this.editor.deck[orientation], this.i18n);
      this.onError(`${warning} ${this.i18n.t('settings.grid.cannotFit')}`);
      return;
    }
    if (!result.ok && result.count > 0) {
      const warning = overflowText(result.pages, this.editor.deck[orientation], this.i18n);
      const yes = this.confirmFn(`${warning} ${this.i18n.t('settings.grid.rearrange', { count: result.count })}`);
      if (yes) result = this.editor.setGrid(orientation, columns, rows, true);
    }
    if (!result.ok) {
      this.render();
      if (result.faderPages && result.faderPages.length) {
        const warning = overflowText(result.faderPages, this.editor.deck[orientation], this.i18n);
        this.onError(`${warning} ${this.i18n.t('settings.grid.cannotFit')}`);
      } else if (!result.count) this.onError(this.i18n.t('settings.grid.cannotFit'));
    }
  }
}
