import { el } from '../../core/dom.js';
import { button, field, heading, note } from './fields.js';

const modifiers = ['Ctrl', 'Shift', 'Alt', 'Win'];
const named = [
  'Enter', 'Tab', 'Escape', 'Space', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PrintScreen', 'Pause', 'CapsLock',
  'Semicolon', 'Equal', 'Comma', 'Minus', 'Period', 'Slash', 'Backquote', 'BracketLeft', 'Backslash', 'BracketRight', 'Quote',
  'MediaPlayPause', 'MediaTrackNext', 'MediaTrackPrevious', 'MediaStop',
];
const functionKeys = Array.from({ length: 24 }, (_, index) => `F${index + 1}`);

export const hotkeyNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').concat(functionKeys, named);

// Turns a key press into the text the PC understands, or '' for a key that must be chosen from the list.
export function hotkeyFromEvent(event) {
  const code = event.code || '';
  let main = code;
  if (/^Key[A-Z]$/.test(code)) main = code.slice(3);
  if (/^Digit[0-9]$/.test(code)) main = code.slice(5);
  if (hotkeyNames.indexOf(main) < 0) return '';
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.shiftKey) parts.push('Shift');
  if (event.altKey) parts.push('Alt');
  if (event.metaKey) parts.push('Win');
  parts.push(main);
  return parts.join('+');
}

export function hotkeyDetails(context) {
  // Volume and mute are done by Windows itself, so they have no key to change.
  if (/^audio-/.test(context.item.action || '')) return;
  heading(context, 'details.hotkeyTitle');
  const current = context.item.hotkey || '';
  const parts = current ? current.split('+') : [];
  context.root.appendChild(el('p', 'hotkey-current', current || context.t('details.hotkeyStandard')));
  const checks = {};
  const row = el('div', 'hotkey-modifiers');
  const select = el('select', 'hotkey-main');
  const apply = () => {
    const chosen = modifiers.filter((name) => checks[name].checked);
    context.updateItem({ hotkey: chosen.concat([select.value]).join('+') });
  };
  modifiers.forEach((name) => {
    const label = el('label', '');
    const input = el('input', '');
    input.type = 'checkbox';
    input.checked = parts.indexOf(name) >= 0;
    input.addEventListener('change', apply);
    checks[name] = input;
    label.append(input, el('span', '', name));
    row.appendChild(label);
  });
  context.root.appendChild(row);
  hotkeyNames.forEach((name) => {
    const option = el('option', '', name);
    option.value = name;
    select.appendChild(option);
  });
  const main = parts[parts.length - 1];
  if (hotkeyNames.indexOf(main) >= 0) select.value = main;
  select.addEventListener('change', apply);
  field(context.root, context.t('details.chooseKey'), select);
  const record = el('input', 'hotkey-record');
  record.readOnly = true;
  record.placeholder = context.t('details.pressKey');
  record.addEventListener('keydown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (['Control', 'Shift', 'Alt', 'Meta'].indexOf(event.key) >= 0) return;
    const value = hotkeyFromEvent(event);
    if (value) context.updateItem({ hotkey: value });
    else record.value = context.t('details.chooseFromList');
  });
  field(context.root, context.t('details.hotkey'), record);
  if (current) button(context, 'details.reset', () => context.updateItem({ hotkey: '' }));
  note(context, 'details.hotkeyNote');
}
