import assert from 'node:assert/strict';
import { catalogGroups } from '../web/v4/settings/catalog-data/index.js';
import { catalogGroups as previousGroups } from '../web/v4/settings/catalog-data/base.js';
import { vscode } from '../web/v4/settings/catalog-data/vscode.js';
import { canonicalCatalogAction, catalogItem, catalogSizes } from '../web/v4/settings/catalog-items.js';
import { hotkeyNames } from '../web/v4/settings/details/hotkey-details.js';
import { CatalogRecent } from '../web/v4/settings/catalog-recent.js';
import { readShortcutPack } from '../web/v4/settings/shortcut-pack-reader.js';
import { readPackSource } from '../web/v4/settings/icon-pack-reader.js';

const ids = catalogGroups.flatMap((group) => group.items.map((item) => item.id || item.action));
assert.equal(new Set(ids).size, ids.length, 'catalog ids are unique');
const volume = catalogGroups.find((group) => group.title === 'catalog.group.audioFaders');
const launch = catalogGroups.find((group) => group.id === 'launch');
['custom-audio-output', 'custom-audio-input'].forEach((action) => {
  assert(volume.items.some((item) => item.action === action), `${action} is in volume`);
  assert(!launch.items.some((item) => item.action === action), `${action} is not in launch`);
});
['widget-clock-digital-wide', 'widget-wheel-vertical-tall', 'widget-touchpad-tall', 'widget-keypad-tall'].forEach((id) => {
  assert(!ids.includes(id), `${id} is merged into its component`);
  assert.notEqual(canonicalCatalogAction(id), id, `${id} remains readable as a recent-item alias`);
});
const definitions = new Map([['slideshow', { sizes: ['3x3', '3x4', '4x3'] }]]);
assert.deepEqual(catalogSizes('widget-clock-digital', definitions), ['2x1', '2x2']);
assert.deepEqual(catalogSizes('widget-clock-analog', definitions), ['2x2']);
assert.deepEqual(catalogSizes('widget-weather-now', definitions), ['1x1']);
assert.deepEqual(catalogSizes('widget-weather-days', definitions), ['2x2']);
assert.deepEqual(catalogSizes('widget-wheel-vertical', definitions), ['1x1', '1x2']);
assert.deepEqual(catalogSizes('widget-wheel-rotary', definitions), ['2x2']);
assert.deepEqual(catalogSizes('widget-touchpad-wide', definitions), ['3x2', '2x3']);
assert.deepEqual(catalogSizes('widget-keypad', definitions), ['4x4', '4x5']);
assert.deepEqual(catalogSizes('widget-slideshow-3x3', definitions), ['3x3', '3x4', '4x3']);
const previous = previousGroups.flatMap((group) => group.items);
previous.forEach((old) => {
  const current = catalogGroups.flatMap((group) => group.items).find((item) => item.action === old.action);
  assert(current, `keeps ${old.action}`);
  assert.equal(current.category, old.category, `${old.action} category`);
  const before = catalogItem(old.action, 'Name', old.category);
  const after = catalogItem(current.action, 'Name', current.category);
  ['type', 'category', 'iconKey', 'width', 'height'].forEach((key) => assert.equal(after[key], before[key], `${old.action} ${key}`));
});

const modifiers = ['Ctrl', 'Shift', 'Alt', 'Win'];
vscode.items.forEach((item) => {
  const parts = item.keys.split('+');
  assert(hotkeyNames.includes(parts.pop()), `${item.id} main key`);
  assert(parts.every((part) => modifiers.includes(part)), `${item.id} modifiers`);
  const placed = catalogItem('key-custom', 'Name', item.category);
  placed.hotkey = item.keys;
  assert.equal(placed.action, 'key-custom');
  assert.equal(placed.hotkey, item.keys);
});

const source = (values = {}) => ({
  format: 'tapoard-shortcuts',
  version: 1,
  name: 'Test',
  shortcuts: [{ name: 'Open', keys: 'Ctrl+P' }],
  ...values,
});
const file = (value) => ({ name: 'pack.json', text: async () => JSON.stringify(value) });
assert.equal((await readShortcutPack(file(source()))).shortcuts.length, 1);
await assert.rejects(() => readShortcutPack(file(source({ format: 'wrong' }))));
await assert.rejects(() => readShortcutPack(file(source({ version: 2 }))));
const skipped = await readShortcutPack(file(source({ shortcuts: [{ name: 'Bad', keys: 'Nope' }, { name: 'Good', keys: 'F1' }] })));
assert.equal(skipped.skipped, 1);
assert.equal(skipped.shortcuts.length, 1);
await assert.rejects(() => readShortcutPack(file(source({ shortcuts: Array.from({ length: 301 }, () => ({ name: 'A', keys: 'A' })) }))));
await assert.rejects(() => readShortcutPack(file(source({ name: 'x'.repeat(61) }))));
const pictureSource = await readPackSource([{ name: 'star.png' }]);
assert.equal(pictureSource.source, 'images');

const values = new Map();
const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
const recent = new CatalogRecent(storage);
for (let index = 0; index < 10; index += 1) recent.add(`item-${index}`);
recent.add('item-5');
assert.deepEqual(recent.read((id) => id !== 'item-8'), ['item-5', 'item-9', 'item-7', 'item-6', 'item-4', 'item-3', 'item-2']);
const broken = new CatalogRecent({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
assert.deepEqual(broken.read(() => true), []);
assert.deepEqual(broken.add('x'), []);

console.log('PASS settings catalog: mappings, VS Code keys, pack reader and recent items');
