import { el } from '../core/dom.js';
import { safeImageSource } from '../core/image-source.js';
import { appendWidgetName } from './common.js';

export class SlideshowWidget {
  constructor(context) {
    this.context = context;
    this.timer = null;
    this.index = -1;
    this.count = 0;
    this.loading = false;
    this.visibility = () => this.schedule();
  }

  mount(node, item) {
    this.node = node;
    this.item = item;
    const source = item.options || {};
    this.options = { interval: Math.max(3, Math.min(3600, Number(source.interval) || 10)), order: source.order === 'random' ? 'random' : 'name', fit: source.fit === 'contain' ? 'contain' : 'cover', folder: source.folder || '' };
    node.classList.add('slideshow-widget', `slideshow-${this.options.fit}`);
    this.picture = el('img', 'slideshow-picture');
    this.picture.alt = '';
    this.note = el('span', 'slideshow-note', this.options.folder ? this.context.i18n.t('slideshow.loading') : this.context.i18n.t('slideshow.unconfigured'));
    node.append(this.picture, this.note);
    appendWidgetName(node, item);
    this.click = () => this.load(1);
    node.addEventListener('click', this.click);
    this.context.documentObject.addEventListener('visibilitychange', this.visibility);
    if (item.id && this.options.folder) this.load(0);
  }

  async load(step) {
    if (this.loading || this.context.documentObject.hidden || !this.item.id) return;
    let target = this.index < 0 ? 0 : this.index + step;
    if (this.options.order === 'random' && this.count > 1 && this.index >= 0) {
      target = Math.floor(Math.random() * (this.count - 1));
      if (target >= this.index) target += 1;
    }
    this.loading = true;
    try {
      const result = await this.context.api.get(`/api/slideshow?id=${encodeURIComponent(this.item.id)}&index=${target}`, 20000);
      this.count = result.count || 0;
      this.index = Number.isFinite(result.index) ? result.index : 0;
      const source = safeImageSource(result.data);
      this.note.textContent = source ? '' : result.error || '';
      if (source) this.picture.src = source;
    } catch (error) { this.note.textContent = error.serverError || error.message; }
    this.loading = false;
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.context.documentObject.hidden && this.item && this.item.id && this.options.folder)
      this.timer = setTimeout(() => this.load(1), this.options.interval * 1000);
  }

  update() {}

  destroy() {
    clearTimeout(this.timer);
    this.node.removeEventListener('click', this.click);
    this.context.documentObject.removeEventListener('visibilitychange', this.visibility);
  }
}
