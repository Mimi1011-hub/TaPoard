import { clear, el } from '../core/dom.js';
import { iconNode, widgetGlyphNode } from './icons.js';

export class DeckGrid {
  constructor(i18n, onPress) {
    this.i18n = i18n;
    this.onPress = onPress;
  }

  render(container, orientationDeck, pageIndex, widgetDefinitions) {
    clear(container);
    if (!orientationDeck || !orientationDeck.pages || !orientationDeck.pages.length) return;
    container.style.setProperty('--deck-columns', orientationDeck.columns);
    container.style.setProperty('--deck-rows', orientationDeck.rows);
    const page = orientationDeck.pages[Math.max(0, Math.min(pageIndex, orientationDeck.pages.length - 1))];
    this.renderFaders(container, orientationDeck.faders, page.faders);
    const widgets = new Set((widgetDefinitions || []).filter((item) => item.displayOnly).map((item) => item.type));
    (page.items || []).forEach((item) => {
      container.appendChild(widgets.has(item.type) ? this.widget(item) : this.button(item));
    });
    if (!container.childNodes.length) container.appendChild(el('p', 'deck-empty', this.i18n.t('deck.empty')));
  }

  place(node, placement) {
    node.style.gridColumn = `${placement.column + 1} / span ${placement.width || 1}`;
    node.style.gridRow = `${placement.row + 1} / span ${placement.height || 1}`;
  }

  renderFaders(container, shared, override) {
    ['speaker', 'mic'].forEach((kind) => {
      const hidden = override && override[kind === 'speaker' ? 'speakerHidden' : 'micHidden'];
      const placement = override && override[kind] ? override[kind] : shared && shared[kind];
      const sharedOff = shared && shared[kind] && shared[kind].off;
      if (!placement || hidden || sharedOff || placement.off) return;
      const node = el('div', `deck-tile fader-placeholder ${kind}`);
      node.appendChild(el('span', 'fader-mark', kind === 'speaker' ? '◖' : '♩'));
      node.appendChild(el('span', 'fader-name', this.i18n.t(kind === 'speaker' ? 'deck.speaker' : 'deck.microphone')));
      this.place(node, placement);
      container.appendChild(node);
    });
  }

  widget(item) {
    const node = el('div', 'deck-tile widget-placeholder');
    const glyph = item.type === 'wheel' || item.type === 'touchpad' ? 'mouse' : item.type === 'keypad' ? 'keyboard' : '';
    node.appendChild(widgetGlyphNode(glyph));
    node.appendChild(el('strong', 'widget-name', item.name));
    node.appendChild(el('small', 'widget-note', this.i18n.t('deck.widgetPreparing')));
    this.place(node, item);
    return node;
  }

  button(item) {
    const node = el('button', 'deck-tile deck-button');
    node.type = 'button';
    const icon = iconNode(item);
    const scale = Math.max(20, Math.min(140, Number(item.iconScale) || 82));
    icon.style.width = `${scale}%`;
    icon.style.height = `${scale}%`;
    node.appendChild(icon);
    if (!item.hideLabel) {
      const label = el('span', 'deck-label', item.name);
      label.style.fontSize = `${Math.max(7, Number(item.fontSize) || 11)}px`;
      const opacity = Math.max(0, Math.min(100, item.labelOpacity == null ? 45 : item.labelOpacity)) / 100;
      label.style.setProperty('--label-opacity', opacity);
      label.style.setProperty('--label-opacity-soft', opacity * 0.75);
      node.appendChild(label);
    } else node.appendChild(el('span', 'visually-hidden', item.name));
    if (typeof item.keyClear === 'number')
      node.style.setProperty('--key-alpha', String(1 - Math.max(0, Math.min(100, item.keyClear)) / 100));
    this.bindPress(node, item);
    this.place(node, item);
    return node;
  }

  bindPress(node, item) {
    let start = null;
    node.addEventListener('pointerdown', (event) => {
      start = { x: event.clientX, y: event.clientY, time: Date.now(), moved: false };
      node.classList.add('is-pressed');
    });
    node.addEventListener('pointermove', (event) => {
      if (!start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) start.moved = true;
      if (start.moved) node.classList.remove('is-pressed');
    });
    const finish = (event) => {
      if (!start) return;
      const shouldPress = event.type === 'pointerup' && !start.moved && Date.now() - start.time < 600;
      start = null;
      node.classList.remove('is-pressed');
      if (shouldPress) this.onPress(item);
    };
    node.addEventListener('pointerup', finish);
    node.addEventListener('pointercancel', finish);
  }
}
