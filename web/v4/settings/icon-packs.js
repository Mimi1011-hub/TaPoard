import { clear, el } from '../core/dom.js';
import { safeImageSource } from '../core/image-source.js';
import { makeCustomIcon } from './image-tools.js';
import { readPackSource } from './icon-pack-reader.js';
import { buildZip } from './zip.js';

export class IconPacks {
  constructor(options) { Object.assign(this, options); this.packs = []; this.cache = new Map(); this.maxPacks = 50; this.maxIcons = 5000; }
  async load() { const result = await this.api.get('/api/icon-packs', 10000); this.packs = result.packs || []; this.maxPacks = result.maxPacks || 50; this.maxIcons = result.maxIcons || 5000; if (this.root) this.render(); return this.packs; }
  async get(id) { if (!this.cache.has(id)) this.cache.set(id, await this.api.get(`/api/icon-packs/get?id=${encodeURIComponent(id)}`, 20000)); return this.cache.get(id); }
  async import(files) {
    let id = ''; try { const source = await readPackSource(files); if (source.icons.length > this.maxIcons) throw new Error('limit'); const created = await this.api.post('/api/icon-packs/create', { name: source.name, author: source.author }, 10000); id = created.id; let batch = [], size = 0;
      for (let index = 0; index < source.icons.length; index += 1) { const icon = source.icons[index], blob = icon.blob || await icon.read(), data = await makeCustomIcon(blob); batch.push({ id: `i${index + 1}`, name: icon.name, key: icon.key || '', group: icon.group || '', tags: icon.tags || '', data }); size += data.length + 200; this.progress(this.i18n.t('packs.progress', { current: index + 1, total: source.icons.length })); if (size > 900000) { await this.api.post('/api/icon-packs/add', { id, icons: batch }, 30000); batch = []; size = 0; } }
      if (batch.length) await this.api.post('/api/icon-packs/add', { id, icons: batch }, 30000); await this.load(); this.progress(''); return id;
    } catch (error) { if (id) await this.api.post('/api/icon-packs/delete', { id }, 10000).catch(() => {}); this.progress(''); throw error; }
  }
  progress(text) { if (this.progressNode) this.progressNode.textContent = text; }
  attach(root) { this.root = root; this.render(); }
  render() {
    clear(this.root); this.root.appendChild(el('h3', '', this.i18n.t('packs.title'))); const input = el('input'); input.type = 'file'; input.multiple = true; input.accept = '.tpicons,.zip,.streamDeckIconPack,image/*'; input.addEventListener('change', () => this.import(input.files).catch((error) => this.onError(error.message))); this.root.appendChild(input); this.progressNode = el('p', 'pack-progress'); this.root.appendChild(this.progressNode);
    this.packs.forEach((pack) => { const row = el('div', 'pack-row'); row.append(el('strong', '', pack.name), el('small', '', `${pack.count}・${pack.author || ''}`)); const rename = el('button', '', this.i18n.t('packs.rename')); rename.addEventListener('click', () => this.rename(pack)); const out = el('button', '', this.i18n.t('packs.export')); out.addEventListener('click', () => this.export(pack)); const remove = el('button', '', this.i18n.t('packs.delete')); remove.addEventListener('click', () => this.remove(pack)); row.append(rename, out, remove); this.root.appendChild(row); });
  }
  async rename(pack) { const name = this.promptFn(this.i18n.t('packs.name'), pack.name); if (!name) return; const author = this.promptFn(this.i18n.t('packs.author'), pack.author || ''); await this.api.post('/api/icon-packs/rename', { id: pack.id, name, author: author || '' }, 10000); await this.load(); }
  async remove(pack) { if (!this.confirmFn(this.i18n.t('packs.confirmDelete', { name: pack.name }))) return; await this.api.post('/api/icon-packs/delete', { id: pack.id }, 10000); this.cache.delete(pack.id); await this.load(); }
  async export(pack) { const full = await this.get(pack.id), encoder = new TextEncoder(), files = [], manifest = { format: 'tapoard-icons', version: 1, name: full.name, author: full.author || '', icons: [] }; full.icons.forEach((icon, index) => { if (!safeImageSource(icon.data)) return; const bytes = Uint8Array.from(atob(icon.data.split(',')[1]), (char) => char.charCodeAt(0)), file = `icons/icon-${index + 1}.png`; files.push({ name: file, bytes }); manifest.icons.push({ file, name: icon.name, key: icon.key || '', group: icon.group || '' }); }); files.unshift({ name: 'icons.json', bytes: encoder.encode(JSON.stringify(manifest)) }); const link = document.createElement('a'); link.href = URL.createObjectURL(buildZip(files)); link.download = `${pack.name}.tpicons`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
  async bulk(packId, scope, orientation, page) { const pack = packId ? await this.get(packId) : null, byKey = new Map((pack ? pack.icons : []).filter((icon) => icon.key).map((icon) => [icon.key, icon])); return this.editor.change((deck) => { ['landscape', 'portrait'].forEach((name) => deck[name].pages.forEach((value, index) => { if (scope === 'page' && (name !== orientation || index !== page)) return; value.items.forEach((item) => { if (!pack) { if (item.iconPack) { item.customIcon = ''; item.iconPack = null; item.iconPackItem = null; } return; } const icon = byKey.get(item.iconKey); if (icon) { item.customIcon = icon.data; item.iconPack = pack.id; item.iconPackItem = icon.id; } }); })); }); }
}
