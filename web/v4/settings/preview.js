import { clear, el } from '../core/dom.js';
import { DeckBackground } from '../deck/background.js';
import { DeckGrid } from '../deck/grid.js';
import { PreviewDrag } from './drag.js';

export class Preview {
  constructor(options) {
    Object.assign(this, options);
    this.orientation = 'landscape';
    this.pages = { landscape: 0, portrait: 0 };
    this.selected = null;
    this.runtimeState = {};
    this.build();
    this.editor.subscribe(() => this.render());
  }

  build() {
    clear(this.root);
    this.root.className = 'settings-preview';
    this.screen = el('div', 'settings-preview-screen');
    this.shell = el('div', 'deck-shell settings-deck-shell');
    this.grid = el('div', 'deck-grid');
    this.overlay = el('div', 'preview-overlay');
    this.shell.append(this.grid, this.overlay);
    this.screen.appendChild(this.shell);
    this.root.appendChild(this.screen);
    const context = {
      preview: true,
      i18n: this.i18n,
      api: this.api,
      feedback: { prepare() {}, tap() {} },
      patch: () => {},
      state: () => this.runtimeState,
      refresh: async () => {},
      showError: (error) => this.onError(error.message),
    };
    this.deckGrid = new DeckGrid(context, () => {});
    this.background = new DeckBackground(this.shell, this.api);
    this.drag = new PreviewDrag(this.overlay, {
      columns: () => this.current().columns,
      rows: () => this.current().rows,
      onSelect: (hit) => this.selectHit(hit),
      canDrop: (hit, cell) => this.canDrop(hit, cell),
      onHover: (hit, cell, valid) => this.hover(hit, cell, valid),
      onDrop: (hit, cell) => this.drop(hit, cell),
    });
    this.render();
  }

  current() { return this.editor.deck[this.orientation]; }
  page() { return Math.max(0, Math.min(this.pages[this.orientation], this.current().pages.length - 1)); }

  setOrientation(value) {
    if (value !== 'landscape' && value !== 'portrait') return;
    this.orientation = value;
    this.selected = null;
    this.render();
    this.onSelect(null);
  }

  setPage(value) {
    this.pages[this.orientation] = Math.max(0, Math.min(value, this.current().pages.length - 1));
    this.selected = null;
    this.render();
    this.onSelect(null);
  }

  updateRuntime(state) {
    this.runtimeState = state || {};
    this.deckGrid.update(this.runtimeState);
  }

  cellFromPoint(x, y) {
    const rect = this.overlay.getBoundingClientRect(), orientation = this.current();
    return {
      row: Math.max(0, Math.min(orientation.rows - 1, Math.floor((y - rect.top) * orientation.rows / rect.height))),
      column: Math.max(0, Math.min(orientation.columns - 1, Math.floor((x - rect.left) * orientation.columns / rect.width))),
    };
  }

  render() {
    const orientation = this.current(), page = this.page();
    this.pages[this.orientation] = page;
    this.screen.style.aspectRatio = `${orientation.columns} / ${orientation.rows}`;
    this.deckGrid.render(this.grid, orientation, page, Array.from(this.editor.definitions.values()), this.runtimeState);
    this.background.update(this.editor.deck.background, this.orientation);
    this.renderOverlay(orientation, page);
  }

  renderOverlay(orientation, pageIndex) {
    clear(this.overlay);
    this.overlay.style.setProperty('--deck-columns', orientation.columns);
    this.overlay.style.setProperty('--deck-rows', orientation.rows);
    const page = orientation.pages[pageIndex], used = new Set();
    ['speaker', 'mic'].forEach((target) => {
      const value = this.editor.effectiveFader(orientation, pageIndex, target);
      if (!value) return;
      this.editor.cells(value).forEach((cell) => used.add(cell));
      this.overlay.appendChild(this.hit(value, { kind: 'fader', target }, target));
    });
    page.items.forEach((item, index) => {
      this.editor.cells(item).forEach((cell) => used.add(cell));
      this.overlay.appendChild(this.hit(item, { kind: 'item', index }, item.name));
    });
    for (let row = 0; row < orientation.rows; row += 1)
      for (let column = 0; column < orientation.columns; column += 1)
        if (!used.has(`${row}:${column}`)) {
          const empty = el('div', 'preview-empty', this.i18n.t('settings.preview.empty'));
          this.place(empty, { row, column, width: 1, height: 1 });
          this.overlay.appendChild(empty);
        }
  }

  hit(value, data, label) {
    const hit = el('div', 'preview-hit');
    hit.dataset.draggable = 'true';
    hit.dataset.kind = data.kind;
    if (data.kind === 'item') hit.dataset.index = data.index;
    else hit.dataset.target = data.target;
    hit.setAttribute('aria-label', label || '');
    if (this.matches(data)) hit.classList.add('is-selected');
    this.place(hit, value);
    return hit;
  }

  place(node, value) {
    node.style.gridColumn = `${value.column + 1} / span ${value.width || 1}`;
    node.style.gridRow = `${value.row + 1} / span ${value.height || 1}`;
  }

  data(hit) {
    return hit.dataset.kind === 'item'
      ? { kind: 'item', orientation: this.orientation, page: this.page(), index: Number(hit.dataset.index) }
      : { kind: 'fader', orientation: this.orientation, page: this.page(), target: hit.dataset.target };
  }

  matches(data) {
    return !!this.selected && this.selected.kind === data.kind
      && (data.kind === 'item' ? this.selected.index === data.index : this.selected.target === data.target);
  }

  selectHit(hit) {
    this.selected = this.data(hit);
    this.renderOverlay(this.current(), this.page());
    this.onSelect(this.selected);
  }

  canDrop(hit, cell) {
    const data = this.data(hit);
    return data.kind === 'item'
      ? this.editor.canMoveItem(data, data.page, cell.row, cell.column)
      : this.editor.canMoveFader(data.orientation, data.page, data.target, cell.row, cell.column);
  }

  hover(hit, cell, valid) {
    const old = this.overlay.querySelector('.preview-drop-target');
    if (old) old.remove();
    if (!hit || !cell) return;
    const target = el('div', `preview-drop-target${valid ? '' : ' is-invalid'}`);
    const value = hit.dataset.kind === 'item' ? this.editor.item(this.data(hit)) : this.editor.effectiveFader(this.current(), this.page(), hit.dataset.target);
    this.place(target, Object.assign({}, value, cell));
    this.overlay.appendChild(target);
  }

  drop(hit, cell) {
    const data = this.data(hit);
    const changed = data.kind === 'item'
      ? this.editor.moveItem(data, data.page, cell.row, cell.column)
      : this.editor.moveFader(data.orientation, data.page, data.target, cell.row, cell.column);
    if (!changed) return;
    this.selected = data.kind === 'item'
      ? Object.assign({}, data, { index: this.current().pages[data.page].items.length - 1 })
      : data;
    this.renderOverlay(this.current(), this.page());
    this.onSelect(this.selected);
  }

  removeSelected() {
    if (!this.selected || this.selected.kind !== 'item') return false;
    const removed = this.editor.removeItem(this.selected);
    if (removed) { this.selected = null; this.onSelect(null); }
    return removed;
  }

  destroy() { this.drag.destroy(); this.deckGrid.destroy(); this.background.destroy(); }
}
