import { clear, el } from '../core/dom.js';
import { safeImageSource } from '../core/image-source.js';
import { effectiveIconKey } from './default-icon.js';
import { readPackSource } from './icon-pack-reader.js';
import { makePackIcon } from './image-tools.js';
import { buildZip } from './zip.js';

const safeFileName = (name) => String(name || 'icons').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 60) || 'icons';
const readerErrors = ['empty', 'type', 'size', 'icons', 'limit'];

// Icon packs kept on the PC: list, import, rename, export, delete, and switching many buttons at once.
export class IconPacks {
  constructor(options) {
    Object.assign(this, options);
    this.packs = [];
    this.cache = new Map();
    this.maxPacks = 50;
    this.maxIcons = 5000;
    this.busy = false;
  }

  async load() {
    const result = await this.api.get('/api/icon-packs', 10000);
    this.packs = result.packs || [];
    this.maxPacks = result.maxPacks || 50;
    this.maxIcons = result.maxIcons || 5000;
    if (this.root) this.render();
    if (this.onChange) this.onChange();
    return this.packs;
  }

  async get(id) {
    if (!this.cache.has(id)) this.cache.set(id, await this.api.get(`/api/icon-packs/get?id=${encodeURIComponent(id)}`, 20000));
    return this.cache.get(id);
  }

  errorText(error) {
    if (readerErrors.indexOf(error.message) >= 0) return this.i18n.t(`packs.error.${error.message}`, { max: this.maxIcons });
    return error.serverError || this.i18n.t('packs.error.broken');
  }

  // Reads a pack file or loose pictures and sends them to the PC in parts of about 900 KB.
  async import(files) {
    if (this.busy) return '';
    this.busy = true;
    let id = '', skipped = 0;
    try {
      this.progress(this.i18n.t('packs.reading'));
      const source = await readPackSource(files);
      if (source.icons.length > this.maxIcons) throw new Error('limit');
      id = (await this.api.post('/api/icon-packs/create', { name: source.name, author: source.author }, 10000)).id;
      let batch = [], size = 0;
      const flush = async () => {
        if (batch.length) await this.api.post('/api/icon-packs/add', { id, icons: batch }, 30000);
        batch = [];
        size = 0;
      };
      for (let index = 0; index < source.icons.length; index += 1) {
        const icon = source.icons[index];
        try {
          const data = await makePackIcon(icon.blob || await icon.read());
          batch.push({ id: `i${index + 1}`, name: icon.name, key: icon.key || '', group: icon.group || '', tags: icon.tags || '', data });
          size += data.length + 200;
        } catch (error) { skipped += 1; }
        this.progress(this.i18n.t('packs.progress', { current: index + 1, total: source.icons.length }));
        if (size > 900000) await flush();
      }
      if (skipped === source.icons.length) throw new Error('icons');
      await flush();
      this.progress('');
      const count = source.icons.length - skipped;
      this.onNotice(this.i18n.t('packs.imported', { name: source.name, count })
        + (skipped ? this.i18n.t('packs.skipped', { count: skipped }) : ''));
      await this.load();
      return id;
    } catch (error) {
      if (id) await this.api.post('/api/icon-packs/delete', { id }, 10000).catch(() => {});
      this.progress('');
      this.onError(`${this.i18n.t('packs.importFailed')} ${this.errorText(error)}`);
      return '';
    } finally {
      this.busy = false;
    }
  }

  progress(text) {
    if (this.progressNode) this.progressNode.textContent = text;
  }

  button(key, run) {
    const button = el('button', '', this.i18n.t(key));
    button.type = 'button';
    button.addEventListener('click', run);
    return button;
  }

