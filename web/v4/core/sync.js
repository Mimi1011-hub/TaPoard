import { AuthError } from './api.js';

export class SyncLoop {
  constructor(api, store, options) {
    this.api = api;
    this.store = store;
    this.viewId = options.viewId;
    this.visibleIds = options.visibleIds || (() => []);
    this.onOffline = options.onOffline || (() => {});
    this.onAuthLost = options.onAuthLost || (() => {});
    this.running = false;
    this.generation = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    this.run(generation);
  }

  stop() {
    this.running = false;
    this.generation += 1;
  }

  setHidden(hidden) {
    if (hidden) this.stop();
    else this.start();
  }

  query(path, includeVersion) {
    const state = this.store.get();
    const values = [`viewId=${encodeURIComponent(this.viewId)}`];
    const ids = this.visibleIds();
    if (ids.length) values.push(`visibleIds=${encodeURIComponent(ids.join(','))}`);
    if (includeVersion && state && state.version) values.push(`version=${encodeURIComponent(state.version)}`);
    return `${path}${path.indexOf('?') >= 0 ? '&' : '?'}${values.join('&')}`;
  }

  async refresh() {
    const response = await this.api.get(this.query('/api/v3/state', true), 8000);
    this.store.update(response);
  }

  async run(generation) {
    let failures = 0;
    while (this.running && generation === this.generation) {
      try {
        await this.refresh();
        this.onOffline(false);
        failures = 0;
        while (this.running && generation === this.generation) {
          const state = this.store.get() || { revision: 0 };
          const path = this.query(`/api/sync?revision=${encodeURIComponent(state.revision || 0)}`, false);
          const changed = await this.api.get(path, 20000);
          if (!this.running || generation !== this.generation) return;
          if (!state || changed.revision !== state.revision || changed.version !== state.version) await this.refresh();
          else this.store.update(changed);
          this.onOffline(false);
        }
      } catch (error) {
        if (!this.running || generation !== this.generation) return;
        if (error instanceof AuthError) {
          this.stop();
          this.onAuthLost();
          return;
        }
        this.onOffline(true);
        const seconds = Math.min(10, Math.pow(2, failures));
        failures += 1;
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      }
    }
  }
}
