import { clear, el } from '../core/dom.js';
import { presetIconNode } from '../deck/icons.js';
import { PresetFiles } from './preset-files.js';

const widgetMarks = { clock: '🕒', weather: '⛅', metrics: '📈' };

// The preset list of the "saved" section: pick one, see its page and buttons, use it on the shown page.
export class Presets {
  constructor(options) {
    Object.assign(this, options);
    this.presets = [];
    this.selected = '';
    this.files = new PresetFiles({
      api: this.api,
      i18n: this.i18n,
      documentObject: this.documentObject,
      onError: this.onError,
      onImported: (presets) => this.imported(presets),
    });
  }

  async load() {
    try { this.presets = (await this.api.get('/api/presets', 10000)).presets || []; }
    catch (error) { this.onError(error.serverError || error.message); }
    this.render();
  }

  side() { return this.i18n.t(`saved.side.${this.preview.orientation}`); }

  sampleSide(layout) {
    if (!layout) return null;
    const fader = (value) => value ? Object.assign({ off: false }, value) : { row: 0, column: 0, width: 1, height: 1, off: true };
    const items = (layout.items || []).map((item, index) => Object.assign({
      id: `preset-${index}`,
      iconKey: item.icon || item.iconKey || '',
      iconColor: item.iconColor || '#3569c8',
      fontSize: item.fontSize || 11,
      iconScale: item.iconScale || 82,
      labelOpacity: item.labelOpacity == null ? 45 : item.labelOpacity,
    }, item));
    return {
      columns: layout.columns,
      rows: layout.rows,
      faders: { speaker: fader(layout.speaker), mic: fader(layout.mic) },
      pages: [{ name: '', faders: null, items }],
    };
  }

  showPreview(preset) {
    if (!this.target) this.target = { orientation: this.preview.orientation, page: this.preview.page() };
    this.preview.showSample({ landscape: this.sampleSide(preset.landscape), portrait: this.sampleSide(preset.portrait) });
    this.onPreview(true, preset.name);
  }

  closePreview() {
    if (!this.target) return;
    const target = this.target;
    this.target = null;
    this.preview.hideSample();
    this.preview.setOrientation(target.orientation);
    this.preview.setPage(target.page);
    this.onPreview(false, '');
  }

  render() {
    clear(this.root);
    this.root.appendChild(el('h2', '', this.i18n.t('presets.title')));
    const actions = el('div', 'preset-file-actions');
    const add = el('button', 'saved-primary', this.i18n.t('presets.addCurrent'));
    add.type = 'button';
    add.addEventListener('click', () => this.saveCurrent());
    actions.append(add, this.files.importButton());
    this.root.appendChild(actions);
    const page = this.preview.page() + 1;
    this.root.appendChild(el('p', 'saved-note', this.i18n.t('presets.target', { side: this.side(), page })));
    if (!this.presets.length) return;
    if (!this.presets.some((preset) => preset.id === this.selected)) this.selected = this.presets[0].id;
    const tabs = el('div', 'preset-tabs');
    this.presets.forEach((preset) => {
      if (!tabs.dataset.group || tabs.dataset.group !== String(!!preset.custom)) {
        tabs.dataset.group = String(!!preset.custom);
        tabs.appendChild(el('h3', '', this.i18n.t(preset.custom ? 'presets.custom' : 'presets.builtIn')));
      }
      const tab = el('button', 'preset-tab');
      tab.type = 'button';
      tab.setAttribute('aria-pressed', String(preset.id === this.selected));
      tab.append(el('strong', '', preset.name), el('small', '', preset.note));
      tab.addEventListener('click', () => { this.selected = preset.id; this.render(); this.showPreview(preset); });
      tabs.appendChild(tab);
      if (preset.custom) tabs.appendChild(this.customActions(preset));
    });
    this.root.appendChild(tabs);
    const preset = this.presets.find((value) => value.id === this.selected);
    const layout = preset[this.preview.orientation];
    const card = el('article', 'preset-card');
    if (!layout) card.appendChild(el('p', 'saved-note', this.i18n.t('presets.otherSide', {
      side: this.i18n.t(`saved.side.${preset.orientation}`),
    })));
    else card.appendChild(el('p', 'saved-note', this.i18n.t('presets.summary', {
      note: preset.note, side: this.side(), columns: layout.columns, rows: layout.rows,
    })));
    const apply = el('button', 'saved-primary', this.i18n.t('presets.apply'));
    apply.type = 'button';
    apply.disabled = !layout;
    apply.addEventListener('click', () => this.apply(preset, layout));
    card.appendChild(apply);
    if (preset.setup) card.appendChild(el('p', 'saved-note', preset.setup));
    card.appendChild(el('h4', '', this.i18n.t('presets.help')));
    if (layout) card.appendChild(this.help(layout));
    this.root.appendChild(card);
  }

