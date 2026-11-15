import assert from 'node:assert/strict';
import { EditorState } from '../web/v4/settings/editor-state.js';
import { History } from '../web/v4/settings/history.js';

const faders = () => ({
  speaker: { row: 0, column: 0, width: 1, height: 1, off: true },
  mic: { row: 0, column: 1, width: 1, height: 1, off: true },
});
const item = (id, row, column, width = 1, height = 1) => ({
  id, name: id, type: 'app', category: 'common', action: null, path: '', args: '', url: '', text: '', hotkey: '',
  deviceId: null, deviceTarget: null, icon: null, iconKey: '', iconColor: '#3569c8', customIcon: '', iconPack: null,
  iconPackItem: null, row, column, width, height, fontSize: 11, iconScale: 82, labelOpacity: 45, keyClear: null,
  hideLabel: false, options: null, steps: null,
});
const orientation = (items = []) => ({
  columns: 4, rows: 3, faders: faders(), pages: [{ name: 'Home', faders: null, items }],
});
const response = () => ({
  version: 'v1', deck: { background: {}, landscape: orientation([item('a', 0, 0), item('wide', 1, 0, 2, 1)]), portrait: orientation([]) },
  widgetDefinitions: [{ type: 'app', sizes: ['1x1', '2x1', '2x2'] }],
});

const editor = new EditorState(response());
const history = new History(editor);
const address = (state, id) => {
  const index = state.orientation('landscape').pages[0].items.findIndex((value) => value.id === id);
  return { orientation: 'landscape', page: 0, index };
};
assert(editor.moveItem({ orientation: 'landscape', page: 0, index: 0 }, 0, 0, 3), 'moves to an empty cell');
assert(!editor.moveItem(address(editor, 'a'), 0, 1, 0), 'rejects overlap');
assert(!editor.moveItem(address(editor, 'a'), 0, 3, 4), 'rejects out of bounds');

assert(editor.addItem('landscape', 0, item('', 0, 0)), 'adds at first free cell');
assert.deepEqual(editor.orientation('landscape').pages[0].items.at(-1), { ...item('', 0, 0), row: 0, column: 0 });
assert(editor.removeItem({ orientation: 'landscape', page: 0, index: 2 }), 'removes an item');

assert(editor.addPage('landscape', 0));
assert(editor.renamePage('landscape', 1, 'Second'));
assert.equal(editor.orientation('landscape').pages[1].name, 'Second');
assert(editor.movePage('landscape', 1, 0));
assert.equal(editor.orientation('landscape').pages[0].name, 'Second');
assert(editor.removePage('landscape', 0));
assert.equal(editor.orientation('landscape').pages.length, 1);

const reflow = new EditorState(response());
assert(reflow.addPage('landscape', 0));
assert(reflow.addItem('landscape', 0, item('right', 0, 0), 0, 3));
assert(reflow.addItem('landscape', 0, item('bottom', 0, 0), 2, 3));
const resized = reflow.setGrid('landscape', 2, 2, true);
assert(resized.ok && resized.count === 2, 'reflows displaced items');
const pages = reflow.orientation('landscape').pages;
assert.equal(pages[0].items.find((value) => value.id === 'right').row, 0, 'uses the same page first');
assert(pages[1].items.some((value) => value.id === 'bottom'), 'uses a later page second');
for (let index = 0; index < 3; index += 1) assert(reflow.addItem('landscape', 1, item(`fill-${index}`, 0, 0)));
assert(reflow.setGrid('landscape', 3, 3, false).ok);
assert(reflow.addItem('landscape', 0, item('new-page', 0, 0), 2, 2));
assert(reflow.setGrid('landscape', 2, 2, true).ok);
assert(reflow.orientation('landscape').pages.length >= 3, 'creates a new page when later pages are full');

const beforeUndo = editor.item(address(editor, 'wide')).column;
assert(editor.moveItem(address(editor, 'wide'), 0, 2, 2));
assert(history.undo());
assert.equal(editor.item(address(editor, 'wide')).column, beforeUndo, 'undo restores the deck');
assert(history.redo());
assert.equal(editor.item(address(editor, 'wide')).column, 2, 'redo reapplies the deck');

