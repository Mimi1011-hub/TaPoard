export class AdminKeyStore {
  constructor(storage, locationObject, historyObject) {
    this.storage = storage;
    this.location = locationObject;
    this.history = historyObject;
  }

  read() {
    const hash = this.location.hash || '';
    if (hash.indexOf('#admin=') === 0) {
      const key = decodeURIComponent(hash.slice(7));
      if (key) this.storage.setItem('tapoard-admin', key);
      this.history.replaceState(null, '', this.location.pathname + this.location.search);
      return key;
    }
    return this.storage.getItem('tapoard-admin') || '';
  }

  clear() {
    this.storage.removeItem('tapoard-admin');
  }
}
