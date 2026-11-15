import { clear, el, i18n as markI18n } from '../core/dom.js';

export class PhoneMenu {
  constructor(container, dependencies) {
    this.container = container;
    this.storage = dependencies.storage;
    this.i18n = dependencies.i18n;
    this.keyStore = dependencies.keyStore;
    this.documentObject = dependencies.documentObject;
    this.wakeLock = dependencies.wakeLock;
    this.NoSleepClass = dependencies.NoSleepClass;
    this.onDisconnect = dependencies.onDisconnect;
    this.pcWindow = !!dependencies.pcWindow;
    this.wakeSentinel = null;
    this.noSleep = null;
    this.keepAwakeValue = null;
    this.build();
  }

  build() {
    clear(this.container);
    this.backdrop = el('div', 'menu-backdrop');
    this.backdrop.hidden = true;
    const panel = el('section', 'phone-menu');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const header = el('header', 'menu-header');
    header.append(markI18n(el('h2'), 'menu.title'));
    const close = markI18n(el('button', 'menu-close', '×'), 'menu.close', true);
    close.type = 'button';
    close.addEventListener('click', () => this.close());
    header.append(close);
    panel.append(header);
    if (!this.pcWindow) {
      this.keepAwake = this.toggle(panel, 'menu.keepAwake', 'menu.keepAwakeNote', true, (checked) => {
        this.storage.setItem('tapoard-keep-awake', checked ? '1' : '0'); this.keepAwakeValue = checked; this.applyWake(checked);
      });
      this.feedback = this.toggle(panel, 'menu.feedback', 'menu.feedbackNote', this.storage.getItem('tapoard-feedback') !== 'off', (checked) => {
        this.storage.setItem('tapoard-feedback', checked ? 'on' : 'off');
      });
    }
    this.swipe = this.toggle(panel, 'menu.swipe', 'menu.swipeNote', this.storage.getItem('tapoard-swipe') !== 'off', (checked) => {
      this.storage.setItem('tapoard-swipe', checked ? 'on' : 'off');
    });
    panel.append(this.languageRow());
    if (!this.pcWindow) {
      panel.append(markI18n(el('p', 'menu-guidance'), 'menu.guidance'));
      const disconnect = markI18n(el('button', 'disconnect-button'), 'menu.disconnect');
      disconnect.type = 'button';
      disconnect.addEventListener('click', () => { this.keyStore.clear(); this.close(); this.onDisconnect(); });
      panel.append(disconnect);
    }
    this.backdrop.append(panel);
    this.backdrop.addEventListener('pointerdown', (event) => {
      if (event.target === this.backdrop) this.close();
    });
    this.container.append(this.backdrop);
  }

  toggle(parent, labelKey, noteKey, checked, onChange) {
    const label = el('label', 'menu-toggle');
    const copy = el('span', 'menu-copy');
    copy.append(markI18n(el('strong'), labelKey), markI18n(el('small'), noteKey));
    const input = el('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    label.append(copy, input, el('i', 'toggle-visual'));
    parent.append(label);
    return input;
  }

  languageRow() {
    const label = el('label', 'language-row');
    label.append(markI18n(el('strong'), 'menu.language'));
    this.language = el('select');
    [['auto', 'menu.languageAuto'], ['ja', 'menu.languageJa'], ['en', 'menu.languageEn']].forEach(([value, key]) => {
      const option = markI18n(el('option'), key);
      option.value = value;
      this.language.append(option);
    });
    this.language.value = this.storage.getItem('tapoard-lang') || 'auto';
    this.language.addEventListener('change', async () => {
      await this.i18n.setLanguage(this.language.value);
    });
    label.append(this.language);
    return label;
  }

  setDeck(deck) {
    if (this.pcWindow) return;
    const saved = this.storage.getItem('tapoard-keep-awake');
    const next = saved === null ? !!(deck && deck.keepAwake) : saved === '1';
    this.keepAwake.checked = next;
    if (this.keepAwakeValue !== next) {
      this.keepAwakeValue = next;
      this.applyWake(next);
    }
  }

  feedbackEnabled() {
    return this.feedback ? this.feedback.checked : false;
  }

  open() {
    this.backdrop.hidden = false;
    this.i18n.apply(this.container);
  }

  close() {
    this.backdrop.hidden = true;
  }

  visibilityChanged(hidden) {
    if (this.pcWindow) return;
    if (hidden) this.releaseWake();
    else this.applyWake(this.keepAwake.checked);
  }

  async applyWake(enabled) {
    this.releaseWake();
    if (!enabled || this.documentObject.hidden) return;
    if (this.wakeLock && this.wakeLock.request) {
      try {
        this.wakeSentinel = await this.wakeLock.request('screen');
        return;
      } catch (error) { /* use the fallback */ }
    }
    if (this.NoSleepClass) {
      try {
        this.noSleep = new this.NoSleepClass();
        await this.noSleep.enable();
      } catch (error) { this.noSleep = null; }
    }
  }

  releaseWake() {
    if (this.wakeSentinel) this.wakeSentinel.release().catch(() => {});
    this.wakeSentinel = null;
    if (this.noSleep) {
      try { this.noSleep.disable(); } catch (error) { /* already released */ }
    }
    this.noSleep = null;
  }
}
