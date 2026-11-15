import { el } from '../../core/dom.js';

export function field(root, label, control, extra) {
  const wrapper = el('label', 'inspector-field');
  wrapper.append(el('span', '', label), control);
  if (extra) wrapper.appendChild(extra);
  root.appendChild(wrapper);
  return control;
}

export function note(context, key) {
  context.root.appendChild(el('p', 'inspector-note', context.t(key)));
}

export function heading(context, key) {
  context.root.appendChild(el('h4', 'inspector-heading', context.t(key)));
}

export function selectField(context, label, name, choices, numeric) {
  const select = el('select', '');
  choices.forEach(([value, text]) => {
    const option = el('option', '', text);
    option.value = String(value);
    select.appendChild(option);
  });
  select.value = String(context.options[name] ?? '');
  select.dataset.option = name;
  select.addEventListener('change', () => context.change(name, numeric ? Number(select.value) : select.value));
  return field(context.root, label, select);
}

export function checkField(context, label, name) {
  const input = el('input', '');
  input.type = 'checkbox';
  input.checked = Boolean(context.options[name]);
  input.dataset.option = name;
  input.addEventListener('change', () => context.change(name, input.checked));
  return field(context.root, label, input);
}

export function rangeField(context, label, name, min, max, unit) {
  const input = el('input', '');
  const output = el('output', 'inspector-value');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(Math.max(min, Math.min(max, Number(context.options[name]))));
  input.dataset.option = name;
  const show = () => {
    output.textContent = `${input.value}${unit || ''}`;
  };
  input.addEventListener('input', show);
  input.addEventListener('change', () => context.change(name, Number(input.value)));
  show();
  return field(context.root, label, input, output);
}

export function textField(context, label, name, maxLength) {
  const input = el('input', '');
  input.type = 'text';
  input.maxLength = maxLength || 260;
  input.value = context.options[name] || '';
  input.dataset.option = name;
  input.addEventListener('change', () => context.change(name, input.value.trim()));
  return field(context.root, label, input);
}

export function button(context, key, run) {
  const node = el('button', 'inspector-action', context.t(key));
  node.type = 'button';
  node.addEventListener('click', run);
  context.root.appendChild(node);
  return node;
}
