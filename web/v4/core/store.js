export class Store {
  constructor() {
    this.state = null;
    this.listeners = new Set();
  }

  update(response) {
    const previous = this.state || {};
    const next = Object.assign({}, previous, response);
    if (!Object.prototype.hasOwnProperty.call(response, 'deck')) next.deck = previous.deck;
    if (!Object.prototype.hasOwnProperty.call(response, 'widgetDefinitions'))
      next.widgetDefinitions = previous.widgetDefinitions;
    this.state = next;
    this.listeners.forEach((listener) => listener(this.state));
    return this.state;
  }

  get() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
