import { clear, el } from '../core/dom.js';

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
    const orientation = this.orientation(), columns = Number(this.columns.value), rows = Number(this.rows.value);
    let result = this.editor.setGrid(orientation, columns, rows, false);
    if (!result.ok && result.count > 0) {
      const yes = this.confirmFn(this.i18n.t('settings.grid.rearrange', { count: result.count }));
      if (yes) result = this.editor.setGrid(orientation, columns, rows, true);
    }
    if (!result.ok) {
      this.render();
      if (!result.count) this.onError(this.i18n.t('settings.grid.cannotFit'));
    }
  }
}
