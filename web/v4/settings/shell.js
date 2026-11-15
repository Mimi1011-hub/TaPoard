import { Sections } from './sections.js';

export class SettingsShell {
  constructor(nodes, i18n) {
    this.nodes = nodes;
    this.i18n = i18n;
    this.noticeTimer = 0;
    this.sections = new Sections(nodes.nav, nodes.sections, () => this.showNotice(this.i18n.t('settings.comingSoon')));
  }

  start() {
    this.nodes.nav.querySelectorAll('[data-section]').forEach((button) => {
      button.addEventListener('click', () => this.chooseSection(button.getAttribute('data-section')));
    });
  }

  chooseSection(section) {
    this.sections.choose(section);
  }

  updateConnection(state) {
    const phone = this.i18n.t(state.phoneConnected ? 'settings.phone.connected' : 'settings.phone.none');
    const pc = this.i18n.t(state.pcWindowOpen ? 'settings.pc.connected' : 'settings.pc.none');
    this.nodes.connection.textContent = `${phone}・${pc}`;
  }

  setOffline(value) {
    this.nodes.offline.hidden = !value;
  }

  // action: { label, run } adds a button to the notice (used for "undo").
  showNotice(text, action) {
    clearTimeout(this.noticeTimer);
    const notice = this.nodes.notice;
    notice.textContent = text;
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-notice-action';
      button.textContent = action.label;
      button.addEventListener('click', () => { notice.hidden = true; action.run(); });
      notice.appendChild(button);
    }
    notice.hidden = false;
    this.noticeTimer = setTimeout(() => { notice.hidden = true; }, action ? 20000 : 6000);
  }

  showConflict(onReload, onKeep) {
    this.nodes.conflict.hidden = false;
    this.nodes.conflict.querySelector('[data-conflict="reload"]').onclick = onReload;
    this.nodes.conflict.querySelector('[data-conflict="keep"]').onclick = () => {
      this.nodes.conflict.hidden = true;
      if (onKeep) onKeep();
    };
  }

  hideConflict() {
    this.nodes.conflict.hidden = true;
  }
}
