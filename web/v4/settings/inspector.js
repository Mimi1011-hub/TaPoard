import { clear, el } from '../core/dom.js';
import { iconNode } from '../deck/icons.js';
import { detailsFor } from './details/index.js';
import { actionError } from './action-validation.js';
import { faderSizes } from './fader-sizes.js';

const sizes = (values) =>
  values.map((value) => {
    const parts = value.split('x');
    return { value, width: Number(parts[0]), height: Number(parts[1]) };
  });

export class Inspector {
  constructor(options) {
    Object.assign(this, options);
    this.selection = null;
    this.editor.subscribe(() => this.render());
    this.render();
  }

  select(selection) {
    this.externalPanel = null;
    this.selection = selection;
    this.render();
  }

  showPanel(panel) {
    this.externalPanel = panel;
    this.render();
  }

  title() {
    return el('h2', '', this.i18n.t('settings.inspector.title'));
  }

  render() {
    clear(this.root);
    if (this.externalPanel) {
      this.externalPanel.render(this.root);
      return;
    }
    this.root.appendChild(this.title());
    if (!this.selection) {
      this.root.appendChild(el('p', '', this.i18n.t('settings.inspector.empty')));
      return;
    }
    if (this.selection.kind === 'fader') this.renderFader();
    else this.renderItem();
  }

  field(label, control) {
    const wrapper = el('label', 'inspector-field');
    wrapper.append(el('span', '', label), control);
    return wrapper;
  }

  input(type, value, change) {
    const input = el('input');
    input.type = type;
    input.value = value;
    input.addEventListener('change', () => change(input));
    return input;
  }

  range(labelKey, key, value, min, max, suffix = '', change) {
    const input = this.input('range', value, (node) => (change || ((values) => this.changeItem(values)))({ [key]: Number(node.value) }));
    input.min = min;
    input.max = max;
    const label = `${this.i18n.t(labelKey)}: ${value}${suffix}`;
    this.root.appendChild(this.field(label, input));
  }

