import { clear, el } from '../core/dom.js';
import { gridShape, recommendedGrids } from './phone-grid-advice.js';

export class PhoneRatioPanel {
  constructor(options) { Object.assign(this, options); }

  ratio() { return this.previewRatio.value; }

  example() {
    if (this.ratio() !== 'auto') return this.i18n.t(`settings.preview.example${this.ratio().replace('.', '').replace(':', '')}`);
    if (this.phoneSize[0] && this.phoneSize[1]) {
      return this.i18n.t('settings.preview.exampleAuto', { width: this.phoneSize[0], height: this.phoneSize[1] });
    }
    return this.i18n.t('settings.preview.exampleAutoMissing');
  }

  render(root) {
    clear(root);
    const orientation = this.preview.orientation;
    const current = this.editor.deck[orientation];
    const direction = this.i18n.t(`settings.orientation.${orientation}`);
    const ratio = this.ratio() === 'auto' ? this.i18n.t('settings.preview.auto') : this.ratio();
    root.append(
      el('h2', '', this.i18n.t('settings.preview.phoneRatioTitle')),
      el('p', 'phone-ratio-current', this.i18n.t('settings.preview.ratioDirection', { ratio, direction })),
      el('h3', '', this.i18n.t('settings.preview.deviceExample')),
      el('p', '', this.example()),
      el('h3', '', this.i18n.t('settings.preview.recommended')),
    );
    const choices = el('div', 'phone-ratio-grids');
    recommendedGrids(this.ratio(), this.phoneSize, orientation).forEach((grid) => {
      const currentGrid = grid.columns === current.columns && grid.rows === current.rows;
      const text = this.i18n.t('settings.preview.gridChoice', { columns: grid.columns, rows: grid.rows });
      const button = el('button', currentGrid ? 'is-current' : '', text);
      button.type = 'button';
      button.disabled = currentGrid;
      if (currentGrid) button.appendChild(el('small', '', this.i18n.t('settings.preview.currentGrid')));
      button.addEventListener('click', () => this.gridSize.set(grid.columns, grid.rows));
      choices.appendChild(button);
    });
    root.appendChild(choices);
    const shape = gridShape(this.ratio(), this.phoneSize, orientation, current.columns, current.rows);
    if (shape) root.appendChild(el('p', 'phone-ratio-warning', this.i18n.t(`settings.preview.${shape}Cells`)));
  }
}