  customActions(preset) {
    const actions = el('div', 'saved-actions');
    const rename = el('button', '', this.i18n.t('presets.rename'));
    const exportButton = el('button', '', this.i18n.t('presets.export'));
    const remove = el('button', '', this.i18n.t('presets.delete'));
    rename.type = 'button'; exportButton.type = 'button'; remove.type = 'button';
    exportButton.addEventListener('click', () => this.files.export([preset.id]));
    rename.addEventListener('click', async () => {
      const name = this.promptFn(this.i18n.t('presets.namePrompt'), preset.name);
      if (!name) return;
      await this.api.post('/api/presets/rename', { id: preset.id, name }, 10000);
      await this.load();
    });
    remove.addEventListener('click', async () => {
      if (!this.confirmFn(this.i18n.t('presets.deleteConfirm', { name: preset.name }))) return;
      await this.api.post('/api/presets/delete', { id: preset.id }, 10000);
      this.selected = '';
      this.closePreview();
      await this.load();
    });
    actions.append(exportButton, rename, remove);
    return actions;
  }

  async saveCurrent() {
    return this.savePage(this.preview.orientation, this.preview.page());
  }

  async savePage(orientation, page) {
    this.closePreview();
    const name = this.promptFn(this.i18n.t('presets.namePrompt'), '');
    if (!name) return;
    await this.api.post('/api/presets/save', {
      name, orientation, page,
    }, 10000);
    await this.load();
  }

  async imported(presets) {
    if (presets.length) this.selected = presets[0].id;
    await this.load();
    const first = this.presets.find((preset) => preset.id === this.selected);
    if (first) this.showPreview(first);
  }

  help(layout) {
    const help = el('div', 'preset-help');
    const row = (icon, name, what, sends) => {
      const line = el('div', 'preset-help-row'), mark = el('span', 'preset-help-icon'), body = el('div');
      if (typeof icon === 'string') mark.textContent = icon;
      else mark.appendChild(icon);
      body.append(el('strong', '', name), el('p', '', what));
      if (sends) body.appendChild(el('small', '', sends));
      line.append(mark, body);
      help.appendChild(line);
    };
    (layout.items || []).forEach((item) => {
      const icon = item.icon ? presetIconNode(item.icon) : (widgetMarks[item.type] || '');
      row(icon, item.name, item.description || '', item.sends ? this.i18n.t('presets.sends', { keys: item.sends }) : '');
    });
    const direct = this.i18n.t('presets.direct');
    if (layout.speaker) row('🔊', this.i18n.t('presets.speaker'), this.i18n.t('presets.speakerHelp'), direct);
    if (layout.mic) row('🎙', this.i18n.t('presets.mic'), this.i18n.t('presets.micHelp'), direct);
    return help;
  }

  apply(preset, layout) {
    const target = this.target || { orientation: this.preview.orientation, page: this.preview.page() };
    const orientation = target.orientation, page = target.page;
    layout = preset[orientation];
    this.closePreview();
    const current = this.editor.deck[orientation], count = current.pages[page].items.length;
    const values = { side: this.side(), page: page + 1, name: preset.name };
    let reason = this.i18n.t('presets.confirm', values);
    if (count) reason += `\n${this.i18n.t('presets.confirmItems', { count })}`;
    if (current.columns !== layout.columns || current.rows !== layout.rows) {
      reason += `\n${this.i18n.t('presets.confirmGrid', {
        side: values.side, from: `${current.columns}×${current.rows}`, to: `${layout.columns}×${layout.rows}`,
      })}`;
    }
    return this.serverChange.run({
      reason,
      run: () => this.api.post('/api/presets/apply', { id: preset.id, orientation, page }, 30000),
      done: () => {
        this.preview.setPage(page);
        const keys = (layout.items || []).some((item) => item.key) ? ` ${this.i18n.t('presets.keysNote')}` : '';
        return this.i18n.t('presets.done', values) + keys;
      },
      undone: this.i18n.t('presets.undone', values),
      failed: this.i18n.t('presets.failed'),
    });
  }
}
