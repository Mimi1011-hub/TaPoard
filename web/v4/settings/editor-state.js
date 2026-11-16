import { reflowOrientation, validOrientation } from './deck-rules.js';
import { FaderEditor } from './fader-editor.js';
import { faderSizes } from './fader-sizes.js';

const copy = (value) => JSON.parse(JSON.stringify(value));

export class EditorState {
  constructor(response) {
    this.listeners = new Set();
    this.revision = 0;
    this.faderEditor = new FaderEditor(this);
    this.load(response);
  }

  load(response, source = 'load') {
    this.deck = copy(response.deck);
    this.savedDeck = copy(response.deck);
    this.version = response.version;
    this.definitions = new Map((response.widgetDefinitions || []).map((value) => [value.type, value]));
    this.dirty = false;
    this.revision += 1;
    this.emit({ source });
  }

  acceptSaved(response, savedRevision) {
    if (this.revision === savedRevision) {
      this.load(response, 'save');
      return;
    }
    this.copyGeneratedIds(response.deck);
    this.savedDeck = copy(response.deck);
    this.version = response.version;
    this.dirty = true;
    this.emit({ source: 'base' });
  }

  copyGeneratedIds(saved) {
    ['landscape', 'portrait'].forEach((orientation) => {
      const currentPages = this.deck[orientation].pages;
      (saved[orientation].pages || []).forEach((page, pageIndex) => {
        (page.items || []).forEach((item) => {
          const current = ((currentPages[pageIndex] && currentPages[pageIndex].items) || []).find(
            (value) => !value.id && value.type === item.type && value.action === item.action
              && value.row === item.row && value.column === item.column,
          );
          if (current) current.id = item.id;
        });
      });
    });
  }

  restoreSaved() {
    this.replaceDeck(this.savedDeck, 'restore', false);
  }

  replaceDeck(deck, source = 'history', dirty = true) {
    const before = copy(this.deck);
    this.deck = copy(deck);
    this.dirty = dirty;
    this.revision += 1;
    this.emit({ source, before, after: copy(this.deck) });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    this.listeners.forEach((listener) => listener(Object.assign({ editor: this }, event)));
  }

  orientation(name, deck = this.deck) {
    if (name !== 'landscape' && name !== 'portrait') throw new Error('Invalid orientation');
    return deck[name];
  }

  item(address, deck = this.deck) {
    const page = this.orientation(address.orientation, deck).pages[address.page];
    return page && page.items[address.index];
  }

  change(mutator) {
    const before = copy(this.deck);
    const candidate = copy(this.deck);
    if (mutator(candidate) === false || !this.validateDeck(candidate)) return false;
    this.deck = candidate;
    this.dirty = true;
    this.revision += 1;
    this.emit({ source: 'edit', before, after: copy(candidate) });
    return true;
  }

  moveItem(address, page, row, column) {
    return this.change((deck) => {
      const orientation = this.orientation(address.orientation, deck);
      const source = orientation.pages[address.page];
      if (!source || !orientation.pages[page] || !source.items[address.index]) return false;
      const item = source.items.splice(address.index, 1)[0];
      item.row = row;
      item.column = column;
      orientation.pages[page].items.push(item);
    });
  }

  canMoveItem(address, page, row, column) {
    const candidate = copy(this.deck),
      orientation = this.orientation(address.orientation, candidate);
    const source = orientation.pages[address.page];
    if (!source || !orientation.pages[page] || !source.items[address.index]) return false;
    const item = source.items.splice(address.index, 1)[0];
    item.row = row;
    item.column = column;
    orientation.pages[page].items.push(item);
    return this.validateDeck(candidate);
  }

  addItem(orientationName, pageIndex, item, row, column) {
    return this.change((deck) => {
      const orientation = this.orientation(orientationName, deck);
      const page = orientation.pages[pageIndex];
      if (!page || this.countItems(orientation) >= 40) return false;
      const value = copy(item);
      const space = row == null ? this.firstSpace(orientation, pageIndex, value) : { row, column };
      if (!space) return false;
      value.row = space.row;
      value.column = space.column;
      if (!value.id) value.id = '';
      page.items.push(value);
    });
  }

  removeItem(address) {
    return this.change((deck) => {
      const page = this.orientation(address.orientation, deck).pages[address.page];
      if (!page || !page.items[address.index]) return false;
      page.items.splice(address.index, 1);
    });
  }

  updateItem(address, values) {
    return this.change((deck) => {
      const item = this.item(address, deck);
      if (!item) return false;
      Object.keys(values).forEach((key) => {
        item[key] = copy(values[key]);
      });
    });
  }

  setKeepAwake(value) {
    return this.change((deck) => {
      deck.keepAwake = Boolean(value);
    });
  }

  canUpdateItem(address, values) {
    const candidate = copy(this.deck),
      item = this.item(address, candidate);
    if (!item) return false;
    Object.keys(values).forEach((key) => {
      item[key] = copy(values[key]);
    });
    return this.validateDeck(candidate);
  }

