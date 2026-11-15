import { el } from '../../core/dom.js';
import { field } from './fields.js';

const keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').concat(Array.from({ length: 24 }, (_, index) => `F${index + 1}`));

export function hotkeyDetails(context) {
  const record = el('input', 'hotkey-record');
  record.readOnly = true;
  record.placeholder = context.t('details.pressKey');
  record.addEventListener('keydown', (event) => capture(event, context, record), true);
  field(context.root, context.t('details.hotkey'), record);
  const select = el('select', '');
  keys.forEach((key) => {
    const option = el('option', '', key);
    option.value = key;
    select.appendChild(option);
  });
  select.addEventListener('change', () => context.updateItem({ hotkey: select.value }));
  field(context.root, context.t('details.chooseKey'), select);
  const reset = el('button', '', context.t('details.reset'));
  reset.type = 'button';
  reset.addEventListener('click', () => context.updateItem({ hotkey: '' }));
  context.root.appendChild(reset);
}

function capture(event, context, record) {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
  const code = event.code || '';
  const main = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit[0-9]$/.test(code) ? code.slice(5) : code;
  if (!main) return;
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.shiftKey) parts.push('Shift');
  if (event.altKey) parts.push('Alt');
  if (event.metaKey) parts.push('Win');
  parts.push(main);
  record.value = parts.join('+');
  context.updateItem({ hotkey: record.value });
}
