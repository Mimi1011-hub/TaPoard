import { clear, el } from '../core/dom.js';
import { iconNode, widgetGlyphNode } from './icons.js';
import { faderTypes, isDisplayWidget, widgetTypes } from '../widgets/registry.js';
import { audioDeviceState } from './audio-device-state.js';

export class DeckGrid {
  constructor(context, onPress) {
    this.context = context;
    this.i18n = context.i18n;
    this.onPress = onPress;
    this.widgets = [];
    this.buttons = [];
    this.preview = !!context.preview;
  }

  render(container, orientationDeck, pageIndex, widgetDefinitions, state) {
    this.destroy();
    clear(container);
    if (!orientationDeck || !orientationDeck.pages || !orientationDeck.pages.length) return;
    container.style.setProperty('--deck-columns', orientationDeck.columns);
    container.style.setProperty('--deck-rows', orientationDeck.rows);
    const page = orientationDeck.pages[Math.max(0, Math.min(pageIndex, orientationDeck.pages.length - 1))];
    this.renderFaders(container, orientationDeck.faders, page.faders, state);
    const displayTypes = new Set((widgetDefinitions || []).filter((item) => item.displayOnly).map((item) => item.type));
    (page.items || []).forEach((item) => {
      if (isDisplayWidget(item.type)) this.mountWidget(container, item, widgetTypes[item.type], state);
      else if (displayTypes.has(item.type) || ['wheel', 'touchpad', 'keypad'].includes(item.type)) container.appendChild(this.placeholder(item));
      else container.appendChild(this.button(item, state));
    });
    if (!this.preview && !container.childNodes.length) container.appendChild(el('p', 'deck-empty', this.i18n.t('deck.empty')));
  }

  update(state) {
    this.widgets.forEach((widget) => widget.update(state));
    this.buttons.forEach((button) => this.updateButton(button, state));
  }

  destroy() {
    this.widgets.forEach((widget) => widget.destroy());
    this.widgets = [];
    this.buttons = [];
  }

  place(node, placement) {
    node.style.gridColumn = `${placement.column + 1} / span ${placement.width || 1}`;
    node.style.gridRow = `${placement.row + 1} / span ${placement.height || 1}`;
  }

  mountWidget(container, item, WidgetClass, state, extraClass) {
    const node = el('div', `deck-tile widget-tile${extraClass ? ` ${extraClass}` : ''}`);
    node.dataset.widgetId = item.id || '';
    if (typeof item.keyClear === 'number') node.dataset.keyClear = item.keyClear;
    this.place(node, item);
    container.appendChild(node);
    const widget = new WidgetClass(this.context);
    widget.mount(node, item, state);
    this.widgets.push(widget);
  }

  renderFaders(container, shared, override, state) {
    ['speaker', 'mic'].forEach((kind) => {
      const hidden = override && override[kind === 'speaker' ? 'speakerHidden' : 'micHidden'];
      const own = override && override[kind];
      const placement = own ? Object.assign({}, shared && shared[kind], own) : shared && shared[kind];
      const sharedOff = shared && shared[kind] && shared[kind].off;
      if (!placement || hidden || sharedOff || placement.off) return;
      this.mountWidget(container, Object.assign({}, placement, { target: kind }), faderTypes[kind], state, kind);
    });
  }

  placeholder(item) {
    const node = el('div', 'deck-tile widget-placeholder');
    const glyph = item.type === 'wheel' || item.type === 'touchpad' ? 'mouse' : item.type === 'keypad' ? 'keyboard' : '';
    node.appendChild(widgetGlyphNode(glyph));
    node.appendChild(el('strong', 'widget-name', item.name));
    node.appendChild(el('small', 'widget-note', this.i18n.t('deck.widgetPreparing')));
    this.place(node, item);
    return node;
  }

  button(item, state) {
    const node = el('button', 'deck-tile deck-button');
    node.type = 'button';
    const icon = iconNode(item);
    const scale = Math.max(20, Math.min(140, Number(item.iconScale) || 82));
    icon.style.width = `${scale}%`; icon.style.height = `${scale}%`;
    node.appendChild(icon);
    if (!item.hideLabel) {
      const label = el('span', 'deck-label', item.name);
      label.style.fontSize = `${Math.max(7, Number(item.fontSize) || 11)}px`;
      const opacity = Math.max(0, Math.min(100, item.labelOpacity == null ? 45 : item.labelOpacity)) / 100;
      label.style.setProperty('--label-opacity', opacity); label.style.setProperty('--label-opacity-soft', opacity * 0.75);
      node.appendChild(label);
    } else node.appendChild(el('span', 'visually-hidden', item.name));
    if (typeof item.keyClear === 'number') node.dataset.keyClear = item.keyClear;
    const button = { node, item, badge: null, bound: false };
    if (!this.preview) {
      this.buttons.push(button);
      this.updateButton(button, state);
    }
    this.place(node, item);
    return node;
  }

  updateButton(button, state) {
    const audio = state && state.audio;
    const mute = button.item.action === 'audio-speaker-mute'
      ? audio && audio.speakerAvailable !== false && audio.speakerMuted
      : button.item.action === 'audio-mic-mute'
        ? audio && audio.micAvailable !== false && audio.micMuted : false;
    button.node.classList.toggle('is-muted', !!mute);
    if (button.item.type !== 'audioDevice') {
      if (!button.bound) this.bindPress(button.node, button.item);
      button.bound = true;
      return;
    }
    const status = audioDeviceState(button.item, state && state.audio && state.audio.devices);
    button.node.classList.toggle('device-selected', status === 'selected');
    button.node.classList.toggle('device-unavailable', status === 'unavailable');
    if (button.badge) button.badge.remove();
    button.badge = null;
    if (status === 'selected' || status === 'unavailable') {
      const key = status === 'selected' ? 'audio.deviceInUse' : 'audio.deviceUnavailable';
      button.badge = el('span', 'device-state-badge', this.i18n.t(key));
      button.node.appendChild(button.badge);
    }
    if (!button.bound && status !== 'unavailable') this.bindPress(button.node, button.item);
    button.bound = status !== 'unavailable';
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
      start = null; node.classList.remove('is-pressed');
      if (shouldPress && !node.classList.contains('device-unavailable')) this.onPress(item);
    };
    node.addEventListener('pointerup', finish);
    node.addEventListener('pointercancel', finish);
  }
}
