export class AdminKeyStore {
  constructor(storage, locationObject, historyObject) {
    this.storage = storage;
    this.location = locationObject;
    this.history = historyObject;
    this.section = '';
  }

  read() {
    const hash = this.location.hash || '';
    if (hash.indexOf('#admin=') === 0) {
      const parameters = new URLSearchParams(hash.slice(1));
      const key = parameters.get('admin') || '';
      this.section = parameters.get('section') || '';
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
