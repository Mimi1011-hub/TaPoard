import { clear, el } from '../core/dom.js';
import { makeBackgroundImage } from './image-tools.js';
import { BackgroundAdjust } from './background-adjust.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const colors = [
  ['', 'standard'], ['#000000', 'black'], ['#24262c', 'charcoal'], ['#14213d', 'navy'], ['#183a2b', 'green'],
  ['#2d1b46', 'purple'], ['#6b7280', 'gray'], ['#f7f7f5', 'white'], ['#fbf3df', 'cream'], ['#e9dcc9', 'beige'],
  ['#e8c4c4', 'pink'], ['#cfe8dc', 'mint'], ['#d9d0ef', 'lavender'],
];
const gradients = [
  ['#0f2027', '#2c5364', 'night'], ['#ff7e5f', '#feb47b', 'sunset'], ['#f9c5d1', '#fbe3e8', 'peach'],
  ['#2193b0', '#6dd5ed', 'sea'], ['#134e5e', '#71b280', 'forest'], ['#41295a', '#2f0743', 'neon'],
];
const position = () => ({ fit: 'cover', x: 50, y: 50, zoom: 1 });
const defaults = () => ({
  color: '', color2: '', image: '', imageWidth: 0, imageHeight: 0,
  landscape: position(), portrait: position(), keys: '', dim: 0, blur: 0, keyClear: 0,
});

// The background section is saved through /api/background, never with the deck.
export class BackgroundSettings {
  constructor(options) {
    Object.assign(this, options);
    this.value = this.clean(this.editor.deck.background);
    this.serverText = '';
    this.timer = 0;
    this.pending = 0;
    this.adjusting = false;
    this.adjust = new BackgroundAdjust(this.preview, (value) => this.show(value));
    this.render();
  }

  clean(background) {
    const value = Object.assign(defaults(), copy(background || {}));
    value.landscape = Object.assign(position(), value.landscape);
    value.portrait = Object.assign(position(), value.portrait);
    return value;
  }

  current() { return this.value[this.preview.orientation]; }

  field(label, control) {
    const node = el('label', 'background-field');
    node.append(el('span', '', label), control);
    return node;
  }

  button(text, run) {
    const button = el('button', '', text);
    button.type = 'button';
    button.addEventListener('click', run);
    return button;
  }

  select(labelKey, options, value, onChange) {
    const select = el('select');
    options.forEach(([optionValue, key]) => {
      const option = el('option', '', this.i18n.t(key));
      option.value = optionValue;
      select.appendChild(option);
    });
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    this.root.appendChild(this.field(this.i18n.t(labelKey), select));
  }

  range(labelKey, value, min, max, step, format, onInput) {
    const input = el('input'), text = el('span', 'background-range-value', format(value));
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
    input.addEventListener('input', () => {
      text.textContent = format(Number(input.value));
      onInput(Number(input.value));
      this.show(this.value);
      this.saveSoon();
    });
    const field = this.field(this.i18n.t(labelKey), input);
    field.appendChild(text);
    this.root.appendChild(field);
  }

