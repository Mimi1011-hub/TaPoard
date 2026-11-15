import { el } from '../../core/dom.js';

export function field(root, label, control) {
  const wrapper = el('label', 'inspector-field');
  wrapper.append(el('span', '', label), control);
  root.appendChild(wrapper);
  return control;
}

export function selectField(context, label, name, choices) {
  const select = el('select', '');
  choices.forEach(([value, text]) => {
    const option = el('option', '', text);
    option.value = value;
    select.appendChild(option);
  });
  select.value = String(context.options[name] ?? '');
  select.addEventListener('change', () => context.change(name, select.value));
  return field(context.root, label, select);
}

export function checkField(context, label, name) {
  const input = el('input', '');
  input.type = 'checkbox';
  input.checked = Boolean(context.options[name]);
  input.addEventListener('change', () => context.change(name, input.checked));
  return field(context.root, label, input);
}

export function rangeField(context, label, name, min, max, step = 1) {
  const input = el('input', '');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(context.options[name]);
  input.addEventListener('change', () => context.change(name, Number(input.value)));
  return field(context.root, label, input);
}

export function textField(context, label, name) {
  const input = el('input', '');
  input.type = 'text';
  input.value = context.options[name] || '';
  input.addEventListener('change', () => context.change(name, input.value.trim()));
  return field(context.root, label, input);
}
