import { presetGroups } from '../deck/icons.js';
import { readZipEntries, readZipEntry } from './zip.js';

const keys = new Set(presetGroups.flatMap((group) => group[1].map((item) => item[0])));
const aliases = { mic: 'microphone', volume: 'speaker', sound: 'speaker', audio: 'speaker', browser: 'globe', web: 'globe', discord: 'chat', game: 'gamepad', rec: 'record', obs: 'recording', cam: 'camera', screenshot: 'screenshot', gear: 'settings' };
const base = (name) => String(name || '').split('/').pop().replace(/\.[^.]+$/, '');
export const guessPresetKey = (name) => { const value = base(name).toLowerCase().trim().replace(/[\s_]+/g, '-'); return keys.has(value) ? value : aliases[value] || ''; };
export const imageType = (name) => { const match = /\.(png|jpe?g|webp|svg)$/i.exec(name || ''); if (!match) return ''; const ext = match[1].toLowerCase(); return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`; };
export async function readPackSource(files) {
  files = Array.from(files || []); if (!files.length) throw new Error('empty');
  const archive = files.find((file) => /\.(tpicons|zip|streamdeckiconpack)$/i.test(file.name));
  if (!archive) { const images = files.filter((file) => imageType(file.name)); if (!images.length) throw new Error('type'); return { name: base(images[0].name), author: '', icons: images.map((blob) => ({ name: base(blob.name), key: guessPresetKey(blob.name), group: '', tags: '', blob })) }; }
  if (archive.size > 50 * 1024 * 1024) throw new Error('size'); const buffer = await archive.arrayBuffer(); const entries = readZipEntries(buffer).filter((entry) => imageType(entry.name));
  const manifestEntry = readZipEntries(buffer).find((entry) => /(^|\/)icons\.json$/i.test(entry.name)); let manifest = null;
  if (manifestEntry) manifest = JSON.parse(new TextDecoder().decode(await readZipEntry(buffer, manifestEntry)).replace(/^﻿/, ''));
  const listed = manifest && (Array.isArray(manifest) ? manifest : manifest.icons), byName = new Map(entries.map((entry) => [entry.name.toLowerCase(), entry])); const icons = [];
  if (Array.isArray(listed)) listed.forEach((value) => { const file = String(value.file || value.path || '').replace(/^\.\//, ''), entry = byName.get(file.toLowerCase()) || entries.find((item) => item.name.toLowerCase().endsWith(`/${file.toLowerCase()}`)); if (entry) icons.push({ name: String(value.name || base(entry.name)).slice(0, 80), key: keys.has(value.key) ? value.key : guessPresetKey(value.name || entry.name), group: String(value.group || '').slice(0, 40), tags: Array.isArray(value.tags) ? value.tags.join(' ') : '', read: async () => new Blob([await readZipEntry(buffer, entry)], { type: imageType(entry.name) }) }); });
  else entries.forEach((entry) => icons.push({ name: base(entry.name), key: guessPresetKey(entry.name), group: '', tags: '', read: async () => new Blob([await readZipEntry(buffer, entry)], { type: imageType(entry.name) }) }));
  if (!icons.length) throw new Error('icons'); return { name: String((manifest && manifest.name) || base(archive.name)).slice(0, 80), author: String((manifest && manifest.author) || '').slice(0, 80), icons };
}
