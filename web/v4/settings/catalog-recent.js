const key = 'tapoard.catalog.recent';

export class CatalogRecent {
  constructor(storage) {
    this.storage = storage;
  }

  read(available) {
    try {
      const values = JSON.parse(this.storage.getItem(key) || '[]');
      if (!Array.isArray(values)) return [];
      return values.filter((value, index) => typeof value === 'string' && values.indexOf(value) === index && available(value)).slice(0, 8);
    } catch (error) {
      return [];
    }
  }

  add(id) {
    try {
      const values = JSON.parse(this.storage.getItem(key) || '[]');
      const next = [id].concat(Array.isArray(values) ? values.filter((value) => value !== id) : []).slice(0, 8);
      this.storage.setItem(key, JSON.stringify(next));
      return next;
    } catch (error) {
      return [];
    }
  }
}