const appearance = new EditorState(response());
const appearanceHistory = new History(appearance);
const iconAddress = { orientation: 'landscape', page: 0, index: 0 };
assert(appearance.updateItem(iconAddress, { iconKey: 'heart', iconColor: '#b53846', customIcon: '', iconPack: null, iconPackItem: null }));
assert.equal(appearance.item(iconAddress).iconKey, 'heart');
assert(appearanceHistory.undo());
assert.equal(appearance.item(iconAddress).iconKey, '', 'one undo restores an icon choice');
assert(appearance.change((deck) => deck.landscape.pages[0].items.forEach((value) => { value.iconKey = 'star'; value.iconColor = '#3569c8'; })));
assert(appearanceHistory.undo());
assert.equal(appearance.item(iconAddress).iconKey, '', 'one undo restores a bulk icon change');
const dirty = appearance.dirty;
appearance.setBackground({ color: '#000000' });
assert.equal(appearance.dirty, dirty, 'background does not mark the deck dirty');

// Shortcuts get the same starting icon and category as in 3.x.
const { catalogItem } = await import('../web/v4/settings/catalog-items.js');
const { defaultIconForAction, effectiveIconKey } = await import('../web/v4/settings/default-icon.js');
assert.equal(catalogItem('media-play', 'Play', 'music').iconKey, 'play');
assert.equal(catalogItem('media-play', 'Play', 'music').category, 'music');
assert.equal(catalogItem('audio-mic-mute', 'Mic', 'audio').iconKey, 'microphone');
assert.equal(catalogItem('audio-speaker-mute', 'Mute', 'audio').iconKey, 'mute');
assert.equal(catalogItem('clip-layer-new', 'Layer', 'clipstudio').iconKey, 'layers');
assert.equal(catalogItem('discord-deafen', 'Deafen', 'discord').iconKey, 'chat');
assert.equal(catalogItem('custom-audio-input', 'Input').iconKey, 'audio-input');
assert.equal(defaultIconForAction('key-custom', 'custom'), 'keyboard');
assert.equal(effectiveIconKey({ type: 'url', iconKey: '' }), 'globe');
assert.equal(effectiveIconKey({ type: 'hotkey', iconKey: 'star', action: 'media-play' }), 'star');

// Switching to a pack changes matching buttons as one step and leaves own pictures alone.
const { IconPacks } = await import('../web/v4/settings/icon-packs.js');
const bulkEditor = new EditorState(response());
const bulkHistory = new History(bulkEditor);
bulkEditor.change((deck) => {
  const items = deck.landscape.pages[0].items;
  Object.assign(items[0], { iconKey: 'star', customIcon: '', iconPack: null });
  if (items[1]) Object.assign(items[1], { iconKey: '', customIcon: 'data:image/png;base64,AAAA', iconPack: null });
});
const notices = [];
const packs = new IconPacks({
  editor: bulkEditor, i18n: { t: (key, values) => `${key}:${values && values.count !== undefined ? values.count : ''}` },
  onNotice: (text) => notices.push(text), onError: (text) => notices.push(`error ${text}`),
});
packs.cache.set('p1', { id: 'p1', name: 'Pack', icons: [{ id: 'i1', name: 'Star', key: 'star', data: 'data:image/png;base64,BBBB' }] });
const stepsBefore = bulkHistory.past.length;
await packs.bulk('p1', 'all', 'landscape', 0);
const first = bulkEditor.deck.landscape.pages[0].items[0];
assert.equal(first.customIcon, 'data:image/png;base64,BBBB');
assert.equal(first.iconPack, 'p1');
assert.equal(first.iconPackItem, 'i1');
if (bulkEditor.deck.landscape.pages[0].items[1]) assert.equal(bulkEditor.deck.landscape.pages[0].items[1].customIcon, 'data:image/png;base64,AAAA', 'own pictures stay');
assert.equal(bulkHistory.past.length, stepsBefore + 1, 'a bulk change is one undo step');
assert(notices.at(-1).startsWith('bulk.done:1'));
await packs.bulk('p1', 'all', 'landscape', 0);
assert.equal(bulkHistory.past.length, stepsBefore + 1, 'nothing to change adds no undo step');
assert(notices.at(-1).startsWith('bulk.none'));
await packs.bulk('', 'page', 'landscape', 0);
assert.equal(bulkEditor.deck.landscape.pages[0].items[0].customIcon, '', 'back to the built-in icon');
assert.equal(bulkEditor.deck.landscape.pages[0].items[0].iconKey, 'star');
console.log('PASS settings editor: placement, pages, reflow, undo and redo');
