import { hotkeyNames } from './details/hotkey-details.js';
import { readZipEntries, readZipEntry } from './zip.js';

const modifiers = ['Ctrl', 'Shift', 'Alt', 'Win'];

export function validShortcutKeys(value) {
  const parts = String(value || '').split('+');
  const main = parts.pop();
  return hotkeyNames.indexOf(main) >= 0 && parts.every((part) => modifiers.indexOf(part) >= 0);
}

function validate(source, iconFiles) {
  if (!source || source.format !== 'tapoard-shortcuts') throw new Error('format');
  if (source.version !== 1) throw new Error('version');
  const name = String(source.name || '').trim();
  if (!name || name.length > 60) throw new Error('name');
  if (!Array.isArray(source.shortcuts) || source.shortcuts.length > 300) throw new Error('count');
  let skipped = 0;
  const shortcuts = [];
  source.shortcuts.forEach((value) => {
    const itemName = String(value && value.name || '').trim();
    const keys = String(value && value.keys || '').trim();
    if (!itemName || itemName.length > 80 || !validShortcutKeys(keys)) {
      skipped += 1;
      return;
    }
    const icon = String(value.icon || '').replace(/\\/g, '/').split('/').pop().slice(0, 80);
    shortcuts.push({
      name: itemName,
      keys,
      description: String(value.description || '').trim().slice(0, 80),
      icon: iconFiles.has(icon) ? icon : '',
    });
  });
  if (!shortcuts.length) throw new Error('empty');
  return {
    name,
    author: String(source.author || '').trim().slice(0, 60),
    app: String(source.app || '').trim().slice(0, 60),
    shortcuts,
    skipped,
    icons: iconFiles,
  };
}

export async function readShortcutPack(file) {
  if (/\.json$/i.test(file.name)) {
    const source = JSON.parse(await file.text());
    return validate(source, new Map());
  }
  const buffer = await file.arrayBuffer();
  const entries = readZipEntries(buffer);
  const manifest = entries.find((entry) => entry.name === 'shortcuts.json');
  if (!manifest) throw new Error('format');
  const source = JSON.parse(new TextDecoder().decode(await readZipEntry(buffer, manifest)));
  const iconFiles = new Map();
  for (const entry of entries) {
    if (!/^icons\/[^/]+$/i.test(entry.name)) continue;
    const name = entry.name.slice(6);
    iconFiles.set(name, async () => new Blob([await readZipEntry(buffer, entry)]));
  }
  return validate(source, iconFiles);
}
