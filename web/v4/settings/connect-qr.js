import { clear, el } from '../core/dom.js';

export class ConnectQr {
  constructor(options) {
    Object.assign(this, options);
    this.kind = 'iphone';
  }

  mount(root) {
    this.root = root;
    this.tabs = el('div', 'orientation-switch');
    ['iphone', 'android'].forEach((kind) => {
      const button = el('button', kind === this.kind ? 'is-active' : '', kind === 'iphone' ? 'iPhone' : 'Android');
      button.type = 'button';
      button.addEventListener('click', () => this.choose(kind));
      button.dataset.kind = kind;
      this.tabs.appendChild(button);
    });
    this.canvas = el('canvas', 'connect-qr');
    this.url = el('p', 'connect-url');
    root.append(this.tabs, this.canvas, this.url);
  }

  async load() {
    this.links = await this.api.get('/api/v3/connect');
    this.draw();
  }

  choose(kind) {
    this.kind = kind;
    this.tabs.querySelectorAll('button').forEach((button) => button.classList.toggle('is-active', button.dataset.kind === kind));
    this.draw();
  }

  draw() {
    if (!this.links) return;
    const value = this.kind === 'iphone' ? this.links.iphoneUrl : this.links.androidUrl;
    this.url.textContent = value.split('#')[0];
    clear(this.canvas);
    const code = globalThis.qrcode(0, 'M');
    code.addData(value, 'Byte');
    code.make();
    const quiet = 4;
    const count = code.getModuleCount();
    const cell = Math.max(3, Math.floor(220 / (count + quiet * 2)));
    const size = (count + quiet * 2) * cell;
    const context = this.canvas.getContext('2d');
    this.canvas.width = size;
    this.canvas.height = size;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size, size);
    context.fillStyle = '#101216';
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (code.isDark(row, column)) context.fillRect((column + quiet) * cell, (row + quiet) * cell, cell, cell);
      }
    }
  }
}
