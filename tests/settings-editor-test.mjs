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
console.log('PASS settings editor: placement, pages, reflow, undo and redo');
