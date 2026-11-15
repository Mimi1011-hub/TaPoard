export class Sections {
  constructor(nav, panels) {
    this.nav = nav;
    this.panels = panels;
    this.listeners = [];
  }
  choose(section) {
    if (!this.panels[section]) {
      return false;
    }
    this.nav.querySelectorAll('[data-section]').forEach((button) => button.classList.toggle('is-active', button.dataset.section === section));
    Object.keys(this.panels).forEach((name) => {
      this.panels[name].hidden = name !== section;
    });
    this.listeners.forEach((listener) => listener(section));
    return true;
  }
  subscribe(listener) {
    this.listeners.push(listener);
  }
}