  render() {
    clear(this.root);
    this.root.appendChild(el('h3', '', this.i18n.t('packs.title')));
    const input = el('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.tpicons,.zip,.streamDeckIconPack,image/*';
    input.hidden = true;
    input.addEventListener('change', async () => {
      await this.import(input.files);
      input.value = '';
    });
    this.root.append(this.button('packs.import', () => input.click()), input);
    this.root.appendChild(el('p', 'saved-note', this.i18n.t('packs.note', { packs: this.packs.length, max: this.maxPacks })));
    this.progressNode = el('p', 'pack-progress');
    this.root.appendChild(this.progressNode);
    this.packs.forEach((pack) => {
      const row = el('div', 'pack-row');
      const note = pack.author
        ? this.i18n.t('packs.countAuthor', { count: pack.count, author: pack.author })
        : this.i18n.t('packs.count', { count: pack.count });
      row.append(el('strong', '', pack.name), el('small', '', note));
      row.append(
        this.button('packs.rename', () => this.rename(pack)),
        this.button('packs.export', () => this.export(pack)),
        this.button('packs.delete', () => this.remove(pack)),
      );
      this.root.appendChild(row);
    });
  }

  async change(action, body) {
    try {
      await this.api.post(`/api/icon-packs/${action}`, body, 10000);
      this.cache.delete(body.id);
      await this.load();
      return true;
    } catch (error) {
      this.onError(error.serverError || error.message);
      return false;
    }
  }

  async rename(pack) {
    const name = this.promptFn(this.i18n.t('packs.name'), pack.name);
    if (!name) return;
    const author = this.promptFn(this.i18n.t('packs.author'), pack.author || '');
    await this.change('rename', { id: pack.id, name, author: author || '' });
  }

  async remove(pack) {
    if (!this.confirmFn(this.i18n.t('packs.confirmDelete', { name: pack.name }))) return;
    await this.change('delete', { id: pack.id });
  }

  // Writes the pack as a .tpicons file (a zip with icons.json and the pictures).
  async export(pack) {
    try {
      const full = await this.get(pack.id), files = [], used = new Set();
      const manifest = { format: 'tapoard-icons', version: 1, name: full.name, author: full.author || '', icons: [] };
      full.icons.forEach((icon, index) => {
        const type = /^data:image\/(png|jpeg|webp);base64,/.exec(icon.data || '');
        if (!type || !safeImageSource(icon.data)) return;
        const extension = type[1].replace('jpeg', 'jpg');
        let file = `${safeFileName(icon.name || 'icon')}.${extension}`;
        if (used.has(file.toLowerCase())) file = `${safeFileName(icon.name || 'icon')}-${index + 1}.${extension}`;
        used.add(file.toLowerCase());
        const bytes = Uint8Array.from(atob(icon.data.slice(type[0].length)), (char) => char.charCodeAt(0));
        files.push({ name: `icons/${file}`, bytes });
        manifest.icons.push({ file: `icons/${file}`, name: icon.name || '', key: icon.key || '', group: icon.group || '' });
      });
      files.unshift({ name: 'icons.json', bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(buildZip(files));
      link.download = `${safeFileName(full.name)}.tpicons`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      this.onNotice(this.i18n.t('packs.exported', { name: full.name }));
    } catch (error) {
      this.onError(`${this.i18n.t('packs.exportFailed')} ${error.serverError || error.message}`);
    }
  }

  // Switches buttons to the pack's pictures (or back to the built-in icons) as one undoable change.
  async bulk(packId, scope, orientation, page) {
    let pack = null;
    try { pack = packId ? await this.get(packId) : null; }
    catch (error) { this.onError(error.serverError || error.message); return; }
    const byKey = new Map(), byName = new Map();
    (pack ? pack.icons : []).forEach((icon) => {
      if (icon.key && !byKey.has(icon.key)) byKey.set(icon.key, icon);
      if (icon.name && !byName.has(icon.name)) byName.set(icon.name, icon);
    });
    let changed = 0, missing = 0;
    const switchItem = (item) => {
      const usesPack = !!(item.customIcon && item.iconPack);
      if (!pack) {
        if (!usesPack) return;
        Object.assign(item, { customIcon: '', iconPack: null, iconPackItem: null });
        changed += 1;
        return;
      }
      // Original images and icons taken from an app stay as they are.
      if ((item.customIcon && !usesPack) || (!item.iconKey && item.icon)) return;
      const icon = byKey.get(effectiveIconKey(item)) || byName.get(String(item.name || '').trim());
      if (!icon) { missing += 1; return; }
      if (item.customIcon === icon.data && item.iconPack === pack.id) return;
      Object.assign(item, { customIcon: icon.data, iconPack: pack.id, iconPackItem: icon.id });
      changed += 1;
    };
    this.editor.change((deck) => {
      ['landscape', 'portrait'].forEach((name) => deck[name].pages.forEach((value, index) => {
        if (scope === 'page' && (name !== orientation || index !== page)) return;
        value.items.forEach(switchItem);
      }));
      return changed > 0;
    });
    const name = pack ? pack.name : '';
    const left = missing ? this.i18n.t('bulk.missing', { count: missing }) : '';
    if (!changed) this.onNotice(this.i18n.t(pack ? 'bulk.none' : 'bulk.noneStandard', { name }) + left);
    else this.onNotice(this.i18n.t(pack ? 'bulk.done' : 'bulk.doneStandard', { name, count: changed }) + left);
  }
}