  swatches(list, selected, background, name, values) {
    const row = el('div', 'background-swatches');
    list.forEach((entry) => {
      const button = this.button(selected(entry) ? '✓' : '', () => this.change(values(entry)));
      button.title = this.i18n.t(name(entry));
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(selected(entry)));
      button.style.background = background(entry);
      button.style.color = /^#(f|e|d|c)/i.test(entry[0]) ? '#222' : '#fff';
      row.appendChild(button);
    });
    this.root.appendChild(row);
  }

  render() {
    if (this.adjusting) return this.renderAdjust();
    const value = this.value, place = this.current();
    clear(this.root);
    this.root.appendChild(el('h2', '', this.i18n.t('background.title')));
    this.swatches(colors, (entry) => value.color === entry[0] && !value.color2,
      (entry) => entry[0] || 'linear-gradient(135deg,#1b1c20 50%,#2a2d35 50%)',
      (entry) => `background.colors.${entry[1]}`, (entry) => ({ color: entry[0], color2: '' }));
    this.swatches(gradients, (entry) => value.color === entry[0] && value.color2 === entry[1],
      (entry) => `linear-gradient(135deg,${entry[0]},${entry[1]})`,
      (entry) => `background.gradients.${entry[2]}`, (entry) => ({ color: entry[0], color2: entry[1] }));
    this.colorInput('background.color', value.color || '#1b1c20', (color) => this.change({ color }));
    const second = el('input');
    second.type = 'checkbox'; second.checked = !!value.color2;
    second.addEventListener('change', () => this.change({ color: value.color || '#1b1c20', color2: second.checked ? (value.color || '#1b1c20') : '' }));
    this.root.appendChild(this.field(this.i18n.t('background.secondColor'), second));
    if (value.color2) this.colorInput('background.color2', value.color2, (color2) => this.change({ color2 }));

    const file = el('input');
    file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    file.addEventListener('change', () => { this.image(file.files[0]); file.value = ''; });
    this.status = el('p', 'background-status');
    this.root.append(this.button(this.i18n.t('background.image'), () => file.click()), file, this.status);
    if (value.image) {
      this.root.append(
        this.button(this.i18n.t('background.removeImage'), () => this.removeImage()),
        this.button(this.i18n.t('background.adjust'), () => this.beginAdjust()),
      );
      this.root.appendChild(el('p', 'background-note', this.i18n.t(`background.side.${this.preview.orientation}`)));
      this.select('background.fit', [['cover', 'background.cover'], ['contain', 'background.contain']], place.fit, (fit) => {
        this.current().fit = fit; this.change({});
      });
      this.range('background.zoom', place.zoom, 1, 5, 0.05, (zoom) => `${Math.round(zoom * 100)}%`, (zoom) => { this.current().zoom = zoom; });
      this.range('background.dim', value.dim, 0, 80, 1, (dim) => `${dim}%`, (dim) => { this.value.dim = dim; });
      this.range('background.blur', value.blur, 0, 20, 1, (blur) => `${blur}px`, (blur) => { this.value.blur = blur; });
    }
    this.select('background.keys', [['', 'background.keysAuto'], ['glass', 'background.keysGlass'], ['standard', 'background.keysStandard']],
      value.keys || '', (keys) => this.change({ keys }));
    this.range('background.keyClear', value.keyClear, 0, 100, 1, (clearValue) => `${clearValue}%`, (clearValue) => { this.value.keyClear = clearValue; });
    this.root.appendChild(this.button(this.i18n.t('background.reset'), () => this.reset()));
  }

  colorInput(labelKey, value, onChange) {
    const input = el('input');
    input.type = 'color'; input.value = value;
    input.addEventListener('change', () => onChange(input.value));
    this.root.appendChild(this.field(this.i18n.t(labelKey), input));
  }

  renderAdjust() {
    clear(this.root);
    this.root.append(
      el('h2', '', this.i18n.t('background.adjust')),
      el('p', 'background-note', this.i18n.t('background.adjustHelp')),
      el('p', 'background-note', this.i18n.t(`background.side.${this.preview.orientation}`)),
      this.button(this.i18n.t('background.done'), () => this.endAdjust()),
    );
  }

  show(value) { this.editor.setBackground(value); }

  change(values) {
    Object.assign(this.value, values);
    this.show(this.value);
    this.render();
    return this.save();
  }

  // Keeps the picture and its place; colors and effects go back to the start.
  reset() {
    const start = defaults();
    this.change({ color: start.color, color2: start.color2, keys: start.keys, dim: 0, blur: 0, keyClear: 0, landscape: position(), portrait: position() });
  }

  saveSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), 300);
  }

  async request(path, body, timeout) {
    clearTimeout(this.timer);
    this.timer = 0;
    this.pending += 1;
    try {
      const result = await this.api.post(path, body, timeout);
      if (this.pending === 1 && result.background) {
        this.serverText = JSON.stringify(result.background);
        this.value = this.clean(result.background);
        this.show(this.value);
      }
      return true;
    } catch (error) {
      this.onError(error.serverError || error.message);
      return false;
    } finally {
      this.pending -= 1;
    }
  }

  save() { return this.request('/api/background', this.value, 10000); }

  // Sends a slider change that is still waiting, so a saved look matches the screen.
  async flush() {
    if (this.adjusting) await this.endAdjust();
    if (!this.timer) return true;
    return this.save();
  }

  async image(file) {
    if (!file) return;
    let picture;
    this.status.textContent = this.i18n.t('background.preparing');
    try { picture = await makeBackgroundImage(file); }
    catch (error) { this.status.textContent = ''; this.onError(this.i18n.t('background.imageFailed')); return; }
    const saved = await this.request('/api/background/image', picture, 30000);
    this.status.textContent = '';
    if (saved) this.beginAdjust();
    else this.render();
  }

  async removeImage() {
    await this.request('/api/background/image/delete', {}, 10000);
    this.render();
  }

  beginAdjust() {
    if (!this.value.image) return;
    this.adjusting = true;
    this.adjust.begin(this.value);
    this.render();
  }

  async endAdjust() {
    this.adjust.end();
    this.adjusting = false;
    await this.save();
    this.render();
  }

  // The preview changed between landscape and portrait: show that side's position.
  orientationChanged() { this.render(); }

  // The background as the PC reports it. Only a real change from another place redraws the controls.
  external(background) {
    const text = JSON.stringify(background);
    if (text === this.serverText) return;
    this.serverText = text;
    if (this.pending || this.adjusting || JSON.stringify(this.clean(background)) === JSON.stringify(this.value)) return;
    this.value = this.clean(background);
    this.show(this.value);
    this.render();
  }
}