  renderItem() {
    const item = this.editor.item(this.selection);
    if (!item) {
      this.selection = null;
      this.render();
      return;
    }
    const name = el('textarea');
    name.rows = 3;
    name.maxLength = 80;
    name.value = item.name || '';
    name.addEventListener('change', () => this.changeItem({ name: name.value }));
    this.root.appendChild(this.field(this.i18n.t('inspector.name'), name));
    const action = el('textarea');
    action.rows = 2;
    action.readOnly = true;
    action.value = item.hotkey || item.action || this.i18n.t(`inspector.action.${item.type}`);
    this.root.appendChild(this.field(this.i18n.t('inspector.action'), action));
    this.itemSize(item);
    this.range('inspector.fontSize', 'fontSize', item.fontSize || 11, 8, 28, 'px');
    this.range('inspector.iconScale', 'iconScale', item.iconScale || 82, 20, 100, '%');
    this.range('inspector.labelOpacity', 'labelOpacity', item.labelOpacity ?? 45, 0, 100, '%');
    this.clearRange(item);
    const hidden = this.input('checkbox', '', (node) => this.changeItem({ hideLabel: node.checked }));
    hidden.checked = !!item.hideLabel;
    this.root.appendChild(this.field(this.i18n.t('inspector.hideLabel'), hidden));
    this.typeFields(item);
    this.iconButton(item);
    detailsFor({
      root: this.root,
      item,
      address: this.selection,
      editor: this.editor,
      api: this.api,
      i18n: this.i18n,
      state: this.preview.runtimeState || {},
      onError: this.onError,
      updateItem: (values) => this.changeItem(values),
      chooseSection: this.chooseSection,
    });
    const remove = el('button', 'inspector-delete', this.i18n.t('inspector.delete'));
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (this.preview.removeSelected()) this.select(null);
    });
    this.root.appendChild(remove);
  }

  itemSize(item) {
    const definition = this.editor.definitions.get(item.type);
    if (!definition) return;
    const select = el('select');
    sizes(definition.sizes).forEach((size) => {
      const option = el('option', '', `${size.width} × ${size.height}`);
      option.value = size.value;
      option.disabled = !this.editor.canUpdateItem(this.selection, { width: size.width, height: size.height });
      select.appendChild(option);
    });
    select.value = `${item.width}x${item.height}`;
    select.addEventListener('change', () => {
      const size = sizes([select.value])[0];
      this.changeItem({ width: size.width, height: size.height });
    });
    this.root.appendChild(this.field(this.i18n.t('inspector.size'), select));
  }

  clearRange(item) {
    const wrapper = el('div', 'inspector-clear');
    const enabled = this.input('checkbox', '', (node) => this.changeItem({ keyClear: node.checked ? 0 : null }));
    enabled.checked = typeof item.keyClear === 'number';
    const range = this.input('range', item.keyClear ?? 0, (node) => this.changeItem({ keyClear: Number(node.value) }));
    range.min = 0;
    range.max = 100;
    range.disabled = !enabled.checked;
    wrapper.append(enabled, range);
    this.root.appendChild(this.field(`${this.i18n.t('inspector.keyClear')}: ${item.keyClear ?? 0}%`, wrapper));
  }

  textField(label, key, value, multiline = false) {
    const input = multiline ? el('textarea') : el('input');
    if (multiline) input.rows = 3;
    else input.type = key === 'url' ? 'url' : 'text';
    input.value = value || '';
    const error = el('small', 'catalog-dialog-error');
    const kind = key === 'url' ? 'url' : key === 'text' ? 'clipboard' : '';
    const message = () => kind ? actionError(this.i18n, kind, input.value) : '';
    const save = () => {
      error.textContent = message();
      if (!error.textContent) this.changeItem({ [key]: input.value });
    };
    input.addEventListener('input', () => { error.textContent = message(); });
    input.addEventListener('change', save);
    this.root.append(this.field(this.i18n.t(label), input), error);
  }

  typeFields(item) {
    if (item.type === 'url') this.textField('inspector.url', 'url', item.url);
    if (item.type === 'clipboard') this.textField('inspector.text', 'text', item.text, true);
    if (item.type === 'app') {
      this.textField('inspector.path', 'path', item.path);
      this.textField('inspector.args', 'args', item.args);
    }
  }

  iconButton(item) {
    const group = el('div', 'inspector-buttons');
    const icon = el('div', 'inspector-icon-row');
    icon.appendChild(iconNode(item));
    const change = el('button', '', this.i18n.t('inspector.icon'));
    change.type = 'button';
    change.addEventListener('click', () => this.onIcon(this.selection));
    icon.appendChild(change);
    group.appendChild(icon);
    this.root.appendChild(group);
  }

  renderFader() {
    const address = this.selection,
      orientation = this.editor.orientation(address.orientation),
      page = orientation.pages[address.page];
    const value =
      this.editor.effectiveFader(orientation, address.page, address.target) ||
      (page.faders && page.faders[address.target]) ||
      orientation.faders[address.target];
    this.root.appendChild(el('h3', '', this.i18n.t(`inspector.fader.${address.target}`)));
    const select = el('select');
    sizes(faderSizes).forEach((size) => {
      const option = el('option', '', `${size.width} × ${size.height}`);
      option.value = size.value;
      option.disabled = !this.editor.canUpdateFader(address.orientation, address.page, address.target, { width: size.width, height: size.height });
      select.appendChild(option);
    });
    select.value = `${value.width}x${value.height}`;
    select.addEventListener('change', () => {
      const size = sizes([select.value])[0];
      this.editor.updateFader(address.orientation, address.page, address.target, { width: size.width, height: size.height });
    });
    this.root.appendChild(this.field(this.i18n.t('inspector.size'), select));
    const update = (values) => this.editor.updateFader(address.orientation, address.page, address.target, values);
    this.range('inspector.faderOpacity', 'backgroundOpacity', value.backgroundOpacity ?? 100, 0, 100, '%', update);
    const hidden = this.input('checkbox', '', (node) => update({ hideValue: node.checked }));
    hidden.checked = !!value.hideValue;
    this.root.appendChild(this.field(this.i18n.t('inspector.hideFaderValue'), hidden));
    const color = this.input('color', value.iconColor || '#3569c8', (node) => update({ iconColor: node.value }));
    this.root.appendChild(this.field(this.i18n.t('inspector.faderIconColor'), color));
    const remove = el('button', 'inspector-delete', this.i18n.t('inspector.delete'));
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (this.preview.removeSelected()) this.select(null);
    });
    this.root.appendChild(remove);
  }

  changeItem(values) {
    if (!this.editor.updateItem(this.selection, values)) this.onError(this.i18n.t('inspector.invalid'));
  }
}
