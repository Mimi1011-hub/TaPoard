import { clear, el } from '../core/dom.js';
import { presetIconNode } from '../deck/icons.js';

const widgetMarks = { clock: '🕒', weather: '⛅', metrics: '📈' };

// The preset list of the "saved" section: pick one, see its page and buttons, use it on the shown page.
export class Presets {
  constructor(options) {
    Object.assign(this, options);
    this.presets = [];
    this.selected = '';
  }

  async load() {
    try { this.presets = (await this.api.get('/api/presets', 10000)).presets || []; }
    catch (error) { this.onError(error.serverError || error.message); }
    this.render();
  }

  side() { return this.i18n.t(`saved.side.${this.preview.orientation}`); }

  render() {
    clear(this.root);
    this.root.appendChild(el('h3', '', this.i18n.t('presets.title')));
    const page = this.preview.page() + 1;
    this.root.appendChild(el('p', 'saved-note', this.i18n.t('presets.target', { side: this.side(), page })));
    if (!this.presets.length) return;
    if (!this.presets.some((preset) => preset.id === this.selected)) this.selected = this.presets[0].id;
    const tabs = el('div', 'preset-tabs');
    this.presets.forEach((preset) => {
      const tab = el('button', 'preset-tab');
      tab.type = 'button';
      tab.setAttribute('aria-pressed', String(preset.id === this.selected));
      tab.append(el('strong', '', preset.name), el('small', '', preset.note));
      tab.addEventListener('click', () => { this.selected = preset.id; this.render(); });
      tabs.appendChild(tab);
    });
    this.root.appendChild(tabs);
    const preset = this.presets.find((value) => value.id === this.selected);
    const layout = preset[this.preview.orientation];
    const card = el('article', 'preset-card');
    card.appendChild(el('p', 'saved-note', `${preset.note}（${this.side()} ${layout.columns}×${layout.rows}）`));
    card.appendChild(this.map(layout));
    const apply = el('button', 'saved-primary', this.i18n.t('presets.apply'));
    apply.type = 'button';
    apply.addEventListener('click', () => this.apply(preset, layout));
    card.appendChild(apply);
    if (preset.setup) card.appendChild(el('p', 'saved-note', preset.setup));
    card.appendChild(el('h4', '', this.i18n.t('presets.help')));
    card.appendChild(this.help(layout));
    this.root.appendChild(card);
  }

  // A small picture of the preset page: buttons, widgets and faders where they will go.
  map(layout) {
    const map = el('div', 'preset-map');
    map.style.gridTemplateColumns = `repeat(${layout.columns}, 1fr)`;
    map.style.gridTemplateRows = `repeat(${layout.rows}, 1fr)`;
    map.style.aspectRatio = `${layout.columns} / ${layout.rows}`;
    const cell = (text, kind, value) => {
      const node = el('span', `preset-cell preset-${kind}`, text);
      node.style.gridArea = `${value.row + 1} / ${value.column + 1} / span ${value.height} / span ${value.width}`;
      map.appendChild(node);
    };
    if (layout.speaker) cell(this.i18n.t('presets.speaker'), 'fader', layout.speaker);
    if (layout.mic) cell(this.i18n.t('presets.mic'), 'fader', layout.mic);
    (layout.items || []).forEach((item) => cell(item.name, item.type === 'hotkey' ? 'key' : 'widget', item));
    return map;
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
    const orientation = this.preview.orientation, page = this.preview.page();
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
