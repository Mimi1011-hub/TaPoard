export class Sections {
  constructor(nav, panels, onUnavailable) {
    this.nav = nav;
    this.panels = panels;
    this.onUnavailable = onUnavailable;
  }
  choose(section) {
    if (!this.panels[section]) {
      this.onUnavailable();
      return false;
    }
    this.nav.querySelectorAll('[data-section]').forEach((button) => button.classList.toggle('is-active', button.dataset.section === section));
    Object.keys(this.panels).forEach((name) => {
      this.panels[name].hidden = name !== section;
    });
    return true;
  }
}