  addPage(orientationName, after) {
    return this.change((deck) => {
      const pages = this.orientation(orientationName, deck).pages;
      if (pages.length >= 40) return false;
      pages.splice(Math.max(0, Math.min(pages.length, after + 1)), 0, { name: '', faders: null, items: [] });
    });
  }

  movePage(orientationName, from, to) {
    return this.change((deck) => {
      const pages = this.orientation(orientationName, deck).pages;
      if (!pages[from] || to < 0 || to >= pages.length) return false;
      pages.splice(to, 0, pages.splice(from, 1)[0]);
    });
  }

  removePage(orientationName, page) {
    return this.change((deck) => {
      const pages = this.orientation(orientationName, deck).pages;
      if (pages.length <= 1 || !pages[page]) return false;
      pages.splice(page, 1);
    });
  }

  renamePage(orientationName, page, name) {
    name = String(name || '').trim();
    if (name.indexOf('\n') >= 0 || name.indexOf('\r') >= 0 || name.length > 20) return false;
    return this.change((deck) => {
      const target = this.orientation(orientationName, deck).pages[page];
      if (!target) return false;
      target.name = name;
    });
  }

  setGrid(orientationName, columns, rows, rearrange) {
    if (columns < 2 || columns > 8 || rows < 2 || rows > 8) return { ok: false, count: 0 };
    const before = copy(this.deck),
      candidate = copy(this.deck),
      orientation = this.orientation(orientationName, candidate);
    orientation.columns = columns;
    orientation.rows = rows;
    const moved = this.reflow(orientation, !!rearrange);
    if (moved.error || (moved.count && !rearrange) || !this.validateDeck(candidate)) return { ok: false, count: moved.count };
    this.deck = candidate;
    this.dirty = true;
    this.revision += 1;
    this.emit({ source: 'edit', before, after: copy(candidate) });
    return { ok: true, count: moved.count };
  }

  moveFader(...args) {
    return this.faderEditor.move(...args);
  }
  placeFader(...args) {
    return this.faderEditor.place(...args);
  }
  removeFader(...args) {
    return this.faderEditor.remove(...args);
  }
  canMoveFader(...args) {
    return this.faderEditor.canMove(...args);
  }
  updateFader(...args) {
    return this.faderEditor.update(...args);
  }
  canUpdateFader(...args) {
    return this.faderEditor.canUpdate(...args);
  }
  setBackground(background) {
    this.deck.background = copy(background);
    this.savedDeck.background = copy(background);
    this.emit({ source: 'background' });
  }

  countItems(orientation) {
    return orientation.pages.reduce((total, page) => total + page.items.length, 0);
  }
  sizeAllowed(item) {
    const definition = this.definitions.get(item.type);
    return !!definition && definition.sizes.indexOf(`${item.width}x${item.height}`) >= 0;
  }
  inside(value, orientation) {
    return value.row >= 0 && value.column >= 0 && value.row + value.height <= orientation.rows && value.column + value.width <= orientation.columns;
  }
  cells(value) {
    const result = [];
    for (let row = value.row; row < value.row + value.height; row += 1)
      for (let column = value.column; column < value.column + value.width; column += 1) result.push(`${row}:${column}`);
    return result;
  }
  effectiveFader(orientation, pageIndex, target) {
    const page = orientation.pages[pageIndex],
      own = page.faders;
    if (!own) return orientation.faders[target].off ? null : orientation.faders[target];
    if (own[`${target}Hidden`]) return null;
    return own[target] || (orientation.faders[target].off ? null : orientation.faders[target]);
  }
  occupied(orientation, pageIndex, ignored) {
    const used = new Set(),
      page = orientation.pages[pageIndex];
    ['speaker', 'mic'].forEach((target) => {
      const fader = this.effectiveFader(orientation, pageIndex, target);
      if (fader) this.cells(fader).forEach((cell) => used.add(cell));
    });
    page.items.forEach((item, index) => {
      if (index !== ignored) this.cells(item).forEach((cell) => used.add(cell));
    });
    return used;
  }
  firstSpace(orientation, page, item) {
    const used = this.occupied(orientation, page, -1);
    for (let row = 0; row <= orientation.rows - item.height; row += 1)
      for (let column = 0; column <= orientation.columns - item.width; column += 1)
        if (this.cells(Object.assign({}, item, { row, column })).every((cell) => !used.has(cell))) return { row, column };
    return null;
  }
  validateDeck(deck) {
    const ids = new Set();
    return ['landscape', 'portrait'].every((name) => this.validateOrientation(deck[name], ids));
  }
  faderSizeAllowed(value) {
    return faderSizes.indexOf(`${value.width}x${value.height}`) >= 0;
  }
  validateOrientation(orientation, ids) {
    return validOrientation(this, orientation, ids);
  }
  reflow(orientation, apply) {
    return reflowOrientation(this, orientation, apply);
  }
}
