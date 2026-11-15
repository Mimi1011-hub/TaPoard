export class KeyStore {
  constructor(storage, locationObject, historyObject) {
    this.storage = storage;
    this.location = locationObject;
    this.history = historyObject;
  }

  read() {
    const hash = this.location.hash || '';
    if (hash.indexOf('#connect=') === 0) {
      const key = decodeURIComponent(hash.slice(9));
      if (key) this.storage.setItem('tapoard-key', key);
      this.history.replaceState(null, '', this.location.pathname + this.location.search);
      return key;
    }
    return this.storage.getItem('tapoard-key') || '';
  }

  clear() {
    this.storage.removeItem('tapoard-key');
  }
}
