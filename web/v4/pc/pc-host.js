import { PcInfo } from './pc-info.js';
import { PcPointer } from './pc-pointer.js';

export class PcHost {
  constructor(context) {
    this.context = context; this.lastPage = ''; this.lastPageName = null;
    context.documentObject.body.classList.add('pc-window'); context.topbar.hidden = true;
    this.info = new PcInfo(context);
    this.pointer = new PcPointer({
      windowObject: context.windowObject,
      documentObject: context.documentObject,
      appNode: context.appNode,
      deckNode: context.deckNode,
      post: (message) => this.post(message),
      movePage: (step) => context.movePage(step),
      pages: () => ({ page: context.topbar.page, total: context.topbar.total }),
      swipeEnabled: () => context.storage.getItem('tapoard-swipe') !== 'off',
    });
    this.resize = () => this.fitLayout(); context.windowObject.addEventListener('resize', this.resize);
    context.windowObject.tapoardPc = {
      set: (value) => this.set(value || {}), page: (step) => context.movePage(step),
      menu: () => context.openMenu(), rebase: () => this.pointer.rebase(),
    };
  }
  post(message) {
    const chromeObject = this.context.windowObject.chrome;
    if (chromeObject && chromeObject.webview && chromeObject.webview.postMessage) chromeObject.webview.postMessage(message);
  }
  set(value) {
    this.info.set(value); this.pointer.set(value);
    this.fill = value.aspect === 'fill';
    this.context.documentObject.body.classList.toggle('pc-fill', this.fill); this.fitLayout();
  }
  updatePage(page, total, name) {
    const value = `${Math.min(page + 1, total)}/${total}`;
    if (value !== this.lastPage) { this.lastPage = value; this.post(`page:${value}`); }
    const pageName = name || '';
    if (pageName !== this.lastPageName) { this.lastPageName = pageName; this.post(`pagename:${pageName}`); }
  }
  updateLayout(columns, rows) {
    this.columns = Math.max(1, columns); this.rows = Math.max(1, rows); this.fitLayout();
  }
  fitLayout() {
    const shell = this.context.deckShell;
    if (this.fill || !this.columns) { shell.style.width = ''; shell.style.height = ''; return; }
    const width = this.context.windowObject.innerWidth; const height = this.context.windowObject.innerHeight;
    const ratio = this.columns / this.rows;
    if (width / height > ratio) { shell.style.width = `${Math.round(height * ratio)}px`; shell.style.height = `${height}px`; }
    else { shell.style.width = `${width}px`; shell.style.height = `${Math.round(width / ratio)}px`; }
  }
  actionLatency(value) { this.info.actionLatency(value); }
  connectionChanged() { this.info.render(); }
}
